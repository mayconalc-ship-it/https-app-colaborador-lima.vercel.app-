import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { podeNoModulo, requireAcessoModulo, temAcessoModulo } from "@/lib/require-admin";
import { ComboboxProdutoReepack } from "@/components/produtividade-armazem/ComboboxProdutoReepack";
import {
  COOKIE_REEPACK_CLUSTER,
  COOKIE_REEPACK_TIPO,
  ROTULO_TURNO,
  TURNOS,
  diaLocalISO,
  diasAtrasISO,
  ehTurno,
  formatarDataHora,
  hojeISO,
  turnoAtual,
} from "@/lib/produtividade-armazem";
import {
  COOKIE_ABASTECIMENTO_PATH,
  ROTULO_UNIDADE_ABASTECIMENTO,
  ROTULO_UNIDADE_ABASTECIMENTO_CURTO,
  TIPOS_ABASTECIMENTO,
  TIPO_ABASTECIMENTO,
  UNIDADES_ABASTECIMENTO,
  ehTipoAbastecimento,
  formatarHl,
  formatarMinutos,
  mediaHlPorDia,
  rankingDeSku,
  resumirAbastecimento,
  avisoDoTipo,
  tipoSugerido,
  type TipoAbastecimento,
  type UnidadeAbastecimento,
} from "@/lib/abastecimento";
import {
  estaAberta,
  estadoDe,
  ordenarFila,
  temposDoCiclo,
  transporteFim,
  type Prioridade,
  type Ressuprimento,
} from "@/lib/ressuprimento";
import { MontarSolicitacao } from "@/components/produtividade-armazem/MontarSolicitacao";
import {
  CabecalhoDaSolicitacao,
  CartaoTransporte,
  ItensDaSolicitacao,
  TempoDoCiclo,
} from "@/components/produtividade-armazem/PecasDoRessuprimento";
import {
  cancelarSolicitacao,
  iniciarAbastecimentoDaSolicitacao,
} from "./ressuprimento-actions";
import {
  adicionarItem,
  buscarProdutosAbastecimento,
  cancelarAbastecimento,
  excluirAbastecimento,
  finalizarAbastecimento,
  iniciarAbastecimento,
  removerItem,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * As abas da tela.
 *
 * "solicitar" e "fila" chegaram aqui em 02/09/2026: nasceram numa tela
 * própria (migration 085) e o dono corrigiu -- pedir, transportar e
 * abastecer são etapas da MESMA atividade, e dois cards na vitrine
 * obrigariam a operação a entender uma divisão que só existia no código.
 */
type Aba = "lancar" | "solicitar" | "fila" | "historico" | "ranking";

const ABAS_VALIDAS: Aba[] = ["lancar", "solicitar", "fila", "historico", "ranking"];

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type Sessao = {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  tipo: string;
  turno: string;
  inicio: string;
  fim: string | null;
  observacao: string | null;
  /** Preenchido quando a sessão nasceu de uma solicitação de
   *  ressuprimento (ver lib/ressuprimento.ts). Nulo no lançamento avulso,
   *  que continua valendo. */
  ressuprimento_id: string | null;
};

type Item = {
  id: string;
  abastecimento_id: string;
  produto_id: string;
  unidade: string;
  quantidade: number;
  hl_calculado: number;
};

const COLUNAS_SESSAO = "id, colaborador_id, colaborador_nome, tipo, turno, inicio, fim, observacao, ressuprimento_id";
const COLUNAS_ITEM = "id, abastecimento_id, produto_id, unidade, quantidade, hl_calculado";

/** Quantos dias de solicitação a tela carrega. Curto de propósito: a fila
 *  é do turno, não do mês -- o histórico longo vive na aba Histórico. */
const DIAS_DE_SOLICITACAO = 3;

type LinhaRessuprimento = {
  id: string;
  criado_em: string;
  solicitante_id: string;
  solicitante_nome: string;
  prioridade: string;
  tipo: string;
  turno: string;
  observacao: string | null;
  operador_id: string | null;
  operador_nome: string | null;
  transporte_inicio: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  pa_ressuprimento_itens: {
    id: string;
    produto_id: string;
    unidade: string;
    quantidade: number;
    hl_calculado: number;
    entregue_em: string | null;
  }[];
  pa_abastecimentos: { inicio: string; fim: string | null; colaborador_nome: string }[];
};

/** Linha do banco -> o formato puro que lib/ressuprimento entende. Nenhum
 *  estado vem do banco: tudo sai dos carimbos, na leitura. */
function ressuprimentoDaLinha(
  l: LinhaRessuprimento,
): Ressuprimento & { observacao: string | null; motivo: string | null } {
  // A sessão vem como array (o PostgREST não sabe que o índice único
  // garante uma só), mas é sempre no máximo uma.
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
    observacao: l.observacao,
    motivo: l.motivo_cancelamento,
  };
}

/** Paletes equivalentes de um item já gravado. Recalcula a partir do
 *  cadastro atual porque o palete é só uma forma de LER a quantidade --
 *  o número que a operação lançou (e o HL dele) é que está congelado. */
function paletesDoItem(i: Item, caixasPallet: number | null): number {
  if (i.unidade === "palete") return i.quantidade;
  if (caixasPallet && caixasPallet > 0) return i.quantidade / caixasPallet;
  return 0;
}

export default async function AbastecimentoPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    tipo?: string;
    de?: string;
    ate?: string;
    turno?: string;
    colab?: string;
    erro?: string;
    sucesso?: string;
  }>;
}) {
  const perfil = await requireAcessoModulo("pa-picking");

  const sp = await searchParams;
  const aba: Aba = ABAS_VALIDAS.includes(sp.aba as Aba) ? (sp.aba as Aba) : "lancar";
  const de = sp.de ?? diasAtrasISO(30);
  const ate = sp.ate ?? hojeISO();
  const turnoFiltro = ehTurno(sp.turno) ? sp.turno : "";
  const colab = (sp.colab ?? "").trim();
  // Sem escolha na URL, o HORÁRIO decide: completo até as 10h, pontual
  // depois. O padrão fixo em "completo" fazia a tarde inteira ser lançada
  // com o tipo errado -- e tipo errado não dá erro, só suja o indicador
  // meses depois.
  const tipoEscolhido: TipoAbastecimento = ehTipoAbastecimento(sp.tipo)
    ? sp.tipo
    : tipoSugerido();

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();

  const precisaPeriodo = aba === "historico" || aba === "ranking";

  const [{ data: produtosBanco }, { data: abertaBanco }, { data: minhasBanco }, { data: periodoBanco }, podeExcluirQualquer] =
    await Promise.all([
      supabase
        .from("pa_produtos")
        .select("id, codigo, descricao, cluster_produto, tipo, caixas_pallet")
        .eq("revenda_id", revendaId)
        .eq("ativo", true)
        .not("fator_hecto", "is", null)
        .order("descricao"),
      supabase
        .from("pa_abastecimentos")
        .select(COLUNAS_SESSAO)
        .eq("revenda_id", revendaId)
        .eq("colaborador_id", perfil.id)
        .is("fim", null)
        .maybeSingle(),
      supabase
        .from("pa_abastecimentos")
        .select(COLUNAS_SESSAO)
        .eq("revenda_id", revendaId)
        .eq("colaborador_id", perfil.id)
        .not("fim", "is", null)
        .order("fim", { ascending: false })
        .limit(10),
      precisaPeriodo
        ? (() => {
            let q = supabase
              .from("pa_abastecimentos")
              .select(COLUNAS_SESSAO)
              .eq("revenda_id", revendaId)
              .not("fim", "is", null)
              // O dia digitado é o da operação (UTC-3), não o do servidor
              // (a Vercel roda em UTC) -- sem o -03:00 explícito, "hoje"
              // perderia o que foi lançado depois das 21h.
              .gte("inicio", `${de}T00:00:00-03:00`)
              .lte("inicio", `${ate}T23:59:59-03:00`);
            if (turnoFiltro) q = q.eq("turno", turnoFiltro);
            if (colab) q = q.eq("colaborador_id", colab);
            return q.order("inicio", { ascending: false }).limit(300);
          })()
        : Promise.resolve({ data: null }),
      podeNoModulo("produtividade-armazem", "excluir"),
    ]);

  // Quem opera empilhadeira transporta o que foi pedido. É a concessão que
  // essas pessoas já têm -- não nasceu módulo novo para isso.
  const podeTransportar = await temAcessoModulo("pa-empilhadeira");

  // As solicitações dos últimos dias: alimentam a fila da empilhadeira, a
  // lista do que está esperando na área e o acompanhamento de quem pediu.
  const desdeRessuprimento = new Date(Date.now() - DIAS_DE_SOLICITACAO * 86_400_000).toISOString();
  const { data: ressuprimentosBanco } = await supabase
    .from("pa_ressuprimentos")
    .select(
      "id, criado_em, solicitante_id, solicitante_nome, prioridade, tipo, turno, observacao, operador_id, operador_nome, transporte_inicio, cancelado_em, motivo_cancelamento, pa_ressuprimento_itens(id, produto_id, unidade, quantidade, hl_calculado, entregue_em), pa_abastecimentos(inicio, fim, colaborador_nome)",
    )
    .eq("revenda_id", revendaId)
    .gte("criado_em", desdeRessuprimento)
    .order("criado_em", { ascending: false });

  const solicitacoes = ((ressuprimentosBanco ?? []) as unknown as LinhaRessuprimento[]).map(
    ressuprimentoDaLinha,
  );

  const agora = new Date();
  const filaDeTransporte = ordenarFila(
    solicitacoes.filter((r) => estaAberta(r) && !transporteFim(r)),
  );
  const esperandoNaArea = solicitacoes.filter((r) => estadoDe(r) === "na_area");
  const minhasSolicitacoes = solicitacoes.filter(
    (r) => r.solicitanteId === perfil.id || r.operadorId === perfil.id,
  );

  // Completo até as 10h, pontual depois -- o combinado da operação. O
  // horário SUGERE (e avisa quando a escolha destoa), nunca bloqueia:
  // travar obrigaria a inventar exceção para o primeiro dia atípico.
  const tipoDoHorario = tipoSugerido(agora);
  const outroTipo: TipoAbastecimento = tipoDoHorario === "completo" ? "pontual" : "completo";
  const avisoSeDestoar = avisoDoTipo(outroTipo, agora);

  const nomeDoProduto = (id: string) => {
    const p = produtoPorId.get(id);
    return p ? `${p.codigo} — ${p.descricao}` : "produto";
  };

  const produtos = produtosBanco ?? [];
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const clusters = [...new Set(produtos.map((p) => p.cluster_produto).filter((c): c is string => Boolean(c)))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  const tipos = [...new Set(produtos.map((p) => p.tipo).filter((t): t is string => Boolean(t)))].sort();

  // O filtro Cluster/Tipo é lembrado do último uso, igual ao Repack -- mas
  // em cookie de caminho próprio, para o "Cerveja/Descartável" do Repack
  // não mandar nesta tela.
  const jar = await cookies();
  const clusterCookie = decodeURIComponent(jar.get(COOKIE_REEPACK_CLUSTER)?.value ?? "");
  const tipoCookie = decodeURIComponent(jar.get(COOKIE_REEPACK_TIPO)?.value ?? "");

  const aberta = abertaBanco as Sessao | null;
  const minhas = (minhasBanco ?? []) as Sessao[];
  const doPeriodo = (periodoBanco ?? []) as Sessao[];

  // Os itens de tudo que a tela vai mostrar, numa consulta só -- cada ida
  // ao banco custa ~200 ms independentemente do tamanho, então o que
  // importa é o número de idas, não o de linhas.
  const idsVisiveis = [
    ...(aberta ? [aberta.id] : []),
    ...minhas.map((s) => s.id),
    ...doPeriodo.map((s) => s.id),
  ];
  const { data: itensBanco } = idsVisiveis.length
    ? await supabase.from("pa_abastecimento_itens").select(COLUNAS_ITEM).in("abastecimento_id", idsVisiveis)
    : { data: [] };

  const itens = (itensBanco ?? []) as Item[];
  const itensPorSessao = new Map<string, Item[]>();
  for (const i of itens) {
    const lista = itensPorSessao.get(i.abastecimento_id) ?? [];
    lista.push(i);
    itensPorSessao.set(i.abastecimento_id, lista);
  }

  /** Resumo de uma sessão a partir dos itens já carregados. */
  function resumir(s: Sessao) {
    const meus = itensPorSessao.get(s.id) ?? [];
    return resumirAbastecimento(
      s.inicio,
      s.fim,
      meus.map((i) => ({
        hl: i.hl_calculado,
        paletes: paletesDoItem(i, produtoPorId.get(i.produto_id)?.caixas_pallet ?? null),
      })),
    );
  }

  const contadores = new Map<string, string>();
  for (const s of doPeriodo) contadores.set(s.colaborador_id, s.colaborador_nome);

  return (
    <div>
      <PageHeader
        title="Abastecimento do Picking"
        subtitle="Inicie ao pegar o primeiro palete, informe o que abasteceu e finalize -- o HL sai sozinho."
        fecharHref="/produtividade-armazem"
      />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      <nav className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["lancar", "Lançar", null],
            ["solicitar", "Solicitar", null],
            // A fila só existe para quem transporta. Mostrá-la a todo
            // mundo ofereceria um caminho que termina em "sem permissão".
            ...(podeTransportar
              ? ([["fila", "Fila", filaDeTransporte.length]] as [Aba, string, number | null][])
              : []),
            ["historico", "Histórico", null],
            ["ranking", "Ranking de SKU", null],
          ] as [Aba, string, number | null][]
        ).map(([a, texto, contagem]) => (
          <a
            key={a}
            href={`?aba=${a}`}
            aria-current={a === aba ? "page" : undefined}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              a === aba
                ? "bg-primary text-white ring-2 ring-primary/30 ring-offset-1"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {texto}
            {contagem ? <span className="ml-1 text-xs font-normal tabular-nums">({contagem})</span> : null}
          </a>
        ))}
      </nav>

      {/* ---------------- SOLICITAR ---------------- */}
      {aba === "solicitar" && (
        <section className="space-y-6">
          <MontarSolicitacao
            clusters={clusters}
            tipos={tipos}
            turnoSugerido={turnoAtual(agora)}
            tipoInicial={tipoDoHorario}
            avisoSeDestoar={avisoSeDestoar}
          />

          {minhasSolicitacoes.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
                Minhas solicitações ({DIAS_DE_SOLICITACAO} dias)
              </h2>
              <div className="space-y-3">
                {minhasSolicitacoes.map((r) => {
                  const t = temposDoCiclo(r);
                  return (
                    <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <CabecalhoDaSolicitacao r={r} agora={agora} />
                      <ItensDaSolicitacao r={r} nomeDoProduto={nomeDoProduto} />

                      {t.ciclo !== null && (
                        <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-5">
                          <TempoDoCiclo rotulo="Espera empilh." minutos={t.esperaEmpilhadeira} />
                          <TempoDoCiclo rotulo="Transporte" minutos={t.transporte} />
                          <TempoDoCiclo rotulo="Espera ajudante" minutos={t.esperaAjudante} />
                          <TempoDoCiclo rotulo="Abastecimento" minutos={t.abastecimento} />
                          <TempoDoCiclo rotulo="Ciclo" minutos={t.ciclo} destaque />
                        </dl>
                      )}

                      {r.canceladoEm ? (
                        <p className="mt-2 text-xs text-slate-500">Motivo: {r.motivo}</p>
                      ) : (
                        estaAberta(r) &&
                        !r.abastecimentoInicio && (
                          <form action={cancelarSolicitacao} className="mt-3 flex gap-2">
                            <input type="hidden" name="id" value={r.id} />
                            <input
                              name="motivo"
                              required
                              maxLength={200}
                              placeholder="Motivo do cancelamento"
                              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
                            />
                            <BotaoEnviar className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                              Cancelar
                            </BotaoEnviar>
                          </form>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---------------- FILA DA EMPILHADEIRA ---------------- */}
      {aba === "fila" && podeTransportar && (
        <section className="space-y-3">
          {/* O que ESTE operador já aceitou vem primeiro: é o trabalho na
              mão dele, e procurá-lo no meio da fila dos outros seria o
              caminho mais longo para a tarefa mais urgente. */}
          {filaDeTransporte
            .filter((r) => r.operadorId === perfil.id)
            .map((r) => (
              <CartaoTransporte key={r.id} r={r} nomeDoProduto={nomeDoProduto} agora={agora} meu />
            ))}

          {filaDeTransporte.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhuma solicitação esperando. Quando alguém pedir, aparece aqui.
            </p>
          ) : (
            filaDeTransporte
              .filter((r) => r.operadorId !== perfil.id)
              .map((r) => (
                <CartaoTransporte key={r.id} r={r} nomeDoProduto={nomeDoProduto} agora={agora} />
              ))
          )}
        </section>
      )}

      {/* ---------------- VISÃO 1, 2 e 3: LANÇAR ---------------- */}
      {aba === "lancar" && (
        <section className="space-y-6">
          {/* O que a empilhadeira já deixou na área, esperando alguém
              abastecer. Fica ANTES do formulário de iniciar do zero: se
              tem material posto no chão esperando, é isso que a pessoa
              deveria pegar primeiro. */}
          {!aberta && esperandoNaArea.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
                📍 Esperando na área ({esperandoNaArea.length})
              </h2>
              <div className="space-y-3">
                {esperandoNaArea.map((r) => (
                  <div key={r.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <CabecalhoDaSolicitacao r={r} agora={agora} />
                    <ItensDaSolicitacao r={r} nomeDoProduto={nomeDoProduto} />
                    <form action={iniciarAbastecimentoDaSolicitacao} className="mt-3 flex gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <select
                        name="turno"
                        defaultValue={turnoAtual(agora)}
                        aria-label="Turno"
                        className="w-auto rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
                      >
                        {TURNOS.map((t) => (
                          <option key={t} value={t}>{ROTULO_TURNO[t]}</option>
                        ))}
                      </select>
                      <BotaoEnviar className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark">
                        🛒 Abastecer esta solicitação
                      </BotaoEnviar>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          {aberta ? (
            <SessaoEmAndamento
              sessao={aberta}
              itens={itensPorSessao.get(aberta.id) ?? []}
              resumo={resumir(aberta)}
              produtoPorId={produtoPorId}
              clusters={clusters}
              tipos={tipos}
              clusterInicial={clusters.includes(clusterCookie) ? clusterCookie : ""}
              tipoInicial={tipos.includes(tipoCookie) ? tipoCookie : ""}
            />
          ) : (
            <>
              {/* Tipo é escolha de ANTES: o abastecimento completo e o
                  ressuprimento pontual têm ritmos diferentes, e misturar
                  os dois num indicador só esconde os dois. */}
              <nav className="grid grid-cols-2 gap-2">
                {TIPOS_ABASTECIMENTO.map((t) => (
                  <a
                    key={t}
                    href={`?tipo=${t}`}
                    aria-current={t === tipoEscolhido ? "page" : undefined}
                    className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-3 text-center text-sm font-semibold ${
                      t === tipoEscolhido
                        ? "bg-primary text-white ring-2 ring-primary/30 ring-offset-1"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span className="text-lg leading-none">{TIPO_ABASTECIMENTO[t].emoji}</span>
                    {TIPO_ABASTECIMENTO[t].curto}
                  </a>
                ))}
              </nav>

              <details className="rounded-2xl border border-slate-200 bg-white">
                <summary className="cursor-pointer list-none p-3 text-xs font-semibold text-primary-dark marker:content-none [&::-webkit-details-marker]:hidden">
                  ℹ️ Quando usar {TIPO_ABASTECIMENTO[tipoEscolhido].curto.toLowerCase()} e quando parar o cronômetro
                </summary>
                <div className="space-y-2 border-t border-slate-100 p-3 text-xs">
                  <p className="text-slate-700">{TIPO_ABASTECIMENTO[tipoEscolhido].descricao}</p>
                  <p className="text-slate-700">
                    <strong className="text-green-700">▶️ Comece a contar quando:</strong> pegar o primeiro palete
                    no estoque para levar ao picking.
                  </p>
                  <p className="text-slate-700">
                    <strong className="text-red-700">⏹️ Pare de contar quando:</strong> o último produto estiver
                    posicionado no picking e você informar os itens aqui.
                  </p>
                  <p className="text-slate-500">
                    <strong>Não entra:</strong> parada para refeição, conferência de inventário e reorganização de
                    endereço -- são outras atividades.
                  </p>
                </div>
              </details>

              <form
                action={iniciarAbastecimento}
                className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <input type="hidden" name="tipo" value={tipoEscolhido} />

                <div>
                  <span className={rotulo}>Turno</span>
                  <div className="grid grid-cols-3 gap-2">
                    {TURNOS.map((t) => (
                      <label
                        key={t}
                        className="flex cursor-pointer items-center justify-center rounded-xl border border-slate-300 py-2 text-sm font-semibold text-slate-700 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary-dark"
                      >
                        <input
                          type="radio"
                          name="turno"
                          value={t}
                          defaultChecked={t === turnoAtual()}
                          className="sr-only"
                        />
                        {ROTULO_TURNO[t]}
                      </label>
                    ))}
                  </div>
                </div>

                <BotaoEnviar
                  textoEnviando="Iniciando..."
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  ▶️ Iniciar {TIPO_ABASTECIMENTO[tipoEscolhido].curto.toLowerCase()}
                </BotaoEnviar>
              </form>
            </>
          )}

          <div>
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Meus últimos abastecimentos</h2>
            {minhas.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Você ainda não finalizou nenhum abastecimento.
              </p>
            ) : (
              <ul className="space-y-2">
                {minhas.map((s) => (
                  <LinhaSessao
                    key={s.id}
                    sessao={s}
                    resumo={resumir(s)}
                    itens={itensPorSessao.get(s.id) ?? []}
                    produtoPorId={produtoPorId}
                    podeExcluir={s.colaborador_id === perfil.id || podeExcluirQualquer}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ---------------- VISÃO 4: HISTÓRICO ---------------- */}
      {aba === "historico" && (
        <section>
          <FiltroPeriodo aba="historico" de={de} ate={ate} turno={turnoFiltro} colab={colab} contadores={contadores} />

          {doPeriodo.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum abastecimento no período.</p>
          ) : (
            <>
              <ResumoDoPeriodo sessoes={doPeriodo} resumir={resumir} />
              <ul className="space-y-2">
                {doPeriodo.map((s) => (
                  <LinhaSessao
                    key={s.id}
                    sessao={s}
                    resumo={resumir(s)}
                    itens={itensPorSessao.get(s.id) ?? []}
                    produtoPorId={produtoPorId}
                    podeExcluir={s.colaborador_id === perfil.id || podeExcluirQualquer}
                    mostrarColaborador
                  />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ---------------- VISÃO 5: RANKING DE SKU ---------------- */}
      {aba === "ranking" && (
        <section>
          <FiltroPeriodo aba="ranking" de={de} ate={ate} turno={turnoFiltro} colab={colab} contadores={contadores} />
          <RankingSku
            sessoes={doPeriodo}
            itensPorSessao={itensPorSessao}
            produtoPorId={produtoPorId}
          />
        </section>
      )}
    </div>
  );
}

// ==================== COMPONENTES ====================

type ProdutoLinha = {
  id: string;
  codigo: string;
  descricao: string;
  cluster_produto: string | null;
  tipo: string | null;
  caixas_pallet: number | null;
};

/** Mesmo formato de filtro do Repack: De/Até + selects, num form GET. */
function FiltroPeriodo({
  aba,
  de,
  ate,
  turno,
  colab,
  contadores,
}: {
  aba: string;
  de: string;
  ate: string;
  turno: string;
  colab: string;
  contadores: Map<string, string>;
}) {
  return (
    <form method="get" className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
      <input type="hidden" name="aba" value={aba} />
      <div className="min-w-0">
        <label className={rotulo} htmlFor="de">De</label>
        <input id="de" type="date" name="de" defaultValue={de} className={`${campo} sm:w-auto`} />
      </div>
      <div className="min-w-0">
        <label className={rotulo} htmlFor="ate">Até</label>
        <input id="ate" type="date" name="ate" defaultValue={ate} className={`${campo} sm:w-auto`} />
      </div>
      <div className="col-span-2 min-w-0 sm:col-span-1 sm:min-w-[9rem]">
        <label className={rotulo} htmlFor="turno">Turno</label>
        <select id="turno" name="turno" defaultValue={turno} className={campo}>
          <option value="">Todos</option>
          {TURNOS.map((t) => (
            <option key={t} value={t}>{ROTULO_TURNO[t]}</option>
          ))}
        </select>
      </div>
      <div className="col-span-2 min-w-0 sm:col-span-1 sm:min-w-[10rem] sm:flex-1">
        <label className={rotulo} htmlFor="colab">Colaborador</label>
        <select id="colab" name="colab" defaultValue={colab} className={campo}>
          <option value="">Todos</option>
          {[...contadores].map(([id, nome]) => (
            <option key={id} value={id}>{nome}</option>
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
  );
}

/** Visão 2 + 3: a sessão aberta e os itens já informados nela. */
function SessaoEmAndamento({
  sessao,
  itens,
  resumo,
  produtoPorId,
  clusters,
  tipos,
  clusterInicial,
  tipoInicial,
}: {
  sessao: Sessao;
  itens: Item[];
  resumo: ReturnType<typeof resumirAbastecimento>;
  produtoPorId: Map<string, ProdutoLinha>;
  clusters: string[];
  tipos: string[];
  clusterInicial: string;
  tipoInicial: string;
}) {
  const tipo: TipoAbastecimento = ehTipoAbastecimento(sessao.tipo) ? sessao.tipo : "completo";

  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div>
        <p className="text-sm font-bold text-amber-900">
          🕐 {TIPO_ABASTECIMENTO[tipo].rotulo} em andamento —{" "}
          {ROTULO_TURNO[sessao.turno as keyof typeof ROTULO_TURNO] ?? sessao.turno}
        </p>
        <p className="text-xs text-amber-800">Iniciado às {formatarDataHora(sessao.inicio)}</p>
        {/* Os itens desta sessão já vieram preenchidos, e sem esta linha a
            pessoa abriria a tela sem entender de onde saíram -- ou
            apagaria tudo achando que era lançamento de outro. */}
        {sessao.ressuprimento_id && (
          <p className="mt-1 text-xs font-medium text-amber-900">
            🧾 Veio de uma solicitação. Os itens já estão lançados — remova o que você não
            chegou a abastecer e finalize.
          </p>
        )}
      </div>

      {/* Os números vivos da sessão. HL/h só aparece com item lançado --
          antes disso seria uma divisão por HL zero disfarçada de meta. */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Numero titulo="HL" valor={formatarHl(resumo.hl)} />
        <Numero titulo="Paletes" valor={resumo.paletes.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} />
        <Numero titulo="Tempo" valor={formatarMinutos(resumo.minutos)} />
      </div>

      {/* --- Visão 3: itens da sessão --- */}
      {itens.length > 0 && (
        <ul className="space-y-1.5">
          {itens.map((i) => {
            const p = produtoPorId.get(i.produto_id);
            const unidade = i.unidade as UnidadeAbastecimento;
            return (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{p?.descricao ?? "produto removido"}</p>
                  <p className="text-xs text-slate-500">
                    {i.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                    {ROTULO_UNIDADE_ABASTECIMENTO_CURTO[unidade] ?? i.unidade} · {formatarHl(i.hl_calculado)} HL
                  </p>
                </div>
                <BotaoExcluir
                  action={removerItem}
                  campos={{ id: i.id }}
                  confirmacao="Remover este item do abastecimento?"
                  className="shrink-0 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Remover
                </BotaoExcluir>
              </li>
            );
          })}
        </ul>
      )}

      {/* --- Acrescentar item --- */}
      {/*
        Sessão que veio de uma solicitação NÃO aceita produto novo.
        Pedido do dono (02/09/2026): o que se abastece é o que foi pedido.
        Deixar acrescentar transformaria o pedido num rascunho -- alguém
        aproveitaria a sessão aberta para lançar mais um item que ninguém
        pediu, e o tempo de ciclo passaria a medir dois trabalhos
        diferentes como se fossem um. Precisa de outro produto? Nova
        solicitação, do zero, e a empilhadeira busca.

        Remover continua valendo: é o registro honesto de "este item não
        foi abastecido", e sem ele a única saída seria lançar quantidade
        que não aconteceu.
      */}
      {sessao.ressuprimento_id ? (
        <p className="rounded-xl bg-white p-3 text-xs text-slate-500">
          🧾 Este abastecimento atende a uma solicitação, então a lista é a que foi pedida. Se
          faltou alguma coisa, abra uma nova solicitação — a empilhadeira busca.
        </p>
      ) : (
      <form action={adicionarItem} className="space-y-3 rounded-xl bg-white p-3">
        <input type="hidden" name="abastecimento_id" value={sessao.id} />
        <p className="text-xs font-semibold uppercase text-slate-500">Acrescentar produto</p>

        <ComboboxProdutoReepack
          clusters={clusters}
          tipos={tipos}
          clusterInicial={clusterInicial}
          tipoInicial={tipoInicial}
          buscarProdutos={buscarProdutosAbastecimento}
          cookiePath={COOKIE_ABASTECIMENTO_PATH}
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={rotulo} htmlFor="unidade">Unidade</label>
            <select id="unidade" name="unidade" defaultValue="palete" className={campo}>
              {UNIDADES_ABASTECIMENTO.map((u) => (
                <option key={u} value={u}>{ROTULO_UNIDADE_ABASTECIMENTO[u]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={rotulo} htmlFor="quantidade">Quantidade</label>
            <input
              id="quantidade"
              name="quantidade"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              required
              className={campo}
            />
          </div>
        </div>

        <BotaoEnviar
          textoEnviando="Adicionando..."
          className="w-full rounded-xl border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary-soft"
        >
          + Adicionar item
        </BotaoEnviar>
      </form>
      )}

      {/* --- Finalizar --- */}
      <form action={finalizarAbastecimento} className="space-y-3">
        <input type="hidden" name="id" value={sessao.id} />
        <div>
          <label className={rotulo} htmlFor="observacao">Observação (opcional)</label>
          <input id="observacao" name="observacao" maxLength={300} className={campo} />
        </div>
        <BotaoEnviar
          textoEnviando="Finalizando..."
          className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
        >
          ⏹️ Finalizar abastecimento
        </BotaoEnviar>
        {itens.length === 0 && (
          <p className="text-center text-xs text-amber-800">
            Informe pelo menos um produto antes de finalizar.
          </p>
        )}
      </form>

      <BotaoExcluir
        action={cancelarAbastecimento}
        campos={{ id: sessao.id }}
        confirmacao="Cancelar este abastecimento? Ele será apagado, sem contar como produção."
        rotuloConfirmar="Cancelar"
        className="w-full rounded-xl border border-amber-300 px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
      >
        Cancelar (comecei por engano)
      </BotaoExcluir>
    </div>
  );
}

function Numero({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white p-2">
      <p className="text-[11px] font-semibold uppercase text-slate-400">{titulo}</p>
      <p className="truncate text-lg font-bold text-slate-900">{valor}</p>
    </div>
  );
}

/** Os totais do recorte filtrado, acima da lista. */
function ResumoDoPeriodo({
  sessoes,
  resumir,
}: {
  sessoes: Sessao[];
  resumir: (s: Sessao) => ReturnType<typeof resumirAbastecimento>;
}) {
  const resumos = sessoes.map(resumir);
  const hl = resumos.reduce((s, r) => s + r.hl, 0);
  const paletes = resumos.reduce((s, r) => s + r.paletes, 0);
  const minutos = resumos.reduce((s, r) => s + r.minutos, 0);
  const horas = minutos / 60;

  const media = mediaHlPorDia(
    sessoes.map((s, i) => ({ dia: diaLocalISO(s.inicio), hl: resumos[i].hl })),
  );

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Cartao titulo="HL abastecido" valor={`${formatarHl(hl)} HL`} rodape={`${sessoes.length} sessões`} />
      <Cartao
        titulo="HL por hora"
        valor={horas > 0 ? `${(hl / horas).toFixed(1)}` : "—"}
        rodape={`em ${formatarMinutos(minutos)}`}
      />
      <Cartao
        titulo="Média por dia"
        valor={media !== null ? `${formatarHl(media)} HL` : "—"}
        rodape="só dias com movimento"
      />
      <Cartao
        titulo="Paletes"
        valor={paletes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
        rodape="caixa vira fração"
      />
    </div>
  );
}

function Cartao({ titulo, valor, rodape }: { titulo: string; valor: string; rodape: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase text-slate-400">{titulo}</p>
      <p className="truncate text-xl font-bold text-slate-900">{valor}</p>
      <p className="truncate text-[11px] text-slate-400">{rodape}</p>
    </div>
  );
}

/** Uma sessão finalizada, com os itens dobráveis. */
function LinhaSessao({
  sessao,
  resumo,
  itens,
  produtoPorId,
  podeExcluir,
  mostrarColaborador = false,
}: {
  sessao: Sessao;
  resumo: ReturnType<typeof resumirAbastecimento>;
  itens: Item[];
  produtoPorId: Map<string, ProdutoLinha>;
  podeExcluir: boolean;
  mostrarColaborador?: boolean;
}) {
  const tipo: TipoAbastecimento = ehTipoAbastecimento(sessao.tipo) ? sessao.tipo : "completo";

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            <span className="mr-1">{TIPO_ABASTECIMENTO[tipo].emoji}</span>
            {formatarHl(resumo.hl)} HL ·{" "}
            {resumo.paletes.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} pl ·{" "}
            {ROTULO_TURNO[sessao.turno as keyof typeof ROTULO_TURNO] ?? sessao.turno}
          </p>
          <p className="text-[11px] font-semibold uppercase text-slate-400">
            {TIPO_ABASTECIMENTO[tipo].rotulo}
          </p>
          <p className="text-xs text-slate-500">
            {formatarDataHora(sessao.inicio)} · {formatarMinutos(resumo.minutos)}
            {mostrarColaborador ? ` — ${sessao.colaborador_nome}` : ""}
          </p>
          {sessao.observacao && <p className="mt-1 text-xs text-slate-500">{sessao.observacao}</p>}

          {itens.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer list-none text-xs font-semibold text-primary marker:content-none [&::-webkit-details-marker]:hidden">
                Ver {itens.length} {itens.length === 1 ? "item" : "itens"}
              </summary>
              <ul className="mt-1 space-y-0.5">
                {itens.map((i) => (
                  <li key={i.id} className="text-xs text-slate-600">
                    {produtoPorId.get(i.produto_id)?.descricao ?? "produto removido"} —{" "}
                    {i.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                    {ROTULO_UNIDADE_ABASTECIMENTO_CURTO[i.unidade as UnidadeAbastecimento] ?? i.unidade} ·{" "}
                    {formatarHl(i.hl_calculado)} HL
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700"
            title="HL por hora, extrapolado da duração real da sessão"
          >
            {resumo.hlPorHora !== null ? `${resumo.hlPorHora.toFixed(1)} HL/h` : "—"}
          </span>
          {resumo.minutosPorHl !== null && (
            <span className="rounded-lg bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500" title="Minutos gastos por HL abastecido">
              {resumo.minutosPorHl.toFixed(1)} min/HL
            </span>
          )}
          {podeExcluir && (
            <BotaoExcluir
              action={excluirAbastecimento}
              campos={{ id: sessao.id }}
              confirmacao="Excluir este abastecimento e todos os itens dele?"
              className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              Excluir
            </BotaoExcluir>
          )}
        </div>
      </div>
    </li>
  );
}

/** Visão 5: soma de HL por produto no período filtrado. */
function RankingSku({
  sessoes,
  itensPorSessao,
  produtoPorId,
}: {
  sessoes: Sessao[];
  itensPorSessao: Map<string, Item[]>;
  produtoPorId: Map<string, ProdutoLinha>;
}) {
  const todos = sessoes.flatMap((s) =>
    (itensPorSessao.get(s.id) ?? []).map((i) => ({
      produtoId: i.produto_id,
      abastecimentoId: s.id,
      hl: i.hl_calculado,
      paletes: i.unidade === "palete"
        ? i.quantidade
        : (() => {
            const cp = produtoPorId.get(i.produto_id)?.caixas_pallet;
            return cp && cp > 0 ? i.quantidade / cp : 0;
          })(),
    })),
  );

  const linhas = rankingDeSku(todos);
  if (linhas.length === 0) {
    return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum item abastecido no período.</p>;
  }

  const maior = linhas[0].hl;

  return (
    <>
      <p className="mb-3 text-xs text-slate-500">
        O SKU que mais consome HL puxa o volume; o que aparece em mais sessões puxa o tempo -- esse é o
        candidato a mudar de endereço no picking, mesmo com HL menor.
      </p>
      <ol className="space-y-2">
        {linhas.map((l, i) => {
          const p = produtoPorId.get(l.produtoId);
          return (
            <li key={l.produtoId} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    <span className="mr-1 text-slate-400">{i + 1}º</span>
                    {p?.descricao ?? "produto removido"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p?.codigo ? `${p.codigo} · ` : ""}
                    {l.paletes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} paletes ·{" "}
                    {l.sessoes} {l.sessoes === 1 ? "sessão" : "sessões"}
                  </p>
                </div>
                <span className="shrink-0 rounded-lg bg-primary-soft px-2 py-1 text-sm font-bold text-primary-dark">
                  {formatarHl(l.hl)} HL
                </span>
              </div>
              {/* Barra proporcional ao 1º lugar -- dá a leitura de "quanto
                  maior que o resto" sem precisar comparar números. */}
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${maior > 0 ? Math.max((l.hl / maior) * 100, 2) : 0}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
