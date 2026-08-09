"use server";

import { getPerfil } from "@/lib/sessao";
import { getRevendaId } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PRIORIDADE,
  ROTULO_BOTAO,
  type Aviso,
  type ModuloNotificavel,
  type TipoNotificacao,
} from "@/lib/notificacoes";

/** Nada mais antigo que isso aparece, mesmo que ninguém tenha visto. */
const JANELA_DIAS = 21;

export type PainelAvisos = {
  /** Tudo que vale mostrar no sino, do mais importante ao mais antigo. */
  avisos: Aviso[];
  /** Quantos ainda não foram abertos. É o número da bolinha do sino. */
  naoVistos: number;
  /** O único que vira balão nesta visita. Null quando não há nada novo. */
  balao: Aviso | null;
};

const VAZIO: PainelAvisos = { avisos: [], naoVistos: 0, balao: null };

/** Data de hoje em "AAAA-MM-DD", no fuso da operação. */
function hojeIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
}

function horaAgora() {
  return Number(
    new Date().toLocaleString("pt-BR", {
      timeZone: "America/Bahia",
      hour: "2-digit",
      hour12: false,
    }),
  );
}

/**
 * Monta o painel de avisos da pessoa que está pedindo.
 *
 * Chamada UMA vez por carregamento de página, não a cada navegação. São
 * quatro consultas curtas, todas por índice.
 */
export async function carregarAvisos(): Promise<PainelAvisos> {
  const perfil = await getPerfil();
  if (!perfil) return VAZIO;

  const admin = createAdminClient();

  // O sino é da revenda em que a pessoa está agora. Quem responde pelas
  // duas vê os avisos de uma de cada vez, junto com o resto do app.
  const revendaId = await getRevendaId();
  if (!revendaId) return VAZIO;

  const desde = new Date();
  desde.setDate(desde.getDate() - JANELA_DIAS);

  const [{ data: publicadas }, { data: estados }, { data: ajustes }] =
    await Promise.all([
      admin
        .from("notificacoes")
        .select("id, tipo, modulo, titulo, mensagem, url, prioridade, criado_em")
        .eq("revenda_id", revendaId)
        .eq("ativa", true)
        .gte("criado_em", desde.toISOString())
        .order("criado_em", { ascending: false })
        .limit(30),
      admin
        .from("notificacao_estado")
        .select("chave, vista_em, dispensada_em")
        .eq("colaborador_id", perfil.id),
      admin
        .from("notificacao_ajustes")
        .select("hora_lembrete_feedback, max_por_acesso")
        .eq("revenda_id", revendaId)
        .maybeSingle(),
    ]);

  const estado = new Map(
    (estados ?? []).map((e) => [
      e.chave,
      { vista: Boolean(e.vista_em), dispensada: Boolean(e.dispensada_em) },
    ]),
  );

  const avisos: Aviso[] = [];

  // ---- Notificações publicadas ------------------------------------
  for (const n of publicadas ?? []) {
    // Quem entrou no app depois da publicação não precisa ver histórico
    // que não viveu.
    if (perfil.criadoEm && n.criado_em < perfil.criadoEm) continue;

    const chave = `n:${n.id}`;
    const st = estado.get(chave);
    if (st?.dispensada) continue;

    const modulo = n.modulo as ModuloNotificavel;
    avisos.push({
      chave,
      tipo: n.tipo as TipoNotificacao,
      modulo,
      titulo: n.titulo,
      mensagem: n.mensagem,
      url: n.url,
      rotuloBotao: ROTULO_BOTAO[modulo] ?? "Ver",
      prioridade: n.prioridade,
      criadoEm: n.criado_em,
      vista: Boolean(st?.vista),
    });
  }

  // ---- Pendência: feedback da rota --------------------------------
  // Não existe linha no banco para isto. É uma pergunta feita na hora às
  // tabelas que já existem -- por isso nunca fica desatualizada e não
  // precisa de nenhuma tarefa agendada.
  const pendencia = await pendenciaDeFeedback(perfil.id, ajustes, estado);
  if (pendencia) avisos.push(pendencia);

  // A lista do sino é sempre mais recente primeiro — é o que a pessoa
  // espera ao abrir o sino. A prioridade só decide qual delas vira balão.
  avisos.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));

  const naoVistos = avisos.filter((a) => !a.vista).length;

  // Só UM balão por visita, por mais novidades que existam. O resto fica
  // no sino, esperando ser procurado. Entre as não vistas, a de maior
  // prioridade vira balão (pendência ganha de novidade).
  const maximo = ajustes?.max_por_acesso ?? 1;
  const novos = [...avisos]
    .filter((a) => !a.vista)
    .sort(
      (a, b) =>
        b.prioridade - a.prioridade || b.criadoEm.localeCompare(a.criadoEm),
    );
  const balao = maximo > 0 ? (novos[0] ?? null) : null;

  return { avisos, naoVistos, balao };
}

async function pendenciaDeFeedback(
  colaboradorId: string,
  ajustes: { hora_lembrete_feedback: number } | null,
  estado: Map<string, { vista: boolean; dispensada: boolean }>,
): Promise<Aviso | null> {
  const admin = createAdminClient();

  const revendaId = await getRevendaId();
  if (!revendaId) return null;

  const { data: config } = await admin
    .from("notificacao_config")
    .select("ativa")
    .eq("revenda_id", revendaId)
    .eq("modulo", "feedback")
    .maybeSingle();

  if (config && !config.ativa) return null;

  // Antes da hora combinada o dia ainda está correndo -- cobrar seria
  // atrapalhar quem está na rua.
  const horaMinima = ajustes?.hora_lembrete_feedback ?? 16;
  if (horaAgora() < horaMinima) return null;

  const dia = hojeIso();
  const chave = `feedback:${dia}`;

  // Dispensou hoje: só volta amanhã, porque a chave muda de dia.
  if (estado.get(chave)?.dispensada) return null;

  const { count } = await admin
    .from("feedback_rota")
    .select("*", { count: "exact", head: true })
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", colaboradorId)
    .gte("criado_em", `${dia}T00:00:00`);

  // Já respondeu hoje: a pendência deixa de existir sozinha.
  if ((count ?? 0) > 0) return null;

  return {
    chave,
    tipo: "pendencia",
    modulo: "feedback",
    titulo: "Antes de encerrar o dia...",
    mensagem: "Você já fez o feedback da sua rota hoje?",
    url: "/feedback-rota",
    rotuloBotao: ROTULO_BOTAO.feedback,
    prioridade: PRIORIDADE.pendencia,
    criadoEm: `${dia}T${String(horaMinima).padStart(2, "0")}:00:00`,
    vista: Boolean(estado.get(chave)?.vista),
  };
}

/** Registra que a pessoa viu, clicou ou dispensou o aviso. */
export async function marcarAviso(
  chave: string,
  o_que: "vista" | "clicada" | "dispensada",
) {
  const perfil = await getPerfil();
  if (!perfil || !chave) return;

  const agora = new Date().toISOString();
  const campo =
    o_que === "vista"
      ? { vista_em: agora }
      : o_que === "clicada"
        ? { vista_em: agora, clicada_em: agora }
        : { vista_em: agora, dispensada_em: agora };

  const admin = createAdminClient();
  await admin.from("notificacao_estado").upsert(
    {
      colaborador_id: perfil.id,
      chave,
      ...campo,
      atualizado_em: agora,
    },
    { onConflict: "colaborador_id,chave" },
  );
}

/** Marca tudo como visto — o botão "limpar" do sino. */
export async function marcarTudoVisto(chaves: string[]) {
  const perfil = await getPerfil();
  if (!perfil || chaves.length === 0) return;

  const agora = new Date().toISOString();
  const admin = createAdminClient();

  await admin.from("notificacao_estado").upsert(
    chaves.map((chave) => ({
      colaborador_id: perfil.id,
      chave,
      vista_em: agora,
      atualizado_em: agora,
    })),
    { onConflict: "colaborador_id,chave" },
  );
}
