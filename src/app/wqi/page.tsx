import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { FotoEvidencia } from "@/components/FotoEvidencia";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import { formatarDataHora, hojeISO, turnoAtual } from "@/lib/produtividade-armazem";
import {
  COLUNAS_BAIXA_WQI,
  ROTULO_TURNO_WQI,
  ROTULO_UNIDADE_WQI_CURTO,
  dataBR,
  ehUnidadeWqi,
  type BaixaWqi,
  type ItemCatalogoWqi,
} from "@/lib/wqi";
import { FormBaixaWqi } from "./FormBaixaWqi";

export const dynamic = "force-dynamic";

export default async function WqiPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  if (!(await temAcessoModulo("wqi"))) {
    redirect(`/?erro=${encodeURIComponent("Você não tem acesso a este módulo. Fale com o Admin.")}`);
  }
  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: produtosBanco }, { data: motivosBanco }, { data: locaisBanco }, { data: minhasBanco }, podeVerPainel] =
    await Promise.all([
      supabase.from("pa_produtos").select("cluster_produto, tipo").eq("revenda_id", revendaId).eq("ativo", true),
      supabase.from("pa_wqi_motivos").select("id, nome, ajuda").eq("revenda_id", revendaId).eq("ativo", true).order("nome"),
      supabase.from("pa_wqi_locais").select("id, nome").eq("revenda_id", revendaId).eq("ativo", true).order("nome"),
      supabase
        .from("pa_wqi_baixas")
        .select(COLUNAS_BAIXA_WQI)
        .eq("revenda_id", revendaId)
        .eq("colaborador_id", perfil.id)
        .order("criado_em", { ascending: false })
        .limit(20),
      podeNoModulo("wqi", "ver"),
    ]);

  const clusters = [
    ...new Set((produtosBanco ?? []).map((p) => p.cluster_produto).filter((c): c is string => Boolean(c))),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const tipos = [...new Set((produtosBanco ?? []).map((p) => p.tipo).filter((t): t is string => Boolean(t)))].sort();
  const minhas = (minhasBanco ?? []) as unknown as BaixaWqi[];

  return (
    <div>
      <PageHeader
        title="💸 Baixa WQI"
        subtitle="Quebra de produto acabado por manuseio dentro do armazém."
        fecharHref="/produtividade-armazem"
      />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>}

      {podeVerPainel && (
        <a
          href="/gestao/wqi"
          className="mb-4 inline-flex w-full items-center justify-center rounded-xl border border-primary/30 bg-primary-soft px-4 py-2.5 text-sm font-semibold text-primary-dark hover:border-primary"
        >
          📊 Ver o painel de quebras WQI
        </a>
      )}

      <section className="space-y-6">
        <FormBaixaWqi
          clusters={clusters}
          tipos={tipos}
          motivos={(motivosBanco ?? []) as ItemCatalogoWqi[]}
          locais={(locaisBanco ?? []) as ItemCatalogoWqi[]}
          turnoSugerido={turnoAtual()}
          hoje={hojeISO()}
        />

        <div>
          <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">O que eu lancei</h2>
          {minhas.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Você ainda não lançou nenhuma baixa WQI.</p>
          ) : (
            <ul className="space-y-2">
              {minhas.map((b) => (
                <li key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{b.motivo}</p>
                      <p className="mt-0.5 break-words text-sm text-slate-700">
                        {b.produto_codigo} — {b.produto_descricao}
                      </p>
                      <p className="text-xs text-slate-600">
                        {b.quantidade} {ehUnidadeWqi(b.unidade) ? ROTULO_UNIDADE_WQI_CURTO[b.unidade] : b.unidade} · {b.local} ·{" "}
                        {ROTULO_TURNO_WQI[b.turno]}
                      </p>
                      {b.responsavel_nome && (
                        <p className="text-xs text-slate-500">
                          Manuseio: {b.responsavel_nome}
                          {b.responsavel_funcao ? ` (${b.responsavel_funcao})` : ""}
                        </p>
                      )}
                      {b.nota_fiscal && <p className="text-xs text-slate-500">NF {b.nota_fiscal}</p>}
                    </div>
                    <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                      {dataBR(b.data_ocorrido)}
                    </span>
                  </div>
                  {b.observacao && <p className="mt-2 text-xs text-slate-600">{b.observacao}</p>}
                  {b.foto_url && (
                    <div className="mt-2">
                      <FotoEvidencia src={b.foto_url} alt="Evidência da quebra" classeCaixa="h-24 w-32" />
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-slate-400">Lançado em {formatarDataHora(b.criado_em)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
