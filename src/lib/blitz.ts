/**
 * A BLITZ DE CARRETA -- quem cai nela, e o que sai para o transportador.
 *
 * Pedido do dono (05/09/2026): a carreta com maior índice de avaria cai na
 * blitz ao ser registrada na portaria; o conferente responde um checklist e
 * fotografa cada item NOK; no fim, a liderança trata e manda o relato de
 * ocorrência.
 *
 * A BLITZ OLHA TRÊS COISAS, NESTA ORDEM: A CARRETA, O MOTORISTA E A
 * TRANSPORTADORA -- e basta uma delas estar acima do limite para parar.
 *
 * A carreta vem primeiro porque é onde a avaria nasce: asa delta que não
 * fecha, grade faltando, lona bamba. Isso é da PLACA, não da frota inteira
 * -- julgar só pela transportadora esconde a carreta velha no meio de uma
 * frota boa, e é justamente essa que volta a avariar amanhã.
 *
 * O motorista entra porque a condução muda o resultado: mesma carreta, mesma
 * carga, freada diferente. Uma placa boa com um índice ruim que segue o
 * motorista é sinal de condução, não de equipamento -- e a conversa é outra.
 *
 * A transportadora fica por último como rede de segurança, e continua sendo
 * PARA QUEM O RELATO DE OCORRÊNCIA É ESCRITO: quem responde pela frota e
 * pelo motorista é ela.
 *
 * Só a regra aqui, sem banco e sem tela.
 */

/**
 * Quantas cargas a mesma carreta / motorista / transportadora precisa ter
 * entregue para o índice dela valer.
 *
 * Uma carga com 60% de avaria não condena ninguém: pode ter sido a carga
 * daquele dia. Com três, já há padrão. É o mesmo raciocínio do mínimo de
 * pontos do gatilho de anomalia, na escala que a operação tem -- exigir
 * vinte por placa deixaria a blitz sem nunca disparar.
 */
export const MINIMO_DE_CARRETAS = 3;

/** O que a blitz olha, na ordem em que decide. */
export const DIMENSOES = ["carreta", "motorista", "transportadora"] as const;
export type Dimensao = (typeof DIMENSOES)[number];

export const ROTULO_DIMENSAO: Record<Dimensao, string> = {
  carreta: "Carreta",
  motorista: "Motorista",
  transportadora: "Transportadora",
};

export type EntregaConferida = {
  placaCarreta: string | null;
  motorista: string | null;
  transportadoraNome: string | null;
  /** % de avaria daquele atendimento. */
  pctAvaria: number;
};

export type IndiceDaDimensao = {
  dimensao: Dimensao;
  nome: string;
  cargas: number;
  media: number;
  /** Falso enquanto não há cargas suficientes para julgar. */
  confiavel: boolean;
};

const SEM_NOME: Record<Dimensao, string> = {
  carreta: "(sem placa)",
  motorista: "(sem motorista)",
  transportadora: "(sem transportadora)",
};

/**
 * A CHAVE É NORMALIZADA. Placa vem "abc1d23", "ABC-1D23" e "ABC 1D23" da
 * portaria conforme quem digitou; nome de motorista vem com espaço dobrado.
 * Sem isso a mesma carreta viraria três carretas de uma carga cada, e
 * nenhuma delas chegaria ao mínimo -- a blitz nunca dispararia, sem erro
 * nenhum aparecer.
 */
export function chaveDaDimensao(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    // SEPARADOR SOME, nao vira espaco: a portaria digita "PCN-0509",
    // "PCN 0509" e "PCN0509" para a mesma carreta, e trocar o hifen por
    // espaco deixaria a terceira de fora.
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();
}

function valorNaDimensao(e: EntregaConferida, d: Dimensao): string | null {
  if (d === "carreta") return e.placaCarreta;
  if (d === "motorista") return e.motorista;
  return e.transportadoraNome;
}

/** A média de avaria de uma dimensão, no período olhado, pior primeiro. */
export function indicePorDimensao(
  entregas: EntregaConferida[],
  dimensao: Dimensao,
): IndiceDaDimensao[] {
  const porChave = new Map<string, { nome: string; valores: number[] }>();

  for (const e of entregas) {
    const bruto = valorNaDimensao(e, dimensao);
    const chave = chaveDaDimensao(bruto);
    // Sem identificação não há histórico a construir: somar tudo num balde
    // "(sem placa)" inventaria um índice que não é de ninguém.
    if (!chave) continue;
    const atual = porChave.get(chave) ?? { nome: bruto?.trim() || SEM_NOME[dimensao], valores: [] };
    atual.valores.push(e.pctAvaria);
    porChave.set(chave, atual);
  }

  return [...porChave.values()]
    .map(({ nome, valores }) => ({
      dimensao,
      nome,
      cargas: valores.length,
      media: Math.round((valores.reduce((t, v) => t + v, 0) / valores.length) * 100) / 100,
      confiavel: valores.length >= MINIMO_DE_CARRETAS,
    }))
    .sort((a, b) => b.media - a.media);
}

/** As três listas de uma vez -- é o que a tela de índices mostra. */
export function indices(entregas: EntregaConferida[]): Record<Dimensao, IndiceDaDimensao[]> {
  return {
    carreta: indicePorDimensao(entregas, "carreta"),
    motorista: indicePorDimensao(entregas, "motorista"),
    transportadora: indicePorDimensao(entregas, "transportadora"),
  };
}

/** Os três índices desta carreta específica, para a decisão da portaria. */
export function indicesDaChegada(
  entregas: EntregaConferida[],
  chegada: { placaCarreta?: string | null; motorista?: string | null; transportadoraNome?: string | null },
): Partial<Record<Dimensao, IndiceDaDimensao>> {
  const todos = indices(entregas);
  const achar = (d: Dimensao, valor: string | null | undefined) => {
    const chave = chaveDaDimensao(valor);
    if (!chave) return undefined;
    return todos[d].find((i) => chaveDaDimensao(i.nome) === chave);
  };
  return {
    carreta: achar("carreta", chegada.placaCarreta),
    motorista: achar("motorista", chegada.motorista),
    transportadora: achar("transportadora", chegada.transportadoraNome),
  };
}

export type DecisaoDaBlitz = {
  cai: boolean;
  /** Quem estourou o limite -- e o que vai congelado na blitz. */
  dimensao?: Dimensao;
  nome?: string;
  media?: number;
  cargas?: number;
  motivo: string;
  /** O que cada dimensão dizia na hora. A tela mostra as três. */
  avaliadas: IndiceDaDimensao[];
};

/**
 * ESTA CARRETA CAI NA BLITZ?
 *
 * O limite é o MESMO do gatilho de anomalia da avaria (a tela de gatilhos),
 * e isso é de propósito: duas réguas para "avaria demais" seriam duas
 * conversas diferentes sobre o mesmo problema, e a liderança teria de
 * explicar por que uma carreta abriu relato e a outra, com o mesmo número,
 * não caiu na blitz.
 *
 * BASTA UMA DIMENSÃO ESTOURAR. E quando mais de uma estoura, quem dá o
 * motivo é a PRIMEIRA da ordem -- carreta antes de motorista, motorista
 * antes de transportadora. Não é média nem soma: é o alvo mais específico
 * que a operação consegue tratar. "A carreta PCN-0509 está com 30%" vira
 * ação; "a transportadora está com 30%" vira reunião.
 */
export function decidirBlitz(
  dosIndices: Partial<Record<Dimensao, IndiceDaDimensao | undefined>>,
  limitePct: number | null,
): DecisaoDaBlitz {
  const avaliadas = DIMENSOES.map((d) => dosIndices[d]).filter(
    (i): i is IndiceDaDimensao => Boolean(i),
  );

  if (limitePct === null) {
    return {
      cai: false,
      motivo: "Sem limite de avaria configurado — a blitz não tem régua para decidir.",
      avaliadas,
    };
  }

  for (const d of DIMENSOES) {
    const i = dosIndices[d];
    if (!i || !i.confiavel || i.media <= limitePct) continue;
    return {
      cai: true,
      dimensao: d,
      nome: i.nome,
      media: i.media,
      cargas: i.cargas,
      motivo: `${ROTULO_DIMENSAO[d]} ${i.nome} está com ${i.media}% de avaria média em ${i.cargas} cargas — acima do limite de ${limitePct}%.`,
      avaliadas,
    };
  }

  if (avaliadas.length === 0) {
    return { cai: false, motivo: "Carreta, motorista e transportadora sem histórico de conferência.", avaliadas };
  }
  const semBase = avaliadas.filter((i) => !i.confiavel);
  if (semBase.length === avaliadas.length) {
    return {
      cai: false,
      motivo: `Sem base para julgar: ${semBase
        .map((i) => `${ROTULO_DIMENSAO[i.dimensao].toLowerCase()} com ${i.cargas} carga(s)`)
        .join(", ")} — o mínimo é ${MINIMO_DE_CARRETAS}.`,
      avaliadas,
    };
  }
  return {
    cai: false,
    motivo: `Dentro do limite de ${limitePct}%: ${avaliadas
      .filter((i) => i.confiavel)
      .map((i) => `${ROTULO_DIMENSAO[i.dimensao].toLowerCase()} ${i.media}%`)
      .join(", ")}.`,
    avaliadas,
  };
}

/* ------------------------------------------------------------------ */

export type RespostaBlitz = {
  pergunta: string;
  resposta: "ok" | "nok" | "na";
  observacao?: string | null;
  fotoUrl?: string | null;
};

export type DadosDaOcorrencia = {
  transportadora: string;
  placaCarreta: string;
  placaCavalo: string;
  motorista: string;
  numeroDt: string;
  chegadaEm: string;
  conferente: string;
  revenda: string;
  respostas: RespostaBlitz[];
  /** O que estourou: "Carreta PCN-0509", "Motorista ...". */
  dimensao?: Dimensao | null;
  nomeDoIndice?: string | null;
  mediaAvaria?: number | null;
  limite?: number | null;
};

/**
 * O RELATO DE OCORRÊNCIA, pronto para enviar ao transportador.
 *
 * Texto puro, e não HTML: ele é colado num e-mail que a pessoa manda da
 * PRÓPRIA conta. O app não envia e-mail -- montar SMTP daria um remetente
 * genérico, e o rastro que a auditoria quer ver é o da caixa corporativa de
 * quem tratou.
 *
 * AS FOTOS VÃO COMO LINK, não anexadas: são URLs públicas do mesmo bucket
 * que o resto do app usa, e link abre em qualquer cliente de e-mail sem
 * depender de tamanho de anexo.
 *
 * A ORDEM É A DA CONVERSA: quem, qual carreta, o que foi encontrado, o que
 * se espera. Um e-mail que começa pela lista de itens obriga o transportador
 * a procurar de qual carreta se fala.
 */
export function textoDaOcorrencia(d: DadosDaOcorrencia): string {
  const nok = d.respostas.filter((r) => r.resposta === "nok");
  const data = new Date(d.chegadaEm).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const linhas: string[] = [];

  linhas.push(`Prezados, ${d.transportadora},`);
  linhas.push("");
  linhas.push(
    "Registramos abaixo uma ocorrência identificada na inspeção de recebimento (blitz de carreta) realizada em nossa unidade.",
  );
  linhas.push("");
  linhas.push("DADOS DO TRANSPORTE");
  linhas.push(`  Transportadora: ${d.transportadora}`);
  linhas.push(`  Carreta: ${d.placaCarreta}   Cavalo: ${d.placaCavalo}`);
  linhas.push(`  Motorista: ${d.motorista}`);
  linhas.push(`  DT: ${d.numeroDt}`);
  linhas.push(`  Chegada: ${data}`);
  linhas.push(`  Unidade: ${d.revenda}`);
  linhas.push(`  Conferente: ${d.conferente}`);

  if (d.mediaAvaria != null && d.limite != null) {
    linhas.push("");
    linhas.push("POR QUE ESTA CARRETA FOI INSPECIONADA");
    // DIZER O QUE ESTOUROU, e não só "a transportadora": a ação do
    // transportador é outra se o problema está numa placa específica.
    const alvo =
      d.dimensao && d.nomeDoIndice
        ? `${ROTULO_DIMENSAO[d.dimensao].toLowerCase()} ${d.nomeDoIndice}`
        : "esta transportadora";
    linhas.push(
      `  A média de avaria das cargas recebidas com ${alvo} está em ${d.mediaAvaria}%, acima do limite de ${d.limite}% acordado para o recebimento.`,
    );
  }

  linhas.push("");
  if (nok.length === 0) {
    // Blitz sem NOK não vira ocorrência -- mas o texto existe para quem
    // quiser registrar a inspeção mesmo assim, e dizer isso é melhor do
    // que gerar um e-mail vazio de acusação.
    linhas.push("RESULTADO DA INSPEÇÃO");
    linhas.push("  Nenhuma não conformidade foi identificada nesta inspeção.");
  } else {
    linhas.push(`NÃO CONFORMIDADES IDENTIFICADAS (${nok.length})`);
    nok.forEach((r, i) => {
      linhas.push("");
      linhas.push(`  ${i + 1}. ${r.pergunta}`);
      if (r.observacao?.trim()) linhas.push(`     Observação: ${r.observacao.trim()}`);
      if (r.fotoUrl) linhas.push(`     Evidência: ${r.fotoUrl}`);
    });
    linhas.push("");
    linhas.push("O QUE ESPERAMOS");
    linhas.push(
      "  Solicitamos a análise das causas e o retorno com o plano de ação, com responsável e prazo, para que as próximas cargas não apresentem a mesma condição.",
    );
  }

  linhas.push("");
  linhas.push("Atenciosamente,");
  linhas.push(`${d.revenda} — Recebimento`);

  return linhas.join("\n");
}

/** O assunto do e-mail: identifica a carreta na caixa de entrada de quem
 *  recebe dezenas por dia. */
export function assuntoDaOcorrencia(d: DadosDaOcorrencia): string {
  const nok = d.respostas.filter((r) => r.resposta === "nok").length;
  return `Relato de ocorrência — ${d.placaCarreta} — DT ${d.numeroDt} — ${nok} não conformidade(s)`;
}

/** O link `mailto:` já com assunto e corpo. Abre no cliente de e-mail da
 *  pessoa, com tudo escrito -- ela revisa e envia. */
export function linkDoEmail(d: DadosDaOcorrencia): string {
  return `mailto:?subject=${encodeURIComponent(assuntoDaOcorrencia(d))}&body=${encodeURIComponent(
    textoDaOcorrencia(d),
  )}`;
}
