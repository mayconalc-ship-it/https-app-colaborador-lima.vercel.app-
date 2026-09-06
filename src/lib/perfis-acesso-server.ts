import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Concessao } from "@/lib/perfis-acesso";

/**
 * APLICAR UM PERFIL A UMA PESSOA -- a operação, num lugar só.
 *
 * Morava dentro da ação da tela de Perfis. Passou a morar aqui em
 * 06/09/2026, quando a tela de Acessos por Pessoa passou a oferecer o
 * "voltar ao molde": a parte que REMOVE permissão não pode existir em
 * duas cópias. Duas cópias divergem, e a que diverge aqui tira acesso de
 * alguém sem ninguém ter pedido.
 *
 * SOMAR acrescenta e não tira nada. ESPELHAR deixa a pessoa igual ao
 * perfil -- acrescenta o que falta e retira o que sobra. Os dois existem
 * porque nenhum serve sempre: quem acumula funções (o supervisor que
 * também administra o Jornal) precisa do somar, e é justamente essa
 * pessoa que o espelhar prejudicaria em silêncio.
 *
 * O que o espelhar NUNCA toca: as permissões das OUTRAS revendas (a
 * `revenda_id` está nos dois lados da conta) e o papel de quem é owner.
 */
export async function aplicarPerfilA(dados: {
  perfilId: string;
  colaboradorId: string;
  revendaId: string;
  espelhar: boolean;
  quemAplicaId: string | null;
}): Promise<
  | { ok: true; nome: string; concessoes: number; retiradas: number }
  | { ok: false; erro: string; parcial?: boolean }
> {
  const { perfilId, colaboradorId, revendaId, espelhar, quemAplicaId } = dados;
  const admin = createAdminClient();

  const [{ data: doPerfil }, { data: alvo }, { data: jaTem }] = await Promise.all([
    admin.from("perfil_permissoes").select("modulo, acao").eq("perfil_id", perfilId),
    admin.from("profiles").select("id, nome, role").eq("id", colaboradorId).maybeSingle(),
    admin
      .from("lideranca_permissoes")
      .select("modulo, acao")
      .eq("colaborador_id", colaboradorId)
      .eq("revenda_id", revendaId),
  ]);

  const concessoes = (doPerfil ?? []) as Concessao[];
  if (concessoes.length === 0) return { ok: false, erro: "Este perfil não tem nenhuma permissão." };
  if (!alvo) return { ok: false, erro: "Pessoa não encontrada." };

  // O que a pessoa tem e o perfil não tem. Só isto sai, e só no espelhar.
  const noPerfil = new Set(concessoes.map((c) => `${c.modulo}:${c.acao}`));
  const sobrando = ((jaTem ?? []) as Concessao[]).filter(
    (c) => !noPerfil.has(`${c.modulo}:${c.acao}`),
  );

  // A `revenda_id` vai escrita e vai no onConflict. As duas coisas pela
  // mesma razão: a chave de lideranca_permissoes deixou de ser
  // (colaborador, modulo, acao) na migration 021 e passou a ser
  // (colaborador, REVENDA, modulo, acao) -- justamente para a mesma
  // pessoa poder ter acessos diferentes em São Félix e em Barreiras.
  const { error } = await admin.from("lideranca_permissoes").upsert(
    concessoes.map((c) => ({
      colaborador_id: colaboradorId,
      revenda_id: revendaId,
      modulo: c.modulo,
      acao: c.acao,
      concedido_por: quemAplicaId,
    })),
    { onConflict: "colaborador_id,revenda_id,modulo,acao" },
  );
  if (error) return { ok: false, erro: `Não foi possível aplicar: ${error.message}` };

  // A retirada vem DEPOIS de gravar o perfil, nunca antes. Se a ordem
  // fosse a inversa e a gravação falhasse no meio, a pessoa ficaria com
  // menos acesso do que tinha antes de alguém clicar em nada.
  let retiradas = 0;
  if (espelhar && sobrando.length > 0) {
    const { error: erroTirar } = await admin
      .from("lideranca_permissoes")
      .delete()
      .eq("colaborador_id", colaboradorId)
      .eq("revenda_id", revendaId)
      .or(sobrando.map((c) => `and(modulo.eq.${c.modulo},acao.eq.${c.acao})`).join(","));
    if (erroTirar) {
      return {
        ok: false,
        parcial: true,
        erro: `As permissões do perfil foram gravadas, mas não consegui retirar as que sobravam: ${erroTirar.message}`,
      };
    }
    retiradas = sobrando.length;
  }

  // Sem o papel de liderança as concessões ficam inertes: podeFazer só as
  // consulta para esse papel. Owner nunca é rebaixado.
  if (alvo.role !== "owner" && alvo.role !== "admin" && alvo.role !== "lideranca") {
    await admin.from("profiles").update({ role: "lideranca" }).eq("id", colaboradorId);
  }

  // O vínculo é o que as duas telas mostram. Fica gravado, com data e
  // autor, em vez de ser deduzido de quem "tem todas as permissões" --
  // dedução que colocava todo administrador dentro de todo perfil pequeno
  // (ver migration 091).
  await admin.from("perfil_pessoas").upsert(
    {
      perfil_id: perfilId,
      colaborador_id: colaboradorId,
      revenda_id: revendaId,
      aplicado_por: quemAplicaId,
    },
    { onConflict: "perfil_id,colaborador_id" },
  );

  return { ok: true, nome: alvo.nome ?? "", concessoes: concessoes.length, retiradas };
}
