/**
 * CHECK DE CONFORMIDADE DA FROTA (25/11/2026, migration 184).
 *
 * A planilha "CheckList Conformidade Caminhões" da frota vira módulo do
 * app: 49 itens por caminhão, BIMESTRAL, feito e ASSINADO por alguém da
 * frota, com foto obrigatória em todo NOK. O Gestor LOG lê o farol (quem
 * está pendente) pela aba Frota > Check bimestral.
 *
 * Regras que não estão óbvias no código:
 *  - O bimestre é do calendário: jan–fev, mar–abr ... nov–dez. Um check
 *    por placa por bimestre; assinado não muda mais.
 *  - Conformidade = itens OK ÷ itens respondidos (a conta da planilha).
 *  - NOK pede QUAL defeito do manual "Especificações Caminhões" -- a
 *    gravidade sai do defeito, não de quem preenche. "Outro defeito"
 *    existe para o que o manual não prevê, e aí quem preenche escolhe.
 *  - Pendência = NOK do check mais novo da placa que ainda não foi
 *    marcado como corrigido. NOK de check antigo já foi revisto no
 *    check seguinte.
 *  - Check que veio da planilha (status "planilha") conta como feito.
 *    Fazer pelo app no mesmo bimestre substitui o da planilha.
 *
 * Arquivo sem nada de servidor: a tela do celular também usa.
 */

export const MODULO_FROTA_CHECK = "frota-check" as const;

export type Gravidade = "leve" | "medio" | "grave" | "bloqueio";

export const GRAVIDADES: Gravidade[] = ["leve", "medio", "grave", "bloqueio"];

export const ROTULO_GRAVIDADE: Record<Gravidade, string> = {
  leve: "Leve",
  medio: "Médio",
  grave: "Grave",
  bloqueio: "Bloqueio imediato",
};

/** Classes Tailwind da etiqueta de cada gravidade. */
export const COR_GRAVIDADE: Record<Gravidade, string> = {
  leve: "bg-amber-100 text-amber-900",
  medio: "bg-orange-100 text-orange-900",
  grave: "bg-red-100 text-red-800",
  bloqueio: "bg-red-700 text-white",
};

export function ehGravidade(g: unknown): g is Gravidade {
  return typeof g === "string" && (GRAVIDADES as string[]).includes(g);
}

export function piorGravidade(lista: (Gravidade | null | undefined)[]): Gravidade | null {
  let pior = -1;
  for (const g of lista) if (g && GRAVIDADES.indexOf(g) > pior) pior = GRAVIDADES.indexOf(g);
  return pior < 0 ? null : GRAVIDADES[pior];
}

export const GRUPOS = ["Cabine", "Frontal", "Baú", "Traseira", "Pneus", "Itens extras"] as const;

export const EMOJI_GRUPO: Record<string, string> = {
  Cabine: "🪑",
  Frontal: "🚚",
  "Baú": "📦",
  Traseira: "🚦",
  Pneus: "🛞",
  "Itens extras": "🔌",
};

// ---------------------------------------------------------------------
// Bimestre
// ---------------------------------------------------------------------

export type Bimestre = { ano: number; bimestre: number };

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Bimestre de uma data "AAAA-MM-DD". */
export function bimestreDe(dataIso: string): Bimestre {
  const [a, m] = dataIso.split("-").map(Number);
  return { ano: a, bimestre: Math.ceil(m / 2) };
}

export function rotuloBimestre(b: Bimestre, curto = false) {
  const m1 = MESES_CURTOS[(b.bimestre - 1) * 2];
  const m2 = MESES_CURTOS[(b.bimestre - 1) * 2 + 1];
  return curto ? `${m1}–${m2}/${String(b.ano).slice(2)}` : `${m1}–${m2} de ${b.ano}`;
}

export function bimestreAnterior(b: Bimestre): Bimestre {
  return b.bimestre === 1 ? { ano: b.ano - 1, bimestre: 6 } : { ano: b.ano, bimestre: b.bimestre - 1 };
}

/** Último dia do bimestre, "AAAA-MM-DD". */
export function fimDoBimestre(b: Bimestre) {
  const mes = b.bimestre * 2; // 2, 4 ... 12
  const ultimo = new Date(Date.UTC(b.ano, mes, 0)).getUTCDate();
  return `${b.ano}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
}

/** Dias corridos de hoje até o fim do bimestre (0 = hoje é o último dia). */
export function diasParaFechar(b: Bimestre, hojeIso: string) {
  const fim = Date.parse(`${fimDoBimestre(b)}T00:00:00Z`);
  const hoje = Date.parse(`${hojeIso}T00:00:00Z`);
  return Math.round((fim - hoje) / 86_400_000);
}

/** Últimos N bimestres, do mais antigo ao atual. */
export function ultimosBimestres(atual: Bimestre, n: number): Bimestre[] {
  const lista: Bimestre[] = [atual];
  while (lista.length < n) lista.unshift(bimestreAnterior(lista[0]));
  return lista;
}

export const chaveBimestre = (b: Bimestre) => `${b.ano}-${b.bimestre}`;

// ---------------------------------------------------------------------
// Farol
// ---------------------------------------------------------------------

/** Faltando isto ou menos para fechar o bimestre, quem está pendente fica vermelho. */
export const DIAS_ATENCAO = 15;

export type Farol = "feito" | "andamento" | "pendente" | "atencao";

export const ROTULO_FAROL: Record<Farol, string> = {
  feito: "Feito",
  andamento: "Em andamento",
  pendente: "Pendente",
  atencao: "Pendente · fecha logo",
};

export const COR_FAROL: Record<Farol, string> = {
  feito: "bg-emerald-500",
  andamento: "bg-sky-500",
  pendente: "bg-amber-400",
  atencao: "bg-red-600",
};

export function farolDoVeiculo(status: string | null, diasRestantes: number): Farol {
  if (status === "assinado" || status === "planilha") return "feito";
  if (status === "em_andamento") return diasRestantes <= DIAS_ATENCAO ? "atencao" : "andamento";
  return diasRestantes <= DIAS_ATENCAO ? "atencao" : "pendente";
}

export function formatarPct(v: number | null | undefined, casas = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(casas).replace(".", ",")}%`;
}

/** Placa só com letras e números, maiúscula ("onu-4i39" -> "ONU4I39"). */
export function normalizarPlaca(p: string) {
  return p.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "ONU4I39" -> "ONU-4I39" (só para ler). */
export function placaParaLer(p: string) {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

// ---------------------------------------------------------------------
// Tipos da tela
// ---------------------------------------------------------------------

export type DefeitoFrota = { id: string; descricao: string; gravidade: Gravidade; classificacao: string | null };

export type ItemFrota = {
  id: string;
  ordem: number;
  grupo: string;
  nome: string;
  classificacao: string;
  defeitos: DefeitoFrota[];
};

export type FotoFrota = { id: string; url: string; mini: string; chave: string | null };

export type RespostaFrota = {
  itemId: string;
  ok: boolean;
  defeitoId: string | null;
  gravidade: Gravidade | null;
  observacao: string | null;
  fotos: FotoFrota[];
};

/** Por que este item ainda não deixa assinar (null = pronto). */
export function faltaNoItem(r: Pick<RespostaFrota, "ok" | "defeitoId" | "gravidade" | "observacao"> | undefined, fotos: number) {
  if (!r) return "sem resposta";
  if (r.ok) return null;
  if (!r.gravidade) return "escolha o defeito";
  if (!r.defeitoId && !(r.observacao ?? "").trim()) return "descreva o defeito";
  if (fotos < 1) return "falta a foto";
  return null;
}

export const FOTOS_POR_ITEM_FROTA = 3;
