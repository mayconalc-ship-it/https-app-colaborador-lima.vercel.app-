import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { ComboboxProdutoReepack } from "@/components/produtividade-armazem/ComboboxProdutoReepack";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { podeNoModulo, requireAcessoModulo } from "@/lib/require-admin";
import {
  COOKIE_REEPACK_CLUSTER,
  COOKIE_REEPACK_TIPO,
  ROTULO_TURNO,
  TURNOS,
  diasAtrasISO,
  ehTurno,
  formatarDataHora,
  hojeISO,
  turnoAtual,
} from "@/lib/produtividade-armazem";
import { formatarHl, formatarMinutos } from "@/lib/abastecimento";
import {
  COOKIE_BATE_PALETE_PATH,
  avariaPorProduto,
  mediaPaletesPorDia,
  pctAvariaDoPalete,
  resumirBatePalete,
} from "@/lib/bate-palete";
import {
  buscarProdutosBatePalete,
  cancelarBatePalete,
  excluirBatePalete,
  finalizarBatePalete,
  iniciarBatePalete,
  registrarPalete,
  removerPalete,
} from "./actions";

export const dynamic = "force-dynamic";

type Aba = "lancar" | "historico" | "analise";
const ABAS: Aba[] = ["lancar", "historico", "analise"];

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type Sessao = {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  turno: string;
  inicio: string;
  fim: string | null;
  observacao: string | null;
};

type ItemLinha = {
  id: string;
  bate_palete_id: string;
  produto_id: string;
  caixas_avariadas: number;
  caixas_repostas: number;
  hl_recuperado: number;
  observacao: string | null;
};

const COLUNAS_SESSAO = "id, colaborador_id, colaborador_nome, turno, inicio, fim, observacao";
const COLUNAS_ITEM =
  "id, bate_palete_id, produto_id, caixas_avariadas, caixas_repostas, hl_recuperado, observacao";

type ProdutoLinha = {
  id: string;
  codigo: string;
  descricao: string;
  cluster_produto: string | null;
  tipo: string | null;
  caixas_pallet: number | null;
};

export default async function BatePaletePage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    de?: string;
    ate?: string;
    turno?: string;
    erro?: string;
    sucesso?: string;
  }>;
}) {
  const perfil = await requireAcessoModulo("pa-bate-palete");

  const sp = await searchParams;
  const aba: Aba = ABAS.includes(sp.aba as Aba) ? (sp.aba as Aba) : "lancar";
  const de = sp.de ?? diasAtrasISO(30);
  const ate = sp.ate ?? hojeISO();
  const turnoFiltro = ehTurno(sp.turno) ? sp.turno : "";

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const precisaPeriodo = aba === "historico" || aba === "analise";

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
        .from("pa_bate_palete")
        .select(COLUNAS_SESSAO)
        .eq("revenda_id", revendaId)
        .eq("colaborador_id", perfil.id)
        .is("fim", null)
        .maybeSingle(),
      supabase
        .from("pa_bate_palete")
        .select(COLUNAS_SESSAO)
        .eq("revenda_id", revendaId)
        .eq("colaborador_id", perfil.id)
        .not("fim", "is", null)
        .order("fim", { ascending: false })
        .limit(10),
      precisaPeriodo
        ? (() => {
            let q = supabase
              .from("pa_bate_palete")
              .select(COLUNAS_SESSAO)
              .eq("revenda_id", revendaId)
              .not("fim", "is", null)
              // O dia digitado é o da operação (UTC-3), não o do servidor
              // (a Vercel roda em UTC) -- sem o -03:00 explícito, "hoje"
              // perderia o que foi lançado depois das 21h.
              .gte("inicio", `${de}T00:00:00-03:00`)
              .lte("inicio", `${ate}T23:59:59-03:00`);
            if (turnoFiltro) q = q.eq("turno", turnoFiltro);
            return q.order("inicio", { ascending: false }).limit(300);
          })()
        : Promise.resolve({ data: null }),
      podeNoModulo("produtividade-armazem", "excluir"),
    ]);

  const produtos = (produtosBanco ?? []) as ProdutoLinha[];
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const clusters = [
    ...new Set(produtos.map((p) => p.cluster_produto).filter((c): c is string => Boolean(c))),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const tipos = [...new Set(produtos.map((p) => p.tipo).filter((t): t is string => Boolean(t)))].sort();

  // O filtro Cluster/Tipo é lembrado do último uso, igual ao Repack -- e
  // quem lê o cookie PRIMEIRO é o servidor, senão a pessoa recomeça o
  // filtro a cada palete que registra.
  const jar = await cookies();
  const clusterCookie = decodeURIComponent(jar.get(COOKIE_REEPACK_CLUSTER)?.value ?? "");
  const tipoCookie = decodeURIComponent(jar.get(COOKIE_REEPACK_TIPO)?.value ?? "");

  const aberta = abertaBanco as Sessao | null;
  const minhas = (minhasBanco ?? []) as Sessao[];
  const doPeriodo = (periodoBanco ?? []) as Sessao[];

  const ids = [...(aberta ? [aberta.id] : []), ...minhas.map((s) => s.id), ...doPeriodo.map((s) => s.id)];
  const { data: itensBanco } = ids.length
    ? await supabase.from("pa_bate_palete_itens").select(COLUNAS_ITEM).in("bate_palete_id", ids)
    : { data: [] };

  const itens = (itensBanco ?? []) as ItemLinha[];
  const itensPorSessao = new Map<string, ItemLinha[]>();
  for (const i of itens) {
    itensPorSessao.set(i.bate_palete_id, [...(itensPorSessao.get(i.bate_palete_id) ?? []), i]);
  }

  const resumir = (s: Sessao) =>
    resumirBatePalete(
      s.inicio,
      s.fim,
      (itensPorSessao.get(s.id) ?? []).map((i) => ({
        caixasAvariadas: i.caixas_avariadas,
        caixasRepostas: i.caixas_repostas,
        hlRecuperado: i.hl_recuperado,
      })),
    );

  return (
    <div>
      <PageHeader
        title="🪵 Bate Palete"
        subtitle="Tire as caixas avariadas, complete com as boas e registre cada palete."
        fecharHref="/produtividade-armazem"
      />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      <nav className="mb-4 flex flex-wrap gap-2">
        {([["lancar", "Lançar"], ["historico", "Histórico"], ["analise", "Análise"]] as [Aba, string][]).map(
          ([a, texto]) => (
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
            </a>
          ),
        )}
      </nav>

      {/* ---------------- LANÇAR ---------------- */}
      {aba === "lancar" && (
        <section className="space-y-4">
          {aberta ? (
            <SessaoAberta
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
              <details className="rounded-2xl border border-slate-200 bg-white">
                <summary className="cursor-pointer list-none p-3 text-xs font-semibold text-primary-dark marker:content-none [&::-webkit-details-marker]:hidden">
                  ℹ️ O que conta como bate palete, e quando parar o cronômetro
                </summary>
                <div className="space-y-2 border-t border-slate-100 p-3 text-xs">
                  <p className="text-slate-700">
                    Palete que chegou avariado da fábrica: tirar as caixas quebradas, completar com
                    caixas boas e devolver o palete inteiro para o estoque.
                  </p>
                  <p className="text-slate-700">
                    <strong className="text-green-700">▶️ Comece a contar</strong> ao puxar o primeiro
                    palete avariado.
                  </p>
                  <p className="text-slate-700">
                    <strong className="text-red-700">⏹️ Pare de contar</strong> quando o último palete
                    estiver montado e você tiver registrado todos aqui.
                  </p>
                  {/* A fronteira com a Seleção e Triagem, dita na tela e não
                      só no código: são duas atividades vizinhas, e contar a
                      mesma hora nas duas estraga os dois indicadores. */}
                  <p className="text-slate-500">
                    <strong>Não entra:</strong> inspecionar unidade por unidade, lavar, secar e
                    reembalar — isso é <strong>Seleção e Triagem</strong>, no módulo Reepack.
                  </p>
                </div>
              </details>

              <form action={iniciarBatePalete} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
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
                  className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-white hover:bg-primary-dark"
                >
                  ▶️ Iniciar bate palete
                </BotaoEnviar>
              </form>
            </>
          )}

          <div>
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Meus últimos bate paletes</h2>
            {minhas.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Você ainda não finalizou nenhum bate palete.
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

      {/* ---------------- HISTÓRICO ---------------- */}
      {aba === "historico" && (
        <section>
          <Filtro aba="historico" de={de} ate={ate} turno={turnoFiltro} />
          {doPeriodo.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhum bate palete no período.
            </p>
          ) : (
            <ul className="space-y-2">
              {doPeriodo.map((s) => (
                <LinhaSessao
                  key={s.id}
                  sessao={s}
                  resumo={resumir(s)}
                  itens={itensPorSessao.get(s.id) ?? []}
                  produtoPorId={produtoPorId}
                  podeExcluir={s.colaborador_id === perfil.id || podeExcluirQualquer}
                  mostrarAutor
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------------- ANÁLISE ---------------- */}
      {aba === "analise" && (
        <section className="space-y-4">
          <Filtro aba="analise" de={de} ate={ate} turno={turnoFiltro} />
          <Analise
            sessoes={doPeriodo}
            itensPorSessao={itensPorSessao}
            produtoPorId={produtoPorId}
            resumir={resumir}
          />
        </section>
      )}
    </div>
  );
}

/* ==================== COMPONENTES ==================== */

function Filtro({ aba, de, ate, turno }: { aba: Aba; de: string; ate: string; turno: string }) {
  return (
    <form method="get" className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex sm:flex-wrap sm:items-end">
      <input type="hidden" name="aba" value={aba} />
      <div className="min-w-0">
        <label className={rotulo} htmlFor="de">De</label>
        <input id="de" type="date" name="de" defaultValue={de} className={campo} />
      </div>
      <div className="min-w-0">
        <label className={rotulo} htmlFor="ate">Até</label>
        <input id="ate" type="date" name="ate" defaultValue={ate} className={campo} />
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
      <button type="submit" className="col-span-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white sm:col-span-1">
        Filtrar
      </button>
    </form>
  );
}

function SessaoAberta({
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
  itens: ItemLinha[];
  resumo: ReturnType<typeof resumirBatePalete>;
  produtoPorId: Map<string, ProdutoLinha>;
  clusters: string[];
  tipos: string[];
  clusterInicial: string;
  tipoInicial: string;
}) {
  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div>
        <p className="text-sm font-bold text-amber-900">
          🕐 Bate palete em andamento — {ROTULO_TURNO[sessao.turno as keyof typeof ROTULO_TURNO] ?? sessao.turno}
        </p>
        <p className="text-xs text-amber-800">Iniciado às {formatarDataHora(sessao.inicio)}</p>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <Numero titulo="Paletes" valor={String(resumo.paletes)} />
        <Numero titulo="Tiradas" valor={String(resumo.caixasAvariadas)} />
        <Numero titulo="Repostas" valor={String(resumo.caixasRepostas)} />
        <Numero titulo="Tempo" valor={formatarMinutos(resumo.minutos)} />
      </div>

      {itens.length > 0 && (
        <ul className="space-y-1.5">
          {itens.map((i) => {
            const p = produtoPorId.get(i.produto_id);
            const pct = pctAvariaDoPalete(i.caixas_avariadas, {
              fatorHecto: null,
              caixasPallet: p?.caixas_pallet ?? null,
            });
            return (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {p?.descricao ?? "produto removido"}
                  </p>
                  <p className="text-xs text-slate-500">
                    −{i.caixas_avariadas} avariadas · +{i.caixas_repostas} boas
                    {pct !== null && ` · ${pct.toLocaleString("pt-BR")}% do palete`}
                  </p>
                  {i.observacao && <p className="text-xs text-slate-400">📝 {i.observacao}</p>}
                </div>
                <BotaoExcluir
                  action={removerPalete}
                  campos={{ id: i.id }}
                  confirmacao="Remover este palete do lançamento?"
                  className="shrink-0 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Remover
                </BotaoExcluir>
              </li>
            );
          })}
        </ul>
      )}

      {/* --- Registrar um palete --- */}
      <form action={registrarPalete} className="space-y-3 rounded-xl bg-white p-3">
        <input type="hidden" name="bate_palete_id" value={sessao.id} />
        <p className="text-xs font-semibold uppercase text-slate-500">Registrar um palete</p>

        <ComboboxProdutoReepack
          clusters={clusters}
          tipos={tipos}
          clusterInicial={clusterInicial}
          tipoInicial={tipoInicial}
          buscarProdutos={buscarProdutosBatePalete}
          cookiePath={COOKIE_BATE_PALETE_PATH}
        />

        {/* As duas metades da atividade, lado a lado: o que saiu e o que
            entrou. Separadas porque contam histórias diferentes -- a soma
            é o esforço, a diferença denuncia palete que voltou incompleto. */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={rotulo} htmlFor="caixas_avariadas">Caixas tiradas (avariadas)</label>
            <input
              id="caixas_avariadas"
              name="caixas_avariadas"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              defaultValue="0"
              required
              className={campo}
            />
          </div>
          <div>
            <label className={rotulo} htmlFor="caixas_repostas">Caixas repostas (boas)</label>
            <input
              id="caixas_repostas"
              name="caixas_repostas"
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              defaultValue="0"
              required
              className={campo}
            />
          </div>
        </div>

        <div>
          <label className={rotulo} htmlFor="obs-item">Observação (opcional)</label>
          <input id="obs-item" name="observacao" maxLength={200} placeholder="Ex.: palete veio tombado" className={campo} />
        </div>

        <BotaoEnviar
          textoEnviando="Registrando..."
          className="w-full rounded-xl border-2 border-primary bg-primary-soft px-4 py-3 text-sm font-bold text-primary-dark hover:bg-primary-soft/70"
        >
          ➕ Registrar palete
        </BotaoEnviar>
      </form>

      {/* --- Finalizar --- */}
      <form action={finalizarBatePalete} className="space-y-3">
        <input type="hidden" name="id" value={sessao.id} />
        <div>
          <label className={rotulo} htmlFor="observacao">Observação (opcional)</label>
          <input id="observacao" name="observacao" maxLength={300} className={campo} />
        </div>
        <BotaoEnviar
          textoEnviando="Finalizando..."
          className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-white hover:bg-primary-dark"
        >
          ⏹️ Finalizar bate palete
        </BotaoEnviar>
      </form>

      <BotaoExcluir
        action={cancelarBatePalete}
        campos={{ id: sessao.id }}
        confirmacao="Cancelar este bate palete? Ele será apagado, sem contar como produção."
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
      >
        Cancelar sem registrar
      </BotaoExcluir>
    </div>
  );
}

function Numero({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white p-2">
      <p className="truncate text-[10px] uppercase text-slate-400">{titulo}</p>
      <p className="text-base font-bold tabular-nums text-slate-900">{valor}</p>
    </div>
  );
}

function LinhaSessao({
  sessao,
  resumo,
  itens,
  produtoPorId,
  podeExcluir,
  mostrarAutor = false,
}: {
  sessao: Sessao;
  resumo: ReturnType<typeof resumirBatePalete>;
  itens: ItemLinha[];
  produtoPorId: Map<string, ProdutoLinha>;
  podeExcluir: boolean;
  mostrarAutor?: boolean;
}) {
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">
            {resumo.paletes} {resumo.paletes === 1 ? "palete" : "paletes"} ·{" "}
            {formatarHl(resumo.hlRecuperado)} HL recuperados
          </p>
          <p className="text-xs text-slate-500">
            {mostrarAutor && `${sessao.colaborador_nome} · `}
            {formatarDataHora(sessao.inicio)} · {formatarMinutos(resumo.minutos)} ·{" "}
            {ROTULO_TURNO[sessao.turno as keyof typeof ROTULO_TURNO] ?? sessao.turno}
          </p>
        </div>
        {podeExcluir && (
          <BotaoExcluir
            action={excluirBatePalete}
            campos={{ id: sessao.id }}
            confirmacao="Excluir este bate palete e todos os paletes dele?"
            className="shrink-0 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            Excluir
          </BotaoExcluir>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <Etiqueta>−{resumo.caixasAvariadas} cx avariadas</Etiqueta>
        <Etiqueta>+{resumo.caixasRepostas} cx boas</Etiqueta>
        {resumo.caixasPorHora !== null && (
          <Etiqueta destaque>{resumo.caixasPorHora.toLocaleString("pt-BR")} cx/h</Etiqueta>
        )}
        {resumo.minutosPorPalete !== null && (
          <Etiqueta>{formatarMinutos(resumo.minutosPorPalete)} por palete</Etiqueta>
        )}
      </div>

      {itens.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-400">
            Ver {itens.length} {itens.length === 1 ? "palete" : "paletes"}
          </summary>
          <ul className="mt-1.5 space-y-1">
            {itens.map((i) => (
              <li key={i.id} className="text-xs text-slate-600">
                {produtoPorId.get(i.produto_id)?.descricao ?? "produto removido"} — −
                {i.caixas_avariadas} / +{i.caixas_repostas} cx
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function Etiqueta({ children, destaque = false }: { children: React.ReactNode; destaque?: boolean }) {
  return (
    <span
      className={`rounded-lg px-2 py-0.5 ${
        destaque ? "bg-primary-soft font-bold text-primary-dark" : "bg-slate-50 text-slate-500"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * A análise da atividade.
 *
 * O número que interessa à gestão não é "quantos paletes" -- é QUAL
 * PRODUTO chega quebrado. Um SKU que aparece com 40 caixas avariadas em
 * todo palete tem problema de paletização ou de transporte, e nenhuma
 * melhoria no armazém resolve isso.
 */
function Analise({
  sessoes,
  itensPorSessao,
  produtoPorId,
  resumir,
}: {
  sessoes: Sessao[];
  itensPorSessao: Map<string, ItemLinha[]>;
  produtoPorId: Map<string, ProdutoLinha>;
  resumir: (s: Sessao) => ReturnType<typeof resumirBatePalete>;
}) {
  if (sessoes.length === 0) {
    return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum bate palete no período.</p>;
  }

  const todos = sessoes.flatMap((s) =>
    (itensPorSessao.get(s.id) ?? []).map((i) => ({
      produtoId: i.produto_id,
      caixasAvariadas: i.caixas_avariadas,
      caixasRepostas: i.caixas_repostas,
      hlRecuperado: i.hl_recuperado,
    })),
  );

  const resumos = sessoes.map(resumir);
  const paletes = resumos.reduce((s, r) => s + r.paletes, 0);
  const avariadas = resumos.reduce((s, r) => s + r.caixasAvariadas, 0);
  const repostas = resumos.reduce((s, r) => s + r.caixasRepostas, 0);
  const hl = Math.round(resumos.reduce((s, r) => s + r.hlRecuperado, 0) * 10) / 10;
  const minutos = resumos.reduce((s, r) => s + r.minutos, 0);
  const caixasHora = minutos > 0 ? Math.round(((avariadas + repostas) / (minutos / 60)) * 10) / 10 : null;

  const porDia = mediaPaletesPorDia(
    sessoes.map((s, i) => ({
      dia: new Date(s.inicio).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }),
      paletes: resumos[i].paletes,
    })),
  );

  const porProduto = avariaPorProduto(todos);
  const maior = porProduto[0]?.caixasAvariadas ?? 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cartao titulo="Paletes batidos" valor={String(paletes)} rodape={`${sessoes.length} sessões`} />
        <Cartao titulo="HL recuperados" valor={formatarHl(hl)} rodape="voltou a ser vendável" />
        <Cartao
          titulo="Ritmo"
          valor={caixasHora === null ? "—" : caixasHora.toLocaleString("pt-BR")}
          rodape="caixas tratadas por hora"
        />
        <Cartao
          titulo="Média por dia"
          valor={porDia === null ? "—" : porDia.toLocaleString("pt-BR")}
          rodape="paletes, só dias com movimento"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">De onde vem a avaria</h2>
        <p className="mb-3 mt-0.5 text-xs leading-relaxed text-slate-500">
          A média por palete é o número que aponta a origem: um SKU que chega sempre com muitas
          caixas quebradas tem problema de paletização ou de transporte — não de armazém.
        </p>
        <ol className="space-y-2">
          {porProduto.map((l) => {
            const p = produtoPorId.get(l.produtoId);
            return (
              <li key={l.produtoId} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug text-slate-900">
                      {p?.descricao ?? "produto removido"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {p?.codigo ? `${p.codigo} · ` : ""}
                      {l.paletes} {l.paletes === 1 ? "palete" : "paletes"} ·{" "}
                      <strong className="text-slate-700">
                        {l.avariaMediaPorPalete.toLocaleString("pt-BR")} cx avariadas por palete
                      </strong>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-red-50 px-2 py-1 text-sm font-bold text-red-700">
                    {l.caixasAvariadas} cx
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-red-500"
                    style={{ width: `${Math.max(2, (l.caixasAvariadas / maior) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
        <strong>{repostas}</strong> caixas boas entraram no lugar de <strong>{avariadas}</strong>{" "}
        avariadas.
        {repostas < avariadas &&
          " A diferença é palete que voltou para o estoque incompleto — vale conferir se foi falta de produto bom na hora."}
      </p>
    </div>
  );
}

function Cartao({ titulo, valor, rodape }: { titulo: string; valor: string; rodape?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className="truncate text-[11px] uppercase text-slate-400">{titulo}</p>
      <p className="text-xl font-bold tabular-nums text-slate-900">{valor}</p>
      {rodape && <p className="truncate text-[11px] text-slate-400">{rodape}</p>}
    </div>
  );
}
