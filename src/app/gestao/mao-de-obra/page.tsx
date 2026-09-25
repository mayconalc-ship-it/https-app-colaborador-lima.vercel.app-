import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { ExportarCsv } from "@/components/ExportarCsv";
import { podeNoModulo, requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { decodificar } from "@/lib/texto-url";
import {
  anosComDados,
  lerAcoes,
  lerConfig,
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
  ROTULO_STATUS_ACAO,
  RUBRICAS,
  STATUS_ACAO,
  competenciaAtual,
  custoDaPessoa,
  dimensionamentoDoMes,
  dispersaoDoVolume,
  ehCompetencia,
  formatarNumero,
  formatarPercento,
  formatarReais,
  rotuloCompetencia,
} from "@/lib/mao-de-obra";
import { FormMes } from "./FormMes";
import { criarAcao, excluirAcao, mudarStatusDaAcao, salvarParametros, salvarRealizado, salvarSalario } from "./actions";

export const dynamic = "force-dynamic";

/**
 * O SIMULADOR DE MÃO DE OBRA (25/09/2026) -- item 1.2 do DPO.
 *
 * Responde três perguntas, nesta ordem: quanta gente o volume do mês pede,
 * quanta a revenda tem, e o que vai ser feito com a diferença. O custo vem
 * junto porque dimensionar sem custo não decide nada.
 *
 * As contas são as da planilha da companhia, em src/lib/mao-de-obra.ts.
 */
export default async function MaoDeObraPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; erro?: string; sucesso?: string }>;
}) {
  await requireModulo(MODULO_MAO_DE_OBRA, "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const sp = await searchParams;
  const [podeEditar, podeExcluir] = await Promise.all([
    podeNoModulo(MODULO_MAO_DE_OBRA, "editar"),
    podeNoModulo(MODULO_MAO_DE_OBRA, "excluir"),
  ]);

  const competencia = ehCompetencia(sp.mes) ? sp.mes : competenciaAtual();
  const ano = Number(competencia.slice(0, 4));

  const [config, salarios, mes, realizado, mesesDoAno, realizadoDoAno, acoes, revisao, anos] = await Promise.all([
    lerConfig(revendaId),
    lerSalarios(revendaId),
    lerMes(revendaId, competencia),
    lerRealizado(revendaId, competencia),
    lerMeses(revendaId, ano),
    lerRealizadoDoAno(revendaId, ano),
    lerAcoes(revendaId, ano),
    lerRevisao(revendaId, competencia),
    anosComDados(revendaId),
  ]);

  const mesAtual = mes ?? { ...MES_VAZIO, competencia };
  const { linhas, dist, arm } = dimensionamentoDoMes(mesAtual, config, salarios, realizado);
  const dispersao = dispersaoDoVolume(mesAtual);

  const totalDimensionado = linhas.reduce((s, l) => s + l.dimensionado, 0);
  const totalRealizado = linhas.reduce((s, l) => s + (l.realizado ?? 0), 0);
  const temRealizado = linhas.some((l) => l.realizado != null);
  const custoDimensionado = linhas.reduce((s, l) => s + l.custoDimensionado, 0);
  const custoRealizado = linhas.reduce((s, l) => s + (l.custoRealizado ?? 0), 0);
  const acoesDoMes = acoes.filter((a) => a.competencia === competencia);
  const abertas = acoes.filter((a) => a.status !== "concluida");
  const desvios = linhas.filter((l) => l.diferenca != null && l.diferenca !== 0);
  const anosDoSeletor = [...new Set([ano, ...anos, Number(competenciaAtual().slice(0, 4))])].sort((a, b) => b - a);

  // O histórico do ano: uma linha por mês, com o que foi dimensionado, o
  // que havia e a dispersão do volume. É a evidência de que o simulador é
  // revisado todo mês, que é o que o DPO cobra.
  const historico = mesesDoAno.map((m) => {
    const real = realizadoDoAno.get(m.competencia) ?? {};
    const r = dimensionamentoDoMes(m, config, salarios, real);
    return {
      competencia: m.competencia,
      volumeNegociado: m.volume_negociado,
      volumeRealizado: m.volume_realizado,
      dispersao: dispersaoDoVolume(m),
      dimensionado: r.linhas.reduce((s, l) => s + l.dimensionado, 0),
      realizado: r.linhas.some((l) => l.realizado != null) ? r.linhas.reduce((s, l) => s + (l.realizado ?? 0), 0) : null,
      custo: r.linhas.reduce((s, l) => s + l.custoDimensionado, 0),
      linhas: r.linhas,
    };
  });

  const href = (m: string) => `/gestao/mao-de-obra?mes=${m}`;

  return (
    <div>
      <PageHeader
        title="👷 Simulador de Mão de Obra"
        subtitle="Quanta gente o volume do mês pede, quanta temos e quanto custa"
        fecharHref="/gestao"
      />

      {sp.erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{decodificar(sp.erro)}</p>}
      {sp.sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{decodificar(sp.sucesso)}</p>
      )}

      {/* ---- O MÊS ---- */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
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
            : "Mês ainda não revisado — lance o volume abaixo."}
        </p>
      </div>

      {/* ---- OS NÚMEROS DO MÊS ---- */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Cartao titulo="Gente dimensionada" valor={String(totalDimensionado)} detalhe={`para ${formatarNumero(mesAtual.volume_negociado ?? 0, 0)} HL negociados`} tom="destaque" />
        <Cartao
          titulo="Gente que temos"
          valor={temRealizado ? String(totalRealizado) : "—"}
          detalhe={temRealizado ? `${totalRealizado - totalDimensionado >= 0 ? "+" : ""}${totalRealizado - totalDimensionado} contra o dimensionado` : "informe o quadro abaixo"}
          tom={temRealizado && totalRealizado !== totalDimensionado ? "atencao" : "neutro"}
        />
        <Cartao titulo="Custo dimensionado" valor={formatarReais(custoDimensionado)} detalhe="por mês, com encargos e benefícios" />
        <Cartao
          titulo="Dispersão do volume"
          valor={formatarPercento(dispersao)}
          detalhe={
            dispersao == null
              ? "informe o volume realizado"
              : Math.abs(dispersao) > DISPERSAO_ACEITA
                ? `fora da faixa de ${formatarPercento(DISPERSAO_ACEITA)}`
                : "dentro da faixa"
          }
          tom={dispersao != null && Math.abs(dispersao) > DISPERSAO_ACEITA ? "erro" : "neutro"}
        />
      </div>

      {/* ---- DIMENSIONADO x REALIZADO ---- */}
      <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">Dimensionado x realizado</h2>
          <ExportarCsv
            nome={`mao-de-obra-${competencia}`}
            cabecalho={["Área", "Função", "Dimensionado", "Realizado", "Diferença", "Custo unitário", "Custo dimensionado", "Custo realizado"]}
            linhas={linhas.map((l) => [
              l.area,
              l.rotulo,
              l.dimensionado,
              l.realizado ?? "",
              l.diferenca ?? "",
              l.custoUnitario,
              l.custoDimensionado,
              l.custoRealizado ?? "",
            ])}
            rotulo="Exportar .csv"
          />
        </div>
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Função</th>
              <th className="w-16 px-1 py-2 text-right">Dim.</th>
              <th className="w-16 px-1 py-2 text-right">Real</th>
              <th className="w-16 px-1 py-2 text-right">Dif.</th>
              <th className="w-24 px-2 py-2 text-right">Custo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l) => (
              <tr key={l.funcao} className="align-top">
                <td className="px-3 py-2">
                  <span className="block font-medium text-slate-800">{l.rotulo}</span>
                  <span className="block text-[11px] text-slate-400">
                    {l.area} · conta: {formatarNumero(l.dimensionadoExato, 1)}
                  </span>
                </td>
                <td className="px-1 py-2 text-right font-mono font-bold tabular-nums text-slate-900">{l.dimensionado}</td>
                <td className="px-1 py-2 text-right font-mono tabular-nums text-slate-600">{l.realizado ?? "—"}</td>
                <td
                  className={`px-1 py-2 text-right font-mono font-semibold tabular-nums ${
                    l.diferenca == null ? "text-slate-300" : l.diferenca === 0 ? "text-emerald-600" : l.diferenca > 0 ? "text-amber-600" : "text-red-600"
                  }`}
                >
                  {l.diferenca == null ? "—" : l.diferenca > 0 ? `+${l.diferenca}` : l.diferenca}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-[13px] tabular-nums text-slate-700">
                  {formatarReais(l.custoDimensionado)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-[3px] border-double border-slate-300 bg-slate-50 font-semibold">
              <td className="px-3 py-2 text-slate-700">Total</td>
              <td className="px-1 py-2 text-right font-mono tabular-nums">{totalDimensionado}</td>
              <td className="px-1 py-2 text-right font-mono tabular-nums">{temRealizado ? totalRealizado : "—"}</td>
              <td className="px-1 py-2 text-right font-mono tabular-nums">
                {temRealizado ? totalRealizado - totalDimensionado : "—"}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-[13px] tabular-nums">
                {formatarReais(custoDimensionado)}
              </td>
            </tr>
          </tfoot>
        </table>
        {temRealizado && custoRealizado > 0 && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-600">
            Custo do quadro atual: <b className="font-mono tabular-nums">{formatarReais(custoRealizado)}</b> ·
            diferença para o dimensionado:{" "}
            <b className={`font-mono tabular-nums ${custoRealizado > custoDimensionado ? "text-red-700" : "text-emerald-700"}`}>
              {formatarReais(custoRealizado - custoDimensionado)}
            </b>
          </p>
        )}
        <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
          Frota: {formatarNumero(dist.frotasReal, 1)} carros pela linear de {formatarNumero(dist.linear, 0)} HL/dia
          {dist.ocupacaoDaFrota != null && ` · ${formatarPercento(dist.ocupacaoDaFrota)} da frota fixa`} · Armazém:{" "}
          {formatarNumero(arm.mapsPrevistos, 1)} mapas/dia, {formatarNumero(arm.operadorNoite, 1)} operador na noite e{" "}
          {formatarNumero(arm.operadorManha, 1)} na manhã.
        </p>
      </section>

      {/* ---- PLANO DE AÇÃO ---- */}
      <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800">Plano de ação</h2>
          <span className="text-xs text-slate-500">
            {abertas.length} em aberto em {ano}
          </span>
        </div>
        {desvios.length > 0 && (
          <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs text-amber-900">
            ⚠️ Desvio neste mês:{" "}
            {desvios.map((d) => `${d.rotulo} ${d.diferenca! > 0 ? `+${d.diferenca}` : d.diferenca}`).join(" · ")}. O DPO
            pede plano de ação para corrigir.
          </p>
        )}
        {acoesDoMes.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {acoesDoMes.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 p-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <b className="text-slate-800">{a.oQue}</b>
                  <span className="block text-[11px] text-slate-500">
                    {a.funcao ? `${a.funcao} · ` : ""}
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
                      <select
                        name="status"
                        defaultValue={a.status}
                        className="rounded-lg border border-slate-300 px-1.5 py-1 text-xs"
                      >
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
                    <BotaoExcluir
                      action={excluirAcao}
                      campos={{ id: a.id, competencia }}
                      confirmacao={`Apagar a ação “${a.oQue}”?`}
                    >
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
              <input
                name="responsavel"
                required
                maxLength={120}
                placeholder="Responsável"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
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
            <BotaoEnviar
              textoEnviando="Salvando..."
              className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
            >
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
              ✏️ Lançar o mês {rotuloCompetencia(competencia)}
            </summary>
            <div className="border-t border-slate-100 p-4">
              <FormMes competencia={competencia} mes={mes} config={config} />
            </div>
          </details>

          <details className="mb-3 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none p-4 text-sm font-bold text-slate-800">
              👥 Quadro realizado (QLP) do mês
            </summary>
            <form action={salvarRealizado} className="space-y-3 border-t border-slate-100 p-4">
              <input type="hidden" name="competencia" value={competencia} />
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
              <BotaoEnviar
                textoEnviando="Salvando..."
                className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                Salvar o quadro realizado
              </BotaoEnviar>
            </form>
          </details>

          <details className="mb-3 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none p-4 text-sm font-bold text-slate-800">
              ⚙️ Parâmetros da operação
            </summary>
            <form action={salvarParametros} className="space-y-3 border-t border-slate-100 p-4">
              <input type="hidden" name="competencia" value={competencia} />
              <p className="text-xs text-slate-500">
                Vieram da planilha da companhia. Tempos e jornada são frações do dia: 0,3056 é uma jornada de 7h20.
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
                    {p.ajuda && <span className="mt-0.5 block text-[10px] text-slate-400">{p.ajuda}</span>}
                  </label>
                ))}
              </div>
              <BotaoEnviar
                textoEnviando="Salvando..."
                className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                Salvar os parâmetros
              </BotaoEnviar>
            </form>
          </details>

          <details className="mb-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none p-4 text-sm font-bold text-slate-800">
              💰 Base salarial por função
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-4">
              <p className="text-xs text-slate-500">
                O custo mensal de UMA pessoa. Os valores de partida vieram da planilha da companhia — confira os da sua
                revenda.
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
                    <BotaoEnviar
                      textoEnviando="Salvando..."
                      className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Salvar {f.rotulo.toLowerCase()}
                    </BotaoEnviar>
                  </form>
                </details>
              ))}
            </div>
          </details>
        </>
      )}

      {/* ---- HISTÓRICO DO ANO ---- */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">Histórico de {ano}</h2>
          {historico.length > 0 && (
            <ExportarCsv
              nome={`mao-de-obra-historico-${ano}`}
              cabecalho={[
                "Competência",
                "Volume negociado (HL)",
                "Volume realizado (HL)",
                "Dispersão (%)",
                "Dimensionado",
                "Realizado",
                "Custo dimensionado",
                ...FUNCOES.map((f) => `Dim. ${f.rotulo}`),
              ]}
              linhas={historico.map((h) => [
                rotuloCompetencia(h.competencia),
                h.volumeNegociado ?? "",
                h.volumeRealizado ?? "",
                h.dispersao == null ? "" : h.dispersao * 100,
                h.dimensionado,
                h.realizado ?? "",
                h.custo,
                ...h.linhas.map((l) => l.dimensionado),
              ])}
              rotulo="Exportar .csv"
            />
          )}
        </div>
        {historico.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            Nenhum mês lançado em {ano}. Lance o volume no bloco acima para o simulador começar a trabalhar.
          </p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Mês</th>
                <th className="w-20 px-1 py-2 text-right">Dim.</th>
                <th className="w-20 px-1 py-2 text-right">Real</th>
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
                  <td className="px-1 py-2 text-right font-mono tabular-nums text-slate-600">{h.realizado ?? "—"}</td>
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
