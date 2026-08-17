import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";

/**
 * Geração das perguntas a partir do próprio padrão.
 *
 * A regra que manda em tudo aqui é uma só: a fonte é o arquivo do padrão, e
 * nada além dele. O modelo não completa lacuna com o que "costuma ser",
 * porque um procedimento inventado que soa plausível é pior que pergunta
 * nenhuma -- ele seria decorado como se fosse a norma da casa.
 *
 * Por isso cada questão é obrigada a devolver o TRECHO do padrão que a
 * sustenta. É o que transforma a revisão da liderança em conferência (o
 * trecho bate com a resposta?) em vez de leitura de fé.
 */

/** Sem chave configurada o recurso fica desligado, sem quebrar nada. */
export function iaConfigurada() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Teto do texto enviado ao modelo.
 *
 * Um padrão de 200 mil caracteres dá cerca de 50 mil tokens -- alguns
 * centavos por geração. O corte existe para o custo não depender do
 * tamanho do arquivo que alguém subiu sem olhar.
 */
const MAX_CARACTERES = 200_000;

/** O PDF vai inteiro para a API, e a requisição toda tem limite de 32 MB. */
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const MODELO = "claude-opus-5";

export type FonteDoPadrao =
  | { tipo: "texto"; texto: string; truncado: boolean }
  | { tipo: "pdf"; base64: string };

export class PadraoIlegivelError extends Error {}

/**
 * Lê o arquivo do padrão e devolve algo que o modelo consiga ler.
 *
 * DOCX vira texto puro (é o formato de todos os padrões de hoje). PDF vai
 * inteiro, porque o modelo lê PDF nativamente e converter aqui perderia
 * tabela e ordem de leitura. O resto -- planilha, apresentação, vídeo --
 * não tem caminho honesto: a tela manda cadastrar à mão.
 */
export async function lerPadrao(
  arquivoUrl: string,
  tipo: string,
): Promise<FonteDoPadrao> {
  const extensao = (tipo || "").toLowerCase();

  const resposta = await fetch(arquivoUrl, { cache: "no-store" });
  if (!resposta.ok) {
    throw new PadraoIlegivelError(
      `Não consegui baixar o arquivo do padrão (${resposta.status}).`,
    );
  }

  const bytes = Buffer.from(await resposta.arrayBuffer());

  if (extensao === "docx" || extensao === "doc") {
    const { value } = await mammoth.extractRawText({ buffer: bytes });
    const texto = value.replace(/\n{3,}/g, "\n\n").trim();

    if (texto.length < 200) {
      throw new PadraoIlegivelError(
        "O arquivo abriu, mas quase não tem texto — pode ser um documento só de imagens. Cadastre as perguntas à mão.",
      );
    }

    return {
      tipo: "texto",
      texto: texto.slice(0, MAX_CARACTERES),
      truncado: texto.length > MAX_CARACTERES,
    };
  }

  if (extensao === "pdf") {
    if (bytes.byteLength > MAX_PDF_BYTES) {
      throw new PadraoIlegivelError(
        "Este PDF é grande demais para enviar de uma vez. Cadastre as perguntas à mão ou divida o arquivo.",
      );
    }
    return { tipo: "pdf", base64: bytes.toString("base64") };
  }

  throw new PadraoIlegivelError(
    `Não sei ler arquivo ${extensao.toUpperCase()} — a geração automática funciona com DOCX e PDF. Use "Nova pergunta" ou a importação.`,
  );
}

export type QuestaoGerada = {
  pergunta: string;
  tipo: string;
  dificuldade: string;
  alternativas: string[];
  correta: number;
  explicacao: string;
  /** O pedaço do padrão que sustenta a resposta. É o que a liderança confere. */
  trecho: string;
};

/**
 * O formato exato da resposta.
 *
 * Vai como JSON Schema na própria requisição, então o modelo não "tenta"
 * devolver JSON válido -- ele não consegue devolver outra coisa. Isso
 * elimina de uma vez a classe de erro mais chata desse tipo de integração:
 * a resposta que vem quase certa, com uma vírgula a mais.
 */
const ESQUEMA = {
  type: "object",
  properties: {
    questoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pergunta: { type: "string" },
          tipo: {
            type: "string",
            enum: ["multipla", "vf", "situacao", "procedimento"],
          },
          dificuldade: {
            type: "string",
            enum: ["facil", "media", "dificil"],
          },
          alternativas: { type: "array", items: { type: "string" } },
          correta: { type: "integer" },
          explicacao: { type: "string" },
          trecho: { type: "string" },
        },
        required: [
          "pergunta",
          "tipo",
          "dificuldade",
          "alternativas",
          "correta",
          "explicacao",
          "trecho",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questoes"],
  additionalProperties: false,
} as const;

const INSTRUCOES = `Você prepara perguntas de treinamento para os colaboradores de uma distribuidora de bebidas, a partir do padrão operacional que recebe.

A REGRA QUE VALE ACIMA DE TODAS AS OUTRAS
O padrão que você recebeu é a única fonte. Não use conhecimento geral sobre logística, armazém ou distribuição, nem o que "normalmente se faz" no setor. Se o padrão não diz, a pergunta não existe. É melhor devolver menos perguntas do que a quantidade pedida do que inventar uma. Um procedimento inventado seria decorado pela equipe como se fosse a norma da empresa.

Por isso cada questão traz o campo "trecho": a passagem do padrão, copiada literalmente, que prova a resposta. Se você não consegue copiar um trecho que sustente a resposta, não faça a pergunta.

COMO ESCREVER AS PERGUNTAS
- Pergunte sobre o que muda o trabalho no dia a dia: o que conferir, em que ordem, qual o limite, o que fazer quando dá errado. Não pergunte sobre número de capítulo, data de revisão ou quem assinou o documento.
- Escreva como se fala na operação. Frases curtas, sem juridiquês.
- Uma única resposta certa, sem discussão. Nada de "a mais correta".
- Os distratores precisam ser plausíveis para quem não estudou: erros que alguém realmente cometeria. Nada de alternativa absurda ou engraçada, que se elimina sem saber a matéria.
- Não repita a mesma pergunta com outras palavras.
- Varie a posição da resposta certa entre as questões.
- A explicação tem uma ou duas frases e diz POR QUE, com base no padrão. Ela é lida na hora do erro, e é o que faz a pessoa aprender.

TIPOS
- multipla: quatro alternativas.
- vf: uma afirmação e exatamente duas alternativas, "Verdadeiro" e "Falso".
- situacao: descreve um caso do turno e pergunta o que fazer.
- procedimento: qual é o passo certo, ou a ordem certa.

Misture os tipos e as dificuldades. "correta" é a posição da resposta certa dentro de "alternativas", começando em 0.`;

export type ResultadoGeracao = {
  questoes: QuestaoGerada[];
  custo: { entrada: number; saida: number };
};

/**
 * Pede as perguntas ao modelo.
 *
 * Vai em streaming porque a resposta pode demorar: dez questões com
 * raciocínio passam bem de um minuto, e uma requisição comum morreria no
 * tempo limite da hospedagem antes de terminar.
 */
export async function gerarQuestoes(dados: {
  fonte: FonteDoPadrao;
  quantidade: number;
  padrao: string;
  pilar: string | null;
  atividade: string | null;
}): Promise<ResultadoGeracao> {
  const cliente = new Anthropic();

  const contexto = [
    `Padrão: ${dados.padrao}`,
    dados.pilar ? `Pilar: ${dados.pilar}` : null,
    dados.atividade ? `Atividade em foco: ${dados.atividade}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const pedido = `${contexto}

Gere ${dados.quantidade} perguntas${
    dados.atividade
      ? `, priorizando o que o padrão diz sobre "${dados.atividade}"`
      : ""
  }.`;

  const conteudo: Anthropic.ContentBlockParam[] =
    dados.fonte.tipo === "pdf"
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: dados.fonte.base64,
            },
          },
          { type: "text", text: pedido },
        ]
      : [
          {
            type: "text",
            text: `<padrao>\n${dados.fonte.texto}\n</padrao>`,
          },
          { type: "text", text: pedido },
        ];

  const fluxo = cliente.messages.stream({
    model: MODELO,
    max_tokens: 16000,
    system: INSTRUCOES,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: ESQUEMA },
    },
    messages: [{ role: "user", content: conteudo }],
  });

  const resposta = await fluxo.finalMessage();

  // Os classificadores de segurança podem recusar um pedido. É improvável
  // com padrão operacional, mas ler content[0] sem conferir quebraria a
  // tela em vez de explicar o que houve.
  if (resposta.stop_reason === "refusal") {
    throw new Error(
      "O modelo recusou este conteúdo. Cadastre as perguntas à mão.",
    );
  }

  if (resposta.stop_reason === "max_tokens") {
    throw new Error(
      "A resposta ficou grande demais e foi cortada. Peça menos perguntas de uma vez.",
    );
  }

  const texto = resposta.content.find((b) => b.type === "text")?.text;
  if (!texto) throw new Error("O modelo não devolveu nada.");

  const analisado = JSON.parse(texto) as { questoes: QuestaoGerada[] };

  return {
    questoes: analisado.questoes ?? [],
    custo: {
      entrada: resposta.usage.input_tokens,
      saida: resposta.usage.output_tokens,
    },
  };
}

/** Traduz a falha da API para algo que o Admin consiga agir em cima. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof PadraoIlegivelError) return erro.message;

  if (erro instanceof Anthropic.AuthenticationError) {
    return "A chave da API não foi aceita. Confira a ANTHROPIC_API_KEY.";
  }
  if (erro instanceof Anthropic.RateLimitError) {
    return "Muitos pedidos em pouco tempo. Espere um minuto e tente de novo.";
  }
  if (erro instanceof Anthropic.APIConnectionError) {
    return "Não consegui falar com a API. Verifique a conexão e tente de novo.";
  }
  if (erro instanceof Anthropic.APIError) {
    return `A API respondeu com erro (${erro.status}). Tente de novo em instantes.`;
  }

  return (erro as Error)?.message ?? "Falha inesperada ao gerar as perguntas.";
}

export { MODELO };
