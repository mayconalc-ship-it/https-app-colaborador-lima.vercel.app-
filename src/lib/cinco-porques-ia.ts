import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { CATEGORIAS } from "@/lib/cinco-porques-problemas";

/**
 * IA da ferramenta "5 Porquês".
 *
 * A regra que manda em tudo aqui é economia: o motorista faz vários toques
 * por análise, mas isso não pode virar uma chamada de IA por toque. A
 * primeira chamada (`gerarArvore`) devolve de uma vez uma arvorezinha de
 * decisão -- pergunta, opções, e para cada opção ou um próximo nível ou uma
 * causa raiz já pronta. O app percorre essa árvore sozinho, sem IA nenhuma,
 * enquanto o motorista tocar nas opções previstas. Uma segunda chamada
 * (`expandirRamo`) só acontece se ele fugir do previsto -- "Outro" com texto
 * livre, ou "Nenhuma dessas" além do que a árvore cobre.
 *
 * Sonnet, não Haiku: em teste real, o Haiku "achava" causa raiz cedo demais
 * de um jeito que nenhum ajuste de instrução segurava -- e mesmo travando um
 * piso estrutural, ele quase sempre parava exatamente nele, sem ir além
 * quando fazia sentido. Sonnet com `effort: "low"` foi o ponto de equilíbrio
 * testado: mais criterioso sobre o que é sintoma vs. causa raiz de verdade,
 * sem o custo/demora do `effort` mais alto (que chegou a estourar o
 * orçamento de tokens de raciocínio e não terminar).
 *
 * Streaming aqui não é opcional como era no Haiku: gerar a árvore com
 * Sonnet leva de 20 a 40 segundos em teste real -- longe do quase instantâneo
 * do Haiku. `.stream()` + `finalMessage()` evita bater no limite de uma
 * função serverless comum, mesmo já com `maxDuration` alto na rota.
 */

const MODELO = "claude-sonnet-5";

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

export type OpcaoNo = {
  id: string;
  label: string;
  /** Presente = esta opção já é a causa raiz, o fluxo termina aqui. */
  terminal?: Terminal;
  /** Presente (e `terminal` ausente) = mais um nível de "por quê". */
  proximo?: NoDecisao;
};

export type NoDecisao = {
  nivel: number;
  pergunta: string;
  /** 2 a 4 opções reais. "Outro" e "Nenhuma dessas" o cliente sempre
   *  desenha à parte -- nunca fazem parte desta lista. */
  opcoes: OpcaoNo[];
};

export type ArvoreDecisao = { raiz: NoDecisao };

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
};

const NIVEL_MAXIMO = 5;

/**
 * Piso de profundidade: antes deste nível, "terminal" nem existe como
 * campo possível no schema -- a árvore É OBRIGADA a continuar.
 *
 * Só a instrução não segura nenhum modelo testado -- Haiku parava sempre
 * no 2º porquê, e mesmo o Sonnet, mais criterioso, tende a parar assim que
 * o piso libera. Por isso o piso em si precisa estar no nível que já
 * costuma ser causa raiz de verdade, não só "o mínimo aceitável".
 *
 * 5 (a profundidade máxima) foi testado e descartado: forçar toda análise
 * a ir até o fim manda a árvore para o dobro de nós, e em teste real isso
 * estourou o orçamento de tokens de raciocínio do Sonnet em mais de uma
 * tentativa -- a chamada simplesmente falhava. 4 é o piso mais alto que se
 * mostrou confiável nos testes.
 */
const NIVEL_MINIMO_TERMINAL = 4;

/** O que cada nível pode/deve devolver: terminar, continuar, ou os dois. */
function regrasDoNivel(nivel: number) {
  return {
    podeTerminar: nivel >= NIVEL_MINIMO_TERMINAL,
    podeContinuar: nivel < NIVEL_MAXIMO,
  };
}

/**
 * Monta o schema de um nó sem `$ref` recursivo -- a API da Anthropic recusa
 * schema que referencia a si mesmo ("circular reference"). Em vez disso,
 * cada profundidade é um objeto literal distinto, gerado por esta função:
 * o JSON final tem os níveis escritos por extenso, não uma referência
 * circular.
 *
 * Cada opção só ganha o campo "terminal" se o nível já permitir terminar,
 * e só ganha "proximo" se ainda houver nível seguinte -- e um dos dois
 * vira OBRIGATÓRIO exatamente nas pontas (abaixo do piso, "proximo" é
 * obrigatório; no nível máximo, "terminal" é obrigatório). É isso que
 * garante profundidade mínima e máxima de verdade, não só por instrução.
 *
 * Também não usa `minItems`/`maxItems` em array -- a API rejeitou os dois em
 * teste (só aceita 0/1 em minItems, maxItems não é suportado nenhum valor).
 * O "2 a 4 opções" e o restante das regras ficam só nas instruções.
 */
function construirEsquemaNo(nivel: number): Record<string, unknown> {
  const { podeTerminar, podeContinuar } = regrasDoNivel(nivel);

  const opcaoProperties: Record<string, unknown> = {
    id: { type: "string" },
    label: { type: "string" },
  };
  const opcaoRequired = ["id", "label"];

  if (podeTerminar) opcaoProperties.terminal = ESQUEMA_TERMINAL;
  if (podeContinuar) opcaoProperties.proximo = construirEsquemaNo(nivel + 1);

  if (!podeTerminar) opcaoRequired.push("proximo");
  else if (!podeContinuar) opcaoRequired.push("terminal");

  return {
    type: "object",
    properties: {
      nivel: { type: "integer" },
      pergunta: { type: "string" },
      opcoes: {
        type: "array",
        items: {
          type: "object",
          properties: opcaoProperties,
          required: opcaoRequired,
          additionalProperties: false,
        },
      },
    },
    required: ["nivel", "pergunta", "opcoes"],
    additionalProperties: false,
  };
}

const ESQUEMA_ARVORE = {
  type: "object",
  properties: { raiz: construirEsquemaNo(1) },
  required: ["raiz"],
  additionalProperties: false,
} as const;

const REGRAS_COMUNS = `Você ajuda um motorista de distribuidora de bebidas a investigar um problema da rota pela metodologia dos 5 Porquês, logo depois que ele termina a entrega.

O motorista está no celular, no fim do turno. Ele NÃO vai digitar textos -- só toca em botões. Por isso:
- Cada pergunta é curta (até 12 palavras).
- Cada opção é uma frase curta (até 6 palavras), o suficiente para reconhecer, não para explicar.
- 2 a 4 opções por pergunta, nunca mais.
- As opções cobrem os motivos mais prováveis PARA QUEM TRABALHA NA OPERAÇÃO (entrega, rota, veículo, cliente, sistema) -- nada genérico ou administrativo.
- Não repita a mesma pergunta nem opções muito parecidas entre si.
- TESTE DE CAUSA RAIZ, antes de decidir "terminal": se esse mesmo ponto fosse corrigido, o problema aconteceria de novo -- com outro motorista, em outro dia? Se a resposta for "sim, provavelmente", ainda é SINTOMA, não causa raiz -- continue perguntando por quê. Só termine quando a resposta descrever algo sistêmico (um processo que falha sempre, uma decisão recorrente, uma falta de padrão) que, corrigido, previne a repetição.
- Não termine só porque já pode -- o nível mínimo permitido é um piso, não uma meta. Se ainda for sintoma nesse nível, continue mesmo que isso signifique ir até o nível 5.
- "terminal" sempre tem os três campos preenchidos: causaRaiz (uma frase objetiva, até 12 palavras), categoria (uma das 11 fixas) e acaoSugerida (uma ação prática e concreta, até 16 palavras, que a liderança consiga executar).
- Nunca invente causa sem uma opção do motorista sustentando ela.`;

const INSTRUCOES_ARVORE = `${REGRAS_COMUNS}

Você recebe o problema que o motorista relatou e devolve a árvore de decisão inteira de uma vez: a primeira pergunta, as opções dela, e para cada opção ou mais um nível (com pergunta e opções de novo) ou já a causa raiz. Profundidade máxima: 5 níveis.`;

export type ResultadoIA = { custo: { entrada: number; saida: number } };

export type ResultadoArvore = ResultadoIA & { arvore: ArvoreDecisao };

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
 * Validação defensiva depois do parse -- o "porta única" do quiz-ia.ts
 * adaptado aqui: mesmo com schema, vale conferir o que realmente veio antes
 * de gravar. Nível 5 nunca pode continuar (`proximo`), só terminar
 * (`terminal`); toda lista de opções é limitada a 4 mesmo se o modelo
 * mandar mais, já que o array não tem `maxItems` no schema.
 *
 * `nivelEsperado` SUBSTITUI o "nivel" que o modelo escreveu: o campo é só
 * um inteiro solto no schema (sem como travar no valor certo), então o
 * modelo pode errar a numeração sem quebrar a validação. Como o código já
 * sabe a profundidade real pela própria recursão, não precisa confiar no
 * que veio -- isso também garante que "Porquê X de até 5" na tela mostre o
 * nível verdadeiro.
 */
function normalizarNo(
  no: NoDecisao,
  nivelEsperado: number,
  nivelMaximo = NIVEL_MAXIMO,
): NoDecisao {
  if (!no || !Array.isArray(no.opcoes) || no.opcoes.length === 0) {
    throw new Error("O modelo devolveu uma árvore sem opções.");
  }

  const opcoes = no.opcoes.slice(0, 4).map((opcao): OpcaoNo => {
    if (nivelEsperado >= nivelMaximo || !opcao.proximo) {
      if (!opcao.terminal) {
        throw new Error("O modelo devolveu uma opção sem causa raiz nem próximo nível.");
      }
      return { id: opcao.id, label: opcao.label, terminal: opcao.terminal };
    }
    return {
      id: opcao.id,
      label: opcao.label,
      proximo: normalizarNo(opcao.proximo, nivelEsperado + 1, nivelMaximo),
    };
  });

  return { nivel: nivelEsperado, pergunta: no.pergunta, opcoes };
}

/**
 * Gera a árvore inteira -- 1 chamada, logo após o motorista escolher (ou
 * digitar) o problema.
 */
export async function gerarArvore(dados: {
  problemaLabel: string;
}): Promise<ResultadoArvore> {
  const cliente = new Anthropic();

  const fluxo = cliente.messages.stream({
    model: MODELO,
    max_tokens: 10000,
    system: INSTRUCOES_ARVORE,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: ESQUEMA_ARVORE },
    },
    messages: [
      {
        role: "user",
        content: `Problema relatado pelo motorista: "${dados.problemaLabel}"`,
      },
    ],
  });

  const resposta = await fluxo.finalMessage();
  conferirParada(resposta);
  const analisado = JSON.parse(textoDaResposta(resposta)) as ArvoreDecisao;

  return {
    arvore: { raiz: normalizarNo(analisado.raiz, 1) },
    custo: {
      entrada: resposta.usage.input_tokens,
      saida: resposta.usage.output_tokens,
    },
  };
}

export type ResultadoExpansao = ResultadoIA & {
  proximoNo?: NoDecisao;
  terminal?: Terminal;
};

/**
 * Chamada de fallback -- só quando o motorista foge da árvore precomputada:
 * escolheu "Outro" e digitou um texto curto, ou tocou em "Nenhuma dessas"
 * além do que a árvore já cobria.
 */
export async function expandirRamo(dados: {
  problemaLabel: string;
  respostas: RespostaPorque[];
  nivelAtual: number;
  motivo: "outro_texto_livre" | "nenhuma_dessas";
  textoLivre?: string;
}): Promise<ResultadoExpansao> {
  const cliente = new Anthropic();

  const nivelProximo = dados.nivelAtual + 1;
  const { podeTerminar, podeContinuar } = regrasDoNivel(nivelProximo);

  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  if (podeTerminar) properties.terminal = ESQUEMA_TERMINAL;
  if (podeContinuar) properties.proximoNo = construirEsquemaNo(nivelProximo);
  if (!podeTerminar) required.push("proximoNo");
  else if (!podeContinuar) required.push("terminal");

  const esquemaExpansao = {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };

  const trilha = dados.respostas
    .map((r) => `${r.nivel}. ${r.pergunta} → ${r.opcaoLabel}${r.textoLivre ? ` (${r.textoLivre})` : ""}`)
    .join("\n");

  const pedido =
    dados.motivo === "outro_texto_livre"
      ? `O motorista não achou a opção certa e descreveu com as próprias palavras: "${dados.textoLivre}".`
      : `Nenhuma das opções do nível ${dados.nivelAtual} serviu para o motorista.`;

  const instrucaoDecisao = !podeTerminar
    ? `Ainda é cedo para causa raiz (só chegamos ao porquê ${dados.nivelAtual}) -- devolva OBRIGATORIAMENTE "proximoNo", com a próxima pergunta (nível ${nivelProximo}).`
    : !podeContinuar
      ? `O limite de ${NIVEL_MAXIMO} níveis já foi atingido -- devolva OBRIGATORIAMENTE "terminal".`
      : `Devolva "terminal" (se já der para identificar a causa raiz com o que se sabe até aqui) ou "proximoNo" (mais um "por quê", nível ${nivelProximo}).`;

  const instrucoesExpansao = `${REGRAS_COMUNS}

Você já vinha conduzindo esta análise e o motorista saiu do caminho previsto. ${instrucaoDecisao}`;

  const fluxo = cliente.messages.stream({
    model: MODELO,
    max_tokens: 4000,
    system: instrucoesExpansao,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: esquemaExpansao },
    },
    messages: [
      {
        role: "user",
        content: `Problema original: "${dados.problemaLabel}"

Trilha até agora:
${trilha || "(nenhuma resposta ainda)"}

${pedido}`,
      },
    ],
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
    proximoNo: analisado.proximoNo
      ? normalizarNo(analisado.proximoNo, nivelProximo, NIVEL_MAXIMO)
      : undefined,
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
