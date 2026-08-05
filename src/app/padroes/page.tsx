import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { compararTextoPtBr, iconePorTipo } from "@/lib/padroes-pilares";
import { listarPilares, escolherPilar } from "@/lib/pilares";

export default async function PadroesPage({
  searchParams,
}: {
  searchParams: Promise<{ pilar?: string }>;
}) {
  const { pilar: pilarParam } = await searchParams;

  // Só os pilares marcados como visíveis pelo admin.
  const pilares = await listarPilares();
  const pilar = escolherPilar(pilares, pilarParam);

  const supabase = await createClient();
  const { data: arquivos } = await supabase
    .from("padroes")
    .select("caminho, nome, tipo, arquivo_url")
    .eq("pilar", pilar);

  const porTopico = new Map<
    string,
    { nome: string; tipo: string; arquivo_url: string }[]
  >();
  for (const arquivo of arquivos ?? []) {
    const chave = arquivo.caminho || "Geral";
    if (!porTopico.has(chave)) porTopico.set(chave, []);
    porTopico.get(chave)!.push(arquivo);
  }

  // A ordenação vem para cá (e não do banco) porque o Postgres compara texto
  // byte a byte: acento e número saem fora de ordem para o leitor brasileiro.
  const topicosOrdenados = Array.from(porTopico.entries())
    .map(
      ([topico, itens]) =>
        [topico, [...itens].sort((a, b) => compararTextoPtBr(a.nome, b.nome))] as const,
    )
    .sort(([a], [b]) => compararTextoPtBr(a, b));

  return (
    <div>
      <PageHeader title="Padrões" subtitle="Escolha o pilar" />

      <div className="mb-4 flex flex-wrap gap-2">
        {pilares.map((p) => (
          <Link
            key={p.id}
            href={`/padroes?pilar=${encodeURIComponent(p.nome)}`}
            className={`rounded-full px-3 py-2 text-sm font-medium ${
              p.nome === pilar
                ? "bg-primary text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {p.nome}
          </Link>
        ))}
      </div>

      {topicosOrdenados.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Ainda não há padrões cadastrados para {pilar}.
        </div>
      ) : (
        <div className="space-y-6">
          {topicosOrdenados.map(([topico, itens]) => (
            <div key={topico}>
              <h2 className="mb-2 font-semibold text-slate-700">{topico}</h2>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {itens.map((item) => (
                  <a
                    key={item.arquivo_url}
                    href={item.arquivo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-4 hover:bg-slate-50"
                  >
                    <span className="text-xl">{iconePorTipo(item.tipo)}</span>
                    <span className="flex-1 text-sm font-medium text-slate-800">
                      {item.nome}
                    </span>
                    <span className="text-xs uppercase text-slate-400">
                      {item.tipo}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
