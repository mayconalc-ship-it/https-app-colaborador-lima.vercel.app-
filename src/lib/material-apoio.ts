/**
 * MATERIAL DE APOIO DO ARMAZÉM -- as regras, num lugar só (16/09/2026).
 *
 * Pedido do dono: filme stretch, filme contrátil, fitilho e outros, com a
 * linear de uso, a contagem, os dias de estoque que ela dá e as políticas
 * mínima, objetiva e máxima -- e um alerta para quem compra quando o
 * estoque chega perto da mínima. No mesmo dia: o VALOR de cada material,
 * para saber o custo por dia e por mês, e a MÉDIA REAL de saída calculada
 * das contagens -- hoje ninguém gerencia nem uma nem outra.
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

/** Os mesmos limites das migrations 121 e 122. */
export const LIMITES = {
  nomeMin: 2,
  nomeMax: 80,
  diasMax: 3650,
  antecedenciaMax: 365,
  quantidadeMax: 100_000_000,
  observacaoMax: 300,
  valorMax: 1_000_000,
} as const;

/** A média real olha estes últimos dias de contagens... */
export const JANELA_DA_MEDIA_DIAS = 90;
/** ...e só passa a valer com pelo menos estes dias de histórico entre elas. */
export const MINIMO_DIAS_DA_MEDIA = 7;

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
  valor_unitario: number | null;
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
    valor_unitario: lerNumero(fd.get("valor_unitario")),
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
  const v = d.valor_unitario;
  if (v != null && (!Number.isFinite(v) || v < 0 || v > LIMITES.valorMax)) {
    return "Informe o valor em reais, de 0 a 1.000.000 — ou deixe em branco.";
  }
  return null;
}

/** A quantidade contada (ou a entrada) de UM produto. Vazio (null) = não informado. */
export function validarQuantidade(v: number | null): string | null {
  if (v == null) return null;
  if (!Number.isFinite(v)) return "Quantidade inválida.";
  if (v < 0) return "A quantidade não pode ser negativa.";
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

// ------------------------------------------------------------------
// Lembrete diário da contagem (16/09/2026)
// ------------------------------------------------------------------

/** As horas que se podem escolher -- as mesmas do check da migration 125. */
export const HORA_LEMBRETE_MIN = 5;
export const HORA_LEMBRETE_MAX = 22;
export const HORA_LEMBRETE_PADRAO = 14;

export const HORAS_DO_LEMBRETE = Array.from(
  { length: HORA_LEMBRETE_MAX - HORA_LEMBRETE_MIN + 1 },
  (_, i) => HORA_LEMBRETE_MIN + i,
);

/** Hora vinda do formulário: um inteiro dentro da faixa, ou a mensagem do problema. */
export function validarHoraDoLembrete(v: unknown): { hora: number } | { erro: string } {
  const hora = Number(String(v ?? "").trim());
  if (!Number.isInteger(hora) || hora < HORA_LEMBRETE_MIN || hora > HORA_LEMBRETE_MAX) {
    return { erro: `Escolha um horário entre ${HORA_LEMBRETE_MIN}h e ${HORA_LEMBRETE_MAX}h.` };
  }
  return { hora };
}

const HORA_SP = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false });

/** A hora cheia agora, no fuso da operação. */
export function horaSP(quando: Date = new Date()) {
  return Number(HORA_SP.format(quando)) % 24;
}

/** O começo do dia de hoje (fuso da operação) em ISO -- o corte de "já contou hoje?". */
export function inicioDoDiaSP(quando: Date = new Date()) {
  return `${hojeSP(quando)}T00:00:00-03:00`;
}

/** A chave do lembrete: um por revenda por dia. */
export function chaveDoLembreteDeContagem(revendaId: string, dia: string) {
  return `material-apoio-contagem:${revendaId}:${dia}`;
}

/** É hora de lembrar? Ligado, passou da hora e ninguém contou hoje. */
export function deveLembrarContagem(p: { ativo: boolean; hora: number; horaAgora: number; contouHoje: boolean }) {
  return p.ativo && p.horaAgora >= p.hora && !p.contouHoje;
}

export function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

// ------------------------------------------------------------------
// A média real de saída
// ------------------------------------------------------------------

export type ContagemDoHistorico = { quantidade: number; entrada: number; contado_em: string };

/**
 * A SAÍDA REAL, TIRADA DAS CONTAGENS (16/09/2026, pedido do dono: "ter
 * realmente a média necessária utilizada na operação").
 *
 * Entre duas contagens seguidas, o que saiu é
 *
 *     o que havia antes + o que entrou - o que há agora.
 *
 * Soma-se a saída dos intervalos dos últimos JANELA_DA_MEDIA_DIAS dias e
 * divide-se pelos dias desses intervalos. A média só vale com pelo menos
 * MINIMO_DIAS_DA_MEDIA dias somados: duas contagens no mesmo dia dizem
 * pouco sobre o consumo da operação.
 *
 * Intervalo em que o estoque SUBIU sem entrada informada fica de fora
 * (ignorados): alguém repôs e não disse quanto, e a conta daria consumo
 * negativo -- entrar com ele puxaria a média para baixo sem motivo real.
 *
 * `contagens` em ordem cronológica, as mais antigas primeiro.
 */
export function mediaDeSaida(contagens: ContagemDoHistorico[], hoje = hojeSP()) {
  let saida = 0;
  let dias = 0;
  let intervalos = 0;
  let ignorados = 0;
  for (let i = 1; i < contagens.length; i++) {
    const antes = contagens[i - 1];
    const agora = contagens[i];
    if (diasEntre(diaSP(agora.contado_em), hoje) > JANELA_DA_MEDIA_DIAS) continue;
    const saiu = Number(antes.quantidade) + Number(agora.entrada || 0) - Number(agora.quantidade);
    if (saiu < -1e-9) {
      ignorados++;
      continue;
    }
    saida += Math.max(0, saiu);
    dias += Math.max(0, diasEntre(diaSP(antes.contado_em), diaSP(agora.contado_em)));
    intervalos++;
  }
  const mediaDiaria = dias >= MINIMO_DIAS_DA_MEDIA && saida > 0 ? saida / dias : null;
  return { mediaDiaria, saida, dias, intervalos, ignorados };
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
  /** R$ por unidade de medida. Nulo = sem valor cadastrado. */
  valor_unitario?: number | null;
  /** A média real de saída por dia (mediaDeSaida), quando já existe. */
  media_real_diaria?: number | null;
};

/**
 * O consumo por dia que as contas usam: a média REAL, quando já há
 * histórico para ela; senão, a linear cadastrada. A linear é o palpite de
 * quem cadastrou -- a média é o que a operação de fato gastou.
 */
export function consumoDoProduto(p: ProdutoParaSituacao) {
  if (p.media_real_diaria != null && p.media_real_diaria > 0) {
    return { consumo: p.media_real_diaria, fonte: "real" as const };
  }
  return { consumo: consumoDiario(Number(p.linear_quantidade), p.linear_periodo), fonte: "linear" as const };
}

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
 * que passou desconta o consumo. Sem isso, o "dias de estoque" ficaria
 * congelado no número da contagem, e o alerta de compra só sairia quando
 * alguém contasse de novo -- que costuma ser justamente tarde demais.
 *
 * O custo sai do mesmo consumo: por dia, por mês (30 dias) e o da compra
 * sugerida, arredondada para cima como a quantidade que se pede.
 */
export function situacaoDoEstoque(
  p: ProdutoParaSituacao,
  ultima: { quantidade: number; contado_em: string } | null,
  hoje = hojeSP(),
) {
  const { consumo, fonte } = consumoDoProduto(p);
  const valor = p.valor_unitario != null && Number.isFinite(Number(p.valor_unitario)) ? Number(p.valor_unitario) : null;
  const custoDiario = valor != null ? consumo * valor : null;
  const custoMensal = custoDiario != null ? custoDiario * 30 : null;

  if (!ultima) {
    return {
      faixa: "sem-contagem" as Faixa,
      consumo,
      fonteDoConsumo: fonte,
      custoDiario,
      custoMensal,
      estoque: null,
      dias: null,
      diasDesdeContagem: null,
      comprarParaObjetivo: null,
      comprarAteMaxima: null,
      valorDaCompraObjetivo: null,
      valorDoEstoque: null,
    };
  }
  const decorridos = Math.max(0, diasEntre(diaSP(ultima.contado_em), hoje));
  const estoque = Math.max(0, Number(ultima.quantidade) - consumo * decorridos);
  const dias = estoque / consumo;
  const comprarParaObjetivo = Math.max(0, p.politica_objetivo_dias * consumo - estoque);
  return {
    faixa: faixaDosDias(p, dias),
    consumo,
    fonteDoConsumo: fonte,
    custoDiario,
    custoMensal,
    estoque,
    dias,
    diasDesdeContagem: decorridos,
    comprarParaObjetivo,
    comprarAteMaxima: Math.max(0, p.politica_maxima_dias * consumo - estoque),
    valorDaCompraObjetivo: valor != null ? arredondarCompra(comprarParaObjetivo) * valor : null,
    valorDoEstoque: valor != null ? estoque * valor : null,
  };
}

// ------------------------------------------------------------------
// Formatação
// ------------------------------------------------------------------

export function formatarQuantidade(v: number, unidade: string) {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${curtoDaUnidade(unidade)}`;
}

/**
 * Número de LEITURA -- estimativa, consumo por dia, estoque de cada
 * política. "≈ 5,71 kg" é precisão que ninguém usa e que atrapalha ler;
 * de 10 para cima vai inteiro, abaixo disso uma casa.
 */
export function formatarAproximado(v: number, unidade: string) {
  const casas = Math.abs(v) >= 10 ? 0 : 1;
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: casas })} ${curtoDaUnidade(unidade)}`;
}

/**
 * Quantidade a COMPRAR: sempre inteira e arredondada para cima. Comprar
 * "54,29 kg" não existe, e arredondar para baixo deixaria o estoque abaixo
 * da política que a compra devia atingir.
 */
export function arredondarCompra(v: number) {
  return Math.ceil(Math.max(0, v - 1e-9));
}

export function formatarCompra(v: number, unidade: string) {
  return `${arredondarCompra(v).toLocaleString("pt-BR")} ${curtoDaUnidade(unidade)}`;
}

/** R$ sem centavos a partir de 100 -- custo é ordem de grandeza, não extrato. */
export function formatarReais(v: number) {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: Math.abs(v) >= 100 ? 0 : 2,
    maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2,
  });
}

export function formatarDias(d: number) {
  return d.toLocaleString("pt-BR", { minimumFractionDigits: d < 10 ? 1 : 0, maximumFractionDigits: 1 });
}

export function formatarLinear(p: { linear_quantidade: number; linear_periodo: string; unidade: string }) {
  const periodo = PERIODOS.find((x) => x.id === p.linear_periodo)?.rotulo ?? "";
  return `${formatarQuantidade(Number(p.linear_quantidade), p.unidade)} ${periodo}`;
}
