import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { MaisOuFechar } from "@/components/BotaoMais";
import { FormNoLugar } from "@/components/FormNoLugar";
import { decodificar } from "@/lib/texto-url";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarPilares } from "@/lib/pilares";
import { AREAS } from "@/lib/areas";
import { hojeIso } from "@/lib/pesquisa";
import {
  getElegiveis,
  getPosicoesVisiveis,
  listarRodadas,
} from "@/lib/quiz-server";
import {
  ROTULO_STATUS,
  mesAno,
  periodoCurto,
  type UsoDePadrao,
} from "@/lib/quiz";
import { FormNovaRodada } from "@/components/quiz/FormNovaRodada";
import { criarRodada, salvarConfig } from "./actions";

export default async function AdminQuizPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("quiz", "ver");
  const { erro, sucesso } = await searchParams;

  const revendaId = (await getRevendaId())!;
  const [podeCriar, podeEditar] = await Promise.all([
    podeNoModulo("quiz", "criar"),
    podeNoModulo("quiz", "editar"),
  ]);

  const admin = createAdminClient();
  const [rodadas, posicoes, pilares, { data: padroes }, du, al] =
    await Promise.all([
      listarRodadas(revendaId),
      getPosicoesVisiveis(revendaId),
      listarPilares(true),
      admin
        .from("padroes")
        .select("id, nome, pilar")
        .eq("revenda_id", revendaId)
        .order("nome"),
      getElegiveis(revendaId, "DU"),
      getElegiveis(revendaId, "AL"),
    ]);

  const hoje = hojeIso();
  const [ano, mes] = hoje.split("-").map(Number);

  // O que o formulário precisa para marcar os padrões já cobrados em cada
  // área. Rascunho entra também: quem criou e não publicou ainda está
  // usando aquele padrão.
  const usos: UsoDePadrao[] = rodadas.map((r) => ({
    rodadaId: r.id,
    nome: r.nome,
    area: r.area,
    mes: r.mes,
    temporada: r.temporada,
    status: r.status,
    padraoId: r.padraoId,
    padraoNome: r.padraoNome,
  }));

  return (
    <div>
      <PageHeader
        title="🧠 Desafio do Mês"
        subtitle="Quiz dos padrões, com campeonato por área"
      />

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

      {/* Quem pode participar */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Cartao valor={du.daArea} rotulo="na Distribuição" />
        <Cartao valor={al.daArea} rotulo="no Armazém" />
      </div>

      {du.semArea > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <span className="font-semibold">
            {du.semArea} colaborador{du.semArea === 1 ? "" : "es"} sem área
            definida
          </span>{" "}
          — quem está assim não consegue entrar em nenhum desafio. O campo é o
          &quot;Área&quot; do cadastro, em{" "}
          <Link href="/admin/colaboradores" className="underline">
            Colaboradores
          </Link>
          . Vale &quot;Distribuição Urbana&quot; ou &quot;Apoio
          Logístico/Armazém&quot;.
        </p>
      )}

      {/* Configuração da tabela */}
      {podeEditar && (
        <FormNoLugar
          acao={salvarConfig}
          className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="font-semibold text-slate-800">
            Posições visíveis na classificação
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Quantas posições o colaborador enxerga na tabela. Quem estiver fora
            dessa faixa continua vendo a própria posição, sempre — só não vê os
            nomes dos outros que também estão fora.
          </p>
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <label
                htmlFor="posicoes"
                className="mb-1 block text-xs font-medium text-slate-600"
              >
                Top N
              </label>
              <select
                id="posicoes"
                name="posicoes_visiveis"
                defaultValue={posicoes}
                className="w-full rounded-lg border border-slate-200 p-2 text-base focus:border-primary focus:outline-none"
              >
                {[5, 8, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    Top {n}
                    {n === 8 ? " — G4 + 4 abaixo (padrão)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <BotaoEnviar
              textoEnviando="Salvando..."
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Salvar
            </BotaoEnviar>
          </div>
        </FormNoLugar>
      )}

      {/* Nova rodada */}
      {podeCriar && (
        <details
          className="group mb-6 rounded-2xl border border-primary/30 bg-white shadow-sm"
          // Sem rodada nenhuma, a tela não tem outra coisa a oferecer:
          // já abre no formulário.
          open={rodadas.length === 0}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-semibold text-primary-dark marker:content-none [&::-webkit-details-marker]:hidden">
            <MaisOuFechar />
            <span className="group-open:hidden">Criar o desafio do mês</span>
            <span className="hidden group-open:inline">Fechar</span>
          </summary>
          <FormNovaRodada
            acao={criarRodada}
            pilares={pilares}
            padroes={(padroes ?? []) as { id: number; nome: string; pilar: string | null }[]}
            usos={usos}
            anoAtual={ano}
            mesAtual={mes}
          />
        </details>
      )}

      {/* ---- Histórico por área ----
          Pedido do dono (02/10/2026): "coloque no histórico, do armazém e
          DU, os desafios e quais padrões foram de cada mês". A lista já
          existia, mas dizia o nome e o período -- e o nome sai sozinho
          ("Desafio de Agosto — Armazém"), sem o assunto. O que se procura
          aqui é DO QUE foi cada mês: padrão, pilar e atividade, com o mês
          na frente. */}
      {rodadas.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhum desafio ainda. Crie o primeiro acima.
        </div>
      ) : (
        <div className="space-y-6">
          {AREAS.map((a) => {
            const daArea = rodadas.filter((r) => r.area === a.id);
            if (daArea.length === 0) return null;
            return (
              <section key={a.id}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {a.id === "AL" ? "🏭" : "🚚"} Histórico — {a.curto}
                  <span className="ml-1 font-normal normal-case tracking-normal text-slate-400">
                    ({daArea.length} desafio{daArea.length === 1 ? "" : "s"})
                  </span>
                </h2>
                <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {daArea.map((r) => (
                    <Link
                      key={r.id}
                      href={`/admin/quiz/${r.id}`}
                      className="flex items-start gap-3 p-4 hover:bg-slate-50"
                    >
                      <span className="w-16 shrink-0 rounded-lg bg-primary-soft py-1.5 text-center text-xs font-bold text-primary-dark">
                        {mesAno(r.mes, r.temporada)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">
                          📄 {r.padraoNome ?? <span className="font-normal italic text-slate-400">sem padrão definido</span>}
                        </p>
                        {(r.pilar || r.atividade) && (
                          <p className="mt-0.5 text-xs text-slate-600">
                            {[r.pilar && `Pilar ${r.pilar}`, r.atividade].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-slate-400">
                          {r.nome} · {periodoCurto(r.inicio, r.fim)} · {r.totalPerguntas} perguntas
                        </p>
                      </div>
                      <Etiqueta status={r.status} />
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Etiqueta({ status }: { status: keyof typeof ROTULO_STATUS }) {
  const cor =
    status === "publicada"
      ? "bg-emerald-100 text-emerald-700"
      : status === "encerrada"
        ? "bg-slate-100 text-slate-600"
        : "bg-amber-100 text-amber-700";

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${cor}`}
    >
      {ROTULO_STATUS[status]}
    </span>
  );
}

function Cartao({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm">
      <p className="text-2xl font-bold tabular-nums text-slate-900">{valor}</p>
      <p className="text-xs text-slate-500">{rotulo}</p>
    </div>
  );
}
