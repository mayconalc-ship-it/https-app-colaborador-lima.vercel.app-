"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirContextoModulo, subirFotoHorimetro } from "@/lib/produtividade-armazem-server";
import { avaliarHorimetro } from "@/lib/empilhadeira-gas";
import { createAdminClient } from "@/lib/supabase/admin";

const ROTA = "/produtividade-armazem/empilhadeira";

function erro(id: string, mensagem: string): never {
  redirect(`${ROTA}/${id}?erro=${encodeURIComponent(mensagem)}`);
}

const exigirContexto = () => exigirContextoModulo("pa-empilhadeira", ROTA);

/**
 * Última leitura conhecida da máquina: o maior horímetro entre operações
 * e trocas de gás. Serve de referência para recusar salto impossível --
 * a tela já avisa enquanto a pessoa digita, mas esconder o botão nunca
 * foi controle: a régua tem que valer aqui também.
 */
async function ultimoHorimetroDaMaquina(
  empilhadeiraId: string,
  revendaId: string,
): Promise<number | null> {
  const admin = createAdminClient();
  const [{ data: op }, { data: troca }] = await Promise.all([
    admin
      .from("pa_empilhadeira_operacoes")
      .select("horimetro_inicial, horimetro_final")
      .eq("empilhadeira_id", empilhadeiraId)
      .eq("revenda_id", revendaId)
      .order("inicio", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("pa_empilhadeira_trocas_gas")
      .select("horimetro")
      .eq("empilhadeira_id", empilhadeiraId)
      .eq("revenda_id", revendaId)
      .order("realizada_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const valores = [
    op?.horimetro_final ?? op?.horimetro_inicial ?? null,
    troca?.horimetro ?? null,
  ].filter((v): v is number => v !== null && Number.isFinite(Number(v)));

  return valores.length > 0 ? Math.max(...valores.map(Number)) : null;
}

/** Recusa o que não pode ser real. Erro de digitação vira dado ruim para
 *  sempre -- e dado ruim num indicador destrói a confiança na tela toda. */
async function exigirHorimetroPlausivel(
  empilhadeiraId: string,
  revendaId: string,
  informado: number,
) {
  const ultimo = await ultimoHorimetroDaMaquina(empilhadeiraId, revendaId);
  const avaliacao = avaliarHorimetro(informado, ultimo);
  if (avaliacao.nivel === "impossivel") erro(empilhadeiraId, avaliacao.mensagem);
}

/**
 * Abre uma operação. A trava de verdade é o índice único parcial
 * (status = 'aberta') no banco -- mesmo que a página tenha mostrado "livre"
 * um segundo atrás, se OUTRA pessoa abriu no meio do caminho o insert aqui
 * falha com violação de unicidade (23505), e é isso que vira a mensagem de
 * conflito. A UI nunca é a única linha de defesa.
 */
export async function abrirOperacao(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const empilhadeiraId = String(formData.get("empilhadeira_id") ?? "");
  if (!empilhadeiraId) erro(empilhadeiraId, "Empilhadeira inválida.");

  const horimetro = Number(formData.get("horimetro_inicial"));
  if (!Number.isFinite(horimetro) || horimetro < 0) {
    erro(empilhadeiraId, "Informe o horímetro inicial.");
  }

  const foto = formData.get("foto");
  if (!(foto instanceof File) || foto.size === 0) {
    erro(empilhadeiraId, "A foto do horímetro é obrigatória para abrir a operação.");
  }

  await exigirHorimetroPlausivel(empilhadeiraId, revendaId, horimetro);

  const enviada = await subirFotoHorimetro(foto, `${empilhadeiraId}/abertura-${perfil.id}`);
  if (!enviada.ok) erro(empilhadeiraId, enviada.erro);

  const supabase = await createClient();
  const { error } = await supabase.from("pa_empilhadeira_operacoes").insert({
    revenda_id: revendaId,
    empilhadeira_id: empilhadeiraId,
    operador_id: perfil.id,
    operador_nome: perfil.nome,
    horimetro_inicial: horimetro,
    foto_inicial_url: enviada.url,
  });

  if (error) {
    if (error.code === "23505") {
      erro(
        empilhadeiraId,
        "Já existe uma operação aberta nesta empilhadeira. Atualize a página para ver quem está com ela e feche antes de abrir a sua.",
      );
    }
    erro(empilhadeiraId, `Não foi possível abrir a operação: ${error.message}`);
  }

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${empilhadeiraId}`);
  redirect(`${ROTA}/${empilhadeiraId}?sucesso=Operação+aberta`);
}

/**
 * Fecha uma operação -- a própria, ou a de outra pessoa (o caso do José
 * fechando a máquina que o João deixou aberta). A política de RLS libera
 * o update para qualquer colaborador da revenda; aqui é onde se decide se
 * `encerrado_por` entra ou fica nulo.
 */
export async function fecharOperacao(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const operacaoId = String(formData.get("operacao_id") ?? "");
  const empilhadeiraId = String(formData.get("empilhadeira_id") ?? "");
  if (!operacaoId || !empilhadeiraId) erro(empilhadeiraId || "", "Operação inválida.");

  const horimetro = Number(formData.get("horimetro_final"));
  if (!Number.isFinite(horimetro) || horimetro < 0) {
    erro(empilhadeiraId, "Informe o horímetro final.");
  }

  const foto = formData.get("foto");
  if (!(foto instanceof File) || foto.size === 0) {
    erro(empilhadeiraId, "A foto do horímetro final é obrigatória.");
  }

  const supabase = await createClient();
  const { data: op } = await supabase
    .from("pa_empilhadeira_operacoes")
    .select("id, operador_id, operador_nome, horimetro_inicial")
    .eq("id", operacaoId)
    .eq("revenda_id", revendaId)
    .eq("status", "aberta")
    .maybeSingle();

  if (!op) erro(empilhadeiraId, "Esta operação já não está mais aberta.");
  if (horimetro < op.horimetro_inicial) {
    erro(empilhadeiraId, "O horímetro final não pode ser menor que o inicial.");
  }

  const enviada = await subirFotoHorimetro(foto, `${empilhadeiraId}/fechamento-${perfil.id}`);
  if (!enviada.ok) erro(empilhadeiraId, enviada.erro);

  const outraPessoa = op.operador_id !== perfil.id;

  const { error } = await supabase
    .from("pa_empilhadeira_operacoes")
    .update({
      horimetro_final: horimetro,
      foto_final_url: enviada.url,
      fim: new Date().toISOString(),
      status: "encerrada",
      encerrado_por_id: outraPessoa ? perfil.id : null,
      encerrado_por_nome: outraPessoa ? perfil.nome : null,
    })
    .eq("id", operacaoId)
    .eq("revenda_id", revendaId)
    .eq("status", "aberta");

  if (error) erro(empilhadeiraId, `Não foi possível fechar a operação: ${error.message}`);

  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${empilhadeiraId}`);
  redirect(`${ROTA}/${empilhadeiraId}?sucesso=Operação+encerrada`);
}

/**
 * Registra uma troca de gás -- evento único (horímetro + foto), sem
 * abrir/fechar. Pedido explícito: não bloquear uma troca nova por causa
 * da anterior. A única validação rígida é o horímetro não andar para
 * trás -- vira aviso, a troca ainda é salva (é dado real do chão de
 * fábrica; recusar de vez esconderia um horímetro que só foi digitado
 * errado, sem chance de corrigir por aqui).
 */
export async function registrarTrocaGas(formData: FormData) {
  const { perfil, revendaId } = await exigirContexto();

  const empilhadeiraId = String(formData.get("empilhadeira_id") ?? "");
  if (!empilhadeiraId) erro(empilhadeiraId, "Empilhadeira inválida.");

  const horimetro = Number(formData.get("horimetro"));
  if (!Number.isFinite(horimetro) || horimetro < 0) {
    erro(empilhadeiraId, "Informe o horímetro da troca.");
  }

  const foto = formData.get("foto");
  if (!(foto instanceof File) || foto.size === 0) {
    erro(empilhadeiraId, "A foto do horímetro é obrigatória para registrar a troca.");
  }

  await exigirHorimetroPlausivel(empilhadeiraId, revendaId, horimetro);

  const enviada = await subirFotoHorimetro(foto, `${empilhadeiraId}/troca-gas-${perfil.id}`);
  if (!enviada.ok) erro(empilhadeiraId, enviada.erro);

  const supabase = await createClient();

  const { data: ultima } = await supabase
    .from("pa_empilhadeira_trocas_gas")
    .select("horimetro")
    .eq("empilhadeira_id", empilhadeiraId)
    .eq("revenda_id", revendaId)
    .order("realizada_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("pa_empilhadeira_trocas_gas").insert({
    revenda_id: revendaId,
    empilhadeira_id: empilhadeiraId,
    operador_id: perfil.id,
    operador_nome: perfil.nome,
    horimetro,
    foto_url: enviada.url,
  });

  if (error) erro(empilhadeiraId, `Não foi possível salvar a troca: ${error.message}`);

  revalidatePath(`${ROTA}/${empilhadeiraId}`);

  const aviso =
    ultima && horimetro < ultima.horimetro
      ? `&sucesso=${encodeURIComponent(
          `Troca registrada, mas atenção: o horímetro informado (${horimetro}) é menor que o da última troca (${ultima.horimetro}).`,
        )}`
      : "&sucesso=Troca+de+gás+registrada";
  redirect(`${ROTA}/${empilhadeiraId}?${aviso.slice(1)}`);
}
