import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { rotuloNota, rotuloOcorrencia } from "@/lib/feedback-ocorrencias";
import { PageHeader } from "@/components/PageHeader";
import { AceiteFeedback } from "./AceiteFeedback";

/**
 * Tela de UM feedback de rota "Regular", do ponto de vista do colaborador
 * -- pra onde a notificação "Seu feedback recebeu resposta" leva. Espelha
 * /feedback-rota/5-porques/[id] para o 5 Porquês: mostra o que o próprio
 * colaborador relatou e, se a liderança já respondeu, o retorno dela (com
 * quem respondeu) e os botões de aceitar/não aceitar.
 */
export default async function FeedbackRotaDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);

  if (!Number.isInteger(id)) {
    return (
      <div>
        <PageHeader title="📝 Feedback da Rota" />
        <NaoEncontrado />
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
        <PageHeader title="📝 Feedback da Rota" />
        <NaoEncontrado />
      </div>
    );
  }

  const revendaId = await getRevendaId();

  const { data: feedback } = revendaId
    ? await supabase
        .from("feedback_rota")
        .select(
          "id, nota, rota, ocorrencias, comentario, resposta_lideranca, resposta_lideranca_em, resposta_lideranca_nome, colaborador_aceitou",
        )
        .eq("id", id)
        .eq("colaborador_id", user.id)
        .eq("revenda_id", revendaId)
        .maybeSingle()
    : { data: null };

  if (!feedback) {
    return (
      <div>
        <PageHeader title="📝 Feedback da Rota" />
        <NaoEncontrado />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="📝 Feedback da Rota" subtitle={`Mapa ${feedback.rota ?? "—"}`} />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Nota
        </p>
        <p className="mt-1 text-base font-semibold text-slate-900">
          {rotuloNota(feedback.nota)}
        </p>

        {feedback.ocorrencias?.length > 0 && (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Ocorrências
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {feedback.ocorrencias.map((oc: string) => (
                <span
                  key={oc}
                  className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"
                >
                  {rotuloOcorrencia(oc)}
                </span>
              ))}
            </div>
          </>
        )}

        {feedback.comentario && (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Seu comentário
            </p>
            <p className="mt-1 text-sm text-slate-700">{feedback.comentario}</p>
          </>
        )}
      </div>

      {feedback.resposta_lideranca ? (
        <div className="mt-4 rounded-2xl border border-primary/30 bg-primary-soft p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            💬 Retorno de {feedback.resposta_lideranca_nome ?? "liderança"}
          </p>
          <p className="mt-1 text-sm text-slate-800">{feedback.resposta_lideranca}</p>

          <AceiteFeedback feedbackId={feedback.id} aceitouInicial={feedback.colaborador_aceitou} />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-500 shadow-sm">
          A liderança ainda não respondeu este feedback.
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

function NaoEncontrado() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
      Não encontramos esse feedback.
      <Link
        href="/feedback-rota"
        className="mt-4 block rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Ir para o Feedback da Rota
      </Link>
    </div>
  );
}
