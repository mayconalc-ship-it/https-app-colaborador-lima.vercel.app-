"use server";

import { redirect } from "next/navigation";
import { requireModulo, requireOwner } from "@/lib/require-admin";
import { ehOwner } from "@/lib/acessos";
import { exigirRevenda, getRevendaId } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { CHAVE_SENHA_ALTERADA, SENHA_PADRAO } from "@/lib/senha";
import { cpfParaEmail, somenteDigitos } from "@/lib/auth-helpers";

const MODULO_AG = "ativo-giro";

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
  const eu = await requireModulo("colaboradores", "criar");

  const nome = campo(formData, "nome");
  const cpf = somenteDigitos(campo(formData, "cpf"));

  if (!nome) voltar({ erro: "Informe o nome" });
  if (cpf.length !== 11) voltar({ erro: "O CPF deve ter 11 dígitos" });

  // Quem cadastra, cadastra por padrão para a revenda em que está. Só o
  // dono pode escolher outra na própria tela -- o campo nem aparece para
  // os demais, mesma regra de quem pode mexer em vínculo depois de
  // criado. Não existe pessoa sem revenda: ela entraria no app e não
  // teria conteúdo nenhum para ver.
  const revendaEscolhida = ehOwner(eu.role) ? campo(formData, "revenda_id") : "";
  const revendaId = revendaEscolhida || (await getRevendaId());
  if (!revendaId) voltar({ erro: "Você não está em nenhuma revenda." });

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

  const { error: erroVinculo } = await admin
    .from("colaborador_revendas")
    .insert({
      colaborador_id: criado.user.id,
      revenda_id: revendaId,
      principal: true,
    });

  if (erroVinculo) {
    // Mesmo raciocínio de acima: sem vínculo a pessoa entra e não vê nada,
    // então é melhor não deixar o cadastro pela metade.
    await admin.from("profiles").delete().eq("id", criado.user.id);
    await admin.auth.admin.deleteUser(criado.user.id);
    voltar({ erro: erroVinculo.message });
  }

  // Acesso ao Ativo de Giro, direto no cadastro. Best-effort: o módulo
  // pode estar desligado nesta revenda (a concessão fica inerte até
  // alguém ligar), e uma falha aqui não é motivo para desfazer a pessoa
  // inteira -- dá para liberar depois clicando nela.
  if (campo(formData, "acesso_ag") === "1") {
    await admin.from("colaborador_modulos_extra").upsert(
      {
        colaborador_id: criado.user.id,
        revenda_id: revendaId,
        modulo: MODULO_AG,
        liberado_por: eu.id,
      },
      { onConflict: "colaborador_id,revenda_id,modulo" },
    );
  }

  voltar({
    sucesso: `${nome} cadastrado. Senha inicial: ${SENHA_PADRAO} (será trocada no primeiro acesso).`,
    busca: cpf,
  });
}

/**
 * Salva o cadastro inteiro: os dados da pessoa e, se quem está mexendo for
 * o dono, também as revendas dela.
 *
 * As duas coisas num botão só porque, para quem edita, são a mesma tarefa
 * -- "corrigir o cadastro do fulano". Dois botões de salvar na mesma ficha
 * obrigam a pessoa a descobrir qual deles guarda o quê.
 */
export async function atualizarColaborador(formData: FormData) {
  const eu = await requireModulo("colaboradores", "editar");

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

  // Vínculo é só do dono. Uma liderança com "editar" não manda campo de
  // revenda nenhum (a tela nem mostra), e se mandasse na mão, seria
  // ignorado aqui -- é este teste, e não a tela, que segura a regra.
  const marcadas = formData.getAll("revenda").map(String).filter(Boolean);
  const tinhaBlocoDeRevendas = campo(formData, "vinculos_editaveis") === "1";

  if (ehOwner(eu.role) && tinhaBlocoDeRevendas && marcadas.length === 0) {
    voltar({
      erro: `${nome} precisa estar em pelo menos uma revenda. Para tirar o acesso, remova a pessoa do app.`,
      ...(busca ? { busca } : {}),
    });
  }

  if (ehOwner(eu.role) && marcadas.length > 0) {
    const problema = await aplicarVinculos({
      donoId: eu.id,
      donoNome: eu.nome,
      colaboradorId: id,
      colaboradorNome: nome,
      marcadas,
      principalPedida: campo(formData, "principal"),
    });

    if (problema) voltar({ erro: problema, ...(busca ? { busca } : {}) });
  }

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

/**
 * Define a quais revendas a pessoa pertence.
 *
 * É por aqui que passa a liderança que responde por mais de uma unidade:
 * marcar as duas revendas faz aparecer para ela o seletor no topo do app, e
 * a partir daí cada revenda tem o seu próprio conjunto de permissões, que o
 * Admin define em Gestão de Acessos.
 *
 * Devolve a mensagem de erro, ou null se deu certo -- em vez de redirecionar
 * sozinha: quem chama está no meio de salvar o cadastro inteiro e precisa
 * decidir o que fazer com a falha.
 *
 * Só o dono chega aqui; a checagem fica em quem chama, que é onde o papel
 * já foi lido.
 */
async function aplicarVinculos(dados: {
  donoId: string;
  donoNome: string;
  colaboradorId: string;
  colaboradorNome: string;
  marcadas: string[];
  principalPedida: string;
}): Promise<string | null> {
  const {
    donoId: eu,
    donoNome,
    colaboradorId: id,
    colaboradorNome: nome,
    marcadas,
    principalPedida,
  } = dados;

  // A principal precisa estar entre as marcadas -- senão a pessoa entraria
  // por padrão numa revenda que ela acabou de perder.
  const principal = marcadas.includes(principalPedida)
    ? principalPedida
    : marcadas[0];

  const admin = createAdminClient();

  // Lista no formato que o PostgREST espera em "not in". As aspas evitam
  // que o id seja lido como parte da sintaxe do filtro.
  const fora = `(${marcadas.map((r) => `"${r}"`).join(",")})`;

  // Tira só o que saiu. Apagar tudo e regravar zeraria a data de quando o
  // vínculo começou, que é o que explica o histórico da pessoa depois.
  const { error: erroRemocao } = await admin
    .from("colaborador_revendas")
    .delete()
    .eq("colaborador_id", id)
    .not("revenda_id", "in", fora);

  if (erroRemocao) return erroRemocao.message;

  // A principal antiga sai da frente antes de a nova entrar: o banco só
  // aceita uma principal por pessoa.
  await admin
    .from("colaborador_revendas")
    .update({ principal: false })
    .eq("colaborador_id", id);

  const { error } = await admin.from("colaborador_revendas").upsert(
    marcadas.map((revenda_id) => ({
      colaborador_id: id,
      revenda_id,
      principal: revenda_id === principal,
      criado_por: eu,
    })),
    { onConflict: "colaborador_id,revenda_id" },
  );

  if (error) return error.message;

  // Permissão de liderança em revenda que a pessoa não é mais de nada
  // adianta -- e voltaria a valer sozinha se o vínculo fosse refeito.
  await admin
    .from("lideranca_permissoes")
    .delete()
    .eq("colaborador_id", id)
    .not("revenda_id", "in", fora);

  await admin
    .from("colaborador_modulos_extra")
    .delete()
    .eq("colaborador_id", id)
    .not("revenda_id", "in", fora);

  const { data: nomes } = await admin
    .from("revendas")
    .select("nome")
    .in("id", marcadas);

  const resumo = (nomes ?? []).map((r) => r.nome).join(", ");

  await admin.from("auditoria").insert({
    ator_id: eu,
    ator_nome: donoNome,
    acao: "Alterou revendas do colaborador",
    alvo_id: id,
    alvo_nome: nome,
    detalhes: resumo,
  });

  return null;
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

/**
 * Libera o Ativo de Giro para o colaborador, na revenda em que o dono
 * está agora -- a mesma pessoa pode usar o módulo numa unidade e não na
 * outra. Migrado de Admin > Ativo de Giro > Acessos: o cadastro é o
 * lugar natural para decidir o que cada colaborador enxerga, não uma
 * tela à parte por módulo.
 *
 * Exclusivo do dono, como toda alteração de acesso.
 */
export async function concederAcessoAtivoGiro(formData: FormData) {
  const eu = await requireOwner();

  const id = campo(formData, "id");
  const nome = campo(formData, "nome") || "Colaborador";
  const busca = campo(formData, "busca");
  const extra: Record<string, string> = busca ? { busca } : {};

  if (!id) voltar({ erro: "Colaborador inválido", ...extra });

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/colaboradores");

  const { error } = await admin.from("colaborador_modulos_extra").upsert(
    {
      colaborador_id: id,
      revenda_id: revendaId,
      modulo: MODULO_AG,
      liberado_por: eu.id,
    },
    { onConflict: "colaborador_id,revenda_id,modulo" },
  );

  if (error) voltar({ erro: `Não foi possível liberar: ${error.message}`, ...extra });
  voltar({ sucesso: `Ativo de Giro liberado para ${nome}`, ...extra });
}

/** Revoga o acesso concedido acima. */
export async function revogarAcessoAtivoGiro(formData: FormData) {
  await requireOwner();

  const id = campo(formData, "id");
  const nome = campo(formData, "nome") || "Colaborador";
  const busca = campo(formData, "busca");
  const extra: Record<string, string> = busca ? { busca } : {};

  if (!id) voltar({ erro: "Colaborador inválido", ...extra });

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/colaboradores");

  const { error } = await admin
    .from("colaborador_modulos_extra")
    .delete()
    .eq("colaborador_id", id)
    .eq("revenda_id", revendaId)
    .eq("modulo", MODULO_AG);

  if (error) voltar({ erro: `Não foi possível revogar: ${error.message}`, ...extra });
  voltar({ sucesso: `Acesso ao Ativo de Giro revogado de ${nome}`, ...extra });
}
