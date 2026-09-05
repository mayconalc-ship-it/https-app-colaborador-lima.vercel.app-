/**
 * A BLITZ contra os DADOS REAIS, antes de a portaria comecar a marcar.
 *
 *   npx tsx scripts/conferir-blitz.mjs
 *
 * A pergunta que decide se a blitz nasce util: com o limite que esta
 * configurado hoje, QUANTAS carretas cairiam? Zero significa uma regra
 * que nunca para ninguem; metade da frota significa uma regra que a
 * operacao vai aprender a ignorar na primeira semana.
 *
 * Toda consulta passa por `precisa()`: erro para o script em vez de virar
 * lista vazia. Ver conferir-gatilho-anomalia.mjs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { calcularBase, limiteDoGatilho } from "../src/lib/gatilho-anomalia.ts";
import { pctAvariaAtendimento } from "../src/lib/carretas.ts";
import { MINIMO_DE_CARRETAS, decidirBlitz, indices, indicesDaChegada } from "../src/lib/blitz.ts";

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

const diaSP = (iso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();

const revendas = await precisa(
  "revendas",
  db.from("revendas").select("id, nome").eq("ativa", true).order("ordem"),
);

for (const r of revendas) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(r.nome);
  console.log("=".repeat(72));

  const atendimentos = await precisa(
    "atendimentos",
    db
      .from("atendimentos_carretas")
      .select("id, chegada_em, placa_carreta, motorista_nome, pa_transportadoras(nome)")
      .eq("revenda_id", r.id)
      .gte("chegada_em", desde)
      .order("chegada_em"),
  );
  if (atendimentos.length === 0) {
    console.log("Sem carretas nos ultimos 90 dias.");
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
    const l = porAtendimento.get(i.atendimento_id) ?? [];
    l.push({ quantidade: i.quantidade, quantidadeAvariada: i.quantidade_avariada });
    porAtendimento.set(i.atendimento_id, l);
  }

  const entregas = [];
  const porDia = new Map();
  for (const a of atendimentos) {
    const doA = porAtendimento.get(a.id);
    if (!doA?.length) continue;
    const pct = pctAvariaAtendimento(doA);
    if (pct === null) continue;
    const t = Array.isArray(a.pa_transportadoras) ? a.pa_transportadoras[0] : a.pa_transportadoras;
    entregas.push({
      placaCarreta: a.placa_carreta,
      motorista: a.motorista_nome,
      transportadoraNome: t?.nome ?? null,
      pctAvaria: pct,
    });
    const dia = diaSP(a.chegada_em);
    porDia.set(dia, [...(porDia.get(dia) ?? []), pct]);
  }

  console.log(`\n${atendimentos.length} carretas, ${entregas.length} com conferencia lancada.`);

  // ---- A REGUA ----
  const gatilho = (
    await precisa(
      "gatilho",
      db
        .from("pa_gatilhos_anomalia")
        .select("ativo, sigmas, limite_manual")
        .eq("revenda_id", r.id)
        .eq("indicador", "avaria_pct"),
    )
  )[0];

  const serie = [...porDia.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v.reduce((t, x) => t + x, 0) / v.length);
  const base = calcularBase(serie);
  const formula = limiteDoGatilho(base, { sentido: "menor_melhor", sigmas: gatilho?.sigmas ?? 2 });

  let limite = null;
  if (!gatilho) console.log("REGUA: gatilho de avaria NAO configurado -- a blitz nao para ninguem.");
  else if (!gatilho.ativo) console.log("REGUA: gatilho de avaria DESLIGADO -- a blitz nao para ninguem.");
  else if (gatilho.limite_manual !== null) {
    limite = Number(gatilho.limite_manual);
    console.log(`REGUA: ${limite}% (escrito a mao).`);
  } else {
    limite = formula;
    console.log(`REGUA: ${limite}% (formula, media ${base.media} + ${gatilho.sigmas}σ).`);
  }
  console.log(
    `  Para referencia: a formula daria ${formula ?? "—"}% (${base.pontos} dias de base).`,
  );

  // ---- QUEM ESTA ACIMA ----
  const todos = indices(entregas);
  for (const dim of ["carreta", "motorista", "transportadora"]) {
    const confiaveis = todos[dim].filter((i) => i.confiavel);
    const acima = limite === null ? [] : confiaveis.filter((i) => i.media > limite);
    console.log(
      `\n${dim.toUpperCase()}: ${todos[dim].length} distintos, ${confiaveis.length} com ${MINIMO_DE_CARRETAS}+ cargas, ${acima.length} acima do limite.`,
    );
    for (const i of confiaveis.slice(0, 5)) {
      const marca = limite !== null && i.media > limite ? "🚨" : "  ";
      console.log(`  ${marca} ${i.nome}: ${i.media}% em ${i.cargas} cargas`);
    }
  }

  // ---- QUANTAS DAS ULTIMAS CHEGADAS CAIRIAM ----
  const ultimas = atendimentos.slice(-20);
  let cairiam = 0;
  const motivos = [];
  for (const a of ultimas) {
    const t = Array.isArray(a.pa_transportadoras) ? a.pa_transportadoras[0] : a.pa_transportadoras;
    const d = decidirBlitz(
      indicesDaChegada(entregas, {
        placaCarreta: a.placa_carreta,
        motorista: a.motorista_nome,
        transportadoraNome: t?.nome ?? null,
      }),
      limite,
    );
    if (d.cai) {
      cairiam++;
      motivos.push(`  🚨 ${a.placa_carreta}: ${d.motivo}`);
    }
  }
  console.log(`\nDAS ULTIMAS ${ultimas.length} CHEGADAS, ${cairiam} cairiam na blitz.`);
  motivos.slice(0, 6).forEach((m) => console.log(m));
  if (cairiam === 0) {
    console.log("  (nenhuma -- confira se o limite escrito a mao faz sentido para a operacao)");
  }
}
