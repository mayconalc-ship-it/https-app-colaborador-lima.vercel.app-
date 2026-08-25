import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { requireAcessoModulo } from "@/lib/require-admin";
import { AREAS, ehAreaValida, ehPdf, type AreaId } from "@/lib/areas";

export default async function EscalaPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>;
}) {
  await requireAcessoModulo("escala");
  const { area: areaParam } = await searchParams;
  const area: AreaId = ehAreaValida(areaParam ?? "") ? (areaParam as AreaId) : "DU";

  const supabase = await createClient();
  const { data: escala } = await supabase
    .from("escala_trabalho")
    .select("area, rotulo, arquivo_url, observacao, atualizado_em")
    .eq("area", area)
    .maybeSingle();

  return (
    <div>
      <PageHeader
        title="Escala de Trabalho"
        subtitle={
          escala?.atualizado_em && escala?.arquivo_url
            ? `Atualizada em ${new Date(escala.atualizado_em).toLocaleDateString("pt-BR")}`
            : "Escolha a sua área"
        }
      />

      <div className="mb-4 flex gap-2">
        {AREAS.map((a) => (
          <Link
            key={a.id}
            href={`/escala?area=${a.id}`}
            className={`flex-1 rounded-xl border py-3 text-center text-sm font-semibold ${
              a.id === area
                ? "border-primary bg-primary-soft text-primary"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {a.curto}
          </Link>
        ))}
      </div>

      {escala?.observacao && (
        <p className="mb-4 rounded-xl border border-gold bg-gold-soft p-3 text-sm font-medium text-primary-dark">
          {escala.observacao}
        </p>
      )}

      {!escala?.arquivo_url ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">🗓️</p>
          <p className="mt-2 font-semibold text-slate-700">
            Escala ainda não publicada
          </p>
          <p className="mt-1 text-sm text-slate-500">
            A escala de {AREAS.find((a) => a.id === area)?.rotulo} será
            publicada aqui. Procure seu gestor se precisar da informação agora.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {ehPdf(escala.arquivo_url) ? (
            <iframe
              src={`${escala.arquivo_url}#view=FitH`}
              className="h-[70vh] w-full"
              title="Escala de trabalho"
            />
          ) : (
            <div className="flex justify-center bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={escala.arquivo_url}
                alt="Escala de trabalho"
                className="w-full object-contain"
              />
            </div>
          )}
          <div className="p-3 text-center">
            <a
              href={escala.arquivo_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary underline"
            >
              Abrir em tela cheia
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
