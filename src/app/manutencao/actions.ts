"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import { hojeIso } from "@/lib/pesquisa";
import { deuCerto, deuErrado, type ResultadoAcao } from "@/lib/resultado-acao";
import {
  FOTOS_POR_ITEM,
  calcularNotas,
  ehNota,
  formatarPct,
  problemaDaResposta,
  respondido,
  rotuloTrimestre,
  trimestreDe,
} from "@/lib/manutencao";
import {
  MODULO_MANUTENCAO,
  apagarFotos,
  guardarFoto,
  lerAvaliacao,
  lerItens,
  lerRespostas,
} from "@/lib/manutencao-server";

/**
 * Check Global de Manutenção (migration 156).
 *
 * Toda ação devolve o resultado em vez de redirecionar (ver FormNoLugar):
 * quem está no item 5.3 salva e continua no item 5.3.
 *
 * E toda ação começa igual: tem o módulo, está numa revenda, e a
 * avaliação é DESTA revenda. A terceira é a que impede abrir a avaliação
 * de Barreiras trocando o id na URL estando em São Félix.
 */

const BASE = "/manutencao";

function texto(fd: FormData, campo: string, max = 1000) {
  return String(fd.get(campo) ?? "").trim().slice(0, max);
}

async function contexto() {
  const [perfil, revendaId, temAcesso] = await Promise.all([getPerfil(), getRevendaId(), temAcessoModulo(MODULO_MANUTENCAO)]);
  if (!perfil || !revendaId) return { ok: false as const, erro: "Sessão encerrada. Entre de novo no app." };
  if (!temAcesso) return { ok: false as const, erro: "Você não tem acesso ao Check de Manutenção. Fale com o Admin." };
  return { ok: true as const, perfil, revendaId };
}

async function avaliacaoAberta(id: string, revendaId: string) {
  const avaliacao = await lerAvaliacao(id, revendaId);
  if (!avaliacao) return { ok: false as const, erro: "Avaliação não encontrada nesta revenda." };
  if (avaliacao.status !== "em_andamento") {
    return { ok: false as const, erro: "Esta avaliação já foi finalizada. Para mudar, a liderança precisa reabrir." };
  }
  return { ok: true as const, avaliacao };
}

/** Abre a avaliação do trimestre de hoje (ou leva para ela, se já existe). */
export async function iniciarAvaliacao(): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);

  const t = trimestreDe(hojeIso());
  const admin = createAdminClient();

  const { data: existente } = await admin
    .from("manut_avaliacoes")
    .select("id")
    .eq("revenda_id", ctx.revendaId)
    .eq("ano", t.ano)
    .eq("trimestre", t.trimestre)
    .maybeSingle();
  if (existente) return deuCerto(`A avaliação do ${rotuloTrimestre(t)} já existe. Continue de onde parou.`, `${BASE}/${existente.id}`);

  const { data, error } = await admin
    .from("manut_avaliacoes")
    .insert({
      revenda_id: ctx.revendaId,
      ano: t.ano,
      trimestre: t.trimestre,
      iniciada_por: ctx.perfil.id,
      iniciada_por_nome: ctx.perfil.nome,
    })
    .select("id")
    .single();

  if (error || !data) return deuErrado(`Não foi possível iniciar: ${error?.message ?? "erro desconhecido"}`);
  revalidatePath(BASE);
  return deuCerto(`Avaliação do ${rotuloTrimestre(t)} iniciada.`, `${BASE}/${data.id}`);
}

/**
 * Salva UM item: nota (ou N/A), observação, plano de ação e as fotos
 * novas. A tela chama sozinha a cada toque na nota, a cada foto e ao
 * sair de um campo de texto (sem botão por item, pedido do dono em
 * 02/10/2026) -- e item a item, para uma queda de sinal no meio do
 * armazém perder no máximo o último toque.
 */
export async function salvarResposta(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);

  const aberta = await avaliacaoAberta(texto(fd, "avaliacao_id", 64), ctx.revendaId);
  if (!aberta.ok) return deuErrado(aberta.erro);

  const admin = createAdminClient();
  const itemId = texto(fd, "item_id", 64);
  const { data: item } = await admin
    .from("manut_itens")
    .select("id, numero, critico")
    .eq("id", itemId)
    .eq("revenda_id", ctx.revendaId)
    .maybeSingle();
  if (!item) return deuErrado("Item do checklist não encontrado.");

  const bruto = texto(fd, "nota", 4);
  const na = bruto === "na";
  const nota = na ? null : bruto === "" ? null : Number(bruto);
  const entrada = {
    nota: ehNota(nota) ? nota : null,
    na,
    planoAcao: texto(fd, "plano_acao"),
    responsavel: texto(fd, "responsavel", 120),
    prazo: texto(fd, "prazo", 10),
  };
  // Salva a cada toque (sem botão por item): aqui só a nota é exigida.
  // O plano de ação incompleto não trava o salvar -- trava o FINALIZAR,
  // que é quando o trimestre precisa estar inteiro.
  if (!na && entrada.nota === null) return deuErrado(`Item ${item.numero}: escolha a nota (3, 1 ou 0) ou marque N/A.`);
  const prazoValido = /^\d{4}-\d{2}-\d{2}$/.test(entrada.prazo) ? entrada.prazo : null;

  const fotos = fd.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);

  // Quantas o item já tem nesta avaliação: o teto é por item, não por envio.
  const { data: anterior } = await admin
    .from("manut_respostas")
    .select("id, manut_fotos(id)")
    .eq("avaliacao_id", aberta.avaliacao.id)
    .eq("item_id", item.id)
    .maybeSingle();
  const jaTem = (anterior?.manut_fotos as { id: string }[] | null)?.length ?? 0;
  if (jaTem + fotos.length > FOTOS_POR_ITEM) {
    return deuErrado(`Cada item aceita até ${FOTOS_POR_ITEM} fotos. Este já tem ${jaTem}.`);
  }

  const abaixo = !na && entrada.nota !== 3;
  const { data: resposta, error } = await admin
    .from("manut_respostas")
    .upsert(
      {
        avaliacao_id: aberta.avaliacao.id,
        item_id: item.id,
        revenda_id: ctx.revendaId,
        nota: entrada.nota,
        na,
        observacao: texto(fd, "observacao") || null,
        // Plano só existe abaixo de 3: subiu para 3, o plano antigo sai.
        plano_acao: abaixo ? entrada.planoAcao || null : null,
        responsavel: abaixo ? entrada.responsavel || null : null,
        prazo: abaixo ? prazoValido : null,
        respondido_por: ctx.perfil.id,
        respondido_por_nome: ctx.perfil.nome,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "avaliacao_id,item_id" },
    )
    .select("id")
    .single();
  if (error || !resposta) return deuErrado(`Não foi possível salvar o item ${item.numero}: ${error?.message ?? ""}`);

  // As fotos depois da resposta: uma foto que falha não pode desfazer a
  // nota já dada -- avisa e deixa tentar a foto de novo.
  const pasta = `${ctx.revendaId}/${aberta.avaliacao.ano}-T${aberta.avaliacao.trimestre}/${item.numero}`;
  let enviadas = 0;
  for (const foto of fotos) {
    const guardada = await guardarFoto(foto, pasta, admin);
    if (!guardada.ok) return deuErrado(`Item ${item.numero} salvo, mas ${guardada.erro.toLowerCase()}`);
    const { error: erroFoto } = await admin.from("manut_fotos").insert({
      resposta_id: resposta.id,
      revenda_id: ctx.revendaId,
      caminho: guardada.caminho,
      bytes: guardada.bytes,
      largura: guardada.largura,
      altura: guardada.altura,
      enviada_por: ctx.perfil.id,
      enviada_por_nome: ctx.perfil.nome,
    });
    if (erroFoto) {
      await apagarFotos([guardada.caminho], admin);
      return deuErrado(`Item ${item.numero} salvo, mas a foto não: ${erroFoto.message}`);
    }
    enviadas++;
  }

  revalidatePath(`${BASE}/${aberta.avaliacao.id}`);
  return deuCerto(`Item ${item.numero} salvo${enviadas ? ` com ${enviadas} foto${enviadas > 1 ? "s" : ""}` : ""}.`);
}

/** Tira uma foto enviada por engano (só com a avaliação aberta). */
export async function removerFoto(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);

  const admin = createAdminClient();
  const { data: foto } = await admin
    .from("manut_fotos")
    .select("id, caminho, manut_respostas!inner(avaliacao_id)")
    .eq("id", texto(fd, "foto_id", 64))
    .eq("revenda_id", ctx.revendaId)
    .maybeSingle();
  if (!foto) return deuErrado("Foto não encontrada.");

  const avaliacaoId = (foto.manut_respostas as unknown as { avaliacao_id: string }).avaliacao_id;
  const aberta = await avaliacaoAberta(avaliacaoId, ctx.revendaId);
  if (!aberta.ok) return deuErrado(aberta.erro);

  const { error } = await admin.from("manut_fotos").delete().eq("id", foto.id);
  if (error) return deuErrado(`Não foi possível tirar a foto: ${error.message}`);
  await apagarFotos([foto.caminho], admin);

  revalidatePath(`${BASE}/${avaliacaoId}`);
  return deuCerto("Foto removida.");
}

/**
 * Fecha o trimestre. Exige todos os itens respondidos -- uma avaliação
 * pela metade não mostra evolução nenhuma -- e congela a nota total.
 */
export async function finalizarAvaliacao(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);

  const aberta = await avaliacaoAberta(texto(fd, "avaliacao_id", 64), ctx.revendaId);
  if (!aberta.ok) return deuErrado(aberta.erro);

  const admin = createAdminClient();
  const [itens, respostas] = await Promise.all([
    lerItens(ctx.revendaId, admin),
    lerRespostas([aberta.avaliacao.id], admin).then((m) => m.get(aberta.avaliacao.id) ?? []),
  ]);
  const porItem = new Map(respostas.map((r) => [r.itemId, r]));
  const faltam = itens.filter((i) => !respondido(porItem.get(i.id)));
  if (faltam.length > 0) {
    return deuErrado(
      `Faltam ${faltam.length} ${faltam.length === 1 ? "item" : "itens"}: ${faltam
        .slice(0, 6)
        .map((i) => i.numero)
        .join(", ")}${faltam.length > 6 ? "…" : ""}.`,
    );
  }

  // Abaixo de 3 sem plano completo (o que, quem e até quando) não fecha.
  const semPlano = itens.filter((i) => {
    const r = porItem.get(i.id);
    return (
      r &&
      problemaDaResposta({
        nota: r.nota,
        na: r.na,
        planoAcao: r.planoAcao ?? "",
        responsavel: r.responsavel ?? "",
        prazo: r.prazo ?? "",
      })
    );
  });
  if (semPlano.length > 0) {
    return deuErrado(
      `Complete o plano de ação (o que, responsável e prazo) ${semPlano.length === 1 ? "do item" : "dos itens"} ${semPlano
        .map((i) => i.numero)
        .join(", ")}.`,
    );
  }

  const { total } = calcularNotas(itens, respostas);
  const { error } = await admin
    .from("manut_avaliacoes")
    .update({
      status: "finalizada",
      finalizada_por: ctx.perfil.id,
      finalizada_por_nome: ctx.perfil.nome,
      finalizada_em: new Date().toISOString(),
      nota_total: total,
    })
    .eq("id", aberta.avaliacao.id)
    .eq("revenda_id", ctx.revendaId);
  if (error) return deuErrado(`Não foi possível finalizar: ${error.message}`);

  revalidatePath(BASE);
  revalidatePath(`${BASE}/${aberta.avaliacao.id}`);
  return deuCerto(
    `${rotuloTrimestre(aberta.avaliacao)} finalizado com ${formatarPct(total)}. A evolução já aparece no painel.`,
  );
}

/** Reabre para correção -- só a liderança com "editar". */
export async function reabrirAvaliacao(fd: FormData): Promise<ResultadoAcao> {
  const ctx = await contexto();
  if (!ctx.ok) return deuErrado(ctx.erro);
  if (!(await podeNoModulo(MODULO_MANUTENCAO, "editar"))) {
    return deuErrado("Só a liderança com permissão de editar reabre uma avaliação finalizada.");
  }

  const id = texto(fd, "avaliacao_id", 64);
  const avaliacao = await lerAvaliacao(id, ctx.revendaId);
  if (!avaliacao) return deuErrado("Avaliação não encontrada nesta revenda.");
  if (avaliacao.status !== "finalizada") return deuErrado("Esta avaliação já está aberta.");

  const { error } = await createAdminClient()
    .from("manut_avaliacoes")
    .update({ status: "em_andamento", finalizada_por: null, finalizada_por_nome: null, finalizada_em: null, nota_total: null })
    .eq("id", id)
    .eq("revenda_id", ctx.revendaId);
  if (error) return deuErrado(`Não foi possível reabrir: ${error.message}`);

  revalidatePath(BASE);
  revalidatePath(`${BASE}/${id}`);
  return deuCerto(`${rotuloTrimestre(avaliacao)} reaberto para correção.`);
}
