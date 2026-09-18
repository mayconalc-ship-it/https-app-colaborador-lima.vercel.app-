import "server-only";

import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";

/** O bucket PRIVADO da migration 126 -- nunca o `conteudo`, que é público. */
export const BUCKET_COMPROVANTES = "comprovantes";

/** Quanto vale um link de foto/QR. A tela é aberta e lida na hora. */
const SEGUNDOS_DO_LINK = 60 * 60;

export type ConfigQr = {
  qrCaminho: string | null;
  /** Link assinado da imagem do QR, ou null sem QR cadastrado. */
  qrUrl: string | null;
  favorecido: string | null;
  cnpj: string | null;
  chavePix: string | null;
  instrucoes: string | null;
  atualizadoEm: string | null;
  atualizadoPorNome: string | null;
};

export async function lerConfigQr(revendaId: string): Promise<ConfigQr> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("qr_contingencia_config")
    .select("qr_caminho, favorecido, cnpj, chave_pix, instrucoes, atualizado_em, atualizado_por_nome")
    .eq("revenda_id", revendaId)
    .maybeSingle();
  const qrCaminho = data?.qr_caminho ?? null;
  let qrUrl: string | null = null;
  if (qrCaminho) {
    const { data: link } = await admin.storage.from(BUCKET_COMPROVANTES).createSignedUrl(qrCaminho, SEGUNDOS_DO_LINK);
    qrUrl = link?.signedUrl ?? null;
  }
  return {
    qrCaminho,
    qrUrl,
    favorecido: data?.favorecido ?? null,
    cnpj: data?.cnpj ?? null,
    chavePix: data?.chave_pix ?? null,
    instrucoes: data?.instrucoes ?? null,
    atualizadoEm: data?.atualizado_em ?? null,
    atualizadoPorNome: data?.atualizado_por_nome ?? null,
  };
}

/**
 * Reduz a foto antes de guardar. O celular já manda reduzida; isto é a
 * segunda camada, para a foto que chegou inteira (galeria, outro app).
 * Comprovante precisa ser LEGÍVEL: 2000 px no lado maior e qualidade 82
 * mantêm número e código de autenticação nítidos.
 *
 * Se o sharp falhar, guarda o original: perder o comprovante é pior do que
 * guardar um arquivo maior.
 */
async function prepararFoto(arquivo: File | Blob, nome = "foto.jpg") {
  const bruto = Buffer.from(await arquivo.arrayBuffer());
  try {
    const webp = await sharp(bruto)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { dados: webp, contentType: "image/webp", extensao: "webp" };
  } catch {
    const extensao = (nome.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
    return { dados: bruto, contentType: arquivo.type || "image/jpeg", extensao: extensao || "jpg" };
  }
}

/** Sobe um arquivo no bucket privado; devolve o CAMINHO (não há link público). */
export async function guardarNoBucket(
  arquivo: File,
  pasta: string,
): Promise<{ ok: true; caminho: string } | { ok: false; erro: string }> {
  const admin = createAdminClient();
  const { dados, contentType, extensao } = await prepararFoto(arquivo, arquivo.name);
  const caminho = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;
  const { error } = await admin.storage.from(BUCKET_COMPROVANTES).upload(caminho, dados, { contentType });
  if (error) return { ok: false, erro: `Falha ao enviar a foto: ${error.message}` };
  return { ok: true, caminho };
}

export async function apagarDoBucket(caminhos: string[]) {
  if (caminhos.length === 0) return;
  try {
    await createAdminClient().storage.from(BUCKET_COMPROVANTES).remove(caminhos);
  } catch {
    // Arquivo que sobrou não quebra nada; comprovante sem foto, sim.
  }
}

/** Links assinados para uma lista de caminhos, na mesma ordem. */
export async function linksAssinados(caminhos: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (caminhos.length === 0) return mapa;
  const { data } = await createAdminClient()
    .storage.from(BUCKET_COMPROVANTES)
    .createSignedUrls(caminhos, SEGUNDOS_DO_LINK);
  for (const l of data ?? []) if (l.path && l.signedUrl) mapa.set(l.path, l.signedUrl);
  return mapa;
}

const DIA_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Hoje, no fuso da operação -- a Vercel roda em UTC. */
export function hojeNaOperacao(quando: Date = new Date()) {
  return DIA_SP.format(quando);
}

export type ComprovanteComFotos = {
  id: string;
  data: string;
  mapa: string | null;
  codPdv: string;
  clienteNome: string | null;
  clienteCidade: string | null;
  valor: number | null;
  observacao: string | null;
  colaboradorId: string | null;
  colaboradorNome: string;
  criadoEm: string;
  fotos: { id: string; url: string | null }[];
};

/** Lê comprovantes (já filtrados pela consulta de quem chama) com as fotos assinadas. */
export async function comFotos(
  linhas: {
    id: string;
    data: string;
    mapa: string | null;
    cod_pdv: string;
    cliente_nome: string | null;
    cliente_cidade: string | null;
    valor: number | string | null;
    observacao: string | null;
    colaborador_id: string | null;
    colaborador_nome: string;
    criado_em: string;
  }[],
): Promise<ComprovanteComFotos[]> {
  if (linhas.length === 0) return [];
  const admin = createAdminClient();
  const ids = linhas.map((l) => l.id);
  const fotos: { id: string; comprovante_id: string; caminho: string }[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await admin
      .from("qr_comprovante_fotos")
      .select("id, comprovante_id, caminho")
      .in("comprovante_id", ids.slice(i, i + 150))
      .order("criado_em");
    fotos.push(...((data ?? []) as typeof fotos));
  }
  const links = await linksAssinados(fotos.map((f) => f.caminho));
  return linhas.map((l) => ({
    id: l.id,
    data: l.data,
    mapa: l.mapa,
    codPdv: l.cod_pdv,
    clienteNome: l.cliente_nome,
    clienteCidade: l.cliente_cidade,
    valor: l.valor == null ? null : Number(l.valor),
    observacao: l.observacao,
    colaboradorId: l.colaborador_id,
    colaboradorNome: l.colaborador_nome,
    criadoEm: l.criado_em,
    fotos: fotos
      .filter((f) => f.comprovante_id === l.id)
      .map((f) => ({ id: f.id, url: links.get(f.caminho) ?? null })),
  }));
}

export const COLUNAS_COMPROVANTE =
  "id, data, mapa, cod_pdv, cliente_nome, cliente_cidade, valor, observacao, colaborador_id, colaborador_nome, criado_em";
