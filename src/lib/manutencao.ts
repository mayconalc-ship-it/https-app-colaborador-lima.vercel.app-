/**
 * CHECK GLOBAL DE MANUTENÇÃO (02/10/2026).
 *
 * O item 2.2 do DPO ("Manutenção das Instalações") cobra o Checklist
 * Global de Manutenção da Ambev preenchido NO MÍNIMO TRIMESTRALMENTE,
 * com imagens da condição dos itens (V.1) e mostrando a evolução entre
 * as avaliações dos últimos trimestres (V.2). A auditora pediu para ver
 * essa evolução com as fotos de cada avaliação -- é para isso que este
 * módulo existe, e é por isso que cada resposta guarda as suas fotos.
 *
 * Aqui só a regra pura (nota, trimestre, validação). Banco e tela moram
 * em manutencao-server e em app/manutencao.
 */

export type Bloco = "fundamentos" | "manter" | "melhorar";

export const BLOCOS: { id: Bloco; titulo: string }[] = [
  { id: "fundamentos", titulo: "Fundamentos" },
  { id: "manter", titulo: "Gerenciar para manter" },
  { id: "melhorar", titulo: "Gerenciar para melhorar" },
];

/** As notas da planilha. N/A é outra coisa: o item não se aplica. */
export const NOTAS = [3, 1, 0] as const;
export type Nota = (typeof NOTAS)[number];

export function ehNota(v: unknown): v is Nota {
  return v === 3 || v === 1 || v === 0;
}

export type ItemManut = {
  id: string;
  numero: string;
  secao: number;
  secaoNome: string;
  bloco: Bloco;
  pergunta: string;
  verificacao: string;
  criterios: string;
  peso: number;
  /** Item crítico: abaixo de 3, o reparo é de curto prazo ou CAPEX emergencial. */
  critico: boolean;
  ordem: number;
};

export type RespostaManut = {
  itemId: string;
  nota: Nota | null;
  na: boolean;
};

/** O item já tem resposta (nota ou N/A)? */
export function respondido(r: RespostaManut | undefined) {
  return !!r && (r.na || r.nota !== null);
}

export type NotaDaSecao = { secao: number; nome: string; bloco: Bloco; pct: number | null };

/**
 * A NOTA, IGUAL À DA PLANILHA.
 *
 * Conferido célula a célula contra o "09_Set Checklist Global de
 * Manutenção" (Barreiras, T1 a T4):
 *  - seção = Σ(nota × peso) ÷ Σ(3 × peso), sem os itens N/A
 *    (1.1 com peso 4 e nota 0 derruba a seção 1 para 57%);
 *  - bloco = média simples das seções dele;
 *  - total = média simples das NOVE seções (não dos blocos).
 *
 * Item ainda sem resposta fica fora da conta: no meio da avaliação a
 * nota parcial diz como está o que já foi visto. Seção sem nada contável
 * é `null`, e fica fora das médias -- o AVERAGE da planilha também ignora
 * o "N/A".
 */
export function calcularNotas(itens: ItemManut[], respostas: RespostaManut[]) {
  const porItem = new Map(respostas.map((r) => [r.itemId, r]));
  const secoes = new Map<number, { nome: string; bloco: Bloco; feito: number; possivel: number }>();

  for (const item of itens) {
    const s = secoes.get(item.secao) ?? { nome: item.secaoNome, bloco: item.bloco, feito: 0, possivel: 0 };
    const r = porItem.get(item.id);
    if (r && !r.na && r.nota !== null) {
      s.feito += r.nota * item.peso;
      s.possivel += 3 * item.peso;
    }
    secoes.set(item.secao, s);
  }

  const lista: NotaDaSecao[] = [...secoes.entries()]
    .sort(([a], [b]) => a - b)
    .map(([secao, s]) => ({ secao, nome: s.nome, bloco: s.bloco, pct: s.possivel > 0 ? s.feito / s.possivel : null }));

  const media = (xs: (number | null)[]) => {
    const validos = xs.filter((x): x is number => x !== null);
    return validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null;
  };

  const blocos = Object.fromEntries(
    BLOCOS.map((b) => [b.id, media(lista.filter((s) => s.bloco === b.id).map((s) => s.pct))]),
  ) as Record<Bloco, number | null>;

  return { secoes: lista, blocos, total: media(lista.map((s) => s.pct)) };
}

/** "89%" -- sem casa decimal: é como a planilha e a auditoria leem. */
export function formatarPct(pct: number | null) {
  return pct === null ? "—" : `${Math.round(pct * 100)}%`;
}

/** A cor da nota: verde a partir de 90%, âmbar de 70%, vermelho abaixo. */
export function tomDaNota(pct: number | null): "bom" | "atencao" | "ruim" | "neutro" {
  if (pct === null) return "neutro";
  if (pct >= 0.9) return "bom";
  if (pct >= 0.7) return "atencao";
  return "ruim";
}

// ---------------------------------------------------------------------
// Trimestre
// ---------------------------------------------------------------------

export type Trimestre = { ano: number; trimestre: 1 | 2 | 3 | 4 };

/** O trimestre de uma data "AAAA-MM-DD". */
export function trimestreDe(dataIso: string): Trimestre {
  const [ano, mes] = dataIso.split("-").map(Number);
  return { ano, trimestre: (Math.floor((mes - 1) / 3) + 1) as Trimestre["trimestre"] };
}

/** "T4/2026" */
export function rotuloTrimestre(t: Trimestre) {
  return `T${t.trimestre}/${t.ano}`;
}

/** Os meses do trimestre, para a tela dizer "out a dez". */
export function mesesDoTrimestre(t: Trimestre) {
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const inicio = (t.trimestre - 1) * 3;
  return `${MESES[inicio]} a ${MESES[inicio + 2]}`;
}

/**
 * Os trimestres JÁ FECHADOS que ficaram sem avaliação, do primeiro
 * avaliado até hoje. O de hoje não entra: ele ainda está no prazo. É o
 * alerta vermelho do painel -- o DPO cobra no mínimo uma por trimestre.
 */
export function trimestresSemAvaliacao(feitos: Trimestre[], hoje: Trimestre): Trimestre[] {
  if (feitos.length === 0) return [];
  const chave = (t: Trimestre) => t.ano * 10 + t.trimestre;
  const tem = new Set(feitos.map(chave));
  let t: Trimestre = feitos.reduce((a, b) => (chave(a) < chave(b) ? a : b));
  t = { ano: t.ano, trimestre: t.trimestre };
  const faltam: Trimestre[] = [];
  while (chave(t) < chave(hoje)) {
    if (!tem.has(chave(t))) faltam.push(t);
    t = t.trimestre === 4 ? { ano: t.ano + 1, trimestre: 1 } : { ano: t.ano, trimestre: (t.trimestre + 1) as Trimestre["trimestre"] };
  }
  return faltam;
}

/** Ordena do mais novo para o mais antigo. */
export function compararTrimestre(a: Trimestre, b: Trimestre) {
  return b.ano - a.ano || b.trimestre - a.trimestre;
}

// ---------------------------------------------------------------------
// Critérios ("3 - ... 1 - ... 0 - ...")
// ---------------------------------------------------------------------

/**
 * Separa o texto de critérios da planilha em uma frase por nota.
 *
 * Vem escrito à mão, e cada linha escreve de um jeito: "3 - Todos...",
 * "1- Algumas...", "0 – Menos..." (com travessão). O que se procura é o
 * número sozinho seguido de hífen ou travessão, no começo ou depois de
 * um ponto. Quem não casar fica sem frase -- a tela mostra só o número.
 */
export function separarCriterios(texto: string): Partial<Record<Nota, string>> {
  const saida: Partial<Record<Nota, string>> = {};
  const marcas = [...(texto ?? "").matchAll(/(?:^|[.\s])([310])\s*[-–—]\s*/g)];
  marcas.forEach((m, i) => {
    const nota = Number(m[1]) as Nota;
    const inicio = (m.index ?? 0) + m[0].length;
    const fim = i + 1 < marcas.length ? (marcas[i + 1].index ?? texto.length) + 1 : texto.length;
    const frase = texto.slice(inicio, fim).trim().replace(/\s+/g, " ");
    if (frase && !(nota in saida)) saida[nota] = frase;
  });
  return saida;
}

// ---------------------------------------------------------------------
// Validação da resposta
// ---------------------------------------------------------------------

export type EntradaResposta = {
  nota: Nota | null;
  na: boolean;
  planoAcao: string;
  responsavel: string;
  prazo: string;
};

/**
 * Abaixo de 3, o item precisa de plano: o que fazer, quem e até quando.
 * É o que o DPO cobra ("itens críticos direcionados para reparo em curto
 * prazo ou CAPEX emergencial, não críticos priorizados com prazo") -- e
 * sem prazo nenhum plano é acompanhado de verdade.
 */
export function problemaDaResposta(e: EntradaResposta): string | null {
  if (!e.na && e.nota === null) return "Escolha a nota (3, 1 ou 0) ou marque N/A.";
  if (e.na || e.nota === 3) return null;
  if (!e.planoAcao.trim()) return "Nota abaixo de 3 pede o plano de ação: o que vai ser feito.";
  if (!e.responsavel.trim()) return "Diga quem é o responsável pelo plano de ação.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.prazo)) return "Informe o prazo do plano de ação.";
  return null;
}

/** Prazo sugerido: crítico em 30 dias, os demais em 90 -- até a próxima avaliação. */
export function prazoSugerido(hojeIso: string, critico: boolean) {
  const d = new Date(`${hojeIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (critico ? 30 : 90));
  return d.toISOString().slice(0, 10);
}

/** Quantas fotos cada item aceita por avaliação. */
export const FOTOS_POR_ITEM = 4;
