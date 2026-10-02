/**
 * BASE DE FORNECEDORES E RACI DA MANUTENÇÃO (DPO 2.2, V.3 e V.4).
 *
 * V.3: a base de fornecedores fica disponível para TODA a unidade
 *      consultar, e o time inclui e atualiza os contatos.
 * V.4: a RACI está vigente entre as áreas da unidade e os fornecedores
 *      externos; a base traz contato, ANS, tipo de serviço e custo; existe
 *      rotina para os itens críticos; e o ANS é revisto com o fornecedor
 *      quando o serviço não foi adequado.
 *
 * Aqui só as regras puras (sem banco), para testar sem servidor:
 *   npx tsx src/lib/__testes__/manutencao-raci.teste.mjs
 */

// ---------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------

export const CATEGORIAS = [
  { id: "manutencao", rotulo: "Manutenção e serviços", emoji: "🔧" },
  { id: "seguranca", rotulo: "Segurança e emergência", emoji: "🚨" },
  { id: "rota", rotulo: "Apoio na rota", emoji: "🛣️" },
  { id: "outro", rotulo: "Outros", emoji: "📇" },
] as const;
export type Categoria = (typeof CATEGORIAS)[number]["id"];

export function ehCategoria(v: unknown): v is Categoria {
  return CATEGORIAS.some((c) => c.id === v);
}

export const FREQUENCIAS = [
  { id: "comum", rotulo: "Uso comum" },
  { id: "raro", rotulo: "Uso raro" },
] as const;
export type Frequencia = (typeof FREQUENCIAS)[number]["id"];

export type SituacaoAns = "em_dia" | "revisar";

export type Fornecedor = {
  id: string;
  nome: string;
  categoria: Categoria;
  tipoServico: string;
  telefone: string;
  cidade: string | null;
  frequencia: Frequencia;
  /** O acordo de nível de serviço, em texto: "Atende em até 4 h". */
  ans: string | null;
  custo: string | null;
  /** Atende item crítico (cobertura, elétrica, incêndio...). */
  critico: boolean;
  situacaoAns: SituacaoAns;
  motivoRevisao: string | null;
  ansRevisadaEm: string | null;
  observacao: string | null;
  atualizadoPorNome: string | null;
  atualizadoEm: string | null;
};

/** Só os dígitos: "(77) 99802-7417" -> "77998027417". */
export function soDigitos(telefone: string) {
  return telefone.replace(/\D/g, "");
}

/**
 * Número que se disca. Até 4 dígitos é serviço público (190, 192, 193):
 * vai como está. Com DDD, ganha o +55.
 */
export function linkTelefone(telefone: string): string | null {
  const d = soDigitos(telefone).replace(/^0+(?=\d{10,})/, "");
  if (d.length < 3) return null;
  if (d.length <= 4) return `tel:${d}`;
  if (d.startsWith("55") && d.length >= 12) return `tel:+${d}`;
  return d.length >= 10 ? `tel:+55${d}` : `tel:${d}`;
}

/**
 * WhatsApp só para celular: DDD + 9 + 8 dígitos. Fixo, 0800 e 190 não
 * têm WhatsApp, e um botão que abre conversa com número errado confunde.
 */
export function linkWhatsapp(telefone: string): string | null {
  let d = soDigitos(telefone);
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 11 || d[2] !== "9") return null;
  return `https://wa.me/55${d}`;
}

/** "77998027417" -> "(77) 99802-7417". O que não reconhece, devolve igual. */
export function formatarTelefone(telefone: string) {
  const d = soDigitos(telefone);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone.trim();
}

export type EntradaFornecedor = { nome: string; telefone: string; tipoServico: string; categoria: string };

export function problemaDoFornecedor(e: EntradaFornecedor): string | null {
  if (e.nome.trim().length < 2) return "Informe o nome do fornecedor.";
  if (!ehCategoria(e.categoria)) return "Escolha a categoria.";
  if (e.tipoServico.trim().length < 2) return "Informe o tipo de serviço.";
  if (soDigitos(e.telefone).length < 3) return "Informe um telefone para contato.";
  return null;
}

/** Sem acento e em minúsculas: "Refrigeração" acha "refrigeracao". */
export function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * A busca da base: cada palavra digitada precisa aparecer no nome, no
 * serviço, na cidade ou no telefone ("ar barreiras" acha a Tec Clima).
 */
export function buscarFornecedores<T extends Pick<Fornecedor, "nome" | "tipoServico" | "cidade" | "telefone">>(
  lista: T[],
  termo: string,
): T[] {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return lista;
  return lista.filter((f) => {
    const alvo = normalizar(`${f.nome} ${f.tipoServico} ${f.cidade ?? ""} ${soDigitos(f.telefone)}`);
    return palavras.every((p) => alvo.includes(p));
  });
}

/**
 * Fornecedor que atende item crítico tem de ter ANS e telefone na base --
 * é a "rotina para os itens críticos" do V.4: na hora da pane ninguém
 * deveria ter de descobrir quem chamar e em quanto tempo ele vem.
 */
export function pendenciasDoFornecedor(f: Pick<Fornecedor, "critico" | "ans" | "situacaoAns">): string[] {
  const p: string[] = [];
  if (f.critico && !f.ans?.trim()) p.push("Crítico sem ANS definido");
  if (f.situacaoAns === "revisar") p.push("ANS a revisar com o fornecedor");
  return p;
}

// ---------------------------------------------------------------------
// RACI
// ---------------------------------------------------------------------

export const LETRAS = ["R", "A", "C", "I"] as const;
export type Letra = (typeof LETRAS)[number];

export const SIGNIFICADO: Record<Letra, string> = {
  R: "Responsável: executa",
  A: "Aprovador: responde pelo resultado (só um)",
  C: "Consultado: opina antes",
  I: "Informado: fica sabendo depois",
};

export function ehLetra(v: unknown): v is Letra {
  return LETRAS.includes(v as Letra);
}

/** O toque na célula: vazio → R → A → C → I → vazio. */
export function proximaLetra(atual: Letra | null): Letra | null {
  if (!atual) return "R";
  const i = LETRAS.indexOf(atual);
  return i === LETRAS.length - 1 ? null : LETRAS[i + 1];
}

/**
 * As regras da RACI numa linha (atividade): um único A e pelo menos um R.
 * Sem A ninguém responde; dois A, ninguém decide.
 */
export function problemasDaAtividade(letras: (Letra | null | undefined)[]): string[] {
  const p: string[] = [];
  const a = letras.filter((l) => l === "A").length;
  if (a === 0) p.push("Sem A (quem responde pelo resultado)");
  if (a > 1) p.push(`${a} pessoas com A: deixe só um`);
  if (!letras.includes("R")) p.push("Sem R (quem executa)");
  return p;
}

/** A RACI vale por um trimestre: revista junto com o Check de Manutenção. */
export const DIAS_DE_VIGENCIA = 90;

export type SituacaoRevisao =
  | { tipo: "nunca" }
  | { tipo: "em_dia"; venceEm: string; dias: number }
  | { tipo: "vencida"; venceuEm: string; dias: number };

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(deIso: string, ateIso: string) {
  const a = Date.parse(`${deIso.slice(0, 10)}T12:00:00Z`);
  const b = Date.parse(`${ateIso.slice(0, 10)}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function situacaoDaRevisao(ultimaIso: string | null, hojeIso: string): SituacaoRevisao {
  if (!ultimaIso) return { tipo: "nunca" };
  const vence = somarDias(ultimaIso, DIAS_DE_VIGENCIA);
  const faltam = diasEntre(hojeIso, vence);
  return faltam >= 0 ? { tipo: "em_dia", venceEm: vence, dias: faltam } : { tipo: "vencida", venceuEm: vence, dias: -faltam };
}

/** "2026-10-02" -> "02/10/2026". */
export function dataBr(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";
}

/**
 * VIGENTE = revista dentro do prazo E sem regra quebrada. É o que o V.4
 * pergunta ("a RACI está vigente?"), e o que o painel mostra.
 */
export function raciVigente(revisao: SituacaoRevisao, atividadesComProblema: number) {
  return revisao.tipo === "em_dia" && atividadesComProblema === 0;
}
