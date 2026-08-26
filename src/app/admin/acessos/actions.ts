"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ehAcaoValida,
  ehModuloValido,
  moduloPorId,
  MODULOS,
  MODULOS_OPCIONAIS,
} from "@/lib/acessos";

function voltar(
  chave: "erro" | "sucesso",
  mensagem: string,
  revenda?: string,
): never {
  const params = new URLSearchParams({ [chave]: mensagem });
  // Volta para a mesma revenda que estava sendo configurada. Sem isso, a
  // tela pularia para outra unidade depois de salvar e a próxima alteração
  // sairia no lugar errado.
  if (revenda) params.set("revenda", revenda);
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
 * Só o dono chega aqui. E há duas travas a mais: ninguém mexe no próprio
 * nível, e ninguém vira dono por esta porta -- o dono é único e definido
 * no banco.
 */
export async function definirPapel(formData: FormData) {
  const eu = await requireOwner();

  const id = (formData.get("id") as string) || "";
  const papel = (formData.get("papel") as string) || "";
  const revendaId = (formData.get("revenda") as string) || "";

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
  const eu = await requireOwner();
  const revendaId = (formData.get("revenda") as string) || "";
  if (!revendaId) voltar("erro", "Revenda inválida.");

  const universoPorPessoa = new Map<string, Set<string>>();
  for (const par of formData.getAll("universo").map(String)) {
    const [id, modulo] = par.split(":");
    if (!id || !MODULOS_OPCIONAIS.includes(modulo as (typeof MODULOS_OPCIONAIS)[number])) continue;
    if (!universoPorPessoa.has(id)) universoPorPessoa.set(id, new Set());
    universoPorPessoa.get(id)!.add(modulo);
  }
  if (universoPorPessoa.size === 0) voltar("erro", "Nenhuma alteração para aplicar.", revendaId);

  const marcados = new Set(formData.getAll("marcado").map(String));
  const admin = createAdminClient();

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
    voltar("sucesso", "Nenhuma mudança em relação ao que já estava liberado.", revendaId);
  }

  for (const [colaboradorId, modulos] of paraApagarPorPessoa) {
    const { error } = await admin
      .from("colaborador_modulos_extra")
      .delete()
      .eq("colaborador_id", colaboradorId)
      .eq("revenda_id", revendaId)
      .in("modulo", modulos);
    if (error) voltar("erro", `Não foi possível revogar: ${error.message}`, revendaId);
  }

  if (paraInserir.length > 0) {
    const { error } = await admin
      .from("colaborador_modulos_extra")
      .upsert(paraInserir, { onConflict: "colaborador_id,revenda_id,modulo" });
    if (error) voltar("erro", `Não foi possível liberar: ${error.message}`, revendaId);
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

  voltar("sucesso", `Acessos atualizados para ${mudancaPorPessoa.size} pessoa(s).`, revendaId);
}

/**
 * Salva a matriz de permissões de uma liderança de uma vez.
 *
 * Apaga tudo e regrava: é mais simples de raciocinar do que calcular
 * diferenças, e o volume é minúsculo (dezenas de linhas por pessoa).
 */
export async function salvarPermissoes(formData: FormData) {
  const eu = await requireOwner();

  const id = (formData.get("id") as string) || "";
  const revendaId = (formData.get("revenda") as string) || "";

  if (!id) voltar("erro", "Colaborador inválido.");
  if (!revendaId) voltar("erro", "Revenda inválida.");
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

  const marcadas = formData
    .getAll("permissao")
    .map(String)
    .map((v) => v.split(":"))
    .filter(([m, a]) => ehModuloValido(m) && ehAcaoValida(a));

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
