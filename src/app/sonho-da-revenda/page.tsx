import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { requireAcessoModulo } from "@/lib/require-admin";

export default async function SonhoRevendaPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>;
}) {
  await requireAcessoModulo("sonho");
  const { ano: anoParam } = await searchParams;

  const supabase = await createClient();
  const { data: sonhos } = await supabase
    .from("sonho_revenda")
    .select("ano, titulo, frase, arquivo_url, quadro_indicadores_url, tipo, criado_em")
    .order("ano", { ascending: false });

  if (!sonhos || sonhos.length === 0) {
    return (
      <div>
        <PageHeader title="Sonho da Revenda" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Ainda não há um Sonho da Revenda cadastrado.
        </div>
      </div>
    );
  }

  const anoSelecionado = anoParam ? Number(anoParam) : sonhos[0].ano;
  const sonho = sonhos.find((s) => s.ano === anoSelecionado) ?? sonhos[0];

  return (
    <div>
      <PageHeader title={`Sonho da Revenda ${sonho.ano}`} />

      {sonhos.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {sonhos.map((s) => (
            <Link
              key={s.ano}
              href={`/sonho-da-revenda?ano=${s.ano}`}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                s.ano === sonho.ano
                  ? "bg-primary text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200"
              }`}
            >
              {s.ano}
            </Link>
          ))}
        </div>
      )}

      {sonho.frase && (
        <div className="mb-4 rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-5 text-center text-white shadow-sm">
          <p className="text-lg font-semibold italic">&ldquo;{sonho.frase}&rdquo;</p>
        </div>
      )}

      <div className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {sonho.tipo === "imagem" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sonho.arquivo_url}
            alt={sonho.titulo}
            className="w-full object-contain"
          />
        ) : (
          <>
            <iframe
              src={
                sonho.tipo === "pdf"
                  ? `${sonho.arquivo_url}#view=FitH`
                  : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sonho.arquivo_url)}`
              }
              className="h-[70vh] w-full"
              title={sonho.titulo}
            />
            <div className="p-3 text-center">
              <a
                href={sonho.arquivo_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary underline"
              >
                {sonho.tipo === "pdf"
                  ? "Abrir PDF em tela cheia"
                  : "Baixar apresentação"}
              </a>
            </div>
          </>
        )}
      </div>

      {sonho.quadro_indicadores_url && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-3 text-sm font-semibold text-slate-700">
            Quadro de indicadores
          </div>
          {sonho.quadro_indicadores_url.toLowerCase().endsWith(".pdf") ? (
            <>
              <iframe
                src={`${sonho.quadro_indicadores_url}#view=FitH`}
                className="h-[70vh] w-full"
                title="Quadro de indicadores"
              />
              <div className="p-3 text-center">
                <a
                  href={sonho.quadro_indicadores_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-primary underline"
                >
                  Abrir PDF em tela cheia
                </a>
              </div>
            </>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sonho.quadro_indicadores_url}
              alt="Quadro de indicadores"
              className="w-full object-contain"
            />
          )}
        </div>
      )}
    </div>
  );
}
