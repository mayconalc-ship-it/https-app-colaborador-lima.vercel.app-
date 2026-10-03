import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { LinkDoGuia } from "@/components/LinkDoGuia";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { exigirRevenda } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { hojeIso } from "@/lib/pesquisa";
import {
  BLOCOS,
  formatarPct,
  mesesDoTrimestre,
  rotuloTrimestre,
  tomDaNota,
  trimestreDe,
  trimestresSemAvaliacao,
} from "@/lib/manutencao";
import { MODULO_MANUTENCAO, ModuloNaoInstalado, evolucao } from "@/lib/manutencao-server";
import { lerFornecedores, lerMatriz } from "@/lib/manutencao-raci-server";
import { dataBr, pendenciasDoFornecedor, raciVigente, situacaoDaRevisao } from "@/lib/manutencao-raci";
import { iniciarAvaliacao } from "./actions";
import { AvisoNaoInstalado } from "./AvisoNaoInstalado";
import { Marca } from "@/components/Icone";

export const dynamic = "force-dynamic";

const TOM = {
  bom: "bg-emerald-100 text-emerald-800",
  atencao: "bg-amber-100 text-amber-800",
  ruim: "bg-red-100 text-red-800",
  neutro: "bg-slate-100 text-slate-400",
} as const;

function Nota({ pct, forte = false }: { pct: number | null; forte?: boolean }) {
  return (
    <span className={`inline-block min-w-12 rounded-full px-2 py-0.5 text-center tabular-nums ${TOM[tomDaNota(pct)]} ${forte ? "font-bold" : "font-semibold"}`}>
      {formatarPct(pct)}
    </span>
  );
}

/** "▲ 5 pts" / "▼ 3 pts" entre as duas últimas avaliações. */
function Variacao({ antes, agora }: { antes: number | null; agora: number | null }) {
  if (antes === null || agora === null) return null;
  const pts = Math.round((agora - antes) * 100);
  if (pts === 0) return <span className="text-[11px] text-slate-400">=</span>;
  return (
    <span className={`text-[11px] font-bold ${pts > 0 ? "text-emerald-700" : "text-red-700"}`}>
      {pts > 0 ? "▲" : "▼"} {Math.abs(pts)}
    </span>
  );
}

/**
 * CHECK DE MANUTENÇÃO: o painel.
 *
 * Responde o que a auditoria do DPO 2.2 pergunta, na ordem em que ela
 * pergunta: o trimestre está em dia? (cartão do topo) · como evoluiu?
 * (V.2: a nota de cada seção, trimestre a trimestre) · o que está abaixo
 * de 3 e qual o plano? · e o histórico, com as fotos de cada avaliação.
 */
export default async function ManutencaoPage() {
  await requireAcessoModulo(MODULO_MANUTENCAO);
  const revendaId = await exigirRevenda("/");

  // V.3/V.4 em paralelo com a evolução: são tabelas independentes.
  const resumo = resumoV3V4(revendaId);
  const dados = await evolucao(revendaId, 4).catch((e) => {
    if (e instanceof ModuloNaoInstalado) return null;
    throw e;
  });
  if (!dados) return <AvisoNaoInstalado />;
  const { itens, avaliacoes, colunas } = dados;
  const v34 = await resumo;

  const hoje = trimestreDe(hojeIso());
  const atual = avaliacoes.find((a) => a.ano === hoje.ano && a.trimestre === hoje.trimestre);
  const colunaAtual = atual ? colunas.find((c) => c.avaliacao.id === atual.id) : undefined;
  const feitosAtual = colunaAtual?.respostas.length ?? 0;
  const faltando = trimestresSemAvaliacao(avaliacoes, hoje);

  const ultima = colunas[colunas.length - 1];
  const penultima = colunas[colunas.length - 2];
  const itemPorId = new Map(itens.map((i) => [i.id, i]));
  const abaixo = (ultima?.respostas ?? [])
    .filter((r) => !r.na && r.nota !== null && r.nota < 3)
    .map((r) => ({ r, item: itemPorId.get(r.itemId) }))
    .filter((x): x is { r: (typeof x)["r"]; item: NonNullable<(typeof x)["item"]> } => !!x.item)
    .sort((a, b) => a.item.ordem - b.item.ordem);

  return (
    <div>
      <PageHeader
        title="🛠️ Check de Manutenção"
        subtitle="Checklist Global de Manutenção · DPO 2.2 · uma avaliação por trimestre"
      />
      <LinkDoGuia slug="fazer-check-manutencao" className="mb-4" />

      {/* ---- O trimestre de hoje ---- */}
      <section className="mb-6 rounded-2xl border-2 border-primary/30 bg-white p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-primary-dark">
          Trimestre atual · {rotuloTrimestre(hoje)} ({mesesDoTrimestre(hoje)})
        </p>
        {!atual ? (
          <>
            <p className="mt-1 text-sm text-slate-600">
              A avaliação deste trimestre ainda não começou. São {itens.length} itens: dá para fazer em mais de um dia,
              cada item salva sozinho.
            </p>
            <div className="mt-3">
              <BotaoNoLugar
                acao={iniciarAvaliacao}
                campos={{}}
                textoEnviando="Iniciando..."
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                ▶️ Iniciar a avaliação do {rotuloTrimestre(hoje)}
              </BotaoNoLugar>
            </div>
          </>
        ) : atual.status === "em_andamento" ? (
          <>
            <p className="mt-1 text-sm text-slate-700">
              Em andamento: <strong>{feitosAtual} de {itens.length}</strong> itens respondidos · parcial{" "}
              <Nota pct={colunaAtual?.notas.total ?? null} />
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((feitosAtual / Math.max(itens.length, 1)) * 100)}%` }} />
            </div>
            <Link
              href={`/manutencao/${atual.id}`}
              className="mt-3 block w-full rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Continuar a avaliação →
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-700">
              ✅ Finalizado com <Nota pct={atual.notaTotal} forte /> por {atual.finalizadaPorNome?.split(" ")[0]}.
            </p>
            <Link href={`/manutencao/${atual.id}`} className="mt-2 inline-block text-sm font-semibold text-primary">
              Ver a avaliação →
            </Link>
          </>
        )}
        {faltando.length > 0 && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
            ⚠️ Sem avaliação: {faltando.map(rotuloTrimestre).join(", ")}. O DPO cobra no mínimo uma por trimestre.
          </p>
        )}
      </section>

      {/* ---- Fornecedores (V.3) e RACI (V.4) ---- */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2">
        <Link href="/fornecedores" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-primary/40">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">V.3 · Base de fornecedores</p>
          {v34 ? (
            <>
              <p className="mt-1 text-sm font-semibold text-slate-900"><Marca desenho="fornecedores" /> {v34.fornecedores} contatos na base</p>
              <p className={`mt-0.5 text-xs ${v34.pendencias ? "font-semibold text-amber-700" : "text-emerald-700"}`}>
                {v34.pendencias
                  ? `⚠️ ${v34.pendencias} com pendência (ANS de crítico ou a revisar)`
                  : "✅ Críticos com ANS e nada a revisar"}
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-amber-700">Falta rodar a migration 157 no Supabase.</p>
          )}
        </Link>
        <Link href="/manutencao/raci" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-primary/40">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">V.4 · RACI com fornecedores</p>
          {v34 ? (
            <>
              <p className="mt-1 text-sm font-semibold text-slate-900">🧭 {v34.atividades} atividades na matriz</p>
              <p className={`mt-0.5 text-xs ${v34.vigente ? "text-emerald-700" : "font-semibold text-amber-700"}`}>
                {v34.vigente
                  ? `✅ Vigente até ${v34.venceEm}`
                  : v34.situacao === "nunca"
                    ? "📝 Ainda não revista: confira e registre a revisão"
                    : v34.situacao === "vencida"
                      ? "⏰ Revisão vencida"
                      : "⚠️ Atividade sem A único ou sem R"}
              </p>
            </>
          ) : (
            <p className="mt-1 text-xs text-amber-700">Falta rodar a migration 157 no Supabase.</p>
          )}
        </Link>
      </section>

      {/* ---- Evolução (V.2) ---- */}
      {colunas.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">📈 Evolução por seção</h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="p-2 text-left font-semibold">Seção</th>
                  {colunas.map((c) => (
                    <th key={c.avaliacao.id} className="p-2 text-center font-semibold">
                      <Link href={`/manutencao/${c.avaliacao.id}`} className="text-primary hover:underline">
                        {rotuloTrimestre(c.avaliacao)}
                      </Link>
                      {c.avaliacao.status === "em_andamento" && <span className="block text-[10px] font-normal text-amber-700">parcial</span>}
                    </th>
                  ))}
                  {penultima && <th className="p-2 text-center font-semibold">Δ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="bg-primary-soft/40">
                  <td className="p-2 font-bold text-slate-800">Total</td>
                  {colunas.map((c) => (
                    <td key={c.avaliacao.id} className="p-2 text-center">
                      <Nota pct={c.notas.total} forte />
                    </td>
                  ))}
                  {penultima && (
                    <td className="p-2 text-center">
                      <Variacao antes={penultima.notas.total} agora={ultima.notas.total} />
                    </td>
                  )}
                </tr>
                {BLOCOS.map((b) => (
                  <BlocoDaTabela key={b.id} titulo={b.titulo} bloco={b.id} colunas={colunas} temDelta={!!penultima} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-slate-400">
            Mesma conta da planilha da Ambev: seção = Σ(nota × peso) ÷ Σ(3 × peso), sem N/A; total = média das 9 seções.
          </p>
        </section>
      )}

      {/* ---- O que está abaixo de 3 ---- */}
      {ultima && abaixo.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            📋 Abaixo de 3 no {rotuloTrimestre(ultima.avaliacao)} ({abaixo.length})
          </h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {abaixo.map(({ r, item }) => (
              <li key={r.id}>
                <Link href={`/manutencao/item/${item.numero}`} className="flex items-start gap-3 p-3 hover:bg-slate-50">
                  <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${r.nota === 0 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                    {item.numero} · {r.nota}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">{item.pergunta}</span>
                    {r.planoAcao && (
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {item.critico && <strong className="text-red-700">Crítico · </strong>}
                        {r.planoAcao}
                        {r.responsavel ? ` · ${r.responsavel}` : ""}
                        {r.prazo ? ` · até ${r.prazo.split("-").reverse().join("/")}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-slate-300" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Histórico ---- */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">🗂️ Histórico</h2>
        {avaliacoes.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Nenhuma avaliação ainda. Comece a do trimestre atual acima.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {avaliacoes.map((a) => (
              <li key={a.id}>
                <Link href={`/manutencao/${a.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                  <span className="w-16 shrink-0 rounded-lg bg-primary-soft py-1.5 text-center text-xs font-bold text-primary-dark">
                    {rotuloTrimestre(a)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-slate-700">
                    {a.status === "finalizada"
                      ? `Finalizado por ${a.finalizadaPorNome?.split(" ")[0] ?? "—"}`
                      : `Em andamento · iniciado por ${a.iniciadaPorNome.split(" ")[0]}`}
                  </span>
                  {a.status === "finalizada" ? <Nota pct={a.notaTotal} forte /> : <span className="text-xs font-semibold text-amber-700">aberto</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Os cartões de V.3 e V.4. Sem a migration 157, devolve null (o painel segue). */
async function resumoV3V4(revendaId: string) {
  try {
    const [fornecedores, matriz] = await Promise.all([lerFornecedores(revendaId), lerMatriz(revendaId)]);
    const situacao = situacaoDaRevisao(matriz.revisoes[0]?.revisadaEm ?? null, hojeIso());
    return {
      fornecedores: fornecedores.length,
      pendencias: fornecedores.filter((f) => pendenciasDoFornecedor(f).length > 0).length,
      atividades: matriz.atividades.length,
      situacao: situacao.tipo,
      venceEm: situacao.tipo === "em_dia" ? dataBr(situacao.venceEm) : "",
      vigente: raciVigente(situacao, Object.keys(matriz.problemas).length),
    };
  } catch (e) {
    if (e instanceof ModuloNaoInstalado) return null;
    throw e;
  }
}

function BlocoDaTabela({
  titulo,
  bloco,
  colunas,
  temDelta,
}: {
  titulo: string;
  bloco: (typeof BLOCOS)[number]["id"];
  colunas: Awaited<ReturnType<typeof evolucao>>["colunas"];
  temDelta: boolean;
}) {
  const secoes = colunas[0]?.notas.secoes.filter((s) => s.bloco === bloco) ?? [];
  const ultima = colunas[colunas.length - 1];
  const penultima = colunas[colunas.length - 2];
  return (
    <>
      <tr className="bg-slate-50">
        <td className="p-2 font-bold uppercase tracking-wide text-slate-600">{titulo}</td>
        {colunas.map((c) => (
          <td key={c.avaliacao.id} className="p-2 text-center">
            <Nota pct={c.notas.blocos[bloco]} />
          </td>
        ))}
        {temDelta && (
          <td className="p-2 text-center">
            <Variacao antes={penultima.notas.blocos[bloco]} agora={ultima.notas.blocos[bloco]} />
          </td>
        )}
      </tr>
      {secoes.map((s) => (
        <tr key={s.secao}>
          <td className="p-2 pl-4 text-slate-700">
            {s.secao}. {s.nome.charAt(0) + s.nome.slice(1).toLowerCase()}
          </td>
          {colunas.map((c) => (
            <td key={c.avaliacao.id} className="p-2 text-center">
              <Nota pct={c.notas.secoes.find((x) => x.secao === s.secao)?.pct ?? null} />
            </td>
          ))}
          {temDelta && (
            <td className="p-2 text-center">
              <Variacao
                antes={penultima.notas.secoes.find((x) => x.secao === s.secao)?.pct ?? null}
                agora={ultima.notas.secoes.find((x) => x.secao === s.secao)?.pct ?? null}
              />
            </td>
          )}
        </tr>
      ))}
    </>
  );
}
