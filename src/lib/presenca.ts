"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/** Todos entram no mesmo canal — é o que permite contar quem está junto. */
export const CANAL_PRESENCA = "presenca-app";

export type Presente = {
  nome: string;
  cargo: string | null;
  desde: string;
};

export type EstadoPresenca = {
  presentes: Presente[];
  conectado: boolean;
};

/**
 * Dono único do canal de presença.
 *
 * Precisa ser um só. O Supabase identifica o canal pelo nome, e devolve o
 * MESMO canal para quem pedir "presenca-app" duas vezes. Se um componente
 * assinar o canal e outro tentar pendurar um ouvinte depois, o Supabase
 * recusa com "cannot add presence callbacks after subscribe()" -- foi
 * exatamente o que derrubou a tela de Uso do App.
 *
 * Aqui os ouvintes são registrados ANTES de assinar, uma vez só, e quem
 * quiser saber quem está online se inscreve nesta lista em vez de mexer
 * no canal.
 */

let canal: RealtimeChannel | null = null;
let estado: EstadoPresenca = { presentes: [], conectado: false };
const ouvintes = new Set<(e: EstadoPresenca) => void>();

function avisarTodos() {
  for (const ouvinte of ouvintes) ouvinte(estado);
}

function recalcular() {
  if (!canal) return;

  try {
    const bruto = canal.presenceState<Presente>();
    const presentes: Presente[] = [];

    // Cada chave é uma pessoa; o array são as abas dela. Ficamos com a
    // primeira aba para não contar a mesma pessoa duas vezes.
    for (const abas of Object.values(bruto)) {
      const p = abas?.[0];
      if (p) presentes.push({ nome: p.nome, cargo: p.cargo, desde: p.desde });
    }

    // "?? ''" porque um cadastro sem nome derrubaria a ordenação inteira.
    presentes.sort((a, b) =>
      (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"),
    );

    estado = { ...estado, presentes };
  } catch {
    estado = { ...estado, presentes: [] };
  }

  avisarTodos();
}

/** Anuncia esta pessoa. Chamado uma vez, no app inteiro. */
export function iniciarPresenca(eu: {
  id: string;
  nome: string;
  cargo: string | null;
}) {
  if (canal) return;

  const supabase = createClient();

  // A chave é o id da pessoa: duas abas abertas contam como uma só.
  canal = supabase.channel(CANAL_PRESENCA, {
    config: { presence: { key: eu.id } },
  });

  canal
    .on("presence", { event: "sync" }, recalcular)
    .on("presence", { event: "join" }, recalcular)
    .on("presence", { event: "leave" }, recalcular)
    .subscribe(async (status) => {
      estado = { ...estado, conectado: status === "SUBSCRIBED" };
      avisarTodos();

      if (status !== "SUBSCRIBED" || !canal) return;
      await canal.track({
        nome: eu.nome,
        cargo: eu.cargo,
        desde: new Date().toISOString(),
      } satisfies Presente);
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
