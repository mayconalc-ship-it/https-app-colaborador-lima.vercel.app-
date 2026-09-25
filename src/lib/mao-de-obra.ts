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
};

export const PARAMETROS = [
  { id: "percentual_montagem", rotulo: "Percentual de montagem", ajuda: "Quanto do volume passa pela montagem." },
  { id: "perc_blitz_carregamento", rotulo: "Percentual de blitz de carregamento", ajuda: "Entra no tempo dos operadores." },
  { id: "perc_blitz_refugo", rotulo: "Percentual de blitz de refugo", ajuda: "" },
  { id: "perc_blitz_puxada", rotulo: "Percentual de blitz de puxada", ajuda: "" },
  { id: "tempo_reposicao_picking", rotulo: "Tempo de reposição do picking", ajuda: "Em fração de jornada." },
  { id: "tempo_carregamento_caminhao", rotulo: "Tempo de carregamento do caminhão", ajuda: "Por mapa." },
  { id: "tma", rotulo: "TMA da carreta", ajuda: "Tempo médio de atendimento." },
  { id: "hl_carreta", rotulo: "HL por carreta", ajuda: "Hectolitros que cabem numa carreta." },
  { id: "jornada", rotulo: "Jornada", ajuda: "Fração do dia efetivamente trabalhada." },
  { id: "tempo_blitz", rotulo: "Tempo de blitz", ajuda: "" },
  { id: "hl_por_mapa", rotulo: "HL por mapa", ajuda: "Divisor dos mapas previstos." },
] as const;

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
  frota_spot: number | null;
  frota_fixa_total: number | null;
  puxadores: number | null;
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
  /** Qual volume a grade do dia distribui: o negociado (padrão) ou o PPR. */
  base_meta: BaseDaMeta;
};

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
  frota_spot: null,
  frota_fixa_total: null,
  puxadores: null,
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
  base_meta: "negociado",
};

const n = (v: number | null | undefined) => (v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

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
  // FLOOR como na planilha: meia frota não existe na rua.
  const frotaDimensionada = Math.max(0, Math.floor(frotasReal + n(m.frota_reserva) - n(m.frota_spot)));
  return {
    diasUteis,
    volumeDosSabados,
    linear,
    frotasReal,
    frotaDimensionada,
    motoristas: frotaDimensionada,
    ajudantes: frotaDimensionada,
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

export type LancamentoDoDia = { realizado: number | null; opera: boolean };

/**
 * A grade do mês. `lancados` traz o que já foi digitado e quais dias
 * operam; sem ele, domingo fica de fora e o resto opera.
 */
export function volumePorDia(m: MesMaoDeObra, lancados: Map<number, LancamentoDoDia>): DiaDoVolume[] {
  const diasNoMes = diasDaCompetencia(m.competencia);
  const base: { dia: number; data: string; tipo: TipoDeDia; opera: boolean; realizado: number | null }[] = [];
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
    });
  }

  const operando = base.filter((d) => d.opera);
  const plano = planoPorTipoDeDia(m, {
    uteis: operando.filter((d) => d.tipo !== "sabado").length,
    sabados: operando.filter((d) => d.tipo === "sabado").length,
  });

  return base.map((d) => {
    const plan = !d.opera ? 0 : d.tipo === "sabado" ? plano.sabado : plano.util;
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
    ondeEsta: "Esta tela: o volume do mês (PPR, negociado e marketplace) e a frota SPOT dimensionam gente por função.",
  },
  {
    id: "V.2",
    texto: "Processo revisado no mínimo mensalmente, com estrutura planejada para os meses seguintes junto aos operadores e à área de Gente, com evidências.",
    ondeEsta: "Cada gravação do mês carimba quem revisou e quando; o envio ao recrutamento fica registrado com data, destinatários e quadro enviado.",
  },
  {
    id: "V.3",
    texto: "Comparação entre o dimensionamento projetado há 2 a 3 meses e o do mês corrente.",
    ondeEsta: "Bloco “Comparativo dos últimos meses”, por função, com a variação entre eles.",
  },
  {
    id: "V.4",
    texto: "Simulador monitorado diariamente, permitindo ajustes conforme a variação do volume.",
    ondeEsta: "Aba “Volume por dia”: o plano por dia útil, o realizado lançado dia a dia e o acumulado do mês.",
  },
  {
    id: "V.5",
    texto: "Acompanhamento da dispersão entre volume dimensionado x realizado e realizado x demanda, com aderência às metas.",
    ondeEsta: "Dispersão do dia, do acumulado e do mês fechado, com faixa de 5% sinalizada.",
  },
  {
    id: "V.6",
    texto: "Processo monitorado quanto à eficácia, com planos de ação ativos para correção de desvios e melhoria dos resultados dos últimos três meses.",
    ondeEsta: "Plano de ação por mês, com responsável, prazo e situação, ligado à função em desvio.",
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
