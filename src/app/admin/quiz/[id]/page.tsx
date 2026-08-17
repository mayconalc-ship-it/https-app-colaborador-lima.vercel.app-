import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { TabelaRodada } from "@/components/TabelaCampeonato";
import { decodificar } from "@/lib/texto-url";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { listarPilares } from "@/lib/pilares";
import { AREAS } from "@/lib/areas";
import {
  getBancoDisponivel,
  getClassificacaoRodada,
  getElegiveis,
  getIndicadores,
  getQuestoesDaRodada,
  getRodada,
} from "@/lib/quiz-server";
import {
  DIFICULDADES,
  PONTOS_POR_QUESTAO,
  ROTULO_STATUS,
  TIPOS_QUESTAO,
  corDificuldade,
  letra,
  nomeDoMes,
  rotuloDificuldade,
} from "@/lib/quiz";
import { iaConfigurada } from "@/lib/quiz-ia";
import {
  adicionarDoBanco,
  atualizarRodada,
  criarQuestao,
  editarQuestao,
  encerrarRodada,
  excluirQuestao,
  excluirRodada,
  gerarComIA,
  importarQuestoes,
  publicarRodada,
  removerDaRodada,
  alternarStatusQuestao,
} from "../actions";

const ENTRADA =
  "w-full rounded-lg border border-slate-200 p-2 text-base focus:border-primary focus:outline-none";

/**
 * Gerar dez perguntas com raciocínio passa de um minuto. O padrão da
 * Vercel derrubaria a ação antes de terminar; 60s é o teto do plano
 * Hobby. Se o plano for Pro, dá para subir até 300.
 */
export const maxDuration = 60;

export default async function RodadaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("quiz", "ver");
  const { id } = await params;
  const { erro, sucesso } = await searchParams;

  const revendaId = (await getRevendaId())!;
  const rodada = await getRodada(Number(id));

  // A rodada tem de ser desta revenda. Sem esta linha, trocar o número na
  // URL abriria o campeonato da outra unidade.
  if (!rodada || rodada.revendaId !== revendaId) notFound();

  const [podeEditar, podeCriar, podeExcluir] = await Promise.all([
    podeNoModulo("quiz", "editar"),
    podeNoModulo("quiz", "criar"),
    podeNoModulo("quiz", "excluir"),
  ]);

  const [questoes, banco, indicadores, classificacao, elegiveis, pilares] =
    await Promise.all([
      getQuestoesDaRodada(rodada.id),
      getBancoDisponivel(revendaId, rodada.area, rodada.id),
      getIndicadores(rodada.id),
      getClassificacaoRodada(rodada),
      getElegiveis(revendaId, rodada.area),
      listarPilares(true),
    ]);

  const rascunho = rodada.status === "rascunho";
  const faltam = rodada.totalPerguntas - questoes.length;
  const rotuloArea = AREAS.find((a) => a.id === rodada.area)?.rotulo ?? rodada.area;

  return (
    <div>
      <PageHeader
        title={rodada.nome}
        subtitle={`${rotuloArea} · ${nomeDoMes(rodada.mes)}/${rodada.temporada} · ${ROTULO_STATUS[rodada.status]}`}
      />

      <Link
        href="/admin/quiz"
        className="mb-4 inline-block text-sm text-primary hover:underline"
      >
        ← Todas as rodadas
      </Link>

      {erro && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}
      {sucesso && (
        <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          {decodificar(sucesso)}
        </p>
      )}

      {/* ---- Situação e botões de estado ---- */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-600">
          {questoes.length} de {rodada.totalPerguntas} perguntas cadastradas
          {faltam > 0 && (
            <span className="font-semibold text-amber-700">
              {" "}
              — faltam {faltam}
            </span>
          )}
          {faltam < 0 && (
            <span className="font-semibold text-amber-700">
              {" "}
              — sobram {Math.abs(faltam)}: ajuste o campo &quot;Perguntas&quot;
              em &quot;Editar dados da rodada&quot; para {questoes.length}
              antes de publicar
            </span>
          )}
        </p>

        {podeEditar && (
          <div className="mt-3 flex flex-wrap gap-2">
            {rascunho && (
              <form action={publicarRodada}>
                <input type="hidden" name="id" value={rodada.id} />
                <BotaoEnviar
                  textoEnviando="Publicando..."
                  disabled={faltam !== 0}
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
                >
                  🚀 Publicar para o time
                </BotaoEnviar>
              </form>
            )}

            {rodada.status === "publicada" && (
              <BotaoExcluir
                action={encerrarRodada}
                campos={{ id: rodada.id }}
                confirmacao="Encerrar esta rodada? Ninguém mais consegue participar e os selos de 1º, Top 3 e Top 5 são entregues agora."
                rotuloConfirmar="Encerrar rodada"
                perigo={false}
                textoEnviando="Encerrando..."
                className="rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                🏁 Encerrar rodada
              </BotaoExcluir>
            )}

            {rascunho && podeExcluir && (
              <BotaoExcluir
                action={excluirRodada}
                campos={{ id: rodada.id }}
                confirmacao="Excluir este rascunho? As perguntas continuam no banco."
                className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                Excluir rascunho
              </BotaoExcluir>
            )}
          </div>
        )}

        {!rascunho && (
          <p className="mt-3 text-xs text-slate-500">
            A rodada já saiu do rascunho: as perguntas ficam travadas para não
            mudar o desafio embaixo de quem já respondeu.
          </p>
        )}
      </div>

      {/* ---- Indicadores ---- */}
      {!rascunho && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Como o time foi
          </h2>

          {/* A base do percentual é quem tem a área no cadastro -- mas quem
              participou entra nela de qualquer jeito. Sem isso, uma pessoa
              que jogou sem estar contada na área produzia "1 de 0" e 0%,
              que lê como tela quebrada. */}
          {(() => {
            const base = Math.max(elegiveis.daArea, indicadores.concluiram);
            return (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Indicador
                  valor={String(indicadores.concluiram)}
                  rotulo={base > 0 ? `de ${base} na área` : "participantes"}
                />
                <Indicador
                  valor={
                    base > 0
                      ? `${Math.round((indicadores.concluiram / base) * 100)}%`
                      : "—"
                  }
                  rotulo="participação"
                />
                <Indicador
                  valor={String(indicadores.mediaPontos)}
                  rotulo="média de pontos"
                />
                <Indicador
                  valor={`${indicadores.taxaConclusao}%`}
                  rotulo="taxa de conclusão"
                />
              </div>
            );
          })()}

          {indicadores.maisErrada && (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                ⚠️ Questão com maior índice de erro
              </p>
              <p className="mt-1 text-sm font-medium text-slate-800">
                {indicadores.maisErrada.pergunta}
              </p>
              <p className="mt-1 text-sm text-amber-900">
                {indicadores.maisErrada.percentual}% de acerto —{" "}
                {indicadores.maisErrada.respondida - indicadores.maisErrada.acertos}{" "}
                de {indicadores.maisErrada.respondida} erraram.
              </p>
              <p className="mt-2 text-xs text-amber-800">
                Vale reforçar este ponto do padrão com a turma.
              </p>
            </div>
          )}

          {indicadores.maisAcertada &&
            indicadores.maisAcertada.id !== indicadores.maisErrada?.id && (
              <div className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                  ✅ Questão mais acertada
                </p>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {indicadores.maisAcertada.pergunta}
                </p>
                <p className="mt-1 text-sm text-emerald-900">
                  {indicadores.maisAcertada.percentual}% de acerto.
                </p>
              </div>
            )}

          {classificacao.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                Classificação completa
              </h3>
              {/* Aqui o Admin vê todo mundo: o recorte do Top N é da tela do
                  colaborador, não da gestão. */}
              <TabelaRodada linhas={classificacao} euId="" />
            </div>
          )}
        </section>
      )}

      {/* ---- Dados da rodada ---- */}
      {podeEditar && (
        <details className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer p-4 font-semibold text-slate-800">
            ✏️ Editar dados da rodada
          </summary>
          <form
            action={atualizarRodada}
            className="space-y-3 border-t border-slate-100 p-4"
          >
            <input type="hidden" name="id" value={rodada.id} />

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Nome
              </label>
              <input name="nome" defaultValue={rodada.nome} className={ENTRADA} />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Pilar
                </label>
                <select
                  name="pilar"
                  defaultValue={rodada.pilar ?? ""}
                  className={ENTRADA}
                >
                  <option value="">— sem pilar —</option>
                  {pilares.map((p) => (
                    <option key={p.id} value={p.nome}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-28">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Perguntas
                </label>
                <input
                  name="total_perguntas"
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={rodada.totalPerguntas}
                  className={ENTRADA}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Atividade
              </label>
              <input
                name="atividade"
                defaultValue={rodada.atividade ?? ""}
                className={ENTRADA}
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Abre em
                </label>
                <input
                  name="inicio"
                  type="date"
                  defaultValue={rodada.inicio}
                  className={ENTRADA}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Fecha em
                </label>
                <input
                  name="fim"
                  type="date"
                  defaultValue={rodada.fim}
                  className={ENTRADA}
                />
              </div>
            </div>

            <BotaoEnviar
              textoEnviando="Salvando..."
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Salvar alterações
            </BotaoEnviar>
          </form>
        </details>
      )}

      {/* ---- Perguntas ---- */}
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Perguntas desta rodada
      </h2>

      {questoes.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhuma pergunta ainda. Cadastre abaixo, ou importe uma lista pronta.
        </p>
      ) : (
        <div className="space-y-2">
          {questoes.map((q, i) => (
            <div
              key={q.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-2">
                <span className="text-sm font-bold text-slate-400">
                  {i + 1}.
                </span>
                <p className="flex-1 text-sm font-semibold text-slate-900">
                  {q.pergunta}
                </p>
              </div>

              <ul className="mt-2 space-y-1 pl-6 text-sm">
                {q.alternativas.map((a, j) => (
                  <li
                    key={a.id}
                    className={
                      a.correta
                        ? "font-semibold text-emerald-700"
                        : "text-slate-600"
                    }
                  >
                    {letra(j)}) {a.texto} {a.correta && "✔"}
                  </li>
                ))}
              </ul>

              {q.explicacao && (
                <p className="mt-2 rounded-lg bg-slate-50 p-2.5 pl-3 text-xs text-slate-600">
                  <span className="font-semibold">Explicação:</span>{" "}
                  {q.explicacao}
                </p>
              )}

              {/* O trecho é a conferência: a resposta acima bate com o que
                  o padrão diz aqui? Se não bater, a pergunta foi inventada
                  e deve ser corrigida ou excluída antes de publicar. */}
              {q.origemTrecho && (
                <details className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 pl-3">
                  <summary
                    className="cursor-pointer text-xs font-semibold text-amber-900"
                    title="Passagem copiada do arquivo do padrão que comprova a resposta certa — confira se ela realmente sustenta o que a pergunta afirma."
                  >
                    📄 Trecho do padrão que sustenta a resposta
                  </summary>
                  <p className="mt-2 border-l-2 border-amber-300 pl-3 text-xs italic leading-relaxed text-slate-700">
                    {q.origemTrecho}
                  </p>
                </details>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${corDificuldade(q.dificuldade)}`}
                >
                  {rotuloDificuldade(q.dificuldade)}
                </span>
                {q.status === "inativa" && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-600">
                    Desativada
                  </span>
                )}
                {q.vezesUsada > 0 && (
                  <span className="text-slate-500">
                    {q.acertos} acertos · {q.erros} erros
                  </span>
                )}

                {podeEditar && (
                  <div className="ml-auto flex flex-wrap gap-2">
                    <form action={alternarStatusQuestao}>
                      <input type="hidden" name="rodada_id" value={rodada.id} />
                      <input type="hidden" name="questao_id" value={q.id} />
                      <input type="hidden" name="status" value={q.status} />
                      <BotaoEnviar
                        textoEnviando="..."
                        title={
                          q.status === "ativa"
                            ? "Tira a pergunta de circulação em rodadas futuras, sem apagar. Ela continua no banco e pode ser reativada depois."
                            : "Volta a pergunta a ficar disponível para novas rodadas."
                        }
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        {q.status === "ativa" ? "Desativar" : "Ativar"}
                      </BotaoEnviar>
                    </form>

                    {rascunho && (
                      <BotaoExcluir
                        action={removerDaRodada}
                        campos={{ rodada_id: rodada.id, questao_id: q.id }}
                        confirmacao="Tirar esta pergunta da rodada? Ela continua no banco."
                        textoEnviando="Tirando..."
                        title="Remove a pergunta só desta rodada. Ela continua ativa no banco, disponível para outras rodadas."
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Tirar da rodada
                      </BotaoExcluir>
                    )}

                    {podeExcluir && q.vezesUsada === 0 && (
                      <BotaoExcluir
                        action={excluirQuestao}
                        campos={{ rodada_id: rodada.id, questao_id: q.id }}
                        confirmacao="Excluir esta pergunta do banco? Não dá para desfazer."
                        title="Apaga a pergunta e suas alternativas em definitivo. Só é possível enquanto ela nunca foi usada em nenhuma rodada."
                      >
                        Excluir
                      </BotaoExcluir>
                    )}
                  </div>
                )}
              </div>

              {/* Editar só em rascunho: trocar as alternativas apaga e
                  recria as linhas, e a resposta já dada apontaria para
                  uma alternativa que deixou de existir. */}
              {podeEditar && rascunho && (
                <details className="mt-3 border-t border-slate-100 pt-3">
                  <summary
                    className="cursor-pointer text-xs font-semibold text-primary"
                    title="Abre o formulário para alterar o texto, as alternativas, a dificuldade ou a explicação desta pergunta."
                  >
                    ✏️ Editar esta pergunta
                  </summary>
                  <form action={editarQuestao} className="mt-3 space-y-3">
                    <input type="hidden" name="rodada_id" value={rodada.id} />
                    <input type="hidden" name="questao_id" value={q.id} />

                    <textarea
                      name="pergunta"
                      required
                      rows={2}
                      defaultValue={q.pergunta}
                      className={ENTRADA}
                    />

                    <div className="flex gap-2">
                      <select
                        name="tipo"
                        defaultValue={q.tipo}
                        className={ENTRADA}
                      >
                        {TIPOS_QUESTAO.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.rotulo}
                          </option>
                        ))}
                      </select>
                      <select
                        name="dificuldade"
                        defaultValue={q.dificuldade}
                        className={ENTRADA}
                      >
                        {DIFICULDADES.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.rotulo}
                          </option>
                        ))}
                      </select>
                    </div>

                    <fieldset>
                      <legend className="mb-1 text-xs font-medium text-slate-600">
                        Alternativas — marque a correta
                      </legend>
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="mb-2 flex items-center gap-2">
                          <input
                            type="radio"
                            name="correta"
                            value={i}
                            defaultChecked={q.alternativas[i]?.correta ?? false}
                            aria-label={`Alternativa ${letra(i)} é a correta`}
                            className="h-4 w-4 shrink-0 border-slate-300 text-primary"
                          />
                          <span className="w-4 text-xs font-bold text-slate-500">
                            {letra(i)}
                          </span>
                          <input
                            name={`alternativa_${i}`}
                            required={i < 2}
                            defaultValue={q.alternativas[i]?.texto ?? ""}
                            className={ENTRADA}
                          />
                        </div>
                      ))}
                    </fieldset>

                    <textarea
                      name="explicacao"
                      required
                      rows={2}
                      defaultValue={q.explicacao}
                      className={ENTRADA}
                    />

                    <BotaoEnviar
                      textoEnviando="Salvando..."
                      className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
                    >
                      Salvar pergunta
                    </BotaoEnviar>
                  </form>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---- Cadastro de perguntas ---- */}
      {podeCriar && rascunho && (
        <>
          {/* Geração a partir do próprio padrão */}
          <div className="mt-4 rounded-2xl border border-primary bg-primary-soft p-4">
            <h3 className="font-semibold text-primary-dark">
              ✨ Gerar perguntas a partir do padrão
            </h3>

            {!iaConfigurada() ? (
              <p className="mt-2 text-sm text-slate-600">
                Não configurado. Falta a variável{" "}
                <code className="rounded bg-white px-1">ANTHROPIC_API_KEY</code>{" "}
                no ambiente (Vercel e .env.local).
              </p>
            ) : !rodada.padraoId ? (
              <p className="mt-2 text-sm text-slate-600">
                Esta rodada não tem padrão escolhido — é dele que as perguntas
                saem. Defina em &quot;Editar dados da rodada&quot;.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  Lê o arquivo de{" "}
                  <span className="font-medium">{rodada.padraoNome}</span> e
                  escreve as perguntas a partir dele — e só dele. Cada pergunta
                  vem com o <span className="font-medium">trecho do padrão</span>{" "}
                  que prova a resposta, para você conferir antes de publicar.
                  Funciona com DOCX e PDF.
                </p>

                <form
                  action={gerarComIA}
                  className="mt-3 flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="rodada_id" value={rodada.id} />
                  <div className="w-32">
                    <label
                      htmlFor="qtd-ia"
                      className="mb-1 block text-xs font-medium text-slate-600"
                    >
                      Quantas
                    </label>
                    <select
                      id="qtd-ia"
                      name="quantidade"
                      defaultValue={Math.min(Math.max(faltam, 1), 10)}
                      className={ENTRADA}
                    >
                      {[3, 5, 8, 10].map((n) => (
                        <option key={n} value={n}>
                          {n} perguntas
                        </option>
                      ))}
                    </select>
                  </div>
                  <BotaoEnviar
                    textoEnviando="Lendo o padrão e escrevendo..."
                    className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
                  >
                    Gerar
                  </BotaoEnviar>
                </form>

                <p className="mt-2 text-xs text-slate-500">
                  Leva de 30 segundos a 2 minutos. Nada é publicado: as
                  perguntas entram nesta rodada em rascunho, para você revisar,
                  editar ou excluir.
                </p>
              </>
            )}
          </div>

          <details className="mt-2 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer p-4 font-semibold text-slate-800">
              ➕ Nova pergunta
            </summary>
            <form
              action={criarQuestao}
              className="space-y-3 border-t border-slate-100 p-4"
            >
              <input type="hidden" name="rodada_id" value={rodada.id} />

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Pergunta
                </label>
                <textarea
                  name="pergunta"
                  required
                  rows={3}
                  className={ENTRADA}
                  placeholder="O que deve ser conferido antes de iniciar o carregamento?"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Tipo
                  </label>
                  <select name="tipo" defaultValue="multipla" className={ENTRADA}>
                    {TIPOS_QUESTAO.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-32">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Dificuldade
                  </label>
                  <select
                    name="dificuldade"
                    defaultValue="media"
                    className={ENTRADA}
                  >
                    {DIFICULDADES.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <fieldset>
                <legend className="mb-1 block text-xs font-medium text-slate-600">
                  Alternativas — marque a correta
                </legend>
                <p className="mb-2 text-xs text-slate-400">
                  Deixe em branco as que não usar. Para verdadeiro ou falso,
                  preencha só as duas primeiras.
                </p>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="mb-2 flex items-center gap-2">
                    <input
                      type="radio"
                      name="correta"
                      value={i}
                      defaultChecked={i === 0}
                      aria-label={`Alternativa ${letra(i)} é a correta`}
                      className="h-4 w-4 shrink-0 border-slate-300 text-primary"
                    />
                    <span className="w-4 text-xs font-bold text-slate-500">
                      {letra(i)}
                    </span>
                    <input
                      name={`alternativa_${i}`}
                      required={i < 2}
                      className={ENTRADA}
                    />
                  </div>
                ))}
              </fieldset>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Explicação da resposta
                </label>
                <textarea
                  name="explicacao"
                  required
                  rows={2}
                  className={ENTRADA}
                  placeholder="Aparece logo depois da resposta, certa ou errada. É o que faz a pessoa aprender na hora."
                />
              </div>

              <BotaoEnviar
                textoEnviando="Salvando..."
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Adicionar pergunta
              </BotaoEnviar>
            </form>
          </details>

          <details className="mt-2 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer p-4 font-semibold text-slate-800">
              📥 Importar várias de uma vez
            </summary>
            <form
              action={importarQuestoes}
              className="space-y-3 border-t border-slate-100 p-4"
            >
              <input type="hidden" name="rodada_id" value={rodada.id} />

              <p className="text-xs leading-relaxed text-slate-600">
                Use quando as perguntas forem preparadas fora do app — inclusive
                com ajuda de IA a partir do arquivo do padrão. O app não inventa
                procedimento: quem confere se a resposta bate com o padrão é
                você, antes de colar aqui.
              </p>

              <details className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <summary className="cursor-pointer font-semibold">
                  Ver o formato esperado
                </summary>
                <pre className="mt-2 overflow-x-auto text-[11px] leading-relaxed">
{`[
  {
    "pergunta": "O que conferir antes de iniciar o carregamento?",
    "tipo": "multipla",
    "dificuldade": "media",
    "alternativas": [
      "Conferir o mapa de carga e o lacre",
      "Conferir apenas a placa",
      "Nada, é do conferente",
      "Só o horário"
    ],
    "correta": 0,
    "explicacao": "O padrão exige a conferência do mapa e do lacre antes de começar."
  }
]`}
                </pre>
                <p className="mt-2">
                  <span className="font-semibold">correta</span> é a posição na
                  lista, começando em 0. Tipos aceitos: multipla, vf, situacao,
                  procedimento.
                </p>
              </details>

              <textarea
                name="json"
                rows={8}
                required
                className={`${ENTRADA} font-mono text-xs`}
                placeholder="Cole aqui a lista em JSON"
              />

              <BotaoEnviar
                textoEnviando="Importando..."
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                Importar
              </BotaoEnviar>
            </form>
          </details>

          {banco.length > 0 && (
            <details className="mt-2 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer p-4 font-semibold text-slate-800">
                📚 Trazer do banco ({banco.length} disponíveis)
              </summary>
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {banco.map((q) => (
                  <div key={q.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-800">
                        {q.pergunta}
                      </p>
                      <p className="text-xs text-slate-500">
                        {rotuloDificuldade(q.dificuldade)}
                        {q.padrao_nome ? ` · ${q.padrao_nome}` : ""}
                        {q.vezes_usada > 0
                          ? ` · usada ${q.vezes_usada}×`
                          : " · nunca usada"}
                      </p>
                    </div>
                    <form action={adicionarDoBanco}>
                      <input type="hidden" name="rodada_id" value={rodada.id} />
                      <input type="hidden" name="questao_id" value={q.id} />
                      <BotaoEnviar
                        textoEnviando="..."
                        className="shrink-0 rounded-lg bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-white"
                      >
                        Trazer
                      </BotaoEnviar>
                    </form>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Cada pergunta vale {PONTOS_POR_QUESTAO} pontos. Esta rodada vale{" "}
        {rodada.totalPerguntas * PONTOS_POR_QUESTAO} pontos no total.
      </p>
    </div>
  );
}

function Indicador({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className="text-xl font-bold tabular-nums text-slate-900">{valor}</p>
      <p className="text-xs leading-tight text-slate-500">{rotulo}</p>
    </div>
  );
}
