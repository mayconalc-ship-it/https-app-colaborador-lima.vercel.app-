"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAcaoValida, ehModuloValido, MODULOS } from "@/lib/acessos";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`/admin/acessos?${chave}=${encodeURIComponent(mensagem)}`);
}

/** Toda mudança de acesso fica registrada. Sem exceção. */
async function registrar(dados: {
  atorId: string;
  atorNome: string;
  acao: string;
  alvoId?: string;
  alvoNome?: string;
  detalhes?: string;
}) {
  const admin = createAdminClient();
  await admin.from("auditoria").insert({
    ator_id: dados.atorId,
    ator_nome: dados.atorNome,
    acao: dados.acao,
    alvo_id: dados.alvoId ?? null,
    alvo_nome: dados.alvoNome ?? null,
    detalhes: dados.detalhes ?? null,
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

  if (!id) voltar("erro", "Colaborador inválido.");
  if (papel !== "lideranca" && papel !== "colaborador") {
    voltar("erro", "Só é possível definir Liderança ou Colaborador aqui.");
  }
  if (id === eu.id) {
    voltar("erro", "Você não pode alterar o seu próprio nível de acesso.");
  }

  const alvo = await nomeDe(id);
  if (!alvo) voltar("erro", "Colaborador não encontrado.");
  if (alvo.role === "owner") {
    voltar("erro", "O dono do app não pode ser rebaixado por aqui.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role: papel })
    .eq("id", id);

  if (error) voltar("erro", error.message);

  // Ao rebaixar, as permissões vão junto: deixar sobra seria uma porta
  // aberta esperando a pessoa ser promovida de novo.
  if (papel === "colaborador") {
    await admin.from("lideranca_permissoes").delete().eq("colaborador_id", id);
  }

  await registrar({
    atorId: eu.id,
    atorNome: eu.nome,
    acao: papel === "lideranca" ? "Promoveu a liderança" : "Removeu a liderança",
    alvoId: id,
    alvoNome: alvo.nome,
  });

  voltar(
    "sucesso",
    papel === "lideranca"
      ? `${alvo.nome} agora é liderança. Libere os módulos abaixo.`
      : `${alvo.nome} voltou a ser colaborador e perdeu todas as permissões.`,
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
  if (!id) voltar("erro", "Colaborador inválido.");
  if (id === eu.id) {
    voltar("erro", "Você não pode alterar as suas próprias permissões.");
  }

  const alvo = await nomeDe(id);
  if (!alvo) voltar("erro", "Colaborador não encontrado.");
  if (alvo.role !== "lideranca") {
    voltar("erro", `${alvo.nome} precisa ser liderança antes de receber permissões.`);
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
    modulo: string;
    acao: string;
    concedido_por: string;
  }[] = [];
  for (const [modulo, acoes] of porModulo) {
    for (const acao of acoes) {
      linhas.push({
        colaborador_id: id,
        modulo,
        acao,
        concedido_por: eu.id,
      });
    }
  }

  const admin = createAdminClient();
  await admin.from("lideranca_permissoes").delete().eq("colaborador_id", id);

  if (linhas.length > 0) {
    const { error } = await admin.from("lideranca_permissoes").insert(linhas);
    if (error) voltar("erro", error.message);
  }

  const resumo = Array.from(porModulo.entries())
    .map(([m, a]) => {
      const rotulo = MODULOS.find((x) => x.id === m)?.rotulo ?? m;
      return `${rotulo} (${Array.from(a).sort().join(", ")})`;
    })
    .join(" · ");

  await registrar({
    atorId: eu.id,
    atorNome: eu.nome,
    acao: "Alterou permissões",
    alvoId: id,
    alvoNome: alvo.nome,
    detalhes: resumo || "Nenhuma permissão",
  });

  voltar("sucesso", `Permissões de ${alvo.nome} atualizadas.`);
}
