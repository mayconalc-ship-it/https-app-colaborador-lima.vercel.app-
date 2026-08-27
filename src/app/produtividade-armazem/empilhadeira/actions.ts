"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { comprimirParaWebp, exigirContextoModulo, subirFotoHorimetro } from "@/lib/produtividade-armazem-server";
import { ehMediaTypeAceito, lerHorimetroNaFoto, ocrHorimetroConfigurado } from "@/lib/empilhadeira-ocr";
import { registrarUsoIA } from "@/lib/ia-uso";
import { getRevendaId } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";

const ROTA = "/produtividade-armazem/empilhadeira";

function erro(id: string, mensagem: string): never {
  redirect(`${ROTA}/${id}?erro=${encodeURIComponent(mensagem)}`);
}

const exigirContexto = () => exigirContextoModulo("pa-empilhadeira", ROTA);

/**
 * Lê o horímetro na foto ANTES do formulário ser enviado -- o campo de
 * horímetro se pré-preenche com o valor lido, e o operador só confere
 * (pode corrigir à mão se a leitura vier errada ou vazia). Chamada direto
 * do componente cliente quando a foto é escolhida, não de um `<form
 * action>` -- por isso devolve um objeto normal em vez de redirecionar.
 *
 * Silenciosa de propósito: sem chave de IA configurada, ou se a leitura
 * falhar por qualquer motivo, devolve "não deu para ler" em vez de erro --
 * o campo continua digitável na mão, que é como funcionava antes disto
 * existir.
 */
export async function lerHorimetroDaFoto(
  formData: FormData,
): Promise<{ legivel: boolean; valor: number | null }> {
  const perfil = await getPerfil();
  if (!perfil) return { legivel: false, valor: null };
  if (!ocrHorimetroConfigurado()) return { legivel: false, valor: null };

  const foto = formData.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return { legivel: false, valor: null };

  try {
    const { dados, contentType } = await comprimirParaWebp(foto);
    if (!ehMediaTypeAceito(contentType)) return { legivel: false, valor: null };

    const leitura = await lerHorimetroNaFoto(dados, contentType);
    const revendaId = await getRevendaId();
    await registrarUsoIA({
      recurso: "leitura_horimetro",
      modelo: "claude-haiku-4-5",
      revendaId,
      colaboradorId: perfil.id,
      entrada: leitura.custo.entrada,
      saida: leitura.custo.saida,
    });

    return { legivel: leitura.legivel, valor: leitura.valor };
  } catch {
    return { legivel: false, valor: null };
  }
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
