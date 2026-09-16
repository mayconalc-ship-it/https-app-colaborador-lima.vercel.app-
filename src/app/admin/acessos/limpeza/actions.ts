"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirGestaoDeAcessos, gerenciaAcessos } from "@/lib/gestao-de-acessos-server";
import { lerLimpezaDeAcessos } from "@/lib/limpeza-de-acessos-server";
import { moduloPorId } from "@/lib/acessos";

function voltar(chave: "erro" | "sucesso", mensagem: string, revenda: string): never {
  const params = new URLSearchParams({ [chave]: mensagem });
  if (revenda) params.set("revenda", revenda);
  redirect(`/admin/acessos/limpeza?${params.toString()}`);
}

/**
 * RETIRA AS LIBERAÇÕES MARCADAS NA LIMPEZA.
 *
 * As mesmas travas de "Módulos e análises" (liberarAcessosEmLote): quem
 * gerencia os acessos DESTA revenda, com "editar"; ninguém mexe nos
 * próprios módulos; e quem não é o Admin não mexe em quem também gerencia
 * acessos.
 *
 * E uma trava a mais, que é a razão desta ação não reaproveitar a grade: só
 * sai o que CONTINUA sem uso agora. O formulário é do navegador -- e entre
 * abrir a tela e clicar a pessoa pode ter usado o módulo. O relatório é
 * relido aqui, na mesma conta da tela.
 */
export async function retirarAcessosSemUso(formData: FormData) {
  const revendaId = String(formData.get("revenda") ?? "");
  const { eu, dono } = await exigirGestaoDeAcessos(revendaId, "editar", (m) => voltar("erro", m, revendaId));

  const marcados = new Set(formData.getAll("marcado").map(String));
  if (marcados.size === 0) voltar("erro", "Marque pelo menos uma liberação para retirar.", revendaId);

  const { semUso, pessoas } = await lerLimpezaDeAcessos(revendaId);
  const validos = semUso.filter((l) => marcados.has(`${l.colaboradorId}:${l.modulo}`) && l.colaboradorId !== eu.id);

  const porPessoa = new Map<string, string[]>();
  for (const l of validos) {
    if (!dono && (await gerenciaAcessos(l.colaboradorId))) continue;
    porPessoa.set(l.colaboradorId, [...(porPessoa.get(l.colaboradorId) ?? []), l.modulo]);
  }
  if (porPessoa.size === 0) {
    voltar("erro", "Nenhuma das liberações marcadas pode ser retirada — elas foram usadas ou estão fora do que você gerencia.", revendaId);
  }

  const admin = createAdminClient();
  const { data: revenda } = await admin.from("revendas").select("nome").eq("id", revendaId).maybeSingle();

  let total = 0;
  for (const [colaboradorId, modulos] of porPessoa) {
    const { error } = await admin
      .from("colaborador_modulos_extra")
      .delete()
      .eq("colaborador_id", colaboradorId)
      .eq("revenda_id", revendaId)
      .in("modulo", modulos);
    if (error) voltar("erro", `Não foi possível retirar: ${error.message}`, revendaId);
    total += modulos.length;

    // Toda mudança de acesso fica registrada. Sem exceção.
    await admin.from("auditoria").insert({
      ator_id: eu.id,
      ator_nome: eu.nome,
      acao: "Retirou acessos sem uso",
      alvo_id: colaboradorId,
      alvo_nome: pessoas.get(colaboradorId)?.nome ?? colaboradorId,
      detalhes: `${revenda?.nome ?? "Revenda"} — Limpeza de acessos (sem uso há 30+ dias): ${modulos
        .map((m) => moduloPorId(m)?.rotulo ?? m)
        .join(", ")}`,
      revenda_id: revendaId,
    });
  }

  const ignorados = marcados.size - total;
  voltar(
    "sucesso",
    `${total} liberação(ões) retirada(s) de ${porPessoa.size} pessoa(s).` +
      (ignorados > 0 ? ` ${ignorados} ficaram como estavam (foram usadas ou estão fora do que você gerencia).` : ""),
    revendaId,
  );
}
