/**
 * Quem contou o quê, dia a dia -- para saber se a soma de todos duplica.
 *
 *   npx tsx scripts/conferir-contagem-por-pessoa.mjs [dias]
 *
 * A pergunta que ele responde: cada pessoa conta o PÁTIO INTEIRO (e aí
 * somar duas contagens dá o dobro) ou elas dividem o pátio entre si (e aí
 * a soma é o certo)? A resposta muda o que a conciliação deve fazer.
 *
 * Mesma regra do outro script: toda consulta passa por `precisa()`, que
 * para se o banco reclamar. Ver conferir-conciliacao-ag.mjs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  chave,
  fatoresDeLinhas,
  parqueDeLinhas,
  totalEmCaixas,
} from "../src/lib/ativo-giro.ts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function precisa(rotulo, consulta) {
  const { data, error } = await consulta;
  if (error) {
    console.error(`\n❌ ${rotulo}: ${error.message}`);
    process.exit(1);
  }
  return data ?? [];
}

const dias = Number(process.argv[2] ?? 10);

const revendas = await precisa(
  "revendas",
  db.from("revendas").select("id, nome").eq("ativa", true).order("ordem"),
);

for (const r of revendas) {
  const [fat, parq] = await Promise.all([
    precisa("ag_fatores", db.from("ag_fatores").select("formato, palete, lastro").eq("revenda_id", r.id)),
    precisa("ag_parque", db.from("ag_parque").select("tipo, formato, quantidade").eq("revenda_id", r.id)),
  ]);
  const fatores = fatoresDeLinhas(fat);
  const parque = parqueDeLinhas(parq);
  const totalParque = Object.values(parque).reduce((s, v) => s + v, 0);

  const contagens = await precisa(
    "ag_contagens",
    db
      .from("ag_contagens")
      .select("data, colaborador_id, colaborador_nome, tipo, formato, palete, lastro, caixa")
      .eq("revenda_id", r.id)
      .order("data", { ascending: false })
      .limit(1000),
  );

  const porDia = new Map();
  for (const c of contagens) {
    const doDia = porDia.get(c.data) ?? new Map();
    const atual = doDia.get(c.colaborador_nome) ?? { caixas: 0, linhas: 0, itens: new Set() };
    atual.caixas += totalEmCaixas(c, fatores[c.formato]);
    atual.linhas += 1;
    atual.itens.add(chave(c.tipo, c.formato));
    doDia.set(c.colaborador_nome, atual);
    porDia.set(c.data, doDia);
  }

  console.log(`\n${"=".repeat(74)}`);
  console.log(`${r.nome} — parque total: ${totalParque.toLocaleString("pt-BR")} caixas`);
  console.log("=".repeat(74));

  for (const [dia, pessoas] of [...porDia].slice(0, dias)) {
    const soma = [...pessoas.values()].reduce((s, p) => s + p.caixas, 0);
    const pct = totalParque > 0 ? Math.round((soma / totalParque) * 100) : null;
    console.log(`\n${dia}  —  ${pessoas.size} pessoa(s), soma ${Math.round(soma).toLocaleString("pt-BR")} cx` +
      (pct !== null ? ` (${pct}% do parque)` : ""));
    for (const [nome, p] of [...pessoas].sort((a, b) => b[1].caixas - a[1].caixas)) {
      const pctPessoa = totalParque > 0 ? Math.round((p.caixas / totalParque) * 100) : null;
      console.log(
        `    ${nome.padEnd(32)} ${String(Math.round(p.caixas)).padStart(7)} cx  ` +
          `${String(p.itens.size).padStart(2)}/8 itens  ${String(p.linhas).padStart(3)} linhas` +
          (pctPessoa !== null ? `  (${pctPessoa}% do parque)` : ""),
      );
    }
    // Se cada pessoa sozinha ja cobre quase o parque inteiro, elas estao
    // contando o MESMO patio -- e somar duplica.
    const maior = Math.max(...[...pessoas.values()].map((p) => p.caixas));
    if (pessoas.size > 1 && totalParque > 0 && maior / totalParque > 0.6) {
      console.log(`    >>> cada uma cobre sozinha ${Math.round((maior / totalParque) * 100)}% do parque -- somar DUPLICA`);
    }
  }
}
