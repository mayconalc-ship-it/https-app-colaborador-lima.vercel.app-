import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { FotoEvidencia } from "@/components/FotoEvidencia";
import { RelatoDeOcorrencia } from "@/components/blitz/RelatoDeOcorrencia";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { decodificar } from "@/lib/texto-url";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import {
  ROTULO_DIMENSAO,
  assuntoDaOcorrencia,
  textoDaOcorrencia,
  type DadosDaOcorrencia,
  type Dimensao,
} from "@/lib/blitz";
import { registrarTratativa } from "./actions";

export const dynamic = "force-dynamic";

type LinhaBlitz = {
  id: string;
  atendimento_id: string;
  status: "pendente" | "concluida" | "tratada";
  gatilho_dimensao: Dimensao | null;
  gatilho_nome: string | null;
  transportadora_nome: string | null;
  media_avaria_pct: number | null;
  limite_pct: number | null;
  carretas_consideradas: number | null;
  conferente_nome: string | null;
  iniciada_em: string | null;
  concluida_em: string | null;
  tratada_em: string | null;
  tratada_por_nome: string | null;
  tratativa: string | null;
};

type LinhaResposta = {
  id: string;
  pergunta: string;
  resposta: "ok" | "nok" | "na";
  observacao: string | null;
  foto_url: string | null;
};

/**
 * A TRATATIVA DA BLITZ -- o que a liderança faz com o que o conferente viu.
 *
 * A tela é montada na ordem da decisão: por que a carreta foi parada, o
 * que foi encontrado (com as fotos), o e-mail já escrito, e só então o
 * campo do que foi tratado. Quem abre isto tem cinco minutos entre duas
 * carretas -- ler, decidir e mandar tem que caber neles.
 */
export default async function TratativaDaBlitzPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  await requireModulo("relato-anomalia", "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const { id } = await params;
  const { erro } = await searchParams;
  const admin = createAdminClient();

  const { data: blitzBanco } = await admin
    .from("pa_blitz")
    .select(
      "id, atendimento_id, status, gatilho_dimensao, gatilho_nome, transportadora_nome, media_avaria_pct, limite_pct, carretas_consideradas, conferente_nome, iniciada_em, concluida_em, tratada_em, tratada_por_nome, tratativa",
    )
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  const blitz = blitzBanco as LinhaBlitz | null;
  if (!blitz) notFound();

  const [{ data: atendimento }, { data: respostasBanco }, { data: revenda }] = await Promise.all([
    admin
      .from("atendimentos_carretas")
      .select("id, numero_dt, placa_carreta, placa_cavalo, motorista_nome, chegada_em")
      .eq("id", blitz.atendimento_id)
      .maybeSingle(),
    admin
      .from("pa_blitz_respostas")
      .select("id, pergunta, resposta, observacao, foto_url")
      .eq("blitz_id", blitz.id)
      .order("criado_em"),
    admin.from("revendas").select("nome").eq("id", revendaId).maybeSingle(),
  ]);

  const respostas = (respostasBanco ?? []) as LinhaResposta[];
  const nok = respostas.filter((r) => r.resposta === "nok");

  const dados: DadosDaOcorrencia = {
    transportadora: blitz.transportadora_nome ?? "—",
    placaCarreta: atendimento?.placa_carreta ?? "—",
    placaCavalo: atendimento?.placa_cavalo ?? "—",
    motorista: atendimento?.motorista_nome ?? "—",
    numeroDt: atendimento?.numero_dt ?? "—",
    chegadaEm: atendimento?.chegada_em ?? new Date().toISOString(),
    conferente: blitz.conferente_nome ?? "—",
    revenda: revenda?.nome ?? "Recebimento",
    respostas: respostas.map((r) => ({
      pergunta: r.pergunta,
      resposta: r.resposta,
      observacao: r.observacao,
      fotoUrl: r.foto_url,
    })),
    dimensao: blitz.gatilho_dimensao,
    nomeDoIndice: blitz.gatilho_nome,
    mediaAvaria: blitz.media_avaria_pct,
    limite: blitz.limite_pct,
  };

  const tratada = blitz.status === "tratada";

  return (
    <div>
      <PageHeader
        title="🚨 Blitz de carreta"
        subtitle={`${atendimento?.placa_carreta ?? "—"} — DT ${atendimento?.numero_dt ?? "—"}`}
        fecharHref="/gestao/anomalias"
      />

      {erro && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">
          {decodificar(erro)}
        </p>
      )}

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-bold text-slate-900">
          {blitz.gatilho_dimensao && blitz.gatilho_nome
            ? `${ROTULO_DIMENSAO[blitz.gatilho_dimensao]} ${blitz.gatilho_nome}`
            : "Inspeção de recebimento"}
        </p>
        {blitz.media_avaria_pct !== null && blitz.limite_pct !== null && (
          <p className="mt-1 text-xs text-slate-600">
            Média de <strong>{blitz.media_avaria_pct}%</strong> de avaria
            {blitz.carretas_consideradas ? ` em ${blitz.carretas_consideradas} cargas` : ""} — limite
            de <strong>{blitz.limite_pct}%</strong>. O número está congelado no dia da inspeção.
          </p>
        )}
        <div className="mt-2 grid gap-x-4 gap-y-0.5 text-xs text-slate-600 sm:grid-cols-2">
          <p>Transportadora: {blitz.transportadora_nome ?? "—"}</p>
          <p>Motorista: {atendimento?.motorista_nome ?? "—"}</p>
          <p>Cavalo: {atendimento?.placa_cavalo ?? "—"}</p>
          <p>Chegada: {atendimento ? formatarDataHora(atendimento.chegada_em) : "—"}</p>
          <p>Conferente: {blitz.conferente_nome ?? "—"}</p>
          <p>
            Inspeção concluída: {blitz.concluida_em ? formatarDataHora(blitz.concluida_em) : "—"}
          </p>
        </div>
        <Link
          href={`/carretas-conferencia/${blitz.atendimento_id}`}
          className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
        >
          Ver o atendimento completo →
        </Link>
      </section>

      {/* O QUE FOI ENCONTRADO -- só o NOK em destaque, com a foto ao lado.
          A lista inteira fica abaixo, para quem quiser conferir que o
          resto foi olhado. */}
      <section className="mb-4">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
          Não conformidades
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {nok.length}
          </span>
        </h2>
        {nok.length === 0 ? (
          <p className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
            ✅ A inspeção não encontrou não conformidade. Vale registrar a tratativa mesmo assim — é
            o registro de que a carreta marcada foi olhada.
          </p>
        ) : (
          <ul className="space-y-2">
            {nok.map((r) => (
              <li key={r.id} className="rounded-2xl border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-900">{r.pergunta}</p>
                {r.observacao && <p className="mt-1 text-xs text-red-800">{r.observacao}</p>}
                {r.foto_url && (
                  <div className="mt-2">
                    <FotoEvidencia
                      src={r.foto_url}
                      alt={`Evidência: ${r.pergunta}`}
                      classeCaixa="h-44 w-full"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-700">
          Checklist completo ({respostas.length} itens)
        </summary>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {respostas.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 p-3">
              <span className="text-xs text-slate-700">{r.pergunta}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  r.resposta === "nok"
                    ? "bg-red-100 text-red-700"
                    : r.resposta === "ok"
                      ? "bg-green-100 text-green-700"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {r.resposta.toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      </details>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">✉️ Relato de ocorrência</h2>
        <p className="mb-3 mt-0.5 text-xs text-slate-500">
          Já escrito com os dados da carreta, os itens NOK e o link de cada foto. Revise, ajuste o
          que quiser e envie da sua caixa — o app não envia por você de propósito: o rastro que a
          auditoria procura é o do e-mail corporativo de quem tratou.
        </p>
        <RelatoDeOcorrencia
          assunto={assuntoDaOcorrencia(dados)}
          textoInicial={textoDaOcorrencia(dados)}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">O que foi tratado</h2>
        {tratada ? (
          <>
            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-800">
              {blitz.tratativa}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Registrado por {blitz.tratada_por_nome ?? "—"}
              {blitz.tratada_em ? ` em ${formatarDataHora(blitz.tratada_em)}` : ""}.
            </p>
          </>
        ) : (
          <form action={registrarTratativa} className="mt-2 space-y-2">
            <input type="hidden" name="blitz_id" value={blitz.id} />
            <textarea
              name="tratativa"
              rows={4}
              required
              placeholder="Ex.: relato enviado ao transportador em 05/09; frota comprometeu-se a trocar a asa delta da PCN-0509 até 12/09; carreta bloqueada para carga refrigerada até a correção."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
            />
            <p className="text-xs text-slate-500">
              Escreva o que foi feito, com quem e até quando. É esta frase que responde ao auditor
              quando ele pergunta o que a operação faz com as carretas que ativam o gatilho.
            </p>
            <BotaoEnviar
              textoEnviando="Registrando..."
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-dark"
            >
              Registrar tratativa e encerrar a blitz
            </BotaoEnviar>
          </form>
        )}
      </section>
    </div>
  );
}
