import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { podeNoModulo, requireAcessoModulo } from "@/lib/require-admin";
import { buscarProdutosReepack } from "@/app/admin/produtividade-armazem/actions";
import { ComboboxProduto } from "@/components/produtividade-armazem/ComboboxProduto";
import {
  ROTULO_TURNO,
  TURNOS,
  diasAtrasISO,
  embalagemDeLinha,
  formatarDataHora,
  formatarDuracao,
  hojeISO,
  pctDaMeta,
  produtoReepackDeLinha,
  taxaPorHora,
  turnoAtual,
  type Embalagem,
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
  inicio: string;
};

export default async function ReepackPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
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

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();
  const [{ data: embalagensBanco }, { data: produtosBanco }, { data: abertoBanco }, { data: minhas }, { data: doPeriodo }, podeExcluirQualquer] =
    await Promise.all([
      supabase
        .from("pa_embalagens")
        .select("id, nome, tempo_padrao_reepack_segundos, tempo_padrao_despejo_segundos, meta_reepacks_hora, meta_litros_hora, unidade_reepack, litros_por_pacote")
        .eq("revenda_id", revendaId)
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("pa_produtos")
        .select("id, codigo, descricao, unidades_por_caixa, fator_hecto, embalagem_id")
        .eq("revenda_id", revendaId)
        .eq("ativo", true)
        .not("fator_hecto", "is", null)
        .not("embalagem_id", "is", null)
        .order("descricao"),
      supabase
        .from("pa_reepack_lancamentos")
        .select("id, produto_id, turno, inicio")
        .eq("revenda_id", revendaId)
        .eq("colaborador_id", perfil.id)
        .is("fim", null)
        .maybeSingle(),
      supabase
        .from("pa_reepack_lancamentos")
        .select("id, embalagem_id, produto_id, colaborador_id, colaborador_nome, turno, quantidade, litros_calculados, inicio, fim, observacao")
        .eq("revenda_id", revendaId)
        .eq("colaborador_id", perfil.id)
        .not("fim", "is", null)
        .order("fim", { ascending: false })
        .limit(20),
      aba === "historico"
        ? (() => {
            let q = supabase
              .from("pa_reepack_lancamentos")
              .select("id, embalagem_id, produto_id, colaborador_id, colaborador_nome, turno, quantidade, litros_calculados, inicio, fim, observacao")
              .eq("revenda_id", revendaId)
              .not("fim", "is", null)
              .gte("inicio", `${de}T00:00:00`)
              .lte("inicio", `${ate}T23:59:59`);
            if (colab) q = q.eq("colaborador_id", colab);
            if (produtoFiltro) q = q.eq("produto_id", produtoFiltro);
            return q.order("inicio", { ascending: false }).limit(300);
          })()
        : Promise.resolve({ data: null }),
      podeNoModulo("produtividade-armazem", "excluir"),
    ]);

  const embalagens: Embalagem[] = (embalagensBanco ?? []).map(embalagemDeLinha);
  const embalagemPorId = new Map(embalagens.map((e) => [e.id, e]));
  const produtos: ProdutoReepack[] = (produtosBanco ?? []).map(produtoReepackDeLinha);
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const aberto = abertoBanco as Aberto | null;
  const minhasLancamentos = (minhas ?? []) as Lancamento[];
  const historico = (doPeriodo ?? []) as Lancamento[];

  const contadores = new Map<string, string>();
  for (const l of historico) contadores.set(l.colaborador_id, l.colaborador_nome);

  return (
    <div>
      <PageHeader
        title="Reepack por Produto"
        subtitle="Inicie ao começar, finalize informando quantas caixas você fez -- o litro sai sozinho."
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
                  🕐 Reepack em andamento — {produtoRotulo(aberto.produto_id, produtoPorId)} ·{" "}
                  {ROTULO_TURNO[aberto.turno as keyof typeof ROTULO_TURNO] ?? aberto.turno}
                </p>
                <p className="text-xs text-amber-800">Iniciado às {formatarDataHora(aberto.inicio)}</p>

                <div>
                  <label className={rotulo} htmlFor="quantidade">
                    Quantas caixas você fez?
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
                  Finalizar reepack
                </BotaoEnviar>
              </form>

              <BotaoExcluir
                action={cancelarReepack}
                campos={{ id: aberto.id }}
                confirmacao="Cancelar este reepack? Ele será apagado, sem contar como produção."
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
            <form
              action={iniciarReepack}
              className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div>
                <label className={rotulo} htmlFor="produto_id">Produto</label>
                <ComboboxProduto buscar={buscarProdutosReepack} placeholder="Digite o código ou a descrição do produto" />
              </div>

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
                ▶️ Iniciar reepack
              </BotaoEnviar>
            </form>
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
                    meta={embalagemPorId.get(l.embalagem_id)?.metaReepacksHora ?? null}
                    podeExcluir={l.colaborador_id === perfil.id || podeExcluirQualquer}
                    podeEditar={l.colaborador_id === perfil.id}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {aba === "historico" && (
        <section>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="aba" value="historico" />
            <div>
              <label className={rotulo} htmlFor="de">De</label>
              <input id="de" type="date" name="de" defaultValue={de} className={campo} />
            </div>
            <div>
              <label className={rotulo} htmlFor="ate">Até</label>
              <input id="ate" type="date" name="ate" defaultValue={ate} className={campo} />
            </div>
            <div className="min-w-[10rem] flex-1">
              <label className={rotulo} htmlFor="produto">Produto</label>
              <select id="produto" name="produto" defaultValue={produtoFiltro} className={campo}>
                <option value="">Todos</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>{p.descricao}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[10rem] flex-1">
              <label className={rotulo} htmlFor="colab">Colaborador</label>
              <select id="colab" name="colab" defaultValue={colab} className={campo}>
                <option value="">Todos</option>
                {[...contadores].map(([id, nome]) => (
                  <option key={id} value={id}>{nome}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">
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
                  meta={embalagemPorId.get(l.embalagem_id)?.metaReepacksHora ?? null}
                  podeExcluir={l.colaborador_id === perfil.id || podeExcluirQualquer}
                  podeEditar={l.colaborador_id === perfil.id}
                  mostrarColaborador
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
}: {
  l: Lancamento;
  produtoRotulo: string;
  meta: number | null;
  podeExcluir: boolean;
  podeEditar: boolean;
  mostrarColaborador?: boolean;
}) {
  const horas = (new Date(l.fim).getTime() - new Date(l.inicio).getTime()) / 3_600_000;
  const taxa = taxaPorHora(l.quantidade, horas);
  const pct = pctDaMeta(taxa, meta);

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {produtoRotulo} · {l.quantidade} cx · {ROTULO_TURNO[l.turno as keyof typeof ROTULO_TURNO] ?? l.turno}
          </p>
          <p className="text-xs text-slate-500">
            {formatarDataHora(l.inicio)} – {formatarDataHora(l.fim)} · {formatarDuracao(l.inicio, l.fim)}
            {mostrarColaborador ? ` — ${l.colaborador_nome}` : ""}
            {l.litros_calculados !== null ? ` · ${l.litros_calculados} L` : ""}
          </p>
          {l.observacao && <p className="mt-1 text-xs text-slate-500">{l.observacao}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700" title="Taxa extrapolada para uma hora, a partir da duração real do lançamento">
            {taxa.toFixed(1)} cx/h
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
              <EditarProdutoReepack id={l.id} produtoAtual={produtoRotulo} />
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
function EditarProdutoReepack({ id, produtoAtual }: { id: string; produtoAtual: string }) {
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
        <ComboboxProduto buscar={buscarProdutosReepack} placeholder="Digite o código ou a descrição do produto certo" />
        <BotaoEnviar compacto className="w-full rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white">
          Salvar
        </BotaoEnviar>
      </form>
    </details>
  );
}
