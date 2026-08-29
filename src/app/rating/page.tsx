import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { formatarData, hojeISO } from "@/lib/produtividade-armazem";
import {
  ROTULO_CLASSIFICACAO,
  contarPor,
  diasAntes,
  diasNoIntervalo,
  precisaFeedback,
  resumirRating,
  serieDeDias,
  type Classificacao,
} from "@/lib/rating";
import { Estrelas } from "./Estrelas";
import { BarrasHorizontais, DistribuicaoDeNotas, FaixaDeDias } from "./Graficos";
import { responderAvaliacao } from "./actions";

export const dynamic = "force-dynamic";

/** Teto do intervalo. Protege de dois jeitos: a consulta do PostgREST
 *  para em 1.000 linhas sem avisar, e a faixa de dias vira ilegível com
 *  centenas de quadrados. 92 dias cobrem um trimestre inteiro. */
const MAXIMO_DE_DIAS = 92;

type Avaliacao = {
  id: string;
  data_avaliacao: string;
  nota: number;
  classificacao: Classificacao;
  mapa: string;
  nome_pdv: string | null;
  cidade: string | null;
  motivo: string | null;
  comentario: string | null;
  motorista_colaborador_id: string | null;
};

type Feedback = { avaliacao_id: string; texto: string; criado_em: string };

const COLUNAS =
  "id, data_avaliacao, nota, classificacao, mapa, nome_pdv, cidade, motivo, comentario, motorista_colaborador_id";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

export default async function RatingPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; dia?: string; erro?: string; sucesso?: string }>;
}) {
  const perfil = await requireAcessoModulo("rating");
  const sp = await searchParams;

  const hoje = hojeISO();
  // `dia` é um atalho da faixa de dias: seleciona um dia só, sem perder
  // o intervalo que a pessoa tinha escolhido.
  const diaSelecionado = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) ? sp.dia : null;
  let de = sp.de && /^\d{4}-\d{2}-\d{2}$/.test(sp.de) ? sp.de : diasAntes(hoje, 29);
  let ate = sp.ate && /^\d{4}-\d{2}-\d{2}$/.test(sp.ate) ? sp.ate : hoje;
  if (ate < de) [de, ate] = [ate, de];
  // Corta pela ponta mais recente: quem esticou demais quer ver o fim.
  if (diasNoIntervalo(de, ate) > MAXIMO_DE_DIAS) de = diasAntes(ate, MAXIMO_DE_DIAS - 1);

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();

  // O RLS já limita às avaliações da própria pessoa (migration 072). Não
  // existe filtro por colaborador aqui de propósito: se um dia a consulta
  // esquecer o filtro, o banco continua não entregando a nota do colega.
  const { data: doPeriodo } = await supabase
    .from("rating_avaliacoes")
    .select(COLUNAS)
    .eq("revenda_id", revendaId)
    .gte("data_avaliacao", de)
    .lte("data_avaliacao", ate)
    .order("data_avaliacao", { ascending: false })
    .order("nota", { ascending: true })
    .limit(2000);

  const periodo = (doPeriodo ?? []) as Avaliacao[];
  const doDia = diaSelecionado ? periodo.filter((a) => a.data_avaliacao === diaSelecionado) : null;
  const emFoco = doDia ?? periodo;

  const resumo = resumirRating(emFoco);
  const dias = serieDeDias(de, ate, periodo.map((a) => ({ dataAvaliacao: a.data_avaliacao, nota: a.nota })), MAXIMO_DE_DIAS);
  const pendentes = emFoco.filter((a) => precisaFeedback(a.nota));

  // As respostas já enviadas, para o formulário nascer preenchido em vez
  // de parecer que a pessoa não respondeu.
  const { data: feedbacksBanco } = pendentes.length
    ? await supabase
        .from("rating_feedbacks")
        .select("avaliacao_id, texto, criado_em")
        .in("avaliacao_id", pendentes.map((a) => a.id))
    : { data: [] };
  const feedbackPorAvaliacao = new Map(
    ((feedbacksBanco ?? []) as Feedback[]).map((f) => [f.avaliacao_id, f]),
  );

  const abaixo = emFoco.filter((a) => precisaFeedback(a.nota));
  const contagemDeNotas: Record<number, number> = {};
  for (const a of emFoco) contagemDeNotas[a.nota] = (contagemDeNotas[a.nota] ?? 0) + 1;

  const qs = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams({ de, ate });
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/rating?${p.toString()}`;
  };

  return (
    <div className="space-y-4 pb-8">
      <PageHeader title="Meu Rating" subtitle="Como os clientes avaliaram as suas entregas." fecharHref="/" />

      {sp.erro && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <p className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      <FiltroDePeriodo de={de} ate={ate} hoje={hoje} />

      {diaSelecionado && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-white">
          <span className="text-sm font-semibold">Vendo só {formatarData(diaSelecionado)}</span>
          <Link href={qs({ dia: null })} className="shrink-0 text-xs font-semibold underline underline-offset-2">
            ver o período todo
          </Link>
        </div>
      )}

      <Hero resumo={resumo} de={de} ate={ate} dia={diaSelecionado} />

      <FaixaDeDias
        dias={dias}
        diaSelecionado={diaSelecionado}
        base={(d) => qs({ dia: d === diaSelecionado ? null : d })}
      />

      {/* ---------------- PENDÊNCIAS ---------------- */}
      {pendentes.length > 0 ? (
        <section>
          <h2 className="mb-1 text-sm font-bold text-slate-900">
            {pendentes.length === 1 ? "1 cliente insatisfeito" : `${pendentes.length} clientes insatisfeitos`}
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            A meta é 5 estrelas. Conta pra gente o que aconteceu — isso ajuda a resolver o problema, não é
            advertência.
          </p>
          <ul className="space-y-3">
            {pendentes.map((a) => (
              <CartaoPendencia
                key={a.id}
                avaliacao={a}
                de={de}
                ate={ate}
                dia={diaSelecionado}
                souMotorista={a.motorista_colaborador_id === perfil.id}
                feedback={feedbackPorAvaliacao.get(a.id) ?? null}
              />
            ))}
          </ul>
        </section>
      ) : (
        emFoco.length > 0 && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center">
            <p className="text-3xl">🎉</p>
            <p className="mt-1 text-sm font-bold text-green-800">Nenhum cliente insatisfeito</p>
            <p className="text-xs text-green-700">
              As {emFoco.length} entregas avaliadas fecharam com 5 estrelas.
            </p>
          </div>
        )
      )}

      {/* ---------------- ANÁLISES ---------------- */}
      {emFoco.length > 0 && (
        <>
          <DistribuicaoDeNotas contagem={contagemDeNotas} />

          <BarrasHorizontais
            titulo="Por que os clientes reclamaram"
            subtitulo={`Motivo das ${abaixo.length} avaliações abaixo de 5 estrelas`}
            itens={contarPor(abaixo, (a) => a.motivo)}
            vazio="Nenhuma reclamação no período. 👏"
          />

          <BarrasHorizontais
            titulo="Cidades com nota baixa"
            subtitulo="Onde as reclamações se concentram"
            itens={contarPor(abaixo, (a) => a.cidade)}
            vazio="Nenhuma cidade com reclamação no período."
          />

          <BarrasHorizontais
            titulo="Clientes que mais reclamaram"
            subtitulo="Vale uma conversa na próxima entrega"
            itens={contarPor(abaixo, (a) => a.nome_pdv)}
            vazio="Nenhum cliente reclamou no período."
          />

          <BarrasHorizontais
            titulo="Cidades onde você mais entrega"
            subtitulo="Todas as avaliações do período, não só as ruins"
            itens={contarPor(emFoco, (a) => a.cidade)}
          />

          <Comentarios avaliacoes={abaixo.filter((a) => a.comentario)} />
        </>
      )}
    </div>
  );
}

// ==================== COMPONENTES ====================

/** Atalhos de período + intervalo livre. O atalho cobre o uso do dia a
 *  dia; o intervalo existe para quem quer conferir um mês fechado. */
function FiltroDePeriodo({ de, ate, hoje }: { de: string; ate: string; hoje: string }) {
  const atalhos: [string, number][] = [["7 dias", 7], ["15 dias", 15], ["30 dias", 30], ["90 dias", 90]];
  const diasAtuais = diasNoIntervalo(de, ate);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap gap-1.5">
        {atalhos.map(([rotulo, n]) => {
          const ativo = ate === hoje && diasAtuais === n;
          return (
            <Link
              key={n}
              href={`/rating?de=${diasAntes(hoje, n - 1)}&ate=${hoje}`}
              aria-current={ativo ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                ativo ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {rotulo}
            </Link>
          );
        })}
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer list-none text-xs font-semibold text-primary marker:content-none [&::-webkit-details-marker]:hidden">
          Escolher outro período
        </summary>
        <form method="get" className="mt-2 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500" htmlFor="de">
              De
            </label>
            <input id="de" type="date" name="de" defaultValue={de} max={hoje} className={campo} />
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500" htmlFor="ate">
              Até
            </label>
            <input id="ate" type="date" name="ate" defaultValue={ate} max={hoje} className={campo} />
          </div>
          <button type="submit" className="shrink-0 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white">
            Ver
          </button>
        </form>
        <p className="mt-1.5 text-[11px] text-slate-400">
          No máximo {MAXIMO_DE_DIAS} dias por consulta.
        </p>
      </details>
    </section>
  );
}

function Hero({
  resumo,
  de,
  ate,
  dia,
}: {
  resumo: ReturnType<typeof resumirRating>;
  de: string;
  ate: string;
  dia: string | null;
}) {
  const rotuloPeriodo = dia
    ? formatarData(dia)
    : `${formatarData(de)} a ${formatarData(ate)}`;

  if (resumo.total === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center">
        <Estrelas valor={0} tamanho={24} />
        <p className="mt-3 text-sm font-semibold text-slate-500">Nenhuma entrega sua foi avaliada</p>
        <p className="mt-1 text-xs text-slate-400">
          {rotuloPeriodo} · nem todo cliente responde a pesquisa, então período sem avaliação não é período sem
          entrega.
        </p>
      </div>
    );
  }

  const perfeito = resumo.abaixoDaMeta === 0;

  return (
    <div
      className={`overflow-hidden rounded-3xl shadow-sm ${
        perfeito
          ? "bg-gradient-to-br from-emerald-500 to-teal-600"
          : "bg-gradient-to-br from-amber-500 to-orange-600"
      }`}
    >
      <div className="p-6 text-center text-white">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{rotuloPeriodo}</p>
        <div className="mt-3 flex justify-center">
          <Estrelas valor={resumo.estrelas ?? 0} tamanho={32} />
        </div>
        <p className="mt-3 text-5xl font-black leading-none tabular-nums">{resumo.media?.toFixed(2)}</p>
        <p className="mt-1 text-sm text-white/80">
          {resumo.total} {resumo.total === 1 ? "entrega avaliada" : "entregas avaliadas"}
        </p>
      </div>

      <div className="grid grid-cols-3 divide-x divide-white/20 border-t border-white/20 bg-black/10 text-center text-white">
        <Fatia rotulo="Promotor" valor={resumo.promotores} />
        <Fatia rotulo="Neutro" valor={resumo.neutros} />
        <Fatia rotulo="Detrator" valor={resumo.detratores} />
      </div>
    </div>
  );
}

function Fatia({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="px-2 py-3">
      <p className="text-xl font-bold tabular-nums">{valor}</p>
      <p className="text-[11px] uppercase tracking-wide text-white/70">{rotulo}</p>
    </div>
  );
}

function Comentarios({ avaliacoes }: { avaliacoes: Avaliacao[] }) {
  if (avaliacoes.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-900">O que os clientes escreveram</h2>
      <p className="mt-0.5 text-[11px] text-slate-400">
        Nem todo cliente escreve — {avaliacoes.length} deixaram comentário
      </p>
      <ul className="mt-3 space-y-3">
        {avaliacoes.map((a) => (
          <li key={a.id} className="border-l-2 border-amber-300 pl-3">
            <p className="text-xs italic text-slate-700">“{a.comentario}”</p>
            <p className="mt-1 text-[11px] text-slate-400">
              {a.nome_pdv ?? "cliente"} · {a.cidade ?? "—"} · {formatarData(a.data_avaliacao)} · {a.nota}★
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CartaoPendencia({
  avaliacao,
  de,
  ate,
  dia,
  souMotorista,
  feedback,
}: {
  avaliacao: Avaliacao;
  de: string;
  ate: string;
  dia: string | null;
  souMotorista: boolean;
  feedback: Feedback | null;
}) {
  const detrator = avaliacao.classificacao === "detrator";

  return (
    <li
      className={`overflow-hidden rounded-2xl border bg-white ${
        detrator ? "border-red-200" : "border-amber-200"
      }`}
    >
      <div className={`px-4 py-3 ${detrator ? "bg-red-50" : "bg-amber-50"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              {avaliacao.nome_pdv ?? "Cliente não identificado"}
            </p>
            <p className="truncate text-xs text-slate-500">
              {avaliacao.cidade ?? "—"} · {formatarData(avaliacao.data_avaliacao)} · mapa {avaliacao.mapa}
            </p>
            <p className="text-[11px] text-slate-400">
              {souMotorista ? "você era o motorista" : "você era o ajudante"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Estrelas valor={avaliacao.nota} tamanho={14} />
            {/* Rótulo escrito ao lado da cor: vermelho e âmbar são
                próximos demais para carregarem o sentido sozinhos. */}
            <p
              className={`mt-0.5 text-[11px] font-bold uppercase ${
                detrator ? "text-red-700" : "text-amber-700"
              }`}
            >
              {ROTULO_CLASSIFICACAO[avaliacao.classificacao]}
            </p>
          </div>
        </div>

        {avaliacao.motivo && (
          <p className="mt-2 inline-block rounded-lg bg-white/80 px-2 py-1 text-xs font-semibold text-slate-700">
            {avaliacao.motivo}
          </p>
        )}
        {avaliacao.comentario && (
          <p className="mt-2 border-l-2 border-slate-300 pl-2 text-xs italic text-slate-600">
            “{avaliacao.comentario}”
          </p>
        )}
      </div>

      <form action={responderAvaliacao} className="space-y-2 p-4">
        <input type="hidden" name="avaliacao_id" value={avaliacao.id} />
        <input type="hidden" name="de" value={de} />
        <input type="hidden" name="ate" value={ate} />
        {dia && <input type="hidden" name="dia" value={dia} />}

        <label className="block text-xs font-semibold uppercase text-slate-500" htmlFor={`texto-${avaliacao.id}`}>
          {feedback ? "Sua resposta" : "O que aconteceu nessa entrega?"}
        </label>
        <textarea
          id={`texto-${avaliacao.id}`}
          name="texto"
          rows={3}
          maxLength={1000}
          required
          defaultValue={feedback?.texto ?? ""}
          placeholder="Ex.: o cliente estava fechado e voltamos no fim da rota; a caixa chegou amassada do carregamento…"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none"
        />

        <BotaoEnviar
          textoEnviando="Enviando..."
          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          {feedback ? "Atualizar resposta" : "Enviar resposta"}
        </BotaoEnviar>

        {feedback && (
          <p className="text-center text-[11px] text-slate-400">
            Respondido em {formatarData(feedback.criado_em.slice(0, 10))}
          </p>
        )}
      </form>
    </li>
  );
}
