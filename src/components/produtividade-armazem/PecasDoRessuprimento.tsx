import { BotaoEnviar } from "@/components/BotaoEnviar";
import { ROTULO_TURNO, TURNOS, formatarDataHora } from "@/lib/produtividade-armazem";
import {
  ROTULO_UNIDADE_ABASTECIMENTO_CURTO,
  TIPO_ABASTECIMENTO,
  ehTipoAbastecimento,
  formatarHl,
  formatarMinutos,
} from "@/lib/abastecimento";
import {
  ROTULO_ESTADO,
  ROTULO_PRIORIDADE,
  estadoDe,
  minutosParadaAgora,
  type Ressuprimento,
} from "@/lib/ressuprimento";
import {
  aceitarSolicitacao,
  cancelarSolicitacao,
  entregarItem,
  entregarTudo,
  iniciarAbastecimentoDaSolicitacao,
} from "@/app/produtividade-armazem/abastecimento/ressuprimento-actions";

/**
 * UM CARTÃO POR PEDIDO, DO COMEÇO AO FIM.
 *
 * A primeira versão desta tela (02/09/2026) espalhava o pedido por três
 * abas -- Solicitar, Fila e Lançar -- e ele PULAVA de uma para a outra
 * conforme mudava de estado. O dono testou e o registro mostrou o
 * estrago: criou às 16:34:48, aceitou às 16:35:05, marcou a entrega às
 * 16:35:16 e depois abriu a tela catorze vezes entre 16:52 e 16:59,
 * procurando o pedido. Ele tinha ido para outra aba, e nada na tela dizia
 * isso.
 *
 * O conserto não é uma mensagem avisando para onde o cartão foi: é o
 * cartão não ir a lugar nenhum. Ele fica onde está, do pedido à
 * finalização, e mostra UM botão de cada vez -- o da próxima ação, para
 * quem pode fazê-la agora. Quem não pode lê, em uma linha, de quem a bola
 * está.
 */
export function CartaoDoPedido({
  r,
  agora,
  euId,
  podeTransportar,
  podeAbastecer,
  temSessaoAberta,
  nomeDoProduto,
  turnoSugerido,
}: {
  r: Ressuprimento & { observacao?: string | null; motivo?: string | null };
  agora: Date;
  euId: string;
  podeTransportar: boolean;
  podeAbastecer: boolean;
  /** Já tem um abastecimento correndo? Então não pode começar outro. */
  temSessaoAberta: boolean;
  nomeDoProduto: (id: string) => string;
  turnoSugerido: string;
}) {
  const estado = estadoDe(r);
  const info = ROTULO_ESTADO[estado];
  const parada = minutosParadaAgora(r, agora);
  const tipo = ehTipoAbastecimento(r.tipo) ? r.tipo : "completo";
  const meuTransporte = r.operadorId === euId;
  const faltamEntregar = r.itens.filter((i) => !i.entregueEm).length;

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        r.prioridade === "urgente" && !r.canceladoEm ? "border-red-200" : "border-slate-200"
      }`}
    >
      {/* ---- Quem, quando, em que pé está ---- */}
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            info.cor === "green"
              ? "bg-green-50 text-green-700"
              : info.cor === "blue"
                ? "bg-blue-50 text-blue-700"
                : info.cor === "amber"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-slate-100 text-slate-500"
          }`}
        >
          {info.emoji} {info.rotulo}
        </span>
        {/* O tipo muda o que se espera do relógio: uma varredura da manhã
            demora, um chamado pontual não pode demorar. */}
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          {TIPO_ABASTECIMENTO[tipo].emoji} {TIPO_ABASTECIMENTO[tipo].curto}
        </span>
        {r.prioridade === "urgente" && !r.canceladoEm && (
          <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
            🔴 Urgente
          </span>
        )}
        {/* Há quanto tempo está parada esperando a PRÓXIMA ação -- não
            desde que nasceu. Contar desde a criação faria a lista inteira
            parecer um incêndio no fim do turno. */}
        {parada !== null && parada >= 10 && (
          <span className="shrink-0 text-xs font-medium text-slate-500">
            parada há {formatarMinutos(parada)}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-right text-xs text-slate-400">
          {r.solicitanteNome} · {formatarDataHora(r.criadoEm)}
        </span>
      </div>

      {r.observacao && <p className="mb-2 text-xs text-slate-500">📝 {r.observacao}</p>}

      {/* ---- O que foi pedido ---- */}
      <ul className="space-y-1.5">
        {r.itens.map((i) => (
          <li key={i.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-slate-700">{nomeDoProduto(i.produtoId)}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-800">
              {i.quantidade}{" "}
              {ROTULO_UNIDADE_ABASTECIMENTO_CURTO[i.unidade as "caixa" | "palete"] ?? i.unidade}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatarHl(i.hl)} HL</span>
            {i.entregueEm && <span className="shrink-0 text-xs font-semibold text-green-700">✓</span>}
          </li>
        ))}
      </ul>

      {/* ---- A PRÓXIMA AÇÃO. Uma só, e só para quem pode fazê-la. ---- */}
      <div className="mt-3">
        {r.canceladoEm ? (
          <p className="text-xs text-slate-500">🚫 Cancelado. Motivo: {r.motivo}</p>
        ) : estado === "aberta" ? (
          podeTransportar ? (
            <form action={aceitarSolicitacao}>
              <input type="hidden" name="id" value={r.id} />
              <BotaoEnviar className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark">
                🏗️ Buscar isto
              </BotaoEnviar>
            </form>
          ) : (
            <p className="text-xs text-slate-500">Esperando a empilhadeira buscar.</p>
          )
        ) : estado === "em_transporte" ? (
          meuTransporte ? (
            <div className="space-y-2">
              <form action={entregarTudo}>
                <input type="hidden" name="id" value={r.id} />
                <BotaoEnviar className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark">
                  ✅ Deixei tudo na área
                </BotaoEnviar>
              </form>
              {/* O caso comum é uma viagem só, e por isso o botão de cima
                  é o grande. Marcar item a item existe para a viagem
                  dividida -- fica atrás de um toque para não competir com
                  o caminho de todo dia. */}
              {faltamEntregar > 1 && (
                <details className="rounded-xl bg-slate-50 p-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                    Vim em mais de uma viagem ({faltamEntregar} itens faltando)
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {r.itens
                      .filter((i) => !i.entregueEm)
                      .map((i) => (
                        <li key={i.id} className="flex min-w-0 items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate text-slate-700">
                            {nomeDoProduto(i.produtoId)}
                          </span>
                          <form action={entregarItem} className="shrink-0">
                            <input type="hidden" name="item_id" value={i.id} />
                            <BotaoEnviar
                              compacto
                              className="rounded-lg border border-primary px-2 py-1 text-xs font-semibold text-primary-dark hover:bg-primary-soft"
                            >
                              Deixei este
                            </BotaoEnviar>
                          </form>
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              🏗️ {r.operadorNome} está buscando. Aguarde chegar na área.
            </p>
          )
        ) : estado === "na_area" ? (
          podeAbastecer ? (
            temSessaoAberta ? (
              // Um abastecimento por vez -- o índice único do banco garante
              // isso, e oferecer o botão aqui só produziria uma mensagem
              // de erro depois do toque.
              <p className="text-xs text-slate-500">
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
                <BotaoEnviar className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark">
                  🛒 Abastecer isto
                </BotaoEnviar>
              </form>
            )
          ) : (
            <p className="text-xs text-slate-500">📍 Na área, esperando alguém abastecer.</p>
          )
        ) : estado === "abastecendo" ? (
          <p className="text-xs text-slate-500">
            🛒 {r.abastecedorNome} está abastecendo
            {r.abastecedorNome && r.itens.length > 0 ? " — o cronômetro está correndo." : "."}
          </p>
        ) : null}

        {/* Cancelar só enquanto ninguém começou a abastecer: depois disso
            o trabalho aconteceu, e apagar o pedido deixaria uma sessão
            apontando para algo que "nunca existiu". */}
        {!r.canceladoEm &&
          !r.abastecimentoInicio &&
          (r.solicitanteId === euId || meuTransporte) && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-400">Cancelar este pedido</summary>
              <form action={cancelarSolicitacao} className="mt-2 flex gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input
                  name="motivo"
                  required
                  maxLength={200}
                  placeholder="Por quê? (ex.: não tem no bloco)"
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none"
                />
                <BotaoEnviar className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                  Cancelar
                </BotaoEnviar>
              </form>
            </details>
          )}
      </div>
    </div>
  );
}

export function TempoDoCiclo({
  rotulo,
  minutos,
  destaque = false,
}: {
  rotulo: string;
  minutos: number | null;
  destaque?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] uppercase text-slate-400">{rotulo}</dt>
      <dd
        className={`truncate tabular-nums ${
          destaque ? "font-bold text-slate-800" : "font-semibold text-slate-600"
        }`}
      >
        {minutos === null ? "—" : formatarMinutos(minutos)}
      </dd>
    </div>
  );
}
