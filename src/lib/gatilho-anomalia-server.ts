import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CATALOGO_DE_METAS, type DefinicaoDeMeta } from "@/lib/metas";
import { calcularTmaMinutos, pctAvariaAtendimento } from "@/lib/carretas";
import {
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
 */
export const INDICADORES_COM_SERIE = ["avaria_pct", "tma_alvo_minutos"] as const;
export type IndicadorComSerie = (typeof INDICADORES_COM_SERIE)[number];

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

  const { data: atendimentos, error } = await admin
    .from("atendimentos_carretas")
    .select(
      "id, chegada_em, agendamento_em, carga_agendada, fim_descarga_em, fim_carga_em, tem_carga",
    )
    .eq("revenda_id", revendaId)
    .gte("chegada_em", desde)
    .order("chegada_em");

  // Erro não vira série vazia: vazio significaria "processo sem
  // medição", e a tela diria "aguardando base" para um indicador que
  // tem base. Ver postgrest-corta-em-mil-linhas.
  if (error) throw new Error(`Não foi possível ler os atendimentos: ${error.message}`);

  const linhas = (atendimentos ?? []) as LinhaAtendimento[];
  if (linhas.length === 0) return { avaria_pct: [], tma_alvo_minutos: [] };

  const { data: itens, error: erroItens } = await admin
    .from("atendimento_carretas_itens")
    .select("atendimento_id, quantidade, quantidade_avariada")
    .in("atendimento_id", linhas.map((a) => a.id));
  if (erroItens) throw new Error(`Não foi possível ler os itens: ${erroItens.message}`);

  const itensPorAtendimento = new Map<string, { quantidade: number; quantidadeAvariada: number | null }[]>();
  for (const i of itens ?? []) {
    const arr = itensPorAtendimento.get(i.atendimento_id) ?? [];
    arr.push({ quantidade: i.quantidade, quantidadeAvariada: i.quantidade_avariada });
    itensPorAtendimento.set(i.atendimento_id, arr);
  }

  const avariaPorDia = new Map<string, number[]>();
  const tmaPorDia = new Map<string, number[]>();

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
    if (tma !== null) empilhar(tmaPorDia, dia, tma);
  }

  return {
    avaria_pct: mediaPorDia(avariaPorDia),
    tma_alvo_minutos: mediaPorDia(tmaPorDia),
  };
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

    const avaliacao = avaliarSerie(pontos, {
      sentido: def.sentido,
      sigmas: gatilho?.sigmas ?? SIGMAS_PADRAO,
      limiteManual: gatilho?.limite_manual ?? null,
    });
    return { def, gatilho, avaliacao, pontos };
  });
}

/** Reexportados para a tela não precisar importar dos dois lugares. */
export { calcularBase, limiteDoGatilho, MINIMO_DE_PONTOS, SIGMAS_PADRAO };
