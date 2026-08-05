import { Skeleton } from "@/components/Skeleton";

/**
 * Aparece instantaneamente ao tocar num item do menu, enquanto o servidor
 * monta a pagina. Sem isso a tela fica congelada e da sensacao de travamento.
 */
export default function Loading() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="mb-2 h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
