/**
 * Vocabulário e regras do Programa 5S.
 *
 * Fica sem "server-only" de propósito: a tela do auditor, que roda no
 * navegador, precisa dos rótulos e do cálculo de progresso. Nada aqui
 * toca no banco nem importa a chave de administrador.
 *
 * A regra de conformidade aparece duas vezes no sistema -- aqui e em
 * `cinco_s_taxa`, no banco (migração 035). Não é duplicação por
 * descuido: a do banco é a que VALE, é ela que grava o consolidado que
 * o BI lê. A daqui existe só para a tela do auditor mostrar o parcial
 * enquanto ele responde, antes de finalizar. As duas usam a mesma
 * fórmula, e o comentário nos dois lugares aponta para o outro.
 */

export type Senso =
  | "utilizacao"
  | "organizacao"
  | "limpeza"
  | "conservacao"
  | "disciplina";

/** A ordem do checklist e a ordem do radar. É a mesma da planilha. */
export const SENSOS: Senso[] = [
  "utilizacao",
  "organizacao",
  "limpeza",
  "conservacao",
  "disciplina",
];

/**
 * O nome japonês vem junto porque é assim que o programa é ensinado --
 * o quadro na parede da área diz "Seiri", e a tela precisa falar a
 * mesma língua do quadro.
 */
export const ROTULO_SENSO: Record<Senso, string> = {
  utilizacao: "Utilização",
  organizacao: "Organização",
  limpeza: "Limpeza",
  conservacao: "Conservação",
  disciplina: "Disciplina",
};

export const JAPONES_SENSO: Record<Senso, string> = {
  utilizacao: "Seiri",
  organizacao: "Seiton",
  limpeza: "Seiso",
  conservacao: "Seiketsu",
  disciplina: "Shitsuke",
};

export const EMOJI_SENSO: Record<Senso, string> = {
  utilizacao: "🧺",
  organizacao: "📐",
  limpeza: "🧹",
  conservacao: "🔧",
  disciplina: "🎯",
};

export function ehSenso(v: unknown): v is Senso {
  return typeof v === "string" && (SENSOS as string[]).includes(v);
}

/* ------------------------------------------------------------------ */
/* Respostas                                                           */
/* ------------------------------------------------------------------ */

export type Resposta = "sim" | "nao" | "na";

export const ROTULO_RESPOSTA: Record<Resposta, string> = {
  sim: "Conforme",
  nao: "Não conforme",
  na: "Não se aplica",
};

/** O que o auditor lê no botão. Curto porque é botão de celular. */
export const BOTAO_RESPOSTA: Record<Resposta, string> = {
  sim: "OK",
  nao: "NOK",
  na: "N/A",
};

export function ehResposta(v: unknown): v is Resposta {
  return v === "sim" || v === "nao" || v === "na";
}

/* ------------------------------------------------------------------ */
/* Auditoria                                                           */
/* ------------------------------------------------------------------ */

export type StatusAuditoria =
  | "planejada"
  | "em_andamento"
  | "finalizada"
  | "cancelada";

export const ROTULO_STATUS_AUDITORIA: Record<StatusAuditoria, string> = {
  planejada: "Planejada",
  em_andamento: "Em andamento",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export function ehStatusAuditoria(v: unknown): v is StatusAuditoria {
  return (
    v === "planejada" ||
    v === "em_andamento" ||
    v === "finalizada" ||
    v === "cancelada"
  );
}

/* ------------------------------------------------------------------ */
/* Não conformidade / plano de ação                                    */
/* ------------------------------------------------------------------ */

export type StatusNC = "aberta" | "em_andamento" | "concluida" | "validada";

export const STATUS_NC: StatusNC[] = [
  "aberta",
  "em_andamento",
  "concluida",
  "validada",
];

export const ROTULO_STATUS_NC: Record<StatusNC, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  validada: "Validada",
};

/** Cores no vocabulário do app (ver Toast e os badges das outras telas). */
export const COR_STATUS_NC: Record<StatusNC, string> = {
  aberta: "bg-red-50 text-red-700 ring-red-200",
  em_andamento: "bg-amber-50 text-amber-800 ring-amber-200",
  concluida: "bg-sky-50 text-sky-700 ring-sky-200",
  validada: "bg-green-50 text-green-700 ring-green-200",
};

export function ehStatusNC(v: unknown): v is StatusNC {
  return (
    v === "aberta" ||
    v === "em_andamento" ||
    v === "concluida" ||
    v === "validada"
  );
}

export type Prioridade = "baixa" | "media" | "alta";

export const PRIORIDADES: Prioridade[] = ["alta", "media", "baixa"];

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const COR_PRIORIDADE: Record<Prioridade, string> = {
  alta: "bg-red-50 text-red-700 ring-red-200",
  media: "bg-amber-50 text-amber-800 ring-amber-200",
  baixa: "bg-slate-50 text-slate-600 ring-slate-200",
};

export function ehPrioridade(v: unknown): v is Prioridade {
  return v === "baixa" || v === "media" || v === "alta";
}

/* ------------------------------------------------------------------ */
/* A regra de cálculo                                                  */
/* ------------------------------------------------------------------ */

/**
 * conformidade = Sim / (Sim + Não), em porcentagem. O "N/A" fica FORA
 * do denominador.
 *
 * Espelha `cinco_s_taxa` no banco (035). Contar N/A como acerto
 * premiaria quem marcou "não se aplica" em tudo; contar como erro
 * puniria o armazém por não ter ramal de telefone.
 *
 * Devolve null quando não houve o que avaliar -- "não mediu" e "mediu e
 * deu zero" são coisas diferentes, e um zero falso derrubaria a média
 * da área no gráfico.
 */
export function taxaConformidade(ok: number, nok: number): number | null {
  const avaliados = ok + nok;
  if (avaliados === 0) return null;
  return Math.round((ok * 10000) / avaliados) / 100;
}

/** "82,2%" / "—". Um lugar só, para o número não aparecer de dois jeitos. */
export function formatarTaxa(taxa: number | null | undefined): string {
  if (taxa === null || taxa === undefined) return "—";
  return `${taxa.toFixed(1).replace(".", ",")}%`;
}

/**
 * A faixa em que o resultado cai. Os cortes vêm do que a operação já
 * pratica: a base histórica gira em 82%, então 90 é meta boa e abaixo
 * de 70 é problema que precisa de plano de ação, não de acompanhamento.
 */
export type Faixa = "boa" | "atencao" | "critica" | "vazia";

export function faixaDaTaxa(taxa: number | null | undefined): Faixa {
  if (taxa === null || taxa === undefined) return "vazia";
  if (taxa >= 90) return "boa";
  if (taxa >= 70) return "atencao";
  return "critica";
}

export const COR_FAIXA: Record<Faixa, string> = {
  boa: "bg-green-500",
  atencao: "bg-amber-500",
  critica: "bg-red-500",
  vazia: "bg-slate-200",
};

export const COR_TEXTO_FAIXA: Record<Faixa, string> = {
  boa: "text-green-700",
  atencao: "text-amber-700",
  critica: "text-red-700",
  vazia: "text-slate-400",
};

/* ------------------------------------------------------------------ */
/* Datas e competência                                                 */
/* ------------------------------------------------------------------ */

/** "2026-08" -> "Agosto de 2026". */
export function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  const data = new Date(Number(ano), Number(mes) - 1, 1);
  const texto = data.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** O mês corrente como "2026-08". Base do filtro padrão do BI. */
export function competenciaAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-08" -> "2026-08-01", que é o que a função SQL espera. */
export function competenciaParaData(competencia: string): string {
  return `${competencia}-01`;
}

export function ehCompetencia(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/**
 * Dias até o prazo. Negativo = atrasado.
 *
 * Compara só a parte da data: um prazo "hoje" não pode virar atraso às
 * 00h01 porque o horário do servidor está à frente.
 */
export function diasAteOPrazo(prazo: string | null): number | null {
  if (!prazo) return null;
  const [ano, mes, dia] = prazo.split("-").map(Number);
  const alvo = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

export function estaAtrasada(
  prazo: string | null,
  status: StatusNC,
): boolean {
  if (status === "concluida" || status === "validada") return false;
  const dias = diasAteOPrazo(prazo);
  return dias !== null && dias < 0;
}

/* ------------------------------------------------------------------ */
/* Tipos que atravessam servidor e tela                                */
/* ------------------------------------------------------------------ */

export type Pergunta = {
  id: string;
  senso: Senso;
  codigo: string;
  texto: string;
  ordem: number;
};

export type RespostaSalva = {
  pergunta_id: string;
  valor: Resposta;
  observacao: string | null;
  foto_url: string | null;
};

/** O que o BI devolve. Espelha o jsonb de `cinco_s_dashboard`. */
export type Dashboard = {
  cartoes: {
    conformidade: number | null;
    areas_auditadas: number;
    realizadas: number;
    planejadas: number;
    pendentes: number;
    atrasadas: number;
    itens_ok: number;
    itens_nok: number;
    itens_na: number;
    nc_abertas: number;
    nc_total: number;
    nc_concluidas: number;
    nc_validadas: number;
    acoes_atrasadas: number;
    pct_acoes_concluidas: number | null;
  };
  por_area: {
    area_id: string;
    area: string;
    conformidade: number | null;
    auditorias: number;
    nok: number;
    itens: number;
    nc_abertas: number;
  }[];
  por_senso: {
    senso: Senso;
    conformidade: number | null;
    ok: number;
    nok: number;
    na: number;
  }[];
  evolucao: {
    competencia: string;
    conformidade: number | null;
    auditorias: number;
    nok: number;
  }[];
  por_auditor: {
    auditor_id: string;
    nome: string;
    planejadas: number;
    realizadas: number;
    pendentes: number;
    areas: number;
    conformidade: number | null;
    nc: number;
  }[];
  perguntas: {
    pergunta_id: string;
    codigo: string;
    senso: Senso;
    texto: string;
    nok: number;
    ok: number;
    na: number;
    taxa_nok: number | null;
  }[];
  abertas: {
    id: string;
    area: string;
    area_id: string;
    auditor: string;
    auditor_id: string;
    planejada_para: string;
    status: StatusAuditoria;
    atrasada: boolean;
  }[];
};

/**
 * O texto que resume a auditoria em uma frase, para o aviso e para o
 * cabeçalho do resultado. Sai daqui para não ser escrito de três jeitos
 * diferentes em três telas.
 */
export function resumoAuditoria(a: {
  total_ok: number;
  total_nok: number;
  conformidade: number | null;
}): string {
  const avaliados = a.total_ok + a.total_nok;
  if (avaliados === 0) return "Nenhum item avaliado";
  return `${formatarTaxa(a.conformidade)} de conformidade · ${a.total_nok} item${
    a.total_nok === 1 ? "" : "s"
  } não conforme${a.total_nok === 1 ? "" : "s"} em ${avaliados}`;
}
