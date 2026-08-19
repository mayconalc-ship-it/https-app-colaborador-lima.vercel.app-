import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil } from "@/lib/sessao";
import { getRevendaId, revendaTemModulo } from "@/lib/revendas";
import { getConcessoes } from "@/lib/concessoes";
import { podeFazer, ehOwner } from "@/lib/acessos";
import type { Dashboard, Pergunta, Senso } from "@/lib/cinco-s";

/**
 * O acesso ao 5S, decidido em um lugar só.
 *
 * O pedido descrevia quatro perfis -- Administrador, Auditor, Dono da
 * área e Visualizador. Nenhum deles virou papel novo no banco, e isso é
 * proposital: o app já tem três papéis e um mapa de permissões por
 * módulo, e criar um segundo sistema de papéis só para o 5S daria duas
 * respostas possíveis para "esta pessoa pode?" -- que é exatamente como
 * nasce um furo de acesso.
 *
 * Os quatro perfis do pedido saem, aqui, do cruzamento do que já existe
 * com os cadastros do próprio módulo:
 *
 *   Administrador  = permissão "5s:editar" (owner ou liderança liberada)
 *   Visualizador   = permissão "5s:ver" e nada mais
 *   Auditor        = está em cinco_s_auditores, ativo
 *   Dono da área   = tem vínculo vigente em cinco_s_area_donos
 *
 * As três últimas condições não se excluem: o supervisor que audita a
 * área do colega e é dono da própria acumula os dois recortes, e é o
 * que acontece na operação de verdade.
 */
export type Contexto5S = {
  perfilId: string;
  nome: string;
  revendaId: string;
  /** Vê o módulo inteiro, todas as áreas. */
  gestor: boolean;
  /** Cadastra, planeja, valida ação. */
  podeEditar: boolean;
  podeExcluir: boolean;
  ehAuditor: boolean;
  /** Áreas em que a pessoa é dona HOJE. */
  areasComoDono: string[];
  /** Áreas para as quais a pessoa está habilitada como auditora. */
  areasComoAuditor: string[];
  /** Entrou de algum jeito? Se falso, a tela do módulo nem abre. */
  temAcesso: boolean;
};

/**
 * Uma consulta por requisição, graças ao cache(): o layout, a página e
 * cada ação de servidor perguntam a mesma coisa e o banco responde uma
 * vez só. É a mesma técnica de getPerfil e getConcessoes.
 */
export const getContexto5S = cache(async (): Promise<Contexto5S | null> => {
  const perfil = await getPerfil();
  if (!perfil) return null;

  const revendaId = await getRevendaId();
  if (!revendaId) return null;

  // A revenda vem primeiro e vale até para o dono do app: se a operação
  // dali não usa 5S, o módulo não existe ali para ninguém.
  if (!(await revendaTemModulo("5s"))) return null;

  const concessoes = await getConcessoes();
  const gestor = podeFazer(perfil.role, concessoes, "5s", "ver");
  const podeEditar = podeFazer(perfil.role, concessoes, "5s", "editar");
  const podeExcluir = podeFazer(perfil.role, concessoes, "5s", "excluir");

  const admin = createAdminClient();

  // As duas consultas de vínculo vão juntas: são independentes, e
  // esperar uma para começar a outra dobraria a latência da tela por
  // nada.
  const [{ data: auditor }, { data: donoDe }, { data: auditorDe }] =
    await Promise.all([
      admin
        .from("cinco_s_auditores")
        .select("colaborador_id")
        .eq("revenda_id", revendaId)
        .eq("colaborador_id", perfil.id)
        .eq("ativo", true)
        .maybeSingle(),
      admin
        .from("cinco_s_area_donos")
        .select("area_id, cinco_s_areas!inner(revenda_id)")
        .eq("colaborador_id", perfil.id)
        .is("ate", null)
        .eq("cinco_s_areas.revenda_id", revendaId),
      admin
        .from("cinco_s_area_auditores")
        .select("area_id, cinco_s_areas!inner(revenda_id)")
        .eq("colaborador_id", perfil.id)
        .eq("cinco_s_areas.revenda_id", revendaId),
    ]);

  const areasComoDono = (donoDe ?? []).map((d) => d.area_id);
  const areasComoAuditor = (auditorDe ?? []).map((d) => d.area_id);
  const ehAuditor = Boolean(auditor);

  return {
    perfilId: perfil.id,
    nome: perfil.nome,
    revendaId,
    gestor: gestor || ehOwner(perfil.role),
    podeEditar,
    podeExcluir,
    ehAuditor,
    areasComoDono,
    areasComoAuditor,
    temAcesso:
      gestor || ehOwner(perfil.role) || ehAuditor || areasComoDono.length > 0,
  };
});

/**
 * O contexto, ou nada feito.
 *
 * Toda ação de servidor do módulo começa por aqui. Proteger só a tela
 * deixaria a porta dos fundos aberta para quem souber o endereço da
 * ação -- e uma server action é um endereço como outro qualquer.
 */
export async function exigirContexto5S(): Promise<Contexto5S> {
  const ctx = await getContexto5S();
  if (!ctx || !ctx.temAcesso) {
    throw new Error("Sem acesso ao Programa 5S.");
  }
  return ctx;
}

/** Ações de cadastro e planejamento. */
export async function exigirGestor5S(): Promise<Contexto5S> {
  const ctx = await exigirContexto5S();
  if (!ctx.podeEditar) {
    throw new Error("Você não tem permissão para alterar o Programa 5S.");
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/* O recorte por área -- o coração da regra de acesso                  */
/* ------------------------------------------------------------------ */

/**
 * As áreas que esta pessoa pode enxergar.
 *
 * `null` quer dizer "todas" (gestor), e não "nenhuma" -- a diferença
 * importa: quem chamar precisa tratar null como ausência de filtro, e
 * uma lista vazia como "não vê nada". Devolver [] para o gestor seria
 * mais simples e esconderia o app inteiro dele.
 */
export function areasVisiveis(ctx: Contexto5S): string[] | null {
  if (ctx.gestor) return null;
  // O auditor sem vínculo de área é o caso normal na operação de hoje:
  // a planilha não amarra auditor a área, qualquer um audita qualquer
  // uma. Para ele o recorte vem das auditorias em que é o auditor
  // designado, checado em `podeVerAuditoria`.
  return Array.from(new Set([...ctx.areasComoDono, ...ctx.areasComoAuditor]));
}

/**
 * Esta pessoa pode abrir esta auditoria?
 *
 * Quatro caminhos, e basta um: é gestor; é o auditor designado; é dono
 * da área; está habilitada como auditora daquela área.
 */
export function podeVerAuditoria(
  ctx: Contexto5S,
  // `auditor_id` aceita nulo por causa do histórico importado de quem
  // já saiu da empresa (ver migração 038). Nulo nunca é igual ao id de
  // ninguém, então essas auditorias só se abrem pelos outros caminhos
  // -- gestor ou dono da área -- que é o comportamento certo.
  auditoria: { auditor_id: string | null; area_id: string },
): boolean {
  if (ctx.gestor) return true;
  if (auditoria.auditor_id === ctx.perfilId) return true;
  if (ctx.areasComoDono.includes(auditoria.area_id)) return true;
  if (ctx.areasComoAuditor.includes(auditoria.area_id)) return true;
  return false;
}

/** Quem pode RESPONDER: só o auditor designado, e só antes de finalizar. */
export function podeResponder(
  ctx: Contexto5S,
  auditoria: { auditor_id: string | null; status: string },
): boolean {
  if (auditoria.status === "finalizada" || auditoria.status === "cancelada") {
    return false;
  }
  return auditoria.auditor_id === ctx.perfilId || ctx.podeEditar;
}

/* ------------------------------------------------------------------ */
/* Leituras                                                            */
/* ------------------------------------------------------------------ */

export type AreaResumo = {
  id: string;
  nome: string;
  local: string | null;
  descricao: string | null;
  ativa: boolean;
  dono_id: string | null;
  dono_nome: string | null;
};

/**
 * As áreas da revenda com o dono vigente já resolvido.
 *
 * Uma consulta com join embutido, e não uma lista de áreas seguida de
 * um "quem é o dono?" por área -- que é o N+1 clássico e o que o
 * requisito de performance pede para evitar.
 */
export async function listarAreas(
  revendaId: string,
  opcoes: { apenasAtivas?: boolean; ids?: string[] | null } = {},
): Promise<AreaResumo[]> {
  const admin = createAdminClient();

  let consulta = admin
    .from("cinco_s_areas")
    .select(
      "id, nome, local, descricao, ativa, ordem, cinco_s_area_donos!left(colaborador_id, ate)",
    )
    .eq("revenda_id", revendaId)
    .is("cinco_s_area_donos.ate", null)
    .order("ordem")
    .order("nome");

  if (opcoes.apenasAtivas) consulta = consulta.eq("ativa", true);
  if (opcoes.ids) {
    if (opcoes.ids.length === 0) return [];
    consulta = consulta.in("id", opcoes.ids);
  }

  const { data } = await consulta;
  const areas = data ?? [];

  // Os nomes dos donos vêm em UMA consulta para a lista inteira. Buscar
  // o nome dentro do laço seria uma ida ao banco por área.
  const donoIds = Array.from(
    new Set(
      areas
        .map((a) => vinculoVigente(a.cinco_s_area_donos))
        .filter((x): x is string => Boolean(x)),
    ),
  );

  const nomes = await nomesDe(donoIds);

  return areas.map((a) => {
    const donoId = vinculoVigente(a.cinco_s_area_donos);
    return {
      id: a.id,
      nome: a.nome,
      local: a.local,
      descricao: a.descricao,
      ativa: a.ativa,
      dono_id: donoId,
      dono_nome: donoId ? (nomes.get(donoId) ?? null) : null,
    };
  });
}

/**
 * O PostgREST devolve o relacionamento como objeto ou lista conforme
 * resolve a cardinalidade. Normalizar aqui evita espalhar essa dúvida
 * pelo resto do arquivo -- mesmo cuidado que o app já toma em
 * admin/auditoria.
 */
function vinculoVigente(valor: unknown): string | null {
  if (!valor) return null;
  const lista = Array.isArray(valor) ? valor : [valor];
  const vigente = lista.find(
    (v) => (v as { ate?: string | null } | null)?.ate == null,
  ) as { colaborador_id?: string } | undefined;
  return vigente?.colaborador_id ?? null;
}

/** Nomes de um punhado de ids, em uma consulta. */
export async function nomesDe(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, nome")
    .in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p.nome as string]));
}

/**
 * As perguntas do checklist, na ordem.
 *
 * cache() porque a mesma lista é pedida pela tela do auditor, pelo
 * cálculo do progresso e pela geração das não conformidades dentro da
 * mesma requisição.
 */
export const listarPerguntas = cache(
  async (revendaId: string): Promise<Pergunta[]> => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("cinco_s_perguntas")
      .select("id, senso, codigo, texto, ordem")
      .eq("revenda_id", revendaId)
      .eq("ativa", true)
      .order("ordem");

    return (data ?? []).map((p) => ({
      id: p.id,
      senso: p.senso as Senso,
      codigo: p.codigo,
      texto: p.texto,
      ordem: p.ordem,
    }));
  },
);

/* ------------------------------------------------------------------ */
/* O BI                                                                */
/* ------------------------------------------------------------------ */

export type FiltrosBI = {
  competencia?: string | null;
  ano?: number | null;
  areaId?: string | null;
  donoId?: string | null;
  auditorId?: string | null;
  senso?: Senso | null;
};

/**
 * O dashboard inteiro, em uma chamada.
 *
 * Sete cartões, cinco gráficos e três listas viriam, no desenho
 * ingênuo, de quinze consultas independentes -- cada uma refiltrando a
 * mesma base. Aqui é um round-trip só: a função no banco filtra uma vez
 * e devolve os quinze recortes prontos, em JSON.
 *
 * A revenda NÃO vem da tela. Ela vem da sessão, já conferida -- é o que
 * impede alguém de trocar o parâmetro e pedir o BI da outra revenda.
 */
export async function getDashboard(
  revendaId: string,
  f: FiltrosBI = {},
): Promise<Dashboard> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("cinco_s_dashboard", {
    p_revenda: revendaId,
    p_competencia: f.competencia ? `${f.competencia}-01` : null,
    p_ano: f.ano ?? null,
    p_area: f.areaId ?? null,
    p_dono: f.donoId ?? null,
    p_auditor: f.auditorId ?? null,
    p_senso: f.senso ?? null,
  });

  if (error || !data) return dashboardVazio();
  return data as Dashboard;
}

/** Os meses que existem na base. Alimenta o seletor de período. */
export async function getCompetencias(revendaId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("cinco_s_competencias", {
    p_revenda: revendaId,
  });
  return (data ?? []).map((r: { competencia: string }) => r.competencia);
}

/**
 * O que a tela recebe quando o banco não respondeu.
 *
 * Devolver a forma vazia em vez de propagar o erro mantém o dashboard
 * de pé com zeros e um aviso, em vez de derrubar a tela inteira -- e o
 * BI é justamente a tela que mais gente abre sem saber o que fazer
 * quando ela quebra.
 */
function dashboardVazio(): Dashboard {
  return {
    cartoes: {
      conformidade: null,
      areas_auditadas: 0,
      realizadas: 0,
      planejadas: 0,
      pendentes: 0,
      atrasadas: 0,
      itens_ok: 0,
      itens_nok: 0,
      itens_na: 0,
      nc_abertas: 0,
      nc_total: 0,
      nc_concluidas: 0,
      nc_validadas: 0,
      acoes_atrasadas: 0,
      pct_acoes_concluidas: null,
    },
    por_area: [],
    por_senso: [],
    evolucao: [],
    por_auditor: [],
    perguntas: [],
    abertas: [],
  };
}

/* ------------------------------------------------------------------ */
/* Consolidação                                                        */
/* ------------------------------------------------------------------ */

/**
 * Manda o banco recalcular o consolidado de uma auditoria.
 *
 * Chamado na finalização e sempre que uma resposta de auditoria já
 * finalizada for corrigida. O cálculo em si mora no banco (função
 * cinco_s_consolidar, migração 035): fazer aqui custaria uma ida para
 * ler as respostas, o cálculo em JavaScript e outra ida para gravar --
 * com a chance de o processo morrer no meio e deixar o consolidado
 * mentindo sobre as respostas.
 */
export async function consolidar(auditoriaId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.rpc("cinco_s_consolidar", { p_auditoria: auditoriaId });
}
