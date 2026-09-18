"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { MODULO_QR, TIPOS_DE_FOTO, validarConfigQr } from "@/lib/qr-contingencia";
import { apagarDoBucket, guardarNoBucket } from "@/lib/qr-contingencia-server";

const ROTA = "/admin/qr-contingencia";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`${ROTA}?${chave}=${encodeURIComponent(mensagem)}`);
}

/**
 * SALVA O QR DE CONTINGÊNCIA -- imagem, favorecido, CNPJ, código PIX e
 * instruções, num Salvar só. A imagem nova substitui a antiga (que é
 * apagada depois que a nova já está gravada).
 */
export async function salvarConfigQr(formData: FormData) {
  const perfil = await requireModulo(MODULO_QR, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const { data: atual } = await admin
    .from("qr_contingencia_config")
    .select("qr_caminho")
    .eq("revenda_id", revendaId)
    .maybeSingle();

  const arquivo = formData.get("qr");
  const novoQr = arquivo instanceof File && arquivo.size > 0 ? arquivo : null;
  if (novoQr && novoQr.type && !TIPOS_DE_FOTO.includes(novoQr.type)) voltar("erro", "Envie o QR como imagem (PNG ou JPG).");
  if (novoQr && novoQr.size > 5 * 1024 * 1024) voltar("erro", "A imagem do QR passa de 5 MB.");

  const dados = {
    temQr: Boolean(novoQr || atual?.qr_caminho),
    favorecido: String(formData.get("favorecido") ?? "").trim(),
    cnpj: String(formData.get("cnpj") ?? "").trim(),
    chavePix: String(formData.get("chave_pix") ?? "").trim(),
    instrucoes: String(formData.get("instrucoes") ?? "").trim(),
  };
  const problema = validarConfigQr(dados);
  if (problema) voltar("erro", problema);

  let qrCaminho = atual?.qr_caminho ?? null;
  if (novoQr) {
    const r = await guardarNoBucket(novoQr, `${revendaId}/qr`);
    if (!r.ok) voltar("erro", r.erro);
    qrCaminho = r.caminho;
  }

  const { error } = await admin.from("qr_contingencia_config").upsert({
    revenda_id: revendaId,
    qr_caminho: qrCaminho,
    favorecido: dados.favorecido || null,
    cnpj: dados.cnpj.replace(/\D/g, "") || null,
    chave_pix: dados.chavePix || null,
    instrucoes: dados.instrucoes || null,
    atualizado_em: new Date().toISOString(),
    atualizado_por_nome: perfil.nome,
  });
  if (error) {
    if (novoQr && qrCaminho) await apagarDoBucket([qrCaminho]);
    voltar("erro", `Não foi possível salvar: ${error.message}`);
  }
  if (novoQr && atual?.qr_caminho) await apagarDoBucket([atual.qr_caminho]);

  revalidatePath(ROTA);
  revalidatePath("/qr-contingencia");
  voltar("sucesso", "QR de contingência salvo. Os motoristas já veem a versão nova.");
}
