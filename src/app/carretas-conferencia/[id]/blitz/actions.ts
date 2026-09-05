"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirContextoCarretas } from "@/lib/carretas-server";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";

const TAMANHO_MAXIMO = 8 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic"];

const rota = (id: string) => `/carretas-conferencia/${id}/blitz`;

function erro(atendimentoId: string, mensagem: string): never {
  redirect(`${rota(atendimentoId)}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * A foto da não conformidade, no mesmo bucket que o resto do app usa.
 *
 * `conteudo` é público para leitura e sem política de escrita -- só entra
 * pela service role, depois de a ação já ter conferido quem está pedindo.
 * Mesmo desenho do 5S; um bucket só para a blitz seria mais uma permissão
 * para manter em dia sem ganhar nada. E público importa aqui: a foto vai
 * como LINK no relato de ocorrência do transportador.
 */
async function subirFoto(
  arquivo: File,
  prefixo: string,
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  if (arquivo.size > TAMANHO_MAXIMO) return { ok: false, erro: "A foto passa de 8 MB. Tente outra." };
  if (arquivo.type && !TIPOS.includes(arquivo.type)) {
    return { ok: false, erro: "Envie uma imagem (JPG, PNG ou WEBP)." };
  }

  const admin = createAdminClient();
  const extensao = (arquivo.name.split(".").pop() ?? "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5);
  const caminho = `blitz/${prefixo}-${Date.now()}.${extensao || "jpg"}`;

  const { error } = await admin.storage.from("conteudo").upload(caminho, arquivo, {
    contentType: arquivo.type || "image/jpeg",
    upsert: true,
  });
  if (error) return { ok: false, erro: `Falha ao enviar a foto: ${error.message}` };

  const { data } = admin.storage.from("conteudo").getPublicUrl(caminho);
  return { ok: true, url: data.publicUrl };
}

/**
 * RESPONDER UM ITEM -- um por vez, e é a foto que obriga.
 *
 * Um "Salvar" para a tela toda seria o padrão da casa, e é o que as
 * outras telas fazem. Aqui não dá: treze fotos num único envio estouram o
 * limite de corpo da ação, e o conferente perderia o checklist inteiro
 * quando o sinal da doca oscilasse no último item. Mesmo desenho do
 * checklist do 5S, pelo mesmo motivo -- e o OK, que é a maioria, continua
 * sendo um toque só.
 */
export async function responderItem(formData: FormData) {
  const { revendaId } = await exigirContextoCarretas(
    "carretas-conferencia",
    "/carretas-conferencia",
  );
  const admin = createAdminClient();

  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  const blitzId = String(formData.get("blitz_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const pergunta = String(formData.get("pergunta") ?? "").trim();
  const resposta = String(formData.get("resposta") ?? "");
  const observacaoBruta = String(formData.get("observacao") ?? "").trim();

  if (!blitzId || !itemId || !pergunta) erro(atendimentoId, "Item inválido.");
  if (!["ok", "nok", "na"].includes(resposta)) erro(atendimentoId, "Resposta inválida.");

  const { data: blitz } = await admin
    .from("pa_blitz")
    .select("id, status")
    .eq("id", blitzId)
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!blitz) erro(atendimentoId, "Blitz não encontrada.");
  if (blitz.status !== "pendente") {
    erro(atendimentoId, "Esta blitz já foi concluída — fale com a liderança para reabrir.");
  }

  const { data: anterior } = await admin
    .from("pa_blitz_respostas")
    .select("id, foto_url")
    .eq("blitz_id", blitzId)
    .eq("item_id", itemId)
    .maybeSingle();

  let fotoUrl = anterior?.foto_url ?? null;
  const arquivo = formData.get("foto");
  if (arquivo instanceof File && arquivo.size > 0) {
    const enviada = await subirFoto(arquivo, `${blitzId}/${itemId}`);
    if (!enviada.ok) erro(atendimentoId, enviada.erro);
    fotoUrl = enviada.url;
  }

  // A MESMA REGRA DO BANCO, dita antes: NOK sem foto é a palavra do
  // conferente contra a do transportador. A trava está na migration 100
  // também -- aqui é só para a mensagem chegar em português, e não como
  // violação de constraint.
  if (resposta === "nok" && !fotoUrl) {
    erro(atendimentoId, `"${pergunta}" está NOK e precisa de foto — é a evidência que vai no relato ao transportador.`);
  }
  // Item que deixou de ser NOK guarda a foto: ela não atrapalha, e apagar
  // obrigaria a fotografar de novo se a pessoa se corrigir duas vezes.

  const linha = {
    revenda_id: revendaId,
    blitz_id: blitzId,
    item_id: itemId,
    pergunta,
    resposta,
    observacao: observacaoBruta || null,
    foto_url: fotoUrl,
  };

  const { error } = anterior
    ? await admin.from("pa_blitz_respostas").update(linha).eq("id", anterior.id)
    : await admin.from("pa_blitz_respostas").insert(linha);

  if (error) erro(atendimentoId, `Não foi possível gravar: ${error.message}`);

  revalidatePath(rota(atendimentoId));
}

/**
 * CONCLUIR -- e a blitz vira pendência da liderança.
 *
 * Só fecha com TODOS os itens ativos respondidos: uma blitz meio
 * respondida vira um relato de ocorrência que o transportador contesta na
 * primeira linha ("e os outros itens, estavam bons?").
 */
export async function concluirBlitz(formData: FormData) {
  const { perfil, revendaId } = await exigirContextoCarretas(
    "carretas-conferencia",
    "/carretas-conferencia",
  );
  const admin = createAdminClient();

  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  const blitzId = String(formData.get("blitz_id") ?? "");

  const [{ data: blitz }, { data: itens }, { data: respostas }] = await Promise.all([
    admin
      .from("pa_blitz")
      .select("id, status, gatilho_nome, transportadora_nome")
      .eq("id", blitzId)
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    admin.from("pa_blitz_itens").select("id").eq("revenda_id", revendaId).eq("ativo", true),
    admin.from("pa_blitz_respostas").select("item_id, resposta").eq("blitz_id", blitzId),
  ]);

  if (!blitz) erro(atendimentoId, "Blitz não encontrada.");
  if (blitz.status !== "pendente") {
    revalidatePath(rota(atendimentoId));
    redirect(`/carretas-conferencia/${atendimentoId}`);
  }

  const respondidos = new Set((respostas ?? []).map((r) => r.item_id));
  const faltando = (itens ?? []).filter((i) => !respondidos.has(i.id)).length;
  if (faltando > 0) {
    erro(
      atendimentoId,
      `Falta${faltando === 1 ? "" : "m"} ${faltando} item(ns) sem resposta. A blitz fecha com o checklist inteiro.`,
    );
  }

  const nok = (respostas ?? []).filter((r) => r.resposta === "nok").length;

  const { error } = await admin
    .from("pa_blitz")
    .update({
      status: "concluida",
      concluida_em: new Date().toISOString(),
      conferente_id: perfil.id,
      conferente_nome: perfil.nome,
    })
    .eq("id", blitzId);
  if (error) erro(atendimentoId, `Não foi possível concluir: ${error.message}`);

  const alvo = blitz.gatilho_nome ?? blitz.transportadora_nome ?? "a carreta";
  const titulo = nok > 0 ? `🚨 Blitz com ${nok} não conformidade(s)` : "✅ Blitz sem não conformidade";
  const mensagem =
    nok > 0
      ? `${alvo}: o conferente registrou ${nok} item(ns) NOK com foto. O relato de ocorrência já está escrito, esperando revisão e envio.`
      : `${alvo}: a inspeção não encontrou não conformidade. Vale registrar a tratativa mesmo assim.`;
  const url = `/gestao/blitz/${blitzId}`;

  await criarNotificacao({
    modulo: "relato-anomalia",
    tipo: "lembrete",
    titulo,
    mensagem,
    url,
    revendaId,
    referenciaId: `blitz:${blitzId}`,
  });
  await enviarPushDaRevenda(revendaId, { modulo: "relato-anomalia", titulo, mensagem, url });

  revalidatePath(rota(atendimentoId));
  revalidatePath(`/carretas-conferencia/${atendimentoId}`);
  revalidatePath("/gestao/anomalias");
  // Volta para a carreta, e não para uma tela de "pronto": o conferente
  // ainda tem descarga e conferência para tocar, e o cartão de lá já diz
  // que a blitz fechou e com quantos NOK.
  redirect(`/carretas-conferencia/${atendimentoId}`);
}
