import { FotoEvidencia } from "@/components/FotoEvidencia";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { CAMPOS_EXIBIDOS } from "@/lib/boas-praticas";

export type PraticaParaCartao = {
  id: string;
  titulo: string;
  problema: string;
  // Opcionais desde a 119: saíram do formulário, ficam só nas antigas.
  objetivo: string | null;
  escopo: string | null;
  beneficios: string;
  foto_url: string | null;
  colaborador_nome: string;
  criado_em: string;
};

/**
 * A prática como o colega, a liderança e o próprio autor a leem -- o
 * mesmo cartão nas três telas, para ninguém votar numa versão e avaliar
 * outra.
 *
 * Fechado por padrão: na votação a pessoa percorre a lista pelos nomes e
 * abre o que quer ler. As ações (`children`) ficam FORA do recolhível, para
 * o botão de votar não depender de abrir o cartão.
 */
export function CartaoPratica({
  p,
  selo,
  aberto = false,
  destaque = null,
  children,
}: {
  p: PraticaParaCartao;
  selo?: React.ReactNode;
  aberto?: boolean;
  destaque?: "voto" | "vencedora" | null;
  children?: React.ReactNode;
}) {
  const borda =
    destaque === "vencedora"
      ? "border-amber-300 bg-amber-50 ring-2 ring-amber-200"
      : destaque === "voto"
        ? "border-primary bg-primary-soft ring-2 ring-primary/30"
        : "border-slate-200 bg-white";

  return (
    <li className={`rounded-2xl border p-4 shadow-sm ${borda}`}>
      <details open={aberto} className="group">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block break-words text-base font-bold text-slate-900">{p.titulo}</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              {p.colaborador_nome} · {formatarDataHora(p.criado_em)}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            {selo}
            <span className="text-xs font-semibold text-primary group-open:hidden">Ler ▾</span>
            <span className="hidden text-xs font-semibold text-slate-400 group-open:inline">Fechar ▴</span>
          </span>
        </summary>

        <dl className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          {CAMPOS_EXIBIDOS.filter((c) => p[c.nome]).map((c) => (
            <div key={c.nome}>
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{c.rotulo}</dt>
              <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-800">{p[c.nome]}</dd>
            </div>
          ))}
        </dl>

        {p.foto_url && (
          <div className="mt-3">
            <FotoEvidencia src={p.foto_url} alt={`Foto da prática ${p.titulo}`} classeCaixa="h-28 w-40" />
          </div>
        )}
      </details>

      {children && <div className="mt-3">{children}</div>}
    </li>
  );
}

/** Pílula de situação, com o tom de cada estado. */
export function SeloPratica({
  texto,
  tom,
}: {
  texto: string;
  tom: "analise" | "selecionada" | "votacao" | "vencedora" | "neutro";
}) {
  const cores = {
    analise: "bg-amber-100 text-amber-800",
    selecionada: "bg-green-100 text-green-800",
    votacao: "bg-primary-soft text-primary-dark",
    vencedora: "bg-amber-200 text-amber-900",
    neutro: "bg-slate-100 text-slate-600",
  }[tom];
  return <span className={`rounded-lg px-2 py-1 text-xs font-bold ${cores}`}>{texto}</span>;
}
