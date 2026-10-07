"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { deuCerto, noLugar, pararComErro, type ResultadoAcao } from "@/lib/resultado-acao";
import { MODULO_CHAMADOS, ehMotivoEmail, motivoEmail, problemaDoEmail } from "@/lib/chamados";
import { COLUNA_DOS_EMAILS, destinatariosDe, lerConfig } from "@/lib/chamados-server";

const ROTA = "/admin/chamados";

/**
 * O CADASTRO DOS CHAMADOS: áreas, o QR Code (um só por revenda) e prazos.
 *
 * Área não se apaga: desliga. Ela pode estar em chamados antigos --
 * desligar tira a área da lista sem mexer no histórico.
 */

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim().replace(/\s+/g, " ");

/** 10 caracteres hexadecimais: curto para o QR, impossível de adivinhar. */
function novoCodigo() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

async function porta() {
  const perfil = await requireModulo(MODULO_CHAMADOS, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  return { perfil, revendaId, admin: createAdminClient() };
}

function revalidar() {
  revalidatePath(ROTA);
  revalidatePath("/chamados");
}

export async function salvarPrazos(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { perfil, revendaId, admin } = await porta();
    const horas = (campo: string) => {
      const n = Number(String(fd.get(campo) ?? "").replace(",", "."));
      return Number.isFinite(n) ? Math.round(n) : NaN;
    };
    const prazos = { risco: horas("risco"), urgente: horas("urgente"), normal: horas("normal") };
    if (Object.values(prazos).some((h) => !(h >= 1 && h <= 2160))) pararComErro("Cada prazo vai de 1 hora a 90 dias (2.160 horas).");
    if (!(prazos.risco <= prazos.urgente && prazos.urgente <= prazos.normal)) {
      pararComErro("Risco precisa ter o menor prazo, e Normal o maior.");
    }
    const { error } = await admin.from("chamados_config").upsert(
      {
        revenda_id: revendaId,
        prazo_risco_horas: prazos.risco,
        prazo_urgente_horas: prazos.urgente,
        prazo_normal_horas: prazos.normal,
        atualizado_em: new Date().toISOString(),
        atualizado_por_nome: perfil.nome,
      },
      { onConflict: "revenda_id" },
    );
    if (error) pararComErro(`Não foi possível salvar: ${error.message}`);
    revalidar();
    return deuCerto("Prazos salvos. Valem para os chamados abertos daqui em diante.");
  });
}

export async function criarLocal(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const grupo = texto(fd, "grupo").slice(0, 60);
    const nome = texto(fd, "nome").slice(0, 80);
    if (!nome) pararComErro("Escreva o nome da área.");
    const { data: ultima } = await admin
      .from("chamados_locais")
      .select("ordem")
      .eq("revenda_id", revendaId)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await admin
      .from("chamados_locais")
      .insert({ revenda_id: revendaId, grupo, nome, ordem: (ultima?.ordem ?? 0) + 1 });
    if (error?.code === "23505") pararComErro("Já existe uma área com esse nome nesse grupo.");
    if (error) pararComErro(`Não foi possível criar: ${error.message}`);
    revalidar();
    return deuCerto(`Área "${grupo ? `${grupo} · ` : ""}${nome}" criada. Já aparece na lista do formulário.`);
  });
}

export async function editarLocal(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const id = texto(fd, "id");
    const grupo = texto(fd, "grupo").slice(0, 60);
    const nome = texto(fd, "nome").slice(0, 80);
    const ordem = Math.round(Number(texto(fd, "ordem")));
    if (!nome) pararComErro("Escreva o nome da área.");
    if (!Number.isFinite(ordem) || ordem < 0 || ordem > 999) pararComErro("A ordem vai de 0 a 999.");
    const { error } = await admin
      .from("chamados_locais")
      .update({ grupo, nome, ordem })
      .eq("id", id)
      .eq("revenda_id", revendaId);
    if (error?.code === "23505") pararComErro("Já existe uma área com esse nome nesse grupo.");
    if (error) pararComErro(`Não foi possível salvar: ${error.message}`);
    revalidar();
    return deuCerto("Área salva. Os chamados antigos continuam com o nome da época.");
  });
}

export async function alternarLocal(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const ativo = texto(fd, "ativo") === "1";
    const { error } = await admin
      .from("chamados_locais")
      .update({ ativo })
      .eq("id", texto(fd, "id"))
      .eq("revenda_id", revendaId);
    if (error) pararComErro(`Não foi possível salvar: ${error.message}`);
    revalidar();
    return deuCerto(ativo ? "Área ligada: volta à lista do formulário." : "Área desligada: some da lista do formulário.");
  });
}

// ---------------------------------------------------------------------
// Organizar (07/10/2026, pedido do dono): trocar o setor numa lista e
// subir/descer a área, sem digitar número de ordem.
// ---------------------------------------------------------------------

type LinhaDeOrdem = { id: string; grupo: string; nome: string; ordem: number };

async function linhasDaRevenda(admin: ReturnType<typeof createAdminClient>, revendaId: string) {
  const { data, error } = await admin.from("chamados_locais").select("id, grupo, nome, ordem").eq("revenda_id", revendaId);
  if (error) pararComErro(`Não foi possível ler as áreas: ${error.message}`);
  return (data ?? []) as LinhaDeOrdem[];
}

/** Leva a área para outro setor -- ela entra no fim da lista dele. */
export async function moverLocal(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const id = texto(fd, "id");
    const grupo = texto(fd, "grupo").slice(0, 60);
    const linhas = await linhasDaRevenda(admin, revendaId);
    const area = linhas.find((l) => l.id === id);
    if (!area) pararComErro("Área não encontrada.");
    if (area.grupo === grupo) return deuCerto("A área já está nesse setor.");
    const doSetor = linhas.filter((l) => l.grupo === grupo).map((l) => l.ordem);
    // Setor vazio: vai para o fim de tudo (o setor aparece por último).
    const ordem = Math.min(999, Math.max(0, ...(doSetor.length ? doSetor : linhas.map((l) => l.ordem))) + 1);
    const { error } = await admin.from("chamados_locais").update({ grupo, ordem }).eq("id", id).eq("revenda_id", revendaId);
    if (error?.code === "23505") pararComErro(`Já existe "${area.nome}" em ${grupo || "Demais áreas"}.`);
    if (error) pararComErro(`Não foi possível mover: ${error.message}`);
    revalidar();
    return deuCerto(`"${area.nome}" foi para ${grupo || "Demais áreas"}.`);
  });
}

/** Sobe ou desce a área um lugar dentro do setor. */
export async function ordenarLocal(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const id = texto(fd, "id");
    const subir = texto(fd, "direcao") === "subir";
    const linhas = await linhasDaRevenda(admin, revendaId);
    const area = linhas.find((l) => l.id === id);
    if (!area) pararComErro("Área não encontrada.");
    const setor = linhas
      .filter((l) => l.grupo === area.grupo)
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
    const i = setor.findIndex((l) => l.id === id);
    const j = subir ? i - 1 : i + 1;
    if (j < 0 || j >= setor.length) return deuCerto(subir ? "Já é a primeira do setor." : "Já é a última do setor.");
    [setor[i], setor[j]] = [setor[j], setor[i]];
    // Renumera o setor a partir do primeiro número dele: a posição do
    // setor no formulário (que segue a área de menor número) não muda.
    const base = Math.min(...setor.map((l) => l.ordem));
    const mudancas = setor.map((l, k) => ({ l, ordem: base + k })).filter(({ l, ordem }) => l.ordem !== ordem);
    for (const { l, ordem } of mudancas) {
      const { error } = await admin.from("chamados_locais").update({ ordem }).eq("id", l.id).eq("revenda_id", revendaId);
      if (error) pararComErro(`Não foi possível reordenar: ${error.message}`);
    }
    revalidar();
    return deuCerto(`"${area.nome}" ${subir ? "subiu" : "desceu"}.`);
  });
}

/** Troca o nome de um setor em todas as áreas dele. */
export async function renomearSetor(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { revendaId, admin } = await porta();
    const de = texto(fd, "de");
    const para = texto(fd, "para").slice(0, 60);
    if (!de) pararComErro("Setor inválido.");
    if (!para) pararComErro("Escreva o novo nome do setor.");
    if (para === de) return deuCerto("O nome é o mesmo.");
    const { error } = await admin.from("chamados_locais").update({ grupo: para }).eq("revenda_id", revendaId).eq("grupo", de);
    if (error?.code === "23505") pararComErro(`"${para}" já tem uma área com o mesmo nome de uma de "${de}".`);
    if (error) pararComErro(`Não foi possível renomear: ${error.message}`);
    revalidar();
    return deuCerto(`Setor "${de}" agora se chama "${para}". Os chamados antigos continuam com o nome da época.`);
  });
}

/**
 * Quem recebe o PEDIDO por e-mail (07/10/2026, pedido do dono): uma lista
 * para a compra de peça e outra para a autorização do gestor. O app não
 * envia sozinho: a lista vai pronta no "Pedir por e-mail" do chamado, que
 * abre o Outlook de quem toca.
 */
function listaDoFormulario(fd: FormData) {
  const motivo = texto(fd, "lista");
  if (!ehMotivoEmail(motivo)) pararComErro("Lista inválida.");
  return motivo;
}

export async function adicionarEmail(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { perfil, revendaId, admin } = await porta();
    const motivo = listaDoFormulario(fd);
    const email = texto(fd, "email").toLowerCase();
    const problema = problemaDoEmail(email);
    if (problema) pararComErro(problema);
    const atuais = destinatariosDe(await lerConfig(revendaId, admin), motivo);
    if (atuais.includes(email)) pararComErro("Este e-mail já está nesta lista.");
    if (atuais.length >= 30) pararComErro("Já são 30 e-mails. Prefira o e-mail de um grupo (ex.: compras@...).");
    const { error } = await admin
      .from("chamados_config")
      .update({ [COLUNA_DOS_EMAILS[motivo]]: [...atuais, email], atualizado_em: new Date().toISOString(), atualizado_por_nome: perfil.nome })
      .eq("revenda_id", revendaId);
    if (error) pararComErro(`Não foi possível salvar: ${error.message}. Falta rodar a migration ${motivo === "compra" ? "167" : "169"}?`);
    revalidar();
    return deuCerto(`${email} vai receber os pedidos de ${motivoEmail(motivo).rotulo.toLowerCase()}.`);
  });
}

export async function removerEmail(fd: FormData): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { perfil, revendaId, admin } = await porta();
    const motivo = listaDoFormulario(fd);
    const email = texto(fd, "email").toLowerCase();
    const atuais = destinatariosDe(await lerConfig(revendaId, admin), motivo);
    const { error } = await admin
      .from("chamados_config")
      .update({ [COLUNA_DOS_EMAILS[motivo]]: atuais.filter((e) => e !== email), atualizado_em: new Date().toISOString(), atualizado_por_nome: perfil.nome })
      .eq("revenda_id", revendaId);
    if (error) pararComErro(`Não foi possível remover: ${error.message}`);
    revalidar();
    return deuCerto(`${email} saiu da lista.`);
  });
}

/** Troca o QR da revenda: o cartaz antigo para de abrir chamado. */
export async function novoQr(): Promise<ResultadoAcao> {
  return noLugar(async () => {
    const { perfil, revendaId, admin } = await porta();
    const { error } = await admin.from("chamados_config").upsert(
      { revenda_id: revendaId, token_publico: novoCodigo(), atualizado_em: new Date().toISOString(), atualizado_por_nome: perfil.nome },
      { onConflict: "revenda_id" },
    );
    if (error) pararComErro(`Não foi possível trocar: ${error.message}`);
    revalidar();
    return deuCerto("QR novo gerado. Imprima e troque os cartazes: o antigo não abre mais chamado.");
  });
}
