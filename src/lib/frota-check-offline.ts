/**
 * O CHECK DA FROTA GUARDADO NO CELULAR (25/11/2026, pedido do dono:
 * "conforme for realizando ele vai salvando e caso tenha queda de internet
 * ou receba uma ligação, não perca o que já foi feito").
 *
 * Cada toque vai PRIMEIRO para o localStorage do celular -- gravação
 * síncrona, que termina antes de qualquer coisa poder matar a página
 * (ligação, Android fechando o navegador, bateria). Depois uma fila manda
 * para o servidor; o item só sai da fila quando o servidor confirma.
 *
 * A fila guarda só a ÚLTIMA versão de cada item (tocar OK, NOK e OK de novo
 * manda um envio só). Ao reabrir, o que está na fila vale mais do que o
 * servidor (é mais novo) e é reenviado.
 *
 * As fotos não cabem aqui (localStorage é texto e pequeno): vão para o
 * IndexedDB, em manutencao-fotos-offline.
 *
 * Tudo em try/catch: aba anônima ou armazenamento cheio não derrubam a
 * tela -- no pior caso volta a ser só memória, como antes.
 */

import type { Gravidade } from "@/lib/frota-check";

export type RespostaLocal = {
  ok: boolean;
  defeitoId: string | null;
  gravidade: Gravidade | null;
  observacao: string;
};

type Guardado = {
  /** As respostas que o celular conhece (todas, enviadas ou não). */
  resp: Record<string, RespostaLocal>;
  /** Itens ainda não confirmados pelo servidor -> versão local. */
  fila: Record<string, number>;
  em: number;
};

const PREFIXO = "frota-check:";
/** Check aberto há mais de 30 dias no celular: some sozinho. */
const VALIDADE = 30 * 86_400_000;

const chave = (checkId: string) => `${PREFIXO}${checkId}`;

export function lerGuardado(checkId: string): Guardado {
  try {
    const bruto = localStorage.getItem(chave(checkId));
    if (bruto) {
      const g = JSON.parse(bruto) as Guardado;
      if (Date.now() - (g.em ?? 0) < VALIDADE) return { resp: g.resp ?? {}, fila: g.fila ?? {}, em: g.em };
    }
  } catch {
    // sem armazenamento: começa vazio
  }
  return { resp: {}, fila: {}, em: Date.now() };
}

export function gravarGuardado(checkId: string, g: Guardado): boolean {
  try {
    localStorage.setItem(chave(checkId), JSON.stringify({ ...g, em: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

/** Depois de assinado (ou cancelado), o celular não precisa mais guardar. */
export function apagarGuardado(checkId: string) {
  try {
    localStorage.removeItem(chave(checkId));
  } catch {
    // tanto faz
  }
}

/** Limpa checks esquecidos no celular (abertos há mais de 30 dias). */
export function limparVelhos() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIXO)) continue;
      const em = (JSON.parse(localStorage.getItem(k) ?? "{}") as { em?: number }).em ?? 0;
      if (Date.now() - em > VALIDADE) localStorage.removeItem(k);
    }
  } catch {
    // tanto faz
  }
}

// ---------------------------------------------------------------------
// ASSINATURA SEM INTERNET (26/11/2026): quem termina o check no pátio sem
// sinal assina do mesmo jeito. A assinatura (PNG), o km, a observação e a
// hora ficam aqui e sobem sozinhos -- depois da fila das respostas e das
// fotos, porque o servidor só aceita a assinatura com tudo lá.
// ---------------------------------------------------------------------

export type AssinaturaGuardada = { png: string; km: string; observacao: string; em: string };

const PREFIXO_ASS = "frota-check-assinatura:";

export function lerAssinaturaGuardada(checkId: string): AssinaturaGuardada | null {
  try {
    const bruto = localStorage.getItem(`${PREFIXO_ASS}${checkId}`);
    return bruto ? (JSON.parse(bruto) as AssinaturaGuardada) : null;
  } catch {
    return null;
  }
}

export function guardarAssinatura(checkId: string, a: AssinaturaGuardada): boolean {
  try {
    localStorage.setItem(`${PREFIXO_ASS}${checkId}`, JSON.stringify(a));
    return true;
  } catch {
    return false;
  }
}

export function apagarAssinaturaGuardada(checkId: string) {
  try {
    localStorage.removeItem(`${PREFIXO_ASS}${checkId}`);
  } catch {
    // tanto faz
  }
}
