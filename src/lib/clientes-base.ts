/**
 * A BASE DE CLIENTES -- só a regra de leitura, sem banco e sem rede.
 *
 * Pedido do dono (07/09/2026): "o telefone do PDV eu tenho dentro da base
 * de clientes (...) seria melhor linkar ela à busca dos PDVs, pois ela
 * estará completa e atualizada".
 *
 * A PLANILHA NÃO É NOSSA, e é isso que manda no desenho daqui. Ela vem do
 * sistema da revenda, tem dezenas de colunas e o cabeçalho muda de nome
 * entre exportações ("TELEFONE", "Fone", "Telefone 1"). Um parser que
 * exige a coluna na posição 7 quebra na primeira exportação diferente --
 * e quebra CALADO, importando telefone nenhum. Por isso as colunas são
 * achadas pelo NOME, com sinônimos, e o import diz quantos telefones
 * encontrou.
 */

export type ClienteDaBase = {
  codPdv: string;
  nome: string | null;
  telefone: string | null;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
};

/** Tira acento e caixa, para casar cabeçalho sem depender de como veio. */
export function chaveDoCabecalho(texto: string): string {
  return (texto ?? "")
    .normalize("NFD")
    // Escapado, e não o caractere combinante escrito à mão: um acento
    // solto dentro de uma classe de regex é invisível no editor e some no
    // primeiro salvamento que erre a codificação.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/*
  OS SINÔNIMOS, em ordem de preferência.

  A ordem importa em duas colunas. No código, "codigocliente" ganha de
  "cliente" -- há planilhas com as duas, e "cliente" costuma ser o NOME.
  No telefone, o celular ganha do fixo: quem atende WhatsApp é o celular, e
  mandar mensagem para o fixo da loja não chega em ninguém.
*/
const SINONIMOS: Record<keyof Omit<ClienteDaBase, "codPdv"> | "codPdv", string[]> = {
  codPdv: ["codigocliente", "codcliente", "codigodocliente", "codpdv", "codigopdv", "codigo", "cliente"],
  nome: ["razaosocial", "nomecliente", "nomefantasia", "nomedocliente", "cliente", "nome"],
  telefone: [
    "celular",
    "telefonecelular",
    "whatsapp",
    "telefone1",
    "telefone",
    "fone",
    "telefonecomercial",
    "contato",
  ],
  cidade: ["cidade", "municipio", "nomecidade"],
  bairro: ["bairro", "nomebairro"],
  endereco: ["endereco", "logradouro", "rua", "enderecocompleto"],
};

/**
 * Acha em que coluna está cada campo, pelo nome do cabeçalho.
 *
 * Só encontra o que existe: a planilha pode não ter bairro, e isso não é
 * erro -- é uma coluna a menos, não uma importação inválida.
 */
export function acharColunas(cabecalho: string[]): Partial<Record<keyof ClienteDaBase, number>> {
  const chaves = cabecalho.map(chaveDoCabecalho);
  const achado: Partial<Record<keyof ClienteDaBase, number>> = {};

  for (const [campo, nomes] of Object.entries(SINONIMOS) as [keyof ClienteDaBase, string[]][]) {
    for (const nome of nomes) {
      // Igual primeiro, depois "começa com": "TELEFONE 1" casa com
      // "telefone1" no exato, mas "TELEFONE RESIDENCIAL" só pelo prefixo.
      let i = chaves.indexOf(nome);
      if (i < 0) i = chaves.findIndex((c) => c.startsWith(nome));
      if (i >= 0 && !Object.values(achado).includes(i)) {
        achado[campo] = i;
        break;
      }
    }
  }
  return achado;
}

/**
 * O TELEFONE EM DÍGITOS, pronto para o link do WhatsApp.
 *
 * Devolve `null` em vez de um número torto, e a diferença é grande: um
 * telefone inválido abre uma conversa com um desconhecido, e quem manda
 * não descobre -- a mensagem some. Melhor não oferecer o botão.
 *
 * O que entra: 10 dígitos (fixo com DDD) ou 11 (celular com DDD). Sai com
 * o 55 na frente. Com o 55 já colado, aceita 12 ou 13. Fora disso, null.
 *
 * O NONO DÍGITO NÃO É INVENTADO. Um fixo de 10 dígitos continua com 10:
 * transformar "7734567890" em celular acertaria em algumas cidades e
 * criaria um número inexistente nas outras.
 */
export function normalizarTelefone(bruto: string | null | undefined): string | null {
  const digitos = (bruto ?? "").replace(/\D/g, "");
  if (!digitos) return null;

  const semDdi = digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)
    ? digitos.slice(2)
    : digitos;

  if (semDdi.length !== 10 && semDdi.length !== 11) return null;
  // DDD brasileiro vai de 11 a 99 -- um "00" na frente é lixo de coluna
  // formatada, não telefone.
  const ddd = Number(semDdi.slice(0, 2));
  if (!Number.isFinite(ddd) || ddd < 11 || ddd > 99) return null;
  // Celular com 11 dígitos começa com 9 depois do DDD; se não começa, a
  // coluna trouxe outra coisa (inscrição, código) com o tamanho parecido.
  if (semDdi.length === 11 && semDdi[2] !== "9") return null;

  return `55${semDdi}`;
}

const texto = (v: unknown): string | null => {
  const t = String(v ?? "").trim();
  return t && t !== "-" ? t : null;
};

/** O código, sem zeros à frente -- a mesma régua de pdv-particularidades. */
export function codigoDaBase(bruto: unknown): string | null {
  const cru = String(bruto ?? "").trim();
  if (!cru) return null;
  const digitos = cru.replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.replace(/^0+/, "") || "0";
}

/**
 * Uma linha da planilha vira um cliente -- ou nada.
 *
 * Sem código não existe cliente: é ele que liga a base ao mapa, à
 * particularidade e ao Rating. Linha sem código é rodapé, total ou
 * cabeçalho repetido no meio do arquivo.
 */
export function lerLinhaDeCliente(
  linha: unknown[],
  colunas: Partial<Record<keyof ClienteDaBase, number>>,
): ClienteDaBase | null {
  const em = (campo: keyof ClienteDaBase) => {
    const i = colunas[campo];
    return i === undefined ? null : texto(linha[i]);
  };

  const codPdv = codigoDaBase(colunas.codPdv === undefined ? null : linha[colunas.codPdv]);
  if (!codPdv) return null;

  return {
    codPdv,
    nome: em("nome"),
    telefone: normalizarTelefone(em("telefone")),
    cidade: em("cidade"),
    bairro: em("bairro"),
    endereco: em("endereco"),
  };
}

/**
 * QUE TIPO DE LINK DO DRIVE É ESTE?
 *
 * Três formas, porque são três endereços diferentes -- e quem cola não tem
 * por que saber disso:
 *
 *   `/file/d/ID`                          arquivo enviado ao Drive
 *   `docs.google.com/spreadsheets/d/ID`   planilha do Google (baixa por
 *                                         outra rota; a de arquivo devolve
 *                                         a página do editor)
 *   `/folders/ID`                         pasta
 *
 * Mora aqui, e não no arquivo de servidor, porque é só texto: link colado
 * errado é o defeito mais comum de todo import do app, e um teste custa
 * menos que descobrir pelo relato de quem tentou.
 */
export function idDoLinkDoDrive(link: string): {
  arquivo?: string;
  planilhaGoogle?: string;
  pasta?: string;
} {
  const limpo = (link ?? "").trim();
  if (!limpo) return {};

  // A planilha do Google vem primeiro: o id dela também casaria com os
  // padrões abaixo, e baixá-la pela rota de arquivo devolve HTML.
  const doSheets = limpo.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{15,})/);
  if (doSheets) return { planilhaGoogle: doSheets[1] };

  const daPasta = limpo.match(/\/folders\/([a-zA-Z0-9_-]{15,})/);
  if (daPasta) return { pasta: daPasta[1] };

  const doArquivo = limpo.match(/\/file\/d\/([a-zA-Z0-9_-]{15,})/);
  if (doArquivo) return { arquivo: doArquivo[1] };

  const porParametro = limpo.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (porParametro) return { arquivo: porParametro[1] };

  // Id cru colado sozinho -- acontece com quem já conhece o Drive.
  if (/^[a-zA-Z0-9_-]{15,}$/.test(limpo)) return { arquivo: limpo };

  return {};
}

/**
 * O link do WhatsApp para um cliente.
 *
 * COM o número quando ele existe -- e aí o WhatsApp abre a conversa certa
 * já com o texto, que era o problema do dono ("selecionando o WhatsApp Web
 * ele não copia a mensagem"). O `wa.me` só preserva o texto quando sabe
 * para quem vai; sem número, ele abre o seletor de contato e perde tudo.
 */
export function linkDoWhatsApp(telefone: string | null | undefined, texto: string): string {
  const numero = (telefone ?? "").replace(/\D/g, "");
  const base = numero ? `https://wa.me/${numero}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(texto)}`;
}
