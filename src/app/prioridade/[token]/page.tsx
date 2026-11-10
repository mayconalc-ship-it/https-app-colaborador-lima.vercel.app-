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
 * conta no app. O token do endereço diz a revenda; o GV de cada
 * prioridade sai da base de clientes, pelo código do PDV (10/11/2026). Quem lê a lista é a logística, em
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
      {/* Layout enxuto (10/11/2026, pedido do dono): título direto, sem explicação. */}
      <header className="px-1 pt-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{alvo.revendaNome}</p>
        <h1 className="text-2xl font-bold leading-tight text-slate-900">Quais as prioridades do dia?</h1>
      </header>

      <LancarPrioridades
        token={token}
        motivos={alvo.motivos}
        hoje={hoje}
        entregaPadrao={proximaEntrega(hoje)}
      />
    </div>
  );
}
