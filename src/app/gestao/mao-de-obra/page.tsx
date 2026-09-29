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
  lerAcoesDoPeriodo,
  lerConfig,
  lerDestinatarios,
  lerDias,
  lerEnvios,
  lerMeses,
  lerMesesDoPeriodo,
  lerProjecoes,
  lerRealizadoDoPeriodo,
  lerSalarios,
  qlpVigente,
} from "@/lib/mao-de-obra-server";
import {
  DIAS_DO_SELLOUT,
  DISPERSAO_ACEITA,
  FUNCOES,
  MESES_CURTOS,
  MES_VAZIO,
  MODULO_MAO_DE_OBRA,
  LIMITE_ANS_VENDAS,
  excedeAns,
  PARAMETROS,
  REQUISITO_DPO,
  ROTULO_SITUACAO,
  ROTULO_STATUS_ACAO,
  RUBRICAS,
  STATUS_ACAO,
  SUFIXO_DO_FORMATO,
  classeDaDispersao,
  conferenciaDoPlano,
  competenciaAnterior,
  competenciaAtual,
  contaDistribuicao,
  curvaLigada,
  custoDaPessoa,
  dimensionamentoDoMes,
  dimensionamentoNoRitmo,
  dispersoesDoMes,
  eficaciaDoMes,
  ehCompetencia,
  formatarNumero,
  formatarReais,
  linhaDoTempoDaProjecao,
  mesesDeAntecedencia,
  mesesDoPlanejamento,
  mostrarNumero,
  parametroParaTela,
  projecaoDoMes,
  rotuloCompetencia,
  rotuloCurto,
  rotuloDaDispersao,
  sentidoDaDispersao,
  somaDoSellout,
  temDesvio,
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

type Aba = "planejar" | "dia" | "resultado" | "configurar";

const ABAS: { id: Aba; rotulo: string; quando: string }[] = [
  { id: "planejar", rotulo: "1 · Planejar", quando: "início do mês" },
  { id: "dia", rotulo: "2 · Acompanhar o dia", quando: "todo dia" },
  { id: "resultado", rotulo: "3 · Resultado", quando: "fim do mês" },
  { id: "configurar", rotulo: "4 · Configurar", quando: "quando mudar" },
];

/**
 * O SIMULADOR DE MÃO DE OBRA -- item 1.2 do DPO (Dimensionamento).
 *
 * Refeito em 28/09/2026 (pedido do dono: "mais simples"). Quatro abas, na
 * ORDEM DO CICLO do mês, e cada uma responde a uma pergunta:
 *   1. PLANEJAR   -- quanta gente os próximos 3 meses pedem, e o que o time
 *                    de Gente precisa contratar (V.1, V.2);
 *   2. DIA        -- o volume de hoje está no ritmo? (V.4);
 *   3. RESULTADO  -- o mês fechou onde o plano disse? o que foi projetado
 *                    lá atrás bateu? e o desvio tem ação? (V.3, V.5, V.6);
 *   4. CONFIGURAR -- parâmetros, salários e e-mails, que mudam pouco.
 */
export default async function MaoDeObraPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; aba?: string; editar?: string; erro?: string; sucesso?: string }>;
}) {
  await requireModulo(MODULO_MAO_DE_OBRA, "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const sp = await searchParams;

  const competencia = ehCompetencia(sp.mes) ? sp.mes : competenciaAtual();
  const ano = Number(competencia.slice(0, 4));
  const aba: Aba = ABAS.some((a) => a.id === sp.aba) ? (sp.aba as Aba) : "planejar";
  // O quadro mostra os 3 meses SEGUINTES; o próprio mês continua editável
  // (é o volume dele que a grade do dia distribui).
  const horizonte = mesesDoPlanejamento(competencia);
  const editaveis = [competencia, ...horizonte];
  const editar = ehCompetencia(sp.editar) && editaveis.includes(sp.editar) ? sp.editar : horizonte[0];

  // A janela: 3 meses para trás (eficácia) e 2 para a frente (planejamento).
  const tres = competenciaAnterior(competenciaAnterior(competenciaAnterior(competencia)));
  const [
    podeEditar,
    podeExcluir,
    revenda,
    perfil,
    config,
    salarios,
    meses,
    qlpPorMes,
    acoes,
    projecoes,
    dias,
    destinatarios,
    envios,
    mesesDoAno,
    anos,
  ] = await Promise.all([
    podeNoModulo(MODULO_MAO_DE_OBRA, "editar"),
    podeNoModulo(MODULO_MAO_DE_OBRA, "excluir"),
    getRevendaAtiva(),
    getPerfil(),
    lerConfig(revendaId),
    lerSalarios(revendaId),
    lerMesesDoPeriodo(revendaId, tres, horizonte[2]),
    lerRealizadoDoPeriodo(revendaId, "2000-01", horizonte[2]),
    lerAcoesDoPeriodo(revendaId, tres, horizonte[2]),
    lerProjecoes(revendaId, tres, horizonte[2]),
    lerDias(revendaId, competencia),
    lerDestinatarios(revendaId),
    lerEnvios(revendaId),
    lerMeses(revendaId, ano),
    anosComDados(revendaId),
  ]);

  const mes = meses.get(competencia) ?? null;
  const mesAtual: MesMaoDeObra = mes ?? { ...MES_VAZIO, competencia };
  const qlpAtual = qlpVigente(qlpPorMes, competencia);
  const temQlp = Object.keys(qlpAtual).length > 0;

  // ---- PLANEJAR: os 3 meses, cada um com o seu quadro ----
  const planejamento = horizonte.map((c) => {
    const m = meses.get(c) ?? null;
    if (!m) return { competencia: c, mes: null, vagas: null, custo: 0 };
    const { linhas } = dimensionamentoDoMes(m, config, salarios, qlpVigente(qlpPorMes, c));
    return {
      competencia: c,
      mes: m,
      vagas: vagasDoMes(linhas),
      custo: linhas.reduce((s, l) => s + l.custoDimensionado, 0),
    };
  });
  const paraFormalizar = planejamento
    .filter((p) => p.mes && p.vagas)
    .map((p) => ({
      competencia: p.competencia,
      vagas: p.vagas!,
      volumeNegociado: p.mes!.volume_negociado,
      volumePpr: p.mes!.volume_ppr,
      justificativaMotivo: p.mes!.qlp_justificativa_motivo,
      justificativa: p.mes!.qlp_justificativa,
    }));
  const ultimoEnvio = envios.find((e) => e.competencia === competencia) ?? null;

  // ---- DIA ----
  const diasDoMes = volumePorDia(mesAtual, dias, config);
  const conferencia = conferenciaDoPlano(mesAtual, diasDoMes);
  const projecao = projecaoDoMes(diasDoMes);
  const doPlano = contaDistribuicao(mesAtual);
  const noRitmo = dimensionamentoNoRitmo(mesAtual, projecao.projetado);

  // ---- RESULTADO ----
  const dispersoes = dispersoesDoMes(mesAtual, diasDoMes);
  // O ANS com Vendas: dia acima de +20% do necessário pede justificativa.
  const diasAcimaDoAns = diasDoMes.filter((d) => excedeAns(d.dispersao));
  const diasSemJustificativa = diasAcimaDoAns.filter((d) => !d.justificativaMotivo).length;
  const linhaDoTempo = linhaDoTempoDaProjecao(projecoes, competencia);
  // "Hoje" do V.3 é o que ESTE mês pede agora -- não a primeira coluna do
  // planejamento, que desde 28/09/2026 já é o mês seguinte.
  const hoje = mes ? vagasDoMes(dimensionamentoDoMes(mes, config, salarios, qlpAtual).linhas) : null;
  const eficacia = [3, 2, 1].map((voltas) => {
    let c = competencia;
    for (let i = 0; i < voltas; i++) c = competenciaAnterior(c);
    return eficaciaDoMes({
      competencia: c,
      mes: meses.get(c) ?? null,
      fotografias: projecoes,
      qlpReal: qlpVigente(qlpPorMes, c),
      acoes,
    });
  });
  const acoesAbertas = acoes.filter((a) => a.status !== "concluida");
  const acoesDoMes = acoes.filter((a) => a.competencia === competencia);
  const acoesParaMostrar = [...new Map([...acoesDoMes, ...acoesAbertas].map((a) => [a.id, a])).values()];

  const anosDoSeletor = [...new Set([ano, ...anos, Number(competenciaAtual().slice(0, 4))])].sort((a, b) => b - a);
  const href = (m: string, a: Aba = aba, extra = "") => `/gestao/mao-de-obra?mes=${m}&aba=${a}${extra}`;
  const emailsAtivos = destinatarios.filter((d) => d.ativo).map((d) => d.email);

  return (
    <div>
      <PageHeader
        title="👷 Simulador de Mão de Obra"
        subtitle="Planeje o quadro de 2 a 3 meses à frente, acompanhe o volume do dia e corrija os desvios"
        fecharHref="/gestao"
      />

      {sp.erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{decodificar(sp.erro)}</p>}
      {sp.sucesso && <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{decodificar(sp.sucesso)}</p>}

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
        <div className="mt-2 grid grid-cols-6 gap-1 sm:grid-cols-12">
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
        {/* A EVIDÊNCIA DO V.2, sempre à vista: revisado e formalizado. */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          <span className={mes ? "text-emerald-700" : "text-amber-700"}>
            {mes ? "✅ Mês revisado" : "⚠️ Mês ainda não lançado"}
          </span>
          <span className={ultimoEnvio ? "text-emerald-700" : "text-amber-700"}>
            {ultimoEnvio
              ? `✅ Formalizado para Gente em ${new Date(ultimoEnvio.enviadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
              : "⚠️ Ainda não formalizado para Gente"}
          </span>
        </div>
      </div>

      {/* ---- ABAS ---- */}
      <nav className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ABAS.map((a) => (
          <Link
            key={a.id}
            href={href(competencia, a.id)}
            aria-current={a.id === aba ? "page" : undefined}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              a.id === aba ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {a.rotulo}
            <span className={`block text-[10px] font-normal ${a.id === aba ? "text-white/80" : "text-slate-400"}`}>
              {a.quando}
            </span>
          </Link>
        ))}
      </nav>

      {/* =========================== 1. PLANEJAR =========================== */}
      {aba === "planejar" && (
        <div className="space-y-4">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-800">
                  Quadro necessário nos próximos 3 meses — {rotuloCurto(horizonte[0])} a {rotuloCurto(horizonte[2])}
                </h2>
                <p className="text-[11px] text-slate-500">
                  O volume de cada mês vira gente por função. A diferença para o QLP atual é o que o time de Gente
                  precisa contratar (▲) ou não repor (▼).
                </p>
              </div>
              <ExportarCsv
                nome={`planejamento-${competencia}`}
                cabecalho={["Função", "QLP atual", ...horizonte.map(rotuloCurto)]}
                linhas={FUNCOES.map((f) => [
                  f.rotulo,
                  qlpAtual[f.id] ?? "",
                  ...planejamento.map((p) => p.vagas?.find((v) => v.funcao === f.id)?.dimensionado ?? ""),
                ])}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Função</th>
                    <th className="w-16 px-1 py-2 text-right">QLP atual</th>
                    {planejamento.map((p) => (
                      <th key={p.competencia} className="w-20 px-2 py-2 text-right">
                        <Link href={href(competencia, "planejar", `&editar=${p.competencia}#lancar`)} className="text-primary-dark hover:underline">
                          {rotuloCurto(p.competencia)} ✏️
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50/60 text-xs text-slate-600">
                    <td className="px-3 py-1.5">Volume negociado (HL)</td>
                    <td />
                    {planejamento.map((p) => (
                      <td key={p.competencia} className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {p.mes ? formatarNumero(p.mes.volume_negociado, 0) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-slate-50/60 text-xs text-slate-600">
                    <td className="px-3 py-1.5">Volume PPR (HL)</td>
                    <td />
                    {planejamento.map((p) => (
                      <td key={p.competencia} className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {p.mes ? formatarNumero(p.mes.volume_ppr, 0) : "—"}
                      </td>
                    ))}
                  </tr>
                  {FUNCOES.map((f) => (
                    <tr key={f.id}>
                      <td className="px-3 py-1.5">
                        <span className="text-slate-800">{f.rotulo}</span>
                        <span className="block text-[10px] text-slate-400">{f.area}</span>
                      </td>
                      <td className="px-1 py-1.5 text-right font-mono tabular-nums text-slate-500">{qlpAtual[f.id] ?? "—"}</td>
                      {planejamento.map((p) => {
                        const v = p.vagas?.find((x) => x.funcao === f.id);
                        return (
                          <td key={p.competencia} className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {v ? (
                              <>
                                <b className="text-slate-900">{v.dimensionado}</b>
                                {v.atual != null && (v.vagas > 0 || v.excedente > 0) && (
                                  <span className={`block text-[10px] ${v.vagas > 0 ? "text-amber-600" : "text-red-600"}`}>
                                    {v.vagas > 0 ? `▲ contratar ${v.vagas}` : `▼ ${v.excedente} a mais`}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-[3px] border-double border-slate-300 bg-primary-soft/40 font-semibold">
                    <td className="px-3 py-2 text-slate-800">
                      QLP dimensionado
                      <span className="block text-[10px] font-normal text-slate-500">× QLP atual · custo do mês</span>
                    </td>
                    <td className="px-1 py-2 text-right font-mono tabular-nums">
                      {temQlp ? Object.values(qlpAtual).reduce((s, v) => s + (v ?? 0), 0) : "—"}
                    </td>
                    {planejamento.map((p) => (
                      <td key={p.competencia} className="px-2 py-2 text-right font-mono tabular-nums text-slate-900">
                        {p.vagas ? p.vagas.reduce((s, v) => s + v.dimensionado, 0) : "—"}
                        {p.vagas && (
                          <span className="block text-[10px] font-normal text-slate-400">{formatarReais(p.custo)}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-slate-50 text-xs">
                    <td className="px-3 py-1.5 font-semibold text-slate-700">Contratar / reduzir</td>
                    <td />
                    {planejamento.map((p) => {
                      const contratar = p.vagas ? p.vagas.reduce((s, v) => s + v.vagas, 0) : 0;
                      const reduzir = p.vagas ? p.vagas.reduce((s, v) => s + v.excedente, 0) : 0;
                      return (
                        <td key={p.competencia} className="px-2 py-1.5 text-right font-mono font-bold tabular-nums">
                          {!p.vagas || !temQlp ? (
                            "—"
                          ) : contratar === 0 && reduzir === 0 ? (
                            <span className="text-emerald-600">= atende</span>
                          ) : (
                            <>
                              {contratar > 0 && <span className="block text-amber-600">▲ +{contratar}</span>}
                              {reduzir > 0 && <span className="block text-red-600">▼ −{reduzir}</span>}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="bg-slate-50 text-[11px] align-top">
                    <td className="px-3 py-1.5 font-semibold text-slate-700">Justificativa</td>
                    <td />
                    {planejamento.map((p) => (
                      <td key={p.competencia} className="px-2 py-1.5 text-right text-slate-600" title={p.mes?.qlp_justificativa ?? undefined}>
                        {p.mes?.qlp_justificativa_motivo ?? (p.mes?.qlp_justificativa ? "ver ✏️" : <span className="text-amber-600">falta</span>)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            {planejamento.some((p) => !p.mes) && (
              <p className="border-t border-slate-100 bg-amber-50 px-4 py-2 text-[11px] text-amber-900">
                ⚠️ Falta lançar o volume de{" "}
                {planejamento
                  .filter((p) => !p.mes)
                  .map((p) => rotuloCompetencia(p.competencia))
                  .join(" e ")}
                . Clique no mês no topo da tabela.
              </p>
            )}
          </section>

          {/* ---- LANÇAR O VOLUME DE UM DOS 3 MESES ---- */}
          {podeEditar && (
            <details id="lancar" open={Boolean(sp.editar) || !meses.get(editar)} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer list-none p-4 text-sm font-bold text-slate-800">
                ✏️ Volume e estrutura de {rotuloCompetencia(editar)}
                <span className="block text-[11px] font-normal text-slate-500">
                  Salvar registra a revisão do mês (quem e quando).
                </span>
              </summary>
              <div className="border-t border-slate-100 p-4">
                <div className="mb-3 flex flex-wrap gap-1">
                  {editaveis.map((c) => (
                    <Link
                      key={c}
                      href={href(competencia, "planejar", `&editar=${c}#lancar`)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        c === editar ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {rotuloCurto(c)}
                    </Link>
                  ))}
                </div>
                <FormMes key={editar} competencia={editar} base={competencia} mes={meses.get(editar) ?? null} config={config} />
              </div>
            </details>
          )}

          {/* ---- QLP ATUAL ---- */}
          {podeEditar && (
            <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer list-none p-4 text-sm font-bold text-slate-800">
                👥 QLP atual — quem temos hoje
                <span className="block text-[11px] font-normal text-slate-500">
                  Vale para os meses seguintes até ser atualizado.
                </span>
              </summary>
              <form action={salvarRealizado} className="space-y-3 border-t border-slate-100 p-4">
                <input type="hidden" name="competencia" value={competencia} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {FUNCOES.map((f) => (
                    <label key={f.id} className="block">
                      <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{f.rotulo}</span>
                      <input
                        name={`real_${f.id}`}
                        defaultValue={qlpAtual[f.id] ?? ""}
                        inputMode="numeric"
                        className="w-full rounded-lg border border-slate-300 px-2 py-2 text-right font-mono text-sm tabular-nums"
                      />
                    </label>
                  ))}
                </div>
                <BotaoEnviar textoEnviando="Salvando..." className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
                  Salvar o QLP de {rotuloCompetencia(competencia)}
                </BotaoEnviar>
              </form>
            </details>
          )}

          {/* ---- FORMALIZAR ---- */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">📨 Formalizar para o time de Gente</h2>
            <p className="mb-3 text-[11px] text-slate-500">
              Uma vez por mês: manda o quadro dos 3 meses para programar a contratação e guarda a fotografia da
              projeção — é ela que o Resultado compara daqui a 2 e 3 meses.
            </p>
            {paraFormalizar.length === 0 ? (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Lance o volume de pelo menos um dos 3 meses.</p>
            ) : (
              <EnviarParaRecrutamento
                competencia={competencia}
                revenda={revenda?.nome ?? "Revenda"}
                meses={paraFormalizar}
                destinatarios={emailsAtivos}
                quemEnvia={perfil?.nome ?? "—"}
                podeEditar={podeEditar}
                hoje={new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}
              />
            )}
            {envios.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                  Formalizações anteriores ({envios.length})
                </summary>
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 text-xs">
                  {envios.map((e) => (
                    <li key={e.id} className="flex flex-wrap justify-between gap-2 p-2">
                      <span>
                        <b className="text-slate-800">{rotuloCompetencia(e.competencia)}</b> · {e.totalVagas} vaga
                        {e.totalVagas === 1 ? "" : "s"}
                      </span>
                      <span className="text-slate-500">
                        {new Date(e.enviadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} ·{" "}
                        {e.enviadoPorNome ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        </div>
      )}

      {/* =========================== 2. DIA =========================== */}
      {aba === "dia" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800">Volume do dia — {rotuloCompetencia(competencia)}</h2>
          <p className="mb-3 text-xs text-slate-500">
            Lance o realizado de cada dia. A meta do dia vem do volume do mês; desmarque o feriado e ela se redistribui.
          </p>
          {mes && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Cartao
                titulo="Volume negociado"
                valor={`${formatarNumero(mes.volume_negociado, 0)} HL`}
                detalhe={mes.base_meta === "negociado" ? "é ele que a meta do dia distribui" : "demanda do mês"}
              />
              <Cartao
                titulo="Volume PPR"
                valor={`${formatarNumero(mes.volume_ppr, 0)} HL`}
                detalhe={mes.base_meta === "ppr" ? "é ele que a meta do dia distribui" : "volume do plano"}
              />
            </div>
          )}
          {!mes ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Lance o volume do mês na aba 1 · Planejar para a meta do dia existir.
            </p>
          ) : (
            <>
              <FormDias
                competencia={competencia}
                dias={diasDoMes}
                podeEditar={podeEditar}
                planoSabado={diasDoMes.find((d) => d.opera && d.tipo === "sabado")?.plan ?? 0}
                conferencia={conferencia}
                diasInformados={mesAtual.dias_totais ?? 0}
                curva={curvaLigada(config) ? DIAS_DO_SELLOUT.map((d) => ({ rotulo: d.rotulo, valor: config[d.id] })) : null}
              />
              {/* A FLEXÃO (V.4): no ritmo de hoje, quanta frota o mês pede? */}
              {projecao.realizadoAteAgora > 0 && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Flexão: no ritmo de hoje</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Se o mês fechar em {formatarNumero(projecao.projetado, 0)} HL, a entrega pede:
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <Flexao rotulo="Frota" plano={doPlano.frotaDimensionada} ritmo={noRitmo.frotaDimensionada} />
                    <Flexao rotulo="Motoristas" plano={doPlano.motoristas} ritmo={noRitmo.motoristas} />
                    <Flexao rotulo="Ajudantes" plano={doPlano.ajudantes} ritmo={noRitmo.ajudantes} />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Diferença aqui é hora de ajustar SPOT, hora extra ou férias — e de lançar a ação na aba 3.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* =========================== 3. RESULTADO =========================== */}
      {aba === "resultado" && (
        <div className="space-y-4">
          {/* V.5 -- as duas dispersões */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800">Dispersão do volume — {rotuloCompetencia(competencia)}</h2>
            <p className="mb-3 text-[11px] text-slate-500">
              {dispersoes.fechado
                ? `Mês fechado: ${formatarNumero(dispersoes.realizado, 0)} HL realizados.`
                : dispersoes.diasLancados > 0
                  ? `Acumulado de ${dispersoes.diasLancados} dia(s): ${formatarNumero(dispersoes.realizado, 0)} HL contra a parte do volume que já devia ter saído.`
                  : "Lance o volume do dia na aba 2 para a dispersão aparecer."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Cartao
                titulo="Dimensionado × realizado"
                valor={rotuloDaDispersao(dispersoes.contraPpr)}
                detalhe={`realizado ÷ PPR (${formatarNumero(mesAtual.volume_ppr, 0)} HL)`}
                tom={tomDaDispersao(dispersoes.contraPpr)}
              />
              <Cartao
                titulo="Realizado × demanda"
                valor={rotuloDaDispersao(dispersoes.contraNegociado)}
                detalhe={`realizado ÷ negociado (${formatarNumero(mesAtual.volume_negociado, 0)} HL)`}
                tom={tomDaDispersao(dispersoes.contraNegociado)}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              ▲ verde: acima do volume · ▼ vermelho: abaixo. Fora de ±{formatarNumero(DISPERSAO_ACEITA * 100, 0)}% pede plano de ação.
            </p>

            {/* OS DIAS ACIMA DO ANS COM VENDAS (+20% do necessário) */}
            {diasAcimaDoAns.length > 0 && (
              <div className="mt-3 rounded-xl bg-red-50 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-red-800">
                  Dias acima do ANS com Vendas (+{Math.round(LIMITE_ANS_VENDAS * 100)}% do necessário): {diasAcimaDoAns.length}
                  {diasSemJustificativa > 0 && ` · 🔴 ${diasSemJustificativa} sem justificativa`}
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {diasAcimaDoAns.map((d) => (
                    <li key={d.dia} className="flex flex-wrap justify-between gap-2 rounded-lg bg-white px-2 py-1.5">
                      <span>
                        <b className="font-mono">{d.rotulo}</b> · necessário {formatarNumero(d.plan, 0)} · realizado{" "}
                        {formatarNumero(d.realizado, 0)} <b className="text-emerald-700">{rotuloDaDispersao(d.dispersao)}</b>
                      </span>
                      <span className={d.justificativaMotivo ? "text-slate-600" : "font-semibold text-red-700"}>
                        {d.justificativaMotivo
                          ? `${d.justificativaMotivo}${d.justificativa ? ` — ${d.justificativa}` : ""}`
                          : "falta justificar (aba 2)"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* V.3 -- o projetado lá atrás contra hoje */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800">Projetado há 2–3 meses × hoje</h2>
              <p className="text-[11px] text-slate-500">
                O que foi formalizado para {rotuloCompetencia(competencia)} em cada mês anterior, contra o que ele pede hoje.
              </p>
            </div>
            {linhaDoTempo.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                Nenhuma projeção congelada para este mês ainda. A fotografia nasce em “📨 Formalizar para o time de Gente”
                (aba 1): formalize todo início de mês e, daqui a 2 meses, este quadro compara sozinho.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Função</th>
                      {linhaDoTempo.map((p) => (
                        <th key={p.id} className="w-20 px-1 py-2 text-right">
                          em {rotuloCurto(p.competenciaBase)}
                          <span className="block text-[10px] font-normal normal-case">
                            {mesesDeAntecedencia(p) === 0 ? "no mês" : `${mesesDeAntecedencia(p)} mês(es) antes`}
                          </span>
                        </th>
                      ))}
                      <th className="w-16 px-1 py-2 text-right">Hoje</th>
                      <th className="w-14 px-2 py-2 text-right">Var.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {FUNCOES.map((f) => {
                      const atual = hoje?.find((v) => v.funcao === f.id)?.dimensionado ?? null;
                      const primeiro = linhaDoTempo[0].dimensionado[f.id] ?? null;
                      const variacao = atual != null && primeiro != null ? atual - primeiro : null;
                      return (
                        <tr key={f.id}>
                          <td className="px-3 py-1.5 text-slate-800">{f.rotulo}</td>
                          {linhaDoTempo.map((p) => (
                            <td key={p.id} className="px-1 py-1.5 text-right font-mono tabular-nums text-slate-500">
                              {p.dimensionado[f.id] ?? "—"}
                            </td>
                          ))}
                          <td className="px-1 py-1.5 text-right font-mono font-bold tabular-nums text-slate-900">{atual ?? "—"}</td>
                          <td
                            className={`px-2 py-1.5 text-right font-mono font-semibold tabular-nums ${
                              !variacao ? "text-slate-300" : variacao > 0 ? "text-amber-600" : "text-emerald-600"
                            }`}
                          >
                            {variacao == null ? "—" : variacao > 0 ? `+${variacao}` : variacao}
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
                      {linhaDoTempo.map((p) => (
                        <td key={p.id} className="px-1 py-2 text-right font-mono tabular-nums">
                          {p.total}
                          <span className="block text-[10px] font-normal text-slate-400">{formatarNumero(p.volumeNegociado, 0)}</span>
                        </td>
                      ))}
                      <td className="px-1 py-2 text-right font-mono tabular-nums">
                        {hoje ? hoje.reduce((s, v) => s + v.dimensionado, 0) : "—"}
                        <span className="block text-[10px] font-normal text-slate-400">{formatarNumero(mesAtual.volume_negociado, 0)}</span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* V.6 -- a eficácia dos últimos 3 meses */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800">Eficácia dos últimos 3 meses</h2>
              <p className="text-[11px] text-slate-500">
                O volume projetado (a primeira fotografia; sem ela, o negociado do mês) contra o realizado — e se o desvio tem ação.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Mês</th>
                    <th className="px-1 py-2 text-right">Projetado</th>
                    <th className="px-1 py-2 text-right">Realizado</th>
                    <th className="px-1 py-2 text-right">Dispersão</th>
                    <th className="px-2 py-2">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {eficacia.map((e) => (
                    <tr key={e.competencia}>
                      <td className="px-3 py-2">
                        <Link href={href(e.competencia, "resultado")} className="font-medium text-primary-dark hover:underline">
                          {rotuloCurto(e.competencia)}
                        </Link>
                      </td>
                      <td className="px-1 py-2 text-right font-mono tabular-nums">
                        {formatarNumero(e.volumeProjetado, 0)}
                        {e.origemDoProjetado === "fotografia" && <span className="block text-[10px] text-slate-400">fotografia</span>}
                      </td>
                      <td className="px-1 py-2 text-right font-mono tabular-nums">{formatarNumero(e.realizado, 0)}</td>
                      <td className={`px-1 py-2 text-right font-mono font-semibold tabular-nums ${classeDaDispersao(e.dispersao)}`}>
                        {rotuloDaDispersao(e.dispersao)}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {ROTULO_SITUACAO[e.situacao]}
                        {e.acoes > 0 && (
                          <span className="block text-[10px] text-slate-400">
                            {e.acoesConcluidas}/{e.acoes} ação(ões) concluída(s)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* V.6 -- o plano de ação */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">Plano de ação dos desvios</h2>
              <span className="text-xs text-slate-500">{acoesAbertas.length} em aberto</span>
            </div>
            {temDesvio(dispersoes) && acoesDoMes.length === 0 && (
              <p className="mt-2 rounded-xl bg-red-50 p-2 text-xs text-red-800">
                🔴 {rotuloCompetencia(competencia)} está fora da faixa de ±{formatarNumero(DISPERSAO_ACEITA * 100, 0)}% e ainda não tem ação.
              </p>
            )}
            {acoesParaMostrar.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {acoesParaMostrar.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 p-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <b className="text-slate-800">{a.oQue}</b>
                      <span className="block text-[11px] text-slate-500">
                        {rotuloCurto(a.competencia)} · {a.responsavel}
                        {a.prazo && ` · até ${a.prazo.split("-").reverse().join("/")}`}
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
                  placeholder="O que será feito (ex.: rever a média por carro; abrir 1 vaga de operador)"
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
                  Incluir no plano de {rotuloCurto(competencia)}
                </BotaoEnviar>
              </form>
            )}
          </section>

          <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer list-none p-4 text-sm font-bold text-slate-800">
              📋 DPO 1.2 — onde está cada evidência
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
        </div>
      )}

      {/* =========================== 4. CONFIGURAR =========================== */}
      {aba === "configurar" && (
        <div className="space-y-4">
          {!podeEditar && (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Só quem pode editar o simulador altera a configuração.</p>
          )}
          {podeEditar && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-bold text-slate-800">⚙️ Parâmetros da operação</h2>
                <p className="mb-3 text-[11px] text-slate-500">Percentuais em %, tempos em horas (7:20 = 7 horas e 20 minutos).</p>
                <form action={salvarParametros} className="space-y-4">
                  <input type="hidden" name="competencia" value={competencia} />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PARAMETROS.map((p) => (
                      <label key={p.id} className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{p.rotulo}</span>
                        <span className="flex items-center gap-1">
                          <input
                            name={p.id}
                            defaultValue={parametroParaTela(config[p.id], p.formato)}
                            inputMode={p.formato === "horas" ? "text" : "decimal"}
                            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-right font-mono text-sm tabular-nums"
                          />
                          <span className="w-10 shrink-0 text-[11px] text-slate-400">{SUFIXO_DO_FORMATO[p.formato]}</span>
                        </span>
                        {p.ajuda && <span className="mt-0.5 block text-[10px] text-slate-400">{p.ajuda}</span>}
                      </label>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Curva de venda por dia da semana</p>
                    <p className="mb-2 text-[11px] text-slate-500">
                      Quanto da semana sai em cada dia — distribui a meta do dia. Soma 100%, ou tudo zero para dividir igual.
                    </p>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                      {DIAS_DO_SELLOUT.map((d) => (
                        <label key={d.id} className="block">
                          <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{d.rotulo.slice(0, 3)}</span>
                          <span className="flex items-center gap-0.5">
                            <input
                              name={d.id}
                              defaultValue={mostrarNumero(config[d.id], 3)}
                              inputMode="decimal"
                              className="w-full rounded-lg border border-slate-300 px-1.5 py-2 text-right font-mono text-sm tabular-nums"
                            />
                            <span className="text-[11px] text-slate-400">%</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Soma hoje:{" "}
                      <b className={somaDoSellout(config) === 0 || Math.abs(somaDoSellout(config) - 100) < 0.01 ? "text-emerald-700" : "text-red-700"}>
                        {formatarNumero(somaDoSellout(config), 1)}%
                      </b>
                      {somaDoSellout(config) === 0 && " (desligada)"}
                    </p>
                  </div>
                  <BotaoEnviar textoEnviando="Salvando..." className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
                    Salvar os parâmetros
                  </BotaoEnviar>
                </form>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-bold text-slate-800">📨 Quem recebe o planejamento (time de Gente)</h2>
                {destinatarios.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">Nenhum e-mail cadastrado.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {destinatarios.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                        <span className="min-w-0">
                          <b className="text-slate-800">{d.nome ?? d.email}</b>
                          {d.nome && <span className="block text-[11px] text-slate-500">{d.email}</span>}
                        </span>
                        <BotaoExcluir action={removerDestinatario} campos={{ id: d.id, competencia }} confirmacao={`Remover ${d.email}?`}>
                          Remover
                        </BotaoExcluir>
                      </li>
                    ))}
                  </ul>
                )}
                <form action={adicionarDestinatario} className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="competencia" value={competencia} />
                  <input name="nome" placeholder="Nome (opcional)" maxLength={120} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <input name="email" required type="email" placeholder="email@limalogistica.com.br" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <BotaoEnviar textoEnviando="Salvando..." className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
                    Incluir
                  </BotaoEnviar>
                </form>
              </section>

              <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <summary className="cursor-pointer list-none p-4 text-sm font-bold text-slate-800">
                  💰 Custo mensal de uma pessoa, por função
                </summary>
                <div className="space-y-2 border-t border-slate-100 p-4">
                  {FUNCOES.map((f) => (
                    <details key={f.id} className="rounded-xl border border-slate-200">
                      <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-semibold text-slate-700">
                        <span>{f.rotulo}</span>
                        <span className="font-mono text-xs tabular-nums text-slate-500">{formatarReais(custoDaPessoa(salarios[f.id]))}/mês</span>
                      </summary>
                      <form action={salvarSalario} className="space-y-2 border-t border-slate-100 p-3">
                        <input type="hidden" name="competencia" value={competencia} />
                        <input type="hidden" name="funcao" value={f.id} />
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {RUBRICAS.map((r) => (
                            <label key={r.id} className="block">
                              <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">{r.rotulo} (R$)</span>
                              <input
                                name={r.id}
                                defaultValue={mostrarNumero(salarios[f.id][r.id] ?? 0, 2)}
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
        </div>
      )}
    </div>
  );
}

function tomDaDispersao(d: number | null): "neutro" | "erro" | "bom" {
  const s = sentidoDaDispersao(d);
  return s === "abaixo" ? "erro" : s === "acima" ? "bom" : "neutro";
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
  tom?: "neutro" | "erro" | "bom";
}) {
  const caixa = { neutro: "border-slate-200 bg-white", erro: "border-red-200 bg-red-50", bom: "border-emerald-200 bg-emerald-50" }[tom];
  const cor = { neutro: "text-slate-900", erro: "text-red-700", bom: "text-emerald-700" }[tom];
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
      <p className={`text-[11px] font-medium ${diferenca === 0 ? "text-slate-400" : diferenca > 0 ? "text-amber-600" : "text-emerald-600"}`}>
        {diferenca === 0 ? "igual ao plano" : `${diferenca > 0 ? "+" : ""}${diferenca} contra o plano`}
      </p>
    </div>
  );
}
