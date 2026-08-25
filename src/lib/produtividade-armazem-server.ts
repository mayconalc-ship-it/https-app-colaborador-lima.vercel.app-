import "server-only";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEGUNDOS_DE_CACHE } from "@/lib/storage";
import { requireAcessoModulo, getModulosAcessiveis } from "@/lib/require-admin";
import { getRevendaId, revendaTemModulo } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { getConcessoes } from "@/lib/concessoes";
import { ehOwner, podeFazer, type ModuloId } from "@/lib/acessos";

/**
 * A dupla checagem que toda ação de servidor de uma funcionalidade de
 * Produtividade do Armazém precisa: a pessoa tem concessão pro sub-módulo
 * ESPECÍFICO (pa-reepack, pa-recebimento etc. -- não mais um "produtividade-
 * armazem" único, ver acessos.ts) e está numa revenda de verdade. `destino`
 * é a rota do próprio módulo, pra onde o erro volta.
 */
export async function exigirContextoModulo(modulo: ModuloId, destino: string) {
  const perfil = await requireAcessoModulo(modulo, destino);
  const revendaId = await getRevendaId();
  if (!revendaId) {
    redirect(`${destino}?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);
  }
  return { perfil, revendaId };
}

/** Todo sub-módulo que vive "dentro" de Produtividade do Armazém -- usado
 *  para decidir quem enxerga a vitrine (`/produtividade-armazem`) e o
 *  painel de indicadores, que são compartilhados por todas as
 *  funcionalidades e não fazem sentido gated por uma só delas. */
export const SUBMODULOS_ARMAZEM: ModuloId[] = [
  "pa-reepack",
  "pa-despejo",
  "pa-empilhadeira",
  "pa-recebimento",
  "pa-cinco-s",
  "pa-picking",
  "carretas-portaria",
  "carretas-conferencia",
];

/** Passa quem: é dono; é liderança com a permissão de administrar a área
 *  inteira ("produtividade-armazem:editar", a mesma que libera mexer nos
 *  catálogos); ou tem concessão de QUALQUER funcionalidade específica. Sem
 *  isso, a vitrine ficaria vazia mesmo para quem só tem uma das seis. */
export async function temAcessoArmazem(): Promise<boolean> {
  const perfil = await getPerfil();
  if (!perfil) return false;
  if (!(await revendaTemModulo("produtividade-armazem"))) return false;
  if (ehOwner(perfil.role)) return true;

  const concessoes = await getConcessoes();
  if (podeFazer(perfil.role, concessoes, "produtividade-armazem", "editar")) return true;

  const acessiveis = await getModulosAcessiveis();
  return SUBMODULOS_ARMAZEM.some((m) => acessiveis.has(m));
}

export async function requireAcessoArmazem(destino = "/") {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  if (!(await temAcessoArmazem())) {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        "Você não tem acesso a nenhuma funcionalidade de Produtividade do Armazém. Fale com o Admin.",
      )}`,
    );
  }
  return perfil;
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
