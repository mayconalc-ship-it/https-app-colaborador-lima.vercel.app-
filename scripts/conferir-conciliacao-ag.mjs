/**
 * Confere a conciliação do Ativo de Giro contra os dados REAIS do banco.
 *
 *   npx tsx scripts/conferir-conciliacao-ag.mjs [AAAA-MM-DD]
 *
 * Sem data, usa o último dia com contagem.
 *
 * PARA QUE SERVE: provar que a conta da tela bate com o banco, sem
 * precisar abrir o app e sem depender de sessão. Ele NÃO reimplementa a
 * matemática -- importa as mesmas funções de src/lib/ativo-giro.ts que a
 * tela usa. Se ele e a tela discordassem, o script estaria testando outra
 * coisa.
 *
 * POR QUE ELE EXISTE (03/09/2026): a versão anterior morava num arquivo
 * temporário e lia a coluna `quantidade` de `ag_transito`. A migration
 * 094 renomeou essa coluna para `transito_rota`, e o script passou a
 * responder "trânsito: 0" -- sem erro, sem aviso. Com isso ele mostrou
 * uma diferença de -5.164 caixas quando a real era -47, e eu quase
 * reportei o número errado ao dono.
 *
 * A causa não foi o nome da coluna: foi o script SEGUIR EM FRENTE depois
 * de uma consulta que falhou. É a mesma classe de defeito do join do
 * alerta de gás e do corte de 1.000 linhas -- o PostgREST devolve
 * `{ data: null, error }` e quem ignora o `error` recebe zero como se
 * fosse resposta.
 *
 * Por isso `precisa()` abaixo: TODA consulta passa por ele, e qualquer
 * erro para o script com a mensagem do banco. Um script de verificação
 * que erra calado é pior que script nenhum -- ele dá confiança falsa.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  LIMITE_DIFERENCA_PCT,
  comodatoDeLinhas,
  conciliar,
  fatoresDeLinhas,
  juntarParcelas,
  parqueDeLinhas,
  resumirConciliacao,
  transitoDeLinhas,
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

/**
 * Executa a consulta e PARA se ela falhar.
 *
 * É a linha que separa este script da versão que errou: sem ela, uma
 * coluna renomeada vira lista vazia, lista vazia vira zero, e zero vira
 * um relatório errado com cara de certo.
 */
async function precisa(rotulo, consulta) {
  const { data, error } = await consulta;
  if (error) {
    console.error(`\n❌ ${rotulo}: ${error.message}`);
    console.error(
      "   O script parou de propósito. Se uma migration renomeou coluna,\n" +
        "   corrija a consulta aqui -- não deixe passar como zero.",
    );
    process.exit(1);
  }
  return data ?? [];
}

const diaPedido = process.argv[2];
if (diaPedido && !/^\d{4}-\d{2}-\d{2}$/.test(diaPedido)) {
  console.error("Data inválida. Use AAAA-MM-DD.");
  process.exit(1);
}

const revendas = await precisa(
  "revendas",
  db.from("revendas").select("id, nome").eq("ativa", true).order("ordem"),
);

for (const r of revendas) {
  const [fat, parq, com] = await Promise.all([
    precisa("ag_fatores", db.from("ag_fatores").select("formato, palete, lastro").eq("revenda_id", r.id)),
    precisa("ag_parque", db.from("ag_parque").select("tipo, formato, quantidade").eq("revenda_id", r.id)),
    precisa("ag_comodato", db.from("ag_comodato").select("tipo, formato, quantidade").eq("revenda_id", r.id)),
  ]);

  const ultimas = await precisa(
    "último dia com contagem",
    db
      .from("ag_contagens")
      .select("data")
      .eq("revenda_id", r.id)
      .order("data", { ascending: false })
      .limit(1),
  );
  const dia = diaPedido ?? ultimas[0]?.data;

  console.log(`\n${"=".repeat(78)}`);
  console.log(`${r.nome} — ${dia ?? "(sem contagem nenhuma)"}`);
  console.log("=".repeat(78));
  if (!dia) continue;

  const contagens = await precisa(
    "ag_contagens do dia",
    db
      .from("ag_contagens")
      .select("id, data, colaborador_id, colaborador_nome, tipo, formato, status, palete, lastro, caixa")
      .eq("revenda_id", r.id)
      .eq("data", dia),
  );

  // As colunas do trânsito mudaram na migration 094 (quantidade ->
  // transito_rota + transito_carreta). Se mudarem de novo, `precisa`
  // para aqui com a mensagem do banco, em vez de zerar a parcela.
  const transitoBanco = await precisa(
    "ag_transito do dia",
    db
      .from("ag_transito")
      .select("tipo, formato, transito_rota, transito_carreta")
      .eq("revenda_id", r.id)
      .eq("data", dia),
  );

  if (contagens.length === 0) {
    console.log("Nenhuma contagem neste dia.");
    continue;
  }

  const fatores = fatoresDeLinhas(fat);
  const parque = parqueDeLinhas(parq);
  const transito = juntarParcelas(transitoDeLinhas(transitoBanco), comodatoDeLinhas(com));

  /*
    UMA CONCILIAÇÃO POR PESSOA -- somar todo mundo é errado.

    Cada conferente conta o pátio INTEIRO, de forma independente. Em
    29/08 o Denes fechou 16.617 caixas e o Lucas 16.611: dupla contagem
    cega, não divisão de área. Somando, o script mostrava 131% do parque
    e uma "sobra" que não existe.

    A conciliação é a contagem de UMA pessoa contra o parque -- e quando
    duas contaram, as duas conciliações lado a lado são o próprio
    resultado: a divergência entre elas é o sinal de recontagem.
  */
  const porPessoa = new Map();
  for (const c of contagens) {
    porPessoa.set(c.colaborador_id, {
      nome: c.colaborador_nome,
      linhas: [...(porPessoa.get(c.colaborador_id)?.linhas ?? []), c],
    });
  }

  if (porPessoa.size > 1) {
    console.log(
      `\n⚠️  ${porPessoa.size} pessoas contaram este dia. Cada uma conta o pátio inteiro,\n` +
        "    então cada contagem é conciliada SEPARADAMENTE (somar daria o dobro).",
    );
  }

  const n = (v) => String(v).padStart(8);
  for (const { nome, linhas: doColaborador } of porPessoa.values()) {
    const linhas = conciliar(doColaborador, parque, fatores, transito);
    const resumo = resumirConciliacao(linhas);

    console.log(`\n── contagem de ${nome} ${"─".repeat(Math.max(0, 55 - nome.length))}`);
    console.log(
      "TIPO            FORMATO   CONTADO     ROTA  CARRETA   COMOD.   PARQUE    DIFER.      %  SIT.",
    );
    for (const l of linhas) {
      const sit =
        l.dentroDoAceitavel === null ? "s/parque" : l.dentroDoAceitavel ? "dentro" : "FORA";
      console.log(
        `${l.tipo.padEnd(15)} ${l.formato.padEnd(8)} ${n(l.contado)} ${n(l.rota)} ${n(l.carreta)} ` +
          `${n(l.comodato)} ${n(l.parque)} ${n(l.diferenca)} ${String(l.pctDiferenca ?? "-").padStart(6)}  ${sit}`,
      );
    }

    console.log(
      `FECHAMENTO: ${resumo.contado} contadas + ${resumo.rota} rota + ${resumo.carreta} carreta ` +
        `+ ${resumo.comodato} comodato − ${resumo.parque} parque = ${resumo.diferenca}`,
    );
    console.log(
      `  ${resumo.pctDiferenca ?? "—"}% do parque (aceitável até ${LIMITE_DIFERENCA_PCT}%) → ` +
        `${resumo.dentroDoAceitavel ? "DENTRO" : "FORA"}  |  linhas fora do limite: ${resumo.linhasFora}`,
    );

    // O total pode fechar e uma linha estar muito fora -- é o mesmo aviso
    // que a tela dá, e é a razão de ele existir lá.
    if (resumo.dentroDoAceitavel && resumo.linhasFora > 0) {
      console.log(
        `  ⚠️  o total fecha, mas ${resumo.linhasFora} linha(s) passaram dos ${LIMITE_DIFERENCA_PCT}% — veja "FORA" acima.`,
      );
    }
  }
}
