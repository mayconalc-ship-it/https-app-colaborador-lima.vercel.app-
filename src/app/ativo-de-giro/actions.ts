"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getPerfil } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { criarOuAgrupar } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import {
  COLUNAS_CONTAGEM,
  COOKIE_ULTIMA,
  COOKIE_ULTIMA_DIAS,
  COOKIE_ULTIMA_PATH,
  ehFormato,
  ehStatus,
  ehTipo,
  inteiro,
  recontagemAtendida,
  rotuloRecontagem,
  serializarCombinacao,
  type Combinacao,
  type Contagem,
} from "@/lib/ativo-giro";

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

  return {
    ok: true as const,
    campos: { data, tipo, formato, status, palete, lastro, caixa },
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

  const { tipo, formato, status } = lido.campos;
  const combinacao: Combinacao = { tipo, formato, status };
  await lembrarCombinacao(combinacao);

  // Fecha pedidos de recontagem que esta linha atende. Silencioso: a
  // contagem já foi salva, e isso não pode ser desfeito por causa de um
  // pedido que não fechou. É a ÚNICA exceção ao "sem revalidatePath" da
  // rota explicado no comentário grande acima -- só corre quando esta
  // linha realmente fecha algum pedido pendente, não a cada lançamento.
  try {
    const admin = createAdminClient();
    const { data: pendentes } = await admin
      .from("ag_recontagens")
      .select("id, tipo, status")
      .eq("revenda_id", revendaId)
      .eq("formato", formato)
      .is("atendida_em", null)
      .is("cancelada_em", null);

    const alvo = (pendentes ?? []).filter((p) =>
      recontagemAtendida(
        {
          tipo: ehTipo(p.tipo) ? p.tipo : null,
          formato,
          status: ehStatus(p.status) ? p.status : null,
        },
        { tipo, formato, status },
      ),
    );

    if (alvo.length > 0) {
      await admin
        .from("ag_recontagens")
        .update({
          atendida_em: new Date().toISOString(),
          atendida_por: perfil.id,
          atendida_contagem_id: gravada.id,
        })
        .in(
          "id",
          alvo.map((a) => a.id),
        );
      revalidatePath(ROTA);
    }
  } catch {
    // idem: avisar é secundário, salvar é o que importa.
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
  const campos = lido.campos;

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
    const { error } = await supabase
      .from("ag_contagens")
      .update(campos)
      .eq("id", id)
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
 * O controle pede para o time recontar um tipo+formato+status, ou deixa
 * tipo e/ou status em branco para pedir o formato inteiro. Mesma
 * permissão de quem edita o parque e os fatores -- é quem confronta as
 * duas contagens e decide o que merece recontagem.
 *
 * Avisa pelo sino (fonte da verdade) e pelo push (toque no ombro de quem
 * está com o app fechado) -- mesmo par usado pelos comunicados.
 */
export async function solicitarRecontagem(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  if (!(await podeNoModulo("ativo-giro", "editar"))) {
    erro("Você não tem permissão para pedir recontagem.");
  }

  const formato = formData.get("formato");
  if (!ehFormato(formato)) erro("Escolha um formato.");

  const tipoBruto = formData.get("tipo");
  const statusBruto = formData.get("status");
  const tipo = ehTipo(tipoBruto) ? tipoBruto : null;
  const status = ehStatus(statusBruto) ? statusBruto : null;
  const observacao =
    String(formData.get("observacao") ?? "").trim().slice(0, 300) || null;

  const revendaId = await exigirRevendaAG();
  const admin = createAdminClient();
  const { error } = await admin.from("ag_recontagens").insert({
    revenda_id: revendaId,
    tipo,
    formato,
    status,
    observacao,
    solicitado_por: perfil.id,
    solicitado_nome: perfil.nome,
  });
  if (error) erro(`Não foi possível pedir a recontagem: ${error.message}`);

  const rotulo = rotuloRecontagem({ tipo, formato, status });
  await criarOuAgrupar({
    modulo: "ativo-giro",
    tipo: "pendencia",
    titulo: "Recontagem solicitada",
    mensagem: `Confira de novo: ${rotulo}`,
    url: "/ativo-de-giro?aba=contagem",
    criadoPor: perfil.id,
  });
  await enviarPushDaRevenda(revendaId, {
    modulo: "ativo-giro",
    titulo: "Recontagem solicitada",
    mensagem: `Confira de novo: ${rotulo}`,
    url: "/ativo-de-giro?aba=contagem",
    exceto: perfil.id,
  });

  revalidatePath(ROTA);
  redirect(`${ROTA}?aba=conciliacao&sucesso=Recontagem+solicitada`);
}

/** Desiste de um pedido antes que alguém o atenda. Mesma permissão de quem pede. */
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
