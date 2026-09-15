import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { CartaoPratica, SeloPratica, type PraticaParaCartao } from "@/components/boas-praticas/CartaoPratica";
import { createAdminClient } from "@/lib/supabase/admin";
import { contextoBoasPraticas } from "@/lib/boas-praticas-server";
import {
  MEDALHA,
  formatarDia,
  formatarReais,
  hojeSP,
  mensagemPrazoDeSugestao,
  premiosDe,
  recebeSugestao,
  textoDoPrazo,
  votacaoRecebeVoto,
  type ConfigBoasPraticas,
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
  fim: string;
  divulgacao_em: string | null;
  encerrada_em: string | null;
  vencedora_id: string | null;
  segunda_id: string | null;
  terceira_id: string | null;
  premio_1: number | null;
  premio_2: number | null;
  premio_3: number | null;
};

const COLUNAS =
  "id, titulo, problema, objetivo, escopo, beneficios, foto_url, colaborador_id, colaborador_nome, criado_em, status, retorno, avaliado_por_nome, votacao_id";
const COLUNAS_VOTACAO =
  "id, titulo, fim, divulgacao_em, encerrada_em, vencedora_id, segunda_id, terceira_id, premio_1, premio_2, premio_3";

function podioDe(v: Votacao) {
  return [v.vencedora_id, v.segunda_id, v.terceira_id];
}

export default async function BoasPraticasPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; erro?: string; sucesso?: string; editar?: string }>;
}) {
  const ctx = await contextoBoasPraticas();
  if (!ctx.ok) redirect(`/?erro=${encodeURIComponent(ctx.erro)}`);
  const { perfil, revendaId, config } = ctx;

  const sp = await searchParams;
  const hoje = hojeSP();
  const abertoParaSugestao = recebeSugestao(config, hoje);

  // Service role com a revenda e a pessoa sempre no filtro: o voto dos
  // outros é secreto (RLS), mas a CONTAGEM da votação divulgada é pública
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
  const idsDoPodio = encerradas.flatMap(podioDe).filter((v): v is string => Boolean(v));

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
    { data: doPodioBanco },
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
    idsDoPodio.length > 0
      ? admin.from("boas_praticas").select(COLUNAS).in("id", idsDoPodio)
      : Promise.resolve({ data: [] as Pratica[] }),
    Promise.all(
      encerradas.map(async (v) => ({
        id: v.id,
        total: await contarVotos(v.id),
        porLugar: await Promise.all(podioDe(v).map((id) => (id ? contarVotos(v.id, id) : Promise.resolve(0)))),
      })),
    ),
  ]);

  const naVotacao = (naVotacaoBanco ?? []) as Pratica[];
  const meuVotoId = (meuVotoBanco as { pratica_id: string } | null)?.pratica_id ?? null;
  const votacoesDasMinhas = new Map(((votacoesDasMinhasBanco ?? []) as Votacao[]).map((v) => [v.id, v]));
  const doPodio = new Map(((doPodioBanco ?? []) as Pratica[]).map((p) => [p.id, p]));
  const placar = new Map(placares.map((p) => [p.id, p]));

  const recebeVoto = atual ? votacaoRecebeVoto(atual, hoje) : false;
  const praticaDoMeuVoto = naVotacao.find((p) => p.id === meuVotoId);

  const emEdicao =
    sp.editar && abertoParaSugestao
      ? minhas.find((p) => p.id === sp.editar && p.status === "em_analise")
      : undefined;

  const abasValidas: Aba[] = ["votar", "sugerir", "minhas", "vencedoras"];
  const aba: Aba = emEdicao
    ? "sugerir"
    : abasValidas.includes(sp.aba as Aba)
      ? (sp.aba as Aba)
      : atual
        ? "votar"
        : encerradas.length > 0 && !abertoParaSugestao
          ? "vencedoras"
          : "sugerir";

  const abas: { id: Aba; rotulo: string }[] = [
    { id: "votar", rotulo: atual && recebeVoto ? "🗳️ Votação aberta" : "🗳️ Votação" },
    { id: "sugerir", rotulo: "💡 Sugerir" },
    { id: "minhas", rotulo: `Minhas${minhas.length > 0 ? ` (${minhas.length})` : ""}` },
    { id: "vencedoras", rotulo: "🏆 Resultado" },
  ];

  return (
    <div>
      <PageHeader
        title="💡 Boas Práticas"
        subtitle="Sugira uma melhoria para o dia a dia. A liderança analisa, os colegas votam e as três mais votadas são premiadas."
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
              Nenhuma votação aberta agora.
              {config.votacao_ate
                ? ` A votação vai até ${formatarDia(config.votacao_ate)}: quando a liderança abrir, você recebe um aviso no app.`
                : " Quando a liderança abrir, você recebe um aviso no app."}
            </p>
            {abertoParaSugestao && (
              <Link
                href="?aba=sugerir"
                className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                💡 Sugerir uma prática
              </Link>
            )}
          </div>
        ) : (
          <section className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-5 text-white shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-white/80">Votação</p>
              <h2 className="mt-1 text-lg font-bold">{atual.titulo}</h2>
              <p className="mt-2 text-sm text-white/90">⏰ {textoDoPrazo(atual, hoje)}</p>
              {atual.divulgacao_em && recebeVoto && (
                <p className="text-sm text-white/90">📣 Resultado em {formatarDia(atual.divulgacao_em)}</p>
              )}
              <Premiacao premios={atual} claro />
            </div>

            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              {!recebeVoto
                ? "O prazo para votar acabou. O resultado sai no dia da divulgação."
                : praticaDoMeuVoto
                  ? `Você votou em “${praticaDoMeuVoto.titulo}”. Dá para trocar até o fim da votação.`
                  : "Estas práticas passaram pela análise da liderança. Leia e escolha UMA. O voto é secreto, e não vale votar na sua."}
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
          {!emEdicao && <ComoFunciona config={config} />}
          {emEdicao && (
            <p className="rounded-xl bg-primary-soft p-3 text-sm font-medium text-primary-dark">
              Editando “{emEdicao.titulo}”. Dá para mudar enquanto a liderança não avaliou.
            </p>
          )}
          {abertoParaSugestao ? (
            <FormPratica pratica={emEdicao} />
          ) : (
            <p className="rounded-xl bg-slate-100 p-4 text-sm font-medium text-slate-700">
              {mensagemPrazoDeSugestao(config)} Acompanhe a votação e o resultado pelas outras abas.
            </p>
          )}
        </section>
      )}

      {aba === "minhas" && (
        <section>
          {minhas.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <p className="text-sm text-slate-600">Você ainda não sugeriu nenhuma prática.</p>
              {abertoParaSugestao && (
                <Link
                  href="?aba=sugerir"
                  className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  💡 Sugerir a primeira
                </Link>
              )}
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
                        {abertoParaSugestao && (
                          <Link
                            href={`?aba=sugerir&editar=${p.id}`}
                            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            ✏️ Editar
                          </Link>
                        )}
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
        <section className="space-y-6">
          {encerradas.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
              {config.divulgacao_em
                ? `O resultado sai em ${formatarDia(config.divulgacao_em)}. O pódio vai aparecer aqui.`
                : "Nenhuma votação encerrada ainda. O pódio vai aparecer aqui."}
            </div>
          ) : (
            encerradas.map((v) => {
              const pl = placar.get(v.id);
              const podio = podioDe(v);
              const premios = premiosDe(v);
              return (
                <div key={v.id} className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-bold uppercase text-slate-500">{v.titulo}</h2>
                    <span className="text-xs text-slate-400">
                      Divulgado em {v.encerrada_em ? formatarDia(v.encerrada_em) : "—"} · {pl?.total ?? 0} votos
                    </span>
                  </div>
                  {podio.every((id) => !id) ? (
                    <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                      Encerrada sem pódio (ninguém votou).
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {podio.map((id, i) => {
                        const p = id ? doPodio.get(id) : undefined;
                        if (!p) return null;
                        return (
                          <CartaoPratica
                            key={p.id}
                            p={p}
                            destaque={i === 0 ? "vencedora" : null}
                            selo={<SeloPratica texto={`${MEDALHA[i]} ${i + 1}º lugar`} tom="vencedora" />}
                          >
                            <p className="text-xs text-slate-700">
                              {pl?.porLugar[i] ?? 0} voto{(pl?.porLugar[i] ?? 0) === 1 ? "" : "s"}
                              {premios[i].valor != null ? ` · 🎁 ${formatarReais(premios[i].valor)}` : ""}
                            </p>
                          </CartaoPratica>
                        );
                      })}
                    </ul>
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

/** 🥇 R$ 200 · 🥈 R$ 100 · 🥉 R$ 50 */
function Premiacao({
  premios,
  claro = false,
}: {
  premios: { premio_1: number | null; premio_2: number | null; premio_3: number | null };
  claro?: boolean;
}) {
  const lista = premiosDe(premios);
  if (lista.every((p) => p.valor == null)) {
    return <p className={`mt-1 text-sm ${claro ? "text-white/90" : "text-slate-600"}`}>🎁 Premiação a definir</p>;
  }
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {lista.map((p) => (
        <div
          key={p.lugar}
          className={`rounded-xl px-2 py-2 text-center ${claro ? "bg-white/15" : "bg-amber-50 ring-1 ring-amber-200"}`}
        >
          <p className="text-lg leading-none">{p.medalha}</p>
          <p className={`mt-1 text-sm font-bold tabular-nums ${claro ? "text-white" : "text-slate-900"}`}>
            {formatarReais(p.valor)}
          </p>
          <p className={`text-[11px] ${claro ? "text-white/80" : "text-slate-500"}`}>{p.lugar}º lugar</p>
        </div>
      ))}
    </div>
  );
}

/** As regras e o calendário, antes do formulário -- é o que a pessoa lê antes de escrever. */
function ComoFunciona({ config }: { config: ConfigBoasPraticas }) {
  const etapas = [
    {
      quando: config.sugestoes_ate ? `Até ${formatarDia(config.sugestoes_ate)}` : "Sempre aberto",
      oque: "Envie suas sugestões — quantas quiser.",
    },
    {
      quando: "Antes da votação",
      oque: "A liderança analisa. Só as práticas aprovadas vão para a votação; as outras recebem o motivo aqui no app.",
    },
    {
      quando: config.votacao_ate ? `Até ${formatarDia(config.votacao_ate)}` : "Votação",
      oque: "Os colegas votam: um voto por pessoa, secreto, e não vale votar na própria.",
    },
    {
      quando: config.divulgacao_em ? `Dia ${formatarDia(config.divulgacao_em)}` : "Divulgação",
      oque: "Resultado: as três mais votadas sobem ao pódio.",
    },
  ];

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <div>
        <p className="font-semibold">💡 Ideia simples que funciona vale muito.</p>
        <p className="mt-1">
          Pequenas mudanças que facilitam o trabalho, economizam tempo ou evitam erro são exatamente o que
          procuramos. Pensou em algo? Mande — quantas ideias quiser.
        </p>
      </div>
      <ol className="space-y-2">
        {etapas.map((e) => (
          <li key={e.quando} className="flex gap-3">
            <span className="w-28 shrink-0 text-xs font-bold uppercase text-amber-800">{e.quando}</span>
            <span>{e.oque}</span>
          </li>
        ))}
      </ol>
      <Premiacao premios={config} />
    </div>
  );
}

function situacao(
  p: Pratica,
  votacao: Votacao | undefined,
): { texto: string; tom: "analise" | "selecionada" | "votacao" | "vencedora" | "neutro" } {
  if (p.status === "em_analise") return { texto: "⏳ Em análise", tom: "analise" };
  if (p.status === "nao_selecionada") return { texto: "Não selecionada", tom: "neutro" };
  if (!votacao) return { texto: "✅ Aprovada", tom: "selecionada" };
  if (!votacao.encerrada_em) return { texto: "🗳️ Em votação", tom: "votacao" };
  const lugar = podioDe(votacao).indexOf(p.id);
  if (lugar >= 0) return { texto: `${MEDALHA[lugar]} ${lugar + 1}º lugar`, tom: "vencedora" };
  return { texto: "Participou da votação", tom: "neutro" };
}
