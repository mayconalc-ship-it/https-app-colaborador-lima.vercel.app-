/**
 * DE ONDE VEM CADA ACESSO -- as regras puras da ficha (05/10/2026).
 *
 * O que os sistemas de acesso modernos (Entra, Okta, Google Workspace,
 * GitHub) mostram ao lado de cada permissão é a ORIGEM: "herdado do grupo
 * X" ou "atribuído direto". Aqui o grupo é o perfil. Um acesso pode ser:
 *
 *   - do perfil     -- a pessoa tem, e um perfil dela dá. Quem manda é o
 *                      perfil: mudou o perfil, muda para ela.
 *   - individual    -- a pessoa tem, e nenhum perfil dela dá. É a
 *                      exceção, liberada à mão.
 *   - faltando      -- um perfil dela dá, e ela não tem (alguém tirou à
 *                      mão, ou ela entrou no perfil antes de ele crescer).
 *
 * Sem banco aqui: a lista de pessoas e a ficha fazem a mesma conta, e as
 * duas não podem discordar sobre quem está "fora do perfil".
 */

export type PerfilResumido = { id: string; nome: string; tipo: "lideranca" | "colaborador" };

export type ConteudoDosPerfis = {
  /** perfil -> chaves "modulo:acao" (perfis de liderança) */
  concessoes: Map<string, string[]>;
  /** perfil -> módulos do app (perfis de colaborador) */
  modulosApp: Map<string, string[]>;
};

const moduloDaChave = (chave: string) => chave.slice(0, chave.lastIndexOf(":"));

/**
 * Os perfis da pessoa que dão esta permissão de Modo Liderança.
 *
 * O "ver" conta como dado quando o perfil dá qualquer outra ação do mesmo
 * módulo: quem pode editar precisa abrir a tela, e o servidor liga o ver
 * sozinho (ver salvarFicha). Sem isso, o ver ligado por coerência
 * apareceria como "individual" sem ninguém ter liberado à mão.
 */
export function perfisQueDaoPermissao(
  chave: string,
  perfis: PerfilResumido[],
  conteudo: ConteudoDosPerfis,
): string[] {
  const modulo = moduloDaChave(chave);
  const ehVer = chave.endsWith(":ver");
  return perfis
    .filter((p) => p.tipo === "lideranca")
    .filter((p) => {
      const doPerfil = conteudo.concessoes.get(p.id) ?? [];
      return doPerfil.includes(chave) || (ehVer && doPerfil.some((c) => moduloDaChave(c) === modulo));
    })
    .map((p) => p.nome);
}

/** Os perfis da pessoa que dão este módulo do app. */
export function perfisQueDaoModulo(modulo: string, perfis: PerfilResumido[], conteudo: ConteudoDosPerfis): string[] {
  return perfis
    .filter((p) => p.tipo === "colaborador" && (conteudo.modulosApp.get(p.id) ?? []).includes(modulo))
    .map((p) => p.nome);
}

export type ResumoDeOrigem = {
  /** O que a pessoa tem e nenhum perfil dela dá. */
  individuaisApp: string[];
  individuaisPermissoes: string[];
  /** O que um perfil dela dá e ela não tem. */
  faltandoApp: string[];
  faltandoPermissoes: string[];
};

/**
 * A conta da pessoa inteira. As permissões de Modo Liderança só entram
 * para quem é liderança: num colaborador elas não valem nada (ficam
 * guardadas, inertes), e contá-las diria que ele está "fora do perfil" por
 * algo que ele nem usa.
 */
export function resumoDeOrigem(dados: {
  ehLideranca: boolean;
  modulosApp: Iterable<string>;
  permissoes: Iterable<string>;
  perfis: PerfilResumido[];
  conteudo: ConteudoDosPerfis;
  /** Só os módulos do app que a revenda tem ligados contam. */
  modulosDaRevenda?: Set<string>;
}): ResumoDeOrigem {
  const { perfis, conteudo } = dados;
  const ligado = (m: string) => !dados.modulosDaRevenda || dados.modulosDaRevenda.has(m);
  const app = new Set([...dados.modulosApp].filter(ligado));
  const perms = dados.ehLideranca ? new Set(dados.permissoes) : new Set<string>();

  const appDosPerfis = new Set(
    perfis.filter((p) => p.tipo === "colaborador").flatMap((p) => conteudo.modulosApp.get(p.id) ?? []),
  );
  const permsDosPerfis = new Set(
    dados.ehLideranca
      ? perfis.filter((p) => p.tipo === "lideranca").flatMap((p) => conteudo.concessoes.get(p.id) ?? [])
      : [],
  );

  return {
    individuaisApp: [...app].filter((m) => !appDosPerfis.has(m)),
    individuaisPermissoes: [...perms].filter((c) => perfisQueDaoPermissao(c, perfis, conteudo).length === 0),
    faltandoApp: [...appDosPerfis].filter((m) => ligado(m) && !app.has(m)),
    faltandoPermissoes: [...permsDosPerfis].filter((c) => !perms.has(c)),
  };
}

/** Sem acento e em minúsculas -- para a busca achar "acoes" em "Ações". */
export function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
