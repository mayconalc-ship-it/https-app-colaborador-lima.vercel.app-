/**
 * PROGRAMA DE BOAS PRÁTICAS -- as regras, num lugar só.
 *
 * Pedido do dono (15/09/2026). O colaborador sugere quantas práticas
 * quiser; a liderança seleciona quais vão para a votação; os colegas
 * votam; a mais votada ganha o incentivo.
 *
 * Fica separado do servidor de propósito: o formulário do colaborador e a
 * tela da liderança leem os MESMOS limites que a ação confere. Limite
 * escrito duas vezes é limite que discorda na primeira mudança.
 */

export const MODULO_BOAS_PRATICAS = "boas-praticas" as const;

/** Os mesmos números das travas da migration 117. */
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
} as const;

export type StatusPratica = "em_analise" | "selecionada" | "nao_selecionada";

export type CampoTexto = "problema" | "objetivo" | "escopo" | "beneficios";

/**
 * Os quatro campos que o dono pediu, com a pergunta que cada um responde.
 *
 * Os exemplos são os dois casos reais que ele citou, de outras revendas:
 * prática boa não precisa de investimento alto. Eles aparecem no próprio
 * formulário para quem nunca escreveu uma proposta ver o tamanho da coisa.
 */
export const CAMPOS_DA_PRATICA: {
  nome: CampoTexto;
  rotulo: string;
  pergunta: string;
  exemplo: string;
}[] = [
  {
    nome: "problema",
    rotulo: "Problema",
    pergunta: "Qual problema do dia a dia ela resolve?",
    exemplo: "A tela do palmtop não responde bem ao dedo e a digitação no pedido atrasa.",
  },
  {
    nome: "objetivo",
    rotulo: "Objetivo",
    pergunta: "O que você quer alcançar com ela?",
    exemplo: "Digitar mais rápido e errar menos no palmtop.",
  },
  {
    nome: "escopo",
    rotulo: "Escopo",
    pergunta: "Onde e com quem ela vai funcionar? O que precisa para fazer?",
    exemplo: "Todos os palmtops da entrega. Comprar uma caneta touch (canetinha mágica) para cada aparelho.",
  },
  {
    nome: "beneficios",
    rotulo: "Benefícios",
    pergunta: "O que melhora quando ela estiver funcionando?",
    exemplo: "Menos erro de digitação, menos tempo no cliente e a tela do aparelho dura mais.",
  },
];

export const ROTULO_STATUS: Record<StatusPratica, string> = {
  em_analise: "Em análise",
  selecionada: "Selecionada",
  nao_selecionada: "Não selecionada",
};

export type DadosDaPratica = {
  titulo: string;
  problema: string;
  objetivo: string;
  escopo: string;
  beneficios: string;
};

/** Lê e limpa os campos do formulário. */
export function lerPratica(formData: FormData): DadosDaPratica {
  const texto = (nome: string) => String(formData.get(nome) ?? "").trim();
  return {
    titulo: texto("titulo"),
    problema: texto("problema"),
    objetivo: texto("objetivo"),
    escopo: texto("escopo"),
    beneficios: texto("beneficios"),
  };
}

/** A mensagem do primeiro problema, ou null quando está tudo certo. */
export function validarPratica(d: DadosDaPratica): string | null {
  if (d.titulo.length < LIMITES.tituloMin) return "Dê um nome para a sua prática.";
  if (d.titulo.length > LIMITES.tituloMax) {
    return `O nome da prática passa de ${LIMITES.tituloMax} caracteres. Encurte um pouco.`;
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

/**
 * Hoje em "AAAA-MM-DD" no fuso da operação.
 *
 * A Vercel roda em UTC: com a data do servidor, a votação que acaba "hoje"
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

/** "2026-09-30" -> "30/09/2026". */
export function formatarDia(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export type VotacaoBasica = { encerrada_em: string | null; fim: string };

/**
 * Dá para votar agora? Não encerrada E dentro do prazo.
 *
 * O prazo vencido fecha o voto sozinho, mesmo que a liderança ainda não
 * tenha encerrado: ninguém vota depois da data que foi anunciada.
 */
export function votacaoRecebeVoto(v: VotacaoBasica, hoje = hojeSP()) {
  return !v.encerrada_em && hoje <= v.fim;
}

/** Quantos dias faltam, contando hoje. 0 = acaba hoje. */
export function diasParaAcabar(fim: string, hoje = hojeSP()) {
  const umDia = 86_400_000;
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / umDia);
}

export function textoDoPrazo(v: VotacaoBasica, hoje = hojeSP()) {
  if (v.encerrada_em) return "Votação encerrada";
  const dias = diasParaAcabar(v.fim, hoje);
  if (dias < 0) return "Prazo encerrado — aguardando o resultado";
  if (dias === 0) return "Último dia para votar";
  if (dias === 1) return "Termina amanhã";
  return `Faltam ${dias} dias · até ${formatarDia(v.fim)}`;
}

/**
 * A apuração. `lideres` é quem tem o maior número de votos -- mais de um
 * quando há empate, e vazio quando ninguém votou.
 */
export function apurar(praticaIds: string[], votos: { pratica_id: string }[]) {
  const contagem = new Map<string, number>(praticaIds.map((id) => [id, 0]));
  for (const v of votos) {
    if (contagem.has(v.pratica_id)) contagem.set(v.pratica_id, (contagem.get(v.pratica_id) ?? 0) + 1);
  }
  const total = [...contagem.values()].reduce((a, b) => a + b, 0);
  const maximo = Math.max(0, ...contagem.values());
  const lideres = maximo > 0 ? praticaIds.filter((id) => contagem.get(id) === maximo) : [];
  const ranking = [...praticaIds].sort((a, b) => (contagem.get(b) ?? 0) - (contagem.get(a) ?? 0));
  return { contagem, total, maximo, lideres, ranking };
}

export function nomeSugeridoDaVotacao(hoje = hojeSP()) {
  const [a, m] = hoje.split("-");
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `Boas Práticas — ${meses[Number(m) - 1]}/${a}`;
}
