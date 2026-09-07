"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { STATUS_ACAO } from "@/lib/relato-anomalia";

const PAINEL = "/gestao/anomalias";

/**
 * CORRIGIR O PRAZO E O STATUS DE UMA AÇÃO, do próprio painel.
 *
 * Pedido do dono (07/09/2026): "os botões de prazo e status devem ser
 * editáveis, pois o prazo pode variar ou se for digitado errado".
 *
 * O CAMINHO CURTO IMPORTA AQUI. A ação vencida aparece no painel; até
 * ontem, corrigi-la exigia abrir o relato, achar a linha no plano, mudar e
 * salvar o documento inteiro. Quatro passos para mudar uma data -- e uma
 * data que ninguém corrige é uma cobrança que todo mundo aprende a
 * ignorar.
 *
 * O QUE NÃO SE EDITA AQUI: o "o quê", o "como" e o dono. Esses são o
 * conteúdo da análise, e mudá-los de passagem, fora do documento, seria
 * reescrever a conclusão sem passar pela reunião. Prazo e status são o
 * ANDAMENTO -- e andamento muda o tempo todo.
 */
export async function atualizarAcaoDoPainel(formData: FormData) {
  await requireModulo("relato-anomalia", "editar", PAINEL);
  const revendaId = await exigirRevenda(PAINEL);

  const id = String(formData.get("acao_id") ?? "");
  const voltarPara = String(formData.get("voltar") ?? PAINEL);
  if (!id) redirect(`${PAINEL}?erro=${encodeURIComponent("Ação inválida.")}`);

  const prazo = String(formData.get("prazo") ?? "").trim() || null;
  const statusBruto = String(formData.get("status") ?? "");
  const status = (STATUS_ACAO as readonly string[]).includes(statusBruto)
    ? statusBruto
    : "pendente";

  const admin = createAdminClient();
  const { error } = await admin
    .from("pa_relato_acoes")
    .update({ prazo, status })
    .eq("id", id)
    .eq("revenda_id", revendaId);

  // O separador depende da URL de volta, que às vezes já tem `?ver=` e às
  // vezes é o painel pelado. Com "&" fixo, o painel sem gaveta recebia
  // "/gestao/anomalias&erro=..." e o erro simplesmente não aparecia.
  const com = (url: string, chave: string, texto: string) =>
    `${url}${url.includes("?") ? "&" : "?"}${chave}=${encodeURIComponent(texto)}`;

  if (error) redirect(com(voltarPara, "erro", `Não foi possível salvar: ${error.message}`));

  /*
    DIZER PARA ONDE A AÇÃO FOI.

    Ela troca de cartão ao mudar de status ou de prazo, e sair da lista sem
    aviso é exatamente o "sumiu, não sei pra onde foi" que o dono relatou
    duas vezes -- uma ao concluir, outra ao reabrir. A pessoa continua na
    lista que estava cobrando (é o que ela quer), mas agora a tela conta o
    que aconteceu com o item que saiu dali.
  */
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const destino =
    status === "concluida"
      ? "✅ ações concluídas"
      : prazo && prazo < hoje
        ? "⏰ ações atrasadas"
        : "ações no prazo";

  // Sem redirect para outra tela: a pessoa está cobrando uma lista, e
  // quer continuar na lista. `revalidatePath` redesenha em pé.
  revalidatePath(PAINEL);
  redirect(com(voltarPara, "sucesso", `Ação salva. Ela está no cartão "${destino}".`));
}
