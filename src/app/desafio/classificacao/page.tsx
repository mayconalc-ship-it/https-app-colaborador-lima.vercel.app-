import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import {
  MinhaLinha,
  TabelaRodada,
  TabelaTemporada,
} from "@/components/TabelaCampeonato";
import { AREAS } from "@/lib/areas";
import {
  getClassificacaoRodada,
  getClassificacaoTemporada,
  getContexto,
  getPosicoesVisiveis,
  getRodadaAtual,
  getUltimaRodada,
  recortarClassificacao,
} from "@/lib/quiz-server";
import { nomeDoMes } from "@/lib/quiz";

/**
 * O Campeonato do Conhecimento, em duas visões:
 *
 *   Rodada     - como está o desafio do mês
 *   Campeonato - a soma do ano, mês a mês
 *
 * As duas respeitam o mesmo recorte: as N primeiras posições que o Admin
 * configurou, mais a linha de quem está lendo quando ela está fora dessa
 * faixa.
 */
export default async function ClassificacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string }>;
}) {
  const { visao } = await searchParams;
  const ctx = await getContexto();
  if (!ctx?.area) redirect("/desafio");

  const acumulado = visao === "campeonato";
  const rotuloArea = AREAS.find((a) => a.id === ctx.area)?.rotulo ?? ctx.area;

  const rodada =
    (await getRodadaAtual(ctx.revendaId, ctx.area)) ??
    (await getUltimaRodada(ctx.revendaId, ctx.area));

  const temporada = rodada?.temporada ?? new Date().getFullYear();
  const posicoesVisiveis = await getPosicoesVisiveis(ctx.revendaId);

  return (
    <div>
      <PageHeader
        title="🏆 Campeonato do Conhecimento"
        subtitle={rotuloArea.toUpperCase()}
      />

      <div className="mb-4 flex gap-2">
        <Aba href="/desafio/classificacao" ativa={!acumulado}>
          Rodada atual
        </Aba>
        <Aba href="/desafio/classificacao?visao=campeonato" ativa={acumulado}>
          Campeonato {temporada}
        </Aba>
      </div>

      {acumulado ? (
        <Acumulado
          revendaId={ctx.revendaId}
          area={ctx.area}
          temporada={temporada}
          euId={ctx.perfil.id}
          euNome={ctx.perfil.nome}
          posicoesVisiveis={posicoesVisiveis}
        />
      ) : rodada ? (
        <DaRodada
          rodada={rodada}
          euId={ctx.perfil.id}
          euNome={ctx.perfil.nome}
          posicoesVisiveis={posicoesVisiveis}
        />
      ) : (
        <Vazio texto="Ainda não houve nenhuma rodada na sua área." />
      )}

      <Legenda />

      <Link
        href="/desafio"
        className="mt-4 block rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-primary ring-1 ring-slate-200 hover:bg-slate-50"
      >
        ← Voltar ao desafio
      </Link>
    </div>
  );
}

async function DaRodada({
  rodada,
  euId,
  euNome,
  posicoesVisiveis,
}: {
  rodada: NonNullable<Awaited<ReturnType<typeof getRodadaAtual>>>;
  euId: string;
  euNome: string;
  posicoesVisiveis: number;
}) {
  const linhas = await getClassificacaoRodada(rodada);
  const { visiveis, minha, foraDaFaixa, total } = recortarClassificacao(
    linhas,
    posicoesVisiveis,
    euId,
  );

  if (total === 0) {
    return (
      <Vazio texto={`Ninguém concluiu o ${rodada.nome} ainda. Pode ser você o primeiro.`} />
    );
  }

  return (
    <>
      <p className="mb-2 text-sm text-slate-500">
        {rodada.nome} — {nomeDoMes(rodada.mes)}/{rodada.temporada} ·{" "}
        {total} participante{total === 1 ? "" : "s"}
      </p>

      <TabelaRodada linhas={visiveis} euId={euId} />

      {foraDaFaixa && minha && (
        <MinhaLinha
          posicao={minha.posicao}
          nome={euNome}
          pontos={minha.pontos}
          acertos={minha.acertos}
          totalPerguntas={minha.totalPerguntas}
          total={total}
        />
      )}
    </>
  );
}

async function Acumulado({
  revendaId,
  area,
  temporada,
  euId,
  euNome,
  posicoesVisiveis,
}: {
  revendaId: string;
  area: "DU" | "AL";
  temporada: number;
  euId: string;
  euNome: string;
  posicoesVisiveis: number;
}) {
  const { linhas, rodadas } = await getClassificacaoTemporada(
    revendaId,
    area,
    temporada,
  );

  if (linhas.length === 0) {
    return <Vazio texto="O campeonato deste ano ainda não tem resultados." />;
  }

  const { visiveis, minha, foraDaFaixa, total } = recortarClassificacao(
    linhas,
    posicoesVisiveis,
    euId,
  );

  return (
    <>
      <p className="mb-2 text-sm text-slate-500">
        {rodadas.length} rodada{rodadas.length === 1 ? "" : "s"} · {total}{" "}
        participante{total === 1 ? "" : "s"}
      </p>

      <TabelaTemporada
        linhas={visiveis}
        meses={rodadas.map((r) => r.mes)}
        euId={euId}
      />

      {foraDaFaixa && minha && (
        <MinhaLinha
          posicao={minha.posicao}
          nome={euNome}
          pontos={minha.pontos}
          acertos={minha.acertos}
          totalPerguntas={minha.totalPerguntas}
          total={total}
        />
      )}
    </>
  );
}

function Aba({
  href,
  ativa,
  children,
}: {
  href: string;
  ativa: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex-1 rounded-full px-3 py-2 text-center text-sm font-medium ${
        ativa ? "bg-primary text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
      }`}
    >
      {children}
    </Link>
  );
}

function Legenda() {
  return (
    <div className="mt-3 rounded-xl bg-white p-3 text-xs text-slate-500 ring-1 ring-slate-200">
      <p>
        <span className="font-semibold text-slate-700">PTS</span> pontos ·{" "}
        <span className="font-semibold text-slate-700">J</span> rodadas
        jogadas · <span className="font-semibold text-slate-700">%</span>{" "}
        aproveitamento
      </p>
      <p className="mt-1">
        A faixa dourada marca as três posições premiadas. Empate é decidido
        por acertos, depois por menor tempo total, depois por quem concluiu
        primeiro.
      </p>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
      {texto}
    </div>
  );
}
