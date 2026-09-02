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

/**
 * Onde o filtro de Cluster/Tipo do Reepack fica lembrado -- cookie, e não
 * localStorage, pro SERVIDOR já desenhar a tela com o filtro certo (mesmo
 * raciocínio de COOKIE_ULTIMA em lib/ativo-giro.ts: com localStorage a
 * tela nasceria sem filtro e corrigiria só depois de montar -- pisca, e
 * ainda dependeria de sincronizar estado dentro de um efeito). O
 * formulário grava os dois assim que a pessoa troca um seletor.
 */
export const COOKIE_REEPACK_CLUSTER = "pa_reepack_cluster";
export const COOKIE_REEPACK_TIPO = "pa_reepack_tipo";
export const COOKIE_REEPACK_PATH = "/produtividade-armazem/reepack";
export const COOKIE_REEPACK_DIAS = 180;

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

/**
 * As duas etapas cronometradas do POP-ARM-001 (migration 065). São
 * atividades separadas de propósito: um lote muito avariado consome o
 * tempo na Seleção, e somar tudo num número só fazia isso aparecer como
 * "repack lento".
 *
 * Os gatilhos vêm literalmente do POP (aba "Guia de Etapas" da
 * cronoanálise) e aparecem na tela porque cronometragem só serve para
 * alguma coisa se todo mundo começar e parar o relógio no mesmo ponto --
 * duas pessoas com critérios diferentes produzem dois números que não
 * dá para comparar. Por isso o "não entra" também está aqui: é onde a
 * medição costuma escorregar.
 */
export const ETAPAS_REEPACK = ["selecao", "repack"] as const;
export type EtapaReepack = (typeof ETAPAS_REEPACK)[number];

export function ehEtapaReepack(v: unknown): v is EtapaReepack {
  return typeof v === "string" && (ETAPAS_REEPACK as readonly string[]).includes(v);
}

export const ETAPA_REEPACK: Record<
  EtapaReepack,
  {
    rotulo: string;
    curto: string;
    emoji: string;
    secoesPop: string;
    inicio: string;
    /** Onde no padrão está o gatilho de INÍCIO. Fica ao lado da frase, e
     *  não só no rodapé: quem discorda do gatilho precisa saber onde
     *  conferir sem procurar. */
    refInicio: string;
    fim: string;
    refFim: string;
    naoEntra: string;
    unidade: string;
  }
> = {
  selecao: {
    rotulo: "Seleção e Triagem",
    curto: "Seleção",
    emoji: "🔍",
    secoesPop: "POP-ARM-001, seções 7.2, 7.3 e 7.4",
    // Lavar e secar SAÍRAM daqui (30/08/2026, correção do dono): lavar
    // embalagem não faz parte do padrão -- e o que não se lava não se
    // seca. O que a etapa tem é inspeção e separação.
    inicio:
      "Você começa a inspecionar o lote/pallet avariado: verifica a embalagem, classifica a avaria e separa o que é impróprio (descarte) do que está conforme, inspecionando cada embalagem uma a uma.",
    refInicio: "POP-ARM-001, seções 7.2 e 7.3",
    fim: "O produto já está triado — pronto na bancada para ser reembalado.",
    refFim: "POP-ARM-001, seção 7.4",
    naoEntra:
      "Deslocamento até a bombona de descarte, preenchimento do BO de quebra e tempo parado esperando pallet.",
    unidade: "unidades triadas",
  },
  repack: {
    rotulo: "Reembalagem (Repack)",
    curto: "Repack",
    emoji: "📦",
    secoesPop: "POP-ARM-001, seções 7.5 e 7.6",
    inicio:
      "Você começa a cortar o Shrink na medida (régua da bancada) para a embalagem que já saiu da Seleção.",
    refInicio: "POP-ARM-001, seção 7.5",
    fim: "A sopradora térmica termina o encolhimento do Shrink e o pacote está pronto e finalizado.",
    refFim: "POP-ARM-001, seção 7.6",
    naoEntra: "O tempo de seleção e triagem (Etapa 1) e o tempo de inspeção final.",
    unidade: "caixas reembaladas",
  },
};

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
// PRODUTO (Reepack/Despejo por produto -- ver migration 054 e 060)
// --------------------------------------------------------------------
// Antes, Reepack/Despejo pediam a EMBALAGEM genérica ("Lata 350ml C/12").
// Agora a pessoa escolhe o PRODUTO específico, e o litro sai sozinho do
// Fator Hecto que já vem pronto do SAP -- sem conta de cabeça, sem
// digitação manual. Só produto com fatorHecto E embalagemId preenchidos
// entra na lista de escolha do lançamento. Desde a 060, cluster, tipo,
// caixas/pallet, embalagem e meta (reepack em cx/h, despejo em L/h) vêm
// todos juntos de uma planilha reimportada pelo Admin -- ver
// importarPlanilhaProdutos em admin/produtividade-armazem/actions.ts.
export type ProdutoReepack = {
  id: string;
  codigo: string;
  descricao: string;
  clusterProduto: string | null;
  unidadesPorCaixa: number | null;
  caixasPallet: number | null;
  fatorHecto: number | null;
  tipo: string | null;
  embalagemId: string | null;
  metaReepackHora: number | null;
  metaDespejoHora: number | null;
};

export function produtoReepackDeLinha(l: {
  id: string;
  codigo: string;
  descricao: string;
  cluster_produto?: string | null;
  unidades_por_caixa: number | null;
  caixas_pallet?: number | null;
  fator_hecto: number | null;
  tipo?: string | null;
  embalagem_id: string | null;
  meta_reepack_hora?: number | null;
  meta_despejo_hora?: number | null;
}): ProdutoReepack {
  return {
    id: l.id,
    codigo: l.codigo,
    descricao: l.descricao,
    clusterProduto: l.cluster_produto ?? null,
    unidadesPorCaixa: l.unidades_por_caixa,
    caixasPallet: l.caixas_pallet ?? null,
    fatorHecto: l.fator_hecto,
    tipo: l.tipo ?? null,
    embalagemId: l.embalagem_id,
    metaReepackHora: l.meta_reepack_hora ?? null,
    metaDespejoHora: l.meta_despejo_hora ?? null,
  };
}

/** Só os campos que a agregação do dashboard precisa (id, rótulo, meta) --
 *  ProdutoReepack serve aqui também (é um superconjunto), mas os pontos
 *  que só olham meta (indicadores/page.tsx) não precisam buscar codigo,
 *  fatorHecto etc. do banco só pra montar o tipo certo. Só Reepack usa
 *  isto -- Despejo é por embalagem (ver EmbalagemDespejo). */
export type ProdutoMeta = {
  id: string;
  descricao: string;
  metaReepackHora: number | null;
};

/** Pronto para aparecer no lançamento: precisa do litro E da embalagem
 *  (a embalagem é o que alimenta a meta de tempo por tipo). */
export function produtoProntoParaReepack(p: ProdutoReepack): boolean {
  return p.fatorHecto !== null && p.embalagemId !== null;
}

/** Litros de UMA caixa: Fator Hecto (hectolitros/caixa) x 100. */
export function litrosPorCaixa(fatorHecto: number): number {
  return Math.round(fatorHecto * 100 * 1000) / 1000;
}

// --------------------------------------------------------------------
// EMBALAGEM (Despejo -- volta a ser por embalagem, não por produto)
// --------------------------------------------------------------------
// Reepack continua por PRODUTO (ver acima). Despejo volta a ser por
// EMBALAGEM: o produto específico não importa pra essa operação, o que
// importa é o tipo de embalagem despejada -- pedido do dono depois de
// usar o app por um tempo. Catálogo PRÓPRIO (pa_embalagens_despejo,
// migration 064) -- diferente do catálogo do Repack (pa_embalagens):
// a planilha de produtos manda um nome de embalagem pro Repack e outro,
// mais simples, pro Despejo ("LATA 350ML C/12" vs "LATA 350ML").
// litrosPorUnidade é o litro de UMA unidade despejada (não mais do
// pacote/caixa inteiro -- pedido do dono, 26/08/2026); metaLitrosHora é
// a meta de despejo, por embalagem.
export type EmbalagemDespejo = {
  id: string;
  nome: string;
  litrosPorUnidade: number | null;
  metaLitrosHora: number | null;
};

export function embalagemDespejoDeLinha(l: {
  id: string;
  nome: string;
  litros_por_unidade: number | null;
  meta_litros_hora: number | null;
}): EmbalagemDespejo {
  return {
    id: l.id,
    nome: l.nome,
    litrosPorUnidade: l.litros_por_unidade,
    metaLitrosHora: l.meta_litros_hora,
  };
}

/** Pronta para aparecer no lançamento de despejo: precisa do litro por
 *  unidade cadastrado -- sem isso não dá pra converter unidades em litros. */
export function embalagemProntaParaDespejo(e: EmbalagemDespejo): boolean {
  return e.litrosPorUnidade !== null;
}

// --------------------------------------------------------------------
// LANÇAMENTOS (reepack, despejo, picking) - o horário sempre em ISO
// --------------------------------------------------------------------
export type ReepackLancamento = {
  id: string;
  embalagemId: string;
  embalagemNome: string;
  produtoId: string | null;
  produtoDescricao: string | null;
  colaboradorId: string;
  colaboradorNome: string;
  turno: Turno;
  quantidade: number;
  litrosCalculados: number | null;
  inicio: string;
  fim: string;
  observacao: string | null;
};

export type DespejoLancamento = {
  id: string;
  embalagemId: string;
  embalagemNome: string;
  produtoId: string | null;
  produtoDescricao: string | null;
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

/** Duração média (h) de uma lista de itens com início/fim -- serve pra
 *  "quanto tempo dura um reepack, em média", sem quebrar por embalagem. */
export function mediaHorasPorItem(itens: { inicio: string; fim: string }[]): number {
  if (itens.length === 0) return 0;
  const total = itens.reduce((s, i) => s + horasEntre(i.inicio, i.fim), 0);
  return Math.round((total / itens.length) * 100) / 100;
}

/** Mesma ideia de formatarDuracao, mas a partir de um número de horas já
 *  calculado (médias, totais) em vez de duas datas -- pra nunca mostrar
 *  "0h" quando o real é "3 min". */
export function formatarHoras(horas: number): string {
  if (horas <= 0) return "0s";
  const segundos = horas * 3600;
  if (segundos < 60) return `${Math.round(segundos)}s`;
  const minutos = segundos / 60;
  if (minutos < 60) return `${Math.round(minutos)} min`;
  return `${Math.round(horas * 10) / 10}h`;
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

/**
 * Duração legível entre dois ISO, na unidade que faz sentido pro
 * tamanho -- segundos abaixo de 1 minuto, minutos abaixo de 1 hora,
 * horas dali pra cima. Sem isso, um lançamento de poucos segundos
 * (ex.: teste rápido) só aparece como uma taxa por hora extrapolada
 * gigante ("745 cx/h"), sem contexto de que a "hora" ali é imaginária.
 */
export function formatarDuracao(inicioISO: string, fimISO: string): string {
  const segundos = Math.max((new Date(fimISO).getTime() - new Date(inicioISO).getTime()) / 1000, 0);
  if (segundos < 60) return `${Math.round(segundos)}s`;
  const minutos = segundos / 60;
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const horas = minutos / 60;
  return `${Math.round(horas * 10) / 10}h`;
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

/** O DIA de um timestamp, no fuso da operação -- não no do servidor.
 *  A Vercel roda em UTC: usar a data crua jogaria tudo que acontece
 *  depois das 21h para o dia seguinte, bem no fim do turno da noite. */
export function diaLocalISO(iso: string) {
  return DIA_SP.format(new Date(iso));
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

/** Horas de máquina rodada, no relógio (início → fim, ou "agora" se ainda
 *  aberta) -- serve pra mostrar "há quanto tempo essa operação está
 *  aberta", não é um indicador de produtividade. */
export function horasDeOperacao(op: OperacaoEmpilhadeira, agora = new Date()) {
  const fimMs = op.fim ? new Date(op.fim).getTime() : agora.getTime();
  return Math.max(fimMs - new Date(op.inicio).getTime(), 0) / 3_600_000;
}

/**
 * Horas ATIVAS de verdade: o horímetro só anda com o motor ligado, então
 * horímetro final − inicial é a hora real de máquina rodando -- diferente
 * do tempo decorrido entre início e fim, que conta parada, intervalo,
 * troca de turno etc. Só existe depois que a operação fecha (o horímetro
 * final só é lido no fechamento); `null` enquanto estiver aberta.
 */
export function horasAtivasDeOperacao(op: OperacaoEmpilhadeira): number | null {
  if (op.horimetroFinal === null) return null;
  return Math.round((op.horimetroFinal - op.horimetroInicial) * 10) / 10;
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
  /** HL abastecidos no picking. Substituiu "posições reabastecidas" em
   *  29/08/2026: aquele campo era opcional e ficou nulo em 100% das
   *  sessões, então o picking nunca pontuou de fato. */
  hlPicking: number;
  /** % da TAXA média (HL/h) do grupo no mesmo recorte -- não do total,
   *  pela mesma razão da Seleção: quem abasteceu 2 horas não é melhor
   *  que quem abasteceu 1 hora no mesmo ritmo. */
  pickingPctMedia: number | null;
  totalReepacks: number;
  totalDespejoLitros: number;
  totalExecucoes5s: number;
  /** % da média de execuções de 5S por pessoa do mesmo recorte -- mesma
   *  ideia do picking, agora o 5S entra na pontuação de verdade (antes
   *  era só informativo). */
  cincoSPctMedia: number | null;
  /** Unidades triadas na Seleção (etapa 1 do Repack). */
  totalSelecao: number;
  /** % da TAXA média (un/h) do grupo no mesmo recorte -- não do total,
   *  senão quem triou mais tempo ganharia de quem triou mais rápido. */
  selecaoPctMedia: number | null;
  /** Quantas linhas de atividade (reepack + despejo + picking + 5S) a
   *  pessoa registrou. Informativo -- deixou de ser o desempate, porque
   *  premiava quem fatiava o trabalho em muitos lançamentos curtos. */
  totalAtividades: number;
  /**
   * Horas com tempo medido no período. É o PESO da nota e o desempate --
   * e a razão de existir de HORAS_MINIMAS_NO_RANKING.
   */
  horasApontadas: number;
  /**
   * `null` quando a amostra é curta demais para virar nota (ver
   * HORAS_MINIMAS_NO_RANKING). A pessoa aparece na lista com o que
   * produziu, mas sem posição -- ausência de medição não é desempenho
   * ruim, e mostrá-la como zero seria dizer que foi.
   */
  pontuacao: number | null;
};

/**
 * % de um valor sobre a média de um grupo -- é como picking e 5S entram
 * na pontuação no MESMO formato de reepack/despejo (uma porcentagem),
 * mesmo sem ter meta cadastrada: a referência vira a média de todo mundo
 * no mesmo recorte (turno/período), em vez de um número fixo no cadastro.
 * `null` sem grupo pra comparar (grupo vazio ou média zero).
 */
export function pctRelativoAoGrupo(valor: number | null, mediaGrupo: number | null): number | null {
  if (valor === null || mediaGrupo === null || mediaGrupo <= 0) return null;
  return Math.round((valor / mediaGrupo) * 1000) / 10;
}

/**
 * Taxa de abastecimento do picking em HL/h, do recorte passado (pessoa,
 * turno ou o período inteiro). `null` sem sessão válida -- é "sem dado",
 * não zero.
 *
 * É `mediaTaxaPorPessoa` com a quantidade em HL: soma o HL e divide pelo
 * tempo total, em vez de tirar média das taxas de cada sessão. Trocou a
 * média de "posições reabastecidas" em 29/08/2026, junto com o módulo.
 */
export function mediaHlPicking(
  sessoes: { quantidade: number; inicio: string; fim: string }[],
): number | null {
  return mediaTaxaPorPessoa(sessoes);
}

/** Média de execuções de 5S por pessoa distinta, sobre o recorte passado. */
export function mediaExecucoes5sPorPessoa(execucoes: { colaboradorId: string }[]): number | null {
  if (execucoes.length === 0) return null;
  const pessoas = new Set(execucoes.map((e) => e.colaboradorId));
  return execucoes.length / pessoas.size;
}

/**
 * Taxa média (itens por hora) de um conjunto de lançamentos, por pessoa.
 *
 * Soma tudo e divide pelo tempo total, em vez de tirar média das taxas
 * de cada lançamento: dois lançamentos de tamanhos muito diferentes
 * puxariam a média para o menor deles. Mesma escolha já feita na
 * duração média do reepack.
 */
export function mediaTaxaPorPessoa(
  lancamentos: { quantidade: number; inicio: string; fim: string }[],
): number | null {
  if (lancamentos.length === 0) return null;
  const total = lancamentos.reduce((s, l) => s + l.quantidade, 0);
  const horas = lancamentos.reduce((s, l) => s + horasEntre(l.inicio, l.fim), 0);
  if (horas <= 0) return null;
  return Math.round((total / horas) * 10) / 10;
}

/**
 * Pontuação: média simples das até 5 métricas que a pessoa (ou turno)
 * realmente tem, todas na mesma escala de %:
 *  - Reepack: % da meta cadastrada por produto; Despejo: % da meta
 *    cadastrada por embalagem (pctDaMeta nos dois casos).
 *  - Picking, 5S e Seleção: % da média do grupo no mesmo recorte
 *    (pctRelativoAoGrupo) -- não têm meta cadastrada, então a régua é
 *    "comparado com todo mundo", pra ficar justo com as outras métricas
 *    em vez de somar pontos soltos por HL/execução. Picking e Seleção
 *    comparam a TAXA (HL/h e un/h), não o total: quem trabalhou mais
 *    tempo não passa na frente de quem rendeu mais rápido.
 * Quem não fez uma atividade simplesmente não entra na média dela --
 * ninguém é punido por não picotar, só pontuado pelo que fez.
 *
 * Seleção e Triagem entrou em 28/08/2026, quando virou etapa própria do
 * Repack (migration 065). Fica na régua do grupo, e não em meta, porque
 * a meta dela é justamente o que a cronoanálise está medindo.
 */
export type ParcelaDaNota = { pct: number | null; horas: number };

/**
 * Horas apontadas abaixo das quais a pessoa NÃO recebe pontuação.
 *
 * Não é rigor por rigor. Medido em 03/09/2026: um terço dos lançamentos
 * dura menos de 3 minutos, e o menor tem 18 segundos. Uma taxa calculada
 * em cima de 18 segundos não descreve ritmo nenhum -- descreve o
 * arredondamento. Com amostra curta a pessoa aparece na lista, com o que
 * produziu, mas sem nota: liderar um ranking com 24 minutos de trabalho é
 * o que faz o resto do time parar de acreditar nele.
 */
export const HORAS_MINIMAS_NO_RANKING = 1;

/**
 * Média das parcelas PONDERADA PELAS HORAS de cada uma.
 *
 * É o conserto da injustiça que o dono apontou. A pontuação era média
 * SIMPLES, em dois níveis (entre produtos e entre atividades), e nenhum
 * deles olhava o tempo. Duas consequências, as duas medidas no dado real:
 *
 *   Quem trabalhou 24 minutos numa atividade disputava de igual para
 *   igual com quem trabalhou 14 horas em três.
 *
 *   Quem faz MAIS atividades era penalizado: uma nota ruim pesava 1/5 em
 *   vez de 1/1, então especializar-se na atividade mais fácil rendia
 *   mais do que ajudar em tudo.
 *
 * Ponderando pelas horas, cada atividade pesa o que ocupou do dia --
 * que é exatamente o que "produtividade" quer dizer. Um lançamento de 2
 * minutos com taxa absurda continua entrando, mas com o peso de 2
 * minutos.
 *
 * `null` quando não há nenhuma parcela com pct e tempo -- e não zero, que
 * afirmaria desempenho ruim onde não houve medição.
 */
export function mediaPonderadaPorHoras(parcelas: ParcelaDaNota[]): number | null {
  let soma = 0;
  let peso = 0;
  for (const p of parcelas) {
    if (p.pct === null || !(p.horas > 0)) continue;
    soma += p.pct * p.horas;
    peso += p.horas;
  }
  if (peso <= 0) return null;
  return Math.round((soma / peso) * 10) / 10;
}

/**
 * Pontuação da pessoa (ou do turno): quanto ela entregou em relação ao
 * esperado, no tempo que trabalhou.
 *
 * Só entram atividades com TEMPO MEDIDO -- reepack, despejo, picking e
 * seleção. O 5S ficou de fora da nota (mudança de 03/09/2026): as
 * execuções não têm início e fim, então não há como pesá-las por tempo, e
 * incluí-las obrigaria a inventar uma duração. Elas continuam visíveis na
 * linha da pessoa, ao lado da nota; o que mudou é que deixaram de mexer
 * num número que agora significa "ritmo".
 *
 * `null` quando a amostra é curta demais para significar alguma coisa
 * (ver HORAS_MINIMAS_NO_RANKING).
 */
export function calcularPontuacao(parcelas: ParcelaDaNota[]): number | null {
  const horas = parcelas.reduce((s, p) => s + (p.pct !== null ? p.horas : 0), 0);
  if (horas < HORAS_MINIMAS_NO_RANKING) return null;
  const media = mediaPonderadaPorHoras(parcelas);
  return media === null ? null : Math.round(media);
}

// --------------------------------------------------------------------
// DASHBOARD -- agregação em cima de um recorte de período (ver nota no
// topo do arquivo: sem tabela de consolidação, calcula na leitura).
// --------------------------------------------------------------------
export type LinhaIndicadorProduto = {
  produtoId: string;
  produtoDescricao: string;
  quantidade: number;
  horas: number;
  taxa: number;
  meta: number | null;
  pctMeta: number | null;
};

/** Soma quantidade/litros e horas por produto, e calcula a taxa. Serve
 *  tanto para reepack (quantidade) quanto para despejo (litros) -- quem
 *  chama decide qual campo é "quantidade". A meta é por PRODUTO (desde a
 *  060), não mais por embalagem: dois produtos na mesma embalagem podem
 *  ter ritmo de meta diferente. */
export function agruparPorProduto(
  lancamentos: { produtoId: string; quantidade: number; inicio: string; fim: string }[],
  produtos: ProdutoMeta[],
  pegarMeta: (p: ProdutoMeta) => number | null,
): LinhaIndicadorProduto[] {
  const porProduto = new Map<string, { quantidade: number; horas: number }>();
  for (const l of lancamentos) {
    const atual = porProduto.get(l.produtoId) ?? { quantidade: 0, horas: 0 };
    atual.quantidade += l.quantidade;
    atual.horas += horasEntre(l.inicio, l.fim);
    porProduto.set(l.produtoId, atual);
  }

  return [...porProduto.entries()]
    .map(([produtoId, soma]) => {
      const produto = produtos.find((p) => p.id === produtoId);
      const taxa = taxaPorHora(soma.quantidade, soma.horas);
      const meta = produto ? pegarMeta(produto) : null;
      return {
        produtoId,
        produtoDescricao: produto?.descricao ?? "produto removido",
        quantidade: soma.quantidade,
        horas: Math.round(soma.horas * 10) / 10,
        taxa,
        meta,
        pctMeta: pctDaMeta(taxa, meta),
      };
    })
    .sort((a, b) => b.quantidade - a.quantidade);
}

export type LinhaIndicadorEmbalagem = {
  embalagemId: string;
  embalagemNome: string;
  quantidade: number;
  horas: number;
  taxa: number;
  meta: number | null;
  pctMeta: number | null;
};

/** Mesma ideia de agruparPorProduto, só que por embalagem -- é o que
 *  Despejo usa agora (Reepack continua por produto, ver acima). */
export function agruparPorEmbalagem(
  lancamentos: { embalagemId: string; quantidade: number; inicio: string; fim: string }[],
  embalagens: EmbalagemDespejo[],
  pegarMeta: (e: EmbalagemDespejo) => number | null,
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
        embalagemNome: embalagem?.nome ?? "embalagem removida",
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
 * % de meta em reepack/despejo e o HL de picking somado. Turno
 * filtra o recorte ANTES de chamar esta função -- passar só as linhas do
 * turno que interessa já produz o ranking "daquele turno".
 */
export function construirRanking(
  reepacks: { colaboradorId: string; colaboradorNome: string; produtoId: string; quantidade: number; inicio: string; fim: string }[],
  despejos: { colaboradorId: string; colaboradorNome: string; embalagemId: string; litros: number; inicio: string; fim: string }[],
  /** Abastecimento do picking, com `quantidade` em HL -- a mesma forma
   *  das seleções, porque a régua dos dois é a taxa por hora. */
  pickings: { colaboradorId: string; colaboradorNome: string; quantidade: number; inicio: string; fim: string }[],
  execucoes5s: { colaboradorId: string; colaboradorNome: string }[],
  produtos: ProdutoMeta[],
  embalagens: EmbalagemDespejo[],
  /** Seleção e Triagem (etapa 1 do Repack). Sem meta cadastrada, entra
   *  pela régua do grupo -- ver calcularPontuacao. */
  selecoes: { colaboradorId: string; colaboradorNome: string; quantidade: number; inicio: string; fim: string }[] = [],
): PontuacaoRanking[] {
  const pessoas = new Map<string, string>();
  for (const r of reepacks) pessoas.set(r.colaboradorId, r.colaboradorNome);
  for (const d of despejos) pessoas.set(d.colaboradorId, d.colaboradorNome);
  for (const p of pickings) pessoas.set(p.colaboradorId, p.colaboradorNome);
  for (const e of execucoes5s) pessoas.set(e.colaboradorId, e.colaboradorNome);
  for (const s of selecoes) pessoas.set(s.colaboradorId, s.colaboradorNome);

  // Referência do grupo (todo mundo deste recorte) para picking, 5S e
  // seleção -- ver pctRelativoAoGrupo: sem meta cadastrada, a régua é a
  // média de quem participou, não um número fixo.
  const mediaHlPickingGrupo = mediaHlPicking(pickings);
  const mediaExecucoes5sGrupo = mediaExecucoes5sPorPessoa(execucoes5s);
  // A régua da seleção é a TAXA (un/h), não o total: quem triou 2 horas
  // não é melhor que quem triou 1 hora no mesmo ritmo.
  const mediaTaxaSelecaoGrupo = mediaTaxaPorPessoa(selecoes);

  const resultado: PontuacaoRanking[] = [];
  for (const [colaboradorId, colaboradorNome] of pessoas) {
    const meusReepacks = reepacks.filter((r) => r.colaboradorId === colaboradorId);
    const meusDespejos = despejos.filter((d) => d.colaboradorId === colaboradorId);
    const minhasExecucoes5s = execucoes5s.filter((e) => e.colaboradorId === colaboradorId);
    const meusPickings = pickings.filter((p) => p.colaboradorId === colaboradorId);
    const meuHlPicking = Math.round(meusPickings.reduce((s, p) => s + p.quantidade, 0) * 10) / 10;

    const reepacksAgrupados = agruparPorProduto(meusReepacks, produtos, (p) => p.metaReepackHora);
    const despejosAgrupados = agruparPorEmbalagem(
      meusDespejos.map((d) => ({ ...d, quantidade: d.litros })),
      embalagens,
      (e) => e.metaLitrosHora,
    );

    const minhasSelecoes = selecoes.filter((s) => s.colaboradorId === colaboradorId);

    /*
      PONDERADO PELAS HORAS já aqui, no nível do produto.

      Era `mediaPct` -- média simples entre as linhas de produto. Um
      produto com 2 minutos e 300% da meta pesava o mesmo que um produto
      com 6 horas e 100%. Este é o primeiro dos dois níveis de média
      simples que faziam o ranking mentir; o segundo está em
      calcularPontuacao.
    */
    const reepacksPctMeta = mediaPonderadaPorHoras(
      reepacksAgrupados.map((r) => ({ pct: r.pctMeta, horas: r.horas })),
    );
    const despejoPctMeta = mediaPonderadaPorHoras(
      despejosAgrupados.map((d) => ({ pct: d.pctMeta, horas: d.horas })),
    );

    // As horas de cada atividade -- o peso de cada parcela da nota.
    const horasReepack = meusReepacks.reduce((s, r) => s + horasEntre(r.inicio, r.fim), 0);
    const horasDespejo = meusDespejos.reduce((s, d) => s + horasEntre(d.inicio, d.fim), 0);
    const horasPicking = meusPickings.reduce((s, p) => s + horasEntre(p.inicio, p.fim), 0);
    const horasSelecao = minhasSelecoes.reduce((s, x) => s + horasEntre(x.inicio, x.fim), 0);
    const pickingPctMedia = pctRelativoAoGrupo(mediaHlPicking(meusPickings), mediaHlPickingGrupo);
    const cincoSPctMedia = pctRelativoAoGrupo(
      minhasExecucoes5s.length > 0 ? minhasExecucoes5s.length : null,
      mediaExecucoes5sGrupo,
    );
    const selecaoPctMedia = pctRelativoAoGrupo(mediaTaxaPorPessoa(minhasSelecoes), mediaTaxaSelecaoGrupo);

    resultado.push({
      colaboradorId,
      colaboradorNome,
      reepacksPctMeta,
      despejoPctMeta,
      hlPicking: meuHlPicking,
      pickingPctMedia,
      totalReepacks: meusReepacks.reduce((s, r) => s + r.quantidade, 0),
      totalDespejoLitros: Math.round(meusDespejos.reduce((s, d) => s + d.litros, 0) * 10) / 10,
      totalExecucoes5s: minhasExecucoes5s.length,
      cincoSPctMedia,
      totalSelecao: minhasSelecoes.reduce((s, x) => s + x.quantidade, 0),
      selecaoPctMedia,
      totalAtividades:
        meusReepacks.length +
        meusDespejos.length +
        meusPickings.length +
        minhasExecucoes5s.length +
        minhasSelecoes.length,
      horasApontadas: Math.round((horasReepack + horasDespejo + horasPicking + horasSelecao) * 100) / 100,
      pontuacao: calcularPontuacao([
        { pct: reepacksPctMeta, horas: horasReepack },
        { pct: despejoPctMeta, horas: horasDespejo },
        { pct: pickingPctMedia, horas: horasPicking },
        { pct: selecaoPctMedia, horas: horasSelecao },
      ]),
    });
  }

  /*
    Quem tem nota vem primeiro; quem não tem (amostra curta) vai para o
    fim, ordenado pelo tempo apontado.

    Sem esta separação, `null` viraria 0 na comparação e a pessoa de
    amostra curta apareceria em ÚLTIMO como se tivesse ido mal -- quando
    o que houve foi ausência de medição, não desempenho ruim.

    Desempate entre quem tem nota: mais tempo apontado ganha. Antes era
    "mais lançamentos", o que premiava quem fatiava o trabalho em muitos
    lançamentos curtos.
  */
  return resultado.sort((a, b) => {
    if (a.pontuacao === null && b.pontuacao === null) return b.horasApontadas - a.horasApontadas;
    if (a.pontuacao === null) return 1;
    if (b.pontuacao === null) return -1;
    return b.pontuacao - a.pontuacao || b.horasApontadas - a.horasApontadas;
  });
}

export function mediaPct(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null);
  if (validos.length === 0) return null;
  return Math.round((validos.reduce((s, v) => s + v, 0) / validos.length) * 10) / 10;
}
