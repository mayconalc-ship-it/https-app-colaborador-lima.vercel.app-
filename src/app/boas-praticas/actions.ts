"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { subirFotoHorimetro } from "@/lib/produtividade-armazem-server";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { contextoBoasPraticas, quemAvaliaBoasPraticas } from "@/lib/boas-praticas-server";
import {
  lerPratica,
  mensagemPrazoDeSugestao,
  recebeSugestao,
  validarPratica,
} from "@/lib/boas-praticas";

const ROTA = "/boas-praticas";

function voltar(aba: string, chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`${ROTA}?aba=${aba}&${chave}=${encodeURIComponent(mensagem)}`);
}

/** A mesma porta da tela: sem ela, a ação ficaria aberta a quem soubesse o endereço. */
async function contexto() {
  const c = await contextoBoasPraticas();
  if (!c.ok) redirect(`/?erro=${encodeURIComponent(c.erro)}`);
  return c;
}

/** Foto opcional. Undefined = nenhuma foto nova enviada. */
async function fotoDoFormulario(formData: FormData, prefixo: string, aba: string) {
  const foto = formData.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return undefined;
  const enviada = await subirFotoHorimetro(foto, prefixo, "boas-praticas");
  if (!enviada.ok) voltar(aba, "erro", enviada.erro);
  return enviada.url;
}

export async function enviarPratica(formData: FormData) {
  const { perfil, revendaId, config } = await contexto();

  // O prazo das sugestões (Configuração). A tela esconde o formulário
  // depois dele; aqui é a mesma regra para quem chamar a ação por fora.
  if (!recebeSugestao(config)) voltar("sugerir", "erro", mensagemPrazoDeSugestao(config));

  const dados = lerPratica(formData);
  const problema = validarPratica(dados);
  if (problema) voltar("sugerir", "erro", problema);

  const fotoUrl = await fotoDoFormulario(formData, perfil.id, "sugerir");

  const admin = createAdminClient();
  const { data: criada, error } = await admin
    .from("boas_praticas")
    .insert({
      revenda_id: revendaId,
      colaborador_id: perfil.id,
      colaborador_nome: perfil.nome,
      ...dados,
      foto_url: fotoUrl ?? null,
    })
    .select("id")
    .single();

  if (error || !criada) voltar("sugerir", "erro", `Não foi possível enviar: ${error?.message ?? "tente de novo"}`);

  // Aviso a quem avalia. Uma sugestão parada numa lista que ninguém abre
  // desanima quem sugeriu -- e a próxima não vem. Nunca derruba o envio.
  try {
    const avaliadores = (await quemAvaliaBoasPraticas(revendaId)).filter((id) => id !== perfil.id);
    if (avaliadores.length > 0) {
      const titulo = `💡 Nova boa prática: ${dados.titulo}`;
      const mensagem = `${perfil.nome} sugeriu. Avalie se ela vai para a votação.`;
      const url = "/admin/boas-praticas";
      await Promise.all(
        avaliadores.map((id) =>
          criarNotificacao({
            modulo: "boas-praticas-avaliar",
            tipo: "pendencia",
            titulo,
            mensagem,
            url,
            referenciaId: criada.id,
            criadoPor: perfil.nome,
            destinatarioId: id,
          }),
        ),
      );
      await enviarPushDaRevenda(revendaId, {
        modulo: "boas-praticas-avaliar",
        titulo,
        mensagem,
        url,
        apenas: avaliadores,
      });
    }
  } catch {
    // Aviso é acessório; a sugestão já está gravada.
  }

  revalidatePath(ROTA);
  revalidatePath("/admin/boas-praticas");
  voltar(
    "minhas",
    "sucesso",
    "Prática enviada! A liderança vai avaliar, e a resposta chega aqui no app.",
  );
}

/**
 * Corrigir a própria sugestão -- só enquanto ela está em análise. Depois
 * de avaliada, o texto é o que a liderança leu e o que vai a voto:
 * mudar ali mudaria a prática por baixo da decisão.
 */
export async function editarPratica(formData: FormData) {
  const { perfil, revendaId, config } = await contexto();

  // Corrigir também fecha no prazo: depois dele a liderança já está
  // analisando o texto que foi enviado.
  if (!recebeSugestao(config)) voltar("minhas", "erro", mensagemPrazoDeSugestao(config));

  const id = String(formData.get("id") ?? "");
  if (!id) voltar("minhas", "erro", "Prática inválida.");

  const dados = lerPratica(formData);
  const problema = validarPratica(dados);
  if (problema) redirect(`${ROTA}?aba=sugerir&editar=${id}&erro=${encodeURIComponent(problema)}`);

  const fotoUrl = await fotoDoFormulario(formData, perfil.id, "minhas");

  const admin = createAdminClient();
  const { data: alteradas, error } = await admin
    .from("boas_praticas")
    .update({
      ...dados,
      ...(fotoUrl ? { foto_url: fotoUrl } : {}),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .eq("status", "em_analise")
    .select("id");

  if (error) voltar("minhas", "erro", `Não foi possível salvar: ${error.message}`);
  if (!alteradas || alteradas.length === 0) {
    voltar("minhas", "erro", "Só dá para editar enquanto a prática está em análise.");
  }

  revalidatePath(ROTA);
  revalidatePath("/admin/boas-praticas");
  voltar("minhas", "sucesso", "Prática atualizada.");
}

/** Desistir da sugestão -- mesma regra da edição: só em análise. */
export async function excluirPratica(formData: FormData) {
  const { perfil, revendaId } = await contexto();

  const id = String(formData.get("id") ?? "");
  if (!id) voltar("minhas", "erro", "Prática inválida.");

  const admin = createAdminClient();
  const { data: apagadas, error } = await admin
    .from("boas_praticas")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .eq("status", "em_analise")
    .select("id");

  if (error) voltar("minhas", "erro", `Não foi possível apagar: ${error.message}`);
  if (!apagadas || apagadas.length === 0) {
    voltar("minhas", "erro", "Só dá para apagar enquanto a prática está em análise.");
  }

  revalidatePath(ROTA);
  revalidatePath("/admin/boas-praticas");
  voltar("minhas", "sucesso", "Prática apagada.");
}

/*
  O VOTO SAIU DAQUI EM 23/09/2026 (pedido do dono): a votação inteira
  acontece pelo LINK do grupo de WhatsApp (app/votar/[token]). Esta tela
  agora só sugere, corrige e acompanha -- não existe mais ação de votar
  pelo app, nem para a liderança.
*/
