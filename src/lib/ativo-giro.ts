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
  /** Pedido de recontagem que esta linha atende, se for o caso. */
  recontagem_id: number | null;
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
  "id, data, colaborador_id, colaborador_nome, tipo, formato, status, palete, lastro, caixa, recontagem_id";

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

/**
 * Até quantos por cento do parque a diferença é aceitável.
 *
 * Definido pelo dono em 03/09/2026. Não é uma meta de desempenho: é o
 * ruído normal de um parque que se move o dia inteiro -- carreta que
 * chegou depois da contagem, palete que estava sendo carregado. Acima
 * disso não é ruído, é falta ou sobra de verdade, e alguém precisa ir
 * atrás.
 */
export const LIMITE_DIFERENCA_PCT = 5;

/**
 * AS TRÊS PARCELAS QUE NÃO ESTÃO NO PÁTIO, por tipo|formato.
 *
 * Cada uma é um lugar diferente onde o ativo pode estar, e é por isso que
 * são três colunas e não um número só (pedido do dono, 03/09/2026):
 *
 *   rota      saiu com a entrega e volta no mesmo dia
 *   carreta   está entre unidades, com o transportador
 *   comodato  está emprestado ao cliente, e fica lá
 *
 * As três somam ao contado antes de comparar com o parque. Separadas,
 * quem olha a conciliação sabe ONDE está o ativo que falta no pátio --
 * com um número só, sabia apenas que ele não estava aqui.
 */
export type ParcelaFora = { rota: number; carreta: number; comodato: number };
export type Transito = Record<string, ParcelaFora>;

export const PARCELA_ZERO: ParcelaFora = { rota: 0, carreta: 0, comodato: 0 };

/** Rota e carreta vêm do lançamento DO DIA (ag_transito). */
export function transitoDeLinhas(
  linhas:
    | { tipo: string; formato: string; transito_rota: number; transito_carreta: number }[]
    | null,
): Record<string, { rota: number; carreta: number }> {
  const mapa: Record<string, { rota: number; carreta: number }> = {};
  for (const l of linhas ?? []) {
    mapa[chave(l.tipo, l.formato)] = {
      rota: l.transito_rota ?? 0,
      carreta: l.transito_carreta ?? 0,
    };
  }
  return mapa;
}

/**
 * O comodato NÃO vem do dia: ele é um saldo que vale até alguém mudar,
 * igual ao parque (ver migration 094).
 *
 * Se fosse lançado dia a dia, alguém teria de redigitar o mesmo número
 * toda manhã -- e no dia em que esquecesse, o comodato viraria zero e a
 * conciliação acusaria uma falta que não existe.
 */
export function comodatoDeLinhas(
  linhas: { tipo: string; formato: string; quantidade: number }[] | null,
): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const l of linhas ?? []) mapa[chave(l.tipo, l.formato)] = l.quantidade;
  return mapa;
}

/** Junta as duas origens no formato que a conciliação consome. */
export function juntarParcelas(
  doDia: Record<string, { rota: number; carreta: number }>,
  comodato: Record<string, number>,
): Transito {
  const mapa: Transito = {};
  for (const k of new Set([...Object.keys(doDia), ...Object.keys(comodato)])) {
    mapa[k] = {
      rota: doDia[k]?.rota ?? 0,
      carreta: doDia[k]?.carreta ?? 0,
      comodato: comodato[k] ?? 0,
    };
  }
  return mapa;
}

export type LinhaConciliacao = {
  tipo: Tipo;
  formato: Formato;
  contado: number;
  /** As três parcelas fora do pátio, separadas -- é o que diz ONDE está
   *  o ativo que não foi contado. */
  rota: number;
  carreta: number;
  comodato: number;
  /** A soma das três. Guardada para a tela não repetir a conta. */
  transito: number;
  parque: number;
  /** contado + rota + carreta + comodato − parque. Negativo é falta,
   *  positivo é sobra. */
  diferenca: number;
  /** A diferença sobre o PARQUE, em módulo. `null` sem parque: dividir
   *  por zero não dá "0% de erro", dá pergunta sem resposta. */
  pctDiferenca: number | null;
  /** Verde ou vermelho na tela. Sem parque não afirma nada -- fica null,
   *  e a tela mostra em cinza. */
  dentroDoAceitavel: boolean | null;
};

/**
 * Conciliacao do dia: soma TODAS as contagens de cada tipo+formato
 * (varias pessoas podem contar o mesmo item), acrescenta o trânsito e
 * compara com o parque.
 *
 * A CONTA É `contado + rota + carreta + comodato − parque`, pedido do
 * dono. As três parcelas entram somando porque são ativo DA REVENDA --
 * só não estão aqui para ser contados. Sem elas, todo dia com entrega na
 * rua e carreta na estrada acusava falta.
 *
 * Cuidado que a tela precisa dizer, e diz: `status` de contagem já tem
 * "Trânsito Rota" e "Trânsito Fábrica", e aquilo é coisa CONTADA no
 * pátio, que entra em `contado`. Estas parcelas são as que ninguém
 * consegue contar. São coisas diferentes com nome parecido, e é por isso
 * que as colunas vêm explicadas.
 */
export function conciliar(
  contagens: Contagem[],
  parque: Parque,
  fatores: Fatores,
  transito: Transito = {},
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
      const fora = transito[k] ?? PARCELA_ZERO;
      const emTransito = fora.rota + fora.carreta + fora.comodato;
      const saldo = parque[k] ?? 0;
      // Linha sem nada em parte nenhuma: não existe para esta revenda.
      if (contado === 0 && saldo === 0 && emTransito === 0) continue;

      const diferenca = contado + emTransito - saldo;
      const pct = saldo > 0 ? Math.round((Math.abs(diferenca) / saldo) * 1000) / 10 : null;

      linhas.push({
        tipo,
        formato,
        contado,
        rota: fora.rota,
        carreta: fora.carreta,
        comodato: fora.comodato,
        transito: emTransito,
        parque: saldo,
        diferenca,
        pctDiferenca: pct,
        dentroDoAceitavel: pct === null ? null : pct <= LIMITE_DIFERENCA_PCT,
      });
    }
  }
  return linhas;
}

/**
 * O fechamento do dia, somando as linhas.
 *
 * O percentual do TOTAL soma antes de dividir -- média de porcentagens
 * daria o mesmo peso a uma linha de 100 caixas e a uma de 18 mil. É o
 * mesmo raciocínio do percentual por produto do bate palete.
 */
export type ResumoConciliacao = {
  contado: number;
  rota: number;
  carreta: number;
  comodato: number;
  transito: number;
  parque: number;
  diferenca: number;
  pctDiferenca: number | null;
  dentroDoAceitavel: boolean | null;
  /** Quantas linhas passaram do limite -- é o que a pessoa vai olhar. */
  linhasFora: number;
};

export function resumirConciliacao(linhas: LinhaConciliacao[]): ResumoConciliacao {
  const contado = linhas.reduce((s, l) => s + l.contado, 0);
  const rota = linhas.reduce((s, l) => s + l.rota, 0);
  const carreta = linhas.reduce((s, l) => s + l.carreta, 0);
  const comodato = linhas.reduce((s, l) => s + l.comodato, 0);
  const transito = rota + carreta + comodato;
  const parque = linhas.reduce((s, l) => s + l.parque, 0);
  const diferenca = contado + transito - parque;
  const pct = parque > 0 ? Math.round((Math.abs(diferenca) / parque) * 1000) / 10 : null;

  return {
    contado,
    rota,
    carreta,
    comodato,
    transito,
    parque,
    diferenca,
    pctDiferenca: pct,
    dentroDoAceitavel: pct === null ? null : pct <= LIMITE_DIFERENCA_PCT,
    linhasFora: linhas.filter((l) => l.dentroDoAceitavel === false).length,
  };
}

/**
 * A conciliação de CADA DIA do período -- a evolução das faltas e
 * sobras, que é o que o dono pediu para acompanhar.
 *
 * Um dia sem contagem nenhuma NÃO vira uma linha de "falta de 100%".
 * Domingo, feriado e dia em que ninguém contou não são dias com
 * problema: são dias sem medição, e enfiá-los no gráfico como queda
 * inventaria uma piora que não houve. Mesmo raciocínio do
 * `mediaHlPorDia` do bate palete.
 *
 * O PARQUE usado é o de HOJE, para todos os dias -- é o único que
 * existe: `ag_parque` guarda o saldo atual, não uma série histórica.
 * Isso é honesto para a janela curta que a tela mostra (o parque muda de
 * mês em mês, não de dia em dia), e é a razão de o histórico não voltar
 * anos.
 */
export type DiaConciliado = ResumoConciliacao & { dia: string };

export function conciliarPorDia(
  contagens: Contagem[],
  parque: Parque,
  fatores: Fatores,
  /** Rota e carreta, por dia -- cada dia tem o seu lançamento. */
  transitoPorDia: Record<string, Record<string, { rota: number; carreta: number }>>,
  /** O comodato é um só, e vale para todos os dias: ele não muda todo
   *  dia, e por isso não é lançado por dia (ver migration 094). */
  comodato: Record<string, number> = {},
): DiaConciliado[] {
  const porDia = new Map<string, Contagem[]>();
  for (const c of contagens) {
    porDia.set(c.data, [...(porDia.get(c.data) ?? []), c]);
  }

  // Um dia que só tem trânsito lançado (ninguém contou) também não entra:
  // sem contagem não há conciliação, há um número solto.
  return [...porDia.entries()]
    .map(([dia, doDia]) => ({
      dia,
      ...resumirConciliacao(
        conciliar(
          doDia,
          parque,
          fatores,
          juntarParcelas(transitoPorDia[dia] ?? {}, comodato),
        ),
      ),
    }))
    .sort((a, b) => b.dia.localeCompare(a.dia));
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

/**
 * O dia da revenda, nao o dia de quem esta rodando o codigo: no servidor da
 * Vercel o relogio e UTC, e das 21h a meia-noite de Brasilia isso ja seria
 * amanha. "en-CA" ja formata em AAAA-MM-DD.
 */
const DIA_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function hojeISO() {
  return DIA_SP.format(new Date());
}

/** "AAAA-MM-DD" de N dias atrás — usado para pré-preencher filtros de período. */
export function diasAtrasISO(n: number) {
  return DIA_SP.format(new Date(Date.now() - n * 86_400_000));
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

/**
 * Um pedido de recontagem: o controle escreve o que precisa ser
 * conferido de novo, em texto livre -- não mais tipo/formato/status
 * estruturados. Quem atende entra pelo botão certo, e é ESSE clique que
 * liga a contagem nova ao pedido (`recontagem_id`), não uma tentativa de
 * adivinhar por semelhança depois.
 */
export type Recontagem = {
  id: number;
  /** O dia que estava sendo conciliado quando o pedido nasceu. Também é
   *  quem decide a audiência: só quem contou ESTE dia é avisado. */
  dia: string;
  descricao: string;
  solicitadoNome: string;
  criadoEm: string;
};

/** As colunas de `ag_recontagens` que as telas leem. */
export const COLUNAS_RECONTAGEM = "id, dia, descricao, solicitado_nome, criado_em";

export function recontagensDeLinhas(
  linhas:
    | {
        id: number;
        dia: string;
        descricao: string;
        solicitado_nome: string;
        criado_em: string;
      }[]
    | null,
): Recontagem[] {
  return (linhas ?? []).map((l) => ({
    id: l.id,
    dia: l.dia,
    descricao: l.descricao,
    solicitadoNome: l.solicitado_nome,
    criadoEm: l.criado_em,
  }));
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
