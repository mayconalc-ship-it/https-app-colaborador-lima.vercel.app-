/**
 * Ativo de Giro (AG) - regras de dominio.
 *
 * Fonte unica da verdade das listas, dos calculos e da conciliacao.
 * As telas e as acoes de servidor consultam daqui.
 */

export const FORMATOS = ["600ml", "300ml", "1000ml", "Verde"] as const;
export type Formato = (typeof FORMATOS)[number];

export const TIPOS = ["Kit AG", "GFE sem Garrafa"] as const;
export type Tipo = (typeof TIPOS)[number];

export const STATUSES = [
  "Cheio",
  "Vazio",
  "Trânsito Rota",
  "Trânsito Fábrica",
] as const;
export type Status = (typeof STATUSES)[number];

/**
 * Tipo + formato + status: a combinação que o formulário de contagem
 * reabre no último valor usado, em vez de sempre no padrão. Mora aqui,
 * num módulo puro, porque é lida no servidor (do cookie) e usada no
 * cliente (o formulário) -- os dois lados precisam do mesmo tipo.
 */
export type Combinacao = { tipo: Tipo; formato: Formato; status: Status };

export const COMBINACAO_PADRAO: Combinacao = {
  tipo: "Kit AG",
  formato: "600ml",
  status: "Cheio",
};

/**
 * Onde a última combinação fica guardada. Cookie, e não localStorage,
 * para o SERVIDOR já desenhar o formulário na combinação certa.
 *
 * O `path` limita o cookie ao módulo -- ele não tem por que viajar junto
 * de toda requisição do app.
 */
export const COOKIE_ULTIMA = "ag_ultima";
export const COOKIE_ULTIMA_PATH = "/ativo-de-giro";
export const COOKIE_ULTIMA_DIAS = 180;

export function serializarCombinacao(c: Combinacao) {
  return encodeURIComponent(JSON.stringify(c));
}

/**
 * Lê a combinação guardada no cookie. Serve aos DOIS lados: o servidor lê
 * de `cookies()`, o navegador lê de `document.cookie`.
 *
 * Ler igual nos dois lados é o ponto. Quando cada lado desembrulhava o
 * valor de um jeito, bastava um deles falhar para o formulário renascer
 * no padrão -- era assim que "300ml" virava "600ml" depois de salvar.
 *
 * Por isso a leitura é tolerante: o valor pode chegar cru, percent-encoded
 * uma vez (foi assim que gravamos) ou duas (se a plataforma também
 * codificar por conta própria). Tenta desembrulhar até virar JSON válido.
 * Valor torto devolve `null`, e quem chama decide o que fazer -- nada aqui
 * decide o que entra no banco, então adulterar o cookie não leva a nada.
 */
export function lerCombinacao(
  bruto: string | null | undefined,
): Combinacao | null {
  if (!bruto) return null;

  let valor = bruto;
  for (let volta = 0; volta < 3; volta++) {
    try {
      const v: unknown = JSON.parse(valor);
      if (ehCombinacao(v)) return { tipo: v.tipo, formato: v.formato, status: v.status };
    } catch {
      // Ainda embrulhado: tenta desembrulhar mais uma camada abaixo.
    }

    let aberto: string;
    try {
      aberto = decodeURIComponent(valor);
    } catch {
      break; // Percent-encoding quebrado: não há mais o que tentar.
    }
    if (aberto === valor) break;
    valor = aberto;
  }

  return null;
}

function ehCombinacao(v: unknown): v is Combinacao {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return ehTipo(c.tipo) && ehFormato(c.formato) && ehStatus(c.status);
}

export type Fator = { palete: number; lastro: number };
export type Fatores = Record<Formato, Fator>;

/** Usado enquanto a tabela ag_fatores nao responder. */
export const FATORES_PADRAO: Fatores = {
  "600ml": { palete: 42, lastro: 7 },
  "300ml": { palete: 90, lastro: 10 },
  "1000ml": { palete: 50, lastro: 10 },
  Verde: { palete: 42, lastro: 7 },
};

export type Contagem = {
  id: number;
  data: string;
  colaborador_id: string;
  colaborador_nome: string;
  tipo: Tipo;
  formato: Formato;
  status: Status;
  palete: number;
  lastro: number;
  caixa: number;
};

/**
 * Uma contagem antes de existir no banco: o que o formulário sabe, sem id
 * nem autor. É o que a tela mostra enquanto o servidor não confirmou.
 */
export type LinhaContagem = Omit<
  Contagem,
  "id" | "colaborador_id" | "colaborador_nome"
>;

/** As colunas de `ag_contagens` que as telas leem. */
export const COLUNAS_CONTAGEM =
  "id, data, colaborador_id, colaborador_nome, tipo, formato, status, palete, lastro, caixa";

/** Quem já lançou contagem -- alimenta o filtro por colaborador. */
export type Contador = { id: string; nome: string };

/**
 * A lista de quem contou, sem repetição e em ordem alfabética.
 *
 * O nome vem da própria contagem (`colaborador_nome`), que é uma foto do
 * nome no dia do lançamento. Se a pessoa mudar de nome depois, as linhas
 * antigas guardam o nome antigo -- então o mais recente é que vale, e por
 * isso a lista de entrada deve vir ordenada da mais nova para a mais velha.
 */
export function contadoresDeLinhas(
  linhas: { colaborador_id: string; colaborador_nome: string }[] | null,
): Contador[] {
  const porId = new Map<string, string>();
  for (const l of linhas ?? []) {
    if (!porId.has(l.colaborador_id)) porId.set(l.colaborador_id, l.colaborador_nome);
  }
  return [...porId]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export type Parque = Record<string, number>;

export function ehFormato(v: unknown): v is Formato {
  return typeof v === "string" && (FORMATOS as readonly string[]).includes(v);
}

export function ehTipo(v: unknown): v is Tipo {
  return typeof v === "string" && (TIPOS as readonly string[]).includes(v);
}

export function ehStatus(v: unknown): v is Status {
  return typeof v === "string" && (STATUSES as readonly string[]).includes(v);
}

/** Numero inteiro, nunca negativo. Campo vazio conta como zero. */
export function inteiro(v: unknown, max = 1_000_000): number {
  const n = Number(v === "" || v === null || v === undefined ? 0 : v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > max) {
    throw new Error("Valor numérico inválido.");
  }
  return n;
}

export function chave(tipo: Tipo | string, formato: Formato | string) {
  return `${tipo}|${formato}`;
}

/** Total em caixas: paletes e lastros convertidos + as caixas soltas. */
export function totalEmCaixas(
  c: { palete: number; lastro: number; caixa: number },
  f: Fator,
) {
  return c.palete * f.palete + c.lastro * f.lastro + c.caixa;
}

/** Paletes cheios equivalentes -- usado no painel de garrafeira. */
export function paletesEquivalentes(totalCaixas: number, f: Fator) {
  return f.palete > 0 ? totalCaixas / f.palete : 0;
}

export function fatoresDeLinhas(
  linhas: { formato: string; palete: number; lastro: number }[] | null,
): Fatores {
  const mapa: Fatores = { ...FATORES_PADRAO };
  for (const l of linhas ?? []) {
    if (ehFormato(l.formato)) {
      mapa[l.formato] = { palete: l.palete, lastro: l.lastro };
    }
  }
  return mapa;
}

export function parqueDeLinhas(
  linhas: { tipo: string; formato: string; quantidade: number }[] | null,
): Parque {
  const mapa: Parque = {};
  for (const l of linhas ?? []) mapa[chave(l.tipo, l.formato)] = l.quantidade;
  return mapa;
}

export type LinhaConciliacao = {
  tipo: Tipo;
  formato: Formato;
  contado: number;
  parque: number;
  diferenca: number;
};

/**
 * Conciliacao do dia: soma TODAS as contagens de cada tipo+formato
 * (varias pessoas podem contar o mesmo item) e compara com o parque.
 */
export function conciliar(
  contagens: Contagem[],
  parque: Parque,
  fatores: Fatores,
): LinhaConciliacao[] {
  const somas = new Map<string, number>();
  for (const c of contagens) {
    const k = chave(c.tipo, c.formato);
    somas.set(k, (somas.get(k) ?? 0) + totalEmCaixas(c, fatores[c.formato]));
  }

  const linhas: LinhaConciliacao[] = [];
  for (const tipo of TIPOS) {
    for (const formato of FORMATOS) {
      const k = chave(tipo, formato);
      const contado = somas.get(k) ?? 0;
      const saldo = parque[k] ?? 0;
      if (contado === 0 && saldo === 0) continue;
      linhas.push({
        tipo,
        formato,
        contado,
        parque: saldo,
        diferenca: contado - saldo,
      });
    }
  }
  return linhas;
}

/** Total por formato, somando os dois tipos -- alimenta o grafico. */
export function totaisPorFormato(contagens: Contagem[], fatores: Fatores) {
  return FORMATOS.map((formato) => ({
    formato,
    total: contagens
      .filter((c) => c.formato === formato)
      .reduce((soma, c) => soma + totalEmCaixas(c, fatores[formato]), 0),
  }));
}

export function hojeISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

/** "AAAA-MM-DD" de N dias atrás — usado para pré-preencher filtros de período. */
export function diasAtrasISO(n: number) {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000 - n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function formatarData(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Texto pronto para colar no WhatsApp. */
export function resumoWhatsApp(
  data: string,
  contagens: Contagem[],
  fatores: Fatores,
) {
  const linhas = [
    `*CONTAGEM DE ATIVO DE GIRO*`,
    `Data: ${formatarData(data)}`,
    "",
  ];
  for (const c of contagens) {
    linhas.push(
      `${c.tipo} | ${c.formato} | ${c.status}`,
      `Pal: ${c.palete} | Las: ${c.lastro} | Cx: ${c.caixa} = *${totalEmCaixas(c, fatores[c.formato])} cx*`,
      `Colaborador: ${c.colaborador_nome}`,
      "",
    );
  }
  const total = contagens.reduce(
    (s, c) => s + totalEmCaixas(c, fatores[c.formato]),
    0,
  );
  linhas.push(`*TOTAL GERAL: ${total} caixas*`);
  return linhas.join("\n");
}

/** CSV com uma linha por contagem, ponto e virgula (Excel pt-BR). */
export function csvDasContagens(contagens: Contagem[], fatores: Fatores) {
  const cab = [
    "Data",
    "Colaborador",
    "Tipo",
    "Formato",
    "Status",
    "Paletes",
    "Lastros",
    "Caixas",
    "Total (cx)",
  ].join(";");

  const linhas = contagens.map((c) =>
    [
      formatarData(c.data),
      c.colaborador_nome,
      c.tipo,
      c.formato,
      c.status,
      c.palete,
      c.lastro,
      c.caixa,
      totalEmCaixas(c, fatores[c.formato]),
    ].join(";"),
  );

  return [cab, ...linhas].join("\n");
}
