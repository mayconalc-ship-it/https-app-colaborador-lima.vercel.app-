import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { requireGestor, podeNoModulo } from "@/lib/require-admin";
import {
  FONTES,
  ROTULO_TIPO,
  estaVelha,
  fontesComLink,
  fontesPorUpload,
  tempoDesde,
  type Fonte,
} from "@/lib/fontes-de-dados";
import { salvarFonte } from "./actions";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

type Estado = {
  pasta_link: string | null;
  ultima_sincronizacao: string | null;
  ultimo_resultado: string | null;
};

/**
 * DE ONDE VÊM OS DADOS DESTE APP
 *
 * A configuração da fonte morava dentro da tela de cada módulo -- sete
 * telas, sete layouts, e nenhum lugar que respondesse a pergunta acima.
 * Esta tela responde, e é onde se edita o link.
 *
 * O IMPORT continua na tela do módulo, de propósito: importar é uma ação
 * com consequência (reescreve dados do período) e mora junto do histórico
 * e das mensagens de erro que explicam o que aconteceu. Aqui se configura
 * de onde vem; lá se puxa.
 */
export default async function FontesDeDadosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireGestor();
  const sp = await searchParams;

  const revendaId = await getRevendaId();
  if (!revendaId) {
    return <PageHeader title="🔌 Fontes de Dados" subtitle="Você não está em nenhuma revenda." />;
  }

  const admin = createAdminClient();
  const comLink = fontesComLink();

  // Uma leitura por tabela, em paralelo. São 5 tabelas pequenas de uma
  // linha; não vale a pena inventar uma view para isto.
  const estados = new Map<string, Estado | null>();
  const rvLinhas: { area: string; rotulo: string; csv_url: string | null }[] = [];

  await Promise.all(
    comLink.map(async (f) => {
      if (f.chave === "rv") {
        const { data } = await admin
          .from("rv_config")
          .select("area, rotulo, csv_url, atualizado_em")
          .eq("revenda_id", revendaId)
          .order("area");
        rvLinhas.push(...((data ?? []) as typeof rvLinhas));
        const maisRecente = (data ?? [])
          .map((r) => (r as { atualizado_em: string }).atualizado_em)
          .sort()
          .pop();
        estados.set(f.chave, {
          pasta_link: (data ?? []).length ? `${(data ?? []).length} planilha(s)` : null,
          ultima_sincronizacao: maisRecente ?? null,
          ultimo_resultado: null,
        });
        return;
      }
      const { data } = await admin
        .from(f.tabela as string)
        .select("pasta_link, ultima_sincronizacao, ultimo_resultado")
        .eq("revenda_id", revendaId)
        .maybeSingle();
      estados.set(f.chave, (data as Estado) ?? null);
    }),
  );

  const permissoes = new Map<string, boolean>();
  await Promise.all(
    FONTES.map(async (f) =>
      permissoes.set(f.chave, await podeNoModulo(f.modulo as never, "criar")),
    ),
  );

  const configuradas = comLink.filter((f) => estados.get(f.chave)?.pasta_link).length;
  const velhas = comLink.filter((f) => {
    const e = estados.get(f.chave);
    return e?.pasta_link && estaVelha(e.ultima_sincronizacao);
  }).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="🔌 Fontes de Dados"
        subtitle="De onde vem cada número do app, e quando entrou pela última vez."
      />

      {sp.erro && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>
      )}
      {sp.sucesso && (
        <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
          ✅ {sp.sucesso}
        </p>
      )}

      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase text-slate-500">Fontes configuradas</p>
          <p className="text-2xl font-extrabold text-slate-900">
            {configuradas}
            <span className="text-base font-semibold text-slate-400"> de {comLink.length}</span>
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase text-slate-500">Sem atualizar</p>
          <p className={`text-2xl font-extrabold ${velhas > 0 ? "text-amber-700" : "text-slate-900"}`}>
            {velhas}
          </p>
          <p className="text-[11px] text-slate-400">há mais de 3 dias</p>
        </div>
      </div>

      <div className="space-y-3">
        {comLink.map((f) => (
          <CartaoDaFonte
            key={f.chave}
            fonte={f}
            estado={estados.get(f.chave) ?? null}
            podeEditar={permissoes.get(f.chave) ?? false}
            rvLinhas={f.chave === "rv" ? rvLinhas : undefined}
          />
        ))}
      </div>

      {/* As que não guardam link. Ficam aqui para a resposta "de onde vêm
          os dados?" ser COMPLETA -- omiti-las faria a tela parecer que só
          existem cinco fontes. */}
      <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          📎 Enviadas por arquivo ({fontesPorUpload().length})
        </summary>
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {fontesPorUpload().map((f) => (
            <div key={f.chave} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-slate-900">{f.rotulo}</p>
                <Link
                  href={f.telaDoModulo}
                  className="shrink-0 text-xs font-semibold text-primary hover:underline"
                >
                  Abrir a tela →
                </Link>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{f.alimenta}</p>
              <p className="mt-1.5 text-[11px] text-slate-400">{f.ajuda}</p>
            </div>
          ))}
        </div>
      </details>

      <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
        💡 Aqui se configura <strong>de onde vem</strong>. A importação em si continua na tela de
        cada módulo — importar reescreve os dados do período, e a mensagem de erro que explica o que
        aconteceu mora junto do histórico de lá.
      </p>
    </div>
  );
}

function CartaoDaFonte({
  fonte,
  estado,
  podeEditar,
  rvLinhas,
}: {
  fonte: Fonte;
  estado: Estado | null;
  podeEditar: boolean;
  rvLinhas?: { area: string; rotulo: string; csv_url: string | null }[];
}) {
  const configurada = !!estado?.pasta_link;
  const velha = configurada && estaVelha(estado?.ultima_sincronizacao);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">{fonte.rotulo}</p>
            <p className="mt-0.5 text-xs text-slate-500">{fonte.alimenta}</p>
          </div>
          <span
            className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold ${
              !configurada
                ? "bg-red-50 text-red-700"
                : velha
                  ? "bg-amber-50 text-amber-800"
                  : "bg-green-50 text-green-700"
            }`}
          >
            {!configurada ? "sem fonte" : velha ? "sem atualizar" : "em dia"}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold">
            {ROTULO_TIPO[fonte.tipo]}
          </span>
          <span>
            Última entrada:{" "}
            <strong className="text-slate-700">{tempoDesde(estado?.ultima_sincronizacao)}</strong>
          </span>
          <Link href={fonte.telaDoModulo} className="font-semibold text-primary hover:underline">
            Importar na tela do módulo →
          </Link>
        </div>

        {estado?.ultimo_resultado && (
          <p className="mt-2 break-words border-l-2 border-slate-200 pl-2 text-[11px] text-slate-500">
            {estado.ultimo_resultado}
          </p>
        )}
      </div>

      <div className="p-4">
        {/* A RV tem VÁRIAS planilhas, uma por área -- não cabe num campo
            só. Aqui ela é listada e a edição continua na tela dela. */}
        {rvLinhas ? (
          <>
            <ul className="space-y-1.5">
              {rvLinhas.length === 0 ? (
                <li className="text-sm text-slate-400">Nenhuma planilha cadastrada.</li>
              ) : (
                rvLinhas.map((r) => (
                  <li key={r.area} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-slate-700">
                      {r.rotulo} <span className="text-slate-400">({r.area})</span>
                    </span>
                    <span
                      className={`shrink-0 text-[11px] font-semibold ${
                        r.csv_url ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {r.csv_url ? "conectada" : "sem link"}
                    </span>
                  </li>
                ))
              )}
            </ul>
            <Link
              href={fonte.telaDoModulo}
              className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline"
            >
              Editar as planilhas da RV →
            </Link>
          </>
        ) : podeEditar ? (
          <form action={salvarFonte} className="space-y-2">
            <input type="hidden" name="chave" value={fonte.chave} />
            <label
              className="block text-[11px] font-semibold uppercase text-slate-500"
              htmlFor={`link-${fonte.chave}`}
            >
              Link da pasta no Drive
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id={`link-${fonte.chave}`}
                name="link"
                defaultValue={estado?.pasta_link ?? ""}
                placeholder="https://drive.google.com/drive/folders/..."
                className={`${campo} min-w-0 flex-1`}
              />
              <BotaoEnviar
                compacto
                className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Salvar
              </BotaoEnviar>
            </div>
            <p className="text-[11px] text-slate-400">{fonte.ajuda}</p>
          </form>
        ) : (
          <p className="text-xs text-slate-400">
            Você não tem permissão para configurar esta fonte. Ela é liberada junto com o módulo{" "}
            <strong>{fonte.rotulo}</strong>.
          </p>
        )}
      </div>
    </section>
  );
}
