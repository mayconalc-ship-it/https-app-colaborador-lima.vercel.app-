"use server";

import { redirect } from "next/navigation";
import { exigirGestaoDeAcessos, gerenciaAcessos, permissoesNaRevenda } from "@/lib/gestao-de-acessos-server";
import { mesclarNoAlcance } from "@/lib/gestao-de-acessos";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ehAcaoValida,
  ehModuloValido,
  moduloPorId,
  MODULOS,
  MODULOS_OPCIONAIS,
  type ModuloId,
} from "@/lib/acessos";
import { MODULOS_COM_ANALISE, PAINEIS } from "@/lib/gestao";
import { aplicarPerfilA } from "@/lib/perfis-acesso-server";

function voltar(
  chave: "erro" | "sucesso",
  mensagem: string,
  revenda?: string,
  aba?: "modulos",
): never {
  const params = new URLSearchParams({ [chave]: mensagem });
  // Volta para a mesma revenda que estava sendo configurada. Sem isso, a
  // tela pularia para outra unidade depois de salvar e a próxima alteração
  // sairia no lugar errado.
  if (revenda) params.set("revenda", revenda);
  // E para a mesma ABA (06/09/2026): quem liberou numa grade quer conferir
  // a grade, não ser jogado na lista de fichas.
  if (aba) params.set("aba", aba);
  redirect(`/admin/acessos?${params.toString()}`);
}

/** Toda mudança de acesso fica registrada. Sem exceção. */
async function registrar(dados: {
  atorId: string;
  atorNome: string;
  acao: string;
  alvoId?: string;
  alvoNome?: string;
  detalhes?: string;
  revendaId?: string;
}) {
  const admin = createAdminClient();
  await admin.from("auditoria").insert({
    ator_id: dados.atorId,
    ator_nome: dados.atorNome,
    acao: dados.acao,
    alvo_id: dados.alvoId ?? null,
    alvo_nome: dados.alvoNome ?? null,
    detalhes: dados.detalhes ?? null,
    revenda_id: dados.revendaId ?? null,
  });
}

async function nomeDe(id: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("nome, role")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/**
 * Promove a liderança ou devolve para colaborador.
 *
 * O Admin, ou a liderança que gerencia os acessos DESTA revenda
 * (11/09/2026). Travas de sempre: ninguém mexe no próprio nível, e ninguém
 * vira dono por esta porta -- o dono é único e definido no banco. E para
 * quem não é o Admin, mais três (logo abaixo).
 */
export async function definirPapel(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const papel = (formData.get("papel") as string) || "";
  const revendaId = (formData.get("revenda") as string) || "";
  const { eu, dono } = await exigirGestaoDeAcessos(revendaId, "editar", (m) => voltar("erro", m, revendaId));

  if (!id) voltar("erro", "Colaborador inválido.", revendaId);
  if (papel !== "lideranca" && papel !== "colaborador") {
    voltar("erro", "Só é possível definir Liderança ou Colaborador aqui.", revendaId);
  }
  if (id === eu.id) {
    voltar("erro", "Você não pode alterar o seu próprio nível de acesso.", revendaId);
  }

  const alvo = await nomeDe(id);
  if (!alvo) voltar("erro", "Colaborador não encontrado.", revendaId);
  if (alvo.role === "owner") {
    voltar("erro", "O dono do app não pode ser rebaixado por aqui.", revendaId);
  }

  if (!dono) {
    const adminDaTrava = createAdminClient();
    // 1. Só gente desta revenda.
    const { data: vinculo } = await adminDaTrava
      .from("colaborador_revendas")
      .select("revenda_id")
      .eq("colaborador_id", id)
      .eq("revenda_id", revendaId)
      .maybeSingle();
    if (!vinculo) voltar("erro", `${alvo.nome} não está vinculado a esta revenda.`, revendaId);
    // 2. Quem gerencia não mexe em quem gerencia.
    if (await gerenciaAcessos(id)) {
      voltar("erro", `${alvo.nome} também gerencia acessos: só o Admin muda o papel dessa pessoa.`, revendaId);
    }
    // 3. Rebaixar tira as permissões de TODAS as revendas -- e a liderança
    //    só responde por esta.
    if (papel === "colaborador") {
      const { count } = await adminDaTrava
        .from("lideranca_permissoes")
        .select("*", { count: "exact", head: true })
        .eq("colaborador_id", id)
        .neq("revenda_id", revendaId);
      if (count) {
        voltar(
          "erro",
          `${alvo.nome} tem permissões em outra revenda, e rebaixar tiraria todas elas. Só o Admin faz isso.`,
          revendaId,
        );
      }
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role: papel })
    .eq("id", id);

  if (error) voltar("erro", error.message, revendaId);

  // Ao rebaixar, as permissões vão junto -- de TODAS as revendas, não só da
  // que está aberta: quem deixa de ser liderança deixa de ser em todo lugar.
  if (papel === "colaborador") {
    await admin.from("lideranca_permissoes").delete().eq("colaborador_id", id);
  }

  await registrar({
    atorId: eu.id,
    atorNome: eu.nome,
    acao: papel === "lideranca" ? "Promoveu a liderança" : "Removeu a liderança",
    alvoId: id,
    alvoNome: alvo.nome,
    revendaId: revendaId || undefined,
  });

  voltar(
    "sucesso",
    papel === "lideranca"
      ? `${alvo.nome} agora é liderança. Libere os módulos abaixo.`
      : `${alvo.nome} voltou a ser colaborador e perdeu as permissões de todas as revendas.`,
    revendaId,
  );
}

/**
 * Aplica em lote as marcações da tabela de módulos opcionais: a pessoa
 * marca/desmarca vários quadradinhos à vontade e só quando aperta
 * "Liberar acesso" é que qualquer coisa é gravada -- antes disso, nada
 * muda no banco (substitui o antigo alternarModuloExtra, que salvava a
 * cada clique).
 *
 * `universo` carrega TODO par pessoa:módulo que apareceu na tabela (um
 * hidden por célula, marcada ou não) -- é como a ação sabe distinguir
 * "não mandou porque não apareceu na tela" (não mexe) de "não mandou
 * porque desmarcou" (revoga). `marcado` só traz os pares que ficaram
 * marcados no momento do envio.
 *
 * Descobre o estado atual antes de gravar e só grava/loga quem de fato
 * mudou -- não teria sentido registrar auditoria pra 160 pessoas quando
 * só 2 tiveram algo alterado de verdade.
 */
export async function liberarAcessosEmLote(formData: FormData) {
  const revendaId = (formData.get("revenda") as string) || "";
  const { eu, dono } = await exigirGestaoDeAcessos(revendaId, "editar", (m) =>
    voltar("erro", m, revendaId, "modulos"),
  );

  const universoPorPessoa = new Map<string, Set<string>>();
  for (const par of formData.getAll("universo").map(String)) {
    const [id, modulo] = par.split(":");
    if (!id || !MODULOS_OPCIONAIS.includes(modulo as (typeof MODULOS_OPCIONAIS)[number])) continue;
    if (!universoPorPessoa.has(id)) universoPorPessoa.set(id, new Set());
    universoPorPessoa.get(id)!.add(modulo);
  }
  // Ninguém mexe nos próprios módulos por aqui. E quem não é o Admin só
  // mexe em gente desta revenda -- a tela só mostra essas, mas o
  // formulário é do navegador de quem envia (11/09/2026).
  universoPorPessoa.delete(eu.id);
  const admin = createAdminClient();
  if (!dono && universoPorPessoa.size > 0) {
    const { data: vinculados } = await admin
      .from("colaborador_revendas")
      .select("colaborador_id")
      .eq("revenda_id", revendaId)
      .in("colaborador_id", [...universoPorPessoa.keys()]);
    const daqui = new Set((vinculados ?? []).map((v) => v.colaborador_id));
    for (const id of [...universoPorPessoa.keys()]) if (!daqui.has(id)) universoPorPessoa.delete(id);
  }
  if (universoPorPessoa.size === 0) {
    voltar("erro", "Nenhuma alteração para aplicar.", revendaId, "modulos");
  }

  const marcados = new Set(formData.getAll("marcado").map(String));

  const { data: atuais } = await admin
    .from("colaborador_modulos_extra")
    .select("colaborador_id, modulo")
    .eq("revenda_id", revendaId)
    .in("colaborador_id", [...universoPorPessoa.keys()]);

  const atuaisPorPessoa = new Map<string, Set<string>>();
  for (const a of atuais ?? []) {
    if (!atuaisPorPessoa.has(a.colaborador_id)) atuaisPorPessoa.set(a.colaborador_id, new Set());
    atuaisPorPessoa.get(a.colaborador_id)!.add(a.modulo);
  }

  const paraInserir: { colaborador_id: string; revenda_id: string; modulo: string; liberado_por: string }[] = [];
  const paraApagarPorPessoa = new Map<string, string[]>();
  const mudancaPorPessoa = new Map<string, { liberados: string[]; revogados: string[] }>();

  for (const [id, modulosDoUniverso] of universoPorPessoa) {
    const jaTinha = atuaisPorPessoa.get(id) ?? new Set<string>();
    const liberados: string[] = [];
    const revogados: string[] = [];
    for (const modulo of modulosDoUniverso) {
      const querAcesso = marcados.has(`${id}:${modulo}`);
      const jaTem = jaTinha.has(modulo);
      if (querAcesso && !jaTem) {
        paraInserir.push({ colaborador_id: id, revenda_id: revendaId, modulo, liberado_por: eu.id });
        liberados.push(modulo);
      } else if (!querAcesso && jaTem) {
        if (!paraApagarPorPessoa.has(id)) paraApagarPorPessoa.set(id, []);
        paraApagarPorPessoa.get(id)!.push(modulo);
        revogados.push(modulo);
      }
    }
    if (liberados.length > 0 || revogados.length > 0) mudancaPorPessoa.set(id, { liberados, revogados });
  }

  if (mudancaPorPessoa.size === 0) {
    voltar("sucesso", "Nenhuma mudança em relação ao que já estava liberado.", revendaId, "modulos");
  }

  for (const [colaboradorId, modulos] of paraApagarPorPessoa) {
    const { error } = await admin
      .from("colaborador_modulos_extra")
      .delete()
      .eq("colaborador_id", colaboradorId)
      .eq("revenda_id", revendaId)
      .in("modulo", modulos);
    if (error) voltar("erro", `Não foi possível revogar: ${error.message}`, revendaId, "modulos");
  }

  if (paraInserir.length > 0) {
    const { error } = await admin
      .from("colaborador_modulos_extra")
      .upsert(paraInserir, { onConflict: "colaborador_id,revenda_id,modulo" });
    if (error) voltar("erro", `Não foi possível liberar: ${error.message}`, revendaId, "modulos");
  }

  const { data: revenda } = await admin.from("revendas").select("nome").eq("id", revendaId).maybeSingle();
  const { data: pessoas } = await admin.from("profiles").select("id, nome").in("id", [...mudancaPorPessoa.keys()]);
  const nomePorId = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));

  for (const [id, { liberados, revogados }] of mudancaPorPessoa) {
    const partes: string[] = [];
    if (liberados.length > 0) partes.push(`liberou ${liberados.map((m) => moduloPorId(m)?.rotulo ?? m).join(", ")}`);
    if (revogados.length > 0) partes.push(`revogou ${revogados.map((m) => moduloPorId(m)?.rotulo ?? m).join(", ")}`);
    await registrar({
      atorId: eu.id,
      atorNome: eu.nome,
      acao: "Alterou acessos em lote",
      alvoId: id,
      alvoNome: nomePorId.get(id) ?? id,
      detalhes: `${revenda?.nome ?? "Revenda"} — ${partes.join(" · ")}`,
      revendaId,
    });
  }

  voltar(
    "sucesso",
    `Acessos atualizados para ${mudancaPorPessoa.size} pessoa(s).`,
    revendaId,
    "modulos",
  );
}

/**
 * O PERFIL, APLICADO DE DENTRO DA FICHA DA PESSOA.
 *
 * Ponto 2 do diagnóstico (06/09/2026): a tela pergunta "quem tem o módulo
 * X?" e quem administra pensa "o que o conferente precisa?". Perfis de
 * Acesso já respondia a segunda -- e estava subusado: quatro perfis, nove
 * pessoas aplicadas, e as duas lideranças mais carregadas montadas à mão,
 * com 49 concessões cada.
 *
 * Parte da causa era o caminho: para usar um perfil era preciso SAIR
 * daqui, ir para a outra tela, achar a pessoa e aplicar. Agora o perfil se
 * aplica na ficha, que é onde a pergunta nasce.
 *
 * A OPERAÇÃO É A MESMA, literalmente: `aplicarPerfilA`, a função que a
 * tela de Perfis usa. O que muda é para onde se volta e de onde vem a
 * revenda -- aqui, a que está aberta na tela; lá, a da sessão.
 *
 * O ESPELHAR TIRA PERMISSÃO, então tem de ser pedido por escrito. Campo
 * ausente, valor estranho ou requisição montada à mão caem no somar, que
 * não desfaz nada.
 */
export async function aplicarPerfilNaFicha(formData: FormData) {
  const revendaId = (formData.get("revenda") as string) || "";
  const { eu, dono, alcance } = await exigirGestaoDeAcessos(revendaId, "editar", (m) =>
    voltar("erro", m, revendaId),
  );
  const perfilId = (formData.get("perfil_id") as string) || "";
  const colaboradorId = (formData.get("colaborador_id") as string) || "";
  const espelhar = String(formData.get("modo") ?? "") === "espelhar";

  if (!revendaId) voltar("erro", "Revenda inválida.");
  if (!perfilId || !colaboradorId) voltar("erro", "Escolha o perfil e a pessoa.", revendaId);
  if (colaboradorId === eu.id) {
    voltar("erro", "Você não pode alterar as suas próprias permissões.", revendaId);
  }

  const admin = createAdminClient();
  // Permissão só existe dentro de vínculo -- a mesma conferência de
  // salvarPermissoes. Sem ela daria para aplicar um perfil de Barreiras a
  // quem não é de Barreiras.
  const { data: vinculo } = await admin
    .from("colaborador_revendas")
    .select("revenda_id")
    .eq("colaborador_id", colaboradorId)
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!vinculo) {
    voltar("erro", "A pessoa não está vinculada a esta revenda.", revendaId);
  }

  // As travas de quem não é o Admin (11/09/2026).
  if (!dono) {
    if (espelhar) {
      voltar(
        "erro",
        "Deixar igual ao perfil retira acessos, e isso só o Admin faz. Use “Só somar o que falta”.",
        revendaId,
      );
    }
    if (await gerenciaAcessos(colaboradorId)) {
      voltar("erro", "Essa pessoa também gerencia acessos: só o Admin altera os acessos dela.", revendaId);
    }
    const [{ data: doPerfil }, { data: perfilDaRevenda }] = await Promise.all([
      admin.from("perfil_permissoes").select("modulo, acao").eq("perfil_id", perfilId),
      admin.from("perfis_acesso").select("revenda_id").eq("id", perfilId).maybeSingle(),
    ]);
    if (perfilDaRevenda?.revenda_id !== revendaId) {
      voltar("erro", "Este perfil não é desta revenda.", revendaId);
    }
    // Perfil de liderança só se aplica se tudo o que ele dá está no
    // alcance de quem aplica. Perfil de colaborador não tem permissão de
    // liderança nenhuma e passa direto.
    const fora = (doPerfil ?? [])
      .map((p) => `${p.modulo}:${p.acao}`)
      .filter((c) => !(alcance ?? new Set<string>()).has(c));
    if (fora.length > 0) {
      voltar(
        "erro",
        `Este perfil dá ${fora.length} permissão(ões) que você mesmo não tem nesta revenda (ex.: ${fora[0]}). Só o Admin aplica.`,
        revendaId,
      );
    }
  }

  const r = await aplicarPerfilA({
    perfilId,
    colaboradorId,
    revendaId,
    espelhar,
    quemAplicaId: eu.id,
    // A mesma regra da tela de Perfis (10/09/2026): perfil de liderança só
    // promove um colaborador com esta caixa marcada. Sem ela, recusa antes
    // de gravar -- e o recado diz por quê.
    tornarLideranca: formData.get("tornar_lideranca") === "on",
  });
  if (!r.ok) voltar("erro", r.erro, revendaId);

  const { data: perfil } = await admin
    .from("perfis_acesso")
    .select("nome")
    .eq("id", perfilId)
    .maybeSingle();
  const { data: revenda } = await admin
    .from("revendas")
    .select("nome")
    .eq("id", revendaId)
    .maybeSingle();

  const unidade = r.tipo === "colaborador" ? "módulo(s) do app" : "permissão(ões)";
  const papel =
    r.tipo === "colaborador"
      ? " O papel não mudou: continua colaborador."
      : r.promovido
        ? " Agora entra no Modo Liderança."
        : "";

  await registrar({
    atorId: eu.id,
    atorNome: eu.nome,
    acao: espelhar ? "Espelhou perfil" : "Somou perfil",
    alvoId: colaboradorId,
    alvoNome: r.nome,
    // A promoção vai escrita na auditoria: é o fato que o defeito de
    // 10/09/2026 escondeu.
    detalhes:
      `${revenda?.nome ?? "Revenda"} — perfil ${perfil?.nome ?? perfilId}: ${r.concessoes} ${unidade}` +
      (r.retiradas > 0 ? `, ${r.retiradas} retirada(s)` : "") +
      (r.promovido ? " — PROMOVIDO a liderança, com confirmação" : ""),
    revendaId,
  });

  voltar(
    "sucesso",
    (espelhar
      ? `${r.nome} ficou igual ao perfil ${perfil?.nome ?? ""}: ${r.concessoes} ${unidade}` +
        (r.retiradas > 0
          ? `, e ${r.retiradas} fora do molde foram retirada(s).`
          : " — não havia nada fora do molde.")
      : `Perfil ${perfil?.nome ?? ""} somado a ${r.nome}: ${r.concessoes} ${unidade}. Nada foi retirado.`) + papel,
    revendaId,
  );
}

/**
 * A GRADE DAS ANÁLISES -- várias pessoas de uma vez, uma coluna por painel.
 *
 * Pedido do dono (05/09/2026): liberar as análises como se liberam os
 * módulos opcionais, numa tabela de quadradinhos, em vez de abrir a ficha
 * de cada pessoa. É o mesmo gesto, e ele já conhece esse gesto.
 *
 * GRAVA NAS MESMAS LINHAS DA FICHA -- `lideranca_permissoes`, ação "ver".
 * Não existe chave nova, nem tabela nova, nem uma segunda porta para o
 * mesmo cômodo: marcar aqui é idêntico a marcar "Visualizar" na ficha da
 * pessoa, e as duas telas leem o mesmo estado. Uma permissão com dois
 * lugares de origem seria uma que ninguém consegue auditar.
 *
 * SÓ MEXE NO "VER", e só de quem já é liderança. Analista continua sendo
 * uma tela de gestão -- decisão do dono ao escolher entre as três opções
 * (05/09/2026). E, dentro disso, o módulo que a pessoa administra (tem
 * criar/editar/excluir) não é tocado nem oferecido: tirar o "ver" de quem
 * pode editar deixaria uma permissão de mexer numa tela que não abre.
 *
 * `universo` carrega toda célula desenhada, marcada ou não -- é o que
 * separa "não veio porque desmarcou" de "não veio porque nem apareceu".
 * Mesmo desenho de liberarAcessosEmLote, pelo mesmo motivo.
 */
export async function liberarAnalisesEmLote(formData: FormData) {
  const revendaId = (formData.get("revenda") as string) || "";
  const { eu, dono, alcance } = await exigirGestaoDeAcessos(revendaId, "editar", (m) =>
    voltar("erro", m, revendaId, "modulos"),
  );

  const universoPorPessoa = new Map<string, Set<string>>();
  for (const par of formData.getAll("universo").map(String)) {
    const [id, modulo] = par.split(":");
    // Só módulo que de fato abre uma análise entra -- a grade não pode
    // virar um atalho para conceder "ver" em qualquer módulo do app.
    if (!id || !MODULOS_COM_ANALISE.includes(modulo as ModuloId)) continue;
    // Ninguém mexe na própria linha; e quem não é o Admin só libera a
    // análise que ele mesmo abre nesta revenda (11/09/2026).
    if (id === eu.id) continue;
    if (!dono && !alcance?.has(`${modulo}:ver`)) continue;
    if (!universoPorPessoa.has(id)) universoPorPessoa.set(id, new Set());
    universoPorPessoa.get(id)!.add(modulo);
  }
  if (universoPorPessoa.size === 0) {
    voltar("erro", "Nenhuma alteração para aplicar.", revendaId, "modulos");
  }

  const marcados = new Set(formData.getAll("marcado").map(String));
  const admin = createAdminClient();

  const ids = [...universoPorPessoa.keys()];

  const [{ data: perfis }, { data: vinculos }, { data: atuais }] = await Promise.all([
    admin.from("profiles").select("id, nome, role").in("id", ids),
    admin
      .from("colaborador_revendas")
      .select("colaborador_id")
      .eq("revenda_id", revendaId)
      .in("colaborador_id", ids),
    admin
      .from("lideranca_permissoes")
      .select("colaborador_id, modulo, acao")
      .eq("revenda_id", revendaId)
      .in("colaborador_id", ids),
  ]);

  const perfilPorId = new Map((perfis ?? []).map((p) => [p.id, p]));
  const daRevenda = new Set((vinculos ?? []).map((v) => v.colaborador_id));
  // Quem também gerencia acessos só é alterado pelo Admin.
  const gerentes = new Set<string>();
  if (!dono) {
    const { data: comGestao } = await admin
      .from("lideranca_permissoes")
      .select("colaborador_id")
      .eq("modulo", "acessos")
      .in("colaborador_id", ids);
    for (const g of comGestao ?? []) gerentes.add(g.colaborador_id);
  }

  // O que a pessoa já tem, por módulo: o conjunto de ações.
  const acoesPorPessoaModulo = new Map<string, Set<string>>();
  for (const a of atuais ?? []) {
    const chave = `${a.colaborador_id}:${a.modulo}`;
    if (!acoesPorPessoaModulo.has(chave)) acoesPorPessoaModulo.set(chave, new Set());
    acoesPorPessoaModulo.get(chave)!.add(a.acao);
  }

  const paraInserir: {
    colaborador_id: string;
    revenda_id: string;
    modulo: string;
    acao: string;
    concedido_por: string;
  }[] = [];
  const paraApagarPorPessoa = new Map<string, string[]>();
  const mudancaPorPessoa = new Map<string, { liberados: string[]; revogados: string[] }>();

  for (const [id, modulos] of universoPorPessoa) {
    const perfil = perfilPorId.get(id);
    // Colaborador e dono nem chegam aqui pela tela; a checagem existe
    // porque a tela não é a segurança -- o formulário é do navegador de
    // quem envia.
    if (!perfil || perfil.role !== "lideranca") continue;
    if (!daRevenda.has(id)) continue;
    if (gerentes.has(id)) continue;

    const liberados: string[] = [];
    const revogados: string[] = [];

    for (const modulo of modulos) {
      const jaTem = acoesPorPessoaModulo.get(`${id}:${modulo}`) ?? new Set<string>();
      // Quem administra o módulo (criar/editar/excluir) tem o "ver" por
      // consequência. A grade não mexe nesses -- a tela os mostra
      // travados, dizendo de onde vêm.
      if ([...jaTem].some((a) => a !== "ver")) continue;

      const quer = marcados.has(`${id}:${modulo}`);
      const tem = jaTem.has("ver");
      if (quer && !tem) {
        paraInserir.push({
          colaborador_id: id,
          revenda_id: revendaId,
          modulo,
          acao: "ver",
          concedido_por: eu.id,
        });
        liberados.push(modulo);
      } else if (!quer && tem) {
        if (!paraApagarPorPessoa.has(id)) paraApagarPorPessoa.set(id, []);
        paraApagarPorPessoa.get(id)!.push(modulo);
        revogados.push(modulo);
      }
    }
    if (liberados.length > 0 || revogados.length > 0) {
      mudancaPorPessoa.set(id, { liberados, revogados });
    }
  }

  if (mudancaPorPessoa.size === 0) {
    voltar("sucesso", "Nenhuma mudança em relação ao que já estava liberado.", revendaId, "modulos");
  }

  for (const [colaboradorId, modulos] of paraApagarPorPessoa) {
    const { error } = await admin
      .from("lideranca_permissoes")
      .delete()
      .eq("colaborador_id", colaboradorId)
      .eq("revenda_id", revendaId)
      .eq("acao", "ver")
      .in("modulo", modulos);
    if (error) voltar("erro", `Não foi possível revogar: ${error.message}`, revendaId, "modulos");
  }

  if (paraInserir.length > 0) {
    const { error } = await admin.from("lideranca_permissoes").insert(paraInserir);
    if (error) voltar("erro", `Não foi possível liberar: ${error.message}`, revendaId, "modulos");
  }

  const { data: revenda } = await admin
    .from("revendas")
    .select("nome")
    .eq("id", revendaId)
    .maybeSingle();

  const nomeDaAnalise = (modulo: string) =>
    PAINEIS.find((p) => p.modulo === modulo)?.rotulo ?? moduloPorId(modulo)?.rotulo ?? modulo;

  for (const [id, { liberados, revogados }] of mudancaPorPessoa) {
    const partes: string[] = [];
    if (liberados.length > 0) partes.push(`liberou ${liberados.map(nomeDaAnalise).join(", ")}`);
    if (revogados.length > 0) partes.push(`revogou ${revogados.map(nomeDaAnalise).join(", ")}`);
    await registrar({
      atorId: eu.id,
      atorNome: eu.nome,
      acao: "Alterou análises da Gestão",
      alvoId: id,
      alvoNome: perfilPorId.get(id)?.nome ?? id,
      detalhes: `${revenda?.nome ?? "Revenda"} — ${partes.join(" · ")}`,
      revendaId,
    });
  }

  voltar(
    "sucesso",
    `Análises atualizadas para ${mudancaPorPessoa.size} liderança(s).`,
    revendaId,
    "modulos",
  );
}

/**
 * Salva a matriz de permissões de uma liderança de uma vez.
 *
 * Apaga tudo e regrava: é mais simples de raciocinar do que calcular
 * diferenças, e o volume é minúsculo (dezenas de linhas por pessoa).
 */
export async function salvarPermissoes(formData: FormData) {
  const id = (formData.get("id") as string) || "";
  const revendaId = (formData.get("revenda") as string) || "";

  if (!id) voltar("erro", "Colaborador inválido.");
  const { eu, dono, alcance } = await exigirGestaoDeAcessos(revendaId, "editar", (m) =>
    voltar("erro", m, revendaId),
  );
  if (id === eu.id) {
    voltar("erro", "Você não pode alterar as suas próprias permissões.", revendaId);
  }

  const alvo = await nomeDe(id);
  if (!alvo) voltar("erro", "Colaborador não encontrado.", revendaId);
  if (alvo.role !== "lideranca") {
    voltar(
      "erro",
      `${alvo.nome} precisa ser liderança antes de receber permissões.`,
      revendaId,
    );
  }

  const admin = createAdminClient();

  // Permissão só existe dentro de vínculo. Sem esta conferência daria para
  // liberar comunicados de Barreiras para alguém que não é de Barreiras --
  // que é exatamente o que a separação de revendas existe para impedir.
  const { data: vinculo } = await admin
    .from("colaborador_revendas")
    .select("revenda_id")
    .eq("colaborador_id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!vinculo) {
    voltar(
      "erro",
      `${alvo.nome} não está vinculado a esta revenda. Vincule primeiro na tela de Colaboradores.`,
      revendaId,
    );
  }

  if (!dono && (await gerenciaAcessos(id))) {
    voltar(
      "erro",
      `${alvo.nome} também gerencia acessos: só o Admin altera as permissões dessa pessoa.`,
      revendaId,
    );
  }

  const enviadas = formData
    .getAll("permissao")
    .map(String)
    .filter((v) => {
      const [m, a] = v.split(":");
      return ehModuloValido(m) && ehAcaoValida(a);
    });

  // O ALCANCE (11/09/2026): quem não é o Admin só concede e só retira o
  // que ele mesmo tem nesta revenda -- e nunca a gestão de acessos. O resto
  // da ficha fica exatamente como estava (ver mesclarNoAlcance). Para o
  // Admin, vale o que foi marcado, como sempre.
  const existentes = dono ? [] : [...(await permissoesNaRevenda(id, revendaId))];
  const marcadas = mesclarNoAlcance(existentes, enviadas, alcance).map((v) => v.split(":"));

  // Coerência: quem pode criar/editar/excluir precisa poder ver. Sem isso a
  // pessoa teria permissão de mexer numa tela que nem consegue abrir.
  const porModulo = new Map<string, Set<string>>();
  for (const [m, a] of marcadas) {
    if (!porModulo.has(m)) porModulo.set(m, new Set());
    porModulo.get(m)!.add(a);
  }
  for (const acoes of porModulo.values()) {
    if (acoes.size > 0) acoes.add("ver");
  }

  const linhas: {
    colaborador_id: string;
    revenda_id: string;
    modulo: string;
    acao: string;
    concedido_por: string;
  }[] = [];
  for (const [modulo, acoes] of porModulo) {
    for (const acao of acoes) {
      linhas.push({
        colaborador_id: id,
        revenda_id: revendaId,
        modulo,
        acao,
        concedido_por: eu.id,
      });
    }
  }

  // O apaga-e-regrava é restrito a ESTA revenda: salvar São Félix não pode
  // zerar o que a mesma pessoa tem em Barreiras.
  await admin
    .from("lideranca_permissoes")
    .delete()
    .eq("colaborador_id", id)
    .eq("revenda_id", revendaId);

  if (linhas.length > 0) {
    const { error } = await admin.from("lideranca_permissoes").insert(linhas);
    if (error) voltar("erro", error.message, revendaId);
  }

  const resumo = Array.from(porModulo.entries())
    .map(([m, a]) => {
      const rotulo = MODULOS.find((x) => x.id === m)?.rotulo ?? m;
      return `${rotulo} (${Array.from(a).sort().join(", ")})`;
    })
    .join(" · ");

  const { data: revenda } = await admin
    .from("revendas")
    .select("nome")
    .eq("id", revendaId)
    .maybeSingle();

  await registrar({
    atorId: eu.id,
    atorNome: eu.nome,
    acao: "Alterou permissões",
    alvoId: id,
    alvoNome: alvo.nome,
    detalhes: `${revenda?.nome ?? "Revenda"} — ${resumo || "nenhuma permissão"}`,
    revendaId,
  });

  voltar(
    "sucesso",
    `Permissões de ${alvo.nome} em ${revenda?.nome ?? "revenda"} atualizadas.`,
    revendaId,
  );
}
