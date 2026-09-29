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
  lerAcoesDoPeriodo,
  lerConfigsDosMeses,
  lerDestinatarios,
  lerDias,
  lerEnvios,
  lerHistorico,
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
  LIMITE_ANS_VENDAS,
  MES_VAZIO,
  MODULO_MAO_DE_OBRA,
  GRUPOS_DO_ARMAZEM,
  PARAMETROS_ARMAZEM,
  REQUISITO_DPO,
  ROTULO_ONDE,
  ROTULO_SITUACAO,
  ROTULO_STATUS_ACAO,
  RUBRICAS,
  STATUS_ACAO,
  TURNOS_DO_ARMAZEM,
  classeDaDispersao,
  competenciaAnterior,
  competenciaAtual,
  competenciaSeguinte,
  conferenciaDoPlano,
  contaArmazem,
  contaDistribuicao,
  curvaLigada,
  custoDaPessoa,
  dimensionamentoDoMes,
  dimensionamentoNoRitmo,
  dispersoesDoMes,
  eficaciaDoMes,
  ehCompetencia,
  excedeAns,
  formatarNumero,
  formatarReais,
  linhaDoTempoDaProjecao,
  mesesDeAntecedencia,
  mesesDoPlanejamento,
  mesesPorExtenso,
  mostrarNumero,
  projecaoDoMes,
  rotuloCompetencia,
  rotuloCurto,
  rotuloDaDispersao,
  sentidoDaDispersao,
  somaDoSellout,
  temDesvio,
  vagasDoMes,
  volumePorDia,
  type ContaArmazem,
  type FuncaoDoArmazem,
  type MesMaoDeObra,
  type VagaDaFuncao,
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

type Aba = "configurar" | "planejar" | "dia" | "resultado";

/**
 * As etapas, NA ORDEM EM QUE SE FAZEM (28/09/2026, pedido do dono:
 * "Configurar precisa estar em primeiro"). A tela continua abrindo em
 * Planejar: Configurar é a base, mas é o que menos muda.
 */
const ABAS: { id: Aba; numero: number; rotulo: string; quando: string }[] = [
  { id: "configurar", numero: 1, rotulo: "Configurar", quando: "quando mudar" },
  { id: "planejar", numero: 2, rotulo: "Planejar", quando: "início do mês" },
  { id: "dia", numero: 3, rotulo: "Acompanhar o dia", quando: "todo dia" },
  { id: "resultado", numero: 4, rotulo: "Resultado", quando: "fim do mês" },
];

const AREAS = ["Distribuição", "Armazém"] as const;

/**
 * O SIMULADOR DE MÃO DE OBRA -- item 1.2 do DPO (Dimensionamento).
 *
 * Layout refeito em 28/09/2026 (pedido do dono: "mais bem formatado e
 * fácil de entender"). Toda aba segue o mesmo desenho:
 *   1. até 4 NÚMEROS no topo -- o que se precisa ver primeiro;
 *   2. BLOCOS com título, uma linha de orientação e o conteúdo;
 *   3. um PRÓXIMO PASSO no fim, com uma ação só.
 * Tabelas de pessoas agrupadas por área, com o +/− ao lado do número.
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
  const aba: Aba = ABAS.some((a) => a.id === sp.aba) ? (sp.aba as Aba) : "planejar";
  // O quadro mostra os 3 meses SEGUINTES; o próprio mês continua editável
  // (é o volume dele que a grade do dia distribui).
  const horizonte = mesesDoPlanejamento(competencia);
  const editaveis = [competencia, ...horizonte];
  const editar = ehCompetencia(sp.editar) && editaveis.includes(sp.editar) ? sp.editar : horizonte[0];

  // A janela: 3 meses para trás (eficácia) e 3 para a frente (planejamento).
  const tres = competenciaAnterior(competenciaAnterior(competenciaAnterior(competencia)));
  const [
    podeEditar,
    podeExcluir,
    revenda,
    perfil,
    configs,
    salarios,
    meses,
    qlpPorMes,
    acoes,
    projecoes,
    dias,
    destinatarios,
    envios,
    historico,
  ] = await Promise.all([
    podeNoModulo(MODULO_MAO_DE_OBRA, "editar"),
    podeNoModulo(MODULO_MAO_DE_OBRA, "excluir"),
    getRevendaAtiva(),
    getPerfil(),
    // Cada mês com a SUA configuração congelada (migration 152).
    lerConfigsDosMeses(revendaId, [tres, competenciaAnterior(competencia), competencia, ...horizonte]),
    lerSalarios(revendaId),
    lerMesesDoPeriodo(revendaId, tres, horizonte[2]),
    lerRealizadoDoPeriodo(revendaId, "2000-01", horizonte[2]),
    lerAcoesDoPeriodo(revendaId, tres, horizonte[2]),
    lerProjecoes(revendaId, tres, horizonte[2]),
    lerDias(revendaId, competencia),
    lerDestinatarios(revendaId),
    lerEnvios(revendaId),
    lerHistorico(revendaId),
  ]);

  const configDe = (c: string) => configs.get(c)?.config ?? configs.get(competencia)!.config;
  const doMes = configs.get(competencia)!;
  const config = doMes.config;
  const mes = meses.get(competencia) ?? null;
  const mesAtual: MesMaoDeObra = mes ?? { ...MES_VAZIO, competencia };
  const armazemDoMes = contaArmazem(mesAtual, config);
  const qlpAtual = qlpVigente(qlpPorMes, competencia);
  const temQlp = Object.keys(qlpAtual).length > 0;
  const totalQlp = Object.values(qlpAtual).reduce((s, v) => s + (v ?? 0), 0);

  // ---- PLANEJAR: os 3 meses, cada um com o seu quadro ----
  const planejamento = horizonte.map((c) => {
    const m = meses.get(c) ?? null;
    if (!m) return { competencia: c, mes: null, vagas: null as VagaDaFuncao[] | null, custo: 0 };
    const { linhas } = dimensionamentoDoMes(m, configDe(c), salarios, qlpVigente(qlpPorMes, c));
    return { competencia: c, mes: m, vagas: vagasDoMes(linhas), custo: linhas.reduce((s, l) => s + l.custoDimensionado, 0) };
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
  const proximo = planejamento[0];
  const somaVagas = (v: VagaDaFuncao[] | null, campo: "dimensionado" | "vagas" | "excedente") =>
    v ? v.reduce((s, x) => s + x[campo], 0) : null;

  // ---- DIA ----
  const diasDoMes = volumePorDia(mesAtual, dias, config);
  const conferencia = conferenciaDoPlano(mesAtual, diasDoMes);
  const projecao = projecaoDoMes(diasDoMes);
  const doPlano = contaDistribuicao(mesAtual);
  const noRitmo = dimensionamentoNoRitmo(mesAtual, projecao.projetado);
  const diasForaDoAns = diasDoMes.filter((d) => excedeAns(d.dispersao));
  const diasSemJustificativa = diasForaDoAns.filter((d) => !d.justificativaMotivo).length;

  // ---- RESULTADO ----
  const dispersoes = dispersoesDoMes(mesAtual, diasDoMes);
  const linhaDoTempo = linhaDoTempoDaProjecao(projecoes, competencia);
  // "Hoje" do V.3 é o que ESTE mês pede agora -- não a primeira coluna do
  // planejamento, que já é o mês seguinte.
  const hoje = mes ? vagasDoMes(dimensionamentoDoMes(mes, config, salarios, qlpAtual).linhas) : null;
  const eficacia = [3, 2, 1].map((voltas) => {
    let c = competencia;
    for (let i = 0; i < voltas; i++) c = competenciaAnterior(c);
    return eficaciaDoMes({ competencia: c, mes: meses.get(c) ?? null, fotografias: projecoes, qlpReal: qlpVigente(qlpPorMes, c), acoes });
  });
  const acoesAbertas = acoes.filter((a) => a.status !== "concluida");
  const acoesDoMes = acoes.filter((a) => a.competencia === competencia);
  const acoesParaMostrar = [...new Map([...acoesDoMes, ...acoesAbertas].map((a) => [a.id, a])).values()];

  const href = (m: string, a: Aba = aba, extra = "") => `/gestao/mao-de-obra?mes=${m}&aba=${a}${extra}`;
  const emailsAtivos = destinatarios.filter((d) => d.ativo).map((d) => d.email);
  const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <div>
      <PageHeader title="👷 Simulador de Mão de Obra" subtitle="Planeje o quadro, acompanhe o volume do dia e corrija os desvios" fecharHref="/gestao" />

      {sp.erro && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{decodificar(sp.erro)}</p>}
      {sp.sucesso && <p className="mb-3 rounded-xl bg-green-50 p-3 text-sm text-green-700">{decodificar(sp.sucesso)}</p>}

      {/* ---- O MÊS E A SITUAÇÃO ---- */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1">
          <Link href={href(competenciaAnterior(competencia))} aria-label="Mês anterior" className="rounded-lg px-2.5 py-1.5 text-slate-500 hover:bg-slate-100">
            ‹
          </Link>
          <span className="min-w-36 text-center text-base font-bold text-slate-900">{rotuloCompetencia(competencia)}</span>
          <Link href={href(competenciaSeguinte(competencia))} aria-label="Próximo mês" className="rounded-lg px-2.5 py-1.5 text-slate-500 hover:bg-slate-100">
            ›
          </Link>
          {competencia !== competenciaAtual() && (
            <Link href={href(competenciaAtual())} className="ml-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary-dark hover:bg-primary-soft">
              Hoje
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Selo tom={mes ? "bom" : "atencao"}>{mes ? "✓ Mês revisado" : "Mês não lançado"}</Selo>
          <Selo tom={ultimoEnvio ? "bom" : "atencao"}>
            {ultimoEnvio ? `✓ Formalizado em ${dataBR(ultimoEnvio.enviadoEm)}` : "Não formalizado"}
          </Selo>
          {mes && (
            <Selo tom={diasSemJustificativa > 0 ? "erro" : diasForaDoAns.length > 0 ? "neutro" : "bom"}>
              {diasForaDoAns.length === 0
                ? "✓ Dias dentro do ANS"
                : `${diasForaDoAns.length} dia(s) fora do ANS${diasSemJustificativa > 0 ? ` · ${diasSemJustificativa} sem justificativa` : ""}`}
            </Selo>
          )}
        </div>
      </div>

      {/* ---- AS ETAPAS ---- */}
      <nav className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Etapas do simulador">
        {ABAS.map((a) => {
          const ativa = a.id === aba;
          return (
            <Link
              key={a.id}
              href={href(competencia, a.id)}
              aria-current={ativa ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
                ativa ? "border-primary bg-primary-soft" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  ativa ? "bg-primary text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {a.numero}
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-sm font-semibold ${ativa ? "text-primary-dark" : "text-slate-700"}`}>{a.rotulo}</span>
                <span className="block text-[11px] text-slate-400">{a.quando}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      {/* =========================== 1. CONFIGURAR =========================== */}
      {aba === "configurar" && (
        <div className="space-y-4">
          {!podeEditar ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Só quem pode editar o simulador altera a configuração.</p>
          ) : (
            <>
              <Bloco
                titulo={`Inputs do armazém (PPR) — ${rotuloCompetencia(competencia)}`}
                orientacao="Os inputs do PPR Plan do Armazém: o volume vira viagens, as viagens viram minutos de cada atividade por turno, e os minutos viram gente. Cada mês guarda a sua configuração: salvar aqui muda só este mês."
              >
                <form action={salvarParametros} className="space-y-5">
                  <input type="hidden" name="competencia" value={competencia} />
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {doMes.origem === competencia
                      ? `🔒 Configuração própria de ${rotuloCompetencia(competencia)}${doMes.atualizadoPorNome ? ` · ${doMes.atualizadoPorNome}` : ""}${doMes.atualizadoEm ? `, ${dataBR(doMes.atualizadoEm)}` : ""}.`
                      : doMes.origem
                        ? `Este mês ainda usa a configuração de ${rotuloCompetencia(doMes.origem)}. Ao salvar, ${rotuloCompetencia(competencia)} passa a ter a sua.`
                        : `Este mês ainda usa o padrão da revenda. Ao salvar, ${rotuloCompetencia(competencia)} passa a ter a sua.`}
                  </p>
                  {/* OS INPUTS DO PPR PLAN DO ARMAZÉM (migration 154): percentual
                      em %, tempo em minutos, jornada em horas decimais. */}
                  {GRUPOS_DO_ARMAZEM.map((g) => (
                    <div key={g}>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{g}</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {PARAMETROS_ARMAZEM.filter((p) => p.grupo === g).map((p) => (
                          <Campo key={p.id} rotulo={p.rotulo}>
                            <span className="flex items-center gap-1.5">
                              <input
                                name={`arm_${p.id}`}
                                defaultValue={mostrarNumero(p.unidade === "%" ? config.armazem[p.id] * 100 : config.armazem[p.id], 4)}
                                inputMode="decimal"
                                className={entrada}
                              />
                              <span className="w-9 shrink-0 text-xs text-slate-400">{p.unidade}</span>
                            </span>
                          </Campo>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">Curva de venda por dia da semana</p>
                      <span
                        className={`text-xs font-semibold ${
                          somaDoSellout(config) === 0 || Math.abs(somaDoSellout(config) - 100) < 0.01 ? "text-emerald-700" : "text-red-700"
                        }`}
                      >
                        Soma {formatarNumero(somaDoSellout(config), 1)}%{somaDoSellout(config) === 0 && " (desligada)"}
                      </span>
                    </div>
                    <p className="mb-3 text-xs text-slate-500">Quanto da semana sai em cada dia. Distribui a meta da grade do dia.</p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                      {DIAS_DO_SELLOUT.map((d) => (
                        <Campo key={d.id} rotulo={d.rotulo.slice(0, 3)}>
                          <span className="flex items-center gap-1">
                            <input name={d.id} defaultValue={mostrarNumero(config[d.id], 3)} inputMode="decimal" className={entrada} />
                            <span className="text-xs text-slate-400">%</span>
                          </span>
                        </Campo>
                      ))}
                    </div>
                  </div>

                  {/* APLICAR TAMBÉM EM (29/09/2026): o Planejar deste mês mostra
                      os 3 seguintes, e cada um tem a sua configuração -- sem
                      marcar aqui, o ajuste não chega neles. */}
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                    <p className="text-sm font-semibold text-amber-900">
                      Esta configuração vale só para {rotuloCompetencia(competencia)}.
                    </p>
                    <p className="mt-0.5 text-xs text-amber-900/80">
                      O quadro do Planejar ({mesesPorExtenso(mesesDoPlanejamento(competencia))}) usa a configuração de cada um desses meses. Para levar este
                      ajuste junto, marque:
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mesesDoPlanejamento(competencia).map((c) => (
                        <label key={c} className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-sm text-slate-700">
                          <input type="checkbox" name="aplicar_em" value={c} className="h-4 w-4" />
                          Aplicar também em {rotuloCurto(c)}
                          <span className="text-[11px] text-slate-400">
                            {configs.get(c)?.origem === c ? "(tem config. própria)" : "(herda)"}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <BotaoEnviar textoEnviando="Salvando..." className={botaoPrincipal}>
                    Salvar os parâmetros
                  </BotaoEnviar>
                </form>
              </Bloco>

              <Bloco
                titulo={`Como o armazém vira gente — ${rotuloCompetencia(competencia)}`}
                orientacao="A memória de cálculo do PPR: cada atividade em minutos por dia (operador e conferente) ou em pessoas (ajudante e amarração), turno a turno."
              >
                {!mes ? (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Lance o volume do mês para ver a conta.</p>
                ) : (
                  <MemoriaDoArmazem arm={armazemDoMes} jornada={config.armazem.jornada_horas} jornadaConferenteNoite={config.armazem.jornada_conferente_noite} />
                )}
              </Bloco>

              <Bloco titulo="Quem recebe o planejamento" orientacao="O time de Gente, que programa a contratação.">
                {destinatarios.length === 0 ? (
                  <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Nenhum e-mail cadastrado: sem ele não dá para formalizar.</p>
                ) : (
                  <ul className="mb-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {destinatarios.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-800">{d.nome ?? d.email}</span>
                          {d.nome && <span className="block text-xs text-slate-500">{d.email}</span>}
                        </span>
                        <BotaoExcluir action={removerDestinatario} campos={{ id: d.id, competencia }} confirmacao={`Remover ${d.email}?`}>
                          Remover
                        </BotaoExcluir>
                      </li>
                    ))}
                  </ul>
                )}
                <form action={adicionarDestinatario} className="flex flex-wrap gap-2">
                  <input type="hidden" name="competencia" value={competencia} />
                  <input name="nome" placeholder="Nome (opcional)" maxLength={120} className={`${entradaTexto} min-w-0 flex-1`} />
                  <input name="email" required type="email" placeholder="email@limalogistica.com.br" className={`${entradaTexto} min-w-0 flex-1`} />
                  <BotaoEnviar textoEnviando="Salvando..." className={botaoSecundario}>
                    Incluir
                  </BotaoEnviar>
                </form>
              </Bloco>

              <Bloco titulo="Custo mensal de uma pessoa" orientacao="Por função. Multiplica o quadro dimensionado para dar o custo do mês.">
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {FUNCOES.map((f) => (
                    <li key={f.id}>
                      <details>
                        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm hover:bg-slate-50">
                          <span className="font-medium text-slate-700">{f.rotulo}</span>
                          <span className="font-mono text-sm tabular-nums text-slate-600">{formatarReais(custoDaPessoa(salarios[f.id]))} ›</span>
                        </summary>
                        <form action={salvarSalario} className="space-y-3 border-t border-slate-100 bg-slate-50 p-3">
                          <input type="hidden" name="competencia" value={competencia} />
                          <input type="hidden" name="funcao" value={f.id} />
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {RUBRICAS.map((r) => (
                              <Campo key={r.id} rotulo={`${r.rotulo} (R$)`}>
                                <input name={r.id} defaultValue={mostrarNumero(salarios[f.id][r.id] ?? 0, 2)} inputMode="decimal" className={entrada} />
                              </Campo>
                            ))}
                          </div>
                          <BotaoEnviar textoEnviando="Salvando..." className={botaoSecundario}>
                            Salvar {f.rotulo.toLowerCase()}
                          </BotaoEnviar>
                        </form>
                      </details>
                    </li>
                  ))}
                </ul>
              </Bloco>
            </>
          )}

          <Bloco
            titulo="Histórico de alterações"
            orientacao="Cada mudança de parâmetro, de volume e estrutura do mês, de QLP ou de custo: o valor antigo, o novo, quem e quando."
            semPadding
          >
            {historico.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-slate-500">
                Nenhuma alteração registrada ainda. O registro começa no próximo Salvar de qualquer tela do simulador.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="px-4 py-2.5 font-medium">Quando</th>
                      <th className="px-2 py-2.5 font-medium">Onde</th>
                      <th className="px-2 py-2.5 font-medium">O que mudou</th>
                      <th className="px-4 py-2.5 font-medium">De → para</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historico.map((h) => (
                      <tr key={h.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                          {new Date(h.alteradoEm).toLocaleString("pt-BR", {
                            timeZone: "America/Sao_Paulo",
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          <span className="block text-slate-400">{h.alteradoPorNome ?? "—"}</span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-600">
                          {ROTULO_ONDE[h.onde]}
                          {h.competencia && <span className="block text-slate-400">{rotuloCurto(h.competencia)}</span>}
                        </td>
                        <td className="px-2 py-2 text-slate-800">{h.rotulo}</td>
                        <td className="px-4 py-2 font-mono text-xs tabular-nums">
                          <span className="text-slate-400 line-through decoration-slate-300">{h.valorAnterior ?? "vazio"}</span>
                          <span className="mx-1.5 text-slate-400">→</span>
                          <span className="font-semibold text-slate-900">{h.valorNovo ?? "vazio"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Bloco>

          <ProximoPasso texto="Com a configuração em dia, planeje os próximos 3 meses." href={href(competencia, "planejar")} acao="Ir para Planejar" />
        </div>
      )}

      {/* =========================== 2. PLANEJAR =========================== */}
      {aba === "planejar" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Indicador titulo="QLP atual" valor={temQlp ? String(totalQlp) : "—"} detalhe="quem temos hoje" />
            <Indicador
              titulo={`QLP dimensionado ${rotuloCurto(horizonte[0])}`}
              valor={proximo.vagas ? String(somaVagas(proximo.vagas, "dimensionado")) : "—"}
              detalhe={proximo.mes ? `${formatarNumero(proximo.mes.volume_negociado, 0)} HL negociados` : "volume não lançado"}
              tom="destaque"
            />
            <Indicador
              titulo="Contratar"
              valor={proximo.vagas && temQlp ? comSinal(somaVagas(proximo.vagas, "vagas") ?? 0, "+") : "—"}
              detalhe={rotuloCurto(horizonte[0])}
              tom={(somaVagas(proximo.vagas, "vagas") ?? 0) > 0 ? "bom" : "neutro"}
            />
            <Indicador
              titulo="Reduzir"
              valor={proximo.vagas && temQlp ? comSinal(somaVagas(proximo.vagas, "excedente") ?? 0, "−") : "—"}
              detalhe={rotuloCurto(horizonte[0])}
              tom={(somaVagas(proximo.vagas, "excedente") ?? 0) > 0 ? "erro" : "neutro"}
            />
          </div>

          <Bloco
            titulo={`Quadro necessário — ${rotuloCurto(horizonte[0])} a ${rotuloCurto(horizonte[2])}`}
            orientacao="O volume de cada mês vira gente por função. Ao lado do número, quanto contratar (▲) ou reduzir (▼) contra o QLP atual."
            acao={
              <ExportarCsv
                nome={`planejamento-${competencia}`}
                cabecalho={["Função", "QLP atual", ...horizonte.map(rotuloCurto)]}
                linhas={FUNCOES.map((f) => [
                  f.rotulo,
                  qlpAtual[f.id] ?? "",
                  ...planejamento.map((p) => p.vagas?.find((v) => v.funcao === f.id)?.dimensionado ?? ""),
                ])}
              />
            }
            semPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Função</th>
                    <th className="w-20 px-2 py-2.5 text-right font-medium">QLP atual</th>
                    {planejamento.map((p) => (
                      <th key={p.competencia} className="w-24 px-3 py-2.5 text-right">
                        <Link href={href(competencia, "planejar", `&editar=${p.competencia}#lancar`)} className="font-semibold text-primary-dark hover:underline">
                          {rotuloCurto(p.competencia)} ✏️
                        </Link>
                        <span className="block text-[11px] font-normal text-slate-400">
                          {p.mes ? `${formatarNumero(p.mes.volume_negociado, 0)} HL` : "sem volume"}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                {AREAS.map((area) => (
                  <tbody key={area}>
                    <tr>
                      <td colSpan={5} className="bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {area}
                      </td>
                    </tr>
                    {FUNCOES.filter((f) => f.area === area).map((f) => (
                      <tr key={f.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2 text-slate-800">{f.rotulo}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-slate-500">{qlpAtual[f.id] ?? "—"}</td>
                        {planejamento.map((p) => {
                          const v = p.vagas?.find((x) => x.funcao === f.id);
                          return (
                            <td key={p.competencia} className="px-3 py-2 text-right font-mono tabular-nums">
                              {v ? (
                                <>
                                  <span className="font-semibold text-slate-900">{v.dimensionado}</span>
                                  {v.atual != null && v.vagas > 0 && <span className="ml-1.5 text-xs font-semibold text-emerald-600">▲{v.vagas}</span>}
                                  {v.atual != null && v.excedente > 0 && <span className="ml-1.5 text-xs font-semibold text-red-600">▼{v.excedente}</span>}
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
                ))}
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-primary-soft/40">
                    <td className="px-4 py-2.5 font-semibold text-slate-900">QLP dimensionado</td>
                    <td className="px-2 py-2.5 text-right font-mono font-semibold tabular-nums">{temQlp ? totalQlp : "—"}</td>
                    {planejamento.map((p) => (
                      <td key={p.competencia} className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900">
                        {p.vagas ? somaVagas(p.vagas, "dimensionado") : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr className="text-xs">
                    <td className="px-4 py-1.5 text-slate-500">Contratar / reduzir</td>
                    <td />
                    {planejamento.map((p) => {
                      const contratar = somaVagas(p.vagas, "vagas") ?? 0;
                      const reduzir = somaVagas(p.vagas, "excedente") ?? 0;
                      return (
                        <td key={p.competencia} className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                          {!p.vagas || !temQlp ? (
                            <span className="text-slate-300">—</span>
                          ) : contratar === 0 && reduzir === 0 ? (
                            <span className="text-emerald-600">atende</span>
                          ) : (
                            <>
                              {contratar > 0 && <span className="text-emerald-600">▲{contratar}</span>}
                              {reduzir > 0 && <span className="ml-1.5 text-red-600">▼{reduzir}</span>}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  <tr className="text-xs">
                    <td className="px-4 py-1.5 text-slate-500">Custo do mês</td>
                    <td />
                    {planejamento.map((p) => (
                      <td key={p.competencia} className="px-3 py-1.5 text-right font-mono tabular-nums text-slate-500">
                        {p.vagas ? formatarReais(p.custo) : "—"}
                      </td>
                    ))}
                  </tr>
                  <tr className="text-xs">
                    <td className="px-4 pb-3 pt-1.5 text-slate-500">Justificativa</td>
                    <td />
                    {planejamento.map((p) => (
                      <td key={p.competencia} className="px-3 pb-3 pt-1.5 text-right" title={p.mes?.qlp_justificativa ?? undefined}>
                        {p.mes?.qlp_justificativa_motivo ? (
                          <span className="text-slate-600">{p.mes.qlp_justificativa_motivo}</span>
                        ) : p.mes ? (
                          <span className="font-semibold text-amber-600">falta</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            {planejamento.some((p) => !p.mes) && (
              <p className="border-t border-slate-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
                Falta lançar o volume de {planejamento.filter((p) => !p.mes).map((p) => rotuloCompetencia(p.competencia)).join(" e ")} — clique no mês
                no topo da tabela.
              </p>
            )}
          </Bloco>

          {podeEditar && (
            <details id="lancar" open={Boolean(sp.editar) || !meses.get(editar)} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
                <span>
                  <span className="block text-sm font-bold text-slate-900">Volume e estrutura de {rotuloCompetencia(editar)}</span>
                  <span className="block text-xs text-slate-500">PPR, negociado, frota, armazém e a justificativa do QLP. Salvar registra a revisão.</span>
                </span>
                <span className="text-slate-400">›</span>
              </summary>
              <div className="border-t border-slate-100 p-4">
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {editaveis.map((c) => (
                    <Link
                      key={c}
                      href={href(competencia, "planejar", `&editar=${c}#lancar`)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        c === editar ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {rotuloCurto(c)}
                      {!meses.get(c) && " ·"}
                    </Link>
                  ))}
                </div>
                <FormMes key={editar} competencia={editar} base={competencia} mes={meses.get(editar) ?? null} config={configDe(editar)} />
              </div>
            </details>
          )}

          {podeEditar && (
            <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
                <span>
                  <span className="block text-sm font-bold text-slate-900">QLP atual — quem temos hoje</span>
                  <span className="block text-xs text-slate-500">Vale para os meses seguintes até ser atualizado.</span>
                </span>
                <span className="text-slate-400">›</span>
              </summary>
              <form action={salvarRealizado} className="space-y-4 border-t border-slate-100 p-4">
                <input type="hidden" name="competencia" value={competencia} />
                {AREAS.map((area) => (
                  <div key={area}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{area}</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {FUNCOES.filter((f) => f.area === area).map((f) => (
                        <Campo key={f.id} rotulo={f.rotulo}>
                          <input name={`real_${f.id}`} defaultValue={qlpAtual[f.id] ?? ""} inputMode="numeric" className={entrada} />
                        </Campo>
                      ))}
                    </div>
                  </div>
                ))}
                <BotaoEnviar textoEnviando="Salvando..." className={botaoPrincipal}>
                  Salvar o QLP de {rotuloCompetencia(competencia)}
                </BotaoEnviar>
              </form>
            </details>
          )}

          <Bloco
            titulo={`Formalizar ${mesesPorExtenso(mesesDoPlanejamento(competencia))} para o time de Gente`}
            orientacao={`Uma vez por mês: envia o quadro de ${mesesPorExtenso(mesesDoPlanejamento(competencia), rotuloCompetencia)}, função a função, para programar a contratação e guarda a fotografia desses meses para o comparativo.`}
          >
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
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">Formalizações anteriores ({envios.length})</summary>
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 text-xs">
                  {envios.map((e) => (
                    <li key={e.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                      <span>
                        <b className="text-slate-800">{rotuloCompetencia(e.competencia)}</b> · {e.totalVagas} vaga{e.totalVagas === 1 ? "" : "s"}
                      </span>
                      <span className="text-slate-500">
                        {dataBR(e.enviadoEm)} · {e.enviadoPorNome ?? "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Bloco>

          <ProximoPasso texto="Com o plano formalizado, lance o volume de cada dia." href={href(competencia, "dia")} acao="Ir para Acompanhar o dia" />
        </div>
      )}

      {/* =========================== 3. DIA =========================== */}
      {aba === "dia" && (
        <div className="space-y-4">
          {!mes ? (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              Lance o volume de {rotuloCompetencia(competencia)} em{" "}
              <Link href={href(competencia, "planejar", `&editar=${competencia}#lancar`)} className="font-semibold underline">
                Planejar
              </Link>{" "}
              para a meta do dia existir.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Indicador
                  titulo="Volume negociado"
                  valor={`${formatarNumero(mes.volume_negociado, 0)}`}
                  detalhe={mes.base_meta === "negociado" ? "HL · base da meta do dia" : "HL · demanda"}
                  tom={mes.base_meta === "negociado" ? "destaque" : "neutro"}
                />
                <Indicador
                  titulo="Volume PPR"
                  valor={`${formatarNumero(mes.volume_ppr, 0)}`}
                  detalhe={mes.base_meta === "ppr" ? "HL · base da meta do dia" : "HL · plano"}
                  tom={mes.base_meta === "ppr" ? "destaque" : "neutro"}
                />
                <Indicador
                  titulo="Previsão do mês"
                  valor={formatarNumero(projecao.projetado, 0)}
                  detalhe={`HL na tendência de hoje · ${rotuloDaDispersao(projecao.dispersaoProjetada)}`}
                  tom={tomDaDispersao(projecao.dispersaoProjetada)}
                />
                <Indicador
                  titulo="Fora do ANS (±20%)"
                  valor={String(diasForaDoAns.length)}
                  detalhe={diasSemJustificativa > 0 ? `${diasSemJustificativa} sem justificativa` : "dias"}
                  tom={diasSemJustificativa > 0 ? "erro" : "neutro"}
                />
              </div>

              <Bloco
                titulo={`Volume do dia — ${rotuloCompetencia(competencia)}`}
                orientacao={`Lance o realizado de cada dia. Fora de ±${Math.round(LIMITE_ANS_VENDAS * 100)}% do necessário (ANS com Vendas), justifique na própria linha. Feriado: desmarque "Opera".`}
              >
                <FormDias
                  competencia={competencia}
                  dias={diasDoMes}
                  podeEditar={podeEditar}
                  planoSabado={diasDoMes.find((d) => d.opera && d.tipo === "sabado")?.plan ?? 0}
                  conferencia={conferencia}
                  diasInformados={mesAtual.dias_totais ?? 0}
                  curva={curvaLigada(config) ? DIAS_DO_SELLOUT.map((d) => ({ rotulo: d.rotulo, valor: config[d.id] })) : null}
                />
              </Bloco>

              {projecao.realizadoAteAgora > 0 && (
                <Bloco
                  titulo="Flexão — a frota na tendência de hoje"
                  orientacao={`Se o mês fechar em ${formatarNumero(projecao.projetado, 0)} HL, a entrega pede. Diferença é hora de ajustar SPOT, hora extra ou férias.`}
                >
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Flexao rotulo="Frota" plano={doPlano.frotaDimensionada} ritmo={noRitmo.frotaDimensionada} />
                    <Flexao rotulo="Motoristas" plano={doPlano.motoristas} ritmo={noRitmo.motoristas} />
                    <Flexao rotulo="Ajudantes" plano={doPlano.ajudantes} ritmo={noRitmo.ajudantes} />
                  </div>
                </Bloco>
              )}
            </>
          )}
          <ProximoPasso texto="No fim do mês, confira a dispersão e trate os desvios." href={href(competencia, "resultado")} acao="Ir para Resultado" />
        </div>
      )}

      {/* =========================== 4. RESULTADO =========================== */}
      {aba === "resultado" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Indicador
              titulo="Dimensionado × realizado"
              valor={rotuloDaDispersao(dispersoes.contraPpr)}
              detalhe="realizado ÷ PPR"
              tom={tomDaDispersao(dispersoes.contraPpr)}
            />
            <Indicador
              titulo="Realizado × demanda"
              valor={rotuloDaDispersao(dispersoes.contraNegociado)}
              detalhe="realizado ÷ negociado"
              tom={tomDaDispersao(dispersoes.contraNegociado)}
            />
            <Indicador
              titulo="Dias fora do ANS"
              valor={String(diasForaDoAns.length)}
              detalhe={diasSemJustificativa > 0 ? `${diasSemJustificativa} sem justificativa` : "±20% do necessário"}
              tom={diasSemJustificativa > 0 ? "erro" : "neutro"}
            />
            <Indicador titulo="Ações em aberto" valor={String(acoesAbertas.length)} detalhe="plano de ação" tom={acoesAbertas.length > 0 ? "atencao" : "neutro"} />
          </div>
          <p className="-mt-2 px-1 text-xs text-slate-500">
            {dispersoes.fechado
              ? `Mês fechado: ${formatarNumero(dispersoes.realizado, 0)} HL realizados.`
              : dispersoes.diasLancados > 0
                ? `Parcial de ${dispersoes.diasLancados} dia(s): ${formatarNumero(dispersoes.realizado, 0)} HL contra o que já devia ter saído.`
                : "Lance o volume do dia para a dispersão aparecer."}{" "}
            ▲ verde acima · ▼ vermelho abaixo · fora de ±{formatarNumero(DISPERSAO_ACEITA * 100, 0)}% pede plano de ação.
          </p>

          {diasForaDoAns.length > 0 && (
            <Bloco titulo="Dias fora do ANS com Vendas" orientacao={`Realizado fora de ±${Math.round(LIMITE_ANS_VENDAS * 100)}% do necessário do dia, e a justificativa de cada um.`} semPadding>
              <ul className="divide-y divide-slate-100">
                {diasForaDoAns.map((d) => (
                  <li key={d.dia} className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm sm:grid-cols-[4.5rem_14rem_1fr]">
                    <span className="font-mono font-semibold text-slate-800">
                      {d.rotulo} <span className="text-[11px] font-normal uppercase text-slate-400">{d.diaDaSemana}</span>
                    </span>
                    <span className="text-xs text-slate-600">
                      {formatarNumero(d.realizado, 0)} de {formatarNumero(d.plan, 0)} HL{" "}
                      <b className={classeDaDispersao(d.dispersao)}>{rotuloDaDispersao(d.dispersao)}</b>
                    </span>
                    <span className={`col-span-2 text-xs sm:col-span-1 ${d.justificativaMotivo ? "text-slate-600" : "font-semibold text-red-700"}`}>
                      {d.justificativaMotivo ? `${d.justificativaMotivo}${d.justificativa ? ` — ${d.justificativa}` : ""}` : "Falta justificar"}
                    </span>
                  </li>
                ))}
              </ul>
            </Bloco>
          )}

          <Bloco titulo="Projetado há 2–3 meses × hoje" orientacao={`O que foi formalizado para ${rotuloCompetencia(competencia)} em cada mês anterior, contra o que ele pede hoje.`} semPadding>
            {linhaDoTempo.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-slate-500">
                Nenhuma projeção congelada para este mês. Ela nasce ao formalizar em Planejar: formalize todo início de mês e, em 2 meses, este
                quadro compara sozinho.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="px-4 py-2.5 font-medium">Função</th>
                      {linhaDoTempo.map((p) => (
                        <th key={p.id} className="w-24 px-2 py-2.5 text-right font-medium">
                          em {rotuloCurto(p.competenciaBase)}
                          <span className="block text-[11px] font-normal text-slate-400">
                            {mesesDeAntecedencia(p) === 0 ? "no mês" : `${mesesDeAntecedencia(p)} mês(es) antes`}
                          </span>
                        </th>
                      ))}
                      <th className="w-16 px-2 py-2.5 text-right font-semibold text-slate-700">Hoje</th>
                      <th className="w-14 px-3 py-2.5 text-right font-medium">Var.</th>
                    </tr>
                  </thead>
                  {AREAS.map((area) => (
                    <tbody key={area}>
                      <tr>
                        <td colSpan={linhaDoTempo.length + 3} className="bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {area}
                        </td>
                      </tr>
                      {FUNCOES.filter((f) => f.area === area).map((f) => {
                        const atual = hoje?.find((v) => v.funcao === f.id)?.dimensionado ?? null;
                        const primeiro = linhaDoTempo[0].dimensionado[f.id] ?? null;
                        const variacao = atual != null && primeiro != null ? atual - primeiro : null;
                        return (
                          <tr key={f.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-4 py-2 text-slate-800">{f.rotulo}</td>
                            {linhaDoTempo.map((p) => (
                              <td key={p.id} className="px-2 py-2 text-right font-mono tabular-nums text-slate-500">
                                {p.dimensionado[f.id] ?? "—"}
                              </td>
                            ))}
                            <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums text-slate-900">{atual ?? "—"}</td>
                            <td
                              className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${
                                !variacao ? "text-slate-300" : variacao > 0 ? "text-emerald-600" : "text-red-600"
                              }`}
                            >
                              {variacao == null ? "—" : variacao > 0 ? `▲ +${variacao}` : variacao < 0 ? `▼ ${variacao}` : "0"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  ))}
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-primary-soft/40 font-semibold">
                      <td className="px-4 py-2.5 text-slate-900">QLP dimensionado</td>
                      {linhaDoTempo.map((p) => (
                        <td key={p.id} className="px-2 py-2.5 text-right font-mono tabular-nums">
                          {p.total}
                        </td>
                      ))}
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums">{hoje ? hoje.reduce((s, v) => s + v.dimensionado, 0) : "—"}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Bloco>

          <Bloco
            titulo="Eficácia dos últimos 3 meses"
            orientacao="O volume projetado contra o realizado, e se o desvio tem plano de ação."
            semPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Mês</th>
                    <th className="px-2 py-2.5 text-right font-medium">Projetado</th>
                    <th className="px-2 py-2.5 text-right font-medium">Realizado</th>
                    <th className="px-2 py-2.5 text-right font-medium">Dispersão</th>
                    <th className="px-4 py-2.5 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {eficacia.map((e) => (
                    <tr key={e.competencia}>
                      <td className="px-4 py-2.5">
                        <Link href={href(e.competencia, "resultado")} className="font-semibold text-primary-dark hover:underline">
                          {rotuloCurto(e.competencia)}
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums">{formatarNumero(e.volumeProjetado, 0)}</td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums">{formatarNumero(e.realizado, 0)}</td>
                      <td className={`px-2 py-2.5 text-right font-mono font-semibold tabular-nums ${classeDaDispersao(e.dispersao)}`}>
                        {rotuloDaDispersao(e.dispersao)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-700">
                        {ROTULO_SITUACAO[e.situacao]}
                        {e.acoes > 0 && (
                          <span className="block text-[11px] text-slate-400">
                            {e.acoesConcluidas} de {e.acoes} ação(ões) concluída(s)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Bloco>

          <Bloco titulo="Plano de ação dos desvios" orientacao="Todo desvio fora da faixa vira ação, com responsável e prazo." acao={<span className="text-xs text-slate-500">{acoesAbertas.length} em aberto</span>}>
            {temDesvio(dispersoes) && acoesDoMes.length === 0 && (
              <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                {rotuloCompetencia(competencia)} está fora da faixa de ±{formatarNumero(DISPERSAO_ACEITA * 100, 0)}% e ainda não tem ação.
              </p>
            )}
            {acoesParaMostrar.length > 0 && (
              <ul className="mb-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {acoesParaMostrar.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-800">{a.oQue}</span>
                      <span className="block text-xs text-slate-500">
                        {rotuloCurto(a.competencia)} · {a.responsavel}
                        {a.prazo && ` · até ${a.prazo.split("-").reverse().join("/")}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {podeEditar ? (
                        <form action={mudarStatusDaAcao} className="flex items-center gap-1">
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="competencia" value={competencia} />
                          <select name="status" defaultValue={a.status} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
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
                        <Selo tom="neutro">{ROTULO_STATUS_ACAO[a.status]}</Selo>
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
              <form action={criarAcao} className="space-y-2 rounded-xl bg-slate-50 p-3">
                <input type="hidden" name="competencia" value={competencia} />
                <input name="o_que" required maxLength={300} placeholder="O que será feito (ex.: rever a média por carro)" className={`${entradaTexto} w-full`} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <input name="responsavel" required maxLength={120} placeholder="Responsável" className={entradaTexto} />
                  <input type="date" name="prazo" className={entradaTexto} />
                  <select name="funcao" defaultValue="" className={entradaTexto}>
                    <option value="">Função (opcional)</option>
                    {FUNCOES.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                <BotaoEnviar textoEnviando="Salvando..." className={botaoSecundario}>
                  Incluir no plano de {rotuloCurto(competencia)}
                </BotaoEnviar>
              </form>
            )}
          </Bloco>

          <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3">
              <span>
                <span className="block text-sm font-bold text-slate-900">DPO 1.2 — onde está cada evidência</span>
                <span className="block text-xs text-slate-500">Para mostrar ao auditor.</span>
              </span>
              <span className="text-slate-400">›</span>
            </summary>
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {REQUISITO_DPO.map((r) => (
                <li key={r.id} className="grid grid-cols-[2.5rem_1fr] gap-2 px-4 py-3">
                  <span className="text-sm font-bold text-primary-dark">{r.id}</span>
                  <span>
                    <span className="block text-sm text-slate-700">{r.texto}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">→ {r.ondeEsta}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>

          <ProximoPasso texto="No início do próximo mês, revise e formalize o planejamento." href={href(competenciaSeguinte(competencia), "planejar")} acao="Planejar o próximo mês" />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// As peças do layout -- o mesmo desenho em todas as abas
// ------------------------------------------------------------------

const entrada =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-right font-mono text-sm tabular-nums focus:border-primary focus:outline-none";
const entradaTexto = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none";
const botaoPrincipal = "w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark";
const botaoSecundario = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-primary";

/** Um bloco: título, uma linha de orientação, e o conteúdo. */
function Bloco({
  titulo,
  orientacao,
  acao,
  semPadding = false,
  children,
}: {
  titulo: string;
  orientacao?: string;
  acao?: React.ReactNode;
  semPadding?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">{titulo}</h2>
          {orientacao && <p className="mt-0.5 text-xs text-slate-500">{orientacao}</p>}
        </div>
        {acao}
      </div>
      <div className={semPadding ? "" : "px-4 pb-4"}>{children}</div>
    </section>
  );
}

type Tom = "neutro" | "destaque" | "atencao" | "erro" | "bom";

const TOM_CAIXA: Record<Tom, string> = {
  neutro: "border-slate-200 bg-white",
  destaque: "border-primary/30 bg-primary-soft",
  atencao: "border-amber-200 bg-amber-50",
  erro: "border-red-200 bg-red-50",
  bom: "border-emerald-200 bg-emerald-50",
};
const TOM_TEXTO: Record<Tom, string> = {
  neutro: "text-slate-900",
  destaque: "text-primary-dark",
  atencao: "text-amber-700",
  erro: "text-red-700",
  bom: "text-emerald-700",
};

/** Um número de topo de aba. */
function Indicador({ titulo, valor, detalhe, tom = "neutro" }: { titulo: string; valor: string; detalhe?: string; tom?: Tom }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-3 shadow-sm ${TOM_CAIXA[tom]}`}>
      <p className="truncate text-xs font-medium text-slate-500">{titulo}</p>
      <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${TOM_TEXTO[tom]}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 truncate text-[11px] text-slate-500">{detalhe}</p>}
    </div>
  );
}

/** Uma pílula de situação. */
function Selo({ tom, children }: { tom: Tom; children: React.ReactNode }) {
  return <span className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${TOM_CAIXA[tom]} ${TOM_TEXTO[tom]}`}>{children}</span>;
}

/*
  A MEMÓRIA DO ARMAZÉM (PPR): para o auditor e para quem simula ver de onde
  sai cada pessoa -- atividade por atividade, turno a turno, e o fechamento
  (arredonda o turno, soma a reserva/ferista).
*/
function MemoriaDoArmazem({ arm, jornada, jornadaConferenteNoite }: { arm: ContaArmazem; jornada: number; jornadaConferenteNoite: number }) {
  const funcoes: { rotulo: string; f: FuncaoDoArmazem; comoFecha: string }[] = [
    { rotulo: "Operador de empilhadeira", f: arm.operador, comoFecha: `minutos ÷ 60 ÷ ${formatarNumero(jornada, 2)} h, para cima; + reserva/ferista` },
    {
      rotulo: "Conferente",
      f: arm.conferente,
      comoFecha: `minutos ÷ 60 ÷ ${formatarNumero(jornada, 2)} h (noite ${formatarNumero(jornadaConferenteNoite, 2)} h), para cima com 1 casa; total para cima`,
    },
    { rotulo: "Ajudante de armazém", f: arm.ajudante, comoFecha: "pessoas do turno, para cima; + reserva/ferista (ou ajuste de férias) + alta temporada" },
    { rotulo: "Ajudante de amarração", f: arm.amarracao, comoFecha: "pessoas do turno, para cima; + reserva/ferista" },
  ];
  const b = arm.base;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-slate-50 p-3 font-mono text-[12px] tabular-nums text-slate-700 sm:grid-cols-4">
        <span>Caixas/mês: <b>{formatarNumero(b.caixas, 0)}</b></span>
        <span>Paletes/mês: <b>{formatarNumero(b.paletes, 0)}</b></span>
        <span>Viagens rota: <b>{formatarNumero(b.viagensRota, 1)}</b></span>
        <span>1ª viagem/dia: <b>{formatarNumero(b.viagens1aDia, 2)}</b></span>
        <span>Recarga/dia: <b>{formatarNumero(b.viagens2aDia, 2)}</b></span>
        <span>Freteiros/dia: <b>{formatarNumero(b.freteirosDia, 2)}</b></span>
        <span>Puxada FF/dia: <b>{b.puxadaFFDia}</b></span>
        <span>Pallets blitz/dia: <b>{formatarNumero(b.palletsBlitzPuxadaDia, 1)}</b></span>
      </div>
      {funcoes.map(({ rotulo, f, comoFecha }) => (
        <details key={rotulo} className="rounded-xl border border-slate-200">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <span className="text-sm font-semibold text-slate-800">{rotulo}</span>
            <span className="font-mono text-xs tabular-nums text-slate-600">
              {TURNOS_DO_ARMAZEM.map((t) => `${t} ${formatarNumero(f.turnos[t].pessoas, 1)}`).join(" · ")}
              {f.reserva > 0 && ` · reserva ${f.reserva}`} → <b className="text-slate-900">{f.calculado ?? f.total}</b>
              {f.calculado != null && (
                <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-sans font-semibold text-amber-800">fixado em {f.total}</span>
              )}
            </span>
          </summary>
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Atividade</th>
                  <th className="px-3 py-1.5 text-left font-medium">Turno</th>
                  <th className="px-3 py-1.5 text-right font-medium">{f.unidade === "minutos" ? "Min/dia" : "Pessoas"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {f.atividades
                  .filter((a) => a.valor > 0)
                  .map((a, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-slate-700">{a.rotulo}</td>
                      <td className="px-3 py-1.5 text-slate-500">{a.turno}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatarNumero(a.valor, 2)}</td>
                    </tr>
                  ))}
                {TURNOS_DO_ARMAZEM.map((t) => (
                  <tr key={t} className="bg-slate-50/60 font-semibold">
                    <td className="px-3 py-1.5 text-slate-700">Total {t.toLowerCase()}</td>
                    <td className="px-3 py-1.5 text-slate-500">{formatarNumero(f.turnos[t].soma, 2)}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatarNumero(f.turnos[t].pessoas, 1)} pessoa(s)</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[11px] text-slate-500">
              Fechamento: {comoFecha}.
              {f.calculado != null && ` O PPR calcula ${f.calculado}; o quadro está FIXADO em ${f.total} por política da operação (Configurar › Quadro fixo).`}
              {f.ajusteFerias != null && ` Ajuste de férias ${f.ajusteFerias} (substitui a reserva ${f.reserva} quando menor), alta temporada ${f.altaTemporada}.`}
            </p>
          </div>
        </details>
      ))}
    </div>
  );
}

/** Rótulo + campo + ajuda, sempre no mesmo desenho. */
function Campo({ rotulo, ajuda, children }: { rotulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block truncate text-xs font-medium text-slate-600">{rotulo}</span>
      {children}
      {ajuda && <span className="mt-0.5 block text-[11px] text-slate-400">{ajuda}</span>}
    </label>
  );
}

/** O que fazer depois desta aba -- uma ação só. */
function ProximoPasso({ texto, href, acao }: { texto: string; href: string; acao: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 px-4 py-3">
      <p className="text-sm text-slate-600">{texto}</p>
      <Link href={href} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
        {acao} →
      </Link>
    </div>
  );
}

/** "+2" / "−1" -- e "0" sem sinal, para não aparecer "−0". */
function comSinal(n: number, sinal: "+" | "−") {
  return n === 0 ? "0" : `${sinal}${n}`;
}

function tomDaDispersao(d: number | null): Tom {
  const s = sentidoDaDispersao(d);
  return s === "abaixo" ? "erro" : s === "acima" ? "bom" : "neutro";
}

/** Quanto o ritmo do mês muda o dimensionado -- a "flexão" do item V.4. */
function Flexao({ rotulo, plano, ritmo }: { rotulo: string; plano: number; ritmo: number }) {
  const diferenca = ritmo - plano;
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{rotulo}</p>
      <p className="font-mono text-2xl font-bold tabular-nums text-slate-900">{ritmo}</p>
      <p className={`text-xs font-medium ${diferenca === 0 ? "text-slate-400" : diferenca > 0 ? "text-emerald-600" : "text-red-600"}`}>
        {diferenca === 0 ? "igual ao plano" : `${diferenca > 0 ? "▲ +" : "▼ "}${diferenca} contra o plano`}
      </p>
    </div>
  );
}
