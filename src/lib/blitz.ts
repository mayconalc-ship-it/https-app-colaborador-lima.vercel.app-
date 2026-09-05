/**
 * A BLITZ DE CARRETA -- quem cai nela, e o que sai para o transportador.
 *
 * Pedido do dono (05/09/2026): a carreta de transportadora com maior
 * índice de avaria cai na blitz ao ser registrada na portaria; o
 * conferente responde um checklist e fotografa cada item NOK; no fim, a
 * liderança trata e manda o relato de ocorrência.
 *
 * A BLITZ É DA TRANSPORTADORA, NÃO DA CARRETA. Uma placa ruim é um caso
 * isolado; uma transportadora que entrega avariado é um fornecedor a
 * tratar -- e é com ela que a ocorrência é aberta. Julgar pela placa
 * puniria o motorista que pegou a carreta velha da frota.
 *
 * Só a regra aqui, sem banco e sem tela.
 */

/**
 * Quantas carretas a transportadora precisa ter entregue para o índice
 * dela valer.
 *
 * Uma carreta com 60% de avaria não faz uma transportadora ruim: pode ter
 * sido a carga daquele dia. Com três, já há padrão. É o mesmo raciocínio
 * do mínimo de pontos do gatilho de anomalia, na escala que a operação
 * tem -- exigir vinte carretas por transportadora deixaria a blitz sem
 * nunca disparar.
 */
export const MINIMO_DE_CARRETAS = 3;

export type EntregaDaTransportadora = {
  transportadoraId: string | null;
  transportadoraNome: string;
  /** % de avaria daquele atendimento. */
  pctAvaria: number;
};

export type IndiceDaTransportadora = {
  transportadoraId: string | null;
  nome: string;
  carretas: number;
  media: number;
  /** Falso enquanto não há carretas suficientes para julgar. */
  confiavel: boolean;
};

/** A média de avaria por transportadora, no período olhado. */
export function indicePorTransportadora(
  entregas: EntregaDaTransportadora[],
): IndiceDaTransportadora[] {
  const porNome = new Map<string, EntregaDaTransportadora[]>();
  for (const e of entregas) {
    const chave = e.transportadoraNome.trim() || "(sem transportadora)";
    const lista = porNome.get(chave) ?? [];
    lista.push(e);
    porNome.set(chave, lista);
  }

  return [...porNome.entries()]
    .map(([nome, lista]) => ({
      transportadoraId: lista[0].transportadoraId,
      nome,
      carretas: lista.length,
      media: Math.round((lista.reduce((t, e) => t + e.pctAvaria, 0) / lista.length) * 100) / 100,
      confiavel: lista.length >= MINIMO_DE_CARRETAS,
    }))
    .sort((a, b) => b.media - a.media);
}

export type DecisaoDaBlitz = {
  cai: boolean;
  /** Preenchidos quando cai -- vão congelados na blitz. */
  media?: number;
  carretas?: number;
  motivo: string;
};

/**
 * ESTA CARRETA CAI NA BLITZ?
 *
 * O limite é o MESMO do gatilho de anomalia da avaria (a tela de
 * gatilhos), e isso é de propósito: duas réguas para "avaria demais"
 * seriam duas conversas diferentes sobre o mesmo problema, e a liderança
 * teria de explicar por que uma carreta abriu relato e a outra, com o
 * mesmo número, não caiu na blitz.
 */
export function decidirBlitz(
  indice: IndiceDaTransportadora | undefined,
  limitePct: number | null,
): DecisaoDaBlitz {
  if (limitePct === null) {
    return {
      cai: false,
      motivo: "Sem limite de avaria configurado — a blitz não tem régua para decidir.",
    };
  }
  if (!indice) {
    return { cai: false, motivo: "Transportadora sem histórico de conferência." };
  }
  if (!indice.confiavel) {
    return {
      cai: false,
      motivo: `${indice.nome}: ${indice.carretas} carreta(s) conferida(s), menos que as ${MINIMO_DE_CARRETAS} necessárias para julgar.`,
    };
  }
  if (indice.media <= limitePct) {
    return {
      cai: false,
      motivo: `${indice.nome}: média de ${indice.media}%, dentro do limite de ${limitePct}%.`,
    };
  }
  return {
    cai: true,
    media: indice.media,
    carretas: indice.carretas,
    motivo: `${indice.nome} está com ${indice.media}% de avaria média em ${indice.carretas} carretas — acima do limite de ${limitePct}%.`,
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
  mediaAvaria?: number | null;
  limite?: number | null;
};

/**
 * O RELATO DE OCORRÊNCIA, pronto para enviar ao transportador.
 *
 * Texto puro, e não HTML: ele é colado num e-mail que a pessoa manda da
 * PRÓPRIA conta. O app não envia e-mail -- montar SMTP daria um
 * remetente genérico, e o rastro que a auditoria quer ver é o da caixa
 * corporativa de quem tratou.
 *
 * AS FOTOS VÃO COMO LINK, não anexadas: são URLs públicas do mesmo
 * bucket que o resto do app usa, e link abre em qualquer cliente de
 * e-mail sem depender de tamanho de anexo.
 *
 * A ORDEM É A DA CONVERSA: quem, qual carreta, o que foi encontrado, o
 * que se espera. Um e-mail que começa pela lista de itens obriga o
 * transportador a procurar de qual carreta se fala.
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
    linhas.push(
      `  A média de avaria das cargas desta transportadora está em ${d.mediaAvaria}%, acima do limite de ${d.limite}% acordado para o recebimento.`,
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
