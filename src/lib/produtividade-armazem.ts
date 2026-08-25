/**
 * Produtividade do Armazém - regras de domínio.
 *
 * Fonte única da verdade dos tipos, cálculos e validações das seis
 * funcionalidades. As telas e as ações de servidor consultam daqui -- o
 * mesmo desenho de lib/ativo-giro.ts.
 *
 * Sem tabela de consolidação: os indicadores são somados na leitura, em
 * cima de um recorte de período. Uma auditoria do Programa 5S tem 25
 * respostas para somar a cada abertura de tela; aqui um lançamento é uma
 * linha só, então não há o que valha a pena pré-calcular no banco.
 */

export const TURNOS = ["manha", "tarde", "noite"] as const;
export type Turno = (typeof TURNOS)[number];

export const ROTULO_TURNO: Record<Turno, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

export function ehTurno(v: unknown): v is Turno {
  return typeof v === "string" && (TURNOS as readonly string[]).includes(v);
}

/** Turno provável de agora, para o formulário já abrir marcado certo. */
export function turnoAtual(agora = new Date()): Turno {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(agora),
  );
  if (hora >= 5 && hora < 13) return "manha";
  if (hora >= 13 && hora < 21) return "tarde";
  return "noite";
}

/**
 * Horário de fim de cada turno, "HH:MM" -- é quando o lembrete de
 * empilhadeira dispara para quem está cadastrado naquele turno. Mesmos
 * limites de `turnoAtual`: turno da noite termina de madrugada.
 */
export const FIM_TURNO: Record<Turno, string> = {
  manha: "13:00",
  tarde: "21:00",
  noite: "05:00",
};

export const SENSOS = [
  "utilizacao",
  "organizacao",
  "limpeza",
  "conservacao",
  "disciplina",
] as const;
export type Senso = (typeof SENSOS)[number];

export const ROTULO_SENSO: Record<Senso, string> = {
  utilizacao: "Utilização (Seiri)",
  organizacao: "Organização (Seiton)",
  limpeza: "Limpeza (Seiso)",
  conservacao: "Conservação (Seiketsu)",
  disciplina: "Disciplina (Shitsuke)",
};

export function ehSenso(v: unknown): v is Senso {
  return typeof v === "string" && (SENSOS as readonly string[]).includes(v);
}

// --------------------------------------------------------------------
// EMBALAGENS (catálogo de Reepack e Despejo)
// --------------------------------------------------------------------
export const UNIDADES_REEPACK = ["cx", "pc"] as const;
export type UnidadeReepack = (typeof UNIDADES_REEPACK)[number];

export const ROTULO_UNIDADE_REEPACK: Record<UnidadeReepack, string> = {
  cx: "caixa",
  pc: "peça",
};

export function ehUnidadeReepack(v: unknown): v is UnidadeReepack {
  return typeof v === "string" && (UNIDADES_REEPACK as readonly string[]).includes(v);
}

export type Embalagem = {
  id: string;
  nome: string;
  tempoPadraoReepackSegundos: number | null;
  tempoPadraoDespejoSegundos: number | null;
  metaReepacksHora: number | null;
  metaLitrosHora: number | null;
  unidadeReepack: UnidadeReepack;
  litrosPorPacote: number | null;
};

export function embalagemDeLinha(l: {
  id: string;
  nome: string;
  tempo_padrao_reepack_segundos: number | null;
  tempo_padrao_despejo_segundos: number | null;
  meta_reepacks_hora: number | null;
  meta_litros_hora: number | null;
  unidade_reepack: string;
  litros_por_pacote: number | null;
}): Embalagem {
  return {
    id: l.id,
    nome: l.nome,
    tempoPadraoReepackSegundos: l.tempo_padrao_reepack_segundos,
    tempoPadraoDespejoSegundos: l.tempo_padrao_despejo_segundos,
    metaReepacksHora: l.meta_reepacks_hora,
    metaLitrosHora: l.meta_litros_hora,
    unidadeReepack: ehUnidadeReepack(l.unidade_reepack) ? l.unidade_reepack : "cx",
    litrosPorPacote: l.litros_por_pacote,
  };
}

// --------------------------------------------------------------------
// LANÇAMENTOS (reepack, despejo, picking) - o horário sempre em ISO
// --------------------------------------------------------------------
export type ReepackLancamento = {
  id: string;
  embalagemId: string;
  embalagemNome: string;
  colaboradorId: string;
  colaboradorNome: string;
  turno: Turno;
  quantidade: number;
  inicio: string;
  fim: string;
  observacao: string | null;
};

export type DespejoLancamento = {
  id: string;
  embalagemId: string;
  embalagemNome: string;
  colaboradorId: string;
  colaboradorNome: string;
  turno: Turno;
  litros: number;
  inicio: string;
  fim: string;
  observacao: string | null;
};

export type PickingLancamento = {
  id: string;
  colaboradorId: string;
  colaboradorNome: string;
  turno: Turno;
  inicio: string;
  fim: string | null;
  area: string | null;
  posicoesReabastecidas: number | null;
  observacao: string | null;
};

/** Horas entre dois ISO, sempre positivo (validação já garante fim > início). */
export function horasEntre(inicioISO: string, fimISO: string): number {
  const ms = new Date(fimISO).getTime() - new Date(inicioISO).getTime();
  return Math.max(ms, 0) / 3_600_000;
}

/** Taxa por hora (reepacks ou litros), 2 casas. */
export function taxaPorHora(quantidade: number, horas: number): number {
  if (horas <= 0) return 0;
  return Math.round((quantidade / horas) * 100) / 100;
}

/** % da meta atingida. Sem meta cadastrada, devolve null -- não é 0%. */
export function pctDaMeta(taxa: number, meta: number | null): number | null {
  if (meta === null || meta <= 0) return null;
  return Math.round((taxa / meta) * 1000) / 10;
}

/** Data local (dd/mm) + hora (HH:MM), fuso de São Félix/Barreiras. */
export function formatarDataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatarHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const DIA_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function hojeISO() {
  return DIA_SP.format(new Date());
}

export function diasAtrasISO(n: number) {
  return DIA_SP.format(new Date(Date.now() - n * 86_400_000));
}

export function formatarData(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// --------------------------------------------------------------------
// EMPILHADEIRA
// --------------------------------------------------------------------
export type Empilhadeira = { id: string; numero: string };

export type OperacaoEmpilhadeira = {
  id: string;
  empilhadeiraId: string;
  empilhadeiraNumero: string;
  operadorId: string;
  operadorNome: string;
  horimetroInicial: number;
  fotoInicialUrl: string;
  inicio: string;
  horimetroFinal: number | null;
  fotoFinalUrl: string | null;
  fim: string | null;
  encerradoPorNome: string | null;
  status: "aberta" | "encerrada";
};

/** Horas de máquina rodada. Sem horímetro final, usa "agora" -- é o tempo
 *  corrido de operação aberta, para o indicador de tempo ativo. */
export function horasDeOperacao(op: OperacaoEmpilhadeira, agora = new Date()) {
  const fimMs = op.fim ? new Date(op.fim).getTime() : agora.getTime();
  return Math.max(fimMs - new Date(op.inicio).getTime(), 0) / 3_600_000;
}

export function operacaoEmpilhadeiraDeLinha(l: {
  id: string;
  empilhadeira_id: string;
  operador_id: string;
  operador_nome: string;
  horimetro_inicial: number;
  foto_inicial_url: string;
  inicio: string;
  horimetro_final: number | null;
  foto_final_url: string | null;
  fim: string | null;
  encerrado_por_nome: string | null;
  status: "aberta" | "encerrada";
}): OperacaoEmpilhadeira {
  return {
    id: l.id,
    empilhadeiraId: l.empilhadeira_id,
    empilhadeiraNumero: "",
    operadorId: l.operador_id,
    operadorNome: l.operador_nome,
    horimetroInicial: l.horimetro_inicial,
    fotoInicialUrl: l.foto_inicial_url,
    inicio: l.inicio,
    horimetroFinal: l.horimetro_final,
    fotoFinalUrl: l.foto_final_url,
    fim: l.fim,
    encerradoPorNome: l.encerrado_por_nome,
    status: l.status,
  };
}

// --------------------------------------------------------------------
// TROCA DE GÁS
// --------------------------------------------------------------------
export type TrocaGas = {
  id: string;
  empilhadeiraId: string;
  operadorId: string;
  operadorNome: string;
  horimetro: number;
  fotoUrl: string;
  realizadaEm: string;
};

export function trocaGasDeLinha(l: {
  id: string;
  empilhadeira_id: string;
  operador_id: string;
  operador_nome: string;
  horimetro: number;
  foto_url: string;
  realizada_em: string;
}): TrocaGas {
  return {
    id: l.id,
    empilhadeiraId: l.empilhadeira_id,
    operadorId: l.operador_id,
    operadorNome: l.operador_nome,
    horimetro: l.horimetro,
    fotoUrl: l.foto_url,
    realizadaEm: l.realizada_em,
  };
}

/**
 * Litros/hora médio de uma sequência de trocas da MESMA máquina, já
 * ordenada da mais antiga para a mais nova. Cada intervalo é a diferença
 * de horímetro entre uma troca e a anterior -- é o que "fecha" a troca
 * anterior na prática, sem precisar de um passo separado (decisão
 * explícita: sem bloqueio, sem abrir/fechar).
 */
export function horasMediasPorTrocaGas(trocas: TrocaGas[]): number | null {
  if (trocas.length < 2) return null;
  const intervalos: number[] = [];
  for (let i = 1; i < trocas.length; i++) {
    const diff = trocas[i].horimetro - trocas[i - 1].horimetro;
    if (diff > 0) intervalos.push(diff);
  }
  if (intervalos.length === 0) return null;
  return Math.round((intervalos.reduce((s, v) => s + v, 0) / intervalos.length) * 10) / 10;
}

// --------------------------------------------------------------------
// RECEBIMENTO DE PALETES
// --------------------------------------------------------------------
export type Produto = { id: string; codigo: string; descricao: string };
export type Fabrica = { id: string; nome: string };
export type Transportadora = { id: string; nome: string };

export type ItemRecebimento = {
  id: string;
  produtoId: string;
  produtoCodigo: string;
  produtoDescricao: string;
  quantidadeRecebida: number;
  quantidadeAvariada: number;
  pctAvaria: number;
};

export type Recebimento = {
  id: string;
  fabricaNome: string;
  transportadoraNome: string;
  placaCavalo: string | null;
  placaCarreta: string;
  motoristas: string;
  conferenteNome: string;
  ajudanteNome: string | null;
  operadorNome: string | null;
  dataRecebimento: string;
  itens: ItemRecebimento[];
};

/** % de avaria consolidado do recebimento inteiro: soma avariado / soma recebido. */
export function pctAvariaConsolidado(itens: ItemRecebimento[]): number {
  const recebido = itens.reduce((s, i) => s + i.quantidadeRecebida, 0);
  const avariado = itens.reduce((s, i) => s + i.quantidadeAvariada, 0);
  if (recebido === 0) return 0;
  return Math.round((avariado / recebido) * 1000) / 10;
}

/** Limite acima do qual a % de avaria vira alerta na tela (visual só, sem
 *  fluxo de não-conformidade automático -- ver decisão da entrega). */
export const LIMITE_AVARIA_ALERTA = 2;

// --------------------------------------------------------------------
// 5S DO ARMAZÉM
// --------------------------------------------------------------------
export type ItemChecklist5s = { id: string; senso: Senso; descricao: string };

export type Execucao5s = {
  id: string;
  responsavelId: string;
  responsavelNome: string;
  inicio: string;
  fim: string | null;
  observacoes: string | null;
  itensExecutadosIds: string[];
};

// --------------------------------------------------------------------
// VALIDAÇÃO DE FORMULÁRIO
// --------------------------------------------------------------------
export function numeroPositivo(v: unknown, max = 1_000_000): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > max) {
    throw new Error("Valor inválido: use um número maior que zero.");
  }
  return n;
}

export function inteiroNaoNegativo(v: unknown, max = 1_000_000): number {
  const n = Number(v === "" || v === null || v === undefined ? 0 : v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > max) {
    throw new Error("Valor inválido: use um número inteiro, sem casas decimais.");
  }
  return n;
}

/** Início/fim vindos de <input type="datetime-local">, validados e em ISO. */
export function periodoValido(inicioLocal: unknown, fimLocal: unknown) {
  const inicio = String(inicioLocal ?? "");
  const fim = String(fimLocal ?? "");
  const dataInicio = new Date(inicio);
  const dataFim = new Date(fim);
  if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
    throw new Error("Informe o horário de início e de fim.");
  }
  if (dataFim <= dataInicio) {
    throw new Error("O horário de fim precisa ser depois do início.");
  }
  return { inicio: dataInicio.toISOString(), fim: dataFim.toISOString() };
}

// --------------------------------------------------------------------
// RANKING
// --------------------------------------------------------------------
export type PontuacaoRanking = {
  colaboradorId: string;
  colaboradorNome: string;
  reepacksPctMeta: number | null;
  despejoPctMeta: number | null;
  posicoesPicking: number;
  totalReepacks: number;
  totalDespejoLitros: number;
  /** Quantas linhas de atividade (reepack + despejo + picking) a pessoa
   *  registrou -- é o critério de desempate: mesma pontuação, ganha quem
   *  fez mais lançamentos no período. */
  totalAtividades: number;
  pontuacao: number;
};

/**
 * Pontuação simples: média das % de meta atingidas em reepack e despejo
 * (só entram as que têm meta cadastrada), mais 1 ponto a cada 20 posições
 * de picking reabastecidas -- dá para pontuar mesmo quem só faz picking.
 * Não é ciência de dados, é o placar que o time entende de cabeça.
 */
export function calcularPontuacao(
  reepacksPctMeta: number | null,
  despejoPctMeta: number | null,
  posicoesPicking: number,
): number {
  const percentuais = [reepacksPctMeta, despejoPctMeta].filter(
    (p): p is number => p !== null,
  );
  const mediaPct =
    percentuais.length > 0
      ? percentuais.reduce((s, p) => s + p, 0) / percentuais.length
      : 0;
  return Math.round(mediaPct + posicoesPicking / 20);
}

// --------------------------------------------------------------------
// DASHBOARD -- agregação em cima de um recorte de período (ver nota no
// topo do arquivo: sem tabela de consolidação, calcula na leitura).
// --------------------------------------------------------------------
export type LinhaIndicadorEmbalagem = {
  embalagemId: string;
  embalagemNome: string;
  quantidade: number;
  horas: number;
  taxa: number;
  meta: number | null;
  pctMeta: number | null;
};

/** Soma quantidade/litros e horas por embalagem, e calcula a taxa. Serve
 *  tanto para reepack (quantidade) quanto para despejo (litros) -- quem
 *  chama decide qual campo é "quantidade". */
export function agruparPorEmbalagem(
  lancamentos: { embalagemId: string; quantidade: number; inicio: string; fim: string }[],
  embalagens: Embalagem[],
  pegarMeta: (e: Embalagem) => number | null,
): LinhaIndicadorEmbalagem[] {
  const porEmbalagem = new Map<string, { quantidade: number; horas: number }>();
  for (const l of lancamentos) {
    const atual = porEmbalagem.get(l.embalagemId) ?? { quantidade: 0, horas: 0 };
    atual.quantidade += l.quantidade;
    atual.horas += horasEntre(l.inicio, l.fim);
    porEmbalagem.set(l.embalagemId, atual);
  }

  return [...porEmbalagem.entries()]
    .map(([embalagemId, soma]) => {
      const embalagem = embalagens.find((e) => e.id === embalagemId);
      const taxa = taxaPorHora(soma.quantidade, soma.horas);
      const meta = embalagem ? pegarMeta(embalagem) : null;
      return {
        embalagemId,
        embalagemNome: embalagem?.nome ?? "—",
        quantidade: soma.quantidade,
        horas: Math.round(soma.horas * 10) / 10,
        taxa,
        meta,
        pctMeta: pctDaMeta(taxa, meta),
      };
    })
    .sort((a, b) => b.quantidade - a.quantidade);
}

/**
 * Ranking por colaborador e turno: uma linha por pessoa, com a média das
 * % de meta em reepack/despejo e as posições de picking somadas. Turno
 * filtra o recorte ANTES de chamar esta função -- passar só as linhas do
 * turno que interessa já produz o ranking "daquele turno".
 */
export function construirRanking(
  reepacks: { colaboradorId: string; colaboradorNome: string; embalagemId: string; quantidade: number; inicio: string; fim: string }[],
  despejos: { colaboradorId: string; colaboradorNome: string; embalagemId: string; litros: number; inicio: string; fim: string }[],
  pickings: { colaboradorId: string; colaboradorNome: string; posicoesReabastecidas: number | null }[],
  embalagens: Embalagem[],
): PontuacaoRanking[] {
  const pessoas = new Map<string, string>();
  for (const r of reepacks) pessoas.set(r.colaboradorId, r.colaboradorNome);
  for (const d of despejos) pessoas.set(d.colaboradorId, d.colaboradorNome);
  for (const p of pickings) pessoas.set(p.colaboradorId, p.colaboradorNome);

  const resultado: PontuacaoRanking[] = [];
  for (const [colaboradorId, colaboradorNome] of pessoas) {
    const meusReepacks = reepacks.filter((r) => r.colaboradorId === colaboradorId);
    const meusDespejos = despejos.filter((d) => d.colaboradorId === colaboradorId);
    const minhasPosicoes = pickings
      .filter((p) => p.colaboradorId === colaboradorId)
      .reduce((s, p) => s + (p.posicoesReabastecidas ?? 0), 0);

    const reepacksAgrupados = agruparPorEmbalagem(meusReepacks, embalagens, (e) => e.metaReepacksHora);
    const despejosAgrupados = agruparPorEmbalagem(
      meusDespejos.map((d) => ({ ...d, quantidade: d.litros })),
      embalagens,
      (e) => e.metaLitrosHora,
    );

    const reepacksPctMeta = mediaPct(reepacksAgrupados.map((r) => r.pctMeta));
    const despejoPctMeta = mediaPct(despejosAgrupados.map((d) => d.pctMeta));

    resultado.push({
      colaboradorId,
      colaboradorNome,
      reepacksPctMeta,
      despejoPctMeta,
      posicoesPicking: minhasPosicoes,
      totalReepacks: meusReepacks.reduce((s, r) => s + r.quantidade, 0),
      totalDespejoLitros: Math.round(meusDespejos.reduce((s, d) => s + d.litros, 0) * 10) / 10,
      totalAtividades: meusReepacks.length + meusDespejos.length + pickings.filter((p) => p.colaboradorId === colaboradorId).length,
      pontuacao: calcularPontuacao(reepacksPctMeta, despejoPctMeta, minhasPosicoes),
    });
  }

  // Desempate: mesma pontuação, ganha quem registrou mais atividades no
  // período -- critério explícito, não sorte de ordenação de array.
  return resultado.sort((a, b) => b.pontuacao - a.pontuacao || b.totalAtividades - a.totalAtividades);
}

function mediaPct(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null);
  if (validos.length === 0) return null;
  return Math.round((validos.reduce((s, v) => s + v, 0) / validos.length) * 10) / 10;
}
