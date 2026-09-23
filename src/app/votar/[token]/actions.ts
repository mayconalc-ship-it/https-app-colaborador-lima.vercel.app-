"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  chaveDoEleitor,
  digitosDoCpf,
  validarVotoPeloLink,
  votacaoRecebeVoto,
} from "@/lib/boas-praticas";

/**
 * O VOTO PELO LINK DO GRUPO (23/09/2026).
 *
 * Aberto, sem login: quem tem o link vota. A identidade é o NOME mais os
 * 3 primeiros dígitos do CPF -- conferidos contra o cadastro quando a
 * pessoa existe no app, e só guardados como confirmação de quem votou.
 *
 * Um voto por pessoa: o nome normalizado (eleitor_chave) é único por
 * votação no banco (migration 132), e vale também para o voto feito no
 * app e para o lançado pela liderança.
 *
 * Tudo é conferido aqui, nunca na tela: o formulário é público.
 */
export async function votarPeloLink(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim().replace(/\s+/g, " ");
  const digitos = digitosDoCpf(String(formData.get("digitos") ?? ""));
  const praticaId = String(formData.get("pratica_id") ?? "");
  // O tipo na VARIÁVEL, não só no retorno: é assim que o TypeScript sabe
  // que depois de `volta(...)` o código não continua.
  const volta: (chave: "erro" | "ok", valor: string) => never = (chave, valor) =>
    redirect(`/votar/${encodeURIComponent(token)}?${chave}=${encodeURIComponent(valor)}`);

  if (!token) redirect("/");

  const problema = validarVotoPeloLink({ nome, digitos, praticaId });
  if (problema) volta("erro", problema);

  const admin = createAdminClient();
  const { data: votacao } = await admin
    .from("boas_praticas_votacoes")
    .select("id, revenda_id, fim, encerrada_em")
    .eq("token_publico", token)
    .maybeSingle();
  if (!votacao) volta("erro", "Este link não vale mais. Peça o link novo à liderança.");
  if (!votacaoRecebeVoto(votacao)) volta("erro", "A votação está encerrada. O resultado sai na divulgação.");

  const { data: pratica } = await admin
    .from("boas_praticas")
    .select("id, titulo, colaborador_nome, votacao_id")
    .eq("id", praticaId)
    .eq("revenda_id", votacao.revenda_id)
    .maybeSingle();
  if (!pratica || pratica.votacao_id !== votacao.id) volta("erro", "Esta prática não está na votação.");

  const chave = chaveDoEleitor(nome);
  if (chaveDoEleitor(pratica.colaborador_nome ?? "") === chave) {
    volta("erro", "Não vale votar na própria prática. Escolha a de um colega.");
  }

  /*
    OS 3 DÍGITOS, conferidos contra o cadastro.

    Só quando o nome existe no app: o link também é do pessoal que não
    tem conta, e para esses não há contra o que conferir. Nome repetido
    no cadastro (dois homônimos) passa se bater com qualquer um deles.
  */
  const { data: pessoas } = await admin.from("profiles").select("nome, cpf").limit(2000);
  const mesmoNome = (pessoas ?? []).filter((p) => chaveDoEleitor(String(p.nome ?? "")) === chave);
  if (mesmoNome.length > 0) {
    const confere = mesmoNome.some(
      (p) => String(p.cpf ?? "").replace(/\D/g, "").slice(0, digitos.length) === digitos,
    );
    if (!confere) {
      volta("erro", "Os primeiros números do CPF não batem com o seu cadastro. Confira e tente de novo.");
    }
  }

  const { error } = await admin.from("boas_praticas_votos").insert({
    revenda_id: votacao.revenda_id,
    votacao_id: votacao.id,
    pratica_id: pratica.id,
    colaborador_id: null,
    eleitor_nome: nome,
    eleitor_chave: chave,
    eleitor_doc: digitos,
    origem: "link",
    registrado_por_nome: "Link do grupo",
  });

  // O índice único da 132: esta pessoa já votou, por aqui ou pelo app.
  if (error?.code === "23505") {
    volta("erro", "Você já votou nesta votação. Cada pessoa vota uma vez só.");
  }
  if (error) volta("erro", `Não foi possível registrar o voto: ${error.message}`);

  revalidatePath("/admin/boas-praticas");
  volta("ok", `Voto registrado em “${pratica.titulo}”. Obrigado!`);
}
