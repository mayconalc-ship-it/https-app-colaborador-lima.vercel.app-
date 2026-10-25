import "server-only";

import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/*
 * FOTO DE BUCKET PRIVADO SAI PELO PRÓPRIO APP, E NÃO POR LINK ASSINADO
 * (25/10/2026).
 *
 * O Supabase bloqueou o projeto por estourar o tráfego do plano gratuito
 * (7 GB de 5 GB no ciclo), e 80% era o armazenamento -- quase tudo foto
 * de comprovante do QR, baixada de 10 a 16 vezes cada uma. Duas causas:
 *
 *   - link assinado muda a cada vez que a tela é montada, e endereço novo
 *     é cache vazio: cada lançamento ou conferência refazia a tela e o
 *     celular baixava de novo TODAS as fotos;
 *   - a miniatura da lista era a foto inteira (até 2000 px, ~100 KB).
 *
 * Agora cada foto tem endereço fixo (a foto de um id nunca muda: editar
 * troca a linha, não o arquivo), o navegador guarda para sempre, e as
 * listas usam uma miniatura de poucos KB. A foto inteira só desce quando
 * alguém toca nela. Cada módulo tem a sua rota, com a trava da tela dele;
 * o trabalho comum mora aqui.
 */

/** Dá conta da maior miniatura do app (a evolução do item da manutenção, ~180 px) em tela densa. */
const LADO_DA_MINIATURA = 360;

/** Onde mora a miniatura de uma foto: no mesmo bucket, fora da pasta das originais. */
export function caminhoDaMiniatura(caminho: string) {
  return `mini/${caminho.replace(/\.[a-z0-9]+$/i, "")}.webp`;
}

/** Os dois endereços de uma foto: `url` (inteira) e `mini` (a das listas). */
export function enderecosDaFoto(base: string, id: string, extras: Record<string, string> = {}) {
  const busca = (mais: Record<string, string>) => {
    const p = new URLSearchParams({ ...extras, ...mais }).toString();
    return p ? `${base}/${id}?${p}` : `${base}/${id}`;
  };
  return { url: busca({}), mini: busca({ tam: "mini" }) };
}

export function pediuMiniatura(request: Request) {
  return new URL(request.url).searchParams.get("tam") === "mini";
}

/**
 * Lê a foto (ou a miniatura) do bucket. A miniatura é gerada na primeira
 * vez que alguém pede e fica guardada: quem vem depois baixa ~10 KB, e não
 * a original inteira.
 */
export async function lerFotoDoBucket(
  bucket: string,
  caminho: string,
  mini: boolean,
  admin: Admin = createAdminClient(),
): Promise<{ dados: Buffer; contentType: string } | null> {
  const arquivos = admin.storage.from(bucket);

  if (mini) {
    const { data: guardada } = await arquivos.download(caminhoDaMiniatura(caminho));
    if (guardada) return { dados: Buffer.from(await guardada.arrayBuffer()), contentType: "image/webp" };
  }

  const { data: original } = await arquivos.download(caminho);
  if (!original) return null;
  const dados = Buffer.from(await original.arrayBuffer());
  const contentType = original.type || "image/jpeg";
  if (!mini) return { dados, contentType };

  try {
    const pequena = await sharp(dados)
      .rotate()
      .resize({ width: LADO_DA_MINIATURA, height: LADO_DA_MINIATURA, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 60 })
      .toBuffer();
    await arquivos.upload(caminhoDaMiniatura(caminho), pequena, { contentType: "image/webp", upsert: true });
    return { dados: pequena, contentType: "image/webp" };
  } catch {
    // Sem miniatura, a original serve -- só pesa mais.
    return { dados, contentType };
  }
}

/** A resposta da rota: a foto com cache para sempre, ou 404. */
export function respostaDaFoto(foto: { dados: Buffer; contentType: string } | null) {
  if (!foto) return new Response("Foto não encontrada.", { status: 404 });
  return new Response(new Uint8Array(foto.dados), {
    headers: {
      "Content-Type": foto.contentType,
      // private: só o navegador de quem viu guarda -- nada de CDN no meio,
      // que entregaria a foto a quem não passou pela trava.
      // immutable: o arquivo de um id nunca muda.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

/** Os caminhos a remover do bucket: as originais e as miniaturas delas. */
export function comMiniaturas(caminhos: string[]) {
  return [...caminhos, ...caminhos.map(caminhoDaMiniatura)];
}
