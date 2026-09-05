import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoImprimir } from "@/components/anomalia/BotaoImprimir";
import { PlanoDeAcao, type LinhaDoPlano } from "@/components/anomalia/PlanoDeAcao";
import { decodificar } from "@/lib/texto-url";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  NATUREZAS,
  PERGUNTAS_PADRONIZACAO,
  PORQUES,
  ROTULO_NATUREZA,
  ROTULO_STATUS_RELATO,
  pendenciasDoRelato,
  tituloDoRelato,
  type Padronizacao,
  type StatusAcao,
  type StatusRelato,
  type TopicoAcao,
} from "@/lib/relato-anomalia";
import { assinarRelato, salvarRelato, verificarEficacia } from "./actions";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";

const brasileira = (iso: string) => iso.split("-").reverse().join("/");
const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

type Relato = {
  id: string;
  indicador_rotulo: string;
  dia_do_disparo: string;
  valor: number;
  limite: number;
  media: number | null;
  desvio: number | null;
  regra: string;
  explicacao: string;
  area: string | null;
  sala: string | null;
  natureza: string | null;
  ic_iv: string | null;
  sintoma: string | null;
  participantes: string[] | null;
  porques: string[] | null;
  padronizacao: Padronizacao | null;
  status: StatusRelato;
  responsavel_nome: string | null;
  gestor_nome: string | null;
  assinatura_gestor: string | null;
  assinado_em: string | null;
  finalizado_em: string | null;
  eficacia_verificada_em: string | null;
  eficacia_observacao: string | null;
  aberto_em: string;
};

/**
 * O RELATO DE ANOMALIA -- a folha do papel, na tela e na impressora.
 *
 * A ordem das seções é a do documento anexado pelo dono, e é o método:
 * sintoma → participantes → 5 porquês → padronização → plano → assinatura.
 * Cada uma só faz sentido depois da anterior, e é essa sequência que o
 * auditor percorre.
 *
 * A MESMA PÁGINA VIRA O PDF. Não há biblioteca de PDF aqui, e não
 * precisa haver: o "Salvar como PDF" do navegador imprime esta folha,
 * com a folha de estilo de impressão escondendo tudo que é aplicativo
 * (ver @media print em globals.css). Um segundo layout só para imprimir
 * seria um segundo documento para manter em dia com o primeiro -- e o
 * dia em que os dois divergissem seria o dia da auditoria.
 */
export default async function RelatoDeAnomaliaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("relato-anomalia", "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const { id } = await params;
  const { erro, sucesso } = await searchParams;

  const admin = createAdminClient();
  const [{ data: relatoBanco }, { data: acoesBanco }] = await Promise.all([
    admin
      .from("pa_relatos_anomalia")
      .select("*")
      .eq("id", id)
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    admin
      .from("pa_relato_acoes")
      .select("topico, o_que, como, quem, prazo, status")
      .eq("relato_id", id)
      .order("ordem"),
  ]);

  const r = relatoBanco as Relato | null;
  if (!r) notFound();

  const acoes: LinhaDoPlano[] = (
    (acoesBanco ?? []) as {
      topico: TopicoAcao;
      o_que: string;
      como: string | null;
      quem: string;
      prazo: string | null;
      status: StatusAcao;
    }[]
  ).map((a) => ({
    topico: a.topico,
    oQue: a.o_que,
    como: a.como ?? "",
    quem: a.quem,
    prazo: a.prazo ?? "",
    status: a.status,
  }));

  const assinado = Boolean(r.assinado_em);
  const porques = r.porques ?? [];
  const padronizacao = r.padronizacao ?? {};

  /*
    O QUE FALTA -- SEM CONTAR A ASSINATURA.

    A assinatura é o que este bloco COLETA, então incluí-la na conta
    faria o formulário nunca aparecer: sempre haveria uma pendência, e a
    pendência seria justamente a coisa que a pessoa veio fazer. Foi o que
    aconteceu no primeiro teste desta tela.

    A checagem completa continua valendo onde importa: no servidor, em
    `assinarRelato` -- é ela que recusa de verdade.
  */
  const faltas = pendenciasDoRelato({
    porques,
    padronizacao,
    acoes: acoes.map((a) => ({ ...a, prazo: a.prazo || null })),
    assinaturaGestor: r.assinatura_gestor ?? "a assinar agora",
  });

  const titulo = tituloDoRelato(r.indicador_rotulo, r.dia_do_disparo);

  return (
    <div className="folha mx-auto max-w-4xl">
      {/* A BARRA DO APP -- some na impressão. */}
      <div className="so-na-tela mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/gestao/anomalias" className="text-sm text-primary hover:underline">
          ← Painel de anomalias
        </Link>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {ROTULO_STATUS_RELATO[r.status]?.titulo ?? r.status}
          </span>
          <BotaoImprimir />
        </div>
      </div>

      {erro && (
        <p className="so-na-tela mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}
      {sucesso && (
        <p className="so-na-tela mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {decodificar(sucesso)}
        </p>
      )}

      <form action={salvarRelato} className="space-y-4">
        <input type="hidden" name="id" value={r.id} />

        {/* ---------------- CABEÇALHO ---------------- */}
        <header className="bloco-do-relato rounded-2xl border-2 border-slate-800 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold uppercase tracking-wide text-slate-900">
                Relato de Anomalia
              </h1>
              {/* Fica no papel: é o que identifica o documento —
                  qual indicador, de que dia. */}
              <p className="text-xs text-slate-500">{titulo}</p>
            </div>
            <div className="text-right text-xs text-slate-600">
              <p>
                <strong>Data:</strong> {brasileira(r.dia_do_disparo)}
              </p>
              <p>
                <strong>Hora:</strong> {horaDe(r.aberto_em)}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <label className={rotulo}>Área</label>
              <input
                name="area"
                defaultValue={r.area ?? ""}
                readOnly={assinado}
                placeholder="Ex.: Distribuição"
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo}>Sala</label>
              <input
                name="sala"
                defaultValue={r.sala ?? ""}
                readOnly={assinado}
                placeholder="Ex.: Armazém Turno 1"
                className={campo}
              />
            </div>
          </div>
        </header>

        {/* ---------------- SINTOMA ---------------- */}
        <section className="bloco-do-relato rounded-2xl border border-slate-300 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            Descrição da anomalia — descrição do sintoma
          </h2>

          {/*
            O QUE DISPAROU vem congelado do momento do gatilho, e é
            impresso junto: é ele que responde ao auditor por que este
            relato existe. A média muda amanhã; este quadro não.
          */}
          <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-bold text-red-900">
              {r.indicador_rotulo}: {r.valor.toLocaleString("pt-BR")} — limite{" "}
              {r.limite.toLocaleString("pt-BR")}
            </p>
            <p className="mt-1 text-xs text-red-800">{r.explicacao}</p>
            {r.media !== null && (
              <p className="mt-1 text-[11px] text-red-700">
                Base no dia do disparo: média {r.media.toLocaleString("pt-BR")} · desvio{" "}
                {r.desvio?.toLocaleString("pt-BR")} · regra {r.regra}
              </p>
            )}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <label className={rotulo}>Natureza</label>
              {/* Uma escolha, e não duas caixas: marcar "repetitiva" E
                  "única" é um estado que o papel permite e ninguém
                  interpreta depois. */}
              <div className="flex gap-2">
                {NATUREZAS.map((n) => (
                  <label
                    key={n}
                    className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
                  >
                    <input
                      type="radio"
                      name="natureza"
                      value={n}
                      defaultChecked={r.natureza === n}
                      disabled={assinado}
                      className="h-4 w-4"
                    />
                    {ROTULO_NATUREZA[n].titulo}
                  </label>
                ))}
              </div>
              <p className="so-na-tela mt-1 text-[11px] leading-tight text-slate-400">
                Repetitiva muda o peso da causa: repetir é sinal de que a ação anterior não pegou.
              </p>
            </div>
            <div>
              <label className={rotulo}>IC / IV</label>
              <input
                name="ic_iv"
                defaultValue={r.ic_iv ?? ""}
                readOnly={assinado}
                placeholder="O indicador de controle ou de verificação"
                className={campo}
              />
            </div>
          </div>

          <div className="mt-2">
            <label className={rotulo}>O sintoma, em uma frase</label>
            <textarea
              name="sintoma"
              defaultValue={r.sintoma ?? ""}
              readOnly={assinado}
              rows={2}
              placeholder="O que foi observado — o fato, não a causa."
              className={campo}
            />
          </div>

          <div className="mt-2">
            <label className={rotulo}>Participantes</label>
            <textarea
              name="participantes"
              defaultValue={(r.participantes ?? []).join(", ")}
              readOnly={assinado}
              rows={2}
              placeholder="Separe por vírgula. Quem participou da análise assina junto pelo resultado."
              className={campo}
            />
          </div>
        </section>

        {/* ---------------- 5 PORQUÊS ---------------- */}
        <section className="bloco-do-relato rounded-2xl border border-slate-300 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            Análise da causa
          </h2>
          <p className="so-na-tela mb-2 text-xs text-slate-500">
            Cada porquê responde ao anterior. O 5º é o que vira a ação de causa raiz — se ele ainda
            é um sintoma, a análise parou cedo.
          </p>
          <div className="space-y-2">
            {Array.from({ length: PORQUES }, (_, i) => (
              <div key={i} className="flex gap-2">
                <span className="mt-2 w-6 shrink-0 text-sm font-bold text-slate-400">{i + 1}</span>
                <textarea
                  name={`porque__${i}`}
                  defaultValue={porques[i] ?? ""}
                  readOnly={assinado}
                  rows={2}
                  placeholder={i === 0 ? "Por que aconteceu?" : "Por quê?"}
                  className={campo}
                />
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- PADRONIZAÇÃO ---------------- */}
        <section className="bloco-do-relato rounded-2xl border border-slate-300 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            Padronização
          </h2>
          <p className="so-na-tela mb-2 text-xs text-slate-500">
            É a parte que o auditor lê primeiro: o desvio foi por falta de padrão, padrão errado, ou
            padrão não cumprido?
          </p>
          {/* `padronizacao` liga as duas colunas na impressão: são oito
              perguntas de uma linha, e empilhadas gastavam meia folha
              para dizer Sim/Não. */}
          <div className="padronizacao divide-y divide-slate-100">
            {PERGUNTAS_PADRONIZACAO.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-slate-700">{p.texto}</span>
                <div className="flex shrink-0 gap-1">
                  {(["sim", "nao"] as const).map((v) => (
                    <label
                      key={v}
                      className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold"
                    >
                      <input
                        type="radio"
                        name={`padr__${p.id}`}
                        value={v}
                        defaultChecked={padronizacao[p.id] === v}
                        disabled={assinado}
                        className="h-3.5 w-3.5"
                      />
                      {v === "sim" ? "Sim" : "Não"}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------------- PLANO DE AÇÃO ---------------- */}
        <section className="bloco-do-relato rounded-2xl border border-slate-300 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            Plano de ação
          </h2>
          <p className="so-na-tela mb-2 text-xs text-slate-500">
            Ação sem dono e sem prazo é intenção. É o achado mais comum de auditoria em plano de
            ação — e o mais fácil de evitar.
          </p>
          <PlanoDeAcao iniciais={acoes} somenteLeitura={assinado} />
        </section>

        {/* ---------------- ASSINATURA ---------------- */}
        <section className="bloco-do-relato rounded-2xl border border-slate-300 bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={rotulo}>Nome do responsável</label>
              <input
                name="responsavel_nome"
                defaultValue={r.responsavel_nome ?? ""}
                readOnly={assinado}
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo}>Nome do gestor</label>
              <input
                name="gestor_nome"
                defaultValue={r.gestor_nome ?? ""}
                readOnly={assinado}
                className={campo}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className={rotulo}>Data de finalização</p>
              <p className="border-b border-slate-400 pb-1 text-sm text-slate-800">
                {r.finalizado_em ? brasileira(r.finalizado_em) : " "}
              </p>
            </div>
            <div>
              <p className={rotulo}>Assinatura do gestor</p>
              {/* Assinado: o nome fica sobre a linha, como no papel.
                  Em branco: a linha vai vazia para assinar à caneta,
                  que é como muita auditoria ainda pede. */}
              <p className="border-b border-slate-400 pb-1 text-sm font-semibold text-slate-800">
                {r.assinatura_gestor ?? " "}
              </p>
            </div>
          </div>
        </section>

        {!assinado && (
          <div className="so-na-tela sticky bottom-4 z-10">
            <BotaoEnviar
              textoEnviando="Salvando..."
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg hover:bg-primary-dark"
            >
              Salvar relato
            </BotaoEnviar>
            <p className="mt-1.5 text-center text-xs text-slate-500">
              Dá para salvar incompleto e voltar depois — a análise raramente cabe numa sentada.
            </p>
          </div>
        )}
      </form>

      {/* ---------------- FECHAMENTO ---------------- */}
      {!assinado && (
        <section className="so-na-tela mt-5 rounded-2xl border border-slate-300 bg-white p-4">
          <h2 className="text-sm font-bold text-slate-900">✍️ Assinar e encerrar</h2>
          {faltas.length > 0 ? (
            <>
              <p className="mt-1 text-xs text-slate-500">
                Falta isto para o relato fechar:
              </p>
              <ul className="mt-2 space-y-1">
                {faltas.map((f) => (
                  <li key={f} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                    {f}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <form action={assinarRelato} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={r.id} />
              <div className="min-w-[12rem] flex-1">
                <label className={rotulo}>Nome de quem assina</label>
                <input
                  name="assinatura_gestor"
                  required
                  defaultValue={r.gestor_nome ?? ""}
                  className={campo}
                />
              </div>
              <BotaoEnviar
                textoEnviando="Assinando..."
                className="shrink-0 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-900"
              >
                Assinar
              </BotaoEnviar>
            </form>
          )}
        </section>
      )}

      {/* ---------------- EFICÁCIA ---------------- */}
      {assinado && (
        <section className="bloco-do-relato mt-5 rounded-2xl border border-slate-300 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            Verificação de eficácia
          </h2>
          {r.eficacia_verificada_em ? (
            <>
              <p className="mt-1 text-xs text-slate-500">
                Verificada em {brasileira(r.eficacia_verificada_em.slice(0, 10))}
              </p>
              <p className="mt-2 rounded-lg bg-green-50 px-2.5 py-2 text-sm text-green-900">
                {r.eficacia_observacao}
              </p>
            </>
          ) : (
            <form action={verificarEficacia} className="mt-2 space-y-2">
              <input type="hidden" name="id" value={r.id} />
              <p className="so-na-tela text-xs text-slate-500">
                O auditor não pergunta se você assinou — pergunta se funcionou. Escreva o que mostra
                que a ação pegou: o indicador voltou para dentro do limite e ficou.
              </p>
              <textarea
                name="eficacia_observacao"
                rows={3}
                required
                placeholder="Ex.: nos 15 dias seguintes a avaria ficou entre 1,2% e 2,8%, dentro do limite de 5%."
                className={campo}
              />
              <BotaoEnviar
                textoEnviando="Registrando..."
                className="so-na-tela w-full rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-800 sm:w-auto"
              >
                Registrar eficácia e fechar o ciclo
              </BotaoEnviar>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
