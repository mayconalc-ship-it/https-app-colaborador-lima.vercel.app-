"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Um canal por revenda, e privado.
 *
 * Antes era um canal só, público, chamado "presenca-app". Canal público no
 * Realtime não passa por RLS nenhuma: bastava a chave pública -- que viaja
 * dentro do JavaScript do site -- para entrar e ler nome e cargo de quem
 * estivesse com o app aberto. Testado de fora, sem login, em 21/08/2026:
 * devolvia a lista inteira.
 *
 * Privado agora, com as políticas da migration 048 decidindo quem entra. E
 * separado por revenda, senão Barreiras e São Félix se enxergariam.
 *
 * O separador é ":" e não "-" porque o uuid da revenda já tem "-" no meio,
 * e a política precisa recortar o nome no lugar certo.
 */
export const topicoDaRevenda = (revendaId: string) => `presenca:${revendaId}`;

/**
 * O que trafega pelo canal: id e horário. NOME NÃO.
 *
 * O canal privado é a porta, mas não é a única defesa. Foi medido em
 * 22/08/2026 que pedir o mesmo tópico com `private: false` deixa entrar --
 * ou seja, a porta tem uma fresta que não depende de nós.
 *
 * Então o dado sensível simplesmente não entra aqui. Quem conseguir
 * escutar o canal recebe uma lista de uuid e carimbo de hora, que não diz
 * quem é ninguém. Os nomes são resolvidos por quem tem permissão de vê-los
 * (o painel do Modo Liderança), a partir de dados que o servidor já
 * carregou para aquela tela.
 */
export type Presente = {
  id: string;
  desde: string;
};

export type EstadoPresenca = {
  presentes: Presente[];
  conectado: boolean;
};

/**
 * Dono único do canal.
 *
 * Precisa ser um só. O Supabase identifica o canal pelo nome e devolve o
 * MESMO canal para quem pedir duas vezes. Se um componente assinar e outro
 * tentar pendurar um ouvinte depois, o Supabase recusa com "cannot add
 * presence callbacks after subscribe()" -- foi o que derrubou a tela de Uso
 * do App uma vez.
 *
 * Aqui os ouvintes são registrados ANTES de assinar, uma vez só, e quem
 * quiser saber quem está online se inscreve nesta lista em vez de mexer no
 * canal.
 */

let canal: RealtimeChannel | null = null;
/** De qual revenda é o canal aberto agora -- para saber quando trocar. */
let revendaDoCanal: string | null = null;
let estado: EstadoPresenca = { presentes: [], conectado: false };
const ouvintes = new Set<(e: EstadoPresenca) => void>();

function avisarTodos() {
  for (const ouvinte of ouvintes) ouvinte(estado);
}

function recalcular() {
  if (!canal) return;

  try {
    const bruto = canal.presenceState<{ desde: string }>();
    const presentes: Presente[] = [];

    // A CHAVE do estado é o id da pessoa (config.presence.key), e o array
    // são as abas dela. Ficamos com a primeira para não contar duas vezes.
    for (const [id, abas] of Object.entries(bruto)) {
      const p = abas?.[0];
      if (p) presentes.push({ id, desde: p.desde });
    }

    // Ordenar por nome não dá mais: o nome não trafega aqui. Quem exibe
    // ordena, porque é quem sabe os nomes.
    estado = { ...estado, presentes };
  } catch {
    estado = { ...estado, presentes: [] };
  }

  avisarTodos();
}

/**
 * Anuncia esta pessoa na revenda em que ela está.
 *
 * Trocar de revenda derruba o canal antigo e abre o da nova: continuar
 * anunciado na revenda anterior seria aparecer como online para gente que
 * não trabalha mais com você naquele momento.
 *
 * Falha calada de propósito. Se a autorização recusar (política ausente,
 * sessão expirada), o app inteiro continua funcionando -- o painel "Uso do
 * App" é que fica sem a lista. Presença é informação de apoio; não pode
 * derrubar a tela de ninguém.
 */
export async function iniciarPresenca(eu: { id: string; revendaId: string }) {
  if (canal && revendaDoCanal === eu.revendaId) return;

  /*
    TRAVA DE CONCORRÊNCIA.

    A guarda de cima não bastava, e o erro que ela existia para evitar
    continuou aparecendo no console de toda tela:

      cannot add `presence` callbacks for realtime:presenca:<uuid>
      after `subscribe()`

    O motivo é que esta função é ASSÍNCRONA e o `canal` só é preenchido lá
    embaixo, depois de dois `await`. Duas chamadas quase simultâneas -- o
    React executa o efeito duas vezes em desenvolvimento, e a navegação
    remonta o componente -- passavam as DUAS pela guarda com `canal` ainda
    nulo, e as duas criavam o canal do mesmo tópico. A segunda pendurava
    `.on("presence")` num tópico que a primeira já tinha assinado, e o
    Supabase recusa.

    Uma abertura de cada vez: quem chega no meio espera a que está
    correndo e, ao acordar, refaz a pergunta -- porque a essa altura o
    canal provavelmente já é o dela.
  */
  if (abrindo) {
    await abrindo.catch(() => {});
    if (canal && revendaDoCanal === eu.revendaId) return;
  }

  const tarefa = abrir(eu);
  abrindo = tarefa;
  try {
    await tarefa;
  } catch {
    /*
      Falha calada, como diz o comentário acima -- e agora de verdade.
      Quem chama faz `void iniciarPresenca(...)`, sem catch: qualquer coisa
      lançada aqui dentro virava um "Uncaught (in promise)" vermelho no
      console de TODA tela do app, para um recurso que é só de apoio.

      Zera o canal para que a próxima tentativa possa acontecer -- deixar
      `canal` preenchido depois de uma falha travaria a presença até
      alguém recarregar a página.
    */
    canal = null;
    revendaDoCanal = null;
    estado = { presentes: [], conectado: false };
    avisarTodos();
  } finally {
    if (abrindo === tarefa) abrindo = null;
  }
}

let abrindo: Promise<void> | null = null;

async function abrir(eu: { id: string; revendaId: string }) {
  const supabase = createClient();

  if (canal) {
    const antigo = canal;
    canal = null;
    revendaDoCanal = null;
    estado = { presentes: [], conectado: false };
    avisarTodos();
    try {
      await supabase.removeChannel(antigo);
    } catch {
      // idem
    }
  }

  // Canal privado só é liberado com o token da pessoa em mãos: sem isto o
  // servidor não sabe quem está pedindo e nega antes de olhar a política.
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.realtime.setAuth(data.session.access_token);
  } catch {
    return;
  }

  const topico = topicoDaRevenda(eu.revendaId);

  /*
    Varre canal antigo do MESMO tópico antes de abrir o novo.

    A trava acima resolve as chamadas simultâneas desta sessão, mas o
    cliente do Supabase vive fora deste módulo e sobrevive a ele: uma
    recarga de módulo em desenvolvimento zera o `canal` daqui e deixa o
    canal de verdade pendurado no cliente. Sem esta varredura, o próximo
    `.on("presence")` cai no mesmo tópico já assinado -- o mesmo erro,
    por outra porta.
  */
  try {
    for (const antigo of supabase.getChannels()) {
      if (antigo.topic === topico || antigo.topic === `realtime:${topico}`) {
        await supabase.removeChannel(antigo);
      }
    }
  } catch {
    // idem: presença não derruba tela.
  }

  revendaDoCanal = eu.revendaId;
  canal = supabase.channel(topico, {
    config: { private: true, presence: { key: eu.id } },
  });

  canal
    .on("presence", { event: "sync" }, recalcular)
    .on("presence", { event: "join" }, recalcular)
    .on("presence", { event: "leave" }, recalcular)
    .subscribe(async (status) => {
      estado = { ...estado, conectado: status === "SUBSCRIBED" };
      avisarTodos();

      if (status !== "SUBSCRIBED" || !canal) return;
      // Só o horário: a identidade já é a chave do canal, e nome não entra
      // aqui de propósito (ver o comentário do tipo Presente).
      await canal.track({ desde: new Date().toISOString() });
    });

  // O token do Supabase expira em uma hora. Sem renovar a autorização do
  // Realtime junto, o canal privado cai sozinho no meio do expediente e a
  // pessoa some da lista sem ter fechado nada. O canal público de antes não
  // tinha esse problema porque não conferia token nenhum.
  ligarRenovacaoDeToken(supabase);
}

let renovacaoLigada = false;
function ligarRenovacaoDeToken(supabase: ReturnType<typeof createClient>) {
  if (renovacaoLigada) return;
  renovacaoLigada = true;

  supabase.auth.onAuthStateChange((_evento, sessao) => {
    if (sessao?.access_token) {
      void supabase.realtime.setAuth(sessao.access_token).catch(() => {});
    }
  });
}

/** Recebe a lista de quem está online, agora e a cada mudança. */
export function assinarPresenca(ouvinte: (e: EstadoPresenca) => void) {
  ouvintes.add(ouvinte);
  ouvinte(estado); // já entrega o estado atual, sem esperar a próxima mudança
  return () => {
    ouvintes.delete(ouvinte);
  };
}
