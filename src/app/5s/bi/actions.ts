"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContexto5S } from "@/lib/cinco-s-server";
import { validarReconhecimento } from "@/lib/cinco-s-reconhecimento";
import { apagarFotosReconhecimento, guardarFotoReconhecimento } from "@/lib/cinco-s-reconhecimento-server";

export type Resultado = { ok: true; mensagem: string } | { ok: false; erro: string };

/**
 * REGISTRA O RECONHECIMENTO DO MÊS (pedido do dono, 21/09/2026): o
 * reconhecimento acontece no grupo de WhatsApp; aqui fica a evidência --
 * áreas, texto e fotos. Quem cadastra no 5S ("5s: editar"). As mesmas
 * travas da tela (validarReconhecimento). As fotos sobem antes; se a
 * gravação falhar, saem do bucket -- não sobra foto órfã.
 */
export async function registrarReconhecimento(formData: FormData): Promise<Resultado> {
  const ctx = await getContexto5S();
  if (!ctx) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };
  if (!ctx.podeEditar) return { ok: false, erro: "Só quem cadastra no 5S registra o reconhecimento." };

  const competencia = String(formData.get("competencia") ?? "");
  const texto = String(formData.get("texto") ?? "").trim();
  const areasPedidas = [...new Set(formData.getAll("areas").map(String))].filter(Boolean);
  const fotos = formData.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);

  const problema = validarReconhecimento({
    competencia,
    areas: areasPedidas,
    texto,
    fotos: fotos.map((f) => ({ tamanho: f.size, tipo: f.type })),
  });
  if (problema) return { ok: false, erro: problema };

  const admin = createAdminClient();
  // Só áreas desta revenda -- o formulário é do navegador.
  const { data: validas } = await admin
    .from("cinco_s_areas")
    .select("id")
    .eq("revenda_id", ctx.revendaId)
    .in("id", areasPedidas);
  const areas = (validas ?? []).map((a) => a.id as string);
  if (areas.length === 0) return { ok: false, erro: "Marque pelo menos uma área reconhecida." };

  const pasta = `${ctx.revendaId}/5s/${competencia}`;
  const caminhos: string[] = [];
  for (const f of fotos) {
    const r = await guardarFotoReconhecimento(f, pasta);
    if (!r.ok) {
      await apagarFotosReconhecimento(caminhos);
      return { ok: false, erro: r.erro };
    }
    caminhos.push(r.caminho);
  }

  const { data: gravado, error } = await admin
    .from("cinco_s_reconhecimentos")
    .insert({
      revenda_id: ctx.revendaId,
      competencia: `${competencia}-01`,
      area_ids: areas,
      texto: texto || null,
      criado_por: ctx.perfilId,
      criado_por_nome: ctx.nome,
    })
    .select("id")
    .single();
  if (error || !gravado) {
    await apagarFotosReconhecimento(caminhos);
    return { ok: false, erro: `Não foi possível registrar: ${error?.message ?? "resposta vazia"}` };
  }
  const { error: erroFotos } = await admin
    .from("cinco_s_reconhecimento_fotos")
    .insert(caminhos.map((caminho) => ({ reconhecimento_id: gravado.id, revenda_id: ctx.revendaId, caminho })));
  if (erroFotos) {
    await admin.from("cinco_s_reconhecimentos").delete().eq("id", gravado.id);
    await apagarFotosReconhecimento(caminhos);
    return { ok: false, erro: `Não foi possível guardar as fotos: ${erroFotos.message}` };
  }

  revalidatePath("/5s/bi");
  return { ok: true, mensagem: `Reconhecimento registrado com ${caminhos.length} foto${caminhos.length === 1 ? "" : "s"}.` };
}

/** Apagar um reconhecimento lançado errado -- só com "5s: excluir". */
export async function excluirReconhecimento(id: string): Promise<Resultado> {
  const ctx = await getContexto5S();
  if (!ctx) return { ok: false, erro: "Sua sessão expirou. Entre de novo." };
  if (!ctx.podeExcluir) return { ok: false, erro: "Você não tem permissão para apagar." };
  const admin = createAdminClient();
  const { data: fotos } = await admin
    .from("cinco_s_reconhecimento_fotos")
    .select("caminho")
    .eq("reconhecimento_id", id)
    .eq("revenda_id", ctx.revendaId);
  const { error } = await admin.from("cinco_s_reconhecimentos").delete().eq("id", id).eq("revenda_id", ctx.revendaId);
  if (error) return { ok: false, erro: `Não foi possível apagar: ${error.message}` };
  await apagarFotosReconhecimento((fotos ?? []).map((f) => String(f.caminho)));
  revalidatePath("/5s/bi");
  return { ok: true, mensagem: "Reconhecimento apagado." };
}
