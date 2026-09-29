// O ARMAZÉM PELO PPR: a conta do app tem de dar o MESMO quadro da planilha
// "PPR armazém 2026.xlsm" de São Félix (abas Inputs Armazem Plan e
// Dimensionamento Plan), mês a mês, turno a turno.
//   npx tsx src/lib/__testes__/mao-de-obra-armazem.teste.mjs
import * as L from "../mao-de-obra.ts";

const dias = [26, 24, 26, 23, 26, 25, 26, 27, 25, 26, 24, 25];
const volume = [11084, 8484, 8120, 8611, 10161, 10191, 10651, 9694, 11705, 11850, 12450, 12590];
const puxFF = [151, 128, 131, 137, 143, 137, 136, 127, 132, 150, 147, 161];
const spotRet = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8];
const mix = [0.465381419886258, 0.535905315892726, 0.602455946831485, 0.572319629023645, 0.555193816350785, 0.576274875976576, 0.579138031357261, 0.621714780793381, 0.595695249903954, 0.529027459867218, 0.536977304880283, 0.468065258464301];
const ajuste = [1, 1, 1, 2, 2, 2, 2, 2, 2, 0, 0, 0];
const esperado = {
  op: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6],
  aj: [17, 18, 17, 20, 18, 18, 18, 18, 20, 17, 19, 18],
  am: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5],
  cf: [5, 4, 4, 4, 5, 5, 5, 4, 5, 5, 5, 6],
  cfTurnos: [[1.5, 1.3, 1.4], [1.4, 1.2, 1.3], [1.3, 1.2, 1.3], [1.4, 1.3, 1.3], [1.5, 1.3, 1.3], [1.5, 1.3, 1.4], [1.5, 1.3, 1.4], [1.4, 1.2, 1.2], [1.6, 1.3, 1.4], [1.6, 1.3, 1.4], [1.7, 1.4, 1.5], [1.8, 1.6, 2.1]],
  ajTurnos: [[5, 4, 7], [5, 5, 7], [5, 4, 7], [5, 5, 8], [5, 4, 7], [5, 4, 7], [5, 4, 7], [5, 4, 7], [6, 5, 7], [6, 4, 7], [6, 5, 8], [6, 5, 7]],
};
// Minutos do operador (Jan e Out) na planilha, para conferir por turno.
const minOp = { 0: [357.788313302371, 215.135395166141, 347.973715666333], 9: [380.884674000497, 225.113413450378, 362.242314559408] };
const minCf = { 0: [559.215805002834, 539.569345934719, 582.756560099696], 9: [579.217466282731, 545.802424242965, 594.090570114274] };

const cfg = { ...L.CONFIG_PADRAO, armazem: { ...L.ARMAZEM_PADRAO } };
let erros = 0;
const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
for (let i = 0; i < 12; i++) {
  const m = {
    ...L.MES_VAZIO,
    competencia: `2026-${String(i + 1).padStart(2, "0")}`,
    dias_totais: dias[i],
    volume_ppr: volume[i],
    arm_viagens_puxada_ff: puxFF[i],
    arm_spot_retornavel_dia: spotRet[i],
    arm_spot_descartavel_dia: 0,
    arm_pallets_retornaveis: 3080.35350812456,
    arm_mix_retornavel: mix[i] * 100,
    arm_alta_temporada: 0,
    arm_ajuste_ferias: ajuste[i],
  };
  const a = L.contaArmazem(m, cfg);
  const t = (f) => L.TURNOS_DO_ARMAZEM.map((x) => f.turnos[x].pessoas);
  const got = { op: a.operadores, aj: a.ajudantes, am: a.amarracoes, cf: a.conferentes };
  const ok = got.op === esperado.op[i] && got.aj === esperado.aj[i] && got.am === esperado.am[i] && got.cf === esperado.cf[i];
  const okT = JSON.stringify(t(a.conferente)) === JSON.stringify(esperado.cfTurnos[i]) && JSON.stringify(t(a.ajudante)) === JSON.stringify(esperado.ajTurnos[i]);
  if (!ok || !okT) erros++;
  console.log(
    `${nomes[i]} ${ok && okT ? "OK " : "DIF"} op ${got.op}/${esperado.op[i]} aj ${got.aj}/${esperado.aj[i]} [${t(a.ajudante)}|${esperado.ajTurnos[i]}] am ${got.am}/${esperado.am[i]} cf ${got.cf}/${esperado.cf[i]} [${t(a.conferente)}|${esperado.cfTurnos[i]}]`,
  );
  if (minOp[i]) {
    const s = L.TURNOS_DO_ARMAZEM.map((x) => a.operador.turnos[x].soma.toFixed(2));
    const c = L.TURNOS_DO_ARMAZEM.map((x) => a.conferente.turnos[x].soma.toFixed(2));
    console.log(`   min operador ${s} | planilha ${minOp[i].map((v) => v.toFixed(2))}`);
    console.log(`   min conferente ${c} | planilha ${minCf[i].map((v) => v.toFixed(2))}`);
  }
}
console.log(erros === 0 ? "\nTUDO BATE COM O PPR" : `\n${erros} mês(es) com diferença`);
if (erros > 0) process.exit(1);
