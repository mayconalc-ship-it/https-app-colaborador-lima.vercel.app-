import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { ExportarCsv } from "@/components/ExportarCsv";
import { podeNoModulo, requireModulo } from "@/lib/require-admin";
import { exigirRevenda, getRevendaAtiva } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { decodificar } from "@/lib/texto-url";
import {
  anosComDados,
  lerAcoes,
  lerConfig,
  lerDestinatarios,
  lerDias,
  lerEnvios,
  lerMes,
  lerMeses,
  lerRealizado,
  lerRealizadoDoAno,
  lerRevisao,
  lerSalarios,
} from "@/lib/mao-de-obra-server";
import {
  DISPERSAO_ACEITA,
  FUNCOES,
  MESES_CURTOS,
  MES_VAZIO,
  MODULO_MAO_DE_OBRA,
  PARAMETROS,
  REQUISITO_DPO,
  ROTULO_STATUS_ACAO,
  RUBRICAS,
  STATUS_ACAO,
  acumuladoDoMes,
  competenciaAnterior,
  contaDistribuicao,
  dimensionamentoNoRitmo,
  planoPorTipoDeDia,
  projecaoDoMes,
  competenciaAtual,
  comparativoDeMeses,
  custoDaPessoa,
  dimensionamentoDoMes,
  dispersaoDoVolume,
  ehCompetencia,
  formatarNumero,
  formatarPercento,
  formatarReais,
  rotuloCompetencia,
  vagasDoMes,
  volumePorDia,
  type MesMaoDeObra,
} from "@/lib/mao-de-obra";
import { EnviarParaRecrutamento } from "./EnviarParaRecrutamento";
import { FormDias } from "./FormDias";
import { FormMes } from "./FormMes";
import {
  adicionarDestinatario,
  criarAcao,
  excluirAcao,
  mudarStatusDaAcao,
  removerDestinatario,
  salvarParametros,
  salvarRealizado,
  salvarSalario,
} from "./actions";

export const dynamic = "force-dynamic";

type Aba = "plano" | "dia" | "vagas";

/**
 * O SIMULADOR DE MÃO DE OBRA -- item 1.2 do DPO (Dimensionamento).
 *
 * Três abas, na ordem do trabalho:
 *   PLANO  -- o volume do mês dimensiona a gente, e o mês se compara com
 *             os dois anteriores;
 *   DIA    -- o plano por dia útil contra o volume que saiu (V.4 e V.5);
 *   VAGAS  -- o que falta contratar, enviado ao recrutamento, com registro.
 */
export default async function MaoDeObraPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; aba?: string; erro?: string; sucesso?: string }>;
}) {
  await requireModulo(MODULO_MAO_DE_OBRA, "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const sp = await searchParams;
  const [podeEditar, podeExcluir, revenda, perfil] = await Promise.all([
    podeNoModulo(MODULO_MAO_DE_OBRA, "editar"),
    podeNoModulo(MODULO_MAO_DE_OBRA, "excluir"),
    getRevendaAtiva(),
    getPerfil(),
  ]);

  const competencia = ehCompetencia(sp.mes) ? sp.mes : competenciaAtual();
  const ano = Number(competencia.slice(0, 4));
  const aba: Aba = sp.aba === "dia" || sp.aba === "vagas" ? sp.aba : "plano";

  const [config, salarios, mes, realizado, mesesDoAno, realizadoDoAno, acoes, revisao, anos, dias, destinatarios, envios] =
    await Promise.all([
      lerConfig(revendaId),
      lerSalarios(revendaId),
      lerMes(revendaId, competencia),
      lerRealizado(revendaId, competencia),
      lerMeses(revendaId, ano),
      lerRealizadoDoAno(revendaId, ano),
      lerAcoes(revendaId, ano),
      lerRevisao(revendaId, competencia),
      anosComDados(revendaId),
      lerDias(revendaId, competencia),
      lerDestinatarios(revendaId),
      lerEnvios(revendaId),
    ]);

  const mesAtual: MesMaoDeObra = mes ?? { ...MES_VAZIO, competencia };
  const { linhas, dist, arm } = dimensionamentoDoMes(mesAtual, config, salarios, realizado);
  const vagas = vagasDoMes(linhas);
  const totalVagas = vagas.reduce((s, v) => s + v.vagas, 0);
  const totalExcedente = vagas.reduce((s, v) => s + v.excedente, 0);
  const totalDimensionado = linhas.reduce((s, l) => s + l.dimensionado, 0);
  const custoDimensionado = linhas.reduce((s, l) => s + l.custoDimensionado, 0);
  const temQuadro = linhas.some((l) => l.realizado != null);

  const diasDoMes = volumePorDia(mesAtual, dias);
  const acumulado = acumuladoDoMes(diasDoMes);
  const projecao = projecaoDoMes(diasDoMes);
  const noRitmo = dimensionamentoNoRitmo(mesAtual, projecao.projetado);
  const doPlano = contaDistribuicao(mesAtual);
  const dispersaoFechada = dispersaoDoVolume(mesAtual);
  const dispersao = dispersaoFechada ?? acumulado.dispersao;

  // O COMPARATIVO (V.3): o mês e os dois anteriores, lado a lado.
  const anterior1 = competenciaAnterior(competencia);
  const anterior2 = competenciaAnterior(anterior1);
  const anterior3 = competenciaAnterior(anterior2);
  const paraComparar = await Promise.all(
    [anterior3, anterior2, anterior1].map(async (c) => {
      const m = c.slice(0, 4) === String(ano) ? mesesDoAno.find((x) => x.competencia === c) : await lerMes(revendaId, c);
      if (!m) return null;
      const real = c.slice(0, 4) === String(ano) ? (realizadoDoAno.get(c) ?? {}) : await lerRealizado(revendaId, c);
      return { mes: m, linhas: dimensionamentoDoMes(m, config, salarios, real).linhas };
    }),
  );
  const comparativo = comparativoDeMeses([
    ...paraComparar.filter((x): x is NonNullable<typeof x> => Boolean(x)),
    { mes: mesAtual, linhas },
  ]);

  const acoesDoMes = acoes.filter((a) => a.competencia === competencia);
  const abertas = acoes.filter((a) => a.status !== "concluida");
  const enviosDoMes = envios.filter((e) => e.competencia === competencia);
  const emailsAtivos = destinatarios.filter((d) => d.ativo).map((d) => d.email);

  const historico = mesesDoAno.map((m) => {
    const real = realizadoDoAno.get(m.competencia) ?? {};
    const r = dimensionamentoDoMes(m, config, salarios, real);
    return {
      competencia: m.competencia,
      volumeNegociado: m.volume_negociado,
      dispersao: dispersaoDoVolume(m),
      dimensionado: r.linhas.reduce((s, l) => s + l.dimensionado, 0),
      custo: r.linhas.reduce((s, l) => s + l.custoDimensionado, 0),
      linhas: r.linhas,
    };
  });

  const anosDoSeletor = [...new Set([ano, ...anos, Number(competenciaAtual().slice(0, 4))])].sort((a, b) => b - a);
  const href = (m: string, a: Aba = aba) => `/gestao/mao-de-obra?mes=${m}&aba=${a}`;

  return (
    <div>
      <PageHeader
        title="👷 Simulador de Mão de Obra"
        subtitle="O volume planejado do mês dimensiona a gente, e o que falta vira vaga"
        fecharHref="/gestao"
      />

      {sp.erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{decodificar(sp.erro)}</p>}
      {sp.sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{decodificar(sp.sucesso)}</p>
      )}

      {/* ---- O MÊS ---- */}
      <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-800">{rotuloCompetencia(competencia)}</p>
          <div className="flex gap-1">
            {anosDoSeletor.map((a) => (
              <Link
                key={a}
                href={href(`${a}-${competencia.slice(5)}`)}
                className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                  a === ano ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {a}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1">
          {MESES_CURTOS.map((m, i) => {
            const comp = `${ano}-${String(i + 1).padStart(2, "0")}`;
            const lancado = mesesDoAno.some((x) => x.competencia === comp);
            return (
              <Link
                key={m}
                href={href(comp)}
                className={`rounded-lg px-1 py-1.5 text-center text-xs font-semibold ${
                  comp === competencia
                    ? "bg-primary text-white"
                    : lancado
                      ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {m}
              </Link>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {revisao.revisadoEm
            ? `Revisado por ${revisao.revisadoPorNome ?? "—"} em ${new Date(revisao.revisadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
            : "Mês ainda não revisado — lance o volume na aba Plano."}
        </p>
      </div>

      {/* ---- ABAS ---- */}
      <nav className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["plano", "📐 Dimensionamento"],
            ["dia", "📅 Volume por dia"],
            ["vagas", `📨 Vagas${totalVagas > 0 ? ` (${totalVagas})` : ""}`],
          ] as [Aba, string][]
        ).map(([id, rotulo]) => (
          <Link
            key={id}
            href={href(competencia, id)}
            aria-current={id === aba ? "page" : undefined}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              id === aba ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {rotulo}
          </Link>
        ))}
      </nav>

      {aba === "plano" && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Cartao
              titulo="Gente dimensionada"
              valor={String(totalDimensionado)}
              detalhe={`para ${formatarNumero(mesAtual.volume_negociado ?? 0, 0)} HL negociados`}
              tom="destaque"
            />
            <Cartao
              titulo="Vagas a abrir"
              valor={temQuadro ? String(totalVagas) : "—"}
              detalhe={
                !temQuadro
                  ? "informe o quadro atual"
                  : totalExcedente > 0
                    ? `${totalExcedente} acima do dimensionado`
                    : totalVagas === 0
                      ? "quadro atende o mês"
                      : "enviar ao recrutamento"
              }
              tom={totalVagas > 0 ? "atencao" : "neutro"}
            />
            <Cartao
              titulo="Dispersão do volume"
              valor={formatarPercento(dispersao)}
              detalhe={
                dispersao == null
                  ? "lance o volume por dia"
                  : dispersaoFechada != null
                    ? "mês fechado"
                    : `acumulado de ${acumulado.diasLancados} dia${acumulado.diasLancados === 1 ? "" : "s"}`
              }
              tom={dispersao != null && Math.abs(dispersao) > DISPERSAO_ACEITA ? "erro" : "neutro"}
            />
            <Cartao titulo="Custo estimado" valor={formatarReais(custoDimensionado)} detalhe="do quadro dimensionado" />
          </div>

          {/* ---- O DIMENSIONAMENTO ---- */}
          <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800">Dimensionamento planejado</h2>
              <ExportarCsv
                nome={`dimensionamento-${competencia}`}
                cabecalho={["Área", "Função", "Dimensionado", "Quadro atual", "Vagas", "Acima", "Custo unitário", "Custo dimensionado"]}
                linhas={vagas.map((v, i) => [
                  v.area,
                  v.rotulo,
                  v.dimensionado,
                  v.atual ?? "",
                  v.vagas,
                  v.excedente,
                  linhas[i].custoUnitario,
                  linhas[i].custoDimensionado,
                ])}
                rotulo="Exportar .csv"
              />
            </div>
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Função</th>
                  <th className="w-16 px-1 py-2 text-right">Dim.</th>
                  <th className="w-16 px-1 py-2 text-right">Temos</th>
                  <th className="w-16 px-2 py-2 text-right">Vagas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vagas.map((v, i) => (
                  <tr key={v.funcao} className="align-top">
                    <td className="px-3 py-2">
                      <span className="block font-medium text-slate-800">{v.rotulo}</span>
                      <span className="block text-[11px] text-slate-400">
                        {v.area} · conta {formatarNumero(linhas[i].dimensionadoExato, 1)} ·{" "}
                        {formatarReais(linhas[i].custoDimensionado)}
                      </span>
                    </td>
                    <td className="px-1 py-2 text-right font-mono font-bold tabular-nums text-slate-900">
                      {v.dimensionado}
                    </td>
                    <td className="px-1 py-2 text-right font-mono tabular-nums text-slate-600">{v.atual ?? "—"}</td>
                    <td
                      className={`px-2 py-2 text-right font-mono font-bold tabular-nums ${
                        v.vagas > 0 ? "text-amber-600" : v.excedente > 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {v.atual == null ? "—" : v.vagas > 0 ? `+${v.vagas}` : v.excedente > 0 ? `-${v.excedente}` : "0"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-[3px] border-double border-slate-300 bg-slate-50 font-semibold">
                  <td className="px-3 py-2 text-slate-700">Total</td>
                  <td className="px-1 py-2 text-right font-mono tabular-nums">{totalDimensionado}</td>
                  <td className="px-1 py-2 text-right font-mono tabular-nums">
                    {temQuadro ? vagas.reduce((s, v) => s + (v.atual ?? 0), 0) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{temQuadro ? totalVagas : "—"}</td>
                </tr>
              </tfoot>
            </table>
            <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
              Frota: {formatarNumero(dist.frotasReal, 1)} carros pela linear de {formatarNumero(dist.linear, 0)} HL/dia em{" "}
              {dist.diasUteis} dias úteis
              {dist.ocupacaoDaFrota != null && ` · ${formatarPercento(dist.ocupacaoDaFrota)} da frota fixa`} · Armazém:{" "}
              {formatarNumero(arm.mapsPrevistos, 1)} mapas/dia.
            </p>
          </section>

          {/* ---- COMPARATIVO (V.3) ---- */}
          {comparativo.length > 1 && (
            <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-bold text-slate-800">Comparativo dos últimos meses</h2>
                <p className="text-[11px] text-slate-500">
                  O que foi dimensionado há 3, 2 e 1 mês contra o que o mês corrente pede — a verificação V.3 do DPO.
                </p>
              </div>
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Função</th>
                    {comparativo.map((c) => (
                      <th key={c.competencia} className="w-16 px-1 py-2 text-right">
                        {MESES_CURTOS[Number(c.competencia.slice(5)) - 1]}
                      </th>
                    ))}
                    <th className="w-14 px-2 py-2 text-right">Var.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {FUNCOES.map((f) => {
                    const valores = comparativo.map((c) => c.porFuncao[f.id] ?? 0);
                    const variacao = valores[valores.length - 1] - valores[0];
                    return (
                      <tr key={f.id}>
                        <td className="px-3 py-1.5 text-slate-800">{f.rotulo}</td>
                        {valores.map((v, i) => (
                          <td
                            key={i}
                            className={`px-1 py-1.5 text-right font-mono tabular-nums ${
                              i === valores.length - 1 ? "font-bold text-slate-900" : "text-slate-500"
                            }`}
                          >
                            {v}
                          </td>
                        ))}
                        <td
                          className={`px-2 py-1.5 text-right font-mono font-semibold tabular-nums ${
                            variacao === 0 ? "text-slate-300" : variacao > 0 ? "text-amber-600" : "text-emerald-600"
                          }`}
                        >
                          {variacao > 0 ? `+${variacao}` : variacao}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-[3px] border-double border-slate-300 bg-slate-50 font-semibold">
                    <td className="px-3 py-2 text-slate-700">
                      Total
                      <span className="block text-[10px] font-normal text-slate-400">volume negociado (HL)</span>
                    </td>
                    {comparativo.map((c) => (
                      <td key={c.competencia} className="px-1 py-2 text-right font-mono tabular-nums">
                        {c.total}
                        <span className="block text-[10px] font-normal text-slate-400">
                          {formatarNumero(c.volumeNegociado ?? 0, 0)}
                        </span>
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {comparativo[comparativo.length - 1].total - comparativo[0].total}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>
          )}

          {/* ---- PLANO DE AÇÃO ---- */}
          <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">Plano de ação</h2>
              <span className="text-xs text-slate-500">{abertas.length} em aberto em {ano}</span>
            </div>
            {(totalVagas > 0 || totalExcedente > 0 || (dispersao != null && Math.abs(dispersao) > DISPERSAO_ACEITA)) && (
              <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-900">
                ⚠️ Desvio neste mês:
                {totalVagas > 0 && ` faltam ${totalVagas} pessoa${totalVagas === 1 ? "" : "s"};`}
                {totalExcedente > 0 && ` ${totalExcedente} acima do dimensionado;`}
                {dispersao != null && Math.abs(dispersao) > DISPERSAO_ACEITA && ` dispersão de ${formatarPercento(dispersao)}.`}
              </p>
            )}
            {acoesDoMes.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {acoesDoMes.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 p-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <b className="text-slate-800">{a.oQue}</b>
                      <span className="block text-[11px] text-slate-500">
                        {a.responsavel}
                        {a.prazo && ` · até ${a.prazo.split("-").reverse().join("/")}`}
                        {a.criadoPorNome && ` · lançada por ${a.criadoPorNome}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {podeEditar ? (
                        <form action={mudarStatusDaAcao} className="flex items-center gap-1">
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="competencia" value={competencia} />
                          <select name="status" defaultValue={a.status} className="rounded-lg border border-slate-300 px-1.5 py-1 text-xs">
                            {STATUS_ACAO.map((s) => (
                              <option key={s} value={s}>
                                {ROTULO_STATUS_ACAO[s]}
                              </option>
                            ))}
                          </select>
                          <BotaoEnviar textoEnviando="..." className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700">
                            Salvar
                          </BotaoEnviar>
                        </form>
                      ) : (
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                          {ROTULO_STATUS_ACAO[a.status]}
                        </span>
                      )}
                      {podeExcluir && (
                        <BotaoExcluir action={excluirAcao} campos={{ id: a.id, competencia }} confirmacao={`Apagar a ação “${a.oQue}”?`}>
                          Apagar
                        </BotaoExcluir>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {podeEditar && (
              <form action={criarAcao} className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
                <input type="hidden" name="competencia" value={competencia} />
                <input
                  name="o_que"
                  required
                  maxLength={300}
                  placeholder="O que será feito (ex.: abrir 2 vagas de ajudante de armazém)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <input name="responsavel" required maxLength={120} placeholder="Responsável" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <input type="date" name="prazo" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <select name="funcao" defaultValue="" className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
                    <option value="">Função (opcional)</option>
                    {FUNCOES.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                <BotaoEnviar textoEnviando="Salvando..." className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                  Incluir no plano
                </BotaoEnviar>
              </form>
            )}
            {!podeEditar && acoesDoMes.length === 0 && (
              <p className="mt-2 text-sm text-slate-500">Nenhuma ação lançada para este mês.</p>
            )}
          </section>

          {/* ---- LANÇAMENTOS ---- */}
          {podeEditar && (
            <>
              <details open={!mes} className="mb-3 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <summary className="cursor-pointer list-none p-4 text-sm font-bold text-slate-800">
                  ✏️ Lançar o volume de {rotuloCompetencia(competencia)}
                </summary>
                <div className="border-t border-slate-100 p-4">
                  <FormMes competencia={competencia} mes={mes} config={config} />
                </div>
              </details>

              <details className="mb-3 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <summary className="cursor-pointer list-none p-4 text-sm font-bold text-slate-800">
                  👥 Quadro atual (o que temos hoje)
                </summary>
                <form action={salvarRealizado} className="space-y-3 border-t border-slate-100 p-4">
                  <input type="hidden" name="competencia" value={competencia} />
                  <p className="text-xs text-slate-500">É a conta das vagas: dimensionado menos o que temos.</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {FUNCOES.map((f) => (
                      <label key={f.id} className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{f.rotulo}</span>
                        <input
                          name={`real_${f.id}`}
                          defaultValue={realizado[f.id] ?? ""}
                          inputMode="numeric"
                          className="w-full rounded-lg border border-slate-300 px-2 py-2 text-right font-mono text-sm tabular-nums"
                        />
                      </label>
                    ))}
                  </div>
                  <BotaoEnviar textoEnviando="Salvando..." className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
                    Salvar o quadro atual
                  </BotaoEnviar>
                </form>
              </details>

              <details className="mb-3 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <summary className="cursor-pointer list-none p-4 text-sm font-bold text-slate-800">⚙️ Parâmetros da operação</summary>
                <form action={salvarParametros} className="space-y-3 border-t border-slate-100 p-4">
                  <input type="hidden" name="competencia" value={competencia} />
                  <p className="text-xs text-slate-500">
                    Tempos e jornada são frações do dia: 0,3056 é uma jornada de 7h20.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PARAMETROS.map((p) => (
                      <label key={p.id} className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{p.rotulo}</span>
                        <input
                          name={p.id}
                          defaultValue={String(config[p.id])}
                          inputMode="decimal"
                          className="w-full rounded-lg border border-slate-300 px-2 py-2 text-right font-mono text-sm tabular-nums"
                        />
                      </label>
                    ))}
                  </div>
                  <BotaoEnviar textoEnviando="Salvando..." className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
                    Salvar os parâmetros
                  </BotaoEnviar>
                </form>
              </details>

              <details className="mb-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <summary className="cursor-pointer list-none p-4 text-sm font-bold text-slate-800">💰 Base salarial por função</summary>
                <div className="space-y-3 border-t border-slate-100 p-4">
                  <p className="text-xs text-slate-500">
                    O custo mensal de UMA pessoa. Os valores de partida vieram da planilha da companhia — confira os da
                    sua revenda.
                  </p>
                  {FUNCOES.map((f) => (
                    <details key={f.id} className="rounded-xl border border-slate-200">
                      <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-semibold text-slate-700">
                        <span>{f.rotulo}</span>
                        <span className="font-mono text-xs tabular-nums text-slate-500">
                          {formatarReais(custoDaPessoa(salarios[f.id]))}/mês
                        </span>
                      </summary>
                      <form action={salvarSalario} className="space-y-2 border-t border-slate-100 p-3">
                        <input type="hidden" name="competencia" value={competencia} />
                        <input type="hidden" name="funcao" value={f.id} />
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {RUBRICAS.map((r) => (
                            <label key={r.id} className="block">
                              <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">{r.rotulo}</span>
                              <input
                                name={r.id}
                                defaultValue={String(salarios[f.id][r.id] ?? 0)}
                                inputMode="decimal"
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-right font-mono text-xs tabular-nums"
                              />
                            </label>
                          ))}
                        </div>
                        <BotaoEnviar textoEnviando="Salvando..." className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                          Salvar {f.rotulo.toLowerCase()}
                        </BotaoEnviar>
                      </form>
                    </details>
                  ))}
                </div>
              </details>
            </>
          )}

          {/* ---- HISTÓRICO ---- */}
          <section className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800">Histórico de {ano}</h2>
              {historico.length > 0 && (
                <ExportarCsv
                  nome={`mao-de-obra-historico-${ano}`}
                  cabecalho={[
                    "Competência",
                    "Volume negociado (HL)",
                    "Dispersão (%)",
                    "Dimensionado",
                    "Custo dimensionado",
                    ...FUNCOES.map((f) => `Dim. ${f.rotulo}`),
                  ]}
                  linhas={historico.map((h) => [
                    rotuloCompetencia(h.competencia),
                    h.volumeNegociado ?? "",
                    h.dispersao == null ? "" : h.dispersao * 100,
                    h.dimensionado,
                    h.custo,
                    ...h.linhas.map((l) => l.dimensionado),
                  ])}
                  rotulo="Exportar .csv"
                />
              )}
            </div>
            {historico.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">
                Nenhum mês lançado em {ano}. Lance o volume no bloco acima.
              </p>
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Mês</th>
                    <th className="w-20 px-1 py-2 text-right">Gente</th>
                    <th className="w-24 px-2 py-2 text-right">Dispersão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historico.map((h) => (
                    <tr key={h.competencia} className={h.competencia === competencia ? "bg-primary-soft/40" : ""}>
                      <td className="px-3 py-2">
                        <Link href={href(h.competencia)} className="font-medium text-primary-dark hover:underline">
                          {rotuloCompetencia(h.competencia)}
                        </Link>
                        <span className="block text-[11px] text-slate-400">
                          {formatarNumero(h.volumeNegociado ?? 0, 0)} HL · {formatarReais(h.custo)}
                        </span>
                      </td>
                      <td className="px-1 py-2 text-right font-mono font-bold tabular-nums text-slate-900">{h.dimensionado}</td>
                      <td
                        className={`px-2 py-2 text-right font-mono text-[13px] tabular-nums ${
                          h.dispersao == null
                            ? "text-slate-300"
                            : Math.abs(h.dispersao) > DISPERSAO_ACEITA
                              ? "font-semibold text-red-700"
                              : "text-emerald-700"
                        }`}
                      >
                        {formatarPercento(h.dispersao)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* ---- O REQUISITO DO DPO, verificação por verificação ---- */}
          <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none p-4 text-sm font-bold text-slate-800">
              📋 Item 1.2 do DPO — o que cada verificação pede
            </summary>
            <ul className="space-y-2 border-t border-slate-100 p-4">
              {REQUISITO_DPO.map((r) => (
                <li key={r.id} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-bold text-primary-dark">{r.id}</p>
                  <p className="mt-0.5 text-xs text-slate-700">{r.texto}</p>
                  <p className="mt-1 text-[11px] text-slate-500">👉 {r.ondeEsta}</p>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {aba === "dia" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800">Volume por dia — {rotuloCompetencia(competencia)}</h2>
          <p className="mb-3 text-xs text-slate-500">
            O plano é o volume negociado do mês, menos o dos sábados, dividido pelos {dist.diasUteis} dias úteis
            cadastrados. Lance o que saiu em cada dia para acompanhar a dispersão.
          </p>
          {!mes ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Lance o volume do mês na aba Dimensionamento para a média necessária existir.
            </p>
          ) : (
            <>
              <FormDias
                competencia={competencia}
                dias={diasDoMes}
                podeEditar={podeEditar}
                planoUtil={planoPorTipoDeDia(mesAtual).util}
                planoSabado={planoPorTipoDeDia(mesAtual).sabado}
              />
              {/* A FLEXÃO (V.4): se o mês fechar no ritmo de hoje, quanta
                  gente ele passa a pedir? */}
              {acumulado.diasLancados > 0 && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Ajuste no ritmo de hoje
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    No volume projetado de {formatarNumero(projecao.projetado, 0)} HL, a operação pediria:
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <Flexao rotulo="Frota" plano={doPlano.frotaDimensionada} ritmo={noRitmo.frotaDimensionada} />
                    <Flexao rotulo="Motoristas" plano={doPlano.motoristas} ritmo={noRitmo.motoristas} />
                    <Flexao rotulo="Ajudantes" plano={doPlano.ajudantes} ritmo={noRitmo.ajudantes} />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    O plano do mês dimensionou {doPlano.frotaDimensionada} carros. Diferença aqui é o momento de
                    negociar SPOT, hora extra ou férias — e de lançar a ação no plano.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {aba === "vagas" && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">Quadro de vagas — {rotuloCompetencia(competencia)}</h2>
            {!temQuadro ? (
              <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                Informe o quadro atual na aba Dimensionamento: sem ele o app não sabe quantas vagas faltam.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500">
                  {totalVagas} vaga{totalVagas === 1 ? "" : "s"} a abrir
                  {totalExcedente > 0 && ` · ${totalExcedente} acima do dimensionado`}
                </p>
                <div className="mt-3">
                  <EnviarParaRecrutamento
                    competencia={competencia}
                    revenda={revenda?.nome ?? "Revenda"}
                    vagas={vagas}
                    volumeNegociado={mesAtual.volume_negociado}
                    destinatarios={emailsAtivos}
                    quemEnvia={perfil?.nome ?? "—"}
                    podeEditar={podeEditar}
                  />
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">Quem recebe</h2>
            {destinatarios.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Nenhum e-mail cadastrado ainda.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {destinatarios.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                    <span className="min-w-0">
                      <b className="text-slate-800">{d.nome ?? d.email}</b>
                      {d.nome && <span className="block text-[11px] text-slate-500">{d.email}</span>}
                    </span>
                    {podeEditar && (
                      <BotaoExcluir
                        action={removerDestinatario}
                        campos={{ id: d.id, competencia }}
                        confirmacao={`Remover ${d.email} da lista?`}
                      >
                        Remover
                      </BotaoExcluir>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {podeEditar && (
              <form action={adicionarDestinatario} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="competencia" value={competencia} />
                <input name="nome" placeholder="Nome (opcional)" maxLength={120} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input name="email" required type="email" placeholder="email@limalogistica.com.br" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <BotaoEnviar textoEnviando="Salvando..." className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                  Incluir
                </BotaoEnviar>
              </form>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">Envios registrados</h2>
            {envios.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Nenhum envio registrado ainda.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {envios.map((e) => (
                  <li
                    key={e.id}
                    className={`rounded-xl border p-3 text-sm ${
                      e.competencia === competencia ? "border-primary/30 bg-primary-soft/30" : "border-slate-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <b className="text-slate-800">{rotuloCompetencia(e.competencia)}</b>
                      <span className="text-xs text-slate-500">
                        {new Date(e.enviadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} ·{" "}
                        {e.enviadoPorNome ?? "—"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {e.totalVagas} vaga{e.totalVagas === 1 ? "" : "s"} ·{" "}
                      {e.vagas
                        .filter((v) => v.vagas > 0)
                        .map((v) => `${v.rotulo ?? v.funcao} ${v.vagas}`)
                        .join(" · ") || "sem vagas a abrir"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">Para: {e.destinatarios.join(", ")}</p>
                    {e.observacao && <p className="mt-1 text-xs italic text-slate-600">“{e.observacao}”</p>}
                  </li>
                ))}
              </ul>
            )}
            {enviosDoMes.length === 0 && temQuadro && (
              <p className="mt-2 text-[11px] text-amber-700">
                Este mês ainda não foi enviado ao recrutamento.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Cartao({
  titulo,
  valor,
  detalhe,
  tom = "neutro",
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  tom?: "neutro" | "destaque" | "atencao" | "erro";
}) {
  const caixa = {
    neutro: "border-slate-200 bg-white",
    destaque: "border-primary/30 bg-primary-soft",
    atencao: "border-amber-200 bg-amber-50",
    erro: "border-red-200 bg-red-50",
  }[tom];
  const cor = {
    neutro: "text-slate-900",
    destaque: "text-primary-dark",
    atencao: "text-amber-700",
    erro: "text-red-700",
  }[tom];
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${caixa}`}>
      <p className="text-xs font-semibold uppercase text-slate-500">{titulo}</p>
      <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${cor}`}>{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{detalhe}</p>
    </div>
  );
}

/** Quanto o ritmo do mês muda o dimensionado -- a "flexão" do item V.4. */
function Flexao({ rotulo, plano, ritmo }: { rotulo: string; plano: number; ritmo: number }) {
  const diferenca = ritmo - plano;
  return (
    <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
      <p className="text-[10px] font-semibold uppercase text-slate-500">{rotulo}</p>
      <p className="font-mono text-lg font-bold tabular-nums text-slate-900">{ritmo}</p>
      <p
        className={`text-[11px] font-medium ${
          diferenca === 0 ? "text-slate-400" : diferenca > 0 ? "text-amber-600" : "text-emerald-600"
        }`}
      >
        {diferenca === 0 ? "igual ao plano" : `${diferenca > 0 ? "+" : ""}${diferenca} contra o plano`}
      </p>
    </div>
  );
}
