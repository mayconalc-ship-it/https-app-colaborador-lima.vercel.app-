/**
 * A URL DE VOLTA DE UMA AÇÃO DE SERVIDOR.
 *
 * Toda action do Modo Liderança termina em `redirect(destino + "?sucesso=...")`,
 * e essa concatenação à mão erra em dois casos que já apareceram na prática:
 *
 *   1. O destino JÁ TEM query. Em 07/09/2026 o painel de anomalias montava
 *      `${voltarPara}&erro=...` com "&" fixo: quando não havia gaveta
 *      aberta, o endereço virava "/gestao/anomalias&erro=..." e o erro
 *      simplesmente não aparecia.
 *
 *   2. O destino TEM ÂNCORA. A tela de Fontes de Dados volta para
 *      "?aberta=rv#fonte-rv" -- o `?sucesso=` colado no fim entraria
 *      DENTRO do fragmento, e o navegador o trataria como parte do nome da
 *      âncora em vez de parâmetro.
 *
 * Um lugar só, porque os dois erros são silenciosos: a tela não quebra, só
 * deixa de dizer o que aconteceu.
 */
export function voltarCom(
  destino: string,
  chave: "erro" | "sucesso" | string,
  mensagem: string,
): string {
  const corte = destino.indexOf("#");
  const ancora = corte >= 0 ? destino.slice(corte) : "";
  const base = corte >= 0 ? destino.slice(0, corte) : destino;
  const separador = base.includes("?") ? "&" : "?";
  return `${base}${separador}${chave}=${encodeURIComponent(mensagem)}${ancora}`;
}
