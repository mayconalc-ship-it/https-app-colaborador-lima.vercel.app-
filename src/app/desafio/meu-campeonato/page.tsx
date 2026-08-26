import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { AREAS } from "@/lib/areas";
import {
  getClassificacaoTemporada,
  getConquistas,
  getContexto,
  getResumoPessoal,
  getRodadaAtual,
  getUltimaRodada,
} from "@/lib/quiz-server";
import {
  PONTOS_POR_QUESTAO,
  aproveitamento,
  conquista,
  medalha,
  nomeDoMes,
} from "@/lib/quiz";

/**
 * "Meu Campeonato": a temporada da pessoa, rodada a rodada.
 *
 * Existe porque a tabela geral responde "quem está ganhando" e não
 * "como EU venho indo" -- que é a pergunta que faz alguém voltar no mês
 * seguinte. Os números aqui são os mesmos da tabela: mesma posição,
 * mesmo desempate.
 */
export default async function MeuCampeonatoPage() {
  const ctx = await getContexto();
  if (!ctx?.area) redirect("/desafio");

  const rotuloArea = AREAS.find((a) => a.id === ctx.area)?.rotulo ?? ctx.area;

  const referencia =
    (await getRodadaAtual(ctx.revendaId, ctx.area)) ??
    (await getUltimaRodada(ctx.revendaId, ctx.area));
  const temporada = referencia?.temporada ?? new Date().getFullYear();

  const [resumo, { linhas }, conquistas] = await Promise.all([
    getResumoPessoal(ctx.revendaId, ctx.area, temporada, ctx.perfil.id),
    getClassificacaoTemporada(ctx.revendaId, ctx.area, temporada),
    getConquistas(ctx.revendaId, ctx.perfil.id),
  ]);

  const minhaNoAno = linhas.find((l) => l.colaboradorId === ctx.perfil.id);

  // Um selo pode ter sido ganho mais de uma vez (Top 3 em três rodadas).
  // A tela mostra o selo uma vez, com a contagem ao lado.
  const selos = new Map<string, number>();
  for (const c of conquistas) {
    selos.set(c.codigo, (selos.get(c.codigo) ?? 0) + 1);
  }

  return (
    <div>
      <PageHeader
        title="📈 Meu Campeonato"
        subtitle={`${rotuloArea} — temporada ${temporada}`}
        fecharHref="/desafio"
      />

      {resumo.rodadas.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Você ainda não participou de nenhuma rodada este ano. A primeira
          conta a partir do próximo desafio.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cartao
              valor={minhaNoAno ? `${minhaNoAno.posicao}º` : "—"}
              rotulo="posição no ano"
              destaque
            />
            <Cartao
              valor={String(minhaNoAno?.pontos ?? 0)}
              rotulo="pontos no ano"
            />
            <Cartao valor={String(resumo.media)} rotulo="média por rodada" />
            <Cartao valor={String(resumo.melhor)} rotulo="melhor resultado" />
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Cartao valor={String(resumo.top3)} rotulo="vezes no Top 3" />
            <Cartao valor={String(resumo.top5)} rotulo="vezes no Top 5" />
          </div>

          <h2 className="mb-2 mt-6 font-semibold text-slate-700">
            Sua evolução
          </h2>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {resumo.rodadas.map((r) => (
              <div
                key={r.rodada.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    {nomeDoMes(r.rodada.mes)}
                  </p>
                  <p className="text-xs text-slate-500">{r.rodada.nome}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold tabular-nums text-slate-900">
                    {r.pontos}
                    <span className="text-xs font-normal text-slate-400">
                      /{r.rodada.totalPerguntas * PONTOS_POR_QUESTAO}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {aproveitamento(r.acertos, r.rodada.totalPerguntas)}% de
                    acerto
                  </p>
                </div>
                <div className="w-14 text-right">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                    {medalha(r.posicao) ?? ""}
                    {r.posicao}º
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {selos.size > 0 && (
        <>
          <h2 className="mb-2 mt-6 font-semibold text-slate-700">
            Suas conquistas
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {[...selos.entries()].map(([codigo, vezes]) => {
              const c = conquista(codigo);
              if (!c) return null;
              return (
                <div
                  key={codigo}
                  className="rounded-2xl border border-gold bg-gold-soft p-3"
                >
                  <p className="text-2xl">{c.emoji}</p>
                  <p className="mt-1 text-sm font-bold text-primary-dark">
                    {c.rotulo}
                    {vezes > 1 && (
                      <span className="ml-1 text-xs font-semibold text-slate-500">
                        ×{vezes}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-600">{c.descricao}</p>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Link
        href="/desafio/classificacao?visao=campeonato"
        className="mt-4 block rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-white hover:bg-primary-dark"
      >
        🏆 Ver o campeonato
      </Link>
    </div>
  );
}

function Cartao({
  valor,
  rotulo,
  destaque = false,
}: {
  valor: string;
  rotulo: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 text-center shadow-sm ${
        destaque
          ? "border-gold bg-gold-soft"
          : "border-slate-200 bg-white"
      }`}
    >
      <p
        className={`text-2xl font-bold tabular-nums ${
          destaque ? "text-primary-dark" : "text-slate-900"
        }`}
      >
        {valor}
      </p>
      <p className="text-xs leading-tight text-slate-500">{rotulo}</p>
    </div>
  );
}
