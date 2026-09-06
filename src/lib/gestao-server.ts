import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfil } from "@/lib/sessao";
import { getConcessoes } from "@/lib/concessoes";
import { getRevendaId, getModulosDaRevenda } from "@/lib/revendas";
import { podeFazer } from "@/lib/acessos";
import { paineisPara, type Painel } from "@/lib/gestao";

/**
 * Os painéis que ESTA pessoa pode abrir, nesta revenda.
 *
 * A régua é a de sempre -- `podeFazer(modulo, "ver")` -- e é de propósito
 * que seja a de gestão mesmo nos dois painéis que não se mudaram: aqui é
 * a área de quem administra. O operador de empilhadeira continua abrindo
 * o painel de gás pelo caminho dele, sem passar por aqui e sem precisar
 * de concessão nova; o que este filtro decide é só o que aparece NESTA
 * barra.
 *
 * Duas perguntas, nesta ordem, iguais às do Modo Liderança: a revenda usa
 * o módulo? e esta pessoa pode abri-lo? A primeira vale até para o dono.
 */
export const paineisVisiveis = cache(async (): Promise<Painel[]> => {
  const perfil = await getPerfil();
  if (!perfil) return [];

  const revendaId = await getRevendaId();
  if (!revendaId) return [];

  const [concessoes, modulosDaRevenda] = await Promise.all([
    getConcessoes(),
    getModulosDaRevenda(revendaId),
  ]);

  return paineisPara(modulosDaRevenda, (modulo) =>
    podeFazer(perfil.role, concessoes, modulo, "ver"),
  );
});

export type SinalDoPainel = {
  /** O número em destaque. */
  valor: number;
  /** O que ele conta, em duas ou três palavras. */
  rotulo: string;
};

/**
 * O QUE ESTÁ ESPERANDO, por painel -- o que faz o cartão valer na home.
 *
 * Um cartão que só diz "Anomalias" obriga a abrir para descobrir se há
 * algo lá. Com "3 esperando" ao lado, a pessoa decide sem entrar -- e,
 * mais importante, VÊ que existe algo quando não ia procurar.
 *
 * SÓ O QUE É PENDÊNCIA ganha número. "Produtividade do Armazém" não tem um
 * número que se cobre; pôr qualquer coisa ali (o HL do mês, por exemplo)
 * seria enfeite, e um enfeite ao lado de um alerta de verdade estraga os
 * dois. Painel sem sinal fica sem sinal, e é o certo.
 *
 * As contagens são `head: true` -- o banco devolve só o total, sem trazer
 * nenhuma linha. É o que permite isto rodar na home sem pesar.
 */
export async function sinaisDosPaineis(
  paineis: Painel[],
  revendaId: string,
): Promise<Record<string, SinalDoPainel>> {
  const sinais: Record<string, SinalDoPainel> = {};
  if (!paineis.some((p) => p.id === "anomalias")) return sinais;

  const admin = createAdminClient();
  try {
    const [relatos, blitz] = await Promise.all([
      admin
        .from("pa_relatos_anomalia")
        .select("id", { count: "exact", head: true })
        .eq("revenda_id", revendaId)
        .eq("status", "aberto"),
      admin
        .from("pa_blitz")
        .select("id", { count: "exact", head: true })
        .eq("revenda_id", revendaId)
        .eq("status", "concluida"),
    ]);

    const total = (relatos.count ?? 0) + (blitz.count ?? 0);
    if (total > 0) {
      sinais.anomalias = {
        valor: total,
        rotulo: total === 1 ? "esperando você" : "esperando alguém",
      };
    }
  } catch {
    // Sem contagem o cartão continua funcionando -- ele só perde o
    // número. Um erro de leitura não pode derrubar a home.
  }
  return sinais;
}
