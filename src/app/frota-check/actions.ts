"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import { hojeIso } from "@/lib/pesquisa";
import { deuCerto, deuErrado, type ResultadoAcao } from "@/lib/resultado-acao";
import { apagarFotos, guardarFoto } from "@/lib/manutencao-server";
import { enderecosDaFoto } from "@/lib/foto-privada-server";
import {
  FOTOS_POR_ITEM_FROTA,
  MODULO_FROTA_CHECK,
  bimestreDe,
  ehGravidade,
  faltaNoItem,
  formatarPct,
  piorGravidade,
  rotuloBimestre,
  type FotoFrota,
  type Gravidade,
} from "@/lib/frota-check";
import { BUCKET_FROTA_CHECK, lerItensFrota } from "@/lib/frota-check-server";

/**
 * Check de Conformidade da Frota (migration 184).
 *
 * Como o Check de Manutenção: cada toque salva sozinho (OK/NOK, defeito,
 * foto), para uma queda de sinal no pátio perder no máximo o último toque.
 * O único botão de verdade é o de ASSINAR, que confere tudo: os 49 itens
 * respondidos e cada NOK com defeito e foto.
 *
 * Toda ação começa igual: tem o módulo, está numa revenda e o check é
 * DESTA revenda (trocar o id na URL não abre o de outra).
 */

const BASE = "/frota-check";
const texto = (fd: FormData, campo: string, max = 500) => String(fd.get(campo) ?? "").trim().slice(0, max);
const ID = /^[0-9a-f-]{36}$/i;

async function contexto() {
  const [perfil, revendaId, acesso] = await Promise.all([getPerfil(), getRevendaId(), temAcessoModulo(MODULO_FROTA_CHECK)]);
  if (!perfil || !revendaId) return { ok: false as const, erro: "Sessão encerrada. Entre de novo no app." };
  if (!acesso) return { ok: false as const, erro: "Você não tem acesso ao Check da Frota. Fale com o Admin." };
  return { ok: true as const, perfil, revendaId, admin: createAdminClient() };
}

type Ctx = Extract<Awaited<ReturnType<typeof contexto>>, { ok: true }>;

/** O check aberto, desta revenda, que ESTA pessoa está preenchendo. */
async function checkMeu(ctx: Ctx, id: string) {
  if (!ID.test(id)) return { ok: false as const, erro: "Check não encontrado." };
  const { data: c } = await ctx.admin
    .from("cf_checks")
    .select("id, veiculo_id, ano, bimestre, status, iniciado_por, iniciado_por_nome, cf_veiculos(placa)")
    .eq("id", id)
    .eq("revenda_id", ctx.revendaId)
    .maybeSingle();
  if (!c) return { ok: false as const, erro: "Check não encontrado nesta revenda." };
  if (c.status !== "em_andamento") return { ok: false as const, erro: "Este check já foi assinado e não muda mais." };
  if (c.iniciado_por !== ctx.perfil.id) return { ok: false as const, erro: `Quem preenche este check é ${c.iniciado_por_nome}.` };
  const placa = (c.cf_veiculos as unknown as { placa: string } | null)?.placa ?? "placa";
  return { ok: true as const, check: c, pasta: `frota-check/${ctx.revendaId}/${c.ano}-B${c.bimestre}/${placa}` };
}

function revalidar(id?: string) {
  revalidatePath(BASE);
  if (id) revalidatePath(`${BASE}/${id}`);
}

/**
 * Abre o check do bimestre de hoje para a placa (ou leva ao que já existe).
 * Se o do bimestre veio da planilha, `substituir=1` troca pelo do app.
 */
export async function iniciarCheck(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);
  const veiculoId = texto(fd, "veiculo_id", 40);
  if (!ID.test(veiculoId)) return deuErrado("Escolha a placa.");

  const { data: v } = await ctx.admin
    .from("cf_veiculos")
    .select("id, placa, ativo")
    .eq("id", veiculoId)
    .eq("revenda_id", ctx.revendaId)
    .maybeSingle();
  if (!v || !v.ativo) return deuErrado("Placa não encontrada nesta revenda.");

  const b = bimestreDe(hojeIso());
  const { data: existente } = await ctx.admin
    .from("cf_checks")
    .select("id, status, origem, iniciado_por, iniciado_por_nome")
    .eq("veiculo_id", v.id)
    .eq("ano", b.ano)
    .eq("bimestre", b.bimestre)
    .maybeSingle();

  if (existente) {
    if (existente.status === "planilha" && fd.get("substituir") === "1") {
      await ctx.admin.from("cf_checks").delete().eq("id", existente.id).eq("status", "planilha");
    } else if (existente.status === "em_andamento" && existente.iniciado_por !== ctx.perfil.id) {
      return deuErrado(`${existente.iniciado_por_nome} já está fazendo o check da ${v.placa}.`);
    } else {
      return deuCerto(`A ${v.placa} já tem check em ${rotuloBimestre(b)}.`, `${BASE}/${existente.id}`);
    }
  }

  const { data, error } = await ctx.admin
    .from("cf_checks")
    .insert({
      revenda_id: ctx.revendaId,
      veiculo_id: v.id,
      ano: b.ano,
      bimestre: b.bimestre,
      iniciado_por: ctx.perfil.id,
      iniciado_por_nome: ctx.perfil.nome,
    })
    .select("id")
    .single();
  if (error || !data) return deuErrado(`Não foi possível abrir o check: ${error?.message ?? "erro desconhecido"}`);
  revalidar();
  return deuCerto(`Check da ${v.placa} aberto.`, `${BASE}/${data.id}`);
}

export type ResultadoSinc = { ok: true; salvos: string[] } | { ok: false; erro: string };

/**
 * A FILA DO CELULAR CHEGANDO (25/11/2026): um envio com vários itens de
 * uma vez -- o "Tudo OK" de um grupo, ou tudo o que ficou guardado
 * enquanto não havia sinal. Cada item é a última versão do celular
 * (OK/NOK, defeito, gravidade, observação). Devolve os itens gravados:
 * só eles saem da fila do celular.
 */
export async function sincronizarFrota(fd: FormData): Promise<ResultadoSinc> {
  const ctx = await contexto();
  if (!ctx.ok) return { ok: false, erro: ctx.erro };
  const meu = await checkMeu(ctx, texto(fd, "check_id", 40));
  if (!meu.ok) return { ok: false, erro: meu.erro };

  let entrada: unknown;
  try {
    entrada = JSON.parse(String(fd.get("itens") ?? "[]"));
  } catch {
    return { ok: false, erro: "Envio inválido." };
  }
  if (!Array.isArray(entrada) || entrada.length === 0) return { ok: true, salvos: [] };

  const itens = await lerItensFrota(ctx.admin);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const agora = new Date().toISOString();
  const linhas = [];
  for (const bruto of entrada.slice(0, 60)) {
    const e = bruto as { itemId?: unknown; ok?: unknown; defeitoId?: unknown; gravidade?: unknown; observacao?: unknown };
    const item = porId.get(String(e.itemId ?? ""));
    if (!item) continue;
    const ok = e.ok === true;
    let defeitoId: string | null = null;
    let gravidade: Gravidade | null = null;
    if (!ok) {
      const defeito = item.defeitos.find((d) => d.id === e.defeitoId);
      if (defeito) {
        defeitoId = defeito.id;
        gravidade = defeito.gravidade;
      } else if (ehGravidade(e.gravidade)) {
        gravidade = e.gravidade; // "Outro defeito": quem preenche escolhe
      }
    }
    linhas.push({
      check_id: meu.check.id,
      item_id: item.id,
      revenda_id: ctx.revendaId,
      ok,
      defeito_id: defeitoId,
      gravidade,
      observacao: ok ? null : String(e.observacao ?? "").trim().slice(0, 500) || null,
      respondido_por: ctx.perfil.id,
      respondido_por_nome: ctx.perfil.nome,
      atualizado_em: agora,
    });
  }
  if (linhas.length === 0) return { ok: true, salvos: [] };
  const { error } = await ctx.admin.from("cf_respostas").upsert(linhas, { onConflict: "check_id,item_id" });
  if (error) return { ok: false, erro: `Não salvou no servidor: ${error.message}` };
  await ctx.admin.from("cf_checks").update({ atualizado_em: agora }).eq("id", meu.check.id);
  return { ok: true, salvos: linhas.map((l) => l.item_id) };
}

export type ResultadoFoto = { ok: true; foto: FotoFrota } | { ok: false; erro: string };

/**
 * A foto do NOK (ou da correção). Vem com o id que o celular deu a ela:
 * se o sinal cair depois de o servidor gravar, o reenvio não duplica.
 */
export async function enviarFotoFrota(fd: FormData): Promise<ResultadoFoto> {
  const ctx = await contexto();
  if (!ctx.ok) return { ok: false, erro: ctx.erro };
  const checkId = texto(fd, "check_id", 40);
  const itemId = texto(fd, "item_id", 40);
  const tipo = texto(fd, "tipo", 10) === "correcao" ? "correcao" : "nok";
  const chave = /^[a-z0-9-]{8,64}$/i.test(texto(fd, "foto_id", 64)) ? texto(fd, "foto_id", 64) : null;
  const arquivo = fd.get("foto");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: "A foto não chegou. Tente de novo." };
  if (!ID.test(itemId)) return { ok: false, erro: "Item não encontrado." };

  let pasta: string;
  if (tipo === "nok") {
    const meu = await checkMeu(ctx, checkId);
    if (!meu.ok) return { ok: false, erro: meu.erro };
    pasta = meu.pasta;
  } else {
    const { data: c } = await ctx.admin.from("cf_checks").select("id, ano, bimestre").eq("id", checkId).eq("revenda_id", ctx.revendaId).maybeSingle();
    if (!c) return { ok: false, erro: "Check não encontrado." };
    pasta = `frota-check/${ctx.revendaId}/${c.ano}-B${c.bimestre}/correcao`;
  }

  if (chave) {
    const { data: ja } = await ctx.admin.from("cf_fotos").select("id, chave").eq("check_id", checkId).eq("chave", chave).maybeSingle();
    if (ja) return { ok: true, foto: { id: ja.id, chave: ja.chave, ...enderecosDaFoto("/api/frota-check/foto", ja.id) } };
  }
  const { count } = await ctx.admin
    .from("cf_fotos")
    .select("id", { count: "exact", head: true })
    .eq("check_id", checkId)
    .eq("item_id", itemId)
    .eq("tipo", tipo);
  if ((count ?? 0) >= FOTOS_POR_ITEM_FROTA) return { ok: false, erro: `Cada item aceita até ${FOTOS_POR_ITEM_FROTA} fotos.` };

  const guardada = await guardarFoto(arquivo, pasta, ctx.admin, chave ?? undefined);
  if (!guardada.ok) return { ok: false, erro: guardada.erro };
  const { data, error } = await ctx.admin
    .from("cf_fotos")
    .insert({
      check_id: checkId,
      item_id: itemId,
      revenda_id: ctx.revendaId,
      tipo,
      caminho: guardada.caminho,
      chave,
      bytes: guardada.bytes,
      enviada_por_nome: ctx.perfil.nome,
    })
    .select("id")
    .single();
  if (error || !data) {
    await apagarFotos([guardada.caminho], ctx.admin);
    return { ok: false, erro: `A foto não foi registrada: ${error?.message ?? ""}` };
  }
  return { ok: true, foto: { id: data.id, chave, ...enderecosDaFoto("/api/frota-check/foto", data.id) } };
}

export async function apagarFotoFrota(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);
  const id = texto(fd, "foto_id", 40);
  if (!ID.test(id)) return deuErrado("Foto não encontrada.");
  const { data: f } = await ctx.admin.from("cf_fotos").select("id, check_id, caminho, tipo").eq("id", id).eq("revenda_id", ctx.revendaId).maybeSingle();
  if (!f) return deuErrado("Foto não encontrada.");
  if (f.tipo === "nok") {
    const meu = await checkMeu(ctx, f.check_id);
    if (!meu.ok) return deuErrado(meu.erro);
  }
  await ctx.admin.from("cf_fotos").delete().eq("id", f.id);
  await apagarFotos([f.caminho], ctx.admin);
  return deuCerto("Foto apagada.");
}

/**
 * ASSINAR: a única porta de saída do check. Confere os 49 itens, cada NOK
 * com defeito e foto, guarda a assinatura desenhada e fecha a conta.
 */
export async function assinarCheck(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);
  const meu = await checkMeu(ctx, texto(fd, "check_id", 40));
  if (!meu.ok) return deuErrado(meu.erro);

  const desenho = String(fd.get("assinatura") ?? "");
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(desenho);
  if (!m) return deuErrado("Faça a assinatura no quadro antes de concluir.");
  const png = Buffer.from(m[1], "base64");
  if (png.length < 400) return deuErrado("A assinatura ficou em branco. Assine no quadro.");
  if (png.length > 400_000) return deuErrado("A assinatura ficou grande demais. Limpe e assine de novo.");

  const [itens, { data: resp }, { data: fotos }] = await Promise.all([
    lerItensFrota(ctx.admin),
    ctx.admin.from("cf_respostas").select("item_id, ok, defeito_id, gravidade, observacao").eq("check_id", meu.check.id),
    ctx.admin.from("cf_fotos").select("item_id").eq("check_id", meu.check.id).eq("tipo", "nok"),
  ]);
  const porItem = new Map((resp ?? []).map((r) => [r.item_id, r]));
  const fotosDe = (id: string) => (fotos ?? []).filter((f) => f.item_id === id).length;
  const faltas = itens
    .map((i) => {
      const r = porItem.get(i.id);
      const falta = faltaNoItem(
        r ? { ok: r.ok, defeitoId: r.defeito_id, gravidade: ehGravidade(r.gravidade) ? r.gravidade : null, observacao: r.observacao } : undefined,
        fotosDe(i.id),
      );
      return falta ? `${i.nome} (${falta})` : null;
    })
    .filter(Boolean);
  if (faltas.length) {
    return deuErrado(`Falta${faltas.length > 1 ? "m" : ""} ${faltas.length}: ${faltas.slice(0, 3).join(", ")}${faltas.length > 3 ? "…" : ""}`);
  }

  const total = itens.length;
  const nok = itens.filter((i) => porItem.get(i.id)?.ok === false);
  const pior = piorGravidade(nok.map((i) => {
    const g = porItem.get(i.id)?.gravidade;
    return ehGravidade(g) ? g : null;
  }));
  const kmTxt = texto(fd, "km", 10).replace(/\D/g, "");

  const caminho = `${meu.pasta}/assinatura-${meu.check.id}.png`;
  const { error: erroUp } = await ctx.admin.storage.from(BUCKET_FROTA_CHECK).upload(caminho, png, { contentType: "image/png", upsert: true });
  if (erroUp) return deuErrado(`A assinatura não subiu: ${erroUp.message}`);

  const conformidade = (total - nok.length) / total;
  const { error } = await ctx.admin
    .from("cf_checks")
    .update({
      status: "assinado",
      assinado_por: ctx.perfil.id,
      assinado_por_nome: ctx.perfil.nome,
      assinado_cargo: ctx.perfil.cargo,
      assinado_em: new Date().toISOString(),
      assinatura_caminho: caminho,
      total,
      ok: total - nok.length,
      nok: nok.length,
      conformidade: Math.round(conformidade * 10000) / 10000,
      pior_gravidade: pior,
      km: kmTxt ? Number(kmTxt) : null,
      observacao: texto(fd, "observacao", 1000) || null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", meu.check.id)
    .eq("status", "em_andamento");
  if (error) return deuErrado(`Não foi possível concluir: ${error.message}`);
  revalidar(meu.check.id);
  return deuCerto(
    pior === "bloqueio"
      ? `Assinado. ${formatarPct(conformidade)} de conformidade — tem item de BLOQUEIO IMEDIATO.`
      : `Assinado. ${formatarPct(conformidade)} de conformidade.`,
    `${BASE}/${meu.check.id}`,
  );
}

/** Desiste do check aberto (o que foi preenchido some). Dono do check ou liderança "editar". */
export async function cancelarCheck(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);
  const id = texto(fd, "check_id", 40);
  if (!ID.test(id)) return deuErrado("Check não encontrado.");
  const { data: c } = await ctx.admin.from("cf_checks").select("id, status, iniciado_por").eq("id", id).eq("revenda_id", ctx.revendaId).maybeSingle();
  if (!c || c.status !== "em_andamento") return deuErrado("Só dá para cancelar check em andamento.");
  if (c.iniciado_por !== ctx.perfil.id && !(await podeNoModulo(MODULO_FROTA_CHECK, "editar"))) return deuErrado("Só quem abriu pode cancelar.");
  const { data: fotos } = await ctx.admin.from("cf_fotos").select("caminho").eq("check_id", c.id);
  await ctx.admin.from("cf_checks").delete().eq("id", c.id).eq("status", "em_andamento");
  await apagarFotos((fotos ?? []).map((f) => f.caminho), ctx.admin);
  revalidar();
  return deuCerto("Check cancelado.", BASE);
}

/** A pendência resolvida: o NOK foi consertado (com o que foi feito). */
export async function corrigirPendencia(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);
  const id = texto(fd, "resposta_id", 40);
  const correcao = texto(fd, "correcao");
  if (!ID.test(id)) return deuErrado("Pendência não encontrada.");
  if (correcao.length < 3) return deuErrado("Escreva o que foi feito.");
  const { data: r } = await ctx.admin
    .from("cf_respostas")
    .select("id, check_id, ok, corrigido_em, cf_checks(status)")
    .eq("id", id)
    .eq("revenda_id", ctx.revendaId)
    .maybeSingle();
  const status = (r?.cf_checks as unknown as { status: string } | null)?.status;
  if (!r || r.ok || status === "em_andamento") return deuErrado("Pendência não encontrada.");
  if (r.corrigido_em) return deuCerto("Já estava corrigida.");
  const { error } = await ctx.admin
    .from("cf_respostas")
    .update({ corrigido_em: new Date().toISOString(), corrigido_por_nome: ctx.perfil.nome, correcao })
    .eq("id", r.id);
  if (error) return deuErrado(`Não salvou: ${error.message}`);
  revalidar(r.check_id);
  return deuCerto("Pendência corrigida.");
}
