/**
 * O que está parado no Abastecimento do Picking, e HÁ QUANTO TEMPO.
 *
 *   npx tsx scripts/conferir-abastecimentos-abertos.mjs
 *
 * Mostra as duas coisas que ficam em aberto e se confundem na tela:
 *   - SESSÃO de abastecimento sem fim (alguém começou e não fechou)
 *   - PEDIDO de ressuprimento parado numa etapa (ninguém pegou, ou
 *     pegou e não entregou)
 *
 * Toda consulta passa por `precisa()`: erro para o script em vez de virar
 * lista vazia. Ver conferir-conciliacao-ag.mjs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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

const hhmm = (iso) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const paradoHa = (iso) => {
  if (!iso) return "—";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h}h${String(min % 60).padStart(2, "0")}` : `${Math.floor(h / 24)}d ${h % 24}h`;
};

const revendas = await precisa(
  "revendas",
  db.from("revendas").select("id, nome").eq("ativa", true).order("ordem"),
);

for (const r of revendas) {
  console.log(`\n${"=".repeat(76)}`);
  console.log(r.nome);
  console.log("=".repeat(76));

  // ---- SESSÕES SEM FIM ----
  const sessoes = await precisa(
    "pa_abastecimentos abertos",
    db
      .from("pa_abastecimentos")
      .select("id, colaborador_nome, tipo, turno, inicio, ressuprimento_id")
      .eq("revenda_id", r.id)
      .is("fim", null)
      .order("inicio", { ascending: false }),
  );

  console.log(`\n▶ SESSÕES DE ABASTECIMENTO SEM FIM: ${sessoes.length}`);
  for (const s of sessoes) {
    const itens = await precisa(
      "itens da sessão",
      db.from("pa_abastecimento_itens").select("id, hl_calculado").eq("abastecimento_id", s.id),
    );
    const hl = itens.reduce((t, i) => t + Number(i.hl_calculado ?? 0), 0);
    console.log(
      `  ${s.colaborador_nome} | ${s.tipo} | ${s.turno} | iniciou ${hhmm(s.inicio)} ` +
        `| aberto há ${paradoHa(s.inicio)} | ${itens.length} item(ns), ${hl.toFixed(1)} HL ` +
        `| ${s.ressuprimento_id ? "veio de um pedido" : "avulso"}`,
    );
    if (itens.length === 0) {
      console.log("     >>> ZERO itens: sessão aberta e nada lançado.");
    }
  }

  // ---- PEDIDOS PARADOS ----
  const pedidos = await precisa(
    "pa_ressuprimentos em aberto",
    db
      .from("pa_ressuprimentos")
      .select(
        "id, criado_em, solicitante_nome, tipo, turno, prioridade, operador_nome, transporte_inicio, cancelado_em",
      )
      .eq("revenda_id", r.id)
      .is("cancelado_em", null)
      .order("criado_em", { ascending: false })
      .limit(30),
  );

  console.log(`\n▶ PEDIDOS (últimos ${pedidos.length}, não cancelados)`);
  for (const p of pedidos) {
    const itens = await precisa(
      "itens do pedido",
      db
        .from("pa_ressuprimento_itens")
        .select("id, entregue_em")
        .eq("ressuprimento_id", p.id),
    );
    const sessao = await precisa(
      "sessão do pedido",
      db
        .from("pa_abastecimentos")
        .select("id, colaborador_nome, inicio, fim")
        .eq("ressuprimento_id", p.id)
        .limit(1),
    );

    const pendentes = itens.filter((i) => !i.entregue_em).length;
    const s = sessao[0];

    // O MESMO estadoDe da tela, refeito aqui a partir dos carimbos.
    let estado, desde, deQuem;
    if (s?.fim) {
      estado = "finalizado";
      desde = s.fim;
      deQuem = "—";
    } else if (s) {
      estado = "abastecendo";
      desde = s.inicio;
      deQuem = s.colaborador_nome;
    } else if (p.transporte_inicio && pendentes === 0) {
      estado = "na área (falta levar ao picking)";
      desde = p.transporte_inicio;
      deQuem = "quem abastece o picking";
    } else if (p.transporte_inicio) {
      estado = `em transporte (${pendentes} item(ns) por entregar)`;
      desde = p.transporte_inicio;
      deQuem = p.operador_nome ?? "operador";
    } else {
      estado = "aberto (esperando a empilhadeira)";
      desde = p.criado_em;
      deQuem = "empilhadeira";
    }

    if (estado === "finalizado") continue;

    console.log(
      `  #${p.id.slice(0, 8)} ${p.tipo}/${p.prioridade} | pedido por ${p.solicitante_nome} ` +
        `${hhmm(p.criado_em)}\n     estado: ${estado} | parado há ${paradoHa(desde)} | bola com: ${deQuem}` +
        (p.operador_nome ? ` | empilhador: ${p.operador_nome}` : ""),
    );
  }
}
