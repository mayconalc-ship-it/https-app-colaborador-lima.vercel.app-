import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo, requireAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { painelDaRevenda, PreventivaNaoAtualizada } from "@/lib/manutencao-preventiva-server";
import { nomeDoEquipamento } from "@/lib/manutencao-preventiva";
import { ListaDePreventivas, type LinhaDaLista } from "./ListaDePreventivas";

export const dynamic = "force-dynamic";

export default async function ManutencaoPreventivaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string; ver?: string; alvo?: string; alertas?: string }>;
}) {
  const perfil = await requireAcessoModulo("manutencao-preventiva", "/");
  const sp = await searchParams;

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const admin = createAdminClient();
  let painel;
  try {
    painel = await painelDaRevenda(revendaId, admin);
  } catch (e) {
    if (!(e instanceof PreventivaNaoAtualizada)) throw e;
    return (
      <div>
        <PageHeader title="🔩 Manutenção Preventiva" fecharHref="/manutencao-central" />
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Falta rodar a <strong>migration 178</strong> no Supabase.
        </p>
      </div>
    );
  }

  const [{ data: abertasBanco }, { data: historicoBanco }, podeCadastrar] = await Promise.all([
    admin
      .from("manut_prev_execucoes")
      .select("id, modelo_id, equipamento_id")
      .eq("revenda_id", revendaId)
      .eq("iniciada_por", perfil.id)
      .eq("status", "em_andamento"),
    admin
      .from("manut_prev_execucoes")
      .select("id, modelo_id, equipamento_id, finalizada_em, finalizada_por_nome, alertas")
      .eq("revenda_id", revendaId)
      .eq("status", "finalizada")
      .order("finalizada_em", { ascending: false })
      .limit(40),
    podeNoModulo("manutencao-preventiva", "editar"),
  ]);

  const abertaPorAlvo = new Map((abertasBanco ?? []).map((e) => [`${e.modelo_id}:${e.equipamento_id ?? "-"}`, e.id]));

  const linhas: LinhaDaLista[] = painel.alvos.map((a) => ({
    chave: a.chave,
    modeloId: a.modelo.id,
    equipamentoId: a.equipamento?.id ?? null,
    emoji: a.modelo.emoji ?? "🔩",
    tipo: a.modelo.equipamento || a.modelo.nome,
    titulo: a.equipamento ? nomeDoEquipamento(a.equipamento) : a.modelo.nome,
    detalhe: [a.equipamento?.marca, a.equipamento?.capacidade].filter(Boolean).join(" · ") || null,
    periodicidadeDias: a.periodicidadeDias,
    ultima: a.ultima
      ? { id: a.ultima.id, quando: formatarDataHora(a.ultima.em), por: a.ultima.por, alertas: a.ultima.alertas }
      : null,
    prazo: a.prazo,
    abertaId: abertaPorAlvo.get(a.chave) ?? null,
  }));

  // Nome de cada alvo, para o histórico (inclusive aparelho já desativado).
  const nomes = new Map(linhas.map((l) => [l.chave, { emoji: l.emoji, texto: l.equipamentoId ? `${l.tipo} ${l.titulo}` : l.titulo }]));
  const historico = (historicoBanco ?? []).map((e) => {
    const n = nomes.get(`${e.modelo_id}:${e.equipamento_id ?? "-"}`);
    return {
      id: e.id,
      emoji: n?.emoji ?? "🔩",
      texto: n?.texto ?? "Aparelho fora do cadastro",
      quando: e.finalizada_em ? formatarDataHora(e.finalizada_em) : "—",
      por: e.finalizada_por_nome ?? "—",
      alertas: e.alertas ?? 0,
    };
  });

  return (
    <div>
      <PageHeader
        title="🔩 Manutenção Preventiva"
        subtitle="Cada equipamento na frequência combinada."
        fecharHref="/manutencao-central"
      />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <div className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-800">
          <p>✅ {sp.sucesso}</p>
          {sp.alertas && (
            <p className="mt-1 text-xs text-green-900">
              Precisa de conserto?{" "}
              <Link href="/chamados" className="font-bold text-primary underline">
                Abrir chamado para manutenção
              </Link>{" "}
              ·{" "}
              <Link href={`/manutencao-preventiva/${sp.alertas}`} className="font-semibold underline">
                ver o que deu alerta
              </Link>
            </p>
          )}
        </div>
      )}

      {painel.semCadastro.length > 0 && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Sem aparelho cadastrado: <strong>{painel.semCadastro.map((m) => m.equipamento).join(", ")}</strong>.{" "}
          {podeCadastrar ? (
            <Link href="/admin/manutencao-preventiva" className="font-semibold text-primary">
              Cadastrar agora →
            </Link>
          ) : (
            "Peça à liderança para cadastrar."
          )}
        </p>
      )}

      <ListaDePreventivas linhas={linhas} filtroInicial={sp.ver ?? null} destaque={sp.alvo ?? null} />

      <details className="mt-6 rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
          📋 Histórico ({historico.length})
        </summary>
        <div className="border-t border-slate-100">
          {historico.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">Nenhuma preventiva registrada ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {historico.map((e) => (
                <li key={e.id}>
                  <Link href={`/manutencao-preventiva/${e.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50">
                    <span aria-hidden>{e.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{e.texto}</span>
                      <span className="block text-xs text-slate-500">
                        {e.quando} · {e.por}
                      </span>
                    </span>
                    {e.alertas > 0 ? (
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
                        {e.alertas} alerta{e.alertas === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        OK
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      {podeCadastrar && (
        <Link
          href="/admin/manutencao-preventiva"
          className="mt-3 block rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          ⚙️ Aparelhos e frequência
        </Link>
      )}
    </div>
  );
}
