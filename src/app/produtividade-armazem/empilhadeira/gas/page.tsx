import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { diasAtrasISO, formatarDataHora, hojeISO } from "@/lib/produtividade-armazem";
import {
  ROTULO_STATUS_CICLO,
  cicloContaParaMaquina,
  formatarNumeroBr,
  montarCiclos,
  resumirPorMaquina,
  resumirPorOperador,
  type SessaoUso,
  type TrocaGas,
} from "@/lib/empilhadeira-gas";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

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
  searchParams: Promise<{ de?: string; ate?: string; maquina?: string }>;
}) {
  await requireAcessoModulo("pa-empilhadeira");

  const sp = await searchParams;
  const de = sp.de ?? diasAtrasISO(29);
  const ate = sp.ate ?? hojeISO();
  const maquinaFiltro = (sp.maquina ?? "").trim();

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
  const porOperador = resumirPorOperador(ciclos);
  const porMaquina = resumirPorMaquina(ciclos);

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
        <button
          type="submit"
          className="col-span-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white sm:col-span-1"
        >
          Filtrar
        </button>
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
            <Cartao titulo="Operadores" valor={String(porOperador.length)} legenda="com horas atribuídas" />
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
                                <td className="p-2 font-medium text-amber-800">Não identificado</td>
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
