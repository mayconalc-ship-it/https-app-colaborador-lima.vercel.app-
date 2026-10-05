import Link from "next/link";
import { IconeTipo, SeloPrazo, SeloPrioridade, SeloStatus } from "@/components/chamados/Selos";
import { formatarDuracao, protocolo, rotuloTipo, situacaoDoPrazo } from "@/lib/chamados";
import type { Chamado } from "@/lib/chamados-server";

/** Um chamado na lista (fila da manutenção ou "meus chamados"). */
export function CartaoChamado({ chamado: c, href, agora }: { chamado: Chamado; href: string; agora: Date }) {
  const situacao = situacaoDoPrazo(c, agora);
  const atrasado = situacao.tipo === "atrasado";
  return (
    <Link
      href={href}
      className={`flex items-start gap-3 rounded-2xl border bg-white p-3 shadow-sm transition hover:border-primary/40 ${
        atrasado ? "border-red-200" : c.prioridade === "risco" && c.status !== "concluido" && c.status !== "cancelado" ? "border-red-300" : "border-slate-200"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          atrasado ? "bg-red-50 text-red-700" : "bg-primary-soft text-primary-dark"
        }`}
      >
        <IconeTipo tipo={c.tipo} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs font-bold text-slate-400">{protocolo(c.numero)}</span>
          <SeloStatus status={c.status} />
          <SeloPrioridade prioridade={c.prioridade} />
          {c.reaberturas > 0 && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">↩️ reaberto</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-slate-900">
          {rotuloTipo(c.tipo)} · {c.local_nome}
        </span>
        <span className="block truncate text-xs text-slate-500">{c.descricao}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
          <span>
            {c.solicitante_nome.split(" ")[0]} · há {formatarDuracao(agora.getTime() - new Date(c.aberto_em).getTime())}
          </span>
          {c.responsavel_nome && c.status !== "aberto" && <span>🔧 {c.responsavel_nome.split(" ")[0]}</span>}
          <SeloPrazo situacao={situacao} />
        </span>
      </span>
      <span className="shrink-0 self-center text-slate-300" aria-hidden>
        ›
      </span>
    </Link>
  );
}
