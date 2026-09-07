import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CATALOGO_DE_METAS } from "@/lib/metas";

/**
 * OS CATÁLOGOS DO RELATO -- área, sala e IC/IV.
 *
 * Pedido do dono (07/09/2026): "a área precisa ser cadastrável e com menu
 * suspenso, a sala do mesmo jeito (...) IC/IV precisa ser cadastrável, e
 * já pode utilizar os mesmos que já possui e que já tem gatilho mapeado".
 *
 * O CADASTRO SE ALIMENTA DO USO. Quem escreve uma área nova no relato
 * acrescenta ela à lista para o próximo (ver `guardarNoCatalogo`) -- em
 * vez de exigir que alguém pare, abra outra tela e cadastre antes de
 * conseguir preencher o documento. Numa operação, a lista certa é a que
 * nasce do trabalho; a lista imaginada por quem programa é a que ninguém
 * usa.
 *
 * O IC/IV É DIFERENTE DOS OUTROS DOIS: ele já existe no app. Os
 * indicadores do CATALOGO_DE_METAS entram na lista sozinhos, e os que têm
 * gatilho ligado vêm marcados -- é o que liga o relato a um disparo de
 * verdade, em vez de um texto solto.
 */

export type ItemDeCatalogo = { nome: string; ajuda?: string };

type LinhaCatalogo = { tipo: string; nome: string };

export type CatalogosDoRelato = {
  areas: ItemDeCatalogo[];
  salas: ItemDeCatalogo[];
  icIv: ItemDeCatalogo[];
};

/**
 * Tudo numa consulta. Erro vira lista vazia DE PROPÓSITO aqui: sem os
 * catálogos os campos continuam sendo texto livre, que é como eram antes.
 * Derrubar o relato inteiro porque uma lista de sugestão falhou seria
 * trocar um incômodo por um bloqueio.
 */
export async function catalogosDoRelato(
  revendaId: string,
  indicadoresComGatilho: Set<string> = new Set(),
): Promise<CatalogosDoRelato> {
  const admin = createAdminClient();

  let gravados: LinhaCatalogo[] = [];
  try {
    const { data } = await admin
      .from("pa_relato_catalogos")
      .select("tipo, nome")
      .eq("revenda_id", revendaId)
      .eq("ativo", true)
      .order("ordem")
      .order("nome");
    gravados = (data ?? []) as LinhaCatalogo[];
  } catch {
    gravados = [];
  }

  const doTipo = (tipo: string) =>
    gravados.filter((l) => l.tipo === tipo).map((l) => ({ nome: l.nome }));

  // Os indicadores do app entram no IC/IV, com o gatilho dito ao lado.
  const dosIndicadores: ItemDeCatalogo[] = CATALOGO_DE_METAS.filter(
    (m) => (m.tipo ?? "meta") === "meta",
  ).map((m) => ({
    nome: m.rotulo,
    ajuda: indicadoresComGatilho.has(m.chave)
      ? "indicador com gatilho ligado"
      : "indicador do app",
  }));

  // O que foi digitado à mão e ainda não é indicador entra depois, sem
  // repetir o que já veio do catálogo de metas.
  const jaTem = new Set(dosIndicadores.map((i) => i.nome.toLowerCase()));
  const extras = doTipo("ic_iv").filter((i) => !jaTem.has(i.nome.toLowerCase()));

  return {
    areas: doTipo("area"),
    salas: doTipo("sala"),
    icIv: [...dosIndicadores, ...extras],
  };
}

/**
 * GUARDA O QUE FOI DIGITADO, se for novo.
 *
 * Silencioso por escolha: falhar aqui não pode impedir o relato de ser
 * salvo. O catálogo é conveniência; o documento é o que importa.
 */
export async function guardarNoCatalogo(
  revendaId: string,
  itens: { tipo: "area" | "sala" | "ic_iv"; nome: string | null | undefined }[],
): Promise<void> {
  const linhas = itens
    .map((i) => ({ tipo: i.tipo, nome: (i.nome ?? "").trim() }))
    .filter((i) => i.nome.length > 1)
    .map((i) => ({ revenda_id: revendaId, tipo: i.tipo, nome: i.nome }));
  if (linhas.length === 0) return;

  try {
    const admin = createAdminClient();
    await admin
      .from("pa_relato_catalogos")
      .upsert(linhas, { onConflict: "revenda_id,tipo,nome", ignoreDuplicates: true });
  } catch {
    /* catálogo é conveniência -- ver acima */
  }
}

/** Quais indicadores têm gatilho LIGADO nesta revenda. */
export async function indicadoresComGatilho(revendaId: string): Promise<Set<string>> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("pa_gatilhos_anomalia")
      .select("indicador")
      .eq("revenda_id", revendaId)
      .eq("ativo", true);
    return new Set((data ?? []).map((g) => g.indicador as string));
  } catch {
    return new Set();
  }
}
