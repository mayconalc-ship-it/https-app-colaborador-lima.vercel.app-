/**
 * QR CODE DE CONTINGÊNCIA -- as regras, num lugar só (18/09/2026).
 *
 * Pedido do dono: quando o pagamento por QR Code do sistema cai, o cliente
 * paga no QR de contingência (o PIX do CNPJ da empresa), e o motorista
 * registra o comprovante -- procura o mapa, acha o cliente e FOTOGRAFA o
 * comprovante. Foto obrigatória, quantas quiser.
 *
 * Separado do servidor de propósito: o formulário trava o botão com estas
 * funções e a ação do servidor confere com as MESMAS.
 */

export const MODULO_QR = "qr-contingencia" as const;

/** Os mesmos limites da migration 126. */
export const LIMITES_QR = {
  fotosMin: 1,
  /** Cada foto sai do celular já reduzida (~300 KB); 12 cabem folgadas num envio. */
  fotosMax: 12,
  /** Depois da redução no celular. Uma foto maior que isso não foi reduzida. */
  bytesPorFoto: 3 * 1024 * 1024,
  /** O envio inteiro: a Vercel recusa corpo acima de ~4,5 MB. */
  bytesPorEnvio: 4 * 1024 * 1024,
  valorMax: 1_000_000,
  observacaoMax: 300,
  buscaMin: 2,
} as const;

export const TIPOS_DE_FOTO = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Valor digitado ("1.234,56", "150", "150,5") -> número, ou null se vazio, NaN se torto. */
export function lerValor(v: unknown): number | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const limpo = t.replace(/[R$\s]/g, "");
  // Com vírgula, o ponto é milhar ("1.234,56"); sem vírgula, o ponto é decimal ("150.5").
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return NaN;
  return Number(normal);
}

export type DadosDoComprovante = {
  codPdv: string;
  valor: number | null;
  observacao: string;
  fotos: { tamanho: number; tipo: string }[];
};

/** O problema do comprovante, em português -- ou null se está tudo certo. */
export function validarComprovante(d: DadosDoComprovante): string | null {
  if (!d.codPdv.trim()) return "Escolha o cliente que está pagando.";
  if (d.fotos.length < LIMITES_QR.fotosMin) return "Tire a foto do comprovante — ela é obrigatória.";
  if (d.fotos.length > LIMITES_QR.fotosMax) return `No máximo ${LIMITES_QR.fotosMax} fotos por comprovante.`;
  for (const f of d.fotos) {
    if (f.tamanho <= 0) return "Uma das fotos veio vazia. Tire de novo.";
    if (f.tamanho > LIMITES_QR.bytesPorFoto) return "Uma das fotos está grande demais. Tire de novo.";
    if (f.tipo && !TIPOS_DE_FOTO.includes(f.tipo)) return "Envie só fotos (JPG, PNG ou WEBP).";
  }
  const total = d.fotos.reduce((s, f) => s + f.tamanho, 0);
  if (total > LIMITES_QR.bytesPorEnvio) {
    return "As fotos juntas passaram do limite de um envio. Mande em dois comprovantes ou tire menos fotos.";
  }
  if (d.valor !== null) {
    if (Number.isNaN(d.valor)) return "Valor inválido. Use números, por exemplo 150,00.";
    if (d.valor <= 0) return "O valor precisa ser maior que zero.";
    if (d.valor > LIMITES_QR.valorMax) return "Valor alto demais — confira o número.";
  }
  if (d.observacao.length > LIMITES_QR.observacaoMax) {
    return `A observação passa de ${LIMITES_QR.observacaoMax} caracteres.`;
  }
  return null;
}

/**
 * A HORA DO PAGAMENTO vinda do celular (modo sem internet): vale se for dos
 * últimos 7 dias e não do futuro (10 min de folga para relógio adiantado).
 * Fora disso, o servidor usa a hora do envio -- relógio errado no celular
 * não pode jogar um comprovante para outro mês.
 */
export const DIAS_MAXIMOS_NA_FILA = 7;

export function horaDoPagamento(informada: unknown, agora: Date = new Date()): Date {
  const t = new Date(String(informada ?? ""));
  if (Number.isNaN(t.getTime())) return agora;
  const diff = agora.getTime() - t.getTime();
  if (diff < -10 * 60_000 || diff > DIAS_MAXIMOS_NA_FILA * 86_400_000) return agora;
  return t;
}

/** Código de cliente digitado à mão: só dígitos, sem zeros à esquerda. */
export function codigoDigitado(v: string) {
  return v.replace(/\D/g, "").replace(/^0+/, "");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function ehEnvioId(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** Para a busca: sem acento, sem caixa. */
export function normalizarBusca(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** O cliente casa com a busca? Por código, nome, cidade ou bairro. */
export function clienteCasa(
  c: { codPdv: string; nome: string | null; cidade: string | null; bairro: string | null },
  termo: string,
) {
  const t = normalizarBusca(termo);
  if (!t) return true;
  const alvo = normalizarBusca([c.codPdv, c.nome ?? "", c.cidade ?? "", c.bairro ?? ""].join(" "));
  return t.split(/\s+/).every((parte) => alvo.includes(parte));
}

export type DadosDaConfig = {
  temQr: boolean;
  favorecido: string;
  cnpj: string;
  chavePix: string;
  instrucoes: string;
};

/** A configuração do QR: a imagem é obrigatória; o CNPJ, se vier, com 14 dígitos. */
export function validarConfigQr(d: DadosDaConfig): string | null {
  if (!d.temQr) return "Envie a imagem do QR Code — sem ela o motorista não tem o que mostrar ao cliente.";
  const cnpj = d.cnpj.replace(/\D/g, "");
  if (cnpj && cnpj.length !== 14) return "O CNPJ precisa ter 14 dígitos.";
  if (d.favorecido.length > 120) return "O nome do favorecido passa de 120 caracteres.";
  if (d.chavePix.length > 600) return "O código PIX passa de 600 caracteres.";
  if (d.instrucoes.length > 400) return "As instruções passam de 400 caracteres.";
  return null;
}

export function formatarReais(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "12345678000190" -> "12.345.678/0001-90". Outro tamanho volta como veio. */
export function formatarCnpj(cnpj: string | null) {
  const d = (cnpj ?? "").replace(/\D/g, "");
  if (d.length !== 14) return cnpj ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
