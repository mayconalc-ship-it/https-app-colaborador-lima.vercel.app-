import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { areasVisiveis, getContexto5S } from "@/lib/cinco-s-server";
import {
  ROTULO_PRIORIDADE,
  ROTULO_SENSO,
  ROTULO_STATUS_NC,
  ehCompetencia,
  type Prioridade,
  type Senso,
  type StatusNC,
  hojeISO,
} from "@/lib/cinco-s";

export const dynamic = "force-dynamic";

/**
 * Exportação do 5S em CSV, para continuar alimentando a planilha de
 * acompanhamento que já existe.
 *
 * Rota de API em vez de server action porque o resultado é um ARQUIVO:
 * server action devolve dado para a tela, não um download com nome e
 * tipo. É o mesmo motivo de o cron ser rota e não ação.
 *
 * Quatro formatos, e o primeiro é o que importa:
 *
 *   base       uma linha por auditoria, com as 25 respostas em colunas.
 *              É o desenho do export do Forms -- cola direto embaixo da
 *              Base_Bruta e tudo que a planilha calcula continua
 *              funcionando sem tocar em fórmula nenhuma.
 *   detalhado  uma linha por resposta. É o desenho da Base_Tratada.
 *   resumo     uma linha por auditoria, já com a nota geral e por senso.
 *   acoes      o plano de ação.
 *
 * Separador ";" e BOM UTF-8: é o que faz o Excel em português abrir o
 * arquivo com as colunas separadas e os acentos certos, com dois
 * cliques. Vírgula e sem BOM viraria uma coluna só cheia de "Ã§".
 */

type Formato = "base" | "detalhado" | "resumo" | "acoes";

export async function GET(request: Request) {
  // A mesma permissão da tela do BI, conferida de novo: esta rota é um
  // endereço como outro qualquer, e quem souber dele chegaria aqui sem
  // passar por tela nenhuma.
  if (!(await podeNoModulo("5s", "ver"))) {
    const ctx = await getContexto5S();
    // Dono de área e auditor também exportam -- só o que lhes cabe.
    if (!ctx?.temAcesso) {
      return NextResponse.json({ erro: "Sem acesso" }, { status: 403 });
    }
  }

  const ctx = await getContexto5S();
  const revendaId = ctx?.revendaId ?? (await getRevendaId());
  if (!ctx || !revendaId) {
    return NextResponse.json({ erro: "Sem acesso" }, { status: 403 });
  }

  const url = new URL(request.url);
  const formato = (url.searchParams.get("formato") ?? "base") as Formato;
  const mesBruto = url.searchParams.get("mes");
  const mes = ehCompetencia(mesBruto) ? mesBruto : null;

  const admin = createAdminClient();
  const permitidas = areasVisiveis(ctx);

  /* ---- As auditorias do recorte ---------------------------------- */

  let consulta = admin
    .from("cinco_s_auditorias")
    .select(
      "id, planejada_para, competencia, finalizada_em, observacao, total_ok, total_nok, total_na, conformidade, auditor_id, dono_id, area_id, cinco_s_areas!inner(nome)",
    )
    .eq("revenda_id", revendaId)
    .eq("status", "finalizada")
    .order("planejada_para");

  if (mes) consulta = consulta.eq("competencia", `${mes}-01`);
  if (permitidas !== null) {
    if (permitidas.length === 0) {
      return csv("5s-vazio", [["Nada a exportar no seu acesso."]]);
    }
    consulta = consulta.in("area_id", permitidas);
  }

  const { data: auditorias, error } = await consulta;
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  const lista = auditorias ?? [];
  if (lista.length === 0) {
    return csv(nomeArquivo(formato, mes), [
      ["Nenhuma auditoria finalizada neste período."],
    ]);
  }

  // Nomes de todo mundo em UMA consulta, não uma por auditoria.
  const ids = new Set<string>();
  for (const a of lista) {
    // Histórico importado pode não ter auditor (ver migração 038).
    if (a.auditor_id) ids.add(a.auditor_id);
    if (a.dono_id) ids.add(a.dono_id);
  }
  const { data: pessoas } = await admin
    .from("profiles")
    .select("id, nome")
    .in("id", Array.from(ids));
  const nomes = new Map((pessoas ?? []).map((p) => [p.id, p.nome as string]));

  const areaDe = (a: (typeof lista)[number]) =>
    (
      (Array.isArray(a.cinco_s_areas)
        ? a.cinco_s_areas[0]
        : a.cinco_s_areas) as { nome: string }
    ).nome;

  if (formato === "acoes") {
    return await exportarAcoes(revendaId, mes, permitidas, nomes);
  }

  if (formato === "resumo") {
    const { data: sensos } = await admin
      .from("cinco_s_auditoria_sensos")
      .select("auditoria_id, senso, ok, nok, na, conformidade")
      .in(
        "auditoria_id",
        lista.map((a) => a.id),
      );

    const porAuditoria = new Map<string, Map<string, number | null>>();
    for (const s of sensos ?? []) {
      const m = porAuditoria.get(s.auditoria_id) ?? new Map();
      m.set(s.senso, s.conformidade);
      porAuditoria.set(s.auditoria_id, m);
    }

    const linhas: string[][] = [
      [
        "Mês_Ano",
        "Data",
        "Área",
        "Dono da Área",
        "Auditor",
        "Conformidade %",
        "Itens OK",
        "Itens NOK",
        "Itens N/A",
        "Utilização %",
        "Organização %",
        "Limpeza %",
        "Conservação %",
        "Disciplina %",
      ],
    ];

    for (const a of lista) {
      const s = porAuditoria.get(a.id);
      linhas.push([
        mesAno(a.competencia),
        dataBr(a.planejada_para),
        areaDe(a),
        a.dono_id ? (nomes.get(a.dono_id) ?? "") : "",
        (a.auditor_id ? nomes.get(a.auditor_id) : null) ?? "",
        numero(a.conformidade),
        String(a.total_ok),
        String(a.total_nok),
        String(a.total_na),
        numero(s?.get("utilizacao") ?? null),
        numero(s?.get("organizacao") ?? null),
        numero(s?.get("limpeza") ?? null),
        numero(s?.get("conservacao") ?? null),
        numero(s?.get("disciplina") ?? null),
      ]);
    }

    return csv(nomeArquivo(formato, mes), linhas);
  }

  /* ---- Formatos que precisam das respostas ----------------------- */

  const [{ data: perguntas }, { data: respostas }] = await Promise.all([
    admin
      .from("cinco_s_perguntas")
      .select("id, senso, codigo, texto, ordem")
      .eq("revenda_id", revendaId)
      .order("ordem"),
    admin
      .from("cinco_s_respostas")
      .select("auditoria_id, pergunta_id, valor, observacao")
      .in(
        "auditoria_id",
        lista.map((a) => a.id),
      ),
  ]);

  const qs = perguntas ?? [];
  const porAud = new Map<
    string,
    Map<string, { valor: string; observacao: string | null }>
  >();
  for (const r of respostas ?? []) {
    const m = porAud.get(r.auditoria_id) ?? new Map();
    m.set(r.pergunta_id, { valor: r.valor, observacao: r.observacao });
    porAud.set(r.auditoria_id, m);
  }

  if (formato === "detalhado") {
    const linhas: string[][] = [
      [
        "Mês_Ano",
        "Data da auditoria",
        "Área Auditada?",
        "Dono da Área auditada",
        "Auditor",
        "Senso",
        "Item",
        "Pergunta",
        "Valor",
        "Observação do auditor",
      ],
    ];

    for (const a of lista) {
      const m = porAud.get(a.id);
      for (const q of qs) {
        const r = m?.get(q.id);
        if (!r) continue;
        linhas.push([
          mesAno(a.competencia),
          dataBr(a.planejada_para),
          areaDe(a),
          a.dono_id ? (nomes.get(a.dono_id) ?? "") : "",
          (a.auditor_id ? nomes.get(a.auditor_id) : null) ?? "",
          ROTULO_SENSO[q.senso as Senso],
          q.codigo,
          q.texto,
          rotuloValor(r.valor),
          r.observacao ?? "",
        ]);
      }
    }

    return csv(nomeArquivo(formato, mes), linhas);
  }

  /* ---- base: o desenho do export do Forms ------------------------ */

  const cabecalho = [
    "Id",
    "Data da auditoria",
    "Dono da Área auditada",
    "Auditor",
    "Área Auditada?",
    // O cabeçalho repete o formato do Forms ("UTILIZAÇÃO - 1.1 ...")
    // para a coluna ser reconhecível ao lado da base antiga. O que
    // garante a colagem é a ORDEM, que é a mesma do checklist.
    ...qs.map(
      (q) =>
        `${ROTULO_SENSO[q.senso as Senso].toUpperCase()} - ${q.codigo} ${q.texto}`,
    ),
    "Diante dos itens que identificamos como NOK na auditoria, quais ações podemos colocar em prática para eliminar ou reduzir as não conformidades?",
  ];

  const linhas: string[][] = [cabecalho];
  let sequencial = 1;

  for (const a of lista) {
    const m = porAud.get(a.id);
    linhas.push([
      String(sequencial++),
      dataBr(a.planejada_para),
      a.dono_id ? (nomes.get(a.dono_id) ?? "") : "",
      (a.auditor_id ? nomes.get(a.auditor_id) : null) ?? "",
      areaDe(a),
      ...qs.map((q) => rotuloValor(m?.get(q.id)?.valor)),
      // As observações dos itens NOK viram o texto único do fim, que é
      // como a planilha antiga guardava a ação. Sem isso a coluna
      // chegaria vazia e o histórico perderia o que o auditor escreveu.
      qs
        .filter((q) => m?.get(q.id)?.valor === "nao" && m?.get(q.id)?.observacao)
        .map((q) => `${q.codigo}: ${m!.get(q.id)!.observacao}`)
        .join(" | ") || (a.observacao ?? ""),
    ]);
  }

  return csv(nomeArquivo(formato, mes), linhas);
}

/* ------------------------------------------------------------------ */

async function exportarAcoes(
  revendaId: string,
  mes: string | null,
  permitidas: string[] | null,
  nomesConhecidos: Map<string, string>,
) {
  const admin = createAdminClient();

  let consulta = admin
    .from("cinco_s_nao_conformidades")
    .select(
      "id, senso, descricao, acao, status, prioridade, prazo, criado_em, concluido_em, responsavel_id, cinco_s_areas!inner(nome), cinco_s_auditorias!inner(competencia, planejada_para)",
    )
    .eq("revenda_id", revendaId)
    .order("criado_em");

  if (mes) consulta = consulta.eq("cinco_s_auditorias.competencia", `${mes}-01`);
  if (permitidas !== null) {
    if (permitidas.length === 0) return csv("5s-acoes", [["Nada a exportar."]]);
    consulta = consulta.in("area_id", permitidas);
  }

  const { data } = await consulta;
  const lista = data ?? [];

  const faltando = Array.from(
    new Set(
      lista
        .map((n) => n.responsavel_id)
        .filter((x): x is string => Boolean(x) && !nomesConhecidos.has(x!)),
    ),
  );
  if (faltando.length > 0) {
    const { data: p } = await admin
      .from("profiles")
      .select("id, nome")
      .in("id", faltando);
    for (const x of p ?? []) nomesConhecidos.set(x.id, x.nome as string);
  }

  const hoje = hojeISO();

  const linhas: string[][] = [
    [
      "Mês_Ano",
      "Data da auditoria",
      "Área",
      "Senso",
      "Problema encontrado",
      "Ação corretiva",
      "Responsável",
      "Prioridade",
      "Prazo",
      "Situação",
      "Atrasada",
      "Concluída em",
    ],
  ];

  for (const n of lista) {
    const aud = (
      Array.isArray(n.cinco_s_auditorias)
        ? n.cinco_s_auditorias[0]
        : n.cinco_s_auditorias
    ) as { competencia: string; planejada_para: string };
    const area = (
      Array.isArray(n.cinco_s_areas) ? n.cinco_s_areas[0] : n.cinco_s_areas
    ) as { nome: string };

    const aberta = n.status === "aberta" || n.status === "em_andamento";
    linhas.push([
      mesAno(aud.competencia),
      dataBr(aud.planejada_para),
      area.nome,
      ROTULO_SENSO[n.senso as Senso],
      n.descricao,
      n.acao ?? "",
      n.responsavel_id ? (nomesConhecidos.get(n.responsavel_id) ?? "") : "",
      ROTULO_PRIORIDADE[n.prioridade as Prioridade],
      n.prazo ? dataBr(n.prazo) : "",
      ROTULO_STATUS_NC[n.status as StatusNC],
      aberta && n.prazo && n.prazo < hoje ? "Sim" : "Não",
      n.concluido_em ? dataBr(n.concluido_em.slice(0, 10)) : "",
    ]);
  }

  return csv(nomeArquivo("acoes", mes), linhas);
}

/* ------------------------------------------------------------------ */

function rotuloValor(v?: string) {
  if (v === "sim") return "Sim";
  if (v === "nao") return "Não";
  if (v === "na") return "N/A";
  return "";
}

function dataBr(iso: string) {
  return iso.split("-").reverse().join("/");
}

/** "2026-08-01" -> "8-2026", que é a chave que a planilha já usa. */
function mesAno(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${Number(mes)}-${ano}`;
}

/** Número com vírgula: é assim que o Excel em português lê decimal. */
function numero(v: number | null) {
  if (v === null || v === undefined) return "";
  return String(v).replace(".", ",");
}

function nomeArquivo(formato: string, mes: string | null) {
  return `5s-${formato}${mes ? `-${mes}` : "-completo"}`;
}

/**
 * Monta o CSV.
 *
 * Aspas duplicadas e campo entre aspas sempre que houver ";", aspas ou
 * quebra de linha -- e as observações dos auditores têm as três coisas.
 * Sem isso, uma observação com ponto e vírgula empurraria todo o resto
 * da linha uma coluna para o lado, silenciosamente.
 */
function csv(nome: string, linhas: string[][]) {
  const corpo = linhas
    .map((linha) =>
      linha
        .map((celula) => {
          const t = (celula ?? "").replace(/\r?\n/g, " ").trim();
          return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
        })
        .join(";"),
    )
    .join("\r\n");

  // O BOM é o que faz o Excel brasileiro abrir com acento certo.
  return new NextResponse(`﻿${corpo}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
