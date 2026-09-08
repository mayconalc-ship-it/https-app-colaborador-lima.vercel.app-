import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { ROTULO_TURNO, TURNOS, formatarDataHora } from "@/lib/produtividade-armazem";
import {
  ROTULO_UNIDADE_ABASTECIMENTO,
  TIPO_ABASTECIMENTO,
  ehTipoAbastecimento,
  formatarHl,
  formatarMinutos,
} from "@/lib/abastecimento";
import {
  ROTULO_ESTADO,
  estadoDe,
  minutosParadaAgora,
  type Ressuprimento,
} from "@/lib/ressuprimento";
import {
  aceitarSolicitacao,
  cancelarSolicitacao,
  editarItemDaSolicitacao,
  entregarItem,
  entregarTudo,
  excluirItemDaSolicitacao,
  excluirSolicitacao,
  iniciarAbastecimentoDaSolicitacao,
} from "@/app/produtividade-armazem/abastecimento/ressuprimento-actions";

export type ProdutoDoPedido = { codigo: string; descricao: string };

/**
 * UM CARTÃO POR PEDIDO, DO COMEÇO AO FIM.
 *
 * A primeira versão desta tela espalhava o pedido por três abas e ele
 * PULAVA de uma para a outra conforme mudava de estado. O dono testou e
 * perdeu sete minutos procurando um pedido que tinha mudado de aba
 * sozinho. Desde então o cartão fica onde está, do pedido à finalização,
 * e mostra UM botão de cada vez -- o da próxima ação, para quem pode
 * fazê-la agora. Quem não pode lê, em uma linha, de quem a bola está.
 */
export function CartaoDoPedido({
  r,
  agora,
  euId,
  podeTransportar,
  podeAbastecer,
  temSessaoAberta,
  podeExcluir,
  produtoPorId,
  turnoSugerido,
}: {
  r: Ressuprimento & { observacao?: string | null; motivo?: string | null };
  agora: Date;
  euId: string;
  podeTransportar: boolean;
  podeAbastecer: boolean;
  /** Já tem um abastecimento correndo? Então não pode começar outro. */
  temSessaoAberta: boolean;
  /**
   * Pode APAGAR o pedido: a liderança com "produtividade-armazem:excluir"
   * (o engano dos outros) ou a própria pessoa no pedido dela (o engano
   * próprio) -- a mesma regra do abastecimento e do reepack.
   */
  podeExcluir: boolean;
  /**
   * Código e descrição, separados -- não uma string só.
   *
   * O empilhador precisa CONFERIR o que pega no bloco, e "10175 — ANTARCTICA
   * SUBZERO LT 473ML SH C/12" numa linha truncada vira "10175 — ANTARC...".
   * O código é o que ele lê na etiqueta do palete; a descrição é a
   * conferência. Os dois precisam caber.
   */
  produtoPorId: Map<string, ProdutoDoPedido>;
  turnoSugerido: string;
}) {
  const estado = estadoDe(r);
  const info = ROTULO_ESTADO[estado];
  const parada = minutosParadaAgora(r, agora);
  const tipo = ehTipoAbastecimento(r.tipo) ? r.tipo : "completo";
  const meuTransporte = r.operadorId === euId;
  const pendentes = r.itens.filter((i) => !i.entregueEm);
  const entregues = r.itens.length - pendentes.length;

  /*
    QUEM CORRIGE OS ITENS: quem pediu, quem está transportando, ou a
    liderança. As duas primeiras porque são as duas que descobrem o erro --
    quem pediu errou o número, e quem transporta é quem chega no bloco e vê
    que o produto não existe ou que saiu quantidade diferente.

    Só até virar abastecimento: dali em diante os itens já foram copiados
    para a sessão, e mexer aqui faria as duas telas contarem histórias
    diferentes sobre o mesmo palete. A ação de servidor recusa igual --
    esconder o botão é cortesia, não é a regra.
  */
  const podeMexerNosItens =
    !r.canceladoEm &&
    !r.abastecimentoInicio &&
    (podeExcluir || r.solicitanteId === euId || meuTransporte);

  // A cor do cartão acompanha a etapa. Verde quando alguém já está
  // abastecendo -- pedido do dono: o trabalho mudou de mãos, e a tela
  // precisa dizer isso sem obrigar a ler o texto.
  const moldura =
    estado === "abastecendo"
      ? "border-green-300 bg-green-50"
      : estado === "na_area"
        ? "border-amber-300 bg-amber-50"
        : estado === "em_transporte"
          ? "border-blue-200 bg-blue-50/60"
          : r.prioridade === "urgente" && !r.canceladoEm
            ? "border-red-200 bg-white"
            : "border-slate-200 bg-white";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${moldura}`}>
      {/* ---- Linha 1: em que pé está ---- */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            info.cor === "green"
              ? "bg-green-100 text-green-800"
              : info.cor === "blue"
                ? "bg-blue-100 text-blue-800"
                : info.cor === "amber"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-600"
          }`}
        >
          {info.emoji} {info.rotulo}
        </span>
        <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
          {TIPO_ABASTECIMENTO[tipo].emoji} {TIPO_ABASTECIMENTO[tipo].curto}
        </span>
        {r.prioridade === "urgente" && !r.canceladoEm && (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
            🔴 Urgente
          </span>
        )}
      </div>

      {/* ---- Linha 2: quem pediu, quando, e há quanto tempo está parado ----
          Em linha PRÓPRIA, não espremida ao lado das etiquetas. Antes o
          nome e a hora dividiam a linha com três etiquetas e o tempo saía
          cortado -- justamente o número que diz se o pedido está atrasado. */}
      <p className="mb-3 text-xs text-slate-500">
        Pedido por <span className="font-semibold text-slate-700">{r.solicitanteNome}</span> às{" "}
        <span className="font-semibold tabular-nums text-slate-700">{formatarDataHora(r.criadoEm)}</span>
        {parada !== null && parada >= 10 && (
          <>
            {" · "}
            <span className={`font-bold ${parada >= 60 ? "text-red-700" : "text-slate-700"}`}>
              parado há {formatarMinutos(parada)}
            </span>
          </>
        )}
      </p>

      {r.observacao && (
        <p className="mb-2 rounded-lg bg-white/70 p-2 text-xs text-slate-600 ring-1 ring-slate-200">
          📝 {r.observacao}
        </p>
      )}

      {/* ---- O que foi pedido, item a item ----
          Duas linhas por item: o CÓDIGO em destaque (é o que está na
          etiqueta do palete) e a descrição embaixo, inteira. Quantidade e
          unidade grandes à direita, porque é o que o empilhador confere
          antes de sair do bloco. */}
      <ul className="space-y-1.5">
        {r.itens.map((i) => {
          const p = produtoPorId.get(i.produtoId);
          const entregue = Boolean(i.entregueEm);
          return (
            <li
              key={i.id}
              // `relative` para o painel de correção abrir ancorado NESTE
              // item. Sem ele, o `absolute` sobe até o primeiro ancestral
              // posicionado -- que é a página -- e o painel do terceiro
              // item aparece em cima do primeiro.
              className={`relative flex min-w-0 items-center gap-3 rounded-xl p-2.5 ring-1 ${
                entregue ? "bg-green-50 ring-green-200" : "bg-white ring-slate-200"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-bold text-slate-700">
                    {p?.codigo ?? "?"}
                  </span>
                  {entregue && (
                    <span className="shrink-0 text-xs font-bold text-green-700">✓ na área</span>
                  )}
                </p>
                <p className="mt-1 text-sm leading-snug text-slate-700">
                  {p?.descricao ?? "produto não encontrado"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold leading-none tabular-nums text-slate-900">
                  {i.quantidade}
                </p>
                <p className="text-xs text-slate-500">
                  {(ROTULO_UNIDADE_ABASTECIMENTO[i.unidade as "caixa" | "palete"] ?? i.unidade).toLowerCase()}
                  {i.quantidade > 1 ? "s" : ""}
                </p>
                <p className="text-[11px] tabular-nums text-slate-400">{formatarHl(i.hl)} HL</p>
              </div>

              {/*
                CORRIGIR E TIRAR O ITEM (08/09/2026, pedido do dono).

                Recolhido atrás do ✏️, e não dois botões soltos na linha:
                o item é lido dezenas de vezes por dia -- pelo empilhador
                no bloco, pelo ajudante conferindo -- e corrigido de vez em
                quando. O que se lê fica visível; o que se faz raramente
                fica a um toque.
              */}
              {podeMexerNosItens && (
                <details className="shrink-0">
                  <summary className="cursor-pointer list-none rounded-lg px-2 py-1.5 text-slate-400 ring-1 ring-slate-200 hover:bg-slate-50 marker:content-none [&::-webkit-details-marker]:hidden">
                    ✏️
                  </summary>
                  <div className="absolute right-2 top-full z-10 mt-1 w-60 max-w-[calc(100vw-3rem)] space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                    <form action={editarItemDaSolicitacao} className="space-y-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="item_id" value={i.id} />
                      <p className="text-[11px] font-semibold uppercase text-slate-500">
                        Corrigir a quantidade
                      </p>
                      <div className="flex gap-1.5">
                        <input
                          name="quantidade"
                          inputMode="decimal"
                          defaultValue={i.quantidade}
                          required
                          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                        />
                        <select
                          name="unidade"
                          defaultValue={i.unidade}
                          className="shrink-0 rounded-lg border border-slate-300 px-1.5 py-1.5 text-sm"
                        >
                          <option value="caixa">caixa</option>
                          <option value="palete">palete</option>
                        </select>
                      </div>
                      <BotaoEnviar
                        compacto
                        className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-dark"
                      >
                        Salvar
                      </BotaoEnviar>
                    </form>

                    {/* Item entregue não sai: é movimento que aconteceu. A
                        correção dele é a quantidade, acima. */}
                    {entregue ? (
                      <p className="border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-400">
                        Já entregue na área — para acertar o que chegou, corrija a quantidade.
                      </p>
                    ) : (
                      <div className="border-t border-slate-100 pt-2">
                        <BotaoExcluir
                          action={excluirItemDaSolicitacao}
                          campos={{ id: r.id, item_id: i.id }}
                          confirmacao={`Tirar ${p?.descricao ?? "este item"} do pedido?`}
                          rotuloConfirmar="Tirar do pedido"
                          className="w-full rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          🗑️ Não tem no estoque — tirar
                        </BotaoExcluir>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </li>
          );
        })}
      </ul>

      {/* ---- A PRÓXIMA AÇÃO. Uma só, e só para quem pode fazê-la. ---- */}
      <div className="mt-3">
        {r.canceladoEm ? (
          <p className="text-xs text-slate-500">🚫 Cancelado. Motivo: {r.motivo}</p>
        ) : estado === "aberta" ? (
          podeTransportar ? (
            <form action={aceitarSolicitacao}>
              <input type="hidden" name="id" value={r.id} />
              <BotaoEnviar className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-white hover:bg-primary-dark">
                🏗️ Vou buscar este pedido no estoque
              </BotaoEnviar>
            </form>
          ) : (
            <p className="text-xs text-slate-500">⏳ Esperando uma empilhadeira pegar.</p>
          )
        ) : estado === "em_transporte" ? (
          meuTransporte ? (
            <div className="space-y-2">
              {/*
                O botão grande fecha a entrega inteira -- é o caso comum,
                uma viagem só.

                Os botões por item ficam SEMPRE disponíveis enquanto
                sobrar item. Antes eles só apareciam com mais de um
                pendente (`faltamEntregar > 1`), e o efeito era o defeito
                que o dono encontrou: com dois itens, ao marcar o primeiro
                a lista sumia e não dava para marcar o segundo. Um por um
                até o fim, ou o botão grande de uma vez.
              */}
              <form action={entregarTudo}>
                <input type="hidden" name="id" value={r.id} />
                <BotaoEnviar className="w-full rounded-xl bg-green-600 px-4 py-3.5 text-sm font-bold text-white hover:bg-green-700">
                  🏁 Terminei — deixei tudo na área
                </BotaoEnviar>
              </form>

              {pendentes.length > 0 && (
                <details open={entregues > 0} className="rounded-xl bg-white/70 p-2 ring-1 ring-slate-200">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                    Vim em mais de uma viagem — marcar item por item
                    <span className="ml-1 font-normal text-slate-400">
                      ({entregues} de {r.itens.length} entregues)
                    </span>
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {pendentes.map((i) => {
                      const p = produtoPorId.get(i.produtoId);
                      return (
                        <li key={i.id} className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 text-xs leading-snug text-slate-700">
                            <span className="font-mono font-bold">{p?.codigo}</span>{" "}
                            {p?.descricao}
                          </span>
                          <form action={entregarItem} className="shrink-0">
                            <input type="hidden" name="item_id" value={i.id} />
                            <BotaoEnviar
                              compacto
                              className="rounded-lg border border-green-300 bg-green-50 px-2.5 py-1.5 text-xs font-bold text-green-800 hover:bg-green-100"
                            >
                              Deixei este
                            </BotaoEnviar>
                          </form>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              🏗️ <strong>{r.operadorNome}</strong> está buscando. Aguarde chegar na área.
            </p>
          )
        ) : estado === "na_area" ? (
          podeAbastecer ? (
            temSessaoAberta ? (
              // Um abastecimento por vez -- o índice único do banco garante
              // isso, e oferecer o botão aqui só produziria uma mensagem
              // de erro depois do toque.
              <p className="text-xs text-slate-600">
                Finalize o abastecimento que já está aberto, aí este libera.
              </p>
            ) : (
              <form action={iniciarAbastecimentoDaSolicitacao} className="flex gap-2">
                <input type="hidden" name="id" value={r.id} />
                <select
                  name="turno"
                  defaultValue={turnoSugerido}
                  aria-label="Turno"
                  className="w-auto rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
                >
                  {TURNOS.map((t) => (
                    <option key={t} value={t}>{ROTULO_TURNO[t]}</option>
                  ))}
                </select>
                <BotaoEnviar className="flex-1 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-white hover:bg-primary-dark">
                  🏬 Levar para o picking
                </BotaoEnviar>
              </form>
            )
          ) : (
            <p className="text-xs text-slate-600">📍 Na área, esperando alguém levar ao picking.</p>
          )
        ) : estado === "abastecendo" ? (
          <p className="text-xs font-medium text-green-800">
            🏬 <strong>{r.abastecedorNome}</strong> está abastecendo o picking — cronômetro correndo.
          </p>
        ) : null}

        {/* Cancelar e excluir NÃO são a mesma coisa, e a gaveta diz isso.
            Cancelar é um fato da operação (pediu, desistiu, conta no
            indicador); excluir diz que o pedido nunca devia ter existido.

            EXCLUIR VALE EM QUALQUER ETAPA -- pedido do dono (03/09/2026).
            A gaveta inteira sumia assim que o abastecimento começava, e
            era justamente aí que ele precisava dela: o teste que ele
            queria eliminar já tinha andado. Cancelar continua restrito ao
            que ainda não começou, porque cancelar no meio do
            abastecimento não descreve nada que aconteça na operação. */}
        {!r.canceladoEm &&
          (r.solicitanteId === euId || meuTransporte || podeExcluir) && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-400">
                {r.abastecimentoInicio
                  ? "Excluir este pedido"
                  : "Cancelar ou excluir este pedido"}
              </summary>

              {!r.abastecimentoInicio && (r.solicitanteId === euId || meuTransporte) && (
                <>
                  <p className="mt-2 text-xs text-slate-500">
                    <strong>Cancelar</strong> guarda o pedido com o motivo — foi um pedido de
                    verdade que não deu certo.
                  </p>
                  <form action={cancelarSolicitacao} className="mt-1 flex gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      name="motivo"
                      required
                      maxLength={200}
                      placeholder="Por quê? (ex.: não tem no bloco)"
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
                    />
                    <BotaoEnviar className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                      Cancelar
                    </BotaoEnviar>
                  </form>
                </>
              )}

              {podeExcluir && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-1 text-xs text-slate-500">
                    <strong>Excluir</strong> apaga de vez, sem deixar rastro no indicador — é para
                    teste e engano.
                    {r.abastecimentoInicio && (
                      <> O abastecimento já lançado sai junto.</>
                    )}
                  </p>
                  <BotaoExcluir
                    action={excluirSolicitacao}
                    campos={{ id: r.id }}
                    confirmacao={
                      r.abastecimentoInicio
                        ? "Excluir este pedido, os itens e o abastecimento dele? A atividade some inteira, e não dá para desfazer."
                        : "Excluir este pedido e os itens dele? Não dá para desfazer."
                    }
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    🗑️ Excluir o pedido
                  </BotaoExcluir>
                </div>
              )}
            </details>
          )}
      </div>
    </div>
  );
}

/**
 * Os tempos do ciclo, um bloco por etapa.
 *
 * Duas colunas no celular, cinco no computador. Antes eram cinco em
 * qualquer largura, e em 375px cada rótulo virava "Espera empi..." -- o
 * dono reclamou que "está cortando e ruim para verificar". Rótulo curto
 * que não se lê não informa nada.
 */
export function TemposDoPedido({
  itens,
}: {
  itens: { rotulo: string; minutos: number | null; destaque?: boolean }[];
}) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-white/70 p-3 ring-1 ring-slate-200 sm:grid-cols-5">
      {itens.map((t) => (
        <div key={t.rotulo} className="min-w-0">
          <dt className="text-[10px] uppercase leading-tight text-slate-400">{t.rotulo}</dt>
          <dd
            className={`tabular-nums ${
              t.destaque ? "text-base font-bold text-slate-900" : "text-sm font-semibold text-slate-600"
            }`}
          >
            {t.minutos === null ? "—" : formatarMinutos(t.minutos)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
