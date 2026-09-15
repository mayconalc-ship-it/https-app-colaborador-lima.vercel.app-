import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { CartaoPratica, SeloPratica, type PraticaParaCartao } from "@/components/boas-praticas/CartaoPratica";
import { createAdminClient } from "@/lib/supabase/admin";
import { contextoBoasPraticas } from "@/lib/boas-praticas-server";
import {
  formatarDia,
  hojeSP,
  textoDoPrazo,
  votacaoRecebeVoto,
  type StatusPratica,
} from "@/lib/boas-praticas";
import { decodificar } from "@/lib/texto-url";
import { FormPratica } from "./FormPratica";
import { excluirPratica, votar } from "./actions";

export const dynamic = "force-dynamic";

type Aba = "votar" | "sugerir" | "minhas" | "vencedoras";

type Pratica = PraticaParaCartao & {
  colaborador_id: string;
  status: StatusPratica;
  retorno: string | null;
  avaliado_por_nome: string | null;
  votacao_id: string | null;
};

type Votacao = {
  id: string;
  titulo: string;
  premio: string | null;
  fim: string;
  encerrada_em: string | null;
  vencedora_id: string | null;
};

const COLUNAS =
  "id, titulo, problema, objetivo, escopo, beneficios, foto_url, colaborador_id, colaborador_nome, criado_em, status, retorno, avaliado_por_nome, votacao_id";
const COLUNAS_VOTACAO = "id, titulo, premio, fim, encerrada_em, vencedora_id";

export default async function BoasPraticasPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; erro?: string; sucesso?: string; editar?: string }>;
}) {
  const ctx = await contextoBoasPraticas();
  if (!ctx.ok) redirect(`/?erro=${encodeURIComponent(ctx.erro)}`);
  const { perfil, revendaId } = ctx;

  const sp = await searchParams;
  const hoje = hojeSP();

  // Service role com a revenda e a pessoa sempre no filtro: o voto dos
  // outros é secreto (RLS), mas a CONTAGEM da votação encerrada é pública
  // -- e só o servidor a enxerga para contar.
  const admin = createAdminClient();

  const [{ data: atualBanco }, { data: minhasBanco }, { data: encerradasBanco }] = await Promise.all([
    admin
      .from("boas_praticas_votacoes")
      .select(COLUNAS_VOTACAO)
      .eq("revenda_id", revendaId)
      .is("encerrada_em", null)
      .maybeSingle(),
    admin
      .from("boas_praticas")
      .select(COLUNAS)
      .eq("revenda_id", revendaId)
      .eq("colaborador_id", perfil.id)
      .order("criado_em", { ascending: false })
      .limit(50),
    admin
      .from("boas_praticas_votacoes")
      .select(COLUNAS_VOTACAO)
      .eq("revenda_id", revendaId)
      .not("encerrada_em", "is", null)
      .order("encerrada_em", { ascending: false })
      .limit(12),
  ]);

  const atual = (atualBanco ?? null) as Votacao | null;
  const minhas = (minhasBanco ?? []) as Pratica[];
  const encerradas = (encerradasBanco ?? []) as Votacao[];

  const idsVotacoesDasMinhas = [
    ...new Set(minhas.map((p) => p.votacao_id).filter((v): v is string => Boolean(v))),
  ];
  const idsVencedoras = encerradas.map((v) => v.vencedora_id).filter((v): v is string => Boolean(v));

  async function contarVotos(votacaoId: string, praticaId?: string) {
    let consulta = admin
      .from("boas_praticas_votos")
      .select("id", { count: "exact", head: true })
      .eq("votacao_id", votacaoId);
    if (praticaId) consulta = consulta.eq("pratica_id", praticaId);
    const { count } = await consulta;
    return count ?? 0;
  }

  const [
    { data: naVotacaoBanco },
    { data: meuVotoBanco },
    { data: votacoesDasMinhasBanco },
    { data: vencedorasBanco },
    placares,
  ] = await Promise.all([
    atual
      ? admin
          .from("boas_praticas")
          .select(COLUNAS)
          .eq("revenda_id", revendaId)
          .eq("votacao_id", atual.id)
          .order("criado_em")
      : Promise.resolve({ data: [] as Pratica[] }),
    atual
      ? admin
          .from("boas_praticas_votos")
          .select("pratica_id")
          .eq("votacao_id", atual.id)
          .eq("colaborador_id", perfil.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    idsVotacoesDasMinhas.length > 0
      ? admin.from("boas_praticas_votacoes").select(COLUNAS_VOTACAO).in("id", idsVotacoesDasMinhas)
      : Promise.resolve({ data: [] as Votacao[] }),
    idsVencedoras.length > 0
      ? admin.from("boas_praticas").select(COLUNAS).in("id", idsVencedoras)
      : Promise.resolve({ data: [] as Pratica[] }),
    Promise.all(
      encerradas.map(async (v) => ({
        id: v.id,
        total: await contarVotos(v.id),
        daVencedora: v.vencedora_id ? await contarVotos(v.id, v.vencedora_id) : 0,
      })),
    ),
  ]);

  const naVotacao = (naVotacaoBanco ?? []) as Pratica[];
  const meuVotoId = (meuVotoBanco as { pratica_id: string } | null)?.pratica_id ?? null;
  const votacoesDasMinhas = new Map(((votacoesDasMinhasBanco ?? []) as Votacao[]).map((v) => [v.id, v]));
  const vencedoras = new Map(((vencedorasBanco ?? []) as Pratica[]).map((p) => [p.id, p]));
  const placar = new Map(placares.map((p) => [p.id, p]));

  const recebeVoto = atual ? votacaoRecebeVoto(atual, hoje) : false;
  const praticaDoMeuVoto = naVotacao.find((p) => p.id === meuVotoId);

  const emEdicao = sp.editar ? minhas.find((p) => p.id === sp.editar && p.status === "em_analise") : undefined;

  const abasValidas: Aba[] = ["votar", "sugerir", "minhas", "vencedoras"];
  const aba: Aba = emEdicao
    ? "sugerir"
    : abasValidas.includes(sp.aba as Aba)
      ? (sp.aba as Aba)
      : atual
        ? "votar"
        : "sugerir";

  const abas: { id: Aba; rotulo: string }[] = [
    { id: "votar", rotulo: atual && recebeVoto ? "🗳️ Votação aberta" : "🗳️ Votação" },
    { id: "sugerir", rotulo: "💡 Sugerir" },
    { id: "minhas", rotulo: `Minhas${minhas.length > 0 ? ` (${minhas.length})` : ""}` },
    { id: "vencedoras", rotulo: "🏆 Vencedoras" },
  ];

  return (
    <div>
      <PageHeader
        title="💡 Boas Práticas"
        subtitle="Sugira uma melhoria para o dia a dia. A liderança escolhe as que vão para votação, e a mais votada ganha."
      />

      {sp.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{decodificar(sp.erro)}</p>
      )}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">
          {decodificar(sp.sucesso)}
        </p>
      )}

      <nav className="mb-4 flex flex-wrap gap-2">
        {abas.map((a) => (
          <Link
            key={a.id}
            href={`?aba=${a.id}`}
            aria-current={a.id === aba ? "page" : undefined}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              a.id === aba
                ? "bg-primary text-white ring-2 ring-primary/30 ring-offset-1"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>

      {aba === "votar" &&
        (!atual ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-slate-600">
              Nenhuma votação aberta agora. Quando a liderança abrir, você recebe um aviso no app.
            </p>
            <Link
              href="?aba=sugerir"
              className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              💡 Sugerir uma prática
            </Link>
          </div>
        ) : (
          <section className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-5 text-white shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-white/80">Votação</p>
              <h2 className="mt-1 text-lg font-bold">{atual.titulo}</h2>
              <p className="mt-2 text-sm">🎁 Prêmio: {atual.premio ?? "a definir"}</p>
              <p className="mt-1 text-sm text-white/90">⏰ {textoDoPrazo(atual, hoje)}</p>
            </div>

            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              {!recebeVoto
                ? "O prazo para votar acabou. O resultado sai assim que a liderança encerrar."
                : praticaDoMeuVoto
                  ? `Você votou em “${praticaDoMeuVoto.titulo}”. Dá para trocar até o fim da votação.`
                  : "Leia as práticas e escolha UMA. O voto é secreto, e não vale votar na sua."}
            </p>

            <ul className="space-y-3">
              {naVotacao.map((p) => {
                const minha = p.colaborador_id === perfil.id;
                const escolhida = meuVotoId === p.id;
                return (
                  <CartaoPratica
                    key={p.id}
                    p={p}
                    destaque={escolhida ? "voto" : null}
                    selo={escolhida ? <SeloPratica texto="✅ Seu voto" tom="votacao" /> : undefined}
                  >
                    {minha ? (
                      <p className="text-xs font-medium text-slate-500">
                        Esta é a sua prática — o seu voto vai para a de um colega.
                      </p>
                    ) : recebeVoto && !escolhida ? (
                      <form action={votar}>
                        <input type="hidden" name="pratica_id" value={p.id} />
                        <BotaoEnviar
                          textoEnviando="Registrando..."
                          className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
                        >
                          {meuVotoId ? "Trocar meu voto para esta" : "🗳️ Votar nesta"}
                        </BotaoEnviar>
                      </form>
                    ) : null}
                  </CartaoPratica>
                );
              })}
            </ul>
          </section>
        ))}

      {aba === "sugerir" && (
        <section className="space-y-4">
          {!emEdicao && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Não precisa ser caro.</p>
              <p className="mt-1">
                Em outras revendas, uma canetinha para o palmtop e caixas de papelão reaproveitadas para
                acomodar produtos como sabão em pó viraram boas práticas. Pode mandar quantas quiser.
              </p>
            </div>
          )}
          {emEdicao && (
            <p className="rounded-xl bg-primary-soft p-3 text-sm font-medium text-primary-dark">
              Editando “{emEdicao.titulo}”. Dá para mudar enquanto a liderança não avaliou.
            </p>
          )}
          <FormPratica pratica={emEdicao} />
        </section>
      )}

      {aba === "minhas" && (
        <section>
          {minhas.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <p className="text-sm text-slate-600">Você ainda não sugeriu nenhuma prática.</p>
              <Link
                href="?aba=sugerir"
                className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                💡 Sugerir a primeira
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {minhas.map((p) => {
                const votacao = p.votacao_id ? votacoesDasMinhas.get(p.votacao_id) : undefined;
                const s = situacao(p, votacao);
                return (
                  <CartaoPratica
                    key={p.id}
                    p={p}
                    destaque={s.tom === "vencedora" ? "vencedora" : null}
                    selo={<SeloPratica texto={s.texto} tom={s.tom} />}
                  >
                    {p.retorno && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-bold uppercase text-slate-500">Resposta da liderança</p>
                        <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{p.retorno}</p>
                        {p.avaliado_por_nome && (
                          <p className="mt-1 text-[11px] text-slate-500">{p.avaliado_por_nome}</p>
                        )}
                      </div>
                    )}
                    {p.status === "em_analise" && (
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`?aba=sugerir&editar=${p.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          ✏️ Editar
                        </Link>
                        <BotaoExcluir
                          action={excluirPratica}
                          campos={{ id: p.id }}
                          confirmacao={`Apagar a prática “${p.titulo}”?`}
                        >
                          Apagar
                        </BotaoExcluir>
                      </div>
                    )}
                  </CartaoPratica>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {aba === "vencedoras" && (
        <section className="space-y-4">
          {encerradas.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
              Nenhuma votação encerrada ainda. A primeira vencedora vai aparecer aqui.
            </div>
          ) : (
            encerradas.map((v) => {
              const vencedora = v.vencedora_id ? vencedoras.get(v.vencedora_id) : undefined;
              const pl = placar.get(v.id);
              return (
                <div key={v.id} className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-bold uppercase text-slate-500">{v.titulo}</h2>
                    <span className="text-xs text-slate-400">
                      Encerrada em {v.encerrada_em ? formatarDia(v.encerrada_em) : "—"}
                    </span>
                  </div>
                  {vencedora ? (
                    <ul>
                      <CartaoPratica
                        p={vencedora}
                        destaque="vencedora"
                        selo={<SeloPratica texto="🏆 Vencedora" tom="vencedora" />}
                      >
                        <p className="text-xs text-amber-900">
                          {pl?.daVencedora ?? 0} de {pl?.total ?? 0} votos
                          {v.premio ? ` · 🎁 ${v.premio}` : ""}
                        </p>
                      </CartaoPratica>
                    </ul>
                  ) : (
                    <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                      Encerrada sem vencedora (ninguém votou).
                    </p>
                  )}
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}

function situacao(
  p: Pratica,
  votacao: Votacao | undefined,
): { texto: string; tom: "analise" | "selecionada" | "votacao" | "vencedora" | "neutro" } {
  if (p.status === "em_analise") return { texto: "⏳ Em análise", tom: "analise" };
  if (p.status === "nao_selecionada") return { texto: "Não selecionada", tom: "neutro" };
  if (!votacao) return { texto: "✅ Selecionada", tom: "selecionada" };
  if (!votacao.encerrada_em) return { texto: "🗳️ Em votação", tom: "votacao" };
  if (votacao.vencedora_id === p.id) return { texto: "🏆 Vencedora", tom: "vencedora" };
  return { texto: "Participou da votação", tom: "neutro" };
}
