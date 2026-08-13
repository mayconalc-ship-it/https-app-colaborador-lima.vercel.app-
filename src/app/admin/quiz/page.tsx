import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { decodificar } from "@/lib/texto-url";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarPilares } from "@/lib/pilares";
import { AREAS, type AreaId } from "@/lib/areas";
import { hojeIso } from "@/lib/pesquisa";
import {
  getElegiveis,
  getPosicoesVisiveis,
  listarRodadas,
} from "@/lib/quiz-server";
import {
  PERGUNTAS_PADRAO,
  ROTULO_STATUS,
  nomeDoMes,
  periodoCurto,
  pilarSugerido,
} from "@/lib/quiz";
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
        <form
          action={salvarConfig}
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
        </form>
      )}

      {/* Nova rodada */}
      {podeCriar && (
        <details className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer p-4 font-semibold text-slate-800">
            ➕ Criar nova rodada
          </summary>
          <form action={criarRodada} className="space-y-3 border-t border-slate-100 p-4">
            <div className="flex gap-2">
              <Campo rotulo="Área" className="flex-1">
                <select
                  name="area"
                  required
                  defaultValue=""
                  className={ENTRADA}
                >
                  <option value="" disabled>
                    Escolha...
                  </option>
                  {AREAS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Mês" className="w-28">
                <select name="mes" defaultValue={mes} className={ENTRADA}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {nomeDoMes(m)}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Ano" className="w-24">
                <input
                  name="temporada"
                  type="number"
                  defaultValue={ano}
                  className={ENTRADA}
                />
              </Campo>
            </div>

            <Campo
              rotulo="Nome do desafio"
              ajuda="Deixe vazio para gerar automaticamente."
            >
              <input
                name="nome"
                placeholder={`Desafio de ${nomeDoMes(mes)} — Armazém`}
                className={ENTRADA}
              />
            </Campo>

            <div className="flex gap-2">
              <Campo rotulo="Pilar" className="flex-1">
                <select name="pilar" defaultValue="" className={ENTRADA}>
                  <option value="">— sem pilar —</option>
                  {pilares.map((p) => (
                    <option key={p.id} value={p.nome}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Perguntas" className="w-28">
                <input
                  name="total_perguntas"
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={PERGUNTAS_PADRAO}
                  className={ENTRADA}
                />
              </Campo>
            </div>

            <Campo
              rotulo="Padrão"
              ajuda="De onde as perguntas vão sair. É o acervo de Padrões do próprio app."
            >
              <select name="padrao_id" defaultValue="" className={ENTRADA}>
                <option value="">— nenhum —</option>
                {(padroes ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.pilar} · {p.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo
              rotulo="Atividade"
              ajuda="O recorte do padrão que este mês cobra. Ex.: Conferência de carregamento."
            >
              <input name="atividade" className={ENTRADA} />
            </Campo>

            <div className="flex gap-2">
              <Campo rotulo="Abre em" className="flex-1">
                <input
                  name="inicio"
                  type="date"
                  required
                  defaultValue={primeiroDia(ano, mes)}
                  className={ENTRADA}
                />
              </Campo>
              <Campo rotulo="Fecha em" className="flex-1">
                <input
                  name="fim"
                  type="date"
                  required
                  defaultValue={ultimoDia(ano, mes)}
                  className={ENTRADA}
                />
              </Campo>
            </div>

            <p className="text-xs text-slate-500">
              A rodada nasce em rascunho. Ela só aparece para o time depois que
              você cadastrar as perguntas e publicar. Sugestão de pilar:{" "}
              {AREAS.map((a) => `${a.curto} → ${pilarSugerido(a.id as AreaId)}`).join(
                " · ",
              )}
              .
            </p>

            <BotaoEnviar
              textoEnviando="Criando..."
              className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Criar rascunho
            </BotaoEnviar>
          </form>
        </details>
      )}

      {/* Rodadas */}
      {rodadas.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhuma rodada ainda. Crie a primeira acima.
        </div>
      ) : (
        <div className="space-y-6">
          {AREAS.map((a) => {
            const daArea = rodadas.filter((r) => r.area === a.id);
            if (daArea.length === 0) return null;
            return (
              <section key={a.id}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {a.rotulo}
                </h2>
                <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {daArea.map((r) => (
                    <Link
                      key={r.id}
                      href={`/admin/quiz/${r.id}`}
                      className="flex items-center gap-3 p-4 hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {r.nome}
                        </p>
                        <p className="text-xs text-slate-500">
                          {nomeDoMes(r.mes)}/{r.temporada} ·{" "}
                          {periodoCurto(r.inicio, r.fim)} · {r.totalPerguntas}{" "}
                          perguntas
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

const ENTRADA =
  "w-full rounded-lg border border-slate-200 p-2 text-base focus:border-primary focus:outline-none";

function Campo({
  rotulo,
  ajuda,
  className = "",
  children,
}: {
  rotulo: string;
  ajuda?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {rotulo}
      </label>
      {children}
      {ajuda && <p className="mt-1 text-xs text-slate-400">{ajuda}</p>}
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

function primeiroDia(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

function ultimoDia(ano: number, mes: number) {
  // Dia 0 do mês seguinte = último dia deste. Feito em UTC para não
  // depender do fuso do servidor.
  const d = new Date(Date.UTC(ano, mes, 0));
  return d.toISOString().slice(0, 10);
}
