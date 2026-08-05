import {
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

const COLUNAS = {
  caixas: (n: string) => n === "qt caixas",
  semAbs: (n: string) => n.startsWith("rv s/") || n.startsWith("rv sem"),
  comAbs: (n: string) => n.startsWith("rv c/") || n.startsWith("rv com"),
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
export function ehColunaDoContracheque(rotulo: string) {
  const n = chave(rotulo);
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
  /** Produtividade e Premio: as duas linhas que aparecem no contracheque. */
  doContracheque?: boolean;
};

export type MemoriaRV = {
  passos: PassoRV[];
  produtividade: number;
  premio: number;
  total: number;
};

export function montarMemoriaRV(detalhes: DetalheRV[]): MemoriaRV | null {
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

  return { passos, produtividade, premio, total: produtividade + premio };
}
