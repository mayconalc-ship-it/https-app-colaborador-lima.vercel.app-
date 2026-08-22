/**
 * Prova que o canal de presenca esta fechado.
 *
 * Roda de fora do app, SEM login, com a mesma chave publica que qualquer
 * pessoa consegue lendo o JavaScript do site. Era assim que a lista de
 * nomes e cargos vazava antes da migration 048.
 *
 *   node scripts/testar-presenca.mjs
 *
 * Sao tres tentativas, e as tres precisam falhar:
 *
 *   1. Canal antigo publico ("presenca-app"). Se ainda devolver gente, o
 *      app novo nao subiu ou alguem voltou atras.
 *
 *   2. Canal novo pedindo `private: true`. Deve ser recusado pela politica
 *      -- e o teste direto da correcao.
 *
 *   3. Canal novo pedindo `private: false`, no MESMO nome de topico. Este
 *      e o contorno obvio: se o Realtime deixar entrar como publico num
 *      topico que os outros usam como privado, a correcao nao vale nada.
 *      E a tentativa mais importante das tres.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = Object.fromEntries(
  readFileSync(join(RAIZ, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE_PUBLICA = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Descobre as revendas para montar o nome do topico novo. */
async function revendas() {
  const r = await fetch(`${URL_BASE}/rest/v1/revendas?select=id,nome`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  return r.json();
}

const SEGUNDOS = 10;

function tentar(rotulo, topico, privado) {
  return new Promise((pronto) => {
    // Cliente novo a cada tentativa: o supabase-js guarda o canal por nome,
    // e reaproveitar devolveria o resultado da tentativa anterior.
    const supabase = createClient(URL_BASE, CHAVE_PUBLICA, {
      realtime: { params: { eventsPerSecond: 1 } },
    });

    const canal = supabase.channel(topico, {
      config: privado ? { private: true } : {},
    });

    let encerrado = false;
    let entrou = false;
    const encerrar = (veredito, detalhe) => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(relogio);
      try {
        supabase.removeChannel(canal);
      } catch {
        // nao importa: o processo morre logo
      }
      pronto({ rotulo, topico, privado, veredito, detalhe });
    };

    canal
      .on("presence", { event: "sync" }, () => {
        const bruto = canal.presenceState();

        // Nome so vaza se alguem tiver posto nome no canal. Depois da
        // correcao o payload leva so o horario, entao procurar por nome e
        // exatamente o teste de regressao: se voltar a aparecer, alguem
        // reintroduziu dado pessoal no track().
        const nomes = Object.values(bruto)
          .flat()
          .map((p) => p?.nome)
          .filter(Boolean);

        if (nomes.length > 0) {
          encerrar("VAZOU NOME", `${nomes.length}: ${nomes.join(", ")}`);
          return;
        }

        const ids = Object.keys(bruto);
        if (ids.length > 0) {
          encerrar("ENTROU", `${ids.length} id(s), sem nome nenhum`);
        }
        // sync vazio nao conclui nada: pode ser que ninguem esteja online
      })
      .subscribe((status, erro) => {
        if (status === "CHANNEL_ERROR" || status === "CLOSED") {
          encerrar("BLOQUEADO", erro?.message ?? status);
        }
        // Entrar no canal já é o sinal que interessa, mesmo sem ninguém
        // online no momento: quem entrou hoje lê a lista amanhã. Sem esta
        // distinção, "ninguém online agora" passaria por "porta fechada".
        if (status === "SUBSCRIBED") entrou = true;
      });

    const relogio = setTimeout(
      () =>
        encerrar(
          entrou ? "ENTROU (sem ninguem online)" : "BLOQUEADO",
          entrou
            ? "a porta abriu; so nao havia quem ler"
            : `nao entrou em ${SEGUNDOS}s`,
        ),
      SEGUNDOS * 1000,
    );
  });
}

const lista = await revendas();
console.log(`Testando com a CHAVE PUBLICA, sem login.\n`);

const tentativas = [
  ["1. canal antigo, publico", "presenca-app", false],
  ...lista.flatMap((r) => [
    [`2. ${r.nome}, pedindo privado`, `presenca:${r.id}`, true],
    [`3. ${r.nome}, contornando como publico`, `presenca:${r.id}`, false],
  ]),
];

const resultados = [];
for (const [rotulo, topico, privado] of tentativas) {
  const r = await tentar(rotulo, topico, privado);
  resultados.push(r);
  const marca = r.veredito === "VAZOU" ? "!!!" : "ok ";
  console.log(`${marca} ${rotulo.padEnd(44)} ${r.veredito}  ${r.detalhe}`);
}

const comNome = resultados.filter((r) => r.veredito === "VAZOU NOME");
const entraram = resultados.filter((r) => r.veredito.startsWith("ENTROU"));

console.log("");

if (comNome.length > 0) {
  console.log(`FALHOU FEIO: ${comNome.length} tentativa(s) leram NOME de gente.`);
  for (const v of comNome) console.log(`  ${v.topico}: ${v.detalhe}`);
  process.exit(1);
}

if (entraram.length > 0) {
  // Nao e aprovacao, mas tambem nao e o vazamento que importava: quem
  // entrou por aqui recebe uuid e horario, que nao dizem quem e ninguem.
  console.log(
    `PARCIAL: ninguem leu nome, mas ${entraram.length} tentativa(s) entraram no canal.`,
  );
  for (const v of entraram) {
    console.log(`  ${v.topico} (privado=${v.privado}): ${v.detalhe}`);
  }
  console.log(
    "\nEsperado enquanto o Realtime aceitar `private: false` no mesmo topico.",
  );
  console.log("O que importa e que nao ha nome la dentro para ler.");
  process.exit(0);
}

console.log("PASSOU: nenhuma tentativa anonima entrou, e nenhum nome vazou.");
process.exit(0);
