import "server-only";

import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  calcularNotas,
  compararTrimestre,
  ehNota,
  type Bloco,
  type ItemManut,
  type Nota,
  type RespostaManut,
} from "@/lib/manutencao";

export const MODULO_MANUTENCAO = "manutencao" as const;
const BUCKET = "manutencao";
/** Link da foto vale 1 hora: o bastante para a auditoria olhar a tela. */
const SEGUNDOS_DO_LINK = 60 * 60;

type Admin = ReturnType<typeof createAdminClient>;

/**
 * A migration 156 pode ainda não ter rodado (o deploy da Vercel é
 * automático; a migração é manual). Sem as tabelas, a tela diz o que
 * falta em vez de quebrar.
 */
export class ModuloNaoInstalado extends Error {}

function conferir(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|Could not find the table/i.test(error.message)) {
    throw new ModuloNaoInstalado(error.message);
  }
  throw new Error(error.message);
}

// ---------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------

type ItemBanco = {
  id: string;
  numero: string;
  secao: number;
  secao_nome: string;
  bloco: string;
  ordem: number;
  pergunta: string;
  verificacao: string;
  criterios: string;
  peso: number;
  critico: boolean;
};

export async function lerItens(revendaId: string, admin: Admin = createAdminClient()): Promise<ItemManut[]> {
  const { data, error } = await admin
    .from("manut_itens")
    .select("id, numero, secao, secao_nome, bloco, ordem, pergunta, verificacao, criterios, peso, critico")
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .order("ordem");
  conferir(error);
  return ((data ?? []) as ItemBanco[]).map((i) => ({
    id: i.id,
    numero: i.numero,
    secao: i.secao,
    secaoNome: i.secao_nome,
    bloco: i.bloco as Bloco,
    ordem: i.ordem,
    pergunta: i.pergunta,
    verificacao: i.verificacao,
    criterios: i.criterios,
    peso: i.peso,
    critico: i.critico,
  }));
}

export type Avaliacao = {
  id: string;
  ano: number;
  trimestre: 1 | 2 | 3 | 4;
  status: "em_andamento" | "finalizada";
  iniciadaPorNome: string;
  iniciadaEm: string;
  finalizadaPorNome: string | null;
  finalizadaEm: string | null;
  notaTotal: number | null;
};

const CAMPOS_AVALIACAO =
  "id, ano, trimestre, status, iniciada_por_nome, iniciada_em, finalizada_por_nome, finalizada_em, nota_total";

type AvaliacaoBanco = {
  id: string;
  ano: number;
  trimestre: number;
  status: string;
  iniciada_por_nome: string;
  iniciada_em: string;
  finalizada_por_nome: string | null;
  finalizada_em: string | null;
  nota_total: number | string | null;
};

function paraAvaliacao(a: AvaliacaoBanco): Avaliacao {
  return {
    id: a.id,
    ano: a.ano,
    trimestre: a.trimestre as Avaliacao["trimestre"],
    status: a.status as Avaliacao["status"],
    iniciadaPorNome: a.iniciada_por_nome,
    iniciadaEm: a.iniciada_em,
    finalizadaPorNome: a.finalizada_por_nome,
    finalizadaEm: a.finalizada_em,
    notaTotal: a.nota_total === null ? null : Number(a.nota_total),
  };
}

/** Da mais nova para a mais antiga. */
export async function listarAvaliacoes(revendaId: string, admin: Admin = createAdminClient()): Promise<Avaliacao[]> {
  const { data, error } = await admin
    .from("manut_avaliacoes")
    .select(CAMPOS_AVALIACAO)
    .eq("revenda_id", revendaId)
    .order("ano", { ascending: false })
    .order("trimestre", { ascending: false });
  conferir(error);
  return ((data ?? []) as AvaliacaoBanco[]).map(paraAvaliacao).sort(compararTrimestre);
}

export async function lerAvaliacao(id: string, revendaId: string, admin: Admin = createAdminClient()) {
  const { data, error } = await admin
    .from("manut_avaliacoes")
    .select(CAMPOS_AVALIACAO)
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();
  conferir(error);
  return data ? paraAvaliacao(data as AvaliacaoBanco) : null;
}

export type FotoManut = { id: string; caminho: string; url: string | null };

export type RespostaCompleta = RespostaManut & {
  id: string;
  observacao: string | null;
  planoAcao: string | null;
  responsavel: string | null;
  prazo: string | null;
  respondidoPorNome: string;
  atualizadoEm: string;
  fotos: FotoManut[];
};

type RespostaBanco = {
  id: string;
  avaliacao_id: string;
  item_id: string;
  nota: number | null;
  na: boolean;
  observacao: string | null;
  plano_acao: string | null;
  responsavel: string | null;
  prazo: string | null;
  respondido_por_nome: string;
  atualizado_em: string;
  manut_fotos: { id: string; caminho: string; criado_em: string }[] | null;
};

/**
 * As respostas de várias avaliações de uma vez, com as fotos já em link
 * assinado. Uma ida ao banco e uma ao storage, em vez de uma por item.
 */
export async function lerRespostas(
  avaliacaoIds: string[],
  admin: Admin = createAdminClient(),
): Promise<Map<string, RespostaCompleta[]>> {
  const saida = new Map<string, RespostaCompleta[]>();
  if (avaliacaoIds.length === 0) return saida;

  const { data, error } = await admin
    .from("manut_respostas")
    .select(
      "id, avaliacao_id, item_id, nota, na, observacao, plano_acao, responsavel, prazo, respondido_por_nome, atualizado_em, manut_fotos(id, caminho, criado_em)",
    )
    .in("avaliacao_id", avaliacaoIds);
  conferir(error);

  const linhas = (data ?? []) as RespostaBanco[];
  const links = await linksAssinados(linhas.flatMap((r) => (r.manut_fotos ?? []).map((f) => f.caminho)), admin);

  for (const r of linhas) {
    const lista = saida.get(r.avaliacao_id) ?? [];
    lista.push({
      id: r.id,
      itemId: r.item_id,
      nota: ehNota(r.nota) ? (r.nota as Nota) : null,
      na: r.na,
      observacao: r.observacao,
      planoAcao: r.plano_acao,
      responsavel: r.responsavel,
      prazo: r.prazo,
      respondidoPorNome: r.respondido_por_nome,
      atualizadoEm: r.atualizado_em,
      fotos: (r.manut_fotos ?? [])
        .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
        .map((f) => ({ id: f.id, caminho: f.caminho, url: links.get(f.caminho) ?? null })),
    });
    saida.set(r.avaliacao_id, lista);
  }
  return saida;
}

/**
 * A EVOLUÇÃO -- o V.2 do DPO: a nota de cada seção em cada avaliação, da
 * mais antiga para a mais nova, para a tela comparar lado a lado.
 */
export async function evolucao(revendaId: string, quantas = 4, admin: Admin = createAdminClient()) {
  const [itens, avaliacoes] = await Promise.all([lerItens(revendaId, admin), listarAvaliacoes(revendaId, admin)]);
  const recentes = avaliacoes.slice(0, quantas).reverse();
  const respostas = await lerRespostas(
    recentes.map((a) => a.id),
    admin,
  );
  return {
    itens,
    avaliacoes,
    colunas: recentes.map((a) => ({ avaliacao: a, notas: calcularNotas(itens, respostas.get(a.id) ?? []), respostas: respostas.get(a.id) ?? [] })),
  };
}

// ---------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------

/**
 * A FOTO NO MENOR TAMANHO QUE AINDA SERVE PARA AUDITORIA.
 *
 * O celular já manda reduzida (CampoFoto: 1600 px, JPEG 80). Aqui a
 * segunda camada, que vale também para a foto que chegou inteira:
 *  - 1600 px no lado maior: dá para ver ferrugem na estrutura, trinca no
 *    muro e o mostrador do quadro elétrico, que é o que a auditoria olha;
 *  - WebP qualidade 72 com esforço máximo de compressão (effort 6): o
 *    arquivo cai para algo entre 120 e 300 KB sem diferença visível na
 *    tela do celular ou do computador.
 *  - .rotate() aplica a orientação da câmera antes de descartar o EXIF
 *    (que também leva a localização do aparelho -- melhor não guardar).
 *
 * Se o sharp falhar, guarda o original: perder a evidência é pior do que
 * guardar um arquivo maior.
 *
 * `lado` e `qualidade` são para quem não é evidência de auditoria: a foto
 * do chamado de manutenção sai com 1280 px (05/10/2026) -- medida em
 * fotos reais do app, cai de ~80 KB para ~50 KB, e o problema continua
 * à vista.
 */
export async function prepararFoto(arquivo: File, { lado = 1600, qualidade = 72 }: { lado?: number; qualidade?: number } = {}) {
  const bruto = Buffer.from(await arquivo.arrayBuffer());
  try {
    const { data, info } = await sharp(bruto)
      .rotate()
      .resize({ width: lado, height: lado, fit: "inside", withoutEnlargement: true })
      .webp({ quality: qualidade, effort: 6, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    return { dados: data, contentType: "image/webp", extensao: "webp", largura: info.width, altura: info.height };
  } catch {
    const extensao = (arquivo.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
    return { dados: bruto, contentType: arquivo.type || "image/jpeg", extensao: extensao || "jpg", largura: null, altura: null };
  }
}

/** Sobe no bucket privado; devolve o caminho (não existe link público). */
export async function guardarFoto(arquivo: File, pasta: string, admin: Admin = createAdminClient()) {
  const foto = await prepararFoto(arquivo);
  const caminho = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${foto.extensao}`;
  const { error } = await admin.storage.from(BUCKET).upload(caminho, foto.dados, { contentType: foto.contentType });
  if (error) return { ok: false as const, erro: `Falha ao enviar a foto: ${error.message}` };
  return { ok: true as const, caminho, bytes: foto.dados.length, largura: foto.largura, altura: foto.altura };
}

export async function apagarFotos(caminhos: string[], admin: Admin = createAdminClient()) {
  if (caminhos.length === 0) return;
  try {
    await admin.storage.from(BUCKET).remove(caminhos);
  } catch {
    // Arquivo que sobrou no bucket não quebra nada.
  }
}

export async function linksAssinados(caminhos: string[], admin: Admin = createAdminClient()) {
  const mapa = new Map<string, string>();
  if (caminhos.length === 0) return mapa;
  const { data } = await admin.storage.from(BUCKET).createSignedUrls(caminhos, SEGUNDOS_DO_LINK);
  for (const l of data ?? []) if (l.path && l.signedUrl) mapa.set(l.path, l.signedUrl);
  return mapa;
}
