/**
 * A ANÁLISE DO PAINEL DE ANOMALIAS (03/10/2026).
 *
 * Pedido do dono: "hoje não aparece nada ao entrar" -- a tela abria com
 * sete números e um "toque num cartão". Os números diziam o QUE está
 * aberto; faltava dizer COMO estamos. Esta análise responde, de cima para
 * baixo, as perguntas da reunião:
 *
 *   1. Está tudo em dia?                    -> o termômetro (uma frase)
 *   2. Estamos melhorando ou piorando?      -> 30 dias x 30 anteriores, e
 *                                              as últimas 8 semanas
 *   3. Respondemos rápido?                  -> dias até assinar o relato
 *   4. O plano anda?                        -> % das ações no prazo
 *   5. Onde o ciclo para?                   -> relatos por etapa
 *   6. O que mais dispara, e qual carreta?  -> os rankings
 *
 * Só as contas aqui, sem banco e sem tela:
 *   npx tsx src/lib/__testes__/anomalias-analise.teste.mjs
 */

export type RelatoDaAnalise = {
  indicadorRotulo: string;
  dia: string; // dia do disparo, ISO curto
  status: string;
  abertoEm: string;
  assinadoEm: string | null;
  atendimentoId: string | null;
};

export type AcaoDaAnalise = { status: string; prazo: string | null };
export type BlitzDaAnalise = { atendimentoId: string; criadoEm: string };

export type Tom = "bom" | "atencao" | "ruim";

export type Analise = {
  termometro: { tom: Tom; titulo: string; detalhe: string };
  ultimos30: number;
  anteriores30: number;
  diasAteAssinar: number | null;
  assinadosNaConta: number;
  pctAcoesNoPrazo: number | null;
  acoesAbertas: number;
  semanas: { rotulo: string; inicio: string; total: number }[];
  ciclo: { rotulo: string; valor: number }[];
  indicadores: { rotulo: string; valor: number }[];
  placas: { rotulo: string; valor: number; nota: string }[];
};

const DIA = 86_400_000;
const meioDia = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
const somar = (iso: string, dias: number) => new Date(meioDia(iso) + dias * DIA).toISOString().slice(0, 10);
const diaSP = (ts: string) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** A segunda-feira da semana do dia (semana de seg a dom). */
export function segundaDe(iso: string) {
  const d = new Date(meioDia(iso));
  const desde = (d.getUTCDay() + 6) % 7; // seg = 0
  return somar(iso, -desde);
}

export const ETAPAS: { status: string; rotulo: string }[] = [
  { status: "aberto", rotulo: "Disparou, ninguém pegou" },
  { status: "em_analise", rotulo: "Em análise (5 porquês)" },
  { status: "plano_definido", rotulo: "Plano definido" },
  { status: "concluido", rotulo: "Concluído (assinado)" },
  { status: "eficacia_verificada", rotulo: "Eficácia verificada" },
];

export function analisar(
  relatos: RelatoDaAnalise[],
  acoes: AcaoDaAnalise[],
  blitz: BlitzDaAnalise[],
  placaDe: Map<string, string>,
  hoje: string,
): Analise {
  // ---- Tendência: 30 dias x 30 anteriores ----
  const corte30 = somar(hoje, -29);
  const corte60 = somar(hoje, -59);
  const ultimos30 = relatos.filter((r) => r.dia >= corte30 && r.dia <= hoje).length;
  const anteriores30 = relatos.filter((r) => r.dia >= corte60 && r.dia < corte30).length;

  // ---- As últimas 8 semanas (a atual incluída), da mais antiga à atual ----
  const estaSemana = segundaDe(hoje);
  const semanas = Array.from({ length: 8 }, (_, i) => {
    const inicio = somar(estaSemana, -7 * (7 - i));
    const fim = somar(inicio, 6);
    const [, m, d] = inicio.split("-");
    return { rotulo: `${d}/${m}`, inicio, total: relatos.filter((r) => r.dia >= inicio && r.dia <= fim).length };
  });

  // ---- Rapidez: dias do disparo até a assinatura (últimos 90 dias) ----
  const corte90 = somar(hoje, -89);
  const assinados = relatos.filter((r) => r.assinadoEm && diaSP(r.assinadoEm) >= corte90);
  const diasAteAssinar = assinados.length
    ? Math.round(
        (assinados.reduce((t, r) => t + Math.max(0, (Date.parse(r.assinadoEm!) - Date.parse(r.abertoEm)) / DIA), 0) /
          assinados.length) *
          10,
      ) / 10
    : null;

  // ---- O plano anda: das ações em aberto, quantas não venceram ----
  const abertas = acoes.filter((a) => a.status !== "concluida");
  const vencidas = abertas.filter((a) => a.prazo && a.prazo < hoje).length;
  const pctAcoesNoPrazo = abertas.length ? Math.round(((abertas.length - vencidas) / abertas.length) * 100) : null;

  // ---- Onde para: relatos por etapa, na ordem do ciclo ----
  const ciclo = ETAPAS.map((e) => ({ rotulo: e.rotulo, valor: relatos.filter((r) => r.status === e.status).length }));

  // ---- O que mais dispara (90 dias) ----
  const porIndicador = new Map<string, number>();
  for (const r of relatos) if (r.dia >= corte90) porIndicador.set(r.indicadorRotulo, (porIndicador.get(r.indicadorRotulo) ?? 0) + 1);
  const indicadores = [...porIndicador.entries()]
    .map(([rotulo, valor]) => ({ rotulo, valor }))
    .sort((a, b) => b.valor - a.valor || a.rotulo.localeCompare(b.rotulo));

  // ---- As carretas que mais aparecem (90 dias): relato de DT + blitz ----
  const porPlaca = new Map<string, { relatos: number; blitz: number }>();
  const contar = (atendimentoId: string, campo: "relatos" | "blitz") => {
    const placa = placaDe.get(atendimentoId);
    if (!placa) return;
    const atual = porPlaca.get(placa) ?? { relatos: 0, blitz: 0 };
    atual[campo]++;
    porPlaca.set(placa, atual);
  };
  for (const r of relatos) if (r.atendimentoId && r.dia >= corte90) contar(r.atendimentoId, "relatos");
  for (const b of blitz) if (diaSP(b.criadoEm) >= corte90) contar(b.atendimentoId, "blitz");
  const placas = [...porPlaca.entries()]
    .map(([rotulo, c]) => ({
      rotulo,
      valor: c.relatos + c.blitz,
      nota: [c.relatos && `${c.relatos} relato${c.relatos > 1 ? "s" : ""}`, c.blitz && `${c.blitz} blitz`].filter(Boolean).join(" · "),
    }))
    .sort((a, b) => b.valor - a.valor || a.rotulo.localeCompare(b.rotulo))
    .slice(0, 5);

  // ---- O termômetro: a frase do topo ----
  const semDono = relatos.filter((r) => r.status === "aberto");
  const maisAntigo = semDono.length
    ? Math.max(...semDono.map((r) => Math.round((meioDia(hoje) - meioDia(diaSP(r.abertoEm))) / DIA)))
    : 0;
  const emAndamento = relatos.filter((r) => r.status === "em_analise" || r.status === "plano_definido").length;

  let termometro: Analise["termometro"];
  if (semDono.length || vencidas) {
    const partes = [
      semDono.length &&
        `${semDono.length} ${semDono.length === 1 ? "relato sem ninguém" : "relatos sem ninguém"}${maisAntigo > 0 ? ` (o mais antigo há ${maisAntigo} dia${maisAntigo > 1 ? "s" : ""})` : ""}`,
      vencidas && `${vencidas} ${vencidas === 1 ? "ação atrasada" : "ações atrasadas"}`,
    ].filter(Boolean);
    termometro = {
      tom: "ruim",
      titulo: "Precisa de atenção",
      detalhe: `${partes.join(" e ")}. Comece pelos cartões em vermelho.`,
    };
  } else if (emAndamento) {
    termometro = {
      tom: "atencao",
      titulo: "Andando",
      detalhe: `${emAndamento} ${emAndamento === 1 ? "relato em tratativa" : "relatos em tratativa"}, nada atrasado. Acompanhe os prazos do plano.`,
    };
  } else {
    termometro = {
      tom: "bom",
      titulo: "Tudo em dia",
      detalhe: "Nenhum relato esperando e nenhuma ação vencida.",
    };
  }

  return {
    termometro,
    ultimos30,
    anteriores30,
    diasAteAssinar,
    assinadosNaConta: assinados.length,
    pctAcoesNoPrazo,
    acoesAbertas: abertas.length,
    semanas,
    ciclo,
    indicadores,
    placas,
  };
}
