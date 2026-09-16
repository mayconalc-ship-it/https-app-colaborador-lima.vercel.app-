import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { getRevendaAtiva } from "@/lib/revendas";
import { podeNoModulo, requireGestor } from "@/lib/require-admin";
import { montarResumoSemanal } from "@/lib/resumo-semanal-server";
import {
  agoraEmSP,
  rotuloDaSemana,
  semanaAnterior,
  semanaQueComecaEm,
  somarDias,
} from "@/lib/resumo-semanal";
import { formatarDias } from "@/lib/material-apoio";

export const dynamic = "force-dynamic";

const numero = (n: number, casas = 0) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

/**
 * RESUMO DA SEMANA (16/09/2026, pedido do dono).
 *
 * É o destino do aviso de segunda-feira, e também abre a qualquer hora
 * pelo Painel de Gestão. Cada bloco só aparece para quem pode ver o módulo
 * dele -- a mesma porta da tela de origem. O aviso é igual para toda a
 * liderança; o que cada um enxerga aqui, não.
 */
export default async function ResumoSemanalPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  await requireGestor();
  const { semana: semanaParam } = await searchParams;

  const ultimaFechada = semanaAnterior(agoraEmSP().dia);
  const pedida = semanaQueComecaEm(semanaParam);
  // Semana que ainda não fechou não tem resumo: os números mudariam a cada hora.
  const semana = pedida && pedida.inicio <= ultimaFechada.inicio ? pedida : ultimaFechada;

  const revenda = await getRevendaAtiva();
  if (!revenda) {
    return (
      <div>
        <PageHeader title="🗓️ Resumo da semana" />
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Você não está em nenhuma revenda.
        </p>
      </div>
    );
  }

  const [resumo, verArmazem, verPraticas, verMaterial, verFeedbacks, verAG] = await Promise.all([
    montarResumoSemanal(revenda.id, semana),
    podeNoModulo("produtividade-armazem", "ver"),
    podeNoModulo("boas-praticas", "ver"),
    podeNoModulo("material-apoio", "ver"),
    podeNoModulo("feedbacks", "ver"),
    podeNoModulo("ativo-giro", "ver"),
  ]);

  const armazem = verArmazem ? resumo.armazem : null;
  const praticas = verPraticas ? resumo.boasPraticas : null;
  const material = verMaterial ? resumo.materialApoio : null;
  const cincoPorques = verFeedbacks ? resumo.cincoPorques : null;
  const ag = verAG ? resumo.ativoGiro : null;
  const temPendencia = praticas || material || cincoPorques || ag;

  const anterior = somarDias(semana.inicio, -7);
  const proxima = somarDias(semana.inicio, 7);

  return (
    <div className="space-y-6">
      <PageHeader title="🗓️ Resumo da semana" subtitle={`${revenda.nome} — segunda a domingo, ${rotuloDaSemana(semana)}`} />

      <nav className="flex items-center justify-between gap-2">
        <Link
          href={`/gestao/resumo-semanal?semana=${anterior}`}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-primary"
        >
          ← Semana anterior
        </Link>
        {proxima <= ultimaFechada.inicio && (
          <Link
            href={`/gestao/resumo-semanal?semana=${proxima}`}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-primary"
          >
            Próxima semana →
          </Link>
        )}
      </nav>

      {temPendencia && (
        <section>
          <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">⏳ Pendências de agora</h2>
          <p className="mb-2 px-1 text-xs text-slate-400">
            Não são da semana: são o que está esperando alguém hoje, para não mandar ninguém atrás do que já foi resolvido.
          </p>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {praticas && (
              <Pendencia
                emoji="💡"
                titulo="Boas Práticas para avaliar"
                valor={praticas.emAnalise}
                detalhe={praticas.emAnalise === 0 ? "Nenhuma sugestão esperando." : "Sugestões esperando a análise da liderança."}
                href="/admin/boas-praticas"
              />
            )}
            {material && (
              <Pendencia
                emoji="🧰"
                titulo="Material de Apoio abaixo da mínima"
                valor={material.abaixo.length}
                detalhe={
                  material.abaixo.length + material.perto.length === 0
                    ? "Todo material dentro da política."
                    : [
                        ...material.abaixo.map((m) => `🚨 ${m.nome}${m.dias != null ? ` (${formatarDias(m.dias)} dias)` : ""}`),
                        ...material.perto.map((m) => `⚠️ ${m.nome}${m.dias != null ? ` (${formatarDias(m.dias)} dias)` : ""}`),
                      ].join(" · ")
                }
                href="/material-de-apoio"
              />
            )}
            {cincoPorques && (
              <Pendencia
                emoji="🧠"
                titulo="5 Porquês esperando resposta"
                valor={cincoPorques.tratativasPendentes}
                detalhe={
                  cincoPorques.tratativasPendentes === 0
                    ? "Nenhuma análise esperando a tratativa."
                    : "Análises concluídas pelo motorista, sem a devolutiva da liderança."
                }
                href="/gestao/feedbacks?aba=5-porques"
              />
            )}
            {ag && (
              <Pendencia
                emoji="📦"
                titulo="Recontagens de AG abertas"
                valor={ag.recontagensAbertas}
                detalhe={`Na semana: ${ag.diasContados} dia(s) com contagem, ${ag.diasCongelados} congelado(s).`}
                href="/ativo-de-giro?aba=conciliacao"
              />
            )}
          </ul>
        </section>
      )}

      {armazem && (
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">🏭 Armazém na semana</h2>

          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Meta titulo="Reepack" pct={armazem.reepackPctMeta} volume={`${numero(armazem.totalReepacks)} cx`} />
            <Meta titulo="Despejo" pct={armazem.despejoPctMeta} volume={`${numero(armazem.totalDespejoLitros)} L`} />
            <Numero titulo="Picking" valor={`${numero(armazem.hlPicking, 1)} HL`} />
            <Numero titulo="Bate Palete" valor={`${numero(armazem.hlBatePalete, 1)} HL`} />
          </div>
          <p className="mb-3 px-1 text-xs text-slate-400">
            {armazem.pessoas} pessoa(s) apontaram {numero(armazem.horasApontadas, 1)} h. A % da meta é ponderada pelas
            horas, a mesma conta do ranking.
          </p>

          {armazem.ranking.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Ninguém chegou a 1 h apontada na semana — sem ranking.
            </p>
          ) : (
            <ol className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
              {armazem.ranking.slice(0, 5).map((r, i) => (
                <li key={r.colaboradorId} className="flex items-center gap-3 p-3">
                  <span className="w-7 text-center text-lg">{["🥇", "🥈", "🥉"][i] ?? <span className="text-sm font-bold text-slate-500">{i + 1}</span>}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{r.colaboradorNome}</span>
                    <span className="block text-xs text-slate-500">{numero(r.horasApontadas, 1)} h apontadas</span>
                  </span>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold tabular-nums text-slate-700">
                    {r.pontuacao} pts
                  </span>
                </li>
              ))}
            </ol>
          )}
          <Link
            href={`/gestao/armazem?de=${semana.inicio}&ate=${semana.fim}`}
            className="mt-2 inline-block px-1 text-sm font-semibold text-primary hover:underline"
          >
            Ver o ranking completo →
          </Link>
        </section>
      )}

      {!armazem && !temPendencia && (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Nenhum dos módulos deste resumo está liberado para você nesta revenda.
        </p>
      )}
    </div>
  );
}

function Pendencia({
  emoji,
  titulo,
  valor,
  detalhe,
  href,
}: {
  emoji: string;
  titulo: string;
  valor: number;
  detalhe: string;
  href: string;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 p-3 hover:bg-slate-50">
        <span className="text-xl">{emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-900">{titulo}</span>
          <span className="block text-xs text-slate-500">{detalhe}</span>
        </span>
        <span
          className={`min-w-9 rounded-lg px-2 py-1 text-center text-sm font-bold tabular-nums ${
            valor > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {valor}
        </span>
      </Link>
    </li>
  );
}

function Meta({ titulo, pct, volume }: { titulo: string; pct: number | null; volume: string }) {
  const bateu = pct !== null && pct >= 100;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-500">{titulo}</p>
      <p className={`text-xl font-bold tabular-nums ${pct === null ? "text-slate-400" : bateu ? "text-emerald-700" : "text-amber-700"}`}>
        {pct === null ? "sem meta" : `${bateu ? "✅" : "⚠️"} ${numero(pct)}%`}
      </p>
      <p className="text-xs text-slate-500">{volume}</p>
    </div>
  );
}

function Numero({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-500">{titulo}</p>
      <p className="text-xl font-bold tabular-nums text-slate-900">{valor}</p>
      <p className="text-xs text-slate-500">volume da semana</p>
    </div>
  );
}
