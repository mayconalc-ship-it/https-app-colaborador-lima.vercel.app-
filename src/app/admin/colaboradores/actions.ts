"use server";

import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHAVE_SENHA_ALTERADA, SENHA_PADRAO } from "@/lib/senha";
import { cpfParaEmail, somenteDigitos } from "@/lib/auth-helpers";

function campo(formData: FormData, nome: string) {
  return ((formData.get(nome) as string) || "").trim();
}

// O retorno "never" avisa o TypeScript de que aqui a execução para, o que
// permite a ele estreitar os tipos depois das validações.
function voltar(params: Record<string, string>): never {
  const busca = new URLSearchParams(params);
  redirect(`/admin/colaboradores?${busca.toString()}`);
}

export async function criarColaborador(formData: FormData) {
  await requireModulo("colaboradores", "criar");

  const nome = campo(formData, "nome");
  const cpf = somenteDigitos(campo(formData, "cpf"));

  if (!nome) voltar({ erro: "Informe o nome" });
  if (cpf.length !== 11) voltar({ erro: "O CPF deve ter 11 dígitos" });

  const admin = createAdminClient();

  const { data: jaExiste } = await admin
    .from("profiles")
    .select("nome")
    .eq("cpf", cpf)
    .maybeSingle();

  if (jaExiste) {
    voltar({ erro: `Esse CPF já está cadastrado para ${jaExiste.nome}` });
  }

  // Cria o acesso com a senha padrão; o app obriga a trocar no 1º login.
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email: cpfParaEmail(cpf),
    password: SENHA_PADRAO,
    email_confirm: true,
    user_metadata: { [CHAVE_SENHA_ALTERADA]: false },
  });

  if (erroAuth || !criado?.user) {
    voltar({
      erro: erroAuth?.message.includes("already been registered")
        ? "Já existe um acesso com esse CPF"
        : (erroAuth?.message ?? "Não foi possível criar o acesso"),
    });
  }

  const { error: erroPerfil } = await admin.from("profiles").insert({
    id: criado.user.id,
    nome,
    cpf,
    matricula: campo(formData, "matricula") || null,
    cargo: campo(formData, "cargo") || null,
    area: campo(formData, "area") || null,
    revenda: campo(formData, "revenda") || null,
    empresa: campo(formData, "empresa") || null,
    role: "colaborador",
  });

  if (erroPerfil) {
    // Sem perfil o acesso ficaria órfão: desfaz para não deixar lixo.
    await admin.auth.admin.deleteUser(criado.user.id);
    voltar({ erro: erroPerfil.message });
  }

  voltar({
    sucesso: `${nome} cadastrado. Senha inicial: ${SENHA_PADRAO} (será trocada no primeiro acesso).`,
    busca: cpf,
  });
}

export async function atualizarColaborador(formData: FormData) {
  await requireModulo("colaboradores", "editar");

  const id = campo(formData, "id");
  const nome = campo(formData, "nome");
  const busca = campo(formData, "busca");

  if (!id) voltar({ erro: "Colaborador inválido" });
  if (!nome) voltar({ erro: "O nome não pode ficar vazio" });

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      nome,
      matricula: campo(formData, "matricula") || null,
      cargo: campo(formData, "cargo") || null,
      area: campo(formData, "area") || null,
    })
    .eq("id", id);

  if (error) voltar({ erro: error.message, ...(busca ? { busca } : {}) });

  voltar({ sucesso: `Dados de ${nome} atualizados`, ...(busca ? { busca } : {}) });
}

export async function excluirColaborador(formData: FormData) {
  const usuarioAtual = await requireModulo("colaboradores", "excluir");

  const id = campo(formData, "id");
  const nome = campo(formData, "nome") || "Colaborador";
  const busca = campo(formData, "busca");

  if (!id) voltar({ erro: "Colaborador inválido" });
  if (id === usuarioAtual.id) {
    voltar({ erro: "Você não pode excluir a própria conta" });
  }

  const admin = createAdminClient();

  // Apaga o perfil antes do acesso: se algo falhar no meio, sobra um acesso
  // sem perfil, que o app já trata mostrando "sessão não reconhecida".
  const { error: erroPerfil } = await admin
    .from("profiles")
    .delete()
    .eq("id", id);

  if (erroPerfil) voltar({ erro: erroPerfil.message });

  const { error: erroAuth } = await admin.auth.admin.deleteUser(id);
  if (erroAuth) voltar({ erro: erroAuth.message });

  voltar({
    sucesso: `${nome} removido do app`,
    ...(busca ? { busca } : {}),
  });
}

/**
 * Promove um colaborador a liderança, ou desfaz.
 *
 * Exige a permissão "promover" no módulo Colaboradores -- separada de
 * "editar" de propósito: dá para confiar o cadastro a alguém sem confiar a
 * ela o poder de criar novas lideranças.
 *
 * O que esta função NÃO faz, e é o que a mantém segura: ela não concede
 * permissão nenhuma. Quem for promovido aqui entra sem nenhum módulo
 * liberado -- só o Admin, em Gestão de Acessos, decide o que cada liderança
 * enxerga. Promover dá o crachá; não dá as chaves.
 */
export async function promoverColaborador(formData: FormData) {
  const eu = await requireModulo("colaboradores", "promover");

  const id = campo(formData, "id");
  const nome = campo(formData, "nome") || "Colaborador";
  const papel = campo(formData, "papel");
  const busca = campo(formData, "busca");
  const extra: Record<string, string> = busca ? { busca } : {};

  if (!id) voltar({ erro: "Colaborador inválido", ...extra });
  if (papel !== "lideranca" && papel !== "colaborador") {
    voltar({ erro: "Nível de acesso inválido", ...extra });
  }
  if (id === eu.id) {
    voltar({ erro: "Você não pode alterar o seu próprio acesso", ...extra });
  }

  const admin = createAdminClient();

  const { data: alvo } = await admin
    .from("profiles")
    .select("nome, role")
    .eq("id", id)
    .maybeSingle();

  if (!alvo) voltar({ erro: "Colaborador não encontrado", ...extra });

  // O Admin é intocável por esta porta. Só o banco define quem ele é.
  if (alvo.role === "owner") {
    voltar({ erro: "O Admin do app não pode ser alterado aqui", ...extra });
  }

  const { error } = await admin
    .from("profiles")
    .update({ role: papel })
    .eq("id", id);

  if (error) voltar({ erro: error.message, ...extra });

  // Rebaixou: as permissões vão junto. Deixar sobra seria uma porta aberta
  // esperando a pessoa ser promovida de novo.
  if (papel === "colaborador") {
    await admin.from("lideranca_permissoes").delete().eq("colaborador_id", id);
  }

  await admin.from("auditoria").insert({
    ator_id: eu.id,
    ator_nome: eu.nome,
    acao:
      papel === "lideranca"
        ? "Promoveu a liderança"
        : "Removeu a liderança",
    alvo_id: id,
    alvo_nome: alvo.nome,
    detalhes: "Pela tela de Colaboradores",
  });

  voltar({
    sucesso:
      papel === "lideranca"
        ? `${nome} agora é liderança. O Admin precisa liberar os módulos em Gestão de Acessos.`
        : `${nome} voltou a ser colaborador e perdeu as permissões.`,
    ...extra,
  });
}

export async function redefinirSenha(formData: FormData) {
  await requireModulo("colaboradores", "editar");

  const id = formData.get("id") as string;
  const nome = (formData.get("nome") as string) || "Colaborador";
  const busca = (formData.get("busca") as string) || "";

  if (!id) redirect("/admin/colaboradores?erro=Colaborador+invalido");

  const admin = createAdminClient();

  // Volta para a senha padrao e desmarca a troca, obrigando o colaborador
  // a definir uma senha nova no proximo acesso.
  const { error } = await admin.auth.admin.updateUserById(id, {
    password: SENHA_PADRAO,
    user_metadata: { [CHAVE_SENHA_ALTERADA]: false },
  });

  const params = new URLSearchParams();
  if (busca) params.set("busca", busca);

  if (error) {
    params.set("erro", error.message);
  } else {
    params.set(
      "sucesso",
      `Senha de ${nome} redefinida para ${SENHA_PADRAO}. No próximo acesso será pedida uma nova senha.`,
    );
  }

  redirect(`/admin/colaboradores?${params.toString()}`);
}
