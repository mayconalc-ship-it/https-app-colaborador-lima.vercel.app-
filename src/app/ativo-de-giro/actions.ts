"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getPerfil } from "@/lib/sessao";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import {
  ehFormato,
  ehStatus,
  ehTipo,
  inteiro,
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
 */
const COOKIE_ULTIMA = "ag_ultima";

async function lembrarCombinacao(tipo: string, formato: string, status: string) {
  const jar = await cookies();
  jar.set(COOKIE_ULTIMA, JSON.stringify({ tipo, formato, status }), {
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 180,
    path: ROTA,
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

  const palete = inteiro(formData.get("palete"));
  const lastro = inteiro(formData.get("lastro"));
  const caixa = inteiro(formData.get("caixa"));

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

/** O que o formulário de lançamento recebe de volta. */
export type EstadoContagem =
  | { situacao: "parado" }
  | { situacao: "ok"; em: number }
  | { situacao: "erro"; mensagem: string };

/**
 * Lanca uma contagem. O autor e sempre quem esta logado -- nunca vem do
 * formulario. A pagina ja barra quem nao tem acesso, mas a acao confere de
 * novo: proteger so a tela deixaria a porta dos fundos aberta.
 *
 * RESPONDE em vez de redirecionar. O redirect de antes forçava uma
 * navegação inteira a cada contagem: layout, cabeçalho, notificações e as
 * cinco consultas da página, tudo de novo, só para mostrar "Contagem
 * registrada". Quem lança quinze seguidas pagava esse pedágio quinze
 * vezes -- era a demora relatada. Agora volta um estado, o `revalidatePath`
 * atualiza a lista em segundo plano e o formulário nem desmonta.
 */
export async function registrarContagem(
  _anterior: EstadoContagem,
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
  const { error } = await supabase.from("ag_contagens").insert({
    ...lido.campos,
    revenda_id: revendaId,
    colaborador_id: perfil.id,
    colaborador_nome: perfil.nome,
  });

  if (error) {
    return { situacao: "erro", mensagem: `Não foi possível salvar: ${error.message}` };
  }

  const { tipo, formato, status } = lido.campos;
  await lembrarCombinacao(tipo, formato, status);

  revalidatePath(ROTA);
  revalidatePath("/admin/ativo-de-giro");
  return { situacao: "ok", em: Date.now() };
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
