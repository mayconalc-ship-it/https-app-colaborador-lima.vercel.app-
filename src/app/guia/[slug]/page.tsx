import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { guiaPorSlug, pedacosDoTexto } from "@/lib/guia";
import { guiasDaPessoa } from "@/lib/guia-server";

/** `**Salvar**` vira <strong>Salvar</strong>: o nome do botão salta aos olhos. */
function Texto({ texto }: { texto: string }) {
  return (
    <>
      {pedacosDoTexto(texto).map((p, i) =>
        p.negrito ? (
          <strong key={i} className="font-semibold text-slate-900">
            {p.texto}
          </strong>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </>
  );
}

export default async function GuiaDetalhePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guia = guiaPorSlug(slug);
  if (!guia) notFound();

  const meus = await guiasDaPessoa();
  const podeSeguir = meus.some((g) => g.slug === guia.slug);

  // Link recebido de alguém com mais acesso: em vez de um passo a passo
  // que manda tocar em botões que a pessoa não tem, diz por quê.
  if (!podeSeguir) {
    return (
      <div>
        <PageHeader title={guia.titulo} fecharHref="/guia" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-3xl" aria-hidden>
            🔒
          </p>
          <p className="mt-2 font-semibold text-slate-700">Este passo a passo é para quem tem acesso a essa tela</p>
          <p className="mt-1 text-sm text-slate-500">Se você precisa fazer isso, peça a liberação ao Admin do app.</p>
          <Link href="/guia" className="mt-4 inline-block font-semibold text-primary">
            Ver os guias disponíveis para você
          </Link>
        </div>
      </div>
    );
  }

  const relacionados = (guia.relacionados ?? [])
    .map((s) => meus.find((g) => g.slug === s))
    .filter((g) => g !== undefined);

  return (
    <div>
      <PageHeader title={`${guia.emoji} ${guia.titulo}`} subtitle={guia.resumo} fecharHref="/guia" />

      {guia.antes && guia.antes.length > 0 && (
        <section className="mb-4 rounded-2xl border border-primary/25 bg-primary-soft p-4">
          <h2 className="mb-1 text-sm font-bold text-primary-dark">Antes de começar</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-primary-dark">
            {guia.antes.map((a) => (
              <li key={a}>
                <Texto texto={a} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ol className="space-y-3">
        {guia.passos.map((p, i) => (
          <li key={i} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-sm leading-relaxed text-slate-700">
                <span className="sr-only">Passo {i + 1}: </span>
                <Texto texto={p.texto} />
              </p>
              {p.dica && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">💡 {p.dica}</p>}
            </div>
          </li>
        ))}
      </ol>

      {guia.tela && (
        <Link
          href={guia.tela.href}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
        >
          {guia.tela.rotulo} →
        </Link>
      )}

      {guia.atencao && guia.atencao.length > 0 && (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="mb-1 text-sm font-bold text-amber-900">⚠️ Fique atento</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-amber-900">
            {guia.atencao.map((a) => (
              <li key={a}>
                <Texto texto={a} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {relacionados.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Veja também</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {relacionados.map((g) => (
              <li key={g.slug}>
                <Link href={`/guia/${g.slug}`} className="flex items-center gap-3 p-3 text-sm hover:bg-slate-50">
                  <span aria-hidden>{g.emoji}</span>
                  <span className="flex-1 font-medium text-slate-700">{g.titulo}</span>
                  <span className="text-slate-300" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link href="/guia" className="mt-6 block text-center text-sm font-semibold text-primary">
        ← Todos os guias
      </Link>
    </div>
  );
}
