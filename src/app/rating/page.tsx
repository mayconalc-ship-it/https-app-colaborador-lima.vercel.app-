import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { createClient } from "@/lib/supabase/server";
import { getRevendaId } from "@/lib/revendas";
import { requireAcessoModulo } from "@/lib/require-admin";
import { diasAtrasISO, formatarData, hojeISO } from "@/lib/produtividade-armazem";
import {
  ROTULO_CLASSIFICACAO,
  motivosMaisComuns,
  precisaFeedback,
  resumirRating,
  type Classificacao,
} from "@/lib/rating";
import { Estrelas } from "./Estrelas";
import { responderAvaliacao } from "./actions";

export const dynamic = "force-dynamic";

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

export default async function RatingPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; de?: string; ate?: string; erro?: string; sucesso?: string }>;
}) {
  const perfil = await requireAcessoModulo("rating");

  const sp = await searchParams;
  const dia = sp.dia ?? hojeISO();
  const de = sp.de ?? diasAtrasISO(30);
  const ate = sp.ate ?? hojeISO();

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const supabase = await createClient();

  // O RLS já limita às avaliações da própria pessoa (migration 072) --
  // não existe filtro por colaborador aqui de propósito: se um dia a
  // consulta esquecer o filtro, o banco continua não entregando a nota
  // do colega.
  const [{ data: doDia }, { data: doPeriodo }] = await Promise.all([
    supabase
      .from("rating_avaliacoes")
      .select(COLUNAS)
      .eq("revenda_id", revendaId)
      .eq("data_avaliacao", dia)
      .order("nota", { ascending: true }),
    supabase
      .from("rating_avaliacoes")
      .select("data_avaliacao, nota, classificacao, motivo")
      .eq("revenda_id", revendaId)
      .gte("data_avaliacao", de)
      .lte("data_avaliacao", ate),
  ]);

  const avaliacoesDoDia = (doDia ?? []) as Avaliacao[];
  const periodo = (doPeriodo ?? []) as { data_avaliacao: string; nota: number; classificacao: Classificacao; motivo: string | null }[];

  const pendentes = avaliacoesDoDia.filter((a) => precisaFeedback(a.nota));

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

  const resumoDia = resumirRating(avaliacoesDoDia);
  const resumoPeriodo = resumirRating(periodo);

  // Últimos 14 dias com avaliação, para a faixa de dias no rodapé.
  const porDia = new Map<string, { total: number; abaixo: number }>();
  for (const a of periodo) {
    const o = porDia.get(a.data_avaliacao) ?? { total: 0, abaixo: 0 };
    o.total++;
    if (precisaFeedback(a.nota)) o.abaixo++;
    porDia.set(a.data_avaliacao, o);
  }
  const ultimosDias = [...porDia.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14).reverse();

  return (
    <div className="pb-8">
      <PageHeader title="Meu Rating" subtitle="Como os clientes avaliaram as suas entregas." fecharHref="/" />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      {/* ---------------- O DIA ---------------- */}
      <form method="get" className="mb-4 flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500" htmlFor="dia">
            Dia
          </label>
          <input
            id="dia"
            type="date"
            name="dia"
            defaultValue={dia}
            max={hojeISO()}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
          />
        </div>
        <button type="submit" className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white">
          Ver
        </button>
      </form>

      <CartaoDoDia dia={dia} resumo={resumoDia} />

      {/* ---------------- PENDÊNCIAS ---------------- */}
      {pendentes.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-1 text-sm font-bold uppercase text-slate-500">
            {pendentes.length === 1 ? "Cliente insatisfeito" : `${pendentes.length} clientes insatisfeitos`}
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
                dia={dia}
                souMotorista={a.motorista_colaborador_id === perfil.id}
                feedback={feedbackPorAvaliacao.get(a.id) ?? null}
              />
            ))}
          </ul>
        </section>
      )}

      {avaliacoesDoDia.length > 0 && pendentes.length === 0 && (
        <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-3xl">🎉</p>
          <p className="mt-1 text-sm font-bold text-green-800">Nenhum cliente insatisfeito neste dia</p>
          <p className="text-xs text-green-700">
            As {avaliacoesDoDia.length} entregas avaliadas fecharam com 5 estrelas.
          </p>
        </div>
      )}

      {/* ---------------- PERÍODO ---------------- */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Últimos 30 dias</h2>

        <div className="grid grid-cols-3 gap-2">
          <Indicador titulo="Entregas avaliadas" valor={String(resumoPeriodo.total)} />
          <Indicador
            titulo="Média"
            valor={resumoPeriodo.media !== null ? resumoPeriodo.media.toFixed(2) : "—"}
          />
          <Indicador
            titulo="Abaixo da meta"
            valor={String(resumoPeriodo.abaixoDaMeta)}
            destaque={resumoPeriodo.abaixoDaMeta > 0}
          />
        </div>

        {ultimosDias.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase text-slate-400">Dia a dia</p>
            <div className="flex items-end gap-1.5">
              {ultimosDias.map(([d, o]) => (
                <a
                  key={d}
                  href={`?dia=${d}`}
                  title={`${formatarData(d)} — ${o.total} avaliação(ões)${o.abaixo ? `, ${o.abaixo} abaixo da meta` : ""}`}
                  className="group flex flex-1 flex-col items-center gap-1"
                >
                  <span
                    className={`w-full rounded-t transition-all group-hover:opacity-80 ${
                      o.abaixo > 0 ? "bg-amber-400" : "bg-green-400"
                    } ${d === dia ? "ring-2 ring-primary ring-offset-1" : ""}`}
                    style={{ height: `${Math.max(o.total * 6, 8)}px` }}
                  />
                  <span className="text-[9px] text-slate-400">{d.slice(8)}</span>
                </a>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Verde: nenhum cliente insatisfeito · Amarelo: teve avaliação abaixo de 5
            </p>
          </div>
        )}

        {resumoPeriodo.abaixoDaMeta > 0 && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-400">
              Por que os clientes reclamaram
            </p>
            <ul className="space-y-1.5">
              {motivosMaisComuns(periodo.filter((a) => precisaFeedback(a.nota))).map((m) => (
                <li key={m.motivo} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-slate-700">{m.motivo}</span>
                  <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                    {m.total}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

// ==================== COMPONENTES ====================

function CartaoDoDia({ dia, resumo }: { dia: string; resumo: ReturnType<typeof resumirRating> }) {
  if (resumo.total === 0) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center">
        <Estrelas valor={0} tamanho={26} />
        <p className="mt-3 text-sm font-semibold text-slate-500">
          Nenhuma entrega sua foi avaliada em {formatarData(dia)}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Nem todo cliente responde a pesquisa — dia sem avaliação não é dia sem entrega.
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
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">{formatarData(dia)}</p>

        <div className="mt-3 flex justify-center">
          <Estrelas valor={resumo.estrelas ?? 0} tamanho={34} />
        </div>

        <p className="mt-3 text-5xl font-black leading-none tabular-nums">
          {resumo.media?.toFixed(2)}
        </p>
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

function Indicador({ titulo, valor, destaque = false }: { titulo: string; valor: string; destaque?: boolean }) {
  return (
    <div
      className={`min-w-0 rounded-2xl border p-3 text-center ${
        destaque ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <p className={`truncate text-2xl font-bold tabular-nums ${destaque ? "text-amber-700" : "text-slate-900"}`}>
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase leading-tight text-slate-400">{titulo}</p>
    </div>
  );
}

function CartaoPendencia({
  avaliacao,
  dia,
  souMotorista,
  feedback,
}: {
  avaliacao: Avaliacao;
  dia: string;
  souMotorista: boolean;
  feedback: Feedback | null;
}) {
  const cor = avaliacao.classificacao === "detrator" ? "red" : "amber";

  return (
    <li
      className={`overflow-hidden rounded-2xl border bg-white ${
        cor === "red" ? "border-red-200" : "border-amber-200"
      }`}
    >
      <div className={`px-4 py-3 ${cor === "red" ? "bg-red-50" : "bg-amber-50"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              {avaliacao.nome_pdv ?? "Cliente não identificado"}
            </p>
            <p className="truncate text-xs text-slate-500">
              {avaliacao.cidade ?? "—"} · mapa {avaliacao.mapa} ·{" "}
              {souMotorista ? "você era o motorista" : "você era o ajudante"}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Estrelas valor={avaliacao.nota} tamanho={15} />
            <p
              className={`mt-0.5 text-[11px] font-bold uppercase ${
                cor === "red" ? "text-red-700" : "text-amber-700"
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
        <input type="hidden" name="dia" value={dia} />

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
