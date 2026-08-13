import { decodificar } from "@/lib/texto-url";
import { requireModulo } from "@/lib/require-admin";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import {
  enviarSonhoDaRevenda,
  excluirSonhoDaRevenda,
  removerQuadroIndicadores,
} from "./actions";

export default async function AdminSonhoRevendaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string; ano?: string }>;
}) {
  await requireModulo("sonho", "ver");
  const { erro, sucesso, ano: anoParam } = await searchParams;

  const anoAtual = new Date().getFullYear();
  const ano = Number(anoParam) || anoAtual;

  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("sonho_revenda")
    .select("ano, titulo, frase, arquivo_url, quadro_indicadores_url, tipo")
    .eq("ano", ano)
    .maybeSingle();

  const { data: anos } = await supabase
    .from("sonho_revenda")
    .select("ano")
    .order("ano", { ascending: false });

  return (
    <div>
      <PageHeader
        title="Sonho da Revenda"
        subtitle="O Sonho é anual: escolha o ano para editar"
      />

      {erro && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}
      {sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {decodificar(sucesso)}
        </p>
      )}

      <form
        method="get"
        className="mb-4 flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex-1">
          <label
            htmlFor="ano-busca"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Ano
          </label>
          <input
            id="ano-busca"
            name="ano"
            type="number"
            defaultValue={ano}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
          />
          {anos && anos.length > 0 && (
            <p className="mt-1 text-xs text-slate-400">
              Cadastrados: {anos.map((a) => a.ano).join(", ")}
            </p>
          )}
        </div>
        <button
          type="submit"
          className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Carregar
        </button>
      </form>

      {atual && (
        <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-slate-500">
              Conteúdo cadastrado para {ano}
            </p>
            <BotaoExcluir
              action={excluirSonhoDaRevenda}
              campos={{ ano }}
              confirmacao={`Excluir todo o Sonho da Revenda de ${ano}? Essa ação não pode ser desfeita.`}
            >
              Excluir o sonho de {ano}
            </BotaoExcluir>
          </div>

          {atual.frase && (
            <p className="italic text-slate-700">&ldquo;{atual.frase}&rdquo;</p>
          )}

          {atual.tipo === "imagem" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={atual.arquivo_url}
              alt={atual.titulo}
              className="max-h-40 rounded-lg object-contain"
            />
          ) : (
            <a
              href={atual.arquivo_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-sm text-primary underline"
            >
              {atual.tipo === "pdf"
                ? "Ver PDF atual"
                : "Ver apresentação atual"}
            </a>
          )}

          {atual.quadro_indicadores_url && (
            <div className="border-t border-slate-100 pt-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Quadro de indicadores atual:
                </p>
                <BotaoExcluir
                  action={removerQuadroIndicadores}
                  campos={{ ano }}
                  confirmacao={`Remover o quadro de indicadores de ${ano}?`}
                >
                  Remover quadro
                </BotaoExcluir>
              </div>
              {atual.quadro_indicadores_url.toLowerCase().endsWith(".pdf") ? (
                <a
                  href={atual.quadro_indicadores_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm text-primary underline"
                >
                  Ver PDF do quadro atual
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={atual.quadro_indicadores_url}
                  alt="Quadro de indicadores"
                  className="max-h-40 rounded-lg object-contain"
                />
              )}
            </div>
          )}
        </div>
      )}

      <form
        action={enviarSonhoDaRevenda}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <input type="hidden" name="ano" value={ano} />
        <div>
          <label
            htmlFor="frase"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Frase do Sonho {ano}
          </label>
          <textarea
            id="frase"
            name="frase"
            rows={2}
            defaultValue={atual?.frase ?? ""}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label
            htmlFor="arquivo"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Imagem (PNG/JPG), PDF ou apresentação (PPTX)
            {atual && " — deixe em branco para manter a atual"}
          </label>
          <input
            id="arquivo"
            name="arquivo"
            type="file"
            accept=".png,.jpg,.jpeg,.pdf,.pptx,.ppt"
            required={!atual}
            className="w-full rounded-xl border border-slate-200 p-2 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="quadro"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Quadro de indicadores (imagem ou PDF)
            {atual?.quadro_indicadores_url &&
              " — deixe em branco para manter o atual"}
          </label>
          <input
            id="quadro"
            name="quadro"
            type="file"
            accept=".png,.jpg,.jpeg,.pdf"
            className="w-full rounded-xl border border-slate-200 p-2 text-sm"
          />
        </div>
        {/* Sobe imagem/PDF do sonho: é o upload mais pesado da tela. */}
        <BotaoEnviar
          textoEnviando="Enviando..."
          className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
        >
          Salvar
        </BotaoEnviar>
      </form>
    </div>
  );
}
