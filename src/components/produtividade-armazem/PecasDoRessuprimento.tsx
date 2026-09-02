import { BotaoEnviar } from "@/components/BotaoEnviar";
import { formatarDataHora } from "@/lib/produtividade-armazem";
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
  entregarItem,
  entregarTudo,
} from "@/app/produtividade-armazem/abastecimento/ressuprimento-actions";

/**
 * As peças da solicitação, fora da tela do Abastecimento.
 *
 * Ficam aqui porque a tela já tinha 800 linhas antes do ressuprimento
 * entrar nela -- e o que decide o tamanho de um arquivo não é a regra,
 * é a chance de alguém achar o pedaço que precisa mudar.
 *
 * São componentes de SERVIDOR: os formulários chamam Server Actions
 * direto, sem estado de cliente nenhum.
 */

export function CabecalhoDaSolicitacao({
  r,
  agora,
}: {
  r: Ressuprimento;
  agora: Date;
}) {
  const info = ROTULO_ESTADO[estadoDe(r)];
  const parada = minutosParadaAgora(r, agora);
  const tipo = ehTipoAbastecimento(r.tipo) ? r.tipo : "completo";

  return (
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

      {/* O tipo vem junto do estado porque muda o que se espera do tempo:
          uma varredura da manhã demora, um chamado pontual não pode
          demorar. Sem ele, a mesma duração parece boa ou ruim conforme
          quem olha. */}
      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
        {TIPO_ABASTECIMENTO[tipo].emoji} {TIPO_ABASTECIMENTO[tipo].curto}
      </span>

      {r.prioridade === "urgente" && !r.canceladoEm && (
        <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
          {ROTULO_PRIORIDADE.urgente.emoji} Urgente
        </span>
      )}

      {/* Há quanto tempo está PARADA esperando a próxima ação -- não desde
          que nasceu. Contar desde a criação faria a fila inteira parecer
          um incêndio no fim do turno. */}
      {parada !== null && parada >= 10 && (
        <span className="shrink-0 text-xs font-medium text-slate-500">
          parada há {formatarMinutos(parada)}
        </span>
      )}

      <span className="min-w-0 flex-1 truncate text-right text-xs text-slate-400">
        {r.solicitanteNome} · {formatarDataHora(r.criadoEm)}
      </span>
    </div>
  );
}

export function ItensDaSolicitacao({
  r,
  nomeDoProduto,
  comEntrega = false,
}: {
  r: Ressuprimento;
  nomeDoProduto: (id: string) => string;
  comEntrega?: boolean;
}) {
  return (
    <ul className="space-y-1.5">
      {r.itens.map((i) => (
        <li key={i.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-slate-700">{nomeDoProduto(i.produtoId)}</span>
          <span className="shrink-0 font-semibold tabular-nums text-slate-800">
            {i.quantidade} {ROTULO_UNIDADE_ABASTECIMENTO_CURTO[i.unidade as "caixa" | "palete"] ?? i.unidade}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatarHl(i.hl)} HL</span>
          {comEntrega &&
            (i.entregueEm ? (
              <span className="shrink-0 text-xs font-semibold text-green-700">✓ na área</span>
            ) : (
              <form action={entregarItem} className="shrink-0">
                <input type="hidden" name="item_id" value={i.id} />
                <BotaoEnviar
                  compacto
                  className="rounded-lg border border-primary px-2 py-1 text-xs font-semibold text-primary-dark hover:bg-primary-soft"
                >
                  Entreguei
                </BotaoEnviar>
              </form>
            ))}
        </li>
      ))}
    </ul>
  );
}

export function CartaoTransporte({
  r,
  nomeDoProduto,
  agora,
  meu = false,
}: {
  r: Ressuprimento & { observacao?: string | null };
  nomeDoProduto: (id: string) => string;
  agora: Date;
  meu?: boolean;
}) {
  const aceita = Boolean(r.transporteInicio);

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${meu ? "border-primary" : "border-slate-200"}`}>
      <CabecalhoDaSolicitacao r={r} agora={agora} />
      {r.observacao && <p className="mb-2 text-xs text-slate-500">📝 {r.observacao}</p>}

      <ItensDaSolicitacao r={r} nomeDoProduto={nomeDoProduto} comEntrega={meu && aceita} />

      {!aceita ? (
        <form action={aceitarSolicitacao} className="mt-3">
          <input type="hidden" name="id" value={r.id} />
          <BotaoEnviar className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark">
            🏗️ Aceitar e buscar
          </BotaoEnviar>
        </form>
      ) : meu ? (
        <form action={entregarTudo} className="mt-3">
          <input type="hidden" name="id" value={r.id} />
          <BotaoEnviar className="w-full rounded-xl border border-primary bg-primary-soft px-4 py-3 text-sm font-semibold text-primary-dark hover:bg-primary-soft/70">
            ✅ Entreguei tudo na área
          </BotaoEnviar>
        </form>
      ) : (
        <p className="mt-3 text-xs text-slate-400">Em transporte com {r.operadorNome}.</p>
      )}
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
