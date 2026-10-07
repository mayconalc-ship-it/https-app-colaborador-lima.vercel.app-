"use server";

import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { avisoDoPeriodo, dataBR, hojeIso, type ConfigPesquisa } from "@/lib/pesquisa";

function voltar(chave: "erro" | "sucesso" | "aviso", mensagem: string): never {
  redirect(`/admin/pesquisa?${chave}=${encodeURIComponent(mensagem)}`);
}

function texto(formData: FormData, campo: string) {
  return ((formData.get(campo) as string) || "").trim();
}

/**
 * "Deu certo" só quando a pesquisa ficou mesmo no ar (06/10/2026). Ligada
 * e fora do período, a ação salvou -- mas ninguém vê, e dizer só "salvo"
 * foi o que fez o dono achar que o ciclo tinha começado.
 */
function voltarConferindo(cfg: ConfigPesquisa, sucesso: string): never {
  const aviso = avisoDoPeriodo(cfg, hojeIso());
  if (aviso) voltar("aviso", `${sucesso.replace(/\.$/, "")}, mas a pesquisa NÃO está no ar. ${aviso}`);
  voltar("sucesso", sucesso);
}

export async function salvarConfigPesquisa(formData: FormData) {
  await requireModulo("pesquisa", "editar");

  const ciclo = texto(formData, "ciclo");
  const titulo = texto(formData, "titulo") || "Pesquisa de satisfação";
  const inicio = texto(formData, "inicio") || null;
  const fim = texto(formData, "fim") || null;

  if (!/^\d{4}-\d{2}$/.test(ciclo)) {
    voltar("erro", "O ciclo precisa estar no formato AAAA-MM. Ex: 2026-08");
  }
  if (inicio && fim && fim < inicio) {
    voltar("erro", "A data final não pode ser antes da inicial.");
  }

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/pesquisa");

  // Upsert: numa revenda nova a linha de configuração ainda não existe.
  const { data: salva, error } = await admin
    .from("pesquisa_config")
    .upsert(
      {
        revenda_id: revendaId,
        ciclo,
        titulo,
        inicio,
        fim,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "revenda_id" },
    )
    .select("ativa, inicio, fim, ciclo, titulo")
    .single();

  if (error) voltar("erro", error.message);
  voltarConferindo(salva as ConfigPesquisa, "Configuração salva.");
}

export async function alternarPesquisa(formData: FormData) {
  await requireModulo("pesquisa", "editar");

  const ligar = formData.get("ligar") === "true";
  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/pesquisa");

  const { data: salva, error } = await admin
    .from("pesquisa_config")
    .update({ ativa: ligar, atualizado_em: new Date().toISOString() })
    .eq("revenda_id", revendaId)
    .select("ativa, inicio, fim, ciclo, titulo")
    .single();

  if (error) voltar("erro", error.message);
  if (!ligar) voltar("sucesso", "Pesquisa desativada.");
  voltarConferindo(
    salva as ConfigPesquisa,
    "Pesquisa ativada. Ela aparece no próximo acesso de cada colaborador.",
  );
}

/**
 * Começa um ciclo novo.
 *
 * Não apaga nada: apenas troca o valor do ciclo. As respostas antigas ficam
 * guardadas com o ciclo em que foram dadas, e todo mundo volta a poder
 * responder -- porque a trava de duplicidade é por (pessoa + ciclo).
 *
 * O PERÍODO VEM JUNTO (06/10/2026). Antes, iniciar o ciclo trocava só o
 * mês e herdava as datas do ciclo anterior: começar Outubro com o período
 * de Setembro deixava a pesquisa ligada e invisível, com mensagem de
 * sucesso. Agora o formulário traz as datas, e período já encerrado é
 * recusado.
 */
export async function novoCiclo(formData: FormData) {
  await requireModulo("pesquisa", "editar");

  const ciclo = texto(formData, "novo_ciclo");
  const inicio = texto(formData, "novo_inicio") || null;
  const fim = texto(formData, "novo_fim") || null;
  if (!/^\d{4}-\d{2}$/.test(ciclo)) {
    voltar("erro", "Informe o ciclo no formato AAAA-MM. Ex: 2026-09");
  }
  if (inicio && fim && fim < inicio) {
    voltar("erro", "A data final não pode ser antes da inicial.");
  }
  if (fim && fim < hojeIso()) {
    voltar(
      "erro",
      `A data final (${dataBR(fim)}) já passou — o ciclo nasceria encerrado e ninguém veria a pesquisa. Escolha uma data final de hoje em diante.`,
    );
  }

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/pesquisa");

  const { data: atual } = await admin
    .from("pesquisa_config")
    .select("ciclo")
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (atual?.ciclo === ciclo) {
    voltar("erro", `O ciclo ${ciclo} já é o ciclo atual.`);
  }

  const { data: salva, error } = await admin
    .from("pesquisa_config")
    .update({ ciclo, inicio, fim, ativa: true, atualizado_em: new Date().toISOString() })
    .eq("revenda_id", revendaId)
    .select("ativa, inicio, fim, ciclo, titulo")
    .single();

  if (error) voltar("erro", error.message);
  voltarConferindo(
    salva as ConfigPesquisa,
    `Ciclo ${ciclo} iniciado${fim ? `, aberto até ${dataBR(fim)}` : ""}. Todos os colaboradores podem responder de novo — as respostas anteriores continuam guardadas.`,
  );
}

/**
 * O BOTÃO DO AVISO: "era para abrir hoje". Traz a data inicial para hoje
 * sem precisar abrir a configuração -- o caso exato de 06/10/2026.
 */
export async function abrirHoje() {
  await requireModulo("pesquisa", "editar");

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/pesquisa");
  const hoje = hojeIso();

  const { data: salva, error } = await admin
    .from("pesquisa_config")
    .update({ inicio: hoje, atualizado_em: new Date().toISOString() })
    .eq("revenda_id", revendaId)
    .select("ativa, inicio, fim, ciclo, titulo")
    .single();

  if (error) voltar("erro", error.message);
  voltarConferindo(salva as ConfigPesquisa, `Pesquisa aberta a partir de hoje (${dataBR(hoje)}).`);
}
