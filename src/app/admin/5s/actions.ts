"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { nomesDe } from "@/lib/cinco-s-server";
import { competenciaAtual, ehSenso } from "@/lib/cinco-s";

const ROTA = "/admin/5s";

function erro(mensagem: string, aba?: string): never {
  const q = new URLSearchParams({ erro: mensagem });
  if (aba) q.set("aba", aba);
  redirect(`${ROTA}?${q}`);
}

function ok(mensagem: string, aba?: string): never {
  const q = new URLSearchParams({ sucesso: mensagem });
  if (aba) q.set("aba", aba);
  redirect(`${ROTA}?${q}`);
}

/** Texto de formulário: apara e devolve null quando sobrou vazio. */
function texto(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

/**
 * Revalida as telas que exibem o dado alterado.
 *
 * Sempre as mesmas quatro, e de propósito: o BI, o painel e as duas
 * telas do colaborador leem os mesmos cadastros, e revalidar só a tela
 * de onde a ação partiu deixaria o resto mostrando o valor antigo até
 * alguém recarregar na mão.
 */
function revalidar() {
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/bi`);
  revalidatePath("/5s");
  revalidatePath("/5s/acoes");
}

/* ================================================================== */
/* ÁREAS                                                              */
/* ================================================================== */

export async function salvarArea(formData: FormData) {
  await requireModulo("5s", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = texto(formData.get("id"));
  const nome = texto(formData.get("nome"));
  if (!nome) erro("A área precisa de um nome.", "areas");

  const dados = {
    revenda_id: revendaId,
    nome,
    descricao: texto(formData.get("descricao")),
    local: texto(formData.get("local")),
    ativa: formData.get("ativa") === "on",
  };

  if (id) {
    const { error } = await admin
      .from("cinco_s_areas")
      .update(dados)
      .eq("id", id)
      // O filtro por revenda não é redundante com o id: sem ele, um id
      // de outra revenda chegando pelo formulário seria atualizado.
      .eq("revenda_id", revendaId);
    if (error) erro(mensagemDeErro(error.message, nome), "areas");
  } else {
    const { data, error } = await admin
      .from("cinco_s_areas")
      .insert(dados)
      .select("id")
      .single();
    if (error || !data) erro(mensagemDeErro(error?.message ?? "", nome), "areas");
    formData.set("id", data.id);
  }

  const areaId = texto(formData.get("id"))!;
  const donoId = texto(formData.get("dono_id"));
  await trocarDono(areaId, donoId);

  revalidar();
  ok(id ? "Área atualizada." : "Área cadastrada.", "areas");
}

/**
 * Erro do banco traduzido para a linguagem de quem está na tela.
 *
 * O único que acontece de verdade é o nome repetido, e "duplicate key
 * value violates unique constraint" não ajuda ninguém a resolver.
 */
function mensagemDeErro(bruto: string, nome: string) {
  if (bruto.includes("cinco_s_areas_nome_unico")) {
    return `Já existe uma área chamada "${nome}" nesta revenda.`;
  }
  return `Não foi possível salvar: ${bruto}`;
}

/**
 * Troca o dono da área SEM perder o histórico.
 *
 * Fecha o vínculo vigente com a data de hoje e abre outro. A auditoria
 * que já aconteceu guarda o dono dela em `dono_id` e não é tocada --
 * é o que faz o resultado de março continuar sendo do responsável de
 * março depois da troca.
 */
async function trocarDono(areaId: string, novoDono: string | null) {
  const admin = createAdminClient();

  const { data: atual } = await admin
    .from("cinco_s_area_donos")
    .select("id, colaborador_id")
    .eq("area_id", areaId)
    .is("ate", null)
    .maybeSingle();

  if (atual?.colaborador_id === novoDono) return;

  if (atual) {
    await admin
      .from("cinco_s_area_donos")
      // O dia em que o dono deixou a área é o daqui: `toISOString()` é
      // UTC, e a Vercel roda em UTC -- trocar o dono às 21h fechava o
      // mandato com a data de amanhã.
      .update({
        ate: new Date().toLocaleDateString("sv-SE", {
          timeZone: "America/Sao_Paulo",
        }),
      })
      .eq("id", atual.id);
  }

  if (novoDono) {
    await admin
      .from("cinco_s_area_donos")
      .insert({ area_id: areaId, colaborador_id: novoDono });
  }
}

export async function excluirArea(formData: FormData) {
  await requireModulo("5s", "excluir");
  const revendaId = await exigirRevenda(ROTA);
  const id = texto(formData.get("id"));
  if (!id) erro("Área não informada.", "areas");

  const admin = createAdminClient();

  // Área com auditoria não é apagada, é desativada. Apagar levaria junto
  // as auditorias (cascade) e abriria um buraco no histórico do BI --
  // o indicador do ano passado mudaria porque alguém arrumou o cadastro.
  const { count } = await admin
    .from("cinco_s_auditorias")
    .select("id", { count: "exact", head: true })
    .eq("area_id", id);

  if (count && count > 0) {
    await admin
      .from("cinco_s_areas")
      .update({ ativa: false })
      .eq("id", id)
      .eq("revenda_id", revendaId);
    revalidar();
    ok(
      `Área desativada. Ela tem ${count} auditoria${count === 1 ? "" : "s"} no histórico, então não foi apagada.`,
      "areas",
    );
  }

  await admin
    .from("cinco_s_areas")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId);

  revalidar();
  ok("Área excluída.", "areas");
}

/* ================================================================== */
/* AUDITORES                                                          */
/* ================================================================== */

export async function salvarAuditor(formData: FormData) {
  await requireModulo("5s", "editar");
  const revendaId = await exigirRevenda(ROTA);

  const colaboradorId = texto(formData.get("colaborador_id"));
  if (!colaboradorId) erro("Selecione um colaborador.", "auditores");

  const admin = createAdminClient();

  // Só pode virar auditor quem pertence à revenda. Sem esta conferência
  // daria para habilitar alguém de outra unidade mandando o id na mão.
  const { data: vinculo } = await admin
    .from("colaborador_revendas")
    .select("colaborador_id")
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", colaboradorId)
    .maybeSingle();

  if (!vinculo) erro("Esta pessoa não pertence a esta revenda.", "auditores");

  const { error } = await admin.from("cinco_s_auditores").upsert(
    { revenda_id: revendaId, colaborador_id: colaboradorId, ativo: true },
    { onConflict: "revenda_id,colaborador_id" },
  );
  if (error) erro(`Não foi possível salvar: ${error.message}`, "auditores");

  revalidar();
  ok("Auditor habilitado.", "auditores");
}

export async function alternarAuditor(formData: FormData) {
  await requireModulo("5s", "editar");
  const revendaId = await exigirRevenda(ROTA);

  const colaboradorId = texto(formData.get("colaborador_id"));
  const ativo = formData.get("ativo") === "true";
  if (!colaboradorId) erro("Auditor não informado.", "auditores");

  const admin = createAdminClient();
  await admin
    .from("cinco_s_auditores")
    .update({ ativo })
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", colaboradorId);

  revalidar();
  ok(ativo ? "Auditor reativado." : "Auditor desativado.", "auditores");
}

/* ================================================================== */
/* PERGUNTAS                                                          */
/* ================================================================== */

/**
 * Editar o texto de uma pergunta.
 *
 * Existe por causa das três perguntas que o export do Forms entregou
 * cortadas em 199 caracteres. Editar o texto não mexe no histórico: a
 * resposta aponta para o id da pergunta, não para o texto dela.
 */
export async function salvarPergunta(formData: FormData) {
  await requireModulo("5s", "editar");
  const revendaId = await exigirRevenda(ROTA);

  const id = texto(formData.get("id"));
  const textoNovo = texto(formData.get("texto"));
  if (!id || !textoNovo) erro("Pergunta não informada.", "perguntas");

  const admin = createAdminClient();
  await admin
    .from("cinco_s_perguntas")
    .update({ texto: textoNovo, ativa: formData.get("ativa") === "on" })
    .eq("id", id)
    .eq("revenda_id", revendaId);

  revalidar();
  ok("Pergunta atualizada.", "perguntas");
}

/* ================================================================== */
/* PLANEJAMENTO                                                       */
/* ================================================================== */

/**
 * Agenda uma auditoria e avisa o auditor.
 *
 * O dono da área é congelado aqui, no ato do planejamento, e não na
 * finalização: é quem responde pela área quando a auditoria foi
 * marcada, e é ele quem vai receber o plano de ação.
 */
export async function planejarAuditoria(formData: FormData) {
  await requireModulo("5s", "criar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const areaId = texto(formData.get("area_id"));
  const auditorId = texto(formData.get("auditor_id"));
  const data = texto(formData.get("planejada_para"));

  if (!areaId || !auditorId || !data) {
    erro("Área, auditor e data são obrigatórios.", "planejamento");
  }

  const [{ data: area }, { data: dono }] = await Promise.all([
    admin
      .from("cinco_s_areas")
      .select("id, nome")
      .eq("id", areaId)
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    admin
      .from("cinco_s_area_donos")
      .select("colaborador_id")
      .eq("area_id", areaId)
      .is("ate", null)
      .maybeSingle(),
  ]);

  if (!area) erro("Área não encontrada nesta revenda.", "planejamento");

  const { data: nova, error } = await admin
    .from("cinco_s_auditorias")
    .insert({
      revenda_id: revendaId,
      area_id: areaId,
      auditor_id: auditorId,
      dono_id: dono?.colaborador_id ?? null,
      planejada_para: data,
      observacao: texto(formData.get("observacao")),
      status: "planejada",
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.includes("cinco_s_auditorias_unica_no_mes")) {
      erro(
        `A área "${area.nome}" já tem auditoria neste mês. Cancele a existente antes de marcar outra.`,
        "planejamento",
      );
    }
    erro(`Não foi possível agendar: ${error.message}`, "planejamento");
  }

  await avisarAuditor(revendaId, auditorId, area.nome, data, nova!.id);

  revalidar();
  ok(`Auditoria de ${area.nome} agendada.`, "planejamento");
}

/**
 * Agenda o mês inteiro de uma vez.
 *
 * O ciclo real é mensal e cobre todas as áreas -- marcar dezenove
 * auditorias uma a uma, todo mês, é o tipo de trabalho que faz a
 * ferramenta ser abandonada. Reaproveita o auditor da última auditoria
 * de cada área, que é como a escala já funciona na prática.
 */
export async function planejarMes(formData: FormData) {
  await requireModulo("5s", "criar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const competencia = texto(formData.get("competencia"));
  const dia = Number(texto(formData.get("dia")) ?? "15");
  if (!competencia) erro("Informe o mês.", "planejamento");

  const dataPlanejada = `${competencia}-${String(
    Math.min(28, Math.max(1, dia || 15)),
  ).padStart(2, "0")}`;

  const [{ data: areas }, { data: jaTem }, { data: ultimas }] =
    await Promise.all([
      admin
        .from("cinco_s_areas")
        .select("id, nome, cinco_s_area_donos!left(colaborador_id, ate)")
        .eq("revenda_id", revendaId)
        .eq("ativa", true)
        .is("cinco_s_area_donos.ate", null),
      admin
        .from("cinco_s_auditorias")
        .select("area_id")
        .eq("revenda_id", revendaId)
        .eq("competencia", `${competencia}-01`)
        .neq("status", "cancelada"),
      // O último auditor de cada área vem resolvido do banco (uma linha
      // por área). Antes isto trazia 500 auditorias e montava o mapa
      // aqui -- e com o ano inteiro planejado, uma área de pouca
      // atividade podia ficar fora da janela e perder o auditor dela.
      admin.rpc("cinco_s_ultimo_auditor", { p_revenda: revendaId }),
    ]);

  const ocupadas = new Set((jaTem ?? []).map((a) => a.area_id));

  const ultimoAuditor = new Map<string, string>(
    ((ultimas ?? []) as { area_id: string; auditor_id: string }[]).map((a) => [
      a.area_id,
      a.auditor_id,
    ]),
  );

  const padrao = texto(formData.get("auditor_padrao"));

  const novas = (areas ?? [])
    .filter((a) => !ocupadas.has(a.id))
    .map((a) => {
      const auditorId = ultimoAuditor.get(a.id) ?? padrao;
      if (!auditorId) return null;
      const donos = Array.isArray(a.cinco_s_area_donos)
        ? a.cinco_s_area_donos
        : [a.cinco_s_area_donos];
      const dono = donos.find((d) => d && d.ate == null);
      return {
        revenda_id: revendaId,
        area_id: a.id,
        auditor_id: auditorId,
        dono_id: dono?.colaborador_id ?? null,
        planejada_para: dataPlanejada,
        status: "planejada" as const,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (novas.length === 0) {
    erro(
      "Nada a agendar: todas as áreas ativas já têm auditoria neste mês, ou nenhuma tem auditor definido.",
      "planejamento",
    );
  }

  const { error } = await admin.from("cinco_s_auditorias").insert(novas);
  if (error) erro(`Não foi possível agendar: ${error.message}`, "planejamento");

  // Um aviso por auditor, com a contagem -- e não um por auditoria. Quem
  // ficou com seis áreas receberia seis notificações idênticas.
  const porAuditor = new Map<string, number>();
  for (const n of novas) {
    porAuditor.set(n.auditor_id, (porAuditor.get(n.auditor_id) ?? 0) + 1);
  }

  await Promise.all(
    Array.from(porAuditor.entries()).map(([auditorId, quantas]) =>
      criarNotificacao({
        modulo: "5s",
        tipo: "pendencia",
        titulo: "🧹 Auditorias 5S do mês",
        mensagem: `Você ficou com ${quantas} auditoria${quantas === 1 ? "" : "s"} para fazer.`,
        url: "/5s",
        revendaId,
        destinatarioId: auditorId,
      }),
    ),
  );

  await enviarPushDaRevenda(revendaId, {
    modulo: "5s",
    titulo: "🧹 Auditorias 5S do mês",
    mensagem: "As auditorias do mês foram distribuídas. Confira as suas.",
    url: "/5s",
    apenas: Array.from(porAuditor.keys()),
  });

  revalidar();
  ok(
    `${novas.length} auditoria${novas.length === 1 ? "" : "s"} agendada${novas.length === 1 ? "" : "s"}.`,
    "planejamento",
  );
}

/**
 * Agenda o ciclo inteiro de uma vez.
 *
 * O 5S é um programa anual: as áreas são as mesmas, o rodízio é o
 * mesmo, e a única coisa que muda a cada mês é a data. Obrigar o gestor
 * a repetir a mesma tela doze vezes é o tipo de trabalho que faz o
 * planejamento parar em março.
 *
 * Começa no mês corrente quando o ano é o atual -- ninguém quer
 * agendar janeiro em agosto -- e vai até dezembro. Mês que já tenha
 * auditoria para aquela área é pulado, então dá para rodar de novo
 * depois de cadastrar uma área nova e só as lacunas são preenchidas.
 */
export async function planejarAno(formData: FormData) {
  await requireModulo("5s", "criar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const ano = Number(texto(formData.get("ano")));
  const dia = Math.min(28, Math.max(1, Number(texto(formData.get("dia"))) || 15));
  const padrao = texto(formData.get("auditor_padrao"));

  if (!ano || ano < 2024 || ano > 2100) erro("Ano inválido.", "planejamento");

  const agora = new Date();
  const mesInicial = ano === agora.getFullYear() ? agora.getMonth() + 1 : 1;

  if (mesInicial > 12) erro("Nada a agendar neste ano.", "planejamento");

  const [{ data: areas }, { data: existentes }, { data: ultimas }] =
    await Promise.all([
      admin
        .from("cinco_s_areas")
        .select("id, nome, cinco_s_area_donos!left(colaborador_id, ate)")
        .eq("revenda_id", revendaId)
        .eq("ativa", true)
        .is("cinco_s_area_donos.ate", null),
      // Tudo o que já existe no ano, numa consulta só. Perguntar mês a
      // mês seriam doze idas ao banco para responder a mesma pergunta.
      admin
        .from("cinco_s_auditorias")
        .select("area_id, competencia")
        .eq("revenda_id", revendaId)
        .neq("status", "cancelada")
        .gte("competencia", `${ano}-01-01`)
        .lte("competencia", `${ano}-12-01`),
      admin.rpc("cinco_s_ultimo_auditor", { p_revenda: revendaId }),
    ]);

  const ocupadas = new Set(
    (existentes ?? []).map((a) => `${a.area_id}|${a.competencia}`),
  );

  const ultimoAuditor = new Map<string, string>(
    ((ultimas ?? []) as { area_id: string; auditor_id: string }[]).map((a) => [
      a.area_id,
      a.auditor_id,
    ]),
  );

  const novas: {
    revenda_id: string;
    area_id: string;
    auditor_id: string;
    dono_id: string | null;
    planejada_para: string;
    status: "planejada";
  }[] = [];

  const semAuditor = new Set<string>();

  for (const a of areas ?? []) {
    const auditorId = ultimoAuditor.get(a.id) ?? padrao;
    if (!auditorId) {
      semAuditor.add(a.nome);
      continue;
    }

    const donos = Array.isArray(a.cinco_s_area_donos)
      ? a.cinco_s_area_donos
      : [a.cinco_s_area_donos];
    const dono = donos.find((d) => d && d.ate == null);

    for (let mes = mesInicial; mes <= 12; mes++) {
      const mm = String(mes).padStart(2, "0");
      if (ocupadas.has(`${a.id}|${ano}-${mm}-01`)) continue;

      novas.push({
        revenda_id: revendaId,
        area_id: a.id,
        auditor_id: auditorId,
        dono_id: dono?.colaborador_id ?? null,
        planejada_para: `${ano}-${mm}-${String(dia).padStart(2, "0")}`,
        status: "planejada",
      });
    }
  }

  if (novas.length === 0) {
    erro(
      semAuditor.size > 0
        ? `Nenhuma área tem auditor definido. Escolha um auditor padrão ou faça a primeira auditoria de cada área.`
        : `Nada a agendar: ${ano} já está planejado de ${mesInicial}/${ano} até dezembro.`,
      "planejamento",
    );
  }

  const { error } = await admin.from("cinco_s_auditorias").insert(novas);
  if (error) erro(`Não foi possível agendar: ${error.message}`, "planejamento");

  // UM aviso por auditor, com o total do ano -- e não um por auditoria.
  // Quem ficou com seis áreas em doze meses receberia setenta e dois
  // avisos idênticos, e desligaria a notificação do 5S no mesmo dia.
  //
  // O aviso de cada auditoria vem depois, na véspera e no dia dela, que
  // é quando a informação serve para alguma coisa.
  const porAuditor = new Map<string, number>();
  for (const n of novas) {
    porAuditor.set(n.auditor_id, (porAuditor.get(n.auditor_id) ?? 0) + 1);
  }

  await Promise.all(
    Array.from(porAuditor.entries()).map(([auditorId, quantas]) =>
      criarNotificacao({
        modulo: "5s",
        tipo: "novo",
        titulo: `🧹 Plano de auditorias 5S de ${ano}`,
        mensagem: `Você ficou com ${quantas} auditoria${quantas === 1 ? "" : "s"} no ano. Cada uma avisa na véspera e no dia.`,
        url: "/5s",
        revendaId,
        destinatarioId: auditorId,
      }),
    ),
  );

  revalidar();

  const aviso =
    semAuditor.size > 0
      ? ` ${semAuditor.size} área(s) ficaram de fora por não ter auditor: ${Array.from(semAuditor).join(", ")}.`
      : "";

  ok(
    `${novas.length} auditoria${novas.length === 1 ? "" : "s"} agendada${novas.length === 1 ? "" : "s"} até dezembro de ${ano}.${aviso}`,
    "planejamento",
  );
}

/* ------------------------------------------------------------------ */
/* Cobrança do que ficou pendente                                      */
/* ------------------------------------------------------------------ */

/**
 * Uma cobrança do mesmo mês só sai de novo depois disto.
 *
 * O botão fica na tela junto da lista de pendências, e a lista muda a
 * cada auditoria finalizada -- clicar duas vezes na mesma manhã é o
 * comportamento esperado, não o excepcional. Sem trava, quem está
 * devendo recebe o mesmo texto três vezes antes do almoço e desliga a
 * notificação do 5S no mesmo dia, que é o oposto do que a cobrança quer.
 */
const JANELA_COBRANCA_HORAS = 6;

/** A cobrança volta para a lista de onde partiu, não para a aba crua. */
function voltarParaPendentes(
  competencia: string,
  chave: "sucesso" | "erro",
  mensagem: string,
): never {
  const q = new URLSearchParams({
    aba: "planejamento",
    mes: competencia,
    ver: "pendentes",
    [chave]: mensagem,
  });
  redirect(`${ROTA}?${q}`);
}

/**
 * Avisa quem está devendo o mês.
 *
 * A lista de quem recebe é remontada AQUI, do banco, e não vem do
 * formulário: entre desenhar a tela e clicar o botão alguém pode ter
 * finalizado a auditoria, e cobrar quem já entregou é o jeito mais
 * rápido de a cobrança perder a autoridade.
 *
 * Um aviso por PESSOA, com as áreas dela dentro -- não um por área. O
 * auditor que ficou com seis áreas receberia seis avisos idênticos e
 * leria zero.
 *
 * Área ativa que sequer foi agendada aparece na lista da tela mas não
 * gera aviso: não há auditor para cobrar, e o dono não pode fazer nada
 * a respeito. Quem precisa agir nesse caso é a própria gestão, então
 * ela volta no texto de retorno em vez de virar mensagem no bolso de
 * quem não tem como resolver.
 */
export async function cobrarPendentes(formData: FormData) {
  await requireModulo("5s", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const competencia = texto(formData.get("competencia"));
  if (!competencia) erro("Informe o mês.", "planejamento");

  const avisarDonos = formData.get("donos") === "on";
  const referencia = `cobranca:${competencia}`;

  const desde = new Date(
    Date.now() - JANELA_COBRANCA_HORAS * 60 * 60 * 1000,
  ).toISOString();

  const { count: jaCobrado } = await admin
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("revenda_id", revendaId)
    .eq("modulo", "5s")
    .eq("referencia_id", referencia)
    .gte("criado_em", desde);

  if (jaCobrado && jaCobrado > 0) {
    voltarParaPendentes(
      competencia,
      "erro",
      `A cobrança deste mês já foi enviada há menos de ${JANELA_COBRANCA_HORAS} horas. Espere um pouco antes de mandar de novo — aviso repetido no mesmo dia é o que faz as pessoas desligarem a notificação.`,
    );
  }

  const [{ data: pendentes }, { data: ativas }] = await Promise.all([
    admin
      .from("cinco_s_auditorias")
      .select("id, area_id, auditor_id, cinco_s_areas!inner(nome)")
      .eq("revenda_id", revendaId)
      .eq("competencia", `${competencia}-01`)
      .in("status", ["planejada", "em_andamento"]),
    admin
      .from("cinco_s_areas")
      .select("id, nome")
      .eq("revenda_id", revendaId)
      .eq("ativa", true),
  ]);

  const lista = pendentes ?? [];
  const naoAgendadas = (ativas ?? []).filter(
    (ar) => !lista.some((a) => a.area_id === ar.id),
  );

  if (lista.length === 0) {
    voltarParaPendentes(
      competencia,
      "erro",
      naoAgendadas.length > 0
        ? `Não há auditoria pendente para cobrar. As ${naoAgendadas.length} área(s) sem auditoria agendada precisam ser agendadas antes — não há auditor para avisar.`
        : "Nada a cobrar: nenhuma auditoria pendente neste mês.",
    );
  }

  // O dono VIGENTE, não o congelado na auditoria. O congelado é o certo
  // para o histórico e para o plano de ação; para cobrar hoje, quem
  // responde pela área hoje é quem atende -- e é o nome que a tela
  // mostrou ao lado de cada pendência.
  const { data: donos } = await admin
    .from("cinco_s_area_donos")
    .select("area_id, colaborador_id")
    .in("area_id", Array.from(new Set(lista.map((a) => a.area_id))))
    .is("ate", null);

  const donoDaArea = new Map(
    (donos ?? []).map((d) => [d.area_id, d.colaborador_id]),
  );

  const porAuditor = new Map<string, string[]>();
  const porDono = new Map<string, string[]>();

  for (const a of lista) {
    const area = Array.isArray(a.cinco_s_areas)
      ? a.cinco_s_areas[0]
      : a.cinco_s_areas;
    const nome = (area as { nome: string })?.nome ?? "área";

    if (a.auditor_id) {
      porAuditor.set(a.auditor_id, [
        ...(porAuditor.get(a.auditor_id) ?? []),
        nome,
      ]);
    }

    // Quem audita a própria área não recebe os dois avisos pela mesma
    // pendência -- já foi cobrado como auditor, que é o papel que age.
    const dono = donoDaArea.get(a.area_id);
    if (avisarDonos && dono && dono !== a.auditor_id) {
      porDono.set(dono, [...(porDono.get(dono) ?? []), nome]);
    }
  }

  const quando = rotuloDoMes(competencia);

  await Promise.all([
    ...Array.from(porAuditor.entries()).map(([auditorId, areas]) =>
      criarNotificacao({
        modulo: "5s",
        tipo: "pendencia",
        titulo: "🧹 Auditoria 5S pendente",
        mensagem: `${quando}: ${areas.length === 1 ? "a auditoria de" : `você ainda tem ${areas.length} auditorias —`} ${listar(areas)}${areas.length === 1 ? " ainda não foi feita" : ""}.`,
        url: "/5s",
        revendaId,
        destinatarioId: auditorId,
        referenciaId: referencia,
      }),
    ),
    ...Array.from(porDono.entries()).map(([donoId, areas]) =>
      criarNotificacao({
        modulo: "5s",
        tipo: "pendencia",
        titulo: "🧹 5S da sua área ainda pendente",
        mensagem: `${quando}: a auditoria de ${listar(areas)} ainda não foi feita. Fale com o auditor da área.`,
        url: "/5s",
        revendaId,
        destinatarioId: donoId,
        referenciaId: referencia,
      }),
    ),
  ]);

  await enviarPushDaRevenda(revendaId, {
    modulo: "5s",
    titulo: "🧹 Auditoria 5S pendente",
    mensagem: `Você tem auditoria de ${quando} para fazer.`,
    url: "/5s",
    apenas: Array.from(porAuditor.keys()),
  });

  if (porDono.size > 0) {
    await enviarPushDaRevenda(revendaId, {
      modulo: "5s",
      titulo: "🧹 5S da sua área ainda pendente",
      mensagem: `A auditoria de ${quando} da sua área ainda não foi feita.`,
      url: "/5s",
      apenas: Array.from(porDono.keys()),
    });
  }

  revalidar();

  const partes = [
    `${porAuditor.size} auditor${porAuditor.size === 1 ? "" : "es"}`,
    porDono.size > 0 &&
      `${porDono.size} dono${porDono.size === 1 ? "" : "s"} de área`,
  ].filter(Boolean);

  const sobra =
    naoAgendadas.length > 0
      ? ` ${naoAgendadas.length} área(s) ficaram de fora por não ter auditoria agendada — agende antes de cobrar: ${naoAgendadas.map((a) => a.nome).join(", ")}.`
      : "";

  voltarParaPendentes(
    competencia,
    "sucesso",
    `Cobrança enviada para ${partes.join(" e ")}, sobre ${lista.length} auditoria${lista.length === 1 ? "" : "s"} pendente${lista.length === 1 ? "" : "s"}.${sobra}`,
  );
}

/**
 * "Oficina, Peças e mais 2" -- a mensagem cabe na tela do celular.
 *
 * Listar as seis áreas por extenso empurra o texto para além do que a
 * notificação mostra, e a informação que importa (que há pendência, e
 * quantas) fica justamente na parte cortada.
 */
function listar(nomes: string[]) {
  if (nomes.length <= 3) {
    return nomes.length > 1
      ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`
      : nomes[0];
  }
  return `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`;
}

/** "2026-08" -> "Agosto". O ano fica de fora: a cobrança é do mês corrente. */
function rotuloDoMes(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  const texto = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export async function cancelarAuditoria(formData: FormData) {
  await requireModulo("5s", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const id = texto(formData.get("id"));
  if (!id) erro("Auditoria não informada.", "planejamento");

  const admin = createAdminClient();

  // Auditoria finalizada não é cancelada: o resultado já contou no
  // indicador, e apagá-la do cálculo reescreveria um número que a
  // liderança já viu e discutiu.
  const { data: atual } = await admin
    .from("cinco_s_auditorias")
    .select("status")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!atual) erro("Auditoria não encontrada.", "planejamento");
  if (atual.status === "finalizada") {
    erro("Auditoria já finalizada não pode ser cancelada.", "planejamento");
  }

  await admin
    .from("cinco_s_auditorias")
    .update({ status: "cancelada" })
    .eq("id", id)
    .eq("revenda_id", revendaId);

  revalidar();
  ok("Auditoria cancelada.", "planejamento");
}

export async function trocarAuditor(formData: FormData) {
  await requireModulo("5s", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const id = texto(formData.get("id"));
  const auditorId = texto(formData.get("auditor_id"));
  if (!id || !auditorId) erro("Dados incompletos.", "planejamento");

  const admin = createAdminClient();
  const [{ data: auditoria }, { data: habilitado }] = await Promise.all([
    admin
      .from("cinco_s_auditorias")
      .select("status, planejada_para, cinco_s_areas!inner(nome)")
      .eq("id", id)
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    admin
      .from("cinco_s_auditores")
      .select("colaborador_id")
      .eq("revenda_id", revendaId)
      .eq("colaborador_id", auditorId)
      .eq("ativo", true)
      .maybeSingle(),
  ]);

  if (!auditoria) erro("Auditoria não encontrada.", "planejamento");
  if (auditoria.status === "finalizada") {
    erro("Auditoria finalizada não muda de auditor.", "planejamento");
  }
  if (!habilitado) {
    erro(
      "Essa pessoa não está habilitada como auditora. Habilite na aba Auditores primeiro.",
      "planejamento",
    );
  }

  await admin
    .from("cinco_s_auditorias")
    .update({ auditor_id: auditorId })
    .eq("id", id);

  const area = Array.isArray(auditoria.cinco_s_areas)
    ? auditoria.cinco_s_areas[0]
    : auditoria.cinco_s_areas;

  await avisarAuditor(
    revendaId,
    auditorId,
    (area as { nome: string }).nome,
    auditoria.planejada_para,
    id,
  );

  revalidar();
  ok("Auditor trocado.", "planejamento");
}

/**
 * Passa a área INTEIRA para outro auditor.
 *
 * A troca auditoria por auditoria existe logo acima e resolve o caso
 * pontual -- "esta aqui, este mês, quem faz é outro". Não resolve o
 * caso que a operação tem de verdade: o rodízio mudou, e a partir de
 * agora quem audita a Portaria é outra pessoa. Com o ano inteiro
 * planejado, fazer isso uma a uma são doze idas ao mesmo formulário, e
 * a décima terceira auditoria -- a que o planejamento do ano que vem
 * copiar -- volta com o nome antigo, porque o plano repete o auditor da
 * última auditoria de cada área.
 *
 * Pega tudo o que ainda não foi feito do mês corrente em diante. O
 * passado fica como está: a auditoria de março foi feita por quem foi,
 * e reescrever isso mentiria no BI e no ranking por auditor. As
 * atrasadas do mês corrente ENTRAM -- elas ainda são dívida, e quem vai
 * pagá-la é o auditor novo.
 */
export async function trocarAuditorDaArea(formData: FormData) {
  await requireModulo("5s", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const areaId = texto(formData.get("area_id"));
  const auditorId = texto(formData.get("auditor_id"));
  if (!areaId || !auditorId) erro("Escolha a área e o auditor.", "areas");

  const [{ data: area }, { data: habilitado }] = await Promise.all([
    admin
      .from("cinco_s_areas")
      .select("id, nome")
      .eq("id", areaId)
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    // O select da tela já só oferece auditor ativo, mas a ação de
    // servidor é um endereço como outro qualquer: sem esta conferência,
    // um id qualquer chegando no formulário viraria auditor da área.
    admin
      .from("cinco_s_auditores")
      .select("colaborador_id")
      .eq("revenda_id", revendaId)
      .eq("colaborador_id", auditorId)
      .eq("ativo", true)
      .maybeSingle(),
  ]);

  if (!area) erro("Área não encontrada nesta revenda.", "areas");
  if (!habilitado) {
    erro(
      "Essa pessoa não está habilitada como auditora. Habilite na aba Auditores primeiro.",
      "areas",
    );
  }

  const { data: pendentes } = await admin
    .from("cinco_s_auditorias")
    .select("id, auditor_id, planejada_para")
    .eq("revenda_id", revendaId)
    .eq("area_id", areaId)
    .in("status", ["planejada", "em_andamento"])
    .gte("competencia", `${competenciaAtual()}-01`)
    .order("planejada_para");

  const alvo = (pendentes ?? []).filter((a) => a.auditor_id !== auditorId);

  if (alvo.length === 0) {
    erro(
      (pendentes ?? []).length > 0
        ? `Essa pessoa já é a auditora de todas as auditorias abertas de ${area.nome}.`
        : `${area.nome} não tem auditoria aberta deste mês em diante. Agende antes de definir o auditor.`,
      "areas",
    );
  }

  const { error } = await admin
    .from("cinco_s_auditorias")
    .update({ auditor_id: auditorId })
    .in(
      "id",
      alvo.map((a) => a.id),
    );

  if (error) erro(`Não foi possível trocar: ${error.message}`, "areas");

  // Um aviso para quem chega, com o total e a primeira data -- e não um
  // por auditoria: quem herdou o ano inteiro receberia doze avisos
  // idênticos e desligaria a notificação do 5S no mesmo minuto.
  const primeira = alvo[0].planejada_para.split("-").reverse().join("/");
  const quantas = alvo.length;

  await criarNotificacao({
    modulo: "5s",
    tipo: "novo",
    titulo: "🧹 Você é o auditor da área",
    mensagem: `${area.nome} — ${quantas} auditoria${quantas === 1 ? "" : "s"} para você. A primeira em ${primeira}.`,
    url: "/5s",
    revendaId,
    destinatarioId: auditorId,
    referenciaId: `area-auditor:${areaId}`,
  });

  await enviarPushDaRevenda(revendaId, {
    modulo: "5s",
    titulo: "🧹 Você é o auditor da área",
    mensagem: `${area.nome} — ${quantas} auditoria${quantas === 1 ? "" : "s"} para você.`,
    url: "/5s",
    apenas: [auditorId],
  });

  // Quem sai também é avisado. A auditoria simplesmente sumindo da lista
  // dele, sem explicação, é o tipo de coisa que faz a pessoa achar que o
  // app perdeu o trabalho dela.
  const saindo = Array.from(
    new Set(
      alvo.map((a) => a.auditor_id).filter((x): x is string => Boolean(x)),
    ),
  );

  const nomes = await nomesDe([auditorId, ...saindo]);
  const novoNome = nomes.get(auditorId) ?? "outro auditor";

  await Promise.all(
    saindo.map((antigo) =>
      criarNotificacao({
        modulo: "5s",
        tipo: "novo",
        titulo: "🧹 Auditoria 5S repassada",
        mensagem: `${area.nome} passou a ser auditada por ${novoNome}. Você não precisa mais fazer essas auditorias.`,
        url: "/5s",
        revendaId,
        destinatarioId: antigo,
        referenciaId: `area-auditor:${areaId}`,
      }),
    ),
  );

  revalidar();
  ok(
    `${area.nome}: ${quantas} auditoria${quantas === 1 ? "" : "s"} ${quantas === 1 ? "passou" : "passaram"} para ${novoNome}.`,
    "areas",
  );
}

async function avisarAuditor(
  revendaId: string,
  auditorId: string,
  areaNome: string,
  data: string,
  auditoriaId: string,
) {
  const quando = data.split("-").reverse().join("/");
  await criarNotificacao({
    modulo: "5s",
    tipo: "pendencia",
    titulo: "🧹 Auditoria 5S para você",
    mensagem: `${areaNome} — prevista para ${quando}.`,
    url: `/5s/auditoria/${auditoriaId}`,
    revendaId,
    destinatarioId: auditorId,
    referenciaId: auditoriaId,
  });

  await enviarPushDaRevenda(revendaId, {
    modulo: "5s",
    titulo: "🧹 Auditoria 5S para você",
    mensagem: `${areaNome} — prevista para ${quando}.`,
    url: `/5s/auditoria/${auditoriaId}`,
    apenas: [auditorId],
  });
}

/* ================================================================== */
/* PLANO DE AÇÃO -- atribuição e validação                            */
/* ================================================================== */

/**
 * Define responsável, prazo e prioridade de uma não conformidade.
 *
 * É o passo que transforma "achamos um problema" em "fulano resolve
 * até tal dia" -- sem ele o plano de ação vira a lista de lamentos que
 * a planilha era.
 */
export async function atribuirAcao(formData: FormData) {
  await requireModulo("5s", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = texto(formData.get("id"));
  if (!id) erro("Ação não informada.", "acoes");

  const responsavelId = texto(formData.get("responsavel_id"));
  const prazo = texto(formData.get("prazo"));
  const prioridade = texto(formData.get("prioridade")) ?? "media";
  const acao = texto(formData.get("acao"));
  const senso = texto(formData.get("senso"));
  if (senso && !ehSenso(senso)) erro("Senso inválido.", "acoes");

  const { data: antes } = await admin
    .from("cinco_s_nao_conformidades")
    .select("id, responsavel_id, descricao, area_id")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!antes) erro("Ação não encontrada.", "acoes");

  const { error } = await admin
    .from("cinco_s_nao_conformidades")
    .update({
      responsavel_id: responsavelId,
      prazo,
      prioridade,
      acao,
    })
    .eq("id", id)
    .eq("revenda_id", revendaId);

  if (error) erro(`Não foi possível salvar: ${error.message}`, "acoes");

  // Só avisa quando o responsável MUDA. Salvar de novo o mesmo nome
  // depois de corrigir uma vírgula no prazo não deve tocar o celular de
  // ninguém pela segunda vez.
  if (responsavelId && responsavelId !== antes.responsavel_id) {
    const quando = prazo ? ` até ${prazo.split("-").reverse().join("/")}` : "";
    await criarNotificacao({
      modulo: "5s",
      tipo: "pendencia",
      titulo: "🧹 Ação 5S para você",
      mensagem: `${antes.descricao.slice(0, 90)}${quando}.`,
      url: "/5s/acoes",
      revendaId,
      destinatarioId: responsavelId,
      referenciaId: id,
    });
    await enviarPushDaRevenda(revendaId, {
      modulo: "5s",
      titulo: "🧹 Ação 5S para você",
      mensagem: `${antes.descricao.slice(0, 90)}${quando}.`,
      url: "/5s/acoes",
      apenas: [responsavelId],
    });
  }

  revalidar();
  ok("Ação atualizada.", "acoes");
}
