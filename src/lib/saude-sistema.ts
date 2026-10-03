/**
 * SAÚDE DO SISTEMA (03/10/2026) -- as migrations rodaram?
 *
 * O deploy da Vercel é automático; a migration é manual, no SQL Editor do
 * Supabase. Quando a segunda fica para trás, o módulo novo quebra (ou
 * mostra "não instalado") e ninguém sabe qual arquivo faltou rodar. Já
 * aconteceu.
 *
 * O CATÁLOGO SAI DAS PRÓPRIAS MIGRATIONS, não de uma lista feita à mão
 * (que ficaria velha na primeira migration nova): cada `create table` e
 * cada `add column` vira uma conferência, com o número do arquivo que a
 * cria. O script `scripts/gerar-catalogo-saude.mjs` grava o resultado em
 * `saude-catalogo.json`, e um teste reprova se ele estiver desatualizado.
 *
 * Só a regra aqui, sem banco:
 *   npx tsx src/lib/__testes__/saude-sistema.teste.mjs
 */

export type ArquivoDeMigration = { nome: string; sql: string };

export type Catalogo = {
  /** tabela -> número da migration que a cria */
  tabelas: Record<string, string>;
  /** colunas acrescentadas DEPOIS da criação da tabela */
  colunas: { tabela: string; coluna: string; migration: string }[];
  /** número -> nome do arquivo, para a tela dizer qual rodar */
  arquivos: Record<string, string>;
};

const numeroDe = (nome: string) => nome.split("_")[0];

/** Tira os comentários de linha (-- ...), que falam de tabelas sem criá-las. */
function semComentarios(sql: string) {
  return sql.replace(/--[^\n]*/g, "");
}

/**
 * Lê as migrations NA ORDEM e acompanha o que existe ao fim: tabela
 * criada entra, tabela apagada sai (com as colunas dela), coluna apagada
 * sai. Só o schema public -- auth e storage são do Supabase.
 */
export function catalogoDasMigrations(arquivos: ArquivoDeMigration[]): Catalogo {
  const tabelas = new Map<string, string>();
  const colunas = new Map<string, { tabela: string; coluna: string; migration: string }>();
  const ordenados = [...arquivos].sort((a, b) => a.nome.localeCompare(b.nome));

  for (const { nome, sql } of ordenados) {
    const m = numeroDe(nome);
    const s = semComentarios(sql);

    // Os comandos na ordem em que aparecem no arquivo.
    const comandos = s.split(";");
    for (const cmd of comandos) {
      const criou = cmd.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?\s*\(/i);
      if (criou) {
        if (!tabelas.has(criou[1])) tabelas.set(criou[1], m);
        continue;
      }
      const apagou = cmd.match(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/i);
      if (apagou) {
        tabelas.delete(apagou[1]);
        for (const k of [...colunas.keys()]) if (k.startsWith(`${apagou[1]}.`)) colunas.delete(k);
        continue;
      }
      const alterou = cmd.match(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?(\w+)"?\s+([\s\S]*)/i);
      if (alterou) {
        const [, tabela, resto] = alterou;
        for (const c of resto.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi)) {
          const chave = `${tabela}.${c[1]}`;
          if (!colunas.has(chave)) colunas.set(chave, { tabela, coluna: c[1], migration: m });
        }
        for (const c of resto.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?"?(\w+)"?/gi)) {
          colunas.delete(`${tabela}.${c[1]}`);
        }
      }
    }
  }

  // As colunas valem também para as tabelas que nasceram FORA das
  // migrations (comunicados, profiles... criadas no painel do Supabase):
  // a tabela não é conferida, mas a coluna que uma migration pôs nela é.
  const saida: Catalogo = { tabelas: {}, colunas: [], arquivos: {} };
  for (const [t, m] of [...tabelas.entries()].sort(([a], [b]) => a.localeCompare(b))) saida.tabelas[t] = m;
  saida.colunas = [...colunas.values()].sort((a, b) => a.tabela.localeCompare(b.tabela) || a.coluna.localeCompare(b.coluna));
  // Só os arquivos que aparecem em alguma conferência.
  const usados = new Set([...Object.values(saida.tabelas), ...saida.colunas.map((c) => c.migration)]);
  for (const { nome } of ordenados) if (usados.has(numeroDe(nome))) saida.arquivos[numeroDe(nome)] ??= nome;
  return saida;
}

// ---------------------------------------------------------------------
// O resultado da conferência
// ---------------------------------------------------------------------

export type Falta =
  | { tipo: "tabela"; tabela: string; migration: string }
  | { tipo: "coluna"; tabela: string; coluna: string; migration: string };

/** As faltas agrupadas por migration, da mais antiga à mais nova -- a ordem em que se roda. */
export function faltasPorMigration(faltas: Falta[]): { migration: string; faltas: Falta[] }[] {
  const grupos = new Map<string, Falta[]>();
  for (const f of faltas) grupos.set(f.migration, [...(grupos.get(f.migration) ?? []), f]);
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([migration, lista]) => ({ migration, faltas: lista }));
}

/** O erro do PostgREST diz o que falta: a tabela inteira ou uma coluna. */
export function tipoDoErro(erro: { code?: string; message?: string } | null): "ok" | "tabela" | "coluna" | "outro" {
  if (!erro) return "ok";
  const msg = erro.message ?? "";
  if (erro.code === "42P01" || erro.code === "PGRST205" || /Could not find the table|relation .* does not exist/i.test(msg)) {
    return "tabela";
  }
  if (erro.code === "42703" || erro.code === "PGRST204" || /column .* does not exist|Could not find the .* column/i.test(msg)) {
    return "coluna";
  }
  return "outro";
}
