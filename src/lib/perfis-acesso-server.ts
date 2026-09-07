import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { chaveDaConcessao, type Concessao } from "@/lib/perfis-acesso";

/**
 * PROPAGAR O PERFIL -- salvar o molde libera o acesso para quem já o tem.
 *
 * Pedido do dono (07/09/2026): "ao acrescentar algo lá, após salvar ele
 * libera o acesso com base nesse perfil que alterei para as pessoas que já
 * estão nesse perfil". Antes o molde e as pessoas eram duas coisas
 * separadas: acrescentar uma permissão ao "Analista de Rota" não alcançava
 * nenhum analista, e quem salvava saía da tela achando que tinha
 * alcançado. Um perfil que não descreve quem o tem não é um perfil.
 *
 * SÓ ACRESCENTA, nunca retira -- e essa é a parte deliberada. Quem acumula
 * função (o analista que também administra o Jornal) perderia o Jornal
 * toda vez que alguém mexesse no molde, sem ter pedido nada. Desmarcar uma
 * permissão continua sendo assunto do espelhar, que lista nome por nome o
 * que vai sair antes de tirar.
 *
 * Por isso a contagem de `sobras` volta daqui: quem desmarcou algo precisa
 * ouvir que as pessoas continuam com aquilo, em vez de supor que salvar
 * resolveu.
 *
 * Alcança só ESTA revenda: o mesmo `revenda_id` está no vínculo e na
 * permissão, e um perfil pertence a uma revenda.
 */
export async function propagarPerfil(dados: {
  perfilId: string;
  revendaId: string;
  concessoes: Concessao[];
  quemAplicaId: string | null;
}): Promise<{ pessoas: number; acrescentadas: number; comSobra: number }> {
  const { perfilId, revendaId, concessoes, quemAplicaId } = dados;
  const admin = createAdminClient();
  const vazio = { pessoas: 0, acrescentadas: 0, comSobra: 0 };

  const { data: vinculos } = await admin
    .from("perfil_pessoas")
    .select("colaborador_id")
    .eq("perfil_id", perfilId)
    .eq("revenda_id", revendaId);

  const ids = [...new Set((vinculos ?? []).map((v) => v.colaborador_id as string))];
  if (ids.length === 0 || concessoes.length === 0) return vazio;

  // Uma consulta para todo mundo, não uma por pessoa: a lista de um perfil
  // grande passa fácil de vinte, e vinte idas ao banco dentro de um submit
  // é o tipo de lentidão que faz a pessoa clicar em salvar de novo.
  const { data: jaTem } = await admin
    .from("lideranca_permissoes")
    .select("colaborador_id, modulo, acao")
    .in("colaborador_id", ids)
    .eq("revenda_id", revendaId);

  const doPerfil = new Set(concessoes.map((c) => chaveDaConcessao(c.modulo, c.acao)));
  const porPessoa = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const p of jaTem ?? []) {
    porPessoa.get(p.colaborador_id as string)?.add(chaveDaConcessao(p.modulo, p.acao));
  }

  const novas: Concessao[] = [];
  const linhas = ids.flatMap((id) => {
    const tem = porPessoa.get(id) ?? new Set<string>();
    const faltando = concessoes.filter((c) => !tem.has(chaveDaConcessao(c.modulo, c.acao)));
    novas.push(...faltando);
    return faltando.map((c) => ({
      colaborador_id: id,
      revenda_id: revendaId,
      modulo: c.modulo,
      acao: c.acao,
      concedido_por: quemAplicaId,
    }));
  });

  const comSobra = ids.filter((id) =>
    [...(porPessoa.get(id) ?? [])].some((chave) => !doPerfil.has(chave)),
  ).length;

  if (linhas.length > 0) {
    const { error } = await admin
      .from("lideranca_permissoes")
      .upsert(linhas, { onConflict: "colaborador_id,revenda_id,modulo,acao" });
    // Sem exceção: o molde JÁ está salvo neste ponto. Estourar aqui
    // desfaria a tela inteira por causa da parte que dá para refazer
    // clicando em aplicar o perfil.
    if (error) return { pessoas: ids.length, acrescentadas: 0, comSobra };
  }

  // Sem o papel de liderança a concessão fica inerte -- `podeFazer` só a
  // consulta para esse papel. Quem é owner ou admin não é rebaixado.
  //
  // A escolha de quem promover é feita AQUI, e não num `.not("role","in",...)`
  // no banco: no PostgREST um `role` nulo não satisfaz um `not in`, e a
  // pessoa sem papel gravado -- justamente a que mais precisa -- ficaria de
  // fora em silêncio, com as permissões novas inertes.
  const { data: perfisAlvo } = await admin.from("profiles").select("id, role").in("id", ids);
  const promover = (perfisAlvo ?? [])
    .filter((p) => !["owner", "admin", "lideranca"].includes(p.role as string))
    .map((p) => p.id as string);
  if (promover.length > 0) {
    await admin.from("profiles").update({ role: "lideranca" }).in("id", promover);
  }

  return { pessoas: ids.length, acrescentadas: novas.length, comSobra };
}

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
