"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { CATALOGO_DE_METAS } from "@/lib/metas";
import { MINIMO_DE_PONTOS, SIGMAS_PADRAO } from "@/lib/gatilho-anomalia";

const ROTA = "/admin/relato-anomalia";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

/** Vírgula vira ponto: o teclado do celular manda vírgula, e "2,5"
 *  viraria NaN em silêncio. Vazio é nulo -- "não informado" e "zero" são
 *  coisas diferentes aqui. */
function numeroOuNulo(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * SALVA A TELA INTEIRA, de uma vez.
 *
 * Um Salvar por indicador seriam treze botões numa grade do mesmo
 * assunto -- e é o padrão que o dono já apontou duas vezes no app.
 * Quem ajusta gatilho está calibrando o conjunto: mexe em dois ou três e
 * salva uma vez.
 *
 * Grava só o que TEM configuração. Indicador que a pessoa não tocou não
 * vira linha no banco: uma tabela cheia de gatilhos "no padrão" faria
 * parecer que treze indicadores estão vigiados quando nenhum está.
 */
export async function salvarGatilhos(formData: FormData) {
  await requireModulo("relato-anomalia", "editar");
  const revendaId = await exigirRevenda("/admin");
  const admin = createAdminClient();

  const paraGravar: {
    revenda_id: string;
    indicador: string;
    ativo: boolean;
    sigmas: number;
    limite_manual: number | null;
    minimo_pontos: number;
    observacao: string | null;
    atualizado_em: string;
  }[] = [];
  const paraApagar: string[] = [];

  for (const def of CATALOGO_DE_METAS) {
    if ((def.tipo ?? "meta") !== "meta") continue;

    const ativo = formData.get(`ativo__${def.chave}`) === "on";
    const sigmas = numeroOuNulo(formData.get(`sigmas__${def.chave}`)) ?? SIGMAS_PADRAO;
    const limiteManual = numeroOuNulo(formData.get(`limite__${def.chave}`));
    const minimo = numeroOuNulo(formData.get(`minimo__${def.chave}`)) ?? MINIMO_DE_PONTOS;
    const observacao = String(formData.get(`obs__${def.chave}`) ?? "").trim() || null;

    // Desligado e sem nada escrito = não existe gatilho. Apagar em vez de
    // guardar uma linha inerte mantém a tabela dizendo a verdade sobre o
    // que está vigiado.
    if (!ativo && limiteManual === null && !observacao) {
      paraApagar.push(def.chave);
      continue;
    }

    if (sigmas <= 0 || sigmas > 6) {
      erro(`${def.rotulo}: o multiplicador precisa ficar entre 0,1 e 6 desvios.`);
    }
    if (!Number.isInteger(minimo) || minimo < 2) {
      erro(`${def.rotulo}: o mínimo de medições precisa ser um número inteiro de 2 para cima.`);
    }

    paraGravar.push({
      revenda_id: revendaId,
      indicador: def.chave,
      ativo,
      sigmas,
      limite_manual: limiteManual,
      minimo_pontos: minimo,
      observacao,
      atualizado_em: new Date().toISOString(),
    });
  }

  if (paraGravar.length > 0) {
    const { error } = await admin
      .from("pa_gatilhos_anomalia")
      .upsert(paraGravar, { onConflict: "revenda_id,indicador" });
    if (error) erro(`Não foi possível salvar: ${error.message}`);
  }

  if (paraApagar.length > 0) {
    const { error } = await admin
      .from("pa_gatilhos_anomalia")
      .delete()
      .eq("revenda_id", revendaId)
      .in("indicador", paraApagar);
    if (error) erro(`Não foi possível limpar os desligados: ${error.message}`);
  }

  revalidatePath(ROTA);
  const ligados = paraGravar.filter((g) => g.ativo).length;
  redirect(
    `${ROTA}?sucesso=${encodeURIComponent(
      ligados === 0
        ? "Salvo. Nenhum indicador está com gatilho ligado."
        : `Salvo. ${ligados} indicador(es) com gatilho ligado.`,
    )}`,
  );
}

/**
 * O CHECKLIST DA BLITZ -- a tela inteira num Salvar só, como a de cima.
 *
 * O TEXTO É DO TIME OPERACIONAL, e é por isso que esta tela existe.
 * Pedido do dono (05/09/2026): "o check list eu faria com base realmente
 * na causa (...) tipo, estiva, não sei o que significa, veja lá o time
 * operacional". As treze perguntas semeadas na migration 100 são um ponto
 * de partida escrito na língua da doca -- quem confere carreta todo dia
 * corrige aqui, sem pedir deploy.
 *
 * DESATIVAR, E NÃO APAGAR: a resposta guarda o texto da pergunta, mas o
 * histórico de qual item existia quando é o que explica por que uma blitz
 * de março tem doze itens e a de hoje tem treze.
 */
export async function salvarChecklistDaBlitz(formData: FormData) {
  await requireModulo("relato-anomalia", "editar");
  const revendaId = await exigirRevenda("/admin");
  const admin = createAdminClient();

  const ids = formData.getAll("item_id").map(String);

  for (const id of ids) {
    const pergunta = String(formData.get(`pergunta__${id}`) ?? "").trim();
    if (!pergunta) {
      erro("Pergunta sem texto. Para tirar um item do checklist, desmarque o 'ativo'.");
    }
    const { error } = await admin
      .from("pa_blitz_itens")
      .update({
        pergunta,
        ajuda: String(formData.get(`ajuda__${id}`) ?? "").trim() || null,
        grupo: String(formData.get(`grupo__${id}`) ?? "").trim() || null,
        ordem: numeroOuNulo(formData.get(`ordem__${id}`)) ?? 0,
        ativo: formData.get(`ativo__item__${id}`) === "on",
      })
      .eq("id", id)
      .eq("revenda_id", revendaId);

    if (error) {
      if (error.code === "23505") erro(`Já existe uma pergunta com o texto "${pergunta}".`);
      erro(`Não foi possível salvar: ${error.message}`);
    }
  }

  // A pergunta nova vai no MESMO envio: quem está revisando o checklist
  // costuma corrigir dois textos e acrescentar um item na mesma sentada.
  const nova = String(formData.get("nova_pergunta") ?? "").trim();
  if (nova) {
    const { error } = await admin.from("pa_blitz_itens").insert({
      revenda_id: revendaId,
      pergunta: nova,
      ajuda: String(formData.get("nova_ajuda") ?? "").trim() || null,
      grupo: String(formData.get("novo_grupo") ?? "").trim() || null,
      ordem: numeroOuNulo(formData.get("nova_ordem")) ?? 99,
    });
    if (error) {
      if (error.code === "23505") erro(`Já existe uma pergunta com o texto "${nova}".`);
      erro(`Não foi possível cadastrar a pergunta nova: ${error.message}`);
    }
  }

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?sucesso=${encodeURIComponent(
      nova ? "Checklist salvo, com a pergunta nova." : "Checklist da blitz salvo.",
    )}`,
  );
}
