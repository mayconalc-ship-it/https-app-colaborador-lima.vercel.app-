// Confere o motor contra os exemplos da spec, ANTES de ligar na tela.
// Usa tsx para importar o .ts direto.
import { montarCiclos, resumirPorOperador, resumirPorMaquina } from "../empilhadeira-gas.ts";

const numeros = new Map([["m2", "02"]]);
let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = Math.abs(obtido - esperado) < 0.005;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK " : "FALHOU"}  ${nome}: obtido ${obtido}, esperado ${esperado}`);
}

console.log("== EXEMPLO DA SPEC (itens 2 a 5): Joao 3h, Pedro 5h, 1 P20 ==");
let ciclos = montarCiclos(
  [
    { id: "t1", empilhadeiraId: "m2", operadorNome: "Ana", horimetro: 1250, realizadaEm: "2026-08-01T08:00:00Z" },
    { id: "t2", empilhadeiraId: "m2", operadorNome: "Pedro", horimetro: 1258, realizadaEm: "2026-08-01T16:00:00Z" },
  ],
  [
    { id: "s1", empilhadeiraId: "m2", operadorId: "joao", operadorNome: "Joao", horimetroInicial: 1250, horimetroFinal: 1253, inicio: "", fim: "" },
    { id: "s2", empilhadeiraId: "m2", operadorId: "pedro", operadorNome: "Pedro", horimetroInicial: 1253, horimetroFinal: 1258, inicio: "", fim: "" },
  ],
  numeros,
);
let c = ciclos[0];
console.log(`  ciclos gerados: ${ciclos.length} (a 1a troca nao vira ciclo -- item 18)`);
conferir("horas do ciclo", c.horas, 8);
conferir("Joao P20", c.porOperador.find((o) => o.operadorId === "joao").p20Equivalente, 0.375);
conferir("Pedro P20", c.porOperador.find((o) => o.operadorId === "pedro").p20Equivalente, 0.625);
conferir("soma fecha em 1 P20", c.porOperador.reduce((s, o) => s + o.p20Equivalente, 0) + c.p20NaoIdentificado, 1);
const res = resumirPorOperador(ciclos);
conferir("eficiencia Joao (h/P20)", res.find((r) => r.operadorId === "joao").horasPorP20, 8);
conferir("eficiencia Pedro (h/P20)", res.find((r) => r.operadorId === "pedro").horasPorP20, 8);

console.log("\n== ITEM 6: tres operadores, o da troca NAO leva tudo ==");
ciclos = montarCiclos(
  [
    { id: "t1", empilhadeiraId: "m2", operadorNome: "X", horimetro: 100, realizadaEm: "2026-08-01T08:00:00Z" },
    { id: "t2", empilhadeiraId: "m2", operadorNome: "Carlos", horimetro: 108, realizadaEm: "2026-08-01T16:00:00Z" },
  ],
  [
    { id: "s1", empilhadeiraId: "m2", operadorId: "joao", operadorNome: "Joao", horimetroInicial: 100, horimetroFinal: 102, inicio: "", fim: "" },
    { id: "s2", empilhadeiraId: "m2", operadorId: "pedro", operadorNome: "Pedro", horimetroInicial: 102, horimetroFinal: 105, inicio: "", fim: "" },
    { id: "s3", empilhadeiraId: "m2", operadorId: "carlos", operadorNome: "Carlos", horimetroInicial: 105, horimetroFinal: 108, inicio: "", fim: "" },
  ],
  numeros,
);
c = ciclos[0];
conferir("Joao 25%", c.porOperador.find((o) => o.operadorId === "joao").fracao * 100, 25);
conferir("Pedro 37,5%", c.porOperador.find((o) => o.operadorId === "pedro").fracao * 100, 37.5);
conferir("Carlos 37,5%", c.porOperador.find((o) => o.operadorId === "carlos").fracao * 100, 37.5);

console.log("\n== ITEM 7: horimetro nao fecha (Joao 3h + Pedro 4,5h de 8h) ==");
ciclos = montarCiclos(
  [
    { id: "t1", empilhadeiraId: "m2", operadorNome: "X", horimetro: 1250, realizadaEm: "2026-08-01T08:00:00Z" },
    { id: "t2", empilhadeiraId: "m2", operadorNome: "Y", horimetro: 1258, realizadaEm: "2026-08-01T16:00:00Z" },
  ],
  [
    { id: "s1", empilhadeiraId: "m2", operadorId: "joao", operadorNome: "Joao", horimetroInicial: 1250, horimetroFinal: 1253, inicio: "", fim: "" },
    { id: "s2", empilhadeiraId: "m2", operadorId: "pedro", operadorNome: "Pedro", horimetroInicial: 1253, horimetroFinal: 1257.5, inicio: "", fim: "" },
  ],
  numeros,
);
c = ciclos[0];
conferir("horas nao identificadas", c.horasNaoIdentificadas, 0.5);
console.log(`  status: ${c.status} (esperado: parcial)`);
conferir("nao identificado NAO foi para ninguem", c.porOperador.reduce((s, o) => s + o.horas, 0), 7.5);
conferir("total ainda fecha em 1 P20", c.porOperador.reduce((s, o) => s + o.p20Equivalente, 0) + c.p20NaoIdentificado, 1);

console.log("\n== SESSAO QUE ATRAVESSA A TROCA (nao esta na spec, mas acontece) ==");
ciclos = montarCiclos(
  [
    { id: "t1", empilhadeiraId: "m2", operadorNome: "X", horimetro: 100, realizadaEm: "2026-08-01T08:00:00Z" },
    { id: "t2", empilhadeiraId: "m2", operadorNome: "Y", horimetro: 110, realizadaEm: "2026-08-01T16:00:00Z" },
    { id: "t3", empilhadeiraId: "m2", operadorNome: "Z", horimetro: 120, realizadaEm: "2026-08-02T16:00:00Z" },
  ],
  [
    // Comeca no ciclo 1 e termina no ciclo 2: 4h no primeiro, 6h no segundo.
    { id: "s1", empilhadeiraId: "m2", operadorId: "joao", operadorNome: "Joao", horimetroInicial: 106, horimetroFinal: 116, inicio: "", fim: "" },
  ],
  numeros,
);
const c1 = ciclos.find((x) => x.horimetroInicial === 100);
const c2 = ciclos.find((x) => x.horimetroInicial === 110);
conferir("ciclo 1 recebe 4h do Joao", c1.porOperador[0].horas, 4);
conferir("ciclo 2 recebe 6h do Joao", c2.porOperador[0].horas, 6);
conferir("nenhum ciclo passa de 1 P20", Math.max(...ciclos.map((x) => x.porOperador.reduce((s, o) => s + o.p20Equivalente, 0))), 0.6);

console.log("\n== ITEM 19: troca sem nenhuma sessao ==");
ciclos = montarCiclos(
  [
    { id: "t1", empilhadeiraId: "m2", operadorNome: "X", horimetro: 200, realizadaEm: "2026-08-01T08:00:00Z" },
    { id: "t2", empilhadeiraId: "m2", operadorNome: "Y", horimetro: 209, realizadaEm: "2026-08-02T08:00:00Z" },
  ],
  [],
  numeros,
);
console.log(`  status: ${ciclos[0].status} (esperado: sem_sessoes)`);
const maq = resumirPorMaquina(ciclos);
conferir("maquina ainda conta o consumo (item 19)", maq[0].horasPorP20, 9);
conferir("mas nenhum operador entra", resumirPorOperador(ciclos).length, 0);

console.log(`\n${falhas === 0 ? "TODOS OS CASOS PASSARAM" : falhas + " FALHA(S)"}`);
process.exit(falhas === 0 ? 0 : 1);
