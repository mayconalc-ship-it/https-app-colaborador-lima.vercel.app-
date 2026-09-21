import "server-only";

import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";

/** O bucket PRIVADO da migration 131: print de WhatsApp mostra nome e telefone. */
const BUCKET = "reconhecimentos";
const SEGUNDOS_DO_LINK = 60 * 60;

/** Reduz (2000 px, webp) e guarda; devolve o caminho. */
export async function guardarFotoReconhecimento(
  arquivo: File,
  pasta: string,
): Promise<{ ok: true; caminho: string } | { ok: false; erro: string }> {
  const bruto = Buffer.from(await arquivo.arrayBuffer());
  let dados: Buffer = bruto;
  let contentType = arquivo.type || "image/jpeg";
  let extensao = "jpg";
  try {
    dados = await sharp(bruto)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    contentType = "image/webp";
    extensao = "webp";
  } catch {
    // Sem conversão: guarda o original -- perder a foto é pior.
  }
  const caminho = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;
  const { error } = await createAdminClient().storage.from(BUCKET).upload(caminho, dados, { contentType });
  if (error) return { ok: false, erro: `Falha ao enviar a foto: ${error.message}` };
  return { ok: true, caminho };
}

export async function apagarFotosReconhecimento(caminhos: string[]) {
  if (caminhos.length === 0) return;
  try {
    await createAdminClient().storage.from(BUCKET).remove(caminhos);
  } catch {
    // Arquivo que sobrou não quebra nada.
  }
}

export type Reconhecimento = {
  id: string;
  competencia: string; // "2026-09"
  areas: string[]; // nomes
  texto: string | null;
  criadoPorNome: string;
  criadoEm: string;
  fotos: { id: string; url: string | null }[];
};

/** Os reconhecimentos de um mês (ou todos, com `competencia` null), com as fotos assinadas. */
export async function lerReconhecimentos(revendaId: string, competencia: string | null): Promise<Reconhecimento[]> {
  const admin = createAdminClient();
  let consulta = admin
    .from("cinco_s_reconhecimentos")
    .select("id, competencia, area_ids, texto, criado_por_nome, criado_em")
    .eq("revenda_id", revendaId)
    .order("competencia", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(60);
  if (competencia) consulta = consulta.eq("competencia", `${competencia}-01`);
  const { data: linhas, error } = await consulta;
  // Tabela ainda não criada (migration 131 não rodou): a tela segue sem o bloco.
  if (error || !linhas || linhas.length === 0) return [];

  const ids = linhas.map((l) => l.id as string);
  const areaIds = [...new Set(linhas.flatMap((l) => (l.area_ids as string[]) ?? []))];
  const [{ data: fotos }, { data: areas }] = await Promise.all([
    admin.from("cinco_s_reconhecimento_fotos").select("id, reconhecimento_id, caminho").in("reconhecimento_id", ids).order("criado_em"),
    areaIds.length
      ? admin.from("cinco_s_areas").select("id, nome").in("id", areaIds)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const nomeDaArea = new Map((areas ?? []).map((a) => [a.id as string, a.nome as string]));
  const caminhos = (fotos ?? []).map((f) => f.caminho as string);
  const links = new Map<string, string>();
  if (caminhos.length) {
    const { data: assinados } = await admin.storage.from(BUCKET).createSignedUrls(caminhos, SEGUNDOS_DO_LINK);
    for (const l of assinados ?? []) if (l.path && l.signedUrl) links.set(l.path, l.signedUrl);
  }
  return linhas.map((l) => ({
    id: l.id as string,
    competencia: String(l.competencia).slice(0, 7),
    areas: ((l.area_ids as string[]) ?? []).map((id) => nomeDaArea.get(id) ?? "—"),
    texto: (l.texto as string | null) ?? null,
    criadoPorNome: l.criado_por_nome as string,
    criadoEm: l.criado_em as string,
    fotos: (fotos ?? [])
      .filter((f) => f.reconhecimento_id === l.id)
      .map((f) => ({ id: f.id as string, url: links.get(f.caminho as string) ?? null })),
  }));
}

export type DestaquesDoMes = {
  maiorNota: { area: string; areaId: string; conformidade: number }[];
  maiorEvolucao: { area: string; areaId: string; de: number; para: number } | null;
};

/**
 * A SUGESTÃO DO BI para o reconhecimento: as áreas com a maior nota do mês
 * e a que mais evoluiu sobre o mês anterior. Quem decide é a liderança --
 * isto só poupa a conta e liga o reconhecimento ao resultado (V.6).
 */
export async function destaquesDoMes(revendaId: string, competencia: string): Promise<DestaquesDoMes> {
  const [ano, mes] = competencia.split("-").map(Number);
  const anterior = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const admin = createAdminClient();
  const { data } = await admin
    .from("cinco_s_auditorias")
    .select("area_id, competencia, conformidade")
    .eq("revenda_id", revendaId)
    .eq("status", "finalizada")
    .in("competencia", [`${competencia}-01`, `${anterior}-01`])
    .not("conformidade", "is", null);
  const linhas = data ?? [];
  const doMes = linhas.filter((l) => String(l.competencia).startsWith(competencia));
  if (doMes.length === 0) return { maiorNota: [], maiorEvolucao: null };
  const { data: areas } = await admin
    .from("cinco_s_areas")
    .select("id, nome")
    .in("id", [...new Set(doMes.map((l) => l.area_id as string))]);
  const nome = new Map((areas ?? []).map((a) => [a.id as string, a.nome as string]));

  const max = Math.max(...doMes.map((l) => Number(l.conformidade)));
  const maiorNota = doMes
    .filter((l) => Number(l.conformidade) === max)
    .map((l) => ({ area: nome.get(l.area_id as string) ?? "—", areaId: l.area_id as string, conformidade: max }));

  let maiorEvolucao: DestaquesDoMes["maiorEvolucao"] = null;
  for (const l of doMes) {
    const antes = linhas.find((x) => x.area_id === l.area_id && String(x.competencia).startsWith(anterior));
    if (!antes) continue;
    const ganho = Number(l.conformidade) - Number(antes.conformidade);
    if (ganho > 0 && (!maiorEvolucao || ganho > maiorEvolucao.para - maiorEvolucao.de)) {
      maiorEvolucao = {
        area: nome.get(l.area_id as string) ?? "—",
        areaId: l.area_id as string,
        de: Number(antes.conformidade),
        para: Number(l.conformidade),
      };
    }
  }
  return { maiorNota, maiorEvolucao };
}
