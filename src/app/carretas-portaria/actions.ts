"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirContextoCarretas } from "@/lib/carretas-server";

const ROTA = "/carretas-portaria";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

function notasDoFormulario(formData: FormData, tipo: "produto" | "remessa") {
  const numeros = formData.getAll(`nf_${tipo}_numero`).map(String);
  const series = formData.getAll(`nf_${tipo}_serie`).map(String);
  return numeros
    .map((numero, i) => ({ tipo, numero: numero.trim(), serie: (series[i] ?? "").trim() }))
    .filter((n) => n.numero && n.serie);
}

export async function registrarAtendimento(formData: FormData) {
  const { perfil, revendaId } = await exigirContextoCarretas("carretas-portaria", ROTA);

  const fabricaId = String(formData.get("fabrica_id") ?? "");
  const transportadoraId = String(formData.get("transportadora_id") ?? "");
  const numeroDt = String(formData.get("numero_dt") ?? "").trim();
  const motoristaNome = String(formData.get("motorista_nome") ?? "").trim();
  const placaCavalo = String(formData.get("placa_cavalo") ?? "").trim().toUpperCase();
  const placaCarreta = String(formData.get("placa_carreta") ?? "").trim().toUpperCase();
  const cargaAgendada = formData.get("carga_agendada") === "on";
  const agendamentoLocal = String(formData.get("agendamento_em") ?? "");

  if (!fabricaId) erro("Escolha o fornecedor/fábrica.");
  if (!transportadoraId) erro("Escolha o transportador.");
  if (!numeroDt) erro("Informe o número da DT.");
  if (!motoristaNome) erro("Informe o nome do motorista.");
  if (!placaCavalo) erro("Informe a placa do cavalo.");
  if (!placaCarreta) erro("Informe a placa da carreta.");

  let agendamentoEm: string | null = null;
  if (cargaAgendada) {
    if (!agendamentoLocal) erro("Informe a data/hora do agendamento.");
    const data = new Date(agendamentoLocal);
    if (Number.isNaN(data.getTime())) erro("Data/hora do agendamento inválida.");
    agendamentoEm = data.toISOString();
  }

  const notasProduto = notasDoFormulario(formData, "produto");
  const notasRemessa = notasDoFormulario(formData, "remessa");
  if (notasProduto.length === 0) erro("Informe ao menos uma NF produto.");
  if (notasRemessa.length === 0) erro("Informe ao menos uma NF remessa.");

  const supabase = await createClient();
  const { data: atendimento, error } = await supabase
    .from("atendimentos_carretas")
    .insert({
      revenda_id: revendaId,
      fabrica_id: fabricaId,
      transportadora_id: transportadoraId,
      numero_dt: numeroDt,
      motorista_nome: motoristaNome,
      agendamento_em: agendamentoEm,
      carga_agendada: cargaAgendada,
      placa_cavalo: placaCavalo,
      placa_carreta: placaCarreta,
      portaria_colaborador_id: perfil.id,
      portaria_nome: perfil.nome,
    })
    .select("id")
    .single();

  if (error || !atendimento) {
    erro(`Não foi possível registrar a chegada: ${error?.message ?? "resposta vazia do banco"}`);
  }

  const { error: erroNotas } = await supabase.from("atendimento_carretas_notas").insert(
    [...notasProduto, ...notasRemessa].map((n) => ({
      revenda_id: revendaId,
      atendimento_id: atendimento.id,
      tipo: n.tipo,
      numero: n.numero,
      serie: n.serie,
    })),
  );
  if (erroNotas) erro(`Chegada registrada, mas as notas fiscais falharam: ${erroNotas.message}`);

  revalidatePath(ROTA);
  redirect(`${ROTA}?sucesso=Chegada+registrada.+A+carreta+entrou+no+monitor`);
}
