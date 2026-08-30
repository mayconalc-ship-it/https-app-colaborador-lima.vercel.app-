/**
 * O REALIZADO, para ajudar a cadastrar a meta.
 *
 * Cadastrar meta no escuro é como o Repack ficou: 240 produtos, zero
 * metas, e a Pontuação rodando sem eles. Mostrar o que a operação já faz
 * transforma "quanto eu ponho aqui?" em "é isto, quero mais ou menos".
 *
 * Cada número vem com o TAMANHO DA AMOSTRA junto, e isso não é enfeite:
 * um produto com um lançamento de 0,03h dá 411 L/h, que não é
 * desempenho, é ruído. Sem a amostra ao lado, esse 411 viraria meta.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { horasEntre, mediaHlPicking, taxaPorHora } from "@/lib/produtividade-armazem";
import {
  calcularTmaMinutos,
  type AtendimentoCarreta,
} from "@/lib/carretas";
import {
  cicloContaParaMaquina,
  montarCiclos,
  type SessaoUso,
  type TrocaGas,
} from "@/lib/empilhadeira-gas";
import { pctPdvDoDia } from "@/lib/devolucao";
import { media } from "@/lib/metas";

/** Janela do histórico. 90 dias é longo o bastante para juntar amostra
 *  numa operação que apura por sorteio, e curto o bastante para não
 *  trazer um ritmo que a operação já não tem. */
export const DIAS_DE_HISTORICO = 90;

export type Realizado = {
  valor: number;
  /** Quantos lançamentos/carretas/dias sustentam o número. */
  amostra: number;
  /** "34 lançamentos", "3 carretas" -- o que a amostra significa. */
  unidadeDaAmostra: string;
};

/** Amostra abaixo disto é ruído: mostra o número, mas não sugere como
 *  meta. Três pontos é o mínimo para uma média não ser um acidente. */
export const AMOSTRA_MINIMA = 3;

export function confiavel(r: Realizado | undefined | null): boolean {
  return !!r && r.amostra >= AMOSTRA_MINIMA;
}

/** Lê tudo, em páginas. O PostgREST corta em 1.000 linhas sem avisar --
 *  pedir mais não traz mais, e a lista curta não levanta erro. */
async function lerTudo<T>(
  monta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await monta(de, de + 999);
    if (error || !data) break;
    todas.push(...data);
    if (data.length < 1000) break;
  }
  return todas;
}

type Linha = Record<string, unknown>;

/**
 * O realizado de cada meta do catálogo, por chave.
 *
 * O que não tiver apontamento simplesmente não entra no mapa -- a tela
 * mostra "sem histórico" em vez de zero, que seria lido como desempenho
 * zerado em vez de ausência de medição.
 */
export async function historicoDasMetas(
  revendaId: string,
  dias = DIAS_DE_HISTORICO,
): Promise<Map<string, Realizado>> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const desdeData = desde.slice(0, 10);
  const fora = new Map<string, Realizado>();

  const [
    selecoes,
    repacks,
    despejos,
    pickings,
    itens,
    carretas,
    trocas,
    operacoes,
    execucoes5s,
    dias5,
    avaliacoes,
    afericoes,
  ] = await Promise.all([
      lerTudo<Linha>((de, ate) =>
        admin
          .from("pa_reepack_lancamentos")
          .select("quantidade, inicio, fim")
          .eq("revenda_id", revendaId)
          .eq("etapa", "selecao")
          .not("fim", "is", null)
          .gte("inicio", desde)
          .range(de, ate),
      ),
      lerTudo<Linha>((de, ate) =>
        admin
          .from("pa_reepack_lancamentos")
          .select("quantidade, inicio, fim")
          .eq("revenda_id", revendaId)
          .eq("etapa", "repack")
          .not("fim", "is", null)
          .gte("inicio", desde)
          .range(de, ate),
      ),
      lerTudo<Linha>((de, ate) =>
        admin
          .from("pa_despejo_lancamentos")
          .select("litros, inicio, fim")
          .eq("revenda_id", revendaId)
          .not("fim", "is", null)
          .gte("inicio", desde)
          .range(de, ate),
      ),
      lerTudo<Linha>((de, ate) =>
        admin
          .from("pa_abastecimentos")
          .select("inicio, fim, pa_abastecimento_itens(hl_calculado)")
          .eq("revenda_id", revendaId)
          .not("fim", "is", null)
          .gte("inicio", desde)
          .range(de, ate),
      ),
      lerTudo<Linha>((de, ate) =>
        admin
          .from("atendimento_carretas_itens")
          .select("quantidade, quantidade_avariada, atendimentos_carretas!inner(revenda_id, finalizacao_em)")
          .eq("atendimentos_carretas.revenda_id", revendaId)
          .gte("atendimentos_carretas.finalizacao_em", desde)
          .range(de, ate),
      ),
      lerTudo<Linha>((de, ate) =>
        admin
          .from("atendimentos_carretas")
          .select(
            "chegada_em, agendamento_em, carga_agendada, fim_descarga_em, tem_carga, fim_carga_em",
          )
          .eq("revenda_id", revendaId)
          .eq("status", "finalizado")
          .gte("finalizacao_em", desde)
          .range(de, ate),
      ),
      // Sem recorte: o ciclo precisa da troca anterior como ponto de
      // partida, e cortar na data jogaria fora justamente ela.
      lerTudo<Linha>((de, ate) =>
        admin
          .from("pa_empilhadeira_trocas_gas")
          .select("id, empilhadeira_id, operador_id, operador_nome, horimetro, realizada_em")
          .eq("revenda_id", revendaId)
          .order("realizada_em", { ascending: true })
          .range(de, ate),
      ),
      lerTudo<Linha>((de, ate) =>
        admin
          .from("pa_empilhadeira_operacoes")
          .select("id, empilhadeira_id, operador_id, operador_nome, horimetro_inicial, horimetro_final, inicio, fim, status, pa_empilhadeiras(numero)")
          .eq("revenda_id", revendaId)
          .eq("status", "encerrada")
          .range(de, ate),
      ),
      lerTudo<Linha>((de, ate) =>
        admin
          .from("pa_execucoes_5s")
          .select("responsavel_id, inicio")
          .eq("revenda_id", revendaId)
          .not("fim", "is", null)
          .gte("inicio", desde)
          .range(de, ate),
      ),
      lerTudo<Linha>((de, ate) =>
        admin
          .from("devolucao_dia")
          .select("pdvs_entregues, pdvs_devolvidos")
          .eq("revenda_id", revendaId)
          .gte("data", desdeData)
          .range(de, ate),
      ),
      lerTudo<Linha>((de, ate) =>
        admin
          .from("rating_avaliacoes")
          .select("nota")
          .eq("revenda_id", revendaId)
          .gte("data_avaliacao", desdeData)
          .range(de, ate),
      ),
      lerTudo<Linha>((de, ate) =>
        admin
          .from("refugo_afericoes")
          .select("total_aferido, qt_faltante, qt_qualidade")
          .eq("revenda_id", revendaId)
          .gte("data", desdeData)
          .range(de, ate),
      ),
    ]);

  // ---- Seleção: unidades triadas por hora ----
  if (selecoes.length > 0) {
    const qtd = selecoes.reduce((s, l) => s + Number(l.quantidade), 0);
    const h = selecoes.reduce((s, l) => s + horasEntre(l.inicio as string, l.fim as string), 0);
    const taxa = taxaPorHora(qtd, h);
    if (taxa > 0) fora.set("selecao_un_hora", { valor: taxa, amostra: selecoes.length, unidadeDaAmostra: "lançamentos" });
  }

  // ---- Bancada: horas por dia trabalhado, e minutos por caixa ----
  // Por dia TRABALHADO, não por dia do período: contar domingo e dia
  // parado faria a bancada parecer ociosa quando ela apenas não operou.
  const daBancada = [...selecoes, ...repacks];
  if (daBancada.length > 0) {
    const horas = daBancada.reduce((s, l) => s + horasEntre(l.inicio as string, l.fim as string), 0);
    const diasTrabalhados = new Set(daBancada.map((l) => String(l.inicio).slice(0, 10))).size;
    if (diasTrabalhados > 0) {
      fora.set("bancada_horas_dia", {
        valor: horas / diasTrabalhados,
        amostra: diasTrabalhados,
        unidadeDaAmostra: "dias com lançamento",
      });
    }
  }
  if (repacks.length > 0) {
    const caixas = repacks.reduce((s, l) => s + Number(l.quantidade), 0);
    const horas = repacks.reduce((s, l) => s + horasEntre(l.inicio as string, l.fim as string), 0);
    if (caixas > 0) {
      fora.set("reepack_minutos_caixa", {
        valor: (horas / caixas) * 60,
        amostra: repacks.length,
        unidadeDaAmostra: "lançamentos",
      });
    }
  }

  // ---- Despejo: litros por hora do conjunto ----
  if (despejos.length > 0) {
    const litros = despejos.reduce((s, l) => s + Number(l.litros), 0);
    const horas = despejos.reduce((s, l) => s + horasEntre(l.inicio as string, l.fim as string), 0);
    const taxa = taxaPorHora(litros, horas);
    if (taxa > 0) {
      fora.set("despejo_litros_hora", {
        valor: taxa,
        amostra: despejos.length,
        unidadeDaAmostra: "lançamentos",
      });
    }
  }

  // ---- Picking: HL por hora ----
  if (pickings.length > 0) {
    const sessoes = pickings.map((p) => ({
      quantidade: ((p.pa_abastecimento_itens as { hl_calculado: number }[]) ?? []).reduce(
        (t, i) => t + Number(i.hl_calculado),
        0,
      ),
      inicio: p.inicio as string,
      fim: p.fim as string,
    }));
    const hl = mediaHlPicking(sessoes);
    if (hl !== null && hl > 0) {
      fora.set("picking_hl_hora", { valor: hl, amostra: pickings.length, unidadeDaAmostra: "sessões" });
    }
  }

  // ---- TMA ----
  const atendimentos: AtendimentoCarreta[] = carretas.map(
    (a) =>
      ({
        chegadaEm: a.chegada_em as string,
        agendamentoEm: (a.agendamento_em as string) ?? null,
        cargaAgendada: Boolean(a.carga_agendada),
        fimDescargaEm: (a.fim_descarga_em as string) ?? null,
        temCarga: (a.tem_carga as boolean) ?? null,
        fimCargaEm: (a.fim_carga_em as string) ?? null,
      }) as AtendimentoCarreta,
  );
  const tmas = atendimentos.map(calcularTmaMinutos).filter((v): v is number => v !== null);
  const tma = media(tmas);
  if (tma !== null) fora.set("tma_alvo_minutos", { valor: tma, amostra: tmas.length, unidadeDaAmostra: "carretas" });

  // ---- % de paletes com avaria ----
  if (itens.length > 0) {
    const rec = itens.reduce((s, i) => s + Number(i.quantidade), 0);
    const av = itens.reduce((s, i) => s + Number(i.quantidade_avariada ?? 0), 0);
    if (rec > 0) {
      fora.set("avaria_pct", { valor: (av / rec) * 100, amostra: itens.length, unidadeDaAmostra: "itens conferidos" });
    }
  }

  // ---- Horas por P20 ----
  const numeroDaMaquina = new Map<string, string>();
  for (const op of operacoes) {
    const m = Array.isArray(op.pa_empilhadeiras) ? op.pa_empilhadeiras[0] : op.pa_empilhadeiras;
    const numero = (m as { numero?: string } | null)?.numero;
    if (numero) numeroDaMaquina.set(op.empilhadeira_id as string, numero);
  }
  const trocasGas: TrocaGas[] = trocas.map((t) => ({
    id: t.id as string,
    empilhadeiraId: t.empilhadeira_id as string,
    operadorId: t.operador_id as string,
    operadorNome: t.operador_nome as string,
    horimetro: Number(t.horimetro),
    realizadaEm: t.realizada_em as string,
  }));
  const sessoesUso: SessaoUso[] = operacoes.map((op) => ({
    id: op.id as string,
    empilhadeiraId: op.empilhadeira_id as string,
    operadorId: op.operador_id as string,
    operadorNome: op.operador_nome as string,
    horimetroInicial: Number(op.horimetro_inicial),
    horimetroFinal: op.horimetro_final === null ? null : Number(op.horimetro_final),
    inicio: op.inicio as string,
    fim: (op.fim as string) ?? null,
  }));
  const limite = new Date(desde).getTime();
  const ciclos = montarCiclos(trocasGas, sessoesUso, numeroDaMaquina)
    .filter(cicloContaParaMaquina)
    .filter((c) => new Date(c.fechadoEm).getTime() >= limite);
  if (ciclos.length > 0) {
    const h = ciclos.reduce((s, c) => s + c.horas, 0);
    fora.set("empilhadeira_horas_p20", { valor: h / ciclos.length, amostra: ciclos.length, unidadeDaAmostra: "ciclos" });
  }

  // ---- 5S: execuções por pessoa por mês ----
  if (execucoes5s.length > 0) {
    const pessoas = new Set(execucoes5s.map((e) => e.responsavel_id as string)).size;
    const meses = Math.max(dias / 30, 1);
    if (pessoas > 0) {
      fora.set("cinco_s_execucoes_mes", {
        valor: execucoes5s.length / pessoas / meses,
        amostra: execucoes5s.length,
        unidadeDaAmostra: "execuções",
      });
    }
  }

  // ---- Devolução: % dos PDVs ----
  //
  // Por PDV, NÃO por valor. É contra este número que a meta é comparada
  // na tela do colaborador (pctPdvDoDia) e que o pedido de justificativa
  // dispara. Sugerir a partir do percentual em reais daria uma meta na
  // unidade errada -- pareceria certa e cobraria outra coisa.
  //
  // Consolidado, não média das médias: um dia de dois PDVs pesaria igual
  // a um dia de duzentos.
  if (dias5.length > 0) {
    const entregues = dias5.reduce((s, d) => s + Number(d.pdvs_entregues ?? 0), 0);
    const devolvidos = dias5.reduce((s, d) => s + Number(d.pdvs_devolvidos ?? 0), 0);
    const pct = pctPdvDoDia(entregues, devolvidos);
    if (pct !== null) {
      fora.set("meta_pct", { valor: pct, amostra: dias5.length, unidadeDaAmostra: "dias-motorista" });
    }
  }

  // ---- Rating: nota média ----
  if (avaliacoes.length > 0) {
    const soma = avaliacoes.reduce((s, a) => s + Number(a.nota), 0);
    fora.set("rating_nota_media", {
      valor: soma / avaliacoes.length,
      amostra: avaliacoes.length,
      unidadeDaAmostra: "avaliações",
    });
  }

  // ---- Refugo: % sobre o aferido ----
  if (afericoes.length > 0) {
    const aferido = afericoes.reduce((s, a) => s + Number(a.total_aferido), 0);
    const refugo = afericoes.reduce((s, a) => s + Number(a.qt_faltante) + Number(a.qt_qualidade), 0);
    if (aferido > 0) {
      fora.set("refugo_pct", {
        valor: (refugo / aferido) * 100,
        amostra: afericoes.length,
        unidadeDaAmostra: "aferições",
      });
    }
  }

  return fora;
}

/**
 * Realizado por PRODUTO (Repack, cx/h) e por EMBALAGEM (Despejo, L/h).
 *
 * Devolvido em mapas separados porque as duas listas são independentes na
 * tela -- cada uma com a sua busca e o seu botão de salvar.
 */
export async function historicoPorItem(
  revendaId: string,
  dias = DIAS_DE_HISTORICO,
): Promise<{ repack: Map<string, Realizado>; despejo: Map<string, Realizado> }> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

  const [reepacks, despejos] = await Promise.all([
    lerTudo<Linha>((de, ate) =>
      admin
        .from("pa_reepack_lancamentos")
        .select("produto_id, quantidade, inicio, fim")
        .eq("revenda_id", revendaId)
        .eq("etapa", "repack")
        .not("fim", "is", null)
        .gte("inicio", desde)
        .range(de, ate),
    ),
    lerTudo<Linha>((de, ate) =>
      admin
        .from("pa_despejo_lancamentos")
        .select("embalagem_despejo_id, litros, inicio, fim")
        .eq("revenda_id", revendaId)
        .not("fim", "is", null)
        .gte("inicio", desde)
        .range(de, ate),
    ),
  ]);

  const juntar = (
    linhas: Linha[],
    chaveDe: (l: Linha) => string | null,
    quantidadeDe: (l: Linha) => number,
    unidade: string,
  ): Map<string, Realizado> => {
    const soma = new Map<string, { q: number; h: number; n: number }>();
    for (const l of linhas) {
      const chave = chaveDe(l);
      if (!chave) continue;
      const atual = soma.get(chave) ?? { q: 0, h: 0, n: 0 };
      atual.q += quantidadeDe(l);
      atual.h += horasEntre(l.inicio as string, l.fim as string);
      atual.n++;
      soma.set(chave, atual);
    }
    const saida = new Map<string, Realizado>();
    for (const [chave, v] of soma) {
      const taxa = taxaPorHora(v.q, v.h);
      if (taxa > 0) saida.set(chave, { valor: taxa, amostra: v.n, unidadeDaAmostra: unidade });
    }
    return saida;
  };

  return {
    repack: juntar(reepacks, (l) => (l.produto_id as string) ?? null, (l) => Number(l.quantidade), "lançamentos"),
    despejo: juntar(
      despejos,
      (l) => (l.embalagem_despejo_id as string) ?? null,
      (l) => Number(l.litros),
      "lançamentos",
    ),
  };
}
