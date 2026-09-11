/**
 * INDICADORES DO REFUGO -- a operação inteira, não a pessoa.
 *
 * "Meu Refugo" mostra ao motorista, ao ajudante e ao conferente as
 * PRÓPRIAS aferições. Este é o outro lado, pedido pelo dono em 11/09/2026:
 * a análise que ele montou em cima do relatório 03.11.34.05 -- por data,
 * placa, incidência do veículo, motorista, conferente, item, tipo de
 * refugo e tipo de sorteio -- dentro do app, liberável por pessoa.
 *
 * Só matemática aqui: sem banco e sem React, para caber em teste.
 */

export const SEM_INFORMACAO = "Não informado";

export type AfericaoParaIndicador = {
  data: string;
  mapa: string;
  placa: string | null;
  veiculo: string | null;
  tipoSorteio: string | null;
  pctIncidenciaVeiculo: number | null;
  motoristaNome: string | null;
  conferenteNome: string | null;
  itemCodigo: string;
  itemDescricao: string | null;
  totalAferido: number;
  qtFaltante: number;
  qtQualidade: number;
  defeitos: Record<string, number>;
};

export type LinhaDoRanking = {
  chave: string;
  /** Um complemento para a tela: o código do item, o nº do veículo. */
  detalhe: string | null;
  afericoes: number;
  /** Mapas distintos (data + mapa): um mapa traz vários itens. */
  mapas: number;
  aferido: number;
  faltante: number;
  qualidade: number;
  refugo: number;
  /** `null` sem nada aferido -- "sem dado", não zero por cento. */
  pct: number | null;
  /** `null` quando falta o preço de algum item do grupo: meio valor é
   *  pior do que valor nenhum (a mesma regra de resumirRefugo). */
  valor: number | null;
};

const pctDe = (parte: number, total: number) =>
  total > 0 ? Math.round((parte / total) * 10000) / 100 : null;

/** Junta "LUCAS MORAES PEREIRA" e "Lucas Moraes Pereira" -- o relatório
 *  grava o mesmo conferente com caixas diferentes em meses diferentes. */
function chaveNormalizada(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/**
 * Agrupa as aferições por uma dimensão qualquer e devolve o ranking, do
 * maior refugo ao menor. Chave vazia vira "Não informado" em vez de sumir:
 * aferição sem placa continua sendo refugo, e escondê-la faria o total da
 * tabela não bater com o do topo.
 */
export function agruparAfericoes(
  afericoes: AfericaoParaIndicador[],
  chaveDe: (a: AfericaoParaIndicador) => string | null,
  valorPorItem: Map<string, number>,
  detalheDe?: (a: AfericaoParaIndicador) => string | null,
): LinhaDoRanking[] {
  type Acumulado = LinhaDoRanking & { mapasVistos: Set<string>; semPreco: boolean };
  const grupos = new Map<string, Acumulado>();

  for (const a of afericoes) {
    const bruta = chaveDe(a)?.trim() || SEM_INFORMACAO;
    const k = chaveNormalizada(bruta);
    let g = grupos.get(k);
    if (!g) {
      g = {
        chave: bruta,
        detalhe: detalheDe?.(a) ?? null,
        afericoes: 0,
        mapas: 0,
        aferido: 0,
        faltante: 0,
        qualidade: 0,
        refugo: 0,
        pct: null,
        valor: 0,
        mapasVistos: new Set(),
        semPreco: false,
      };
      grupos.set(k, g);
    }
    const refugo = a.qtFaltante + a.qtQualidade;
    g.afericoes++;
    g.mapasVistos.add(`${a.data}|${a.mapa}`);
    g.aferido += a.totalAferido;
    g.faltante += a.qtFaltante;
    g.qualidade += a.qtQualidade;
    g.refugo += refugo;
    if (refugo > 0) {
      const preco = valorPorItem.get(a.itemCodigo);
      if (preco === undefined) g.semPreco = true;
      else g.valor = (g.valor ?? 0) + refugo * preco;
    }
  }

  return [...grupos.values()]
    .map(({ mapasVistos, semPreco, ...g }) => ({
      ...g,
      mapas: mapasVistos.size,
      pct: pctDe(g.refugo, g.aferido),
      valor: semPreco ? null : Math.round((g.valor ?? 0) * 100) / 100,
    }))
    .sort(
      (x, y) =>
        y.refugo - x.refugo ||
        (y.pct ?? 0) - (x.pct ?? 0) ||
        x.chave.localeCompare(y.chave, "pt-BR"),
    );
}

// --------------------------------------------------------------------
// POR DATA
// --------------------------------------------------------------------

export type Granularidade = "dia" | "semana" | "mes";

/** Até um mês, dia a dia; até quatro meses, por semana; acima, por mês --
 *  para o gráfico nunca virar uma cerca de 200 palitos no celular. */
export function granularidadeDoPeriodo(dias: number): Granularidade {
  if (dias <= 31) return "dia";
  if (dias <= 120) return "semana";
  return "mes";
}

/** A segunda-feira da semana de uma data ISO. Meio-dia UTC para o fuso
 *  do servidor não empurrar a data para o dia anterior. */
export function segundaDaSemana(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const recuo = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - recuo);
  return d.toISOString().slice(0, 10);
}

function balde(iso: string, g: Granularidade) {
  if (g === "dia") return iso;
  if (g === "semana") return segundaDaSemana(iso);
  return iso.slice(0, 7);
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function rotuloDoPeriodo(chave: string, g: Granularidade): string {
  if (g === "mes") {
    const [ano, mes] = chave.split("-");
    return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`;
  }
  const [, mes, dia] = chave.split("-");
  return g === "semana" ? `sem ${dia}/${mes}` : `${dia}/${mes}`;
}

/** A série no tempo, em ordem cronológica. Só os baldes que tiveram
 *  aferição: nem todo dia tem mapa sorteado, e dia sem sorteio não é dia
 *  com refugo zero. */
export function evolucaoDoRefugo(
  afericoes: AfericaoParaIndicador[],
  g: Granularidade,
  valorPorItem: Map<string, number>,
): LinhaDoRanking[] {
  return agruparAfericoes(afericoes, (a) => balde(a.data, g), valorPorItem).sort((x, y) =>
    x.chave.localeCompare(y.chave),
  );
}

// --------------------------------------------------------------------
// INCIDÊNCIA DO VEÍCULO
// --------------------------------------------------------------------

/**
 * O "% Incidência Veículo" vem pronto do relatório -- é o índice do
 * veículo no controle da Ambev, não uma conta do app. Ele muda com o
 * tempo, então vale o da aferição MAIS RECENTE de cada placa: a média de
 * um índice que já é acumulado não quer dizer nada.
 */
export function incidenciaPorPlaca(
  afericoes: AfericaoParaIndicador[],
): Map<string, { pct: number; data: string; veiculo: string | null }> {
  const saida = new Map<string, { pct: number; data: string; veiculo: string | null }>();
  for (const a of afericoes) {
    if (!a.placa || a.pctIncidenciaVeiculo === null) continue;
    const atual = saida.get(a.placa);
    if (!atual || a.data > atual.data) {
      saida.set(a.placa, { pct: a.pctIncidenciaVeiculo, data: a.data, veiculo: a.veiculo });
    }
  }
  return saida;
}
