// Confere o guia "Como Fazer": o conteúdo é texto escrito à mão, e um
// slug repetido, um "veja também" para um guia que não existe ou uma
// permissão com o nome errado só apareceriam na tela, para o usuário.
//   npx tsx src/lib/__testes__/guia.teste.mjs
import { GUIAS, CATEGORIAS_DO_GUIA, guiaCombina, guiasParaQuem, guiaPorSlug, pedacosDoTexto } from "../guia.ts";
import { MODULOS } from "../acessos.ts";
import { BLOCOS_DO_MENU, MENU_PADRAO } from "../menu.ts";

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (!cond) falhas++;
  console.log(`  ${cond ? "OK " : "FALHOU"}  ${nome}${detalhe ? ": " + detalhe : ""}`);
}
function eq(nome, obtido, esperado) {
  const bom = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bom) falhas++;
  console.log(`  ${bom ? "OK " : "FALHOU"}  ${nome}: obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`);
}

console.log("== CONTEÚDO ==");
const slugs = GUIAS.map((g) => g.slug);
ok("slugs únicos", new Set(slugs).size === slugs.length);
ok("slug só com letras minúsculas, números e hífen", slugs.every((s) => /^[a-z0-9-]+$/.test(s)), slugs.join(", "));

const categorias = new Set(CATEGORIAS_DO_GUIA.map((c) => c.id));
const semCategoria = GUIAS.filter((g) => !categorias.has(g.categoria)).map((g) => g.slug);
ok("toda categoria existe", semCategoria.length === 0, semCategoria.join(", "));

const modulos = new Map(MODULOS.map((m) => [m.id, m]));
const permissoesErradas = GUIAS.flatMap((g) =>
  (g.exige ?? [])
    .filter(([m, a]) => !modulos.has(m) || !modulos.get(m).acoes.includes(a))
    .map(([m, a]) => `${g.slug}: ${m}/${a}`),
);
ok("toda permissão exigida existe no módulo", permissoesErradas.length === 0, permissoesErradas.join("; "));

const relacionadosQuebrados = GUIAS.flatMap((g) =>
  (g.relacionados ?? []).filter((s) => !slugs.includes(s) || s === g.slug).map((s) => `${g.slug} -> ${s}`),
);
ok("todo 'veja também' aponta para outro guia que existe", relacionadosQuebrados.length === 0, relacionadosQuebrados.join("; "));

const telasErradas = GUIAS.filter((g) => g.tela && !g.tela.href.startsWith("/")).map((g) => g.slug);
ok("atalho da tela é endereço do app", telasErradas.length === 0, telasErradas.join(", "));

const vazios = GUIAS.filter((g) => g.passos.length < 2).map((g) => g.slug);
ok("todo guia tem ao menos 2 passos", vazios.length === 0, vazios.join(", "));

// Negrito mal fechado ("toque em **Salvar") apareceria com os asteriscos na tela.
const textos = GUIAS.flatMap((g) => [
  ...g.passos.flatMap((p) => [p.texto, p.dica ?? ""]),
  ...(g.antes ?? []),
  ...(g.atencao ?? []),
]);
const asteriscoSolto = textos.filter((t) => (t.match(/\*\*/g) ?? []).length % 2 !== 0);
ok("todo ** abre e fecha", asteriscoSolto.length === 0, asteriscoSolto.join(" | "));

console.log("== NEGRITO ==");
eq("divide o texto", pedacosDoTexto("toque em **Salvar** agora"), [
  { texto: "toque em ", negrito: false },
  { texto: "Salvar", negrito: true },
  { texto: " agora", negrito: false },
]);
eq("texto sem negrito", pedacosDoTexto("nada"), [{ texto: "nada", negrito: false }]);

console.log("== BUSCA ==");
const lideranca = guiaPorSlug("tornar-lideranca");
ok("o exemplo do dono existe", !!lideranca);
ok("acha sem acento", guiaCombina(lideranca, "lideranca"));
ok("acha pelo sinônimo", guiaCombina(lideranca, "promover"));
ok("acha com maiúscula", guiaCombina(lideranca, "LIDERANÇA"));
ok("todas as palavras precisam bater", !guiaCombina(lideranca, "liderança escala"));
ok("busca vazia mostra tudo", guiaCombina(lideranca, "   "));

console.log("== QUEM VÊ O QUÊ ==");
const doColaborador = guiasParaQuem(() => false).map((g) => g.slug);
ok("colaborador vê o primeiro acesso", doColaborador.includes("primeiro-acesso"));
ok("colaborador NÃO vê como tornar liderança", !doColaborador.includes("tornar-lideranca"));
ok("colaborador NÃO vê como cadastrar gente", !doColaborador.includes("cadastrar-colaborador"));

const soPromover = guiasParaQuem((m, a) => m === "colaboradores" && a === "promover").map((g) => g.slug);
ok("quem pode promover vê o guia da liderança", soPromover.includes("tornar-lideranca"));
ok("quem pode promover NÃO vê como remover", !soPromover.includes("remover-colaborador"));

const soAcessos = guiasParaQuem((m, a) => m === "acessos" && a === "editar").map((g) => g.slug);
ok("basta UMA das permissões (acessos/editar)", soAcessos.includes("tornar-lideranca"));
eq("o dono vê todos", guiasParaQuem(() => true).length, GUIAS.length);

// O operador recebe a tela do armazém como módulo do app ("ver").
const operadorReepack = guiasParaQuem((m, a) => m === "pa-reepack" && a === "ver").map((g) => g.slug);
ok("operador do Reepack vê como lançar reepack", operadorReepack.includes("lancar-reepack"));
ok("operador do Reepack NÃO vê o despejo", !operadorReepack.includes("lancar-despejo"));
ok("operador do Reepack NÃO vê o cadastro de produto", !operadorReepack.includes("cadastrar-produto-armazem"));

const gestorArmazem = guiasParaQuem((m, a) => m === "produtividade-armazem" && a === "editar").map((g) => g.slug);
// Os guias das telas do operador (Reepack, Despejo...). O FEFO fica de
// fora de propósito: ele tem permissão própria, e quem administra o
// armazém sem ela não abre a tela.
const doArmazem = GUIAS.filter((g) => (g.exige ?? []).some(([m]) => m === "produtividade-armazem")).map((g) => g.slug);
ok("quem administra o armazém vê todos os guias das telas do armazém", doArmazem.every((s) => gestorArmazem.includes(s)));
ok("FEFO segue a permissão própria, não a do armazém", !gestorArmazem.includes("tratar-quebra-fefo"));

const informaFefo = guiasParaQuem((m, a) => m === "fefo" && a === "ver").map((g) => g.slug);
ok("quem informa FEFO vê como informar", informaFefo.includes("informar-quebra-fefo"));
ok("quem informa FEFO NÃO vê o controle", !informaFefo.includes("tratar-quebra-fefo"));

const contaAg = guiasParaQuem((m, a) => m === "ativo-giro" && a === "ver").map((g) => g.slug);
ok("quem conta o AG vê contagem e recontagem", contaAg.includes("contar-ativo-giro") && contaAg.includes("recontar-ativo-giro"));
ok("quem conta o AG NÃO vê conciliar nem pedir recontagem", !contaAg.includes("conciliar-ativo-giro") && !contaAg.includes("pedir-recontagem-ativo-giro"));

const empilhador = guiasParaQuem((m, a) => m === "pa-empilhadeira" && a === "ver").map((g) => g.slug);
ok("empilhador vê como buscar o pedido", empilhador.includes("buscar-pedido-picking"));
ok("empilhador NÃO vê como pedir (é do picking)", !empilhador.includes("pedir-abastecimento"));

const auditor = guiasParaQuem((m, a) => m === "5s" && a === "ver").map((g) => g.slug);
ok("auditor vê como auditar", auditor.includes("fazer-auditoria-5s"));
ok("auditor NÃO vê como validar ação", !auditor.includes("validar-acao-5s"));
ok("auditor NÃO vê a configuração do 5S", !auditor.includes("configurar-5s"));

// O motorista recebe Minha Rota e Comprovante como módulos do app ("ver").
const motorista = guiasParaQuem((m, a) => (m === "rotas" || m === "qr-contingencia") && a === "ver").map((g) => g.slug);
ok("motorista vê consultar rota e registrar comprovante", motorista.includes("consultar-minha-rota") && motorista.includes("registrar-comprovante"));
ok("motorista NÃO vê conferir, configurar PIX nem atualizar pré-rota",
  !motorista.includes("conferir-comprovantes") && !motorista.includes("configurar-pix") && !motorista.includes("atualizar-pre-rota"));
const conferente = guiasParaQuem((m, a) => m === "qr-contingencia" && a === "criar").map((g) => g.slug);
ok("quem confere vê conferir, mas não configurar o PIX", conferente.includes("conferir-comprovantes") && !conferente.includes("configurar-pix"));

console.log("== MENU ==");
ok("cartão Como Fazer no menu padrão", MENU_PADRAO.some((i) => i.chave === "guia" && i.href === "/guia" && i.visivel));
ok("cartão Como Fazer está num bloco", BLOCOS_DO_MENU.some((b) => b.chaves.includes("guia")));

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
