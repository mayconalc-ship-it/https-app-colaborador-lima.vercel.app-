// De onde vem cada acesso, na ficha da pessoa (05/10/2026). A ficha
// TRAVA o que vem do perfil e deixa livre o que e individual -- um erro
// aqui faria o perfil "sumir" de quem esta nele, ou deixaria tirar a mao o
// que o proximo salvar do perfil devolveria. A lista de pessoas usa a mesma
// conta para dizer quem esta "fora do perfil".
//   npx tsx src/lib/__testes__/ficha-de-acesso.teste.mjs
import {
  perfisQueDaoPermissao,
  perfisQueDaoModulo,
  resumoDeOrigem,
  normalizar,
} from "../ficha-de-acesso.ts";

let falhas = 0;
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}${bom ? "" : `: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

const conferente = { id: "p1", nome: "Conferente", tipo: "lideranca" };
const jornal = { id: "p2", nome: "Jornal", tipo: "lideranca" };
const motorista = { id: "p3", nome: "Motorista", tipo: "colaborador" };
const conteudo = {
  concessoes: new Map([
    ["p1", ["refugo:criar", "rating:ver"]],
    ["p2", ["comunicados:ver", "comunicados:criar"]],
  ]),
  modulosApp: new Map([["p3", ["escala", "rv"]]]),
};

console.log("== A ORIGEM DE UMA PERMISSAO ==");
eq("permissao do perfil aponta o perfil", perfisQueDaoPermissao("refugo:criar", [conferente], conteudo), ["Conferente"]);
eq("perfil que a pessoa NAO tem nao conta", perfisQueDaoPermissao("refugo:criar", [jornal], conteudo), []);
// O "ver" ligado por coerencia (quem cria precisa abrir a tela) e do
// perfil, e nao uma excecao que alguem liberou a mao.
eq("ver de modulo que o perfil administra vem do perfil", perfisQueDaoPermissao("refugo:ver", [conferente], conteudo), ["Conferente"]);
eq("dois perfis que dao a mesma coisa aparecem os dois",
  perfisQueDaoPermissao("rating:ver", [conferente, { ...jornal, id: "p1" }], conteudo), ["Conferente", "Jornal"]);
eq("perfil de colaborador nao da permissao de lideranca",
  perfisQueDaoPermissao("escala:ver", [motorista], { ...conteudo, concessoes: new Map([["p3", ["escala:ver"]]]) }), []);

console.log("\n== A ORIGEM DE UM MODULO DO APP ==");
eq("modulo do perfil de colaborador aponta o perfil", perfisQueDaoModulo("escala", [motorista], conteudo), ["Motorista"]);
eq("perfil de lideranca nao da modulo do app", perfisQueDaoModulo("escala", [conferente], conteudo), []);

console.log("\n== INDIVIDUAIS E FALTANDO ==");
const r = resumoDeOrigem({
  ehLideranca: true,
  modulosApp: ["escala", "ranking"],
  permissoes: ["refugo:criar", "refugo:ver", "padroes:ver"],
  perfis: [conferente, motorista],
  conteudo,
});
eq("modulo do app fora do perfil e individual", r.individuaisApp, ["ranking"]);
eq("permissao fora do perfil e individual (o ver por coerencia nao)", r.individuaisPermissoes, ["padroes:ver"]);
eq("modulo do perfil que a pessoa nao tem esta faltando", r.faltandoApp, ["rv"]);
eq("permissao do perfil que a pessoa nao tem esta faltando", r.faltandoPermissoes, ["rating:ver"]);

// Colaborador: as permissoes de lideranca ficam guardadas mas nao valem --
// conta-las diria que ele esta "fora do perfil" por algo que nem usa.
const colab = resumoDeOrigem({
  ehLideranca: false,
  modulosApp: ["escala"],
  permissoes: ["padroes:ver"],
  perfis: [conferente, motorista],
  conteudo,
});
eq("colaborador: permissao de lideranca nao e individual", colab.individuaisPermissoes, []);
eq("colaborador: perfil de lideranca nao fica faltando", colab.faltandoPermissoes, []);

// Modulo desligado na revenda nao aparece na ficha -- nao pode contar.
const desligado = resumoDeOrigem({
  ehLideranca: false,
  modulosApp: ["escala", "ranking"],
  permissoes: [],
  perfis: [motorista],
  conteudo,
  modulosDaRevenda: new Set(["escala"]),
});
eq("modulo desligado na revenda nao conta como individual", desligado.individuaisApp, []);
eq("modulo desligado na revenda nao conta como faltando", desligado.faltandoApp, []);

console.log("\n== A BUSCA ==");
eq("busca ignora acento e maiuscula", normalizar("Gestão de AÇÕES"), "gestao de acoes");

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
