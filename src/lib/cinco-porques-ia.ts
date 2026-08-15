import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIAS } from "@/lib/cinco-porques-problemas";

/**
 * IA da ferramenta "5 Porquês".
 *
 * UMA PERGUNTA POR CHAMADA -- e essa é a decisão que sustenta tudo aqui.
 *
 * A primeira versão pedia a árvore de decisão INTEIRA numa chamada só, para
 * economizar tokens: o app percorria a árvore sozinho e o motorista tocava
 * sem esperar nada. Em produção isso não se sustentou. Com piso de 4 níveis
 * obrigatórios e 3 opções por nível, a árvore pedida tem ~40 perguntas e ~81
 * causas raiz num único JSON -- e o modelo, em vez de falhar, "toca fino":
 * devolve ramos de mentira, do tipo `{"pergunta": "x", "opcoes": []}`, para
 * conseguir fechar a estrutura. A validação rejeitava a árvore ("o modelo
 * devolveu uma árvore sem opções") e o motorista NUNCA chegava na causa raiz.
 * Medido: 2 de 2 tentativas com Sonnet vieram com nó vazio, gastando só 4238
 * dos 10000 tokens -- não era limite de token nem tempo, era a estrutura
 * grande demais para ser escrita de uma vez.
 *
 * Pedindo um nó por vez não existe nada para o modelo encher de linguiça:
 * cada chamada devolve uma pergunta com 3-4 opções, ou a causa raiz. A
 * profundidade deixa de depender da boa vontade do modelo e passa a ser
 * regra do schema (ver PORQUES_MINIMOS abaixo).
 *
 * Haiku, não Sonnet: a tarefa por chamada ficou pequena e fechada, que é
 * exatamente onde o Haiku vai bem -- 1,5 a 2s por pergunta, contra 20-40s
 * que o Sonnet levava para montar a árvore toda. Em teste real, 3 de 3
 * análises chegaram à causa raiz com os 5 porquês completos.
 *
 * E sai mais barato, não mais caro: a árvore gastava ~4238 tokens de saída
 * para gerar ~81 causas raiz das quais o motorista via UMA. O caminho a pé
 * gasta ~600 tokens de saída no total, porque só gera o ramo que ele
 * realmente andou.
 */

const MODELO = "claude-haiku-4-5";

/** Sem chave configurada o recurso fica desligado, sem quebrar nada. */
export function iaConfigurada() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type CategoriaCincoPorques = (typeof CATEGORIAS)[number]["id"];

export type Terminal = {
  causaRaiz: string;
  categoria: CategoriaCincoPorques;
  acaoSugerida: string;
};

/** Uma opção é só um botão: sem sub-árvore pendurada nela. */
export type OpcaoNo = {
  id: string;
  label: string;
};

export type NoDecisao = {
  nivel: number;
  pergunta: string;
  /** 3 a 4 opções reais. "Outro" e "Nenhuma dessas" o cliente sempre
   *  desenha à parte -- nunca fazem parte desta lista. */
  opcoes: OpcaoNo[];
};

export type RespostaPorque = {
  nivel: number;
  pergunta: string;
  opcaoId: string;
  opcaoLabel: string;
  /** Só quando a opção escolhida foi "Outro" com texto digitado. */
  textoLivre?: string;
};

const CATEGORIA_IDS = CATEGORIAS.map((c) => c.id);

const ESQUEMA_TERMINAL = {
  type: "object",
  properties: {
    causaRaiz: { type: "string" },
    categoria: { type: "string", enum: CATEGORIA_IDS },
    acaoSugerida: { type: "string" },
  },
  required: ["causaRaiz", "categoria", "acaoSugerida"],
  additionalProperties: false,
} as const;

/**
 * Piso de profundidade -- a exigência de "no mínimo 3 porquês".
 *
 * Não é instrução, é schema: enquanto o motorista tiver respondido menos que
 * isto, o campo "terminal" nem existe como possibilidade, então a chamada É
 * OBRIGADA a devolver mais uma pergunta. Nenhum modelo consegue encerrar
 * antes, por mais convencido que esteja de já saber a causa.
 *
 * Acima do piso o modelo escolhe: em teste real ele foi até 5 nas três
 * análises, então o piso funciona como garantia e não como teto disfarçado.
 */
const PORQUES_MINIMOS = 3;
const PORQUES_MAXIMOS = 5;

/**
 * Um nó, sem recursão. `minItems: 1` é o que proíbe explicitamente o
 * `"opcoes": []` que derrubava a versão anterior -- a API aceita minItems 0
 * ou 1 (nada além disso), e `maxItems` ela recusa em qualquer valor, então o
 * teto de 4 opções continua sendo aparado no código, em `normalizarNo`.
 */
const ESQUEMA_NO = {
  type: "object",
  properties: {
    pergunta: { type: "string" },
    opcoes: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
        },
        required: ["id", "label"],
        additionalProperties: false,
      },
    },
  },
  required: ["pergunta", "opcoes"],
  additionalProperties: false,
} as const;

/** O que este passo pode devolver: só continuar, só terminar, ou os dois. */
function regrasDoPasso(jaRespondidos: number) {
  return {
    podeTerminar: jaRespondidos >= PORQUES_MINIMOS,
    podeContinuar: jaRespondidos < PORQUES_MAXIMOS,
  };
}

function construirEsquemaPasso(jaRespondidos: number): Record<string, unknown> {
  const { podeTerminar, podeContinuar } = regrasDoPasso(jaRespondidos);

  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (podeTerminar) properties.terminal = ESQUEMA_TERMINAL;
  if (podeContinuar) properties.proximoNo = ESQUEMA_NO;
  if (!podeTerminar) required.push("proximoNo");
  else if (!podeContinuar) required.push("terminal");

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

const REGRAS_COMUNS = `Você conduz um motorista de distribuidora de bebidas pela metodologia dos 5 Porquês, logo depois que ele termina a entrega.

O motorista está no celular, no fim do turno. Ele NÃO vai digitar textos -- só toca em botões. Por isso:
- A pergunta é curta (até 12 palavras) e sempre começa por "Por que".
- Cada opção é uma frase curta (até 6 palavras), o suficiente para reconhecer, não para explicar.
- Sempre 3 ou 4 opções, nunca menos de 3.
- As opções cobrem os motivos mais prováveis PARA QUEM TRABALHA NA OPERAÇÃO (entrega, rota, veículo, cliente, sistema) -- nada genérico ou administrativo.
- NUNCA faça pergunta de sim/não, nem ofereça opções do tipo "Sim, é recorrente".
- Não repita pergunta nem opção que já apareceram na trilha.
- TESTE DE CAUSA RAIZ, antes de decidir "terminal": se esse mesmo ponto fosse corrigido, o problema aconteceria de novo -- com outro motorista, em outro dia? Se a resposta for "sim, provavelmente", ainda é SINTOMA, não causa raiz -- pergunte mais um porquê. Só termine quando a resposta descrever algo sistêmico (um processo que falha sempre, uma decisão recorrente, uma falta de padrão) que, corrigido, previne a repetição.
- Fique dentro do que a distribuidora consegue mudar. Não termine em causa fora do alcance dela (clima, obra da prefeitura, torre de operadora).
- "terminal" sempre tem os três campos preenchidos: causaRaiz (uma frase objetiva, até 12 palavras), categoria (uma das 11 fixas) e acaoSugerida (uma ação prática e concreta, até 16 palavras, que a liderança consiga executar).
- Nunca invente causa sem uma opção do motorista sustentando ela.`;

export type ResultadoPasso = {
  proximoNo?: NoDecisao;
  terminal?: Terminal;
  custo: { entrada: number; saida: number };
};

/** Recusa e limite de tokens já contam a história certa sem quebrar a tela. */
function conferirParada(resposta: Anthropic.Message) {
  if (resposta.stop_reason === "refusal") {
    throw new Error("O modelo recusou este conteúdo. Tente descrever o problema de outro jeito.");
  }
  if (resposta.stop_reason === "max_tokens") {
    throw new Error("A resposta ficou grande demais e foi cortada. Tente de novo.");
  }
}

function textoDaResposta(resposta: Anthropic.Message): string {
  const texto = resposta.content.find((b) => b.type === "text")?.text;
  if (!texto) throw new Error("O modelo não devolveu nada.");
  return texto;
}

/**
 * Validação defensiva depois do parse -- mesmo com schema, vale conferir o
 * que realmente veio antes de mostrar na tela. `nivel` é escrito pelo código,
 * não pelo modelo: o app já sabe a profundidade real pela trilha, então não
 * precisa confiar em número que o modelo mandaria solto (é isso que garante
 * que "Porquê X de até 5" mostre o nível verdadeiro). O corte em 4 opções
 * vive aqui porque `maxItems` não é aceito no schema.
 */
function normalizarNo(no: NoDecisao | undefined, nivel: number): NoDecisao {
  if (!no || !Array.isArray(no.opcoes) || no.opcoes.length === 0 || !no.pergunta?.trim()) {
    throw new Error("O modelo não devolveu uma pergunta válida. Tente de novo.");
  }
  return {
    nivel,
    pergunta: no.pergunta,
    opcoes: no.opcoes
      .filter((o) => o?.id && o?.label?.trim())
      .slice(0, 4)
      .map((o) => ({ id: o.id, label: o.label })),
  };
}

/** A trilha em texto é o único contexto que a chamada precisa carregar. */
function montarTrilha(respostas: RespostaPorque[]): string {
  if (respostas.length === 0) return "(nenhum porquê respondido ainda)";
  return respostas
    .map(
      (r, i) =>
        `${i + 1}. ${r.pergunta} → ${r.opcaoLabel}${r.textoLivre ? ` (${r.textoLivre})` : ""}`,
    )
    .join("\n");
}

/**
 * O passo seguinte da análise: mais um "por quê", ou a causa raiz.
 *
 * É a ÚNICA porta de IA da ferramenta -- serve tanto para a primeira
 * pergunta (`respostas` vazio) quanto para cada toque depois dela, inclusive
 * quando o motorista escolhe "Outro" ou "Nenhuma dessas": esses dois só
 * chegam aqui como mais uma linha da trilha, sem caminho separado.
 */
export async function proximoPasso(dados: {
  problemaLabel: string;
  respostas: RespostaPorque[];
  /** Presente quando o motorista fugiu das opções oferecidas. */
  motivo?: "outro_texto_livre" | "nenhuma_dessas";
}): Promise<ResultadoPasso> {
  const cliente = new Anthropic();

  const jaRespondidos = dados.respostas.length;
  const { podeTerminar, podeContinuar } = regrasDoPasso(jaRespondidos);

  const instrucaoDecisao = !podeTerminar
    ? `Ainda é cedo para causa raiz (${jaRespondidos} de no mínimo ${PORQUES_MINIMOS} porquês respondidos) -- devolva OBRIGATORIAMENTE "proximoNo".`
    : !podeContinuar
      ? `O limite de ${PORQUES_MAXIMOS} porquês já foi atingido -- devolva OBRIGATORIAMENTE "terminal".`
      : `Devolva "terminal" (se já dá para nomear a causa raiz sistêmica com o que se sabe até aqui) ou "proximoNo" (mais um "por quê").`;

  const avisoDesvio =
    dados.motivo === "outro_texto_livre"
      ? "\nO motorista não achou a opção certa e descreveu com as próprias palavras -- a última linha da trilha traz o que ele digitou. Continue a partir DISSO."
      : dados.motivo === "nenhuma_dessas"
        ? "\nNenhuma das opções anteriores serviu para o motorista. Ofereça motivos claramente diferentes dos que já apareceram."
        : "";

  const fluxo = cliente.messages.stream({
    model: MODELO,
    max_tokens: 1500,
    system: `${REGRAS_COMUNS}\n\n${instrucaoDecisao}`,
    messages: [
      {
        role: "user",
        content: `Problema relatado pelo motorista: "${dados.problemaLabel}"

Trilha até agora:
${montarTrilha(dados.respostas)}${avisoDesvio}`,
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: construirEsquemaPasso(jaRespondidos) },
    },
  });

  const resposta = await fluxo.finalMessage();
  conferirParada(resposta);
  const analisado = JSON.parse(textoDaResposta(resposta)) as {
    proximoNo?: NoDecisao;
    terminal?: Terminal;
  };

  if (!analisado.terminal && !analisado.proximoNo) {
    throw new Error("O modelo não devolveu nem causa raiz nem próxima pergunta.");
  }

  return {
    // `terminal` ganha do `proximoNo` se por algum motivo vierem os dois:
    // com o piso já cumprido, encerrar é sempre uma saída legítima.
    proximoNo: analisado.terminal
      ? undefined
      : normalizarNo(analisado.proximoNo, jaRespondidos + 1),
    terminal: analisado.terminal,
    custo: {
      entrada: resposta.usage.input_tokens,
      saida: resposta.usage.output_tokens,
    },
  };
}

/** Traduz a falha da API para algo que a tela consiga mostrar. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Anthropic.AuthenticationError) {
    return "A chave da API não foi aceita. Confira a ANTHROPIC_API_KEY.";
  }
  if (erro instanceof Anthropic.RateLimitError) {
    return "Muitos pedidos em pouco tempo. Espere um instante e tente de novo.";
  }
  if (erro instanceof Anthropic.APIConnectionError) {
    return "Não consegui falar com a IA. Verifique a conexão e tente de novo.";
  }
  if (erro instanceof Anthropic.APIError) {
    return `A IA respondeu com erro (${erro.status}). Tente de novo em instantes.`;
  }

  return (erro as Error)?.message ?? "Falha inesperada ao analisar o problema.";
}

export { PORQUES_MAXIMOS, PORQUES_MINIMOS };
