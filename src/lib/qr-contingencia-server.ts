import "server-only";

import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULO_QR, NF_OBRIGATORIA_DESDE } from "@/lib/qr-contingencia";
import { podeNoModulo } from "@/lib/require-admin";

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

/**
 * Quem confere os comprovantes (22/09/2026): "criar" do módulo, a
 * permissão do financeiro, ou "editar", que conferia antes dela. A tela
 * e a ação perguntam por esta mesma função.
 */
export async function podeConferirComprovantes() {
  const [conferir, editar] = await Promise.all([
    podeNoModulo(MODULO_QR, "criar"),
    podeNoModulo(MODULO_QR, "editar"),
  ]);
  return conferir || editar;
}

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
  /** Quando foi feito na frente do cliente (no modo sem internet, antes do envio). */
  pagoEm: string;
  /** Chegou ao servidor mais de 15 min depois de feito -- veio da fila sem internet. */
  enviadoDepois: boolean;
  fotos: { id: string; url: string | null }[];
  /** As edições do motorista (migration 128), da mais antiga à mais nova. */
  edicoes: EdicaoDoComprovante[];
  /** A conferência do financeiro (migration 128). Cai se o motorista editar. */
  conferidoEm: string | null;
  conferidoPorNome: string | null;
  /** A conciliação com o extrato (migration 129). */
  situacao: "conferido" | "divergente" | null;
  valorExtrato: number | null;
  conferenciaObs: string | null;
  /** As notas fiscais do pagamento (migration 130). */
  notas: string[];
};

export type EdicaoDoComprovante = {
  colaboradorNome: string;
  editadoEm: string;
  valorAntes: number | null;
  valorDepois: number | null;
  fotosTiradas: number;
  fotosNovas: number;
  /** As NFs antes e depois (migration 130); null em edição anterior a ela. */
  notasAntes: string[] | null;
  notasDepois: string[] | null;
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
    pago_em: string | null;
    editado_em: string | null;
    conferido_em: string | null;
    conferido_por_nome: string | null;
    conferencia_situacao: string | null;
    valor_extrato: number | string | null;
    conferencia_obs: string | null;
    notas_fiscais: string[] | null;
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
  // O histórico só de quem foi editado -- a maioria nunca é.
  const editados = linhas.filter((l) => l.editado_em).map((l) => l.id);
  const edicoes: (EdicaoDoComprovante & { comprovanteId: string })[] = [];
  for (let i = 0; i < editados.length; i += 150) {
    const { data } = await admin
      .from("qr_comprovante_edicoes")
      .select(
        "comprovante_id, colaborador_nome, editado_em, valor_antes, valor_depois, fotos_tiradas, fotos_novas, notas_antes, notas_depois",
      )
      .in("comprovante_id", editados.slice(i, i + 150))
      .order("editado_em");
    for (const e of data ?? []) {
      edicoes.push({
        comprovanteId: String(e.comprovante_id),
        colaboradorNome: String(e.colaborador_nome),
        editadoEm: String(e.editado_em),
        valorAntes: e.valor_antes == null ? null : Number(e.valor_antes),
        valorDepois: e.valor_depois == null ? null : Number(e.valor_depois),
        fotosTiradas: Number(e.fotos_tiradas ?? 0),
        fotosNovas: Number(e.fotos_novas ?? 0),
        notasAntes: Array.isArray(e.notas_antes) ? e.notas_antes.map(String) : null,
        notasDepois: Array.isArray(e.notas_depois) ? e.notas_depois.map(String) : null,
      });
    }
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
    pagoEm: l.pago_em ?? l.criado_em,
    enviadoDepois:
      Boolean(l.pago_em) && new Date(l.criado_em).getTime() - new Date(l.pago_em!).getTime() > 15 * 60_000,
    fotos: fotos
      .filter((f) => f.comprovante_id === l.id)
      .map((f) => ({ id: f.id, url: links.get(f.caminho) ?? null })),
    edicoes: edicoes
      .filter((e) => e.comprovanteId === l.id)
      .map((e) => ({
        colaboradorNome: e.colaboradorNome,
        editadoEm: e.editadoEm,
        valorAntes: e.valorAntes,
        valorDepois: e.valorDepois,
        fotosTiradas: e.fotosTiradas,
        fotosNovas: e.fotosNovas,
        notasAntes: e.notasAntes,
        notasDepois: e.notasDepois,
      })),
    conferidoEm: l.conferido_em,
    conferidoPorNome: l.conferido_por_nome,
    situacao:
      l.conferencia_situacao === "divergente"
        ? "divergente"
        : l.conferencia_situacao === "conferido" || l.conferido_em
          ? "conferido"
          : null,
    valorExtrato: l.valor_extrato == null ? null : Number(l.valor_extrato),
    conferenciaObs: l.conferencia_obs,
    notas: Array.isArray(l.notas_fiscais) ? l.notas_fiscais.map(String) : [],
  }));
}

/**
 * OS COMPROVANTES DE HOJE NA TELA DO CELULAR, CONSOLIDADOS POR MAPA (pedido
 * do dono, 19/09/2026: "motorista e ajudante têm acesso; o app deve
 * consolidar todos os pagamentos por mapa, independente do usuário").
 * Vêm os da pessoa e TODOS os dos mapas em que ela trabalhou hoje -- os
 * que ela lançou e os `mapasExtras` (o mapa buscado na tela).
 */
export async function comprovantesDeHojeDaEquipe(
  revendaId: string,
  colaboradorId: string,
  mapasExtras: string[] = [],
): Promise<ComprovanteComFotos[]> {
  const admin = createAdminClient();
  const hoje = hojeNaOperacao();
  const { data: meus } = await admin
    .from("qr_comprovantes")
    .select("mapa")
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", colaboradorId)
    .eq("data", hoje);
  // Mapa é só dígito (normalizarMapa) -- seguro dentro do filtro.
  const mapas = [...new Set([...(meus ?? []).map((m) => m.mapa), ...mapasExtras])].filter(
    (m): m is string => typeof m === "string" && /^\d{1,20}$/.test(m),
  );
  const filtro = mapas.length
    ? `colaborador_id.eq.${colaboradorId},mapa.in.(${mapas.join(",")})`
    : `colaborador_id.eq.${colaboradorId}`;
  const { data: linhas } = await admin
    .from("qr_comprovantes")
    .select(COLUNAS_COMPROVANTE)
    .eq("revenda_id", revendaId)
    .eq("data", hoje)
    .or(filtro)
    .order("criado_em", { ascending: false });
  return comFotos(linhas ?? []);
}

/** O comprovante no formato da tela do celular. */
export function paraTelaDoCelular(c: ComprovanteComFotos, eu: string) {
  return {
    id: c.id,
    mapa: c.mapa,
    codPdv: c.codPdv,
    clienteNome: c.clienteNome,
    valor: c.valor,
    hora: new Date(c.pagoEm).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }),
    fotos: c.fotos,
    notas: c.notas,
    /** Feito depois da NF obrigatória: a edição também exige NF. */
    exigeNf: new Date(c.pagoEm).getTime() >= new Date(NF_OBRIGATORIA_DESDE).getTime(),
    editado: c.edicoes.length > 0,
    /** Lançado por outra pessoa da equipe do mapa: o nome dela; o próprio, null. */
    lancadoPor: c.colaboradorId === eu ? null : c.colaboradorNome,
  };
}

export const COLUNAS_COMPROVANTE =
  "id, data, mapa, cod_pdv, cliente_nome, cliente_cidade, valor, observacao, colaborador_id, colaborador_nome, criado_em, pago_em, editado_em, conferido_em, conferido_por_nome, conferencia_situacao, valor_extrato, conferencia_obs, notas_fiscais";
