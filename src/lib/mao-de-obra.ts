/**
 * SIMULADOR DE MÃO DE OBRA -- as regras, num lugar só.
 *
 * Pedido do dono (25/09/2026), para o item 1.2 do DPO (Dimensionamento):
 * a unidade precisa de "processo, ferramenta ou simulador operacional para
 * antecipação da necessidade de mão de obra", revisado mensalmente, com
 * comparação entre o dimensionado e o realizado, acompanhamento da
 * dispersão volume x realizado e plano de ação para os desvios.
 *
 * As contas são as MESMAS da planilha que a companhia usa ("01. Janeiro"
 * da Lima/Rio Verde, abas Simulador Dist, Simulador Armazém, Imputs e Base
 * Salário) -- traduzidas para cá para que a revenda não dependa de uma
 * planilha por mês no computador de alguém.
 *
 * Fica separado do servidor de propósito: a tela e a ação leem as MESMAS
 * regras. Regra escrita duas vezes é regra que discorda na primeira
 * mudança.
 */

export const MODULO_MAO_DE_OBRA = "mao-de-obra" as const;

// ------------------------------------------------------------------
// As funções dimensionadas
// ------------------------------------------------------------------

export const FUNCOES = [
  { id: "motorista", rotulo: "Motorista", area: "Distribuição" },
  { id: "ajudante_entrega", rotulo: "Ajudante de entrega", area: "Distribuição" },
  { id: "puxador", rotulo: "Motorista puxador", area: "Distribuição" },
  { id: "operador", rotulo: "Operador de empilhadeira", area: "Armazém" },
  { id: "ajudante_armazem", rotulo: "Ajudante de armazém", area: "Armazém" },
  { id: "conferente", rotulo: "Conferente", area: "Armazém" },
  { id: "manobrista", rotulo: "Manobrista", area: "Armazém" },
] as const;

export type FuncaoId = (typeof FUNCOES)[number]["id"];
export const EH_FUNCAO = (v: string): v is FuncaoId => FUNCOES.some((f) => f.id === v);
export const ROTULO_FUNCAO = Object.fromEntries(FUNCOES.map((f) => [f.id, f.rotulo])) as Record<FuncaoId, string>;
export const AREA_DA_FUNCAO = Object.fromEntries(FUNCOES.map((f) => [f.id, f.area])) as Record<FuncaoId, string>;

/** As rubricas do custo mensal de uma pessoa -- a "Base Salário" da planilha. */
export const RUBRICAS = [
  { id: "salario", rotulo: "Salário" },
  { id: "encargos", rotulo: "Encargos" },
  { id: "hora_extra", rotulo: "Hora extra" },
  { id: "dsr_hora_extra", rotulo: "DSR da hora extra" },
  { id: "vale_transporte", rotulo: "Vale transporte" },
  { id: "ticket", rotulo: "Ticket refeição" },
  { id: "assistencia_medica", rotulo: "Assistência médica" },
  { id: "seguro_vida", rotulo: "Seguro de vida" },
  { id: "cesta_basica", rotulo: "Cesta básica" },
  { id: "produtividade", rotulo: "Produtividade" },
  { id: "decimo_terceiro", rotulo: "13º proporcional" },
  { id: "ferias", rotulo: "Férias proporcionais" },
  { id: "uniforme", rotulo: "Uniforme e EPIs" },
  { id: "adicional_noturno", rotulo: "Adicional noturno" },
  { id: "premio_assiduidade", rotulo: "Prêmio assiduidade" },
  { id: "dsr_produtividade", rotulo: "DSR da produtividade" },
] as const;

export type RubricaId = (typeof RUBRICAS)[number]["id"];
export type Salario = Record<RubricaId, number>;

export const SALARIO_ZERADO: Salario = Object.fromEntries(RUBRICAS.map((r) => [r.id, 0])) as Salario;

/** O custo mensal de UMA pessoa naquela função. */
export function custoDaPessoa(s: Salario | null | undefined): number {
  if (!s) return 0;
  return RUBRICAS.reduce((total, r) => total + (Number(s[r.id]) || 0), 0);
}

// ------------------------------------------------------------------
// Os parâmetros da operação (a aba "Imputs")
// ------------------------------------------------------------------

export type ConfigMaoDeObra = {
  /** Quanto do volume passa pela montagem de pedido. */
  percentual_montagem: number;
  perc_blitz_carregamento: number;
  perc_blitz_refugo: number;
  perc_blitz_puxada: number;
  /** Horas por mapa na reposição do picking. */
  tempo_reposicao_picking: number;
  /** Horas para carregar um caminhão. */
  tempo_carregamento_caminhao: number;
  /** Tempo médio de atendimento da carreta, em horas. */
  tma: number;
  /** Hectolitros que cabem numa carreta. */
  hl_carreta: number;
  /** Jornada útil considerada no turno (fração do dia). */
  jornada: number;
  /** Horas de uma blitz. */
  tempo_blitz: number;
  /** Hectolitros por mapa -- o divisor dos mapas previstos. */
  hl_por_mapa: number;
  /**
   * A CURVA DE SELLOUT (25/09/2026): quanto do volume da semana sai em
   * cada dia. Em percentual, fechando 100% nos dias que operam. Tudo
   * zerado = curva desligada, e a meta volta a ser a média simples.
   */
  sellout_seg: number;
  sellout_ter: number;
  sellout_qua: number;
  sellout_qui: number;
  sellout_sex: number;
  sellout_sab: number;
  sellout_dom: number;
};

/** Os números que vieram da planilha da companhia. Cada revenda ajusta os seus. */
export const CONFIG_PADRAO: ConfigMaoDeObra = {
  percentual_montagem: 0.4,
  perc_blitz_carregamento: 0.1,
  perc_blitz_refugo: 0.1,
  perc_blitz_puxada: 0.1,
  tempo_reposicao_picking: 0.25,
  // Frações do DIA, como na planilha: 20 min para carregar, 3 h de TMA,
  // jornada de 7h20 e 40 min de blitz.
  tempo_carregamento_caminhao: 1 / 72,
  tma: 0.125,
  hl_carreta: 210,
  jornada: 0.3055555555555556,
  tempo_blitz: 1 / 36,
  hl_por_mapa: 50,
  sellout_seg: 0,
  sellout_ter: 0,
  sellout_qua: 0,
  sellout_qui: 0,
  sellout_sex: 0,
  sellout_sab: 0,
  sellout_dom: 0,
};

/** Os dias da semana da curva, na ordem em que a tela mostra. */
export const DIAS_DO_SELLOUT = [
  { id: "sellout_seg", rotulo: "Segunda", indice: 1 },
  { id: "sellout_ter", rotulo: "Terça", indice: 2 },
  { id: "sellout_qua", rotulo: "Quarta", indice: 3 },
  { id: "sellout_qui", rotulo: "Quinta", indice: 4 },
  { id: "sellout_sex", rotulo: "Sexta", indice: 5 },
  { id: "sellout_sab", rotulo: "Sábado", indice: 6 },
  { id: "sellout_dom", rotulo: "Domingo", indice: 0 },
] as const;

export type ChaveDoSellout = (typeof DIAS_DO_SELLOUT)[number]["id"];

export function somaDoSellout(c: Pick<ConfigMaoDeObra, ChaveDoSellout>): number {
  return DIAS_DO_SELLOUT.reduce((s, d) => s + (Number(c[d.id]) || 0), 0);
}

/** A curva está em uso? (tudo zerado = desligada) */
export function curvaLigada(c: Pick<ConfigMaoDeObra, ChaveDoSellout>): boolean {
  return somaDoSellout(c) > 0;
}

/**
 * A curva fecha em 100%? A soma só precisa fechar entre os dias que a
 * revenda opera -- domingo em zero é o normal.
 */
export function validarSellout(c: Pick<ConfigMaoDeObra, ChaveDoSellout>): string | null {
  const soma = somaDoSellout(c);
  if (soma === 0) return null;
  if (Math.abs(soma - 100) > 0.01) {
    return `A curva de sellout soma ${soma.toFixed(2).replace(".", ",")}% — precisa fechar em 100%.`;
  }
  return null;
}

/** O percentual daquele dia da semana (0 = domingo). */
export function percentualDoDia(c: Pick<ConfigMaoDeObra, ChaveDoSellout>, diaDaSemana: number): number {
  const achado = DIAS_DO_SELLOUT.find((d) => d.indice === diaDaSemana);
  return achado ? Number(c[achado.id]) || 0 : 0;
}

/**
 * COMO CADA PARÂMETRO APARECE NA TELA (28/09/2026, pedido do dono: "o
 * que for % em %").
 *
 * O BANCO NÃO MUDA: guarda fração, como a planilha da companhia (0,4 é
 * 40%; 0,305556 é 7h20 do dia). A conversão acontece só na borda -- na
 * hora de mostrar e na hora de ler o que foi digitado -- para que as
 * contas continuem idênticas às da planilha.
 *
 *   percentual -> 0,4  aparece como 40 (%)
 *   horas      -> 0,305556 aparece como 7:20 (h:mm)
 *   numero     -> como está (HL)
 */
export type FormatoDoParametro = "percentual" | "horas" | "numero";

export const PARAMETROS = [
  { id: "percentual_montagem", rotulo: "Montagem", ajuda: "Quanto do volume passa pela montagem.", formato: "percentual", limite: 99.9999 },
  { id: "perc_blitz_carregamento", rotulo: "Blitz de carregamento", ajuda: "Dos mapas do dia. Entra no tempo dos operadores.", formato: "percentual", limite: 99.9999 },
  { id: "perc_blitz_refugo", rotulo: "Blitz de refugo", ajuda: "", formato: "percentual", limite: 99.9999 },
  { id: "perc_blitz_puxada", rotulo: "Blitz de puxada", ajuda: "", formato: "percentual", limite: 99.9999 },
  { id: "tempo_reposicao_picking", rotulo: "Reposição do picking", ajuda: "Por mapa.", formato: "horas", limite: 99.999999 },
  { id: "tempo_carregamento_caminhao", rotulo: "Carregamento do caminhão", ajuda: "Por mapa.", formato: "horas", limite: 99.999999 },
  { id: "tma", rotulo: "TMA da carreta", ajuda: "Tempo médio de atendimento.", formato: "horas", limite: 99.999999 },
  { id: "jornada", rotulo: "Jornada útil", ajuda: "Do turno.", formato: "horas", limite: 99.999999 },
  { id: "tempo_blitz", rotulo: "Tempo de uma blitz", ajuda: "", formato: "horas", limite: 99.999999 },
  { id: "hl_carreta", rotulo: "HL por carreta", ajuda: "O que cabe numa carreta.", formato: "numero", limite: 99999999 },
  { id: "hl_por_mapa", rotulo: "HL por mapa", ajuda: "Divide o volume em mapas.", formato: "numero", limite: 99999999 },
] as const satisfies readonly { id: string; rotulo: string; ajuda: string; formato: FormatoDoParametro; limite: number }[];

/** O valor do banco como a pessoa lê: "40", "7:20", "210". */
export function parametroParaTela(valor: number, formato: FormatoDoParametro): string {
  if (!Number.isFinite(valor)) return "";
  if (formato === "percentual") return mostrarNumero(Math.round(valor * 100 * 1e4) / 1e4, 4);
  if (formato === "horas") {
    const minutos = Math.round(valor * 24 * 60);
    return `${Math.floor(minutos / 60)}:${String(minutos % 60).padStart(2, "0")}`;
  }
  return mostrarNumero(valor);
}

/**
 * O que foi digitado, de volta para o banco. Horas aceitam "7:20" e
 * "7,33"; percentual aceita "40" ou "40%". Null quando não dá para ler.
 */
export function parametroDaTela(texto: string, formato: FormatoDoParametro): number | null {
  const bruto = String(texto ?? "").trim().replace("%", "");
  if (!bruto) return null;
  if (formato === "horas") {
    const hm = bruto.match(/^(\d{1,2})\s*[:hH]\s*(\d{1,2})?$/);
    if (hm) return (Number(hm[1]) * 60 + Number(hm[2] ?? 0)) / (24 * 60);
    const horas = lerNumeroDigitado(bruto);
    return horas == null ? null : horas / 24;
  }
  const n = lerNumeroDigitado(bruto);
  if (n == null) return null;
  return formato === "percentual" ? n / 100 : n;
}

export const SUFIXO_DO_FORMATO: Record<FormatoDoParametro, string> = {
  percentual: "%",
  horas: "h:mm",
  numero: "HL",
};

// ------------------------------------------------------------------
// O mês: o que a liderança digita
// ------------------------------------------------------------------

export type MesMaoDeObra = {
  competencia: string; // "AAAA-MM"
  // -- Distribuição
  volume_ppr: number | null;
  volume_negociado: number | null;
  marketplace: number | null;
  dias_totais: number | null;
  sabados: number | null;
  volume_entrega_sabado: number | null;
  media_carro_hl: number | null;
  frota_long_dist: number | null;
  frota_reserva: number | null;
  /** Quem cobre FÉRIAS (migration 147) -- diferente da reserva, que cobre faltas. */
  frota_ferista: number | null;
  frota_spot: number | null;
  frota_fixa_total: number | null;
  puxadores: number | null;
  /** Ajudantes além de 1 por carro (migration 148): carro com 2, férias só de ajudante. */
  ajudante_extra_entrega: number | null;
  // -- Armazém (os turnos que não saem de conta)
  operador_tarde: number | null;
  operador_reserva: number | null;
  manobristas: number | null;
  ajudante_noite: number | null;
  ajudante_manha: number | null;
  ajudante_tarde: number | null;
  ajudante_reserva: number | null;
  ajudante_extra: number | null;
  conferente_noite: number | null;
  conferente_manha: number | null;
  conferente_tarde: number | null;
  // -- Acompanhamento
  volume_realizado: number | null;
  observacao: string | null;
  // -- Justificativas (migration 148)
  /** Por que o volume ficou acima/abaixo do acordado (V.5). */
  volume_justificativa_motivo: string | null;
  volume_justificativa: string | null;
  /** Por que o QLP planejado sobe ou desce (V.2). */
  qlp_justificativa_motivo: string | null;
  qlp_justificativa: string | null;
  /** Qual volume a grade do dia distribui: o negociado (padrão) ou o PPR. */
  base_meta: BaseDaMeta;
};

/**
 * Os campos do mês que são TEXTO, não número. Os laços que leem e gravam
 * o mês tratam tudo como número -- estes ficam de fora deles e são lidos
 * um a um (e observacao já era assim).
 */
export const CAMPOS_DE_TEXTO_DO_MES = [
  "observacao",
  "volume_justificativa_motivo",
  "volume_justificativa",
  "qlp_justificativa_motivo",
  "qlp_justificativa",
] as const;

export function ehCampoNumericoDoMes(chave: string): boolean {
  return chave !== "competencia" && chave !== "base_meta" && !(CAMPOS_DE_TEXTO_DO_MES as readonly string[]).includes(chave);
}

/**
 * Motivos prontos (28/09/2026, pedido do dono: "algumas justificativas").
 * Lista curta de propósito: é o que dá para AGRUPAR depois. O texto livre
 * ao lado conta o detalhe.
 */
export const MOTIVOS_VOLUME = [
  "Chuva / clima",
  "Feriado ou evento na região",
  "Falta de produto (ruptura)",
  "Ação comercial / promoção",
  "Aumento de preço",
  "Perda ou ganho de cliente",
  "Sazonalidade",
  "Meta negociada acima do mercado",
  "Outro",
] as const;

export const MOTIVOS_QLP = [
  "Aumento de volume",
  "Redução de volume",
  "Reposição de desligamento (turnover)",
  "Cobertura de férias",
  "Absenteísmo acima do normal",
  "Remanejamento entre áreas",
  "Mudança na média por carro / rota",
  "Outro",
] as const;

export type BaseDaMeta = "negociado" | "ppr";
export const ROTULO_BASE_DA_META: Record<BaseDaMeta, string> = {
  negociado: "Volume negociado",
  ppr: "Volume PPR",
};

export const MES_VAZIO: MesMaoDeObra = {
  competencia: "",
  volume_ppr: null,
  volume_negociado: null,
  marketplace: null,
  dias_totais: null,
  sabados: null,
  volume_entrega_sabado: null,
  media_carro_hl: null,
  frota_long_dist: null,
  frota_reserva: null,
  frota_ferista: null,
  frota_spot: null,
  frota_fixa_total: null,
  puxadores: null,
  ajudante_extra_entrega: null,
  operador_tarde: null,
  operador_reserva: null,
  manobristas: null,
  ajudante_noite: null,
  ajudante_manha: null,
  ajudante_tarde: null,
  ajudante_reserva: null,
  ajudante_extra: null,
  conferente_noite: null,
  conferente_manha: null,
  conferente_tarde: null,
  volume_realizado: null,
  observacao: null,
  volume_justificativa_motivo: null,
  volume_justificativa: null,
  qlp_justificativa_motivo: null,
  qlp_justificativa: null,
  base_meta: "negociado",
};

const n = (v: number | null | undefined) => (v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

/**
 * O NÚMERO QUE A PESSOA DIGITOU -- a mesma leitura na tela e no servidor.
 *
 * Ponto é ambíguo no Brasil: em "11.780" é milhar, em "0.305556" é
 * decimal. A regra: com vírgula, o ponto é milhar; sem vírgula, só é
 * milhar quando os grupos têm três dígitos (11.780, 1.234.567). O resto
 * é decimal.
 *
 * Nasceu de um erro real (25/09/2026): os parâmetros apareciam como
 * "0.3055555555555556", o ponto era jogado fora e o banco recusava com
 * "numeric field overflow".
 */
export function lerNumeroDigitado(valor: string | null | undefined): number | null {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return null;
  let limpo = bruto.replace(/\s/g, "");
  if (limpo.includes(",")) {
    limpo = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpo)) {
    limpo = limpo.replace(/\./g, "");
  }
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

/** O número como a pessoa espera ver: vírgula decimal, sem zeros à toa. */
export function mostrarNumero(valor: number | null | undefined, casasMax = 6): string {
  if (valor == null || !Number.isFinite(Number(valor))) return "";
  return Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: casasMax, useGrouping: false });
}

// ------------------------------------------------------------------
// DISTRIBUIÇÃO -- a mesma conta da aba "Simulador Dist"
// ------------------------------------------------------------------

export type ContaDistribuicao = {
  diasUteis: number;
  volumeDosSabados: number;
  /** O volume que sai por dia útil -- a "linear". */
  linear: number;
  frotasReal: number;
  /** A frota fixa dimensionada: linear/carro + long dist + reserva − spot. */
  frotaDimensionada: number;
  motoristas: number;
  ajudantes: number;
  puxadores: number;
  /** Quanto a frota dimensionada usa da frota fixa que a revenda tem. */
  ocupacaoDaFrota: number | null;
};

export function contaDistribuicao(m: MesMaoDeObra): ContaDistribuicao {
  const diasUteis = Math.max(0, n(m.dias_totais) - n(m.sabados));
  const volumeDosSabados = n(m.volume_entrega_sabado) * n(m.sabados);
  const linear = diasUteis > 0 ? (n(m.volume_negociado) - volumeDosSabados) / diasUteis : 0;
  const mediaCarro = n(m.media_carro_hl);
  const frotasReal = mediaCarro > 0 ? linear / mediaCarro + n(m.frota_long_dist) : 0;
  // FLOOR como na planilha: meia frota não existe na rua. O ferista
  // (férias) entra como a reserva (faltas) -- migration 147.
  const frotaDimensionada = Math.max(
    0,
    Math.floor(frotasReal + n(m.frota_reserva) + n(m.frota_ferista) - n(m.frota_spot)),
  );
  return {
    diasUteis,
    volumeDosSabados,
    linear,
    frotasReal,
    frotaDimensionada,
    motoristas: frotaDimensionada,
    // 1 por carro, mais os extras (migration 148).
    ajudantes: frotaDimensionada + Math.max(0, n(m.ajudante_extra_entrega)),
    puxadores: n(m.puxadores),
    ocupacaoDaFrota: n(m.frota_fixa_total) > 0 ? frotaDimensionada / n(m.frota_fixa_total) : null,
  };
}

// ------------------------------------------------------------------
// ARMAZÉM -- a mesma conta da aba "Simulador Armazém"
// ------------------------------------------------------------------

export type ContaArmazem = {
  mapsPrevistos: number;
  operadorNoite: number;
  operadorManha: number;
  operadores: number;
  ajudantes: number;
  conferentes: number;
  manobristas: number;
};

export function contaArmazem(m: MesMaoDeObra, c: ConfigMaoDeObra): ContaArmazem {
  // O armazém trabalha TODOS os dias do mês, inclusive sábado: a planilha
  // divide pelo "dia TT", não pelos dias úteis da entrega.
  const dias = n(m.dias_totais);
  const jornada = c.jornada > 0 ? c.jornada : 1;
  const mapsPrevistos = dias > 0 && c.hl_por_mapa > 0 ? n(m.volume_ppr) / dias / c.hl_por_mapa : 0;
  // A blitz entra nos dois turnos, como na planilha.
  const blitz = (c.perc_blitz_carregamento * mapsPrevistos * c.tempo_blitz) / jornada;
  const operadorNoite = (c.tempo_carregamento_caminhao * mapsPrevistos) / jornada + blitz;
  const carretasPorDia = c.hl_carreta > 0 && dias > 0 ? n(m.volume_ppr) / c.hl_carreta / dias : 0;
  const operadorManha = (carretasPorDia * c.tma) / jornada / 2 + blitz;
  const operadores = operadorNoite + operadorManha + n(m.operador_tarde) + n(m.operador_reserva);
  return {
    mapsPrevistos,
    operadorNoite,
    operadorManha,
    operadores,
    ajudantes:
      n(m.ajudante_noite) + n(m.ajudante_manha) + n(m.ajudante_tarde) + n(m.ajudante_reserva) + n(m.ajudante_extra),
    conferentes: n(m.conferente_noite) + n(m.conferente_manha) + n(m.conferente_tarde),
    manobristas: n(m.manobristas),
  };
}

// ------------------------------------------------------------------
// O dimensionamento do mês, função a função
// ------------------------------------------------------------------

export type LinhaDoDimensionamento = {
  funcao: FuncaoId;
  rotulo: string;
  area: string;
  /** Quanto a conta pede (arredondado para cima: pessoa é inteira). */
  dimensionado: number;
  /** O número cru, antes do arredondamento -- para quem quiser conferir. */
  dimensionadoExato: number;
  /** Quanto a revenda tem hoje (QLP informado). */
  realizado: number | null;
  /** realizado − dimensionado. Positivo = gente sobrando. */
  diferenca: number | null;
  custoUnitario: number;
  custoDimensionado: number;
  custoRealizado: number | null;
};

export function dimensionamentoDoMes(
  m: MesMaoDeObra,
  c: ConfigMaoDeObra,
  salarios: Partial<Record<FuncaoId, Salario>>,
  realizado: Partial<Record<FuncaoId, number>>,
): { linhas: LinhaDoDimensionamento[]; dist: ContaDistribuicao; arm: ContaArmazem } {
  const dist = contaDistribuicao(m);
  const arm = contaArmazem(m, c);
  const exatoDe: Record<FuncaoId, number> = {
    motorista: dist.motoristas,
    ajudante_entrega: dist.ajudantes,
    puxador: dist.puxadores,
    operador: arm.operadores,
    ajudante_armazem: arm.ajudantes,
    conferente: arm.conferentes,
    manobrista: arm.manobristas,
  };

  const linhas = FUNCOES.map((f) => {
    const exato = exatoDe[f.id];
    // Pessoa é inteira, e faltar gente para o volume é pior do que sobrar:
    // arredonda para cima, como a planilha faz ao somar os turnos.
    const dimensionado = Math.max(0, Math.ceil(exato - 1e-9));
    const real = realizado[f.id] ?? null;
    const custoUnitario = custoDaPessoa(salarios[f.id]);
    return {
      funcao: f.id,
      rotulo: f.rotulo,
      area: f.area,
      dimensionado,
      dimensionadoExato: exato,
      realizado: real,
      diferenca: real == null ? null : real - dimensionado,
      custoUnitario,
      custoDimensionado: custoUnitario * dimensionado,
      custoRealizado: real == null ? null : custoUnitario * real,
    };
  });

  return { linhas, dist, arm };
}

/**
 * A DISPERSÃO do mês: o volume que saiu contra o que foi dimensionado.
 * É o número que o DPO pede acompanhar ("dispersão entre volume
 * dimensionado x realizado"). Null quando ainda não há realizado.
 */
export function dispersaoDoVolume(m: MesMaoDeObra): number | null {
  const prometido = n(m.volume_negociado);
  const realizado = n(m.volume_realizado);
  if (prometido <= 0 || m.volume_realizado == null) return null;
  return realizado / prometido - 1;
}

/** Acima disso a dispersão vira desvio que precisa de plano de ação. */
export const DISPERSAO_ACEITA = 0.05;

/**
 * A COR DA DISPERSÃO: volume ACIMA do necessário é verde, ABAIXO é
 * vermelho (pedido do dono, 28/09/2026). Antes a cor saía da faixa de
 * ±5% -- e um dia 20% acima ficava vermelho igual a um dia 20% abaixo,
 * quando só um deles é problema.
 *
 * Zero conta como acima: o dia bateu o necessário. A seta vai junto com
 * a cor, para quem não distingue verde de vermelho.
 */
export function sentidoDaDispersao(d: number | null | undefined): "acima" | "abaixo" | null {
  if (d == null) return null;
  return d >= 0 ? "acima" : "abaixo";
}

export const COR_DA_DISPERSAO = {
  acima: "text-emerald-600",
  abaixo: "text-red-600",
  vazio: "text-slate-300",
} as const;

export function classeDaDispersao(d: number | null | undefined): string {
  return COR_DA_DISPERSAO[sentidoDaDispersao(d) ?? "vazio"];
}

/** "+3,2% ▲" / "-4,1% ▼" -- o sinal e a seta dizem o sentido sem depender da cor. */
export function rotuloDaDispersao(d: number | null | undefined): string {
  const s = sentidoDaDispersao(d);
  if (s == null) return "—";
  return `${s === "acima" && d! > 0 ? "+" : ""}${formatarPercento(d)} ${s === "acima" ? "▲" : "▼"}`;
}

// ------------------------------------------------------------------
// AS VAGAS -- o que vai para o recrutamento (25/09/2026)
// ------------------------------------------------------------------

export type VagaDaFuncao = {
  funcao: FuncaoId;
  rotulo: string;
  area: string;
  dimensionado: number;
  /** Quanta gente a revenda tem hoje naquela função. */
  atual: number | null;
  /** Dimensionado − atual, nunca negativo: sobra não é vaga. */
  vagas: number;
  /** Quanta gente sobra, quando sobra. */
  excedente: number;
};

export function vagasDoMes(linhas: LinhaDoDimensionamento[]): VagaDaFuncao[] {
  return linhas.map((l) => {
    const atual = l.realizado;
    const diferenca = atual == null ? 0 : l.dimensionado - atual;
    return {
      funcao: l.funcao,
      rotulo: l.rotulo,
      area: l.area,
      dimensionado: l.dimensionado,
      atual,
      vagas: atual == null ? 0 : Math.max(0, diferenca),
      excedente: atual == null ? 0 : Math.max(0, -diferenca),
    };
  });
}

/**
 * O e-mail do quadro de vagas, em texto puro.
 *
 * Texto, e não HTML: ele é colado num e-mail que a pessoa manda da PRÓPRIA
 * conta (o app não tem SMTP -- mesma decisão da Blitz de Carreta). Começa
 * pelo que o recrutamento precisa fazer, não pela explicação.
 */
export function textoDoEmailDeVagas(d: {
  revenda: string;
  competencia: string;
  vagas: VagaDaFuncao[];
  volumeNegociado: number | null;
  observacao?: string | null;
  quemEnvia: string;
}): string {
  const comVaga = d.vagas.filter((v) => v.vagas > 0);
  const excedentes = d.vagas.filter((v) => v.excedente > 0);
  const linhas: string[] = [];
  linhas.push(`Dimensionamento de mão de obra — ${d.revenda} — ${rotuloCompetencia(d.competencia)}`);
  linhas.push("");
  if (comVaga.length === 0) {
    linhas.push("Nenhuma vaga a abrir neste mês: o quadro atual atende o dimensionamento.");
  } else {
    linhas.push(`VAGAS A ABRIR (${comVaga.reduce((s, v) => s + v.vagas, 0)} no total):`);
    for (const v of comVaga) {
      linhas.push(`- ${v.rotulo} (${v.area}): ${v.vagas} vaga${v.vagas === 1 ? "" : "s"} — dimensionado ${v.dimensionado}, temos ${v.atual ?? "—"}`);
    }
  }
  if (excedentes.length > 0) {
    linhas.push("");
    linhas.push("ACIMA DO DIMENSIONADO (atenção para não repor):");
    for (const v of excedentes) {
      linhas.push(`- ${v.rotulo}: ${v.excedente} acima — dimensionado ${v.dimensionado}, temos ${v.atual ?? "—"}`);
    }
  }
  linhas.push("");
  linhas.push(
    `Base do cálculo: volume negociado de ${d.volumeNegociado == null ? "—" : formatarNumero(d.volumeNegociado, 0)} HL no mês, pelos parâmetros da operação cadastrados no app.`,
  );
  if (d.observacao?.trim()) {
    linhas.push("");
    linhas.push(`Observação: ${d.observacao.trim()}`);
  }
  linhas.push("");
  linhas.push(`Enviado por ${d.quemEnvia} pelo App do Colaborador.`);
  return linhas.join("\n");
}

export function assuntoDoEmailDeVagas(revenda: string, competencia: string, totalVagas: number) {
  return `Dimensionamento ${rotuloCompetencia(competencia)} — ${revenda} — ${totalVagas} vaga${totalVagas === 1 ? "" : "s"}`;
}

// ------------------------------------------------------------------
// O VOLUME POR DIA -- plan x realizado (25/09/2026)
// ------------------------------------------------------------------

export type TipoDeDia = "util" | "sabado" | "domingo";

export type DiaDoVolume = {
  dia: number;
  /** "2026-09-12" -- a data de verdade, para o dia da semana. */
  data: string;
  /** "12/09" */
  rotulo: string;
  /** "sex" */
  diaDaSemana: string;
  tipo: TipoDeDia;
  /** Domingo e feriado desmarcado não operam -- e não recebem meta. */
  opera: boolean;
  /** A média necessária NAQUELE dia: útil, sábado ou domingo. */
  plan: number;
  realizado: number | null;
  /** realizado / plan − 1. Null quando não há plano ou lançamento. */
  dispersao: number | null;
  /** Por que o dia passou do ANS com Vendas (migration 149). */
  justificativaMotivo: string | null;
  justificativa: string | null;
};

const DIAS_DA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function tipoDoDia(data: string): TipoDeDia {
  const d = new Date(`${data}T12:00:00Z`).getUTCDay();
  return d === 0 ? "domingo" : d === 6 ? "sabado" : "util";
}

export const ROTULO_TIPO_DE_DIA: Record<TipoDeDia, string> = {
  util: "Dia útil",
  sabado: "Sábado",
  domingo: "Domingo",
};

/** O volume que a grade do dia distribui. */
export function volumeBaseDaMeta(m: MesMaoDeObra): number {
  return n(m.base_meta === "ppr" ? m.volume_ppr : m.volume_negociado);
}

/**
 * A MÉDIA NECESSÁRIA POR TIPO DE DIA (25/09/2026, pedido do dono).
 *
 * A meta é distribuída pelos DIAS QUE REALMENTE OPERAM naquele mês, e não
 * por uma contagem informada à parte: foi assim que um mês de 11.780 HL
 * apareceu pedindo 15.898 HL, porque a meta saía de 16 dias úteis e era
 * espalhada pelos 22 dias de semana do calendário.
 *
 * Sábado entrega o que foi cadastrado para sábado; o que sobra se divide
 * pelos dias úteis que operam. Domingo (e feriado desmarcado) fica fora.
 * Assim a soma da grade é SEMPRE o volume informado.
 */
export function planoPorTipoDeDia(
  m: MesMaoDeObra,
  operacao: { uteis: number; sabados: number } = { uteis: 0, sabados: 0 },
): Record<TipoDeDia, number> {
  const uteis = operacao.uteis > 0 ? operacao.uteis : Math.max(0, n(m.dias_totais) - n(m.sabados));
  const sabados = operacao.sabados > 0 ? operacao.sabados : n(m.sabados);
  const doSabado = n(m.volume_entrega_sabado);
  const sobra = volumeBaseDaMeta(m) - doSabado * sabados;
  return {
    util: uteis > 0 ? sobra / uteis : 0,
    sabado: doSabado,
    domingo: 0,
  };
}

/** A média do dia útil -- o número que a tela mostra em destaque. */
export function planoDoDia(m: MesMaoDeObra, operacao?: { uteis: number; sabados: number }): number {
  return planoPorTipoDeDia(m, operacao).util;
}

export type LancamentoDoDia = {
  realizado: number | null;
  opera: boolean;
  justificativaMotivo?: string | null;
  justificativa?: string | null;
};

/**
 * O ANS COM VENDAS (28/09/2026, pedido do dono): o volume de um dia fica
 * entre 80% e 120% do necessário daquele dia. Acima, a operação não tem
 * gente nem frota dimensionada para entregar; abaixo, tem gente e frota
 * paradas. Fora da faixa, nos dois sentidos, o dia pede justificativa.
 */
export const LIMITE_ANS_VENDAS = 0.2;

export function excedeAns(dispersao: number | null | undefined): boolean {
  return dispersao != null && Math.abs(dispersao) > LIMITE_ANS_VENDAS;
}

/** Os motivos de um dia fora do ANS. Lista curta: é o que se agrupa depois. */
export const MOTIVOS_DIA_ACIMA = [
  // acima
  "Venda acima do combinado (fora do ANS)",
  "Ação comercial / promoção",
  "Pedido grande de cliente (KA)",
  "Reposição de pedido do dia anterior",
  "Véspera de feriado / evento",
  "Dia seguinte a feriado",
  // abaixo
  "Venda abaixo do combinado (fora do ANS)",
  "Chuva / clima",
  "Falta de produto (ruptura)",
  "Pedido cancelado ou devolvido",
  "Cliente fechado / rota sem pedido",
  "Outro",
] as const;

/**
 * A grade do mês. `lancados` traz o que já foi digitado e quais dias
 * operam; sem ele, domingo fica de fora e o resto opera.
 */
export function volumePorDia(
  m: MesMaoDeObra,
  lancados: Map<number, LancamentoDoDia>,
  config?: Pick<ConfigMaoDeObra, ChaveDoSellout>,
): DiaDoVolume[] {
  const diasNoMes = diasDaCompetencia(m.competencia);
  const base: {
    dia: number;
    data: string;
    tipo: TipoDeDia;
    opera: boolean;
    realizado: number | null;
    justificativaMotivo: string | null;
    justificativa: string | null;
  }[] = [];
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const data = `${m.competencia}-${String(dia).padStart(2, "0")}`;
    const tipo = tipoDoDia(data);
    const lancado = lancados.get(dia);
    base.push({
      dia,
      data,
      tipo,
      opera: lancado ? lancado.opera : tipo !== "domingo",
      realizado: lancado?.realizado ?? null,
      justificativaMotivo: lancado?.justificativaMotivo ?? null,
      justificativa: lancado?.justificativa ?? null,
    });
  }

  const operando = base.filter((d) => d.opera);

  /*
    COM A CURVA DE SELLOUT (25/09/2026): cada dia leva o peso do seu dia
    da semana, e os pesos dos dias que operam são normalizados para somar
    o volume do mês. Assim a segunda não recebe a mesma meta da sexta, e
    o total continua fechando em 100% do volume informado.
  */
  const comCurva = config ? curvaLigada(config) : false;
  const pesoDe = (data: string) =>
    config ? percentualDoDia(config, new Date(`${data}T12:00:00Z`).getUTCDay()) : 0;
  const pesoTotal = comCurva ? operando.reduce((s, d) => s + pesoDe(d.data), 0) : 0;
  const volumeBase = volumeBaseDaMeta(m);

  const plano = planoPorTipoDeDia(m, {
    uteis: operando.filter((d) => d.tipo !== "sabado").length,
    sabados: operando.filter((d) => d.tipo === "sabado").length,
  });

  return base.map((d) => {
    const plan = !d.opera
      ? 0
      : comCurva && pesoTotal > 0
        ? (volumeBase * pesoDe(d.data)) / pesoTotal
        : d.tipo === "sabado"
          ? plano.sabado
          : plano.util;
    return {
      dia: d.dia,
      data: d.data,
      rotulo: `${String(d.dia).padStart(2, "0")}/${m.competencia.slice(5)}`,
      diaDaSemana: DIAS_DA_SEMANA[new Date(`${d.data}T12:00:00Z`).getUTCDay()],
      tipo: d.tipo,
      opera: d.opera,
      plan,
      realizado: d.realizado,
      dispersao: d.realizado == null || plan <= 0 ? null : d.realizado / plan - 1,
      justificativaMotivo: d.justificativaMotivo,
      justificativa: d.justificativa,
    };
  });
}

/**
 * O RITMO DO MÊS: no que saiu até agora, onde o mês termina?
 *
 * É o que o item V.4 chama de "ajustes e flexões conforme a variação do
 * volume" -- projeta o fechamento pelo realizado até aqui mais o plano
 * dos dias que faltam, corrigido pelo ritmo.
 */
export function projecaoDoMes(dias: DiaDoVolume[]): {
  planDoMes: number;
  realizadoAteAgora: number;
  planAteAgora: number;
  /** O que falta de plano nos dias ainda não lançados. */
  planQueFalta: number;
  /** Realizado + o que falta, no ritmo de até agora. */
  projetado: number;
  /** projetado / plano do mês − 1. */
  dispersaoProjetada: number | null;
} {
  const planDoMes = dias.reduce((s, d) => s + d.plan, 0);
  const lancados = dias.filter((d) => d.realizado != null);
  const planAteAgora = lancados.reduce((s, d) => s + d.plan, 0);
  const realizadoAteAgora = lancados.reduce((s, d) => s + (d.realizado ?? 0), 0);
  const planQueFalta = planDoMes - planAteAgora;
  const ritmo = planAteAgora > 0 ? realizadoAteAgora / planAteAgora : 1;
  const projetado = lancados.length === 0 ? planDoMes : realizadoAteAgora + planQueFalta * ritmo;
  return {
    planDoMes,
    realizadoAteAgora,
    planAteAgora,
    planQueFalta,
    projetado,
    dispersaoProjetada: planDoMes > 0 && lancados.length > 0 ? projetado / planDoMes - 1 : null,
  };
}

/**
 * O LE (Latest Estimate) -- a previsão de fechamento do mês.
 *
 * Pedido do dono (25/09/2026): ao digitar o volume do dia, saber se o mês
 * chega na meta. Duas leituras, e as duas importam:
 *   - NO RITMO: o que os dias lançados renderam, projetado nos que faltam;
 *   - SE FECHAR NA META: o realizado mais a meta dos dias que faltam.
 */
export function leDoMes(dias: DiaDoVolume[], metaDoMes: number): {
  realizado: number;
  metaAteAgora: number;
  metaQueFalta: number;
  diasLancados: number;
  diasQueFaltam: number;
  ritmo: number | null;
  /** A previsão: realizado + o que falta, no ritmo de até agora. */
  le: number;
  /** O que dá se os dias que faltam fecharem exatamente na meta. */
  leNaMeta: number;
  /** le / meta do mês − 1. */
  desvio: number | null;
  /** Quanto falta por dia para ainda bater a meta. */
  precisaPorDia: number | null;
  bate: boolean;
} {
  const lancados = dias.filter((d) => d.realizado != null);
  const faltam = dias.filter((d) => d.opera && d.realizado == null);
  const realizado = lancados.reduce((s, d) => s + (d.realizado ?? 0), 0);
  const metaAteAgora = lancados.reduce((s, d) => s + d.plan, 0);
  const metaQueFalta = faltam.reduce((s, d) => s + d.plan, 0);
  const ritmo = metaAteAgora > 0 ? realizado / metaAteAgora : null;
  const le = lancados.length === 0 ? metaDoMes : realizado + metaQueFalta * (ritmo ?? 1);
  return {
    realizado,
    metaAteAgora,
    metaQueFalta,
    diasLancados: lancados.length,
    diasQueFaltam: faltam.length,
    ritmo,
    le,
    leNaMeta: realizado + metaQueFalta,
    desvio: metaDoMes > 0 && lancados.length > 0 ? le / metaDoMes - 1 : null,
    precisaPorDia: faltam.length > 0 ? Math.max(0, metaDoMes - realizado) / faltam.length : null,
    bate: le >= metaDoMes,
  };
}

/**
 * Quanta gente o mês pediria SE fechasse no volume projetado -- a flexão
 * que o V.4 cobra. Devolve a frota e as funções da Distribuição, que são
 * as que se movem com o volume do dia.
 */
export function dimensionamentoNoRitmo(m: MesMaoDeObra, volumeProjetado: number) {
  return contaDistribuicao({ ...m, volume_negociado: volumeProjetado });
}

/** O acumulado do mês até o último dia lançado -- é ele que manda. */
export function acumuladoDoMes(dias: DiaDoVolume[]): {
  diasLancados: number;
  planAcumulado: number;
  realizadoAcumulado: number;
  dispersao: number | null;
} {
  const lancados = dias.filter((d) => d.realizado != null);
  const planAcumulado = lancados.reduce((s, d) => s + d.plan, 0);
  const realizadoAcumulado = lancados.reduce((s, d) => s + (d.realizado ?? 0), 0);
  return {
    diasLancados: lancados.length,
    planAcumulado,
    realizadoAcumulado,
    dispersao: planAcumulado > 0 ? realizadoAcumulado / planAcumulado - 1 : null,
  };
}

/**
 * O CALENDÁRIO DO MÊS -- quantos dias corridos, sábados, domingos e dias
 * de semana ele tem de verdade.
 *
 * Existe porque a grade do dia é o calendário, mas a meta sai dos dias
 * que a liderança informou. Quando os dois discordam, a soma do dia não
 * fecha com o volume negociado -- e foi isso que o dono viu (25/09/2026).
 */
export function calendarioDaCompetencia(competencia: string): {
  corridos: number;
  sabados: number;
  domingos: number;
  /** Segunda a sexta -- o padrão de "dias úteis" antes de feriados. */
  uteis: number;
} {
  const corridos = diasDaCompetencia(competencia);
  let sabados = 0;
  let domingos = 0;
  for (let dia = 1; dia <= corridos; dia++) {
    const tipo = tipoDoDia(`${competencia}-${String(dia).padStart(2, "0")}`);
    if (tipo === "sabado") sabados++;
    if (tipo === "domingo") domingos++;
  }
  return { corridos, sabados, domingos, uteis: corridos - sabados - domingos };
}

/**
 * A CONFERÊNCIA DO PLANO DIÁRIO: a soma dos dias fecha com o volume
 * negociado do mês?
 *
 * Só fecha quando o que foi informado (dias de operação e sábados) bate
 * com o calendário. Quando não bate, a tela diz o que ajustar em vez de
 * mostrar um total errado em silêncio.
 */
export function conferenciaDoPlano(
  m: MesMaoDeObra,
  dias: DiaDoVolume[],
): {
  planoDoMes: number;
  volumeBase: number;
  base: BaseDaMeta;
  diferenca: number;
  fecha: boolean;
  uteisQueOperam: number;
  sabadosQueOperam: number;
  diasParados: number;
} {
  const planoDoMes = dias.reduce((s, d) => s + d.plan, 0);
  const volumeBase = volumeBaseDaMeta(m);
  const operando = dias.filter((d) => d.opera);
  return {
    planoDoMes,
    volumeBase,
    base: m.base_meta,
    diferenca: planoDoMes - volumeBase,
    fecha: Math.abs(planoDoMes - volumeBase) < 1,
    uteisQueOperam: operando.filter((d) => d.tipo !== "sabado").length,
    sabadosQueOperam: operando.filter((d) => d.tipo === "sabado").length,
    diasParados: dias.filter((d) => !d.opera).length,
  };
}

export function diasDaCompetencia(competencia: string): number {
  const [ano, mes] = competencia.split("-").map(Number);
  if (!ano || !mes) return 31;
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

// ------------------------------------------------------------------
// COMPARATIVO -- o dimensionamento de um mês contra os anteriores
// ------------------------------------------------------------------

export type ColunaDoComparativo = {
  competencia: string;
  porFuncao: Record<FuncaoId, number>;
  total: number;
  volumeNegociado: number | null;
};

export function comparativoDeMeses(
  meses: { mes: MesMaoDeObra; linhas: LinhaDoDimensionamento[] }[],
): ColunaDoComparativo[] {
  return meses.map(({ mes, linhas }) => ({
    competencia: mes.competencia,
    porFuncao: Object.fromEntries(linhas.map((l) => [l.funcao, l.dimensionado])) as Record<FuncaoId, number>,
    total: linhas.reduce((s, l) => s + l.dimensionado, 0),
    volumeNegociado: mes.volume_negociado,
  }));
}

// ------------------------------------------------------------------
// PLANEJAR 2 A 3 MESES À FRENTE (28/09/2026)
// ------------------------------------------------------------------

/**
 * Os TRÊS MESES SEGUINTES ao escolhido -- o horizonte que o DPO pede (V.2).
 *
 * Pedido do dono (28/09/2026): clicar em setembro mostra out-nov-dez. O
 * mês corrente já está contratado; o que se planeja no início dele é o
 * quadro de 1 a 3 meses à frente, que é o que o time de Gente consegue
 * programar a tempo.
 */
export function mesesDoPlanejamento(competencia: string): string[] {
  const um = competenciaSeguinte(competencia);
  const dois = competenciaSeguinte(um);
  return [um, dois, competenciaSeguinte(dois)];
}

// ------------------------------------------------------------------
// AS DUAS DISPERSÕES (V.5) -- pedido do dono, 28/09/2026:
//   dimensionado x realizado = realizado ÷ volume PPR − 1
//   realizado x demanda      = realizado ÷ volume negociado − 1
// ------------------------------------------------------------------

export type DispersoesDoMes = {
  realizado: number;
  /** O mês já tem volume realizado fechado? Senão, é o acumulado dos dias. */
  fechado: boolean;
  diasLancados: number;
  contraPpr: number | null;
  contraNegociado: number | null;
};

/**
 * Mês fechado compara o total com o volume do mês. Mês em andamento
 * compara o acumulado com a parte do volume que já devia ter saído -- a
 * meta dos dias lançados, na proporção de cada volume. Comparar 20 dias
 * de venda com o mês inteiro daria sempre "abaixo" até o dia 30.
 */
export function dispersoesDoMes(m: MesMaoDeObra, dias: DiaDoVolume[]): DispersoesDoMes {
  const ppr = n(m.volume_ppr);
  const negociado = n(m.volume_negociado);
  if (m.volume_realizado != null) {
    const real = n(m.volume_realizado);
    return {
      realizado: real,
      fechado: true,
      diasLancados: dias.filter((d) => d.realizado != null).length,
      contraPpr: ppr > 0 ? real / ppr - 1 : null,
      contraNegociado: negociado > 0 ? real / negociado - 1 : null,
    };
  }
  const acumulado = acumuladoDoMes(dias);
  const base = volumeBaseDaMeta(m);
  // A fração do mês que já passou, pela meta dos dias lançados.
  const fracao = base > 0 ? acumulado.planAcumulado / base : 0;
  const esperado = (volume: number) => volume * fracao;
  return {
    realizado: acumulado.realizadoAcumulado,
    fechado: false,
    diasLancados: acumulado.diasLancados,
    contraPpr: ppr > 0 && esperado(ppr) > 0 ? acumulado.realizadoAcumulado / esperado(ppr) - 1 : null,
    contraNegociado:
      negociado > 0 && esperado(negociado) > 0 ? acumulado.realizadoAcumulado / esperado(negociado) - 1 : null,
  };
}

/** Fora da faixa de ±5% para qualquer uma das duas: é desvio. */
export function temDesvio(d: DispersoesDoMes): boolean {
  return [d.contraPpr, d.contraNegociado].some((x) => x != null && Math.abs(x) > DISPERSAO_ACEITA);
}

// ------------------------------------------------------------------
// A FOTOGRAFIA DA PROJEÇÃO (V.3) -- migration 143
// ------------------------------------------------------------------

export type ProjecaoCongelada = {
  id: string;
  competenciaBase: string;
  competenciaAlvo: string;
  volumePpr: number | null;
  volumeNegociado: number | null;
  dimensionado: Partial<Record<FuncaoId, number>>;
  total: number;
  qlp: Partial<Record<FuncaoId, number>> | null;
  vagas: number;
  feitaEm: string;
  feitaPorNome: string | null;
};

/** Quantos meses antes do alvo a projeção foi feita. */
export function mesesDeAntecedencia(p: Pick<ProjecaoCongelada, "competenciaBase" | "competenciaAlvo">): number {
  const [ab, mb] = p.competenciaBase.split("-").map(Number);
  const [aa, ma] = p.competenciaAlvo.split("-").map(Number);
  return (aa - ab) * 12 + (ma - mb);
}

/**
 * Para cada antecedência (3, 2, 1 e 0 meses), a ÚLTIMA fotografia feita
 * naquele mês-base. É a linha do tempo do V.3: o que se dizia deste mês
 * lá atrás, e o que ele pede hoje.
 */
export function linhaDoTempoDaProjecao(projecoes: ProjecaoCongelada[], alvo: string): ProjecaoCongelada[] {
  const doAlvo = projecoes.filter((p) => p.competenciaAlvo === alvo);
  const porBase = new Map<string, ProjecaoCongelada>();
  for (const p of doAlvo) {
    const atual = porBase.get(p.competenciaBase);
    if (!atual || p.feitaEm > atual.feitaEm) porBase.set(p.competenciaBase, p);
  }
  return [...porBase.values()].sort((a, b) => a.competenciaBase.localeCompare(b.competenciaBase));
}

// ------------------------------------------------------------------
// EFICÁCIA DOS ÚLTIMOS 3 MESES (V.6)
// ------------------------------------------------------------------

export type EficaciaDoMes = {
  competencia: string;
  volumeProjetado: number | null;
  /** De onde veio o projetado: a fotografia mais antiga, ou o mês lançado. */
  origemDoProjetado: "fotografia" | "mes" | null;
  realizado: number | null;
  dispersao: number | null;
  qlpProjetado: number | null;
  qlpReal: number | null;
  acoes: number;
  acoesConcluidas: number;
  situacao: "dentro" | "desvio_com_acao" | "desvio_sem_acao" | "sem_dado";
};

export function eficaciaDoMes(d: {
  competencia: string;
  mes: MesMaoDeObra | null;
  fotografias: ProjecaoCongelada[];
  qlpReal: Partial<Record<FuncaoId, number>>;
  acoes: { competencia: string; status: StatusAcao }[];
}): EficaciaDoMes {
  const primeira = linhaDoTempoDaProjecao(d.fotografias, d.competencia)[0] ?? null;
  const volumeProjetado = primeira?.volumeNegociado ?? d.mes?.volume_negociado ?? null;
  const origemDoProjetado = primeira?.volumeNegociado != null ? "fotografia" : d.mes?.volume_negociado != null ? "mes" : null;
  const realizado = d.mes?.volume_realizado ?? null;
  const dispersao = volumeProjetado && realizado != null ? realizado / volumeProjetado - 1 : null;
  const qlpValores = Object.values(d.qlpReal);
  const acoesDoMes = d.acoes.filter((a) => a.competencia === d.competencia);
  const desvio = dispersao != null && Math.abs(dispersao) > DISPERSAO_ACEITA;
  return {
    competencia: d.competencia,
    volumeProjetado,
    origemDoProjetado,
    realizado,
    dispersao,
    qlpProjetado: primeira ? primeira.total : null,
    qlpReal: qlpValores.length > 0 ? qlpValores.reduce((s, v) => s + (v ?? 0), 0) : null,
    acoes: acoesDoMes.length,
    acoesConcluidas: acoesDoMes.filter((a) => a.status === "concluida").length,
    situacao: dispersao == null ? "sem_dado" : !desvio ? "dentro" : acoesDoMes.length > 0 ? "desvio_com_acao" : "desvio_sem_acao",
  };
}

export const ROTULO_SITUACAO: Record<EficaciaDoMes["situacao"], string> = {
  dentro: "✅ Dentro da faixa",
  desvio_com_acao: "🟡 Desvio com plano de ação",
  desvio_sem_acao: "🔴 Desvio sem plano de ação",
  sem_dado: "— Sem volume para comparar",
};

/** O e-mail da formalização: os três meses, o que falta e o que sobra. */
export type MesDaFormalizacao = {
  competencia: string;
  vagas: VagaDaFuncao[];
  volumeNegociado: number | null;
  volumePpr: number | null;
  justificativaMotivo?: string | null;
  justificativa?: string | null;
};

export function textoDaFormalizacao(d: {
  revenda: string;
  meses: MesDaFormalizacao[];
  observacao?: string | null;
  quemEnvia: string;
  /** "2026-03-05" -- a data do envio, que pode ser retroativa. */
  data?: string | null;
}): string {
  const linhas: string[] = [];
  linhas.push(`Planejamento de mão de obra — ${d.revenda}`);
  if (d.data) linhas.push(`Data: ${d.data.split("-").reverse().join("/")}`);
  linhas.push(`Horizonte: ${d.meses.map((m) => rotuloCompetencia(m.competencia)).join(", ")}`);
  for (const m of d.meses) {
    linhas.push("");
    linhas.push(`■ ${rotuloCompetencia(m.competencia).toUpperCase()}`);
    linhas.push(
      `  Volume: PPR ${m.volumePpr == null ? "—" : formatarNumero(m.volumePpr, 0)} HL · negociado ${m.volumeNegociado == null ? "—" : formatarNumero(m.volumeNegociado, 0)} HL`,
    );
    const atual = m.vagas.some((v) => v.atual != null) ? m.vagas.reduce((s, v) => s + (v.atual ?? 0), 0) : null;
    linhas.push(
      `  QLP dimensionado: ${m.vagas.reduce((s, v) => s + v.dimensionado, 0)} pessoas${atual == null ? "" : ` (QLP atual ${atual})`}`,
    );
    const comVaga = m.vagas.filter((v) => v.vagas > 0);
    const sobra = m.vagas.filter((v) => v.excedente > 0);
    linhas.push(
      comVaga.length === 0
        ? "  Contratar: nenhuma vaga."
        : `  Contratar: ${comVaga.map((v) => `${v.rotulo} ${v.vagas}`).join(" · ")}`,
    );
    if (sobra.length > 0) linhas.push(`  Acima do necessário (não repor): ${sobra.map((v) => `${v.rotulo} ${v.excedente}`).join(" · ")}`);
    if (m.justificativaMotivo || m.justificativa) {
      linhas.push(`  Justificativa: ${[m.justificativaMotivo, m.justificativa].filter(Boolean).join(" — ")}`);
    }
  }
  if (d.observacao?.trim()) {
    linhas.push("");
    linhas.push(`Observação: ${d.observacao.trim()}`);
  }
  linhas.push("");
  linhas.push(`Enviado por ${d.quemEnvia} pelo App do Colaborador (Simulador de Mão de Obra).`);
  return linhas.join("\n");
}

// ------------------------------------------------------------------
// Plano de ação (o desvio vira tarefa)
// ------------------------------------------------------------------

export const STATUS_ACAO = ["aberta", "em_andamento", "concluida"] as const;
export type StatusAcao = (typeof STATUS_ACAO)[number];
export const ROTULO_STATUS_ACAO: Record<StatusAcao, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

export const LIMITES_MAO_DE_OBRA = {
  textoMax: 300,
  responsavelMax: 120,
  observacaoMax: 500,
  /** Ninguém dimensiona 10.000 pessoas: é dedo no teclado. */
  pessoasMax: 2000,
  volumeMax: 10_000_000,
} as const;

/** O e-mail de quem recebe o quadro de vagas. */
export function validarEmail(email: string): string | null {
  const e = email.trim();
  if (e.length < 5 || e.length > 160) return "E-mail inválido.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return "E-mail inválido.";
  return null;
}

/**
 * O item 1.2 do DPO, verificação por verificação -- e onde o app atende.
 *
 * Fica aqui, e não num texto solto na tela, porque é o que a auditoria
 * percorre: cada linha precisa apontar para uma evidência que existe.
 */
export const REQUISITO_DPO = [
  {
    id: "V.1",
    texto: "Processo, ferramenta ou simulador para antecipar a necessidade de mão de obra e da demanda SPOT, com base na previsão de volume, incluindo Marketplace.",
    ondeEsta: "Aba 1 · Planejar: o volume PPR, negociado e marketplace de cada mês, com a frota SPOT, vira gente por função.",
  },
  {
    id: "V.2",
    texto: "Processo revisado no mínimo mensalmente, com estrutura planejada para os meses seguintes junto aos operadores e à área de Gente, com evidências.",
    ondeEsta: "Aba 1 · Planejar: o mês atual e os 2 seguintes; “Formalizar para Gente” registra data, destinatários e o quadro enviado.",
  },
  {
    id: "V.3",
    texto: "Comparação entre o dimensionamento projetado há 2 a 3 meses e o do mês corrente.",
    ondeEsta: "Aba 3 · Resultado: a fotografia congelada em cada formalização contra o que o mês pede hoje.",
  },
  {
    id: "V.4",
    texto: "Simulador monitorado diariamente, permitindo ajustes conforme a variação do volume.",
    ondeEsta: "Aba 2 · Acompanhar o dia: necessário × realizado por dia, previsão do mês e a frota no ritmo de hoje.",
  },
  {
    id: "V.5",
    texto: "Acompanhamento da dispersão entre volume dimensionado x realizado e realizado x demanda, com aderência às metas.",
    ondeEsta: "Aba 3 · Resultado: realizado ÷ PPR e realizado ÷ negociado, em %, com faixa de ±5%.",
  },
  {
    id: "V.6",
    texto: "Processo monitorado quanto à eficácia, com planos de ação ativos para correção de desvios e melhoria dos resultados dos últimos três meses.",
    ondeEsta: "Aba 3 · Resultado: eficácia dos últimos 3 meses (projetado × realizado) e o plano de ação de cada desvio.",
  },
] as const;

export function validarAcao(d: { oQue: string; responsavel: string; prazo: string | null }): string | null {
  if (d.oQue.trim().length < 5) return "Escreva o que será feito.";
  if (d.oQue.length > LIMITES_MAO_DE_OBRA.textoMax) return `A ação passa de ${LIMITES_MAO_DE_OBRA.textoMax} caracteres.`;
  if (d.responsavel.trim().length < 3) return "Informe o responsável.";
  if (d.responsavel.length > LIMITES_MAO_DE_OBRA.responsavelMax) return "Nome do responsável longo demais.";
  if (d.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(d.prazo)) return "Prazo inválido.";
  return null;
}

export function validarMes(m: MesMaoDeObra): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.competencia)) return "Competência inválida.";
  if (n(m.dias_totais) <= 0) return "Informe os dias do mês (dia TT).";
  if (n(m.sabados) < 0 || n(m.sabados) >= n(m.dias_totais)) return "Sábados fora do mês.";
  if (n(m.volume_negociado) < 0 || n(m.volume_ppr) < 0) return "Volume não pode ser negativo.";
  if (n(m.volume_negociado) > LIMITES_MAO_DE_OBRA.volumeMax || n(m.volume_ppr) > LIMITES_MAO_DE_OBRA.volumeMax) {
    return "Volume alto demais — confira o número.";
  }
  if (n(m.media_carro_hl) < 0) return "Média de HL por carro inválida.";
  for (const [campo, valor] of Object.entries(m)) {
    if (campo === "competencia" || campo === "observacao") continue;
    if (typeof valor === "number" && valor < 0) return "Nenhum campo pode ser negativo.";
  }
  if ((m.observacao ?? "").length > LIMITES_MAO_DE_OBRA.observacaoMax) return "Observação longa demais.";
  if ((m.qlp_justificativa ?? "").length > LIMITES_MAO_DE_OBRA.observacaoMax) return "Justificativa do QLP longa demais.";
  return null;
}

// ------------------------------------------------------------------
// Formatação
// ------------------------------------------------------------------

export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function rotuloCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${MESES_LONGOS[Number(mes) - 1] ?? mes}/${ano}`;
}

/** A competência de hoje em São Paulo -- o servidor roda em UTC. */
export function competenciaAtual(quando: Date = new Date()) {
  return quando.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
}

export function competenciaAnterior(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
}

export function competenciaSeguinte(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

/** "2026-09" -> "Set/26", para cabeçalho de coluna. */
export function rotuloCurto(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${MESES_CURTOS[Number(mes) - 1] ?? mes}/${ano.slice(2)}`;
}

export const ehCompetencia = (v: string | undefined | null): v is string =>
  typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function formatarReais(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function formatarNumero(v: number | null | undefined, casas = 1) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function formatarPercento(v: number | null | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
