"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { ehSenso } from "@/lib/cinco-s";

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
      .update({ ate: new Date().toISOString().slice(0, 10) })
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
      // Uma consulta só para descobrir o auditor de cada área: pega as
      // auditorias recentes e o primeiro registro de cada área já é o
      // mais novo. Perguntar área por área seria N+1.
      admin
        .from("cinco_s_auditorias")
        .select("area_id, auditor_id")
        .eq("revenda_id", revendaId)
        .order("planejada_para", { ascending: false })
        .limit(500),
    ]);

  const ocupadas = new Set((jaTem ?? []).map((a) => a.area_id));

  const ultimoAuditor = new Map<string, string>();
  for (const a of ultimas ?? []) {
    if (!ultimoAuditor.has(a.area_id)) ultimoAuditor.set(a.area_id, a.auditor_id);
  }

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
  const { data: auditoria } = await admin
    .from("cinco_s_auditorias")
    .select("status, planejada_para, cinco_s_areas!inner(nome)")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!auditoria) erro("Auditoria não encontrada.", "planejamento");
  if (auditoria.status === "finalizada") {
    erro("Auditoria finalizada não muda de auditor.", "planejamento");
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
