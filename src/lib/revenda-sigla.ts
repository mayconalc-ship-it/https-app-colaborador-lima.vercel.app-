/**
 * Sigla curta da revenda, para o cabeçalho do celular.
 *
 * "Revenda Lima São Félix" ocupava metade da largura da tela e empurrava
 * o botão Sair para fora. Tirar só o "Revenda Lima" não bastava: sobrava
 * "São Félix", ainda longo. As siglas são as que o pessoal já usa na
 * operação, então não há nada novo para aprender.
 *
 * Módulo puro de propósito: `lib/revendas.ts` puxa cookies e o cliente
 * admin, e não pode ser importado de componente de cliente.
 */
const SIGLAS: Record<string, string> = {
  "sao-felix": "SAFECO",
  barreiras: "BRS",
};

/**
 * Fallback para revenda nova que ainda não tem sigla combinada: iniciais
 * do nome, sem o "Revenda Lima" que se repete em todas. Feio é melhor que
 * quebrado -- e o dia que a terceira revenda entrar, é uma linha acima.
 */
function iniciais(nome: string) {
  return (
    nome
      .replace(/^Revenda\s+Lima\s+/i, "")
      .split(/\s+/)
      .filter((p) => p.length > 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 6) || nome.slice(0, 6).toUpperCase()
  );
}

export function siglaRevenda(slug: string, nome: string) {
  return SIGLAS[slug] ?? iniciais(nome);
}

/** Nome sem o "Revenda Lima" repetido — para telas com espaço sobrando. */
export function nomeCurtoRevenda(nome: string) {
  return nome.replace(/^Revenda\s+Lima\s+/i, "");
}
