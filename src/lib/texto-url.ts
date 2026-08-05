/**
 * decodeURIComponent seguro para mensagens de erro/sucesso vindas da URL.
 *
 * O texto normal sempre chega bem-formado, porque toda ação do app o
 * codifica com encodeURIComponent antes de montar o link de redirecionamento.
 * Mas a URL também pode chegar de um favorito antigo, de um link colado
 * pela metade ou editado à mão -- nesses casos um "%" solto faz o
 * decodeURIComponent lançar URIError e derrubar a página inteira.
 *
 * Aqui, na pior hipótese, o texto aparece com o "%" cru em vez de
 * decodificado -- nunca quebra a tela.
 */
export function decodificar(valor: string | undefined | null) {
  if (!valor) return "";
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}
