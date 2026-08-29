import { desenhoDasEstrelas } from "@/lib/rating";

/**
 * Estrelas em SVG, não em emoji: ⭐ muda de desenho e de tamanho em cada
 * aparelho, e meia estrela não existe como emoji. Aqui o meio é um
 * gradiente de verdade, e o tamanho acompanha a fonte.
 */
export function Estrelas({
  valor,
  tamanho = 28,
  className = "",
}: {
  valor: number;
  tamanho?: number;
  className?: string;
}) {
  const { cheias, meia, vazias } = desenhoDasEstrelas(valor);
  const partes = [
    ...Array.from({ length: cheias }, () => "cheia" as const),
    ...(meia ? (["meia"] as const) : []),
    ...Array.from({ length: Math.max(vazias, 0) }, () => "vazia" as const),
  ];

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="img"
      aria-label={`${valor} de 5 estrelas`}
    >
      {partes.map((tipo, i) => (
        <Estrela key={i} tipo={tipo} tamanho={tamanho} indice={i} />
      ))}
    </span>
  );
}

function Estrela({
  tipo,
  tamanho,
  indice,
}: {
  tipo: "cheia" | "meia" | "vazia";
  tamanho: number;
  indice: number;
}) {
  const id = `meia-estrela-${indice}`;
  const contorno = "#d97706";
  const preenchida = "#fbbf24";
  const vazia = "rgba(255,255,255,0.25)";

  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0 drop-shadow-sm"
    >
      {tipo === "meia" && (
        <defs>
          <linearGradient id={id}>
            <stop offset="50%" stopColor={preenchida} />
            <stop offset="50%" stopColor={vazia} />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2.5l2.9 5.88 6.49.95-4.7 4.58 1.11 6.46L12 17.32l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.95L12 2.5z"
        fill={tipo === "cheia" ? preenchida : tipo === "meia" ? `url(#${id})` : vazia}
        stroke={contorno}
        strokeWidth={tipo === "vazia" ? 0.8 : 1}
        strokeLinejoin="round"
        opacity={tipo === "vazia" ? 0.55 : 1}
      />
    </svg>
  );
}
