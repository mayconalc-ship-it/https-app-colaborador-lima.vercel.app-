import type { Metadata } from "next";
import { hojeEmSaoPaulo, proximaEntrega } from "@/lib/prioridades";
import { PrioridadesNaoInstalado, resolverToken } from "@/lib/prioridades-server";
import { LancarPrioridades } from "./LancarPrioridades";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prioridades do dia",
  // Link que vai para o grupo dos GVs: não tem por que aparecer em busca.
  robots: { index: false, follow: false },
};

/**
 * O LINK DOS GVs -- onde as prioridades do dia são lançadas.
 *
 * Aberta, sem login (o proxy deixa /prioridade/ passar): os GVs não têm
 * conta no app. O token do endereço diz a revenda; o GV escolhe o nome
 * uma vez e o aparelho lembra. Quem lê a lista é a logística, em
 * /gestao/prioridades.
 */
export default async function PrioridadesDoGvPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let alvo: Awaited<ReturnType<typeof resolverToken>>;
  try {
    alvo = await resolverToken(token);
  } catch (e) {
    if (!(e instanceof PrioridadesNaoInstalado)) throw e;
    alvo = null;
  }

  if (!alvo) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-base font-bold text-slate-900">Link inválido</p>
        <p className="mt-1 text-sm text-slate-600">Este link não recebe mais prioridades. Peça o link novo à logística.</p>
      </div>
    );
  }

  const hoje = hojeEmSaoPaulo();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-5 text-white shadow-md">
        <p className="text-xs font-bold uppercase tracking-wide text-white/80">Prioridades do dia · {alvo.revendaNome}</p>
        <h1 className="mt-1 text-xl font-bold leading-tight">Quais PDVs precisam sair primeiro?</h1>
        <p className="mt-1.5 text-sm text-white/85">
          Digite o código e o motivo, inclua quantos precisar e envie tudo de uma vez. A lista fica guardada neste
          aparelho até você enviar.
        </p>
      </div>

      <LancarPrioridades
        token={token}
        revendaNome={alvo.revendaNome}
        gvs={alvo.gvs}
        hoje={hoje}
        entregaPadrao={proximaEntrega(hoje)}
      />
    </div>
  );
}
