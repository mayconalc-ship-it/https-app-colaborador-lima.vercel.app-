import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { enderecosDaFoto, lerFotoDoBucket } from "@/lib/foto-privada-server";
import {
  chaveBimestre,
  bimestreDe,
  diasParaFechar,
  ehGravidade,
  farolDoVeiculo,
  fimDoBimestre,
  rotuloBimestre,
  ultimosBimestres,
  type Bimestre,
  type Farol,
  type FotoFrota,
  type Gravidade,
  type ItemFrota,
  type RespostaFrota,
} from "@/lib/frota-check";

type Admin = ReturnType<typeof createAdminClient>;

/** As fotos moram no bucket da manutenção, pasta frota-check/ (sem bucket novo). */
export const BUCKET_FROTA_CHECK = "manutencao";

export class FrotaCheckNaoInstalado extends Error {}

/** Os 49 itens com os defeitos do manual. Iguais para todas as revendas. */
export async function lerItensFrota(admin: Admin = createAdminClient()): Promise<ItemFrota[]> {
  const [{ data: itens, error }, { data: defeitos }] = await Promise.all([
    admin.from("cf_itens").select("id, ordem, grupo, nome, classificacao").eq("ativo", true).order("ordem"),
    admin.from("cf_defeitos").select("id, item_id, ordem, descricao, gravidade, classificacao").order("ordem"),
  ]);
  if (error) throw new FrotaCheckNaoInstalado(error.message);
  return (itens ?? []).map((i) => ({
    id: i.id,
    ordem: i.ordem,
    grupo: i.grupo,
    nome: i.nome,
    classificacao: i.classificacao,
    defeitos: (defeitos ?? [])
      .filter((d) => d.item_id === i.id)
      .map((d) => ({
        id: d.id,
        descricao: d.descricao,
        gravidade: (ehGravidade(d.gravidade) ? d.gravidade : "grave") as Gravidade,
        classificacao: d.classificacao,
      })),
  }));
}

export const COLUNAS_CHECK =
  "id, revenda_id, veiculo_id, ano, bimestre, origem, mes_planilha, status, iniciado_por, iniciado_por_nome, iniciado_em, km, assinado_por, assinado_por_nome, assinado_cargo, assinado_em, assinatura_caminho, total, ok, nok, conformidade, pior_gravidade, observacao";

export async function lerCheck(id: string, revendaId: string, admin: Admin = createAdminClient()) {
  const { data } = await admin.from("cf_checks").select(COLUNAS_CHECK).eq("id", id).eq("revenda_id", revendaId).maybeSingle();
  return data;
}

export async function lerVeiculo(id: string, revendaId: string, admin: Admin = createAdminClient()) {
  const { data } = await admin
    .from("cf_veiculos")
    .select("id, placa, descricao, responsavel_id, responsavel_nome, ativo")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();
  return data;
}

export type RespostaCompletaFrota = RespostaFrota & {
  id: string;
  respondidoPorNome: string | null;
  corrigidoEm: string | null;
  corrigidoPorNome: string | null;
  correcao: string | null;
  fotosCorrecao: FotoFrota[];
};

/** As respostas de um check, com as fotos (endereço fixo, pela rota do módulo). */
export async function lerRespostasFrota(checkId: string, revendaId: string, admin: Admin = createAdminClient()) {
  const [{ data: resp }, { data: fotos }] = await Promise.all([
    admin
      .from("cf_respostas")
      .select("id, item_id, ok, defeito_id, gravidade, observacao, respondido_por_nome, corrigido_em, corrigido_por_nome, correcao")
      .eq("check_id", checkId)
      .eq("revenda_id", revendaId),
    admin.from("cf_fotos").select("id, item_id, tipo, chave").eq("check_id", checkId).eq("revenda_id", revendaId).order("criado_em"),
  ]);
  const mapa = new Map<string, RespostaCompletaFrota>();
  for (const r of resp ?? []) {
    mapa.set(r.item_id, {
      id: r.id,
      itemId: r.item_id,
      ok: r.ok,
      defeitoId: r.defeito_id,
      gravidade: ehGravidade(r.gravidade) ? r.gravidade : null,
      observacao: r.observacao,
      respondidoPorNome: r.respondido_por_nome,
      corrigidoEm: r.corrigido_em,
      corrigidoPorNome: r.corrigido_por_nome,
      correcao: r.correcao,
      fotos: [],
      fotosCorrecao: [],
    });
  }
  for (const f of fotos ?? []) {
    const r = mapa.get(f.item_id ?? "");
    if (!r) continue;
    const foto = { id: f.id, ...enderecosDaFoto("/api/frota-check/foto", f.id), chave: f.chave };
    (f.tipo === "correcao" ? r.fotosCorrecao : r.fotos).push(foto);
  }
  return mapa;
}

export async function lerFotoDaFrota(id: string, revendaId: string, mini: boolean) {
  const admin = createAdminClient();
  const { data } = await admin.from("cf_fotos").select("caminho").eq("id", id).eq("revenda_id", revendaId).maybeSingle();
  if (!data?.caminho) return null;
  return lerFotoDoBucket(BUCKET_FROTA_CHECK, String(data.caminho), mini, admin);
}

export async function lerAssinatura(checkId: string, revendaId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cf_checks")
    .select("assinatura_caminho")
    .eq("id", checkId)
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!data?.assinatura_caminho) return null;
  const { data: arquivo } = await admin.storage.from(BUCKET_FROTA_CHECK).download(String(data.assinatura_caminho));
  if (!arquivo) return null;
  return { dados: Buffer.from(await arquivo.arrayBuffer()), contentType: "image/png" };
}

// ---------------------------------------------------------------------
// O PAINEL (tela do módulo e Gestor LOG)
// ---------------------------------------------------------------------

export type VeiculoDoPainel = {
  id: string;
  placa: string;
  descricao: string | null;
  responsavelId: string | null;
  responsavel: string;
  /** O responsável da placa ainda é só o nome da planilha (sem cadastro no app). */
  semCadastro: boolean;
  farol: Farol;
  check: {
    id: string;
    status: string;
    origem: string;
    conformidade: number | null;
    nok: number | null;
    pior: Gravidade | null;
    assinadoPor: string | null;
    assinadoEm: string | null;
    iniciadoPor: string | null;
    iniciadoPorId: string | null;
  } | null;
  /** O check feito mais recente (pode ser de outro bimestre). */
  ultimo: { rotulo: string; conformidade: number | null } | null;
  pendencias: number;
  bloqueio: boolean;
};

export type PendenciaDoPainel = {
  respostaId: string;
  checkId: string;
  veiculoId: string;
  placa: string;
  responsavel: string;
  item: string;
  grupo: string;
  defeito: string | null;
  gravidade: Gravidade | null;
  desde: string | null;
  origem: string;
};

export type PainelFrota = {
  bimestre: Bimestre & { rotulo: string; rotuloCurto: string; fim: string; dias: number };
  veiculos: VeiculoDoPainel[];
  responsaveis: {
    id: string | null;
    nome: string;
    semCadastro: boolean;
    total: number;
    feitos: number;
    pendentes: number;
    atencao: number;
    conformidade: number | null;
  }[];
  pendencias: PendenciaDoPainel[];
  evolucao: { rotulo: string; feitos: number; conformidade: number | null; nok: number }[];
  pareto: { item: string; grupo: string; n: number }[];
  totais: { veiculos: number; feitos: number; andamento: number; pendentes: number; atencao: number; bloqueados: number; conformidade: number | null };
};

const FEITO = new Set(["assinado", "planilha"]);

export async function painelFrota(revendaId: string, hojeIso: string, admin: Admin = createAdminClient()): Promise<PainelFrota> {
  const atual = bimestreDe(hojeIso);
  const janela = ultimosBimestres(atual, 6);
  const dias = diasParaFechar(atual, hojeIso);

  const [{ data: veiculos, error }, { data: checks }, itens] = await Promise.all([
    admin
      .from("cf_veiculos")
      .select("id, placa, descricao, responsavel_id, responsavel_nome")
      .eq("revenda_id", revendaId)
      .eq("ativo", true)
      .order("placa"),
    admin
      .from("cf_checks")
      .select("id, veiculo_id, ano, bimestre, origem, status, conformidade, ok, nok, total, pior_gravidade, assinado_por_nome, assinado_em, iniciado_por, iniciado_por_nome, iniciado_em")
      .eq("revenda_id", revendaId)
      .gte("ano", atual.ano - 2)
      .order("ano", { ascending: false })
      .order("bimestre", { ascending: false }),
    lerItensFrota(admin),
  ]);
  if (error) throw new FrotaCheckNaoInstalado(error.message);

  const ids = [...new Set((veiculos ?? []).map((v) => v.responsavel_id).filter(Boolean))] as string[];
  const { data: pessoas } = ids.length ? await admin.from("profiles").select("id, nome").in("id", ids) : { data: [] };
  const nomeDe = new Map((pessoas ?? []).map((p) => [p.id, primeiroEUltimo(p.nome)]));

  const doBimestre = new Map<string, NonNullable<typeof checks>[number]>();
  const ultimoFeito = new Map<string, NonNullable<typeof checks>[number]>();
  for (const c of checks ?? []) {
    if (c.ano === atual.ano && c.bimestre === atual.bimestre) doBimestre.set(c.veiculo_id, c);
    if (FEITO.has(c.status) && !ultimoFeito.has(c.veiculo_id)) ultimoFeito.set(c.veiculo_id, c);
  }

  // Pendências: NOK do último check feito de cada placa, ainda sem correção.
  const ultimosIds = [...ultimoFeito.values()].map((c) => c.id);
  const nokRows: { id: string; check_id: string; item_id: string; defeito_id: string | null; gravidade: string | null }[] = [];
  for (let i = 0; i < ultimosIds.length; i += 150) {
    const { data } = await admin
      .from("cf_respostas")
      .select("id, check_id, item_id, defeito_id, gravidade")
      .in("check_id", ultimosIds.slice(i, i + 150))
      .eq("ok", false)
      .is("corrigido_em", null);
    nokRows.push(...(data ?? []));
  }
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const defeitoPorId = new Map(itens.flatMap((i) => i.defeitos.map((d) => [d.id, d.descricao] as const)));
  const checkPorId = new Map((checks ?? []).map((c) => [c.id, c]));

  const respDe = (v: { responsavel_id: string | null; responsavel_nome: string | null }) =>
    (v.responsavel_id && nomeDe.get(v.responsavel_id)) || v.responsavel_nome || "Sem responsável";

  const pendencias: PendenciaDoPainel[] = [];
  const veicPorId = new Map((veiculos ?? []).map((v) => [v.id, v]));
  for (const r of nokRows) {
    const c = checkPorId.get(r.check_id);
    const v = c && veicPorId.get(c.veiculo_id);
    const it = itemPorId.get(r.item_id);
    if (!c || !v || !it) continue;
    pendencias.push({
      respostaId: r.id,
      checkId: c.id,
      veiculoId: v.id,
      placa: v.placa,
      responsavel: respDe(v),
      item: it.nome,
      grupo: it.grupo,
      defeito: r.defeito_id ? (defeitoPorId.get(r.defeito_id) ?? null) : null,
      gravidade: ehGravidade(r.gravidade) ? r.gravidade : null,
      desde: c.assinado_em ?? c.iniciado_em,
      origem: c.origem,
    });
  }
  const ordemG = (g: Gravidade | null) => (g === "bloqueio" ? 0 : g === "grave" ? 1 : g === "medio" ? 2 : g === "leve" ? 3 : 4);
  pendencias.sort((a, b) => ordemG(a.gravidade) - ordemG(b.gravidade) || a.placa.localeCompare(b.placa));

  const lista: VeiculoDoPainel[] = (veiculos ?? []).map((v) => {
    const c = doBimestre.get(v.id) ?? null;
    const u = ultimoFeito.get(v.id) ?? null;
    const pend = pendencias.filter((p) => p.veiculoId === v.id);
    return {
      id: v.id,
      placa: v.placa,
      descricao: v.descricao,
      responsavelId: v.responsavel_id,
      responsavel: respDe(v),
      semCadastro: !v.responsavel_id,
      farol: farolDoVeiculo(c?.status ?? null, dias),
      check: c
        ? {
            id: c.id,
            status: c.status,
            origem: c.origem,
            conformidade: c.conformidade === null ? null : Number(c.conformidade),
            nok: c.nok,
            pior: ehGravidade(c.pior_gravidade) ? c.pior_gravidade : null,
            assinadoPor: c.assinado_por_nome,
            assinadoEm: c.assinado_em,
            iniciadoPor: c.iniciado_por_nome,
            iniciadoPorId: c.iniciado_por,
          }
        : null,
      ultimo: u ? { rotulo: rotuloBimestre(u, true), conformidade: u.conformidade === null ? null : Number(u.conformidade) } : null,
      pendencias: pend.length,
      bloqueio: pend.some((p) => p.gravidade === "bloqueio"),
    };
  });

  // Por responsável
  const grupos = new Map<string, PainelFrota["responsaveis"][number] & { soma: number; n: number }>();
  for (const v of lista) {
    const k = v.responsavelId ?? `nome:${v.responsavel}`;
    const g = grupos.get(k) ?? { id: v.responsavelId, nome: v.responsavel, semCadastro: v.semCadastro, total: 0, feitos: 0, pendentes: 0, atencao: 0, conformidade: null, soma: 0, n: 0 };
    g.total++;
    if (v.farol === "feito") g.feitos++;
    else g.pendentes++;
    if (v.farol === "atencao") g.atencao++;
    if (v.farol === "feito" && v.check?.conformidade !== null && v.check?.conformidade !== undefined) {
      g.soma += v.check.conformidade;
      g.n++;
    }
    grupos.set(k, g);
  }
  const responsaveis = [...grupos.values()]
    .map(({ soma, n, ...g }) => ({ ...g, conformidade: n ? soma / n : null }))
    .sort((a, b) => b.pendentes - a.pendentes || a.nome.localeCompare(b.nome, "pt-BR"));

  // Evolução (só placas ativas) e Pareto (NOK dos 2 últimos bimestres)
  const ativos = new Set(lista.map((v) => v.id));
  const evolucao = janela.map((b) => {
    const cs = (checks ?? []).filter((c) => c.ano === b.ano && c.bimestre === b.bimestre && FEITO.has(c.status) && ativos.has(c.veiculo_id));
    const ok = cs.reduce((s, c) => s + (c.ok ?? 0), 0);
    const tot = cs.reduce((s, c) => s + (c.total ?? 0), 0);
    return { rotulo: rotuloBimestre(b, true), feitos: cs.length, conformidade: tot ? ok / tot : null, nok: cs.reduce((s, c) => s + (c.nok ?? 0), 0) };
  });
  const recentes = new Set(janela.slice(-2).map(chaveBimestre));
  const idsRecentes = (checks ?? []).filter((c) => recentes.has(chaveBimestre(c)) && FEITO.has(c.status)).map((c) => c.id);
  const contagem = new Map<string, number>();
  for (let i = 0; i < idsRecentes.length; i += 150) {
    const { data } = await admin.from("cf_respostas").select("item_id").in("check_id", idsRecentes.slice(i, i + 150)).eq("ok", false);
    for (const r of data ?? []) contagem.set(r.item_id, (contagem.get(r.item_id) ?? 0) + 1);
  }
  const pareto = [...contagem.entries()]
    .map(([id, n]) => ({ item: itemPorId.get(id)?.nome ?? "?", grupo: itemPorId.get(id)?.grupo ?? "", n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  const feitos = lista.filter((v) => v.farol === "feito");
  const somaOk = feitos.reduce((s, v) => s + (v.check?.conformidade ?? 0), 0);
  return {
    bimestre: { ...atual, rotulo: rotuloBimestre(atual), rotuloCurto: rotuloBimestre(atual, true), fim: fimDoBimestre(atual), dias },
    veiculos: lista,
    responsaveis,
    pendencias,
    evolucao,
    pareto,
    totais: {
      veiculos: lista.length,
      feitos: feitos.length,
      andamento: lista.filter((v) => v.check?.status === "em_andamento").length,
      pendentes: lista.length - feitos.length,
      atencao: lista.filter((v) => v.farol === "atencao").length,
      bloqueados: lista.filter((v) => v.bloqueio).length,
      conformidade: feitos.length ? somaOk / feitos.length : null,
    },
  };
}

/** "GUSTAVO SANTANA DA SILVA" -> "Gustavo Silva". */
export function primeiroEUltimo(nome: string | null | undefined) {
  const partes = String(nome ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  if (partes.length <= 2) return partes.join(" ");
  return `${partes[0]} ${partes[partes.length - 1]}`;
}
