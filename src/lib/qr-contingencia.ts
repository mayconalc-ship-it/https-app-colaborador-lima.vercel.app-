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
  /** Notas fiscais por comprovante (migration 130). */
  notasMax: 20,
  /** A NF-e tem até 9 dígitos; 12 dá folga para numeração interna. */
  digitosDaNfMax: 12,
} as const;

/** O número da NF como é guardado: só dígitos, sem zeros à esquerda ("000123" -> "123"). */
export function numeroDaNf(digitado: string) {
  return digitado.replace(/\D/g, "").replace(/^0+/, "").slice(0, LIMITES_QR.digitosDaNfMax);
}

/** As NFs de um formulário -> a lista limpa, sem repetição, na ordem digitada. */
export function lerNotas(valores: unknown[]): string[] {
  const vistas = new Set<string>();
  for (const v of valores) {
    // Aceita também "123, 456" num campo só (colado do WhatsApp).
    for (const parte of String(v ?? "").split(/[\s,;/]+/)) {
      const n = numeroDaNf(parte);
      if (n) vistas.add(n);
    }
  }
  return [...vistas];
}

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
  /** As NFs, já lidas por lerNotas (até LIMITES_QR.notasMax). */
  notas?: string[];
  /**
   * NF obrigatória (padrão). Falso só para o comprovante guardado no
   * celular sem internet ANTES da regra valer (ver NF_OBRIGATORIA_DESDE).
   */
  exigirNf?: boolean;
};

/**
 * NF OBRIGATÓRIA (pedido do dono, 21/09/2026). Vale para pagamento feito a
 * partir daqui: o comprovante que já esperava sinal na fila do celular foi
 * feito sem o campo e não pode ficar travado lá.
 */
export const NF_OBRIGATORIA_DESDE = "2026-09-21T13:30:00Z";

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
  // OBRIGATÓRIO desde 18/09/2026 (pedido do dono): é o número que o
  // financeiro concilia contra o extrato.
  if (d.valor === null) return "Informe o valor pago.";
  if (Number.isNaN(d.valor)) return "Valor inválido. Use números, por exemplo 150,00.";
  if (d.valor <= 0) return "O valor precisa ser maior que zero.";
  if (d.valor > LIMITES_QR.valorMax) return "Valor alto demais — confira o número.";
  if (d.observacao.length > LIMITES_QR.observacaoMax) {
    return `A observação passa de ${LIMITES_QR.observacaoMax} caracteres.`;
  }
  const notas = d.notas ?? [];
  if (d.exigirNf !== false && notas.length === 0) return "Informe o número da NF.";
  if (notas.length > LIMITES_QR.notasMax) return `No máximo ${LIMITES_QR.notasMax} notas fiscais por comprovante.`;
  if (notas.some((n) => !/^[1-9]\d*$/.test(n) || n.length > LIMITES_QR.digitosDaNfMax)) {
    return "Número de NF inválido — use só os números da nota.";
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

/**
 * O CAMPO DE VALOR como no app do banco: só números, que entram pela
 * direita nos centavos. "15240" digitado -> R$ 152,40. Guarda os dígitos;
 * `valorDosDigitos` é o que vai para o servidor ("152,40").
 */
export function digitosDoValor(digitado: string) {
  return digitado.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9);
}

export function valorDosDigitos(digitos: string) {
  if (!digitos) return "";
  return (Number(digitos) / 100).toFixed(2).replace(".", ",");
}

export function mostrarDigitosEmReais(digitos: string) {
  return formatarReais(digitos ? Number(digitos) / 100 : 0);
}

export function formatarReais(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---- A CONCILIAÇÃO COM O EXTRATO (19/09/2026, migration 129) ----

/**
 * "desconsiderado" (22/09/2026, migration 133): o comprovante que não é PIX
 * da contingência -- boleto, duplicado, cliente errado. Sai da conta do
 * mapa sem ser apagado: fica no livro, riscado, com o motivo e quem marcou.
 */
export type SituacaoConferencia = "conferido" | "divergente" | "desconsiderado";

export const MOTIVOS_PARA_DESCONSIDERAR = [
  "Boleto (não é PIX)",
  "Comprovante duplicado",
  "Lançado no cliente errado",
  "Não é pagamento deste mapa",
] as const;

export const MOTIVOS_DE_DIVERGENCIA = [
  "Não caiu no extrato",
  "Valor diferente no extrato",
  "Pagador diferente do cliente",
  "Comprovante ilegível",
] as const;

export const CONFERENCIA_OBS_MAX = 200;

/**
 * A marcação da conciliação -- a MESMA regra na tela e no servidor.
 * Conferido vale em lote; divergente é um comprovante por vez, com o
 * valor que caiu no extrato (0 = não caiu) e o motivo; desconsiderado
 * exige o motivo.
 */
export function validarConferencia(d: {
  qtd: number;
  situacao: SituacaoConferencia | null;
  valorExtrato: number | null;
  motivo: string;
}): string | null {
  if (d.qtd === 0) return "Nenhum comprovante escolhido.";
  if (d.qtd > 500) return "No máximo 500 comprovantes de uma vez.";
  if (d.situacao === "desconsiderado") {
    if (!d.motivo.trim()) return "Diga por que o comprovante sai da conta (ex.: boleto).";
    if (d.motivo.length > CONFERENCIA_OBS_MAX) return `O motivo passa de ${CONFERENCIA_OBS_MAX} caracteres.`;
    return null;
  }
  if (d.situacao !== "divergente") return null;
  if (d.qtd !== 1) return "Divergência é um comprovante por vez.";
  if (d.valorExtrato === null) return "Informe o valor que caiu no extrato (0 se não caiu).";
  if (Number.isNaN(d.valorExtrato) || d.valorExtrato < 0) return "Valor do extrato inválido.";
  if (d.valorExtrato > LIMITES_QR.valorMax) return "Valor do extrato alto demais — confira.";
  if (!d.motivo.trim()) return "Diga o motivo da divergência.";
  if (d.motivo.length > CONFERENCIA_OBS_MAX) return `O motivo passa de ${CONFERENCIA_OBS_MAX} caracteres.`;
  return null;
}

/** "12345678000190" -> "12.345.678/0001-90". Outro tamanho volta como veio. */
export function formatarCnpj(cnpj: string | null) {
  const d = (cnpj ?? "").replace(/\D/g, "");
  if (d.length !== 14) return cnpj ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
