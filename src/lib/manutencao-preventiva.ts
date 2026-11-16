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
  /** Título do grupo de perguntas (Limpeza, Funcionamento...). */
  bloco: string | null;
  aceitaFoto: boolean;
  /** Respostas que são problema: 'false' no sim/não, o texto da opção. */
  alertaValores: string[];
  /** Faixa aceitável do número; fora dela, alerta. */
  minimo: number | null;
  maximo: number | null;
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
  usaEquipamentos: boolean;
  descricao: string | null;
};

/** Um aparelho cadastrado na Liderança (cada ar-condicionado, cada câmara). */
export type EquipamentoPreventiva = {
  id: string;
  modeloId: string;
  codigo: string;
  local: string;
  marca: string | null;
  capacidade: string | null;
  observacao: string | null;
  /** Nula = segue a frequência do modelo. */
  periodicidadeDias: number | null;
  ativo: boolean;
  criadoEm: string;
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


// ---------------------------------------------------------------------
// ALERTA: a resposta que é problema
// ---------------------------------------------------------------------

/**
 * A resposta é problema? (16/11/2026)
 *
 * Quem decide é o ITEM, não a tela: `alertaValores` lista as respostas
 * ruins ('false' no sim/não, o texto da opção) e `minimo`/`maximo` a
 * faixa do número. Assim "Sim" pode ser bom numa pergunta e ruim em
 * outra sem a tela saber nada disso -- e o painel conta alerta pela
 * mesma regra que pinta o cartão de vermelho.
 */
export function emAlerta(item: ItemPreventiva, r: RespostaPreventiva | undefined): boolean {
  if (!r) return false;
  if (item.tipo === "numero" || item.tipo === "nota") {
    const n = r.valorNumero;
    if (n === null) return false;
    if (item.minimo !== null && n < item.minimo) return true;
    if (item.maximo !== null && n > item.maximo) return true;
  }
  if (item.tipo === "trifasico" && r.valorNumeros) {
    if (item.minimo !== null && r.valorNumeros.some((n) => n < item.minimo!)) return true;
    if (item.maximo !== null && r.valorNumeros.some((n) => n > item.maximo!)) return true;
  }
  if (item.alertaValores.length === 0) return false;
  const chave = chaveDaResposta(item, r);
  return chave !== null && item.alertaValores.includes(chave);
}

/** "de 6 a 16 °C", "até 5 °C" -- a faixa escrita para quem preenche. */
export function textoDaFaixa(item: Pick<ItemPreventiva, "minimo" | "maximo" | "unidade" | "casasDecimais">): string | null {
  const u = item.unidade ? ` ${item.unidade}` : "";
  const f = (n: number) => formatarNumero(n, Math.min(item.casasDecimais, 1));
  if (item.minimo !== null && item.maximo !== null) return `de ${f(item.minimo)} a ${f(item.maximo)}${u}`;
  if (item.minimo !== null) return `a partir de ${f(item.minimo)}${u}`;
  if (item.maximo !== null) return `até ${f(item.maximo)}${u}`;
  return null;
}

// ---------------------------------------------------------------------
// PRAZO: quando vence a próxima
// ---------------------------------------------------------------------

const DIA = 86_400_000;

export type EstadoDoPrazo = "atrasada" | "vence_hoje" | "proxima" | "em_dia";

export type Prazo = {
  estado: EstadoDoPrazo;
  /** Dias até vencer: negativo = atrasada há N dias. */
  diasParaVencer: number;
  /** Quanto do ciclo já passou, 0 a 1 (passa de 1 quando atrasa). */
  progresso: number;
  /** Data (ISO) em que vence a próxima. */
  venceEm: string;
  texto: string;
};

/**
 * A janela do "vence logo": um quarto do ciclo, entre 1 e 7 dias. No
 * gerador semanal são 2 dias; no ar mensal, 7. Com um número fixo de 7
 * dias o gerador viveria amarelo.
 */
export function janelaDeAviso(periodicidadeDias: number) {
  return Math.max(1, Math.min(7, Math.ceil(periodicidadeDias * 0.25)));
}

/** Dia do calendário em São Paulo, para "hoje" não virar às 21 h. */
function diaLocal(d: Date) {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  return Date.parse(`${s}T00:00:00Z`);
}

/**
 * O prazo de UM alvo (um modelo, ou um aparelho dele).
 *
 * Nunca feita conta a partir do cadastro: o aparelho cadastrado hoje
 * não nasce atrasado, e o esquecido ganha atraso de verdade.
 */
export function prazoDa(
  periodicidadeDias: number,
  ultimaISO: string | null,
  cadastroISO: string,
  hoje = new Date(),
): Prazo {
  const base = diaLocal(new Date(ultimaISO ?? cadastroISO));
  const vence = base + periodicidadeDias * DIA;
  const diasParaVencer = Math.round((vence - diaLocal(hoje)) / DIA);
  const passados = periodicidadeDias - diasParaVencer;
  const progresso = Math.max(0, passados / periodicidadeDias);
  const venceEm = new Date(vence + 12 * 3_600_000).toISOString();

  const plural = (n: number) => `${n} dia${n === 1 ? "" : "s"}`;
  if (diasParaVencer < 0) {
    return { estado: "atrasada", diasParaVencer, progresso, venceEm, texto: `Atrasada ${plural(-diasParaVencer)}` };
  }
  if (diasParaVencer === 0) return { estado: "vence_hoje", diasParaVencer, progresso, venceEm, texto: "Vence hoje" };
  if (diasParaVencer <= janelaDeAviso(periodicidadeDias)) {
    return { estado: "proxima", diasParaVencer, progresso, venceEm, texto: `Vence em ${plural(diasParaVencer)}` };
  }
  return { estado: "em_dia", diasParaVencer, progresso, venceEm, texto: `Em dia · vence em ${plural(diasParaVencer)}` };
}

/** Para ordenar: o mais urgente primeiro. */
export function ordemDeUrgencia(a: Prazo, b: Prazo) {
  return a.diasParaVencer - b.diasParaVencer;
}

/** Atrasada ou vencendo hoje: é o que o lembrete cobra. */
export function cobrar(p: Prazo) {
  return p.estado === "atrasada" || p.estado === "vence_hoje";
}

/** "AC-02 · Sala ADM" -- o aparelho como o técnico o reconhece. */
export function nomeDoEquipamento(e: Pick<EquipamentoPreventiva, "codigo" | "local">) {
  return e.local ? `${e.codigo} · ${e.local}` : e.codigo;
}
