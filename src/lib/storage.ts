/**
 * Regras do bucket "conteudo".
 *
 * CACHE
 *
 * Todo caminho gravado aqui carrega carimbo de tempo -- `${Date.now()}` no
 * nome, sem excecao: comunicado, escala, ranking, sonho, padrao, evidencia
 * de 5S e logo de revenda. Trocar o arquivo nunca sobrescreve: gera um
 * caminho novo, e a linha do banco passa a apontar para ele.
 *
 * Ou seja, um caminho e IMUTAVEL. O arquivo que esta la hoje sera igual
 * daqui a um ano ou nao existira mais. Isso e exatamente a condicao que
 * permite mandar o navegador guardar para sempre.
 *
 * O padrao do Supabase quando nao se pede nada e `no-cache`, que obriga o
 * navegador a rebaixar a imagem inteira A CADA abertura de tela. Medido em
 * 21/08/2026: a capa de um comunicado tem 1,5 MB e era rebaixada toda vez
 * que alguem abria o Jornal. Com 66 pessoas ja pesava; com 188 estoura o
 * limite de trafego do plano gratuito em cerca de duas semanas.
 *
 * `immutable` e o que faz diferenca no celular: sem ele o navegador ainda
 * manda uma requisicao de revalidacao a cada visita (barata, mas e uma ida
 * a rede antes da foto aparecer -- no 4G da rota isso se sente).
 */
export const CACHE_IMUTAVEL = "public, max-age=31536000, immutable";

/**
 * O mesmo valor no formato que o `upload()` do Supabase espera: ele monta
 * o cabecalho sozinho e quer so o numero de segundos, em texto.
 */
export const SEGUNDOS_DE_CACHE = "31536000";
