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
  ROTULO_UNIDADE_BATE_PALETE,
  UNIDADES_BATE_PALETE,
  pctAvaria,
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

/**
 * Só LANÇAR e HISTÓRICO.
 *
 * A aba de análise existiu aqui por algumas horas e foi para a área de
 * Gestão, a pedido do dono: dashboard mora em um lugar só. Esta tela é de
 * quem executa; quem acompanha abre /gestao/armazem.
 */
type Aba = "lancar" | "historico";
const ABAS: Aba[] = ["lancar", "historico"];

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
  unidade_avariada: string;
  paletes: number;
  quantidade_avariada: number;
  hl_batido: number;
  hl_avariado: number;
  observacao: string | null;
};

const COLUNAS_SESSAO = "id, colaborador_id, colaborador_nome, turno, inicio, fim, observacao";
const COLUNAS_ITEM =
  "id, bate_palete_id, produto_id, unidade_avariada, paletes, quantidade_avariada, hl_batido, hl_avariado, observacao";

type ProdutoLinha = {
  id: string;
  codigo: string;
  descricao: string;
  cluster_produto: string | null;
  tipo: string | null;
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

  const [{ data: produtosBanco }, { data: abertaBanco }, { data: minhasBanco }, { data: periodoBanco }, podeExcluirQualquer] =
    await Promise.all([
      supabase
        .from("pa_produtos")
        .select("id, codigo, descricao, cluster_produto, tipo")
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
      aba === "historico"
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
  // filtro a cada lote que registra.
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
        paletes: i.paletes,
        hlBatido: i.hl_batido,
        hlAvariado: i.hl_avariado,
      })),
    );

  return (
    <div>
      <PageHeader
        title="🤲📦 Bate Palete"
        subtitle="Registre o que foi batido e quanto disso estava avariado."
        fecharHref="/produtividade-armazem"
      />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      <nav className="mb-4 flex flex-wrap gap-2">
        {([["lancar", "Lançar"], ["historico", "Histórico"]] as [Aba, string][]).map(([a, texto]) => (
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
        ))}
      </nav>

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
                    Palete que chegou avariado da fábrica: desmontar, separar o que está avariado e
                    remontar o palete para voltar ao estoque.
                  </p>
                  <p className="text-slate-700">
                    <strong className="text-green-700">▶️ Comece a contar</strong> ao puxar o primeiro
                    palete avariado.
                  </p>
                  <p className="text-slate-700">
                    <strong className="text-red-700">⏹️ Pare de contar</strong> quando o último palete
                    estiver montado e você tiver registrado tudo aqui.
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

      {aba === "historico" && (
        <section>
          <Filtro de={de} ate={ate} turno={turnoFiltro} />
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
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
            📊 Os indicadores desta atividade — avaria por produto, evolução e ritmo — ficam no
            painel de gestão, junto com os do resto do armazém.
          </p>
        </section>
      )}
    </div>
  );
}

/* ==================== COMPONENTES ==================== */

function Filtro({ de, ate, turno }: { de: string; ate: string; turno: string }) {
  return (
    <form method="get" className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex sm:flex-wrap sm:items-end">
      <input type="hidden" name="aba" value="historico" />
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
        <Numero titulo="Lotes" valor={String(resumo.lotes)} />
        <Numero titulo="HL batido" valor={formatarHl(resumo.hlBatido)} />
        <Numero
          titulo="Avaria"
          valor={resumo.pctAvaria === null ? "—" : `${resumo.pctAvaria.toLocaleString("pt-BR")}%`}
        />
        <Numero titulo="Tempo" valor={formatarMinutos(resumo.minutos)} />
      </div>

      {itens.length > 0 && (
        <ul className="space-y-1.5">
          {itens.map((i) => {
            const p = produtoPorId.get(i.produto_id);
            // O percentual sai do HL, não das quantidades: elas estão em
            // unidades diferentes (palete x caixa), e dividir uma pela
            // outra daria um número sem significado.
            const pct = pctAvaria(i.hl_batido, i.hl_avariado);
            const un =
              ROTULO_UNIDADE_BATE_PALETE[i.unidade_avariada as "caixa" | "unidade"] ??
              i.unidade_avariada;
            return (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-white p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {p?.descricao ?? "produto removido"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {i.paletes.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                    palete{i.paletes > 1 ? "s" : ""} ·{" "}
                    {i.quantidade_avariada.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                    {un.toLowerCase()}
                    {i.quantidade_avariada === 1 ? "" : "s"} avariada
                    {i.quantidade_avariada === 1 ? "" : "s"}
                    {pct !== null && ` · ${pct.toLocaleString("pt-BR")}% de avaria`}
                  </p>
                  {i.observacao && <p className="text-xs text-slate-400">📝 {i.observacao}</p>}
                </div>
                <BotaoExcluir
                  action={removerPalete}
                  campos={{ id: i.id }}
                  confirmacao="Remover este lote do lançamento?"
                  className="shrink-0 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Remover
                </BotaoExcluir>
              </li>
            );
          })}
        </ul>
      )}

      {/* --- Registrar um lote --- */}
      <form action={registrarPalete} className="space-y-3 rounded-xl bg-white p-3">
        <input type="hidden" name="bate_palete_id" value={sessao.id} />
        <p className="text-xs font-semibold uppercase text-slate-500">Registrar o que foi batido</p>

        <ComboboxProdutoReepack
          clusters={clusters}
          tipos={tipos}
          clusterInicial={clusterInicial}
          tipoInicial={tipoInicial}
          buscarProdutos={buscarProdutosBatePalete}
          cookiePath={COOKIE_BATE_PALETE_PATH}
        />

        {/* AS DUAS MEDIDAS DO MESMO LOTE, cada uma na unidade em que a
            operação conta (pedido do dono, 03/09/2026): bate-se PALETE, e
            a avaria que sai dele são caixas ou garrafas soltas. Antes as
            duas dividiam a mesma unidade, o que obrigava a converter o
            palete em caixas de cabeça para o sistema dividir de novo. */}
        <div>
          <label className={rotulo} htmlFor="paletes">Paletes batidos</label>
          <input
            id="paletes"
            name="paletes"
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0.5"
            required
            placeholder="Ex.: 2 (meio palete = 0,5)"
            className={campo}
          />
        </div>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className={rotulo}>Dessa batida, quanto saiu avariado</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              id="quantidade_avariada"
              name="quantidade_avariada"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              defaultValue="0"
              required
              aria-label="Quantidade avariada"
              className={campo}
            />
            <select
              name="unidade_avariada"
              defaultValue="caixa"
              aria-label="Unidade da avaria"
              className={campo}
            >
              {UNIDADES_BATE_PALETE.map((u) => (
                <option key={u} value={u}>
                  {ROTULO_UNIDADE_BATE_PALETE[u]}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            É daqui que sai o <strong>% de avaria por palete batido</strong>. As
            duas viram HL antes de virar percentual, então contar em caixa ou em
            unidade dá no mesmo número.
          </p>
        </div>

        <div>
          <label className={rotulo} htmlFor="obs-item">Observação deste lote (opcional)</label>
          <input id="obs-item" name="observacao" maxLength={200} placeholder="Ex.: palete veio tombado" className={campo} />
        </div>

        <BotaoEnviar
          textoEnviando="Registrando..."
          className="w-full rounded-xl border-2 border-primary bg-primary-soft px-4 py-3 text-sm font-bold text-primary-dark hover:bg-primary-soft/70"
        >
          ➕ Registrar lote
        </BotaoEnviar>
      </form>

      {/* --- Finalizar --- */}
      {/* AQUI FICAVA a "Observação do turno". Saiu a pedido do dono
          (03/09/2026): sobra uma só, a do LOTE, no formulário de cima.
          Elas nasceram parecendo duplicadas -- duas caixas de texto
          idênticas na mesma tela --, e a tentativa anterior foi separá-las
          por rótulo e exemplo. Não resolveu, porque o problema não era o
          rótulo: quem bate palete tem o que dizer sobre O PALETE ("veio
          tombado"), e o que valeria para o turno inteiro ninguém parava
          para escrever. A coluna continua no banco, com o que já foi
          gravado. */}
      <form action={finalizarBatePalete} className="space-y-3">
        <input type="hidden" name="id" value={sessao.id} />
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
            {resumo.lotes} {resumo.lotes === 1 ? "lote" : "lotes"} · {formatarHl(resumo.hlBatido)} HL batidos
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
            confirmacao="Excluir este bate palete e todos os lotes dele?"
            className="shrink-0 rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            Excluir
          </BotaoExcluir>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {resumo.pctAvaria !== null && (
          <Etiqueta destaque>{resumo.pctAvaria.toLocaleString("pt-BR")}% de avaria</Etiqueta>
        )}
        <Etiqueta>{formatarHl(resumo.hlAvariado)} HL avariados</Etiqueta>
        <Etiqueta>{formatarHl(resumo.hlAproveitado)} HL bons</Etiqueta>
        {resumo.hlPorHora !== null && <Etiqueta>{resumo.hlPorHora.toLocaleString("pt-BR")} HL/h</Etiqueta>}
      </div>

      {itens.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-400">
            Ver {itens.length} {itens.length === 1 ? "lote" : "lotes"}
          </summary>
          <ul className="mt-1.5 space-y-1">
            {itens.map((i) => (
              <li key={i.id} className="text-xs text-slate-600">
                {produtoPorId.get(i.produto_id)?.descricao ?? "produto removido"} —{" "}
                {i.paletes.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} palete
                {i.paletes > 1 ? "s" : ""},{" "}
                {i.quantidade_avariada.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                {(
                  ROTULO_UNIDADE_BATE_PALETE[i.unidade_avariada as "caixa" | "unidade"] ??
                  i.unidade_avariada
                ).toLowerCase()}{" "}
                avariada
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
        destaque ? "bg-red-50 font-bold text-red-700" : "bg-slate-50 text-slate-500"
      }`}
    >
      {children}
    </span>
  );
}
