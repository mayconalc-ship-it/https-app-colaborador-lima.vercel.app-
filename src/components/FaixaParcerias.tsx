import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/** A editoria do jornal onde as parcerias são publicadas. */
export const EDITORIA_PARCERIAS = "parcerias";

/** Quantos nomes de parceiro aparecem na faixa antes do "e mais N". */
const NOMES_NA_FAIXA = 3;

/**
 * Faixa das parcerias na tela inicial -- sugestão do RH (02/09/2026).
 *
 * O desconto na farmácia, no posto e no gás é das coisas que o time mais
 * gosta, e estava enterrado: para achar, era preciso abrir o Jornal,
 * lembrar que existe uma barra de editorias e rolar até "🤝 Parcerias".
 * Quem não sabia que existia não ia procurar.
 *
 * SÓ APARECE QUANDO TEM O QUE MOSTRAR. Três condições, e todas por um
 * motivo:
 *
 *   1. A revenda tem a editoria "parcerias" ATIVA. Barreiras não tem, e
 *      uma faixa que leva a uma editoria inexistente cairia no jornal
 *      inteiro sem filtro -- prometendo parceria e entregando notícia.
 *   2. Existe pelo menos uma matéria JÁ PUBLICADA nela. A contagem usa o
 *      mesmo filtro de agendamento do jornal: matéria com data futura não
 *      existe para o colaborador, e contá-la aqui faria a faixa prometer
 *      três parcerias e a tela do outro lado mostrar duas.
 *   3. A pessoa tem acesso ao módulo do Jornal -- decidido por quem
 *      chama, na tela inicial, que já sabe disso.
 *
 * Os NOMES vêm junto. Uma faixa dizendo só "Parcerias" pede fé; dizendo
 * "Drogaria MisterFarma, SUPERGAS e mais 1" dá o motivo do toque.
 */
export async function FaixaParcerias() {
  const supabase = await createClient();

  // A editoria precisa existir e estar ativa NESTA revenda. O RLS já
  // recorta por revenda -- aqui só perguntamos se ela está ligada.
  const { data: editoria } = await supabase
    .from("comunicado_editorias")
    .select("id, rotulo, emoji")
    .eq("id", EDITORIA_PARCERIAS)
    .eq("ativa", true)
    .limit(1)
    .maybeSingle();

  if (!editoria) return null;

  const { data: materias, count } = await supabase
    .from("comunicados")
    .select("id, titulo, data", { count: "exact" })
    .eq("categoria", EDITORIA_PARCERIAS)
    // MESMO filtro do jornal (ver comunicados/page.tsx): matéria agendada
    // ainda não existe para o colaborador.
    .or(`publicar_em.is.null,publicar_em.lte."${new Date().toISOString()}"`)
    .order("data", { ascending: false })
    .limit(NOMES_NA_FAIXA);

  const total = count ?? 0;
  if (total === 0) return null;

  const nomes = (materias ?? []).map((m) => nomeDoParceiro(m.titulo));
  const sobra = total - nomes.length;

  return (
    <Link
      href={`/comunicados?editoria=${EDITORIA_PARCERIAS}`}
      className="mt-7 flex min-w-0 items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 transition-colors hover:bg-emerald-100"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-2xl shadow-sm">
        {editoria.emoji || "🤝"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-emerald-900">
          Parcerias e descontos
          <span className="ml-2 text-xs font-semibold tabular-nums text-emerald-700">{total}</span>
        </span>
        {/* Os nomes são o motivo do toque. Sem eles a faixa é só mais um
            botão pedindo curiosidade. */}
        <span className="mt-0.5 block truncate text-sm text-emerald-800">
          {nomes.join(" · ")}
          {sobra > 0 && ` · e mais ${sobra}`}
        </span>
      </span>
      <span className="shrink-0 text-emerald-700" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

/**
 * "Parceria com a Drogaria MisterFarma" -> "Drogaria MisterFarma".
 *
 * O RH escreve o título da matéria para o jornal, onde o "Parceria com" faz
 * sentido. Repetido três vezes lado a lado numa faixa que já se chama
 * "Parcerias", vira ruído e come o espaço do nome -- que é a única parte
 * que interessa aqui.
 *
 * Emoji no começo do título também sai: a faixa já tem o dela, e dois
 * ícones brigando na mesma linha não ajudam ninguém.
 */
export function nomeDoParceiro(titulo: string): string {
  return titulo
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/^parceria\s+(com\s+)?(a\s+|o\s+|as\s+|os\s+)?/i, "")
    .trim();
}
