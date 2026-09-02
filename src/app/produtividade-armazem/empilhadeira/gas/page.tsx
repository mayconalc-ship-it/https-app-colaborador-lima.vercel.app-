import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { FiltroNoLugar } from "@/components/FiltroNoLugar";
import { ExportarCsv } from "@/components/ExportarCsv";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import {
  ROTULO_TURNO,
  diasAtrasISO,
  formatarDataHora,
  hojeISO,
  turnoAtual,
} from "@/lib/produtividade-armazem";
import {
  ORDENS_RANKING,
  ROTULO_GRANULARIDADE,
  ROTULO_ORDEM_RANKING,
  ROTULO_STATUS_CICLO,
  GRANULARIDADES,
  cicloContaParaMaquina,
  ehGranularidade,
  ehOrdemRanking,
  evolucaoDosCiclos,
  formatarNumeroBr,
  montarCiclos,
  operadoresDaMaquina,
  ordenarOperadores,
  resumirPorMaquina,
  resumirPorOperador,
  type SessaoUso,
  type TrocaGas,
} from "@/lib/empilhadeira-gas";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/**
 * Turnos que uma janela de tempo atravessa. Um buraco de madrugada
 * costuma cair inteiro na noite; um que cruza a virada aparece como
 * "noite e manhã" -- e aí a conversa é com os dois turnos.
 */
function descreverTurnos(desdeISO: string, ateISO: string) {
  const inicio = new Date(desdeISO);
  const fim = new Date(ateISO);
  const encontrados = new Set<string>();

  // Anda de hora em hora: barato (a janela é de horas, não de meses) e
  // pega a virada de turno sem precisar recriar as faixas aqui.
  for (let t = inicio.getTime(); t <= fim.getTime(); t += 3_600_000) {
    encontrados.add(ROTULO_TURNO[turnoAtual(new Date(t))]);
    if (encontrados.size === 3) break;
  }
  encontrados.add(ROTULO_TURNO[turnoAtual(fim)]);

  const lista = [...encontrados];
  if (lista.length === 1) return `turno da ${lista[0].toLowerCase()}`;
  return `turnos: ${lista.join(", ").toLowerCase()}`;
}

function Cartao({
  titulo,
  valor,
  legenda,
  alerta = false,
}: {
  titulo: string;
  valor: string;
  legenda?: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-2xl border p-3 shadow-sm ${
        alerta ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase leading-tight text-slate-500">{titulo}</p>
      <p className={`mt-1 text-xl font-extrabold ${alerta ? "text-amber-800" : "text-slate-900"}`}>{valor}</p>
      {legenda && <p className="mt-0.5 text-[11px] leading-tight text-slate-400">{legenda}</p>}
    </div>
  );
}

export default async function DashboardGasPage({
  searchParams,
}: {
  searchParams: Promise<{
    de?: string;
    ate?: string;
    maquina?: string;
    operador?: string;
    ordem?: string;
    granularidade?: string;
    /** Qual agrupamento fica aberto depois de filtrar. Ver FiltroNoLugar. */
    secao?: string;
  }>;
}) {
  await requireAcessoModulo("pa-empilhadeira");

  const sp = await searchParams;
  const de = sp.de ?? diasAtrasISO(29);
  const ate = sp.ate ?? hojeISO();
  const maquinaFiltro = (sp.maquina ?? "").trim();
  const operadorFiltro = (sp.operador ?? "").trim();
  const ordem = ehOrdemRanking(sp.ordem) ? sp.ordem : "horas";
  const granularidade = ehGranularidade(sp.granularidade) ? sp.granularidade : "dia";
  // Qual agrupamento continua aberto depois de aplicar um filtro.
  const secao = (sp.secao ?? "").trim();

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  // Período no fuso do Brasil -- a Vercel roda em UTC, e cortar pela data
  // crua jogaria o fim do turno da noite para o dia seguinte.
  const inicioPeriodo = new Date(`${de}T00:00:00-03:00`).toISOString();
  const fimPeriodo = new Date(`${ate}T23:59:59.999-03:00`).toISOString();

  const supabase = await createClient();
  const [{ data: maquinasBanco }, { data: trocasBanco }, { data: sessoesBanco }, { data: configBanco }] =
    await Promise.all([
      supabase.from("pa_empilhadeiras").select("id, numero").eq("revenda_id", revendaId).order("numero"),
      supabase
        .from("pa_empilhadeira_trocas_gas")
        .select("id, empilhadeira_id, operador_nome, horimetro, realizada_em")
        .eq("revenda_id", revendaId)
        .gte("realizada_em", inicioPeriodo)
        .lte("realizada_em", fimPeriodo)
        .order("horimetro"),
      // As sessões NÃO são cortadas pelo período: uma sessão pode ter
      // começado antes do recorte e cobrir horas do primeiro ciclo dele.
      // O corte de verdade é por faixa de horímetro, dentro do motor.
      supabase
        .from("pa_empilhadeira_operacoes")
        .select("id, empilhadeira_id, operador_id, operador_nome, horimetro_inicial, horimetro_final, inicio, fim")
        .eq("revenda_id", revendaId)
        .eq("status", "encerrada"),
      supabase.from("pa_empilhadeira_config").select("custo_p20").eq("revenda_id", revendaId).maybeSingle(),
    ]);

  const maquinas = (maquinasBanco ?? []) as { id: string; numero: string }[];
  const numeroDaMaquina = new Map(maquinas.map((m) => [m.id, m.numero]));
  const custoP20 = configBanco?.custo_p20 ?? null;

  const trocas: TrocaGas[] = ((trocasBanco ?? []) as Record<string, unknown>[])
    .filter((t) => !maquinaFiltro || t.empilhadeira_id === maquinaFiltro)
    .map((t) => ({
      id: t.id as string,
      empilhadeiraId: t.empilhadeira_id as string,
      operadorNome: t.operador_nome as string,
      horimetro: Number(t.horimetro),
      realizadaEm: t.realizada_em as string,
    }));

  const sessoes: SessaoUso[] = ((sessoesBanco ?? []) as Record<string, unknown>[]).map((s) => ({
    id: s.id as string,
    empilhadeiraId: s.empilhadeira_id as string,
    operadorId: s.operador_id as string,
    operadorNome: s.operador_nome as string,
    horimetroInicial: Number(s.horimetro_inicial),
    horimetroFinal: s.horimetro_final === null ? null : Number(s.horimetro_final),
    inicio: s.inicio as string,
    fim: (s.fim as string) ?? null,
  }));

  const ciclos = montarCiclos(trocas, sessoes, numeroDaMaquina);
  const porOperadorTodos = resumirPorOperador(ciclos);
  const porMaquina = resumirPorMaquina(ciclos);

  /**
   * Máquinas que TRABALHARAM mas não têm ciclo fechado.
   *
   * A lista acima é montada a partir de ciclos de P20, e um ciclo precisa
   * de DUAS trocas -- a primeira é só o ponto de partida. Uma máquina com
   * uma troca só (a 02, em 30/08/2026) sumia da tela inteira, apesar de
   * ter horas registradas. Sumir é pior que aparecer sem número: quem
   * olha conclui que a máquina não rodou.
   */
  const comCiclo = new Set(porMaquina.map((m) => m.empilhadeiraId));
  const horasSemCiclo = new Map<string, { horas: number; sessoes: number; trocas: number }>();
  for (const s of sessoes) {
    if (comCiclo.has(s.empilhadeiraId)) continue;
    if (s.horimetroFinal === null) continue;
    const atual = horasSemCiclo.get(s.empilhadeiraId) ?? { horas: 0, sessoes: 0, trocas: 0 };
    atual.horas += Math.max(s.horimetroFinal - s.horimetroInicial, 0);
    atual.sessoes++;
    horasSemCiclo.set(s.empilhadeiraId, atual);
  }
  for (const t of trocas) {
    const atual = horasSemCiclo.get(t.empilhadeiraId);
    if (atual) atual.trocas++;
  }
  const semCiclo = [...horasSemCiclo.entries()]
    .map(([id, v]) => ({ id, numero: numeroDaMaquina.get(id) ?? "—", ...v }))
    .sort((a, b) => b.horas - a.horas);
  const evolucao = evolucaoDosCiclos(ciclos, granularidade);

  // O filtro de operador afeta só as visões DELE. Os cartões e os ciclos
  // continuam mostrando a máquina inteira -- filtrar o consumo do ciclo
  // por pessoa daria um "total" que não é total de nada.
  const porOperador = operadorFiltro
    ? porOperadorTodos.filter((o) => o.operadorId === operadorFiltro)
    : porOperadorTodos;
  const rankingOperadores = ordenarOperadores(porOperador, ordem);
  const operadorEscolhido = operadorFiltro
    ? porOperadorTodos.find((o) => o.operadorId === operadorFiltro) ?? null
    : null;

  // ---- Cartões ----
  const validos = ciclos.filter(cicloContaParaMaquina);
  const horasTotais = validos.reduce((s, c) => s + c.horas, 0);
  const p20Total = validos.length;
  const mediaHorasPorP20 = p20Total > 0 ? horasTotais / p20Total : 0;
  const horasNaoIdentificadas = validos.reduce((s, c) => s + c.horasNaoIdentificadas, 0);
  const pctConfiavel = ciclos.length > 0 ? Math.round((validos.length / ciclos.length) * 100) : 100;

  const diasDoPeriodo = Math.max(
    1,
    Math.round((new Date(fimPeriodo).getTime() - new Date(inicioPeriodo).getTime()) / 86_400_000),
  );
  const p20PorDia = p20Total / diasDoPeriodo;

  const custoTotal = custoP20 !== null ? custoP20 * p20Total : null;
  const custoPorHora = custoTotal !== null && horasTotais > 0 ? custoTotal / horasTotais : null;

  const naoCalculados = ciclos.filter((c) => !cicloContaParaMaquina(c));
  const semSessoes = ciclos.filter((c) => c.status === "sem_sessoes");

  /**
   * Um ciclo por linha -- a base para conferir o consumo no Excel.
   *
   * Vai o STATUS junto, e não só os ciclos válidos: um ciclo descartado do
   * cálculo (horímetro que andou para trás, troca sem sessão) precisa
   * aparecer na planilha, senão a conta do arquivo não fecha com a da
   * tela e ninguém descobre por quê.
   *
   * As horas não identificadas também vão: são as horas que a máquina
   * rodou sem ninguém apontado, e é justamente delas que sai a conversa
   * sobre apontamento.
   */
  const csvCiclos = ciclos.map((c) => [
    c.empilhadeiraNumero,
    c.numero,
    c.abertoEm.slice(0, 10),
    c.fechadoEm.slice(0, 10),
    c.horimetroInicial,
    c.horimetroFinal,
    c.horas,
    c.horasAtribuidas,
    c.horasNaoIdentificadas,
    c.porOperador.map((o) => `${o.operadorNome}: ${o.horas.toFixed(1)}h`).join(" | "),
    c.trocadoPor,
    ROTULO_STATUS_CICLO[c.status],
    cicloContaParaMaquina(c),
  ]);

  return (
    <div>
      <PageHeader
        title="⛽ Consumo de gás P20"
        subtitle="Ciclo entre trocas, rateado pelas horas de cada operador."
        fecharHref="/produtividade-armazem/empilhadeira"
      />

      <form method="get" className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        <div className="min-w-0">
          <label className={rotulo} htmlFor="de">De</label>
          <input id="de" type="date" name="de" defaultValue={de} className={`${campo} sm:w-auto`} />
        </div>
        <div className="min-w-0">
          <label className={rotulo} htmlFor="ate">Até</label>
          <input id="ate" type="date" name="ate" defaultValue={ate} className={`${campo} sm:w-auto`} />
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:min-w-[10rem]">
          <label className={rotulo} htmlFor="maquina">Empilhadeira</label>
          <select id="maquina" name="maquina" defaultValue={maquinaFiltro} className={campo}>
            <option value="">Todas</option>
            {maquinas.map((m) => (
              <option key={m.id} value={m.id}>{m.numero}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:min-w-[10rem]">
          <label className={rotulo} htmlFor="operador">Operador</label>
          <select id="operador" name="operador" defaultValue={operadorFiltro} className={campo}>
            <option value="">Todos</option>
            {porOperadorTodos.map((o) => (
              <option key={o.operadorId} value={o.operadorId}>{o.operadorNome}</option>
            ))}
          </select>
        </div>
        <input type="hidden" name="ordem" value={ordem} />
        <input type="hidden" name="granularidade" value={granularidade} />
        <button
          type="submit"
          className="col-span-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white sm:col-span-1"
        >
          Filtrar
        </button>
        <div className="col-span-2 sm:col-span-1 sm:ml-auto">
          <ExportarCsv
            nome="ciclos-de-gas"
            complemento={`${de}_a_${ate}`}
            cabecalho={[
              "Empilhadeira",
              "Ciclo",
              "Aberto em",
              "Fechado em",
              "Horímetro inicial",
              "Horímetro final",
              "Horas do ciclo",
              "Horas atribuídas",
              "Horas sem apontamento",
              "Rateio por operador",
              "Trocado por",
              "Status",
              "Entra no cálculo",
            ]}
            linhas={csvCiclos}
            rotulo="Ciclos .csv"
          />
        </div>
      </form>

      {ciclos.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
          Nenhum ciclo fechado neste período. É preciso ter <strong>duas trocas</strong> da mesma
          empilhadeira para existir um ciclo — a primeira troca é só o ponto de partida.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Cartao titulo="P20 consumidos" valor={String(p20Total)} legenda={`${validos.length} ciclos fechados`} />
            <Cartao titulo="Horas trabalhadas" valor={`${formatarNumeroBr(horasTotais)}h`} legenda="pelo horímetro" />
            <Cartao
              titulo="Média horas/P20"
              valor={`${formatarNumeroBr(mediaHorasPorP20)} h`}
              legenda="quanto rende um botijão"
            />
            <Cartao titulo="P20 por dia" valor={formatarNumeroBr(p20PorDia, 2)} legenda={`em ${diasDoPeriodo} dias`} />
            <Cartao titulo="Empilhadeiras" valor={String(porMaquina.length)} legenda="com ciclo no período" />
            <Cartao titulo="Operadores" valor={String(porOperadorTodos.length)} legenda="com horas atribuídas" />
            <Cartao
              titulo="Ciclos confiáveis"
              valor={`${pctConfiavel}%`}
              legenda={naoCalculados.length > 0 ? `${naoCalculados.length} com horímetro inconsistente` : "todos calculados"}
              alerta={pctConfiavel < 100}
            />
            <Cartao
              titulo="Horas não identificadas"
              valor={`${formatarNumeroBr(horasNaoIdentificadas)}h`}
              legenda="sem sessão registrada"
              alerta={horasNaoIdentificadas > 0}
            />
            {custoTotal !== null && (
              <>
                <Cartao
                  titulo="Custo do gás"
                  valor={`R$ ${custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  legenda={`P20 a R$ ${custoP20?.toFixed(2)}`}
                />
                {custoPorHora !== null && (
                  <Cartao
                    titulo="Custo por hora"
                    valor={`R$ ${custoPorHora.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    legenda="por hora trabalhada"
                  />
                )}
              </>
            )}
          </div>

          {custoTotal === null && (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              💡 Cadastre o valor do P20 em <strong>Admin → Produtividade do Armazém → Empilhadeiras</strong> para
              ver o custo do gás e o custo por hora.
            </p>
          )}

          {semSessoes.length > 0 && (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              ⚠️ {semSessoes.length} ciclo(s) sem nenhuma sessão de utilização registrada. O consumo conta para a
              máquina, mas não entra na análise por operador — não há a quem atribuir.
            </p>
          )}

          {/* ---- Operador escolhido no filtro (item 12) ---- */}
          {operadorEscolhido && (
            <div className="mt-4 rounded-2xl border-2 border-primary bg-primary-soft p-4">
              <p className="text-sm font-bold text-primary-dark">👷 {operadorEscolhido.operadorNome}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Cartao titulo="Horas de uso" valor={`${formatarNumeroBr(operadorEscolhido.horas)}h`} />
                <Cartao titulo="P20 equivalente" valor={operadorEscolhido.p20Equivalente.toFixed(3)} />
                <Cartao
                  titulo="Média h/P20"
                  valor={operadorEscolhido.horasPorP20 !== null ? `${formatarNumeroBr(operadorEscolhido.horasPorP20)} h` : "—"}
                />
                <Cartao
                  titulo="Empilhadeiras"
                  valor={String(operadorEscolhido.empilhadeiras)}
                  legenda={`${operadorEscolhido.sessoes} participações em ciclo`}
                />
              </div>
              <p className="mt-2 text-xs text-primary-dark">
                Representa {formatarNumeroBr(operadorEscolhido.pctDoConsumo)}% do gás consumido no período.
              </p>
            </div>
          )}

          {/* ---- Ranking de operadores (item 10) ---- */}
          <details open={secao === "ranking"} className="mt-6 rounded-2xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
              🏆 Ranking de operadores ({rankingOperadores.length})
            </summary>
            <div className="border-t border-slate-100 p-4">
              <FiltroNoLugar secao="ranking" className="mb-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="de" value={de} />
                <input type="hidden" name="ate" value={ate} />
                <input type="hidden" name="maquina" value={maquinaFiltro} />
                <input type="hidden" name="operador" value={operadorFiltro} />
                <input type="hidden" name="granularidade" value={granularidade} />
                <div className="min-w-0 flex-1">
                  <label className={rotulo} htmlFor="ordem">Ordenar por</label>
                  <select id="ordem" name="ordem" defaultValue={ordem} className={campo}>
                    {ORDENS_RANKING.map((o) => (
                      <option key={o} value={o}>{ROTULO_ORDEM_RANKING[o]}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                  Aplicar
                </button>
              </FiltroNoLugar>

              {rankingOperadores.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum operador com horas atribuídas no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-xs">
                    <thead className="bg-slate-50 text-left uppercase text-slate-500">
                      <tr>
                        <th className="p-2">Operador</th>
                        <th className="p-2 text-right">Horas</th>
                        <th className="p-2 text-right">P20 equiv.</th>
                        <th className="p-2 text-right">h/P20</th>
                        <th className="p-2 text-right">% consumo</th>
                        <th className="p-2 text-right">Ciclos</th>
                        <th className="p-2 text-right">Máquinas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingOperadores.map((o) => (
                        <tr key={o.operadorId} className="border-t border-slate-100">
                          <td className="p-2 font-medium text-slate-800">{o.operadorNome}</td>
                          <td className="p-2 text-right tabular-nums">{formatarNumeroBr(o.horas)}</td>
                          <td className="p-2 text-right tabular-nums">{o.p20Equivalente.toFixed(3)}</td>
                          <td className="p-2 text-right font-bold tabular-nums text-slate-900">
                            {o.horasPorP20 !== null ? formatarNumeroBr(o.horasPorP20) : "—"}
                          </td>
                          <td className="p-2 text-right tabular-nums">{formatarNumeroBr(o.pctDoConsumo)}%</td>
                          <td className="p-2 text-right tabular-nums text-slate-500">{o.sessoes}</td>
                          <td className="p-2 text-right tabular-nums text-slate-500">{o.empilhadeiras}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                ⚠️ Não leia isto como desempenho individual. Dentro de um mesmo ciclo, todo mundo tem a mesma
                média de h/P20 — é como o rateio por tempo funciona. A diferença entre pessoas vem de QUAIS
                máquinas e ciclos cada uma pegou, e operações diferentes exigem esforços diferentes da máquina.
                É indicador de acompanhamento operacional.
              </p>
            </div>
          </details>

          {/* ---- Por empilhadeira (item 11) ---- */}
          <details open={secao === "maquinas"} className="mt-4 rounded-2xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
              🏗️ Por empilhadeira ({porMaquina.length + semCiclo.length})
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-4">
              {/* As que rodaram mas ainda não fecharam ciclo. Aparecem com
                  as horas e sem h/P20 -- é o que elas têm. */}
              {semCiclo.map((m) => (
                <div key={m.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-amber-900">🏗️ Empilhadeira {m.numero}</p>
                      <p className="text-xs text-amber-800">
                        {formatarNumeroBr(Math.round(m.horas * 10) / 10)}h em {m.sessoes} operação(ões)
                        {" · "}
                        {m.trocas === 0
                          ? "nenhuma troca de gás registrada"
                          : `${m.trocas} troca(s) de gás`}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                      sem ciclo
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-amber-700">
                    Ainda não dá para medir consumo aqui: um ciclo vai de uma troca de P20 até a
                    seguinte, e esta máquina precisa de mais uma troca para fechar o primeiro.
                  </p>
                </div>
              ))}

              {porMaquina.length === 0 && semCiclo.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma máquina com ciclo fechado no período.</p>
              ) : porMaquina.length === 0 ? null : (
                porMaquina.map((m) => {
                  const ops = operadoresDaMaquina(ciclos, m.empilhadeiraId);
                  return (
                    <div key={m.empilhadeiraId} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900">🏗️ Empilhadeira {m.numero}</p>
                          <p className="text-xs text-slate-500">
                            {formatarNumeroBr(m.horas)}h · {m.p20} P20 · {m.ciclos} ciclo(s) ·{" "}
                            {m.operadores} operador(es)
                          </p>
                          {m.horasNaoIdentificadas > 0 && (
                            <p className="text-xs text-amber-700">
                              {formatarNumeroBr(m.horasNaoIdentificadas)}h sem sessão registrada
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                          {m.horasPorP20 !== null ? `${formatarNumeroBr(m.horasPorP20)} h/P20` : "—"}
                        </span>
                      </div>

                      {ops.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                          {ops.map((o) => (
                            <li key={o.operadorId} className="flex items-baseline justify-between gap-2 text-xs">
                              <span className="min-w-0 truncate text-slate-600">{o.operadorNome}</span>
                              <span className="shrink-0 tabular-nums text-slate-500">
                                {formatarNumeroBr(o.horas)}h · {o.p20Equivalente.toFixed(3)} P20
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </details>

          {/* ---- Evolução histórica (item 13) ---- */}
          <details open={secao === "evolucao"} className="mt-4 rounded-2xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
              📈 Evolução da média h/P20
            </summary>
            <div className="border-t border-slate-100 p-4">
              <FiltroNoLugar secao="evolucao" className="mb-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="de" value={de} />
                <input type="hidden" name="ate" value={ate} />
                <input type="hidden" name="maquina" value={maquinaFiltro} />
                <input type="hidden" name="operador" value={operadorFiltro} />
                <input type="hidden" name="ordem" value={ordem} />
                <div className="min-w-0 flex-1">
                  <label className={rotulo} htmlFor="granularidade">Agrupar</label>
                  <select id="granularidade" name="granularidade" defaultValue={granularidade} className={campo}>
                    {GRANULARIDADES.map((g) => (
                      <option key={g} value={g}>{ROTULO_GRANULARIDADE[g]}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="shrink-0 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                  Aplicar
                </button>
              </FiltroNoLugar>

              {evolucao.length === 0 ? (
                <p className="text-sm text-slate-400">Sem ciclos suficientes para montar a evolução.</p>
              ) : (
                <ul className="space-y-2.5">
                  {evolucao.map((p) => {
                    const maior = Math.max(...evolucao.map((x) => x.horasPorP20));
                    return (
                      <li key={p.chave}>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate font-medium text-slate-700">{p.rotulo}</span>
                          <span className="shrink-0 font-bold text-slate-900">
                            {formatarNumeroBr(p.horasPorP20)} h/P20
                            <span className="ml-1 font-normal text-slate-400">
                              ({p.p20} P20)
                            </span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${Math.max(3, (p.horasPorP20 / maior) * 100)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 text-xs text-slate-400">
                O ciclo entra no período em que FECHOU — é quando o botijão acabou e o consumo virou fato.
                Barra maior = botijão rendendo mais horas.
              </p>
            </div>
          </details>

          {/* ---- Auditoria: como o número foi montado ---- */}
          <h2 className="mb-3 mt-6 text-sm font-bold uppercase text-slate-500">Ciclos de consumo</h2>
          <p className="mb-3 text-xs text-slate-500">
            Cada ciclo vai de uma troca de P20 até a seguinte. Abra para ver como o botijão foi dividido entre quem
            usou a máquina.
          </p>

          <ul className="space-y-2">
            {ciclos.map((c) => (
              <li key={`${c.empilhadeiraId}-${c.numero}`}>
                <details className="rounded-2xl border border-slate-200 bg-white">
                  <summary className="cursor-pointer list-none p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">
                          🏗️ {c.empilhadeiraNumero} · ciclo {c.numero}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatarNumeroBr(c.horimetroInicial)} → {formatarNumeroBr(c.horimetroFinal)} h ·{" "}
                          {formatarDataHora(c.fechadoEm)}
                        </p>
                        <p className="text-xs text-slate-400">Trocado por {c.trocadoPor}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                          {formatarNumeroBr(c.horas)} h/P20
                        </span>
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
                            c.status === "completo"
                              ? "bg-green-50 text-green-700"
                              : c.status === "horimetro_invalido"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {ROTULO_STATUS_CICLO[c.status]}
                        </span>
                      </div>
                    </div>
                  </summary>

                  <div className="border-t border-slate-100 p-3">
                    {c.porOperador.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        {c.status === "horimetro_invalido"
                          ? "O horímetro não avançou entre as duas trocas — não dá para medir consumo aqui."
                          : "Nenhuma sessão de utilização registrada neste intervalo."}
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[380px] text-xs">
                          <thead className="bg-slate-50 text-left uppercase text-slate-500">
                            <tr>
                              <th className="p-2">Operador</th>
                              <th className="p-2 text-right">Horas</th>
                              <th className="p-2 text-right">% do uso</th>
                              <th className="p-2 text-right">P20 equiv.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.porOperador.map((o) => (
                              <tr key={o.operadorId} className="border-t border-slate-100">
                                <td className="p-2 font-medium text-slate-800">{o.operadorNome}</td>
                                <td className="p-2 text-right tabular-nums">{formatarNumeroBr(o.horas)}</td>
                                <td className="p-2 text-right tabular-nums">
                                  {formatarNumeroBr(o.fracao * 100)}%
                                </td>
                                <td className="p-2 text-right tabular-nums">{o.p20Equivalente.toFixed(3)}</td>
                              </tr>
                            ))}
                            {c.horasNaoIdentificadas > 0 && (
                              <tr className="border-t border-slate-100 bg-amber-50">
                                <td className="p-2 font-medium text-amber-800">Sem apontamento</td>
                                <td className="p-2 text-right tabular-nums text-amber-800">
                                  {formatarNumeroBr(c.horasNaoIdentificadas)}
                                </td>
                                <td className="p-2 text-right tabular-nums text-amber-800">
                                  {formatarNumeroBr((c.horasNaoIdentificadas / c.horas) * 100)}%
                                </td>
                                <td className="p-2 text-right tabular-nums text-amber-800">
                                  {c.p20NaoIdentificado.toFixed(3)}
                                </td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                              <td className="p-2 text-slate-800">Total</td>
                              <td className="p-2 text-right tabular-nums">{formatarNumeroBr(c.horas)}</td>
                              <td className="p-2 text-right tabular-nums">100%</td>
                              <td className="p-2 text-right tabular-nums">1,000</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* Onde, no relógio, ficaram as horas sem dono. Sem
                        isto "3,9h não identificadas" não diz com quem
                        falar; com a janela e o turno, diz. */}
                    {c.buracos.length > 0 && (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-bold text-amber-900">
                          🔎 Quando a máquina rodou sem apontamento
                        </p>
                        <ul className="mt-2 space-y-2">
                          {c.buracos.map((b, i) => (
                            <li key={i} className="text-xs text-amber-800">
                              <span className="font-semibold">{formatarNumeroBr(b.horas)}h</span>{" "}
                              <span className="text-amber-700">
                                (horímetro {formatarNumeroBr(b.horimetroInicial)} →{" "}
                                {formatarNumeroBr(b.horimetroFinal)})
                              </span>
                              {b.desde && b.ate && (
                                <span className="block text-amber-700">
                                  Entre {formatarDataHora(b.desde)} e {formatarDataHora(b.ate)}
                                  {" · "}
                                  {descreverTurnos(b.desde, b.ate)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-[11px] text-amber-700">
                          O horímetro só anda com o motor ligado — se avançou, alguém operou sem abrir
                          operação no app. O nome não é deduzido de propósito: chutar por escala colocaria
                          o gás na conta de quem talvez nem tenha encostado na máquina.
                        </p>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>

          <details className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <summary className="cursor-pointer font-semibold text-slate-600">
              ℹ️ Como o consumo é calculado
            </summary>
            <ul className="mt-2 space-y-1.5">
              <li>
                <strong>O ciclo é da máquina, não da pessoa.</strong> Vai de uma troca de P20 até a seguinte, medido
                pelo horímetro. A primeira troca de cada empilhadeira não vira ciclo — sem um ponto anterior não há
                intervalo para medir.
              </li>
              <li>
                <strong>O botijão é dividido pelo tempo de uso</strong>, não entregue a quem trocou o gás. Quem
                trocou apenas fechou o ciclo.
              </li>
              <li>
                <strong>Sessão que atravessa a troca é dividida.</strong> Se alguém começou antes e terminou depois,
                cada ciclo recebe só as horas que aconteceram dentro dele.
              </li>
              <li>
                <strong>Hora sem sessão não vai para ninguém.</strong> Aparece como &ldquo;Não identificado&rdquo; e
                fica com a fatia do P20 correspondente — por isso a coluna sempre fecha em 1,000.
              </li>
              <li>
                <strong>Cuidado ao ler a eficiência por operador.</strong> Dentro de um mesmo ciclo, todo mundo tem a
                mesma média de horas/P20 — é uma propriedade do rateio por tempo. A diferença entre pessoas só
                aparece quando elas trabalham em máquinas e ciclos diferentes. É indicador de acompanhamento
                operacional, não de desempenho individual.
              </li>
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
