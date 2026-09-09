import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ExportarCsv } from "@/components/ExportarCsv";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoArmazem } from "@/lib/produtividade-armazem-server";
import { podeNoModulo } from "@/lib/require-admin";
import {
  ROTULO_TURNO,
  ROTULO_TURNO_CURTO,
  TURNOS,
  agruparPorEmbalagem,
  agruparPorProduto,
  HORAS_MINIMAS_NO_RANKING,
  calcularPontuacao,
  construirRanking,
  mediaPonderadaPorHoras,
  diaLocalISO,
  diasAtrasISO,
  formatarHoras,
  hojeISO,
  horasAtivasDeOperacao,
  horasEntre,
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
  resumirPorOperador,
  type SessaoUso,
  type TrocaGas,
} from "@/lib/empilhadeira-gas";
import { contagemPorHora, horasPorHora, mediaPorHora } from "@/lib/analise-horaria";
import { CATALOGO_DE_METAS, avaliarMeta, media } from "@/lib/metas";
import { PainelDoAbastecimento } from "@/components/produtividade-armazem/PainelDoAbastecimento";
import type { SessaoAnalise } from "@/lib/abastecimento-analise";
import { avariaPorProduto, pctAvaria as pctAvariaBatePalete } from "@/lib/bate-palete";
import {
  indicadoresDoOperador,
  indicadoresDoSolicitante,
  resumirPeriodo,
  resumirPorTipo,
  type Prioridade,
  type Ressuprimento,
} from "@/lib/ressuprimento";
import {
  TIPO_ABASTECIMENTO,
  ehTipoAbastecimento,
  formatarMinutos as formatarMinutosCurto,
} from "@/lib/abastecimento";
import {
  BarraRanking,
  BlocoAtividade,
  CartaoHero,
  Histograma,
  TermometroDaBombona,
  TopoEFundo,
  type ItemBarra,
} from "./Graficos";
import { FiltroDoTopico, FiltroSolto, SecaoDoTopico, type Pessoa } from "./FiltroDoTopico";
import { desfazerEsvaziamento, esvaziarBombona } from "./actions";
import { BotaoDesfazerEsvaziamento, BotaoEsvaziarBombona } from "./BotaoEsvaziarBombona";

export const dynamic = "force-dynamic";


const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

/** Mesmo texto em todo canto que mostra "Pontuação" -- ver calcularPontuacao
 *  em lib/produtividade-armazem.ts, a fórmula de verdade mora lá. */
const EXPLICACAO_PONTUACAO =
  "Pontuação = média das atividades PONDERADA PELAS HORAS de cada uma: uma atividade pesa o quanto ocupou do dia. Reepack = % da meta por produto; Despejo = % da meta por embalagem; Seleção (un/h) e Picking (HL/h) = % da média do grupo no mesmo recorte, pela TAXA e não pelo total. Quem não fez uma atividade não entra na média dela. Abaixo de 1h apontada no período não há nota — amostra curta não vira ritmo. O 5S aparece na linha mas não entra na nota: as execuções não têm tempo medido, e sem tempo não há como pesá-las.";

/**
 * Os tópicos da tela. O slug é o prefixo dos parâmetros na URL
 * (`banc_t`, `banc_c`) -- ver FiltroDoTopico.
 */
const TOPICOS = {
  bancada: "banc",
  despejo: "desp",
  abastecimento: "abast",
  batePalete: "bp",
  empilhadeira: "emp",
  recebimento: "receb",
  ranking: "rank",
} as const;

export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const texto = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const de = texto(sp.de) || diasAtrasISO(7);
  const ate = texto(sp.ate) || hojeISO();

  // O filtro do topo é o PADRÃO de todos os tópicos; cada bloco pode
  // sobrescrever o seu (`<slug>_t` / `<slug>_c`). Assim o recorte geral
  // continua sendo um clique só, e comparar "manhã aqui, tarde ali" não
  // exige mexer em sete filtros.
  const comoTurno = (v: string) => ((TURNOS as readonly string[]).includes(v) ? (v as Turno) : null);
  const turnoGeral = comoTurno(texto(sp.turno));
  const pessoaGeral = texto(sp.colab);
  /**
   * AUSENTE herda o filtro do topo; PRESENTE manda, mesmo vazio.
   *
   * A diferença não é preciosismo: era o bug do "Todos que não voltava".
   * Antes `""` e "não escolhi" eram a mesma coisa, então com T3 no topo
   * o Todos de um bloco caía de volta em T3 e quem lia ficava preso nele.
   */
  const turnoDe = (slug: string) => {
    const chave = `${slug}_t`;
    return chave in sp ? comoTurno(texto(sp[chave])) : turnoGeral;
  };
  const pessoaDe = (slug: string) => {
    const chave = `${slug}_c`;
    return chave in sp ? texto(sp[chave]) : pessoaGeral;
  };
  /** Uma escolha extra do bloco (tipo, papel...), sem herança do topo. */
  const escolhaDe = (slug: string, chave: string) => texto(sp[`${slug}_${chave}`]);

  /** Papéis do ressuprimento -- os três responsáveis por partes
   *  diferentes do mesmo ciclo. Ver `ehDoPapel`. */
  const PAPEIS_ABASTECIMENTO = [
    { valor: "", nome: "Qualquer papel" },
    { valor: "solicitante", nome: "Solicitante" },
    { valor: "empilhador", nome: "Empilhador (transporte)" },
    { valor: "ajudante", nome: "Ajudante (abastece)" },
  ];
  const TIPOS_ABASTECIMENTO_FILTRO = [
    { valor: "", nome: "Completo e pontual" },
    { valor: "completo", nome: "🔄 Completo" },
    { valor: "pontual", nome: "⚡ Pontual" },
  ];

  const turnoBancada = turnoDe(TOPICOS.bancada);
  const pessoaBancada = pessoaDe(TOPICOS.bancada);
  /** Filtros do gráfico de repack por produto -- ficam colados nele. */
  const familiaBancada = escolhaDe(TOPICOS.bancada, "cl");
  const tipoBancada = escolhaDe(TOPICOS.bancada, "tp");
  const turnoDespejo = turnoDe(TOPICOS.despejo);
  const pessoaDespejo = pessoaDe(TOPICOS.despejo);
  /** Filtro do gráfico de despejo por embalagem -- fica colado nele. */
  const embalagemDespejo = escolhaDe(TOPICOS.despejo, "emb");
  const turnoAbastecimento = turnoDe(TOPICOS.abastecimento);
  const pessoaAbastecimento = pessoaDe(TOPICOS.abastecimento);
  const papelAbastecimento = escolhaDe(TOPICOS.abastecimento, "p");
  const tipoAbastecimento = escolhaDe(TOPICOS.abastecimento, "tipo");
  const turnoBatePalete = turnoDe(TOPICOS.batePalete);
  const pessoaBatePalete = pessoaDe(TOPICOS.batePalete);
  const turnoEmpilhadeira = turnoDe(TOPICOS.empilhadeira);
  const pessoaEmpilhadeira = pessoaDe(TOPICOS.empilhadeira);
  const turnoRecebimento = turnoDe(TOPICOS.recebimento);
  const pessoaRecebimento = pessoaDe(TOPICOS.recebimento);
  const turnoRanking = turnoDe(TOPICOS.ranking);
  const pessoaRanking = pessoaDe(TOPICOS.ranking);

  /** Monta a lista de gente de um bloco a partir do próprio dado do
   *  período -- sem consulta extra, e sem oferecer quem não apareceu. */
  const listaDePessoas = (linhas: { valor: string; nome: string }[]): Pessoa[] => {
    const mapa = new Map<string, string>();
    for (const l of linhas) if (l.valor) mapa.set(l.valor, l.nome);
    return [...mapa.entries()]
      .map(([valor, nome]) => ({ valor, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  };

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
    { data: batePaleteBanco },
    { data: ressuprimentosBanco },
    { data: ultimoEsvaziamentoBanco, error: erroEsvaziamento },
  ] = await Promise.all([
    supabase
      .from("pa_produtos")
      // cluster_produto ("001 - CERVEJA") e tipo (DESCARTAVEL/RETORNAVEL)
      // vêm da planilha de cadastro (migration 060) e estavam parados no
      // banco. São o que permite olhar o repack por FAMÍLIA: garrafa
      // retornável e lata descartável não embalam no mesmo ritmo, e
      // misturá-las numa média só apaga a diferença.
      .select("id, descricao, meta_reepack_hora, cluster_produto, tipo")
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
      .select("id, colaborador_id, colaborador_nome, tipo, turno, inicio, fim, ressuprimento_id, pa_abastecimento_itens(hl_calculado)")
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
        // conferente_* e portaria_* entram para a carreta poder ser
        // recortada por PESSOA: o TMA de quem atendeu é a pergunta que se
        // faz de verdade, e sem essas colunas o filtro do bloco não teria
        // como existir.
        "id, motorista_nome, pa_transportadoras(nome), atendimento_carretas_itens(quantidade, quantidade_avariada), chegada_em, agendamento_em, carga_agendada, inicio_atendimento_em, inicio_descarga_em, fim_descarga_em, inicio_conferencia_em, fim_conferencia_em, tem_carga, inicio_carga_em, fim_carga_em, finalizacao_em, conferente_colaborador_id, conferente_nome, portaria_colaborador_id, portaria_nome",
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
    // Bate palete: o lote batido e quanto dele estava avariado. O
    // percentual sai da soma dos dois -- nunca da media de percentuais,
    // que trataria um lote de 2 HL igual a um de 200.
    supabase
      .from("pa_bate_palete")
      .select("id, colaborador_id, colaborador_nome, turno, inicio, fim, pa_bate_palete_itens(produto_id, paletes, hl_batido, hl_avariado)")
      .eq("revenda_id", revendaId)
      .not("fim", "is", null)
      .gte("inicio", de0)
      .lte("inicio", ate23),
    // Ressuprimento: o pedido, o transporte e o abastecimento. O que
    // interessa aqui não é o volume -- esse já está no bloco do
    // Abastecimento -- é o TEMPO ENTRE os três, que é onde a operação
    // espera e onde nada era medido até 02/09/2026.
    supabase
      .from("pa_ressuprimentos")
      .select(
        // colaborador_id do abastecimento entra para o filtro de AJUDANTE
        // existir: sem ele só dava para recortar por quem pediu ou por
        // quem transportou, e o ajudante é o terceiro do trio.
        "id, criado_em, solicitante_id, solicitante_nome, prioridade, tipo, operador_id, operador_nome, transporte_inicio, cancelado_em, pa_ressuprimento_itens(id, produto_id, unidade, quantidade, hl_calculado, entregue_em), pa_abastecimentos(inicio, fim, colaborador_id, colaborador_nome)",
      )
      .eq("revenda_id", revendaId)
      .gte("criado_em", de0)
      .lte("criado_em", ate23),
    // O último esvaziamento da bombona (migration 110). SEM recorte de
    // data de propósito: a bombona é um recipiente físico, e o que
    // interessa é o último esvaziamento que existe -- pode ser de antes
    // do período que está na tela.
    supabase
      .from("pa_despejo_esvaziamentos")
      .select("id, esvaziada_em, colaborador_nome")
      .eq("revenda_id", revendaId)
      .order("esvaziada_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  /**
   * O nível da bombona AGORA -- litros lançados depois do último
   * esvaziamento, sem recorte de data, turno ou pessoa.
   *
   * É uma consulta em série (precisa da data do esvaziamento para saber
   * de onde somar), e é a única da tela. Devolve só a coluna `litros`, e
   * de um intervalo que costuma ser de dias -- o custo é desprezível
   * perto de manter um saldo guardado em dia com lançamento apagado,
   * editado ou retroativo.
   */
  /**
   * A migration 110 pode ainda não ter rodado (o deploy da Vercel é
   * automático no push; a migração é manual). Sem a tabela, o certo é
   * dizer que o número não existe -- somar o histórico inteiro mostraria
   * uma bombona com dez mil litros, e alguém acreditaria.
   */
  const bombonaDisponivel = !erroEsvaziamento;
  const ultimoEsvaziamento = ultimoEsvaziamentoBanco as
    | { id: string; esvaziada_em: string; colaborador_nome: string }
    | null;
  const consultaBombona = supabase
    .from("pa_despejo_lancamentos")
    .select("litros")
    .eq("revenda_id", revendaId)
    .not("fim", "is", null);
  const { data: litrosNaBombonaBanco } = await (ultimoEsvaziamento
    ? consultaBombona.gte("inicio", ultimoEsvaziamento.esvaziada_em)
    : consultaBombona);
  const litrosNaBombona =
    Math.round(
      ((litrosNaBombonaBanco ?? []) as { litros: number }[]).reduce((s, l) => s + Number(l.litros), 0) * 10,
    ) / 10;

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
      tipo: string;
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
      pa_abastecimentos: {
        inicio: string;
        fim: string | null;
        colaborador_id: string;
        colaborador_nome: string;
      }[];
    }[]
  ).map((l) => {
    const sessao = l.pa_abastecimentos?.[0] ?? null;
    return {
      id: l.id,
      criadoEm: l.criado_em,
      solicitanteId: l.solicitante_id,
      solicitanteNome: l.solicitante_nome,
      prioridade: (l.prioridade === "urgente" ? "urgente" : "normal") as Prioridade,
      tipo: ehTipoAbastecimento(l.tipo) ? l.tipo : "completo",
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

  /**
   * Quem foi o AJUDANTE de cada ressuprimento.
   *
   * Vive fora do objeto `Ressuprimento` porque o tipo de
   * lib/ressuprimento não tem esse campo -- ele guarda o nome, não o id.
   * O id é o que o filtro precisa, então fica aqui num mapa à parte em
   * vez de mudar o contrato da biblioteca por causa de uma tela.
   */
  const ajudanteDoRessuprimento = new Map<string, string>(
    ((ressuprimentosBanco ?? []) as unknown as {
      id: string;
      pa_abastecimentos: { colaborador_id: string }[];
    }[])
      .filter((l) => l.pa_abastecimentos?.[0]?.colaborador_id)
      .map((l) => [l.id, l.pa_abastecimentos[0].colaborador_id]),
  );

  /**
   * O ressuprimento não tem coluna de turno -- ele é um pedido, não um
   * apontamento de turno. O turno sai da HORA DO PEDIDO, com a mesma
   * régua do resto da tela (ver turnoAtual): é o turno que ficou
   * esperando, que é o que o indicador mede.
   *
   * O PAPEL é o filtro que faltava. Uma pessoa aparece aqui de três
   * jeitos -- pediu, transportou (empilhador) ou abasteceu (ajudante) --
   * e os três tempos do ciclo são de responsáveis diferentes. Sem
   * escolher o papel, "espera pela empilhadeira" de uma pessoa misturava
   * o que ela esperou como solicitante com o que ela fez esperar como
   * operador, que são cobranças opostas.
   */
  const ehDoPapel = (r: Ressuprimento) => {
    if (!pessoaAbastecimento) return true;
    const ajudante = ajudanteDoRessuprimento.get(r.id) ?? null;
    switch (papelAbastecimento) {
      case "empilhador":
        return r.operadorId === pessoaAbastecimento;
      case "ajudante":
        return ajudante === pessoaAbastecimento;
      case "solicitante":
        return r.solicitanteId === pessoaAbastecimento;
      default:
        // Qualquer papel: participou de algum jeito.
        return (
          r.solicitanteId === pessoaAbastecimento ||
          r.operadorId === pessoaAbastecimento ||
          ajudante === pessoaAbastecimento
        );
    }
  };

  const ressuprimentosDoRecorte = ressuprimentos.filter((r) => {
    if (turnoAbastecimento && turnoAtual(new Date(r.criadoEm)) !== turnoAbastecimento) return false;
    if (tipoAbastecimento && r.tipo !== tipoAbastecimento) return false;
    return ehDoPapel(r);
  });

  /** Os ressuprimentos que casaram com o recorte -- usado para levar o
   *  mesmo filtro às SESSÕES de abastecimento, que só sabem do ajudante. */
  const idsRessuprimentoDoRecorte = new Set(ressuprimentosDoRecorte.map((r) => r.id));

  // Separado por tipo: uma varredura da manha de 2h e normal, um chamado
  // pontual de 2h e um problema. Somados, o "ciclo medio" nao descreve
  // nenhum dos dois -- e e justamente o numero que alguem usaria para
  // cobrar a pessoa errada.
  const resumoRessuprimento = resumirPeriodo(ressuprimentosDoRecorte);
  const ressuprimentoPorTipo = resumirPorTipo(ressuprimentosDoRecorte);
  const operadoresRessuprimento = indicadoresDoOperador(ressuprimentosDoRecorte);
  const solicitantesRessuprimento = indicadoresDoSolicitante(ressuprimentosDoRecorte);

  const produtos: ProdutoMeta[] = (produtosBanco ?? []).map((p) => ({
    id: p.id,
    descricao: p.descricao,
    metaReepackHora: p.meta_reepack_hora,
  }));

  /**
   * Família e tipo de cada produto -- fora do `ProdutoMeta` porque o
   * tipo da lib não os tem, e mudar o contrato dela por causa de um
   * filtro de tela não se paga.
   *
   * O cluster vem como "001 - CERVEJA"; o código na frente é do SAP e
   * não diz nada para quem lê. Fica só a palavra.
   */
  const familiaDoProduto = new Map<string, string>();
  const tipoDoProduto = new Map<string, string>();
  for (const p of (produtosBanco ?? []) as {
    id: string;
    cluster_produto: string | null;
    tipo: string | null;
  }[]) {
    const familia = (p.cluster_produto ?? "").replace(/^\s*\d+\s*-\s*/, "").trim();
    if (familia) familiaDoProduto.set(p.id, familia);
    if (p.tipo) tipoDoProduto.set(p.id, p.tipo);
  }
  const familiasDisponiveis = [...new Set(familiaDoProduto.values())].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const temTipoCadastrado = tipoDoProduto.size > 0;
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
  const pickingsBrutos = (pickingsBanco ?? []) as {
    id: string;
    colaborador_id: string;
    colaborador_nome: string;
    tipo: string;
    turno: string;
    inicio: string;
    fim: string;
    ressuprimento_id: string | null;
    pa_abastecimento_itens: { hl_calculado: number }[] | null;
  }[];

  const pickingsTodos = pickingsBrutos.map((s) => ({
    id: s.id,
    colaborador_id: s.colaborador_id,
    colaborador_nome: s.colaborador_nome,
    turno: s.turno,
    // `tipo` e `ressuprimento_id` vêm junto para o bloco poder recortar
    // por completo/pontual e por papel: a sessão só conhece o AJUDANTE,
    // e quem transportou está do outro lado do ressuprimento.
    tipo: s.tipo,
    ressuprimentoId: s.ressuprimento_id,
    inicio: s.inicio,
    fim: s.fim,
    hl: Math.round((s.pa_abastecimento_itens ?? []).reduce((t, i) => t + i.hl_calculado, 0) * 1000) / 1000,
  }));

  /**
   * A sessão de abastecimento no recorte do bloco.
   *
   * A sessão só conhece o AJUDANTE (é quem a abre). Quando o papel
   * escolhido é o empilhador ou o solicitante, a pessoa está do outro
   * lado do ressuprimento -- então a sessão entra pelo VÍNCULO com o
   * pedido, não pelo próprio `colaborador_id`. Sessão avulsa (sem
   * ressuprimento) não tem esse vínculo e fica de fora nesses dois
   * papéis, o que é correto: ninguém transportou nem pediu nada nela.
   */
  const sessaoNoRecorte = (s: (typeof pickingsTodos)[number]) => {
    if (turnoAbastecimento && s.turno !== turnoAbastecimento) return false;
    if (tipoAbastecimento && s.tipo !== tipoAbastecimento) return false;
    if (!pessoaAbastecimento) return true;
    const doPedido = Boolean(s.ressuprimentoId && idsRessuprimentoDoRecorte.has(s.ressuprimentoId));
    if (papelAbastecimento === "ajudante") return s.colaborador_id === pessoaAbastecimento;
    if (papelAbastecimento === "empilhador" || papelAbastecimento === "solicitante") return doPedido;
    return s.colaborador_id === pessoaAbastecimento || doPedido;
  };
  const pickings = pickingsTodos.filter(sessaoNoRecorte);
  const idsSessoesDoRecorte = new Set(pickings.map((s) => s.id));

  /**
   * O painel do Abastecimento, que morava na tela de quem executa.
   *
   * Veio para cá em 03/09/2026, a pedido do dono: dashboard mora em um
   * lugar só. A tela de lançamento ficou com Lançar e Histórico -- o que
   * a pessoa FAZ; o que se ACOMPANHA é aqui.
   */
  const abastecimentoParaAnalise: SessaoAnalise[] = pickingsBrutos
    .filter((s) => idsSessoesDoRecorte.has(s.id))
    .map((s) => ({
      id: s.id,
      colaboradorId: s.colaborador_id,
      colaboradorNome: s.colaborador_nome,
      tipo: s.tipo,
      turno: s.turno,
      inicio: s.inicio,
      fim: s.fim,
      deSolicitacao: Boolean(s.ressuprimento_id),
      hl: (s.pa_abastecimento_itens ?? []).reduce((t, i) => t + i.hl_calculado, 0),
      itens: (s.pa_abastecimento_itens ?? []).length,
    }));

  /** Bate palete: os lotes do período, com o produto de cada um. */
  const batePaleteTodos = (batePaleteBanco ?? []) as {
    id: string;
    colaborador_id: string;
    colaborador_nome: string;
    turno: string;
    inicio: string;
    fim: string;
    pa_bate_palete_itens: { produto_id: string; paletes: number; hl_batido: number; hl_avariado: number }[] | null;
  }[];

  const batePaleteBruto = batePaleteTodos.filter(
    (s) =>
      (!turnoBatePalete || s.turno === turnoBatePalete) &&
      (!pessoaBatePalete || s.colaborador_id === pessoaBatePalete),
  );

  const lotesBatidos = batePaleteBruto.flatMap((s) =>
    (s.pa_bate_palete_itens ?? []).map((i) => ({
      produtoId: i.produto_id,
      paletes: Number(i.paletes),
      hlBatido: Number(i.hl_batido),
      hlAvariado: Number(i.hl_avariado),
    })),
  );

  const batePaleteHl = lotesBatidos.reduce((s, i) => s + i.hlBatido, 0);
  const batePaleteAvariado = lotesBatidos.reduce((s, i) => s + i.hlAvariado, 0);
  const batePalatePctAvaria = pctAvariaBatePalete(batePaleteHl, batePaleteAvariado);
  const avariaDosProdutos = avariaPorProduto(lotesBatidos);
  // 5S não tem coluna de turno (é uma execução, não um lançamento por
  // turno) -- infere pelo horário real de início, com a mesma régua que
  // decide o turno "agora" (ver turnoAtual em lib/produtividade-armazem).
  const execucoes5sTodos = (execucoes5sBanco ?? []).map((e) => ({
    colaborador_id: e.responsavel_id as string,
    colaborador_nome: e.responsavel_nome as string,
    turno: turnoAtual(new Date(e.inicio as string)) as string,
  }));

  /**
   * O recorte de CADA tópico.
   *
   * Até 09/09/2026 havia um recorte só, do filtro do topo, e vários
   * blocos simplesmente o ignoravam. Agora o filtro é por tópico e a
   * regra é a mesma em todos: turno (quando o dado tem turno) e pessoa.
   */
  const recorte = <T extends { turno: string; colaborador_id: string }>(
    linhas: T[],
    turno: Turno | null,
    pessoa: string,
  ) => linhas.filter((l) => (!turno || l.turno === turno) && (!pessoa || l.colaborador_id === pessoa));

  // Bancada = Seleção + Repack: as duas etapas do mesmo ciclo, um filtro só.
  const selecoes = recorte(selecoesTodas, turnoBancada, pessoaBancada);
  const reepacks = recorte(reepacksTodos, turnoBancada, pessoaBancada);
  const despejos = recorte(despejosTodos, turnoDespejo, pessoaDespejo);

  // O ranking e a tabela por turno têm recorte próprio: quem compara
  // pessoas não quer o filtro da bancada mandando no ranking inteiro.
  const selecoesRank = recorte(selecoesTodas, turnoRanking, pessoaRanking);
  const reepacksRank = recorte(reepacksTodos, turnoRanking, pessoaRanking);
  const despejosRank = recorte(despejosTodos, turnoRanking, pessoaRanking);
  const pickingsRank = recorte(pickingsTodos, turnoRanking, pessoaRanking);
  const execucoes5sRank = execucoes5sTodos.filter(
    (e) =>
      (!turnoRanking || e.turno === turnoRanking) &&
      (!pessoaRanking || e.colaborador_id === pessoaRanking),
  );

  // A tabela "Atividade por turno" quebra por turno na própria linha --
  // então ela só honra o filtro de PESSOA; aplicar turno nela deixaria
  // duas linhas zeradas e uma cheia, que não compara nada.
  const porPessoaRank = <T extends { colaborador_id: string }>(linhas: T[]) =>
    pessoaRanking ? linhas.filter((l) => l.colaborador_id === pessoaRanking) : linhas;
  const selecoesTabela = porPessoaRank(selecoesTodas);
  const reepacksTabela = porPessoaRank(reepacksTodos);
  const despejosTabela = porPessoaRank(despejosTodos);
  const pickingsTabela = porPessoaRank(pickingsTodos);
  const execucoes5sTabela = porPessoaRank(execucoes5sTodos);

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

  /**
   * Repack por produto -- só dos produtos que passam no filtro de
   * família/tipo do gráfico.
   *
   * O recorte fica aqui e não no filtro do bloco de propósito: os
   * cartões de tempo de bancada continuam mostrando o dia inteiro (a
   * bancada não para para trocar de família), e só a comparação entre
   * produtos é recortada -- que é o único lugar onde a família muda a
   * leitura.
   */
  const produtoNoRecorte = (produtoId: string) =>
    (!familiaBancada || familiaDoProduto.get(produtoId) === familiaBancada) &&
    (!tipoBancada || tipoDoProduto.get(produtoId) === tipoBancada);

  const reepackPorProduto = agruparPorProduto(
    reepacks
      .filter((r) => produtoNoRecorte(r.produto_id ?? ""))
      .map((r) => ({ produtoId: r.produto_id ?? "", quantidade: r.quantidade, inicio: r.inicio, fim: r.fim })),
    produtos,
    (p) => p.metaReepackHora,
  )
    // Da MAIOR produtividade para a menor. A lib não garante ordem, e
    // sem isto a lista saía na ordem em que os produtos apareceram no
    // período -- que não é ordem nenhuma.
    .sort((a, b) => b.taxa - a.taxa);

  const barrasReepackProduto: ItemBarra[] = reepackPorProduto.map((l) => ({
    rotulo: l.produtoDescricao,
    valor: l.taxa,
    detalhe: `${l.produtoDescricao}: ${l.quantidade} cx em ${l.horas}h${
      l.pctMeta !== null ? ` — ${l.pctMeta}% da meta` : ""
    }${familiaDoProduto.get(l.produtoId) ? ` · ${familiaDoProduto.get(l.produtoId)}` : ""}${
      tipoDoProduto.get(l.produtoId) ? ` · ${tipoDoProduto.get(l.produtoId)}` : ""
    }`,
  }));

  const despejoPorEmbalagem = agruparPorEmbalagem(
    despejos
      .filter((d) => !embalagemDespejo || d.embalagem_despejo_id === embalagemDespejo)
      .map((d) => ({ embalagemId: d.embalagem_despejo_id ?? "", quantidade: d.litros, inicio: d.inicio, fim: d.fim })),
    embalagens,
    (e) => e.metaLitrosHora,
  ).sort((a, b) => b.taxa - a.taxa);

  const barrasDespejoEmbalagem: ItemBarra[] = despejoPorEmbalagem.map((l) => ({
    rotulo: l.embalagemNome,
    valor: l.taxa,
    detalhe: `${l.embalagemNome}: ${l.quantidade} L em ${l.horas}h${
      l.pctMeta !== null ? ` — ${l.pctMeta}% da meta` : ""
    }`,
  }));

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
    .map(([, v]) => ({
      rotulo: v.nome,
      valor: Math.round(v.litros * 10) / 10,
      detalhe: `${v.nome}: ${formatarNumeroBr(v.litros, 1)} L no recorte`,
    }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10);

  // Litros por TURNO. A barra quebra por turno na própria linha, então
  // ela honra só o recorte de pessoa -- filtrar por turno aqui deixaria
  // duas barras zeradas e uma cheia, que não compara nada.
  const despejoPorTurno = TURNOS.map((t) => {
    const doTurno = despejosTodos.filter(
      (d) => d.turno === t && (!pessoaDespejo || d.colaborador_id === pessoaDespejo),
    );
    const litros = Math.round(doTurno.reduce((s, d) => s + d.litros, 0) * 10) / 10;
    const horas = doTurno.reduce((s, d) => s + horasEntre(d.inicio, d.fim), 0);
    return {
      rotulo: ROTULO_TURNO_CURTO[t],
      valor: litros,
      detalhe: `${ROTULO_TURNO_CURTO[t]}: ${formatarNumeroBr(litros, 1)} L em ${
        Math.round(horas * 10) / 10
      }h · ${doTurno.length} lançamento(s) · ${formatarNumeroBr(taxaPorHora(litros, horas), 1)} L/h`,
    };
    // Do maior para o menor, como todas as outras listas da tela. Na
    // ordem cronológica (T1, T2, T3) a barra mais alta podia estar no
    // meio, e "qual turno despeja mais" exigia comparar de olho.
  }).sort((a, b) => b.valor - a.valor);

  // ---- Atividade por turno ----
  // Uma linha por turno, uma coluna por atividade -- a métrica de cada
  // coluna é a que faz sentido pra atividade (caixas, litros, HL,
  // execuções), e "Total" é a contagem de lançamentos somada (unidades
  // diferentes não dá pra somar direto).
  // Referência do grupo pra picking e 5S (ver pctRelativoAoGrupo): a
  // média de TODO o período, todos os turnos juntos -- é contra isso que
  // cada turno é comparado, não meta cadastrada (picking/5S não têm).
  const mediaHlPickingPeriodo = mediaHlPicking(
    pickingsTabela.map((p) => ({ quantidade: p.hl, inicio: p.inicio, fim: p.fim })),
  );
  // Seleção compara TAXA (un/h), não total: um turno mais longo não é
  // melhor por ter triado mais, e sim quem triou mais rápido.
  const mediaTaxaSelecaoPeriodo = mediaTaxaPorPessoa(selecoesTabela);

  const porTurno = TURNOS.map((t) => {
    const reepacksT = reepacksTabela.filter((r) => r.turno === t);
    const selecoesT = selecoesTabela.filter((s) => s.turno === t);
    const despejosT = despejosTabela.filter((d) => d.turno === t);
    const pickingsT = pickingsTabela.filter((p) => p.turno === t);
    const execucoes5sT = execucoes5sTabela.filter((e) => e.turno === t);

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
    // O 5S NÃO tem parcela na nota do turno -- ele não tem tempo medido,
    // e sem tempo não há como pesá-lo junto das outras (ver
    // EXPLICACAO_PONTUACAO). Aqui existia um `cincoSPctT` calculado e
    // jogado fora, que dava a impressão de que o 5S pontuava.
    const selecaoPctT = pctRelativoAoGrupo(mediaTaxaPorPessoa(selecoesT), mediaTaxaSelecaoPeriodo);
    // Ponderado pelas horas do turno, igual à nota individual: um turno
    // que gastou 6h em despejo e 10 min em picking não pode ter as duas
    // parcelas pesando o mesmo.
    const horasReepackT = reepacksT.reduce((s, r) => s + horasEntre(r.inicio, r.fim), 0);
    const horasDespejoT = despejosT.reduce((s, d) => s + horasEntre(d.inicio, d.fim), 0);
    const horasPickingT = pickingsT.reduce((s, p) => s + horasEntre(p.inicio, p.fim), 0);
    const horasSelecaoT = selecoesT.reduce((s, x) => s + horasEntre(x.inicio, x.fim), 0);
    const pontuacao = calcularPontuacao([
      {
        pct: mediaPonderadaPorHoras(reepackAgrupadoT.map((r) => ({ pct: r.pctMeta, horas: r.horas }))),
        horas: horasReepackT,
      },
      {
        pct: mediaPonderadaPorHoras(despejoAgrupadoT.map((d) => ({ pct: d.pctMeta, horas: d.horas }))),
        horas: horasDespejoT,
      },
      { pct: pickingPctT, horas: horasPickingT },
      { pct: selecaoPctT, horas: horasSelecaoT },
    ]);


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
    reepacksTabela.map((r) => ({ produtoId: r.produto_id ?? "", quantidade: r.quantidade, inicio: r.inicio, fim: r.fim })),
    produtos,
    (p) => p.metaReepackHora,
  );
  const despejoAgrupadoGeral = agruparPorEmbalagem(
    despejosTabela.map((d) => ({ embalagemId: d.embalagem_despejo_id ?? "", quantidade: d.litros, inicio: d.inicio, fim: d.fim })),
    embalagens,
    (e) => e.metaLitrosHora,
  );
  const horasReepackGeral = reepacksTabela.reduce((s, r) => s + horasEntre(r.inicio, r.fim), 0);
  const horasDespejoGeral = despejosTabela.reduce((s, d) => s + horasEntre(d.inicio, d.fim), 0);
  const horasPickingGeral = pickingsTabela.reduce((s, p) => s + horasEntre(p.inicio, p.fim), 0);
  const horasSelecaoGeral = selecoesTabela.reduce((s, x) => s + horasEntre(x.inicio, x.fim), 0);
  const pontuacaoGeral = calcularPontuacao([
    {
      pct: mediaPonderadaPorHoras(reepackAgrupadoGeral.map((r) => ({ pct: r.pctMeta, horas: r.horas }))),
      horas: horasReepackGeral,
    },
    {
      pct: mediaPonderadaPorHoras(despejoAgrupadoGeral.map((d) => ({ pct: d.pctMeta, horas: d.horas }))),
      horas: horasDespejoGeral,
    },
    { pct: pctRelativoAoGrupo(mediaHlPickingPeriodo, mediaHlPickingPeriodo), horas: horasPickingGeral },
    { pct: pctRelativoAoGrupo(mediaTaxaSelecaoPeriodo, mediaTaxaSelecaoPeriodo), horas: horasSelecaoGeral },
  ]);

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
  const operacoesTodas = (operacoesBanco ?? []) as unknown as (Parameters<typeof operacaoEmpilhadeiraDeLinha>[0] & {
    pa_empilhadeiras: { numero: string } | { numero: string }[] | null;
  })[];
  // A operação de empilhadeira não tem coluna de turno -- ela é aberta e
  // fechada por horímetro, não apontada por turno. O turno sai da HORA
  // EM QUE A OPERAÇÃO COMEÇOU, mesma régua do 5S e do ressuprimento.
  const operacoesRaw = operacoesTodas.filter(
    (o) =>
      (!turnoEmpilhadeira || turnoAtual(new Date(o.inicio)) === turnoEmpilhadeira) &&
      (!pessoaEmpilhadeira || o.operador_id === pessoaEmpilhadeira),
  );
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
  /**
   * O recorte do recebimento.
   *
   * Este é o bloco que motivou a mudança de 09/09/2026: o TMA sempre
   * mostrava o geral, mesmo com um turno escolhido no topo. A carreta
   * não tem coluna de turno, então ele é DERIVADO do momento em que a
   * operação assumiu a carreta (`inicio_atendimento_em`); sem atendimento
   * ainda, vale a chegada na portaria. É o turno que trabalhou a carreta,
   * que é do que o TMA fala.
   *
   * Por pessoa vale quem PARTICIPOU -- o conferente ou a portaria --,
   * pelo mesmo motivo do ressuprimento: as duas pontas fazem o tempo.
   */
  const recebimentosDoRecorte = ((recebimentosBanco ?? []) as Record<string, unknown>[]).filter((a) => {
    if (turnoRecebimento) {
      const referencia = (a.inicio_atendimento_em as string) ?? (a.chegada_em as string);
      if (!referencia || turnoAtual(new Date(referencia)) !== turnoRecebimento) return false;
    }
    if (
      pessoaRecebimento &&
      a.conferente_colaborador_id !== pessoaRecebimento &&
      a.portaria_colaborador_id !== pessoaRecebimento
    )
      return false;
    return true;
  });

  const carretas = recebimentosDoRecorte as unknown as CarretaAvaria[];

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
  const atendimentos: AtendimentoCarreta[] = recebimentosDoRecorte.map(
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
  /**
   * A carreta com TUDO junto: os tempos calculados e quem/o quê estava
   * envolvido.
   *
   * `atendimentos` (acima) é o formato puro de lib/carretas e não sabe
   * de gente nem de transportadora -- e é exatamente por gente e por
   * transportadora que a operação quer olhar o TMA. Um TMA médio de 95
   * min não diz nada; "95 min, e a transportadora X faz 160" diz onde
   * mexer.
   */
  const carretasDetalhadas = recebimentosDoRecorte.map((a, i) => {
    const t = a.pa_transportadoras as { nome: string } | { nome: string }[] | null;
    const itens = ((a.atendimento_carretas_itens ?? []) as ItemCarreta[]) ?? [];
    const referencia = (a.inicio_atendimento_em as string) ?? (a.chegada_em as string);
    return {
      chegadaEm: a.chegada_em as string,
      conferente: (a.conferente_nome as string) || "— sem conferente",
      portaria: (a.portaria_nome as string) || "— sem portaria",
      motorista: (a.motorista_nome as string) || "— sem motorista",
      transportadora: (Array.isArray(t) ? t[0] : t)?.nome ?? "—",
      turno: referencia ? turnoAtual(new Date(referencia)) : null,
      tma: calcularTmaMinutos(atendimentos[i]),
      espera: calcularEsperaPortariaMinutos(atendimentos[i]),
      recebido: itens.reduce((s, x) => s + x.quantidade, 0),
      avariado: itens.reduce((s, x) => s + (x.quantidade_avariada ?? 0), 0),
      temItens: itens.length > 0,
    };
  });

  /**
   * Média de um número por chave, ignorando quem não tem o número.
   *
   * Contar como zero quem não teve TMA medido faria a pessoa (ou a
   * transportadora) parecer a mais rápida da casa por não ter dado.
   */
  const mediaPorChave = <T,>(
    linhas: T[],
    chave: (l: T) => string,
    valor: (l: T) => number | null,
  ) => {
    const acc = new Map<string, { soma: number; n: number }>();
    for (const l of linhas) {
      const v = valor(l);
      if (v === null || !Number.isFinite(v)) continue;
      const k = chave(l);
      const a = acc.get(k) ?? { soma: 0, n: 0 };
      a.soma += v;
      a.n += 1;
      acc.set(k, a);
    }
    return [...acc.entries()].map(([k, a]) => ({
      chave: k,
      media: Math.round(a.soma / a.n),
      n: a.n,
    }));
  };

  const barraDeTma = (
    linhas: { chave: string; media: number; n: number }[],
    unidade = "carreta(s)",
  ): ItemBarra[] =>
    linhas
      .map((l) => ({
        rotulo: l.chave,
        valor: l.media,
        detalhe: `${l.chave}: ${formatarMinutos(l.media)} em média · ${l.n} ${unidade}`,
      }))
      // Do mais LENTO para o mais rápido: a lista existe para achar onde
      // o tempo está sendo perdido, e isso mora no topo.
      .sort((a, b) => b.valor - a.valor);

  const tmaPorConferente = barraDeTma(
    mediaPorChave(carretasDetalhadas, (c) => c.conferente, (c) => c.tma),
  );
  const tmaPorPortaria = barraDeTma(
    mediaPorChave(carretasDetalhadas, (c) => c.portaria, (c) => c.tma),
  );
  const tmaPorTransportadora = barraDeTma(
    mediaPorChave(carretasDetalhadas, (c) => c.transportadora, (c) => c.tma),
  );
  const tmaPorMotorista = barraDeTma(
    mediaPorChave(carretasDetalhadas, (c) => c.motorista, (c) => c.tma),
  ).slice(0, 12);
  // O turno vira barra e não segue o filtro de turno do bloco -- ele é a
  // própria barra. Segue o de pessoa, como as outras quebras da tela.
  const tmaPorTurno: ItemBarra[] = TURNOS.map((t) => {
    const doTurno = carretasDetalhadas.filter((c) => c.turno === t);
    const m = media(doTurno.map((c) => c.tma));
    return {
      rotulo: ROTULO_TURNO_CURTO[t],
      valor: m === null ? 0 : Math.round(m),
      detalhe:
        m === null
          ? `${ROTULO_TURNO_CURTO[t]}: nenhuma carreta com TMA medido`
          : `${ROTULO_TURNO_CURTO[t]}: ${formatarMinutos(Math.round(m))} em média · ${doTurno.length} carreta(s)`,
    };
  });

  /** Chegadas por hora do dia: a fila é feita aqui, não na descarga. */
  const chegadasPorHora = contagemPorHora(carretasDetalhadas.map((c) => c.chegadaEm));
  /** E o TMA de cada hora de chegada -- onde a fila vira tempo perdido. */
  const tmaPorHoraDeChegada = mediaPorHora(
    carretasDetalhadas.map((c) => ({ instante: c.chegadaEm, valor: c.tma })),
  );

  /**
   * Avaria por motorista, do pior para o melhor.
   *
   * Mesma régua do percentual geral: soma de avariado sobre soma de
   * recebido, nunca a média dos percentuais -- que trataria uma carreta
   * de 2 paletes igual a uma de 200.
   */
  const avariaPorChave = (chave: (c: (typeof carretasDetalhadas)[number]) => string) => {
    const acc = new Map<string, { recebido: number; avariado: number; carretas: number }>();
    for (const c of carretasDetalhadas) {
      if (!c.temItens) continue;
      const k = chave(c);
      const a = acc.get(k) ?? { recebido: 0, avariado: 0, carretas: 0 };
      a.recebido += c.recebido;
      a.avariado += c.avariado;
      a.carretas += 1;
      acc.set(k, a);
    }
    return [...acc.entries()]
      .filter(([, v]) => v.recebido > 0)
      .map(([nome, v]) => ({
        rotulo: nome,
        valor: Math.round((v.avariado / v.recebido) * 1000) / 10,
        detalhe: `${nome}: ${v.avariado} de ${v.recebido} paletes · ${v.carretas} carreta(s) conferida(s)`,
      }))
      .sort((a, b) => b.valor - a.valor);
  };
  const avariaPorMotorista = avariaPorChave((c) => c.motorista).slice(0, 12);

  /**
   * A cauda do TMA, não só a média.
   *
   * A média é o número que se cobra; o P90 é o que a transportadora
   * sente. Vinte carretas em 60 min e duas em 300 dão uma média de 82
   * que ninguém reconhece -- e são as duas de 300 que geram a
   * reclamação e a multa de estadia.
   */
  const tmasOrdenados = carretasDetalhadas
    .map((c) => c.tma)
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);
  const percentil = (p: number) =>
    tmasOrdenados.length === 0
      ? null
      : tmasOrdenados[Math.min(tmasOrdenados.length - 1, Math.floor((p / 100) * tmasOrdenados.length))];
  const tmaMediana = percentil(50);
  const tmaP90 = percentil(90);

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

  /**
   * Quantas carretas bateram a meta, e não só se a MÉDIA bateu.
   *
   * São perguntas diferentes: dá para a média bater com metade das
   * carretas estourando, desde que a outra metade seja muito rápida. O
   * percentual é o que a operação sente; a média é o que o relatório diz.
   */
  const dentroDaMeta = tmasOrdenados.filter((t) => t <= metaTma).length;
  const pctDentroDaMeta =
    tmasOrdenados.length === 0 ? null : Math.round((dentroDaMeta / tmasOrdenados.length) * 100);

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
  //
  // Estes números NÃO seguem o filtro do bloco, e isso está escrito no
  // cartão. Um ciclo de botijão atravessa turnos e operadores: recortar
  // as sessões antes de montá-lo tiraria horas do meio do ciclo e faria
  // "quanto rende um P20" render mais do que rende de verdade. Melhor um
  // número honesto sem recorte do que um recortado e errado.
  const operacoesTodasLidas = operacoesTodas.map((o) => operacaoEmpilhadeiraDeLinha(o));
  const operacoesTodasEncerradas = operacoesTodasLidas.filter((op) => op.horimetroFinal !== null);
  const numeroDaMaquina = new Map<string, string>();
  for (const op of operacoesTodasLidas) {
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
  const sessoesParaGas: SessaoUso[] = operacoesTodasEncerradas.map((op) => ({
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
  /**
   * Consumo por OPERADOR -- horas por P20 de cada um.
   *
   * O motor já existia (o dashboard de gás usa o mesmo `resumirPorOperador`);
   * o que faltava era ele aparecer aqui, ao lado das horas. "João rodou
   * 40h" não diz nada sozinho: 40h com 2 botijões e 40h com 5 são duas
   * operações diferentes, e a segunda é dinheiro saindo.
   *
   * Só ciclos com sessão entram (ver cicloContaParaOperador) -- consumo
   * sem ninguém apontado não vira cobrança de ninguém.
   */
  const custoP20 = empilhadeiraConfig?.custo_p20 ?? null;
  const consumoPorOperadorTodos = resumirPorOperador(ciclosDoPeriodo);
  const consumoPorOperador = pessoaEmpilhadeira
    ? consumoPorOperadorTodos.filter((o) => o.operadorId === pessoaEmpilhadeira)
    : consumoPorOperadorTodos;

  // A referência para dizer se alguém está gastando acima da conta é a
  // média da CASA no mesmo período, não um número escrito aqui.
  const horasPorP20DaCasa = mediaHorasPorP20;
  const barrasConsumoOperador: ItemBarra[] = consumoPorOperador
    .filter((o) => o.horasPorP20 !== null)
    .map((o) => ({
      rotulo: o.operadorNome,
      valor: o.horasPorP20 as number,
      detalhe: `${o.operadorNome}: ${formatarNumeroBr(o.horasPorP20 ?? 0)}h por P20 · ${
        formatarNumeroBr(o.horas, 1)
      }h em ${formatarNumeroBr(o.p20Equivalente, 2)} botijões${
        horasPorP20DaCasa
          ? ` · casa: ${formatarNumeroBr(horasPorP20DaCasa)}h/P20`
          : ""
      }`,
    }))
    .sort((a, b) => b.valor - a.valor);

  /** Quanto cada operador queimou de gás, em R$ -- quando há custo cadastrado. */
  const barrasCustoOperador: ItemBarra[] =
    custoP20 === null
      ? []
      : consumoPorOperador
          .map((o) => ({
            rotulo: o.operadorNome,
            valor: Math.round(o.p20Equivalente * custoP20 * 100) / 100,
            detalhe: `${o.operadorNome}: ${formatarNumeroBr(o.p20Equivalente, 2)} botijões · ${
              o.pctDoConsumo
            }% do consumo do período`,
          }))
          .sort((a, b) => b.valor - a.valor);

  /**
   * O perfil de uso por hora do dia.
   *
   * É a análise que muda escala: a empilhadeira parada das 13h às 15h e
   * disputada das 6h às 9h é o mesmo total diário de duas operações
   * completamente diferentes. Sem isto, "faltou empilhadeira" e "sobrou
   * empilhadeira" eram a mesma média.
   *
   * O que se distribui é a HORA DE HORÍMETRO, não o tempo de relógio da
   * operação. A primeira versão distribuía o relógio, e o gráfico
   * respondia "quando a máquina esteve atribuída a alguém" fingindo
   * responder "quando ela foi usada": quem abre às 6h e fecha às 15h
   * pintava nove horas de uso tendo rodado três. O total do gráfico
   * agora fecha com o cartão "Horas ativas".
   *
   * A contrapartida está declarada na legenda do gráfico: como não há
   * carimbo de quando o motor ligou e desligou dentro da operação, as
   * horas de horímetro são espalhadas por igual ao longo dela.
   */
  const usoEmpilhadeiraPorHora = horasPorHora(
    operacoesRaw
      .filter((o) => o.horimetro_final !== null)
      .map((o) => ({
        inicio: o.inicio,
        fim: o.fim,
        peso: horasAtivasDeOperacao(operacaoEmpilhadeiraDeLinha(o)),
      })),
  );

  /**
   * Operação fechada por OUTRA pessoa.
   *
   * Não é produtividade, é qualidade do apontamento: quando o líder
   * fecha a operação no dia seguinte, o horímetro final é o que ele
   * achou na máquina, e todo o consumo do intervalo vai para quem abriu.
   * O número existe para dizer o quanto dos indicadores acima merece
   * confiança.
   */
  const encerradasPorTerceiro = operacoesRaw.filter(
    (o) => o.horimetro_final !== null && o.encerrado_por_nome && o.encerrado_por_nome !== o.operador_nome,
  ).length;

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
  // Recorte próprio (`rank_t` / `rank_c`): o ranking é a comparação entre
  // pessoas, e não faz sentido ele obedecer ao filtro que alguém pôs no
  // bloco da bancada para investigar outra coisa.
  const ranking = construirRanking(
    reepacksRank.map((r) => ({
      colaboradorId: r.colaborador_id,
      colaboradorNome: r.colaborador_nome,
      produtoId: r.produto_id ?? "",
      quantidade: r.quantidade,
      inicio: r.inicio,
      fim: r.fim,
    })),
    despejosRank.map((d) => ({
      colaboradorId: d.colaborador_id,
      colaboradorNome: d.colaborador_nome,
      embalagemId: d.embalagem_despejo_id ?? "",
      litros: d.litros,
      inicio: d.inicio,
      fim: d.fim,
    })),
    pickingsRank.map((p) => ({
      colaboradorId: p.colaborador_id,
      colaboradorNome: p.colaborador_nome,
      quantidade: p.hl,
      inicio: p.inicio,
      fim: p.fim,
    })),
    execucoes5sRank.map((e) => ({ colaboradorId: e.colaborador_id, colaboradorNome: e.colaborador_nome })),
    produtos,
    embalagens,
    selecoesRank.map((s) => ({
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
    // As horas apontadas faltavam na planilha, e são o desempate do
    // ranking e a coluna que está na tela. Sem elas ninguém reproduz a
    // ordem da lista fora do app.
    r.horasApontadas,
  ]);

  // ---- As listas de gente de cada filtro ----
  // Montadas do próprio dado do período: quem não apareceu não vira
  // opção, e escolher alguém nunca devolve uma tela vazia sem motivo.
  const comoPessoa = (l: { colaborador_id: string; colaborador_nome: string }) => ({
    valor: l.colaborador_id,
    nome: l.colaborador_nome,
  });
  const pessoasBancada = listaDePessoas([...selecoesTodas, ...reepacksTodos].map(comoPessoa));
  const pessoasDespejo = listaDePessoas(despejosTodos.map(comoPessoa));
  const pessoasAbastecimento = listaDePessoas([
    ...pickingsTodos.map(comoPessoa),
    ...ressuprimentos.map((r) => ({ valor: r.solicitanteId, nome: r.solicitanteNome })),
    ...ressuprimentos
      .filter((r) => r.operadorId && r.operadorNome)
      .map((r) => ({ valor: r.operadorId as string, nome: r.operadorNome as string })),
  ]);
  const pessoasBatePalete = listaDePessoas(batePaleteTodos.map(comoPessoa));
  const pessoasEmpilhadeira = listaDePessoas(
    operacoesTodas.map((o) => ({ valor: o.operador_id, nome: o.operador_nome })),
  );
  const pessoasRecebimento = listaDePessoas(
    ((recebimentosBanco ?? []) as Record<string, unknown>[]).flatMap((a) =>
      [
        { valor: (a.conferente_colaborador_id as string) ?? "", nome: (a.conferente_nome as string) ?? "" },
        { valor: (a.portaria_colaborador_id as string) ?? "", nome: (a.portaria_nome as string) ?? "" },
      ].filter((p) => p.valor && p.nome),
    ),
  );
  /** O recorte em vigor por extenso -- vai escrito em cima de cada bloco. */
  const descreverRecorte = (turno: Turno | null, pessoa: string, pessoas: Pessoa[]) => {
    const nome = pessoas.find((p) => p.valor === pessoa)?.nome;
    // Escolhida no filtro do topo, a pessoa pode não ter nada NESTE
    // bloco. Dizer "todos os colaboradores" ali seria mentira: o bloco
    // está vazio porque está recortado, não porque ninguém trabalhou.
    const quem = pessoa
      ? (nome ?? "uma pessoa sem lançamento neste bloco")
      : "todos os colaboradores";
    return [turno ? ROTULO_TURNO_CURTO[turno] : "todos os turnos", quem].join(" · ");
  };

  const pessoasRanking = listaDePessoas(
    [...selecoesTodas, ...reepacksTodos, ...despejosTodos, ...pickingsTodos, ...execucoes5sTodos].map(comoPessoa),
  );
  /** Todo mundo que apareceu em qualquer bloco -- é a lista do filtro do topo. */
  const pessoasGeral = listaDePessoas(
    [
      ...pessoasRanking,
      ...pessoasAbastecimento,
      ...pessoasBatePalete,
      ...pessoasEmpilhadeira,
      ...pessoasRecebimento,
    ].map((p) => ({ valor: p.valor, nome: p.nome })),
  );

  return (
    <div>
      <PageHeader
        title="Indicadores e Ranking"
        subtitle="Produtividade do Armazém no período."
        fecharHref="/produtividade-armazem"
      />

      {/* ---- FILTRO GERAL ----
          Período vale para a tela inteira (é o que a consulta ao banco
          usa). Turno e colaborador aqui são o PADRÃO de todos os blocos:
          aplicar limpa os recortes individuais, senão o filtro do topo
          pareceria não funcionar em quem tinha recorte próprio. */}
      <form method="get" className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
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
            <select id="turno" name="turno" defaultValue={turnoGeral ?? ""} className={campo}>
              <option value="">Todos</option>
              {TURNOS.map((t) => (
                <option key={t} value={t}>{ROTULO_TURNO[t]}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className={rotulo} htmlFor="colab">Colaborador</label>
            <select id="colab" name="colab" defaultValue={pessoaGeral} className={`${campo} max-w-[16rem]`}>
              <option value="">Todos</option>
              {pessoasGeral.map((p) => (
                <option key={p.valor} value={p.valor}>{p.nome}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
            Filtrar tudo
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Período vale para a tela inteira. Turno e colaborador aqui são o padrão de todos os
          blocos — cada bloco abaixo pode ter o seu, e aplicar este filtro devolve todos a este
          recorte.
        </p>
      </form>

      {/* ---- OS TÓPICOS ----
          Um cartão por assunto, cada um com filtro, cartões e
          comparativos próprios. Antes eram blocos soltos na vertical e
          cinco gavetas no rodapé que misturavam assuntos: o comparativo
          da empilhadeira dividia gaveta com o do despejo, e a explicação
          do recebimento ficava a duas telas dos números dele. */}
      <div className="space-y-6">
        <SecaoDoTopico
          slug={TOPICOS.bancada}
          titulo="🧰 Bancada — Seleção, Triagem e Repack"
          subtitulo="As duas etapas do mesmo ciclo, do palete avariado ao produto reembalado."
          resumo={`${formatarHoras(bancadaHoras)} de bancada`}
          recorte={descreverRecorte(turnoBancada, pessoaBancada, pessoasBancada)}
          filtro={
            <FiltroDoTopico
              slug={TOPICOS.bancada}
              turno={turnoBancada}
              pessoa={pessoaBancada}
              pessoas={pessoasBancada}
            />
          }
        >
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

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          {/* ---- REPACK POR PRODUTO ----
              Com o filtro colado nele: família e tipo mudam só esta
              comparação, não os cartões de tempo de bancada acima -- a
              bancada não para para trocar de família. */}
          <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">📦 Repack por produto</h3>
              <FiltroSolto
                selects={[
                  {
                    chave: `${TOPICOS.bancada}_cl`,
                    rotulo: "Família",
                    valor: familiaBancada,
                    opcoes: [
                      { valor: "", nome: "Todas" },
                      ...familiasDisponiveis.map((f) => ({ valor: f, nome: f })),
                    ],
                  },
                  ...(temTipoCadastrado
                    ? [
                        {
                          chave: `${TOPICOS.bancada}_tp`,
                          rotulo: "Tipo",
                          valor: tipoBancada,
                          opcoes: [
                            { valor: "", nome: "Todos" },
                            { valor: "DESCARTAVEL", nome: "Descartável" },
                            { valor: "RETORNAVEL", nome: "Retornável" },
                          ],
                        },
                      ]
                    : []),
                ]}
              />
            </div>

            <TopoEFundo
              titulo="Onde o repack rende e onde trava"
              subtitulo="Caixas por hora — os três produtos mais rápidos e os três mais lentos do recorte"
              itens={barrasReepackProduto}
              sufixo="cx/h"
              rotuloTopo="Mais rápidos"
              rotuloFundo="Mais lentos"
            />

            <BarraRanking
              titulo="Todos os produtos"
              subtitulo="Taxa média no período, da maior para a menor"
              itens={barrasReepackProduto}
              sufixo="cx/h"
              vazio="Nenhum repack no recorte escolhido."
            />
          </div>

          <details className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
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
        </SecaoDoTopico>

        <SecaoDoTopico
          slug={TOPICOS.despejo}
          titulo="🫗 Despejo"
          subtitulo="Litros descartados e o ritmo de quem despeja."
          resumo={`${formatarNumeroBr(despejoLitrosTotal, 1)} L`}
          recorte={descreverRecorte(turnoDespejo, pessoaDespejo, pessoasDespejo)}
          filtro={
            <FiltroDoTopico
              slug={TOPICOS.despejo}
              turno={turnoDespejo}
              pessoa={pessoaDespejo}
              pessoas={pessoasDespejo}
            />
          }
        >
          <BlocoAtividade titulo="🫗 Despejo">
            {/* A bombona vem primeiro e não segue filtro nenhum: é o
                número que decide QUANDO descartar, e ele é um só para o
                armazém inteiro. Ver TermometroDaBombona. */}
            {!bombonaDisponivel && (
              <div className="col-span-full rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                🪣 O nível da bombona ainda não está disponível: falta rodar a migração{" "}
                <code>110_bombona_do_despejo.sql</code> no Supabase. Enquanto isso, os litros abaixo
                são os do período filtrado, não os que estão dentro da bombona.
              </div>
            )}
            {bombonaDisponivel && (
            <TermometroDaBombona
              litros={litrosNaBombona}
              capacidade={capacidadeBombona}
              desde={
                ultimoEsvaziamento
                  ? `${new Date(ultimoEsvaziamento.esvaziada_em).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      dateStyle: "short",
                      timeStyle: "short",
                    })} (${ultimoEsvaziamento.colaborador_nome})`
                  : "o primeiro lançamento — nenhum esvaziamento registrado ainda"
              }
              rodape={
                <div className="flex flex-wrap items-center gap-3">
                  <form action={esvaziarBombona}>
                    <input type="hidden" name="litros_no_momento" value={litrosNaBombona} />
                    <BotaoEsvaziarBombona litros={litrosNaBombona} />
                  </form>
                  {ultimoEsvaziamento && (
                    <form action={desfazerEsvaziamento}>
                      <input type="hidden" name="id" value={ultimoEsvaziamento.id} />
                      <BotaoDesfazerEsvaziamento
                        quando={new Date(ultimoEsvaziamento.esvaziada_em).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      />
                    </form>
                  )}
                  <span className="text-[11px] text-slate-400">
                    Zera só a contagem da bombona. Os lançamentos, o ranking e os litros por turno
                    continuam intactos.
                  </span>
                </div>
              }
            />
            )}
            <CartaoHero
              titulo="Litros no recorte"
              valor={`${formatarNumeroBr(despejoLitrosTotal, 1)} L`}
              legenda="despejados no período/turno/pessoa filtrados"
            />
            <CartaoHero
              titulo="Taxa média"
              valor={`${despejoTaxaMediaHora.toFixed(1)} L/h`}
              legenda="litros ÷ horas do período"
              meta={leituraDespejo}
            />
            <CartaoHero titulo="Lançamentos" valor={String(despejos.length)} />
          </BlocoAtividade>

          <div className="grid gap-4 sm:grid-cols-2">
            <BarraRanking
              titulo="Litros por turno"
              subtitulo="Segue o filtro de pessoa; o turno é a própria barra"
              itens={despejoPorTurno}
              sufixo="L"
            />
            <BarraRanking
              titulo="Despejo por colaborador"
              subtitulo="Total de litros no recorte, do maior para o menor"
              itens={barrasDespejoColaborador}
              sufixo="L"
            />
          </div>

          <TopoEFundo
            titulo="Quem mais e quem menos despeja"
            subtitulo="Litros no recorte — os três primeiros e os três últimos"
            itens={barrasDespejoColaborador}
            sufixo="L"
            rotuloTopo="Mais litros"
            rotuloFundo="Menos litros"
          />

          {/* ---- DESPEJO POR EMBALAGEM ----
              Filtro colado no gráfico: escolher uma embalagem aqui muda
              esta comparação, não os cartões do bloco. */}
          <div className="space-y-3 rounded-2xl bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">🫗 Despejo por embalagem</h3>
              <FiltroSolto
                selects={[
                  {
                    chave: `${TOPICOS.despejo}_emb`,
                    rotulo: "Embalagem",
                    valor: embalagemDespejo,
                    opcoes: [
                      { valor: "", nome: "Todas" },
                      ...embalagens.map((e) => ({ valor: e.id, nome: e.nome })),
                    ],
                  },
                ]}
              />
            </div>

            <TopoEFundo
              titulo="Onde o despejo rende e onde trava"
              subtitulo="Litros por hora — as três embalagens mais rápidas e as três mais lentas"
              itens={barrasDespejoEmbalagem}
              sufixo="L/h"
              rotuloTopo="Mais rápidas"
              rotuloFundo="Mais lentas"
            />

            <BarraRanking
              titulo="Todas as embalagens"
              subtitulo="Litros/hora, já convertidos, da maior para a menor"
              itens={barrasDespejoEmbalagem}
              sufixo="L/h"
              tom="gold"
              vazio="Nenhum despejo no recorte escolhido."
            />
          </div>
        </SecaoDoTopico>

        <SecaoDoTopico
          slug={TOPICOS.abastecimento}
          titulo="🧃 Abastecimento e Ressuprimento"
          subtitulo="O volume abastecido e o tempo que se perde entre pedir, transportar e abastecer."
          resumo={`${formatarNumeroBr(pickingHlTotal, 1)} HL`}
          recorte={[
            descreverRecorte(turnoAbastecimento, pessoaAbastecimento, pessoasAbastecimento),
            papelAbastecimento
              ? (PAPEIS_ABASTECIMENTO.find((p) => p.valor === papelAbastecimento)?.nome ?? "")
              : "qualquer papel",
            tipoAbastecimento
              ? (TIPOS_ABASTECIMENTO_FILTRO.find((t) => t.valor === tipoAbastecimento)?.nome ?? "")
              : "completo e pontual",
          ].join(" · ")}
          filtro={
            <FiltroDoTopico
              slug={TOPICOS.abastecimento}
              turno={turnoAbastecimento}
              pessoa={pessoaAbastecimento}
              pessoas={pessoasAbastecimento}
              rotuloPessoa="Pessoa"
              extras={[
                {
                  chave: "p",
                  rotulo: "Papel",
                  valor: papelAbastecimento,
                  opcoes: PAPEIS_ABASTECIMENTO,
                },
                {
                  chave: "tipo",
                  rotulo: "Tipo",
                  valor: tipoAbastecimento,
                  opcoes: TIPOS_ABASTECIMENTO_FILTRO,
                },
              ]}
            />
          }
        >
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

        {/* ---- ABASTECIMENTO: o painel que morava na tela de lançar ---- */}
        {abastecimentoParaAnalise.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-bold text-slate-900">🧃 Abastecimento — análise</h2>
            <PainelDoAbastecimento sessoes={abastecimentoParaAnalise} />
          </section>
        )}

        {/* O bloco mede o que acontece ENTRE as pessoas -- o volume já
            está no bloco de cima. Só aparece quando houve solicitação no
            período: um bloco de zeros ensinaria a ignorá-lo. */}
        {resumoRessuprimento.total > 0 && (
          <BlocoAtividade titulo="🧾 Ressuprimento — tempos e movimentos">
            {/* Um ciclo por TIPO, nunca a média dos dois juntos. Uma
                varredura da manhã de 2h é normal; um chamado pontual de 2h
                é um problema. Somados, o número não descreve nenhum dos
                dois -- e é justamente o que alguém usaria para cobrar a
                pessoa errada. */}
            {ressuprimentoPorTipo.map(({ tipo, resumo }) => (
              <CartaoHero
                key={tipo}
                titulo={`Ciclo — ${TIPO_ABASTECIMENTO[tipo].curto}`}
                valor={resumo.cicloMedio === null ? "—" : formatarMinutosCurto(resumo.cicloMedio)}
                legenda={`${TIPO_ABASTECIMENTO[tipo].emoji} ${resumo.concluidas} de ${resumo.total} concluída(s)`}
              />
            ))}
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
        </SecaoDoTopico>

        {/* ---- BATE PALETE ----
            A seção só existe quando houve lote no período: um cartão de
            zeros com filtro e tudo ensina a ignorá-lo. */}
        {batePaleteTodos.length > 0 && (
          <SecaoDoTopico
            slug={TOPICOS.batePalete}
            titulo="🤲📦 Bate Palete"
            subtitulo="Quanto do palete batido voltou inteiro ao estoque."
            resumo={`${formatarNumeroBr(batePaleteHl, 1)} HL`}
            recorte={descreverRecorte(turnoBatePalete, pessoaBatePalete, pessoasBatePalete)}
            filtro={
              <FiltroDoTopico
                slug={TOPICOS.batePalete}
                turno={turnoBatePalete}
                pessoa={pessoaBatePalete}
                pessoas={pessoasBatePalete}
                />
            }
          >
            <BlocoAtividade titulo="🤲📦 Bate Palete">
              <CartaoHero
                titulo="HL batidos"
                valor={`${formatarNumeroBr(batePaleteHl, 1)} HL`}
                legenda={`${lotesBatidos.length} lote(s)`}
              />
              <CartaoHero
                titulo="Avaria"
                valor={
                  batePalatePctAvaria === null
                    ? "—"
                    : `${formatarNumeroBr(batePalatePctAvaria, 1)}%`
                }
                legenda={`${formatarNumeroBr(batePaleteAvariado, 1)} HL perdidos`}
              />
              <CartaoHero
                titulo="Aproveitado"
                valor={`${formatarNumeroBr(batePaleteHl - batePaleteAvariado, 1)} HL`}
                legenda="voltou inteiro ao estoque"
              />
            </BlocoAtividade>

            {/* O número que aponta a ORIGEM. Um SKU que chega com muita
                avaria em todo lote tem problema de paletização ou de
                transporte, e nada dentro do armazém resolve. */}
            <BarraRanking
              titulo="Onde está a avaria"
              subtitulo="HL avariado por produto, no período"
              itens={avariaDosProdutos.slice(0, 8).map((l) => ({
                rotulo: produtos.find((p) => p.id === l.produtoId)?.descricao ?? "produto",
                valor: l.hlAvariado,
                detalhe: `${l.lotes} lote(s) · ${
                  l.pctAvaria === null ? "—" : `${formatarNumeroBr(l.pctAvaria, 1)}% do lote`
                }`,
              }))}
              sufixo=" HL"
              tom="vermelho"
            />
          </SecaoDoTopico>
        )}

        <SecaoDoTopico
          slug={TOPICOS.empilhadeira}
          titulo="🏗️ Empilhadeira"
          subtitulo="Horas de motor pelo horímetro e o consumo de gás."
          resumo={`${horasEmpilhadeiraTotal}h de motor`}
          recorte={descreverRecorte(turnoEmpilhadeira, pessoaEmpilhadeira, pessoasEmpilhadeira)}
          filtro={
            <FiltroDoTopico
              slug={TOPICOS.empilhadeira}
              turno={turnoEmpilhadeira}
              pessoa={pessoaEmpilhadeira}
              pessoas={pessoasEmpilhadeira}
              rotuloPessoa="Operador"
              nota="turno pela hora de abertura da operação"
            />
          }
        >
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

          {/* Gás: o ciclo do P20, mesmo motor do dashboard de consumo.
              Estes três NÃO seguem o filtro do bloco -- está escrito na
              legenda. Um ciclo de botijão atravessa turnos e operadores:
              recortar as sessões antes de montá-lo tiraria horas do meio
              do ciclo e faria o P20 render mais do que rende. */}
          <CartaoHero
            titulo="P20 consumidos"
            valor={String(p20NoPeriodo)}
            legenda="ciclos fechados no período · todo o armazém"
          />
          <CartaoHero
            titulo="Média horas/P20"
            valor={mediaHorasPorP20 === null ? "—" : `${formatarNumeroBr(mediaHorasPorP20)}h`}
            legenda="quanto rende um botijão · todo o armazém"
            meta={leituraHorasP20}
          />
          {custoDoGas !== null && (
            <CartaoHero
              titulo="Custo do gás"
              valor={`R$ ${custoDoGas.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              legenda={`P20 a R$ ${formatarNumeroBr(custoP20 ?? 0, 2)} · todo o armazém`}
            />
          )}
        </BlocoAtividade>

          {encerradasPorTerceiro > 0 && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              ⚠️ {encerradasPorTerceiro} operação(ões) foram encerradas por outra pessoa. O horímetro
              final nesses casos é o que alguém encontrou na máquina depois — todo o consumo do
              intervalo vai para quem abriu. Leia os números por operador abaixo com isso em mente.
            </p>
          )}

          <Histograma
            titulo="Quando a empilhadeira é usada"
            subtitulo={`Horas de HORÍMETRO (motor rodando) em cada hora do dia — soma ${formatarNumeroBr(usoEmpilhadeiraPorHora.reduce((s, v) => s + v, 0), 1)}h, o mesmo do cartão "Horas ativas". Como o app não registra quando o motor liga e desliga dentro da operação, as horas são espalhadas por igual ao longo dela.`}
            valores={usoEmpilhadeiraPorHora}
            sufixo="h"
            legendaPico="hora de maior uso"
            legendaComum="demais horas"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <BarraRanking titulo="Horas por máquina" itens={barrasHorasMaquina} sufixo="h" />
            <BarraRanking titulo="Horas por operador" itens={barrasHorasOperador} sufixo="h" />
            {/* Consumo: o número que "horas por operador" esconde. 40h
                com 2 botijões e 40h com 5 são operações diferentes, e a
                segunda é dinheiro saindo. Barra grande aqui é ruim --
                daí o tom vermelho. */}
            <BarraRanking
              titulo="Consumo por operador"
              subtitulo={
                horasPorP20DaCasa
                  ? `Horas por P20 — quanto MAIOR, melhor. A casa faz ${formatarNumeroBr(horasPorP20DaCasa)}h por botijão`
                  : "Horas por P20 — quanto maior, melhor"
              }
              itens={barrasConsumoOperador}
              sufixo="h/P20"
              tom="gold"
              vazio="Nenhum ciclo de gás com sessão apontada no período."
            />
            {barrasCustoOperador.length > 0 && (
              <BarraRanking
                titulo="Gás queimado por operador"
                subtitulo="Botijões equivalentes × custo cadastrado"
                itens={barrasCustoOperador}
                sufixo="R$"
                tom="vermelho"
              />
            )}
          </div>

          <details className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <summary className="cursor-pointer font-semibold text-slate-600">
              ℹ️ Como a empilhadeira é medida
            </summary>
            <ul className="mt-2 space-y-1.5">
              <li>
                <strong>Horas ativas</strong> — vêm do <em>horímetro</em> (motor rodando), não do tempo
                entre abrir e fechar a operação. Só existem depois do fechamento, que é quando o
                horímetro final é lido: operação em aberto não entra em nenhum somatório aqui.
              </li>
              <li>
                <strong>P20</strong> — um ciclo vai de uma troca de gás até a seguinte, e entra no
                período em que <em>fechou</em>, que é quando o botijão acabou. A primeira troca de cada
                máquina não vira ciclo: sem um ponto anterior não há intervalo para medir.
              </li>
              <li>
                Os três cartões de gás mostram <strong>todo o armazém</strong>, mesmo com turno ou
                operador escolhido acima. Um ciclo de botijão atravessa turnos e operadores — recortar
                as sessões antes de montá-lo tiraria horas do meio do ciclo e faria o botijão parecer
                render mais do que rende.
              </li>
            </ul>
          </details>
        </SecaoDoTopico>

        <SecaoDoTopico
          slug={TOPICOS.recebimento}
          titulo="🚛 Recebimento de Carretas"
          subtitulo="TMA, as fases do atendimento e a avaria que chega de fora."
          resumo={tmaMedio === null ? "sem TMA" : `TMA ${formatarMinutos(Math.round(tmaMedio))}`}
          recorte={descreverRecorte(turnoRecebimento, pessoaRecebimento, pessoasRecebimento)}
          filtro={
            <FiltroDoTopico
              slug={TOPICOS.recebimento}
              turno={turnoRecebimento}
              pessoa={pessoaRecebimento}
              pessoas={pessoasRecebimento}
              nota="turno pelo início do atendimento; pessoa vale como conferente ou portaria"
            />
          }
        >
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

          {/* A cauda, não só a média. São as duas carretas de 5h que
              geram a reclamação e a estadia -- e elas somem numa média
              feita com vinte carretas rápidas. */}
          <CartaoHero
            titulo="TMA mediano"
            valor={tmaMediana === null ? "—" : formatarMinutos(tmaMediana)}
            legenda="metade das carretas sai antes disso"
          />
          <CartaoHero
            titulo="TMA no pior 10%"
            valor={tmaP90 === null ? "—" : formatarMinutos(tmaP90)}
            legenda="P90 — é o que a transportadora reclama"
          />
          <CartaoHero
            titulo="Dentro da meta"
            valor={pctDentroDaMeta === null ? "—" : `${pctDentroDaMeta}%`}
            legenda={`${dentroDaMeta} de ${tmasOrdenados.length} carretas ≤ ${metaTma} min`}
          />
        </BlocoAtividade>

          {/* ---- QUANDO ----
              A fila do recebimento se forma na PORTARIA, não na
              descarga. Sem o perfil por hora, um TMA alto virava
              conversa sobre a velocidade do conferente quando o que
              houve foi cinco carretas chegando juntas às 7h. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Histograma
              titulo="Quando as carretas chegam"
              subtitulo="Chegadas apontadas pela portaria, por hora do dia. O número em cima da barra é quantas carretas chegaram naquela hora."
              valores={chegadasPorHora}
              sufixo="carreta(s)"
              casas={0}
              legendaPico="hora de maior chegada"
              legendaComum="demais horas"
            />
            <Histograma
              titulo="TMA por hora de chegada"
              subtitulo="Média do TMA das carretas que chegaram naquela hora — o pico de chegada e o pico de TMA costumam ser o mesmo, e é isso que prova que o problema é fila e não velocidade"
              valores={tmaPorHoraDeChegada}
              sufixo="min"
              casas={0}
              legendaPico="pior TMA do dia"
              legendaComum="demais horas"
            />
          </div>

          {/* ---- QUEM ---- */}
          <div className="grid gap-4 sm:grid-cols-2">
            <BarraRanking
              titulo="TMA por turno"
              subtitulo="O turno é a barra; segue o filtro de pessoa"
              itens={tmaPorTurno}
              sufixo="min"
              tom="gold"
            />
            <BarraRanking
              titulo="TMA por conferente"
              subtitulo="Do mais lento para o mais rápido — é onde o tempo se perde"
              itens={tmaPorConferente}
              sufixo="min"
              tom="gold"
            />
            <BarraRanking
              titulo="TMA por operador da portaria"
              subtitulo="Quem apontou a chegada da carreta"
              itens={tmaPorPortaria}
              sufixo="min"
              tom="gold"
            />
            <BarraRanking
              titulo="TMA por transportadora"
              subtitulo="Carreta que chega mal paletizada ou sem documento atrasa a operação inteira"
              itens={tmaPorTransportadora}
              sufixo="min"
              tom="gold"
            />
          </div>

          {/* ---- AVARIA ---- */}
          <div className="grid gap-4 sm:grid-cols-2">
            <BarraRanking
              titulo="% de avaria por transportadora"
              subtitulo="Do maior para o menor — avariado sobre recebido, no recorte deste bloco"
              itens={barrasAvariaTransportadora}
              sufixo="%"
              tom="vermelho"
            />
            <BarraRanking
              titulo="% de avaria por motorista"
              subtitulo="A mesma carga, o mesmo trajeto, motoristas diferentes — é aqui que aparece direção ou amarração"
              itens={avariaPorMotorista}
              sufixo="%"
              tom="vermelho"
            />
            <BarraRanking
              titulo="TMA por motorista"
              subtitulo="Quem demora no pátio (documento, lona, espera do ajudante)"
              itens={tmaPorMotorista}
              sufixo="min"
              tom="gold"
            />
          </div>

          <details className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            <summary className="cursor-pointer font-semibold text-slate-600">
              ℹ️ Como o recebimento é medido
            </summary>
            <ul className="mt-2 space-y-1.5">
              <li>
                <strong>O turno da carreta é derivado</strong> — a carreta não tem coluna de turno.
                Vale o turno em que a operação <em>assumiu</em> a carreta; se ela ainda não foi
                assumida, o da chegada na portaria. É o turno que trabalhou a carreta, que é do que o
                TMA fala.
              </li>
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
            </ul>
          </details>
        </SecaoDoTopico>

        {/* ---- RANKING ----
            Por último e com recorte próprio: é a comparação ENTRE
            pessoas, e não faz sentido ela obedecer ao filtro que alguém
            pôs num bloco acima para investigar outra coisa. */}
        <SecaoDoTopico
          slug={TOPICOS.ranking}
          titulo="🏆 Ranking e atividade por turno"
          subtitulo="A comparação entre pessoas e entre turnos, com a pontuação ponderada pelas horas."
          resumo={`${ranking.length} pessoa(s)`}
          recorte={descreverRecorte(turnoRanking, pessoaRanking, pessoasRanking)}
          filtro={
            <FiltroDoTopico
              slug={TOPICOS.ranking}
              turno={turnoRanking}
              pessoa={pessoaRanking}
              pessoas={pessoasRanking}
            />
          }
        >
          <div className="flex justify-end">
            <ExportarCsv
              nome="ranking-armazem"
              complemento={[de, "a", ate, turnoRanking ?? ""].filter(Boolean).join("_")}
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
                "Horas apontadas",
              ]}
              linhas={csvRanking}
              rotulo="Exportar ranking .csv"
            />
          </div>

      <details className="rounded-2xl border border-slate-200 bg-white" open>
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          📅 Atividade por turno
        </summary>
        <div className="border-t border-slate-100 p-4">
          {/* A tabela quebra por turno na própria linha, então ela só
              honra o filtro de PESSOA deste bloco -- aplicar o turno aqui
              deixaria duas linhas zeradas e uma cheia, que não compara
              nada. */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">Turno</th>
                  <th className="p-3 text-right">🔍 Seleção</th>
                  <th className="p-3 text-right">📦 Reepack</th>
                  <th className="p-3 text-right">🫗 Despejo</th>
                  <th className="p-3 text-right">🏬 Picking</th>
                  <th className="p-3 text-right">🧹 5S</th>
                  {/* "Total" de quê? São contagens de LANÇAMENTOS somadas
                      -- caixas, litros e HL não somam entre si. O rótulo
                      genérico fazia parecer um total de produção. */}
                  <th className="p-3 text-right">Lançamentos</th>
                  <th className="p-3 text-right" title={EXPLICACAO_PONTUACAO}>
                    Pontuação ℹ️
                  </th>
                </tr>
              </thead>
              <tbody>
                {porTurno.map((l) => (
                  <tr key={l.turno} className="border-t border-slate-100">
                    <td className="p-3 font-semibold text-slate-800">{ROTULO_TURNO_CURTO[l.turno]}</td>
                    <td className="p-3 text-right tabular-nums">{l.selecaoUn} un</td>
                    <td className="p-3 text-right tabular-nums">{l.reepackCx} cx</td>
                    <td className="p-3 text-right tabular-nums">{l.despejoLitros} L</td>
                    <td className="p-3 text-right tabular-nums">{l.pickingHl} HL</td>
                    <td className="p-3 text-right tabular-nums">{l.execucoes5s}</td>
                    <td className="p-3 text-right font-bold tabular-nums text-slate-900">{l.totalLancamentos}</td>
                    <td className="p-3 text-right">
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                        {l.pontuacao === null ? "—" : `${l.pontuacao} pts`}
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
          {/* A armadilha de leitura desta tabela.
              A pontuação da linha Total não é comparável com as linhas de
              turno: as parcelas de Picking e Seleção do Total comparam o
              período com ele mesmo, e pctRelativoAoGrupo(x, x) é 100 por
              definição. O Total pode ficar ACIMA do melhor turno sem que
              nada esteja errado -- e sem este aviso a conclusão natural é
              que a conta está quebrada. */}
          <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            ⚠️ <strong>A pontuação do Total não se compara com a das linhas.</strong> Picking e
            Seleção não têm meta cadastrada, então valem &ldquo;% da média do grupo&rdquo;. Na linha
            Total o grupo é o próprio período, e comparar o período com ele mesmo dá 100% sempre. Use
            o Total para os volumes; para desempenho, compare os turnos entre si.
            {pessoaRanking && (
              <>
                {" "}
                Com um colaborador escolhido no filtro, a régua vira <em>ele contra ele mesmo</em> —
                as porcentagens de Picking, Seleção e 5S perdem o sentido. Para comparar uma pessoa
                com o grupo, deixe o filtro em Todos e procure o nome dela no ranking.
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-slate-400">ℹ️ {EXPLICACAO_PONTUACAO}</p>
        </div>
      </details>

      <details className="rounded-2xl border border-slate-200 bg-white" open>
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          🏆 Ranking{turnoRanking ? ` — ${ROTULO_TURNO_CURTO[turnoRanking]}` : ""}
        </summary>
        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 flex items-baseline justify-end">
            {/* O desempate virou tempo apontado quando a lib mudou (para
                não premiar quem fatia o trabalho em muitos lançamentos
                curtos); esta linha continuou dizendo "lançamentos". */}
            <p className="text-xs text-slate-400">Empate: desempata quem tem mais tempo apontado</p>
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
                    <th className="p-3 text-right">🏬 Picking</th>
                    <th className="p-3 text-right">🧹 5S</th>
                    {/* Dizia "Atividades" e mostrava HORAS -- a célula
                        sempre renderizou formatarHoras(horasApontadas).
                        Quem lia "8" entendia oito lançamentos, e eram
                        oito horas. */}
                    <th className="p-3 text-right">Tempo apontado</th>
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
                      <td className="p-3 text-right tabular-nums text-slate-500">
                        {formatarHoras(r.horasApontadas)}
                      </td>
                      <td className="p-3 text-right">
                        {/* Amostra curta NAO vira "0 pts": zero diria que a
                            pessoa foi mal, quando o que houve foi falta de
                            medicao. Ver HORAS_MINIMAS_NO_RANKING. */}
                        {r.pontuacao === null ? (
                          <span
                            className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400"
                            title={`Menos de ${HORAS_MINIMAS_NO_RANKING}h apontada no período — pouco para virar nota.`}
                          >
                            amostra curta
                          </span>
                        ) : (
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-700">
                            {r.pontuacao} pts
                          </span>
                        )}
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
        </SecaoDoTopico>
      </div>
    </div>
  );
}