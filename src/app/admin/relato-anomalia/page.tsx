import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { decodificar } from "@/lib/texto-url";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { ROTULO_GRUPO, type GrupoDeMetas } from "@/lib/metas";
import {
  carregarConfiguracaoDeGatilhos,
  temSerie,
  type LinhaDaConfiguracao,
} from "@/lib/gatilho-anomalia-server";
import { MINIMO_DE_PONTOS, SIGMAS_PADRAO } from "@/lib/gatilho-anomalia";
import { createAdminClient } from "@/lib/supabase/admin";
import { MINIMO_DE_CARRETAS } from "@/lib/blitz";
import { salvarChecklistDaBlitz, salvarGatilhos } from "./actions";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-base text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-xs font-semibold uppercase text-slate-500";

const fmt = (v: number | null | undefined, sufixo = "") =>
  v === null || v === undefined
    ? "—"
    : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${sufixo ? ` ${sufixo}` : ""}`;

export default async function ConfiguracaoDeGatilhosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("relato-anomalia", "editar");
  const revendaId = await exigirRevenda("/admin");
  const { erro, sucesso } = await searchParams;

  const linhas = await carregarConfiguracaoDeGatilhos(revendaId);

  // O checklist da blitz vem em separado, e o erro é engolido: sem a
  // migration 100 a seção some, em vez de derrubar a tela dos gatilhos.
  const { data: itensBanco } = await createAdminClient()
    .from("pa_blitz_itens")
    .select("id, pergunta, ajuda, grupo, ordem, ativo")
    .eq("revenda_id", revendaId)
    .order("ordem");
  const itensDaBlitz = (itensBanco ?? []) as {
    id: string;
    pergunta: string;
    ajuda: string | null;
    grupo: string | null;
    ordem: number;
    ativo: boolean;
  }[];
  const ligados = linhas.filter((l) => l.gatilho?.ativo).length;
  const disparando = linhas.filter((l) => l.avaliacao?.disparo).length;

  const grupos = [...new Set(linhas.map((l) => l.def.grupo))] as GrupoDeMetas[];

  return (
    <div>
      <PageHeader
        title="🚨 Relato de Anomalia — Gatilhos"
        subtitle="Quando um indicador sai da faixa normal, abre um relato para a liderança tratar."
      />

      {erro && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{decodificar(erro)}</p>
      )}
      {sucesso && (
        <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
          {decodificar(sucesso)}
        </p>
      )}

      {/*
        A EXPLICAÇÃO DA CONTA FICA NA TELA, e não num manual.

        Quem configura precisa saber por que o limite é aquele -- senão
        edita o número até "parar de incomodar", que é como um gatilho
        estatístico morre.
      */}
      <div className="mb-5 rounded-2xl border border-primary bg-primary-soft/40 p-4">
        <h2 className="text-sm font-bold text-primary-dark">Como o limite é calculado</h2>
        <p className="mt-1.5 text-sm text-slate-700">
          <strong>Média ± ({SIGMAS_PADRAO} × desvio padrão)</strong> das últimas medições. O lado
          depende do indicador: onde <em>menor é melhor</em> (avaria, TMA) o limite é para cima;
          onde <em>maior é melhor</em> (HL/hora, nota) é para baixo.
        </p>
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          <li>
            • Abaixo de <strong>{MINIMO_DE_PONTOS} medições</strong> o gatilho não dispara — com
            pouca amostra o desvio oscila demais e o limite viraria sorteio.
          </li>
          <li>
            • O <strong>limite escrito à mão</strong> manda na fórmula, e vale desde o primeiro dia.
            É o caminho para indicador que ainda não tem uma faixa estável.
          </li>
          <li>
            • Além do pico, o gatilho pega a <strong>deriva</strong>: 2 das últimas 3 medições
            passando de 1 desvio. É a piora lenta, que nunca cruza o limite e vira rotina.
          </li>
        </ul>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Indicador valor={String(ligados)} rotulo="com gatilho ligado" />
        <Indicador valor={String(linhas.length)} rotulo="indicadores no catálogo" />
        <Indicador
          valor={String(disparando)}
          rotulo="fora do limite hoje"
          alerta={disparando > 0}
        />
      </div>

      <form action={salvarGatilhos} className="space-y-5">
        {grupos.map((grupo) => {
          const doGrupo = linhas.filter((l) => l.def.grupo === grupo);
          const info = ROTULO_GRUPO[grupo];
          return (
            <section
              key={grupo}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="border-b border-slate-100 p-4">
                <h2 className="text-sm font-bold text-slate-900">
                  {info.emoji} {info.titulo}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">{info.ajuda}</p>
              </div>
              <div className="divide-y divide-slate-100">
                {doGrupo.map((linha) => (
                  <LinhaDoGatilho key={linha.def.chave} linha={linha} />
                ))}
              </div>
            </section>
          );
        })}

        {/* UM SALVAR PARA A TELA TODA, no fim. Treze botões numa grade do
            mesmo assunto é o padrão que o dono já apontou duas vezes. */}
        <div className="sticky bottom-4 z-10">
          <BotaoEnviar
            textoEnviando="Salvando..."
            className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg hover:bg-primary-dark"
          >
            Salvar gatilhos
          </BotaoEnviar>
        </div>
      </form>

      {/*
        O CHECKLIST DA BLITZ mora NESTA tela, e não numa própria.

        É o mesmo módulo e a mesma régua: a blitz usa o limite do gatilho
        de avaria que está logo acima. Separar em duas telas faria alguém
        calibrar o limite num lugar sem ver o checklist que ele aciona.
      */}
      <section className="mt-8">
        <h2 className="text-base font-bold text-slate-900">🚛 Checklist da blitz de carreta</h2>
        <p className="mt-1 text-sm text-slate-600">
          Quando a carreta, o motorista ou a transportadora passa do limite de{" "}
          <strong>avaria</strong> configurado acima — com pelo menos {MINIMO_DE_CARRETAS} cargas no
          histórico —, a portaria marca a chegada e o conferente responde este checklist antes de
          descarregar. Cada item <strong>NOK exige foto</strong>, e é ela que vai no relato de
          ocorrência ao transportador.
        </p>
        <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Este texto é para o time operacional revisar.</strong> As perguntas que já vêm
          cadastradas são um ponto de partida, escritas na língua da doca em vez do termo técnico —
          quem confere carreta todo dia corrige aqui, sem depender de mudança no sistema.
        </p>

        {itensDaBlitz.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
            Nenhuma pergunta cadastrada. Rode a migration 100 para o checklist nascer com as
            perguntas de partida — ou cadastre a primeira abaixo.
          </p>
        ) : null}

        <form action={salvarChecklistDaBlitz} className="mt-3 space-y-3">
          {itensDaBlitz.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm ${
                item.ativo ? "border-slate-200" : "border-slate-200 opacity-60"
              }`}
            >
              <input type="hidden" name="item_id" value={item.id} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <label className={rotulo}>Pergunta</label>
                  <input
                    name={`pergunta__${item.id}`}
                    defaultValue={item.pergunta}
                    maxLength={200}
                    className={campo}
                  />
                </div>
                <label className="mt-6 flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    name={`ativo__item__${item.id}`}
                    defaultChecked={item.ativo}
                    className="h-4 w-4"
                  />
                  Ativo
                </label>
              </div>

              <div className="mt-2">
                <label className={rotulo}>O que olhar (aparece embaixo da pergunta)</label>
                <input
                  name={`ajuda__${item.id}`}
                  defaultValue={item.ajuda ?? ""}
                  maxLength={300}
                  placeholder="Sem isso, dois conferentes marcam NOK por critérios diferentes."
                  className={campo}
                />
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className={rotulo}>Bloco</label>
                  <input
                    name={`grupo__${item.id}`}
                    defaultValue={item.grupo ?? ""}
                    maxLength={60}
                    placeholder="Ex.: Asa delta e grade"
                    className={campo}
                  />
                </div>
                <div>
                  <label className={rotulo}>Ordem</label>
                  <input
                    name={`ordem__${item.id}`}
                    type="number"
                    step={1}
                    defaultValue={item.ordem}
                    className={campo}
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4">
            <p className="text-sm font-bold text-slate-800">➕ Nova pergunta</p>
            <p className="mb-2 text-xs text-slate-500">
              Deixe em branco se não for cadastrar nenhuma — ela vai junto com o Salvar abaixo.
            </p>
            <div className="space-y-2">
              <input
                name="nova_pergunta"
                maxLength={200}
                placeholder="A pergunta, do jeito que o conferente lê na doca"
                className={campo}
              />
              <input
                name="nova_ajuda"
                maxLength={300}
                placeholder="O que olhar"
                className={campo}
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  name="novo_grupo"
                  maxLength={60}
                  placeholder="Bloco"
                  className={`${campo} sm:col-span-2`}
                />
                <input
                  name="nova_ordem"
                  type="number"
                  step={1}
                  placeholder="Ordem"
                  className={campo}
                />
              </div>
            </div>
          </div>

          <div className="sticky bottom-4 z-10">
            <BotaoEnviar
              textoEnviando="Salvando..."
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white shadow-lg hover:bg-primary-dark"
            >
              Salvar checklist da blitz
            </BotaoEnviar>
          </div>
        </form>
      </section>
    </div>
  );
}

function LinhaDoGatilho({ linha }: { linha: LinhaDaConfiguracao }) {
  const { def, gatilho, avaliacao } = linha;
  const serieLigada = temSerie(def.chave);
  const base = avaliacao?.base;
  const disparo = avaliacao?.disparo;

  return (
    <div className={`p-4 ${disparo ? "bg-red-50/60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{def.rotulo}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {def.sentido === "menor_melhor" ? "↓ menor é melhor" : "↑ maior é melhor"}
            {def.sufixo && ` · ${def.sufixo}`}
          </p>
        </div>

        {/* O LIGA/DESLIGA é uma caixa, e não um botão que salva sozinho:
            quem calibra mexe em vários e salva uma vez. */}
        <label className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            name={`ativo__${def.chave}`}
            defaultChecked={gatilho?.ativo ?? false}
            className="h-4 w-4"
          />
          Vigiar
        </label>
      </div>

      {/*
        A ESTATÍSTICA VIVA, ao lado dos campos.

        É o que separa configurar de chutar: um campo "limite" sozinho é
        um palpite; ao lado da média, do desvio e de quantos dias já
        existem, vira decisão.
      */}
      {!serieLigada ? (
        <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500">
          Série ainda não ligada neste indicador — dá para configurar o gatilho, mas ele só passa a
          avaliar quando a leitura for conectada. Recebimento vem primeiro.
        </p>
      ) : !base?.confiavel ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          ⏳ {base?.motivo}
          {base && base.pontos > 0 && ` (média até aqui: ${fmt(base.media, def.sufixo)})`}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
          <span>
            <strong>{base.pontos}</strong> medições
          </span>
          <span>
            média <strong>{fmt(base.media, def.sufixo)}</strong>
          </span>
          <span>
            desvio <strong>{fmt(base.desvio)}</strong>
          </span>
          <span className={avaliacao?.limiteManual ? "text-primary-dark" : ""}>
            limite <strong>{fmt(avaliacao?.limite ?? null, def.sufixo)}</strong>
            {avaliacao?.limiteManual && " (escrito à mão)"}
          </span>
        </div>
      )}

      {disparo && (
        <p className="mt-2 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-800">
          🚨 Fora do limite em {disparo.ponto.dia.split("-").reverse().join("/")} —{" "}
          {disparo.explicacao}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div>
          <label className={rotulo}>Desvios (padrão {SIGMAS_PADRAO})</label>
          <input
            name={`sigmas__${def.chave}`}
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0.1"
            max="6"
            defaultValue={gatilho?.sigmas ?? SIGMAS_PADRAO}
            className={campo}
          />
        </div>
        <div>
          <label className={rotulo}>Limite à mão {def.sufixo && `(${def.sufixo})`}</label>
          <input
            name={`limite__${def.chave}`}
            type="number"
            inputMode="decimal"
            step="any"
            placeholder="usa a fórmula"
            defaultValue={gatilho?.limite_manual ?? ""}
            className={campo}
          />
        </div>
        <div>
          <label className={rotulo}>Mín. de medições</label>
          <input
            name={`minimo__${def.chave}`}
            type="number"
            min={2}
            step={1}
            defaultValue={gatilho?.minimo_pontos ?? MINIMO_DE_PONTOS}
            className={campo}
          />
        </div>
      </div>

      <div className="mt-2">
        <label className={rotulo}>Observação (por que este limite)</label>
        <input
          name={`obs__${def.chave}`}
          defaultValue={gatilho?.observacao ?? ""}
          placeholder="Ex.: acima de 5% a gente trata, independente da média."
          maxLength={200}
          className={campo}
        />
      </div>
    </div>
  );
}

function Indicador({
  valor,
  rotulo: texto,
  alerta = false,
}: {
  valor: string;
  rotulo: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 text-center shadow-sm ${
        alerta ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
      }`}
    >
      <p
        className={`text-xl font-bold tabular-nums ${alerta ? "text-red-700" : "text-slate-900"}`}
      >
        {valor}
      </p>
      <p className="text-xs leading-tight text-slate-500">{texto}</p>
    </div>
  );
}
