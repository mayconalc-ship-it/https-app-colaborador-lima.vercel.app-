import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { lerTudoEmPaginas } from "@/lib/rating-server";
import { pctAvariaAtendimento } from "@/lib/carretas";
import { CATALOGO_DE_METAS } from "@/lib/metas";
import { calcularBase, limiteDoGatilho, SIGMAS_PADRAO } from "@/lib/gatilho-anomalia";
import { seriesDoIndicador } from "@/lib/gatilho-anomalia-server";
import {
  decidirBlitz,
  indicesDaChegada,
  type DecisaoDaBlitz,
  type EntregaConferida,
} from "@/lib/blitz";

/**
 * O LADO DO BANCO DA BLITZ -- de onde saem o histórico e a régua.
 *
 * A regra mora em lib/blitz.ts, pura e testada. Aqui é só a leitura: quem
 * já entregou o quê, e qual é o limite de avaria em vigor.
 */

/** Quanto histórico a blitz olha. O mesmo do gatilho de anomalia -- se as
 *  duas telas dissessem médias diferentes da mesma transportadora, a
 *  liderança pararia de acreditar nas duas. */
const DIAS_DE_HISTORICO = 90;

/** O indicador de que a blitz pega carona. */
const INDICADOR = "avaria_pct";

type LinhaEntrega = {
  id: string;
  placa_carreta: string | null;
  motorista_nome: string | null;
  pa_transportadoras: { nome: string } | { nome: string }[] | null;
};

const nomeDaTransportadora = (v: LinhaEntrega["pa_transportadoras"]) => {
  if (!v) return null;
  const t = Array.isArray(v) ? v[0] : v;
  return t?.nome ?? null;
};

/**
 * A RÉGUA -- e é a MESMA do gatilho de anomalia da avaria, de propósito.
 *
 * Duas réguas para "avaria demais" seriam duas conversas diferentes sobre
 * o mesmo problema, e a liderança teria de explicar por que uma carreta
 * abriu relato e outra, com o mesmo número, não caiu na blitz.
 *
 * Na prática o limite que vale é quase sempre o ESCRITO À MÃO: medida na
 * base real, a fórmula (média + 2σ) dá um limite de três dígitos para a
 * avaria -- a variação entre dias é grande demais. Isso não é defeito da
 * conta, é o que a conta tem a dizer: "não existe dia anormal de avaria,
 * existe um patamar que a operação decidiu não aceitar". Por isso a tela
 * de gatilhos pede o limite à mão e explica o porquê.
 */
export async function limiteDeAvaria(
  revendaId: string,
): Promise<{ limite: number | null; manual: boolean; motivo: string }> {
  const admin = createAdminClient();

  const { data: gatilho, error } = await admin
    .from("pa_gatilhos_anomalia")
    .select("ativo, sigmas, limite_manual")
    .eq("revenda_id", revendaId)
    .eq("indicador", INDICADOR)
    .maybeSingle();

  if (error) {
    // Sem régua a blitz não para ninguém -- e é o certo: parar carreta por
    // causa de uma leitura que falhou queimaria a relação com quem não
    // devia nada.
    return { limite: null, manual: false, motivo: `Não foi possível ler o gatilho: ${error.message}` };
  }
  if (!gatilho) {
    return {
      limite: null,
      manual: false,
      motivo: "O gatilho de avaria ainda não foi configurado — a blitz não tem limite para decidir.",
    };
  }
  if (!gatilho.ativo) {
    return {
      limite: null,
      manual: false,
      motivo: "O gatilho de avaria está desligado — enquanto ele estiver, a blitz não para ninguém.",
    };
  }

  if (gatilho.limite_manual !== null && gatilho.limite_manual !== undefined) {
    return {
      limite: Number(gatilho.limite_manual),
      manual: true,
      motivo: `Limite de ${Number(gatilho.limite_manual)}% escrito à mão na tela de gatilhos.`,
    };
  }

  const def = CATALOGO_DE_METAS.find((m) => m.chave === INDICADOR);
  if (!def) return { limite: null, manual: false, motivo: "Indicador de avaria não está no catálogo." };

  const series = await seriesDoIndicador(revendaId);
  const base = calcularBase((series[INDICADOR] ?? []).map((p) => p.valor));
  const limite = limiteDoGatilho(base, {
    sentido: def.sentido,
    sigmas: Number(gatilho.sigmas ?? SIGMAS_PADRAO),
    limiteManual: null,
  });

  return {
    limite,
    manual: false,
    motivo: limite === null ? (base.motivo ?? "Base insuficiente para calcular o limite.") : `Limite de ${limite}% pela fórmula (média + ${gatilho.sigmas ?? SIGMAS_PADRAO}σ).`,
  };
}

/**
 * O HISTÓRICO -- uma linha por carga já conferida.
 *
 * Só entra atendimento com item lançado: sem conferência não há % de
 * avaria, e contar a carga como 0% premiaria quem ninguém conferiu.
 *
 * EM PÁGINAS, as duas consultas. Noventa dias de itens passam de mil
 * linhas com folga, e o PostgREST corta em mil sem levantar erro -- a
 * blitz simplesmente pararia de ver as cargas mais antigas e as médias
 * mudariam sozinhas.
 */
export async function entregasConferidas(revendaId: string): Promise<EntregaConferida[]> {
  const admin = createAdminClient();
  const desde = new Date(Date.now() - DIAS_DE_HISTORICO * 86_400_000).toISOString();

  const { linhas: atendimentos, erro } = await lerTudoEmPaginas<LinhaEntrega>((de, ate) =>
    admin
      .from("atendimentos_carretas")
      .select("id, placa_carreta, motorista_nome, pa_transportadoras(nome)")
      .eq("revenda_id", revendaId)
      .gte("chegada_em", desde)
      .order("chegada_em")
      .range(de, ate),
  );
  if (erro) throw new Error(`Não foi possível ler as carretas: ${erro}`);
  if (atendimentos.length === 0) return [];

  const ids = atendimentos.map((a) => a.id);
  const { linhas: itens, erro: erroItens } = await lerTudoEmPaginas<{
    atendimento_id: string;
    quantidade: number;
    quantidade_avariada: number | null;
  }>((de, ate) =>
    admin
      .from("atendimento_carretas_itens")
      .select("atendimento_id, quantidade, quantidade_avariada")
      .in("atendimento_id", ids)
      .range(de, ate),
  );
  if (erroItens) throw new Error(`Não foi possível ler os itens: ${erroItens}`);

  const porAtendimento = new Map<string, { quantidade: number; quantidadeAvariada: number | null }[]>();
  for (const i of itens) {
    const lista = porAtendimento.get(i.atendimento_id) ?? [];
    lista.push({ quantidade: i.quantidade, quantidadeAvariada: i.quantidade_avariada });
    porAtendimento.set(i.atendimento_id, lista);
  }

  const entregas: EntregaConferida[] = [];
  for (const a of atendimentos) {
    const doAtendimento = porAtendimento.get(a.id);
    if (!doAtendimento || doAtendimento.length === 0) continue;
    const pct = pctAvariaAtendimento(doAtendimento);
    if (pct === null) continue;
    entregas.push({
      placaCarreta: a.placa_carreta,
      motorista: a.motorista_nome,
      transportadoraNome: nomeDaTransportadora(a.pa_transportadoras),
      pctAvaria: pct,
    });
  }
  return entregas;
}

/**
 * ESTA CHEGADA CAI NA BLITZ? -- a decisão que a portaria grava.
 *
 * Decidida NA CHEGADA e congelada na coluna `blitz_exigida`, e não
 * calculada de novo quando o conferente abre a tela: entre uma coisa e
 * outra outra carga entra na média, e uma carreta que já foi marcada não
 * pode deixar de estar marcada porque o número mexeu no meio do
 * atendimento. O conferente ficaria com um checklist que sumiu da mão.
 */
export async function decidirBlitzDaChegada(
  revendaId: string,
  chegada: {
    placaCarreta?: string | null;
    motorista?: string | null;
    transportadoraNome?: string | null;
  },
): Promise<DecisaoDaBlitz & { limite: number | null }> {
  const [{ limite }, entregas] = await Promise.all([
    limiteDeAvaria(revendaId),
    entregasConferidas(revendaId),
  ]);
  return { ...decidirBlitz(indicesDaChegada(entregas, chegada), limite), limite };
}

/**
 * A BLITZ DO ATENDIMENTO -- lê a que existe, ou abre a primeira.
 *
 * Aberta pela PRÓPRIA TELA, e não por um botão "iniciar": na doca, com o
 * celular numa mão e a prancheta na outra, um toque a mais antes da
 * primeira pergunta é um toque que alguém esquece.
 *
 * E É AQUI QUE O MOTIVO FICA CONGELADO. A portaria grava só a marca (um
 * booleano); o número que sustenta a conversa com o transportador -- a
 * média, o limite, quantas cargas, e qual das três dimensões estourou --
 * é gravado agora. Seis meses depois o número de hoje não existe mais, e
 * o relato de ocorrência precisa continuar explicando por que esta
 * carreta foi parada.
 */
export async function garantirBlitzDoAtendimento(
  atendimentoId: string,
  revendaId: string,
  conferente: { id: string; nome: string },
): Promise<string | null> {
  const admin = createAdminClient();

  const { data: existente } = await admin
    .from("pa_blitz")
    .select("id")
    .eq("atendimento_id", atendimentoId)
    .maybeSingle();
  if (existente) return existente.id;

  const { data: a } = await admin
    .from("atendimentos_carretas")
    .select("id, placa_carreta, motorista_nome, pa_transportadoras(nome)")
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!a) return null;

  const bruto = a.pa_transportadoras as { nome: string } | { nome: string }[] | null;
  const transportadora = nomeDaTransportadora(bruto);

  // A decisão é recalculada só para GRAVAR os números; quem manda em ter
  // ou não blitz é a marca da portaria. Se a média mudou entre a chegada e
  // a doca, o checklist já está na mão do conferente -- tirá-lo agora seria
  // o pior dos dois mundos. E se a leitura falhar, a blitz abre mesmo
  // assim, sem os números: perder o checklist seria pior do que perder a
  // frase que explica o motivo.
  let decisao: (DecisaoDaBlitz & { limite: number | null }) | null = null;
  try {
    decisao = await decidirBlitzDaChegada(revendaId, {
      placaCarreta: a.placa_carreta,
      motorista: a.motorista_nome,
      transportadoraNome: transportadora,
    });
  } catch {
    decisao = null;
  }

  const { data: criada, error } = await admin
    .from("pa_blitz")
    .insert({
      revenda_id: revendaId,
      atendimento_id: atendimentoId,
      gatilho_dimensao: decisao?.dimensao ?? null,
      gatilho_nome: decisao?.nome ?? null,
      transportadora_nome: transportadora,
      media_avaria_pct: decisao?.media ?? null,
      limite_pct: decisao?.limite ?? null,
      carretas_consideradas: decisao?.cargas ?? null,
      status: "pendente",
      conferente_id: conferente.id,
      conferente_nome: conferente.nome,
      iniciada_em: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  // Erro aqui é quase sempre 23505: outra aba abriu a blitz no mesmo
  // instante e a trava `pa_blitz_atendimento_unico` recusou a segunda.
  // Não é falha -- basta ler a que ficou.
  if (error) {
    const { data: agora } = await admin
      .from("pa_blitz")
      .select("id")
      .eq("atendimento_id", atendimentoId)
      .maybeSingle();
    return agora?.id ?? null;
  }
  return criada?.id ?? null;
}
