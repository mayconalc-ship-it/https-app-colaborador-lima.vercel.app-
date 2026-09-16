import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { CartaoPratica, SeloPratica, type PraticaParaCartao } from "@/components/boas-praticas/CartaoPratica";
import { podeNoModulo, requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerConfigBoasPraticas } from "@/lib/boas-praticas-server";
import { AREAS } from "@/lib/areas";
import {
  MEDALHA,
  apurar,
  formatarDia,
  formatarReais,
  hojeSP,
  motivoParaNaoDivulgar,
  nomeSugeridoDaVotacao,
  podioSugerido,
  premiosDe,
  somarDias,
  textoDoPrazo,
  type StatusPratica,
} from "@/lib/boas-praticas";
import { decodificar } from "@/lib/texto-url";
import { AvaliarPratica } from "./AvaliarPratica";
import { AbrirVotacao } from "./AbrirVotacao";
import { AjustarVotacao } from "./AjustarVotacao";
import { DivulgarResultado } from "./DivulgarResultado";
import { cancelarVotacao, excluirPraticaAdmin, voltarParaAnalise } from "./actions";

export const dynamic = "force-dynamic";

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
  encerrada_por_nome: string | null;
  vencedora_id: string | null;
  segunda_id: string | null;
  terceira_id: string | null;
  premio_1: number | null;
  premio_2: number | null;
  premio_3: number | null;
  aberta_por_nome: string;
  aberta_em: string;
};

const COLUNAS =
  "id, titulo, problema, objetivo, escopo, beneficios, foto_url, colaborador_id, colaborador_nome, criado_em, status, retorno, avaliado_por_nome, votacao_id";
const COLUNAS_VOTACAO =
  "id, titulo, fim, divulgacao_em, encerrada_em, encerrada_por_nome, vencedora_id, segunda_id, terceira_id, premio_1, premio_2, premio_3, aberta_por_nome, aberta_em";

function podioDe(v: Votacao) {
  return [v.vencedora_id, v.segunda_id, v.terceira_id];
}

export default async function AdminBoasPraticasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("boas-praticas", "ver");
  const sp = await searchParams;
  // Os botões aparecem só para quem a ação do servidor deixaria passar.
  const [podeEditar, podeExcluir, podeVerConfig] = await Promise.all([
    podeNoModulo("boas-praticas", "editar"),
    podeNoModulo("boas-praticas", "excluir"),
    podeNoModulo("boas-praticas-config", "ver"),
  ]);
  const revendaId = await exigirRevenda("/admin");
  const hoje = hojeSP();

  const admin = createAdminClient();
  const [{ data: praticasBanco }, { data: atualBanco }, { data: encerradasBanco }, config] = await Promise.all([
    admin
      .from("boas_praticas")
      .select(COLUNAS)
      .eq("revenda_id", revendaId)
      .order("criado_em", { ascending: false })
      .limit(500),
    admin
      .from("boas_praticas_votacoes")
      .select(COLUNAS_VOTACAO)
      .eq("revenda_id", revendaId)
      .is("encerrada_em", null)
      .maybeSingle(),
    admin
      .from("boas_praticas_votacoes")
      .select(COLUNAS_VOTACAO)
      .eq("revenda_id", revendaId)
      .not("encerrada_em", "is", null)
      .order("encerrada_em", { ascending: false })
      .limit(12),
    lerConfigBoasPraticas(revendaId),
  ]);

  const praticas = (praticasBanco ?? []) as Pratica[];
  const atual = (atualBanco ?? null) as Votacao | null;
  const encerradas = (encerradasBanco ?? []) as Votacao[];
  const porId = new Map(praticas.map((p) => [p.id, p]));

  async function contarVotos(votacaoId: string, praticaId?: string) {
    let consulta = admin
      .from("boas_praticas_votos")
      .select("id", { count: "exact", head: true })
      .eq("votacao_id", votacaoId);
    if (praticaId) consulta = consulta.eq("pratica_id", praticaId);
    const { count } = await consulta;
    return count ?? 0;
  }

  // Um voto por pessoa numa revenda de ~160: bem abaixo das 1.000 linhas
  // que o PostgREST devolve por consulta.
  const [{ data: votosBanco }, placares] = await Promise.all([
    atual
      ? admin.from("boas_praticas_votos").select("pratica_id").eq("votacao_id", atual.id)
      : Promise.resolve({ data: [] as { pratica_id: string }[] }),
    Promise.all(
      encerradas.map(async (v) => ({
        id: v.id,
        total: await contarVotos(v.id),
        porLugar: await Promise.all(podioDe(v).map((id) => (id ? contarVotos(v.id, id) : Promise.resolve(0)))),
      })),
    ),
  ]);
  const placar = new Map(placares.map((p) => [p.id, p]));

  // A fila de avaliação anda do mais antigo para o mais novo: quem sugeriu
  // primeiro espera a resposta há mais tempo.
  const emAnalise = praticas.filter((p) => p.status === "em_analise").reverse();
  const aguardando = praticas.filter((p) => p.status === "selecionada" && !p.votacao_id);
  const naoSelecionadas = praticas.filter((p) => p.status === "nao_selecionada");
  const naVotacao = atual ? praticas.filter((p) => p.votacao_id === atual.id) : [];

  const resultado = apurar(
    naVotacao.map((p) => p.id),
    (votosBanco ?? []) as { pratica_id: string }[],
  );
  const contagem = Object.fromEntries(resultado.contagem);

  // O calendário da Configuração preenche a votação nova; data que já
  // passou vira hoje, para o formulário não nascer recusado.
  const fimPadrao = config.votacao_ate && config.votacao_ate >= hoje ? config.votacao_ate : somarDias(hoje, 3);
  const divulgacaoPadrao =
    config.divulgacao_em && config.divulgacao_em > fimPadrao ? config.divulgacao_em : somarDias(fimPadrao, 1);

  const nomesDasAreas = config.todas_areas
    ? "todas"
    : AREAS.filter((a) => config.areas.includes(a.id)).map((a) => a.curto).join(" e ");

  return (
    <div>
      <PageHeader title="Boas Práticas" subtitle="Analise as sugestões, monte a votação e divulgue o pódio" />

      {sp.erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{decodificar(sp.erro)}</p>}
      {sp.sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{decodificar(sp.sucesso)}</p>
      )}

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm">
        <p>
          📅 Sugestões até <b>{config.sugestoes_ate ? formatarDia(config.sugestoes_ate) : "—"}</b> · Votação até{" "}
          <b>{config.votacao_ate ? formatarDia(config.votacao_ate) : "—"}</b> · Divulgação{" "}
          <b>{config.divulgacao_em ? formatarDia(config.divulgacao_em) : "—"}</b>
        </p>
        <p className="mt-1">
          🎁 {premiosDe(config).map((p) => `${p.medalha} ${formatarReais(p.valor)}`).join(" · ")} · Áreas:{" "}
          {nomesDasAreas}
          {podeVerConfig && (
            <>
              {" "}
              ·{" "}
              <Link href="/admin/boas-praticas/configuracao" className="font-semibold text-primary underline">
                Configuração
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 text-xs font-semibold">
        <span
          className={`rounded-lg px-3 py-1.5 ${emAnalise.length > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}
        >
          {emAnalise.length} para analisar
        </span>
        <span className="rounded-lg bg-green-100 px-3 py-1.5 text-green-800">
          {aguardando.length} aprovada{aguardando.length === 1 ? "" : "s"} aguardando votação
        </span>
        <span
          className={`rounded-lg px-3 py-1.5 ${atual ? "bg-primary-soft text-primary-dark" : "bg-slate-100 text-slate-600"}`}
        >
          {atual ? "Votação em andamento" : "Nenhuma votação aberta"}
        </span>
      </div>

      <div className="space-y-8">
        {atual && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase text-slate-500">Votação em andamento</h2>
            <div className="space-y-4 rounded-2xl border border-primary/30 bg-white p-4 shadow-sm">
              <div>
                <p className="text-base font-bold text-slate-900">{atual.titulo}</p>
                <p className="text-sm text-slate-600">⏰ {textoDoPrazo(atual, hoje)}</p>
                {atual.divulgacao_em && (
                  <p className="text-sm text-slate-600">📣 Divulgação em {formatarDia(atual.divulgacao_em)}</p>
                )}
                <p className="text-sm text-slate-600">
                  🎁 {premiosDe(atual).map((p) => `${p.medalha} ${formatarReais(p.valor)}`).join(" · ")}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Aberta por {atual.aberta_por_nome} em {formatarDia(atual.aberta_em)} · {resultado.total} voto
                  {resultado.total === 1 ? "" : "s"} até agora
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase text-slate-500">Parcial</p>
                <ul className="space-y-2">
                  {resultado.ranking.map((id) => {
                    const p = porId.get(id);
                    const n = resultado.contagem.get(id) ?? 0;
                    const largura = resultado.maximo > 0 ? Math.round((n / resultado.maximo) * 100) : 0;
                    return (
                      <li key={id}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate font-medium text-slate-800">
                            {p?.titulo ?? "—"}{" "}
                            <span className="text-xs font-normal text-slate-400">· {p?.colaborador_nome}</span>
                          </span>
                          <span className="shrink-0 font-bold tabular-nums text-slate-900">{n}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${largura}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-slate-400">
                  A parcial só aparece aqui. Para o colaborador o voto é secreto, e o resultado sai no dia da
                  divulgação.
                </p>
              </div>

              {podeEditar && (
                <details className="rounded-xl border border-slate-200">
                  <summary className="cursor-pointer list-none p-3 text-sm font-semibold text-slate-700">
                    ✏️ Mudar prazo, divulgação ou prêmios
                  </summary>
                  <AjustarVotacao
                    id={atual.id}
                    hoje={hoje}
                    fim={atual.fim < hoje ? hoje : atual.fim}
                    divulgacao={atual.divulgacao_em ?? somarDias(atual.fim, 1)}
                    premios={[atual.premio_1, atual.premio_2, atual.premio_3].map((v) =>
                      v == null ? "" : String(v),
                    ) as [string, string, string]}
                  />
                </details>
              )}

              {podeEditar && (
                <DivulgarResultado
                  votacaoId={atual.id}
                  opcoes={resultado.ranking.map((id) => ({
                    id,
                    titulo: porId.get(id)?.titulo ?? "—",
                    autor: porId.get(id)?.colaborador_nome ?? "—",
                    votos: resultado.contagem.get(id) ?? 0,
                  }))}
                  sugerido={podioSugerido(contagem)}
                  bloqueio={motivoParaNaoDivulgar(atual, hoje)}
                  premios={premiosDe(atual).map((p) => p.valor)}
                />
              )}

              {podeExcluir && (
                <BotaoExcluir
                  action={cancelarVotacao}
                  campos={{ id: atual.id }}
                  confirmacao={`Cancelar a votação? ${
                    resultado.total > 0 ? `Os ${resultado.total} votos serão apagados e as` : "As"
                  } práticas voltam para "aguardando votação".`}
                  rotuloConfirmar="Cancelar votação"
                >
                  Cancelar votação
                </BotaoExcluir>
              )}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase text-slate-500">Para analisar ({emAnalise.length})</h2>
          {emAnalise.length === 0 ? (
            <p className="rounded-xl bg-green-50 p-4 text-sm text-green-800">✅ Nenhuma sugestão esperando análise.</p>
          ) : (
            <ul className="space-y-3">
              {emAnalise.map((p) => (
                <CartaoPratica key={p.id} p={p} aberto selo={<SeloPratica texto="⏳ Em análise" tom="analise" />}>
                  <div className="space-y-2">
                    {podeEditar && <AvaliarPratica id={p.id} />}
                    {podeExcluir && (
                      <BotaoExcluir
                        action={excluirPraticaAdmin}
                        campos={{ id: p.id }}
                        confirmacao={`Apagar a prática “${p.titulo}”, de ${p.colaborador_nome}? Use só para teste ou engano.`}
                      >
                        Apagar
                      </BotaoExcluir>
                    )}
                  </div>
                </CartaoPratica>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase text-slate-500">
            Aprovadas — aguardando votação ({aguardando.length})
          </h2>
          {aguardando.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhuma prática aprovada esperando votação.
            </p>
          ) : (
            <>
              {podeEditar && !atual && (
                <AbrirVotacao
                  praticas={aguardando.map((p) => ({ id: p.id, titulo: p.titulo, autor: p.colaborador_nome }))}
                  nomeSugerido={nomeSugeridoDaVotacao(hoje)}
                  hoje={hoje}
                  fimPadrao={fimPadrao}
                  divulgacaoPadrao={divulgacaoPadrao}
                  premios={config}
                />
              )}
              {atual && (
                <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                  Estas entram na próxima votação, depois que o resultado da atual for divulgado.
                </p>
              )}
              <ul className="space-y-3">
                {aguardando.map((p) => (
                  <CartaoPratica key={p.id} p={p} selo={<SeloPratica texto="✅ Aprovada" tom="selecionada" />}>
                    <AcoesDaAvaliada p={p} podeEditar={podeEditar} podeExcluir={podeExcluir} />
                  </CartaoPratica>
                ))}
              </ul>
            </>
          )}
        </section>

        {naoSelecionadas.length > 0 && (
          <details className="rounded-2xl border border-slate-200 bg-white">
            <summary className="cursor-pointer list-none p-4 text-sm font-semibold text-slate-700">
              Não selecionadas ({naoSelecionadas.length})
            </summary>
            <ul className="space-y-3 border-t border-slate-100 p-4">
              {naoSelecionadas.map((p) => (
                <CartaoPratica key={p.id} p={p} selo={<SeloPratica texto="Não selecionada" tom="neutro" />}>
                  <AcoesDaAvaliada p={p} podeEditar={podeEditar} podeExcluir={podeExcluir} />
                </CartaoPratica>
              ))}
            </ul>
          </details>
        )}

        {encerradas.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase text-slate-500">Resultados divulgados</h2>
            <ul className="space-y-2">
              {encerradas.map((v) => {
                const pl = placar.get(v.id);
                const premios = premiosDe(v);
                const podio = podioDe(v);
                return (
                  <li key={v.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">{v.titulo}</p>
                      <span className="text-xs text-slate-400">
                        {v.encerrada_em ? formatarDia(v.encerrada_em) : ""} · {v.encerrada_por_nome} · {pl?.total ?? 0}{" "}
                        votos
                      </span>
                    </div>
                    {podio.every((id) => !id) ? (
                      <p className="mt-1 text-sm text-slate-500">Encerrada sem pódio</p>
                    ) : (
                      <ol className="mt-1 space-y-0.5 text-sm text-slate-700">
                        {podio.map((id, i) => {
                          const p = id ? porId.get(id) : undefined;
                          if (!p) return null;
                          return (
                            <li key={p.id}>
                              {MEDALHA[i]} {p.titulo} — {p.colaborador_nome} ({pl?.porLugar[i] ?? 0} votos
                              {premios[i].valor != null ? ` · ${formatarReais(premios[i].valor)}` : ""})
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/** Resposta dada, e os caminhos de volta: rever a decisão ou apagar. */
function AcoesDaAvaliada({
  p,
  podeEditar,
  podeExcluir,
}: {
  p: Pratica;
  podeEditar: boolean;
  podeExcluir: boolean;
}) {
  return (
    <div className="space-y-2">
      {p.retorno && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Resposta enviada</p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{p.retorno}</p>
          {p.avaliado_por_nome && <p className="mt-1 text-[11px] text-slate-500">{p.avaliado_por_nome}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {podeEditar && (
          <BotaoExcluir
            action={voltarParaAnalise}
            campos={{ id: p.id }}
            confirmacao={`Voltar “${p.titulo}” para análise? A resposta enviada é apagada.`}
            rotuloConfirmar="Voltar para análise"
            perigo={false}
            textoEnviando="Salvando..."
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            ↩️ Rever decisão
          </BotaoExcluir>
        )}
        {podeExcluir && (
          <BotaoExcluir
            action={excluirPraticaAdmin}
            campos={{ id: p.id }}
            confirmacao={`Apagar a prática “${p.titulo}”, de ${p.colaborador_nome}? Use só para teste ou engano.`}
          >
            Apagar
          </BotaoExcluir>
        )}
      </div>
    </div>
  );
}
