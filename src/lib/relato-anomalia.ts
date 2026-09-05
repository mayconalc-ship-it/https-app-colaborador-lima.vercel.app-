/**
 * O RELATO DE ANOMALIA -- o formulário do PDF, virado em dado.
 *
 * Copiado do "Relato de Anomalia - PDV 2994" que o dono anexou em
 * 05/09/2026, campo a campo e na mesma ordem. Não é liberdade criativa:
 * é um documento de gestão da rotina que o auditor conhece de cor, e um
 * campo faltando ou renomeado tira dele a cara de RA.
 *
 * A ORDEM DAS SEÇÕES É O MÉTODO, e por isso ela é dado aqui e não
 * decoração da tela: sintoma → participantes → 5 porquês → padronização
 * → plano de ação → assinatura. Cada uma só faz sentido depois da
 * anterior, e é essa sequência que o auditor percorre.
 *
 * Só a estrutura e as regras aqui -- sem banco e sem tela.
 */

/** Sim/Não, como no papel. Nulo = ainda não respondido, que é diferente
 *  de "Não" -- um RA com tudo "Não" por omissão mente para quem lê. */
export type SimNao = "sim" | "nao";

/**
 * A CLASSIFICAÇÃO DO SINTOMA.
 *
 * "Repetitiva" e "Única" são as duas caixas do cabeçalho do papel, e no
 * exemplo vieram Não/Sim -- excludentes. Aqui viram UMA escolha, porque
 * marcar as duas (ou nenhuma) é o tipo de estado que o papel permite e
 * ninguém consegue interpretar depois.
 */
export const NATUREZAS = ["unica", "repetitiva"] as const;
export type NaturezaAnomalia = (typeof NATUREZAS)[number];

export const ROTULO_NATUREZA: Record<NaturezaAnomalia, { titulo: string; ajuda: string }> = {
  unica: {
    titulo: "Única",
    ajuda: "Primeira vez que acontece, ou sem histórico parecido.",
  },
  repetitiva: {
    titulo: "Repetitiva",
    ajuda: "Já aconteceu antes. Muda o peso da causa raiz: repetir é sinal de que a ação anterior não pegou.",
  },
};

/**
 * AS OITO PERGUNTAS DA PADRONIZAÇÃO, na ordem do papel.
 *
 * É a parte do RA que o auditor lê primeiro, porque ela responde a
 * pergunta dele: o desvio aconteceu por falta de padrão, por padrão
 * errado, ou por padrão não cumprido? Sem estas respostas, o 5 porquês
 * vira opinião.
 */
export const PERGUNTAS_PADRONIZACAO = [
  { id: "disponivel", texto: "Padrão disponível?" },
  { id: "tarefa_critica", texto: "O padrão é de Tarefa Crítica?" },
  { id: "aplicavel", texto: "O padrão é aplicável?" },
  { id: "precisa_revisao", texto: "O padrão necessita de revisão?" },
  { id: "sendo_cumprido", texto: "Padrão está sendo cumprido?" },
  { id: "precisa_treino", texto: "Precisa-se de treino no padrão?" },
  { id: "causa_conhecida", texto: "Causa da anomalia é conhecida?" },
  { id: "cronica", texto: "A anomalia é crônica?" },
] as const;

export type PerguntaPadronizacaoId = (typeof PERGUNTAS_PADRONIZACAO)[number]["id"];
export type Padronizacao = Partial<Record<PerguntaPadronizacaoId, SimNao>>;

/**
 * OS TÓPICOS DO PLANO DE AÇÃO, como no papel.
 *
 * A distinção entre "corretiva" e "causa raiz" é o que separa apagar o
 * incêndio de impedir o próximo -- e é exatamente o que o auditor
 * procura. Um plano só com ações corretivas é um plano que garante a
 * repetição.
 */
export const TOPICOS_ACAO = ["imediata", "corretiva", "causa_raiz"] as const;
export type TopicoAcao = (typeof TOPICOS_ACAO)[number];

export const ROTULO_TOPICO: Record<TopicoAcao, { titulo: string; ajuda: string }> = {
  imediata: {
    titulo: "Ação imediata",
    ajuda: "O que foi feito na hora para conter o efeito. Não resolve a causa.",
  },
  corretiva: {
    titulo: "Ação corretiva",
    ajuda: "Corrige o desvio encontrado — o padrão, o treino, o bloqueio que faltou.",
  },
  causa_raiz: {
    titulo: "Ação tratativa causa raiz",
    ajuda: "Ataca o 5º porquê. É a que impede a anomalia de voltar.",
  },
};

export const STATUS_ACAO = ["pendente", "em_andamento", "concluida"] as const;
export type StatusAcao = (typeof STATUS_ACAO)[number];

export const ROTULO_STATUS_ACAO: Record<StatusAcao, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

export type AcaoDoPlano = {
  topico: TopicoAcao;
  /** "O quê?" -- a ação. */
  oQue: string;
  /** "Como?" -- o meio. É o campo que separa intenção de plano. */
  como: string;
  /** "Quem?" -- uma pessoa, não uma área. Área não assina. */
  quem: string;
  /** "Prazo", em ISO curto. */
  prazo: string | null;
  status: StatusAcao;
};

/**
 * O CICLO DO RELATO.
 *
 * Vai além do papel de propósito, e é a única adição: o papel termina na
 * assinatura do gestor, e o auditor não pergunta se você assinou -- ele
 * pergunta se FUNCIONOU. `eficacia_verificada` é o estado que responde
 * isso, e é ele que transforma "temos 5 porquês" em "temos gestão de
 * anomalia".
 */
export const STATUS_RELATO = [
  "aberto",
  "em_analise",
  "plano_definido",
  "concluido",
  "eficacia_verificada",
] as const;
export type StatusRelato = (typeof STATUS_RELATO)[number];

export const ROTULO_STATUS_RELATO: Record<StatusRelato, { titulo: string; ajuda: string }> = {
  aberto: {
    titulo: "Aberto",
    ajuda: "O gatilho disparou e ninguém começou a analisar.",
  },
  em_analise: {
    titulo: "Em análise",
    ajuda: "Os porquês estão sendo respondidos.",
  },
  plano_definido: {
    titulo: "Plano definido",
    ajuda: "Causa raiz encontrada e ações com dono e prazo.",
  },
  concluido: {
    titulo: "Concluído",
    ajuda: "Todas as ações fechadas e o gestor assinou.",
  },
  eficacia_verificada: {
    titulo: "Eficácia verificada",
    ajuda: "O indicador voltou para dentro do limite e ficou. É aqui que o ciclo fecha.",
  },
};

/** Quantos porquês o método exige. O papel tem cinco, e o quinto é o que
 *  vira ação de causa raiz. */
export const PORQUES = 5;

export type RelatoParaFechar = {
  porques: (string | null)[];
  padronizacao: Padronizacao;
  acoes: AcaoDoPlano[];
  assinaturaGestor: string | null;
};

/**
 * O QUE FALTA PARA O RELATO FECHAR.
 *
 * Devolve a lista do que ainda impede, e não um "está inválido": um
 * formulário que diz apenas "faltam campos" numa folha com trinta
 * campos manda a pessoa caçar. A ordem é a do documento, para a pessoa
 * descer a tela consertando.
 */
export function pendenciasDoRelato(r: RelatoParaFechar): string[] {
  const faltas: string[] = [];

  const respondidos = r.porques.filter((p) => (p ?? "").trim()).length;
  if (respondidos < PORQUES) {
    faltas.push(
      `Análise da causa: ${respondidos} de ${PORQUES} porquês respondidos. O 5º é o que vira ação de causa raiz.`,
    );
  }

  const semResposta = PERGUNTAS_PADRONIZACAO.filter((p) => !r.padronizacao[p.id]);
  if (semResposta.length > 0) {
    faltas.push(
      `Padronização: ${semResposta.length} de ${PERGUNTAS_PADRONIZACAO.length} perguntas sem resposta.`,
    );
  }

  if (r.acoes.length === 0) {
    faltas.push("Plano de ação: nenhuma ação registrada.");
  } else {
    // Ação sem dono ou sem prazo não é ação -- é intenção. É o achado
    // mais comum de auditoria em plano de ação, e o mais fácil de evitar.
    const semDono = r.acoes.filter((a) => !a.quem.trim()).length;
    const semPrazo = r.acoes.filter((a) => !a.prazo).length;
    if (semDono > 0) faltas.push(`Plano de ação: ${semDono} ação(ões) sem responsável.`);
    if (semPrazo > 0) faltas.push(`Plano de ação: ${semPrazo} ação(ões) sem prazo.`);

    if (!r.acoes.some((a) => a.topico === "causa_raiz")) {
      faltas.push(
        "Plano de ação: falta uma ação de causa raiz. Só ação corretiva garante que a anomalia volta.",
      );
    }
  }

  if (!r.assinaturaGestor?.trim()) {
    faltas.push("Falta a assinatura do gestor.");
  }

  return faltas;
}

/** Pronto para fechar quando não sobra pendência. */
export function podeFechar(r: RelatoParaFechar): boolean {
  return pendenciasDoRelato(r).length === 0;
}

/**
 * O TÍTULO do relato, montado do indicador e do dia.
 *
 * Vira o nome do arquivo ao salvar em PDF e o assunto na lista -- por
 * isso começa pelo indicador, que é como a liderança procura.
 */
export function tituloDoRelato(indicador: string, dia: string): string {
  const [ano, mes, d] = dia.split("-");
  return `Relato de Anomalia — ${indicador} — ${d}/${mes}/${ano}`;
}
