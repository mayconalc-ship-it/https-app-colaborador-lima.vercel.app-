/**
 * MATERIAL DE APOIO DO ARMAZÉM -- as regras, num lugar só (16/09/2026).
 *
 * Pedido do dono: filme stretch, filme contrátil, fitilho e outros, com a
 * linear de uso, a contagem, os dias de estoque que ela dá e as políticas
 * mínima, objetiva e máxima -- e um alerta para quem compra quando o
 * estoque chega perto da mínima.
 *
 * Separado do servidor de propósito: o formulário de contagem mostra os
 * dias enquanto a pessoa digita, a tela de cadastro valida o produto, e a
 * ação do servidor confere com as MESMAS funções.
 */

export const MODULO_MATERIAL_APOIO = "material-apoio" as const;

export const UNIDADES = [
  { id: "un", rotulo: "Unidade", curto: "un" },
  { id: "m", rotulo: "Metro", curto: "m" },
  { id: "kg", rotulo: "Quilo", curto: "kg" },
] as const;

export type UnidadeId = (typeof UNIDADES)[number]["id"];

export function ehUnidade(v: string): v is UnidadeId {
  return UNIDADES.some((u) => u.id === v);
}

export function curtoDaUnidade(u: string) {
  return UNIDADES.find((x) => x.id === u)?.curto ?? u;
}

/** Semana = 7 dias e mês = 30: a conta que qualquer um refaz de cabeça. */
export const PERIODOS = [
  { id: "dia", rotulo: "por dia", dias: 1 },
  { id: "semana", rotulo: "por semana", dias: 7 },
  { id: "mes", rotulo: "por mês", dias: 30 },
] as const;

export type PeriodoId = (typeof PERIODOS)[number]["id"];

export function ehPeriodo(v: string): v is PeriodoId {
  return PERIODOS.some((p) => p.id === v);
}

/** O consumo por DIA, qualquer que seja o período em que a linear foi informada. */
export function consumoDiario(quantidade: number, periodo: string) {
  const p = PERIODOS.find((x) => x.id === periodo);
  return p ? quantidade / p.dias : quantidade;
}

/** Os mesmos limites da migration 121. */
export const LIMITES = {
  nomeMin: 2,
  nomeMax: 80,
  diasMax: 3650,
  antecedenciaMax: 365,
  quantidadeMax: 100_000_000,
  observacaoMax: 300,
} as const;

/** Número vindo do formulário. Vazio = null; lixo = NaN. Aceita vírgula. */
export function lerNumero(v: unknown): number | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  return Number(t.replace(",", "."));
}

export type DadosProduto = {
  nome: string;
  unidade: string;
  linear_quantidade: number | null;
  linear_periodo: string;
  politica_minima_dias: number | null;
  politica_objetivo_dias: number | null;
  politica_maxima_dias: number | null;
  antecedencia_alerta_dias: number | null;
};

export function lerProduto(fd: FormData): DadosProduto {
  return {
    nome: String(fd.get("nome") ?? "").trim(),
    unidade: String(fd.get("unidade") ?? ""),
    linear_quantidade: lerNumero(fd.get("linear_quantidade")),
    linear_periodo: String(fd.get("linear_periodo") ?? ""),
    politica_minima_dias: lerNumero(fd.get("politica_minima_dias")),
    politica_objetivo_dias: lerNumero(fd.get("politica_objetivo_dias")),
    politica_maxima_dias: lerNumero(fd.get("politica_maxima_dias")),
    antecedencia_alerta_dias: lerNumero(fd.get("antecedencia_alerta_dias")),
  };
}

/** O primeiro problema do cadastro, ou null quando está tudo certo. */
export function validarProduto(d: DadosProduto): string | null {
  const nome = d.nome.trim();
  if (nome.length < LIMITES.nomeMin) return "Dê um nome ao produto.";
  if (nome.length > LIMITES.nomeMax) return `O nome passa de ${LIMITES.nomeMax} caracteres.`;
  if (!ehUnidade(d.unidade)) return "Escolha a unidade: unidade, metro ou quilo.";
  if (d.linear_quantidade == null || !Number.isFinite(d.linear_quantidade) || d.linear_quantidade <= 0) {
    return "Informe a linear de uso — quanto se gasta —, maior que zero.";
  }
  if (!ehPeriodo(d.linear_periodo)) return "Escolha o período da linear: por dia, por semana ou por mês.";

  const politicas: [string, number | null][] = [
    ["mínima", d.politica_minima_dias],
    ["objetiva", d.politica_objetivo_dias],
    ["máxima", d.politica_maxima_dias],
  ];
  for (const [qual, v] of politicas) {
    if (v == null || !Number.isInteger(v) || v < 0 || v > LIMITES.diasMax) {
      return `Informe a política ${qual} em dias inteiros (0 a ${LIMITES.diasMax}).`;
    }
  }
  if (d.politica_minima_dias! > d.politica_objetivo_dias!) {
    return "A política mínima não pode ser maior que a objetiva.";
  }
  if (d.politica_objetivo_dias! > d.politica_maxima_dias!) {
    return "A política objetiva não pode ser maior que a máxima.";
  }
  const a = d.antecedencia_alerta_dias;
  if (a == null || !Number.isInteger(a) || a < 0 || a > LIMITES.antecedenciaMax) {
    return `Informe com quantos dias de antecedência avisar (0 a ${LIMITES.antecedenciaMax}).`;
  }
  return null;
}

/** A quantidade contada de UM produto. Vazio (null) = não contado neste envio. */
export function validarQuantidade(v: number | null): string | null {
  if (v == null) return null;
  if (!Number.isFinite(v)) return "Quantidade inválida.";
  if (v < 0) return "A quantidade contada não pode ser negativa.";
  if (v > LIMITES.quantidadeMax) return "Quantidade grande demais — confira a unidade.";
  return null;
}

// ------------------------------------------------------------------
// Datas, no fuso da operação
// ------------------------------------------------------------------

const DIA_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Hoje em "AAAA-MM-DD" no fuso da operação -- a Vercel roda em UTC. */
export function hojeSP(quando: Date = new Date()) {
  return DIA_SP.format(quando);
}

/** O DIA de um instante, no fuso da operação. */
export function diaSP(iso: string) {
  return DIA_SP.format(new Date(iso));
}

export function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

// ------------------------------------------------------------------
// A situação do estoque
// ------------------------------------------------------------------

export type ProdutoParaSituacao = {
  unidade: string;
  linear_quantidade: number;
  linear_periodo: string;
  politica_minima_dias: number;
  politica_objetivo_dias: number;
  politica_maxima_dias: number;
  antecedencia_alerta_dias: number;
};

export type Faixa =
  | "sem-contagem"
  | "abaixo-minima"
  | "perto-minima"
  | "abaixo-objetivo"
  | "ok"
  | "acima-maxima";

export const FAIXAS: Record<Faixa, { rotulo: string; tom: "critico" | "alerta" | "atencao" | "ok" | "excesso" | "neutro" }> = {
  "sem-contagem": { rotulo: "Sem contagem", tom: "neutro" },
  "abaixo-minima": { rotulo: "🚨 Abaixo da mínima", tom: "critico" },
  "perto-minima": { rotulo: "⚠️ Perto da mínima", tom: "alerta" },
  "abaixo-objetivo": { rotulo: "Abaixo da objetiva", tom: "atencao" },
  ok: { rotulo: "✅ Dentro da política", tom: "ok" },
  "acima-maxima": { rotulo: "Acima da máxima", tom: "excesso" },
};

/** As faixas que disparam o alerta de compra -- a mais grave primeiro. */
export const FAIXAS_DE_ALERTA: Faixa[] = ["abaixo-minima", "perto-minima"];

export function faixaDosDias(p: ProdutoParaSituacao, dias: number): Faixa {
  if (dias < p.politica_minima_dias) return "abaixo-minima";
  if (dias <= p.politica_minima_dias + p.antecedencia_alerta_dias) return "perto-minima";
  if (dias < p.politica_objetivo_dias) return "abaixo-objetivo";
  if (dias > p.politica_maxima_dias) return "acima-maxima";
  return "ok";
}

/**
 * O estoque de HOJE, a partir da última contagem.
 *
 * O material não para de ser usado entre uma contagem e outra: cada dia
 * que passou desconta a linear. Sem isso, o "dias de estoque" ficaria
 * congelado no número da contagem, e o alerta de compra só sairia quando
 * alguém contasse de novo -- que costuma ser justamente tarde demais.
 *
 * A linear usada é a de hoje, do cadastro: se a liderança corrigiu a
 * linear, a estimativa já sai pela correção.
 */
export function situacaoDoEstoque(
  p: ProdutoParaSituacao,
  ultima: { quantidade: number; contado_em: string } | null,
  hoje = hojeSP(),
) {
  const consumo = consumoDiario(Number(p.linear_quantidade), p.linear_periodo);
  if (!ultima) {
    return {
      faixa: "sem-contagem" as Faixa,
      consumo,
      estoque: null,
      dias: null,
      diasDesdeContagem: null,
      comprarParaObjetivo: null,
      comprarAteMaxima: null,
    };
  }
  const decorridos = Math.max(0, diasEntre(diaSP(ultima.contado_em), hoje));
  const estoque = Math.max(0, Number(ultima.quantidade) - consumo * decorridos);
  const dias = estoque / consumo;
  return {
    faixa: faixaDosDias(p, dias),
    consumo,
    estoque,
    dias,
    diasDesdeContagem: decorridos,
    comprarParaObjetivo: Math.max(0, p.politica_objetivo_dias * consumo - estoque),
    comprarAteMaxima: Math.max(0, p.politica_maxima_dias * consumo - estoque),
  };
}

// ------------------------------------------------------------------
// Formatação
// ------------------------------------------------------------------

export function formatarQuantidade(v: number, unidade: string) {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${curtoDaUnidade(unidade)}`;
}

export function formatarDias(d: number) {
  return d.toLocaleString("pt-BR", { minimumFractionDigits: d < 10 ? 1 : 0, maximumFractionDigits: 1 });
}

export function formatarLinear(p: { linear_quantidade: number; linear_periodo: string; unidade: string }) {
  const periodo = PERIODOS.find((x) => x.id === p.linear_periodo)?.rotulo ?? "";
  return `${formatarQuantidade(Number(p.linear_quantidade), p.unidade)} ${periodo}`;
}
