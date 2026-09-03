"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { requireModulo } from "@/lib/require-admin";
import { getPerfil } from "@/lib/sessao";
import { MODULOS } from "@/lib/acessos";
import { lerConcessoesDoFormulario, type Concessao } from "@/lib/perfis-acesso";

const ROTA = "/admin/perfis-de-acesso";

function voltar(chave: "erro" | "sucesso", mensagem: string, extra = ""): never {
  redirect(`${ROTA}?${chave}=${encodeURIComponent(mensagem)}${extra}`);
}

/** Só concessões que existem de verdade no catálogo entram no banco. */
function apenasValidas(concessoes: Concessao[]): Concessao[] {
  return concessoes.filter((c) => {
    const modulo = MODULOS.find((m) => m.id === c.modulo);
    return !!modulo && (modulo.acoes as string[]).includes(c.acao);
  });
}

/**
 * Cria ou renomeia um perfil e grava as concessões dele.
 *
 * Grava por substituição: o que está na tela passa a ser o perfil. Um
 * perfil é uma definição, não um histórico -- somar sem tirar deixaria
 * impossível remover uma permissão que entrou por engano.
 */
export async function salvarPerfil(formData: FormData) {
  await requireModulo("perfis-acesso", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const perfil = await getPerfil();
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim() || null;
  if (!nome) voltar("erro", "Dê um nome ao perfil.");

  const concessoes = apenasValidas(lerConcessoesDoFormulario(formData.entries()));
  if (concessoes.length === 0) {
    voltar("erro", "Marque ao menos uma permissão -- um perfil vazio não entrega nada a ninguém.");
  }

  let perfilId = id;
  if (id) {
    const { error } = await admin
      .from("perfis_acesso")
      .update({ nome, descricao })
      .eq("id", id)
      .eq("revenda_id", revendaId);
    if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);
  } else {
    const { data, error } = await admin
      .from("perfis_acesso")
      .insert({ revenda_id: revendaId, nome, descricao, criado_por: perfil?.id ?? null })
      .select("id")
      .maybeSingle();
    if (error) {
      voltar(
        "erro",
        error.code === "23505"
          ? `Já existe um perfil chamado "${nome}".`
          : `Não foi possível criar: ${error.message}`,
      );
    }
    perfilId = data?.id as string;
  }

  await admin.from("perfil_permissoes").delete().eq("perfil_id", perfilId);
  const { error: erroPerm } = await admin
    .from("perfil_permissoes")
    .insert(concessoes.map((c) => ({ perfil_id: perfilId, modulo: c.modulo, acao: c.acao })));
  if (erroPerm) voltar("erro", `Não foi possível salvar as permissões: ${erroPerm.message}`);

  revalidatePath(ROTA);
  voltar("sucesso", `Perfil "${nome}" salvo com ${concessoes.length} permissão(ões).`, `&perfil=${perfilId}`);
}

/**
 * Cria um perfil a partir das permissões que uma PESSOA já tem.
 *
 * É o jeito mais honesto de começar: os perfis que a operação usa já
 * existem, espalhados nas concessões de quem faz o trabalho. Montar do
 * zero na marra seria adivinhar o que já está escrito no banco.
 */
export async function criarPerfilDePessoa(formData: FormData) {
  await requireModulo("perfis-acesso", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const perfil = await getPerfil();
  const admin = createAdminClient();

  const colaboradorId = String(formData.get("colaborador_id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  if (!colaboradorId) voltar("erro", "Escolha a pessoa.");
  if (!nome) voltar("erro", "Dê um nome ao perfil.");

  // Só o que a pessoa tem NESTA revenda. Um perfil pertence a uma
  // revenda; copiar junto o que ela tem na outra montaria um "Analista de
  // Rota" de São Félix com as permissões de Barreiras dentro.
  const { data: permissoes } = await admin
    .from("lideranca_permissoes")
    .select("modulo, acao")
    .eq("colaborador_id", colaboradorId)
    .eq("revenda_id", revendaId);

  const concessoes = apenasValidas((permissoes ?? []) as Concessao[]);
  if (concessoes.length === 0) {
    voltar("erro", "Esta pessoa não tem nenhuma permissão para virar perfil.");
  }

  const { data, error } = await admin
    .from("perfis_acesso")
    .insert({
      revenda_id: revendaId,
      nome,
      descricao: "Criado a partir das permissões de uma pessoa.",
      criado_por: perfil?.id ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    voltar(
      "erro",
      error.code === "23505" ? `Já existe um perfil chamado "${nome}".` : `Não foi possível criar: ${error.message}`,
    );
  }

  const { error: erroPerm } = await admin
    .from("perfil_permissoes")
    .insert(concessoes.map((c) => ({ perfil_id: data?.id, modulo: c.modulo, acao: c.acao })));

  // Falhou a cópia: o perfil não pode ficar. Ele já está gravado neste
  // ponto, e sem as permissões vira uma casca -- "Analista de Controle,
  // 0 permissão(ões)" -- que ninguém sabe se é para usar, consertar ou
  // apagar. Foi o que sobrou na tela em 02/09/2026, quando a trava de
  // `acao` recusou a permissão "promover" (ver migration 089). Desfazer
  // aqui é o que faz a tentativa não deixar rastro.
  if (erroPerm) {
    await admin.from("perfis_acesso").delete().eq("id", data?.id);
    voltar("erro", `Não foi possível copiar as permissões: ${erroPerm.message}`);
  }

  // Quem serviu de molde entra no perfil, e é o único que entra.
  //
  // Não é dedução: a pessoa foi escolhida por quem criou, e ela tem
  // exatamente estas permissões -- foi delas que o perfil saiu. O que a
  // tela NÃO faz mais é preencher a lista sozinha com todo mundo que por
  // acaso tenha as mesmas concessões (ver migration 091).
  await admin.from("perfil_pessoas").upsert(
    {
      perfil_id: data?.id,
      colaborador_id: colaboradorId,
      revenda_id: revendaId,
      aplicado_por: perfil?.id ?? null,
    },
    { onConflict: "perfil_id,colaborador_id" },
  );

  revalidatePath(ROTA);
  voltar("sucesso", `Perfil "${nome}" criado com ${concessoes.length} permissão(ões).`, `&perfil=${data?.id}`);
}

/**
 * Tira a pessoa da lista do perfil -- e SÓ isso.
 *
 * As permissões dela ficam exatamente como estão, e a tela diz isso ao
 * lado do botão. Foi a escolha do dono (03/09/2026) entre desvincular e
 * "desvincular tirando o acesso junto", e é a escolha certa: quem é
 * conferente E administra o Jornal perderia o Jornal se ele estivesse nos
 * dois perfis, sem que ninguém tivesse pedido isso.
 *
 * Tirar acesso continua sendo em Acessos por Pessoa, onde a remoção é
 * explícita e quem remove vê tudo o que a pessoa tem.
 */
export async function tirarDoPerfil(formData: FormData) {
  await requireModulo("perfis-acesso", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const perfilId = String(formData.get("perfil_id") ?? "");
  const colaboradorId = String(formData.get("colaborador_id") ?? "");
  if (!perfilId || !colaboradorId) voltar("erro", "Vínculo inválido.");

  const { error } = await admin
    .from("perfil_pessoas")
    .delete()
    .eq("perfil_id", perfilId)
    .eq("colaborador_id", colaboradorId)
    .eq("revenda_id", revendaId);

  if (error) voltar("erro", `Não foi possível tirar do perfil: ${error.message}`);

  revalidatePath(ROTA);
  voltar(
    "sucesso",
    "Tirado do perfil. As permissões da pessoa continuam as mesmas — para removê-las, use Acessos por Pessoa.",
    `&perfil=${perfilId}`,
  );
}

/**
 * Aplica um perfil a uma pessoa, de um de dois jeitos.
 *
 * SOMAR acrescenta e não tira nada. ESPELHAR deixa a pessoa igual ao
 * perfil: acrescenta o que falta e retira o que sobra.
 *
 * Por muito tempo só existiu o somar, com um motivo bom: uma tela que
 * tira acesso sem ninguém pedir queima a confiança de quem usa. Só que a
 * pergunta do dono (02/09/2026) expôs o outro lado -- ele chamou a
 * operação de "espelhar" antes mesmo de existir o modo, porque é isso que
 * a palavra "perfil" promete. Aplicar "Analista de Rota" e a pessoa
 * continuar com sobras de outro cargo não é aplicar um perfil, é somar
 * duas listas.
 *
 * Os dois modos existem porque nenhum serve sempre: quem acumula funções
 * (o supervisor que também administra o Jornal) precisa do somar, e é
 * justamente essa pessoa que o espelhar prejudicaria em silêncio. Por
 * isso o espelhar não é silencioso -- a tela lista, nome por nome, o que
 * vai sair, e a confirmação é sobre essa lista.
 *
 * O que o espelhar NUNCA toca: as permissões das outras revendas (o
 * `revenda_id` está nos dois lados da conta) e o papel de quem é owner.
 *
 * Papel: quem recebe um perfil vira "lideranca", porque sem isso as
 * concessões não fazem efeito nenhum -- `podeFazer` só as consulta para
 * esse papel. Quem já é owner não é rebaixado.
 */
export async function aplicarPerfil(formData: FormData) {
  await requireModulo("perfis-acesso", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const quemAplica = await getPerfil();
  const admin = createAdminClient();

  const perfilId = String(formData.get("perfil_id") ?? "");
  const colaboradorId = String(formData.get("colaborador_id") ?? "");
  // Espelhar é o modo que TIRA, então ele precisa ser pedido por escrito.
  // Qualquer outra coisa que chegue aqui -- campo ausente, valor
  // estranho, requisição montada à mão -- cai no somar, que não desfaz
  // nada.
  const espelhar = String(formData.get("modo") ?? "") === "espelhar";
  if (!perfilId || !colaboradorId) voltar("erro", "Escolha o perfil e a pessoa.");

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
  if (concessoes.length === 0) voltar("erro", "Este perfil não tem nenhuma permissão.");
  if (!alvo) voltar("erro", "Pessoa não encontrada.");

  // O que a pessoa tem e o perfil não tem. Só isto sai, e só no espelhar.
  const noPerfil = new Set(concessoes.map((c) => `${c.modulo}:${c.acao}`));
  const sobrando = ((jaTem ?? []) as Concessao[]).filter(
    (c) => !noPerfil.has(`${c.modulo}:${c.acao}`),
  );

  // A `revenda_id` vai escrita e vai no onConflict. As duas coisas pela
  // mesma razao: a chave de lideranca_permissoes deixou de ser
  // (colaborador, modulo, acao) na migration 021 e passou a ser
  // (colaborador, REVENDA, modulo, acao) -- justamente para a mesma
  // pessoa poder ter acessos diferentes em Sao Felix e em Barreiras.
  //
  // Sem ela aqui aconteciam duas coisas: o Postgres recusava o upsert
  // inteiro ("no unique or exclusion constraint matching the ON CONFLICT
  // specification", 02/09/2026, ao espelhar o perfil de Analista de
  // Rota), e a linha, se tivesse entrado, cairia na revenda do DEFAULT
  // da coluna -- Sao Felix -- mesmo com Barreiras aberta na tela.
  const { error } = await admin.from("lideranca_permissoes").upsert(
    concessoes.map((c) => ({
      colaborador_id: colaboradorId,
      revenda_id: revendaId,
      modulo: c.modulo,
      acao: c.acao,
      concedido_por: quemAplica?.id ?? null,
    })),
    { onConflict: "colaborador_id,revenda_id,modulo,acao" },
  );
  if (error) voltar("erro", `Não foi possível aplicar: ${error.message}`);

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
      .or(
        sobrando
          .map((c) => `and(modulo.eq.${c.modulo},acao.eq.${c.acao})`)
          .join(","),
      );
    if (erroTirar) {
      voltar(
        "erro",
        `As permissões do perfil foram gravadas, mas não consegui retirar as que sobravam: ${erroTirar.message}`,
        `&perfil=${perfilId}`,
      );
    }
    retiradas = sobrando.length;
  }

  // Sem o papel de liderança as concessões ficam inertes: podeFazer só as
  // consulta para esse papel. Owner nunca é rebaixado.
  if (alvo.role !== "owner" && alvo.role !== "admin" && alvo.role !== "lideranca") {
    await admin.from("profiles").update({ role: "lideranca" }).eq("id", colaboradorId);
  }

  // O vínculo é o que a tela mostra em "Quem tem este perfil". Fica
  // gravado, com data e autor, em vez de ser deduzido de quem "tem todas
  // as permissões" -- dedução que colocava todo administrador dentro de
  // todo perfil pequeno (ver migration 091).
  await admin.from("perfil_pessoas").upsert(
    {
      perfil_id: perfilId,
      colaborador_id: colaboradorId,
      revenda_id: revendaId,
      aplicado_por: quemAplica?.id ?? null,
    },
    { onConflict: "perfil_id,colaborador_id" },
  );

  revalidatePath(ROTA);
  revalidatePath("/admin/acessos");
  voltar(
    "sucesso",
    espelhar
      ? `${alvo.nome} agora está igual ao perfil: ${concessoes.length} permissão(ões)` +
          (retiradas > 0
            ? `, e ${retiradas} que sobrava(m) foram retiradas.`
            : " — não havia nada sobrando para retirar.")
      : `Perfil somado a ${alvo.nome}: ${concessoes.length} permissão(ões). Nada foi retirado.`,
    `&perfil=${perfilId}`,
  );
}

export async function excluirPerfil(formData: FormData) {
  await requireModulo("perfis-acesso", "excluir");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = String(formData.get("id") ?? "");
  if (!id) voltar("erro", "Perfil inválido.");

  // Apagar o perfil NÃO tira permissão de ninguém: as concessões já foram
  // gravadas em lideranca_permissoes e vivem por conta própria. É por isso
  // que esta exclusão é segura -- e é isso que a tela precisa dizer.
  const { error } = await admin.from("perfis_acesso").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) voltar("erro", `Não foi possível excluir: ${error.message}`);

  revalidatePath(ROTA);
  voltar("sucesso", "Perfil excluído. Quem já recebeu continua com as permissões.");
}
