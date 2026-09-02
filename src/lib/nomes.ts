/**
 * Nome de pessoa do jeito que se fala, não do jeito que o RH cadastra.
 *
 * O cadastro vem em CAIXA ALTA e completo -- "MAYCON ANTONIO ALCANFOR
 * ALVES". Numa lista de quem curtiu uma matéria isso ocupa a linha
 * inteira, grita, e ainda por cima não é como ninguém chama ninguém no
 * armazém.
 *
 * PRIMEIRO NOME + ÚLTIMO SOBRENOME, e não só o primeiro nome: são ~160
 * pessoas, com três Lucas e dois José. "Lucas" sozinho não diz qual.
 */

/** Partículas que não são sobrenome: entram no meio, nunca no fim. */
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e", "di", "du", "del", "van", "von", "la", "e."]);

function capitalizar(palavra: string): string {
  if (palavra.length === 0) return palavra;
  const minusculo = palavra.toLocaleLowerCase("pt-BR");
  // Partícula fica minúscula mesmo no meio: "Maria da Silva", não
  // "Maria Da Silva".
  if (PARTICULAS.has(minusculo)) return minusculo;
  return minusculo.charAt(0).toLocaleUpperCase("pt-BR") + minusculo.slice(1);
}

export function nomeCurto(completo: string | null | undefined): string {
  const partes = String(completo ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (partes.length === 0) return "";
  if (partes.length === 1) return capitalizar(partes[0]);

  const primeiro = partes[0];

  // O último pedaço que NÃO é partícula. Um cadastro terminado em "DA"
  // (acontece: nome cortado no meio) devolveria "Maria da", que parece
  // erro de sistema.
  let ultimo = "";
  for (let i = partes.length - 1; i >= 1; i--) {
    if (!PARTICULAS.has(partes[i].toLocaleLowerCase("pt-BR"))) {
      ultimo = partes[i];
      break;
    }
  }

  if (!ultimo) return capitalizar(primeiro);
  return `${capitalizar(primeiro)} ${capitalizar(ultimo)}`;
}

/**
 * "Maycon Alves, Jorge Matos e mais 5" -- a legenda de quem curtiu.
 *
 * Dois nomes e uma contagem, nunca a lista inteira: numa matéria com 40
 * curtidas a linha viraria um parágrafo, e a informação que interessa
 * ("tem gente vendo isso") já está nos dois primeiros.
 */
export function resumirNomes(nomes: string[], mostrar = 2): string {
  if (nomes.length === 0) return "";
  if (nomes.length <= mostrar) {
    if (nomes.length === 1) return nomes[0];
    return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  }
  const sobra = nomes.length - mostrar;
  return `${nomes.slice(0, mostrar).join(", ")} e mais ${sobra}`;
}
