import "server-only";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEGUNDOS_DE_CACHE } from "@/lib/storage";
import { requireAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";

/**
 * A dupla checagem que toda ação de servidor do módulo precisa: a pessoa
 * tem concessão pro módulo (não só a revenda ligada -- ver
 * MODULOS_OPCIONAIS em lib/acessos.ts) e está numa revenda de verdade.
 * `destino` é a rota do próprio módulo, pra onde o erro volta.
 */
export async function exigirContextoModulo(destino: string) {
  const perfil = await requireAcessoModulo("produtividade-armazem", destino);
  const revendaId = await getRevendaId();
  if (!revendaId) {
    redirect(`${destino}?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);
  }
  return { perfil, revendaId };
}

const TAMANHO_MAXIMO = 8 * 1024 * 1024;
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/**
 * Sobe a foto do horímetro no mesmo bucket `conteudo` que o resto do app
 * usa (comunicados, padrões, evidências do 5S). Caminho com timestamp:
 * nunca sobrescreve, então serve com cache imutável de um ano -- ver
 * lib/storage.ts.
 */
export async function subirFotoHorimetro(
  arquivo: File,
  prefixo: string,
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { ok: false, erro: "A foto passa de 8 MB. Tente outra." };
  }
  if (arquivo.type && !TIPOS_ACEITOS.includes(arquivo.type)) {
    return { ok: false, erro: "Envie uma imagem (JPG, PNG ou WEBP)." };
  }

  const admin = createAdminClient();
  const extensao = (arquivo.name.split(".").pop() ?? "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5);
  const caminho = `produtividade-armazem/empilhadeira/${prefixo}-${Date.now()}.${extensao || "jpg"}`;

  const { error } = await admin.storage.from("conteudo").upload(caminho, arquivo, {
    contentType: arquivo.type || "image/jpeg",
    upsert: true,
    cacheControl: SEGUNDOS_DE_CACHE,
  });

  if (error) return { ok: false, erro: `Falha ao enviar a foto: ${error.message}` };

  const { data } = admin.storage.from("conteudo").getPublicUrl(caminho);
  return { ok: true, url: data.publicUrl };
}
