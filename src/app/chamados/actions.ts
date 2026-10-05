"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { deuCerto, noLugar, pararComErro, type ResultadoAcao } from "@/lib/resultado-acao";
import {
  ChamadosNaoInstalado,
  abrirChamado,
  apagarFotosDoChamado,
  avisarQuemCuida,
  avisarSolicitante,
  confirmarAtendimento,
  contextoChamados,
  fotosDoFormulario,
  guardarFotos,
  lerChamado,
  lerConfig,
  lerLocais,
  podeAtenderChamado,
  podeVerChamado,
  registrarEvento,
  type Chamado,
  type ContextoChamados,
} from "@/lib/chamados-server";
import {
  ehPrioridade,
  emAberto,
  prazoDe,
  problemaDaAbertura,
  protocolo,
  rotuloPrioridade,
  type Prioridade,
  type Tipo,
} from "@/lib/chamados";

/**
 * AS AÇÕES DOS CHAMADOS NO APP.
 *
 * Todas "no lugar" (FormNoLugar): o aviso sai no rodapé e a tela não volta
 * ao topo. E todas conferem tudo de novo aqui -- a tela esconde o botão de
 * quem não pode, mas a ação é um endereço que qualquer um chama.
 *
 * As mudanças de status são condicionadas ao status de partida
 * (`.in("status", ...)`): dois técnicos tocando em "Assumir" ao mesmo
 * tempo não viram dois responsáveis -- o segundo recebe o aviso.
 */

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();

async function contexto(): Promise<ContextoChamados> {
  const c = await contextoChamados();
  if (!c.ok) pararComErro(c.erro);
  return c;
}

/** O chamado desta ação, já conferido contra quem pede. */
async function chamadoDoFormulario(fd: FormData, ctx: ContextoChamados, para: "ver" | "atender"): Promise<Chamado> {
  const c = await lerChamado(texto(fd, "id"));
  if (!c || !podeVerChamado(ctx, c)) pararComErro("Chamado não encontrado.");
  if (para === "atender" && !podeAtenderChamado(ctx, c)) {
    pararComErro("Só o time da manutenção atende chamado. Fale com o Admin se você é do time.");
  }
  return c;
}

/** Sem a migration 165, a mensagem diz o que falta em vez de "erro". */
async function acao(corpo: () => Promise<ResultadoAcao | void>): Promise<ResultadoAcao> {
  return noLugar(async () => {
    try {
      return await corpo();
    } catch (e) {
      if (e instanceof ChamadosNaoInstalado) pararComErro("Falta rodar a migration 165 no Supabase.");
      throw e;
    }
  });
}

function revalidar(id?: string) {
  revalidatePath("/chamados");
  revalidatePath("/gestao/chamados");
  if (id) revalidatePath(`/chamados/${id}`);
}

// ---------------------------------------------------------------------
// Abrir
// ---------------------------------------------------------------------

export async function abrirChamadoNoApp(fd: FormData) {
  return acao(async () => {
    const ctx = await contexto();
    const entrada = {
      localId: texto(fd, "local_id"),
      tipo: texto(fd, "tipo"),
      prioridade: texto(fd, "prioridade"),
      descricao: texto(fd, "descricao"),
      // No app o nome é o do cadastro -- o campo na tela é só leitura.
      nome: ctx.perfil.nome,
      telefone: texto(fd, "telefone"),
    };
    const problema = problemaDaAbertura(entrada);
    if (problema) pararComErro(problema);

    const local = (await lerLocais(ctx.revendaId)).find((l) => l.id === entrada.localId);
    if (!local) pararComErro("Essa área não está mais na lista. Escolha outra.");

    const r = await abrirChamado({
      revendaId: ctx.revendaId,
      local,
      tipo: entrada.tipo as Tipo,
      prioridade: entrada.prioridade as Prioridade,
      descricao: entrada.descricao,
      nome: entrada.nome,
      telefone: entrada.telefone,
      solicitanteId: ctx.perfil.id,
      origem: "app",
      fotos: fotosDoFormulario(fd),
    });

    revalidar(r.id);
    if (r.repetido) return deuCerto(`Esse pedido já estava aberto: chamado ${protocolo(r.numero)}.`, `/chamados/${r.id}`);
    const fotos = r.falhasDeFoto ? ` (${r.falhasDeFoto} foto não subiu)` : "";
    return deuCerto(`Chamado ${protocolo(r.numero)} aberto! A manutenção já foi avisada.${fotos}`, `/chamados/${r.id}?novo=1`);
  });
}

// ---------------------------------------------------------------------
// Atender (o time da manutenção)
// ---------------------------------------------------------------------

export async function assumirChamado(fd: FormData) {
  return acao(async () => {
    const ctx = await contexto();
    const c = await chamadoDoFormulario(fd, ctx, "atender");
    if (c.status !== "aberto" && c.status !== "aguardando") pararComErro("Este chamado já está em atendimento ou fechado.");

    const agora = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("chamados")
      .update({
        status: "em_atendimento",
        responsavel_id: ctx.perfil.id,
        responsavel_nome: ctx.perfil.nome,
        atendimento_em: c.atendimento_em ?? agora,
        atualizado_em: agora,
      })
      .eq("id", c.id)
      .in("status", ["aberto", "aguardando"])
      .select("id");
    if (error) pararComErro(`Não foi possível assumir: ${error.message}`);
    if (!data?.length) pararComErro("Alguém mexeu neste chamado agora há pouco. Atualize a tela.");

    const retomou = c.status === "aguardando";
    await registrarEvento(c, {
      tipo: "status",
      statusPara: "em_atendimento",
      texto: retomou ? "Atendimento retomado." : null,
      autorNome: ctx.perfil.nome,
      autorId: ctx.perfil.id,
    });
    await avisarSolicitante(
      c,
      `🔧 Chamado ${protocolo(c.numero)} em atendimento`,
      `${ctx.perfil.nome.split(" ")[0]} está cuidando do seu pedido em ${c.local_nome}.`,
      ctx.perfil.id,
    );
    revalidar(c.id);
    return deuCerto(retomou ? "Atendimento retomado." : "Chamado assumido. Quem pediu foi avisado.");
  });
}

export async function aguardarChamado(fd: FormData) {
  return acao(async () => {
    const ctx = await contexto();
    const c = await chamadoDoFormulario(fd, ctx, "atender");
    const motivo = texto(fd, "motivo");
    if (motivo.length < 3) pararComErro("Diga o que está faltando: material, peça, terceiro...");
    if (c.status !== "aberto" && c.status !== "em_atendimento") pararComErro("Só dá para pausar chamado em aberto.");

    const agora = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("chamados")
      .update({
        status: "aguardando",
        responsavel_id: c.responsavel_id ?? ctx.perfil.id,
        responsavel_nome: c.responsavel_nome ?? ctx.perfil.nome,
        atendimento_em: c.atendimento_em ?? agora,
        atualizado_em: agora,
      })
      .eq("id", c.id)
      .in("status", ["aberto", "em_atendimento"])
      .select("id");
    if (error) pararComErro(`Não foi possível pausar: ${error.message}`);
    if (!data?.length) pararComErro("Alguém mexeu neste chamado agora há pouco. Atualize a tela.");

    await registrarEvento(c, { tipo: "status", statusPara: "aguardando", texto: motivo, autorNome: ctx.perfil.nome, autorId: ctx.perfil.id });
    await avisarSolicitante(c, `⏸️ Chamado ${protocolo(c.numero)} aguardando`, motivo.slice(0, 160), ctx.perfil.id);
    revalidar(c.id);
    return deuCerto("Chamado pausado. O prazo continua contando.");
  });
}

export async function concluirChamado(fd: FormData) {
  return acao(async () => {
    const ctx = await contexto();
    const c = await chamadoDoFormulario(fd, ctx, "atender");
    const solucao = texto(fd, "solucao");
    if (solucao.length < 3) pararComErro("Conte o que foi feito: é o que quem pediu vai ler.");
    if (!emAberto(c.status)) pararComErro("Este chamado já está fechado.");

    const agora = new Date().toISOString();
    const { data, error } = await createAdminClient()
      .from("chamados")
      .update({
        status: "concluido",
        solucao: solucao.slice(0, 2000),
        concluido_em: agora,
        responsavel_id: c.responsavel_id ?? ctx.perfil.id,
        responsavel_nome: c.responsavel_nome ?? ctx.perfil.nome,
        atendimento_em: c.atendimento_em ?? agora,
        confirmacao: null,
        confirmado_em: null,
        atualizado_em: agora,
      })
      .eq("id", c.id)
      .in("status", ["aberto", "em_atendimento", "aguardando"])
      .select("id");
    if (error) pararComErro(`Não foi possível concluir: ${error.message}`);
    if (!data?.length) pararComErro("Alguém mexeu neste chamado agora há pouco. Atualize a tela.");

    await registrarEvento(c, { tipo: "status", statusPara: "concluido", texto: solucao, autorNome: ctx.perfil.nome, autorId: ctx.perfil.id });
    const fotos = fotosDoFormulario(fd);
    const falhas = fotos.length ? await guardarFotos(c, fotos, "conclusao", ctx.perfil.nome) : 0;
    await avisarSolicitante(
      { ...c, status: "concluido" },
      `✅ Chamado ${protocolo(c.numero)} concluído`,
      "A manutenção terminou. Confirme se resolveu e dê uma nota ao atendimento.",
      ctx.perfil.id,
    );
    revalidar(c.id);
    return deuCerto(`Chamado concluído${falhas ? ` (${falhas} foto não subiu)` : ""}. Agora quem pediu confirma.`);
  });
}

export async function mudarPrioridade(fd: FormData) {
  return acao(async () => {
    const ctx = await contexto();
    const c = await chamadoDoFormulario(fd, ctx, "atender");
    const nova = texto(fd, "prioridade");
    if (!ehPrioridade(nova)) pararComErro("Prioridade inválida.");
    if (nova === c.prioridade) pararComErro("A prioridade já é essa.");
    if (!emAberto(c.status)) pararComErro("Chamado fechado não muda de prioridade.");

    const { prazos } = await lerConfig(c.revenda_id);
    const { error } = await createAdminClient()
      .from("chamados")
      .update({
        prioridade: nova,
        prazo_em: prazoDe(c.aberto_em, nova, prazos).toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", c.id);
    if (error) pararComErro(`Não foi possível mudar: ${error.message}`);

    const motivo = texto(fd, "motivo");
    await registrarEvento(c, {
      tipo: "prioridade",
      texto: `${rotuloPrioridade(c.prioridade)} → ${rotuloPrioridade(nova)}${motivo ? `. ${motivo}` : ""}`,
      autorNome: ctx.perfil.nome,
      autorId: ctx.perfil.id,
    });
    revalidar(c.id);
    return deuCerto(`Prioridade agora é ${rotuloPrioridade(nova)}. O prazo foi recalculado.`);
  });
}

/**
 * Cancelar: o time da manutenção cancela qualquer chamado em aberto (com
 * motivo); quem pediu cancela o próprio enquanto ninguém assumiu -- é o
 * "abri por engano".
 */
export async function cancelarChamado(fd: FormData) {
  return acao(async () => {
    const ctx = await contexto();
    const c = await chamadoDoFormulario(fd, ctx, "ver");
    const motivo = texto(fd, "motivo") || "Cancelado por quem abriu.";
    const atende = podeAtenderChamado(ctx, c);
    const doDono = c.solicitante_id === ctx.perfil.id && c.status === "aberto";
    if (!atende && !doDono) pararComErro("Só dá para cancelar o próprio chamado enquanto ninguém assumiu.");
    if (!emAberto(c.status)) pararComErro("Este chamado já está fechado.");

    const { data, error } = await createAdminClient()
      .from("chamados")
      .update({ status: "cancelado", atualizado_em: new Date().toISOString() })
      .eq("id", c.id)
      .in("status", atende ? ["aberto", "em_atendimento", "aguardando"] : ["aberto"])
      .select("id");
    if (error) pararComErro(`Não foi possível cancelar: ${error.message}`);
    if (!data?.length) pararComErro("Alguém mexeu neste chamado agora há pouco. Atualize a tela.");

    await registrarEvento(c, { tipo: "status", statusPara: "cancelado", texto: motivo, autorNome: ctx.perfil.nome, autorId: ctx.perfil.id });
    if (atende) await avisarSolicitante(c, `Chamado ${protocolo(c.numero)} cancelado`, motivo.slice(0, 160), ctx.perfil.id);
    revalidar(c.id);
    return deuCerto("Chamado cancelado.");
  });
}

export async function comentarChamado(fd: FormData) {
  return acao(async () => {
    const ctx = await contexto();
    const c = await chamadoDoFormulario(fd, ctx, "ver");
    const recado = texto(fd, "texto");
    if (recado.length < 2) pararComErro("Escreva o recado.");
    const atende = podeAtenderChamado(ctx, c);
    if (!atende && c.solicitante_id !== ctx.perfil.id) pararComErro("Só quem pediu e a manutenção escrevem no chamado.");

    await registrarEvento(c, { tipo: "comentario", texto: recado, autorNome: ctx.perfil.nome, autorId: ctx.perfil.id });
    const titulo = `💬 Recado no chamado ${protocolo(c.numero)}`;
    const mensagem = `${ctx.perfil.nome.split(" ")[0]}: ${recado.slice(0, 140)}`;
    if (c.solicitante_id === ctx.perfil.id) {
      await avisarQuemCuida(c, { titulo, mensagem, criadoPor: ctx.perfil.nome, exceto: ctx.perfil.id });
    } else {
      await avisarSolicitante(c, titulo, mensagem, ctx.perfil.id);
    }
    revalidar(c.id);
    return deuCerto("Recado enviado.");
  });
}

// ---------------------------------------------------------------------
// Quem pediu
// ---------------------------------------------------------------------

export async function confirmarNoApp(fd: FormData) {
  return acao(async () => {
    const ctx = await contexto();
    const c = await chamadoDoFormulario(fd, ctx, "ver");
    if (c.solicitante_id !== ctx.perfil.id) pararComErro("Quem confirma é quem abriu o chamado.");
    const resolvido = texto(fd, "resposta") === "sim";
    const erro = await confirmarAtendimento(c, {
      resolvido,
      nota: Number(texto(fd, "nota")) || null,
      comentario: texto(fd, "comentario"),
      autorNome: ctx.perfil.nome,
      autorId: ctx.perfil.id,
    });
    if (erro) pararComErro(erro);
    revalidar(c.id);
    return deuCerto(resolvido ? "Obrigado! Chamado encerrado." : "Chamado reaberto. A manutenção foi avisada.");
  });
}

// ---------------------------------------------------------------------
// Apagar (liderança com "excluir": chamado de teste)
// ---------------------------------------------------------------------

export async function excluirChamado(fd: FormData) {
  return acao(async () => {
    const ctx = await contexto();
    if (!ctx.podeExcluir) pararComErro("Você não tem permissão para apagar chamado.");
    const c = await lerChamado(texto(fd, "id"));
    if (!c || c.revenda_id !== ctx.revendaId) pararComErro("Chamado não encontrado.");

    await apagarFotosDoChamado(c.id);
    const { error } = await createAdminClient().from("chamados").delete().eq("id", c.id);
    if (error) pararComErro(`Não foi possível apagar: ${error.message}`);
    revalidar();
    return deuCerto(`Chamado ${protocolo(c.numero)} apagado.`, ctx.podeAtender ? "/chamados?aba=fila" : "/gestao/chamados");
  });
}
