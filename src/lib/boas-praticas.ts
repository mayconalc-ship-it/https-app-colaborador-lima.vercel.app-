/**
 * PROGRAMA DE BOAS PRÁTICAS -- as regras, num lugar só.
 *
 * Pedido do dono (15/09/2026). O colaborador sugere quantas práticas
 * quiser até o prazo; a liderança analisa e libera para a votação só as
 * aprovadas; a liderança vota (desde 22/09/2026 -- antes eram os colegas);
 * as três mais votadas sobem ao pódio e são premiadas.
 *
 * Fica separado do servidor de propósito: o formulário do colaborador, a
 * tela da liderança e a ação do servidor leem as MESMAS regras. Regra
 * escrita duas vezes é regra que discorda na primeira mudança.
 */

import { ehAreaValida, type AreaId } from "@/lib/areas";

export const MODULO_BOAS_PRATICAS = "boas-praticas" as const;

/** Os mesmos números das travas das migrations 117 e 118. */
export const LIMITES = {
  tituloMin: 3,
  tituloMax: 100,
  textoMin: 10,
  textoMax: 1500,
  retornoMax: 500,
  premioMax: 200,
  votacaoTituloMax: 120,
  /** Votação com uma prática só não é votação. */
  minimoNaVotacao: 2,
  /** 1º, 2º e 3º lugar. */
  lugaresNoPodio: 3,
  /** O nome da liderança que votou fora do app (migration 132). */
  eleitorNomeMin: 3,
  eleitorNomeMax: 80,
} as const;

export type StatusPratica = "em_analise" | "selecionada" | "nao_selecionada";

export type CampoTexto = "problema" | "beneficios";

/**
 * Os campos do formulário, com a pergunta que cada um responde.
 *
 * Eram quatro (problema, objetivo, escopo, benefícios). O dono tirou
 * objetivo e escopo em 15/09/2026: quem sugere é o chão da operação, e
 * formulário comprido afasta justamente a ideia simples que o programa
 * procura. As colunas continuam no banco, opcionais desde a 119, para o
 * que já foi escrito não se perder.
 *
 * Sem os exemplos das outras revendas, também a pedido dele: a dica diz
 * o que escrever sem sugerir a resposta.
 */
export const CAMPOS_DA_PRATICA: {
  nome: CampoTexto;
  rotulo: string;
  pergunta: string;
  dica: string;
}[] = [
  {
    nome: "problema",
    rotulo: "Problema",
    pergunta: "Qual problema do dia a dia ela resolve?",
    dica: "O que atrapalha, atrasa ou gera erro hoje no seu trabalho.",
  },
  {
    nome: "beneficios",
    rotulo: "Benefícios",
    pergunta: "O que melhora quando ela estiver funcionando?",
    dica: "Tempo, segurança, qualidade, custo, conforto — o que muda para melhor.",
  },
];

/** O que o cartão mostra: os campos de hoje e os antigos, quando a prática os tem. */
export const CAMPOS_EXIBIDOS: {
  nome: "problema" | "objetivo" | "escopo" | "beneficios";
  rotulo: string;
}[] = [
  { nome: "problema", rotulo: "Problema" },
  { nome: "objetivo", rotulo: "Objetivo" },
  { nome: "escopo", rotulo: "Escopo" },
  { nome: "beneficios", rotulo: "Benefícios" },
];

export const ROTULO_STATUS: Record<StatusPratica, string> = {
  em_analise: "Em análise",
  selecionada: "Selecionada",
  nao_selecionada: "Não selecionada",
};

export const MEDALHA = ["🥇", "🥈", "🥉"] as const;

export type DadosDaPratica = {
  titulo: string;
  problema: string;
  beneficios: string;
};

/** Lê e limpa os campos do formulário. */
export function lerPratica(formData: FormData): DadosDaPratica {
  const texto = (nome: string) => String(formData.get(nome) ?? "").trim();
  return {
    titulo: texto("titulo"),
    problema: texto("problema"),
    beneficios: texto("beneficios"),
  };
}

/** A mensagem do primeiro problema, ou null quando está tudo certo. */
export function validarPratica(d: DadosDaPratica): string | null {
  if (d.titulo.length < LIMITES.tituloMin) return "Dê um nome para a sua boa prática.";
  if (d.titulo.length > LIMITES.tituloMax) {
    return `O nome da boa prática passa de ${LIMITES.tituloMax} caracteres. Encurte um pouco.`;
  }
  for (const c of CAMPOS_DA_PRATICA) {
    const valor = d[c.nome];
    if (valor.length < LIMITES.textoMin) {
      return `Conte um pouco mais em "${c.rotulo}" (pelo menos ${LIMITES.textoMin} caracteres).`;
    }
    if (valor.length > LIMITES.textoMax) {
      return `"${c.rotulo}" passa de ${LIMITES.textoMax} caracteres. Resuma um pouco.`;
    }
  }
  return null;
}

// ------------------------------------------------------------------
// Datas
// ------------------------------------------------------------------

/**
 * Hoje em "AAAA-MM-DD" no fuso da operação.
 *
 * A Vercel roda em UTC: com a data do servidor, o prazo que acaba "hoje"
 * fecharia às 21h, no meio do turno da noite.
 */
export function hojeSP(quando: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(quando);
}

export const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "AAAA-MM-DD" ou null, sem aceitar lixo. */
export function lerData(valor: unknown): string | null {
  const t = String(valor ?? "").trim();
  return DATA_ISO.test(t) ? t : null;
}

/** "2026-09-30" -> "30/09/2026". */
export function formatarDia(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** "2026-09-30" -> "30/09". */
export function formatarDiaCurto(iso: string) {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** "AAAA-MM-DD" + n dias. */
export function somarDias(iso: string, dias: number) {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Quantos dias faltam, contando hoje. 0 = acaba hoje. */
export function diasParaAcabar(fim: string, hoje = hojeSP()) {
  const umDia = 86_400_000;
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / umDia);
}

// ------------------------------------------------------------------
// Prêmios
// ------------------------------------------------------------------

/** Valor em reais vindo do formulário. Vazio = null; lixo = NaN. */
export function lerReais(valor: unknown): number | null {
  const t = String(valor ?? "").trim();
  if (!t) return null;
  return Number(t.replace(",", "."));
}

export function formatarReais(valor: number | null | undefined) {
  if (valor == null) return "a definir";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

export type Premios = { premio_1: number | null; premio_2: number | null; premio_3: number | null };

export function premiosDe(v: Premios) {
  return [v.premio_1, v.premio_2, v.premio_3].map((valor, i) => ({
    lugar: i + 1,
    medalha: MEDALHA[i],
    valor: valor == null ? null : Number(valor),
  }));
}

/** O 2º não vale mais que o 1º, nem o 3º mais que o 2º. */
export function validarPremios(p: Premios): string | null {
  const valores = [p.premio_1, p.premio_2, p.premio_3];
  for (const [i, v] of valores.entries()) {
    if (v != null && (!Number.isFinite(v) || v < 0)) return `O prêmio do ${i + 1}º lugar está inválido.`;
  }
  const [a, b, c] = valores;
  if (a != null && b != null && b > a) return "O prêmio do 2º lugar não pode ser maior que o do 1º.";
  if (b != null && c != null && c > b) return "O prêmio do 3º lugar não pode ser maior que o do 2º.";
  return null;
}

// ------------------------------------------------------------------
// Configuração do programa (áreas, calendário, premiação)
// ------------------------------------------------------------------

export type ConfigBoasPraticas = Premios & {
  /**
   * TODO MUNDO PARTICIPA (15/09/2026, pedido do dono: "o programa irá
   * abranger a todos").
   *
   * Ligado, ignora a lista de áreas -- inclusive quem está com uma área
   * que o app não traduz (FINANCEIRO, GENTE) e quem for cadastrado numa
   * área nova amanhã. A lista continua guardada para o dia em que o
   * programa voltar a ser por área.
   */
  todas_areas: boolean;
  areas: AreaId[];
  sugestoes_ate: string | null;
  votacao_ate: string | null;
  divulgacao_em: string | null;
};

/** Sem linha no banco: todo mundo, sem prazo, prêmio a definir. */
export const CONFIG_PADRAO: ConfigBoasPraticas = {
  todas_areas: true,
  areas: ["DU", "AL"],
  sugestoes_ate: null,
  votacao_ate: null,
  divulgacao_em: null,
  premio_1: null,
  premio_2: null,
  premio_3: null,
};

export function normalizarConfig(linha: Record<string, unknown> | null | undefined): ConfigBoasPraticas {
  if (!linha) return CONFIG_PADRAO;
  const numero = (v: unknown) => (v == null ? null : Number(v));
  const areas = (Array.isArray(linha.areas) ? linha.areas : []).map(String).filter(ehAreaValida);
  return {
    todas_areas: Boolean(linha.todas_areas),
    areas: areas.length > 0 ? areas : CONFIG_PADRAO.areas,
    sugestoes_ate: lerData(linha.sugestoes_ate),
    votacao_ate: lerData(linha.votacao_ate),
    divulgacao_em: lerData(linha.divulgacao_em),
    premio_1: numero(linha.premio_1),
    premio_2: numero(linha.premio_2),
    premio_3: numero(linha.premio_3),
  };
}

/** A mesma checagem da tela de Configuração e da migration 118. */
export function validarConfig(c: ConfigBoasPraticas): string | null {
  // Com "todas as áreas" ligado a lista não significa nada, então não faz
  // sentido exigir uma marcada.
  if (!c.todas_areas && c.areas.length === 0) return "Marque pelo menos uma área participante.";
  if (c.areas.some((a) => !ehAreaValida(a))) return "Área inválida.";
  if (c.sugestoes_ate && c.votacao_ate && c.sugestoes_ate > c.votacao_ate) {
    return "O prazo das sugestões tem de ser antes do fim da votação.";
  }
  if (c.votacao_ate && c.divulgacao_em && c.divulgacao_em <= c.votacao_ate) {
    return "A divulgação tem de ser depois do último dia de votação.";
  }
  return validarPremios(c);
}

/** Ainda dá para enviar ou corrigir sugestão? */
export function recebeSugestao(c: Pick<ConfigBoasPraticas, "sugestoes_ate">, hoje = hojeSP()) {
  return !c.sugestoes_ate || hoje <= c.sugestoes_ate;
}

export function mensagemPrazoDeSugestao(c: Pick<ConfigBoasPraticas, "sugestoes_ate">) {
  return c.sugestoes_ate
    ? `O prazo para enviar sugestões terminou em ${formatarDia(c.sugestoes_ate)}.`
    : "O envio de sugestões está fechado.";
}

// ------------------------------------------------------------------
// Votação
// ------------------------------------------------------------------

export type VotacaoBasica = { encerrada_em: string | null; fim: string; divulgacao_em?: string | null };

/**
 * Dá para votar agora? Não encerrada E dentro do prazo.
 *
 * O prazo vencido fecha o voto sozinho, mesmo que a liderança ainda não
 * tenha divulgado: ninguém vota depois da data que foi anunciada.
 */
export function votacaoRecebeVoto(v: VotacaoBasica, hoje = hojeSP()) {
  return !v.encerrada_em && hoje <= v.fim;
}

export function textoDoPrazo(v: VotacaoBasica, hoje = hojeSP()) {
  if (v.encerrada_em) return "Resultado divulgado";
  const dias = diasParaAcabar(v.fim, hoje);
  if (dias < 0) {
    return v.divulgacao_em
      ? `Votação encerrada — resultado em ${formatarDia(v.divulgacao_em)}`
      : "Votação encerrada — aguardando o resultado";
  }
  if (dias === 0) return "Último dia para votar";
  if (dias === 1) return `Termina amanhã (${formatarDiaCurto(v.fim)})`;
  return `Faltam ${dias} dias · votação até ${formatarDia(v.fim)}`;
}

/** Prazo e divulgação da votação: o prazo não fica no passado e a divulgação vem depois dele. */
export function validarDatasDaVotacao(fim: string | null, divulgacao: string | null, hoje = hojeSP()) {
  if (!fim) return "Informe até que dia a votação fica aberta.";
  if (fim < hoje) return "O prazo da votação não pode estar no passado.";
  if (!divulgacao) return "Informe o dia da divulgação do resultado.";
  if (divulgacao <= fim) return "A divulgação tem de ser depois do último dia de votação.";
  return null;
}

/**
 * Por que ainda NÃO dá para divulgar -- ou null, quando dá.
 *
 * O calendário é a regra: a votação vai até o fim do último dia, e o
 * resultado sai no dia da divulgação, não antes. A tela desliga o botão
 * com este mesmo texto, e a ação recusa com ele.
 */
export function motivoParaNaoDivulgar(v: VotacaoBasica, hoje = hojeSP()): string | null {
  if (v.encerrada_em) return "O resultado desta votação já foi divulgado.";
  if (hoje <= v.fim) {
    return `A votação vai até ${formatarDia(v.fim)}. O resultado sai depois disso${
      v.divulgacao_em ? `, em ${formatarDia(v.divulgacao_em)}` : ""
    }.`;
  }
  if (v.divulgacao_em && hoje < v.divulgacao_em) return `A divulgação é em ${formatarDia(v.divulgacao_em)}.`;
  return null;
}

// ------------------------------------------------------------------
// Quem vota: A LIDERANÇA (22/09/2026)
// ------------------------------------------------------------------
// Pedido do dono: o colaborador votando dá margem a conflito entre áreas
// e a voto por afinidade. Vota a liderança do app pelo celular; a que não
// está no app tem o voto LANÇADO por quem conduz o programa.

/** Vota pelo app: liderança e o dono. O colaborador acompanha. */
export function votaPeloApp(papel: string | undefined) {
  return papel === "lideranca" || papel === "owner" || papel === "admin";
}

/**
 * A chave do nome de quem votou: sem acento, maiúsculas, espaço único.
 * O voto do celular e o lançado gravam a mesma chave, e o banco aceita
 * uma por votação -- o mesmo líder não vota pelos dois caminhos.
 */
export function chaveDoEleitor(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** O nome digitado para o voto lançado. */
export function validarEleitorLancado(nome: string): string | null {
  const limpo = nome.trim();
  if (chaveDoEleitor(limpo).length < LIMITES.eleitorNomeMin) return "Informe o nome da liderança que votou.";
  if (limpo.length > LIMITES.eleitorNomeMax) return `O nome passa de ${LIMITES.eleitorNomeMax} caracteres.`;
  return null;
}

/** A contagem de votos por prática e a ordem, do mais votado ao menos. */
export function apurar(praticaIds: string[], votos: { pratica_id: string }[]) {
  const contagem = new Map<string, number>(praticaIds.map((id) => [id, 0]));
  for (const v of votos) {
    if (contagem.has(v.pratica_id)) contagem.set(v.pratica_id, (contagem.get(v.pratica_id) ?? 0) + 1);
  }
  const total = [...contagem.values()].reduce((a, b) => a + b, 0);
  const maximo = Math.max(0, ...contagem.values());
  const ranking = [...praticaIds].sort((a, b) => (contagem.get(b) ?? 0) - (contagem.get(a) ?? 0));
  return { contagem, total, maximo, ranking };
}

/** O pódio que a contagem dá, sem ninguém mexer: as três mais votadas, com pelo menos um voto. */
export function podioSugerido(contagem: Record<string, number>) {
  return Object.keys(contagem)
    .filter((id) => (contagem[id] ?? 0) > 0)
    .sort((a, b) => contagem[b] - contagem[a])
    .slice(0, LIMITES.lugaresNoPodio);
}

/**
 * O pódio escolhido respeita o voto?
 *
 * Quem decide é o voto. A liderança só ordena as que EMPATARAM: pode
 * trocar de lugar duas práticas com o mesmo número de votos, nunca pôr uma
 * menos votada na frente de uma mais votada. Lugar no pódio exige ao menos
 * um voto -- prêmio para zero voto não é resultado de votação.
 */
export function validarPodio(
  contagem: Record<string, number>,
  escolhidas: string[],
): { ok: true; podio: string[] } | { ok: false; erro: string } {
  const votos = (id: string) => contagem[id] ?? 0;
  const comVoto = Object.keys(contagem).filter((id) => votos(id) > 0);
  const vagas = Math.min(LIMITES.lugaresNoPodio, comVoto.length);
  const podio = escolhidas.filter(Boolean);

  if (vagas === 0) {
    return podio.length === 0 ? { ok: true, podio: [] } : { ok: false, erro: "Ninguém votou: não há pódio." };
  }
  if (podio.length !== vagas) {
    return {
      ok: false,
      erro:
        vagas < LIMITES.lugaresNoPodio
          ? `Só ${vagas} prática${vagas === 1 ? "" : "s"} recebeu voto: preencha ${vagas} lugar${vagas === 1 ? "" : "es"}.`
          : "Preencha o 1º, o 2º e o 3º lugar.",
    };
  }
  if (new Set(podio).size !== podio.length) return { ok: false, erro: "A mesma prática está em dois lugares." };
  if (podio.some((id) => !(id in contagem) || votos(id) === 0)) {
    return { ok: false, erro: "Só entra no pódio prática que está na votação e recebeu voto." };
  }
  for (let i = 1; i < podio.length; i++) {
    if (votos(podio[i]) > votos(podio[i - 1])) {
      return { ok: false, erro: `O ${i + 1}º lugar não pode ter mais votos que o ${i}º.` };
    }
  }
  const ultimo = votos(podio[podio.length - 1]);
  if (comVoto.some((id) => !podio.includes(id) && votos(id) > ultimo)) {
    return { ok: false, erro: "Ficou de fora do pódio uma prática com mais votos que uma das escolhidas." };
  }
  return { ok: true, podio };
}

export function nomeSugeridoDaVotacao(hoje = hojeSP()) {
  const [a, m] = hoje.split("-");
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `Boas Práticas — ${meses[Number(m) - 1]}/${a}`;
}
