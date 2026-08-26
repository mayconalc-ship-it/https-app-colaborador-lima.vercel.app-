import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { labelOcorrencia } from "@/lib/feedback-ocorrencias";
import { PageHeader } from "@/components/PageHeader";
import { FluxoCincoPorques } from "./FluxoCincoPorques";

/**
 * Porta de entrada dos 5 Porquês -- e o portão que a Regra Principal exige:
 * "o Feedback da Rota é obrigatório para liberar o 5 Porquês". Por isso
 * esta página é um Server Component que exige um `feedbackId` de verdade,
 * dono de quem está logado, nesta revenda -- tentar abrir a URL direto
 * sem ter passado pelo Feedback da Rota cai no bloqueio abaixo, não na
 * ferramenta.
 *
 * De quebra, é aqui que o conteúdo do feedback já preenchido vira o
 * contexto inicial da IA (nota ruim + ocorrências + comentário), pra o
 * motorista não repetir o que já contou.
 */
// Cada chamada agora é uma pergunta só, com Haiku: 1,5 a 6s em teste real,
// contra os 20-40s que a árvore inteira do Sonnet levava. 30s dá folga de
// sobra para o pior caso medido e ainda cobre uma rede ruim no meio da rota.
export const maxDuration = 30;

export default async function CincoPorquesPage({
  searchParams,
}: {
  searchParams: Promise<{ feedbackId?: string }>;
}) {
  const { feedbackId } = await searchParams;
  const id = Number(feedbackId);

  if (!feedbackId || !Number.isInteger(id)) {
    return (
      <div>
        <PageHeader title="🧠 Fazer 5 Porquês" fecharHref="/feedback-rota" />
        <BloqueioSemFeedback />
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
        <PageHeader title="🧠 Fazer 5 Porquês" fecharHref="/feedback-rota" />
        <BloqueioSemFeedback />
      </div>
    );
  }

  const revendaId = await getRevendaId();

  const { data: feedback } = revendaId
    ? await supabase
        .from("feedback_rota")
        .select("id, rota, nota, ocorrencias, comentario")
        .eq("id", id)
        .eq("colaborador_id", user.id)
        .eq("revenda_id", revendaId)
        .maybeSingle()
    : { data: null };

  if (!feedback) {
    return (
      <div>
        <PageHeader title="🧠 Fazer 5 Porquês" fecharHref="/feedback-rota" />
        <BloqueioSemFeedback />
      </div>
    );
  }

  const partesContexto = [
    ...(feedback.ocorrencias ?? []).map((oid: string) => labelOcorrencia(oid)),
    feedback.comentario,
  ].filter((parte): parte is string => Boolean(parte && parte.trim()));
  const problemaAuto = partesContexto.length > 0 ? partesContexto.join(". ") : null;

  return (
    <div>
      <PageHeader
        title="🧠 Fazer 5 Porquês"
        subtitle="Encontre a causa raiz do problema"
        fecharHref="/feedback-rota"
      />
      <FluxoCincoPorques
        feedbackRotaId={feedback.id}
        rota={feedback.rota}
        problemaAuto={problemaAuto}
      />
    </div>
  );
}

function BloqueioSemFeedback() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
      <p className="text-3xl">🔒</p>
      <p className="mt-2 font-semibold text-amber-800">
        Preencha primeiro o Feedback da Rota para iniciar os 5 Porquês.
      </p>
      <Link
        href="/feedback-rota"
        className="mt-4 inline-block rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Ir para o Feedback da Rota
      </Link>
    </div>
  );
}
