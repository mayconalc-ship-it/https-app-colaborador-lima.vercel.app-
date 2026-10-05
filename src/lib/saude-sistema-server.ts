import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import catalogo from "@/lib/saude-catalogo.json";
import { faltasPorMigration, tipoDoErro, type Catalogo, type Falta } from "@/lib/saude-sistema";

type Admin = ReturnType<typeof createAdminClient>;

/** Os buckets que o app usa (ver as chamadas `storage.from` do código). */
const BUCKETS = [
  { id: "conteudo", para: "fotos de comunicados, 5S, blitz, horímetro, padrões" },
  { id: "comprovantes", para: "comprovantes de pagamento" },
  { id: "reconhecimentos", para: "reconhecimentos do 5S" },
  { id: "manutencao", para: "fotos do Check de Manutenção" },
  { id: "chamados", para: "fotos dos Chamados de Manutenção" },
];

/** Quantas conferências vão ao banco ao mesmo tempo -- sem afogar o PostgREST. */
const DE_UMA_VEZ = 12;

export type Saude = {
  conferidas: number;
  faltas: { migration: string; faltas: Falta[] }[];
  /** Erros que não dizem "falta" (rede, permissão): mostrados à parte. */
  outros: { tabela: string; erro: string }[];
  buckets: { id: string; para: string; existe: boolean }[];
  ultimaVarredura: string | null;
  duracaoMs: number;
};

async function emLotes<T, R>(itens: T[], tamanho: number, fazer: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fazer))));
  return saida;
}

/**
 * Confere cada tabela do catálogo (e as colunas que migrations puseram
 * nela) com UMA consulta vazia por tabela: `select colunas ... limit 0`.
 * Só quando dá erro de coluna é que cada coluna é conferida sozinha, para
 * dizer exatamente qual falta.
 */
export async function conferirSaude(admin: Admin = createAdminClient()): Promise<Saude> {
  const inicio = Date.now();
  const cat = catalogo as Catalogo;

  // Tabela -> colunas a conferir. Inclui tabelas que nasceram fora das
  // migrations (só têm colunas no catálogo).
  const porTabela = new Map<string, { migration: string | null; colunas: { coluna: string; migration: string }[] }>();
  for (const [t, m] of Object.entries(cat.tabelas)) porTabela.set(t, { migration: m, colunas: [] });
  for (const c of cat.colunas) {
    const atual = porTabela.get(c.tabela) ?? { migration: null, colunas: [] };
    atual.colunas.push({ coluna: c.coluna, migration: c.migration });
    porTabela.set(c.tabela, atual);
  }

  const faltas: Falta[] = [];
  const outros: Saude["outros"] = [];

  await emLotes([...porTabela.entries()], DE_UMA_VEZ, async ([tabela, info]) => {
    const campos = info.colunas.length ? info.colunas.map((c) => c.coluna).join(",") : "*";
    // limit 0 (e não `head`): não traz linha nenhuma, mas o erro vem com o
    // corpo -- é o código dele que diz se falta a tabela ou a coluna.
    const { error } = await admin.from(tabela).select(campos).limit(0);
    const tipo = tipoDoErro(error);
    if (tipo === "ok") return;
    if (tipo === "tabela") {
      // Tabela de fora das migrations sem a tabela: o problema é a coluna
      // mais antiga que a pôs no app.
      faltas.push({ tipo: "tabela", tabela, migration: info.migration ?? info.colunas[0]?.migration ?? "?" });
      return;
    }
    if (tipo === "coluna") {
      for (const c of info.colunas) {
        const { error: e } = await admin.from(tabela).select(c.coluna).limit(0);
        if (tipoDoErro(e) === "coluna") faltas.push({ tipo: "coluna", tabela, coluna: c.coluna, migration: c.migration });
      }
      return;
    }
    outros.push({ tabela, erro: error?.message ?? "erro desconhecido" });
  });

  const [buckets, varredura] = await Promise.all([
    Promise.all(
      BUCKETS.map(async (b) => {
        const { data } = await admin.storage.getBucket(b.id);
        return { ...b, existe: Boolean(data) };
      }),
    ),
    admin.from("cron_varreduras").select("rodou_em").eq("chave", "lembretes").maybeSingle(),
  ]);

  return {
    conferidas: porTabela.size,
    faltas: faltasPorMigration(faltas),
    outros,
    buckets,
    ultimaVarredura: (varredura.data as { rodou_em: string } | null)?.rodou_em ?? null,
    duracaoMs: Date.now() - inicio,
  };
}
