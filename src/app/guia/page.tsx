import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Icone } from "@/components/Icone";
import { CATEGORIAS_DO_GUIA, guiaCombina } from "@/lib/guia";
import { guiasDaPessoa } from "@/lib/guia-server";

/**
 * COMO FAZER: a lista dos passos a passos.
 *
 * Cada pessoa vê só o que consegue fazer -- o colaborador não lê como
 * cadastrar gente, e a liderança vê os guias das telas que tem liberadas.
 * A busca é por GET (`?q=`), como as outras buscas do app: o link com a
 * busca feita pode ser mandado no WhatsApp para quem perguntou.
 */
export default async function GuiaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const termo = q.trim();

  const meus = await guiasDaPessoa();
  const achados = meus.filter((g) => guiaCombina(g, termo));

  const porCategoria = CATEGORIAS_DO_GUIA.map((c) => ({
    ...c,
    guias: achados.filter((g) => g.categoria === c.id),
  })).filter((c) => c.guias.length > 0);

  return (
    <div>
      <PageHeader title="Como Fazer" subtitle="O passo a passo de cada tarefa no app" />

      <form method="get" className="mb-6 flex gap-2">
        <input
          name="q"
          defaultValue={termo}
          placeholder="Ex: liderança, senha, escala"
          aria-label="Buscar no guia"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 text-base focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          Buscar
        </button>
      </form>

      {termo && (
        <p className="-mt-4 mb-4 text-sm text-slate-500">
          {achados.length === 0
            ? `Nenhum guia encontrado para “${termo}”.`
            : `${achados.length} guia${achados.length > 1 ? "s" : ""} para “${termo}”.`}{" "}
          <Link href="/guia" className="font-semibold text-primary">
            Ver todos
          </Link>
        </p>
      )}

      <div className="space-y-6">
        {porCategoria.map((c) => (
          <section key={c.id} id={c.id} className="scroll-mt-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {c.emoji} {c.titulo}
            </h2>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {c.guias.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/guia/${g.slug}`}
                    className="flex items-center gap-3 p-4 hover:bg-slate-50"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xl text-primary" aria-hidden>
                      <Icone chave={`guia:${g.slug}`} emoji={g.emoji} tamanho={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-800">{g.titulo}</span>
                      <span className="block text-sm text-slate-500">{g.resumo}</span>
                    </span>
                    <span className="shrink-0 text-slate-300" aria-hidden>
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-slate-400">
        Não achou o que procurava? Fale com a sua liderança ou com o Admin do app.
      </p>
    </div>
  );
}
