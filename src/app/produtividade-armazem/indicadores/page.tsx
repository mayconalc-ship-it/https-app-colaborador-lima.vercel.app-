import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoArmazem } from "@/lib/produtividade-armazem-server";
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
import { BarraRanking, BlocoAtividade, CartaoHero, type ItemBarra } from "./Graficos";

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
      .select("produto_id, colaborador_id, colaborador_nome, turno, quantidade, inicio, fim")
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
      .select(
        "id, pa_transportadoras(nome), atendimento_carretas_itens(quantidade, quantidade_avariada)",
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
  ]);

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
            titulo="Taxa média"
            valor={`${selecaoTaxaHora.toFixed(1)} un/h`}
            legenda="unidades ÷ horas do período"
          />
        </BlocoAtividade>

        <BlocoAtividade titulo="📦 Reepack">
          <CartaoHero titulo="Lançamentos" valor={String(reepacks.length)} />
          <CartaoHero titulo="Caixas reepackadas" valor={`${reepackQuantidadeTotal} cx`} />
          <CartaoHero titulo="Duração média" valor={formatarHoras(reepackMediaHorasPorCaixa)} legenda="por caixa" />
        </BlocoAtividade>

        <BlocoAtividade titulo="🫗 Despejo">
          <CartaoHero titulo="Litros despejados" valor={`${despejoLitrosTotal.toFixed(1)} L`} />
          <CartaoHero titulo="Taxa média" valor={`${despejoTaxaMediaHora.toFixed(1)} L/h`} legenda="litros ÷ horas do período" />
          <CartaoHero titulo="Lançamentos" valor={String(despejos.length)} />
        </BlocoAtividade>

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
        </BlocoAtividade>

        <BlocoAtividade titulo="🚛 Recebimento">
          <CartaoHero
            titulo="Carretas avaliadas"
            valor={String(carretasAvaliadas)}
            legenda="com conferência lançada"
          />
          <CartaoHero
            titulo="% de avaria no recebido"
            valor={`${pctAvariaGeral}%`}
            alerta={pctAvariaGeral > 2}
            positivo={pctAvariaGeral > 0 && pctAvariaGeral <= 2}
          />
        </BlocoAtividade>
      </div>

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
