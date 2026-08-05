import { decodificar } from "@/lib/texto-url";
import Link from "next/link";
import { requireModulo } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { PadraoItem } from "@/components/PadraoItem";
import { PilarItem } from "@/components/PilarItem";
import { EnviarPadrao } from "@/components/EnviarPadrao";
import { compararTextoPtBr } from "@/lib/padroes-pilares";
import { listarPilares, escolherPilar } from "@/lib/pilares";
import {
  excluirPadrao,
  atualizarPadrao,
  criarPilar,
  renomearPilar,
  moverPilar,
  alternarVisibilidadePilar,
  excluirPilar,
} from "./actions";

export default async function AdminPadroesPage({
  searchParams,
}: {
  searchParams: Promise<{
    erro?: string;
    sucesso?: string;
    pilar?: string;
    aba?: string;
  }>;
}) {
  await requireModulo("padroes", "ver");
  const { erro, sucesso, pilar: pilarParam, aba } = await searchParams;
  const abaPilares = aba === "pilares";

  const pilares = await listarPilares(true);
  const pilaresVisiveis = pilares.filter((p) => p.visivel);
  const pilar = escolherPilar(
    pilaresVisiveis.length ? pilaresVisiveis : pilares,
    pilarParam,
  );

  const supabase = await createClient();

  const [{ data: arquivos }, { data: todos }] = await Promise.all([
    supabase
      .from("padroes")
      .select("id, pilar, caminho, nome, tipo, arquivo_url")
      .eq("pilar", pilar),
    supabase.from("padroes").select("pilar, caminho"),
  ]);

  const pastas = Array.from(
    new Set((todos ?? []).map((p) => p.caminho).filter(Boolean)),
  ).sort(compararTextoPtBr);

  const arquivosPorPilar = new Map<string, number>();
  for (const p of todos ?? []) {
    arquivosPorPilar.set(p.pilar, (arquivosPorPilar.get(p.pilar) ?? 0) + 1);
  }

  const porPasta = new Map<string, NonNullable<typeof arquivos>>();
  for (const arquivo of arquivos ?? []) {
    const chave = arquivo.caminho || "Geral";
    if (!porPasta.has(chave)) porPasta.set(chave, []);
    porPasta.get(chave)!.push(arquivo);
  }

  const pastasOrdenadas = Array.from(porPasta.entries())
    .map(
      ([pasta, itens]) =>
        [
          pasta,
          [...itens].sort((a, b) => compararTextoPtBr(a.nome, b.nome)),
        ] as const,
    )
    .sort(([a], [b]) => compararTextoPtBr(a, b));

  return (
    <div>
      <PageHeader
        title="Gerenciar Padrões"
        subtitle="Enviar arquivos e organizar os pilares"
      />

      {erro && (
        <p className="mb-3 whitespace-pre-line rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}
      {sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {decodificar(sucesso)}
        </p>
      )}

      <div className="mb-4 flex gap-2">
        <Link
          href="/admin/padroes"
          className={`flex-1 rounded-xl border py-3 text-center text-sm font-semibold ${
            !abaPilares
              ? "border-primary bg-primary-soft text-primary"
              : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          Arquivos
        </Link>
        <Link
          href="/admin/padroes?aba=pilares"
          className={`flex-1 rounded-xl border py-3 text-center text-sm font-semibold ${
            abaPilares
              ? "border-primary bg-primary-soft text-primary"
              : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          Pilares
        </Link>
      </div>

      {abaPilares ? (
        <>
          <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer p-4 font-semibold text-primary">
              + Criar novo pilar
            </summary>
            <form action={criarPilar} className="space-y-3 border-t border-slate-100 p-4">
              <div>
                <label
                  htmlFor="novo-pilar"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Nome do pilar
                </label>
                <input
                  id="novo-pilar"
                  name="nome"
                  required
                  placeholder="Ex: Segurança"
                  className="w-full rounded-xl border border-slate-200 p-3 text-base focus:border-primary focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
              >
                Criar
              </button>
            </form>
          </details>

          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {pilares.map((p, i) => (
              <PilarItem
                key={p.id}
                pilar={p}
                quantidadeArquivos={arquivosPorPilar.get(p.nome) ?? 0}
                primeiro={i === 0}
                ultimo={i === pilares.length - 1}
                onRenomear={renomearPilar}
                onMover={moverPilar}
                onAlternar={alternarVisibilidadePilar}
                onExcluir={excluirPilar}
              />
            ))}
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Pilar oculto some da tela do colaborador, mas os arquivos
            continuam guardados. Só é possível excluir um pilar vazio.
          </p>
        </>
      ) : (
        <>
          <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer p-4 font-semibold text-primary">
              + Enviar arquivos
            </summary>
            <div className="border-t border-slate-100">
              <EnviarPadrao
                pilares={(pilaresVisiveis.length ? pilaresVisiveis : pilares).map(
                  (p) => p.nome,
                )}
                pilarAtual={pilar}
                pastas={pastas}
              />
            </div>
          </details>

          <div className="mb-4 flex flex-wrap gap-2">
            {pilares.map((p) => (
              <Link
                key={p.id}
                href={`/admin/padroes?pilar=${encodeURIComponent(p.nome)}`}
                className={`rounded-full px-3 py-2 text-sm font-medium ${
                  p.nome === pilar
                    ? "bg-primary text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200"
                } ${p.visivel ? "" : "opacity-60"}`}
              >
                {p.nome}
                {p.visivel ? "" : " (oculto)"}
              </Link>
            ))}
          </div>

          <p className="mb-3 text-sm text-slate-500">
            {arquivos?.length ?? 0} arquivo(s) em {pilar}
          </p>

          {pastasOrdenadas.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
              Nenhum arquivo neste pilar.
            </div>
          ) : (
            <div className="space-y-6">
              {pastasOrdenadas.map(([pasta, itens]) => (
                <div key={pasta}>
                  <h2 className="mb-2 font-semibold text-slate-700">{pasta}</h2>
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {itens.map((item) => (
                      <PadraoItem
                        key={item.id}
                        padrao={item}
                        pastas={pastas}
                        pilares={pilares.map((p) => p.nome)}
                        onAtualizar={atualizarPadrao}
                        onExcluir={excluirPadrao}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
