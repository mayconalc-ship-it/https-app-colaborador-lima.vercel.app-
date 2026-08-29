"use server";

import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { baixarTextoDoDrive, idDaPasta, listarArquivosDaPasta, listarSubpastas } from "@/lib/drive-pasta";
import { gravarEmLotes, lerTudoEmPaginas } from "@/lib/rating-server";
import {
  CLASSIFICACAO_SUGERIDA,
  ehResponsabilidade,
  lerRelatorioDeDevolucao,
  lerTabelaDeMotivos,
  type DiaDoMotorista,
} from "@/lib/devolucao";

const ROTA = "/admin/devolucao";
const PASTA_MOTIVOS = "01.20.01.06";
const PASTA_NOTAS = "03.02.37";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`${ROTA}?${chave}=${encodeURIComponent(mensagem)}`);
}

export async function salvarConfigDeDevolucao(formData: FormData) {
  await requireModulo("devolucao", "editar");

  const link = ((formData.get("link") as string) || "").trim();
  const pasta = link ? idDaPasta(link) : null;
  if (link && !pasta) {
    voltar("erro", "Não reconheci o link. Abra a pasta MÃE no Drive e copie o endereço da barra do navegador.");
  }

  const bruto = String(formData.get("meta") ?? "").trim().replace(",", ".");
  const meta = Number(bruto);
  if (!bruto || !Number.isFinite(meta) || meta <= 0 || meta > 100) {
    voltar("erro", "A meta precisa ser um percentual entre 0 e 100.");
  }

  const admin = createAdminClient();
  const revendaId = await exigirRevenda(ROTA);
  const { error } = await admin.from("devolucao_config").upsert(
    {
      revenda_id: revendaId,
      pasta_id: pasta,
      pasta_link: link || null,
      meta_pct: meta,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id" },
  );
  if (error) voltar("erro", error.message);
  voltar("sucesso", `Salvo. Meta de devolução: ${meta}%.`);
}

/** A régua de quem é a responsabilidade daquele motivo. */
export async function classificarMotivo(formData: FormData) {
  await requireModulo("devolucao", "editar");

  const codigo = String(formData.get("codigo") ?? "").trim();
  const responsabilidade = formData.get("responsabilidade");
  if (!codigo) voltar("erro", "Motivo inválido.");
  if (!ehResponsabilidade(responsabilidade)) voltar("erro", "Classificação inválida.");

  const admin = createAdminClient();
  const revendaId = await exigirRevenda(ROTA);
  const { error } = await admin
    .from("devolucao_motivos")
    .update({ responsabilidade, atualizado_em: new Date().toISOString() })
    .eq("revenda_id", revendaId)
    .eq("codigo", codigo);

  if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);
  voltar("sucesso", "Classificação salva.");
}

/**
 * Importa o 03.02.37.
 *
 * Por padrão só o mês corrente: cada arquivo mensal tem ~7 mil linhas e
 * 9 MB, e reprocessar os oito todo dia gastaria o tempo da função sem
 * mudar nada nos meses fechados.
 *
 * Grava duas coisas:
 *  - as notas DEVOLVIDAS, uma a uma (727 em 8 meses);
 *  - o AGREGADO do dia de cada motorista, que traz o entregue -- é o
 *    denominador do "% de devolução". Agregado porque são 58 mil notas
 *    entregues contra 727 devolvidas, e o app não precisa da nota
 *    entregue individual para nada.
 */
export async function importarDevolucao(formData: FormData) {
  await requireModulo("devolucao", "criar");
  const tudo = formData.get("tudo") === "on";

  const admin = createAdminClient();
  const revendaId = await exigirRevenda(ROTA);

  const [{ data: cfg }, { data: cfgRating }] = await Promise.all([
    admin.from("devolucao_config").select("pasta_id").eq("revenda_id", revendaId).maybeSingle(),
    admin.from("rating_config").select("pasta_id").eq("revenda_id", revendaId).maybeSingle(),
  ]);

  const pastaMae = cfg?.pasta_id || cfgRating?.pasta_id;
  if (!pastaMae) voltar("erro", "Cadastre o link da pasta do Drive (aqui ou em Rating de Entrega).");

  const { pastas, erro } = await listarSubpastas(pastaMae);
  if (erro) voltar("erro", `Não consegui ler a pasta: ${erro}.`);

  const relatorio: string[] = [];

  // ---------- 1. TABELA DE MOTIVOS ----------
  const pastaMotivos = pastas.find((p) => p.nome.trim() === PASTA_MOTIVOS);
  if (pastaMotivos) {
    const { arquivos } = await listarArquivosDaPasta(pastaMotivos.id);
    if (arquivos.length > 0) {
      const texto = await baixarTextoDoDrive(arquivos[0].id);
      const motivos = texto ? lerTabelaDeMotivos(texto) : new Map<string, string>();
      if (motivos.size > 0) {
        // A descrição é atualizada sempre; a RESPONSABILIDADE só entra em
        // motivo novo -- reimportar não pode desfazer a classificação que
        // a liderança já ajustou na tela.
        const { linhas: jaClassificados } = await lerTudoEmPaginas<{ codigo: string }>((de, ate) =>
          admin.from("devolucao_motivos").select("codigo").eq("revenda_id", revendaId).range(de, ate),
        );
        const conhecidos = new Set(jaClassificados.map((m) => m.codigo));

        const novos = [...motivos]
          .filter(([codigo]) => !conhecidos.has(codigo))
          .map(([codigo, descricao]) => ({
            revenda_id: revendaId,
            codigo,
            descricao,
            responsabilidade: CLASSIFICACAO_SUGERIDA[codigo] ?? "nao_classificado",
            atualizado_em: new Date().toISOString(),
          }));

        if (novos.length > 0) {
          await gravarEmLotes(novos, 500, (lote) =>
            admin.from("devolucao_motivos").upsert(lote, { onConflict: "revenda_id,codigo" }),
          );
        }
        // Descrição em separado, para não tocar na responsabilidade.
        for (const [codigo, descricao] of motivos) {
          if (conhecidos.has(codigo)) {
            await admin
              .from("devolucao_motivos")
              .update({ descricao })
              .eq("revenda_id", revendaId)
              .eq("codigo", codigo)
              .neq("descricao", descricao);
          }
        }
        relatorio.push(`${motivos.size} motivo(s)${novos.length ? `, ${novos.length} novo(s)` : ""}`);
      }
    }
  } else {
    relatorio.push(`${PASTA_MOTIVOS}: pasta não encontrada — os motivos ficarão sem descrição`);
  }

  // ---------- 2. QUEM É QUEM (vem do Rating) ----------
  type Pessoa = { tipo: string; codigo: string; nome: string; colaborador_id: string | null };
  const { linhas: pessoas } = await lerTudoEmPaginas<Pessoa>((de, ate) =>
    admin.from("rating_pessoas").select("tipo, codigo, nome, colaborador_id").eq("revenda_id", revendaId).range(de, ate),
  );
  const motoristaPorCodigo = new Map(pessoas.filter((p) => p.tipo === "motorista").map((p) => [p.codigo, p]));
  const ajudantePorCodigo = new Map(pessoas.filter((p) => p.tipo === "ajudante").map((p) => [p.codigo, p]));

  type Viagem = { mapa: string; ajudante1_codigo: string | null; ajudante1_nome: string | null; ajudante2_codigo: string | null; ajudante2_nome: string | null };
  const { linhas: viagens } = await lerTudoEmPaginas<Viagem>((de, ate) =>
    admin
      .from("rating_viagens")
      .select("mapa, ajudante1_codigo, ajudante1_nome, ajudante2_codigo, ajudante2_nome")
      .eq("revenda_id", revendaId)
      .range(de, ate),
  );
  const viagemPorMapa = new Map(viagens.map((v) => [v.mapa, v]));

  // ---------- 3. AS NOTAS ----------
  const pastaNotas = pastas.find((p) => p.nome.trim() === PASTA_NOTAS);
  if (!pastaNotas) {
    await registrar(admin, revendaId, relatorio);
    voltar("erro", `Pasta ${PASTA_NOTAS} não encontrada. ${relatorio.join(" · ")}`);
  }

  const { arquivos } = await listarArquivosDaPasta(pastaNotas.id);
  const mesAtual = String(new Date().getMonth() + 1).padStart(2, "0");
  const anoAtual = String(new Date().getFullYear());
  const escolhidos = tudo ? arquivos : arquivos.filter((a) => a.nome.includes(`${mesAtual}.${anoAtual}`));

  if (escolhidos.length === 0) {
    relatorio.push(
      `${PASTA_NOTAS}: nenhum arquivo de ${mesAtual}/${anoAtual} (marque "importar todos os meses" para a carga completa)`,
    );
  }

  let totalNotas = 0;
  let totalDias = 0;
  let semMotorista = 0;
  const diasAcumulados = new Map<string, DiaDoMotorista>();

  for (const arquivo of escolhidos) {
    const texto = await baixarTextoDoDrive(arquivo.id);
    if (!texto) {
      relatorio.push(`${arquivo.nome}: não consegui baixar`);
      continue;
    }

    const lido = lerRelatorioDeDevolucao(texto);
    if (lido.faltando.length) {
      relatorio.push(`${arquivo.nome}: faltou ${lido.faltando.join(", ")}`);
      continue;
    }

    const linhasNotas = lido.notas.map((n) => {
      const mot = n.motoristaCodigo ? motoristaPorCodigo.get(n.motoristaCodigo) : undefined;
      const viagem = n.mapa ? viagemPorMapa.get(n.mapa) : undefined;
      const aj1 = viagem?.ajudante1_codigo ? ajudantePorCodigo.get(viagem.ajudante1_codigo) : undefined;
      const aj2 = viagem?.ajudante2_codigo ? ajudantePorCodigo.get(viagem.ajudante2_codigo) : undefined;
      if (!mot?.colaborador_id) semMotorista++;

      return {
        revenda_id: revendaId,
        data: n.data,
        nota: n.nota,
        serie: n.serie,
        mapa: n.mapa,
        motivo_codigo: n.motivoCodigo,
        cliente_codigo: n.clienteCodigo,
        cliente_nome: n.clienteNome,
        valor: n.valor,
        motorista_codigo: n.motoristaCodigo,
        motorista_nome: mot?.nome ?? null,
        motorista_colaborador_id: mot?.colaborador_id ?? null,
        ajudante1_colaborador_id: aj1?.colaborador_id ?? null,
        ajudante1_nome: aj1?.nome ?? viagem?.ajudante1_nome ?? null,
        ajudante2_colaborador_id: aj2?.colaborador_id ?? null,
        ajudante2_nome: aj2?.nome ?? viagem?.ajudante2_nome ?? null,
        importado_em: new Date().toISOString(),
      };
    });

    const falha = await gravarEmLotes(linhasNotas, 500, (lote) =>
      admin.from("devolucao_notas").upsert(lote, { onConflict: "revenda_id,nota,serie" }),
    );
    if (falha) {
      relatorio.push(`${arquivo.nome}: erro ao gravar (${falha})`);
      continue;
    }

    // Um motorista pode aparecer no mesmo dia em dois arquivos (virada de
    // mês); acumula antes de gravar.
    for (const d of lido.dias) {
      const k = `${d.data}|${d.motoristaCodigo}`;
      const atual = diasAcumulados.get(k);
      if (!atual) diasAcumulados.set(k, { ...d });
      else {
        atual.notasEntregues += d.notasEntregues;
        atual.valorEntregue += d.valorEntregue;
        atual.notasDevolvidas += d.notasDevolvidas;
        atual.valorDevolvido += d.valorDevolvido;
      }
    }

    totalNotas += lido.notas.length;
    relatorio.push(`${arquivo.nome}: ${lido.notas.length} devolução(ões) de ${lido.linhasLidas} linhas`);
  }

  // ---------- 4. O DIA DE CADA MOTORISTA ----------
  if (diasAcumulados.size > 0) {
    // Quanto do devolvido do dia NÃO conta para a meta -- é o que sai dos
    // dois lados da divisão para o percentual ser justo.
    const { linhas: motivos } = await lerTudoEmPaginas<{ codigo: string; responsabilidade: string }>((de, ate) =>
      admin.from("devolucao_motivos").select("codigo, responsabilidade").eq("revenda_id", revendaId).range(de, ate),
    );
    const foraDoIndicador = new Set(
      motivos.filter((m) => m.responsabilidade === "nao_conta" || m.responsabilidade === "nao_classificado").map((m) => m.codigo),
    );

    const chaves = [...diasAcumulados.keys()];
    const foraPorDia = new Map<string, number>();
    for (let i = 0; i < chaves.length; i += 200) {
      const datas = [...new Set(chaves.slice(i, i + 200).map((k) => k.split("|")[0]))];
      const { data: notasDoLote } = await admin
        .from("devolucao_notas")
        .select("data, motorista_codigo, motivo_codigo, valor")
        .eq("revenda_id", revendaId)
        .in("data", datas);
      for (const n of notasDoLote ?? []) {
        if (!n.motorista_codigo || !n.motivo_codigo) continue;
        if (!foraDoIndicador.has(n.motivo_codigo)) continue;
        const k = `${n.data}|${n.motorista_codigo}`;
        foraPorDia.set(k, (foraPorDia.get(k) ?? 0) + Number(n.valor));
      }
    }

    const linhasDia = [...diasAcumulados].map(([k, d]) => {
      const mot = motoristaPorCodigo.get(d.motoristaCodigo);
      return {
        revenda_id: revendaId,
        data: d.data,
        motorista_codigo: d.motoristaCodigo,
        motorista_nome: mot?.nome ?? null,
        motorista_colaborador_id: mot?.colaborador_id ?? null,
        notas_entregues: d.notasEntregues,
        valor_entregue: Math.round(d.valorEntregue * 100) / 100,
        notas_devolvidas: d.notasDevolvidas,
        valor_devolvido: Math.round(d.valorDevolvido * 100) / 100,
        valor_fora_do_indicador: Math.round((foraPorDia.get(k) ?? 0) * 100) / 100,
        importado_em: new Date().toISOString(),
      };
    });

    const falha = await gravarEmLotes(linhasDia, 500, (lote) =>
      admin.from("devolucao_dia").upsert(lote, { onConflict: "revenda_id,data,motorista_codigo" }),
    );
    if (falha) relatorio.push(`erro ao gravar o dia dos motoristas (${falha})`);
    else totalDias = linhasDia.length;
  }

  relatorio.push(`${totalDias} dia(s) de motorista`);
  if (semMotorista) relatorio.push(`${semMotorista} devolução(ões) sem motorista no app`);

  await registrar(admin, revendaId, relatorio);

  if (totalNotas === 0 && totalDias === 0) {
    voltar("erro", `Nada importado. ${relatorio.join(" · ")}`);
  }
  voltar("sucesso", `Importado: ${relatorio.join(" · ")}`);
}

async function registrar(
  admin: ReturnType<typeof createAdminClient>,
  revendaId: string,
  relatorio: string[],
) {
  await admin.from("devolucao_config").upsert(
    {
      revenda_id: revendaId,
      ultima_sincronizacao: new Date().toISOString(),
      ultimo_resultado: relatorio.join(" · "),
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id" },
  );
}
