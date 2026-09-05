/**
 * O gatilho contra os DADOS REAIS, antes de qualquer tela depender dele.
 *
 *   npx tsx scripts/conferir-gatilho-anomalia.mjs
 *
 * Uma formula estatistica so mostra se serve quando encontra a operacao:
 * e aqui que se descobre se ha base suficiente, onde o limite cai, e
 * quantos dias teriam aberto relato -- que e a pergunta que decide se o
 * painel nasce util ou vira spam.
 *
 * Toda consulta passa por `precisa()`: erro para o script em vez de
 * virar lista vazia. Ver conferir-conciliacao-ag.mjs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { avaliarSerie, calcularBase, limiteDoGatilho, MINIMO_DE_PONTOS } from "../src/lib/gatilho-anomalia.ts";
import { pctAvariaAtendimento } from "../src/lib/carretas.ts";

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

const diaSP = (iso) =>
  new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

const revendas = await precisa(
  "revendas",
  db.from("revendas").select("id, nome").eq("ativa", true).order("ordem"),
);

for (const r of revendas) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(r.nome);
  console.log("=".repeat(72));

  // ---- % DE AVARIA POR DIA ----
  // O indicador que ja existe (meta avaria_pct) e a porta da blitz.
  const atendimentos = await precisa(
    "atendimentos",
    db
      .from("atendimentos_carretas")
      .select("id, chegada_em, transportadora_id, pa_transportadoras(nome)")
      .eq("revenda_id", r.id)
      .not("fim_conferencia_em", "is", null)
      .order("chegada_em"),
  );

  if (atendimentos.length === 0) {
    console.log("\nSem conferencia finalizada ainda.");
    continue;
  }

  const itens = await precisa(
    "itens",
    db
      .from("atendimento_carretas_itens")
      .select("atendimento_id, quantidade, quantidade_avariada")
      .in("atendimento_id", atendimentos.map((a) => a.id)),
  );

  const porAtendimento = new Map();
  for (const i of itens) {
    const arr = porAtendimento.get(i.atendimento_id) ?? [];
    arr.push({ quantidade: i.quantidade, quantidadeAvariada: i.quantidade_avariada });
    porAtendimento.set(i.atendimento_id, arr);
  }

  // Um ponto por DIA: a media do dia. O gatilho olha o processo, nao a
  // carreta -- uma carreta ruim isolada e caso, um dia ruim e desvio.
  const porDia = new Map();
  for (const a of atendimentos) {
    const linhas = porAtendimento.get(a.id) ?? [];
    if (linhas.length === 0) continue;
    const pct = pctAvariaAtendimento(linhas);
    if (pct === null) continue;
    const dia = diaSP(a.chegada_em);
    const arr = porDia.get(dia) ?? [];
    arr.push(pct);
    porDia.set(dia, arr);
  }

  const pontos = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, pcts]) => ({ dia, valor: Math.round((pcts.reduce((t, v) => t + v, 0) / pcts.length) * 100) / 100 }));

  console.log(`\n▶ % DE AVARIA -- ${pontos.length} dia(s) com conferencia`);
  const base = calcularBase(pontos.map((p) => p.valor));
  const gatilho = { sentido: "menor_melhor", sigmas: 2 };

  if (!base.confiavel) {
    console.log(`  ${base.motivo}`);
    // O limite PROVISORIO, so para diagnostico: e ele que mostra se a
    // formula vai servir para este indicador quando a base fechar. Um
    // limite acima de 100% num indicador em % ja diz que o processo nao
    // tem linha de base -- e que ali o numero escolhido a mao vale mais
    // que a estatistica.
    const valores = pontos.map((p) => p.valor);
    const n = valores.length;
    if (n >= 2) {
      const media = valores.reduce((t, v) => t + v, 0) / n;
      const desvio = Math.sqrt(valores.reduce((t, v) => t + (v - media) ** 2, 0) / (n - 1));
      const provisorio = Math.round((media + 2 * desvio) * 100) / 100;
      console.log(`  (media ${media.toFixed(2)}% | desvio ${desvio.toFixed(2)} | limite PROVISORIO ${provisorio}%)`);
      if (provisorio > 100) {
        console.log(`  ⚠️  O limite passa de 100% -- com esta variacao, o gatilho estatistico NUNCA dispararia.`);
        console.log(`      Indicador assim pede limite escrito a mao (regra de negocio), nao formula.`);
      }
    }
  } else {
    const limite = limiteDoGatilho(base, gatilho);
    console.log(`  media ${base.media}% | desvio ${base.desvio} | LIMITE ${limite}%`);
    const teriamDisparado = pontos.filter((p) => p.valor > limite);
    console.log(`  dias que teriam aberto relato: ${teriamDisparado.length} de ${pontos.length}`);
    for (const p of teriamDisparado) console.log(`     ${p.dia}: ${p.valor}%`);
    const hoje = avaliarSerie(pontos, gatilho);
    console.log(`  hoje: ${hoje.disparo ? `DISPAROU (${hoje.disparo.regra}) -- ${hoje.disparo.explicacao}` : "dentro do limite"}`);
  }

  console.log(`\n  Serie (ultimos 15 dias):`);
  for (const p of pontos.slice(-15)) console.log(`     ${p.dia}  ${String(p.valor).padStart(6)}%`);

  // ---- QUEM SERIA A BLITZ ----
  const nomeTransp = (a) => {
    const t = Array.isArray(a.pa_transportadoras) ? a.pa_transportadoras[0] : a.pa_transportadoras;
    return t?.nome ?? "(sem transportadora)";
  };
  const porTransp = new Map();
  for (const a of atendimentos) {
    const linhas = porAtendimento.get(a.id) ?? [];
    if (linhas.length === 0) continue;
    const pct = pctAvariaAtendimento(linhas);
    if (pct === null) continue;
    const nome = nomeTransp(a);
    const arr = porTransp.get(nome) ?? [];
    arr.push(pct);
    porTransp.set(nome, arr);
  }
  console.log(`\n▶ POR TRANSPORTADORA (quem entraria na blitz)`);
  const ranking = [...porTransp.entries()]
    .map(([nome, pcts]) => ({
      nome,
      carretas: pcts.length,
      media: Math.round((pcts.reduce((t, v) => t + v, 0) / pcts.length) * 100) / 100,
    }))
    .sort((a, b) => b.media - a.media);
  for (const t of ranking) {
    console.log(`  ${String(t.media).padStart(6)}%  ${String(t.carretas).padStart(3)} carreta(s)  ${t.nome}`);
  }
  if (base.confiavel) {
    const limite = limiteDoGatilho(base, gatilho);
    const naBlitz = ranking.filter((t) => t.media > limite);
    console.log(`  acima do limite de ${limite}%: ${naBlitz.length} transportadora(s)`);
  }
}

console.log(`\n(minimo de pontos para o gatilho valer: ${MINIMO_DE_PONTOS})`);
