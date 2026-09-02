import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ExportarCsv } from "@/components/ExportarCsv";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoArmazem } from "@/lib/produtividade-armazem-server";
import { podeNoModulo } from "@/lib/require-admin";
import {
  ROTULO_TURNO,
  TURNOS,
  agruparPorEmbalagem,
  agruparPorProduto,
  calcularPontuacao,
  construirRanking,
  diaLocalISO,
  diasAtrasISO,
  formatarHoras,
  hojeISO,
  horasAtivasDeOperacao,
  horasEntre,
  mediaExecucoes5sPorPessoa,
  mediaPct,
  mediaHlPicking,
  mediaTaxaPorPessoa,
  operacaoEmpilhadeiraDeLinha,
  pctAvariaConsolidado,
  pctRelativoAoGrupo,
  taxaPorHora,
  turnoAtual,
  type EmbalagemDespejo,
  type ProdutoMeta,
  type Turno,
} from "@/lib/produtividade-armazem";
import {
  RECEBIMENTO_CONFIG_PADRAO,
  calcularEsperaPortariaMinutos,
  calcularTempoConferenciaMinutos,
  calcularTempoDescargaMinutos,
  calcularTempoPatioMinutos,
  calcularTmaMinutos,
  formatarMinutos,
  type AtendimentoCarreta,
} from "@/lib/carretas";
import {
  cicloContaParaMaquina,
  formatarNumeroBr,
  montarCiclos,
  type SessaoUso,
  type TrocaGas,
} from "@/lib/empilhadeira-gas";
import { CATALOGO_DE_METAS, avaliarMeta, media } from "@/lib/metas";
import {
  indicadoresDoOperador,
  indicadoresDoSolicitante,
  resumirPeriodo,
  type Prioridade,
  type Ressuprimento,
} from "@/lib/ressuprimento";
import { formatarMinutos as formatarMinutosCurto } from "@/lib/abastecimento";
import { BarraRanking, BlocoAtividade, CartaoHero, TermometroDaBombona, type ItemBarra } from "./Graficos";

export const dynamic = "force-dynamic";


const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/** Mesmo texto em todo canto que mostra "Pontuação" -- ver calcularPontuacao
 *  em lib/produtividade-armazem.ts, a fórmula de verdade mora lá. */
const EXPLICACAO_PONTUACAO =
  "Pontuação = média de até 5 métricas, todas em %: Reepack = % da meta cadastrada por produto; Despejo = % da meta cadastrada por embalagem; Seleção, Picking e 5S = % da média de todo mundo no mesmo recorte (sem meta cadastrada, a régua é comparar com o grupo). Na Seleção (un/h) e no Picking (HL/h) a comparação é pela TAXA, não pelo total — quem trabalhou mais tempo não passa na frente de quem rendeu mais rápido. Quem não fez uma atividade não entra na média dela.";

export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; turno?: string }>;
}) {
  await requireAcessoArmazem("/produtividade-armazem");

  // ESTA TELA É DE GESTÃO, não da rotina de quem opera.
  //
  // Ela mostra ranking, pontuação e comparativo por colaborador. Até
  // 31/08/2026 bastava ter acesso a QUALQUER funcionalidade do armazém
  // para entrar: o empilhador que só troca gás via o ranking de
  // produtividade de todos os colegas. Nos 60 dias anteriores, 14 pessoas
  // abriram esta tela enquanto só 7 tinham acesso ao Modo Liderança.
  //
  // A régua passa a ser a permissão de LEITURA do módulo no Admin, que é
  // a mesma que abre o painel de gestão do armazém. Quem opera continua
  // vendo os próprios números em Meus Indicadores.
  if (!(await podeNoModulo("produtividade-armazem", "ver"))) {
    redirect(
      `/produtividade-armazem?erro=${encodeURIComponent(
        "Os indicadores e o ranking do armazém são da liderança. Seus próprios números ficam em Meus Indicadores.",
      )}`,
    );
  }

  const sp = await searchParams;
  const de = sp.de ?? diasAtrasISO(7);
  const ate = sp.ate ?? hojeISO();
  const turnoFiltro = (TURNOS as readonly string[]).includes(sp.turno ?? "")
    ? (sp.turno as Turno)
    : null;

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  // Fuso da operação, explícito. Sem o -03:00 o Postgres interpreta a
  // data crua em UTC, e o recorte escorregava 3 horas -- o começo do dia
  // pegava o fim da noite anterior e perdia o fim da noite do próprio dia.
  const de0 = `${de}T00:00:00-03:00`;
  const ate23 = `${ate}T23:59:59-03:00`;

  const [
    { data: produtosBanco },
    { data: embalagensBanco },
    { data: reepacksBanco },
    { data: selecoesBanco },
    { data: despejosBanco },
    { data: pickingsBanco },
    { data: operacoesBanco },
    { data: recebimentosBanco },
    { data: execucoes5sBanco },
    { data: recebimentoConfig },
    { data: trocasGasBanco },
    { data: empilhadeiraConfig },
    { data: metasBanco },
    { data: embalagensRepackBanco },
    { data: ressuprimentosBanco },
  ] = await Promise.all([
    supabase
      .from("pa_produtos")
      .select("id, descricao, meta_reepack_hora")
      .eq("revenda_id", revendaId),
    supabase
      .from("pa_embalagens_despejo")
      .select("id, nome, litros_por_unidade, meta_litros_hora")
      .eq("revenda_id", revendaId),
    // Só a etapa de REPACK entra aqui. Desde a 065 a mesma tabela guarda
    // também a Seleção e Triagem, cuja quantidade é em unidades triadas --
    // somar as duas inflaria "caixas reepackadas" e derrubaria a taxa de
    // cx/h, misturando duas atividades que existem separadas justamente
    // para não serem comparadas com a mesma régua.
    supabase
      .from("pa_reepack_lancamentos")
      // embalagem_id vem gravado no lançamento (vem do produto): é o que
      // permite acompanhar o Repack por TIPO DE EMBALAGEM, e não só por
      // produto -- lata 350 e long neck não embalam no mesmo ritmo.
      .select("produto_id, embalagem_id, colaborador_id, colaborador_nome, turno, quantidade, inicio, fim")
      .eq("revenda_id", revendaId)
      .eq("etapa", "repack")
      .not("fim", "is", null)
      .gte("inicio", de0)
      .lte("inicio", ate23),
    // Seleção e Triagem: mesma tabela, etapa própria (migration 065).
    // Consulta separada de propósito -- a quantidade dela é em unidades
    // triadas, então somar com as caixas do repack daria um número que
    // não quer dizer nada.
    supabase
      .from("pa_reepack_lancamentos")
      .select("colaborador_id, colaborador_nome, turno, quantidade, inicio, fim")
      .eq("revenda_id", revendaId)
      .eq("etapa", "selecao")
      .not("fim", "is", null)
      .gte("inicio", de0)
      .lte("inicio", ate23),
    supabase
      .from("pa_despejo_lancamentos")
      .select("embalagem_despejo_id, colaborador_id, colaborador_nome, turno, litros, inicio, fim")
      .eq("revenda_id", revendaId)
      .not("fim", "is", null)
      .gte("inicio", de0)
      .lte("inicio", ate23),
    // Abastecimento do Picking. Trocou pa_reabastecimentos_picking em
    // 29/08/2026: aquela tabela media "posições", campo opcional que
    // ficou nulo em 100% das sessões -- o picking nunca pontuou de fato.
    // Os itens vêm embutidos para o HL sair na mesma ida ao banco.
    supabase
      .from("pa_abastecimentos")
      .select("colaborador_id, colaborador_nome, turno, inicio, fim, pa_abastecimento_itens(hl_calculado)")
      .eq("revenda_id", revendaId)
      .gte("inicio", de0)
      .lte("inicio", ate23)
      .not("fim", "is", null),
    supabase
      .from("pa_empilhadeira_operacoes")
      .select(
        "id, empilhadeira_id, operador_id, operador_nome, horimetro_inicial, foto_inicial_url, inicio, horimetro_final, foto_final_url, fim, encerrado_por_nome, status, pa_empilhadeiras!inner(numero)",
      )
      .eq("revenda_id", revendaId)
      .gte("inicio", de0)
      .lte("inicio", ate23),
    supabase
      // Avaria vem do RECEBIMENTO DE CARRETA, que é o que a operação usa.
      // Até 28/08/2026 esta consulta lia pa_recebimentos -- o módulo
      // "Recebimento de Paletes", tirado do menu por estar duplicado.
      // O indicador ficou congelado em dados velhos daquele módulo e a
      // carreta conferida no dia nunca aparecia aqui, por estar em outra
      // tabela. Nenhum filtro de data resolveria.
      .from("atendimentos_carretas")
      // Os carimbos de tempo entram aqui para o TMA e as fases saírem na
      // mesma ida ao banco -- o cálculo mora em lib/carretas.ts.
      .select(
        "id, pa_transportadoras(nome), atendimento_carretas_itens(quantidade, quantidade_avariada), chegada_em, agendamento_em, carga_agendada, inicio_atendimento_em, inicio_descarga_em, fim_descarga_em, inicio_conferencia_em, fim_conferencia_em, tem_carga, inicio_carga_em, fim_carga_em, finalizacao_em",
      )
      .eq("revenda_id", revendaId)
      .eq("status", "finalizado")
      .gte("finalizacao_em", de0)
      .lte("finalizacao_em", ate23),
    supabase
      .from("pa_execucoes_5s")
      .select("id, responsavel_id, responsavel_nome, inicio, fim")
      .eq("revenda_id", revendaId)
      .not("fim", "is", null)
      .gte("inicio", de0)
      .lte("inicio", ate23),
    // A meta de TMA é cadastrada no Admin -- é a régua da operação, não um
    // limiar escrito aqui.
    supabase
      .from("pa_recebimento_config")
      .select("tma_alvo_minutos")
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    // Trocas de gás: viram os ciclos de P20 do bloco da empilhadeira.
    // SEM recorte de data de propósito -- um ciclo vai de uma troca até a
    // seguinte, e cortar no início do período jogaria fora a troca
    // anterior, que é o ponto de partida do primeiro ciclo.
    supabase
      .from("pa_empilhadeira_trocas_gas")
      .select("id, empilhadeira_id, operador_id, operador_nome, horimetro, realizada_em")
      .eq("revenda_id", revendaId)
      .order("realizada_em", { ascending: true }),
    supabase
      .from("pa_empilhadeira_config")
      .select("custo_p20")
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    // As metas cadastradas em Admin > Metas. Sem linha = sem meta, e o
    // cartão fica neutro em vez de cobrar um número que ninguém definiu.
    supabase.from("pa_metas").select("chave, valor").eq("revenda_id", revendaId),
    // As embalagens do Repack (pa_embalagens), diferentes das do Despejo.
    supabase.from("pa_embalagens").select("id, nome").eq("revenda_id", revendaId),
    // Ressuprimento: o pedido, o transporte e o abastecimento. O que
    // interessa aqui não é o volume -- esse já está no bloco do
    // Abastecimento -- é o TEMPO ENTRE os três, que é onde a operação
    // espera e onde nada era medido até 02/09/2026.
    supabase
      .from("pa_ressuprimentos")
      .select(
        "id, criado_em, solicitante_id, solicitante_nome, prioridade, operador_id, operador_nome, transporte_inicio, cancelado_em, pa_ressuprimento_itens(id, produto_id, unidade, quantidade, hl_calculado, entregue_em), pa_abastecimentos(inicio, fim, colaborador_nome)",
      )
      .eq("revenda_id", revendaId)
      .gte("criado_em", de0)
      .lte("criado_em", ate23),
  ]);

  /**
   * O ressuprimento no formato puro de lib/ressuprimento -- nenhum status
   * vem do banco, tudo sai dos carimbos de tempo na leitura.
   */
  const ressuprimentos: Ressuprimento[] = (
    (ressuprimentosBanco ?? []) as unknown as {
      id: string;
      criado_em: string;
      solicitante_id: string;
      solicitante_nome: string;
      prioridade: string;
      operador_id: string | null;
      operador_nome: string | null;
      transporte_inicio: string | null;
      cancelado_em: string | null;
      pa_ressuprimento_itens: {
        id: string;
        produto_id: string;
        unidade: string;
        quantidade: number;
        hl_calculado: number;
        entregue_em: string | null;
      }[];
      pa_abastecimentos: { inicio: string; fim: string | null; colaborador_nome: string }[];
    }[]
  ).map((l) => {
    const sessao = l.pa_abastecimentos?.[0] ?? null;
    return {
      id: l.id,
      criadoEm: l.criado_em,
      solicitanteId: l.solicitante_id,
      solicitanteNome: l.solicitante_nome,
      prioridade: (l.prioridade === "urgente" ? "urgente" : "normal") as Prioridade,
      transporteInicio: l.transporte_inicio,
      operadorId: l.operador_id,
      operadorNome: l.operador_nome,
      canceladoEm: l.cancelado_em,
      itens: (l.pa_ressuprimento_itens ?? []).map((i) => ({
        id: i.id,
        produtoId: i.produto_id,
        unidade: i.unidade,
        quantidade: Number(i.quantidade),
        hl: Number(i.hl_calculado),
        entregueEm: i.entregue_em,
      })),
      abastecimentoInicio: sessao?.inicio ?? null,
      abastecimentoFim: sessao?.fim ?? null,
      abastecedorNome: sessao?.colaborador_nome ?? null,
    };
  });

  const resumoRessuprimento = resumirPeriodo(ressuprimentos);
  const operadoresRessuprimento = indicadoresDoOperador(ressuprimentos);
  const solicitantesRessuprimento = indicadoresDoSolicitante(ressuprimentos);

  const produtos: ProdutoMeta[] = (produtosBanco ?? []).map((p) => ({
    id: p.id,
    descricao: p.descricao,
    metaReepackHora: p.meta_reepack_hora,
  }));
  const embalagens: EmbalagemDespejo[] = (embalagensBanco ?? []).map((e) => ({
    id: e.id,
    nome: e.nome,
    litrosPorUnidade: e.litros_por_unidade,
    metaLitrosHora: e.meta_litros_hora,
  }));

  const reepacksTodos = (reepacksBanco ?? []) as {
    produto_id: string | null;
    embalagem_id: string | null;
    colaborador_id: string;
    colaborador_nome: string;
    turno: string;
    quantidade: number;
    inicio: string;
    fim: string;
  }[];
  const selecoesTodas = (selecoesBanco ?? []) as {
    colaborador_id: string;
    colaborador_nome: string;
    turno: string;
    quantidade: number;
    inicio: string;
    fim: string;
  }[];
  const despejosTodos = (despejosBanco ?? []) as {
    embalagem_despejo_id: string | null;
    colaborador_id: string;
    colaborador_nome: string;
    turno: string;
    litros: number;
    inicio: string;
    fim: string;
  }[];
  // Cada sessão de abastecimento vira uma linha com o HL somado dos itens
  // -- é a forma que o ranking e os cartões consomem (quantidade + tempo).
  const pickingsTodos = ((pickingsBanco ?? []) as {
    colaborador_id: string;
    colaborador_nome: string;
    turno: string;
    inicio: string;
    fim: string;
    pa_abastecimento_itens: { hl_calculado: number }[] | null;
  }[]).map((s) => ({
    colaborador_id: s.colaborador_id,
    colaborador_nome: s.colaborador_nome,
    turno: s.turno,
    inicio: s.inicio,
    fim: s.fim,
    hl: Math.round((s.pa_abastecimento_itens ?? []).reduce((t, i) => t + i.hl_calculado, 0) * 1000) / 1000,
  }));
  // 5S não tem coluna de turno (é uma execução, não um lançamento por
  // turno) -- infere pelo horário real de início, com a mesma régua que
  // decide o turno "agora" (ver turnoAtual em lib/produtividade-armazem).
  const execucoes5sTodos = (execucoes5sBanco ?? []).map((e) => ({
    colaborador_id: e.responsavel_id as string,
    colaborador_nome: e.responsavel_nome as string,
    turno: turnoAtual(new Date(e.inicio as string)) as string,
  }));

  const selecoes = turnoFiltro ? selecoesTodas.filter((s) => s.turno === turnoFiltro) : selecoesTodas;
  const reepacks = turnoFiltro ? reepacksTodos.filter((r) => r.turno === turnoFiltro) : reepacksTodos;
  const despejos = turnoFiltro ? despejosTodos.filter((d) => d.turno === turnoFiltro) : despejosTodos;
  const pickings = turnoFiltro ? pickingsTodos.filter((p) => p.turno === turnoFiltro) : pickingsTodos;
  const execucoes5s = turnoFiltro ? execucoes5sTodos.filter((e) => e.turno === turnoFiltro) : execucoes5sTodos;

  // ---- Reepack: agregados gerais (sem quebrar por produto) ----
  const reepackQuantidadeTotal = reepacks.reduce((s, r) => s + r.quantidade, 0);
  // Duração média por CAIXA, não por lançamento -- um lançamento pode
  // ter 2 caixas ou 20, então "duração média do lançamento" mistura
  // sessões de tamanhos bem diferentes. Tempo total ÷ caixas totais.
  const reepackHorasTotal = reepacks.reduce((s, r) => s + horasEntre(r.inicio, r.fim), 0);
  const reepackMediaHorasPorCaixa = reepackQuantidadeTotal > 0 ? reepackHorasTotal / reepackQuantidadeTotal : 0;

  // ---- Seleção e Triagem: etapa 1 do Repack (migration 065) ----
  // Sem meta cadastrada ainda -- é o que a cronoanálise está medindo --
  // então aqui só o realizado, sem "% da meta".
  const selecaoQuantidadeTotal = selecoes.reduce((s, x) => s + x.quantidade, 0);
  const selecaoHorasTotal = selecoes.reduce((s, x) => s + horasEntre(x.inicio, x.fim), 0);
  const selecaoTaxaHora = taxaPorHora(selecaoQuantidadeTotal, selecaoHorasTotal);

  // ---- Tempo de bancada: Seleção + Repack ----
  // O POP trata as duas como etapas do MESMO ciclo (POP-ARM-001, 7.2 a
  // 7.6): o produto sai do pallet avariado, é triado e volta embalado --
  // tudo na bancada. Separado, cada tempo diz pouco; somado, dá a carga
  // real de trabalho ali.
  //
  // A divisão entre as duas é o número que interessa: foi justamente por
  // suspeitar que um lote muito avariado consome o tempo na triagem (e
  // aparecia como "repack lento") que as etapas foram separadas.
  const bancadaHoras = selecaoHorasTotal + reepackHorasTotal;
  const bancadaPctSelecao = bancadaHoras > 0 ? Math.round((selecaoHorasTotal / bancadaHoras) * 100) : 0;

  // Média POR DIA TRABALHADO, não por dia do período: contar domingo e
  // dia sem lançamento derrubaria a média e faria a bancada parecer
  // ociosa quando ela só não operou.
  const diasComBancada = new Set(
    [...selecoes, ...reepacks].map((l) => diaLocalISO(l.inicio)),
  ).size;
  const bancadaMediaDia = diasComBancada > 0 ? bancadaHoras / diasComBancada : 0;

  // Tempo de bancada por pessoa -- quem passou mais tempo ali.
  const bancadaPorColaborador = new Map<string, { nome: string; horas: number }>();
  for (const l of [...selecoes, ...reepacks]) {
    const atual = bancadaPorColaborador.get(l.colaborador_id) ?? { nome: l.colaborador_nome, horas: 0 };
    atual.horas += horasEntre(l.inicio, l.fim);
    bancadaPorColaborador.set(l.colaborador_id, atual);
  }
  const barrasBancadaColaborador: ItemBarra[] = [...bancadaPorColaborador.values()]
    .map((v) => ({
      rotulo: v.nome,
      valor: Math.round(v.horas * 10) / 10,
      detalhe: `${v.nome}: ${formatarHoras(v.horas)} de bancada no período`,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  // ---- Despejo: agregado geral (litros/hora do total, não a média das taxas) ----
  const despejoLitrosTotal = Math.round(despejos.reduce((s, d) => s + d.litros, 0) * 10) / 10;
  const despejoHorasTotal = despejos.reduce((s, d) => s + horasEntre(d.inicio, d.fim), 0);
  const despejoTaxaMediaHora = taxaPorHora(despejoLitrosTotal, despejoHorasTotal);

  const reepackPorProduto = agruparPorProduto(
    reepacks.map((r) => ({ produtoId: r.produto_id ?? "", quantidade: r.quantidade, inicio: r.inicio, fim: r.fim })),
    produtos,
    (p) => p.metaReepackHora,
  );
  const despejoPorEmbalagem = agruparPorEmbalagem(
    despejos.map((d) => ({ embalagemId: d.embalagem_despejo_id ?? "", quantidade: d.litros, inicio: d.inicio, fim: d.fim })),
    embalagens,
    (e) => e.metaLitrosHora,
  );

  // ---- Reepack e despejo por colaborador ----
  const reepackPorColaborador = new Map<string, { nome: string; quantidade: number; horas: number }>();
  for (const r of reepacks) {
    const atual = reepackPorColaborador.get(r.colaborador_id) ?? { nome: r.colaborador_nome, quantidade: 0, horas: 0 };
    atual.quantidade += r.quantidade;
    atual.horas += (new Date(r.fim).getTime() - new Date(r.inicio).getTime()) / 3_600_000;
    reepackPorColaborador.set(r.colaborador_id, atual);
  }
  // ---- Repack por EMBALAGEM ----
  // Segmentado por tipo, e não só por produto: uma lata 350 e um long
  // neck não embalam no mesmo ritmo, e o número por produto é fino demais
  // para enxergar isso -- 25 produtos com um lançamento cada não formam
  // padrão nenhum. A embalagem junta.
  const nomeDaEmbalagem = new Map(
    ((embalagensRepackBanco ?? []) as { id: string; nome: string }[]).map((e) => [e.id, e.nome]),
  );
  const repackPorEmbalagem = new Map<string, { quantidade: number; horas: number; lancamentos: number }>();
  for (const r of reepacks) {
    if (!r.embalagem_id) continue;
    const atual = repackPorEmbalagem.get(r.embalagem_id) ?? { quantidade: 0, horas: 0, lancamentos: 0 };
    atual.quantidade += r.quantidade;
    atual.horas += horasEntre(r.inicio, r.fim);
    atual.lancamentos++;
    repackPorEmbalagem.set(r.embalagem_id, atual);
  }
  const barrasRepackEmbalagem: ItemBarra[] = [...repackPorEmbalagem.entries()]
    .map(([id, v]) => ({
      rotulo: nomeDaEmbalagem.get(id) ?? "(embalagem removida)",
      // A barra mostra a TAXA, não o total: quem embalou mais tempo não
      // passa na frente de quem rendeu mais rápido.
      valor: taxaPorHora(v.quantidade, v.horas),
      detalhe: `${nomeDaEmbalagem.get(id) ?? "?"}: ${v.quantidade} cx em ${
        Math.round(v.horas * 10) / 10
      }h · ${v.lancamentos} lançamento(s)`,
    }))
    .sort((a, b) => b.valor - a.valor);

  const barrasReepackColaborador: ItemBarra[] = [...reepackPorColaborador.entries()]
    .map(([, v]) => ({
      rotulo: v.nome,
      valor: v.quantidade,
      detalhe: `${v.nome}: ${v.quantidade} cx em ${Math.round(v.horas * 10) / 10}h`,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  const despejoPorColaborador = new Map<string, { nome: string; litros: number }>();
  for (const d of despejos) {
    const atual = despejoPorColaborador.get(d.colaborador_id) ?? { nome: d.colaborador_nome, litros: 0 };
    atual.litros += d.litros;
    despejoPorColaborador.set(d.colaborador_id, atual);
  }
  const barrasDespejoColaborador: ItemBarra[] = [...despejoPorColaborador.entries()]
    .map(([, v]) => ({ rotulo: v.nome, valor: Math.round(v.litros * 10) / 10 }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  // ---- Atividade por turno ----
  // Uma linha por turno, uma coluna por atividade -- a métrica de cada
  // coluna é a que faz sentido pra atividade (caixas, litros, HL,
  // execuções), e "Total" é a contagem de lançamentos somada (unidades
  // diferentes não dá pra somar direto).
  // Referência do grupo pra picking e 5S (ver pctRelativoAoGrupo): a
  // média de TODO o período, todos os turnos juntos -- é contra isso que
  // cada turno é comparado, não meta cadastrada (picking/5S não têm).
  const mediaHlPickingPeriodo = mediaHlPicking(
    pickingsTodos.map((p) => ({ quantidade: p.hl, inicio: p.inicio, fim: p.fim })),
  );
  const mediaExecucoes5sPeriodo = mediaExecucoes5sPorPessoa(
    execucoes5sTodos.map((e) => ({ colaboradorId: e.colaborador_id })),
  );
  // Seleção compara TAXA (un/h), não total: um turno mais longo não é
  // melhor por ter triado mais, e sim quem triou mais rápido.
  const mediaTaxaSelecaoPeriodo = mediaTaxaPorPessoa(selecoesTodas);

  const porTurno = TURNOS.map((t) => {
    const reepacksT = reepacksTodos.filter((r) => r.turno === t);
    const selecoesT = selecoesTodas.filter((s) => s.turno === t);
    const despejosT = despejosTodos.filter((d) => d.turno === t);
    const pickingsT = pickingsTodos.filter((p) => p.turno === t);
    const execucoes5sT = execucoes5sTodos.filter((e) => e.turno === t);

    // Mesma fórmula da pontuação individual (ver calcularPontuacao),
    // só que aplicada em cima do total do turno -- trata o turno como
    // se fosse "uma pessoa só" pra comparar desempenho entre turnos.
    const reepackAgrupadoT = agruparPorProduto(
      reepacksT.map((r) => ({ produtoId: r.produto_id ?? "", quantidade: r.quantidade, inicio: r.inicio, fim: r.fim })),
      produtos,
      (p) => p.metaReepackHora,
    );
    const despejoAgrupadoT = agruparPorEmbalagem(
      despejosT.map((d) => ({ embalagemId: d.embalagem_despejo_id ?? "", quantidade: d.litros, inicio: d.inicio, fim: d.fim })),
      embalagens,
      (e) => e.metaLitrosHora,
    );
    const hlPickingT = Math.round(pickingsT.reduce((s, p) => s + p.hl, 0) * 10) / 10;
    const pickingPctT = pctRelativoAoGrupo(
      mediaHlPicking(pickingsT.map((p) => ({ quantidade: p.hl, inicio: p.inicio, fim: p.fim }))),
      mediaHlPickingPeriodo,
    );
    // mediaExecucoes5sPorPessoa de novo aqui (não .length direto): o
    // turno reúne várias pessoas, então a régua tem que ser "execuções
    // por pessoa no turno", do contrário um turno com mais gente sempre
    // ganharia de um turno enxuto só por ter mais gente, não por render mais.
    const cincoSPctT = pctRelativoAoGrupo(
      mediaExecucoes5sPorPessoa(execucoes5sT.map((e) => ({ colaboradorId: e.colaborador_id }))),
      mediaExecucoes5sPeriodo,
    );
    const selecaoPctT = pctRelativoAoGrupo(mediaTaxaPorPessoa(selecoesT), mediaTaxaSelecaoPeriodo);
    const pontuacao = calcularPontuacao(
      mediaPct(reepackAgrupadoT.map((r) => r.pctMeta)),
      mediaPct(despejoAgrupadoT.map((d) => d.pctMeta)),
      pickingPctT,
      cincoSPctT,
      selecaoPctT,
    );

    return {
      turno: t,
      selecaoUn: selecoesT.reduce((s, x) => s + x.quantidade, 0),
      reepackCx: reepacksT.reduce((s, r) => s + r.quantidade, 0),
      despejoLitros: Math.round(despejosT.reduce((s, d) => s + d.litros, 0) * 10) / 10,
      pickingHl: hlPickingT,
      execucoes5s: execucoes5sT.length,
      totalLancamentos:
        selecoesT.length + reepacksT.length + despejosT.length + pickingsT.length + execucoes5sT.length,
      pontuacao,
    };
  });
  // Pontuação do total NÃO é a média das pontuações dos turnos (isso
  // distorceria turnos com pouca atividade) -- é a mesma fórmula
  // aplicada direto em cima dos dados do período inteiro. Picking e 5S
  // do total dão ~100% por construção (o período comparado com ele
  // mesmo) -- é esperado, não é bug.
  const reepackAgrupadoGeral = agruparPorProduto(
    reepacksTodos.map((r) => ({ produtoId: r.produto_id ?? "", quantidade: r.quantidade, inicio: r.inicio, fim: r.fim })),
    produtos,
    (p) => p.metaReepackHora,
  );
  const despejoAgrupadoGeral = agruparPorEmbalagem(
    despejosTodos.map((d) => ({ embalagemId: d.embalagem_despejo_id ?? "", quantidade: d.litros, inicio: d.inicio, fim: d.fim })),
    embalagens,
    (e) => e.metaLitrosHora,
  );
  const pontuacaoGeral = calcularPontuacao(
    mediaPct(reepackAgrupadoGeral.map((r) => r.pctMeta)),
    mediaPct(despejoAgrupadoGeral.map((d) => d.pctMeta)),
    pctRelativoAoGrupo(mediaHlPickingPeriodo, mediaHlPickingPeriodo),
    pctRelativoAoGrupo(mediaExecucoes5sPeriodo, mediaExecucoes5sPeriodo),
    pctRelativoAoGrupo(mediaTaxaSelecaoPeriodo, mediaTaxaSelecaoPeriodo),
  );

  const totalGeral = porTurno.reduce(
    (s, l) => ({
      selecaoUn: s.selecaoUn + l.selecaoUn,
      reepackCx: s.reepackCx + l.reepackCx,
      despejoLitros: Math.round((s.despejoLitros + l.despejoLitros) * 10) / 10,
      pickingHl: Math.round((s.pickingHl + l.pickingHl) * 10) / 10,
      execucoes5s: s.execucoes5s + l.execucoes5s,
      totalLancamentos: s.totalLancamentos + l.totalLancamentos,
    }),
    { selecaoUn: 0, reepackCx: 0, despejoLitros: 0, pickingHl: 0, execucoes5s: 0, totalLancamentos: 0 },
  );

  // ---- Empilhadeira: por máquina e por operador ----
  // Horas ativas de VERDADE vêm do horímetro (motor rodando), não do
  // tempo decorrido entre início e fim -- e só existem depois que a
  // operação fecha (o horímetro final só é lido no fechamento). Uma
  // operação ainda aberta simplesmente não entra nesses somatórios.
  const operacoesRaw = (operacoesBanco ?? []) as unknown as (Parameters<typeof operacaoEmpilhadeiraDeLinha>[0] & {
    pa_empilhadeiras: { numero: string } | { numero: string }[] | null;
  })[];
  const operacoes = operacoesRaw.map((o) => operacaoEmpilhadeiraDeLinha(o));
  const operacoesEncerradas = operacoes.filter((op) => op.horimetroFinal !== null);

  const horasPorMaquina = new Map<string, number>();
  const horasPorOperador = new Map<string, number>();
  for (const o of operacoesRaw) {
    if (o.horimetro_final === null) continue;
    const numero = (Array.isArray(o.pa_empilhadeiras) ? o.pa_empilhadeiras[0] : o.pa_empilhadeiras)?.numero ?? "—";
    const horas = horasAtivasDeOperacao(operacaoEmpilhadeiraDeLinha(o)) ?? 0;
    horasPorMaquina.set(numero, (horasPorMaquina.get(numero) ?? 0) + horas);
    horasPorOperador.set(o.operador_nome, (horasPorOperador.get(o.operador_nome) ?? 0) + horas);
  }
  const barrasHorasMaquina: ItemBarra[] = [...horasPorMaquina.entries()]
    .map(([numero, h]) => ({ rotulo: numero, valor: Math.round(h * 10) / 10 }))
    .sort((a, b) => b.valor - a.valor);
  const barrasHorasOperador: ItemBarra[] = [...horasPorOperador.entries()]
    .map(([nome, h]) => ({ rotulo: nome, valor: Math.round(h * 10) / 10 }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);
  const horasEmpilhadeiraTotal =
    Math.round(operacoesEncerradas.reduce((s, op) => s + (horasAtivasDeOperacao(op) ?? 0), 0) * 10) / 10;
  const mediaHorasPorOperacao =
    operacoesEncerradas.length > 0 ? Math.round((horasEmpilhadeiraTotal / operacoesEncerradas.length) * 100) / 100 : 0;

  // ---- % de avaria: geral e por transportadora ----
  type ItemCarreta = { quantidade: number; quantidade_avariada: number | null };
  type CarretaAvaria = {
    pa_transportadoras: { nome: string } | { nome: string }[] | null;
    atendimento_carretas_itens: ItemCarreta[] | null;
  };
  const carretas = (recebimentosBanco ?? []) as unknown as CarretaAvaria[];

  // Só conta como "avaliada" a carreta que teve itens lançados: sem
  // conferência não há avaria medida, e incluí-la puxaria o percentual
  // para baixo fingindo que nada veio avariado.
  const carretasComItens = carretas.filter((c) => (c.atendimento_carretas_itens ?? []).length > 0);
  const carretasAvaliadas = carretasComItens.length;
  const todosItens: ItemCarreta[] = carretasComItens.flatMap((c) => c.atendimento_carretas_itens ?? []);
  const pctAvariaGeral = pctAvariaConsolidado(
    todosItens.map((i) => ({
      id: "",
      produtoId: "",
      produtoCodigo: "",
      produtoDescricao: "",
      quantidadeRecebida: i.quantidade,
      quantidadeAvariada: i.quantidade_avariada ?? 0,
      pctAvaria: 0,
    })),
  );

  const avariaPorTransportadora = new Map<string, { recebido: number; avariado: number }>();
  for (const c of carretasComItens) {
    const t = Array.isArray(c.pa_transportadoras) ? c.pa_transportadoras[0] : c.pa_transportadoras;
    const nome = t?.nome ?? "—";
    const atual = avariaPorTransportadora.get(nome) ?? { recebido: 0, avariado: 0 };
    for (const i of c.atendimento_carretas_itens ?? []) {
      atual.recebido += i.quantidade;
      atual.avariado += i.quantidade_avariada ?? 0;
    }
    avariaPorTransportadora.set(nome, atual);
  }
  // ---- Tempos do recebimento ----
  // O cálculo mora em lib/carretas.ts. Aqui só a média de cada fase, e
  // cada uma ignora as carretas em que aquela fase não foi apontada --
  // contar como zero faria a operação parecer mais rápida do que é.
  //
  // Mapeado campo a campo de propósito. O banco devolve snake_case e o
  // tipo é camelCase: um `as AtendimentoCarreta` em cima da linha crua
  // compila liso e entrega tudo undefined, e o TMA viraria null em
  // silêncio para todas as carretas.
  const atendimentos: AtendimentoCarreta[] = ((recebimentosBanco ?? []) as Record<string, unknown>[]).map(
    (a) =>
      ({
        chegadaEm: a.chegada_em as string,
        agendamentoEm: (a.agendamento_em as string) ?? null,
        cargaAgendada: Boolean(a.carga_agendada),
        inicioAtendimentoEm: (a.inicio_atendimento_em as string) ?? null,
        inicioDescargaEm: (a.inicio_descarga_em as string) ?? null,
        fimDescargaEm: (a.fim_descarga_em as string) ?? null,
        inicioConferenciaEm: (a.inicio_conferencia_em as string) ?? null,
        fimConferenciaEm: (a.fim_conferencia_em as string) ?? null,
        temCarga: (a.tem_carga as boolean) ?? null,
        inicioCargaEm: (a.inicio_carga_em as string) ?? null,
        fimCargaEm: (a.fim_carga_em as string) ?? null,
        finalizacaoEm: (a.finalizacao_em as string) ?? null,
      }) as AtendimentoCarreta,
  );
  const tmaMedio = media(atendimentos.map(calcularTmaMinutos));
  const esperaMedia = media(atendimentos.map(calcularEsperaPortariaMinutos));
  const descargaMedia = media(atendimentos.map(calcularTempoDescargaMinutos));
  const conferenciaMedia = media(atendimentos.map(calcularTempoConferenciaMinutos));
  const patioMedio = media(atendimentos.map(calcularTempoPatioMinutos));
  const comRetorno = atendimentos.filter((a) => a.temCarga).length;

  const metaTma = Number(
    recebimentoConfig?.tma_alvo_minutos ?? RECEBIMENTO_CONFIG_PADRAO.tmaAlvoMinutos,
  );
  const leituraTma =
    tmaMedio === null ? null : avaliarMeta(tmaMedio, metaTma, "menor_melhor", { sufixo: "min" });

  // ---- Metas cadastradas ----
  // `null` em qualquer ponto (meta não cadastrada OU realizado sem
  // medição) devolve null, e o cartão fica sem cor. Pintar sem régua
  // seria inventar uma.
  const metaDe = new Map(
    ((metasBanco ?? []) as { chave: string; valor: number }[]).map((m) => [m.chave, Number(m.valor)]),
  );
  const leitura = (chave: string, realizado: number | null) => {
    const def = CATALOGO_DE_METAS.find((d) => d.chave === chave);
    const alvo = metaDe.get(chave);
    // Referência não pinta cartão: a capacidade da bombona não tem lado
    // certo, e verde/vermelho ali diria uma coisa que não existe.
    if (!def || def.tipo === "referencia" || alvo === undefined || realizado === null) return null;
    return avaliarMeta(realizado, alvo, def.sentido, { sufixo: def.sufixo, casas: def.casas });
  };

  const leituraAvaria = leitura("avaria_pct", pctAvariaGeral);
  const leituraSelecao = leitura("selecao_un_hora", selecaoTaxaHora);
  const leituraBancadaDia = leitura("bancada_horas_dia", bancadaMediaDia);
  const leituraDespejo = leitura("despejo_litros_hora", despejoTaxaMediaHora);

  // Em MINUTOS por caixa: em horas o número fica em "0,04h", que não se
  // lê e não se cadastra como meta.
  const reepackMinutosPorCaixa = reepackMediaHorasPorCaixa * 60;
  const leituraDuracaoCaixa = leitura("reepack_minutos_caixa", reepackMinutosPorCaixa);

  const capacidadeBombona = metaDe.get("despejo_capacidade_bombona") ?? 1000;

  // HL por hora do Abastecimento do Picking, no recorte já filtrado por
  // turno -- mesma função que a pontuação usa, para os dois números não
  // discordarem na mesma tela.
  const pickingHlTotal = Math.round(pickings.reduce((s, p) => s + p.hl, 0) * 10) / 10;
  const pickingHlHora = mediaHlPicking(
    pickings.map((p) => ({ quantidade: p.hl, inicio: p.inicio, fim: p.fim })),
  );
  const leituraPicking = leitura("picking_hl_hora", pickingHlHora);

  // ---- Gás da empilhadeira ----
  // Reaproveita o mesmo motor do dashboard de consumo: um ciclo vai de
  // uma troca de P20 até a seguinte, rateado pelas horas de quem usou.
  const numeroDaMaquina = new Map<string, string>();
  for (const op of operacoes) {
    if (op.empilhadeiraNumero) numeroDaMaquina.set(op.empilhadeiraId, op.empilhadeiraNumero);
  }
  const trocasGas: TrocaGas[] = ((trocasGasBanco ?? []) as Record<string, unknown>[]).map((t) => ({
    id: t.id as string,
    empilhadeiraId: t.empilhadeira_id as string,
    operadorId: t.operador_id as string,
    operadorNome: t.operador_nome as string,
    horimetro: Number(t.horimetro),
    realizadaEm: t.realizada_em as string,
  }));
  const sessoesParaGas: SessaoUso[] = operacoesEncerradas.map((op) => ({
    id: op.id,
    empilhadeiraId: op.empilhadeiraId,
    operadorId: op.operadorId,
    operadorNome: op.operadorNome,
    horimetroInicial: op.horimetroInicial,
    horimetroFinal: op.horimetroFinal,
    inicio: op.inicio,
    fim: op.fim,
  }));

  // O ciclo entra no período em que FECHOU -- é quando o botijão acabou e
  // o consumo virou fato.
  //
  // Comparado como INSTANTE, não como texto: o banco devolve o carimbo em
  // +00:00 e o recorte é escrito em -03:00. Como string, uma troca da
  // meia-noite UTC (21h do dia anterior no armazém) pareceria maior que o
  // início do período e entraria no dia errado.
  const inicioMs = new Date(de0).getTime();
  const fimMs = new Date(ate23).getTime();
  const ciclosDoPeriodo = montarCiclos(trocasGas, sessoesParaGas, numeroDaMaquina)
    .filter(cicloContaParaMaquina)
    .filter((c) => {
      const t = new Date(c.fechadoEm).getTime();
      return t >= inicioMs && t <= fimMs;
    });
  const p20NoPeriodo = ciclosDoPeriodo.length;
  const horasDosCiclos = ciclosDoPeriodo.reduce((s, c) => s + c.horas, 0);
  const mediaHorasPorP20 = p20NoPeriodo > 0 ? horasDosCiclos / p20NoPeriodo : null;
  const custoP20 = empilhadeiraConfig?.custo_p20 ?? null;
  const custoDoGas = custoP20 !== null ? custoP20 * p20NoPeriodo : null;
  const leituraHorasP20 = leitura("empilhadeira_horas_p20", mediaHorasPorP20);

  const barrasAvariaTransportadora: ItemBarra[] = [...avariaPorTransportadora.entries()]
    .filter(([, v]) => v.recebido > 0)
    .map(([nome, v]) => ({
      rotulo: nome,
      valor: Math.round((v.avariado / v.recebido) * 1000) / 10,
      detalhe: `${nome}: ${v.avariado} de ${v.recebido} un avariadas`,
    }))
    .sort((a, b) => b.valor - a.valor);

  // ---- Ranking ----
  const ranking = construirRanking(
    reepacks.map((r) => ({
      colaboradorId: r.colaborador_id,
      colaboradorNome: r.colaborador_nome,
      produtoId: r.produto_id ?? "",
      quantidade: r.quantidade,
      inicio: r.inicio,
      fim: r.fim,
    })),
    despejos.map((d) => ({
      colaboradorId: d.colaborador_id,
      colaboradorNome: d.colaborador_nome,
      embalagemId: d.embalagem_despejo_id ?? "",
      litros: d.litros,
      inicio: d.inicio,
      fim: d.fim,
    })),
    pickings.map((p) => ({
      colaboradorId: p.colaborador_id,
      colaboradorNome: p.colaborador_nome,
      quantidade: p.hl,
      inicio: p.inicio,
      fim: p.fim,
    })),
    execucoes5s.map((e) => ({ colaboradorId: e.colaborador_id, colaboradorNome: e.colaborador_nome })),
    produtos,
    embalagens,
    selecoes.map((s) => ({
      colaboradorId: s.colaborador_id,
      colaboradorNome: s.colaborador_nome,
      quantidade: s.quantidade,
      inicio: s.inicio,
      fim: s.fim,
    })),
  );

  /**
   * O ranking em planilha -- uma linha por pessoa, no mesmo recorte de
   * data e turno que está na tela.
   *
   * Vão as PARCELAS junto da pontuação final, não só ela. A pontuação é
   * uma média de porcentagens, e sozinha não deixa perguntar "caiu por
   * causa do repack ou do despejo?" -- que é a única pergunta que leva a
   * uma conversa útil com a pessoa.
   *
   * Vazio quando a pessoa não fez a atividade: um 0 ali seria lido como
   * "fez e teve desempenho zero", e puxaria qualquer média da planilha
   * para baixo.
   */
  const csvRanking = ranking.map((r, i) => [
    i + 1,
    r.colaboradorNome,
    r.pontuacao,
    r.reepacksPctMeta,
    r.despejoPctMeta,
    r.selecaoPctMedia,
    r.pickingPctMedia,
    r.cincoSPctMedia,
    r.totalReepacks,
    r.totalDespejoLitros,
    r.totalSelecao,
    r.hlPicking,
    r.totalExecucoes5s,
    r.totalAtividades,
  ]);

  return (
    <div>
      <PageHeader
        title="Indicadores e Ranking"
        subtitle="Produtividade do Armazém no período."
        fecharHref="/produtividade-armazem"
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <div>
          <label className={rotulo} htmlFor="de">De</label>
          <input id="de" type="date" name="de" defaultValue={de} className={campo} />
        </div>
        <div>
          <label className={rotulo} htmlFor="ate">Até</label>
          <input id="ate" type="date" name="ate" defaultValue={ate} className={campo} />
        </div>
        <div>
          <label className={rotulo} htmlFor="turno">Turno</label>
          <select id="turno" name="turno" defaultValue={turnoFiltro ?? ""} className={campo}>
            <option value="">Todos</option>
            {TURNOS.map((t) => (
              <option key={t} value={t}>{ROTULO_TURNO[t]}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
          Filtrar
        </button>
        <div className="ml-auto">
          <ExportarCsv
            nome="ranking-armazem"
            complemento={[de, "a", ate, turnoFiltro ?? ""].filter(Boolean).join("_")}
            cabecalho={[
              "Posição",
              "Colaborador",
              "Pontuação",
              "% meta Repack",
              "% meta Despejo",
              "% média Seleção",
              "% média Picking",
              "% média 5S",
              "Repacks (un)",
              "Despejo (L)",
              "Seleção (un)",
              "Picking (HL)",
              "Execuções 5S",
              "Lançamentos",
            ]}
            linhas={csvRanking}
            rotulo="Exportar ranking .csv"
          />
        </div>
      </form>

      <div className="space-y-5">
        {/* Vem primeiro: é a visão do ciclo inteiro. Os blocos abaixo
            abrem cada etapa. */}
        <BlocoAtividade titulo="🧰 Tempo de bancada (Seleção + Repack)">
          <CartaoHero
            titulo="Tempo total"
            valor={formatarHoras(bancadaHoras)}
            legenda={`em ${diasComBancada} dia${diasComBancada === 1 ? "" : "s"} com lançamento`}
          />
          <CartaoHero
            titulo="Média por dia"
            meta={leituraBancadaDia}
            valor={formatarHoras(bancadaMediaDia)}
            legenda="só dias que tiveram bancada"
          />
          <CartaoHero
            titulo="Onde o tempo foi"
            valor={`${bancadaPctSelecao}% / ${100 - bancadaPctSelecao}%`}
            legenda="triagem / reembalagem"
          />
          <CartaoHero titulo="Tempo triando" valor={formatarHoras(selecaoHorasTotal)} />
          <CartaoHero titulo="Tempo reembalando" valor={formatarHoras(reepackHorasTotal)} />
        </BlocoAtividade>

        <BlocoAtividade titulo="🔍 Seleção e Triagem">
          <CartaoHero titulo="Lançamentos" valor={String(selecoes.length)} />
          <CartaoHero titulo="Unidades triadas" valor={`${selecaoQuantidadeTotal} un`} />
          <CartaoHero
            meta={leituraSelecao}
            titulo="Taxa média"
            valor={`${selecaoTaxaHora.toFixed(1)} un/h`}
            legenda="unidades ÷ horas do período"
          />
        </BlocoAtividade>

        <BlocoAtividade titulo="📦 Reepack">
          <CartaoHero titulo="Lançamentos" valor={String(reepacks.length)} />
          <CartaoHero titulo="Caixas reepackadas" valor={`${reepackQuantidadeTotal} cx`} />
          <CartaoHero
            titulo="Duração média"
            valor={`${formatarNumeroBr(reepackMinutosPorCaixa, 2)} min`}
            legenda="por caixa reembalada"
            meta={leituraDuracaoCaixa}
          />
        </BlocoAtividade>

        <BlocoAtividade titulo="🫗 Despejo">
          <TermometroDaBombona litros={despejoLitrosTotal} capacidade={capacidadeBombona} />
          <CartaoHero
            titulo="Taxa média"
            valor={`${despejoTaxaMediaHora.toFixed(1)} L/h`}
            legenda="litros ÷ horas do período"
            meta={leituraDespejo}
          />
          <CartaoHero titulo="Lançamentos" valor={String(despejos.length)} />
        </BlocoAtividade>

        <BlocoAtividade titulo="🧃 Abastecimento do Picking">
          <CartaoHero titulo="Sessões" valor={String(pickings.length)} legenda="encerradas no período" />
          <CartaoHero titulo="HL abastecidos" valor={`${formatarNumeroBr(pickingHlTotal, 1)} HL`} />
          <CartaoHero
            titulo="Taxa média"
            valor={pickingHlHora === null ? "—" : `${formatarNumeroBr(pickingHlHora, 2)} HL/h`}
            legenda="HL ÷ horas de sessão"
            meta={leituraPicking}
          />
        </BlocoAtividade>

        {/* O bloco mede o que acontece ENTRE as pessoas -- o volume já
            está no bloco de cima. Só aparece quando houve solicitação no
            período: um bloco de zeros ensinaria a ignorá-lo. */}
        {resumoRessuprimento.total > 0 && (
          <BlocoAtividade titulo="🧾 Ressuprimento — tempos e movimentos">
            <CartaoHero
              titulo="Ciclo médio"
              valor={
                resumoRessuprimento.cicloMedio === null
                  ? "—"
                  : formatarMinutosCurto(resumoRessuprimento.cicloMedio)
              }
              legenda={`do pedido ao picking abastecido · ${resumoRessuprimento.concluidas} concluída(s)`}
            />
            {/* O número que muda decisão. Um ciclo de 40 minutos com 35 de
                espera não se resolve treinando quem abastece. */}
            <CartaoHero
              titulo="Disso, esperando"
              valor={
                resumoRessuprimento.pctEspera === null
                  ? "—"
                  : `${formatarNumeroBr(resumoRessuprimento.pctEspera, 1)}%`
              }
              legenda="fila da empilhadeira + espera na área"
            />
            <CartaoHero
              titulo="Espera pela empilhadeira"
              valor={
                resumoRessuprimento.esperaEmpilhadeiraMedia === null
                  ? "—"
                  : formatarMinutosCurto(resumoRessuprimento.esperaEmpilhadeiraMedia)
              }
              legenda="do pedido até alguém aceitar"
            />
            <CartaoHero
              titulo="Transporte"
              valor={
                resumoRessuprimento.transporteMedio === null
                  ? "—"
                  : formatarMinutosCurto(resumoRessuprimento.transporteMedio)
              }
              legenda="do aceite até o último item na área"
            />
            <CartaoHero
              titulo="Espera pelo ajudante"
              valor={
                resumoRessuprimento.esperaAjudanteMedia === null
                  ? "—"
                  : formatarMinutosCurto(resumoRessuprimento.esperaAjudanteMedia)
              }
              legenda="da área até começar a abastecer"
            />
            <CartaoHero
              titulo="Solicitações"
              valor={String(resumoRessuprimento.total)}
              legenda={`${resumoRessuprimento.abertas} em aberto · ${resumoRessuprimento.canceladas} cancelada(s)`}
            />
          </BlocoAtividade>
        )}

        {operadoresRessuprimento.length > 0 && (
          <BlocoAtividade titulo="🏗️ Quem transportou o ressuprimento">
            <div className="col-span-full">
              <BarraRanking
                titulo="HL transportados"
                itens={operadoresRessuprimento.map((o) => ({
                  rotulo: o.operadorNome,
                  valor: o.hl,
                  detalhe: `${o.entregas} entrega(s) · ${
                    o.transporteMedio === null ? "sem tempo" : formatarMinutosCurto(o.transporteMedio)
                  } por viagem`,
                }))}
                sufixo=" HL"
              />
            </div>
          </BlocoAtividade>
        )}

        {solicitantesRessuprimento.length > 0 && (
          <BlocoAtividade titulo="🧾 Quem pediu">
            <div className="col-span-full">
              <BarraRanking
                titulo="Solicitações no período"
                itens={solicitantesRessuprimento.map((s) => ({
                  rotulo: s.solicitanteNome,
                  valor: s.solicitacoes,
                  detalhe: `${formatarNumeroBr(s.hl, 1)} HL · ${s.urgentes} urgente(s)${
                    s.canceladas > 0 ? ` · ${s.canceladas} cancelada(s)` : ""
                  }`,
                }))}
                sufixo=""
              />
            </div>
          </BlocoAtividade>
        )}

        <BlocoAtividade titulo="🏗️ Empilhadeira">
          <CartaoHero titulo="Horas ativas" valor={`${horasEmpilhadeiraTotal}h`} legenda="horímetro, operações encerradas" />
          {/* Mostra as ENCERRADAS, que é o denominador da duração média.
              Antes o cartão contava também as abertas: quem tentasse
              conferir dividindo as horas por este número não chegava na
              média mostrada ao lado, e um indicador que não fecha na
              conferência do usuário perde a confiança dele. */}
          <CartaoHero
            titulo="Operações"
            valor={String(operacoesEncerradas.length)}
            legenda={
              operacoes.length > operacoesEncerradas.length
                ? `${operacoes.length - operacoesEncerradas.length} ainda em aberto`
                : "encerradas"
            }
          />
          <CartaoHero titulo="Duração média" valor={formatarHoras(mediaHorasPorOperacao)} legenda="por operação, horímetro" />

          {/* Gás: o ciclo do P20, mesmo motor do dashboard de consumo. */}
          <CartaoHero
            titulo="P20 consumidos"
            valor={String(p20NoPeriodo)}
            legenda="ciclos fechados no período"
          />
          <CartaoHero
            titulo="Média horas/P20"
            valor={mediaHorasPorP20 === null ? "—" : `${formatarNumeroBr(mediaHorasPorP20)}h`}
            legenda="quanto rende um botijão"
            meta={leituraHorasP20}
          />
          {custoDoGas !== null && (
            <CartaoHero
              titulo="Custo do gás"
              valor={`R$ ${custoDoGas.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              legenda={`P20 a R$ ${formatarNumeroBr(custoP20 ?? 0, 2)}`}
            />
          )}
        </BlocoAtividade>

        <BlocoAtividade titulo="🚛 Recebimento">
          <CartaoHero
            titulo="Carretas finalizadas"
            valor={String(atendimentos.length)}
            legenda={
              comRetorno > 0
                ? `${comRetorno} voltaram carregadas de AG`
                : "nenhuma voltou carregada"
            }
          />
          <CartaoHero
            titulo="TMA médio"
            valor={tmaMedio === null ? "—" : formatarMinutos(Math.round(tmaMedio))}
            legenda="da chegada (ou do agendado) até a liberação"
            meta={leituraTma}
          />
          {/* A conferência conta em PALETES: um palete com uma garrafa
              quebrada conta inteiro, por isso o valor fica na casa das
              dezenas de %. Enquanto não houver meta cadastrada, sem cor --
              o antigo limiar de 2% nunca foi régua deste número e faria o
              cartão gritar vermelho para sempre. */}
          <CartaoHero
            titulo="% de paletes com avaria"
            valor={`${pctAvariaGeral}%`}
            legenda="paletes tocados, não volume"
            meta={leituraAvaria}
          />
          <CartaoHero
            titulo="Carretas com conferência"
            valor={String(carretasAvaliadas)}
            legenda="é a base do % de avaria"
          />

          {/* Fases: sem meta cadastrada, então sem cor. São o
              diagnóstico de ONDE o TMA foi gasto -- pintar de vermelho
              um número sem régua seria inventar uma. */}
          <CartaoHero
            titulo="Espera na portaria"
            valor={esperaMedia === null ? "—" : formatarMinutos(Math.round(esperaMedia))}
            legenda="chegada até alguém começar"
          />
          <CartaoHero
            titulo="Tempo de descarga"
            valor={descargaMedia === null ? "—" : formatarMinutos(Math.round(descargaMedia))}
            legenda="início ao fim da descarga"
          />
          <CartaoHero
            titulo="Tempo de conferência"
            valor={conferenciaMedia === null ? "—" : formatarMinutos(Math.round(conferenciaMedia))}
            legenda="não entra no TMA"
          />
          <CartaoHero
            titulo="Tempo no pátio"
            valor={patioMedio === null ? "—" : formatarMinutos(Math.round(patioMedio))}
            legenda="chegada até a finalização"
          />
        </BlocoAtividade>

      </div>

      <details className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
        <summary className="cursor-pointer font-semibold text-slate-600">
          ℹ️ Como o recebimento e a empilhadeira são medidos
        </summary>
        <ul className="mt-2 space-y-1.5">
          <li>
            <strong>TMA</strong> — quanto a carreta ocupou a operação. Começa no horário{" "}
            <em>agendado</em> quando havia agendamento, senão na chegada apontada pela portaria.
            Termina no fim da descarga; se a carreta voltou carregada de AG, termina no fim do{" "}
            <strong>carregamento</strong> — até lá ela continua no pátio. O vão entre descarga e
            carga conta.
          </li>
          <li>
            <strong>A conferência nunca entra no TMA</strong> — a carreta não espera por ela. Já
            houve conferência terminando duas horas depois de a carreta sair; contá-la infla o
            indicador com tempo que não é da carreta.
          </li>
          <li>
            <strong>Cor dos cartões</strong> — verde quando a meta está batida, vermelho quando
            não, com a diferença embaixo. Só os cartões que <em>têm</em> régua ganham cor: as fases
            do atendimento não têm meta cadastrada, e pintá-las seria inventar uma. A meta de TMA
            se cadastra em Admin → Produtividade do Armazém → Recebimento.
          </li>
          <li>
            <strong>% de paletes com avaria</strong> — a conferência conta em{" "}
            <strong>paletes</strong>, e um palete com uma garrafa quebrada conta como palete
            avariado inteiro. Por isso o número fica na casa das dezenas: ele diz quantos paletes
            foram <em>tocados</em> por avaria, não quanto do volume veio avariado. Só entram
            carretas com conferência lançada — sem conferência não há avaria medida, e incluí-las
            puxaria o percentual para baixo fingindo que nada veio avariado. Este cartão ainda não
            tem meta cadastrada.
          </li>
          <li>
            <strong>P20</strong> — um ciclo vai de uma troca de gás até a seguinte, e entra no
            período em que <em>fechou</em>, que é quando o botijão acabou. A primeira troca de cada
            máquina não vira ciclo: sem um ponto anterior não há intervalo para medir.
          </li>
        </ul>
      </details>

      <details className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
        <summary className="cursor-pointer font-semibold text-slate-600">
          ℹ️ Como o tempo de bancada é medido
        </summary>
        <ul className="mt-2 space-y-1.5">
          <li>
            <strong>Tempo total</strong> — soma das horas de Seleção e de Repack no período. São as
            duas etapas que acontecem na bancada (POP-ARM-001, seções 7.2 a 7.6): o produto sai do
            palete avariado, é triado e volta embalado.
          </li>
          <li>
            <strong>Média por dia</strong> — dividida pelos dias que <em>tiveram</em> lançamento, não
            pelos dias do período. Contar domingo e dia parado faria a bancada parecer ociosa quando
            ela apenas não operou.
          </li>
          <li>
            <strong>Onde o tempo foi</strong> — quanto do total ficou em cada etapa. É o número que
            motivou separá-las: um lote muito avariado consome o tempo na triagem, e antes isso
            aparecia como &ldquo;repack lento&rdquo;. Se a triagem passar a puxar a maior fatia, o
            gargalo está na qualidade do que chega, não na velocidade de quem embala.
          </li>
          <li>
            Cada lançamento conta do início ao fim do cronômetro. Duas pessoas trabalhando ao mesmo
            tempo somam as duas horas — é carga de trabalho, não tempo de relógio na parede.
          </li>
        </ul>
      </details>

      <details className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          📊 Comparativos por colaborador e máquina
        </summary>
        <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
          <BarraRanking
            titulo="Tempo de bancada por colaborador"
            subtitulo="Triagem + reembalagem somadas"
            itens={barrasBancadaColaborador}
            sufixo="h"
            tom="gold"
          />
          <BarraRanking
            titulo="Reepack por colaborador"
            subtitulo="Total de caixas no período"
            itens={barrasReepackColaborador}
            sufixo="cx"
          />
          <BarraRanking
            titulo="Repack por embalagem"
            subtitulo="Caixas por hora, por tipo de embalagem"
            itens={barrasRepackEmbalagem}
            sufixo="cx/h"
          />
          <BarraRanking
            titulo="Despejo por colaborador"
            subtitulo="Total de litros no período"
            itens={barrasDespejoColaborador}
            sufixo="L"
          />
          <BarraRanking
            titulo="% de avaria por transportadora"
            subtitulo="Avariado sobre recebido"
            itens={barrasAvariaTransportadora}
            sufixo="%"
          />
          <BarraRanking
            titulo="Empilhadeira: horas por máquina"
            itens={barrasHorasMaquina}
            sufixo="h"
          />
          <BarraRanking
            titulo="Empilhadeira: horas por operador"
            itens={barrasHorasOperador}
            sufixo="h"
          />
        </div>
      </details>

      <details className="mt-4 rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          📅 Atividade por turno{turnoFiltro ? ` — ${ROTULO_TURNO[turnoFiltro]}` : ""}
        </summary>
        <div className="border-t border-slate-100 p-4">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">Turno</th>
                  <th className="p-3 text-right">🔍 Seleção</th>
                  <th className="p-3 text-right">📦 Reepack</th>
                  <th className="p-3 text-right">🫗 Despejo</th>
                  <th className="p-3 text-right">🛒 Picking</th>
                  <th className="p-3 text-right">🧹 5S</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right" title={EXPLICACAO_PONTUACAO}>
                    Pontuação ℹ️
                  </th>
                </tr>
              </thead>
              <tbody>
                {porTurno.map((l) => (
                  <tr key={l.turno} className="border-t border-slate-100">
                    <td className="p-3 font-semibold text-slate-800">{ROTULO_TURNO[l.turno]}</td>
                    <td className="p-3 text-right tabular-nums">{l.selecaoUn} un</td>
                    <td className="p-3 text-right tabular-nums">{l.reepackCx} cx</td>
                    <td className="p-3 text-right tabular-nums">{l.despejoLitros} L</td>
                    <td className="p-3 text-right tabular-nums">{l.pickingHl} HL</td>
                    <td className="p-3 text-right tabular-nums">{l.execucoes5s}</td>
                    <td className="p-3 text-right font-bold tabular-nums text-slate-900">{l.totalLancamentos}</td>
                    <td className="p-3 text-right">
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                        {l.pontuacao} pts
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-bold">
                  <td className="p-3 text-slate-800">Total</td>
                  <td className="p-3 text-right tabular-nums">{totalGeral.selecaoUn} un</td>
                  <td className="p-3 text-right tabular-nums">{totalGeral.reepackCx} cx</td>
                  <td className="p-3 text-right tabular-nums">{totalGeral.despejoLitros} L</td>
                  <td className="p-3 text-right tabular-nums">{totalGeral.pickingHl} HL</td>
                  <td className="p-3 text-right tabular-nums">{totalGeral.execucoes5s}</td>
                  <td className="p-3 text-right tabular-nums text-slate-900">{totalGeral.totalLancamentos}</td>
                  <td className="p-3 text-right tabular-nums text-slate-900">{pontuacaoGeral} pts</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">ℹ️ {EXPLICACAO_PONTUACAO}</p>
        </div>
      </details>

      <details className="mt-4 rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          🏆 Ranking{turnoFiltro ? ` — ${ROTULO_TURNO[turnoFiltro]}` : ""}
        </summary>
        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 flex items-baseline justify-end">
            <p className="text-xs text-slate-400">Empate: desempata quem fez mais lançamentos</p>
          </div>
          {ranking.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nada no período.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Colaborador</th>
                    <th className="p-3 text-right">🔍 Seleção</th>
                    <th className="p-3 text-right">📦 Reepack</th>
                    <th className="p-3 text-right">🫗 Despejo</th>
                    <th className="p-3 text-right">🛒 Picking</th>
                    <th className="p-3 text-right">🧹 5S</th>
                    <th className="p-3 text-right">Atividades</th>
                    <th className="p-3 text-right" title={EXPLICACAO_PONTUACAO}>
                      Pontuação ℹ️
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.colaboradorId} className={`border-t border-slate-100 ${i < 3 ? "bg-gold-soft/40" : ""}`}>
                      <td className="p-3 font-bold text-slate-700">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                      </td>
                      <td className="p-3 font-semibold text-slate-900">{r.colaboradorNome}</td>
                      <td className="p-3 text-right tabular-nums">
                        {r.totalSelecao > 0 ? (
                          <>
                            {r.totalSelecao} un
                            {r.selecaoPctMedia !== null && (
                              <span className="ml-1 text-xs text-slate-400">({r.selecaoPctMedia}% da média)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {r.totalReepacks > 0 ? (
                          <>
                            {r.totalReepacks} cx
                            {r.reepacksPctMeta !== null && (
                              <span className="ml-1 text-xs text-slate-400">({r.reepacksPctMeta}%)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {r.totalDespejoLitros > 0 ? (
                          <>
                            {r.totalDespejoLitros} L
                            {r.despejoPctMeta !== null && (
                              <span className="ml-1 text-xs text-slate-400">({r.despejoPctMeta}%)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {r.hlPicking > 0 ? (
                          <>
                            {r.hlPicking} HL
                            {r.pickingPctMedia !== null && (
                              <span className="ml-1 text-xs text-slate-400">({r.pickingPctMedia}% da média)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {r.totalExecucoes5s > 0 ? (
                          <>
                            {r.totalExecucoes5s}
                            {r.cincoSPctMedia !== null && (
                              <span className="ml-1 text-xs text-slate-400">({r.cincoSPctMedia}% da média)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums text-slate-500">{r.totalAtividades}</td>
                      <td className="p-3 text-right">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-700">
                          {r.pontuacao} pts
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-400">ℹ️ {EXPLICACAO_PONTUACAO}</p>
        </div>
      </details>

      <details className="mt-4 rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          📦 Reepack e despejo por produto/embalagem
        </summary>
        <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
          <BarraRanking
            titulo="Reepack por produto"
            subtitulo="Taxa média no período"
            itens={reepackPorProduto.map((l) => ({
              rotulo: l.produtoDescricao,
              valor: l.taxa,
              detalhe: `${l.produtoDescricao}: ${l.quantidade} cx em ${l.horas}h${l.pctMeta !== null ? ` — ${l.pctMeta}% da meta` : ""}`,
            }))}
            sufixo="cx/h"
          />
          <BarraRanking
            titulo="Despejo por embalagem"
            subtitulo="Litros/hora, já convertidos"
            itens={despejoPorEmbalagem.map((l) => ({
              rotulo: l.embalagemNome,
              valor: l.taxa,
              detalhe: `${l.embalagemNome}: ${l.quantidade} L em ${l.horas}h${l.pctMeta !== null ? ` — ${l.pctMeta}% da meta` : ""}`,
            }))}
            sufixo="L/h"
            tom="gold"
          />
        </div>
      </details>
    </div>
  );
}
