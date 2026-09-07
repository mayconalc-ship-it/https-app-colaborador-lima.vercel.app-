"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import {
  ehCodigoValido,
  janelaInvertida,
  normalizarCodPdv,
  normalizarJanelas,
} from "@/lib/pdv-particularidades";
import { buscarPdv, type PdvEncontrado } from "@/lib/pdv-particularidades-server";
import { importarBaseDeClientes } from "@/lib/clientes-base-server";

const ROTA = "/admin/pdv-particularidades";

function voltar(chave: "erro" | "sucesso", mensagem: string, extra = ""): never {
  redirect(`${ROTA}?${chave}=${encodeURIComponent(mensagem)}${extra}`);
}

const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim();

/**
 * IMPORTAR A BASE DE CLIENTES do Drive.
 *
 * Pedido do dono (07/09/2026): "colocaria no Google Drive e incluiria o
 * link no app para fazer a conexão", para o telefone do PDV alimentar o
 * botão do WhatsApp.
 *
 * O link é salvo JUNTO com a importação, num gesto só. Salvar e importar
 * separados dariam dois botões para uma decisão só -- e a metade das vezes
 * alguém salvaria o link sem importar, deixando a tela dizendo "nunca
 * importada" com o link certo na frente.
 *
 * A mensagem conta o que ENTROU e o que FALTOU. "Importado com sucesso"
 * numa base sem a coluna de telefone é a pior resposta possível: tudo
 * parece certo, e o botão do WhatsApp continua abrindo o seletor de
 * contato para todo mundo.
 */
export async function importarClientes(formData: FormData) {
  await requireModulo("pdv-particularidades", "editar");
  const revendaId = await exigirRevenda(ROTA);

  const link = texto(formData, "clientes_link");
  if (!link) voltar("erro", "Cole o link da planilha no Drive.", "&aba=base");

  const r = await importarBaseDeClientes(revendaId, link);
  if (!r.ok) {
    voltar("erro", `Não deu para importar: ${r.erro ?? "motivo desconhecido"}`, "&aba=base");
  }

  const semTelefone = r.gravados - r.comTelefone;
  const recado =
    `${r.gravados} cliente(s) na base, ${r.comTelefone} com telefone` +
    (semTelefone > 0 ? ` e ${semTelefone} sem` : "") +
    (r.semCodigo > 0 ? `. ${r.semCodigo} linha(s) ignorada(s) por não terem código` : "") +
    `. Colunas achadas: ${r.colunasAchadas.join(", ") || "nenhuma"}.` +
    (r.comTelefone === 0
      ? " ⚠️ Nenhum telefone entrou — confira se a planilha tem uma coluna Celular ou Telefone."
      : "");

  revalidatePath(ROTA);
  revalidatePath("/gestao/pdv");
  voltar("sucesso", recado, "&aba=base");
}

/** A busca do combobox. Devolve objeto normal -- é chamada do cliente,
 *  não de um `<form action>`. */
export async function procurarPdv(termo: string): Promise<PdvEncontrado[]> {
  await requireModulo("pdv-particularidades", "ver");
  const revendaId = await exigirRevenda(ROTA);
  try {
    return await buscarPdv(revendaId, termo);
  } catch {
    // Falha de busca vira "nenhum resultado": o campo de código continua
    // aceitando o que a pessoa digitou, e cadastrar não depende de achar.
    return [];
  }
}

/**
 * CADASTRAR UMA PARTICULARIDADE.
 *
 * O CÓDIGO É OBRIGATÓRIO E O RESTO NEGOCIA. Dá para cadastrar um cliente
 * que o Rating nunca viu -- PDV novo, ou que nunca foi avaliado -- e é
 * por isso que a busca é uma ajuda, não uma trava: exigir que o cliente
 * exista na base de avaliações impediria justamente o cadastro do cliente
 * novo, que é quando a particularidade mais importa.
 *
 * AS TRAVAS SAEM DA CATEGORIA, não de uma lista fixa aqui: "PDV
 * bloqueado" exige prazo porque o CADASTRO diz que exige. Regra no
 * código obrigaria um deploy para a operação criar a próxima categoria
 * com prazo.
 */
export async function salvarParticularidade(formData: FormData) {
  await requireModulo("pdv-particularidades", "criar");
  const revendaId = await exigirRevenda(ROTA);
  const eu = await getPerfil();
  const admin = createAdminClient();

  const id = texto(formData, "id");
  const categoriaId = texto(formData, "categoria_id");
  const codigoDigitado = texto(formData, "cod_pdv");
  const codPdv = normalizarCodPdv(codigoDigitado);
  const aviso = texto(formData, "aviso");

  if (!categoriaId) voltar("erro", "Escolha a categoria.");
  if (!codigoDigitado) voltar("erro", "Informe o código do cliente.");
  // A MESMA TRAVA DA TELA, de novo aqui. A tela filtra a digitação, mas
  // tela é sugestão: o formulário é do navegador de quem envia. E o custo
  // de deixar passar é alto e silencioso -- a particularidade fica num
  // cliente que não existe, e nunca casa com o relatório da pré-rota.
  if (!ehCodigoValido(codigoDigitado)) {
    voltar(
      "erro",
      `"${codigoDigitado}" não é um código de cliente — o código é só de números. O nome vai no campo ao lado.`,
    );
  }
  if (!aviso) voltar("erro", "Escreva o aviso — é a frase que o motorista vai ler.");

  const { data: categoria } = await admin
    .from("pa_pdv_categorias")
    .select("id, nome, exige_prazo, exige_horario")
    .eq("id", categoriaId)
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!categoria) voltar("erro", "Categoria não encontrada nesta revenda.");

  const de = texto(formData, "de") || null;
  const ate = texto(formData, "ate") || null;

  // AS JANELAS VÊM COMO LISTAS PARALELAS -- `janela_de[i]` casa com
  // `janela_ate[i]` --, que é como o HTML manda campos repetidos. A
  // limpeza (vazias fora, repetidas fora, em ordem) é a mesma função que
  // a leitura usa, para o que se grava e o que se lê nunca divergirem.
  const janelasDe = formData.getAll("janela_de").map(String);
  const janelasAte = formData.getAll("janela_ate").map(String);
  const janelas = normalizarJanelas(
    janelasDe.map((d, i) => ({ de: d, ate: janelasAte[i] ?? null })),
  );

  const invertida = janelas.find(janelaInvertida);
  if (invertida) {
    voltar(
      "erro",
      `O horário ${invertida.de} às ${invertida.ate} fecha antes de abrir. Confira a faixa.`,
    );
  }

  if (categoria.exige_prazo && !ate) {
    voltar(
      "erro",
      `"${categoria.nome}" exige a data de liberação — sem ela o cadastro vira um bloqueio eterno que ninguém revisa.`,
    );
  }
  if (categoria.exige_horario && janelas.length === 0) {
    voltar("erro", `"${categoria.nome}" exige ao menos um horário.`);
  }
  if (de && ate && ate < de) voltar("erro", "A data final é anterior à inicial.");

  const dias = formData
    .getAll("dias_semana")
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);

  const linha = {
    revenda_id: revendaId,
    categoria_id: categoriaId,
    cod_pdv: codPdv,
    nome_pdv: texto(formData, "nome_pdv") || null,
    cidade: texto(formData, "cidade") || null,
    bairro: texto(formData, "bairro") || null,
    aviso,
    detalhe: texto(formData, "detalhe") || null,
    janelas,
    dias_semana: dias.length > 0 && dias.length < 7 ? dias : null,
    de,
    ate,
    origem: texto(formData, "origem") === "rating" ? "rating" : "manual",
  };

  const { error } = id
    ? await admin
        .from("pa_pdv_particularidades")
        .update(linha)
        .eq("id", id)
        .eq("revenda_id", revendaId)
    : await admin.from("pa_pdv_particularidades").insert({
        ...linha,
        criado_por: eu?.id ?? null,
        criado_por_nome: eu?.nome ?? null,
      });

  if (error) {
    // 23505 = o índice parcial: já existe uma ATIVA desta categoria neste
    // cliente. Não é falha, é a trava evitando dois avisos iguais na tela
    // do motorista.
    if (error.code === "23505") {
      voltar(
        "erro",
        `Este cliente já tem uma particularidade ativa de "${categoria.nome}". Edite a que existe, ou resolva-a antes de abrir outra.`,
      );
    }
    voltar("erro", `Não foi possível salvar: ${error.message}`);
  }

  revalidatePath(ROTA);
  voltar("sucesso", id ? "Particularidade atualizada." : `Particularidade cadastrada para o cliente ${codPdv}.`);
}

/**
 * RESOLVER -- e é este o caminho normal, não o apagar.
 *
 * A linha vira histórico: é ela que responde "esse cliente já ficou
 * bloqueado antes?" da próxima vez, e é ela que mostra ao auditor que o
 * bloqueio foi tratado, e quando. Apagar deixaria a tela limpa e a
 * pergunta sem resposta.
 */
export async function resolverParticularidade(formData: FormData) {
  await requireModulo("pdv-particularidades", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const eu = await getPerfil();
  const admin = createAdminClient();

  const id = texto(formData, "id");
  if (!id) voltar("erro", "Particularidade inválida.");

  const { error } = await admin
    .from("pa_pdv_particularidades")
    .update({
      status: "resolvida",
      resolvido_em: new Date().toISOString(),
      resolvido_por_nome: eu?.nome ?? null,
      resolucao: texto(formData, "resolucao") || null,
    })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) voltar("erro", `Não foi possível resolver: ${error.message}`);

  revalidatePath(ROTA);
  voltar("sucesso", "Particularidade resolvida. Ela sai da rota e fica no histórico do cliente.");
}

/** Reabrir: o bloqueio voltou, ou alguém resolveu por engano. */
export async function reabrirParticularidade(formData: FormData) {
  await requireModulo("pdv-particularidades", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = texto(formData, "id");
  if (!id) voltar("erro", "Particularidade inválida.");

  const { error } = await admin
    .from("pa_pdv_particularidades")
    .update({ status: "ativa", resolvido_em: null, resolvido_por_nome: null, resolucao: null })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) {
    if (error.code === "23505") {
      voltar("erro", "Já existe outra particularidade ativa desta categoria neste cliente.");
    }
    voltar("erro", `Não foi possível reabrir: ${error.message}`);
  }

  revalidatePath(ROTA);
  voltar("sucesso", "Particularidade reaberta.");
}

/** Apagar existe para o erro de digitação, e a tela diz isso. */
export async function excluirParticularidade(formData: FormData) {
  await requireModulo("pdv-particularidades", "excluir");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const id = texto(formData, "id");
  if (!id) voltar("erro", "Particularidade inválida.");

  const { error } = await admin
    .from("pa_pdv_particularidades")
    .delete()
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) voltar("erro", `Não foi possível apagar: ${error.message}`);

  revalidatePath(ROTA);
  voltar("sucesso", "Particularidade apagada.");
}

/**
 * AS CATEGORIAS -- uma tela, um Salvar.
 *
 * Onze categorias com seis campos cada dariam sessenta e seis botões se
 * cada uma salvasse sozinha. É a grade de campos do mesmo assunto que o
 * dono já apontou duas vezes: um Salvar só, no fim.
 */
export async function salvarCategorias(formData: FormData) {
  await requireModulo("pdv-particularidades", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const admin = createAdminClient();

  const ids = formData.getAll("categoria_id").map(String).filter(Boolean);
  for (const id of ids) {
    const severidade = String(formData.get(`severidade__${id}`) ?? "atencao");
    const { error } = await admin
      .from("pa_pdv_categorias")
      .update({
        nome: String(formData.get(`nome__${id}`) ?? "").trim(),
        emoji: String(formData.get(`emoji__${id}`) ?? "").trim() || null,
        ajuda: String(formData.get(`ajuda__${id}`) ?? "").trim() || null,
        severidade: ["info", "atencao", "critico"].includes(severidade) ? severidade : "atencao",
        exige_prazo: formData.get(`exige_prazo__${id}`) === "on",
        exige_horario: formData.get(`exige_horario__${id}`) === "on",
        mensagem_modelo: String(formData.get(`mensagem__${id}`) ?? "").trim() || null,
        alerta_na_rota: formData.get(`alerta_na_rota__${id}`) === "on",
        ativo: formData.get(`ativo__${id}`) === "on",
      })
      .eq("id", id)
      .eq("revenda_id", revendaId);
    if (error) voltar("erro", `Não foi possível salvar as categorias: ${error.message}`, "&aba=categorias");
  }

  // A categoria nova vem no fim do mesmo formulário -- cadastrar não pode
  // custar uma segunda tela.
  const nova = String(formData.get("nova_nome") ?? "").trim();
  if (nova) {
    const severidade = String(formData.get("nova_severidade") ?? "atencao");
    const { error } = await admin.from("pa_pdv_categorias").insert({
      revenda_id: revendaId,
      nome: nova,
      emoji: String(formData.get("nova_emoji") ?? "").trim() || null,
      ajuda: String(formData.get("nova_ajuda") ?? "").trim() || null,
      severidade: ["info", "atencao", "critico"].includes(severidade) ? severidade : "atencao",
      exige_prazo: formData.get("nova_exige_prazo") === "on",
      exige_horario: formData.get("nova_exige_horario") === "on",
      alerta_na_rota: formData.get("nova_alerta_na_rota") === "on",
      ordem: 99,
    });
    if (error) {
      if (error.code === "23505") {
        voltar("erro", `Já existe uma categoria chamada "${nova}".`, "&aba=categorias");
      }
      voltar("erro", `Não foi possível criar a categoria: ${error.message}`, "&aba=categorias");
    }
  }

  revalidatePath(ROTA);
  voltar("sucesso", "Categorias salvas.", "&aba=categorias");
}

/**
 * DISPENSAR UMA SUGESTÃO do Rating.
 *
 * Grava uma particularidade RESOLVIDA, e não uma tabela de "dispensados":
 * o efeito é o mesmo (a sugestão some da lista, porque a lista exclui
 * quem já tem linha de origem 'rating') e o registro fica no histórico do
 * cliente, dizendo que alguém olhou e decidiu que não era caso. Uma
 * tabela só para guardar "não" seria mais uma coisa para manter.
 */
export async function dispensarSugestao(formData: FormData) {
  await requireModulo("pdv-particularidades", "editar");
  const revendaId = await exigirRevenda(ROTA);
  const eu = await getPerfil();
  const admin = createAdminClient();

  const codPdv = normalizarCodPdv(texto(formData, "cod_pdv"));
  const categoriaId = texto(formData, "categoria_id");
  if (!codPdv || !categoriaId) voltar("erro", "Sugestão inválida.", "&aba=sugestoes");

  const { error } = await admin.from("pa_pdv_particularidades").insert({
    revenda_id: revendaId,
    categoria_id: categoriaId,
    cod_pdv: codPdv,
    nome_pdv: texto(formData, "nome_pdv") || null,
    cidade: texto(formData, "cidade") || null,
    aviso: texto(formData, "aviso") || "Sugestão dispensada.",
    origem: "rating",
    status: "resolvida",
    criado_por: eu?.id ?? null,
    criado_por_nome: eu?.nome ?? null,
    resolvido_em: new Date().toISOString(),
    resolvido_por_nome: eu?.nome ?? null,
    resolucao: "Dispensada sem virar aviso de rota.",
  });
  if (error) voltar("erro", `Não foi possível dispensar: ${error.message}`, "&aba=sugestoes");

  revalidatePath(ROTA);
  voltar("sucesso", `Sugestão do cliente ${codPdv} dispensada.`, "&aba=sugestoes");
}
