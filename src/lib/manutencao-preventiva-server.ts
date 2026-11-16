import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { prepararFoto } from "@/lib/manutencao-server";
import { lerFotoDoBucket } from "@/lib/foto-privada-server";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import {
  cobrar,
  ehTipoItem,
  ordemDeUrgencia,
  prazoDa,
  type EquipamentoPreventiva,
  type ItemPreventiva,
  type ModeloPreventiva,
  type Prazo,
  type RespostaPreventiva,
} from "@/lib/manutencao-preventiva";

type Admin = ReturnType<typeof createAdminClient>;

export const MODULO_PREVENTIVA = "manutencao-preventiva" as const;

/** Mesmo bucket privado do Check, numa pasta própria. */
const BUCKET = "manutencao";
/** Foto de preventiva mostra o estado do item, não é laudo: 1280 px, WebP 65 (~50 KB). */
const TAMANHO_DA_FOTO = { lado: 1280, qualidade: 65 };
export const FOTOS_POR_ITEM = 1;

/** Falta rodar a migration 178 (as colunas novas não existem). */
export class PreventivaNaoAtualizada extends Error {}

function conferir(error: { code?: string; message: string } | null) {
  if (!error) return;
  // 42703 = coluna não existe; 42P01 = tabela não existe.
  if (error.code === "42703" || error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) {
    throw new PreventivaNaoAtualizada(error.message);
  }
  throw new Error(error.message);
}

// ---------------------------------------------------------------------
// Linha crua -> tipo do app, num lugar só
// ---------------------------------------------------------------------

const num = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

export function itemDeLinha(l: {
  id: string;
  ordem: number;
  pergunta: string;
  ajuda: string | null;
  tipo: string;
  opcoes: string[] | null;
  unidade: string | null;
  casas_decimais: number;
  obrigatorio: boolean;
  depende_item_id: string | null;
  depende_valores: string[] | null;
  bloco?: string | null;
  aceita_foto?: boolean | null;
  alerta_valores?: string[] | null;
  minimo?: string | number | null;
  maximo?: string | number | null;
}): ItemPreventiva {
  return {
    id: l.id,
    ordem: l.ordem,
    pergunta: l.pergunta,
    ajuda: l.ajuda,
    tipo: ehTipoItem(l.tipo) ? l.tipo : "texto",
    opcoes: l.opcoes ?? [],
    unidade: l.unidade,
    casasDecimais: l.casas_decimais,
    obrigatorio: l.obrigatorio,
    dependeItemId: l.depende_item_id,
    dependeValores: l.depende_valores ?? [],
    bloco: l.bloco ?? null,
    aceitaFoto: Boolean(l.aceita_foto),
    alertaValores: l.alerta_valores ?? [],
    minimo: num(l.minimo),
    maximo: num(l.maximo),
  };
}

export function modeloDeLinha(l: {
  id: string;
  nome: string;
  equipamento: string;
  emoji: string | null;
  periodicidade_dias: number;
  usa_equipamentos?: boolean | null;
  descricao?: string | null;
}): ModeloPreventiva {
  return {
    id: l.id,
    nome: l.nome,
    equipamento: l.equipamento,
    emoji: l.emoji,
    periodicidadeDias: l.periodicidade_dias,
    usaEquipamentos: Boolean(l.usa_equipamentos),
    descricao: l.descricao ?? null,
  };
}

export function equipamentoDeLinha(l: {
  id: string;
  modelo_id: string;
  codigo: string;
  local: string;
  marca: string | null;
  capacidade: string | null;
  observacao: string | null;
  periodicidade_dias: number | null;
  ativo: boolean;
  criado_em: string;
}): EquipamentoPreventiva {
  return {
    id: l.id,
    modeloId: l.modelo_id,
    codigo: l.codigo,
    local: l.local,
    marca: l.marca,
    capacidade: l.capacidade,
    observacao: l.observacao,
    periodicidadeDias: l.periodicidade_dias,
    ativo: l.ativo,
    criadoEm: l.criado_em,
  };
}

export function respostaDeLinha(l: {
  item_id: string;
  valor_bool: boolean | null;
  valor_numero: string | number | null;
  valor_numeros: (string | number)[] | null;
  valor_texto: string | null;
  observacao: string | null;
}): RespostaPreventiva {
  return {
    itemId: l.item_id,
    valorBool: l.valor_bool,
    valorNumero: l.valor_numero === null ? null : Number(l.valor_numero),
    valorNumeros: l.valor_numeros ? l.valor_numeros.map(Number) : null,
    valorTexto: l.valor_texto,
    observacao: l.observacao,
  };
}

export const COLUNAS_MODELO =
  "id, nome, equipamento, emoji, periodicidade_dias, usa_equipamentos, descricao, criado_em, ativo, ordem";
export const COLUNAS_EQUIPAMENTO =
  "id, modelo_id, codigo, local, marca, capacidade, observacao, periodicidade_dias, ativo, criado_em";
export const COLUNAS_ITEM =
  "id, ordem, pergunta, ajuda, tipo, opcoes, unidade, casas_decimais, obrigatorio, depende_item_id, depende_valores, bloco, aceita_foto, alerta_valores, minimo, maximo";

// ---------------------------------------------------------------------
// OS ALVOS: cada coisa que tem preventiva com prazo
// ---------------------------------------------------------------------

/**
 * Um alvo é o que tem prazo: o modelo inteiro (Gerador) ou cada aparelho
 * de um modelo com cadastro (AC-01, AC-02...). É a unidade do painel, do
 * lembrete e do botão "Fazer".
 */
export type Alvo = {
  chave: string;
  modelo: ModeloPreventiva;
  equipamento: EquipamentoPreventiva | null;
  periodicidadeDias: number;
  ultima: { id: string; em: string; por: string | null; alertas: number } | null;
  prazo: Prazo;
};

export type PainelPreventiva = {
  alvos: Alvo[];
  /** Modelo que pede cadastro de aparelho e ainda não tem nenhum. */
  semCadastro: ModeloPreventiva[];
};

export async function painelDaRevenda(revendaId: string, admin: Admin = createAdminClient()): Promise<PainelPreventiva> {
  const [modelos, equipamentos, ultimas] = await Promise.all([
    admin
      .from("manut_prev_modelos")
      .select(COLUNAS_MODELO)
      .eq("revenda_id", revendaId)
      .eq("ativo", true)
      .order("ordem")
      .order("nome"),
    admin
      .from("manut_prev_equipamentos")
      .select(COLUNAS_EQUIPAMENTO)
      .eq("revenda_id", revendaId)
      .eq("ativo", true)
      .order("codigo"),
    admin
      .from("manut_prev_execucoes")
      .select("id, modelo_id, equipamento_id, finalizada_em, finalizada_por_nome, alertas")
      .eq("revenda_id", revendaId)
      .eq("status", "finalizada")
      .order("finalizada_em", { ascending: false })
      .limit(3000),
  ]);
  conferir(modelos.error);
  conferir(equipamentos.error);
  conferir(ultimas.error);

  // A primeira de cada alvo já é a mais recente (vem ordenado).
  const ultimaPorAlvo = new Map<string, Alvo["ultima"]>();
  for (const e of ultimas.data ?? []) {
    const chave = `${e.modelo_id}:${e.equipamento_id ?? "-"}`;
    if (!ultimaPorAlvo.has(chave) && e.finalizada_em) {
      ultimaPorAlvo.set(chave, { id: e.id, em: e.finalizada_em, por: e.finalizada_por_nome, alertas: e.alertas ?? 0 });
    }
  }

  const hoje = new Date();
  const alvos: Alvo[] = [];
  const semCadastro: ModeloPreventiva[] = [];
  const equips = (equipamentos.data ?? []).map(equipamentoDeLinha);

  for (const linha of modelos.data ?? []) {
    const modelo = modeloDeLinha(linha);
    if (!modelo.usaEquipamentos) {
      const chave = `${modelo.id}:-`;
      const ultima = ultimaPorAlvo.get(chave) ?? null;
      alvos.push({
        chave,
        modelo,
        equipamento: null,
        periodicidadeDias: modelo.periodicidadeDias,
        ultima,
        prazo: prazoDa(modelo.periodicidadeDias, ultima?.em ?? null, linha.criado_em, hoje),
      });
      continue;
    }
    const doModelo = equips.filter((e) => e.modeloId === modelo.id);
    if (doModelo.length === 0) semCadastro.push(modelo);
    for (const equipamento of doModelo) {
      const chave = `${modelo.id}:${equipamento.id}`;
      const ultima = ultimaPorAlvo.get(chave) ?? null;
      const periodicidadeDias = equipamento.periodicidadeDias ?? modelo.periodicidadeDias;
      alvos.push({
        chave,
        modelo,
        equipamento,
        periodicidadeDias,
        ultima,
        prazo: prazoDa(periodicidadeDias, ultima?.em ?? null, equipamento.criadoEm, hoje),
      });
    }
  }

  alvos.sort((a, b) => ordemDeUrgencia(a.prazo, b.prazo));
  return { alvos, semCadastro };
}

export async function itensDoModelo(modeloId: string, revendaId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("manut_prev_itens")
    .select(COLUNAS_ITEM)
    .eq("modelo_id", modeloId)
    .eq("revenda_id", revendaId)
    .eq("ativo", true)
    .order("ordem");
  conferir(error);
  return (data ?? []).map(itemDeLinha);
}

// ---------------------------------------------------------------------
// FOTOS
// ---------------------------------------------------------------------

/** Sobe as fotos de um item. Uma que falhe não derruba as outras. */
export async function guardarFotosDoItem(
  execucao: { id: string; revenda_id: string },
  itemId: string,
  arquivos: File[],
  admin: Admin = createAdminClient(),
) {
  let falhas = 0;
  for (const arquivo of arquivos.slice(0, FOTOS_POR_ITEM)) {
    try {
      if (arquivo.size > 15 * 1024 * 1024) {
        falhas++;
        continue;
      }
      const foto = await prepararFoto(arquivo, TAMANHO_DA_FOTO);
      if (foto.largura === null && !arquivo.type.startsWith("image/")) {
        falhas++;
        continue;
      }
      const caminho = `preventiva/${execucao.revenda_id}/${execucao.id}/${itemId}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${foto.extensao}`;
      const { error } = await admin.storage.from(BUCKET).upload(caminho, foto.dados, { contentType: foto.contentType });
      if (error) {
        falhas++;
        continue;
      }
      await admin.from("manut_prev_fotos").insert({
        execucao_id: execucao.id,
        item_id: itemId,
        revenda_id: execucao.revenda_id,
        caminho,
        bytes: foto.dados.length,
      });
    } catch {
      falhas++;
    }
  }
  return falhas;
}

export async function lerFotoDaPreventiva(id: string, revendaId: string, mini: boolean) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("manut_prev_fotos")
    .select("caminho")
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!data) return null;
  return lerFotoDoBucket(BUCKET, data.caminho, mini, admin);
}

// ---------------------------------------------------------------------
// O LEMBRETE DO QUE ESTÁ VENCIDO
// ---------------------------------------------------------------------

/**
 * Uma vez por dia, a partir das 7 h: quem faz a preventiva (liberação
 * pessoa a pessoa) e quem cuida do cadastro (Liderança com "editar")
 * recebem no sino e no celular a lista do que venceu.
 *
 * Um aviso por revenda por dia, e só quando há algo vencido -- lembrete
 * que chega todo dia dizendo "tudo em dia" vira ruído e deixa de ser lido.
 */
/**
 * Revenda e dia já resolvidos NESTA instância: a varredura roda a cada
 * 15 min, e o prazo só muda na virada do dia -- não precisa reler o
 * painel 40 vezes para ouvir a mesma resposta.
 */
const jaConferido = new Set<string>();

export async function lembrarPreventivasVencidas(agora: Date = new Date()): Promise<number> {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const pega = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  if (Number(pega("hour")) < 7) return 0;
  const dia = `${pega("year")}-${pega("month")}-${pega("day")}`;

  const admin = createAdminClient();
  const { data: ligadas } = await admin
    .from("revenda_modulos")
    .select("revenda_id")
    .eq("modulo", MODULO_PREVENTIVA)
    .eq("ativo", true);

  let enviados = 0;
  for (const l of ligadas ?? []) {
    const revendaId = String(l.revenda_id);
    const chave = `preventiva:${revendaId}:${dia}`;
    if (jaConferido.has(chave)) continue;
    const { data: jaFoi } = await admin
      .from("notificacoes")
      .select("id")
      .eq("modulo", MODULO_PREVENTIVA)
      .eq("referencia_id", chave)
      .limit(1)
      .maybeSingle();
    if (jaFoi) continue;

    let painel: PainelPreventiva;
    try {
      painel = await painelDaRevenda(revendaId, admin);
    } catch {
      continue; // migration 178 ainda não rodou
    }
    const vencidas = painel.alvos.filter((a) => cobrar(a.prazo));
    if (vencidas.length === 0) {
      jaConferido.add(chave);
      continue;
    }

    const [{ data: donos }, { data: liberados }, { data: lideres }] = await Promise.all([
      admin.from("profiles").select("id").eq("role", "owner"),
      admin
        .from("colaborador_modulos_extra")
        .select("colaborador_id")
        .eq("revenda_id", revendaId)
        .eq("modulo", MODULO_PREVENTIVA),
      admin
        .from("lideranca_permissoes")
        .select("colaborador_id")
        .eq("revenda_id", revendaId)
        .eq("modulo", MODULO_PREVENTIVA)
        .eq("acao", "editar"),
    ]);
    const destinatarios = [
      ...new Set([
        ...(donos ?? []).map((d) => String(d.id)),
        ...(liberados ?? []).map((p) => String(p.colaborador_id)),
        ...(lideres ?? []).map((p) => String(p.colaborador_id)),
      ]),
    ];
    if (destinatarios.length === 0) continue;

    const nomes = vencidas.slice(0, 4).map((a) => {
      const quem = a.equipamento
        ? `${a.modelo.equipamento} ${a.equipamento.codigo}`
        : a.modelo.equipamento || a.modelo.nome;
      return `${quem} (${a.prazo.estado === "vence_hoje" ? "hoje" : `${-a.prazo.diasParaVencer} d de atraso`})`;
    });
    const resto = vencidas.length > 4 ? ` e mais ${vencidas.length - 4}` : "";
    const titulo = vencidas.length === 1 ? "🔩 1 preventiva vencida" : `🔩 ${vencidas.length} preventivas vencidas`;
    const mensagem = `${nomes.join(", ")}${resto}.`;
    const url = "/manutencao-preventiva?ver=vencidas";

    await Promise.all(
      destinatarios.map((id) =>
        criarNotificacao({
          modulo: MODULO_PREVENTIVA,
          tipo: "pendencia",
          titulo,
          mensagem,
          url,
          revendaId,
          destinatarioId: id,
          referenciaId: chave,
        }),
      ),
    );
    await enviarPushDaRevenda(revendaId, {
      modulo: MODULO_PREVENTIVA,
      titulo,
      mensagem,
      url,
      apenas: destinatarios,
      qualquerRevenda: true,
    });
    jaConferido.add(chave);
    enviados++;
  }
  return enviados;
}
