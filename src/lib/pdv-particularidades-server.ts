import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizarCodPdv,
  sugestoesDeDetrator,
  type AvaliacaoDoPdv,
  type Categoria,
  type Particularidade,
  type SugestaoDetrator,
} from "@/lib/pdv-particularidades";

/**
 * O LADO DO BANCO DAS PARTICULARIDADES DO PDV.
 *
 * A regra mora em lib/pdv-particularidades.ts, pura e testada. Aqui é a
 * leitura -- e uma decisão que vale explicar: NÃO EXISTE CADASTRO DE PDV
 * NESTE APP, e este módulo não cria um.
 *
 * O cliente já está no Rating (1.216 PDVs distintos, `cod_pdv` presente
 * em 100% das 14.623 avaliações) e na Devolução. Criar uma terceira lista
 * de clientes daria três verdades sobre o mesmo cliente e a obrigação de
 * manter as três em dia -- e a terceira envelheceria primeiro, porque
 * seria a única alimentada à mão. A particularidade se pendura no CÓDIGO;
 * o nome e a cidade vêm de quem já os tem, e ficam gravados na linha para
 * a tela não depender disso depois.
 */

const LIMITE_BUSCA = 12;

export type PdvEncontrado = {
  codPdv: string;
  nomePdv: string | null;
  cidade: string | null;
  /** Quantas entregas avaliadas -- diz se o código existe mesmo. */
  avaliacoes: number;
  /** Nota média, quando há. É o contexto que a pessoa quer ao cadastrar. */
  media: number | null;
  detratoras: number;
};

/**
 * A BUSCA DO PDV, por código ou por nome.
 *
 * Lê o Rating porque é a base mais completa de clientes que o app tem. O
 * termo é testado nos dois campos: quem sabe o código digita o código,
 * quem lembra do nome digita o nome -- e na doca ninguém decora 1.216
 * códigos.
 *
 * VEM COM A NOTA JUNTO, e isso não é enfeite: quem vai cadastrar "cliente
 * detrator" precisa ver se é caso disso, e quem vai cadastrar um horário
 * de descarga se beneficia de saber que aquele cliente já reclamou de
 * atraso três vezes.
 */
export async function buscarPdv(revendaId: string, termo: string): Promise<PdvEncontrado[]> {
  const t = termo.trim();
  if (t.length < 2) return [];

  const admin = createAdminClient();
  const codigo = normalizarCodPdv(t);

  // Duas consultas em vez de um `or` gigante: o `ilike` no nome e o
  // casamento por código são perguntas diferentes, e juntá-las numa só
  // deixaria o índice de fora em uma delas.
  const [porNome, porCodigo] = await Promise.all([
    admin
      .from("rating_avaliacoes")
      .select("cod_pdv, nome_pdv, cidade, nota, classificacao")
      .eq("revenda_id", revendaId)
      .ilike("nome_pdv", `%${t}%`)
      .limit(400),
    admin
      .from("rating_avaliacoes")
      .select("cod_pdv, nome_pdv, cidade, nota, classificacao")
      .eq("revenda_id", revendaId)
      .or(`cod_pdv.eq.${codigo},cod_pdv.ilike.%${codigo}`)
      .limit(400),
  ]);

  const porPdv = new Map<
    string,
    { nome: string | null; cidade: string | null; notas: number[]; det: number }
  >();
  type LinhaAval = {
    cod_pdv: string | null;
    nome_pdv: string | null;
    cidade: string | null;
    nota: number;
    classificacao: string;
  };
  const encontradas = [
    ...((porNome.data ?? []) as LinhaAval[]),
    ...((porCodigo.data ?? []) as LinhaAval[]),
  ];
  for (const l of encontradas) {
    const cod = normalizarCodPdv(l.cod_pdv);
    if (!cod) continue;
    const atual = porPdv.get(cod) ?? { nome: l.nome_pdv, cidade: l.cidade, notas: [], det: 0 };
    atual.notas.push(l.nota);
    if (l.classificacao === "detrator") atual.det += 1;
    porPdv.set(cod, atual);
  }

  return [...porPdv.entries()]
    .map(([codPdv, v]) => ({
      codPdv,
      nomePdv: v.nome,
      cidade: v.cidade,
      avaliacoes: v.notas.length,
      media: v.notas.length
        ? Math.round((v.notas.reduce((t2, n) => t2 + n, 0) / v.notas.length) * 10) / 10
        : null,
      detratoras: v.det,
    }))
    // O código exato primeiro: quem digitou o código quer aquele.
    .sort((a, b) => {
      if (a.codPdv === codigo) return -1;
      if (b.codPdv === codigo) return 1;
      return b.avaliacoes - a.avaliacoes;
    })
    .slice(0, LIMITE_BUSCA);
}

type LinhaCategoria = {
  id: string;
  nome: string;
  emoji: string | null;
  ajuda: string | null;
  severidade: string;
  exige_prazo: boolean;
  exige_horario: boolean;
  alerta_na_rota: boolean;
  ordem: number;
  ativo: boolean;
};

type LinhaParticularidade = {
  id: string;
  categoria_id: string;
  cod_pdv: string;
  nome_pdv: string | null;
  cidade: string | null;
  bairro: string | null;
  aviso: string;
  detalhe: string | null;
  hora_de: string | null;
  hora_ate: string | null;
  dias_semana: number[] | null;
  de: string | null;
  ate: string | null;
  status: string;
  origem: string;
  criado_por_nome: string | null;
  criado_em: string;
  resolvido_em: string | null;
  resolvido_por_nome: string | null;
  resolucao: string | null;
};

export type CategoriaCompleta = Categoria & {
  ajuda: string | null;
  ordem: number;
  ativo: boolean;
};

export type ParticularidadeCompleta = Particularidade & {
  origem: string;
  criadoPorNome: string | null;
  criadoEm: string;
  resolvidoEm: string | null;
  resolvidoPorNome: string | null;
  resolucao: string | null;
};

const paraCategoria = (l: LinhaCategoria): CategoriaCompleta => ({
  id: l.id,
  nome: l.nome,
  emoji: l.emoji,
  ajuda: l.ajuda,
  severidade: (l.severidade === "info" || l.severidade === "critico" ? l.severidade : "atencao"),
  exigePrazo: l.exige_prazo,
  exigeHorario: l.exige_horario,
  alertaNaRota: l.alerta_na_rota,
  ordem: l.ordem,
  ativo: l.ativo,
});

const paraParticularidade = (l: LinhaParticularidade): ParticularidadeCompleta => ({
  id: l.id,
  categoriaId: l.categoria_id,
  codPdv: l.cod_pdv,
  nomePdv: l.nome_pdv,
  cidade: l.cidade,
  bairro: l.bairro,
  aviso: l.aviso,
  detalhe: l.detalhe,
  horaDe: l.hora_de,
  horaAte: l.hora_ate,
  diasSemana: l.dias_semana,
  de: l.de,
  ate: l.ate,
  status: (l.status === "resolvida" || l.status === "expirada" ? l.status : "ativa"),
  origem: l.origem,
  criadoPorNome: l.criado_por_nome,
  criadoEm: l.criado_em,
  resolvidoEm: l.resolvido_em,
  resolvidoPorNome: l.resolvido_por_nome,
  resolucao: l.resolucao,
});

export async function categoriasDaRevenda(
  revendaId: string,
  { incluirInativas = false } = {},
): Promise<CategoriaCompleta[]> {
  const admin = createAdminClient();
  let consulta = admin
    .from("pa_pdv_categorias")
    .select(
      "id, nome, emoji, ajuda, severidade, exige_prazo, exige_horario, alerta_na_rota, ordem, ativo",
    )
    .eq("revenda_id", revendaId)
    .order("ordem");
  if (!incluirInativas) consulta = consulta.eq("ativo", true);

  const { data, error } = await consulta;
  // Erro não vira lista vazia: sem categoria a tela diria "cadastre a
  // primeira" para quem já tem onze.
  if (error) throw new Error(`Não foi possível ler as categorias: ${error.message}`);
  return ((data ?? []) as LinhaCategoria[]).map(paraCategoria);
}

export async function particularidadesDaRevenda(
  revendaId: string,
  { status }: { status?: string } = {},
): Promise<ParticularidadeCompleta[]> {
  const admin = createAdminClient();
  let consulta = admin
    .from("pa_pdv_particularidades")
    .select(
      "id, categoria_id, cod_pdv, nome_pdv, cidade, bairro, aviso, detalhe, hora_de, hora_ate, dias_semana, de, ate, status, origem, criado_por_nome, criado_em, resolvido_em, resolvido_por_nome, resolucao",
    )
    .eq("revenda_id", revendaId)
    .order("criado_em", { ascending: false });
  if (status) consulta = consulta.eq("status", status);

  const { data, error } = await consulta;
  if (error) throw new Error(`Não foi possível ler as particularidades: ${error.message}`);
  return ((data ?? []) as LinhaParticularidade[]).map(paraParticularidade);
}

/** As particularidades de UM cliente -- o histórico inteiro, resolvido
 *  incluído: "já ficou bloqueado antes?" é a pergunta que se faz. */
export async function particularidadesDoPdv(
  revendaId: string,
  codPdv: string,
): Promise<ParticularidadeCompleta[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pa_pdv_particularidades")
    .select(
      "id, categoria_id, cod_pdv, nome_pdv, cidade, bairro, aviso, detalhe, hora_de, hora_ate, dias_semana, de, ate, status, origem, criado_por_nome, criado_em, resolvido_em, resolvido_por_nome, resolucao",
    )
    .eq("revenda_id", revendaId)
    .eq("cod_pdv", normalizarCodPdv(codPdv))
    .order("criado_em", { ascending: false });
  if (error) throw new Error(`Não foi possível ler o cliente: ${error.message}`);
  return ((data ?? []) as LinhaParticularidade[]).map(paraParticularidade);
}

/**
 * OS CLIENTES QUE O RATING SUGERE, menos os que já foram tratados.
 *
 * A sugestão some assim que alguém cadastra ou dispensa -- senão a lista
 * cobraria para sempre o que já foi decidido, e uma lista que não
 * diminui é uma lista que se para de abrir.
 */
export async function sugestoesPendentes(revendaId: string): Promise<SugestaoDetrator[]> {
  const admin = createAdminClient();

  const [{ data: avaliacoes, error }, { data: jaTem }] = await Promise.all([
    admin
      .from("rating_avaliacoes")
      .select("cod_pdv, nome_pdv, cidade, nota, classificacao, motivo")
      .eq("revenda_id", revendaId)
      .eq("classificacao", "detrator"),
    admin
      .from("pa_pdv_particularidades")
      .select("cod_pdv, origem")
      .eq("revenda_id", revendaId)
      .eq("origem", "rating"),
  ]);
  if (error) throw new Error(`Não foi possível ler as avaliações: ${error.message}`);

  // A média precisa das notas BOAS também -- "8 detratoras de 92" é uma
  // história muito diferente de "8 de 8", e é a média que separa as duas.
  const codigos = [...new Set((avaliacoes ?? []).map((a) => a.cod_pdv).filter(Boolean))];
  if (codigos.length === 0) return [];

  const { data: todasDosPdvs } = await admin
    .from("rating_avaliacoes")
    .select("cod_pdv, nome_pdv, cidade, nota, classificacao, motivo")
    .eq("revenda_id", revendaId)
    .in("cod_pdv", codigos);

  const linhas: AvaliacaoDoPdv[] = (todasDosPdvs ?? []).map((a) => ({
    codPdv: a.cod_pdv,
    nomePdv: a.nome_pdv,
    cidade: a.cidade,
    nota: a.nota,
    classificacao: a.classificacao,
    motivo: a.motivo,
  }));

  const tratados = new Set((jaTem ?? []).map((p) => normalizarCodPdv(p.cod_pdv)));
  return sugestoesDeDetrator(linhas).filter((s) => !tratados.has(s.codPdv));
}
