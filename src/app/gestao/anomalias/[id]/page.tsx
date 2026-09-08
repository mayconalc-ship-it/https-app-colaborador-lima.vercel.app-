import Link from "next/link";
import { notFound } from "next/navigation";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoImprimir } from "@/components/anomalia/BotaoImprimir";
import {
  CampoDeLista,
  ComboboxDePessoa,
  ParticipantesDoRelato,
} from "@/components/anomalia/CamposDoRelato";
import { CATALOGO_DE_METAS } from "@/lib/metas";
import { SIGMAS_PADRAO } from "@/lib/gatilho-anomalia";
import {
  catalogosDoRelato,
  indicadoresComGatilho,
} from "@/lib/relato-catalogos-server";
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
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { podeNoModulo } from "@/lib/require-admin";
import { carretasDoDia, temSerie } from "@/lib/gatilho-anomalia-server";
import {
  assinarRelato,
  buscarPessoasDoRelato,
  excluirRelato,
  salvarRelato,
  verificarEficacia,
} from "./actions";

/** A regra em português -- "pico" e "deriva" são do motor, não do papel. */
const ROTULO_DA_REGRA: Record<string, string> = {
  pico: "pico (passou do limite)",
  deriva: "deriva (piora lenta, 2 de 3 medições além de 1 desvio)",
  manual: "limite definido pela operação",
};

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
  indicador: string;
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
  assinado_por_nome: string | null;
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
  const podeExcluir = await podeNoModulo("relato-anomalia", "excluir");
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
    AS CARRETAS DO DIA, só para os indicadores que saem do RECEBIMENTO.

    `temSerie` é a mesma lista que o gatilho usa (avaria e TMA hoje) -- e é
    a lista certa aqui: são os indicadores cujo número é a média das
    carretas do dia, então são os únicos em que a carreta identifica o
    disparo. Num relato de Refugo ou de Devolução, a mesma lista de
    carretas seria ruído com cara de evidência.
  */
  const carretas = temSerie(r.indicador) ? await carretasDoDia(revendaId, r.dia_do_disparo) : [];

  /*
    A UNIDADE DO INDICADOR vem do catálogo de metas -- é lá que ela já
    mora. Indicador fora do catálogo (nenhum hoje) cai no número puro, que
    é o que o documento mostrava para todos até agora.
  */
  const def = CATALOGO_DE_METAS.find((m) => m.chave === r.indicador);
  const comUnidade = (n: number | null | undefined) => {
    if (n === null || n === undefined) return "—";
    const numero = n.toLocaleString("pt-BR", {
      minimumFractionDigits: def?.casas ?? 0,
      maximumFractionDigits: def?.casas ?? 2,
    });
    return def?.sufixo ? `${numero} ${def.sufixo}` : numero;
  };

  // Os oito primeiros caracteres do id: únicos na prática, e cabem na
  // linha do cabeçalho e no rodapé de cada folha impressa.
  const numeroDoRelato = r.id.slice(0, 8).toUpperCase();

  // Quais indicadores têm gatilho ligado — a lista do IC/IV mostra isso ao
  // lado de cada um, que é o que liga o relato a um disparo de verdade.
  const comGatilho = await indicadoresComGatilho(revendaId);
  const catalogos = await catalogosDoRelato(revendaId, comGatilho);
  const sigmasDoGatilho = SIGMAS_PADRAO;

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
      {/* O RODAPÉ QUE SE REPETE EM CADA FOLHA IMPRESSA. Escondido na tela
          (`hidden`), ligado só pelo @media print -- ver globals.css. */}
      <div className="rodape-do-relato hidden">
        RA {numeroDoRelato} · {titulo} · {r.responsavel_nome ?? "sem responsável"}
      </div>

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
              {/* O NÚMERO DO RELATO, e ele fica no papel de propósito
                  (pedido do dono, 07/09/2026): com o documento em duas
                  folhas, a segunda solta em cima da mesa não dizia de qual
                  relato era. Os oito primeiros caracteres do id bastam --
                  são únicos na prática e cabem numa linha. */}
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-slate-400">
                RA {numeroDoRelato}
              </p>
            </div>
            {/*
              DATA E HORA DA OCORRÊNCIA -- as duas do MESMO momento.

              Relato do dono (07/09/2026): "a hora ao imprimir o relato está
              dando 01:05h sendo que imprimi às 20:11". Não era fuso: o
              campo mostrava a hora em que a VARREDURA abriu o relato
              (01:05), ao lado de uma data que era a do DISPARO. Dois
              momentos diferentes em campos vizinhos é pior do que um errado
              -- quem lê soma os dois e conclui a hora do fato.

              Agora os dois falam do disparo, e a abertura do relato aparece
              embaixo, dita com todas as letras.
            */}
            <div className="text-right text-xs text-slate-600">
              <p>
                <strong>Data da anomalia:</strong> {brasileira(r.dia_do_disparo)}
              </p>
              <p>
                <strong>Detectada em:</strong> {brasileira(r.aberto_em.slice(0, 10))} às{" "}
                {horaDe(r.aberto_em)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Detecção automática pelo gatilho do indicador
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <label className={rotulo} htmlFor="area">
                Área
              </label>
              <CampoDeLista
                id="area"
                nome="area"
                valorInicial={r.area ?? ""}
                itens={catalogos.areas}
                placeholder="Ex.: Logística"
                somenteLeitura={assinado}
              />
            </div>
            <div>
              <label className={rotulo} htmlFor="sala">
                Sala
              </label>
              <CampoDeLista
                id="sala"
                nome="sala"
                valorInicial={r.sala ?? ""}
                itens={catalogos.salas}
                placeholder="Ex.: Armazém Turno 1"
                somenteLeitura={assinado}
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
          {/*
            O NÚMERO COM A UNIDADE -- pedido do dono (07/09/2026): "dentro
            dos textos, inclua os tipos, se é %, horas, minutos".

            "TMA: 41 — limite 38" não diz se são minutos ou horas, e quem
            lê o papel meses depois não tem como saber. A unidade vem do
            catálogo de indicadores (lib/metas.ts), que é onde ela já
            estava — o documento só não a mostrava.
          */}
          <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-bold text-red-900">
              {r.indicador_rotulo}: {comUnidade(r.valor)} — limite {comUnidade(r.limite)}
            </p>
            <p className="mt-1 text-xs text-red-800">{r.explicacao}</p>
            {r.media !== null && (
              <p className="mt-1 text-[11px] text-red-700">
                Base no dia do disparo: média {comUnidade(r.media)} · desvio padrão{" "}
                {comUnidade(r.desvio)} · regra {ROTULO_DA_REGRA[r.regra] ?? r.regra}
              </p>
            )}
            {/*
              O QUE É O GATILHO, dito no documento -- pedido do dono
              (07/09/2026): "precisa deixar evidente o que é gatilho e que
              indicadores que ativam o gatilho vira relato".

              O auditor lê este papel sem ter visto a tela de configuração.
              Sem esta frase, o número do limite parece arbitrário; com
              ela, o documento se explica sozinho -- que é o que separa um
              RA de um formulário preenchido.
            */}
            <p className="mt-2 border-t border-red-200 pt-2 text-[11px] leading-snug text-red-800">
              <strong>O que é o gatilho:</strong> o limite acima do qual este indicador deixa de
              ser variação normal e vira anomalia. Ele é calculado sobre a própria série do
              indicador — <strong>média + {sigmasDoGatilho} desvios padrão</strong> — ou definido
              pela operação quando existe um patamar acordado. Todo indicador com gatilho ligado é
              vigiado diariamente, e <strong>o disparo abre este relato automaticamente</strong>:
              é o que garante que o desvio seja tratado, e não apenas percebido.
            </p>
          </div>

          {/*
            AS CARRETAS DO DIA (08/09/2026, pedido do dono: "quando houver um
            relato de anomalia de blitz, por exemplo, precisa colocar os dados
            da carreta no relato para identificar").

            O relato dizia "Avaria fora do limite em 07/09, 8,4% contra 5%" e
            parava aí. Quem trata precisava abrir outra tela para descobrir
            QUAL carreta -- e o papel assinado não identificava o que tinha
            sido tratado. Um relato que não diz sobre o que é não serve de
            evidência para ninguém.

            IMPRIME JUNTO, sem `so-na-tela`: é justamente no papel que a
            identificação faz falta.

            A PIOR PRIMEIRO, porque o ponto do gatilho é a média do dia: numa
            lista de doze, a que puxou a média é a que se trata.
          */}
          {carretas.length > 0 && (
            <div className="mt-3 rounded-xl border border-slate-300 bg-white p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                🚛 Carretas recebidas em {brasileira(r.dia_do_disparo)} ({carretas.length})
              </p>
              <p className="so-na-tela mt-0.5 text-[11px] leading-snug text-slate-500">
                O indicador do dia é a média destas carretas — a de maior avaria vem primeiro.
              </p>
              <ul className="mt-2 divide-y divide-slate-100">
                {carretas.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {c.placaCarreta ?? "sem placa"}
                    </span>
                    <span className="text-xs text-slate-600">DT {c.numeroDt ?? "—"}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                      {c.transportadora ?? "sem transportadora"}
                      {c.motorista ? ` · ${c.motorista}` : ""}
                    </span>
                    {c.avariaPct !== null && (
                      <span
                        className={`shrink-0 text-xs font-bold tabular-nums ${
                          c.avariaPct > r.limite ? "text-red-700" : "text-slate-600"
                        }`}
                      >
                        {c.avariaPct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% avaria
                      </span>
                    )}
                    {c.blitzId && (
                      <Link
                        href={`/gestao/blitz/${c.blitzId}`}
                        className="so-na-tela shrink-0 text-xs font-semibold text-primary hover:underline"
                      >
                        ver a blitz →
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

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
              <label className={rotulo} htmlFor="ic_iv">
                IC / IV
              </label>
              {/* A lista traz os indicadores do app, marcando quais têm
                  gatilho ligado -- pedido do dono (07/09/2026): "já pode
                  utilizar os mesmos que já possui e que já tem gatilho
                  mapeado". Escolher um deles é o que amarra o relato ao
                  indicador que o abriu, em vez de um texto solto. */}
              <CampoDeLista
                id="ic_iv"
                nome="ic_iv"
                valorInicial={r.ic_iv ?? ""}
                itens={catalogos.icIv}
                placeholder="Indicador de controle ou de verificação"
                somenteLeitura={assinado}
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
            {/* Cada participante é uma marca, não um pedaço de texto: a
                vírgula era onde "Silva, Neuilton" virava duas pessoas. */}
            <ParticipantesDoRelato
              nome="participantes"
              iniciais={r.participantes ?? []}
              buscar={buscarPessoasDoRelato}
              somenteLeitura={assinado}
            />
            <p className="so-na-tela mt-1 text-[11px] leading-snug text-slate-400">
              Quem participou da análise assina junto pelo resultado.
            </p>
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
          <PlanoDeAcao
            iniciais={acoes}
            buscarPessoas={buscarPessoasDoRelato}
            somenteLeitura={assinado}
          />
        </section>

        {/* ---------------- ASSINATURA ---------------- */}
        <section className="bloco-do-relato rounded-2xl border border-slate-300 bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={rotulo} htmlFor="responsavel_nome">
                Nome do responsável
              </label>
              <ComboboxDePessoa
                id="responsavel_nome"
                nome="responsavel_nome"
                valorInicial={r.responsavel_nome ?? ""}
                buscar={buscarPessoasDoRelato}
                placeholder="Quem responde pela análise"
                somenteLeitura={assinado}
              />
            </div>
            <div>
              <label className={rotulo} htmlFor="gestor_nome">
                Nome do gestor
              </label>
              <ComboboxDePessoa
                id="gestor_nome"
                nome="gestor_nome"
                valorInicial={r.gestor_nome ?? ""}
                buscar={buscarPessoasDoRelato}
                placeholder="Gestor da área"
                somenteLeitura={assinado}
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

          {/*
            O REGISTRO AUDITÁVEL DA ASSINATURA -- e ele vai para o PAPEL.

            Pergunta do dono (07/09/2026): "a assinatura do gestor é
            auditável, ou só replica o nome dele?". Até ontem, só pela
            metade: o horário e o usuário eram gravados, mas não apareciam
            em lugar nenhum -- e o nome sobre a linha era texto digitado.

            Agora o documento diz QUEM ESTAVA LOGADO ao assinar e QUANDO. É
            isso que transforma um nome escrito num registro: o auditor vê
            que a assinatura tem origem, e vê na hora se alguém assinou
            pelo gestor.
          */}
          {assinado && (
            <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] leading-snug text-slate-500">
              Assinado no app por{" "}
              <strong>{r.assinado_por_nome ?? "usuário não identificado"}</strong>
              {r.assinado_em &&
                ` em ${brasileira(r.assinado_em.slice(0, 10))} às ${horaDe(r.assinado_em)}`}
              {r.assinado_por_nome &&
                r.assinatura_gestor &&
                r.assinado_por_nome.trim().toLowerCase() !==
                  r.assinatura_gestor.trim().toLowerCase() && (
                  <> — a assinatura foi lançada em nome de outra pessoa.</>
                )}
            </p>
          )}
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

      {/* EXCLUIR FICA NO FIM, longe de tudo e sem cor de destaque.
          Não é um passo do relato -- é a saída para o que nunca deveria
          ter virado relato: a DT de teste, o gatilho que disparou por uma
          importação errada. Relato de verdade se ENCERRA; este botão só
          aparece para quem tem a chave "excluir", que é a quarta do
          módulo justamente para não vir junto com "tratar". */}
      {podeExcluir && (
        <section className="so-na-tela mt-6 border-t border-slate-200 pt-4">
          <p className="mb-2 text-xs leading-snug text-slate-500">
            Este relato é um teste ou foi aberto por engano? Excluir apaga o documento e o plano de
            ação junto, <strong>sem desfazer</strong>. Um relato que aconteceu de verdade se
            encerra — ele é a prova de que o desvio foi tratado.
          </p>
          <BotaoExcluir
            action={excluirRelato}
            campos={{ id: r.id }}
            confirmacao={`Excluir o relato RA ${numeroDoRelato} e o plano de ação dele? Isso não pode ser desfeito.`}
            rotuloConfirmar="Excluir de vez"
          >
            🗑️ Excluir o relato RA {numeroDoRelato}
          </BotaoExcluir>
        </section>
      )}
    </div>
  );
}
