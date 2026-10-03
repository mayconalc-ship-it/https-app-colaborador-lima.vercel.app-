import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CATALOGO_DE_METAS, type DefinicaoDeMeta } from "@/lib/metas";
import { calcularTmaMinutos, pctAvariaAtendimento } from "@/lib/carretas";
import { lerTudoEmPaginas } from "@/lib/rating-server";
import { lerItensDasCarretas, porAtendimento as itensPorCarreta } from "@/lib/itens-carretas-server";
import {
  avaliarCadaEvento,
  avaliarSerie,
  calcularBase,
  limiteDoGatilho,
  MINIMO_DE_PONTOS,
  SIGMAS_PADRAO,
  type Avaliacao,
  type Ponto,
} from "@/lib/gatilho-anomalia";

/**
 * DE ONDE VÊM OS NÚMEROS DE CADA INDICADOR.
 *
 * O motor (lib/gatilho-anomalia.ts) é puro: recebe uma série e devolve o
 * limite. Aqui é o outro lado -- transformar as tabelas do app em série.
 *
 * UM PONTO POR DIA, e não por evento. O gatilho olha o PROCESSO: uma
 * carreta ruim isolada é um caso, um dia ruim é um desvio. Ponto por
 * evento faria o desvio padrão medir a variação entre carretas, que é
 * enorme e natural, em vez da variação entre dias -- e o limite subiria
 * tanto que nada dispararia.
 *
 * OS INDICADORES ENTRAM AOS POUCOS, DE PROPÓSITO. Cada um mora numa
 * tabela diferente e tem a sua conta; ligar os treze de uma vez, sem
 * olhar a série de cada um, é como o gatilho nasce desacreditado. Os do
 * Recebimento vêm primeiro porque saem da mesma consulta e porque a
 * avaria é a porta da blitz. Indicador ainda não ligado aparece na tela
 * dizendo isso -- e não como um gatilho que nunca dispara, que seria
 * pior: pareceria um processo sem anomalia.
 *
 * EXCEÇÃO: O TMA É POR DT (03/10/2026). Pedido do dono: o relato de TMA
 * é de UMA carreta -- o atendimento que passou do limite. Na série do TMA
 * cada ponto é um atendimento (com o id e a DT), e o gatilho avalia cada
 * um (ver avaliarCadaEvento). A avaria continua sendo a média do dia.
 */
export const INDICADORES_COM_SERIE = ["avaria_pct", "tma_alvo_minutos"] as const;
export type IndicadorComSerie = (typeof INDICADORES_COM_SERIE)[number];

/** Os indicadores avaliados carreta a carreta: um relato por atendimento. */
export const INDICADORES_POR_ATENDIMENTO: readonly string[] = ["tma_alvo_minutos"];
export const porAtendimento = (indicador: string) => INDICADORES_POR_ATENDIMENTO.includes(indicador);

/** Ontem em São Paulo: daí em diante a DT ainda é "de agora" e dispara. */
export function ontemSP() {
  return new Date(Date.now() - 86_400_000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export function temSerie(indicador: string): indicador is IndicadorComSerie {
  return (INDICADORES_COM_SERIE as readonly string[]).includes(indicador);
}

/** Quantos dias de histórico o gatilho olha. Noventa cobre com folga os
 *  20 pontos de um indicador diário e ainda mostra a sazonalidade do
 *  mês -- e limita a consulta a um tamanho previsível. */
const DIAS_DE_HISTORICO = 90;

const diaSP = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

type LinhaAtendimento = {
  id: string;
  numero_dt: string | null;
  chegada_em: string;
  agendamento_em: string | null;
  carga_agendada: boolean;
  fim_descarga_em: string | null;
  fim_carga_em: string | null;
  tem_carga: boolean | null;
};

/**
 * As séries do Recebimento -- as duas saem da MESMA consulta.
 *
 * Buscar uma vez e derivar as duas evita ler `atendimentos_carretas`
 * duas vezes por carregamento de tela, que é o tipo de desperdício que
 * só aparece quando a base cresce.
 */
export async function seriesDoIndicador(revendaId: string): Promise<Record<string, Ponto[]>> {
  return seriesDoRecebimento(revendaId);
}

async function seriesDoRecebimento(revendaId: string): Promise<Record<string, Ponto[]>> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - DIAS_DE_HISTORICO * 86_400_000).toISOString();

  // PAGINADO (03/10/2026): antes vinha numa consulta só e os itens, em
  // 90 dias, passavam do teto de 1.000 linhas do PostgREST -- a % de
  // avaria saía de uma amostra cortada. Ver lib/itens-carretas-server.
  const { linhas, erro } = await lerTudoEmPaginas<LinhaAtendimento>((de, ate) =>
    admin
      .from("atendimentos_carretas")
      .select("id, numero_dt, chegada_em, agendamento_em, carga_agendada, fim_descarga_em, fim_carga_em, tem_carga")
      .eq("revenda_id", revendaId)
      .gte("chegada_em", desde)
      .order("chegada_em")
      .order("id")
      .range(de, ate),
  );

  // Erro não vira série vazia: vazio significaria "processo sem
  // medição", e a tela diria "aguardando base" para um indicador que
  // tem base. Ver postgrest-corta-em-mil-linhas.
  if (erro) throw new Error(`Não foi possível ler os atendimentos: ${erro}`);
  if (linhas.length === 0) return { avaria_pct: [], tma_alvo_minutos: [] };

  const itensPorAtendimento = itensPorCarreta(await lerItensDasCarretas(linhas.map((a) => a.id), {}, admin));

  const avariaPorDia = new Map<string, number[]>();
  // TMA: um ponto por atendimento, na ordem de chegada.
  const tmaPorAtendimento: Ponto[] = [];

  for (const a of linhas) {
    const dia = diaSP(a.chegada_em);

    const doAtendimento = itensPorAtendimento.get(a.id);
    if (doAtendimento && doAtendimento.length > 0) {
      const pct = pctAvariaAtendimento(doAtendimento);
      if (pct !== null) empilhar(avariaPorDia, dia, pct);
    }

    const tma = calcularTmaMinutos({
      chegadaEm: a.chegada_em,
      agendamentoEm: a.agendamento_em,
      cargaAgendada: a.carga_agendada,
      fimDescargaEm: a.fim_descarga_em,
      fimCargaEm: a.fim_carga_em,
      temCarga: a.tem_carga,
    } as Parameters<typeof calcularTmaMinutos>[0]);
    if (tma !== null) {
      tmaPorAtendimento.push({ dia, valor: Math.round(tma * 100) / 100, ref: a.id, rotulo: a.numero_dt });
    }
  }

  return {
    avaria_pct: mediaPorDia(avariaPorDia),
    tma_alvo_minutos: tmaPorAtendimento,
  };
}

/* ------------------------------------------------------------------ *
 * AS CARRETAS DO DIA DO DISPARO
 * ------------------------------------------------------------------ */

export type CarretaDoRelato = {
  id: string;
  numeroDt: string | null;
  placaCarreta: string | null;
  placaCavalo: string | null;
  motorista: string | null;
  transportadora: string | null;
  chegadaEm: string;
  /** % de avaria do atendimento, quando há itens conferidos. */
  avariaPct: number | null;
  tmaMinutos: number | null;
  /** A blitz aberta para esta carreta, se houve. */
  blitzId: string | null;
};

/**
 * QUAIS CARRETAS FIZERAM O NÚMERO DAQUELE DIA.
 *
 * Pedido do dono (08/09/2026): "quando houver um relato de anomalia de
 * blitz, por exemplo, precisa colocar os dados da carreta no relato para
 * identificar".
 *
 * Ele está certo, e o buraco era real: o relato dizia "Avaria fora do
 * limite em 07/09, 8,4% contra 5%" e parava aí. Quem trata precisa saber
 * QUAL carreta -- placa, DT, transportadora, motorista --, senão a
 * primeira coisa que faz é abrir outra tela para descobrir, e o relato
 * assinado não identifica o que foi tratado. Um relato que não diz sobre o
 * que é não serve de evidência para ninguém.
 *
 * DERIVADO, NÃO COPIADO. Nada disto é gravado na linha do relato: é lido
 * do atendimento na hora de mostrar. Copiar exigiria uma coluna nova e
 * criaria uma segunda verdade sobre a carreta -- a placa corrigida depois
 * ficaria certa numa tela e errada na outra, e é sempre a do documento que
 * o auditor lê.
 *
 * O PONTO DO GATILHO É A MÉDIA DO DIA (ver acima: um ponto por dia, não
 * por evento), então o que identifica o disparo é o CONJUNTO das carretas
 * daquele dia -- e é ele que volta aqui, com a pior no topo.
 */
export async function carretasDoDia(
  revendaId: string,
  dia: string,
): Promise<CarretaDoRelato[]> {
  const admin = createAdminClient();

  // O dia é em São Paulo; a coluna é timestamptz. A janela vai de -3h a
  // +21h do meio-dia UTC para pegar exatamente o dia local, sem depender
  // do fuso do servidor (a Vercel roda em UTC).
  const inicio = new Date(`${dia}T00:00:00-03:00`).toISOString();
  const fim = new Date(`${dia}T23:59:59-03:00`).toISOString();

  const { data: atendimentos } = await admin
    .from("atendimentos_carretas")
    .select(CAMPOS_DA_CARRETA)
    .eq("revenda_id", revendaId)
    .gte("chegada_em", inicio)
    .lte("chegada_em", fim)
    .order("chegada_em");

  const carretas = await montarCarretas(atendimentos ?? []);

  // A pior primeiro: numa lista de doze carretas, a que puxou a média é a
  // que se trata. Sem avaria medida vai para o fim -- não é zero, é "não
  // conferida", e ordenar como zero a esconderia no meio das boas.
  return carretas.sort((a, b) => (b.avariaPct ?? -1) - (a.avariaPct ?? -1));
}

const CAMPOS_DA_CARRETA =
  "id, numero_dt, placa_carreta, placa_cavalo, motorista_nome, chegada_em, agendamento_em, carga_agendada, fim_descarga_em, fim_carga_em, tem_carga, pa_transportadoras(nome)";

/**
 * A CARRETA DE UM RELATO DE TMA (um relato por DT): só ela, e não o dia
 * inteiro. Nulo se o atendimento foi apagado depois.
 */
export async function carretaDoAtendimento(revendaId: string, atendimentoId: string): Promise<CarretaDoRelato | null> {
  const { data } = await createAdminClient()
    .from("atendimentos_carretas")
    .select(CAMPOS_DA_CARRETA)
    .eq("revenda_id", revendaId)
    .eq("id", atendimentoId)
    .maybeSingle();
  if (!data) return null;
  return (await montarCarretas([data]))[0] ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- linha do PostgREST com embed
async function montarCarretas(linhas: any[]): Promise<CarretaDoRelato[]> {
  if (linhas.length === 0) return [];
  const admin = createAdminClient();

  const ids = linhas.map((a) => a.id as string);
  const [itens, { data: blitzes }] = await Promise.all([
    // As carretas de um dia têm muitos itens: o mesmo leitor paginado do
    // gatilho, para o relato não mostrar uma avaria cortada.
    lerItensDasCarretas(ids, {}, admin).catch(() => []),
    admin.from("pa_blitz").select("id, atendimento_id").in("atendimento_id", ids),
  ]);
  const porAtendimento = itensPorCarreta(itens);
  const blitzPorAtendimento = new Map(
    (blitzes ?? []).map((b) => [b.atendimento_id as string, b.id as string]),
  );

  const carretas: CarretaDoRelato[] = linhas.map((a) => {
    const doAtendimento = porAtendimento.get(a.id as string);
    const transportadora = Array.isArray(a.pa_transportadoras)
      ? ((a.pa_transportadoras[0] as { nome: string } | undefined)?.nome ?? null)
      : ((a.pa_transportadoras as { nome: string } | null)?.nome ?? null);

    return {
      id: a.id as string,
      numeroDt: (a.numero_dt as string) ?? null,
      placaCarreta: (a.placa_carreta as string) ?? null,
      placaCavalo: (a.placa_cavalo as string) ?? null,
      motorista: (a.motorista_nome as string) ?? null,
      transportadora,
      chegadaEm: a.chegada_em as string,
      avariaPct:
        doAtendimento && doAtendimento.length > 0 ? pctAvariaAtendimento(doAtendimento) : null,
      tmaMinutos: calcularTmaMinutos({
        chegadaEm: a.chegada_em,
        agendamentoEm: a.agendamento_em,
        cargaAgendada: a.carga_agendada,
        fimDescargaEm: a.fim_descarga_em,
        fimCargaEm: a.fim_carga_em,
        temCarga: a.tem_carga,
      } as Parameters<typeof calcularTmaMinutos>[0]),
      blitzId: blitzPorAtendimento.get(a.id as string) ?? null,
    };
  });
  return carretas;
}

function empilhar(mapa: Map<string, number[]>, dia: string, valor: number) {
  const arr = mapa.get(dia) ?? [];
  arr.push(valor);
  mapa.set(dia, arr);
}

/** A média do dia, em ordem cronológica -- é o ponto do gatilho. */
function mediaPorDia(mapa: Map<string, number[]>): Ponto[] {
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, valores]) => ({
      dia,
      valor: Math.round((valores.reduce((t, v) => t + v, 0) / valores.length) * 100) / 100,
    }));
}

export type GatilhoGravado = {
  id: string;
  indicador: string;
  ativo: boolean;
  sigmas: number;
  limite_manual: number | null;
  minimo_pontos: number;
  observacao: string | null;
};

export type LinhaDaConfiguracao = {
  def: DefinicaoDeMeta;
  gatilho: GatilhoGravado | null;
  /** Nulo quando a série daquele indicador ainda não foi ligada. */
  avaliacao: Avaliacao | null;
  pontos: Ponto[];
};

/**
 * Tudo que a tela de configuração precisa, numa chamada.
 *
 * Traz a CONFIGURAÇÃO e a ESTATÍSTICA VIVA lado a lado, e é isso que faz
 * a tela valer: um campo "limite manual" sozinho é um chute: ao lado da
 * média, do desvio e de quantos dias já existem, vira decisão.
 */
export async function carregarConfiguracaoDeGatilhos(
  revendaId: string,
): Promise<LinhaDaConfiguracao[]> {
  const admin = createAdminClient();

  const [{ data: gravados, error }, series] = await Promise.all([
    admin
      .from("pa_gatilhos_anomalia")
      .select("id, indicador, ativo, sigmas, limite_manual, minimo_pontos, observacao")
      .eq("revenda_id", revendaId),
    seriesDoRecebimento(revendaId),
  ]);
  if (error) throw new Error(`Não foi possível ler os gatilhos: ${error.message}`);

  const porIndicador = new Map(
    ((gravados ?? []) as GatilhoGravado[]).map((g) => [g.indicador, g]),
  );

  // Só o que é META entra: "referência" (a capacidade da bombona, por
  // exemplo) não é bom nem ruim -- não existe anomalia em encher a
  // bombona, e oferecer um gatilho ali só confundiria quem configura.
  return CATALOGO_DE_METAS.filter((m) => (m.tipo ?? "meta") === "meta").map((def) => {
    const gatilho = porIndicador.get(def.chave) ?? null;
    const pontos = series[def.chave] ?? null;

    if (!pontos) return { def, gatilho, avaliacao: null, pontos: [] };

    const regra = {
      sentido: def.sentido,
      sigmas: gatilho?.sigmas ?? SIGMAS_PADRAO,
      limiteManual: gatilho?.limite_manual ?? null,
    };
    // TMA: a carreta de ontem ou de hoje que passou do limite.
    const avaliacao = porAtendimento(def.chave) ? avaliarCadaEvento(pontos, regra, ontemSP()) : avaliarSerie(pontos, regra);
    return { def, gatilho, avaliacao, pontos };
  });
}

/** Reexportados para a tela não precisar importar dos dois lugares. */
export { calcularBase, limiteDoGatilho, MINIMO_DE_PONTOS, SIGMAS_PADRAO };
