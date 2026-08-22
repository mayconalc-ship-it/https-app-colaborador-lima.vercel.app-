"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import {
  CORES_EDITORIA,
  EDITORIAS_PADRAO,
  idDeEditoria,
  type CorEditoria,
} from "@/lib/comunicados";

const TELA = "/admin/comunicados/editorias";

/**
 * A editoria em que caem as matérias de quem foi excluído.
 *
 * Ela é o chão do jornal: `editoria()` já devolve "geral" para categoria
 * desconhecida, então a matéria órfã não quebraria a tela -- mas ficaria
 * fora do filtro "Geral" na barra de editorias, invisível para quem
 * navega por lá. Reatribuir de verdade é o que mantém o arquivo inteiro
 * alcançável.
 */
const REFUGIO = "geral";

function campo(formData: FormData, nome: string) {
  return ((formData.get(nome) as string) || "").trim();
}

async function revendaOuErro() {
  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`${TELA}?erro=Voce+nao+esta+em+nenhuma+revenda`);
  return revendaId;
}

/**
 * Revenda criada depois da migration 047 chega aqui sem linha nenhuma.
 * Semear na primeira visita (e não só no SQL) evita que alguém precise
 * rodar migration à mão toda vez que uma unidade nova entra no app --
 * mesmo desenho do menu (ver admin/menu/actions.ts).
 */
async function garantirSemeado(
  admin: ReturnType<typeof createAdminClient>,
  revendaId: string,
) {
  const { count } = await admin
    .from("comunicado_editorias")
    .select("*", { count: "exact", head: true })
    .eq("revenda_id", revendaId);

  if (!count) {
    await admin.from("comunicado_editorias").insert(
      EDITORIAS_PADRAO.map((e, i) => ({
        revenda_id: revendaId,
        id: e.id,
        rotulo: e.rotulo,
        emoji: e.emoji,
        cor: e.cor,
        ordem: (i + 1) * 10,
      })),
    );
  }
}

/** A cor tem que ser uma das da paleta -- ver CORES_EDITORIA. */
function corValida(valor: string): CorEditoria {
  return valor in CORES_EDITORIA ? (valor as CorEditoria) : "cinza";
}

/** Depois de mexer nas editorias o jornal muda para todo mundo. */
function recarregarJornal() {
  revalidatePath("/comunicados");
  revalidatePath("/admin/comunicados");
  revalidatePath(TELA);
}

export async function criarEditoria(formData: FormData) {
  await requireModulo("comunicados", "criar");

  const rotulo = campo(formData, "rotulo");
  const emoji = campo(formData, "emoji") || "📰";
  const cor = corValida(campo(formData, "cor"));

  if (!rotulo) redirect(`${TELA}?erro=Dê+um+nome+à+editoria`);

  const id = idDeEditoria(rotulo);
  if (!id) {
    // Acontece com nome só de emoji ou de pontuação: o identificador
    // ficaria vazio e a editoria seria impossível de filtrar pela URL.
    redirect(`${TELA}?erro=Use+letras+no+nome+da+editoria`);
  }

  const admin = createAdminClient();
  const revendaId = await revendaOuErro();
  await garantirSemeado(admin, revendaId);

  // A ordem nasce no fim da lista: editoria nova entrando na frente de
  // "Segurança" seria uma decisão que ninguém pediu.
  const { data: ultima } = await admin
    .from("comunicado_editorias")
    .select("ordem")
    .eq("revenda_id", revendaId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("comunicado_editorias").insert({
    revenda_id: revendaId,
    id,
    rotulo,
    emoji,
    cor,
    ordem: (ultima?.ordem ?? 0) + 10,
  });

  if (error) {
    // 23505 = chave duplicada. "Saúde" e "saude" dão o mesmo identificador,
    // e a mensagem crua do Postgres não diria isso a ninguém.
    const recado =
      error.code === "23505"
        ? "Já existe uma editoria com esse nome"
        : error.message;
    redirect(`${TELA}?erro=${encodeURIComponent(recado)}`);
  }

  recarregarJornal();
  redirect(`${TELA}?sucesso=${encodeURIComponent(`Editoria "${rotulo}" criada`)}`);
}

export async function salvarEditoria(formData: FormData) {
  await requireModulo("comunicados", "editar");

  const id = campo(formData, "id");
  const rotulo = campo(formData, "rotulo");
  const emoji = campo(formData, "emoji") || "📰";
  const cor = corValida(campo(formData, "cor"));

  if (!rotulo) redirect(`${TELA}?erro=O+nome+não+pode+ficar+vazio`);

  const admin = createAdminClient();
  const revendaId = await revendaOuErro();
  await garantirSemeado(admin, revendaId);

  // O identificador NÃO muda ao renomear. É ele que está gravado em cada
  // matéria e nos links `/comunicados?editoria=...` que já circularam por
  // aí; trocá-lo desligaria as matérias da própria editoria.
  const { error } = await admin
    .from("comunicado_editorias")
    .update({ rotulo, emoji, cor })
    .eq("revenda_id", revendaId)
    .eq("id", id);

  if (error) redirect(`${TELA}?erro=${encodeURIComponent(error.message)}`);

  recarregarJornal();
  redirect(`${TELA}?sucesso=Editoria+atualizada`);
}

export async function moverEditoria(formData: FormData) {
  await requireModulo("comunicados", "editar");

  const id = campo(formData, "id");
  const direcao = campo(formData, "direcao");

  const admin = createAdminClient();
  const revendaId = await revendaOuErro();
  await garantirSemeado(admin, revendaId);

  const { data: lista } = await admin
    .from("comunicado_editorias")
    .select("id, ordem")
    .eq("revenda_id", revendaId)
    .order("ordem")
    .order("rotulo");

  if (!lista) redirect(`${TELA}?erro=Nao+foi+possivel+ler+as+editorias`);

  const i = lista.findIndex((e) => e.id === id);
  const destino = direcao === "cima" ? i - 1 : i + 1;
  if (i === -1 || destino < 0 || destino >= lista.length) redirect(TELA);

  // Duas linhas podem ter a mesma `ordem` (nada impede), e nesse caso
  // trocar os valores não moveria nada. Então a lista inteira é renumerada
  // com o item já na posição nova -- é uma tela com ~10 linhas, o custo é
  // irrelevante e o resultado é sempre o esperado.
  const nova = [...lista];
  const [movido] = nova.splice(i, 1);
  nova.splice(destino, 0, movido);

  for (let pos = 0; pos < nova.length; pos++) {
    await admin
      .from("comunicado_editorias")
      .update({ ordem: (pos + 1) * 10 })
      .eq("revenda_id", revendaId)
      .eq("id", nova[pos].id);
  }

  recarregarJornal();
  redirect(`${TELA}?sucesso=Ordem+atualizada`);
}

export async function alternarEditoria(formData: FormData) {
  await requireModulo("comunicados", "editar");

  const id = campo(formData, "id");
  const ativaAgora = campo(formData, "ativa") === "true";

  const admin = createAdminClient();
  const revendaId = await revendaOuErro();
  await garantirSemeado(admin, revendaId);

  const { error } = await admin
    .from("comunicado_editorias")
    .update({ ativa: !ativaAgora })
    .eq("revenda_id", revendaId)
    .eq("id", id);

  if (error) redirect(`${TELA}?erro=${encodeURIComponent(error.message)}`);

  recarregarJornal();
  redirect(
    `${TELA}?sucesso=${ativaAgora ? "Editoria+desligada" : "Editoria+ligada"}`,
  );
}

export async function excluirEditoria(formData: FormData) {
  await requireModulo("comunicados", "excluir");

  const id = campo(formData, "id");

  if (id === REFUGIO) {
    redirect(`${TELA}?erro=A+editoria+Geral+não+pode+ser+excluída`);
  }

  const admin = createAdminClient();
  const revendaId = await revendaOuErro();
  await garantirSemeado(admin, revendaId);

  // As matérias primeiro, a editoria depois. Na ordem inversa, uma falha
  // no meio deixaria matéria apontando para editoria que não existe mais.
  const { error: erroMaterias } = await admin
    .from("comunicados")
    .update({ categoria: REFUGIO })
    .eq("revenda_id", revendaId)
    .eq("categoria", id);

  if (erroMaterias) {
    redirect(`${TELA}?erro=${encodeURIComponent(erroMaterias.message)}`);
  }

  const { error } = await admin
    .from("comunicado_editorias")
    .delete()
    .eq("revenda_id", revendaId)
    .eq("id", id);

  if (error) redirect(`${TELA}?erro=${encodeURIComponent(error.message)}`);

  recarregarJornal();
  redirect(`${TELA}?sucesso=Editoria+excluída+(matérias+foram+para+Geral)`);
}
