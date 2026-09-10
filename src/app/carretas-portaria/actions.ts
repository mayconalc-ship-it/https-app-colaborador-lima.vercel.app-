"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirContextoCarretas } from "@/lib/carretas-server";
import { temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { datetimeLocalParaUTC } from "@/lib/comunicados";
import { decidirBlitzDaChegada } from "@/lib/blitz-server";

const ROTA = "/carretas-portaria";

function erro(mensagem: string): never {
  redirect(`${ROTA}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Cadastro rápido de motorista, direto do "+" no campo da Portaria
 * (pedido do dono, 27/08/2026) -- sem sair da tela de registrar chegada.
 * Mesma validação do cadastro em Admin (nome completo + CPF de 11
 * dígitos), mas com o gate mais permissivo de quem já pode registrar
 * atendimento aqui (não exige o "produtividade-armazem:editar" completo
 * que o cadastro do Admin pede -- senão o porteiro comum não conseguiria
 * usar o botão).
 *
 * Devolve um objeto normal (nunca redireciona): é chamado direto do
 * componente cliente, não de um `<form action>`.
 */
export async function criarMotoristaRapido(
  formData: FormData,
): Promise<{ ok: true; valor: string; rotulo: string } | { ok: false; erro: string }> {
  if (!(await temAcessoModulo("carretas-portaria"))) {
    return { ok: false, erro: "Sem permissão para cadastrar motorista." };
  }
  const revendaId = await getRevendaId();
  if (!revendaId) return { ok: false, erro: "Você não está em nenhuma revenda." };

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { ok: false, erro: "Informe o nome do motorista." };
  if (nome.split(/\s+/).filter(Boolean).length < 2) {
    return { ok: false, erro: "Informe o nome completo do motorista." };
  }
  const cpf = String(formData.get("cpf") ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) return { ok: false, erro: "Informe um CPF válido, com 11 dígitos." };

  // QUEM CADASTROU sai da sessão, não de um campo: digitado, ele aceitaria
  // qualquer nome, e a auditoria valeria o que vale o campo (ver 110).
  const perfil = await getPerfil();
  if (!perfil) return { ok: false, erro: "Sessão expirada. Entre de novo." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pa_motoristas")
    .insert({
      revenda_id: revendaId,
      nome,
      cpf,
      criado_por: perfil.id,
      criado_por_nome: perfil.nome,
    })
    .select("id, nome")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, erro: "Já existe um motorista cadastrado com esse nome." };
    return { ok: false, erro: `Não foi possível cadastrar: ${error.message}` };
  }

  revalidatePath(ROTA);
  // O VALOR É O ID desde 10/09/2026: o campo passou a aceitar só motorista
  // cadastrado, e o que o servidor confere no registro da chegada é o id.
  return { ok: true, valor: data.id, rotulo: data.nome };
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
  const motoristaId = String(formData.get("motorista_id") ?? "").trim();
  const placaCavalo = String(formData.get("placa_cavalo") ?? "").trim().toUpperCase();
  const placaCarreta = String(formData.get("placa_carreta") ?? "").trim().toUpperCase();
  const cargaAgendada = formData.get("carga_agendada") === "on";
  const agendamentoLocal = String(formData.get("agendamento_em") ?? "");

  if (!fabricaId) erro("Escolha o fornecedor/fábrica.");
  if (!transportadoraId) erro("Escolha o transportador.");
  if (!numeroDt) erro("Informe o número da DT.");
  if (!motoristaId) {
    erro("Escolha o motorista da lista. Se ele não estiver lá, cadastre pelo + no campo.");
  }
  if (!placaCavalo) erro("Informe a placa do cavalo.");

  /*
    O MOTORISTA TEM QUE ESTAR NO CADASTRO (10/09/2026, pedido do dono).

    Conferido AQUI, no servidor, e não só na tela: a trava do formulário é
    cortesia, e um envio que chegue sem ela -- aba antiga aberta desde
    antes da mudança, formulário montado à mão -- não pode gravar nome
    solto de novo.

    Três condições, e cada uma fecha um buraco: o id existe, é DESTA
    revenda (o motorista de Barreiras não entra numa chegada de São
    Félix), e está ATIVO (desativar no Modo Liderança tem de tirar a
    pessoa da portaria de verdade, não só da lista).

    O nome gravado é o do CADASTRO, não o que veio do formulário: é o que
    garante que "Ivan santana" e "IVAN SANTANA" não virem duas pessoas no
    histórico.
  */
  const { data: motorista } = await createAdminClient()
    .from("pa_motoristas")
    .select("id, nome")
    .eq("id", motoristaId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .maybeSingle();
  if (!motorista) {
    erro("Este motorista não está no cadastro (ou foi desativado). Escolha da lista ou cadastre pelo +.");
  }
  const motoristaNome = motorista.nome as string;
  if (!placaCarreta) erro("Informe a placa da carreta.");

  // datetime-local não carrega fuso -- new Date(string) sozinho seria
  // interpretado no fuso do SERVIDOR (UTC na Vercel), não no de quem
  // digitou, gravando 3h a menos do horário informado. datetimeLocalParaUTC
  // (lib/comunicados.ts) já resolve isso certo (Brasil fixo em UTC-3).
  let agendamentoEm: string | null = null;
  if (cargaAgendada) {
    if (!agendamentoLocal) erro("Informe a data/hora do agendamento.");
    const iso = datetimeLocalParaUTC(agendamentoLocal);
    if (!iso) erro("Data/hora do agendamento inválida.");
    agendamentoEm = iso;
  }

  const notasProduto = notasDoFormulario(formData, "produto");
  const notasRemessa = notasDoFormulario(formData, "remessa");
  if (notasProduto.length === 0) erro("Informe ao menos uma NF produto.");
  if (notasRemessa.length === 0) erro("Informe ao menos uma NF remessa.");
  if (notasProduto.some((n) => !/^\d+$/.test(n.numero))) {
    erro("NF produto aceita só números -- confira o número digitado.");
  }
  if (notasRemessa.some((n) => !/^\d+$/.test(n.numero))) {
    erro("NF remessa aceita só números -- confira o número digitado.");
  }

  const supabase = await createClient();
  const { data: atendimento, error } = await supabase
    .from("atendimentos_carretas")
    .insert({
      revenda_id: revendaId,
      fabrica_id: fabricaId,
      transportadora_id: transportadoraId,
      numero_dt: numeroDt,
      motorista_id: motorista.id,
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

  const blitz = await marcarBlitz(atendimento.id, revendaId, {
    placaCarreta,
    motorista: motoristaNome,
    transportadoraId,
  });

  revalidatePath(ROTA);
  redirect(
    `${ROTA}?sucesso=${encodeURIComponent(
      blitz
        ? `Chegada registrada. 🚨 BLITZ: ${blitz} O conferente recebe o checklist na tela da carreta.`
        : "Chegada registrada. A carreta entrou no monitor",
    )}`,
  );
}

/**
 * A DECISÃO DA BLITZ, na chegada -- e ela nunca derruba a chegada.
 *
 * Tudo aqui está dentro de um try: a portaria registrando carreta é a
 * porta da operação, e uma consulta de histórico que falhe não pode
 * impedir o caminhão de entrar. Falhou, a carreta entra sem blitz -- que é
 * o mesmo estado de antes de o módulo existir.
 *
 * O RESULTADO É CONGELADO NA COLUNA. Recalcular quando o conferente abre a
 * tela deixaria a marca ir e vir conforme outras cargas entram na média,
 * e o checklist sumiria da mão de quem já começou.
 *
 * Devolve o motivo quando cai, para a portaria saber na hora -- é ela que
 * fala com o motorista.
 */
async function marcarBlitz(
  atendimentoId: string,
  revendaId: string,
  chegada: { placaCarreta: string; motorista: string; transportadoraId: string },
): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data: transportadora } = await admin
      .from("pa_transportadoras")
      .select("nome")
      .eq("id", chegada.transportadoraId)
      .maybeSingle();

    const decisao = await decidirBlitzDaChegada(revendaId, {
      placaCarreta: chegada.placaCarreta,
      motorista: chegada.motorista,
      transportadoraNome: transportadora?.nome ?? null,
    });
    if (!decisao.cai) return null;

    const { error } = await admin
      .from("atendimentos_carretas")
      .update({ blitz_exigida: true })
      .eq("id", atendimentoId);
    if (error) return null;

    return decisao.motivo;
  } catch {
    return null;
  }
}
