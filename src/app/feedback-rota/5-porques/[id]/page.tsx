import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { rotuloCategoria } from "@/lib/cinco-porques-problemas";
import { PageHeader } from "@/components/PageHeader";
import { RetornoLideranca } from "./RetornoLideranca";

/**
 * Tela de UMA análise, do ponto de vista do motorista -- pra onde a
 * notificação "Seu 5 Porquês recebeu resposta" leva. Mostra a causa raiz
 * que ele mesmo encontrou e, se a liderança já respondeu, o retorno dela
 * com os botões de aceitar/não aceitar.
 */
export default async function AnaliseCincoPorquesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);

  if (!Number.isInteger(id)) {
    return (
      <div>
        <PageHeader title="🧠 5 Porquês" />
        <NaoEncontrada />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div>
        <PageHeader title="🧠 5 Porquês" />
        <NaoEncontrada />
      </div>
    );
  }

  const revendaId = await getRevendaId();

  const { data: analise } = revendaId
    ? await supabase
        .from("cinco_porques_analises")
        .select(
          "id, problema_label, causa_raiz, categoria, acao_sugerida, status, resposta_lideranca, resposta_lideranca_em, resposta_lideranca_nome, motorista_aceitou",
        )
        .eq("id", id)
        .eq("colaborador_id", user.id)
        .eq("revenda_id", revendaId)
        .maybeSingle()
    : { data: null };

  if (!analise || analise.status !== "concluida") {
    return (
      <div>
        <PageHeader title="🧠 5 Porquês" />
        <NaoEncontrada />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="🧠 5 Porquês" subtitle={analise.problema_label} />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          🎯 Causa raiz
        </p>
        <p className="mt-1 text-base font-semibold text-slate-900">{analise.causa_raiz}</p>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          📂 Categoria
        </p>
        <p className="mt-1 text-sm text-slate-700">{rotuloCategoria(analise.categoria ?? "")}</p>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          💡 Ação sugerida
        </p>
        <p className="mt-1 text-sm text-slate-700">{analise.acao_sugerida}</p>
      </div>

      {analise.resposta_lideranca ? (
        <div className="mt-4 rounded-2xl border border-primary/30 bg-primary-soft p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            💬 Retorno de {analise.resposta_lideranca_nome ?? "liderança"}
          </p>
          <p className="mt-1 text-sm text-slate-800">{analise.resposta_lideranca}</p>

          <RetornoLideranca analiseId={analise.id} aceitouInicial={analise.motorista_aceitou} />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500 shadow-sm">
          A liderança ainda não respondeu esta análise.
        </div>
      )}

      <Link
        href="/"
        className="mt-4 flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        Voltar ao menu
      </Link>
    </div>
  );
}

function NaoEncontrada() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
      Não encontramos essa análise.
      <Link
        href="/feedback-rota"
        className="mt-4 block rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Ir para o Feedback da Rota
      </Link>
    </div>
  );
}
