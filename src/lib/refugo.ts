/**
 * REFUGO DE VASILHAME
 *
 * O conferente afere as garrafas que voltaram no mapa e classifica os
 * defeitos. O relatório 03.11.34.05 já traz o código do motorista na
 * própria linha; o ajudante sai do cruzamento pelo mapa.
 *
 * Só matemática e leitura de arquivo aqui: sem banco e sem React.
 */

import { dataParaIso, normalizarMapa } from "@/lib/rotas";

// --------------------------------------------------------------------
// DEFEITOS
// --------------------------------------------------------------------

/**
 * FALTANTE é garrafa que não voltou; os outros treze são defeito de
 * manuseio. São problemas de causa diferente e a tela separa os dois --
 * medido nos 8 meses de 2026, o faltante sozinho é 81,7% do refugo, e
 * somado aos demais esconde os dois.
 */
export const DEFEITO_FALTANTE = "Faltante";

export const DEFEITOS_QUALIDADE = [
  "Quebrada",
  "Segunda",
  "Bicada Interna",
  "Bicada Externa",
  "Cor Fora do Padrão",
  "Logomarca Estranha",
  "Rotulo Plastico",
  "Sujidade Interna",
  "Sujidade Externa",
  "Tampada",
  "Trincada",
  "Bicada Concorrente",
  "Outros",
] as const;

/** Todas as colunas de defeito do relatório, na ordem em que aparecem. */
export const TODOS_OS_DEFEITOS = [
  "Quebrada",
  "Segunda",
  "Bicada Interna",
  "Bicada Externa",
  "Cor Fora do Padrão",
  DEFEITO_FALTANTE,
  "Logomarca Estranha",
  "Rotulo Plastico",
  "Sujidade Interna",
  "Sujidade Externa",
  "Tampada",
  "Trincada",
  "Bicada Concorrente",
  "Outros",
];

// --------------------------------------------------------------------
// ALERTA DE DESTOANTE
// --------------------------------------------------------------------

/**
 * Quando uma aferição destoa a ponto de valer um chamado de correção
 * (pedido do dono em 29/08/2026).
 *
 * Os limiares saem da distribuição real das 434 aferições de 2026:
 * 74% delas dão ZERO refugo, o p99 fica em 3,2%, e o maior caso do ano
 * foi 100% -- as 2.616 garrafas de um mapa inteiro marcadas como
 * faltantes, que é fisicamente improvável e o próprio dono reconheceu
 * como provável erro de lançamento.
 *
 * Com estes números, o alerta dispara UMA vez em 8 meses. É de propósito:
 * alerta que dispara toda hora vira alerta ignorado.
 */
export const PCT_ERRO_DE_LANCAMENTO = 90;
export const PCT_ACIMA_DO_NORMAL = 10;
/** Abaixo disso a porcentagem é ruído: 11 garrafas de 37 dão 30% e não
 *  querem dizer nada. */
export const MINIMO_PARA_ALERTAR = 50;

export type Alerta = "erro_de_lancamento" | "acima_do_normal" | null;

export function alertaDaAfericao(totalAferido: number, refugo: number): Alerta {
  if (totalAferido <= 0 || refugo <= 0) return null;
  const pct = (refugo / totalAferido) * 100;
  if (pct >= PCT_ERRO_DE_LANCAMENTO && refugo >= MINIMO_PARA_ALERTAR) return "erro_de_lancamento";
  if (pct >= PCT_ACIMA_DO_NORMAL && refugo >= MINIMO_PARA_ALERTAR) return "acima_do_normal";
  return null;
}

export const TEXTO_DO_ALERTA: Record<Exclude<Alerta, null>, { titulo: string; explicacao: string }> = {
  erro_de_lancamento: {
    titulo: "Provável erro de lançamento",
    explicacao:
      "Praticamente tudo o que foi aferido virou refugo, o que dificilmente acontece de verdade. Vale abrir chamado para conferir o lançamento antes de considerar este número.",
  },
  acima_do_normal: {
    titulo: "Muito acima do normal",
    explicacao:
      "Esta aferição está muito acima do que a operação costuma dar. Vale conferir se o lançamento está certo.",
  },
};

// --------------------------------------------------------------------
// LEITURA DO RELATÓRIO
// --------------------------------------------------------------------

/** Números do relatório vêm zerados à esquerda ("00000528") e a
 *  porcentagem com vírgula ("006,40"). */
function numero(bruto: string | undefined): number {
  const limpo = String(bruto ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

/** Códigos vêm zerados à esquerda: "01026" é o motorista 1026. */
export function normalizarCodigo(bruto: string | undefined): string | null {
  const digitos = String(bruto ?? "").trim().replace(/\D/g, "");
  if (!digitos) return null;
  const semZeros = digitos.replace(/^0+/, "");
  return semZeros || null;
}

function separarLinha(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else dentroDeAspas = !dentroDeAspas;
    } else if (c === ";" && !dentroDeAspas) {
      campos.push(atual);
      atual = "";
    } else atual += c;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

function indiceDaColuna(cabecalho: string[], ...nomes: string[]): number {
  const limpar = (s: string) =>
    (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const alvos = nomes.map(limpar);
  return cabecalho.findIndex((c) => alvos.includes(limpar(c)));
}

export type AfericaoLida = {
  data: string;
  mapa: string;
  veiculo: string | null;
  placa: string | null;
  transportadora: string | null;
  tipoSorteio: string | null;
  pctIncidenciaVeiculo: number | null;
  pctNaoAferido: number | null;
  motoristaCodigo: string | null;
  motoristaNome: string | null;
  conferenteCodigo: string | null;
  conferenteNome: string | null;
  itemCodigo: string;
  itemDescricao: string | null;
  totalAferido: number;
  qtBoa: number;
  qtFaltante: number;
  qtQualidade: number;
  defeitos: Record<string, number>;
};

export function lerRelatorioDeRefugo(texto: string): {
  afericoes: AfericaoLida[];
  faltando: string[];
  ignoradas: number;
  /** Linhas em que a conta do relatório não fechou. Nos 8 meses de 2026
   *  não houve nenhuma -- se aparecer, o relatório mudou. */
  contaNaoFecha: number;
} {
  const linhas = (texto ?? "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return { afericoes: [], faltando: ["arquivo vazio"], ignoradas: 0, contaNaoFecha: 0 };

  const cab = separarLinha(linhas[0]);
  const iData = indiceDaColuna(cab, "Data");
  const iMapa = indiceDaColuna(cab, "Mapa");
  const iItem = indiceDaColuna(cab, "Item");
  const iAferido = indiceDaColuna(cab, "Total Aferido");

  const faltando: string[] = [];
  if (iData < 0) faltando.push("Data");
  if (iMapa < 0) faltando.push("Mapa");
  if (iItem < 0) faltando.push("Item");
  if (iAferido < 0) faltando.push("Total Aferido");
  if (faltando.length) return { afericoes: [], faltando, ignoradas: 0, contaNaoFecha: 0 };

  const i = {
    veiculo: indiceDaColuna(cab, "Veiculo", "Veículo"),
    placa: indiceDaColuna(cab, "Placa"),
    transportadora: indiceDaColuna(cab, "Transportadora"),
    sorteio: indiceDaColuna(cab, "Tipo Sorteio"),
    incidencia: indiceDaColuna(cab, "% Incidencia Veiculo", "% Incidência Veículo"),
    naoAferido: indiceDaColuna(cab, "% Nao Aferido", "% Não Aferido"),
    motCod: indiceDaColuna(cab, "Cod. Motorista"),
    motNome: indiceDaColuna(cab, "Nome Motorista"),
    confCod: indiceDaColuna(cab, "Cod. Conferente"),
    confNome: indiceDaColuna(cab, "Nome Conferente"),
    itemDesc: indiceDaColuna(cab, "Descricao Item", "Descrição Item"),
    boa: indiceDaColuna(cab, "Qt Boa"),
  };
  const iDefeito = new Map(TODOS_OS_DEFEITOS.map((d) => [d, indiceDaColuna(cab, d)]));

  const afericoes: AfericaoLida[] = [];
  const vistas = new Set<string>();
  let ignoradas = 0;
  let contaNaoFecha = 0;

  const txt = (c: string[], idx: number) => (idx >= 0 ? c[idx]?.trim() || null : null);

  for (const linha of linhas.slice(1)) {
    const c = separarLinha(linha);
    const data = dataParaIso(c[iData] ?? "");
    const mapa = normalizarMapa(c[iMapa] ?? "");
    const itemCodigo = (c[iItem] ?? "").trim();

    if (!data || !mapa || !itemCodigo) {
      ignoradas++;
      continue;
    }

    // A chave (data, mapa, item) é única no relatório -- conferido nas
    // 434 linhas de 2026. Se repetir, fica a primeira: duas linhas com a
    // mesma chave no mesmo lote fariam o upsert reclamar.
    const chave = `${data}|${mapa}|${itemCodigo}`;
    if (vistas.has(chave)) {
      ignoradas++;
      continue;
    }
    vistas.add(chave);

    const defeitos: Record<string, number> = {};
    let qtFaltante = 0;
    let qtQualidade = 0;
    for (const [nome, idx] of iDefeito) {
      if (idx < 0) continue;
      const v = numero(c[idx]);
      if (v > 0) defeitos[nome] = v;
      if (nome === DEFEITO_FALTANTE) qtFaltante += v;
      else qtQualidade += v;
    }

    const totalAferido = numero(c[iAferido]);
    const qtBoa = i.boa >= 0 ? numero(c[i.boa]) : Math.max(totalAferido - qtFaltante - qtQualidade, 0);

    // O relatório se auto-confere: aferido - boa tem que dar a soma dos
    // defeitos. Bateu em 434/434 linhas de 2026. Contamos as divergências
    // em vez de descartar a linha -- o número ainda serve, mas a tela
    // avisa que o relatório mudou de comportamento.
    if (totalAferido - qtBoa !== qtFaltante + qtQualidade) contaNaoFecha++;

    afericoes.push({
      data,
      mapa,
      veiculo: txt(c, i.veiculo),
      placa: txt(c, i.placa),
      transportadora: txt(c, i.transportadora),
      tipoSorteio: txt(c, i.sorteio),
      pctIncidenciaVeiculo: i.incidencia >= 0 ? numero(c[i.incidencia]) : null,
      pctNaoAferido: i.naoAferido >= 0 ? numero(c[i.naoAferido]) : null,
      motoristaCodigo: normalizarCodigo(c[i.motCod]),
      motoristaNome: txt(c, i.motNome),
      // O conferente não tem código numérico no relatório -- vem "Lucas P".
      conferenteCodigo: txt(c, i.confCod),
      conferenteNome: txt(c, i.confNome),
      itemCodigo,
      itemDescricao: txt(c, i.itemDesc),
      totalAferido,
      qtBoa,
      qtFaltante,
      qtQualidade,
      defeitos,
    });
  }

  return { afericoes, faltando: [], ignoradas, contaNaoFecha };
}

// --------------------------------------------------------------------
// RESUMO
// --------------------------------------------------------------------

export type LinhaRefugo = {
  totalAferido: number;
  qtFaltante: number;
  qtQualidade: number;
  itemCodigo: string;
};

export type ResumoRefugo = {
  afericoes: number;
  totalAferido: number;
  qtFaltante: number;
  qtQualidade: number;
  refugo: number;
  /** `null` sem nada aferido -- é "sem dado", não zero por cento. */
  pctRefugo: number | null;
  pctFaltante: number | null;
  pctQualidade: number | null;
  /** `null` quando falta preço cadastrado para algum item do período --
   *  meio valor é pior do que valor nenhum. */
  valor: number | null;
  itensSemValor: string[];
};

export function resumirRefugo(
  linhas: LinhaRefugo[],
  valorPorItem: Map<string, number>,
): ResumoRefugo {
  const totalAferido = linhas.reduce((s, l) => s + l.totalAferido, 0);
  const qtFaltante = linhas.reduce((s, l) => s + l.qtFaltante, 0);
  const qtQualidade = linhas.reduce((s, l) => s + l.qtQualidade, 0);
  const refugo = qtFaltante + qtQualidade;

  const semValor = new Set<string>();
  let valor = 0;
  for (const l of linhas) {
    const r = l.qtFaltante + l.qtQualidade;
    if (r === 0) continue;
    const preco = valorPorItem.get(l.itemCodigo);
    if (preco === undefined) semValor.add(l.itemCodigo);
    else valor += r * preco;
  }

  const pct = (v: number) => (totalAferido > 0 ? Math.round((v / totalAferido) * 10000) / 100 : null);

  return {
    afericoes: linhas.length,
    totalAferido,
    qtFaltante,
    qtQualidade,
    refugo,
    pctRefugo: pct(refugo),
    pctFaltante: pct(qtFaltante),
    pctQualidade: pct(qtQualidade),
    valor: semValor.size > 0 ? null : Math.round(valor * 100) / 100,
    itensSemValor: [...semValor],
  };
}

/** Soma os defeitos de várias aferições, do mais frequente ao menos. */
export function somarDefeitos(
  linhas: { defeitos: Record<string, number> }[],
): { defeito: string; total: number }[] {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    for (const [nome, v] of Object.entries(l.defeitos ?? {})) {
      if (!v) continue;
      mapa.set(nome, (mapa.get(nome) ?? 0) + v);
    }
  }
  return [...mapa]
    .map(([defeito, total]) => ({ defeito, total }))
    .sort((a, b) => b.total - a.total || a.defeito.localeCompare(b.defeito, "pt-BR"));
}

export function formatarReais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
