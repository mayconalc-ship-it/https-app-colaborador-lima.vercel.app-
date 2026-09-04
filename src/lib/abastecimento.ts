/**
 * ABASTECIMENTO E RESSUPRIMENTO DO PICKING
 *
 * Substitui o antigo "Reabastecimento de Picking", que media POSIÇÕES
 * reabastecidas -- campo que ficou vazio em 100% das sessões lançadas.
 * A operação não consegue contar posição no meio do corredor; consegue
 * dizer qual produto levou e quantas caixas ou paletes. O HL sai do
 * cadastro, sem ninguém ter que calcular nada.
 *
 * Aqui só a matemática pura, sem banco e sem React -- é o que permite
 * conferir os números sem subir a tela.
 */

export const COOKIE_ABASTECIMENTO_PATH = "/produtividade-armazem/abastecimento";

// -------------------- TIPO DA SESSÃO --------------------

export const TIPOS_ABASTECIMENTO = ["completo", "pontual"] as const;
export type TipoAbastecimento = (typeof TIPOS_ABASTECIMENTO)[number];

/**
 * A hora em que o abastecimento completo tem de estar fechado.
 *
 * Não é trava: é o combinado da operação, e serve para SUGERIR o tipo
 * certo (antes das 10h, completo; depois, pontual) e para avisar quando a
 * escolha destoa do horário. Bloquear obrigaria a inventar exceção para o
 * primeiro dia atípico -- e sempre existe um.
 */
export const HORA_LIMITE_COMPLETO = 10;

export const TIPO_ABASTECIMENTO: Record<
  TipoAbastecimento,
  { rotulo: string; curto: string; emoji: string; descricao: string }
> = {
  completo: {
    rotulo: "Abastecimento completo",
    curto: "Completo",
    emoji: "🔄",
    descricao:
      "A varredura da manhã: repor tudo o que está abaixo do nível, área por área, até as 10h. É o abastecimento que prepara o dia.",
  },
  pontual: {
    rotulo: "Reabastecimento pontual",
    curto: "Pontual",
    emoji: "⚡",
    descricao:
      "O esporádico: um SKU que zerou ou está para zerar no meio da separação, depois que o completo já foi feito.",
  },
};

/**
 * O tipo que o horário sugere.
 *
 * Sugerir, e não decidir, é o ponto: quem abre a tela às 8h quase sempre
 * está no completo, e quem abre às 15h quase sempre não está. Deixar o
 * padrão sempre em "completo" fazia a tarde inteira ser lançada com o
 * tipo errado -- e um tipo errado não dá erro, só suja o indicador
 * meses depois.
 */
export function tipoSugerido(agora = new Date()): TipoAbastecimento {
  // Hora da OPERAÇÃO (UTC-3), não a do servidor: a Vercel roda em UTC, e
  // lá as 8h do armazém são 11h -- o padrão viria "pontual" a manhã toda.
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(agora),
  );
  return hora < HORA_LIMITE_COMPLETO ? "completo" : "pontual";
}

/** O aviso de quando a escolha destoa do horário. `null` quando combina. */
export function avisoDoTipo(
  tipo: TipoAbastecimento,
  agora = new Date(),
): string | null {
  const sugerido = tipoSugerido(agora);
  if (tipo === sugerido) return null;
  return tipo === "completo"
    ? `Já passou das ${HORA_LIMITE_COMPLETO}h. O completo é a varredura da manhã — se é uma reposição avulsa, marque Pontual.`
    : `Ainda não deu ${HORA_LIMITE_COMPLETO}h. Se esta é a varredura da manhã, marque Completo.`;
}

export function ehTipoAbastecimento(v: unknown): v is TipoAbastecimento {
  return typeof v === "string" && (TIPOS_ABASTECIMENTO as readonly string[]).includes(v);
}

// -------------------- UNIDADE DO ITEM --------------------

/*
  AS UNIDADES SAÍRAM DAQUI e viraram peça única.

  Eram `["caixa", "palete"]`. Passaram a ser as quatro que o armazém usa
  -- palete, lastro, caixa e unidade (pedido do dono, 04/09/2026) -- e a
  lista mora em lib/unidades-produto.ts, junto da conversão, porque o
  FEFO precisa exatamente das mesmas. Duas listas em dois módulos é como
  elas divergem, e divergir aqui não daria erro: daria HL diferente para
  a mesma caixa, em telas diferentes.

  Os nomes antigos continuam exportados como apelido para não obrigar a
  reescrever cada tela num commit só -- e porque "unidade de
  abastecimento" é como as telas deste módulo já falam.
*/
export {
  UNIDADES_PRODUTO as UNIDADES_ABASTECIMENTO,
  ROTULO_UNIDADE_PRODUTO as ROTULO_UNIDADE_ABASTECIMENTO,
  ROTULO_UNIDADE_PRODUTO_CURTO as ROTULO_UNIDADE_ABASTECIMENTO_CURTO,
  ehUnidadeProduto as ehUnidadeAbastecimento,
  calcularHl,
  calcularPaletes,
  faltaNoCadastro,
  unidadesDisponiveis,
  type UnidadeProduto as UnidadeAbastecimento,
  type FatoresDoProduto,
} from "@/lib/unidades-produto";

// `export ... from` reexporta sem trazer o nome para ESTE escopo -- e os
// tipos abaixo usam UnidadeAbastecimento aqui dentro.
import type { UnidadeProduto as UnidadeAbastecimento } from "@/lib/unidades-produto";

// -------------------- RESUMO DA SESSÃO --------------------

export type ItemAbastecimento = {
  id: string;
  produtoId: string;
  unidade: UnidadeAbastecimento;
  quantidade: number;
  hl: number;
  /** Paletes equivalentes, gravado junto do HL pelo mesmo motivo. */
  paletes: number;
};

export type ResumoAbastecimento = {
  minutos: number;
  /** `null` enquanto a sessão está aberta -- ainda não há tempo fechado. */
  hl: number;
  paletes: number;
  itens: number;
  /** HL por hora. `null` sem tempo medido (sessão aberta, ou fim = início). */
  hlPorHora: number | null;
  /** Minutos por HL -- o inverso, que é como a operação costuma falar
   *  ("levei X minutos por HL"). `null` sem HL nenhum. */
  minutosPorHl: number | null;
};

/**
 * Consolida uma sessão. Calculado na LEITURA, não gravado: são números
 * derivados do tempo e dos itens, e um total gravado que discorda dos
 * itens é pior do que nenhum total (mesma escolha do resto do painel do
 * armazém). O HL de cada item, esse sim, fica gravado -- ver a migration.
 */
export function resumirAbastecimento(
  inicioISO: string,
  fimISO: string | null,
  itens: { hl: number; paletes: number }[],
): ResumoAbastecimento {
  const fim = fimISO ? new Date(fimISO).getTime() : Date.now();
  const minutos = Math.max((fim - new Date(inicioISO).getTime()) / 60_000, 0);

  const hl = Math.round(itens.reduce((s, i) => s + i.hl, 0) * 1000) / 1000;
  const paletes = Math.round(itens.reduce((s, i) => s + i.paletes, 0) * 100) / 100;

  const horas = minutos / 60;
  return {
    minutos: Math.round(minutos * 10) / 10,
    hl,
    paletes,
    itens: itens.length,
    hlPorHora: horas > 0 && hl > 0 ? Math.round((hl / horas) * 100) / 100 : null,
    minutosPorHl: hl > 0 ? Math.round((minutos / hl) * 100) / 100 : null,
  };
}

// -------------------- RANKING DE SKU --------------------

export type LinhaRankingSku = {
  produtoId: string;
  hl: number;
  paletes: number;
  /** Quantas sessões diferentes tocaram neste SKU -- um SKU que aparece
   *  em toda sessão é candidato a mudar de endereço no picking, mesmo
   *  que o HL dele não seja o maior. */
  sessoes: number;
};

/** Soma HL por produto, do maior para o menor. */
export function rankingDeSku(
  itens: { produtoId: string; abastecimentoId: string; hl: number; paletes: number }[],
): LinhaRankingSku[] {
  const mapa = new Map<string, { hl: number; paletes: number; sessoes: Set<string> }>();

  for (const i of itens) {
    const atual = mapa.get(i.produtoId) ?? { hl: 0, paletes: 0, sessoes: new Set<string>() };
    atual.hl += i.hl;
    atual.paletes += i.paletes;
    atual.sessoes.add(i.abastecimentoId);
    mapa.set(i.produtoId, atual);
  }

  return [...mapa]
    .map(([produtoId, v]) => ({
      produtoId,
      hl: Math.round(v.hl * 1000) / 1000,
      paletes: Math.round(v.paletes * 100) / 100,
      sessoes: v.sessoes.size,
    }))
    .sort((a, b) => b.hl - a.hl);
}

// -------------------- MÉDIA POR DIA --------------------

/**
 * Média de HL por DIA com movimento -- dias parados não entram no
 * divisor. Um período de 30 dias em que só se abasteceu em 8 tem média
 * dos 8, senão a média cairia por conta de domingo e feriado.
 */
export function mediaHlPorDia(sessoes: { dia: string; hl: number }[]): number | null {
  const porDia = new Map<string, number>();
  for (const s of sessoes) porDia.set(s.dia, (porDia.get(s.dia) ?? 0) + s.hl);
  if (porDia.size === 0) return null;
  const total = [...porDia.values()].reduce((s, v) => s + v, 0);
  return Math.round((total / porDia.size) * 100) / 100;
}

/** Formata HL para tela: sem casas quando é redondo, senão uma casa. */
export function formatarHl(hl: number): string {
  return hl.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

/** "1 h 20 min" a partir de minutos -- a duração da sessão em texto. */
export function formatarMinutos(minutos: number): string {
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
