"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { lerConfigBoasPraticas } from "@/lib/boas-praticas-server";
import {
  LIMITES,
  MEDALHA,
  apurar,
  formatarDia,
  formatarReais,
  lerData,
  lerReais,
  motivoParaNaoDivulgar,
  premiosDe,
  validarDatasDaVotacao,
  validarPodio,
  validarPremios,
} from "@/lib/boas-praticas";

const ROTA = "/admin/boas-praticas";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`${ROTA}?${chave}=${encodeURIComponent(mensagem)}`);
}

function atualizarTelas() {
  revalidatePath(ROTA);
  revalidatePath("/boas-praticas");
}

/**
 * Selecionar para a votação ou não. A recusa exige o motivo: quem sugeriu
 * precisa saber por que -- sem isso, não sugere de novo. A migration 117
 * trava a mesma coisa no banco.
 */
export async function avaliarPratica(formData: FormData) {
  const perfil = await requireModulo("boas-praticas", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  const retorno = String(formData.get("retorno") ?? "").trim().slice(0, LIMITES.retornoMax);

  if (!id) voltar("erro", "Prática inválida.");
  if (decisao !== "selecionada" && decisao !== "nao_selecionada") voltar("erro", "Escolha a decisão.");
  if (decisao === "nao_selecionada" && !retorno) {
    voltar("erro", "Escreva para a pessoa por que a prática não foi selecionada.");
  }

  const admin = createAdminClient();
  const { data: avaliadas, error } = await admin
    .from("boas_praticas")
    .update({
      status: decisao,
      retorno: retorno || null,
      avaliado_por_id: perfil.id,
      avaliado_por_nome: perfil.nome,
      avaliado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("status", "em_analise")
    .select("id, colaborador_id, titulo");

  if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);
  const pratica = avaliadas?.[0];
  if (!pratica) voltar("erro", "Esta prática já foi avaliada por outra pessoa.");

  const selecionada = decisao === "selecionada";
  const titulo = selecionada
    ? `✅ Sua prática “${pratica.titulo}” foi aprovada para a votação`
    : `Sua prática “${pratica.titulo}” não foi selecionada desta vez`;
  const mensagem = retorno || "Ela vai para a votação. Boa sorte!";
  const url = "/boas-praticas?aba=minhas";

  await criarNotificacao({
    modulo: "boas-praticas",
    tipo: "atualizado",
    titulo,
    mensagem,
    url,
    referenciaId: pratica.id,
    criadoPor: perfil.nome,
    destinatarioId: pratica.colaborador_id,
  });
  await enviarPushDaRevenda(revendaId, {
    modulo: "boas-praticas",
    titulo,
    mensagem,
    url,
    apenas: [pratica.colaborador_id],
  });

  atualizarTelas();
  voltar("sucesso", selecionada ? "Prática aprovada para a votação." : "Resposta enviada para quem sugeriu.");
}

/** Desfaz a avaliação -- só antes de a prática entrar numa votação. */
export async function voltarParaAnalise(formData: FormData) {
  await requireModulo("boas-praticas", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  if (!id) voltar("erro", "Prática inválida.");

  const admin = createAdminClient();
  const { data: alteradas, error } = await admin
    .from("boas_praticas")
    .update({
      status: "em_analise",
      retorno: null,
      avaliado_por_id: null,
      avaliado_por_nome: null,
      avaliado_em: null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .is("votacao_id", null)
    .in("status", ["selecionada", "nao_selecionada"])
    .select("id");

  if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);
  if (!alteradas || alteradas.length === 0) {
    voltar("erro", "Prática que já entrou em votação não volta para análise.");
  }

  atualizarTelas();
  voltar("sucesso", "A prática voltou para análise.");
}

/**
 * Apagar -- para o teste e o engano. A prática que já entrou em votação
 * não se apaga: ela é parte do resultado que todo mundo viu.
 */
export async function excluirPraticaAdmin(formData: FormData) {
  await requireModulo("boas-praticas", "excluir", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  if (!id) voltar("erro", "Prática inválida.");

  const admin = createAdminClient();
  const { data: apagadas, error } = await admin
    .from("boas_praticas")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .is("votacao_id", null)
    .select("id");

  if (error) voltar("erro", `Não foi possível apagar: ${error.message}`);
  if (!apagadas || apagadas.length === 0) {
    voltar("erro", "Prática que já entrou em votação não pode ser apagada: ela faz parte do resultado.");
  }

  atualizarTelas();
  voltar("sucesso", "Prática apagada.");
}

/**
 * Abre a votação com as práticas aprovadas. Todas as regras de novo aqui,
 * independente do que a tela já barrou: pelo menos duas, todas aprovadas
 * e livres, prazo de hoje em diante com a divulgação depois dele, uma
 * votação aberta por vez (esta última também é índice único no banco).
 *
 * A premiação vem da Configuração e é COPIADA para a votação: mudar a
 * configuração da próxima edição não reescreve o prêmio desta.
 */
export async function abrirVotacao(formData: FormData) {
  const perfil = await requireModulo("boas-praticas", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const titulo = String(formData.get("titulo") ?? "").trim();
  const fim = lerData(formData.get("fim"));
  const divulgacao = lerData(formData.get("divulgacao_em"));
  const ids = [...new Set(formData.getAll("pratica_id").map(String).filter(Boolean))];

  if (titulo.length < 3 || titulo.length > LIMITES.votacaoTituloMax) {
    voltar("erro", `Dê um nome à votação (até ${LIMITES.votacaoTituloMax} caracteres).`);
  }
  const erroDeData = validarDatasDaVotacao(fim, divulgacao);
  if (erroDeData) voltar("erro", erroDeData);
  if (ids.length < LIMITES.minimoNaVotacao) {
    voltar("erro", `Escolha pelo menos ${LIMITES.minimoNaVotacao} práticas para a votação.`);
  }

  const admin = createAdminClient();

  const { data: jaAberta } = await admin
    .from("boas_praticas_votacoes")
    .select("id")
    .eq("revenda_id", revendaId)
    .is("encerrada_em", null)
    .maybeSingle();
  if (jaAberta) voltar("erro", "Já existe uma votação aberta. Divulgue ou cancele antes de abrir outra.");

  const { data: livres } = await admin
    .from("boas_praticas")
    .select("id")
    .in("id", ids)
    .eq("revenda_id", revendaId)
    .eq("status", "selecionada")
    .is("votacao_id", null);
  if ((livres ?? []).length !== ids.length) {
    voltar("erro", "Alguma prática escolhida não está mais disponível. Recarregue a tela e confira.");
  }

  const config = await lerConfigBoasPraticas(revendaId);

  const { data: votacao, error } = await admin
    .from("boas_praticas_votacoes")
    .insert({
      revenda_id: revendaId,
      titulo,
      fim,
      divulgacao_em: divulgacao,
      premio_1: config.premio_1,
      premio_2: config.premio_2,
      premio_3: config.premio_3,
      aberta_por_id: perfil.id,
      aberta_por_nome: perfil.nome,
    })
    .select("id")
    .single();

  if (error || !votacao) {
    if (error?.code === "23505") {
      voltar("erro", "Já existe uma votação aberta. Divulgue ou cancele antes de abrir outra.");
    }
    voltar("erro", `Não foi possível abrir a votação: ${error?.message ?? "tente de novo"}`);
  }

  const { data: vinculadas } = await admin
    .from("boas_praticas")
    .update({ votacao_id: votacao.id, atualizado_em: new Date().toISOString() })
    .in("id", ids)
    .eq("revenda_id", revendaId)
    .eq("status", "selecionada")
    .is("votacao_id", null)
    .select("id");

  // Outra pessoa mexeu numa delas no meio do caminho: desfaz tudo em vez
  // de abrir uma votação diferente da que foi montada na tela. Apagar a
  // votação solta as práticas sozinho (on delete set null).
  if ((vinculadas ?? []).length !== ids.length) {
    await admin.from("boas_praticas_votacoes").delete().eq("id", votacao.id);
    voltar("erro", "Alguma prática mudou enquanto a votação era aberta. Recarregue a tela e tente de novo.");
  }

  const premio1 = config.premio_1 != null ? ` O 1º lugar leva ${formatarReais(config.premio_1)}.` : "";
  const tituloAviso = `🗳️ Votação aberta: ${titulo}`;
  const mensagem = `${ids.length} práticas aprovadas concorrendo. Vote até ${formatarDia(fim!)}.${premio1}`;
  const url = "/boas-praticas?aba=votar";

  await criarNotificacao({
    modulo: "boas-praticas",
    tipo: "importante",
    titulo: tituloAviso,
    mensagem,
    url,
    referenciaId: votacao.id,
    criadoPor: perfil.nome,
  });
  await enviarPushDaRevenda(revendaId, {
    modulo: "boas-praticas",
    titulo: tituloAviso,
    mensagem,
    url,
    exceto: perfil.id,
  });

  atualizarTelas();
  voltar("sucesso", "Votação aberta! A revenda inteira foi avisada.");
}

/** Prazo, divulgação e prêmios mudam com a votação aberta. */
export async function atualizarVotacao(formData: FormData) {
  await requireModulo("boas-praticas", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  const fim = lerData(formData.get("fim"));
  const divulgacao = lerData(formData.get("divulgacao_em"));
  const premios = {
    premio_1: lerReais(formData.get("premio_1")),
    premio_2: lerReais(formData.get("premio_2")),
    premio_3: lerReais(formData.get("premio_3")),
  };

  if (!id) voltar("erro", "Votação inválida.");
  const erro = validarDatasDaVotacao(fim, divulgacao) ?? validarPremios(premios);
  if (erro) voltar("erro", erro);

  const admin = createAdminClient();
  const { data: alteradas, error } = await admin
    .from("boas_praticas_votacoes")
    .update({ fim, divulgacao_em: divulgacao, ...premios })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .is("encerrada_em", null)
    .select("id");

  if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);
  if (!alteradas || alteradas.length === 0) voltar("erro", "O resultado desta votação já foi divulgado.");

  atualizarTelas();
  voltar("sucesso", "Votação atualizada.");
}

/**
 * Divulga o pódio. Quem decide é o VOTO: a liderança só ordena as
 * empatadas, e o servidor recusa qualquer pódio que contrarie a contagem
 * (validarPodio). E só no calendário: depois do último dia de votação e a
 * partir do dia da divulgação (motivoParaNaoDivulgar).
 */
export async function divulgarResultado(formData: FormData) {
  const perfil = await requireModulo("boas-praticas", "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  const escolhidas = [1, 2, 3].map((n) => String(formData.get(`lugar_${n}`) ?? ""));
  if (!id) voltar("erro", "Votação inválida.");

  const admin = createAdminClient();
  const { data: votacao } = await admin
    .from("boas_praticas_votacoes")
    .select("id, titulo, fim, divulgacao_em, encerrada_em, premio_1, premio_2, premio_3")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!votacao) voltar("erro", "Votação não encontrada.");

  const bloqueio = motivoParaNaoDivulgar(votacao);
  if (bloqueio) voltar("erro", bloqueio);

  // Uma revenda tem ~160 pessoas e é um voto por pessoa: cabe folgado
  // abaixo das 1.000 linhas que o PostgREST devolve por consulta.
  const [{ data: praticas }, { data: votos }] = await Promise.all([
    admin.from("boas_praticas").select("id, titulo, colaborador_id, colaborador_nome").eq("votacao_id", id),
    admin.from("boas_praticas_votos").select("pratica_id").eq("votacao_id", id),
  ]);
  const lista = praticas ?? [];
  const { contagem } = apurar(
    lista.map((p) => p.id as string),
    (votos ?? []) as { pratica_id: string }[],
  );

  const resultado = validarPodio(Object.fromEntries(contagem), escolhidas);
  if (!resultado.ok) voltar("erro", resultado.erro);
  const podio = resultado.podio;

  const { data: encerradas, error } = await admin
    .from("boas_praticas_votacoes")
    .update({
      encerrada_em: new Date().toISOString(),
      encerrada_por_nome: perfil.nome,
      vencedora_id: podio[0] ?? null,
      segunda_id: podio[1] ?? null,
      terceira_id: podio[2] ?? null,
    })
    .eq("id", id)
    .is("encerrada_em", null)
    .select("id");

  if (error) voltar("erro", `Não foi possível divulgar: ${error.message}`);
  if (!encerradas || encerradas.length === 0) voltar("erro", "O resultado desta votação já foi divulgado.");

  if (podio.length > 0) {
    const premios = premiosDe(votacao);
    const porId = new Map(lista.map((p) => [p.id as string, p]));
    const url = "/boas-praticas?aba=vencedoras";

    const titulo = `🏆 Resultado: ${votacao.titulo}`;
    const mensagem = podio
      .map((pid, i) => `${MEDALHA[i]} ${porId.get(pid)?.titulo} (${porId.get(pid)?.colaborador_nome})`)
      .join(" · ");

    await criarNotificacao({
      modulo: "boas-praticas",
      tipo: "importante",
      titulo,
      mensagem,
      url,
      referenciaId: votacao.id,
      criadoPor: perfil.nome,
    });
    await enviarPushDaRevenda(revendaId, { modulo: "boas-praticas", titulo, mensagem, url });

    // E o recado pessoal para cada premiado.
    await Promise.all(
      podio.map((pid, i) => {
        const p = porId.get(pid);
        if (!p) return Promise.resolve();
        return criarNotificacao({
          modulo: "boas-praticas",
          tipo: "importante",
          titulo: `${MEDALHA[i]} Sua prática “${p.titulo}” ficou em ${i + 1}º lugar!`,
          mensagem:
            premios[i].valor != null
              ? `Parabéns! Prêmio: ${formatarReais(premios[i].valor)}.`
              : "Parabéns pela prática!",
          url,
          referenciaId: votacao.id,
          criadoPor: perfil.nome,
          destinatarioId: p.colaborador_id as string,
        });
      }),
    );
  }

  atualizarTelas();
  voltar("sucesso", podio.length > 0 ? "Resultado divulgado para a revenda." : "Votação encerrada sem votos.");
}

/**
 * Cancelar a votação aberta -- para a votação montada errada. Os votos
 * vão junto, e as práticas voltam para "aguardando votação".
 */
export async function cancelarVotacao(formData: FormData) {
  await requireModulo("boas-praticas", "excluir", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  if (!id) voltar("erro", "Votação inválida.");

  const admin = createAdminClient();
  const { data: apagadas, error } = await admin
    .from("boas_praticas_votacoes")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .is("encerrada_em", null)
    .select("id");

  if (error) voltar("erro", `Não foi possível cancelar: ${error.message}`);
  if (!apagadas || apagadas.length === 0) {
    voltar("erro", "Votação com resultado divulgado não se cancela.");
  }

  atualizarTelas();
  voltar("sucesso", "Votação cancelada. As práticas voltaram para aguardando votação.");
}
