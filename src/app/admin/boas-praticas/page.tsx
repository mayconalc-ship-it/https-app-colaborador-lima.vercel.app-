import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { CartaoPratica, SeloPratica, type PraticaParaCartao } from "@/components/boas-praticas/CartaoPratica";
import { podeNoModulo, requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  LIMITES,
  apurar,
  formatarDia,
  hojeSP,
  nomeSugeridoDaVotacao,
  textoDoPrazo,
  votacaoRecebeVoto,
  type StatusPratica,
} from "@/lib/boas-praticas";
import { decodificar } from "@/lib/texto-url";
import { AvaliarPratica } from "./AvaliarPratica";
import { AbrirVotacao } from "./AbrirVotacao";
import { FormConfirmado } from "./FormConfirmado";
import {
  atualizarVotacao,
  cancelarVotacao,
  encerrarVotacao,
  excluirPraticaAdmin,
  voltarParaAnalise,
} from "./actions";

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
  premio: string | null;
  fim: string;
  encerrada_em: string | null;
  encerrada_por_nome: string | null;
  vencedora_id: string | null;
  aberta_por_nome: string;
  aberta_em: string;
};

const COLUNAS =
  "id, titulo, problema, objetivo, escopo, beneficios, foto_url, colaborador_id, colaborador_nome, criado_em, status, retorno, avaliado_por_nome, votacao_id";
const COLUNAS_VOTACAO =
  "id, titulo, premio, fim, encerrada_em, encerrada_por_nome, vencedora_id, aberta_por_nome, aberta_em";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

export default async function AdminBoasPraticasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("boas-praticas", "ver");
  const sp = await searchParams;
  // Os botões aparecem só para quem a ação do servidor deixaria passar.
  const [podeEditar, podeExcluir] = await Promise.all([
    podeNoModulo("boas-praticas", "editar"),
    podeNoModulo("boas-praticas", "excluir"),
  ]);
  const revendaId = await exigirRevenda("/admin");
  const hoje = hojeSP();

  const admin = createAdminClient();
  const [{ data: praticasBanco }, { data: atualBanco }, { data: encerradasBanco }] = await Promise.all([
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
        daVencedora: v.vencedora_id ? await contarVotos(v.id, v.vencedora_id) : 0,
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
  const recebeVoto = atual ? votacaoRecebeVoto(atual, hoje) : false;

  const fimPadrao = new Date(Date.parse(`${hoje}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Boas Práticas"
        subtitle="Avalie as sugestões, monte a votação e divulgue a vencedora"
      />

      {sp.erro && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{decodificar(sp.erro)}</p>}
      {sp.sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{decodificar(sp.sucesso)}</p>
      )}

      <div className="mb-6 flex flex-wrap gap-2 text-xs font-semibold">
        <span className={`rounded-lg px-3 py-1.5 ${emAnalise.length > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
          {emAnalise.length} para avaliar
        </span>
        <span className="rounded-lg bg-green-100 px-3 py-1.5 text-green-800">
          {aguardando.length} aguardando votação
        </span>
        <span className={`rounded-lg px-3 py-1.5 ${atual ? "bg-primary-soft text-primary-dark" : "bg-slate-100 text-slate-600"}`}>
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
                <p className="mt-1 text-sm text-slate-600">🎁 Prêmio: {atual.premio ?? "a definir"}</p>
                <p className="text-sm text-slate-600">⏰ {textoDoPrazo(atual, hoje)}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Aberta por {atual.aberta_por_nome} em {formatarDia(atual.aberta_em)} ·{" "}
                  {resultado.total} voto{resultado.total === 1 ? "" : "s"} até agora
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
                            {p?.titulo ?? "—"} <span className="text-xs font-normal text-slate-400">· {p?.colaborador_nome}</span>
                          </span>
                          <span className="shrink-0 tabular-nums font-bold text-slate-900">{n}</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${largura}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-slate-400">
                  A parcial só aparece aqui. Para o colaborador o voto é secreto, e o resultado sai quando a votação é
                  encerrada.
                </p>
              </div>

              {podeEditar && (
                <details className="rounded-xl border border-slate-200">
                  <summary className="cursor-pointer list-none p-3 text-sm font-semibold text-slate-700">
                    ✏️ Mudar prêmio ou prazo
                  </summary>
                  <form action={atualizarVotacao} className="space-y-3 border-t border-slate-100 p-3">
                    <input type="hidden" name="id" value={atual.id} />
                    <div>
                      <label className={rotulo} htmlFor="premio-atual">Prêmio</label>
                      <input
                        id="premio-atual"
                        name="premio"
                        maxLength={LIMITES.premioMax}
                        defaultValue={atual.premio ?? ""}
                        placeholder="Deixe em branco enquanto não estiver definido"
                        className={campo}
                      />
                    </div>
                    <div>
                      <label className={rotulo} htmlFor="fim-atual">Votação aberta até (inclusive)</label>
                      <input
                        id="fim-atual"
                        name="fim"
                        type="date"
                        required
                        min={hoje}
                        defaultValue={atual.fim < hoje ? hoje : atual.fim}
                        className={campo}
                      />
                    </div>
                    <BotaoEnviar className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark">
                      Salvar
                    </BotaoEnviar>
                  </form>
                </details>
              )}

              {podeEditar && (
                <FormConfirmado
                  action={encerrarVotacao}
                  confirmacao={
                    recebeVoto
                      ? "Encerrar antes do prazo? Quem ainda não votou não vai mais poder votar."
                      : "Encerrar a votação e divulgar o resultado?"
                  }
                  detalhe="Toda a revenda recebe o aviso com a vencedora."
                  rotuloConfirmar="Encerrar"
                  className="space-y-2 rounded-xl bg-amber-50 p-3"
                >
                  <input type="hidden" name="id" value={atual.id} />
                  {resultado.lideres.length === 0 ? (
                    <p className="text-sm text-amber-900">
                      Ninguém votou ainda. Encerrar agora fecha a votação sem vencedora.
                    </p>
                  ) : (
                    <fieldset className="space-y-1">
                      <legend className="mb-1 text-sm font-semibold text-amber-900">
                        {resultado.lideres.length > 1
                          ? `Empate em primeiro lugar com ${resultado.maximo} votos. Escolha qual será divulgada:`
                          : "Vencedora (a mais votada):"}
                      </legend>
                      {resultado.lideres.map((id, i) => (
                        <label key={id} className="flex items-center gap-2 text-sm text-slate-800">
                          <input type="radio" name="vencedora_id" value={id} defaultChecked={i === 0} required />
                          {porId.get(id)?.titulo} — {porId.get(id)?.colaborador_nome}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <BotaoEnviar
                    textoEnviando="Encerrando..."
                    className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600"
                  >
                    🏆 Encerrar e divulgar
                  </BotaoEnviar>
                </FormConfirmado>
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
          <h2 className="text-sm font-bold uppercase text-slate-500">Para avaliar ({emAnalise.length})</h2>
          {emAnalise.length === 0 ? (
            <p className="rounded-xl bg-green-50 p-4 text-sm text-green-800">✅ Nenhuma sugestão esperando avaliação.</p>
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
            Selecionadas — aguardando votação ({aguardando.length})
          </h2>
          {aguardando.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhuma prática selecionada esperando votação.
            </p>
          ) : (
            <>
              {podeEditar && !atual && (
                <AbrirVotacao
                  praticas={aguardando.map((p) => ({ id: p.id, titulo: p.titulo, autor: p.colaborador_nome }))}
                  nomeSugerido={nomeSugeridoDaVotacao(hoje)}
                  hoje={hoje}
                  fimPadrao={fimPadrao}
                />
              )}
              {atual && (
                <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                  Estas entram na próxima votação, depois que a atual for encerrada.
                </p>
              )}
              <ul className="space-y-3">
                {aguardando.map((p) => (
                  <CartaoPratica key={p.id} p={p} selo={<SeloPratica texto="✅ Selecionada" tom="selecionada" />}>
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
            <h2 className="text-sm font-bold uppercase text-slate-500">Votações encerradas</h2>
            <ul className="space-y-2">
              {encerradas.map((v) => {
                const vencedora = v.vencedora_id ? porId.get(v.vencedora_id) : undefined;
                const pl = placar.get(v.id);
                return (
                  <li key={v.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">{v.titulo}</p>
                      <span className="text-xs text-slate-400">
                        {v.encerrada_em ? formatarDia(v.encerrada_em) : ""} · {v.encerrada_por_nome}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">
                      {vencedora
                        ? `🏆 ${vencedora.titulo} — ${vencedora.colaborador_nome} (${pl?.daVencedora ?? 0} de ${pl?.total ?? 0} votos)`
                        : "Encerrada sem vencedora"}
                    </p>
                    {v.premio && <p className="text-xs text-slate-500">🎁 {v.premio}</p>}
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
