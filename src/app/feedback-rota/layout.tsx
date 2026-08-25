import { requireAcessoModulo } from "@/lib/require-admin";

/**
 * A tela em si é client component (formulário interativo, sem consulta ao
 * banco na primeira renderização) -- por isso a checagem de acesso mora
 * aqui, no layout do servidor, e não na página. Sem isto, alguém sem
 * concessão do módulo "feedbacks" conseguiria abrir a tela digitando a
 * URL direto, mesmo com o cartão escondido no menu.
 */
export default async function FeedbackRotaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAcessoModulo("feedbacks");
  return children;
}
