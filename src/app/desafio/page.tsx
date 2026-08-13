import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { decodificar } from "@/lib/texto-url";
import { revendaTemModulo } from "@/lib/revendas";
import { hojeIso } from "@/lib/pesquisa";
import { AREAS } from "@/lib/areas";
import {
  getClassificacaoRodada,
  getContexto,
  getParticipacao,
  getRodadaAtual,
  getUltimaRodada,
} from "@/lib/quiz-server";
import {
  PONTOS_POR_QUESTAO,
  aproveitamento,
  diasRestantes,
  medalha,
  nomeDoMes,
  periodoCurto,
} from "@/lib/quiz";
import { comecarDesafio } from "./actions";

export default async function DesafioPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const ctx = await getContexto();

  if (!ctx) return null;

  if (!(await revendaTemModulo("quiz"))) {
    return (
      <div>
        <PageHeader title="🏆 Desafio do Mês" />
        <Aviso
          titulo="Desafio ainda não liberado aqui"
          texto="Esta revenda ainda não usa o Desafio do Mês. Fale com o Admin do app."
        />
      </div>
    );
  }

  // Sem área no cadastro não há campeonato: a pessoa competiria contra
  // quem faz outro trabalho, com perguntas de outro padrão. Preferimos
  // dizer o que falta a colocá-la no lugar errado.
  if (!ctx.area) {
    return (
      <div>
        <PageHeader title="🏆 Desafio do Mês" />
        <Aviso
          titulo="Falta a sua área no cadastro"
          texto="O desafio é separado por área (Distribuição e Armazém), e o seu cadastro ainda não diz de qual delas você faz parte. Peça ao Admin para completar isso — depois é só voltar aqui."
        />
      </div>
    );
  }

  const rotuloArea =
    AREAS.find((a) => a.id === ctx.area)?.rotulo ?? ctx.area;

  const rodada = await getRodadaAtual(ctx.revendaId, ctx.area);

  if (!rodada) {
    const ultima = await getUltimaRodada(ctx.revendaId, ctx.area);
    return (
      <div>
        <PageHeader title="🏆 Desafio do Mês" subtitle={rotuloArea} />
        <Aviso
          titulo="Nenhum desafio no ar"
          texto={
            ultima
              ? `O último foi o ${ultima.nome}, que já encerrou. Assim que a liderança publicar o próximo, ele aparece aqui.`
              : "Ainda não há desafio publicado para a sua área. Quando houver, você recebe um aviso no sino."
          }
        />
        {ultima && (
          <div className="mt-4">
            <LinkClassificacao />
          </div>
        )}
      </div>
    );
  }

  const participacao = await getParticipacao(rodada.id, ctx.perfil.id);
  const concluida = participacao?.status === "concluida";

  // A posição só é buscada para quem já concluiu: é a única situação em
  // que ela existe.
  const minhaPosicao = concluida
    ? (await getClassificacaoRodada(rodada)).find(
        (l) => l.colaboradorId === ctx.perfil.id,
      )?.posicao ?? null
    : null;

  const faltam = diasRestantes(rodada.fim, hojeIso());

  return (
    <div>
      <PageHeader title="🏆 Desafio do Mês" subtitle={rotuloArea} />

      {erro && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}

      {/* Cartaz do desafio */}
      <div className="overflow-hidden rounded-2xl border border-gold bg-white shadow-sm">
        <div className="bg-primary px-4 py-3 text-white">
          <p className="text-xs font-bold uppercase tracking-wide text-gold">
            {nomeDoMes(rodada.mes)} de {rodada.temporada}
          </p>
          <h2 className="text-lg font-bold leading-tight">{rodada.nome}</h2>
        </div>

        <dl className="divide-y divide-slate-100 text-sm">
          {rodada.pilar && <Linha rotulo="Pilar" valor={rodada.pilar} />}
          {rodada.padraoNome && (
            <Linha rotulo="Padrão" valor={rodada.padraoNome} />
          )}
          {rodada.atividade && (
            <Linha rotulo="Atividade" valor={rodada.atividade} />
          )}
          <Linha
            rotulo="Perguntas"
            valor={`${rodada.totalPerguntas} — ${rodada.totalPerguntas * PONTOS_POR_QUESTAO} pontos`}
          />
          <Linha
            rotulo="Período"
            valor={`${periodoCurto(rodada.inicio, rodada.fim)}${
              faltam >= 0
                ? faltam === 0
                  ? " (último dia!)"
                  : ` (faltam ${faltam} dia${faltam === 1 ? "" : "s"})`
                : ""
            }`}
          />
        </dl>
      </div>

      {/* Situação da pessoa */}
      {concluida && participacao ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-500">
            Você já participou 🎉
          </p>
          <p className="mt-2 text-4xl font-bold text-primary">
            {participacao.pontos}
            <span className="text-xl text-slate-400">
              /{rodada.totalPerguntas * PONTOS_POR_QUESTAO}
            </span>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {participacao.acertos}/{rodada.totalPerguntas} acertos —{" "}
            {aproveitamento(participacao.acertos, rodada.totalPerguntas)}% de
            aproveitamento
          </p>
          {minhaPosicao && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-gold-soft px-4 py-1.5 text-sm font-bold text-primary-dark">
              {medalha(minhaPosicao) ?? "🎽"} {minhaPosicao}º lugar
            </p>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link
              href="/desafio/classificacao"
              className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Ver classificação
            </Link>
            <Link
              href="/desafio/resultado"
              className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-primary ring-1 ring-slate-200 hover:bg-slate-50"
            >
              Ver minhas respostas
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800">Como funciona</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
            <li>• Uma pergunta por vez, {rodada.totalPerguntas} no total.</li>
            <li>• Cada acerto vale {PONTOS_POR_QUESTAO} pontos.</li>
            <li>• Ao responder você já vê se acertou e o porquê.</li>
            <li>• Uma tentativa só — não dá para refazer depois de concluir.</li>
            <li>• O tempo não vale ponto: serve apenas para desempatar.</li>
            <li>
              • Parou no meio? Volte aqui e continue de onde estava, enquanto o
              desafio estiver aberto.
            </li>
          </ul>

          <p className="mt-3 text-sm font-medium text-slate-700">
            Status:{" "}
            {participacao ? (
              <span className="text-amber-600">
                em andamento — {participacao.respondidas} de{" "}
                {rodada.totalPerguntas} respondidas
              </span>
            ) : (
              <span className="text-slate-500">você ainda não participou</span>
            )}
          </p>

          <form action={comecarDesafio} className="mt-4">
            <BotaoEnviar
              textoEnviando="Abrindo..."
              className="w-full rounded-xl bg-primary px-4 py-3 text-base font-semibold text-white hover:bg-primary-dark"
            >
              {participacao ? "Continuar desafio" : "Começar desafio"}
            </BotaoEnviar>
          </form>
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <LinkClassificacao />
        <Link
          href="/desafio/meu-campeonato"
          className="rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-primary ring-1 ring-slate-200 hover:bg-slate-50"
        >
          📈 Meu Campeonato
        </Link>
      </div>
    </div>
  );
}

function LinkClassificacao() {
  return (
    <Link
      href="/desafio/classificacao"
      className="block rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-primary ring-1 ring-slate-200 hover:bg-slate-50"
    >
      🏆 Campeonato do Conhecimento
    </Link>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <dt className="w-24 shrink-0 text-slate-500">{rotulo}</dt>
      <dd className="flex-1 font-medium text-slate-800">{valor}</dd>
    </div>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-4xl">🏆</p>
      <p className="mt-2 font-semibold text-slate-800">{titulo}</p>
      <p className="mt-1 text-sm text-slate-500">{texto}</p>
    </div>
  );
}
