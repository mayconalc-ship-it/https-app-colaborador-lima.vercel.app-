"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { getPerfil } from "@/lib/sessao";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import {
  PERGUNTAS_PADRONIZACAO,
  PORQUES,
  TOPICOS_ACAO,
  pendenciasDoRelato,
  type AcaoDoPlano,
  type Padronizacao,
  type StatusAcao,
  type TopicoAcao,
} from "@/lib/relato-anomalia";

const PAINEL = "/gestao/anomalias";
const rota = (id: string) => `${PAINEL}/${id}`;

function erro(id: string, mensagem: string): never {
  redirect(`${rota(id)}?erro=${encodeURIComponent(mensagem)}`);
}

/** As linhas do plano, lidas do formulário. Vêm como listas paralelas --
 *  é como o HTML manda campos repetidos. */
function acoesDoFormulario(formData: FormData): AcaoDoPlano[] {
  const topicos = formData.getAll("acao_topico").map(String);
  const oQues = formData.getAll("acao_o_que").map(String);
  const comos = formData.getAll("acao_como").map(String);
  const quems = formData.getAll("acao_quem").map(String);
  const prazos = formData.getAll("acao_prazo").map(String);
  const status = formData.getAll("acao_status").map(String);

  return topicos
    .map((topico, i) => ({
      topico: (TOPICOS_ACAO as readonly string[]).includes(topico)
        ? (topico as TopicoAcao)
        : ("corretiva" as TopicoAcao),
      oQue: (oQues[i] ?? "").trim(),
      como: (comos[i] ?? "").trim(),
      quem: (quems[i] ?? "").trim(),
      prazo: (prazos[i] ?? "").trim() || null,
      status: (["pendente", "em_andamento", "concluida"].includes(status[i] ?? "")
        ? status[i]
        : "pendente") as StatusAcao,
    }))
    // Linha totalmente em branco é a que o "+ Adicionar" deixou e ninguém
    // preencheu. Descartar aqui evita gravar ação vazia que depois
    // apareceria como "sem responsável" na checagem de fechamento.
    .filter((a) => a.oQue || a.quem || a.como);
}

/**
 * SALVA O RELATO INTEIRO -- cabeçalho, porquês, padronização e plano.
 *
 * Um Salvar só, no fim, como o resto do app: são quatro seções do mesmo
 * documento, e um botão por seção faria a pessoa salvar quatro vezes
 * para preencher uma folha.
 *
 * GRAVA MESMO INCOMPLETO, de propósito. O relato é preenchido em mais de
 * uma sentada -- a reunião de análise levanta os porquês, o plano sai
 * depois. Exigir tudo para salvar faria a pessoa perder o que já
 * escreveu. Quem cobra o completo é o FECHAMENTO (ver assinarRelato).
 */
export async function salvarRelato(formData: FormData) {
  await requireModulo("relato-anomalia", "editar", PAINEL);
  const revendaId = await exigirRevenda(PAINEL);
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  if (!id) erro(id, "Relato inválido.");

  const natureza = String(formData.get("natureza") ?? "");
  const padronizacao: Padronizacao = {};
  for (const p of PERGUNTAS_PADRONIZACAO) {
    const v = String(formData.get(`padr__${p.id}`) ?? "");
    if (v === "sim" || v === "nao") padronizacao[p.id] = v;
  }

  const porques = Array.from({ length: PORQUES }, (_, i) =>
    String(formData.get(`porque__${i}`) ?? "").trim(),
  );

  const participantes = String(formData.get("participantes") ?? "")
    .split(/[,;\n]/)
    .map((p) => p.trim())
    .filter(Boolean);

  const { error } = await admin
    .from("pa_relatos_anomalia")
    .update({
      area: String(formData.get("area") ?? "").trim() || null,
      sala: String(formData.get("sala") ?? "").trim() || null,
      natureza: natureza === "unica" || natureza === "repetitiva" ? natureza : null,
      ic_iv: String(formData.get("ic_iv") ?? "").trim() || null,
      sintoma: String(formData.get("sintoma") ?? "").trim() || null,
      participantes,
      porques,
      padronizacao,
      responsavel_nome: String(formData.get("responsavel_nome") ?? "").trim() || null,
      gestor_nome: String(formData.get("gestor_nome") ?? "").trim() || null,
      // O status anda sozinho conforme o preenchimento: quem está
      // escrevendo não deveria também ter de escolher em que fase está.
      status: statusPeloPreenchimento(porques, formData),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    // Relato já assinado não se reescreve: ele virou evidência. Reabrir é
    // outra ação, e por enquanto não existe -- de propósito.
    .is("assinado_em", null);

  if (error) erro(id, `Não foi possível salvar: ${error.message}`);

  /*
    O PLANO É REESCRITO INTEIRO a cada salvamento.

    Casar linha a linha exigiria um id estável por ação que o formulário
    não tem, e "editar o plano" quase sempre é acrescentar ou trocar o
    prazo de uma linha -- reescrever é o que a pessoa espera ao salvar o
    formulário que está vendo. Mesmo desenho do AG do retorno da carreta.
  */
  const acoes = acoesDoFormulario(formData);
  const { error: erroApagar } = await admin
    .from("pa_relato_acoes")
    .delete()
    .eq("relato_id", id)
    .eq("revenda_id", revendaId);
  if (erroApagar) erro(id, `Não foi possível atualizar o plano: ${erroApagar.message}`);

  if (acoes.length > 0) {
    const { error: erroInserir } = await admin.from("pa_relato_acoes").insert(
      acoes.map((a, i) => ({
        revenda_id: revendaId,
        relato_id: id,
        ordem: i,
        topico: a.topico,
        o_que: a.oQue,
        como: a.como || null,
        quem: a.quem,
        prazo: a.prazo,
        status: a.status,
        concluida_em: a.status === "concluida" ? new Date().toISOString().slice(0, 10) : null,
      })),
    );
    if (erroInserir) erro(id, `Não foi possível gravar o plano: ${erroInserir.message}`);
  }

  revalidatePath(rota(id));
  revalidatePath(PAINEL);
  redirect(`${rota(id)}?sucesso=${encodeURIComponent("Relato salvo.")}`);
}

/** O status sai do que já foi escrito -- ninguém escolhe a fase à mão. */
function statusPeloPreenchimento(porques: string[], formData: FormData) {
  const respondidos = porques.filter(Boolean).length;
  const temAcao = formData.getAll("acao_o_que").some((v) => String(v).trim());
  if (temAcao && respondidos >= PORQUES) return "plano_definido";
  if (respondidos > 0) return "em_analise";
  return "aberto";
}

/**
 * A ASSINATURA DO GESTOR -- o que fecha o documento.
 *
 * É AQUI que o completo é exigido, e não no salvar: a checagem devolve a
 * lista do que falta (ver pendenciasDoRelato), porque numa folha de
 * trinta campos "está incompleto" manda a pessoa caçar.
 */
export async function assinarRelato(formData: FormData) {
  await requireModulo("relato-anomalia", "editar", PAINEL);
  const revendaId = await exigirRevenda(PAINEL);
  const perfil = await getPerfil();
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  const assinatura = String(formData.get("assinatura_gestor") ?? "").trim();
  if (!assinatura) erro(id, "Escreva o nome de quem está assinando.");

  const { data: relato } = await admin
    .from("pa_relatos_anomalia")
    .select("id, porques, padronizacao, assinado_em")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!relato) erro(id, "Relato não encontrado.");
  if (relato.assinado_em) erro(id, "Este relato já foi assinado.");

  const { data: acoes } = await admin
    .from("pa_relato_acoes")
    .select("topico, o_que, como, quem, prazo, status")
    .eq("relato_id", id);

  const faltas = pendenciasDoRelato({
    porques: (relato.porques ?? []) as string[],
    padronizacao: (relato.padronizacao ?? {}) as Padronizacao,
    acoes: ((acoes ?? []) as {
      topico: TopicoAcao;
      o_que: string;
      como: string | null;
      quem: string;
      prazo: string | null;
      status: StatusAcao;
    }[]).map((a) => ({
      topico: a.topico,
      oQue: a.o_que,
      como: a.como ?? "",
      quem: a.quem,
      prazo: a.prazo,
      status: a.status,
    })),
    assinaturaGestor: assinatura,
  });

  if (faltas.length > 0) {
    erro(id, `Ainda falta: ${faltas.join(" · ")}`);
  }

  const agora = new Date();
  const { error } = await admin
    .from("pa_relatos_anomalia")
    .update({
      assinatura_gestor: assinatura,
      assinado_em: agora.toISOString(),
      finalizado_em: agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }),
      status: "concluido",
      criado_por: perfil?.id ?? null,
      atualizado_em: agora.toISOString(),
    })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro(id, `Não foi possível assinar: ${error.message}`);

  revalidatePath(rota(id));
  revalidatePath(PAINEL);
  redirect(
    `${rota(id)}?sucesso=${encodeURIComponent(
      "Relato assinado. Falta verificar a eficácia quando o indicador voltar para dentro do limite.",
    )}`,
  );
}

/**
 * A VERIFICAÇÃO DE EFICÁCIA -- o estado que o papel não tem.
 *
 * O auditor não pergunta se você assinou; ele pergunta se funcionou.
 * Fica separada da assinatura porque acontece DEPOIS, e por definição:
 * é preciso o indicador voltar para dentro do limite e ficar.
 */
export async function verificarEficacia(formData: FormData) {
  await requireModulo("relato-anomalia", "editar", PAINEL);
  const revendaId = await exigirRevenda(PAINEL);
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  const observacao = String(formData.get("eficacia_observacao") ?? "").trim();
  if (!observacao) {
    erro(id, "Escreva o que mostra que a ação funcionou — é isso que o auditor lê.");
  }

  const { error } = await admin
    .from("pa_relatos_anomalia")
    .update({
      eficacia_verificada_em: new Date().toISOString(),
      eficacia_observacao: observacao,
      status: "eficacia_verificada",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .not("assinado_em", "is", null);
  if (error) erro(id, `Não foi possível registrar: ${error.message}`);

  revalidatePath(rota(id));
  revalidatePath(PAINEL);
  redirect(`${rota(id)}?sucesso=${encodeURIComponent("Eficácia verificada. Ciclo fechado.")}`);
}
