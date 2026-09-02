import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { MontarSolicitacao } from "@/components/produtividade-armazem/MontarSolicitacao";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/sessao";
import { getRevendaId } from "@/lib/revendas";
import { temAcessoModulo } from "@/lib/require-admin";
import {
  ROTULO_TURNO,
  TURNOS,
  formatarDataHora,
  turnoAtual,
} from "@/lib/produtividade-armazem";
import {
  ROTULO_UNIDADE_ABASTECIMENTO_CURTO,
  formatarHl,
  formatarMinutos,
} from "@/lib/abastecimento";
import {
  ROTULO_ESTADO,
  ROTULO_PRIORIDADE,
  estadoDe,
  estaAberta,
  minutosParadaAgora,
  ordenarFila,
  temposDoCiclo,
  transporteFim,
  type Prioridade,
  type Ressuprimento,
} from "@/lib/ressuprimento";
import {
  aceitarSolicitacao,
  cancelarSolicitacao,
  entregarItem,
  entregarTudo,
  iniciarAbastecimentoDaSolicitacao,
} from "./actions";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";

const DIAS_DE_HISTORICO = 3;

type Aba = "solicitar" | "fila" | "abastecer" | "minhas";

const ROTULO_ABA: Record<Aba, string> = {
  solicitar: "Solicitar",
  fila: "Fila",
  abastecer: "Abastecer",
  minhas: "Minhas",
};

/** Linha do banco -> o formato puro que lib/ressuprimento entende. */
type LinhaBanco = {
  id: string;
  criado_em: string;
  solicitante_id: string;
  solicitante_nome: string;
  prioridade: string;
  turno: string;
  observacao: string | null;
  operador_id: string | null;
  operador_nome: string | null;
  transporte_inicio: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  pa_ressuprimento_itens: {
    id: string;
    produto_id: string;
    unidade: string;
    quantidade: number;
    hl_calculado: number;
    entregue_em: string | null;
  }[];
  pa_abastecimentos: { inicio: string; fim: string | null; colaborador_nome: string }[];
};

function daLinha(l: LinhaBanco): Ressuprimento & { turno: string; observacao: string | null; motivo: string | null } {
  // A sessão de abastecimento vem como array (o PostgREST não sabe que o
  // índice único garante uma só), mas é sempre no máximo uma.
  const sessao = l.pa_abastecimentos?.[0] ?? null;
  return {
    id: l.id,
    criadoEm: l.criado_em,
    solicitanteId: l.solicitante_id,
    solicitanteNome: l.solicitante_nome,
    prioridade: (l.prioridade === "urgente" ? "urgente" : "normal") as Prioridade,
    transporteInicio: l.transporte_inicio,
    operadorId: l.operador_id,
    operadorNome: l.operador_nome,
    canceladoEm: l.cancelado_em,
    itens: (l.pa_ressuprimento_itens ?? []).map((i) => ({
      id: i.id,
      produtoId: i.produto_id,
      unidade: i.unidade,
      quantidade: Number(i.quantidade),
      hl: Number(i.hl_calculado),
      entregueEm: i.entregue_em,
    })),
    abastecimentoInicio: sessao?.inicio ?? null,
    abastecimentoFim: sessao?.fim ?? null,
    abastecedorNome: sessao?.colaborador_nome ?? null,
    turno: l.turno,
    observacao: l.observacao,
    motivo: l.motivo_cancelamento,
  };
}

export default async function RessuprimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; erro?: string; sucesso?: string }>;
}) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");

  const revendaId = await getRevendaId();
  if (!revendaId) redirect("/produtividade-armazem");

  // Três papéis, três concessões que a pessoa já tem (ou não). A tela é
  // uma só e mostra o que cada um pode fazer -- exigir um módulo por
  // papel obrigaria a conceder três coisas para um fluxo que a operação
  // enxerga como um só.
  const [podeSolicitar, podeTransportar, podeAbastecer] = await Promise.all([
    temAcessoModulo("pa-ressuprimento"),
    temAcessoModulo("pa-empilhadeira"),
    temAcessoModulo("pa-picking"),
  ]);

  if (!podeSolicitar && !podeTransportar && !podeAbastecer) {
    redirect(
      `/produtividade-armazem?erro=${encodeURIComponent(
        "Você não participa do fluxo de ressuprimento do picking. Fale com o Admin.",
      )}`,
    );
  }

  const sp = await searchParams;

  const disponiveis: Aba[] = [
    ...(podeSolicitar ? (["solicitar"] as Aba[]) : []),
    ...(podeTransportar ? (["fila"] as Aba[]) : []),
    ...(podeAbastecer ? (["abastecer"] as Aba[]) : []),
    "minhas",
  ];
  const aba: Aba = disponiveis.includes(sp.aba as Aba) ? (sp.aba as Aba) : disponiveis[0];

  const desde = new Date(Date.now() - DIAS_DE_HISTORICO * 86_400_000).toISOString();
  const supabase = await createClient();

  const [{ data: pedidosBanco }, { data: produtosBanco }] = await Promise.all([
    supabase
      .from("pa_ressuprimentos")
      .select(
        "id, criado_em, solicitante_id, solicitante_nome, prioridade, turno, observacao, operador_id, operador_nome, transporte_inicio, cancelado_em, motivo_cancelamento, pa_ressuprimento_itens(id, produto_id, unidade, quantidade, hl_calculado, entregue_em), pa_abastecimentos(inicio, fim, colaborador_nome)",
      )
      .eq("revenda_id", revendaId)
      .gte("criado_em", desde)
      .order("criado_em", { ascending: false }),
    podeSolicitar
      ? supabase
          .from("pa_produtos")
          .select("id, codigo, descricao, cluster_produto, tipo, unidades_por_caixa, fator_hecto, embalagem_id, meta_reepack_hora")
          .eq("revenda_id", revendaId)
          .eq("ativo", true)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const pedidos = ((pedidosBanco ?? []) as unknown as LinhaBanco[]).map(daLinha);

  // Só o de-para de id para nome e as duas listas do filtro. O
  // ProdutoReepack completo (metas, fatores) não serve a nada nesta tela:
  // o HL já foi calculado e gravado na hora do pedido.
  const produtos = (produtosBanco ?? []) as unknown as {
    id: string;
    codigo: string;
    descricao: string;
    cluster_produto: string | null;
    tipo: string | null;
  }[];

  const produtoPorId = new Map(produtos.map((p) => [p.id, `${p.codigo} — ${p.descricao}`]));

  const clusters = [
    ...new Set(produtos.map((p) => p.cluster_produto).filter((c): c is string => Boolean(c))),
  ].sort();
  const tipos = [...new Set(produtos.map((p) => p.tipo).filter((t): t is string => Boolean(t)))].sort();

  const nomeDoProduto = (id: string) => produtoPorId.get(id) ?? "produto";

  const agora = new Date();

  const fila = ordenarFila(pedidos.filter((r) => estaAberta(r) && !transporteFim(r)));
  const naArea = pedidos.filter((r) => estadoDe(r) === "na_area");
  const minhas = pedidos.filter(
    (r) => r.solicitanteId === perfil.id || r.operadorId === perfil.id,
  );

  const aoRedor = (a: Aba) => `?aba=${a}`;

  return (
    <div>
      <PageHeader
        title="🧾 Ressuprimento do Picking"
        subtitle="Quem pede, quem leva e quem abastece — no mesmo lugar."
        fecharHref="/produtividade-armazem"
      />

      {sp.erro && (
        <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>
      )}
      {sp.sucesso && (
        <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700">{sp.sucesso}</p>
      )}

      {disponiveis.length > 1 && (
        <nav className="mb-4 flex gap-2">
          {disponiveis.map((a) => (
            <Link
              key={a}
              href={aoRedor(a)}
              className={`min-w-0 flex-1 truncate rounded-xl border py-2 text-center text-sm font-semibold ${
                a === aba
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-slate-200 text-slate-600"
              }`}
            >
              {ROTULO_ABA[a]}
              {a === "fila" && fila.length > 0 && (
                <span className="ml-1 text-xs font-normal tabular-nums">({fila.length})</span>
              )}
              {a === "abastecer" && naArea.length > 0 && (
                <span className="ml-1 text-xs font-normal tabular-nums">({naArea.length})</span>
              )}
            </Link>
          ))}
        </nav>
      )}

      {/* ---------------- SOLICITAR ---------------- */}
      {aba === "solicitar" && podeSolicitar && (
        <MontarSolicitacao clusters={clusters} tipos={tipos} turnoSugerido={turnoAtual(agora)} />
      )}

      {/* ---------------- FILA DA EMPILHADEIRA ---------------- */}
      {aba === "fila" && podeTransportar && (
        <div className="space-y-3">
          {/* O que ESTE operador já aceitou vem primeiro: é o trabalho na
              mão dele, e procurá-lo no meio da fila dos outros seria o
              caminho mais longo para a tarefa mais urgente. */}
          {pedidos
            .filter((r) => r.operadorId === perfil.id && estaAberta(r) && !transporteFim(r))
            .map((r) => (
              <CartaoTransporte
                key={r.id}
                r={r}
                nomeDoProduto={nomeDoProduto}
                agora={agora}
                meu
              />
            ))}

          {fila.filter((r) => r.operadorId !== perfil.id).length === 0 &&
          pedidos.filter((r) => r.operadorId === perfil.id && estaAberta(r) && !transporteFim(r)).length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nenhuma solicitação esperando. Quando alguém pedir, aparece aqui.
            </p>
          ) : (
            fila
              .filter((r) => r.operadorId !== perfil.id)
              .map((r) => (
                <CartaoTransporte key={r.id} r={r} nomeDoProduto={nomeDoProduto} agora={agora} />
              ))
          )}
        </div>
      )}

      {/* ---------------- ABASTECER ---------------- */}
      {aba === "abastecer" && podeAbastecer && (
        <div className="space-y-3">
          {naArea.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Nada esperando na área. Uma solicitação aparece aqui quando a empilhadeira
              marca todos os itens como entregues.
            </p>
          ) : (
            naArea.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <Cabecalho r={r} agora={agora} />
                <ListaDeItens r={r} nomeDoProduto={nomeDoProduto} />
                <form action={iniciarAbastecimentoDaSolicitacao} className="mt-3 flex gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <select name="turno" defaultValue={turnoAtual(agora)} className={`${campo} w-auto`}>
                    {TURNOS.map((t) => (
                      <option key={t} value={t}>{ROTULO_TURNO[t]}</option>
                    ))}
                  </select>
                  <BotaoEnviar className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark">
                    🛒 Começar a abastecer
                  </BotaoEnviar>
                </form>
                <p className="mt-2 text-xs text-slate-400">
                  Abre um abastecimento já com estes itens. Ajuste o que for diferente e
                  finalize na tela do Abastecimento.
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {/* ---------------- MINHAS ---------------- */}
      {aba === "minhas" && (
        <div className="space-y-3">
          {minhas.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Você não pediu nem transportou nada nos últimos {DIAS_DE_HISTORICO} dias.
            </p>
          ) : (
            minhas.map((r) => {
              const t = temposDoCiclo(r);
              return (
                <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <Cabecalho r={r} agora={agora} />
                  <ListaDeItens r={r} nomeDoProduto={nomeDoProduto} />

                  {t.ciclo !== null && (
                    <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-5">
                      <Tempo rotulo="Espera empilh." minutos={t.esperaEmpilhadeira} />
                      <Tempo rotulo="Transporte" minutos={t.transporte} />
                      <Tempo rotulo="Espera ajudante" minutos={t.esperaAjudante} />
                      <Tempo rotulo="Abastecimento" minutos={t.abastecimento} />
                      <Tempo rotulo="Ciclo" minutos={t.ciclo} destaque />
                    </dl>
                  )}

                  {r.canceladoEm ? (
                    <p className="mt-2 text-xs text-slate-500">Motivo: {r.motivo}</p>
                  ) : (
                    estaAberta(r) &&
                    !r.abastecimentoInicio && (
                      <form action={cancelarSolicitacao} className="mt-3 flex gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <input
                          name="motivo"
                          required
                          maxLength={200}
                          placeholder="Motivo do cancelamento"
                          className={`${campo} min-w-0 flex-1`}
                        />
                        <BotaoEnviar className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                          Cancelar
                        </BotaoEnviar>
                      </form>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Cabecalho({ r, agora }: { r: Ressuprimento; agora: Date }) {
  const estado = estadoDe(r);
  const info = ROTULO_ESTADO[estado];
  const parada = minutosParadaAgora(r, agora);

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

function ListaDeItens({
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
            {i.quantidade} {ROTULO_UNIDADE_ABASTECIMENTO_CURTO[i.unidade as "caixa" | "palete"]}
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

function CartaoTransporte({
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
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        meu ? "border-primary" : "border-slate-200"
      }`}
    >
      <Cabecalho r={r} agora={agora} />
      {r.observacao && <p className="mb-2 text-xs text-slate-500">📝 {r.observacao}</p>}

      <ListaDeItens r={r} nomeDoProduto={nomeDoProduto} comEntrega={meu && aceita} />

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

function Tempo({
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
