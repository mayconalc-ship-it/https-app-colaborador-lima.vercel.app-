import type { EstadoDoPrazo, Prazo } from "@/lib/manutencao-preventiva";

/** A cor de cada estado -- num lugar só, para a vitrine e a lista dizerem o mesmo. */
export const TOM_DO_PRAZO: Record<EstadoDoPrazo, { selo: string; barra: string; borda: string }> = {
  atrasada: { selo: "bg-red-100 text-red-800", barra: "bg-red-500", borda: "border-red-200" },
  vence_hoje: { selo: "bg-amber-100 text-amber-900", barra: "bg-amber-500", borda: "border-amber-200" },
  proxima: { selo: "bg-amber-50 text-amber-800", barra: "bg-amber-400", borda: "border-slate-200" },
  em_dia: { selo: "bg-emerald-50 text-emerald-700", barra: "bg-emerald-500", borda: "border-slate-200" },
};

/** Selo curto: "Atrasada 3 dias", "Vence hoje", "Em dia". */
export function SeloDoPrazo({ prazo, curto = false }: { prazo: Prazo; curto?: boolean }) {
  const texto = curto && prazo.estado === "em_dia" ? "Em dia" : prazo.texto;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${TOM_DO_PRAZO[prazo.estado].selo}`}>
      {texto}
    </span>
  );
}

/** Quanto do ciclo já passou -- a barra enche até vencer e fica vermelha depois. */
export function BarraDoPrazo({ prazo }: { prazo: Prazo }) {
  const pct = Math.min(100, Math.round(prazo.progresso * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
      <div className={`h-full rounded-full ${TOM_DO_PRAZO[prazo.estado].barra}`} style={{ width: `${Math.max(4, pct)}%` }} />
    </div>
  );
}
