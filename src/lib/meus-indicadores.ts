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
  { chave: "qt_entrega", rotulos: ["qt entrega", "qtd entrega", "quantidade entrega"], titulo: "Entregas", emoji: "📦", formato: "inteiro" },
  { chave: "qt_mapa", rotulos: ["qt mapa", "qtd mapa", "quantidade mapa"], titulo: "Mapas", emoji: "🗺️", formato: "inteiro" },
  { chave: "qt_caixas", rotulos: ["qt caixas", "qtd caixas", "quantidade caixas"], titulo: "Caixas", emoji: "🧃", formato: "decimal" },
  { chave: "qt_devolucao", rotulos: ["qt devolucao", "qtd devolucao", "quantidade devolucao"], titulo: "Devoluções", emoji: "↩️", formato: "inteiro" },
  { chave: "pct_devolucao", rotulos: ["% devolucao", "pct devolucao", "percentual devolucao"], titulo: "% Devolução", emoji: "📉", formato: "percentual" },
  { chave: "qt_rec", rotulos: ["qt. rec.", "qt rec", "qtd rec", "recarga", "recargas"], titulo: "Recargas", emoji: "🔁", formato: "inteiro" },
] as const;

export type FormatoDoCampo = (typeof CAMPOS_DO_RESUMO)[number]["formato"];

/**
 * Interpreta um número escrito em português ("3.087,06") ou em inglês
 * ("3087.06"). `null` quando não é número.
 *
 * A ambiguidade real é o ponto: em "3.087" ele é separador de milhar, em
 * "3.087" vindo de um sistema em inglês seria decimal. Decide pela
 * VÍRGULA: se ela existe, ela é o decimal e o ponto é milhar. Sem
 * vírgula, um ponto seguido de exatamente 3 dígitos é milhar ("3.087"),
 * qualquer outra coisa é decimal ("3.5").
 */
export function paraNumero(bruto: string | null): number | null {
  if (bruto === null) return null;
  const limpo = String(bruto).replace(/%/g, "").replace(/\s/g, "").trim();
  if (!limpo) return null;

  let normalizado: string;
  if (limpo.includes(",")) {
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpo)) {
    normalizado = limpo.replace(/\./g, "");
  } else {
    normalizado = limpo;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/**
 * Formata para a tela, sem depender de como a célula da planilha estava
 * formatada -- hoje ela vem certa, mas basta alguém mexer no formato da
 * coluna no Sheets para o app passar a mostrar "3087.06".
 *
 * No percentual: quando o texto TEM "%", o número já é percentual
 * ("1,23%" = 1,23%). Quando NÃO tem e o valor é no máximo 1, é fração e
 * vira porcentagem ("0,0123" = 1,23%) -- é o caso do decimal. Acima de 1
 * sem "%" já se assume percentual, porque 2 querendo dizer 200% de
 * devolução não existe na prática.
 */
export function formatarCampo(bruto: string | null, formato: FormatoDoCampo): string | null {
  const n = paraNumero(bruto);
  if (n === null) return bruto?.trim() || null;

  if (formato === "percentual") {
    const temSinal = String(bruto).includes("%");
    const pct = !temSinal && Math.abs(n) <= 1 ? n * 100 : n;
    return `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  if (formato === "decimal") {
    return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Inteiro, mas com separador: 1.204 entregas se lê melhor que 1204.
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

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
    return {
      chave: campo.chave,
      titulo: campo.titulo,
      emoji: campo.emoji,
      valor: formatarCampo(valor, campo.formato),
    };
  });
}

/** Um número da planilha veio zerado ou vazio? Serve para a tela decidir
 *  entre mostrar o valor e mostrar o traço. */
export function vazio(valor: string | null): boolean {
  if (valor === null) return true;
  const t = valor.trim();
  return t === "" || t === "-" || t === "R$ -";
}
