/**
 * WQI -- baixa de quebra de PA (produto acabado) por manuseio, dentro do
 * armazém (migration 139).
 *
 * Nasceu da planilha "Baixas WQI" (AppSheet), e o vocabulário é o dela:
 * produto, quantidade, motivo, local, turno e quem manuseava. O que o
 * módulo faz é UMA coisa -- registrar a baixa e mostrar onde a quebra
 * acontece. Não baixa estoque no sistema e não substitui a nota.
 *
 * As contas aqui são puras (sem banco): o painel de Gestão e o CSV usam
 * as mesmas, para a tela e a planilha nunca discordarem.
 */

import { ROTULO_TURNO_CURTO, type Turno } from "@/lib/produtividade-armazem";

export {
  UNIDADES_PRODUTO as UNIDADES_WQI,
  ROTULO_UNIDADE_PRODUTO as ROTULO_UNIDADE_WQI,
  ROTULO_UNIDADE_PRODUTO_CURTO as ROTULO_UNIDADE_WQI_CURTO,
  ehUnidadeProduto as ehUnidadeWqi,
} from "@/lib/unidades-produto";

export type ItemCatalogoWqi = { id: string; nome: string; ajuda?: string | null; ativo?: boolean };

export type BaixaWqi = {
  id: string;
  data_ocorrido: string;
  turno: Turno;
  produto_codigo: string;
  produto_descricao: string;
  quantidade: number;
  unidade: string;
  unidades_equivalentes: number | null;
  hl_calculado: number | null;
  motivo: string;
  local: string;
  nota_fiscal: string | null;
  responsavel_nome: string | null;
  responsavel_funcao: string | null;
  foto_url: string | null;
  observacao: string | null;
  colaborador_nome: string;
  origem: "app" | "planilha";
  criado_em: string;
};

export const COLUNAS_BAIXA_WQI =
  "id, data_ocorrido, turno, produto_codigo, produto_descricao, quantidade, unidade, unidades_equivalentes, hl_calculado, motivo, local, nota_fiscal, responsavel_nome, responsavel_funcao, foto_url, observacao, colaborador_nome, origem, criado_em";

/**
 * Unidades equivalentes: a régua da planilha, que conta quebra em
 * garrafa/lata. Caixa, lastro e palete viram unidade pelo cadastro.
 * `null` quando falta o fator -- a baixa entra assim mesmo e fica fora
 * da soma, em vez de valer zero sem ninguém ver.
 */
export function unidadesEquivalentes(
  quantidade: number,
  unidade: string,
  produto: { caixasPallet: number | null; caixasPorLastro: number | null; unidadesPorCaixa: number | null },
): number | null {
  if (unidade === "unidade") return quantidade;
  const upc = produto.unidadesPorCaixa;
  if (!upc || upc <= 0) return null;
  if (unidade === "caixa") return quantidade * upc;
  if (unidade === "lastro") return produto.caixasPorLastro ? quantidade * produto.caixasPorLastro * upc : null;
  if (unidade === "palete") return produto.caixasPallet ? quantidade * produto.caixasPallet * upc : null;
  return null;
}

export type Agrupado = { chave: string; unidades: number; hl: number; lancamentos: number };

/** Soma por uma dimensão, do maior para o menor em unidades. */
export function agruparWqi(baixas: BaixaWqi[], chave: (b: BaixaWqi) => string): Agrupado[] {
  const mapa = new Map<string, Agrupado>();
  for (const b of baixas) {
    const k = chave(b) || "Não informado";
    const a = mapa.get(k) ?? { chave: k, unidades: 0, hl: 0, lancamentos: 0 };
    a.unidades += b.unidades_equivalentes ?? 0;
    a.hl += b.hl_calculado ?? 0;
    a.lancamentos += 1;
    mapa.set(k, a);
  }
  return [...mapa.values()].sort((x, y) => y.unidades - x.unidades || y.lancamentos - x.lancamentos);
}

/**
 * "NÃO TEM COLABORADOR", DITO DE PROPÓSITO (06/10/2026, pedido do dono).
 *
 * O colaborador virou obrigatório no lançamento. Quando não há quem
 * manuseava (ou ninguém foi identificado), quem lança marca isso no
 * próprio campo -- e a baixa grava este texto em `responsavel_nome`, sem
 * `responsavel_id`. Assim "informou que não tinha" se separa do vazio do
 * histórico da planilha, e nenhum dos dois conta como pessoa no ranking.
 */
export const SEM_COLABORADOR_WQI = "Sem colaborador";

/** Tem uma PESSOA de verdade como responsável? */
export function temPessoaResponsavel(b: Pick<BaixaWqi, "responsavel_nome">) {
  return Boolean(b.responsavel_nome) && b.responsavel_nome !== SEM_COLABORADOR_WQI;
}

export function totaisWqi(baixas: BaixaWqi[]) {
  let unidades = 0;
  let hl = 0;
  let semConversao = 0;
  let comResponsavel = 0;
  let semColaborador = 0;
  for (const b of baixas) {
    if (b.unidades_equivalentes === null) semConversao += 1;
    unidades += b.unidades_equivalentes ?? 0;
    hl += b.hl_calculado ?? 0;
    if (temPessoaResponsavel(b)) comResponsavel += 1;
    else if (b.responsavel_nome === SEM_COLABORADOR_WQI) semColaborador += 1;
  }
  return { lancamentos: baixas.length, unidades, hl, semConversao, comResponsavel, semColaborador };
}

export const ROTULO_TURNO_WQI = ROTULO_TURNO_CURTO;

/** "2026-09" -> "set/26" */
export function rotuloMes(anoMes: string): string {
  const [a, m] = anoMes.split("-").map(Number);
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[m - 1]}/${String(a).slice(2)}`;
}

/** "2026-09-26" -> "26/09/2026", sem passar por Date (fuso não entra). */
export function dataBR(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
