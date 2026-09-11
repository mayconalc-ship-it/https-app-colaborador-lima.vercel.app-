"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { requireModulo } from "@/lib/require-admin";
import { getPerfil } from "@/lib/sessao";
import { MODULOS, MODULOS_OPCIONAIS, ehOwner } from "@/lib/acessos";
import { lerConcessoesDoFormulario, type Concessao } from "@/lib/perfis-acesso";
import { alcanceDe, mesclarNoAlcance } from "@/lib/gestao-de-acessos";
import { gerenciaAcessos, permissoesNaRevenda } from "@/lib/gestao-de-acessos-server";
import {
  aplicarPerfilA,
  propagarPerfil,
  tipoDoPerfil,
  type TipoDePerfil,
} from "@/lib/perfis-acesso-server";

/** Os módulos do app marcados no formulário (`app-<modulo>`), só os que
 *  existem de verdade na lista de módulos liberáveis por pessoa. */
function lerModulosDoApp(formData: FormData): string[] {
  const saida: string[] = [];
  for (const [campo] of formData.entries()) {
    if (!campo.startsWith("app-")) continue;
    const modulo = campo.slice("app-".length);
    if ((MODULOS_OPCIONAIS as readonly string[]).includes(modulo)) saida.push(modulo);
  }
  return [...new Set(saida)];
}

const ROTA = "/admin/perfis-de-acesso";

function voltar(chave: "erro" | "sucesso", mensagem: string, extra = ""): never {
  redirect(`${ROTA}?${chave}=${encodeURIComponent(mensagem)}${extra}`);
}

/**
 * AS TRAVAS DE QUEM NÃO É O ADMIN (11/09/2026).
 *
 * Perfis de Acesso é delegável (`perfis-acesso`), e até aqui bastava ter
 * o "editar" para montar um perfil com QUALQUER permissão -- inclusive a
 * gestão de acessos -- e aplicá-lo a alguém. Era um caminho para dar mais
 * do que se tem. Agora vale o mesmo ALCANCE de Acessos por Pessoa
 * (lib/gestao-de-acessos): só entra o que a própria pessoa tem nesta
 * revenda, e nunca a gestão de acessos.
 *
 * `alcance` nulo é o Admin: nada muda para ele.
 */
async function alcanceDeQuemEdita(revendaId: string) {
  const eu = await getPerfil();
  if (!eu) voltar("erro", "Sessão expirada. Entre de novo.");
  if (ehOwner(eu.role)) return { eu, dono: true, alcance: null as Set<string> | null };
  return { eu, dono: false, alcance: alcanceDe(await permissoesNaRevenda(eu.id, revendaId)) as Set<string> | null };
}

const chave = (c: Concessao) => `${c.modulo}:${c.acao}`;
const daChave = (k: string): Concessao => {
  const corte = k.lastIndexOf(":");
  return { modulo: k.slice(0, corte), acao: k.slice(corte + 1) };
};

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
 *
 * E SALVAR ALCANÇA QUEM JÁ TEM O PERFIL (07/09/2026, pedido do dono).
 * Antes o molde e as pessoas viviam separados: acrescentar uma permissão
 * ao "Analista de Rota" não alcançava analista nenhum, e quem salvava saía
 * da tela achando que tinha alcançado. Era preciso reaplicar o perfil a
 * cada um, um por um, sabendo de cor quem já o tinha.
 *
 * A propagação ESPELHA: entra o que foi marcado, sai o que foi desmarcado.
 * Enquanto ela só acrescentava, desmarcar era um gesto sem efeito -- o
 * molde dizia uma coisa e as pessoas continuavam com outra.
 *
 * O que a retirada NUNCA alcança é o que os OUTROS perfis da pessoa
 * concedem: salvar um molde não pode derrubar em silêncio o que outro
 * molde sustenta. Sai só a concessão solta, marcada à mão em Acessos por
 * Pessoa, e a grade lista nominalmente quem perde o quê antes do clique.
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

  /*
    O TIPO É ESCOLHIDO NA CRIAÇÃO E NÃO MUDA DEPOIS (10/09/2026).

    Trocar o tipo de um perfil que já tem gente mudaria de uma vez o
    significado do acesso de todas essas pessoas -- de "vê no app" para
    "gerencia no Modo Liderança", ou o contrário. Quem quer o outro tipo
    cria outro perfil. Por isso, na edição, o tipo vem do banco e o campo
    do formulário é ignorado.
  */
  let tipo: TipoDePerfil =
    String(formData.get("tipo") ?? "") === "colaborador" ? "colaborador" : "lideranca";
  if (id) tipo = await tipoDoPerfil(id);

  const doFormulario =
    tipo === "lideranca" ? apenasValidas(lerConcessoesDoFormulario(formData.entries())) : [];
  const modulosApp = tipo === "colaborador" ? lerModulosDoApp(formData) : [];

  /*
    O ALCANCE NO MOLDE (11/09/2026). Para quem não é o Admin, o perfil de
    liderança só ganha ou perde o que ela mesma tem nesta revenda; o que já
    estava no molde fora desse alcance fica como está (a caixa aparece
    travada na tela, e uma caixa travada nem chega pelo formulário).

    E SALVAR ALCANÇA QUEM ESTÁ NO PERFIL: se entre essas pessoas houver
    quem também gerencia acessos, o salvar mudaria as permissões dela --
    o que só o Admin faz. Recusa antes de gravar.
  */
  // `meuAlcance`, e não `alcance`: este nome já é o resultado da
  // propagação, mais abaixo.
  const { eu, dono, alcance: meuAlcance } = await alcanceDeQuemEdita(revendaId);
  let concessoes = doFormulario;
  if (!dono && tipo === "lideranca") {
    if (id) {
      const { data: noPerfil } = await admin.from("perfil_pessoas").select("colaborador_id").eq("perfil_id", id);
      for (const p of noPerfil ?? []) {
        if (p.colaborador_id !== eu.id && (await gerenciaAcessos(p.colaborador_id))) {
          voltar(
            "erro",
            "Neste perfil há quem também gerencia acessos, e salvar mudaria as permissões dessa pessoa. Só o Admin altera este molde.",
            `&perfil=${id}`,
          );
        }
      }
    }
    const { data: atuais } = id
      ? await admin.from("perfil_permissoes").select("modulo, acao").eq("perfil_id", id)
      : { data: [] as Concessao[] };
    concessoes = mesclarNoAlcance(
      ((atuais ?? []) as Concessao[]).map(chave),
      doFormulario.map(chave),
      meuAlcance,
    ).map(daChave);
  }

  if (tipo === "lideranca" && concessoes.length === 0) {
    voltar("erro", "Marque ao menos uma permissão -- um perfil vazio não entrega nada a ninguém.");
  }
  if (tipo === "colaborador" && modulosApp.length === 0) {
    voltar("erro", "Marque ao menos um módulo do app -- um perfil vazio não entrega nada a ninguém.");
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
      .insert({ revenda_id: revendaId, nome, descricao, tipo, criado_por: perfil?.id ?? null })
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

  if (tipo === "lideranca") {
    await admin.from("perfil_permissoes").delete().eq("perfil_id", perfilId);
    const { error: erroPerm } = await admin
      .from("perfil_permissoes")
      .insert(concessoes.map((c) => ({ perfil_id: perfilId, modulo: c.modulo, acao: c.acao })));
    if (erroPerm) voltar("erro", `Não foi possível salvar as permissões: ${erroPerm.message}`);
  } else {
    await admin.from("perfil_modulos_app").delete().eq("perfil_id", perfilId);
    const { error: erroMod } = await admin
      .from("perfil_modulos_app")
      .insert(modulosApp.map((modulo) => ({ perfil_id: perfilId, modulo })));
    if (erroMod) voltar("erro", `Não foi possível salvar os módulos: ${erroMod.message}`);
  }

  const alcance = await propagarPerfil({
    perfilId: perfilId as string,
    revendaId,
    tipo,
    concessoes,
    modulosApp,
    quemAplicaId: perfil?.id ?? null,
  });

  const unidade = tipo === "colaborador" ? "módulo(s) do app" : "permissão(ões)";
  const total = tipo === "colaborador" ? modulosApp.length : concessoes.length;
  let recado = `Perfil "${nome}" salvo com ${total} ${unidade}.`;
  if (alcance.pessoas === 0) {
    recado += " Ninguém está neste perfil ainda — aplique-o a alguém para o molde valer.";
  } else if (alcance.acrescentadas === 0 && alcance.retiradas === 0) {
    recado += ` As ${alcance.pessoas} pessoa(s) deste perfil já estavam iguais ao molde.`;
  } else {
    recado += ` ${alcance.pessoas} pessoa(s) deste perfil agora estão iguais ao molde:`;
    if (alcance.acrescentadas > 0) recado += ` entraram ${alcance.acrescentadas} ${unidade}`;
    if (alcance.acrescentadas > 0 && alcance.retiradas > 0) recado += " e";
    if (alcance.retiradas > 0) {
      // Nome, e não só número: quem perdeu acesso é a informação que faz
      // alguém desfazer a tempo. Três cabem na mensagem; o resto vira
      // contagem, e a lista inteira está na tela.
      recado +=
        ` saíram ${alcance.retiradas} de ${alcance.perderam.slice(0, 3).join(", ")}` +
        (alcance.perderam.length > 3 ? ` e mais ${alcance.perderam.length - 3}` : "");
    }
    recado += ".";
  }

  revalidatePath(ROTA);
  revalidatePath("/admin/acessos");
  voltar("sucesso", recado, `&perfil=${perfilId}`);
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

  // Quem não é o Admin só copia o que ela mesma tem nesta revenda
  // (11/09/2026) -- senão "criar a partir de alguém" seria o atalho para
  // montar um molde maior do que o próprio acesso.
  const { dono, alcance } = await alcanceDeQuemEdita(revendaId);
  if (!dono) {
    const fora = concessoes.filter((c) => !alcance?.has(chave(c)));
    if (fora.length > 0) {
      voltar(
        "erro",
        `Esta pessoa tem ${fora.length} permissão(ões) que você mesmo não tem nesta revenda (ex.: ${chave(fora[0])}). Só o Admin cria um perfil a partir dela.`,
      );
    }
  }

  const { data, error } = await admin
    .from("perfis_acesso")
    .insert({
      revenda_id: revendaId,
      nome,
      descricao: "Criado a partir das permissões de uma pessoa.",
      // Copia permissões de Modo Liderança, então é perfil de liderança.
      tipo: "lideranca",
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
 * PAPEL (10/09/2026, depois do defeito grave do perfil "Motorista"):
 * perfil de COLABORADOR nunca muda o papel. Perfil de LIDERANÇA só promove
 * um colaborador se a caixa "tornar_lideranca" vier marcada -- sem ela, a
 * operação é recusada antes de gravar qualquer coisa (ver aplicarPerfilA).
 */
export async function aplicarPerfil(formData: FormData) {
  await requireModulo("perfis-acesso", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const quemAplica = await getPerfil();

  const perfilId = String(formData.get("perfil_id") ?? "");
  const colaboradorId = String(formData.get("colaborador_id") ?? "");
  // Espelhar é o modo que TIRA, então ele precisa ser pedido por escrito.
  // Qualquer outra coisa que chegue aqui -- campo ausente, valor
  // estranho, requisição montada à mão -- cai no somar, que não desfaz
  // nada.
  const espelhar = String(formData.get("modo") ?? "") === "espelhar";
  if (!perfilId || !colaboradorId) voltar("erro", "Escolha o perfil e a pessoa.");

  // AS TRAVAS DE QUEM NÃO É O ADMIN (11/09/2026) -- as mesmas de aplicar
  // um perfil pela ficha, em Acessos por Pessoa.
  const { eu, dono, alcance } = await alcanceDeQuemEdita(revendaId);
  if (!dono) {
    const volta = `&perfil=${perfilId}`;
    if (colaboradorId === eu.id) {
      voltar("erro", "Você não pode aplicar um perfil em si mesmo: só o Admin altera os seus acessos.", volta);
    }
    if (espelhar) {
      voltar("erro", "Espelhar retira acessos, e isso só o Admin faz. Use Somar.", volta);
    }
    const admin = createAdminClient();
    const [{ data: vinculo }, { data: doPerfil }, { data: perfilDaRevenda }] = await Promise.all([
      admin
        .from("colaborador_revendas")
        .select("revenda_id")
        .eq("colaborador_id", colaboradorId)
        .eq("revenda_id", revendaId)
        .maybeSingle(),
      admin.from("perfil_permissoes").select("modulo, acao").eq("perfil_id", perfilId),
      admin.from("perfis_acesso").select("revenda_id").eq("id", perfilId).maybeSingle(),
    ]);
    if (!vinculo) voltar("erro", "A pessoa não está vinculada a esta revenda.", volta);
    if (perfilDaRevenda?.revenda_id !== revendaId) voltar("erro", "Este perfil não é desta revenda.", volta);
    if (await gerenciaAcessos(colaboradorId)) {
      voltar("erro", "Essa pessoa também gerencia acessos: só o Admin altera os acessos dela.", volta);
    }
    // Perfil de colaborador não tem permissão de liderança nenhuma e passa.
    const fora = ((doPerfil ?? []) as Concessao[]).filter((c) => !alcance?.has(chave(c)));
    if (fora.length > 0) {
      voltar(
        "erro",
        `Este perfil dá ${fora.length} permissão(ões) que você mesmo não tem nesta revenda (ex.: ${chave(fora[0])}). Só o Admin aplica.`,
        volta,
      );
    }
  }

  // A OPERAÇÃO MORA EM lib/perfis-acesso-server.ts desde 06/09/2026,
  // quando a tela de Acessos por Pessoa passou a oferecer o "voltar ao
  // molde": a parte que REMOVE permissão não pode existir em duas cópias.
  const r = await aplicarPerfilA({
    perfilId,
    colaboradorId,
    revendaId,
    espelhar,
    quemAplicaId: quemAplica?.id ?? null,
    // Só vale marcada: qualquer outra coisa -- campo ausente, valor
    // estranho -- é "não promover".
    tornarLideranca: formData.get("tornar_lideranca") === "on",
  });
  if (!r.ok) voltar("erro", r.erro, `&perfil=${perfilId}`);

  const unidade = r.tipo === "colaborador" ? "módulo(s) do app" : "permissão(ões)";
  const papel =
    r.tipo === "colaborador"
      ? " O papel não mudou: continua colaborador."
      : r.promovido
        ? " Agora entra no Modo Liderança."
        : "";

  revalidatePath(ROTA);
  revalidatePath("/admin/acessos");
  voltar(
    "sucesso",
    (espelhar
      ? `${r.nome} agora está igual ao perfil: ${r.concessoes} ${unidade}` +
        (r.retiradas > 0
          ? `, e ${r.retiradas} que sobrava(m) foram retirada(s).`
          : " — não havia nada sobrando para retirar.")
      : `Perfil somado a ${r.nome}: ${r.concessoes} ${unidade}. Nada foi retirado.`) + papel,
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
