"use server";

import { redirect } from "next/navigation";
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
 * A contagem pertence à revenda em que a pessoa está contando. O parque de
 * AG é físico e fica num pátio só -- somar as duas unidades daria um saldo
 * que não existe em lugar nenhum.
 */
async function exigirRevendaAG() {
  const revendaId = await getRevendaId();
  if (!revendaId) erro("Você não está em nenhuma revenda.");
  return revendaId;
}

function lerCampos(formData: FormData) {
  const data = String(formData.get("data") ?? "");
  const tipo = formData.get("tipo");
  const formato = formData.get("formato");
  const status = formData.get("status");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) erro("Data inválida.");
  if (!ehTipo(tipo)) erro("Tipo inválido.");
  if (!ehFormato(formato)) erro("Formato inválido.");
  if (!ehStatus(status)) erro("Status inválido.");

  const palete = inteiro(formData.get("palete"));
  const lastro = inteiro(formData.get("lastro"));
  const caixa = inteiro(formData.get("caixa"));

  if (palete + lastro + caixa === 0) {
    erro("Informe ao menos um palete, lastro ou caixa.");
  }

  return { data, tipo, formato, status, palete, lastro, caixa };
}

/**
 * Lanca uma contagem. O autor e sempre quem esta logado -- nunca vem do
 * formulario. A pagina ja barra quem nao tem acesso, mas a acao confere de
 * novo: proteger so a tela deixaria a porta dos fundos aberta.
 */
export async function registrarContagem(formData: FormData) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  if (!(await temAcessoModulo("ativo-giro"))) {
    erro("Você não tem acesso a este módulo. Fale com o Admin.");
  }

  const campos = lerCampos(formData);

  const revendaId = await exigirRevendaAG();

  const supabase = await createClient();
  const { error } = await supabase.from("ag_contagens").insert({
    ...campos,
    revenda_id: revendaId,
    colaborador_id: perfil.id,
    colaborador_nome: perfil.nome,
  });

  if (error) erro(`Não foi possível salvar: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath("/admin/ativo-de-giro");
  redirect(`${ROTA}?sucesso=Contagem+registrada`);
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

  const campos = lerCampos(formData);
  const gestor = await podeNoModulo("ativo-giro", "editar");

  const revendaId = await exigirRevendaAG();

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
