"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAcaoValida, ehModuloValido, MODULOS } from "@/lib/acessos";

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
