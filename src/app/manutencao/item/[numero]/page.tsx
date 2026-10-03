import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { exigirRevenda } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { rotuloTrimestre, separarCriterios, type Nota } from "@/lib/manutencao";
import {
  MODULO_MANUTENCAO,
  ModuloNaoInstalado,
  lerItens,
  lerRespostas,
  listarAvaliacoes,
} from "@/lib/manutencao-server";
import { AvisoNaoInstalado } from "../../AvisoNaoInstalado";

export const dynamic = "force-dynamic";

const COR: Record<string, string> = {
  "3": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "1": "bg-amber-100 text-amber-800 border-amber-200",
  "0": "bg-red-100 text-red-800 border-red-200",
  na: "bg-slate-100 text-slate-600 border-slate-200",
  vazio: "bg-white text-slate-400 border-slate-200",
};

/**
 * A EVOLUÇÃO DE UM ITEM, COM AS FOTOS -- o pedido da auditora.
 *
 * Uma linha do tempo, do trimestre mais novo para o mais antigo: a nota,
 * as fotos daquele trimestre, a observação e o plano de ação. É a tela
 * para abrir na frente da auditoria e mostrar "a telha estava assim em
 * março, assim em junho, e hoje está assim".
 */
async function carregar(revendaId: string, numero: string) {
  try {
    const [itens, avaliacoes] = await Promise.all([lerItens(revendaId), listarAvaliacoes(revendaId)]);
    const item = itens.find((i) => i.numero === numero);
    if (!item) return { tipo: "nao-achou" as const };
    const respostas = await lerRespostas(avaliacoes.map((a) => a.id));
    return { tipo: "ok" as const, itens, avaliacoes, item, respostas };
  } catch (e) {
    if (e instanceof ModuloNaoInstalado) return { tipo: "nao-instalado" as const };
    throw e;
  }
}

export default async function EvolucaoDoItemPage({ params }: { params: Promise<{ numero: string }> }) {
  await requireAcessoModulo(MODULO_MANUTENCAO);
  const revendaId = await exigirRevenda("/");
  const { numero } = await params;

  const dados = await carregar(revendaId, decodeURIComponent(numero));
  if (dados.tipo === "nao-instalado") return <AvisoNaoInstalado />;
  if (dados.tipo === "nao-achou") notFound();
  const { itens, avaliacoes, item, respostas } = dados;
  const linhas = avaliacoes.map((a) => ({ avaliacao: a, resposta: (respostas.get(a.id) ?? []).find((r) => r.itemId === item.id) }));
  const criterios = separarCriterios(item.criterios);

  // Vizinhos, para andar item a item sem voltar à lista.
  const posicao = itens.findIndex((i) => i.id === item.id);
  const anterior = itens[posicao - 1];
  const proximo = itens[posicao + 1];

  return (
    <div>
      <PageHeader title={`🛠️ Item ${item.numero}`} subtitle={`${item.secao}. ${item.secaoNome}`} fecharHref="/manutencao" />

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold leading-snug text-slate-900">{item.pergunta}</p>
        <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
          {item.critico && <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-800">⚠️ Item crítico</span>}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">Peso {item.peso}</span>
        </p>
        <details className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-primary-dark">🔎 Como verificar e critérios</summary>
          <p className="mt-2 leading-relaxed">{item.verificacao}</p>
          <ul className="mt-2 space-y-1">
            {([3, 1, 0] as Nota[]).map((n) =>
              criterios[n] ? (
                <li key={n}>
                  <strong>{n}:</strong> {criterios[n]}
                </li>
              ) : null,
            )}
          </ul>
        </details>
      </section>

      {/* A faixa: a nota de cada trimestre, lado a lado, do mais antigo ao mais novo. */}
      {linhas.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {[...linhas].reverse().map(({ avaliacao, resposta }) => {
            const chave = !resposta ? "vazio" : resposta.na ? "na" : String(resposta.nota);
            return (
              <a key={avaliacao.id} href={`#t-${avaliacao.id}`} className={`rounded-xl border px-3 py-2 text-center ${COR[chave]}`}>
                <span className="block text-[11px] font-semibold">{rotuloTrimestre(avaliacao)}</span>
                <span className="block text-lg font-bold">{!resposta ? "—" : resposta.na ? "N/A" : resposta.nota}</span>
              </a>
            );
          })}
        </div>
      )}

      <ol className="space-y-3">
        {linhas.map(({ avaliacao, resposta }) => (
          <li key={avaliacao.id} id={`t-${avaliacao.id}`} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/manutencao/${avaliacao.id}#item-${item.numero}`} className="text-sm font-bold text-primary hover:underline">
                {rotuloTrimestre(avaliacao)}
              </Link>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                  COR[!resposta ? "vazio" : resposta.na ? "na" : String(resposta.nota)]
                }`}
              >
                {!resposta ? "não avaliado" : resposta.na ? "N/A" : `nota ${resposta.nota}`}
              </span>
            </div>
            {resposta && (
              <>
                {resposta.fotos.length > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {resposta.fotos.map((f, i) =>
                      f.url ? (
                        <a key={f.id} href={f.url} target="_blank" rel="noreferrer" title="Abrir a foto inteira">
                          {/* eslint-disable-next-line @next/next/no-img-element -- link assinado do bucket privado */}
                          <img
                            src={f.url}
                            alt={`${rotuloTrimestre(avaliacao)}, foto ${i + 1} do item ${item.numero}`}
                            loading="lazy"
                            className="aspect-[4/3] w-full rounded-lg border border-slate-200 object-cover"
                          />
                        </a>
                      ) : null,
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">Sem foto neste trimestre.</p>
                )}
                {resposta.observacao && <p className="mt-2 text-xs text-slate-700">{resposta.observacao}</p>}
                {resposta.planoAcao && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">
                    <strong>Plano:</strong> {resposta.planoAcao}
                    {resposta.responsavel ? ` · ${resposta.responsavel}` : ""}
                    {resposta.prazo ? ` · até ${resposta.prazo.split("-").reverse().join("/")}` : ""}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-slate-400">Avaliado por {resposta.respondidoPorNome}</p>
              </>
            )}
          </li>
        ))}
      </ol>
      {linhas.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Nenhuma avaliação ainda.</p>
      )}

      <nav className="mt-6 flex justify-between gap-2 text-sm font-semibold">
        {anterior ? (
          <Link href={`/manutencao/item/${anterior.numero}`} className="text-primary">
            ← {anterior.numero}
          </Link>
        ) : (
          <span />
        )}
        {proximo && (
          <Link href={`/manutencao/item/${proximo.numero}`} className="text-primary">
            {proximo.numero} →
          </Link>
        )}
      </nav>
    </div>
  );
}
