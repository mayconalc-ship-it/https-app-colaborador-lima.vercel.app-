"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getPerfil } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import {
  COLUNAS_CONTAGEM,
  COOKIE_ULTIMA,
  COOKIE_ULTIMA_DIAS,
  COOKIE_ULTIMA_PATH,
  chave,
  comodatoDeLinhas,
  conciliar,
  ehFormato,
  ehStatus,
  ehTipo,
  fatoresDeLinhas,
  formatarData,
  inteiro,
  juntarParcelas,
  parqueDeLinhas,
  serializarCombinacao,
  transitoDeLinhas,
  type Combinacao,
  type Contagem,
} from "@/lib/ativo-giro";
import { ehOwner } from "@/lib/acessos";

const ROTA = "/ativo-de-giro";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Lembra a última combinação lançada, para o formulário reabrir nela.
 *
 * Quem conta o pátio pega dez, quinze linhas do mesmo tipo e formato
 * seguidas -- muda só a quantidade. Voltar sempre para "Kit AG / 600ml /
 * Cheio" obrigava a refazer as três escolhas a cada linha.
 *
 * Vai em cookie, e não em localStorage, para o SERVIDOR já desenhar o
 * formulário na combinação certa. Com localStorage a tela nasceria no
 * padrão e corrigiria depois de montar -- pisca, e ainda obrigaria a
 * sincronizar estado dentro de um efeito.
 *
 * O formulário grava o MESMO cookie assim que a pessoa troca um seletor,
 * antes mesmo de salvar. Assim, se a tela recarregar no meio do caminho,
 * ela volta na combinação em que a pessoa estava.
 */
async function lembrarCombinacao(combinacao: Combinacao) {
  const jar = await cookies();
  jar.set(COOKIE_ULTIMA, serializarCombinacao(combinacao), {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * COOKIE_ULTIMA_DIAS,
    path: COOKIE_ULTIMA_PATH,
  });
}

/**
 * A contagem pertence à revenda em que a pessoa está contando. O parque de
 * AG é físico e fica num pátio só -- somar as duas unidades daria um saldo
 * que não existe em lugar nenhum.
 */
async function exigirRevendaAG() {
  const revendaId = await getRevendaId();
  if (!revendaId) erro("Você não está em nenhuma revenda.");
  return revendaId;
}

/**
 * Confere o formulário SEM tocar no banco. Devolve o problema em vez de
 * redirecionar: quem chama decide se vira redirect (edição) ou resposta
 * na tela (lançamento). Barato, então roda antes de qualquer consulta --
 * formulário torto não merece ida ao servidor de dados.
 *
 * O tipo do retorno é inferido: os `ehTipo`/`ehFormato`/`ehStatus` já
 * estreitam para as uniões certas, e escrever o tipo à mão só criaria uma
 * segunda fonte de verdade para sair de sincronia depois.
 */
function lerCampos(formData: FormData) {
  const data = String(formData.get("data") ?? "");
  const tipo = formData.get("tipo");
  const formato = formData.get("formato");
  const status = formData.get("status");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false as const, erro: "Data inválida." };
  }
  if (!ehTipo(tipo)) return { ok: false as const, erro: "Tipo inválido." };
  if (!ehFormato(formato)) return { ok: false as const, erro: "Formato inválido." };
  if (!ehStatus(status)) return { ok: false as const, erro: "Status inválido." };

  // `inteiro` LANÇA em valor torto (um "1,5" digitado, por exemplo). Agora
  // que o lançamento acontece em segundo plano, uma exceção aqui viraria
  // uma linha parada na tela com mensagem genérica -- melhor virar erro
  // de campo, com nome e sobrenome.
  let palete: number, lastro: number, caixa: number;
  try {
    palete = inteiro(formData.get("palete"));
    lastro = inteiro(formData.get("lastro"));
    caixa = inteiro(formData.get("caixa"));
  } catch {
    return {
      ok: false as const,
      erro: "Quantidade inválida: use números inteiros, sem vírgula.",
    };
  }

  if (palete + lastro + caixa === 0) {
    return {
      ok: false as const,
      erro: "Informe ao menos um palete, lastro ou caixa.",
    };
  }

  // Presente só quando o lançamento nasce de um pedido de recontagem
  // aceito -- é o que liga esta linha ao pedido, sem precisar adivinhar
  // depois por semelhança de tipo/formato/status.
  const recontagemBruta = formData.get("recontagem_id");
  const recontagemId = recontagemBruta ? Number(recontagemBruta) : null;
  if (recontagemId !== null && !Number.isInteger(recontagemId)) {
    return { ok: false as const, erro: "Recontagem inválida." };
  }

  return {
    ok: true as const,
    campos: {
      data,
      tipo,
      formato,
      status,
      palete,
      lastro,
      caixa,
      recontagem_id: recontagemId,
    },
  };
}

/**
 * O que a tela de lançamento recebe de volta.
 *
 * O sucesso devolve a LINHA que acabou de entrar no banco, com id e tudo.
 * A tela já tinha desenhado essa linha por conta própria (otimista); com
 * a linha de verdade em mãos ela troca a provisória pela definitiva, que
 * aí sim aceita editar e excluir.
 */
export type EstadoContagem =
  | { situacao: "ok"; contagem: Contagem; combinacao: Combinacao }
  | { situacao: "erro"; mensagem: string };

/**
 * Lanca uma contagem. O autor e sempre quem esta logado -- nunca vem do
 * formulario. A pagina ja barra quem nao tem acesso, mas a acao confere de
 * novo: proteger so a tela deixaria a porta dos fundos aberta.
 *
 * RESPONDE em vez de redirecionar, e ninguém espera pela resposta: a tela
 * desenha a linha na hora e esta ação corre atrás. O redirect original
 * forçava uma navegação inteira a cada contagem -- layout, cabeçalho,
 * notificações e as cinco consultas da página, tudo de novo, só para
 * dizer "registrada". Quem lança quinze linhas pagava o pedágio quinze
 * vezes.
 *
 * Por isso também NÃO há `revalidatePath` desta rota aqui: ele obrigaria
 * a resposta a carregar a página inteira de volta, a cada linha, que é o
 * custo que estamos justamente tirando do caminho. Quem decide a hora de
 * ressincronizar é a tela, uma vez só no fim da rajada. A rota é
 * `force-dynamic`, então qualquer visita nova já vem fresca de qualquer
 * jeito -- não há cache velho para alguém encontrar.
 */
export async function registrarContagem(
  formData: FormData,
): Promise<EstadoContagem> {
  // Validação primeiro: é de graça, e formulário torto não merece consulta.
  const lido = lerCampos(formData);
  if (!lido.ok) return { situacao: "erro", mensagem: lido.erro };

  // Em paralelo: as três dependem só da sessão e não uma da outra. Em
  // série somavam três idas ao banco antes de qualquer escrita. O cache()
  // do React garante que `getPerfil` continua sendo uma consulta só,
  // mesmo sendo pedido aqui e lá dentro de `temAcessoModulo`.
  const [perfil, temAcesso, revendaId] = await Promise.all([
    getPerfil(),
    temAcessoModulo("ativo-giro"),
    getRevendaId(),
  ]);

  if (!perfil) return { situacao: "erro", mensagem: "Sua sessão expirou. Entre de novo." };
  if (!temAcesso) {
    return {
      situacao: "erro",
      mensagem: "Você não tem acesso a este módulo. Fale com o Admin.",
    };
  }
  if (!revendaId) {
    return { situacao: "erro", mensagem: "Você não está em nenhuma revenda." };
  }

  const supabase = await createClient();
  // O `select` na volta não é enfeite: é ele que devolve o id, e sem id a
  // linha recém-lançada ficaria na tela sem poder ser editada nem excluída
  // até a próxima sincronização.
  const { data: gravada, error } = await supabase
    .from("ag_contagens")
    .insert({
      ...lido.campos,
      revenda_id: revendaId,
      colaborador_id: perfil.id,
      colaborador_nome: perfil.nome,
    })
    .select(COLUNAS_CONTAGEM)
    .single();

  if (error || !gravada) {
    return {
      situacao: "erro",
      mensagem: `Não foi possível salvar: ${error?.message ?? "resposta vazia do banco"}`,
    };
  }

  const { tipo, formato, status, recontagem_id } = lido.campos;
  const combinacao: Combinacao = { tipo, formato, status };
  await lembrarCombinacao(combinacao);

  // Esta linha nasceu de um pedido de recontagem aceito: fecha o pedido
  // na hora, direto pelo ID -- sem adivinhar por tipo/formato/status/dia,
  // que era o jeito frágil de antes. Silencioso: a contagem já foi salva,
  // e isso não pode ser desfeito por causa de um pedido que não fechou. É
  // a ÚNICA exceção ao "sem revalidatePath" explicado no comentário
  // grande acima -- só corre quando esta linha vem de um pedido.
  if (recontagem_id !== null) {
    try {
      const admin = createAdminClient();
      const { data: pedido } = await admin
        .from("ag_recontagens")
        .update({
          atendida_em: new Date().toISOString(),
          atendida_por: perfil.id,
          atendida_contagem_id: gravada.id,
        })
        .eq("id", recontagem_id)
        .eq("revenda_id", revendaId)
        .is("atendida_em", null)
        .select("id")
        .maybeSingle();

      /*
        A RECONTAGEM SOBREPÕE O QUE JÁ HAVIA SIDO CONTADO.

        Defeito relatado pelo dono (08/09/2026): "o item que foi recontado
        está somando a contagem antiga, deixando o número de contado bem
        acima do que de fato era pra ser. A recontagem, como o nome já diz,
        é pra sobrepor e não somar".

        QUEM DIZ O QUE FOI RECONTADO É ESTA CONTAGEM, não o pedido. Desde a
        migration 028 o pedido é uma frase que alguém escreveu ("conferir o
        600ml") -- `tipo`, `formato` e `status` saíram de lá justamente
        porque três seletores complicavam mais do que ajudavam. Quem tem os
        três exatos é a linha que acabou de ser gravada, e é ela que define
        o que sai da soma: mesmo dia, mesma combinação.

        A RECONTAGEM VEM EM VÁRIAS LINHAS, e é isso que a regra precisa
        respeitar. O pátio é contado pilha por pilha: em 04/09 o mesmo
        "Kit AG · 600ml · Cheio" tinha 17 linhas de três pessoas, e a
        recontagem entrou como outras treze. Sem a exclusão abaixo, a
        segunda linha da recontagem sobreporia a primeira, a terceira
        sobreporia as duas, e no fim sobraria UMA -- a última. O total
        despencaria, com o mesmo tipo de erro que este conserto veio tirar,
        só que para o outro lado.

        Por isso o que sai é o que estava lá ANTES do pedido: as linhas
        deste mesmo pedido ficam todas.

        As antigas NÃO são apagadas: a primeira contagem é a evidência, e a
        diferença entre as duas é o que diz se o problema era contagem ou
        movimento de estoque.

        Só corre se o `pedido` voltar: sem ele, o pedido já estava atendido
        -- outra pessoa chegou antes -- e não há nada a sobrepor.
      */
      if (pedido) {
        await admin
          .from("ag_contagens")
          .update({ substituida_em: new Date().toISOString(), substituida_por: gravada.id })
          .eq("revenda_id", revendaId)
          .eq("data", gravada.data)
          .eq("tipo", gravada.tipo)
          .eq("formato", gravada.formato)
          .eq("status", gravada.status)
          .or(`recontagem_id.is.null,recontagem_id.neq.${recontagem_id}`)
          .is("substituida_em", null);
      }
      revalidatePath(ROTA);
    } catch {
      // idem: avisar é secundário, salvar é o que importa.
    }
  }

  revalidatePath("/admin/ativo-de-giro");
  return { situacao: "ok", contagem: gravada as Contagem, combinacao };
}

/**
 * Edita uma contagem. A RLS ja limita cada pessoa a propria linha; quem
 * tem "editar" no modulo passa pelo service role e alcanca qualquer uma.
 */
export async function editarContagem(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) erro("Contagem inválida.");

  const lido = lerCampos(formData);
  if (!lido.ok) erro(lido.erro);
  // `recontagem_id` fora: a edição corrige o que foi contado, não a que
  // pedido a linha responde -- o formulário de editar nem manda esse
  // campo, e sem excluí-lo aqui um `update` gravaria `null` por cima do
  // vínculo que já existia.
  const { recontagem_id: _ignorado, ...campos } = lido.campos;

  const [gestor, revendaId] = await Promise.all([
    podeNoModulo("ativo-giro", "editar"),
    exigirRevendaAG(),
  ]);

  if (gestor) {
    const admin = createAdminClient();
    // O gestor alcança a contagem de qualquer pessoa, mas só dentro da
    // revenda em que está -- o service role passa por cima da RLS, então
    // esse limite precisa estar aqui.
    const { error } = await admin
      .from("ag_contagens")
      .update(campos)
      .eq("id", id)
      .eq("revenda_id", revendaId);
    if (error) erro(`Não foi possível editar: ${error.message}`);
  } else {
    const supabase = await createClient();
    // A revenda entra aqui pelo mesmo motivo do ramo do gestor: quem tem
    // vínculo com as duas passa pela RLS nas duas, e corrigir a contagem de
    // um pátio estando no outro não é uma correção, é uma troca de lugar.
    const { error } = await supabase
      .from("ag_contagens")
      .update(campos)
      .eq("id", id)
      .eq("revenda_id", revendaId)
      .eq("colaborador_id", perfil.id);
    if (error) erro(`Não foi possível editar: ${error.message}`);
  }

  revalidatePath(ROTA);
  revalidatePath("/admin/ativo-de-giro");
  redirect(`${ROTA}?sucesso=Contagem+atualizada`);
}

export async function excluirContagem(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) erro("Contagem inválida.");

  const gestor = await podeNoModulo("ativo-giro", "excluir");

  if (gestor) {
    const admin = createAdminClient();
    await admin
      .from("ag_contagens")
      .delete()
      .eq("id", id)
      .eq("revenda_id", await exigirRevendaAG());
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("ag_contagens")
      .delete()
      .eq("id", id)
      .eq("revenda_id", await exigirRevendaAG())
      .eq("colaborador_id", perfil.id);
    if (error) erro("Você só pode excluir as suas próprias contagens.");
  }

  revalidatePath(ROTA);
  revalidatePath("/admin/ativo-de-giro");
  redirect(`${ROTA}?sucesso=Contagem+excluída`);
}

/**
 * Importa o historico que estava salvo no navegador do app antigo.
 * Cada linha entra em nome de quem importou, preservando o nome original
 * de quem contou.
 */
export async function importarHistorico(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  if (!(await podeNoModulo("ativo-giro", "criar"))) {
    erro("Você não tem permissão para importar o histórico.");
  }

  let linhas: unknown;
  try {
    linhas = JSON.parse(String(formData.get("json") ?? "[]"));
  } catch {
    erro("O arquivo enviado não é um JSON válido.");
  }
  if (!Array.isArray(linhas)) erro("Formato de arquivo inesperado.");

  const revendaId = await exigirRevendaAG();

  const registros = linhas.map((l) => {
    const c = l as Partial<Contagem> & { conferente?: string };
    if (!ehTipo(c.tipo) || !ehFormato(c.formato) || !ehStatus(c.status)) {
      erro("O arquivo tem uma linha com tipo, formato ou status inválido.");
    }
    return {
      data: String(c.data),
      revenda_id: revendaId,
      colaborador_id: perfil.id,
      colaborador_nome: String(c.colaborador_nome ?? c.conferente ?? "Importado"),
      tipo: c.tipo,
      formato: c.formato,
      status: c.status,
      palete: inteiro(c.palete),
      lastro: inteiro(c.lastro),
      caixa: inteiro(c.caixa),
    };
  });

  if (registros.length === 0) erro("O arquivo não tinha nenhuma contagem.");

  const admin = createAdminClient();
  const { error } = await admin.from("ag_contagens").insert(registros);
  if (error) erro(`Falha ao importar: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/admin/ativo-de-giro");
  redirect(
    `/admin/ativo-de-giro?sucesso=${registros.length}+contagens+importadas`,
  );
}

/**
 * O controle escreve o que precisa ser recontado, em texto livre. Mesma
 * permissão de quem edita o parque e os fatores -- é quem confronta as
 * duas contagens e decide o que merece recontagem.
 *
 * O aviso (sino + push) vai SÓ para quem contou naquele dia, NESTA
 * revenda -- não para a revenda inteira. Recontagem de São Félix não
 * pode acordar o celular de quem está em Barreiras, nem de quem nunca
 * abriu o Ativo de Giro. É por isso que o pedido carrega o `dia`: é o que
 * permite achar essa lista exata em `ag_contagens`.
 */
export async function solicitarRecontagem(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  if (!(await podeNoModulo("ativo-giro", "editar"))) {
    erro("Você não tem permissão para pedir recontagem.");
  }

  const dia = String(formData.get("dia") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) erro("Dia inválido.");

  const descricao = String(formData.get("descricao") ?? "").trim().slice(0, 300);
  if (!descricao) erro("Descreva o que precisa ser recontado.");

  const revendaId = await exigirRevendaAG();
  const admin = createAdminClient();
  const { data: gravada, error } = await admin
    .from("ag_recontagens")
    .insert({
      revenda_id: revendaId,
      dia,
      descricao,
      solicitado_por: perfil.id,
      solicitado_nome: perfil.nome,
    })
    .select("id")
    .single();
  if (error || !gravada) {
    erro(`Não foi possível pedir a recontagem: ${error?.message ?? "resposta vazia do banco"}`);
  }

  // A audiência: quem tem uma contagem NESTE dia, NESTA revenda. Não é a
  // revenda inteira, e não é "quem tem acesso ao módulo" -- é quem estava
  // de fato contando o pátio no dia que gerou a divergência.
  const { data: quemContou } = await admin
    .from("ag_contagens")
    .select("colaborador_id")
    .eq("revenda_id", revendaId)
    .eq("data", dia);

  const alvo = [...new Set((quemContou ?? []).map((c) => c.colaborador_id))].filter(
    (id) => id !== perfil.id,
  );

  if (alvo.length > 0) {
    const titulo = "Recontagem solicitada";
    const mensagem = descricao;

    // Uma linha por destinatário de propósito -- ao contrário do resto do
    // sino (uma linha para a revenda inteira), este aviso É dirigido, e
    // uma linha compartilhada não teria como saber quem já viu o quê.
    await Promise.all(
      alvo.map((colaboradorId) =>
        criarNotificacao({
          modulo: "ativo-giro",
          tipo: "pendencia",
          titulo,
          mensagem,
          url: "/ativo-de-giro?aba=contagem",
          referenciaId: gravada.id,
          criadoPor: perfil.id,
          destinatarioId: colaboradorId,
        }),
      ),
    );

    await enviarPushDaRevenda(revendaId, {
      modulo: "ativo-giro",
      titulo,
      mensagem,
      url: "/ativo-de-giro?aba=contagem",
      apenas: alvo,
    });
  }

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=conciliacao&sucesso=Recontagem+solicitada`);
}

/**
 * Desiste de um pedido antes que alguém o atenda -- mata o pedido para
 * TODO MUNDO. Mesma permissão de quem pede. Diferente de
 * `dispensarRecontagem`, que é pessoal e não mexe no pedido em si.
 */
export async function cancelarRecontagem(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  if (!(await podeNoModulo("ativo-giro", "editar"))) {
    erro("Você não tem permissão para cancelar recontagens.");
  }

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) erro("Recontagem inválida.");

  const revendaId = await exigirRevendaAG();
  const admin = createAdminClient();
  const { error } = await admin
    .from("ag_recontagens")
    .update({ cancelada_em: new Date().toISOString() })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) erro(`Não foi possível cancelar: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=conciliacao&sucesso=Recontagem+cancelada`);
}

/**
 * "Não é comigo": tira o cartão só da tela de QUEM DISPENSOU. O pedido
 * continua de pé para o resto do time e para o controle -- ao contrário
 * de `cancelarRecontagem`, que é do controle e mata para todo mundo.
 *
 * Qualquer um com acesso ao módulo dispensa o próprio cartão -- não
 * precisa de "editar": recusar uma tarefa não é administrar o módulo.
 *
 * Chamada direto pelo gesto de arrastar, não por um `<form action>` --
 * por isso NÃO redireciona nem lança: a tela já tirou o cartão da frente
 * de forma otimista, e um redirect aqui só atrapalharia recarregando a
 * página por baixo do gesto.
 */
export async function dispensarRecontagem(id: number): Promise<void> {
  const perfil = await getPerfil();
  if (!perfil || !Number.isInteger(id)) return;
  if (!(await temAcessoModulo("ativo-giro"))) return;

  const admin = createAdminClient();
  await admin.from("ag_recontagens_dispensas").upsert(
    { colaborador_id: perfil.id, recontagem_id: id },
    { onConflict: "colaborador_id,recontagem_id" },
  );

  revalidatePath(ROTA);
}

// -------------------- TRANSITO DO DIA --------------------
/**
 * Quem pode lancar o transito nesta revenda.
 *
 * Liberacao propria, gerida na configuracao do Ativo de Giro (ver
 * migration 093). Quem administra o modulo tambem pode, sem precisar se
 * liberar: seria uma volta inutil, e ele ja pode mexer no parque, que e
 * o outro lado da mesma conta.
 */
export async function podeLancarTransito(): Promise<boolean> {
  const perfil = await getPerfil();
  const revendaId = await getRevendaId();
  if (!perfil || !revendaId) return false;

  if (await podeNoModulo("ativo-giro", "editar")) return true;

  const admin = createAdminClient();
  const { data } = await admin
    .from("ag_transito_liberados")
    .select("colaborador_id")
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .maybeSingle();

  return Boolean(data);
}

/**
 * Lanca (ou corrige) o transito do dia INTEIRO -- todos os tipos e
 * formatos de uma vez, com UM botao so.
 *
 * Um "Salvar" por linha seria oito botoes numa tela onde a pessoa
 * preenche as oito e quer sair: ela salva a primeira, a tela recarrega,
 * ela perde onde estava, salva a segunda... Oito idas ao servidor para
 * um trabalho unico. E ainda deixa o estado pela metade se ela desistir
 * no meio -- metade do transito lancado e metade nao, com a conciliacao
 * mostrando um numero que nao e nem o antigo nem o novo.
 *
 * UMA LINHA POR DIA no banco, entao relancar CORRIGE em vez de somar. E
 * o mesmo desenho do parque, e evita a duvida que aparece em toda tela
 * de lancamento repetido: "digitei duas vezes, dobrou?".
 *
 * A conferencia de permissao acontece AQUI, no servidor, e nao so na
 * tela: o formulario some para quem nao pode, mas a acao pode ser
 * chamada sem passar por ele.
 */
export async function salvarTransito(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  const revendaId = await getRevendaId();
  if (!revendaId) erro("Voce nao esta em nenhuma revenda.");

  if (!(await podeLancarTransito())) {
    erro("Voce nao tem liberacao para lancar o transito. Fale com quem cuida do Ativo de Giro.");
  }

  const data = String(formData.get("data") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) erro("Dia invalido.");

  // Arrays paralelos: o tipo e o formato vao escondidos ao lado de cada
  // campo, e o FormData preserva a ordem. Mesmo padrao dos itens do
  // Recebimento.
  const tipos = formData.getAll("tipo").map(String);
  const formatos = formData.getAll("formato").map(String);
  const rotas = formData.getAll("transito_rota");
  const carretas = formData.getAll("transito_carreta");

  if (
    tipos.length !== formatos.length ||
    tipos.length !== rotas.length ||
    tipos.length !== carretas.length
  ) {
    erro("Formulario incompleto -- recarregue a tela e tente de novo.");
  }

  const linhas = tipos.map((tipo, i) => {
    const formato = formatos[i];
    if (!ehTipo(tipo) || !ehFormato(formato)) erro("Item invalido no formulario.");
    return {
      revenda_id: revendaId,
      data,
      tipo,
      formato,
      transito_rota: inteiro(rotas[i], 1_000_000),
      transito_carreta: inteiro(carretas[i], 1_000_000),
      atualizado_em: new Date().toISOString(),
      atualizado_por: perfil.id,
      atualizado_por_nome: perfil.nome,
    };
  });

  if (linhas.length === 0) erro("Nada para salvar.");

  const admin = createAdminClient();
  // Um upsert com todas as linhas: ou o dia inteiro entra, ou nada entra.
  const { error } = await admin
    .from("ag_transito")
    .upsert(linhas, { onConflict: "revenda_id,data,tipo,formato" });

  if (error) erro(`Nao foi possivel salvar o transito: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=conciliacao&data=${data}&sucesso=${encodeURIComponent("Transito do dia salvo")}`);
}

/**
 * Salva o COMODATO -- que nao e do dia, e vale ate alguem mudar.
 *
 * Nao leva data de proposito. Palavras do dono: "comodato pode manter o
 * dos outros dias, e somente quando houver necessidade a controle
 * modifica". Se ele fosse lancado por dia, alguem redigitaria o mesmo
 * numero toda manha -- e no dia em que esquecesse, o comodato viraria
 * zero e a conciliacao acusaria uma falta que nao existe.
 *
 * Mesmo desenho do parque, e com o mesmo preco: mudar o comodato hoje
 * muda tambem o que a conciliacao dos dias anteriores mostra. Para a
 * janela de semanas que a tela cobre isso e honesto -- e e por isso que
 * o historico nao volta anos.
 */
export async function salvarComodato(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  const revendaId = await getRevendaId();
  if (!revendaId) erro("Voce nao esta em nenhuma revenda.");

  if (!(await podeLancarTransito())) {
    erro("Voce nao tem liberacao para mexer no comodato. Fale com quem cuida do Ativo de Giro.");
  }

  const tipos = formData.getAll("tipo").map(String);
  const formatos = formData.getAll("formato").map(String);
  const quantidades = formData.getAll("quantidade");

  if (tipos.length !== formatos.length || tipos.length !== quantidades.length) {
    erro("Formulario incompleto -- recarregue a tela e tente de novo.");
  }

  const linhas = tipos.map((tipo, i) => {
    const formato = formatos[i];
    if (!ehTipo(tipo) || !ehFormato(formato)) erro("Item invalido no formulario.");
    return {
      revenda_id: revendaId,
      tipo,
      formato,
      quantidade: inteiro(quantidades[i], 1_000_000),
      atualizado_em: new Date().toISOString(),
      atualizado_por: perfil.id,
      atualizado_por_nome: perfil.nome,
    };
  });

  if (linhas.length === 0) erro("Nada para salvar.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("ag_comodato")
    .upsert(linhas, { onConflict: "revenda_id,tipo,formato" });

  if (error) erro(`Nao foi possivel salvar o comodato: ${error.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=conciliacao&sucesso=${encodeURIComponent("Comodato atualizado")}`);
}

/**
 * Quem pode CONGELAR a conciliacao do dia (12/09/2026): quem administra o
 * modulo, ou quem esta na lista da configuracao do AG. Mesmo desenho do
 * transito -- a controladoria se libera ali, sem chamado ao Admin.
 */
export async function podeCongelar(): Promise<boolean> {
  const perfil = await getPerfil();
  const revendaId = await getRevendaId();
  if (!perfil || !revendaId) return false;

  if (await podeNoModulo("ativo-giro", "editar")) return true;

  const admin = createAdminClient();
  const { data } = await admin
    .from("ag_congelar_liberados")
    .select("colaborador_id")
    .eq("revenda_id", revendaId)
    .eq("colaborador_id", perfil.id)
    .maybeSingle();

  return Boolean(data);
}

/**
 * CONGELA A CONCILIACAO DO DIA -- a oficial, a unica que vai para o BI
 * (pedido do dono, 12/09/2026).
 *
 * O SERVIDOR REFAZ A CONTA, e nao confia em numero vindo da tela: le as
 * contagens, o parque, o transito, o comodato e o valor da caixa e roda o
 * mesmo `conciliar()` da aba Conciliacao. O que se grava e exatamente o
 * que a tela mostrava.
 *
 * UM CONFERENTE: cada um conta o patio inteiro, e somar dois deu 131% do
 * parque em 29/08. Com mais de uma pessoa no dia, a tela obriga a
 * escolher -- e aqui a mesma regra e cobrada de novo.
 *
 * Congelado, fica: nao se congela por cima. Reabrir e so do Admin.
 */
export async function congelarConciliacao(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  const revendaId = await getRevendaId();
  if (!revendaId) erro("Voce nao esta em nenhuma revenda.");

  if (!(await podeCongelar())) {
    erro("Voce nao tem liberacao para congelar a conciliacao. Fale com quem cuida do Ativo de Giro.");
  }

  const data = String(formData.get("data") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) erro("Dia invalido.");
  const colab = String(formData.get("colab") ?? "").trim();
  const voltar = (chaveMsg: "erro" | "sucesso", msg: string): never =>
    redirect(
      `${ROTA}?aba=conciliacao&data=${data}&colab=${encodeURIComponent(colab)}&${chaveMsg}=${encodeURIComponent(msg)}`,
    );

  const admin = createAdminClient();
  const { data: ja } = await admin
    .from("ag_congelamentos")
    .select("congelado_por_nome")
    .eq("revenda_id", revendaId)
    .eq("data", data)
    .maybeSingle();
  if (ja) {
    voltar(
      "erro",
      `O dia ${formatarData(data)} ja esta congelado${ja.congelado_por_nome ? ` (por ${ja.congelado_por_nome})` : ""}. Para mudar, o Admin precisa reabrir.`,
    );
  }

  const [
    { data: contagensBanco },
    { data: fatoresBanco },
    { data: parqueBanco },
    { data: transitoBanco },
    { data: comodatoBanco },
    { data: valoresBanco },
  ] = await Promise.all([
    admin.from("ag_contagens").select(COLUNAS_CONTAGEM).eq("revenda_id", revendaId).eq("data", data),
    admin.from("ag_fatores").select("formato, palete, lastro").eq("revenda_id", revendaId),
    admin.from("ag_parque").select("tipo, formato, quantidade").eq("revenda_id", revendaId),
    admin
      .from("ag_transito")
      .select("tipo, formato, transito_rota, transito_carreta")
      .eq("revenda_id", revendaId)
      .eq("data", data),
    admin.from("ag_comodato").select("tipo, formato, quantidade").eq("revenda_id", revendaId),
    admin.from("ag_valores").select("tipo, formato, valor_caixa").eq("revenda_id", revendaId),
  ]);

  const doDia = (contagensBanco ?? []) as unknown as Contagem[];
  const pessoas = [...new Set(doDia.map((c) => c.colaborador_id))];
  const conferente = colab || (pessoas.length === 1 ? pessoas[0] : "");
  if (!conferente) {
    voltar("erro", "Mais de uma pessoa contou neste dia: escolha de quem e a contagem antes de congelar.");
  }
  const doConferente = doDia.filter((c) => c.colaborador_id === conferente);
  if (doConferente.length === 0) voltar("erro", "Essa pessoa nao tem contagem neste dia.");

  const linhas = conciliar(
    doConferente,
    parqueDeLinhas(parqueBanco),
    fatoresDeLinhas(fatoresBanco),
    juntarParcelas(transitoDeLinhas(transitoBanco), comodatoDeLinhas(comodatoBanco)),
  );
  if (linhas.length === 0) voltar("erro", "Nada para congelar neste dia.");

  // Valor zero e "ainda nao precificado": grava nulo, para o BI nao dizer
  // que o ativo nao vale nada.
  const valorPorItem = new Map(
    ((valoresBanco ?? []) as { tipo: string; formato: string; valor_caixa: number }[])
      .filter((v) => Number(v.valor_caixa) > 0)
      .map((v) => [chave(v.tipo, v.formato), Number(v.valor_caixa)]),
  );

  const nomeConferente = doConferente[0].colaborador_nome;
  const { error: erroCabecalho } = await admin.from("ag_congelamentos").insert({
    revenda_id: revendaId,
    data,
    conferente_id: conferente,
    conferente_nome: nomeConferente,
    congelado_por: perfil.id,
    congelado_por_nome: perfil.nome,
  });
  if (erroCabecalho) voltar("erro", `Nao foi possivel congelar: ${erroCabecalho.message}`);

  const { error: erroItens } = await admin.from("ag_congelamento_itens").insert(
    linhas.map((l) => ({
      revenda_id: revendaId,
      data,
      tipo: l.tipo,
      formato: l.formato,
      contado: Math.round(l.contado),
      transito_rota: l.rota,
      transito_carreta: l.carreta,
      comodato: l.comodato,
      parque: l.parque,
      valor_caixa: valorPorItem.get(chave(l.tipo, l.formato)) ?? null,
    })),
  );
  if (erroItens) {
    // Sem os itens o cabecalho sozinho seria um dia "congelado" vazio no
    // BI. Desfaz e avisa.
    await admin.from("ag_congelamentos").delete().eq("revenda_id", revendaId).eq("data", data);
    voltar("erro", `Nao foi possivel congelar: ${erroItens.message}`);
  }

  await admin.from("auditoria").insert({
    ator_id: perfil.id,
    ator_nome: perfil.nome,
    acao: "Congelou a conciliacao do AG",
    alvo_id: conferente,
    alvo_nome: nomeConferente,
    detalhes: `Dia ${formatarData(data)} — ${linhas.length} item(ns), contagem de ${nomeConferente}`,
    revenda_id: revendaId,
  });

  revalidatePath(ROTA);
  voltar("sucesso", `Conciliacao de ${formatarData(data)} congelada. E ela que vai para o BI.`);
}

/** REABRE um dia congelado -- so o Admin (decisao do dono, 12/09/2026). */
export async function reabrirConciliacao(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  if (!ehOwner(perfil.role)) erro("So o Admin reabre um dia congelado.");

  const revendaId = await getRevendaId();
  if (!revendaId) erro("Voce nao esta em nenhuma revenda.");

  const data = String(formData.get("data") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) erro("Dia invalido.");

  const admin = createAdminClient();
  const { data: congelado } = await admin
    .from("ag_congelamentos")
    .select("conferente_nome, congelado_por_nome")
    .eq("revenda_id", revendaId)
    .eq("data", data)
    .maybeSingle();
  if (!congelado) erro("Este dia nao esta congelado.");

  // Os itens vao junto (on delete cascade na migration 116).
  const { error } = await admin
    .from("ag_congelamentos")
    .delete()
    .eq("revenda_id", revendaId)
    .eq("data", data);
  if (error) erro(`Nao foi possivel reabrir: ${error.message}`);

  await admin.from("auditoria").insert({
    ator_id: perfil.id,
    ator_nome: perfil.nome,
    acao: "Reabriu a conciliacao do AG",
    detalhes: `Dia ${formatarData(data)} — era a contagem de ${congelado.conferente_nome}, congelada por ${congelado.congelado_por_nome ?? "?"}`,
    revenda_id: revendaId,
  });

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?aba=conciliacao&data=${data}&sucesso=${encodeURIComponent(`Dia ${formatarData(data)} reaberto. Ele sai do BI ate ser congelado de novo.`)}`,
  );
}
