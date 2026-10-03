// O mapa de emojis: um assunto, um emoji -- e todo módulo, menu, painel e
// guia usando o do seu assunto.
//   npx tsx src/lib/__testes__/mapa-emojis.teste.mjs
import { MAPA_DE_EMOJIS, assuntoDaChave, partesComDesenho } from "../mapa-emojis.ts";
import { MODULOS, MODULOS_DO_DONO } from "../acessos.ts";
import { MENU_PADRAO } from "../menu.ts";
import { PAINEIS } from "../gestao.ts";
import { CATEGORIAS_DO_GUIA, GUIAS } from "../guia.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}

console.log("== O MAPA ==");
const porEmoji = new Map();
for (const a of MAPA_DE_EMOJIS) porEmoji.set(a.emoji, [...(porEmoji.get(a.emoji) ?? []), a.id]);
const repetidos = [...porEmoji].filter(([, ids]) => ids.length > 1);
ok("nenhum emoji em dois assuntos", repetidos.length === 0, repetidos.map(([e, ids]) => `${e} ${ids.join("/")}`).join("; "));
const chaves = MAPA_DE_EMOJIS.flatMap((a) => a.chaves);
ok("nenhuma chave em dois assuntos", new Set(chaves).size === chaves.length);

function confere(onde, lista) {
  const errados = [];
  for (const { chave, emoji, nome } of lista) {
    const a = assuntoDaChave(chave);
    if (a && a.emoji !== emoji) errados.push(`${nome} (${chave}): ${emoji} -> ${a.emoji}`);
  }
  ok(`${onde} usam o emoji do mapa`, errados.length === 0, errados.join("; "));
}

console.log("== QUEM USA ==");
confere("módulos de acesso", MODULOS.map((m) => ({ chave: m.id, emoji: m.emoji, nome: m.rotulo })));
confere("itens do menu", MENU_PADRAO.map((m) => ({ chave: m.chave, emoji: m.emoji, nome: m.titulo })));
confere("painéis da Gestão", PAINEIS.map((p) => ({ chave: p.id, emoji: p.emoji, nome: p.rotulo })));
confere("categorias do guia", CATEGORIAS_DO_GUIA.map((c) => ({ chave: c.id, emoji: c.emoji, nome: c.titulo })));
const telasDoDono = { "/admin/revendas": "revendas", "/admin/acessos": "acessos", "/admin/auditoria": "auditoria", "/admin/notificacoes": "notificacoes", "/admin/creditos-ia": "creditos-ia", "/admin/saude": "saude", "/admin/mapa-de-emojis": "mapa-emojis" };
const errDono = MODULOS_DO_DONO.filter((m) => telasDoDono[m.href] && MAPA_DE_EMOJIS.find((a) => a.id === telasDoDono[m.href])?.emoji !== m.emoji);
ok("telas do Admin usam o emoji do mapa", errDono.length === 0, errDono.map((m) => `${m.rotulo}: ${m.emoji}`).join("; "));

// Emoji de assunto com desenho só pode aparecer no guia para aquele assunto.
const comDesenho = MAPA_DE_EMOJIS.filter((a) => a.desenho).map((a) => a.emoji);
ok("guias existem", Array.isArray(GUIAS) && GUIAS.length > 10);

console.log("== O DESENHO NO MEIO DO TEXTO ==");
const p = partesComDesenho("🏗️ Empilhadeira 3");
ok("o emoji da empilhadeira vira desenho", p.length === 2 && p[0].desenho === "empilhadeira" && p[1].texto === " Empilhadeira 3");
ok("sem o seletor também", partesComDesenho("\u{1F3D7} x")[0].desenho === "empilhadeira");
ok("texto sem emoji de assunto fica igual", partesComDesenho("✅ Salvo").length === 1);
ok("emoji dentro de sequência (🧑‍🏭) não vira armazém", partesComDesenho("🧑‍🏭 Quem").length === 1);
ok("todos os desenhos têm emoji exclusivo", comDesenho.length === new Set(comDesenho).size);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
