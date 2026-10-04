import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  classeDaCor,
  EDITORIAS_PADRAO,
  type Editoria,
} from "@/lib/comunicados";

type Linha = {
  id: string;
  rotulo: string;
  emoji: string;
  cor: string;
  ordem: number;
  ativa?: boolean;
};

/**
 * Da linha do banco para o que as telas usam.
 *
 * A classe do Tailwind é resolvida AQUI, uma vez só, para nenhuma tela
 * precisar lembrar de chamar `classeDaCor` -- foi assim que a etiqueta
 * saía sem cor quando alguém esquecia.
 */
function montar(linhas: Linha[]): Editoria[] {
  const vistos = new Set<string>();
  const lista: Editoria[] = [];
  // Rede de segurança: as duas leituras abaixo já recortam por revenda, e
  // dentro de uma revenda o id da editoria não se repete. Sem o recorte,
  // quem está em duas revendas veria "Segurança" duas vezes na barra.
  for (const l of linhas) {
    if (vistos.has(l.id)) continue;
    vistos.add(l.id);
    lista.push({
      id: l.id,
      rotulo: l.rotulo,
      emoji: l.emoji,
      cor: l.cor,
      classe: classeDaCor(l.cor),
    });
  }
  return lista;
}

/**
 * As editorias que o colaborador vê no jornal (só as ativas) -- as da
 * revenda em que ele está agora, como as matérias. A política de leitura
 * devolve as de todas as revendas dele.
 */
export async function editoriasDoJornal(revendaId: string): Promise<Editoria[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comunicado_editorias")
    .select("id, rotulo, emoji, cor, ordem")
    .eq("revenda_id", revendaId)
    .eq("ativa", true)
    .order("ordem")
    .order("rotulo");

  const lista = montar((data ?? []) as Linha[]);
  return lista.length > 0 ? lista : EDITORIAS_PADRAO;
}

/**
 * As editorias de UMA revenda, inclusive as desativadas -- é a visão do
 * Modo Liderança, que precisa enxergar o que desligou para poder religar.
 */
export async function editoriasDaRevenda(
  revendaId: string,
): Promise<(Editoria & { ativa: boolean })[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("comunicado_editorias")
    .select("id, rotulo, emoji, cor, ordem, ativa")
    .eq("revenda_id", revendaId)
    .order("ordem")
    .order("rotulo");

  const linhas = (data ?? []) as Linha[];
  if (linhas.length === 0) {
    return EDITORIAS_PADRAO.map((e) => ({ ...e, ativa: true }));
  }
  const ativaPorId = new Map(linhas.map((l) => [l.id, l.ativa !== false]));
  return montar(linhas).map((e) => ({
    ...e,
    ativa: ativaPorId.get(e.id) ?? true,
  }));
}
