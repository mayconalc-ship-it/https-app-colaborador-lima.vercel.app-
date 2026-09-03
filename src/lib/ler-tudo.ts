import "server-only";

/**
 * LÊ TODAS AS LINHAS de uma consulta, e não só as primeiras mil.
 *
 * O PostgREST devolve no máximo 1.000 linhas por requisição. Ele não
 * avisa: não há erro, não há flag, a lista simplesmente chega menor do
 * que é. Quem soma essa lista soma errado e não tem como saber.
 *
 * Medido em 03/09/2026: `ag_contagens` já tinha 1.836 linhas e
 * `notificacoes`, 1.274. O Histórico do Ativo de Giro lia o período
 * inteiro sem limite -- ou seja, já estava perdendo linhas em silêncio
 * num período largo, e a lista de "quem contou nos últimos 180 dias"
 * também.
 *
 * Esta função pagina com `range` até a página vir incompleta. O custo é
 * uma requisição a cada mil linhas; o benefício é o número certo.
 *
 * QUANDO USAR: consulta cujo resultado CRESCE com o tempo e cujo total
 * importa (somas, contagens, listas completas).
 *
 * QUANDO NÃO USAR: tela que mostra "os últimos N" -- ali o certo é
 * `.limit(N)` explícito, que diz na própria consulta o que a tela
 * promete. Paginar tudo para depois cortar traz o banco inteiro para
 * jogar fora.
 *
 * O `montar` recebe o intervalo e devolve a consulta já com `.range()`
 * aplicado -- é assim porque o construtor do supabase-js não é
 * reutilizável depois de executado.
 */
const TAMANHO_DA_PAGINA = 1000;

/** Trava de segurança: 50 páginas = 50 mil linhas. Passar disso é sinal
 *  de que a consulta precisa de filtro, não de mais páginas -- e um laço
 *  infinito num Server Component derruba a tela. */
const MAXIMO_DE_PAGINAS = 50;

export async function lerTudo<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const linhas: T[] = [];

  for (let pagina = 0; pagina < MAXIMO_DE_PAGINAS; pagina++) {
    const de = pagina * TAMANHO_DA_PAGINA;
    const { data, error } = await montar(de, de + TAMANHO_DA_PAGINA - 1);

    // Erro no meio devolve o que já veio em vez de estourar a tela: meia
    // lista com um número menor é ruim, tela em branco é pior. Quem
    // chama continua vendo o app funcionar.
    if (error || !data) break;

    linhas.push(...data);
    if (data.length < TAMANHO_DA_PAGINA) break;
  }

  return linhas;
}
