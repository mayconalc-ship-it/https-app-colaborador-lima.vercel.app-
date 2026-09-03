import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { podeNoModulo, requireAcessoModulo } from "@/lib/require-admin";
import { ComboboxProdutoReepack } from "@/components/produtividade-armazem/ComboboxProdutoReepack";
import {
  COOKIE_REEPACK_CLUSTER,
  COOKIE_REEPACK_TIPO,
  ETAPAS_REEPACK,
  ETAPA_REEPACK,
  ROTULO_TURNO,
  ROTULO_TURNO_CURTO,
  TURNOS,
  ehEtapaReepack,
  type EtapaReepack,
  diasAtrasISO,
  formatarDataHora,
  formatarDuracao,
  hojeISO,
  pctDaMeta,
  produtoReepackDeLinha,
  taxaPorHora,
  turnoAtual,
  type ProdutoReepack,
} from "@/lib/produtividade-armazem";
import { cancelarReepack, editarReepack, excluirReepack, finalizarReepack, iniciarReepack } from "./actions";

export const dynamic = "force-dynamic";

type Aba = "lancar" | "historico";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

type Lancamento = {
  id: string;
  embalagem_id: string;
  produto_id: string | null;
  colaborador_id: string;
  colaborador_nome: string;
  turno: string;
  etapa: string;
  quantidade: number;
  litros_calculados: number | null;
  inicio: string;
  fim: string;
  observacao: string | null;
};

type Aberto = {
  id: string;
  produto_id: string | null;
  turno: string;
  etapa: string;
  inicio: string;
};

const COLUNAS_LANCAMENTO =
  "id, embalagem_id, produto_id, colaborador_id, colaborador_nome, turno, etapa, quantidade, litros_calculados, inicio, fim, observacao";

/** O card que explica onde começa e onde para o cronômetro. Sem isto,
 *  cada pessoa marca um ponto diferente e os tempos não se comparam --
 *  que é justamente o que a cronoanálise do POP-ARM-001 quer evitar. */
function CartaoGatilho({ etapa }: { etapa: EtapaReepack }) {
  const e = ETAPA_REEPACK[etapa];
  return (
    <details className="rounded-2xl border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none p-3 text-xs font-semibold text-primary-dark marker:content-none [&::-webkit-details-marker]:hidden">
        ℹ️ Quando começar e quando parar o cronômetro — {e.rotulo}
      </summary>
      <div className="space-y-2 border-t border-slate-100 p-3 text-xs">
        <div>
          <p className="text-slate-700">
            <strong className="text-green-700">▶️ Comece a contar quando:</strong> {e.inicio}
          </p>
          <p className="text-[11px] text-slate-400">{e.refInicio}</p>
        </div>
        <div>
          <p className="text-slate-700">
            <strong className="text-red-700">⏹️ Pare de contar quando:</strong> {e.fim}
          </p>
          <p className="text-[11px] text-slate-400">{e.refFim}</p>
        </div>
        <p className="text-slate-500">
          <strong>Não entra nesta etapa:</strong> {e.naoEntra}
        </p>
      </div>
    </details>
  );
}

export default async function ReepackPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    etapa?: string;
    de?: string;
    ate?: string;
    colab?: string;
    produto?: string;
    erro?: string;
    sucesso?: string;
  }>;
}) {
  const perfil = await requireAcessoModulo("pa-reepack");

  const sp = await searchParams;
  const aba: Aba = sp.aba === "historico" ? "historico" : "lancar";
  const de = sp.de ?? diasAtrasISO(30);
  const ate = sp.ate ?? hojeISO();
  const colab = (sp.colab ?? "").trim();
  const produtoFiltro = (sp.produto ?? "").trim();
  // Na aba Lançar, ?etapa= escolhe qual atividade vai ser cronometrada;
  // no Histórico, filtra a lista. Sem parâmetro, abre no Repack -- que
  // era o único fluxo antes de a Seleção existir.
  // Abre em SELEÇÃO: é a primeira etapa da execução do Repack, e o app
  // tem que abrir no começo do trabalho, não no fim dele. Depois disso
  // manda a URL -- e as ações devolvem a etapa que a pessoa acabou de
  // usar, para ela continuar de onde estava.
  const etapaEscolhida: EtapaReepack = ehEtapaReepack(sp.etapa) ? sp.etapa : "selecao";
  const etapaFiltro = ehEtapaReepack(sp.etapa) ? sp.etapa : "";

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const [{ data: produtosBanco }, { data: abertoBanco }, { data: minhas }, { data: doPeriodo }, podeExcluirQualquer] =
    await Promise.all([
      supabase
        .from("pa_produtos")
        .select("id, codigo, descricao, cluster_produto, tipo, unidades_por_caixa, fator_hecto, embalagem_id, meta_reepack_hora")
        .eq("revenda_id", revendaId)
        .eq("ativo", true)
        .not("fator_hecto", "is", null)
        .not("embalagem_id", "is", null)
        .order("descricao"),
      supabase
        .from("pa_reepack_lancamentos")
        .select("id, produto_id, turno, etapa, inicio")
        .eq("revenda_id", revendaId)
        .eq("colaborador_id", perfil.id)
        .is("fim", null)
        .maybeSingle(),
      supabase
        .from("pa_reepack_lancamentos")
        .select(COLUNAS_LANCAMENTO)
        .eq("revenda_id", revendaId)
        .eq("colaborador_id", perfil.id)
        .not("fim", "is", null)
        .order("fim", { ascending: false })
        .limit(20),
      aba === "historico"
        ? (() => {
            let q = supabase
              .from("pa_reepack_lancamentos")
              .select(COLUNAS_LANCAMENTO)
              .eq("revenda_id", revendaId)
              .not("fim", "is", null)
              .gte("inicio", `${de}T00:00:00`)
              .lte("inicio", `${ate}T23:59:59`);
            if (colab) q = q.eq("colaborador_id", colab);
            if (produtoFiltro) q = q.eq("produto_id", produtoFiltro);
            if (etapaFiltro) q = q.eq("etapa", etapaFiltro);
            return q.order("inicio", { ascending: false }).limit(300);
          })()
        : Promise.resolve({ data: null }),
      podeNoModulo("produtividade-armazem", "excluir"),
    ]);

  const produtos: ProdutoReepack[] = (produtosBanco ?? []).map(produtoReepackDeLinha);
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const clusters = [...new Set(produtos.map((p) => p.clusterProduto).filter((c): c is string => Boolean(c)))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
  const tipos = [...new Set(produtos.map((p) => p.tipo).filter((t): t is string => Boolean(t)))].sort();

  // Filtro lembrado do último uso (cookie -- ver COOKIE_REEPACK_CLUSTER em
  // lib/produtividade-armazem.ts). Só aceita o que ainda existe na lista
  // de hoje -- se a planilha mudou e o cluster salvo sumiu, nasce em
  // "Todos" em vez de mostrar um filtro fantasma.
  const jar = await cookies();
  const clusterCookie = decodeURIComponent(jar.get(COOKIE_REEPACK_CLUSTER)?.value ?? "");
  const tipoCookie = decodeURIComponent(jar.get(COOKIE_REEPACK_TIPO)?.value ?? "");
  const clusterInicial = clusters.includes(clusterCookie) ? clusterCookie : "";
  const tipoInicial = tipos.includes(tipoCookie) ? tipoCookie : "";

  const aberto = abertoBanco as Aberto | null;
  const etapaDoAberto: EtapaReepack = ehEtapaReepack(aberto?.etapa) ? aberto.etapa : "repack";
  const minhasLancamentos = (minhas ?? []) as Lancamento[];
  const historico = (doPeriodo ?? []) as Lancamento[];

  const contadores = new Map<string, string>();
  for (const l of historico) contadores.set(l.colaborador_id, l.colaborador_nome);

  return (
    <div>
      <PageHeader
        title="Reepack por Produto"
        subtitle="Inicie ao começar, finalize informando quantas caixas você fez -- o litro sai sozinho."
        fecharHref="/produtividade-armazem"
      />

      {sp.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>
      )}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      <nav className="mb-4 flex flex-wrap gap-2">
        {(["lancar", "historico"] as Aba[]).map((a) => (
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
            {a === "lancar" ? "Lançar" : "Histórico"}
          </a>
        ))}
      </nav>

      {aba === "lancar" && (
        <section className="space-y-6">
          {aberto ? (
            <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <form action={finalizarReepack} className="space-y-3">
                <input type="hidden" name="id" value={aberto.id} />
                <p className="text-sm font-bold text-amber-900">
                  🕐 {ETAPA_REEPACK[etapaDoAberto].rotulo} em andamento —{" "}
                  {produtoRotulo(aberto.produto_id, produtoPorId)} ·{" "}
                  {ROTULO_TURNO_CURTO[aberto.turno as keyof typeof ROTULO_TURNO] ?? aberto.turno}
                </p>
                <p className="text-xs text-amber-800">Iniciado às {formatarDataHora(aberto.inicio)}</p>
                {/* O gatilho de PARAR fica à vista enquanto o cronômetro
                    corre -- é o momento em que ele é consultado. */}
                <p className="rounded-lg bg-white/70 p-2 text-xs text-amber-900">
                  <strong>⏹️ Pare quando:</strong> {ETAPA_REEPACK[etapaDoAberto].fim}
                </p>

                <div>
                  <label className={rotulo} htmlFor="quantidade">
                    Quantas {ETAPA_REEPACK[etapaDoAberto].unidade}?
                  </label>
                  <input
                    id="quantidade"
                    name="quantidade"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    required
                    className={campo}
                  />
                </div>
                <div>
                  <label className={rotulo} htmlFor="observacao">Observação (opcional)</label>
                  <input id="observacao" name="observacao" maxLength={300} className={campo} />
                </div>

                <BotaoEnviar
                  textoEnviando="Finalizando..."
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  Finalizar {ETAPA_REEPACK[etapaDoAberto].curto.toLowerCase()}
                </BotaoEnviar>
              </form>

              <BotaoExcluir
                action={cancelarReepack}
                campos={{ id: aberto.id }}
                confirmacao="Cancelar esta atividade? Ela será apagada, sem contar como produção."
                rotuloConfirmar="Cancelar"
                className="w-full rounded-xl border border-amber-300 px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                Cancelar (comecei por engano)
              </BotaoExcluir>
            </div>
          ) : produtos.length === 0 ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Nenhum produto pronto para reepack ainda. Peça ao Admin para
              cadastrar em Configuração &gt; Reepack/Despejo.
            </p>
          ) : (
            <>
              {/* Escolha da atividade -- são etapas separadas do POP, cada
                  uma com o próprio cronômetro e a própria referência. */}
              <nav className="grid grid-cols-2 gap-2">
                {ETAPAS_REEPACK.map((e) => (
                  <a
                    key={e}
                    href={`?etapa=${e}`}
                    aria-current={e === etapaEscolhida ? "page" : undefined}
                    className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-3 text-center text-sm font-semibold ${
                      e === etapaEscolhida
                        ? "bg-primary text-white ring-2 ring-primary/30 ring-offset-1"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <span className="text-lg leading-none">{ETAPA_REEPACK[e].emoji}</span>
                    {ETAPA_REEPACK[e].rotulo}
                  </a>
                ))}
              </nav>

              <CartaoGatilho etapa={etapaEscolhida} />

              <form
                action={iniciarReepack}
                className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <input type="hidden" name="etapa" value={etapaEscolhida} />
                <ComboboxProdutoReepack
                  clusters={clusters}
                  tipos={tipos}
                  clusterInicial={clusterInicial}
                  tipoInicial={tipoInicial}
                />

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
                        {ROTULO_TURNO_CURTO[t]}
                      </label>
                    ))}
                  </div>
                </div>

                <BotaoEnviar
                  textoEnviando="Iniciando..."
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  ▶️ Iniciar {ETAPA_REEPACK[etapaEscolhida].curto.toLowerCase()}
                </BotaoEnviar>
              </form>
            </>
          )}

          <div>
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">
              Meus últimos lançamentos
            </h2>
            {minhasLancamentos.length === 0 ? (
              <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                Você ainda não finalizou nenhum reepack.
              </p>
            ) : (
              <ul className="space-y-2">
                {minhasLancamentos.map((l) => (
                  <LinhaReepack
                    key={l.id}
                    l={l}
                    produtoRotulo={produtoRotulo(l.produto_id, produtoPorId)}
                    meta={l.produto_id ? (produtoPorId.get(l.produto_id)?.metaReepackHora ?? null) : null}
                    podeExcluir={l.colaborador_id === perfil.id || podeExcluirQualquer}
                    podeEditar={l.colaborador_id === perfil.id}
                    clusters={clusters}
                    tipos={tipos}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {aba === "historico" && (
        <section>
          <form method="get" className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <input type="hidden" name="aba" value="historico" />
            <div className="min-w-0">
              <label className={rotulo} htmlFor="de">De</label>
              <input id="de" type="date" name="de" defaultValue={de} className={`${campo} sm:w-auto`} />
            </div>
            <div className="min-w-0">
              <label className={rotulo} htmlFor="ate">Até</label>
              <input id="ate" type="date" name="ate" defaultValue={ate} className={`${campo} sm:w-auto`} />
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1 sm:min-w-[10rem] sm:flex-1">
              <label className={rotulo} htmlFor="produto">Produto</label>
              <select id="produto" name="produto" defaultValue={produtoFiltro} className={campo}>
                <option value="">Todos</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>{p.descricao}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1 sm:min-w-[9rem]">
              <label className={rotulo} htmlFor="etapa">Atividade</label>
              <select id="etapa" name="etapa" defaultValue={etapaFiltro} className={campo}>
                <option value="">Todas</option>
                {ETAPAS_REEPACK.map((e) => (
                  <option key={e} value={e}>{ETAPA_REEPACK[e].rotulo}</option>
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

          {historico.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhum lançamento no período.
            </p>
          ) : (
            <ul className="space-y-2">
              {historico.map((l) => (
                <LinhaReepack
                  key={l.id}
                  l={l}
                  produtoRotulo={produtoRotulo(l.produto_id, produtoPorId)}
                  meta={l.produto_id ? (produtoPorId.get(l.produto_id)?.metaReepackHora ?? null) : null}
                  podeExcluir={l.colaborador_id === perfil.id || podeExcluirQualquer}
                  podeEditar={l.colaborador_id === perfil.id}
                  mostrarColaborador
                  clusters={clusters}
                  tipos={tipos}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Rótulo do produto pelo id -- lançamento antigo sem produto_id cai
 *  num traço, em vez de quebrar a tela. */
function produtoRotulo(produtoId: string | null, produtoPorId: Map<string, ProdutoReepack>): string {
  if (!produtoId) return "—";
  return produtoPorId.get(produtoId)?.descricao ?? "produto removido";
}

function LinhaReepack({
  l,
  produtoRotulo,
  meta,
  podeExcluir,
  podeEditar,
  mostrarColaborador = false,
  clusters,
  tipos,
}: {
  l: Lancamento;
  produtoRotulo: string;
  meta: number | null;
  podeExcluir: boolean;
  podeEditar: boolean;
  mostrarColaborador?: boolean;
  clusters: string[];
  tipos: string[];
}) {
  const horas = (new Date(l.fim).getTime() - new Date(l.inicio).getTime()) / 3_600_000;
  const taxa = taxaPorHora(l.quantidade, horas);
  const etapa: EtapaReepack = ehEtapaReepack(l.etapa) ? l.etapa : "repack";
  // Meta cadastrada é a de repack (cx/h). A Seleção ainda não tem a
  // dela -- é justamente o que a cronoanálise está medindo -- então não
  // mostra "% da meta" em vez de comparar com a régua errada.
  const pct = etapa === "repack" ? pctDaMeta(taxa, meta) : null;

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            <span className="mr-1">{ETAPA_REEPACK[etapa].emoji}</span>
            {produtoRotulo} · {l.quantidade} {etapa === "repack" ? "cx" : "un"} ·{" "}
            {ROTULO_TURNO_CURTO[l.turno as keyof typeof ROTULO_TURNO] ?? l.turno}
          </p>
          <p className="text-[11px] font-semibold uppercase text-slate-400">{ETAPA_REEPACK[etapa].rotulo}</p>
          <p className="text-xs text-slate-500">
            {formatarDataHora(l.inicio)} – {formatarDataHora(l.fim)} · {formatarDuracao(l.inicio, l.fim)}
            {mostrarColaborador ? ` — ${l.colaborador_nome}` : ""}
            {l.litros_calculados !== null ? ` · ${l.litros_calculados} L` : ""}
          </p>
          {l.observacao && <p className="mt-1 text-xs text-slate-500">{l.observacao}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700" title="Taxa extrapolada para uma hora, a partir da duração real do lançamento">
            {taxa.toFixed(1)} {etapa === "repack" ? "cx/h" : "un/h"}
          </span>
          {pct !== null && (
            <span
              className={`rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
                pct >= 100 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"
              }`}
            >
              {pct}% da meta
            </span>
          )}
          <div className="flex gap-1">
            {podeEditar && (
              <EditarProdutoReepack id={l.id} produtoAtual={produtoRotulo} clusters={clusters} tipos={tipos} />
            )}
            {podeExcluir && (
              <BotaoExcluir
                action={excluirReepack}
                campos={{ id: l.id }}
                confirmacao="Excluir este lançamento de reepack?"
                className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Excluir
              </BotaoExcluir>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/** Só o PRODUTO dá pra corrigir -- início, fim e quantidade não aparecem
 *  aqui de propósito (ver comentário em editarReepack, no actions.ts). */
function EditarProdutoReepack({
  id,
  produtoAtual,
  clusters,
  tipos,
}: {
  id: string;
  produtoAtual: string;
  clusters: string[];
  tipos: string[];
}) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 marker:content-none hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        ✏️ Editar produto
      </summary>
      <form
        action={editarReepack}
        className="mt-2 space-y-1.5 rounded-lg bg-slate-50 p-2"
      >
        <input type="hidden" name="id" value={id} />
        <p className="text-[11px] text-slate-500">Produto atual: {produtoAtual}</p>
        <ComboboxProdutoReepack clusters={clusters} tipos={tipos} />
        <BotaoEnviar compacto className="w-full rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white">
          Salvar
        </BotaoEnviar>
      </form>
    </details>
  );
}