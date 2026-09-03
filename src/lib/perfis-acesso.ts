/**
 * PERFIS DE ACESSO
 *
 * Um perfil é uma lista de concessões com nome: "Supervisor de Armazém",
 * "Líder de Entrega". Aplicá-lo grava exatamente as mesmas linhas de
 * sempre em `lideranca_permissoes` -- é atalho e significado, não um
 * mecanismo novo de permissão.
 *
 * Depois de aplicado o perfil NÃO prende a pessoa: ela pode ganhar ou
 * perder concessões soltas na tela de acessos como sempre. Amarrar
 * obrigaria a inventar exceção para o primeiro caso que fugisse do
 * padrão, e sempre foge.
 *
 * Só a regra aqui, sem banco.
 */

export type Concessao = { modulo: string; acao: string };

/** A chave que identifica uma concessão, igual à de `getConcessoes`. */
export function chaveDaConcessao(modulo: string, acao: string): string {
  return `${modulo}:${acao}`;
}

/**
 * O que muda ao aplicar um perfil a uma pessoa.
 *
 * Devolve o que ENTRA e o que a pessoa já tinha além do perfil. Nada é
 * removido: aplicar um perfil a quem já administra outra coisa não pode
 * tirar o que ela tinha sem alguém dizer que quer isso -- e uma tela que
 * remove sem avisar é como se perde a confiança de quem administra.
 */
export function simularAplicacao(
  doPerfil: Concessao[],
  jaTem: Concessao[],
): { entram: Concessao[]; jaTinha: Concessao[]; foraDoPerfil: Concessao[] } {
  const chavesPerfil = new Set(doPerfil.map((c) => chaveDaConcessao(c.modulo, c.acao)));
  const chavesPessoa = new Set(jaTem.map((c) => chaveDaConcessao(c.modulo, c.acao)));

  return {
    entram: doPerfil.filter((c) => !chavesPessoa.has(chaveDaConcessao(c.modulo, c.acao))),
    jaTinha: doPerfil.filter((c) => chavesPessoa.has(chaveDaConcessao(c.modulo, c.acao))),
    foraDoPerfil: jaTem.filter((c) => !chavesPerfil.has(chaveDaConcessao(c.modulo, c.acao))),
  };
}

/*
 * AQUI MORAVA `temOPerfil`, que respondia "a pessoa é este perfil?" com
 * "ela tem todas as concessões dele?".
 *
 * A ideia era generosa -- ter a mais não desqualificaria ninguém, um
 * supervisor que também publica o jornal continuaria sendo supervisor.
 * Só que a generosidade valia para os dois lados: um ADMINISTRADOR
 * contém qualquer perfil pequeno por definição, então ele "era" todos
 * eles. O dono criou um perfil de conferente em 03/09/2026 e a lista
 * nasceu com quatro pessoas que ele não tinha informado -- e sem como
 * tirar nenhuma, porque não havia vínculo para apagar: era uma conta
 * refeita a cada abertura da tela.
 *
 * Quem responde isso agora é a tabela `perfil_pessoas` (migration 091):
 * perfil aplicado é um fato, com data e autor, não uma coincidência de
 * permissões.
 */

/** Agrupa as concessões por módulo, para a tela não virar uma lista de
 *  "modulo:acao" que ninguém lê. */
export function agruparPorModulo(concessoes: Concessao[]): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const c of concessoes) {
    const acoes = mapa.get(c.modulo) ?? [];
    if (!acoes.includes(c.acao)) acoes.push(c.acao);
    mapa.set(c.modulo, acoes);
  }
  return mapa;
}

/**
 * Lê a grade de checkboxes do formulário.
 *
 * O campo vem como `perm-<modulo>-<acao>`. O módulo pode ter traço no id
 * (`pa-reepack`, `meus-indicadores`), então o corte é pelo ÚLTIMO traço --
 * cortar pelo primeiro transformaria "pa-reepack:ver" em "pa" + "reepack-ver".
 */
export function lerConcessoesDoFormulario(campos: Iterable<[string, unknown]>): Concessao[] {
  const saida: Concessao[] = [];
  for (const [campo] of campos) {
    if (!campo.startsWith("perm-")) continue;
    const resto = campo.slice("perm-".length);
    const corte = resto.lastIndexOf("-");
    if (corte <= 0) continue;
    const modulo = resto.slice(0, corte);
    const acao = resto.slice(corte + 1);
    if (!["ver", "criar", "editar", "excluir"].includes(acao)) continue;
    saida.push({ modulo, acao });
  }
  return saida;
}
