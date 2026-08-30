/**
 * MEUS INDICADORES
 *
 * O resumo do mês que o motorista/ajudante vê, tirado da MESMA planilha
 * que calcula a RV. É de propósito: recalcular por fora daria um número
 * parecido mas não igual, e aí o app e o contracheque discordariam --
 * que é o pior lugar para o app perder credibilidade.
 *
 * Aqui só a extração e a formatação; a leitura da planilha já existe em
 * lib/rv-server.ts e é reaproveitada inteira.
 */

import type { DetalheRV } from "@/lib/rv";

/**
 * Os campos operacionais do resumo. As colunas em REAIS da planilha
 * (RV s/ %, Valor devolução, Total R$...) ficam de fora de propósito:
 * quem tem acesso à remuneração vê tudo na tela da RV, e quem não tem
 * não deve ver aqui por um caminho lateral.
 */
export const CAMPOS_DO_RESUMO = [
  { chave: "qt_entrega", rotulos: ["qt entrega", "qtd entrega", "quantidade entrega"], titulo: "Entregas", emoji: "📦" },
  { chave: "qt_mapa", rotulos: ["qt mapa", "qtd mapa", "quantidade mapa"], titulo: "Mapas", emoji: "🗺️" },
  { chave: "qt_caixas", rotulos: ["qt caixas", "qtd caixas", "quantidade caixas"], titulo: "Caixas", emoji: "🧃" },
  { chave: "qt_devolucao", rotulos: ["qt devolucao", "qtd devolucao", "quantidade devolucao"], titulo: "Devoluções", emoji: "↩️" },
  { chave: "pct_devolucao", rotulos: ["% devolucao", "pct devolucao", "percentual devolucao"], titulo: "% Devolução", emoji: "📉" },
  { chave: "qt_rec", rotulos: ["qt. rec.", "qt rec", "qtd rec", "recarga", "recargas"], titulo: "Recargas", emoji: "🔁" },
] as const;

export type ChaveDoResumo = (typeof CAMPOS_DO_RESUMO)[number]["chave"];

export type CampoDoResumo = {
  chave: ChaveDoResumo;
  titulo: string;
  emoji: string;
  /** `null` quando a planilha não trouxe a coluna -- a tela mostra "—"
   *  em vez de inventar zero, que passaria por resultado ruim. */
  valor: string | null;
};

function limpar(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Acha o valor de um campo entre os detalhes da linha da RV.
 *
 * Compara por rótulo normalizado porque o cabeçalho da planilha é
 * digitado à mão e varia: "Qt. Rec." tem ponto, "Qt Devolução" tem
 * espaço sobrando, e um dia alguém escreve "Qtd".
 */
export function montarResumo(detalhes: DetalheRV[]): CampoDoResumo[] {
  const porRotulo = new Map(detalhes.map((d) => [limpar(d.rotulo), d.valor]));

  return CAMPOS_DO_RESUMO.map((campo) => {
    let valor: string | null = null;
    for (const r of campo.rotulos) {
      const achado = porRotulo.get(limpar(r));
      if (achado !== undefined && String(achado).trim()) {
        valor = String(achado).trim();
        break;
      }
    }
    // Última tentativa: rótulo que COMEÇA com o alvo, para pegar
    // variações que o mapa exato não cobriu.
    if (valor === null) {
      for (const [rotulo, v] of porRotulo) {
        if (campo.rotulos.some((r) => rotulo.startsWith(limpar(r))) && String(v).trim()) {
          valor = String(v).trim();
          break;
        }
      }
    }
    return { chave: campo.chave, titulo: campo.titulo, emoji: campo.emoji, valor };
  });
}

/** Um número da planilha veio zerado ou vazio? Serve para a tela decidir
 *  entre mostrar o valor e mostrar o traço. */
export function vazio(valor: string | null): boolean {
  if (valor === null) return true;
  const t = valor.trim();
  return t === "" || t === "-" || t === "R$ -";
}
