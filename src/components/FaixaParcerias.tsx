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

  /*
    O CARTÃO VOLTOU A SER BRANCO -- pedido do dono (03/09/2026): "ficou
    muito chamativo e fora do layout do app".

    Ele passou por esmeralda e por azul em degradê, e a segunda versão
    pelo menos usava a paleta da marca. O erro não era a cor: era o PESO.
    Numa tela inteira de cartões brancos com borda fina, uma peça escura
    com sombra colorida não lê como "mais um item da lista", lê como um
    banner colado por cima -- daqueles que a gente aprendeu a ignorar.

    Agora ele é irmão dos canais do rodapé, logo abaixo: mesma borda,
    mesmo fundo, mesma sombra. O que o faz ser achado passa a ser o
    conteúdo -- o aperto de mão em dourado, a contagem e os NOMES dos
    parceiros -- e não o volume. Se ainda assim ele sumir na tela, o
    caminho é subir o cartão de posição, não escurecer de novo.
  */
  return (
    <Link
      href={`/comunicados?editoria=${EDITORIA_PARCERIAS}`}
      className="mt-7 block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50"
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* O dourado da marca sobrou desta peça, e é o suficiente: um
            círculo de 36px é sotaque, o cartão inteiro era grito. */}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-soft text-lg">
          {editoria.emoji || "🤝"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-slate-900">
              Parcerias e descontos
            </span>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
              {total}
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Vantagens para quem é do time
          </span>
        </span>
        <span className="shrink-0 text-slate-400" aria-hidden="true">
          ›
        </span>
      </div>

      {/*
        Um chip por parceiro, em vez de uma linha de nomes separados por
        ponto. Três nomes emendados viravam uma frase que ninguém lê até o
        fim; separados, o olho pega "MisterFarma" de relance -- e é o nome
        do parceiro, não a palavra "parcerias", que faz alguém tocar.

        Envolvem para a linha de baixo em vez de cortar: no celular, um
        `truncate` comia justamente o terceiro nome.
      */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {nomes.map((n) => (
          <span
            key={n}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
          >
            {n}
          </span>
        ))}
        {sobra > 0 && (
          <span className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-400">
            +{sobra}
          </span>
        )}
      </div>
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
