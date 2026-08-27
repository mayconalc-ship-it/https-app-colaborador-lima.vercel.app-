import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/**
 * Leitura automática do horímetro por foto, pedido do dono (27/08/2026):
 * o operador tira a foto, o app já sugere o número, e ele só confere antes
 * de finalizar -- sem digitar o mostrador na mão toda vez.
 *
 * Haiku, mesmo modelo já usado no 5 Porquês (lib/cinco-porques-ia.ts):
 * ler um número de 4-6 dígitos num mostrador não pede um modelo caro, e o
 * app faz isso a cada abertura/fechamento de operação e troca de gás --
 * várias vezes por turno, por máquina.
 *
 * `output_config.format: json_schema` obriga a resposta a already vir no
 * formato certo -- sem isso, teria que caçar o número dentro de um texto
 * livre tipo "O horímetro mostra 1234.5 horas.".
 */
const MODELO = "claude-haiku-4-5";

/** Sem chave configurada o recurso fica desligado, sem quebrar o
 *  formulário -- o campo simplesmente continua manual. */
export function ocrHorimetroConfigurado() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const ESQUEMA_LEITURA = {
  type: "object",
  properties: {
    legivel: { type: "boolean" },
    valor: { type: ["number", "null"] },
  },
  required: ["legivel", "valor"],
  additionalProperties: false,
} as const;

export type LeituraHorimetro = {
  valor: number | null;
  legivel: boolean;
  custo: { entrada: number; saida: number };
};

export type MediaTypeAceito = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const MEDIA_TYPES_ACEITOS: readonly string[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export function ehMediaTypeAceito(v: string): v is MediaTypeAceito {
  return MEDIA_TYPES_ACEITOS.includes(v);
}

/**
 * `imagem` é o MESMO buffer já comprimido que vai pro Storage (ver
 * comprimirParaWebp em produtividade-armazem-server.ts) -- não faz sentido
 * mandar pra IA um arquivo maior do que o que fica guardado. `mediaType`
 * normalmente é "image/webp"; só vem diferente se a compressão falhou e o
 * arquivo original foi mantido como veio.
 */
export async function lerHorimetroNaFoto(
  imagem: Buffer,
  mediaType: MediaTypeAceito,
): Promise<LeituraHorimetro> {
  const cliente = new Anthropic();

  const resposta = await cliente.messages.create({
    model: MODELO,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imagem.toString("base64") },
          },
          {
            type: "text",
            text: 'Esta é a foto do mostrador (horímetro) de uma empilhadeira. Leia o número exibido no display -- um contador de horas, geralmente com uma casa decimal. Se conseguir ler o número com confiança, devolva legivel=true e o valor. Se a foto estiver borrada, cortada, sem o mostrador visível, com reflexo forte, ou o número estiver ambíguo, devolva legivel=false e valor=null. Nunca "chute" um número que não esteja claramente visível.',
          },
        ],
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: ESQUEMA_LEITURA },
    },
  });

  const custo = { entrada: resposta.usage.input_tokens, saida: resposta.usage.output_tokens };
  const texto = resposta.content.find((b) => b.type === "text")?.text;
  if (!texto) return { valor: null, legivel: false, custo };

  try {
    const analisado = JSON.parse(texto) as { legivel?: boolean; valor?: number | null };
    const valorValido =
      typeof analisado.valor === "number" && Number.isFinite(analisado.valor) && analisado.valor >= 0
        ? Math.round(analisado.valor * 10) / 10
        : null;
    return { valor: valorValido, legivel: Boolean(analisado.legivel) && valorValido !== null, custo };
  } catch {
    return { valor: null, legivel: false, custo };
  }
}
