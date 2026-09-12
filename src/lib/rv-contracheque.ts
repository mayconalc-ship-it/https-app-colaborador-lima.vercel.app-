import {
  formatarCelula,
  formatarMoeda,
  formatarNumero,
  normalizarTexto,
  paraNumero,
} from "@/lib/formatar";
import type { DetalheRV } from "@/lib/rv";

/**
 * Monta a "escada" da RV: cada degrau mostra de onde saiu o valor do degrau
 * anterior, ate chegar nas DUAS linhas que o colaborador ve no contracheque:
 *
 *   Valor/Caixa                                    (caixas x valor por caixa)
 *   + 5% de ABS
 *   + Recarga
 *   = Produtividade    (o anterior + 5% de tempo de casa, a partir de 18 meses)
 *   + Premio           (referente a devolucao)
 *   = Total a receber
 *
 * Todas as contas ja vem prontas da planilha -- aqui so damos nome a cada
 * coluna e mostramos a ordem, para o app nunca discordar da folha.
 */

/** Normaliza e junta espacos repetidos: na planilha vem "RV  com  %". */
function chave(rotulo: string) {
  return normalizarTexto(rotulo).replace(/\s+/g, " ");
}

type Busca = (nome: string) => boolean;

/** "RV s/ %", "RV sem %" -- e nada além disso depois do "%". */
export function ehRvSemPercentual(n: string) {
  return /^rv (s\/|sem) ?%$/.test(chave(n));
}

/** "RV c/ %", "RV com %" -- "RV C/ bonus devolução %" NÃO é este. */
export function ehRvComPercentual(n: string) {
  return /^rv (c\/|com) ?%$/.test(chave(n));
}

const COLUNAS = {
  caixas: (n: string) => n === "qt caixas",
  // SÓ o título de São Félix -- "RV s/ %" e "RV com %" (10/09/2026). Era
  // "começa com rv c/", e o "RV C/ bonus devolução %" da planilha de
  // motorista de Barreiras caía aqui: a escada montava a conta do modelo de
  // São Félix e mostrava R$ 870,81 para quem tinha R$ 1.314,36 no TOTAL.
  semAbs: ehRvSemPercentual,
  comAbs: ehRvComPercentual,
  valorRec: (n: string) => n === "valor rec",
  qtRec: (n: string) => n.startsWith("qt. rec") || n.startsWith("qt rec"),
  comRec: (n: string) => n === "tt-devolucao",
  comTempoDeCasa: (n: string) => n === "rv tt + 5% tempo de casa",
  premio: (n: string) => n === "valor devolucao",
  totalAntigo: (n: string) => n === "total r$",
} satisfies Record<string, Busca>;

/**
 * Colunas ja explicadas na escada. Repeti-las cruas no detalhamento so
 * confunde -- inclusive "Total R$", que nao inclui os 5% de tempo de casa
 * e por isso diverge do total real.
 */
export function ehColunaDoContracheque(rotulo: string, modelo: ModeloRV = "sao-felix") {
  const n = chave(rotulo);
  // Em Barreiras, as colunas que a escada já conta. "Valor" sozinho é o
  // preço da recarga lá -- em São Félix não existe, e por isso a regra é
  // por modelo, não uma lista só.
  if (modelo === "barreiras") {
    return Object.entries(BARREIRAS).some(
      ([nome, busca]) => nome !== "percentualDevolucao" && busca(n),
    );
  }
  return (
    COLUNAS.semAbs(n) ||
    COLUNAS.comAbs(n) ||
    COLUNAS.valorRec(n) ||
    COLUNAS.comRec(n) ||
    COLUNAS.comTempoDeCasa(n) ||
    COLUNAS.premio(n) ||
    COLUNAS.totalAntigo(n)
  );
}

export type PassoRV = {
  rotulo: string;
  detalhe: string;
  valor: number;
  /** As linhas que aparecem no contracheque. */
  doContracheque?: boolean;
};

export type ModeloRV = "sao-felix" | "barreiras";

export type MemoriaRV = {
  modelo: ModeloRV;
  passos: PassoRV[];
  total: number;
  /** A frase embaixo do total: quais linhas vão para o contracheque. */
  nota: string;
};

/**
 * Qual das duas planilhas é. A de Barreiras tem "Remuneração sem %"; a de
 * São Félix, "RV s/ %". Nenhuma tem as duas.
 */
function modeloDe(detalhes: DetalheRV[]): ModeloRV {
  return detalhes.some((d) => BARREIRAS.semPercentual(chave(d.rotulo))) ? "barreiras" : "sao-felix";
}

export function montarMemoriaRV(detalhes: DetalheRV[], totalDaPlanilha?: string | null): MemoriaRV | null {
  return modeloDe(detalhes) === "barreiras"
    ? montarMemoriaBarreiras(detalhes, totalDaPlanilha ?? null)
    : montarMemoriaSaoFelix(detalhes);
}

function montarMemoriaSaoFelix(detalhes: DetalheRV[]): MemoriaRV | null {
  const valorDe = (busca: Busca) => {
    const achado = detalhes.find((d) => busca(chave(d.rotulo)));
    return achado ? paraNumero(achado.valor) : null;
  };

  const caixas = valorDe(COLUNAS.caixas);
  const semAbs = valorDe(COLUNAS.semAbs);
  const comAbs = valorDe(COLUNAS.comAbs);
  const valorRec = valorDe(COLUNAS.valorRec);
  const qtRec = valorDe(COLUNAS.qtRec);
  const comRec = valorDe(COLUNAS.comRec);
  const comTempoDeCasa = valorDe(COLUNAS.comTempoDeCasa);
  const premio = valorDe(COLUNAS.premio) ?? 0;

  // Sem nenhum dos degraus de produtividade nao da para montar a escada.
  const base = comTempoDeCasa ?? comRec ?? comAbs ?? semAbs;
  if (base === null) return null;

  const passos: PassoRV[] = [];

  if (semAbs !== null) {
    // A taxa por caixa muda por funcao (motorista R$ 0,18, ajudante R$ 0,10).
    // Calculamos a partir da propria linha para nunca ficar desatualizada.
    const taxa = caixas ? semAbs / caixas : null;
    passos.push({
      rotulo: "Valor/Caixa",
      detalhe:
        taxa !== null
          ? `${formatarNumero(caixas!)} caixas × ${formatarMoeda(taxa)} por caixa`
          : "Valor pago pelas caixas entregues",
      valor: semAbs,
    });
  }

  if (comAbs !== null) {
    passos.push({
      rotulo: "+ 5% de ABS",
      detalhe: "Valor/Caixa + 5% de absenteísmo",
      valor: comAbs,
    });
  }

  // Só vira degrau quando houve recarga: senão repetiria o valor acima.
  const temRec = comRec !== null && valorRec !== null && valorRec !== 0;
  if (temRec) {
    passos.push({
      rotulo: "+ Recarga",
      detalhe: `Valor/Caixa + 5% ABS + ${formatarMoeda(valorRec!)} de REC${
        qtRec ? ` (${formatarNumero(qtRec)} recarga${qtRec > 1 ? "s" : ""})` : ""
      }`,
      valor: comRec!,
    });
  }

  const produtividade = comTempoDeCasa ?? comRec ?? comAbs ?? semAbs!;
  const ganhouTempoDeCasa =
    comTempoDeCasa !== null && comRec !== null && comTempoDeCasa > comRec;

  passos.push({
    rotulo: "Produtividade",
    detalhe: ganhouTempoDeCasa
      ? `Valor/Caixa + 5% ABS${temRec ? " + REC" : ""} + 5% de tempo de casa (18 meses ou mais de empresa)`
      : `Valor/Caixa + 5% ABS${temRec ? " + REC" : ""} — os 5% de tempo de casa entram a partir de 18 meses de empresa`,
    valor: produtividade,
    doContracheque: true,
  });

  passos.push({
    rotulo: "Prêmio",
    detalhe: "Referente à devolução",
    valor: premio,
    doContracheque: true,
  });

  return {
    modelo: "sao-felix",
    passos,
    total: produtividade + premio,
    nota: "Produtividade + Prêmio. São essas 2 linhas que aparecem no seu contracheque.",
  };
}

/**
 * A ESCADA DE BARREIRAS (11/09/2026, pedido do dono: "senti falta do
 * detalhamento da RV como o de São Félix").
 *
 * A planilha é outra, e a conta também -- conferida linha a linha contra a
 * de motorista e a de ajudante:
 *
 *   Remuneração sem %        = caixas × R$ 0,18 (motorista) ou 0,10 (ajudante)
 *   RV c/ bônus devolução %  = o anterior + Valor devolução
 *                              -- COM ABS, vira 95% da Remuneração, sem o
 *                              prêmio (ajudante Marcelo, julho/2026)
 *   bônus tempo de casa      = 5% da Remuneração sem %, a partir de 1,5 ano
 *   Valor recarga            = Qtd recarga × Valor
 *   TOTAL                    = RV c/ bônus + tempo de casa + recarga + adicional
 *
 * No contracheque são TRÊS linhas: Produtividade, Prêmio e Tempo de casa --
 * esta última separada das outras duas (dito pelo dono).
 *
 * O ABS NÃO É UMA TAXA FIXA AQUI: o app não refaz a regra, lê o efeito. O
 * que a planilha tirou é a diferença entre "RV c/ bônus" e "Remuneração +
 * devolução" -- primeiro some o prêmio, e o que passar dele sai da
 * Remuneração. Assim o app nunca discorda da folha, nem quando a regra do
 * ABS mudar.
 */
const BARREIRAS = {
  caixas: (n: string) => n === "qtd caixas" || n === "quantidade caixas",
  semPercentual: (n: string) => n === "remuneracao sem %",
  devolucao: (n: string) => n === "valor devolucao",
  percentualDevolucao: (n: string) => n === "% devolucao",
  checkAbs: (n: string) => n === "check abs",
  comBonus: (n: string) => n === "rv c/ bonus devolucao %" || n === "remuneracao com %",
  // Na de ajudante o título vem cortado: "bonus tempo de cas".
  tempoDeCasa: (n: string) => n.startsWith("bonus tempo de cas"),
  qtdRecarga: (n: string) => n === "qtd recarga",
  valorPorRecarga: (n: string) => n === "valor",
  recarga: (n: string) => n === "valor recarga",
  adicional: (n: string) => n === "adicional pendente",
} satisfies Record<string, Busca>;

function montarMemoriaBarreiras(detalhes: DetalheRV[], totalDaPlanilha: string | null): MemoriaRV | null {
  const achar = (busca: Busca) => detalhes.find((d) => busca(chave(d.rotulo)));
  const valorDe = (busca: Busca) => {
    const achado = achar(busca);
    return achado ? paraNumero(achado.valor) : null;
  };
  const centavos = (n: number) => Math.round(n * 100) / 100;

  const semPercentual = valorDe(BARREIRAS.semPercentual);
  if (semPercentual === null) return null;

  const caixas = valorDe(BARREIRAS.caixas);
  const devolucao = valorDe(BARREIRAS.devolucao) ?? 0;
  const comBonus = valorDe(BARREIRAS.comBonus);
  const tempoDeCasa = valorDe(BARREIRAS.tempoDeCasa) ?? 0;
  const qtdRecarga = valorDe(BARREIRAS.qtdRecarga);
  const valorPorRecarga = valorDe(BARREIRAS.valorPorRecarga);
  const recarga = valorDe(BARREIRAS.recarga) ?? 0;
  const adicional = valorDe(BARREIRAS.adicional) ?? 0;
  const checkAbs = achar(BARREIRAS.checkAbs)?.valor.trim() || null;
  const colunaPct = achar(BARREIRAS.percentualDevolucao);
  const pctDevolucao = colunaPct ? formatarCelula(colunaPct.rotulo, colunaPct.valor) : null;

  // O EFEITO DO ABS, lido da própria planilha (ver o comentário acima).
  // Sem a coluna "RV c/ bônus", não há o que ler: nada foi descontado.
  // Os valores ficam crus, com todas as casas da planilha: arredondar cada
  // degrau antes de somar deixava a soma 1 centavo longe do TOTAL (Adolfo,
  // 1.314,35 contra 1.314,36). O centavo só serve para dizer "é zero".
  const zeroSeQuase = (n: number) => (Math.abs(n) < 0.005 ? 0 : n);
  const acimaDaRemuneracao = comBonus === null ? devolucao : zeroSeQuase(comBonus - semPercentual);
  const premio = Math.min(devolucao, Math.max(0, acimaDaRemuneracao));
  const premioPerdido = centavos(devolucao - premio);
  const descontoAbs = Math.min(0, acimaDaRemuneracao);

  const passos: PassoRV[] = [];

  const taxa = caixas ? semPercentual / caixas : null;
  passos.push({
    rotulo: "Valor/Caixa",
    detalhe:
      taxa !== null
        ? `${formatarNumero(caixas!)} caixas × ${formatarMoeda(taxa)} por caixa`
        : "Valor pago pelas caixas entregues",
    valor: semPercentual,
  });

  if (recarga !== 0) {
    passos.push({
      rotulo: "+ Recarga",
      detalhe:
        qtdRecarga && valorPorRecarga
          ? `${formatarNumero(qtdRecarga)} recarga${qtdRecarga > 1 ? "s" : ""} × ${formatarMoeda(valorPorRecarga)}`
          : "Recargas do mês",
      valor: recarga,
    });
  }

  if (adicional !== 0) {
    passos.push({ rotulo: "+ Adicional pendente", detalhe: "Valor de mês anterior pago agora", valor: adicional });
  }

  // O ABS SEMPRE APARECE -- inclusive quando não tirou nada. É a pergunta
  // que o colaborador faz ("perdi por falta?"), e a resposta "não" também
  // é informação.
  const semAbs = descontoAbs === 0 && premioPerdido === 0;
  passos.push({
    rotulo: descontoAbs < 0 ? "− ABS" : "ABS",
    detalhe: semAbs
      ? "Sem desconto de absenteísmo neste mês"
      : `Absenteísmo no mês${checkAbs ? ` (Check ABS: ${checkAbs})` : ""}` +
        (descontoAbs < 0
          ? `: sai ${formatarNumero(Math.round((-descontoAbs / semPercentual) * 1000) / 10)}% do Valor/Caixa`
          : "") +
        (premioPerdido > 0 ? " e o prêmio da devolução não entra" : ""),
    valor: descontoAbs,
  });

  const produtividade = semPercentual + recarga + adicional + descontoAbs;
  const partes = ["Valor/Caixa", recarga !== 0 && "Recarga", adicional !== 0 && "Adicional"].filter(Boolean);
  passos.push({
    rotulo: "Produtividade",
    detalhe: partes.join(" + ") + (descontoAbs < 0 ? " − ABS" : ""),
    valor: produtividade,
    doContracheque: true,
  });

  passos.push({
    rotulo: "Prêmio",
    detalhe:
      premioPerdido > 0
        ? `Referente à devolução${pctDevolucao ? ` (${pctDevolucao} no mês)` : ""} — os ${formatarMoeda(premioPerdido)} não entraram por causa do ABS`
        : premio > 0
          ? `Referente à devolução${pctDevolucao ? ` — ${pctDevolucao} no mês` : ""}`
          : `Sem prêmio de devolução neste mês${pctDevolucao ? ` — ${pctDevolucao} de devolução` : ""}`,
    valor: premio,
    doContracheque: true,
  });

  passos.push({
    rotulo: "Tempo de casa",
    detalhe:
      (tempoDeCasa > 0
        ? "5% sobre o Valor/Caixa, a partir de 18 meses de empresa"
        : "5% sobre o Valor/Caixa — entra a partir de 18 meses de empresa") +
      ". No contracheque vem numa linha própria, separada da Produtividade e do Prêmio.",
    valor: tempoDeCasa,
    doContracheque: true,
  });

  // O TOTAL É O DA PLANILHA, e a escada tem de fechar com ele. Se não
  // fechar -- uma coluna renomeada, um número lido errado ("128.087" vira
  // 128 mil em paraNumero) --, a escada NÃO aparece: a tela volta ao total
  // da folha com as colunas cruas. Uma conta que não bate com o que a
  // pessoa recebe é pior do que conta nenhuma.
  const soma = produtividade + premio + tempoDeCasa;
  const daPlanilha = totalDaPlanilha ? paraNumero(totalDaPlanilha) : null;
  if (daPlanilha !== null && Math.abs(daPlanilha - soma) > 0.05) return null;
  const total = daPlanilha ?? soma;

  return {
    modelo: "barreiras",
    passos,
    total,
    nota: "Produtividade + Prêmio + Tempo de casa. São essas 3 linhas que aparecem no seu contracheque.",
  };
}
