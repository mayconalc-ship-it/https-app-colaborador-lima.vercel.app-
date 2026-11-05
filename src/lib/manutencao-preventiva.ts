/**
 * MANUTENÇÃO PREVENTIVA (05/11/2026).
 *
 * Substitui o Microsoft Forms que o time da manutenção preenchia toda
 * semana. O Forms registrava, mas não deixava acompanhar: nas 49
 * respostas exportadas havia 7 jeitos de escrever "em bom estado", um
 * "L3: 22" truncado (era 220) e 48 células com "ID" na pergunta de
 * litros. Série histórica é o ponto de uma preventiva -- ver a bateria
 * caindo ANTES de o gerador não pegar --, e texto livre não vira série.
 *
 * Por isso cada pergunta tem um TIPO. Esta é a regra pura (tipos,
 * validação, formatação); banco e tela ficam em
 * manutencao-preventiva-server e em app/manutencao-preventiva.
 *
 * O Gerador é o primeiro modelo; outros equipamentos entram como novos
 * modelos, sem mexer em tela.
 */

export const TIPOS_ITEM = ["sim_nao", "numero", "trifasico", "opcao", "nota", "texto"] as const;
export type TipoItem = (typeof TIPOS_ITEM)[number];

export function ehTipoItem(v: unknown): v is TipoItem {
  return typeof v === "string" && (TIPOS_ITEM as readonly string[]).includes(v);
}

/** As três fases da rede, na ordem em que aparecem no painel. */
export const FASES = ["L1", "L2", "L3"] as const;

export const NOTA_MIN = 1;
export const NOTA_MAX = 5;

export type ItemPreventiva = {
  id: string;
  ordem: number;
  pergunta: string;
  ajuda: string | null;
  tipo: TipoItem;
  opcoes: string[];
  unidade: string | null;
  casasDecimais: number;
  obrigatorio: boolean;
  dependeItemId: string | null;
  dependeValores: string[];
};

export type RespostaPreventiva = {
  itemId: string;
  valorBool: boolean | null;
  valorNumero: number | null;
  valorNumeros: number[] | null;
  valorTexto: string | null;
  observacao: string | null;
};

export type ModeloPreventiva = {
  id: string;
  nome: string;
  equipamento: string;
  emoji: string | null;
  periodicidadeDias: number;
};

/** O valor de uma resposta como texto, para comparar com dependeValores. */
export function chaveDaResposta(item: ItemPreventiva, r: RespostaPreventiva | undefined): string | null {
  if (!r) return null;
  if (item.tipo === "sim_nao") return r.valorBool === null ? null : String(r.valorBool);
  if (item.tipo === "opcao") return r.valorTexto;
  if (item.tipo === "numero" || item.tipo === "nota") return r.valorNumero === null ? null : String(r.valorNumero);
  return r.valorTexto;
}

/**
 * A pergunta condicional só aparece quando a resposta de que ela depende
 * está na lista. Sem isso, "Quantos litros?" ficava sempre na tela e
 * vinha preenchida com lixo em 48 de 49 vezes.
 */
export function itemVisivel(
  item: ItemPreventiva,
  itens: ItemPreventiva[],
  respostas: Map<string, RespostaPreventiva>,
): boolean {
  if (!item.dependeItemId || item.dependeValores.length === 0) return true;
  const pai = itens.find((i) => i.id === item.dependeItemId);
  if (!pai) return true;
  const chave = chaveDaResposta(pai, respostas.get(pai.id));
  return chave !== null && item.dependeValores.includes(chave);
}

/** Vírgula é como se digita aqui; o banco quer ponto. */
export function paraNumero(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatarNumero(n: number, casas: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Como a resposta aparece no histórico. */
export function textoDaResposta(item: ItemPreventiva, r: RespostaPreventiva | undefined): string {
  if (!r) return "—";
  switch (item.tipo) {
    case "sim_nao":
      return r.valorBool === null ? "—" : r.valorBool ? "Sim" : "Não";
    case "numero":
      return r.valorNumero === null
        ? "—"
        : `${formatarNumero(r.valorNumero, item.casasDecimais)}${item.unidade ? ` ${item.unidade}` : ""}`;
    case "nota":
      return r.valorNumero === null ? "—" : `${r.valorNumero} de ${NOTA_MAX}`;
    case "trifasico":
      if (!r.valorNumeros || r.valorNumeros.length !== 3) return "—";
      return FASES.map((f, i) => `${f}: ${formatarNumero(r.valorNumeros![i], item.casasDecimais)}`).join("  ");
    default:
      return r.valorTexto ?? "—";
  }
}

/**
 * Valida UMA resposta. Roda na tela e de novo na ação do servidor --
 * esconder o campo nunca foi validação.
 * Devolve null quando está tudo certo.
 */
export function erroDaResposta(item: ItemPreventiva, r: RespostaPreventiva | undefined): string | null {
  const vazio = (() => {
    if (!r) return true;
    switch (item.tipo) {
      case "sim_nao":
        return r.valorBool === null;
      case "numero":
      case "nota":
        return r.valorNumero === null;
      case "trifasico":
        return !r.valorNumeros || r.valorNumeros.length !== 3 || r.valorNumeros.some((n) => !Number.isFinite(n));
      default:
        return !r.valorTexto;
    }
  })();

  if (vazio) return item.obrigatorio ? "Responda esta pergunta." : null;

  if (item.tipo === "opcao" && !item.opcoes.includes(r!.valorTexto!)) {
    return "Escolha uma das opções da lista.";
  }
  if (item.tipo === "nota") {
    const n = r!.valorNumero!;
    if (!Number.isInteger(n) || n < NOTA_MIN || n > NOTA_MAX) return `Dê uma nota de ${NOTA_MIN} a ${NOTA_MAX}.`;
  }
  if ((item.tipo === "numero" || item.tipo === "trifasico")) {
    const nums = item.tipo === "numero" ? [r!.valorNumero!] : r!.valorNumeros!;
    if (nums.some((n) => n < 0)) return "O valor não pode ser negativo.";
    // % é o único com teto óbvio; o resto depende do equipamento e fica
    // por conta de quem lê o painel.
    if (item.unidade === "%" && nums.some((n) => n > 100)) return "A porcentagem vai até 100.";
  }
  return null;
}

/** Dias desde a última preventiva finalizada. null = nunca foi feita. */
export function diasDesde(ultimaISO: string | null, hoje = new Date()): number | null {
  if (!ultimaISO) return null;
  return Math.floor((hoje.getTime() - new Date(ultimaISO).getTime()) / 86_400_000);
}

export type SituacaoPreventiva = {
  estado: "em_dia" | "vence_hoje" | "atrasada" | "nunca";
  dias: number | null;
  texto: string;
};

/** A régua da cobrança: compara os dias desde a última com a periodicidade. */
export function situacao(modelo: ModeloPreventiva, ultimaISO: string | null, hoje = new Date()): SituacaoPreventiva {
  const dias = diasDesde(ultimaISO, hoje);
  if (dias === null) {
    return { estado: "nunca", dias: null, texto: "Nunca foi feita" };
  }
  const restam = modelo.periodicidadeDias - dias;
  if (restam > 0) {
    return { estado: "em_dia", dias, texto: `Feita há ${dias} dia${dias === 1 ? "" : "s"}` };
  }
  if (restam === 0) {
    return { estado: "vence_hoje", dias, texto: "Vence hoje" };
  }
  const atraso = -restam;
  return {
    estado: "atrasada",
    dias,
    texto: `Atrasada há ${atraso} dia${atraso === 1 ? "" : "s"}`,
  };
}
