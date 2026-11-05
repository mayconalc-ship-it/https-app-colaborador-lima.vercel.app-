/**
 * PRIORIDADES DOS GVs -- só a regra, sem banco e sem rede.
 *
 * Pedido do dono (03/11/2026): "um link para que os GVs possam inputar as
 * prioridades do dia. Rápido e fácil: só o código do PDV e o motivo,
 * várias de uma vez, e só depois enviar tudo. Depois de lançar, fica
 * gravada para não se perder."
 *
 * A validação mora aqui porque a página é PÚBLICA: o que a tela confere
 * é conforto, a palavra final é do servidor, e os dois usam estas mesmas
 * funções.
 */

import { codigoDaBase } from "./clientes-base";

export const MODULO_PRIORIDADES = "prioridades" as const;

/** Um GV da lista do formulário. O código é o "Cód. gerente vendas" do Promax. */
export type Gv = { codigo: string | null; nome: string };

/** Uma prioridade antes do envio -- o que fica no aparelho do GV. */
export type ItemDoRascunho = { cod: string; motivo: string; nome: string | null };

export const MOTIVO_MIN = 3;
export const MOTIVO_MAX = 160;
/** Um envio maior que isto não é a lista do dia de um GV. */
export const MAX_POR_ENVIO = 100;
/** Até quantos dias à frente se pode priorizar. */
export const DIAS_A_FRENTE = 14;

/** O código do PDV como o resto do app guarda: só dígitos, sem zeros à frente. */
export function codigoDoPdv(bruto: unknown): string | null {
  const cod = codigoDaBase(bruto);
  return cod && cod !== "0" && cod.length <= 12 ? cod : null;
}

/** O motivo limpo: espaços repetidos viram um, e corta no tamanho máximo. */
export function motivoLimpo(bruto: unknown): string {
  return String(bruto ?? "").replace(/\s+/g, " ").trim().slice(0, MOTIVO_MAX);
}

/** O que impede uma prioridade de entrar -- ou null, se está boa. */
export function problemaDoItem(cod: unknown, motivo: unknown): string | null {
  if (!codigoDoPdv(cod)) return "Digite o código do PDV (só números).";
  if (motivoLimpo(motivo).length < MOTIVO_MIN) return "Escreva o motivo da prioridade.";
  return null;
}

/** A lista de GVs gravada no banco, tolerante ao que vier torto. */
export function lerGvs(json: unknown): Gv[] {
  if (!Array.isArray(json)) return [];
  const gvs: Gv[] = [];
  for (const g of json) {
    const nome = String((g as Gv)?.nome ?? "").replace(/\s+/g, " ").trim();
    if (!nome) continue;
    const codigo = String((g as Gv)?.codigo ?? "").trim() || null;
    gvs.push({ codigo, nome });
  }
  return gvs;
}

/**
 * Os motivos da lista suspensa, quando a revenda ainda não montou a dela.
 * É ponto de partida, não regra: a logística troca no painel. "Outro"
 * não entra aqui -- a tela sempre oferece, e abre o campo para escrever.
 */
export const MOTIVOS_PADRAO = [
  "Cliente sem estoque",
  "Pedido que ficou de ontem",
  "Cliente só recebe cedo",
  "Evento ou festa no PDV",
  "Cliente reclamou de atraso",
  "Negociação especial",
  "Cliente novo (primeira compra)",
];
export const MOTIVOS_NA_LISTA_MAX = 15;

/** A lista de motivos gravada no banco; vazia ou torta = a padrão. */
export function lerMotivos(json: unknown): string[] {
  if (!Array.isArray(json)) return MOTIVOS_PADRAO;
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const m of json) {
    const limpo = motivoLimpo(m).slice(0, 60);
    if (limpo.length < MOTIVO_MIN || vistos.has(limpo.toLowerCase())) continue;
    vistos.add(limpo.toLowerCase());
    lista.push(limpo);
  }
  return lista.length ? lista.slice(0, MOTIVOS_NA_LISTA_MAX) : MOTIVOS_PADRAO;
}

/** Um PDV da lista que abre debaixo do campo do código. */
export type PdvAchado = { cod: string; nome: string | null; cidade: string | null };

/**
 * Os PDVs que a busca mostra: os códigos que começam com o que foi
 * digitado, o mais curto primeiro (o código exato, se existir, é o
 * primeiro da lista), depois em ordem numérica.
 */
export function ordenarAchados<T extends { cod: string }>(achados: T[], max: number): T[] {
  return [...achados].sort((a, b) => a.cod.length - b.cod.length || a.cod.localeCompare(b.cod)).slice(0, max);
}

/** "GV 1 · Kenio Saimon", ou só o nome sem código. */
export function rotuloDoGv(g: Gv): string {
  return g.codigo ? `GV ${g.codigo} · ${g.nome}` : g.nome;
}

// ---------------------------------------------------------------------
// Datas -- sempre o calendário de São Paulo, nunca o UTC: das 21h à
// meia-noite o UTC já é amanhã, e a prioridade cairia no dia errado.
// ---------------------------------------------------------------------

export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return agora.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/** Soma dias a uma data "aaaa-mm-dd", sem passar por fuso. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function diaDaSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

/**
 * A entrega que o GV está priorizando, por padrão: amanhã. Domingo não
 * tem entrega, então a prioridade lançada no sábado vai para segunda.
 */
export function proximaEntrega(hoje: string): string {
  const amanha = somarDias(hoje, 1);
  return diaDaSemana(amanha) === "dom" ? somarDias(amanha, 1) : amanha;
}

/** A data de entrega aceita: de hoje até DIAS_A_FRENTE dias. */
export function dataDeEntregaValida(iso: string, hoje: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  if (somarDias(iso, 0) !== iso) return false; // 2026-02-31 e afins
  return iso >= hoje && iso <= somarDias(hoje, DIAS_A_FRENTE);
}

/** "qua 04/11" */
export function dataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${diaDaSemana(iso)} ${d}/${m}`;
}

// ---------------------------------------------------------------------
// A prioridade no mapa do motorista (05/11/2026, pedido do dono).
// ---------------------------------------------------------------------

/**
 * Quantos dias a prioridade vale, contando o dia de entrega pedido: o
 * pedido pode ter ficado no buffer, ainda não ter sido digitado ou ter sido
 * cancelado e refeito. 7 = da sexta pedida até a quinta seguinte, que
 * cobre o buffer de fim de semana.
 */
export const DIAS_DA_PRIORIDADE = 7;

export type PrioridadeLancada = { cod: string; dataEntrega: string; motivo: string; gv: string };
export type PrioridadeNoMapa = { motivos: string[]; gvs: string[]; pedidaPara: string };

/**
 * Quais PDVs do mapa de `dataRota` saem como prioridade.
 *
 * Vale a prioridade pedida para até DIAS_DA_PRIORIDADE-1 dias antes do
 * mapa e que AINDA NÃO SAIU: se o PDV já esteve num mapa entre a data
 * pedida e o dia anterior a este, a prioridade foi atendida ali -- não é
 * para a vida toda, é para o pedido daquela semana. Dois mapas no mesmo
 * dia (carga dividida) marcam os dois.
 *
 * `saidas` = cada PDV e os dias em que ele esteve em algum mapa.
 */
export function prioridadesQueValem(
  lancadas: PrioridadeLancada[],
  saidas: Map<string, string[]>,
  dataRota: string,
): Map<string, PrioridadeNoMapa> {
  const inicio = somarDias(dataRota, -(DIAS_DA_PRIORIDADE - 1));
  const out = new Map<string, PrioridadeNoMapa>();
  for (const p of [...lancadas].sort((a, b) => a.dataEntrega.localeCompare(b.dataEntrega))) {
    if (p.dataEntrega < inicio || p.dataEntrega > dataRota) continue;
    const jaSaiu = (saidas.get(p.cod) ?? []).some((d) => d >= p.dataEntrega && d < dataRota);
    if (jaSaiu) continue;
    const o = out.get(p.cod) ?? { motivos: [], gvs: [], pedidaPara: p.dataEntrega };
    if (p.motivo && !o.motivos.includes(p.motivo)) o.motivos.push(p.motivo);
    if (p.gv && !o.gvs.includes(p.gv)) o.gvs.push(p.gv);
    out.set(p.cod, o);
  }
  return out;
}

// ---------------------------------------------------------------------
// O rascunho -- a lista que o GV monta antes de enviar.
// ---------------------------------------------------------------------

/**
 * Inclui uma prioridade no rascunho. O mesmo PDV duas vezes não entra
 * duas vezes: o motivo novo substitui o antigo (é a correção mais comum
 * -- digitou, viu que escreveu errado, digitou de novo).
 */
export function incluirNoRascunho(
  lista: ItemDoRascunho[],
  item: ItemDoRascunho,
): { lista: ItemDoRascunho[]; substituiu: boolean } {
  const i = lista.findIndex((x) => x.cod === item.cod);
  if (i < 0) return { lista: [item, ...lista], substituiu: false };
  const nova = lista.slice();
  nova[i] = item;
  return { lista: nova, substituiu: true };
}

/** O rascunho guardado no aparelho, tolerante ao que vier torto. */
export function lerRascunho(json: unknown): ItemDoRascunho[] {
  if (!Array.isArray(json)) return [];
  const vistos = new Set<string>();
  const lista: ItemDoRascunho[] = [];
  for (const x of json) {
    const cod = codigoDoPdv((x as ItemDoRascunho)?.cod);
    const motivo = motivoLimpo((x as ItemDoRascunho)?.motivo);
    if (!cod || motivo.length < MOTIVO_MIN || vistos.has(cod)) continue;
    vistos.add(cod);
    const nome = (x as ItemDoRascunho)?.nome;
    lista.push({ cod, motivo, nome: typeof nome === "string" && nome ? nome : null });
  }
  return lista;
}
