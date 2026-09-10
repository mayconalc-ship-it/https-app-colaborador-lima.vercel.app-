import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { MODULOS_OPCIONAIS } from "@/lib/acessos";
import { chaveDaConcessao, type Concessao } from "@/lib/perfis-acesso";

/**
 * OS DOIS TIPOS DE PERFIL (migration 111, 10/09/2026).
 *
 * Defeito GRAVE relatado pelo dono: um perfil "Motorista", montado para
 * dizer o que o motorista vê no app, promoveu o motorista a LIDERANÇA ao
 * ser aplicado. O perfil só sabia gravar permissão de Modo Liderança, e
 * aplicar promovia a pessoa em silêncio -- sem o papel, as permissões
 * ficam inertes.
 *
 *   colaborador -- os módulos que a pessoa VÊ NO APP. Grava em
 *                  `colaborador_modulos_extra`. NUNCA muda o papel e nunca
 *                  toca em `lideranca_permissoes`.
 *   lideranca   -- o que a pessoa vê, cria, edita e exclui no Modo
 *                  Liderança. Promover um colaborador exige
 *                  `tornarLideranca`, que só vem de uma caixa marcada por
 *                  quem aplica. Nada promove em silêncio -- nem aplicar,
 *                  nem salvar o molde.
 */
export type TipoDePerfil = "lideranca" | "colaborador";

/**
 * O tipo do perfil, lido do banco. Sem a migration 111 a coluna não
 * existe e a leitura falha -- e aí vale "lideranca", que é o lado SEGURO:
 * é o tipo que exige confirmação para promover.
 */
export async function tipoDoPerfil(perfilId: string): Promise<TipoDePerfil> {
  const admin = createAdminClient();
  const { data } = await admin.from("perfis_acesso").select("tipo").eq("id", perfilId).maybeSingle();
  return data?.tipo === "colaborador" ? "colaborador" : "lideranca";
}

const ehModuloDoApp = (m: string) => (MODULOS_OPCIONAIS as readonly string[]).includes(m);

/**
 * O que os OUTROS perfis de LIDERANÇA de cada pessoa concedem, nesta
 * revenda.
 *
 * É o escudo da retirada: perfil que salva não derruba o que outro perfil
 * sustenta. Sem isso, dois perfis na mesma pessoa se anulariam a cada
 * salvar, e quem acumula função ficaria oscilando entre um cargo e outro.
 * (Perfil de colaborador não tem linha em `perfil_permissoes`, então não
 * entra aqui por construção.)
 */
export async function concessoesDosOutrosPerfis(
  colaboradorIds: string[],
  revendaId: string,
  perfilIgnorado: string,
): Promise<Map<string, Set<string>>> {
  const admin = createAdminClient();
  const saida = new Map<string, Set<string>>();
  if (colaboradorIds.length === 0) return saida;

  const { data: vinculos } = await admin
    .from("perfil_pessoas")
    .select("perfil_id, colaborador_id")
    .in("colaborador_id", colaboradorIds)
    .eq("revenda_id", revendaId)
    .neq("perfil_id", perfilIgnorado);

  const outros = [...new Set((vinculos ?? []).map((v) => v.perfil_id as string))];
  if (outros.length === 0) return saida;

  const { data: perms } = await admin
    .from("perfil_permissoes")
    .select("perfil_id, modulo, acao")
    .in("perfil_id", outros);

  const doPerfil = new Map<string, string[]>();
  for (const p of perms ?? []) {
    const chave = chaveDaConcessao(p.modulo as string, p.acao as string);
    doPerfil.set(p.perfil_id as string, [...(doPerfil.get(p.perfil_id as string) ?? []), chave]);
  }

  for (const v of vinculos ?? []) {
    const id = v.colaborador_id as string;
    const atual = saida.get(id) ?? new Set<string>();
    for (const chave of doPerfil.get(v.perfil_id as string) ?? []) atual.add(chave);
    saida.set(id, atual);
  }
  return saida;
}

/** O mesmo escudo, para os módulos do app dos OUTROS perfis de
 *  colaborador da pessoa. */
export async function modulosDosOutrosPerfis(
  colaboradorIds: string[],
  revendaId: string,
  perfilIgnorado: string,
): Promise<Map<string, Set<string>>> {
  const admin = createAdminClient();
  const saida = new Map<string, Set<string>>();
  if (colaboradorIds.length === 0) return saida;

  const { data: vinculos } = await admin
    .from("perfil_pessoas")
    .select("perfil_id, colaborador_id")
    .in("colaborador_id", colaboradorIds)
    .eq("revenda_id", revendaId)
    .neq("perfil_id", perfilIgnorado);

  const outros = [...new Set((vinculos ?? []).map((v) => v.perfil_id as string))];
  if (outros.length === 0) return saida;

  const { data: mods } = await admin
    .from("perfil_modulos_app")
    .select("perfil_id, modulo")
    .in("perfil_id", outros);

  const doPerfil = new Map<string, string[]>();
  for (const m of mods ?? []) {
    doPerfil.set(m.perfil_id as string, [...(doPerfil.get(m.perfil_id as string) ?? []), m.modulo as string]);
  }
  for (const v of vinculos ?? []) {
    const id = v.colaborador_id as string;
    const atual = saida.get(id) ?? new Set<string>();
    for (const m of doPerfil.get(v.perfil_id as string) ?? []) atual.add(m);
    saida.set(id, atual);
  }
  return saida;
}

export type AlcanceDoPerfil = {
  pessoas: number;
  acrescentadas: number;
  retiradas: number;
  /** Quem perdeu algo, para a mensagem dizer nome em vez de só número. */
  perderam: string[];
};

/**
 * PROPAGAR O PERFIL -- salvar o molde alcança quem já o tem.
 *
 * Pedido do dono (07/09/2026): salvar libera o que entrou e retira o que
 * saiu, para as pessoas que já estão no perfil. Os outros perfis da pessoa
 * são intocáveis (o escudo), e sai só a concessão solta.
 *
 * SALVAR NUNCA PROMOVE (10/09/2026). A versão anterior promovia a
 * liderança todo mundo da lista que ainda não fosse -- e isso transformava
 * editar um molde num jeito de dar Modo Liderança a alguém sem ninguém
 * ver. Quem está num perfil de liderança e é colaborador recebe as
 * permissões gravadas, mas elas ficam inertes até alguém promover a pessoa
 * DE PROPÓSITO, aplicando o perfil com a confirmação.
 */
export async function propagarPerfil(dados: {
  perfilId: string;
  revendaId: string;
  tipo: TipoDePerfil;
  concessoes: Concessao[];
  modulosApp: string[];
  quemAplicaId: string | null;
}): Promise<AlcanceDoPerfil> {
  return dados.tipo === "colaborador"
    ? propagarModulos(dados.perfilId, dados.revendaId, dados.modulosApp, dados.quemAplicaId)
    : propagarConcessoes(dados.perfilId, dados.revendaId, dados.concessoes, dados.quemAplicaId);
}

async function idsDoPerfil(perfilId: string, revendaId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("perfil_pessoas")
    .select("colaborador_id")
    .eq("perfil_id", perfilId)
    .eq("revenda_id", revendaId);
  return [...new Set((data ?? []).map((v) => v.colaborador_id as string))];
}

async function nomesDe(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("id, nome").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id as string, (p.nome as string) ?? ""]));
}

async function propagarConcessoes(
  perfilId: string,
  revendaId: string,
  concessoes: Concessao[],
  quemAplicaId: string | null,
): Promise<AlcanceDoPerfil> {
  const admin = createAdminClient();
  const vazio: AlcanceDoPerfil = { pessoas: 0, acrescentadas: 0, retiradas: 0, perderam: [] };
  const ids = await idsDoPerfil(perfilId, revendaId);
  if (ids.length === 0 || concessoes.length === 0) return vazio;

  // Uma consulta para todo mundo, não uma por pessoa.
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

  let acrescentadas = 0;
  const linhas = ids.flatMap((id) => {
    const tem = porPessoa.get(id) ?? new Set<string>();
    const faltando = concessoes.filter((c) => !tem.has(chaveDaConcessao(c.modulo, c.acao)));
    acrescentadas += faltando.length;
    return faltando.map((c) => ({
      colaborador_id: id,
      revenda_id: revendaId,
      modulo: c.modulo,
      acao: c.acao,
      concedido_por: quemAplicaId,
    }));
  });

  const protegido = await concessoesDosOutrosPerfis(ids, revendaId, perfilId);
  const sobrando = new Map<string, string[]>();
  for (const id of ids) {
    const escudo = protegido.get(id) ?? new Set<string>();
    const fora = [...(porPessoa.get(id) ?? [])].filter((ch) => !doPerfil.has(ch) && !escudo.has(ch));
    if (fora.length > 0) sobrando.set(id, fora);
  }
  const retiradas = [...sobrando.values()].reduce((s, l) => s + l.length, 0);

  if (linhas.length > 0) {
    const { error } = await admin
      .from("lideranca_permissoes")
      .upsert(linhas, { onConflict: "colaborador_id,revenda_id,modulo,acao" });
    if (error) return { ...vazio, pessoas: ids.length };
  }

  // A retirada vem DEPOIS de gravar o que entra, nunca antes.
  const perderam: string[] = [];
  for (const [id, fora] of sobrando) {
    const { error } = await admin
      .from("lideranca_permissoes")
      .delete()
      .eq("colaborador_id", id)
      .eq("revenda_id", revendaId)
      .or(
        fora
          .map((ch) => {
            const corte = ch.lastIndexOf(":");
            return `and(modulo.eq.${ch.slice(0, corte)},acao.eq.${ch.slice(corte + 1)})`;
          })
          .join(","),
      );
    if (!error) perderam.push(id);
  }

  const nome = await nomesDe(perderam);
  return {
    pessoas: ids.length,
    acrescentadas,
    retiradas,
    perderam: perderam.map((id) => nome.get(id) || "sem nome"),
  };
}

async function propagarModulos(
  perfilId: string,
  revendaId: string,
  modulosApp: string[],
  quemAplicaId: string | null,
): Promise<AlcanceDoPerfil> {
  const admin = createAdminClient();
  const vazio: AlcanceDoPerfil = { pessoas: 0, acrescentadas: 0, retiradas: 0, perderam: [] };
  const modulos = modulosApp.filter(ehModuloDoApp);
  const ids = await idsDoPerfil(perfilId, revendaId);
  if (ids.length === 0 || modulos.length === 0) return vazio;

  const { data: jaTem } = await admin
    .from("colaborador_modulos_extra")
    .select("colaborador_id, modulo")
    .in("colaborador_id", ids)
    .eq("revenda_id", revendaId);

  const porPessoa = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const m of jaTem ?? []) porPessoa.get(m.colaborador_id as string)?.add(m.modulo as string);

  const doPerfil = new Set(modulos);
  let acrescentadas = 0;
  const linhas = ids.flatMap((id) => {
    const faltando = modulos.filter((m) => !(porPessoa.get(id) ?? new Set()).has(m));
    acrescentadas += faltando.length;
    return faltando.map((modulo) => ({
      colaborador_id: id,
      revenda_id: revendaId,
      modulo,
      liberado_por: quemAplicaId,
    }));
  });

  const escudos = await modulosDosOutrosPerfis(ids, revendaId, perfilId);
  const sobrando = new Map<string, string[]>();
  for (const id of ids) {
    const escudo = escudos.get(id) ?? new Set<string>();
    const fora = [...(porPessoa.get(id) ?? [])].filter((m) => !doPerfil.has(m) && !escudo.has(m));
    if (fora.length > 0) sobrando.set(id, fora);
  }
  const retiradas = [...sobrando.values()].reduce((s, l) => s + l.length, 0);

  if (linhas.length > 0) {
    const { error } = await admin
      .from("colaborador_modulos_extra")
      .upsert(linhas, { onConflict: "colaborador_id,revenda_id,modulo" });
    if (error) return { ...vazio, pessoas: ids.length };
  }

  const perderam: string[] = [];
  for (const [id, fora] of sobrando) {
    const { error } = await admin
      .from("colaborador_modulos_extra")
      .delete()
      .eq("colaborador_id", id)
      .eq("revenda_id", revendaId)
      .in("modulo", fora);
    if (!error) perderam.push(id);
  }

  const nome = await nomesDe(perderam);
  return {
    pessoas: ids.length,
    acrescentadas,
    retiradas,
    perderam: perderam.map((id) => nome.get(id) || "sem nome"),
  };
}

export type ResultadoAplicar =
  | {
      ok: true;
      nome: string;
      tipo: TipoDePerfil;
      /** Permissões (liderança) ou módulos do app (colaborador). */
      concessoes: number;
      retiradas: number;
      /** A pessoa passou de colaborador a liderança nesta aplicação. */
      promovido: boolean;
    }
  | { ok: false; erro: string; parcial?: boolean; precisaConfirmarLideranca?: boolean };

/**
 * APLICAR UM PERFIL A UMA PESSOA -- a operação, num lugar só.
 *
 * Usada pela tela de Perfis e pela ficha em Acessos por Pessoa ("voltar ao
 * molde"): a parte que REMOVE acesso não pode existir em duas cópias.
 *
 * SOMAR acrescenta e não tira nada. ESPELHAR deixa a pessoa igual ao
 * perfil. O espelhar nunca toca outras revendas, nem o que os outros
 * perfis da pessoa sustentam.
 *
 * O PAPEL SÓ MUDA COM CONFIRMAÇÃO (10/09/2026). Perfil de colaborador
 * nunca mexe no papel. Perfil de liderança aplicado a um colaborador é
 * RECUSADO sem `tornarLideranca` -- e a recusa acontece ANTES de gravar
 * qualquer coisa, para não sobrar permissão pendurada numa pessoa que não
 * foi promovida.
 */
export async function aplicarPerfilA(dados: {
  perfilId: string;
  colaboradorId: string;
  revendaId: string;
  espelhar: boolean;
  quemAplicaId: string | null;
  tornarLideranca?: boolean;
}): Promise<ResultadoAplicar> {
  const tipo = await tipoDoPerfil(dados.perfilId);
  return tipo === "colaborador" ? aplicarModulos(dados) : aplicarConcessoes(dados);
}

async function registrarVinculo(
  perfilId: string,
  colaboradorId: string,
  revendaId: string,
  quemAplicaId: string | null,
) {
  const admin = createAdminClient();
  // O vínculo é o que as duas telas mostram. Fica gravado, com data e
  // autor, em vez de ser deduzido de quem "tem todas as permissões"
  // (ver migration 091).
  await admin.from("perfil_pessoas").upsert(
    { perfil_id: perfilId, colaborador_id: colaboradorId, revenda_id: revendaId, aplicado_por: quemAplicaId },
    { onConflict: "perfil_id,colaborador_id" },
  );
}

async function aplicarConcessoes(dados: {
  perfilId: string;
  colaboradorId: string;
  revendaId: string;
  espelhar: boolean;
  quemAplicaId: string | null;
  tornarLideranca?: boolean;
}): Promise<ResultadoAplicar> {
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

  const jaEhGestao = ["owner", "admin", "lideranca"].includes(alvo.role as string);
  if (!jaEhGestao && !dados.tornarLideranca) {
    return {
      ok: false,
      precisaConfirmarLideranca: true,
      erro:
        `${alvo.nome} é colaborador, e este é um perfil de LIDERANÇA: aplicá-lo faz a pessoa entrar ` +
        `no Modo Liderança. Nada foi gravado. Se é isso mesmo, marque a confirmação; se a ideia era ` +
        `liberar módulos do app, use um perfil do tipo Colaborador.`,
    };
  }

  const noPerfil = new Set(concessoes.map((c) => `${c.modulo}:${c.acao}`));
  const sobrando = ((jaTem ?? []) as Concessao[]).filter((c) => !noPerfil.has(`${c.modulo}:${c.acao}`));

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

  // Só chega aqui um colaborador com a confirmação marcada.
  let promovido = false;
  if (!jaEhGestao) {
    await admin.from("profiles").update({ role: "lideranca" }).eq("id", colaboradorId);
    promovido = true;
  }

  await registrarVinculo(perfilId, colaboradorId, revendaId, quemAplicaId);
  return { ok: true, nome: alvo.nome ?? "", tipo: "lideranca", concessoes: concessoes.length, retiradas, promovido };
}

async function aplicarModulos(dados: {
  perfilId: string;
  colaboradorId: string;
  revendaId: string;
  espelhar: boolean;
  quemAplicaId: string | null;
}): Promise<ResultadoAplicar> {
  const { perfilId, colaboradorId, revendaId, espelhar, quemAplicaId } = dados;
  const admin = createAdminClient();

  const [{ data: doPerfil }, { data: alvo }, { data: jaTem }] = await Promise.all([
    admin.from("perfil_modulos_app").select("modulo").eq("perfil_id", perfilId),
    admin.from("profiles").select("id, nome").eq("id", colaboradorId).maybeSingle(),
    admin
      .from("colaborador_modulos_extra")
      .select("modulo")
      .eq("colaborador_id", colaboradorId)
      .eq("revenda_id", revendaId),
  ]);

  const modulos = (doPerfil ?? []).map((m) => m.modulo as string).filter(ehModuloDoApp);
  if (modulos.length === 0) return { ok: false, erro: "Este perfil não tem nenhum módulo do app." };
  if (!alvo) return { ok: false, erro: "Pessoa não encontrada." };

  const { error } = await admin.from("colaborador_modulos_extra").upsert(
    modulos.map((modulo) => ({
      colaborador_id: colaboradorId,
      revenda_id: revendaId,
      modulo,
      liberado_por: quemAplicaId,
    })),
    { onConflict: "colaborador_id,revenda_id,modulo" },
  );
  if (error) return { ok: false, erro: `Não foi possível aplicar: ${error.message}` };

  let retiradas = 0;
  if (espelhar) {
    const escudo = (await modulosDosOutrosPerfis([colaboradorId], revendaId, perfilId)).get(colaboradorId) ?? new Set();
    const noPerfil = new Set(modulos);
    const sobrando = (jaTem ?? [])
      .map((m) => m.modulo as string)
      .filter((m) => !noPerfil.has(m) && !escudo.has(m));
    if (sobrando.length > 0) {
      const { error: erroTirar } = await admin
        .from("colaborador_modulos_extra")
        .delete()
        .eq("colaborador_id", colaboradorId)
        .eq("revenda_id", revendaId)
        .in("modulo", sobrando);
      if (erroTirar) {
        return {
          ok: false,
          parcial: true,
          erro: `Os módulos do perfil foram liberados, mas não consegui retirar os que sobravam: ${erroTirar.message}`,
        };
      }
      retiradas = sobrando.length;
    }
  }

  // PERFIL DE COLABORADOR NÃO TOCA NO PAPEL -- é a linha que o defeito de
  // 10/09/2026 exigia. Nem update, nem leitura do papel para decidir nada.
  await registrarVinculo(perfilId, colaboradorId, revendaId, quemAplicaId);
  return { ok: true, nome: alvo.nome ?? "", tipo: "colaborador", concessoes: modulos.length, retiradas, promovido: false };
}
