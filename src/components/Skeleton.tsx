export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-slate-200 ${className}`} />
  );
}

/** Esqueleto de uma tela de conteudo comum (titulo + cartoes). */
export function SkeletonPagina() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="mb-2 h-4 w-28" />
        <Skeleton className="h-7 w-52" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}
