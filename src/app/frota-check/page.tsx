import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { podeNoModulo, requireAcessoModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { hojeIso } from "@/lib/pesquisa";
import { FrotaCheckNaoInstalado, painelFrota, type PendenciaDoPainel, type VeiculoDoPainel } from "@/lib/frota-check-server";
import {
  COR_FAROL,
  COR_GRAVIDADE,
  DIAS_ATENCAO,
  MODULO_FROTA_CHECK,
  ROTULO_FAROL,
  ROTULO_GRAVIDADE,
  formatarPct,
  placaParaLer,
} from "@/lib/frota-check";
import { iniciarCheck } from "./actions";
import { BuscaPlaca } from "@/components/frota-check/BuscaPlaca";

export const dynamic = "force-dynamic";

const FILTROS = [
  ["pendentes", "Pendentes"],
  ["meus", "Meus caminhões"],
  ["todos", "Todos"],
] as const;

/**
 * O PAINEL DO CHECK DA FROTA: o farol do bimestre (quem está pendente),
 * a lista de placas com o botão de fazer, as pendências (NOK ainda não
 * corrigido) e a evolução. É o mesmo retrato que o Gestor LOG mostra.
 */
export default async function FrotaCheckPage({ searchParams }: { searchParams: Promise<{ ver?: string; erro?: string }> }) {
  const perfil = await requireAcessoModulo(MODULO_FROTA_CHECK, "/");
  const revendaId = await exigirRevenda("/");
  const sp = await searchParams;
  const podeCadastrar = await podeNoModulo(MODULO_FROTA_CHECK, "editar");

  let p;
  try {
    p = await painelFrota(revendaId, hojeIso());
  } catch (e) {
    if (!(e instanceof FrotaCheckNaoInstalado)) throw e;
    return (
      <div>
        <PageHeader title="🚚 Check da Frota" />
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Falta rodar a <strong>migration 184</strong> no Supabase.
        </p>
      </div>
    );
  }

  // Revenda sem placa nenhuma (São Félix no começo): o farol vazio dizia
  // "Tudo feito 🎉" -- teste real de 25/11. Aqui diz o que falta fazer.
  if (p.veiculos.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="🚚 Check da Frota" subtitle={`Bimestre ${p.bimestre.rotulo}`} />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Nenhum caminhão cadastrado nesta revenda.</p>
          <p className="mt-1">
            {podeCadastrar
              ? "Cadastre as placas e escolha quem responde por cada uma."
              : "Peça à liderança para cadastrar as placas em Modo Liderança › Check da Frota."}
          </p>
          {podeCadastrar && (
            <Link href="/admin/frota-check" className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white">
              Cadastrar placas
            </Link>
          )}
        </div>
      </div>
    );
  }

  const meus = p.veiculos.filter((v) => v.responsavelId === perfil.id);
  // sem caminhão no nome e sem pendente: abre em Todos (antes abria numa lista vazia)
  const ver =
    sp.ver === "todos" || sp.ver === "meus" || sp.ver === "pendentes"
      ? sp.ver
      : meus.length
        ? "meus"
        : p.totais.pendentes
          ? "pendentes"
          : "todos";
  const ordem = { atencao: 0, andamento: 1, pendente: 2, feito: 3 } as const;
  const lista = (ver === "meus" ? meus : ver === "pendentes" ? p.veiculos.filter((v) => v.farol !== "feito") : p.veiculos)
    .slice()
    .sort((a, b) => ordem[a.farol] - ordem[b.farol] || a.placa.localeCompare(b.placa));
  const t = p.totais;
  const pctFeito = t.veiculos ? t.feitos / t.veiculos : 0;
  const maxConf = Math.max(...p.evolucao.map((e) => e.conformidade ?? 0), 0.0001);

  return (
    <div className="space-y-4">
      <PageHeader
        title="🚚 Check da Frota"
        subtitle={`Bimestre ${p.bimestre.rotulo} · fecha em ${p.bimestre.dias} ${p.bimestre.dias === 1 ? "dia" : "dias"}`}
      />
      {sp.erro && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}

      {/* farol do bimestre */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Feitos no bimestre</p>
            <p className="text-3xl font-black text-slate-900">
              {t.feitos}
              <span className="text-base font-semibold text-slate-400"> de {t.veiculos}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase text-slate-500">Conformidade</p>
            <p className="text-3xl font-black text-primary-dark">{formatarPct(t.conformidade)}</p>
          </div>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
          {(["feito", "andamento", "pendente", "atencao"] as const).map((f) => {
            const n = p.veiculos.filter((v) => v.farol === f).length;
            return n ? <span key={f} className={COR_FAROL[f]} style={{ width: `${(n / t.veiculos) * 100}%` }} /> : null;
          })}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {(["feito", "andamento", "pendente", "atencao"] as const).map((f) => (
            <span key={f} className="flex items-center gap-1.5 text-slate-600">
              <i className={`h-2.5 w-2.5 rounded-full ${COR_FAROL[f]}`} />
              {ROTULO_FAROL[f]}: <b className="text-slate-900">{p.veiculos.filter((v) => v.farol === f).length}</b>
            </span>
          ))}
        </div>
        {t.bloqueados > 0 && (
          <p className="mt-3 rounded-xl bg-red-700 p-2.5 text-sm font-semibold text-white">
            ⛔ {t.bloqueados} {t.bloqueados === 1 ? "caminhão com item" : "caminhões com item"} de bloqueio imediato sem correção
          </p>
        )}
        {pctFeito < 1 && p.bimestre.dias <= DIAS_ATENCAO && (
          <p className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs font-semibold text-amber-900">
            O bimestre fecha em {p.bimestre.dias} dias e faltam {t.pendentes} caminhões.
          </p>
        )}
      </section>

      {/* por responsável */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Por responsável</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {p.responsaveis.map((r) => {
            const pct = r.total ? r.feitos / r.total : 0;
            return (
              <div key={r.id ?? r.nome} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">{r.nome}</p>
                  <span className={`h-3 w-3 rounded-full ${r.pendentes === 0 ? "bg-emerald-500" : r.atencao ? "bg-red-600" : "bg-amber-400"}`} />
                </div>
                <p className="text-xs text-slate-500">
                  {r.feitos} de {r.total} feitos{r.pendentes ? ` · ${r.pendentes} pendentes` : " · em dia"}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct * 100}%` }} />
                </div>
                {r.semCadastro && (
                  <p className="mt-1.5 text-[11px] text-amber-800">
                    {r.id === null && r.nome === "Sem responsável" ? "Escolha o responsável no cadastro." : "Nome da planilha: falta escolher a pessoa no cadastro."}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* placas */}
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {FILTROS.map(([k, rot]) => (
            <Link
              key={k}
              href={`/frota-check?ver=${k}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${ver === k ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}
              replace
            >
              {rot}
              {k === "meus" ? ` (${meus.length})` : k === "pendentes" ? ` (${t.pendentes})` : ` (${t.veiculos})`}
            </Link>
          ))}
        </div>
        {lista.length === 0 ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            {ver === "meus" ? "Nenhum caminhão no seu nome." : "Tudo feito neste bimestre. 🎉"}
          </p>
        ) : (
          <>
          {lista.length > 6 && <BuscaPlaca />}
          <ul className="space-y-2">
            {lista.map((v) => (
              <LinhaDaPlaca key={v.id} v={v} eu={perfil.id} />
            ))}
          </ul>
          </>
        )}
      </section>

      {/* pendências */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          Pendências: NOK ainda sem correção ({p.pendencias.length})
        </h2>
        {p.pendencias.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-500">Nenhuma pendência aberta.</p>
        ) : (
          <ListaPendencias lista={p.pendencias.slice(0, PEND_VISIVEIS)} />
        )}
        {p.pendencias.length > PEND_VISIVEIS && (
          <details className="mt-1.5">
            <summary className="cursor-pointer list-none rounded-xl p-2 text-center text-xs font-semibold text-primary [&::-webkit-details-marker]:hidden">
              Ver as outras {p.pendencias.length - PEND_VISIVEIS}
            </summary>
            <ListaPendencias lista={p.pendencias.slice(PEND_VISIVEIS)} />
          </details>
        )}
      </section>

      {/* evolução e Pareto */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Conformidade por bimestre</h2>
          <div className="flex h-36 items-end gap-2">
            {p.evolucao.map((e) => (
              <div key={e.rotulo} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-bold text-slate-700">{formatarPct(e.conformidade)}</span>
                <span
                  className="w-full rounded-t-md bg-primary/80"
                  style={{ height: e.conformidade ? `${Math.max(6, ((e.conformidade - 0.85 * maxConf) / (0.15 * maxConf)) * 90)}px` : "2px" }}
                />
                <span className="text-[10px] text-slate-500">{e.rotulo}</span>
                <span className="text-[10px] text-slate-400">{e.feitos} cam.</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Itens que mais dão NOK (2 últimos bimestres)</h2>
          {p.pareto.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum NOK.</p>
          ) : (
            <ul className="space-y-1.5">
              {p.pareto.map((x) => (
                <li key={x.item + x.grupo} className="text-xs">
                  <div className="flex justify-between">
                    <span className="truncate font-semibold text-slate-700">
                      {x.item} <span className="font-normal text-slate-400">· {x.grupo}</span>
                    </span>
                    <span className="font-bold text-slate-900">{x.n}</span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-red-500" style={{ width: `${(x.n / p.pareto[0].n) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {podeCadastrar && (
        <Link href="/admin/frota-check" className="block rounded-2xl border border-dashed border-primary/40 p-3 text-center text-sm font-semibold text-primary">
          ⚙️ Placas e responsáveis (Liderança)
        </Link>
      )}
    </div>
  );
}

function LinhaDaPlaca({ v, eu }: { v: VeiculoDoPainel; eu: string }) {
  const c = v.check;
  const botao = "shrink-0 rounded-xl px-3 py-2 text-xs font-bold";
  let acao: React.ReactNode;
  if (!c) {
    acao = (
      // link simples (não formulário): funciona mesmo antes de a página terminar de carregar
      <a href={`/frota-check/abrir/${v.id}`} className={`${botao} bg-primary text-white active:scale-95`}>
        Fazer check
      </a>
    );
  } else if (c.status === "planilha") {
    acao = (
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Link href={`/frota-check/${c.id}`} className={`${botao} bg-slate-100 text-slate-700`}>
          Ver
        </Link>
        <BotaoNoLugar
          acao={iniciarCheck}
          campos={{ veiculo_id: v.id, substituir: "1" }}
          confirmacao={`Fazer o check da ${placaParaLer(v.placa)} pelo app?`}
          detalhe="O deste bimestre veio da planilha. O do app substitui o da planilha (ela continua no servidor da frota)."
          rotuloConfirmar="Fazer pelo app"
          perigo={false}
          textoEnviando="Abrindo..."
          className="text-[11px] font-semibold text-primary underline"
        >
          refazer no app
        </BotaoNoLugar>
      </div>
    );
  } else if (c.status === "em_andamento") {
    acao = (
      <Link href={`/frota-check/${c.id}`} className={`${botao} bg-sky-600 text-white`}>
        {c.iniciadoPorId === eu ? "Continuar" : "Ver"}
      </Link>
    );
  } else {
    acao = (
      <Link href={`/frota-check/${c.id}`} className={`${botao} bg-slate-100 text-slate-700`}>
        Ver
      </Link>
    );
  }
  return (
    <li data-placa={v.placa} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${COR_FAROL[v.farol]}`} aria-label={ROTULO_FAROL[v.farol]} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-bold text-slate-900">{placaParaLer(v.placa)}</span>
          {v.bloqueio && <span className="rounded-full bg-red-700 px-1.5 py-0.5 text-[10px] font-bold text-white">BLOQUEIO</span>}
          {v.pendencias > 0 && !v.bloqueio && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">{v.pendencias} pend.</span>
          )}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {v.responsavel}
          {c?.status === "assinado" && ` · ${formatarPct(c.conformidade)} · assinado por ${c.assinadoPor?.split(" ")[0] ?? ""}`}
          {c?.status === "planilha" && ` · ${formatarPct(c.conformidade)} · da planilha`}
          {c?.status === "em_andamento" && ` · em andamento com ${c.iniciadoPor?.split(" ")[0] ?? ""}`}
          {!c && (v.ultimo ? ` · último: ${v.ultimo.rotulo} ${formatarPct(v.ultimo.conformidade)}` : " · nunca feito")}
        </span>
      </span>
      {acao}
    </li>
  );
}

/** Quantas pendências aparecem de cara; o resto fica em "Ver as outras". */
const PEND_VISIVEIS = 8;

function ListaPendencias({ lista }: { lista: PendenciaDoPainel[] }) {
  return (
    <ul className="space-y-1.5">
      {lista.map((x) => (
        <li key={x.respostaId}>
          <Link href={`/frota-check/${x.checkId}#pend-${x.respostaId}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <span className="w-20 shrink-0 font-mono text-xs font-bold text-slate-900">{placaParaLer(x.placa)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-800">{x.item}</span>
              <span className="block truncate text-xs text-slate-500">
                {x.defeito ?? (x.origem === "planilha" ? "da planilha (sem descrição)" : "outro defeito")}
              </span>
            </span>
            {x.gravidade ? (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${COR_GRAVIDADE[x.gravidade]}`}>{ROTULO_GRAVIDADE[x.gravidade]}</span>
            ) : (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">planilha</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
