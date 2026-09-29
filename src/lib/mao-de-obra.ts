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
  { id: "ajudante_amarracao", rotulo: "Ajudante de amarração", area: "Armazém" },
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
  /** Os inputs do PPR Plan do Armazém (migration 154). */
  armazem: ParametrosArmazem;
};

/*
  OS INPUTS DO PPR PLAN DO ARMAZÉM (29/09/2026, pedido do dono: "o
  simulador do armazém seja realizado pelas atividades dos inputs do PPR
  plan do armazém; para alterar o QLP planejado do armazém, precisa alterar
  nos inputs"). É a aba "Inputs Armazem Plan" da planilha da companhia:
  volume -> viagens de rota, spot e puxada -> minutos de cada atividade por
  turno -> gente. Percentual em fração (0,1 = 10%), tempo em MINUTOS.

  O padrão é o do "PPR armazém 2026.xlsm" de São Félix (coluna "Utilizado").
*/
export type UnidadeDoInput = "%" | "min" | "un" | "h" | "HL" | "cx";

export const PARAMETROS_ARMAZEM = [
  // Rota: o volume vira viagens.
  { id: "perc_entrega_ff", grupo: "Rota", rotulo: "% entrega frota fixa", unidade: "%", padrao: 0.9 },
  { id: "hl_por_caixa", grupo: "Rota", rotulo: "HL por caixa", unidade: "HL", padrao: 0.17 },
  { id: "caixas_por_palete", grupo: "Rota", rotulo: "Caixas por palete", unidade: "cx", padrao: 42 },
  { id: "paletes_por_viagem", grupo: "Rota", rotulo: "Paletes por viagem", unidade: "un", padrao: 6 },
  { id: "caixas_viagem_spot", grupo: "Rota", rotulo: "Caixas por viagem spot", unidade: "cx", padrao: 144 },
  // Comportamento da puxada.
  { id: "pux_ff_noite", grupo: "Puxada", rotulo: "% puxada FF à noite", unidade: "%", padrao: 0.1 },
  { id: "pux_ff_manha", grupo: "Puxada", rotulo: "% puxada FF de manhã", unidade: "%", padrao: 0.3 },
  { id: "pux_spot_noite", grupo: "Puxada", rotulo: "% puxada spot à noite", unidade: "%", padrao: 0.1 },
  { id: "pux_spot_manha", grupo: "Puxada", rotulo: "% puxada spot de manhã", unidade: "%", padrao: 0.3 },
  { id: "pallets_blitz_puxada", grupo: "Puxada", rotulo: "% pallets com blitz de puxada", unidade: "%", padrao: 0.5 },
  { id: "mix_referencia", grupo: "Puxada", rotulo: "% mix retornável de referência (tempo de descarga)", unidade: "%", padrao: 0.465381419886258 },
  // Comportamento da rota.
  { id: "ret_ate14", grupo: "Retorno de rota", rotulo: "% carros que voltam até 14h", unidade: "%", padrao: 0.08 },
  { id: "ret_14a16", grupo: "Retorno de rota", rotulo: "% entre 14h e 16h", unidade: "%", padrao: 0.25 },
  { id: "ret_16a18", grupo: "Retorno de rota", rotulo: "% entre 16h e 18h", unidade: "%", padrao: 0.31 },
  { id: "ret_18a20", grupo: "Retorno de rota", rotulo: "% entre 18h e 20h", unidade: "%", padrao: 0.15 },
  { id: "ret_20a22", grupo: "Retorno de rota", rotulo: "% entre 20h e 22h", unidade: "%", padrao: 0.11 },
  { id: "ret_apos22", grupo: "Retorno de rota", rotulo: "% após 22h", unidade: "%", padrao: 0.1 },
  { id: "pallets_mistos", grupo: "Retorno de rota", rotulo: "% pallets mistos rota", unidade: "%", padrao: 0.66 },
  { id: "carros_batidos", grupo: "Retorno de rota", rotulo: "% carros batidos", unidade: "%", padrao: 0.085 },
  { id: "devolucao", grupo: "Retorno de rota", rotulo: "% devolução (incorporação)", unidade: "%", padrao: 0.016 },
  // Comportamento do armazém.
  { id: "pallets_rebaixados", grupo: "Armazém", rotulo: "% médio de pallets rebaixados/dia", unidade: "%", padrao: 0.15 },
  { id: "blitz_carregamento", grupo: "Armazém", rotulo: "% blitz de carregamento", unidade: "%", padrao: 0.1 },
  { id: "blitz_retorno", grupo: "Armazém", rotulo: "% blitz de retorno de rota", unidade: "%", padrao: 0.1 },
  { id: "rebaixados_manha", grupo: "Armazém", rotulo: "% pallets rebaixados de manhã", unidade: "%", padrao: 0.8 },
  { id: "molho_noite", grupo: "Armazém", rotulo: "% pallets abastecidos no molho à noite", unidade: "%", padrao: 0.4 },
  { id: "absenteismo", grupo: "Armazém", rotulo: "% absenteísmo da equipe", unidade: "%", padrao: 0.01 },
  { id: "fator_dias_ajudante", grupo: "Armazém", rotulo: "Fator de dias do ajudante (turno 3)", unidade: "un", padrao: 1 },
  // Tempos do operador de empilhadeira.
  { id: "op_carregamento", grupo: "Tempos do operador", rotulo: "Carregamento frota fixa / freteiro", unidade: "min", padrao: 20 },
  { id: "op_retorno_1a", grupo: "Tempos do operador", rotulo: "Retorno de rota 1ª viagem", unidade: "min", padrao: 20 },
  { id: "op_retorno_2a", grupo: "Tempos do operador", rotulo: "Retorno de rota 2ª viagem", unidade: "min", padrao: 20 },
  { id: "op_retorno_freteiro", grupo: "Tempos do operador", rotulo: "Retorno de freteiros", unidade: "min", padrao: 20 },
  { id: "op_spot_retornavel", grupo: "Tempos do operador", rotulo: "Descarga/carga spot retornável", unidade: "min", padrao: 50 },
  { id: "op_spot_descartavel", grupo: "Tempos do operador", rotulo: "Descarga/carga spot descartável", unidade: "min", padrao: 30 },
  { id: "op_molho", grupo: "Tempos do operador", rotulo: "Reabastecimento do molho por pallet", unidade: "min", padrao: 3 },
  { id: "op_recarga", grupo: "Tempos do operador", rotulo: "Carregamento de recarga (retorno + carga modelo)", unidade: "min", padrao: 31 },
  // Tempos do ajudante.
  { id: "aj_pallets_dia", grupo: "Tempos do ajudante", rotulo: "Produtividade: pallets por ajudante/dia", unidade: "un", padrao: 20 },
  { id: "aj_rebaixamento", grupo: "Tempos do ajudante", rotulo: "Rebaixamento por pallet", unidade: "min", padrao: 2 },
  { id: "aj_amarracao_freteiro", grupo: "Tempos do ajudante", rotulo: "Amarração freteiro rota (2 ajud.)", unidade: "min", padrao: 20 },
  { id: "aj_desamarracao_freteiro", grupo: "Tempos do ajudante", rotulo: "Desamarração freteiro rota (2 ajud.)", unidade: "min", padrao: 12 },
  { id: "aj_amarracao_spot", grupo: "Tempos do ajudante", rotulo: "Amarração spot puxada (2 ajud.)", unidade: "min", padrao: 45 },
  { id: "aj_desamarracao_spot", grupo: "Tempos do ajudante", rotulo: "Desamarração spot puxada (2 ajud.)", unidade: "min", padrao: 30 },
  { id: "aj_blitz_puxada", grupo: "Tempos do ajudante", rotulo: "Blitz de puxada (2 ajud.)", unidade: "min", padrao: 31 },
  { id: "aj_blitz_retorno", grupo: "Tempos do ajudante", rotulo: "Blitz de retorno de rota (2 ajud.)", unidade: "min", padrao: 25 },
  { id: "aj_carga_batido", grupo: "Tempos do ajudante", rotulo: "Carregamento de carro batido", unidade: "min", padrao: 20 },
  { id: "aj_descarga_batido", grupo: "Tempos do ajudante", rotulo: "Descarregamento de carro batido", unidade: "min", padrao: 10 },
  { id: "aj_sorting", grupo: "Tempos do ajudante", rotulo: "Sorting por pallet", unidade: "min", padrao: 10 },
  // Tempos do conferente.
  { id: "cf_carregamento", grupo: "Tempos do conferente", rotulo: "Carregamento frota fixa / freteiro", unidade: "min", padrao: 15 },
  { id: "cf_retorno_1a", grupo: "Tempos do conferente", rotulo: "Retorno de rota 1ª viagem", unidade: "min", padrao: 12 },
  { id: "cf_retorno_2a", grupo: "Tempos do conferente", rotulo: "Retorno de rota 2ª viagem", unidade: "min", padrao: 12 },
  { id: "cf_retorno_freteiro", grupo: "Tempos do conferente", rotulo: "Retorno de freteiros", unidade: "min", padrao: 12 },
  { id: "cf_spot_retornavel", grupo: "Tempos do conferente", rotulo: "Descarga/carga spot retornável", unidade: "min", padrao: 55 },
  { id: "cf_spot_descartavel", grupo: "Tempos do conferente", rotulo: "Descarga/carga spot descartável", unidade: "min", padrao: 45 },
  { id: "cf_balanco", grupo: "Tempos do conferente", rotulo: "Balanço de massa (por vez, 2×/turno)", unidade: "min", padrao: 120 },
  { id: "cf_contagem", grupo: "Tempos do conferente", rotulo: "Contagem do estoque", unidade: "min", padrao: 120 },
  { id: "cf_blitz_retorno", grupo: "Tempos do conferente", rotulo: "Blitz de retorno de rota", unidade: "min", padrao: 15 },
  // QLP extra (validar com EPO): pessoas fixas por turno.
  { id: "ex_limpeza_manha", grupo: "QLP extra", rotulo: "Ajudantes limpeza — manhã", unidade: "un", padrao: 0 },
  { id: "ex_picking_manha", grupo: "QLP extra", rotulo: "Organização picking — manhã", unidade: "un", padrao: 0 },
  { id: "ex_marketing_manha", grupo: "QLP extra", rotulo: "Ajudantes marketing — manhã", unidade: "un", padrao: 0 },
  { id: "ex_reepack_manha", grupo: "QLP extra", rotulo: "Ajudantes reepack — manhã", unidade: "un", padrao: 1 },
  { id: "ex_reepack_tarde", grupo: "QLP extra", rotulo: "Ajudantes reepack — tarde", unidade: "un", padrao: 0 },
  { id: "ex_trocas_manha", grupo: "QLP extra", rotulo: "Ajudantes trocas — manhã", unidade: "un", padrao: 0 },
  { id: "ex_apoio_noite", grupo: "QLP extra", rotulo: "Ajudante apoio — noite", unidade: "un", padrao: 1 },
  { id: "ex_apoio_manha", grupo: "QLP extra", rotulo: "Ajudante apoio — manhã", unidade: "un", padrao: 0 },
  { id: "ex_apoio_tarde", grupo: "QLP extra", rotulo: "Ajudante apoio — tarde", unidade: "un", padrao: 1 },
  // As jornadas que dividem os minutos (como na aba Dimensionamento Plan).
  { id: "jornada_horas", grupo: "Jornadas", rotulo: "Jornada útil (horas decimais)", unidade: "h", padrao: 7.33 },
  { id: "jornada_conferente_noite", grupo: "Jornadas", rotulo: "Jornada do conferente à noite", unidade: "h", padrao: 6.33 },
  // QUADRO FIXO (29/09/2026, pedido do dono: "operador de empilhadeira não
  // pode mexer, deve ficar sempre com 4"): a política da operação por cima
  // da conta. 0 = vale o que o PPR calcula; a memória mostra os dois.
  { id: "fixo_operador", grupo: "Quadro fixo (0 = calcula pelo PPR)", rotulo: "Operadores de empilhadeira", unidade: "un", padrao: 0 },
  { id: "fixo_ajudante", grupo: "Quadro fixo (0 = calcula pelo PPR)", rotulo: "Ajudantes de armazém", unidade: "un", padrao: 0 },
  { id: "fixo_amarracao", grupo: "Quadro fixo (0 = calcula pelo PPR)", rotulo: "Ajudantes de amarração", unidade: "un", padrao: 0 },
  { id: "fixo_conferente", grupo: "Quadro fixo (0 = calcula pelo PPR)", rotulo: "Conferentes", unidade: "un", padrao: 0 },
] as const satisfies readonly { id: string; grupo: string; rotulo: string; unidade: UnidadeDoInput; padrao: number }[];

export type ParametroArmazemId = (typeof PARAMETROS_ARMAZEM)[number]["id"];
export type ParametrosArmazem = Record<ParametroArmazemId, number>;
export const ARMAZEM_PADRAO = Object.fromEntries(PARAMETROS_ARMAZEM.map((p) => [p.id, p.padrao])) as ParametrosArmazem;
export const GRUPOS_DO_ARMAZEM = [...new Set(PARAMETROS_ARMAZEM.map((p) => p.grupo))];

/** O que veio do banco (jsonb), completado pelo padrão e só com números. */
export function lerParametrosArmazem(bruto: unknown): ParametrosArmazem {
  const origem = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
  const saida = { ...ARMAZEM_PADRAO };
  for (const p of PARAMETROS_ARMAZEM) {
    const v = Number(origem[p.id]);
    if (origem[p.id] != null && origem[p.id] !== "" && Number.isFinite(v)) saida[p.id] = v;
  }
  return saida;
}

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
  armazem: { ...ARMAZEM_PADRAO },
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
  // -- Armazém pelo PPR (migration 154): os inputs do mês da aba "Inputs Armazem Plan"
  /** Viagens de puxada da frota fixa no mês. */
  arm_viagens_puxada_ff: number | null;
  /** Viagens de puxada spot por dia, retornável e descartável. */
  arm_spot_retornavel_dia: number | null;
  arm_spot_descartavel_dia: number | null;
  /** Pallets retornáveis transportados no mês (base da blitz de puxada). */
  arm_pallets_retornaveis: number | null;
  /** % do mix retornável da puxada (0 a 100). */
  arm_mix_retornavel: number | null;
  /** Ajudantes de alta temporada. */
  arm_alta_temporada: number | null;
  /** Ajuste de férias da revenda: quando é MENOR que a reserva, a substitui (regra do PPR). */
  arm_ajuste_ferias: number | null;
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
  arm_viagens_puxada_ff: null,
  arm_spot_retornavel_dia: null,
  arm_spot_descartavel_dia: null,
  arm_pallets_retornaveis: null,
  arm_mix_retornavel: null,
  arm_alta_temporada: null,
  arm_ajuste_ferias: null,
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
// ARMAZÉM -- a conta do PPR Plan do Armazém (migration 154)
// ------------------------------------------------------------------

/*
  A MESMA CONTA DAS ABAS "Inputs Armazem Plan" E "Dimensionamento Plan" DO
  PPR (29/09/2026). O volume de entrega vira caixas, paletes e viagens;
  cada atividade vira MINUTOS por turno (operador e conferente) ou PESSOAS
  por turno (ajudante e amarração, que a planilha já divide por 60 × 7,33);
  e cada turno arredonda para cima. Não há turno digitado: para mudar o
  quadro do armazém, muda-se um input.

  O tempo médio de descarga da puxada e o sorting da manhã usam o "mix de
  referência" -- na planilha é o mix de JANEIRO, fixo ($C$350) para o ano
  todo; aqui virou input, com o mesmo valor, para a conta bater com o PPR.
*/
export type TurnoDoArmazem = "Noite" | "Manhã" | "Tarde";
export const TURNOS_DO_ARMAZEM: readonly TurnoDoArmazem[] = ["Noite", "Manhã", "Tarde"];

export type AtividadeDoArmazem = {
  rotulo: string;
  turno: TurnoDoArmazem;
  /** Minutos por dia (operador e conferente) ou pessoas (ajudante e amarração). */
  valor: number;
};

export type FuncaoDoArmazem = {
  unidade: "minutos" | "pessoas";
  atividades: AtividadeDoArmazem[];
  /** Por turno: a soma das atividades e as pessoas do turno. */
  turnos: Record<TurnoDoArmazem, { soma: number; pessoas: number }>;
  /** Reserva/ferista: absenteísmo + 1/12 de férias. */
  reserva: number;
  /** Alta temporada e ajuste de férias (só o ajudante). */
  altaTemporada: number;
  ajusteFerias: number | null;
  total: number;
  /** O que o PPR calcula, quando o quadro foi FIXADO por política (fixo_*). */
  calculado: number | null;
};

export type BaseDoArmazem = {
  dias: number;
  caixas: number;
  paletes: number;
  viagensRota: number;
  viagens1aDia: number;
  viagens2aDia: number;
  freteirosDia: number;
  caixasPorViagemFF: number;
  palletsRebaixadosDia: number;
  puxadaFFDia: number;
  palletsBlitzPuxadaDia: number;
  mixRetornavel: number;
  picoRetorno: number;
};

export type ContaArmazem = {
  base: BaseDoArmazem;
  operador: FuncaoDoArmazem;
  ajudante: FuncaoDoArmazem;
  amarracao: FuncaoDoArmazem;
  conferente: FuncaoDoArmazem;
  operadores: number;
  ajudantes: number;
  amarracoes: number;
  conferentes: number;
  manobristas: number;
};

/** Desvio-padrão amostral, como o STDEV do Excel. */
function desvioPadrao(xs: number[]): number {
  if (xs.length < 2) return 0;
  const media = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - media) ** 2, 0) / (xs.length - 1));
}

/** ROUNDUP do Excel com casas (o conferente arredonda o turno a 1 casa). */
function arredondarParaCima(x: number, casas = 0): number {
  const f = 10 ** casas;
  return Math.ceil(x * f - 1e-9) / f;
}

function fecharFuncao(
  unidade: FuncaoDoArmazem["unidade"],
  atividades: AtividadeDoArmazem[],
  pessoasDoTurno: (soma: number, turno: TurnoDoArmazem) => number,
  reservaDe: ((somaDosTurnos: number) => number) | null,
): FuncaoDoArmazem {
  const turnos = Object.fromEntries(
    TURNOS_DO_ARMAZEM.map((t) => {
      const soma = atividades.filter((a) => a.turno === t).reduce((s, a) => s + a.valor, 0);
      return [t, { soma, pessoas: pessoasDoTurno(soma, t) }];
    }),
  ) as FuncaoDoArmazem["turnos"];
  const somaDosTurnos = TURNOS_DO_ARMAZEM.reduce((s, t) => s + turnos[t].pessoas, 0);
  const reserva = reservaDe ? reservaDe(somaDosTurnos) : 0;
  return { unidade, atividades, turnos, reserva, altaTemporada: 0, ajusteFerias: null, total: somaDosTurnos + reserva, calculado: null };
}

export function contaArmazem(m: MesMaoDeObra, c: ConfigMaoDeObra): ContaArmazem {
  const A = c.armazem ?? ARMAZEM_PADRAO;
  const div = (a: number, b: number) => (b > 0 ? a / b : 0);

  // 1. O volume vira viagens (linhas 15 a 35 da aba Inputs).
  const dias = n(m.dias_totais);
  const caixas = div(n(m.volume_ppr), A.hl_por_caixa);
  const paletes = div(caixas, A.caixas_por_palete);
  const viagensRota = A.perc_entrega_ff * div(paletes, A.paletes_por_viagem);
  const viagens1a = viagensRota * A.perc_entrega_ff;
  const viagens2a = viagensRota - viagens1a;
  const caixasPorViagemFF = div(caixas * A.perc_entrega_ff, viagensRota);
  const viagensDia = div(viagensRota, dias);
  const v1 = div(viagens1a, dias);
  const v2 = div(viagens2a, dias);
  const v2Noturna = 0;
  const freteiros = div(viagens2a, dias);
  const palletsRebaixadosDia = viagensDia * A.pallets_rebaixados * 10;
  const paletesDaRota = div(viagensDia * caixasPorViagemFF + freteiros * A.caixas_viagem_spot, A.caixas_por_palete);

  // 2. A puxada (linhas 342 a 350).
  const puxadaFF = dias > 0 ? Math.ceil(n(m.arm_viagens_puxada_ff) / dias - 1e-9) : 0;
  const spotRet = n(m.arm_spot_retornavel_dia);
  const spotDesc = n(m.arm_spot_descartavel_dia);
  const palletsBlitz = div(n(m.arm_pallets_retornaveis) * A.pallets_blitz_puxada, dias);
  const mixRet = Math.min(1, Math.max(0, n(m.arm_mix_retornavel) / 100));

  // 3. Como o dia se distribui nos turnos.
  const ffN = A.pux_ff_noite, ffM = A.pux_ff_manha, ffT = 1 - ffN - ffM;
  const sN = A.pux_spot_noite, sM = A.pux_spot_manha, sT = 1 - sN - sM;
  const r14 = A.ret_ate14, rApos = A.ret_apos22;
  const pico = desvioPadrao([A.ret_ate14, A.ret_14a16, A.ret_16a18, A.ret_18a20, A.ret_20a22, A.ret_apos22]) * 1.5;
  const J = A.jornada_horas > 0 ? A.jornada_horas : 7.33;
  const JConfNoite = A.jornada_conferente_noite > 0 ? A.jornada_conferente_noite : J;
  const k = 60 * J;
  const saiRota = v1 + freteiros;

  // 4. OPERADOR DE EMPILHADEIRA -- minutos por turno (linhas 263 a 274).
  const mixRef = A.mix_referencia;
  const tPuxOp = A.op_spot_retornavel * mixRef + A.op_spot_descartavel * (1 - mixRef);
  const molho = paletesDaRota * A.op_molho * 0.65;
  const puxOp = (f: number, s: number) => puxadaFF * tPuxOp * f + spotRet * A.op_spot_retornavel * s + spotDesc * A.op_spot_descartavel * s;
  const operador = fecharFuncao(
    "minutos",
    [
      { rotulo: "Reabastecimento do molho (65% do volume)", turno: "Noite", valor: molho },
      { rotulo: "Carregamento frota fixa + freteiro", turno: "Noite", valor: saiRota * A.op_carregamento },
      { rotulo: "Descarga/carga da puxada", turno: "Noite", valor: puxOp(ffN, sN) },
      { rotulo: "Reabastecimento do molho — noite", turno: "Noite", valor: molho * A.molho_noite },
      { rotulo: "Blitz de carregamento", turno: "Manhã", valor: saiRota * (A.op_carregamento + A.op_retorno_1a) * A.blitz_carregamento },
      { rotulo: "Carregamento de recargas", turno: "Manhã", valor: v2 * A.op_recarga },
      { rotulo: "Descarga/carga da puxada", turno: "Manhã", valor: puxOp(ffM, sM) },
      { rotulo: "Retorno de rota", turno: "Manhã", valor: saiRota * A.op_retorno_1a * r14 },
      { rotulo: "Reabastecimento do molho — manhã", turno: "Manhã", valor: molho * (1 - A.molho_noite) },
      {
        rotulo: "Retorno de rota",
        turno: "Tarde",
        valor: (v1 * A.op_retorno_1a + v2 * A.op_retorno_2a + freteiros * A.op_retorno_freteiro + v2Noturna * A.op_retorno_2a) * (1 + pico) * (1 - r14),
      },
      { rotulo: "Carregamento rota noturna", turno: "Tarde", valor: v2Noturna * (A.op_retorno_1a + A.op_carregamento) },
      { rotulo: "Descarga/carga da puxada", turno: "Tarde", valor: puxOp(ffT, sT) },
    ],
    (soma) => arredondarParaCima(soma / 60 / J),
    (s) => arredondarParaCima(s * A.absenteismo + s / 12),
  );

  // 5. CONFERENTE -- minutos por turno (linhas 283 a 299); o turno arredonda a 1 casa.
  const tPuxCf = A.cf_spot_retornavel * mixRef + A.cf_spot_descartavel * (1 - mixRef);
  const puxCf = (f: number, s: number) => puxadaFF * tPuxCf * f + spotRet * A.cf_spot_retornavel * s + spotDesc * A.cf_spot_descartavel * s;
  const conferenteTurnos = fecharFuncao(
    "minutos",
    [
      { rotulo: "Reabastecimento do molho (65% do volume)", turno: "Noite", valor: molho },
      { rotulo: "Carregamento frota fixa + freteiro", turno: "Noite", valor: saiRota * A.cf_carregamento },
      { rotulo: "Descarga/carga da puxada", turno: "Noite", valor: puxCf(ffN, sN) },
      { rotulo: "Reabastecimento do molho — noite", turno: "Noite", valor: molho * A.molho_noite },
      { rotulo: "Balanço de massa", turno: "Noite", valor: A.cf_balanco * 2 },
      { rotulo: "Blitz de carregamento", turno: "Manhã", valor: saiRota * (A.cf_carregamento + A.cf_retorno_1a) * A.blitz_carregamento },
      { rotulo: "Carregamento de recargas", turno: "Manhã", valor: v2 * (A.cf_carregamento + A.cf_retorno_1a) },
      { rotulo: "Descarga/carga da puxada", turno: "Manhã", valor: puxCf(ffM, sM) },
      { rotulo: "Retorno de rota", turno: "Manhã", valor: saiRota * A.cf_retorno_1a * r14 },
      { rotulo: "Reabastecimento do molho — manhã", turno: "Manhã", valor: molho * (1 - A.molho_noite) * 0.5 },
      { rotulo: "Contagem do estoque", turno: "Manhã", valor: A.cf_contagem },
      { rotulo: "Balanço de massa", turno: "Manhã", valor: A.cf_balanco * 2 },
      {
        rotulo: "Retorno de rota",
        turno: "Tarde",
        valor: (v1 * A.cf_retorno_1a + v2 * A.cf_retorno_2a + freteiros * A.cf_retorno_freteiro + v2Noturna * A.cf_retorno_2a) * (1 + pico) * (1 - r14),
      },
      { rotulo: "Carregamento rota noturna", turno: "Tarde", valor: v2 * A.op_recarga },
      { rotulo: "Descarga/carga da puxada", turno: "Tarde", valor: puxCf(ffT, sT) },
      { rotulo: "Balanço de massa", turno: "Tarde", valor: A.cf_balanco * 2 },
      { rotulo: "Blitz de retorno de rota", turno: "Tarde", valor: saiRota * (1 - r14) * A.blitz_retorno * A.cf_blitz_retorno },
    ],
    (soma, t) => arredondarParaCima(soma / 60 / (t === "Noite" ? JConfNoite : J), 1),
    null,
  );
  // O total arredonda a soma dos turnos (que já têm uma casa).
  const conferente = { ...conferenteTurnos, total: arredondarParaCima(conferenteTurnos.total - 1e-9) };

  // 6. AJUDANTE DE ARMAZÉM -- pessoas por turno (linhas 306 a 324).
  const aj = fecharFuncao(
    "pessoas",
    [
      { rotulo: "Montagem de pallets", turno: "Noite", valor: div(div(paletes, dias * A.fator_dias_ajudante), A.aj_pallets_dia) },
      { rotulo: "Carregamento de carros batidos", turno: "Noite", valor: (v1 * A.carros_batidos * A.aj_carga_batido) / k },
      { rotulo: "Blitz de puxada", turno: "Noite", valor: (palletsBlitz * A.aj_blitz_puxada * ffN * 2) / k },
      { rotulo: "Sorting de pallets retornáveis", turno: "Noite", valor: (paletesDaRota * mixRet * A.aj_sorting * rApos) / k },
      { rotulo: "Ajudante de apoio (extra)", turno: "Noite", valor: A.ex_apoio_noite },
      { rotulo: "Blitz de puxada", turno: "Manhã", valor: (palletsBlitz * ffM * A.aj_blitz_puxada * 2) / k },
      { rotulo: "Descarregamento de carros batidos", turno: "Manhã", valor: (v1 * A.aj_descarga_batido * A.carros_batidos * r14) / k },
      { rotulo: "Incorporação da devolução ao estoque", turno: "Manhã", valor: div(paletesDaRota * A.devolucao, A.aj_pallets_dia) },
      { rotulo: "Sorting de pallets retornáveis", turno: "Manhã", valor: (paletesDaRota * mixRef * A.aj_sorting * r14) / k },
      { rotulo: "Blitz de carregamento", turno: "Manhã", valor: (paletesDaRota * A.blitz_carregamento * A.aj_sorting * 2) / k },
      { rotulo: "Rebaixamento de pallets", turno: "Manhã", valor: (palletsRebaixadosDia * A.aj_rebaixamento * A.rebaixados_manha) / k },
      {
        rotulo: "Extras (limpeza, picking, marketing, reepack, trocas, apoio)",
        turno: "Manhã",
        valor: A.ex_limpeza_manha + A.ex_picking_manha + A.ex_marketing_manha + A.ex_reepack_manha + A.ex_trocas_manha + A.ex_apoio_manha,
      },
      { rotulo: "Blitz de puxada", turno: "Tarde", valor: (palletsBlitz * ffT * A.aj_blitz_puxada * 2) / k },
      { rotulo: "Blitz de retorno de rota", turno: "Tarde", valor: ((viagensDia + freteiros) * A.blitz_retorno * A.aj_blitz_retorno * 2 * (1 - r14 - rApos)) / k },
      { rotulo: "Descarregamento de carros batidos", turno: "Tarde", valor: (v1 * A.aj_descarga_batido * A.carros_batidos * (1 + pico) * (1 - (r14 + rApos))) / k },
      { rotulo: "Rebaixamento de pallets", turno: "Tarde", valor: (palletsRebaixadosDia * (1 - A.rebaixados_manha) * A.aj_rebaixamento) / k },
      { rotulo: "Sorting de pallets retornáveis", turno: "Tarde", valor: (paletesDaRota * A.aj_sorting * pico) / k },
      { rotulo: "Montagem de pallets para noturna e recarga", turno: "Tarde", valor: div(div((v2 + v2Noturna) * caixasPorViagemFF, A.caixas_por_palete) * A.pallets_mistos, A.aj_pallets_dia) },
      { rotulo: "Extras (reepack e apoio)", turno: "Tarde", valor: A.ex_reepack_tarde + A.ex_apoio_tarde },
    ],
    (soma) => arredondarParaCima(soma),
    (s) => arredondarParaCima(s * A.absenteismo + s / 12),
  );
  // O ajuste de férias da revenda, quando MENOR que a reserva, a substitui;
  // e a alta temporada soma por cima (regra da linha "Total Ajudantes").
  const altaTemporada = n(m.arm_alta_temporada);
  const ajusteFerias = n(m.arm_ajuste_ferias);
  const somaAj = TURNOS_DO_ARMAZEM.reduce((s, t) => s + aj.turnos[t].pessoas, 0);
  const ajudante: FuncaoDoArmazem = {
    ...aj,
    altaTemporada,
    ajusteFerias,
    total: ajusteFerias < aj.reserva ? somaAj + ajusteFerias + altaTemporada : somaAj + aj.reserva + altaTemporada,
  };

  // 7. AJUDANTE DE AMARRAÇÃO -- pessoas por turno (linhas 327 a 336).
  const spotAmarra = (s: number) => [
    (spotDesc * s * A.aj_desamarracao_spot * 2) / k,
    (spotRet * s * (A.aj_desamarracao_spot + A.aj_amarracao_spot) * 2) / k,
  ];
  const [dN, rN] = spotAmarra(sN);
  const [dM, rM] = spotAmarra(sM);
  const [dT, rT] = spotAmarra(sT);
  const amarracao = fecharFuncao(
    "pessoas",
    [
      { rotulo: "Amarração de freteiros", turno: "Noite", valor: (freteiros * A.aj_amarracao_freteiro * 2) / k },
      { rotulo: "Desamarração de freteiros", turno: "Noite", valor: (freteiros * rApos * A.aj_desamarracao_freteiro * 2) / k },
      { rotulo: "Desamarração spot descartável", turno: "Noite", valor: dN },
      { rotulo: "Amarração e desamarração spot retornável", turno: "Noite", valor: rN },
      { rotulo: "Desamarração spot descartável", turno: "Manhã", valor: dM },
      { rotulo: "Amarração e desamarração spot retornável", turno: "Manhã", valor: rM },
      { rotulo: "Desamarração de freteiros", turno: "Manhã", valor: (freteiros * r14 * A.aj_desamarracao_freteiro * 2) / k },
      { rotulo: "Desamarração spot descartável", turno: "Tarde", valor: dT },
      { rotulo: "Amarração e desamarração spot retornável", turno: "Tarde", valor: rT },
      { rotulo: "Desamarração de freteiros", turno: "Tarde", valor: (freteiros * (1 - r14 - rApos) * A.aj_desamarracao_freteiro * 2) / k },
    ],
    (soma) => arredondarParaCima(soma),
    (s) => arredondarParaCima(s * A.absenteismo + s / 12),
  );

  // O quadro fixo por política vence a conta, e a conta fica registrada.
  const fixar = (f: FuncaoDoArmazem, fixo: number): FuncaoDoArmazem =>
    fixo > 0 ? { ...f, calculado: f.total, total: Math.round(fixo) } : f;
  const operadorF = fixar(operador, A.fixo_operador);
  const ajudanteF = fixar(ajudante, A.fixo_ajudante);
  const amarracaoF = fixar(amarracao, A.fixo_amarracao);
  const conferenteF = fixar(conferente, A.fixo_conferente);

  return {
    base: {
      dias,
      caixas,
      paletes,
      viagensRota,
      viagens1aDia: v1,
      viagens2aDia: v2,
      freteirosDia: freteiros,
      caixasPorViagemFF,
      palletsRebaixadosDia,
      puxadaFFDia: puxadaFF,
      palletsBlitzPuxadaDia: palletsBlitz,
      mixRetornavel: mixRet,
      picoRetorno: pico,
    },
    operador: operadorF,
    ajudante: ajudanteF,
    amarracao: amarracaoF,
    conferente: conferenteF,
    operadores: operadorF.total,
    ajudantes: ajudanteF.total,
    amarracoes: amarracaoF.total,
    conferentes: conferenteF.total,
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
    ajudante_amarracao: arm.amarracoes,
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

/**
 * OS MOTIVOS DE UM DIA FORA DO ANS, por sentido (28/09/2026, pedido do
 * dono: "muitas outras justificativas para um dia de baixa e de alta
 * venda"). O dia ACIMA do necessário só oferece motivos de venda alta; o
 * ABAIXO, só os de venda baixa -- uma lista só, com os dois misturados,
 * deixaria alguém justificar venda alta com "chuva".
 *
 * Os textos antigos continuam iguais ("Véspera de feriado / evento",
 * "Chuva / clima"...): justificativa já gravada precisa continuar batendo
 * com a lista, senão o Salvar do dia a recusaria.
 */
export const MOTIVOS_DIA_ALTA = [
  "Venda acima do combinado (fora do ANS)",
  "Ação comercial / promoção",
  "Campanha de incentivo da força de vendas",
  "Pedido grande de cliente (KA)",
  "Cliente novo / primeira compra",
  "Reposição de pedido do dia anterior",
  "Pedido reprogramado de outro dia",
  "Rota reforçada (cobrindo outra rota)",
  "Véspera de feriado / evento",
  "Dia seguinte a feriado",
  "Evento na cidade (festa, show, jogo)",
  "Festa regional (São João, carnaval, padroeiro)",
  "Início do mês (dia de pagamento)",
  "Calor acima do normal",
  "Compra antecipada antes de aumento de preço",
  "Lançamento de produto",
  "Recuperação de venda de dia de chuva",
  "Pedidos do BEES / marketplace concentrados",
  "Outro",
] as const;

export const MOTIVOS_DIA_BAIXA = [
  "Venda abaixo do combinado (fora do ANS)",
  "Chuva / clima",
  "Frio / clima fora da estação",
  "Falta de produto (ruptura)",
  "Puxada da fábrica atrasada",
  "Pedido cancelado ou devolvido",
  "Cliente fechado / rota sem pedido",
  "Rota não saiu (falta de motorista ou ajudante)",
  "Caminhão quebrado / frota indisponível",
  "Bloqueio de crédito do cliente",
  "Queda de sistema (Promax, WMS, BEES)",
  "Falta de energia ou de internet",
  "Estrada interditada / acesso ao PDV",
  "Feriado municipal ou ponto facultativo",
  "Cliente antecipou a compra no dia anterior",
  "Dia seguinte a venda alta (cliente abastecido)",
  "Fim do mês (mercado sem dinheiro)",
  "Aumento de preço (cliente segurou a compra)",
  "Ação da concorrência",
  "Pedido transferido para outro dia",
  "Outro",
] as const;

/** Todos, para validar no servidor o que chegou do formulário. */
export const MOTIVOS_DIA_ACIMA: readonly string[] = [...new Set<string>([...MOTIVOS_DIA_ALTA, ...MOTIVOS_DIA_BAIXA])];

/** Os motivos que fazem sentido para o sentido do dia. */
export function motivosDoDia(dispersao: number | null | undefined): readonly string[] {
  return (dispersao ?? 0) > 0 ? MOTIVOS_DIA_ALTA : MOTIVOS_DIA_BAIXA;
}

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

/** "Out/26, Nov/26 e Dez/26" -- os meses que a formalização cobre. */
export function mesesPorExtenso(competencias: string[], rotulo: (c: string) => string = rotuloCurto): string {
  const nomes = competencias.map(rotulo);
  return nomes.length <= 1 ? (nomes[0] ?? "") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * O E-MAIL DA FORMALIZAÇÃO (29/09/2026, pedido do dono): específico de
 * cada mês seguinte -- função a função, o necessário contra o que temos
 * hoje -- e sem data no corpo (a data é a do próprio e-mail).
 */
export function textoDaFormalizacao(d: {
  revenda: string;
  meses: MesDaFormalizacao[];
  observacao?: string | null;
  quemEnvia: string;
}): string {
  const linhas: string[] = [];
  linhas.push(`Planejamento de mão de obra — ${d.revenda}`);
  linhas.push(`Meses planejados: ${mesesPorExtenso(d.meses.map((m) => m.competencia), rotuloCompetencia)}`);
  for (const m of d.meses) {
    linhas.push("");
    linhas.push(`■ ${rotuloCompetencia(m.competencia).toUpperCase()}`);
    linhas.push(
      `  Volume: PPR ${m.volumePpr == null ? "—" : formatarNumero(m.volumePpr, 0)} HL · negociado ${m.volumeNegociado == null ? "—" : formatarNumero(m.volumeNegociado, 0)} HL`,
    );
    linhas.push("  Quadro por função (necessário / temos hoje):");
    for (const v of m.vagas) {
      const acao = v.vagas > 0 ? ` → contratar ${v.vagas}` : v.excedente > 0 ? ` → ${v.excedente} acima (não repor)` : "";
      linhas.push(`   - ${v.rotulo}: ${v.dimensionado} / ${v.atual ?? "—"}${acao}`);
    }
    const total = m.vagas.reduce((s, v) => s + v.dimensionado, 0);
    const atual = m.vagas.some((v) => v.atual != null) ? m.vagas.reduce((s, v) => s + (v.atual ?? 0), 0) : null;
    const vagas = m.vagas.reduce((s, v) => s + v.vagas, 0);
    linhas.push(
      `  QLP dimensionado: ${total} pessoas${atual == null ? "" : ` · QLP atual ${atual}`} · ${vagas === 0 ? "nenhuma vaga a abrir" : `contratar ${vagas}`}`,
    );
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
// HISTÓRICO DE ALTERAÇÕES (migration 151)
// ------------------------------------------------------------------

export type OndeAlterou = "parametros" | "mes" | "qlp" | "salario";

export const ROTULO_ONDE: Record<OndeAlterou, string> = {
  parametros: "Parâmetros",
  mes: "Mês",
  qlp: "QLP atual",
  salario: "Custo por função",
};

/** Os nomes que a tela usa para cada campo do mês. */
export const ROTULO_CAMPO_MES: Partial<Record<keyof MesMaoDeObra, string>> = {
  volume_ppr: "Volume PPR (HL)",
  volume_negociado: "Volume negociado (HL)",
  marketplace: "Marketplace (R$)",
  dias_totais: "Dias de operação",
  sabados: "Sábados no mês",
  volume_entrega_sabado: "Volume por sábado (HL)",
  media_carro_hl: "Média por carro (HL)",
  frota_long_dist: "Frota long distance",
  frota_reserva: "Frota reserva",
  frota_ferista: "Frota ferista",
  frota_spot: "Frota SPOT",
  frota_fixa_total: "Frota fixa que temos",
  puxadores: "Motoristas puxadores",
  ajudante_extra_entrega: "Ajudantes extras da entrega",
  operador_tarde: "Operadores — tarde",
  operador_reserva: "Operadores — reserva/ferista",
  manobristas: "Manobristas",
  ajudante_noite: "Ajudantes — noite",
  ajudante_manha: "Ajudantes — manhã",
  ajudante_tarde: "Ajudantes — tarde",
  ajudante_reserva: "Ajudantes — reserva/ferista",
  ajudante_extra: "Ajudantes — extras",
  conferente_noite: "Conferentes — noite",
  conferente_manha: "Conferentes — manhã",
  conferente_tarde: "Conferentes — tarde",
  arm_viagens_puxada_ff: "Viagens de puxada FF no mês",
  arm_spot_retornavel_dia: "Viagens de puxada spot retornável por dia",
  arm_spot_descartavel_dia: "Viagens de puxada spot descartável por dia",
  arm_pallets_retornaveis: "Pallets retornáveis transportados no mês",
  arm_mix_retornavel: "% mix retornável da puxada",
  arm_alta_temporada: "Ajudantes de alta temporada",
  arm_ajuste_ferias: "Ajuste de férias da revenda",
  volume_realizado: "Volume realizado (HL)",
  base_meta: "Volume que a grade distribui",
  qlp_justificativa_motivo: "Justificativa do QLP",
  qlp_justificativa: "Detalhe da justificativa do QLP",
  observacao: "Observação da revisão",
};

export type Alteracao = {
  onde: OndeAlterou;
  /** "AAAA-MM", quando é de um mês ou do QLP daquele mês. */
  competencia: string | null;
  campo: string;
  rotulo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
};

/** O valor como texto de tela: número com vírgula, vazio vira null. */
function comoTexto(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? mostrarNumero(v) : null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * O QUE MUDOU entre o antes e o depois, campo a campo.
 *
 * Número compara por valor (40 e 40,00 são o mesmo), o resto por texto.
 * `formatar` deixa o valor como a tela mostra -- 0,4 vira "40%" -- porque é
 * o texto gravado que o auditor lê depois.
 */
export function compararCampos(d: {
  onde: OndeAlterou;
  competencia?: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown>;
  campos: { campo: string; rotulo: string; formatar?: (v: unknown) => string | null }[];
}): Alteracao[] {
  const saida: Alteracao[] = [];
  for (const c of d.campos) {
    const a = d.antes ? d.antes[c.campo] : null;
    const b = d.depois[c.campo];
    const ambosNumeros = (a == null || typeof a === "number") && (b == null || typeof b === "number");
    const igual = ambosNumeros
      ? (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) < 1e-9)
      : comoTexto(a) === comoTexto(b);
    if (igual) continue;
    const fmt = c.formatar ?? comoTexto;
    saida.push({
      onde: d.onde,
      competencia: d.competencia ?? null,
      campo: c.campo,
      rotulo: c.rotulo,
      valorAnterior: a == null ? null : fmt(a),
      valorNovo: b == null ? null : fmt(b),
    });
  }
  return saida;
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
    ondeEsta: "Aba 2 · Planejar: o volume PPR, negociado e marketplace de cada mês, com a frota SPOT, vira gente por função (parâmetros na aba 1 · Configurar).",
  },
  {
    id: "V.2",
    texto: "Processo revisado no mínimo mensalmente, com estrutura planejada para os meses seguintes junto aos operadores e à área de Gente, com evidências.",
    ondeEsta: "Aba 2 · Planejar: os 3 meses seguintes; “Formalizar para o time de Gente” registra data, destinatários e o quadro enviado.",
  },
  {
    id: "V.3",
    texto: "Comparação entre o dimensionamento projetado há 2 a 3 meses e o do mês corrente.",
    ondeEsta: "Aba 4 · Resultado: a fotografia congelada em cada formalização contra o que o mês pede hoje.",
  },
  {
    id: "V.4",
    texto: "Simulador monitorado diariamente, permitindo ajustes conforme a variação do volume.",
    ondeEsta: "Aba 3 · Acompanhar o dia: necessário × realizado por dia, justificativa fora do ANS (±20%), previsão do mês e a frota na tendência de hoje.",
  },
  {
    id: "V.5",
    texto: "Acompanhamento da dispersão entre volume dimensionado x realizado e realizado x demanda, com aderência às metas.",
    ondeEsta: "Aba 4 · Resultado: realizado ÷ PPR e realizado ÷ negociado, em %, com faixa de ±5%, e os dias fora do ANS com Vendas.",
  },
  {
    id: "V.6",
    texto: "Processo monitorado quanto à eficácia, com planos de ação ativos para correção de desvios e melhoria dos resultados dos últimos três meses.",
    ondeEsta: "Aba 4 · Resultado: eficácia dos últimos 3 meses (projetado × realizado) e o plano de ação de cada desvio.",
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
  if (n(m.arm_mix_retornavel) > 100) return "O mix retornável da puxada vai de 0 a 100%.";
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
