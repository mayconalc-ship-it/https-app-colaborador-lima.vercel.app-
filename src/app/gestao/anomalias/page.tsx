import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { decodificar } from "@/lib/texto-url";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ROTULO_STATUS_ACAO,
  ROTULO_STATUS_RELATO,
  ROTULO_TOPICO,
  STATUS_ACAO,
  type StatusRelato,
  type TopicoAcao,
} from "@/lib/relato-anomalia";
import { ROTULO_DIMENSAO, type Dimensao } from "@/lib/blitz";
import { atualizarAcaoDoPainel } from "./actions";

export const dynamic = "force-dynamic";

type LinhaRelato = {
  id: string;
  indicador_rotulo: string;
  dia_do_disparo: string;
  valor: number;
  limite: number;
  regra: string;
  explicacao: string;
  status: StatusRelato;
  aberto_em: string;
  responsavel_nome: string | null;
};

type LinhaBlitz = {
  id: string;
  atendimento_id: string;
  status: "pendente" | "concluida" | "tratada";
  gatilho_dimensao: Dimensao | null;
  gatilho_nome: string | null;
  transportadora_nome: string | null;
  media_avaria_pct: number | null;
  limite_pct: number | null;
  concluida_em: string | null;
  criado_em: string;
};

type LinhaAcao = {
  id: string;
  relato_id: string;
  topico: TopicoAcao;
  o_que: string;
  quem: string;
  prazo: string | null;
  status: string;
};

/** "há 3 dias" — o número que cobra, não a data que informa. */
function diasDesde(iso: string): number {
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const dia = new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return Math.max(
    0,
    Math.round(
      (new Date(`${hoje}T00:00:00`).getTime() - new Date(`${dia}T00:00:00`).getTime()) / 86_400_000,
    ),
  );
}

const brasileira = (iso: string) => iso.split("-").reverse().join("/");

type Gaveta = "sem-ninguem" | "tratativa" | "atrasadas" | "blitz" | "encerrados";

/**
 * O PAINEL DE PENDÊNCIAS -- cartões primeiro, detalhe só quando pedido.
 *
 * Reescrito a pedido do dono (07/09/2026): "nessa tela de anomalias só
 * pode ter os cards, e caso clique venham as informações".
 *
 * Ele está certo, e o motivo aparece quando a operação cresce: a tela
 * mostrava TODAS as listas empilhadas -- atrasadas, blitz a tratar, blitz
 * em aberto, relatos sem ninguém, em tratativa e encerrados. Com dois
 * relatos cabia; com vinte, a pergunta que a liderança faz ("o que está
 * me esperando?") vira uma rolagem, e a resposta some no meio dela.
 *
 * Agora a tela ABRE com a resposta: cinco números. O detalhe é uma escolha,
 * e a escolha vai na URL (`?ver=`) -- não em estado de componente. Assim o
 * botão voltar funciona, o link pode ser mandado no WhatsApp, e recarregar
 * depois de corrigir um prazo devolve a pessoa à mesma lista.
 *
 * NENHUM CARTÃO ABRE SOZINHO, nem o vermelho. Foi o pedido, e ele se
 * sustenta: um painel que decide por você qual lista importa é um painel
 * que você para de ler.
 */
export default async function PainelDeAnomaliasPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; erro?: string }>;
}) {
  await requireModulo("relato-anomalia", "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const podeEditar = await podeNoModulo("relato-anomalia", "editar");
  const { ver, erro } = await searchParams;
  const admin = createAdminClient();

  const [{ data: relatosBanco, error }, { data: acoesBanco }, blitzBanco] = await Promise.all([
    admin
      .from("pa_relatos_anomalia")
      .select(
        "id, indicador_rotulo, dia_do_disparo, valor, limite, regra, explicacao, status, aberto_em, responsavel_nome",
      )
      .eq("revenda_id", revendaId)
      .order("dia_do_disparo", { ascending: false }),
    admin
      .from("pa_relato_acoes")
      .select("id, relato_id, topico, o_que, quem, prazo, status")
      .eq("revenda_id", revendaId)
      .neq("status", "concluida"),
    /*
      AS BLITZ VÊM PELO MESMO CAMINHO das ações, mas com o erro ENGOLIDO:
      uma revenda que ainda não rodou a migration 100 não tem as tabelas,
      e o painel inteiro sumiria por causa de uma seção. Sem a 100, a
      lista fica vazia -- que é o mesmo estado de quem nunca teve blitz.
    */
    admin
      .from("pa_blitz")
      .select(
        "id, atendimento_id, status, gatilho_dimensao, gatilho_nome, transportadora_nome, media_avaria_pct, limite_pct, concluida_em, criado_em",
      )
      .eq("revenda_id", revendaId)
      .neq("status", "tratada")
      .order("criado_em", { ascending: false }),
  ]);

  if (error) {
    return (
      <div>
        <PageHeader title="🚨 Anomalias" subtitle="Painel de pendências" />
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Não foi possível ler os relatos: {error.message}
        </p>
      </div>
    );
  }

  const relatos = (relatosBanco ?? []) as LinhaRelato[];
  const acoes = (acoesBanco ?? []) as LinhaAcao[];
  const blitz = (blitzBanco.data ?? []) as LinhaBlitz[];

  // A PLACA VEM DO ATENDIMENTO. Guardá-la na blitz também seria repetir um
  // dado que já tem dono -- e a lista aqui é curta (o que está aberto).
  const { data: carretasBanco } = blitz.length
    ? await admin
        .from("atendimentos_carretas")
        .select("id, placa_carreta, numero_dt")
        .in("id", blitz.map((b) => b.atendimento_id))
    : { data: [] };
  const carretas = new Map(
    ((carretasBanco ?? []) as { id: string; placa_carreta: string; numero_dt: string }[]).map(
      (c) => [c.id, c],
    ),
  );

  const acoesPorRelato = new Map<string, LinhaAcao[]>();
  for (const a of acoes) {
    const lista = acoesPorRelato.get(a.relato_id) ?? [];
    lista.push(a);
    acoesPorRelato.set(a.relato_id, lista);
  }

  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const atrasadas = acoes
    .filter((a) => a.prazo && a.prazo < hoje)
    .sort((x, y) => (x.prazo ?? "").localeCompare(y.prazo ?? ""));

  const pendentes = relatos.filter((r) => r.status === "aberto");
  const andando = relatos.filter((r) => r.status === "em_analise" || r.status === "plano_definido");
  const fechados = relatos.filter(
    (r) => r.status === "concluido" || r.status === "eficacia_verificada",
  );
  const blitzPendentes = blitz.filter((b) => b.status === "pendente");
  const blitzParaTratar = blitz.filter((b) => b.status === "concluida");

  const gaveta = (["sem-ninguem", "tratativa", "atrasadas", "blitz", "encerrados"] as const).find(
    (g) => g === ver,
  );
  const linkDa = (g: Gaveta) => (gaveta === g ? "/gestao/anomalias" : `/gestao/anomalias?ver=${g}`);
  const voltarPara = gaveta ? `/gestao/anomalias?ver=${gaveta}` : "/gestao/anomalias";

  const nada = relatos.length === 0 && blitz.length === 0;

  return (
    <div>
      <PageHeader
        title="🚨 Anomalias"
        subtitle="Indicador fora da faixa vira relato — e o relato tem dono, prazo e verificação."
      />

      {erro && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{decodificar(erro)}</p>
      )}

      {/*
        OS CARTÕES SÃO A TELA. Cada um é um link que abre a lista dele
        abaixo -- e tocar de novo fecha. A escolha vai na URL para o
        voltar do celular funcionar.
      */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Cartao
          href={linkDa("sem-ninguem")}
          aberto={gaveta === "sem-ninguem"}
          valor={pendentes.length}
          rotulo="sem ninguém"
          alerta={pendentes.length > 0}
        />
        <Cartao
          href={linkDa("tratativa")}
          aberto={gaveta === "tratativa"}
          valor={andando.length}
          rotulo="em tratativa"
        />
        <Cartao
          href={linkDa("atrasadas")}
          aberto={gaveta === "atrasadas"}
          valor={atrasadas.length}
          rotulo="ações atrasadas"
          alerta={atrasadas.length > 0}
        />
        <Cartao
          href={linkDa("blitz")}
          aberto={gaveta === "blitz"}
          valor={blitzParaTratar.length + blitzPendentes.length}
          rotulo="blitz de carreta"
          alerta={blitzParaTratar.length > 0}
        />
        <Cartao
          href={linkDa("encerrados")}
          aberto={gaveta === "encerrados"}
          valor={fechados.length}
          rotulo="encerrados"
        />
      </div>

      {nada && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-3xl">✅</p>
          <p className="mt-2 text-sm font-semibold text-slate-700">Nenhuma anomalia aberta.</p>
          <p className="mt-1 text-xs text-slate-500">
            Os indicadores vigiados estão dentro do limite. Quem decide o que é vigiado é a tela de{" "}
            <Link href="/admin/relato-anomalia" className="text-primary hover:underline">
              gatilhos
            </Link>
            .
          </p>
        </div>
      )}

      {!gaveta && !nada && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          Toque num cartão para ver a lista dele.
        </p>
      )}

      {gaveta === "sem-ninguem" && (
        <Lista
          titulo="Esperando alguém pegar"
          ajuda="O gatilho disparou e a análise não começou."
          relatos={pendentes}
          acoesPorRelato={acoesPorRelato}
          destaque
        />
      )}

      {gaveta === "tratativa" && (
        <Lista
          titulo="Em tratativa"
          ajuda="Alguém está analisando, ou o plano já tem dono e prazo."
          relatos={andando}
          acoesPorRelato={acoesPorRelato}
        />
      )}

      {gaveta === "encerrados" && (
        <Lista
          titulo="Encerrados"
          ajuda="Assinados pelo gestor. A eficácia verificada é a que fecha o ciclo."
          relatos={fechados}
          acoesPorRelato={acoesPorRelato}
        />
      )}

      {/*
        AS AÇÕES ATRASADAS -- e aqui o prazo e o status se editam na hora.

        Pedido do dono (07/09/2026): "os botões de prazo e status devem ser
        editáveis, pois o prazo pode variar, ou se for digitado errado".
        Até ontem, corrigir uma data custava abrir o relato, achar a linha
        no plano e salvar o documento inteiro. Quatro passos para mudar uma
        data -- e data que ninguém corrige é cobrança que todo mundo
        aprende a ignorar.
      */}
      {gaveta === "atrasadas" && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Ações com prazo vencido
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            Mude a data ou o status aqui mesmo. O “o quê”, o “como” e o dono só mudam dentro do
            relato — esses são a análise, não o andamento.
          </p>
          {atrasadas.length === 0 ? (
            <Vazio texto="Nenhuma ação vencida. O plano está em dia." />
          ) : (
            <div className="space-y-2">
              {atrasadas.map((a) => {
                const relato = relatos.find((r) => r.id === a.relato_id);
                const dias = diasDesde(`${a.prazo}T12:00:00`);
                return (
                  <div key={a.id} className="rounded-2xl border border-red-200 bg-red-50 p-3">
                    <Link href={`/gestao/anomalias/${a.relato_id}`} className="block">
                      <p className="text-sm font-semibold text-slate-800">{a.o_que}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {ROTULO_TOPICO[a.topico].titulo} · {a.quem}
                        {relato && ` · ${relato.indicador_rotulo}`}
                      </p>
                    </Link>
                    <p className="mt-1 text-xs font-semibold text-red-700">
                      Venceu em {a.prazo ? brasileira(a.prazo) : "—"} — há {dias} dia
                      {dias === 1 ? "" : "s"}
                    </p>

                    {podeEditar && (
                      <form
                        action={atualizarAcaoDoPainel}
                        className="mt-2 flex flex-wrap items-end gap-2 border-t border-red-200 pt-2"
                      >
                        <input type="hidden" name="acao_id" value={a.id} />
                        <input type="hidden" name="voltar" value={voltarPara} />
                        <div>
                          <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Novo prazo
                          </label>
                          <input
                            type="date"
                            name="prazo"
                            defaultValue={a.prazo ?? ""}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Status
                          </label>
                          <select
                            name="status"
                            defaultValue={a.status}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                          >
                            {STATUS_ACAO.map((s) => (
                              <option key={s} value={s}>
                                {ROTULO_STATUS_ACAO[s]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <BotaoEnviar
                          textoEnviando="Salvando..."
                          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Salvar
                        </BotaoEnviar>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {gaveta === "blitz" && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Blitz de carreta
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            O prazo aqui é o mais curto do painel: a foto da grade quebrada vale hoje, e o
            transportador ainda lembra qual viagem foi.
          </p>

          {blitzParaTratar.length === 0 && blitzPendentes.length === 0 ? (
            <Vazio texto="Nenhuma blitz aberta." />
          ) : (
            <div className="space-y-2">
              {blitzParaTratar.map((b) => {
                const carreta = carretas.get(b.atendimento_id);
                return (
                  <Link
                    key={b.id}
                    href={`/gestao/blitz/${b.id}`}
                    className="block rounded-2xl border border-red-200 bg-red-50/60 p-4 shadow-sm hover:border-primary"
                  >
                    <p className="text-sm font-bold text-slate-900">
                      🚛 {carreta?.placa_carreta ?? "Carreta"}
                      {carreta?.numero_dt && (
                        <span className="font-normal text-slate-500"> · DT {carreta.numero_dt}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {b.gatilho_dimensao && b.gatilho_nome
                        ? `${ROTULO_DIMENSAO[b.gatilho_dimensao]} ${b.gatilho_nome}`
                        : (b.transportadora_nome ?? "—")}
                      {b.media_avaria_pct !== null &&
                        b.limite_pct !== null &&
                        ` · ${b.media_avaria_pct}% de avaria (limite ${b.limite_pct}%)`}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-red-700">
                      Inspecionada
                      {b.concluida_em ? ` há ${diasDesde(b.concluida_em)} dia(s)` : ""} — relato de
                      ocorrência pronto para enviar.
                    </p>
                  </Link>
                );
              })}

              {/* A blitz NÃO RESPONDIDA também é pendência, e de outra
                  pessoa: o conferente. Aparece aqui para a liderança
                  cobrar antes de a carreta sumir. */}
              {blitzPendentes.map((b) => {
                const carreta = carretas.get(b.atendimento_id);
                return (
                  <Link
                    key={b.id}
                    href={`/carretas-conferencia/${b.atendimento_id}/blitz`}
                    className="block rounded-2xl border border-amber-300 bg-amber-50 p-3 shadow-sm hover:border-primary"
                  >
                    <p className="text-sm font-semibold text-amber-900">
                      ⏳ {carreta?.placa_carreta ?? "Carreta"} — checklist em aberto
                    </p>
                    <p className="mt-0.5 text-xs text-amber-900/80">
                      {b.transportadora_nome ?? "—"} · aberta há {diasDesde(b.criado_em)} dia(s) —
                      esperando o conferente.
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Lista({
  titulo,
  ajuda,
  relatos,
  acoesPorRelato,
  destaque = false,
}: {
  titulo: string;
  ajuda: string;
  relatos: LinhaRelato[];
  acoesPorRelato: Map<string, LinhaAcao[]>;
  destaque?: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{titulo}</h2>
      <p className="mb-2 text-xs text-slate-500">{ajuda}</p>

      {relatos.length === 0 ? (
        <Vazio texto="Nada nesta lista." />
      ) : (
        <div className="space-y-2">
          {relatos.map((r) => {
            const dias = diasDesde(r.aberto_em);
            const abertas = acoesPorRelato.get(r.id) ?? [];
            return (
              <Link
                key={r.id}
                href={`/gestao/anomalias/${r.id}`}
                className={`block rounded-2xl border p-4 shadow-sm hover:border-primary ${
                  destaque ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{r.indicador_rotulo}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Disparou em {brasileira(r.dia_do_disparo)}
                      {r.responsavel_nome && ` · ${r.responsavel_nome}`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {ROTULO_STATUS_RELATO[r.status]?.titulo ?? r.status}
                  </span>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-slate-600">{r.explicacao}</p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {/* O TEMPO ABERTO cobra; a data informa. Em vermelho a
                      partir de três dias -- é o ponto em que a análise
                      deixa de ser sobre um fato que alguém lembra. */}
                  <span
                    className={
                      r.status === "aberto" && dias >= 3
                        ? "font-bold text-red-700"
                        : "text-slate-500"
                    }
                  >
                    {dias === 0 ? "aberto hoje" : `aberto há ${dias} dia${dias === 1 ? "" : "s"}`}
                  </span>
                  {abertas.length > 0 && (
                    <span className="text-slate-500">· {abertas.length} ação(ões) em aberto</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
      {texto}
    </p>
  );
}

/**
 * O CARTÃO -- número, rótulo, e o estado de aberto.
 *
 * Aberto ganha borda escura e a setinha para baixo: sem isso, com cinco
 * cartões iguais, a pessoa perde de vista qual lista está lendo assim que
 * rola a tela.
 */
function Cartao({
  href,
  aberto,
  valor,
  rotulo,
  alerta = false,
}: {
  href: string;
  aberto: boolean;
  valor: number;
  rotulo: string;
  alerta?: boolean;
}) {
  const acesa = alerta && valor > 0;
  return (
    <Link
      href={href}
      aria-current={aberto ? "true" : undefined}
      className={`relative block rounded-2xl border p-3 text-center shadow-sm transition-colors ${
        aberto
          ? "border-slate-800 bg-white ring-2 ring-slate-800/10"
          : acesa
            ? "border-red-200 bg-red-50 hover:border-red-400"
            : "border-slate-200 bg-white hover:border-primary"
      }`}
    >
      <p className={`text-2xl font-bold tabular-nums ${acesa ? "text-red-700" : "text-slate-900"}`}>
        {valor}
      </p>
      <p className="text-xs leading-tight text-slate-500">{rotulo}</p>
      {aberto && (
        <span
          aria-hidden="true"
          className="absolute -bottom-2 left-1/2 -ml-2 h-0 w-0 border-x-8 border-t-8 border-x-transparent border-t-slate-800"
        />
      )}
    </Link>
  );
}
