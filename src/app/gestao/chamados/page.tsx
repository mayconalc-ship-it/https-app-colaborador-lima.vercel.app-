import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ExportarCsv } from "@/components/ExportarCsv";
import { CartaoChamado } from "@/components/chamados/CartaoChamado";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { requireModulo } from "@/lib/require-admin";
import { lerTudo } from "@/lib/ler-tudo";
import {
  calcularIndicadores,
  dataHora,
  emAberto,
  formatarDuracao,
  pct,
  protocolo,
  rotuloPrioridade,
  rotuloStatus,
  rotuloTipo,
  situacaoDoPrazo,
} from "@/lib/chamados";
import { CAMPOS_CHAMADO, type Chamado } from "@/lib/chamados-server";
import { BarraRanking, CartaoHero } from "../armazem/Graficos";

export const dynamic = "force-dynamic";

const PERIODOS = [
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
  { dias: 365, rotulo: "12 meses" },
] as const;

/**
 * O PAINEL DOS CHAMADOS -- o que a auditoria do DPO pergunta da
 * manutenção, na ordem em que pergunta:
 *   8.2  o que está aberto e o que estourou o prazo (agora, sem período);
 *   9.2  quanto fechou no prazo e quanto foi reaberto (no período);
 *   9.1  a nota de quem pediu;
 *   7.2  onde e em que tipo de serviço os chamados se concentram.
 */
export default async function GestaoChamadosPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await requireModulo("chamados", "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const sp = await searchParams;
  const dias = PERIODOS.find((p) => String(p.dias) === sp.p)?.dias ?? 30;
  const agora = new Date();
  const desde = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000).toISOString();

  const admin = createAdminClient();
  const [doPeriodo, abertosAgora] = await Promise.all([
    lerTudo<Chamado>((a, b) =>
      admin
        .from("chamados")
        .select(CAMPOS_CHAMADO)
        .eq("revenda_id", revendaId)
        .gte("aberto_em", desde)
        .order("aberto_em", { ascending: false })
        .range(a, b) as unknown as PromiseLike<{ data: Chamado[] | null; error: unknown }>,
    ),
    // O backlog é de AGORA, não do período: um chamado de 4 meses atrás
    // ainda aberto é justamente o que mais precisa aparecer.
    lerTudo<Chamado>((a, b) =>
      admin
        .from("chamados")
        .select(CAMPOS_CHAMADO)
        .eq("revenda_id", revendaId)
        .in("status", ["aberto", "em_atendimento", "aguardando"])
        .order("prazo_em")
        .range(a, b) as unknown as PromiseLike<{ data: Chamado[] | null; error: unknown }>,
    ),
  ]);

  const ind = calcularIndicadores(doPeriodo, agora);
  const atrasados = abertosAgora.filter((c) => situacaoDoPrazo(c, agora).tipo === "atrasado");
  const semNinguem = abertosAgora.filter((c) => c.status === "aberto").length;
  const fmtHoras = (ms: number | null) => (ms === null ? "—" : formatarDuracao(ms));

  return (
    <div className="space-y-6">
      <PageHeader title="🔧 Chamados para Manutenção" subtitle="Prazo, reabertos e a nota de quem pediu — o DPO 8.2, 9.1 e 9.2" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex gap-1 rounded-xl bg-slate-100 p-1" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link
              key={p.dias}
              href={`/gestao/chamados?p=${p.dias}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                p.dias === dias ? "bg-white text-primary-dark shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {p.rotulo}
            </Link>
          ))}
        </nav>
        <ExportarCsv
          nome="chamados-manutencao"
          complemento={`${dias}-dias`}
          cabecalho={[
            "Protocolo",
            "Aberto em",
            "Área",
            "Tipo",
            "Prioridade",
            "Status",
            "Solicitante",
            "Responsável",
            "Prazo",
            "Concluído em",
            "No prazo",
            "Reaberturas",
            "Confirmação",
            "Nota",
            "Descrição",
            "Solução",
          ]}
          linhas={doPeriodo.map((c) => {
            const s = situacaoDoPrazo(c, agora);
            return [
              protocolo(c.numero),
              dataHora(c.aberto_em),
              c.local_nome,
              rotuloTipo(c.tipo),
              rotuloPrioridade(c.prioridade),
              rotuloStatus(c.status),
              c.solicitante_nome,
              c.responsavel_nome ?? "",
              dataHora(c.prazo_em),
              c.concluido_em ? dataHora(c.concluido_em) : "",
              s.tipo === "cumprido" ? "Sim" : s.tipo === "estourado" ? "Não" : "",
              c.reaberturas,
              c.confirmacao === "resolvido" ? "Resolvido" : "",
              c.avaliacao ?? "",
              c.descricao,
              c.solucao ?? "",
            ];
          })}
        />
      </div>

      {/* ---- Agora ---- */}
      <section className="grid gap-3 sm:grid-cols-3">
        <CartaoHero
          titulo="Em aberto agora"
          valor={String(abertosAgora.length)}
          legenda={`${semNinguem} sem ninguém assumir`}
        />
        <CartaoHero
          titulo="⏰ Atrasados agora"
          valor={String(atrasados.length)}
          legenda={atrasados.length ? "Prazo estourado e ainda em aberto" : "Nenhum chamado com prazo estourado"}
          alerta={atrasados.length > 0}
          positivo={atrasados.length === 0 && abertosAgora.length > 0}
        />
        <CartaoHero
          titulo="Abertos no período"
          valor={String(ind.total)}
          legenda={`${ind.concluidos} concluídos · ${ind.cancelados} cancelados`}
        />
      </section>

      {/* ---- No período ---- */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Atendimento nos últimos {PERIODOS.find((p) => p.dias === dias)?.rotulo}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CartaoHero titulo="Concluídos no prazo" valor={pct(ind.noPrazo)} legenda={`de ${ind.concluidos} concluídos`} />
          <CartaoHero
            titulo="Tempo médio de solução"
            valor={fmtHoras(ind.tempoMedioSolucaoMs)}
            legenda={`até alguém assumir: ${fmtHoras(ind.tempoMedioRespostaMs)}`}
          />
          <CartaoHero
            titulo="Reabertos"
            valor={pct(ind.reabertos)}
            legenda="Quem pediu disse que não resolveu"
            alerta={(ind.reabertos ?? 0) > 0}
          />
          <CartaoHero
            titulo="Nota de quem pediu"
            valor={ind.notaMedia === null ? "—" : `${ind.notaMedia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ★`}
            legenda={`${ind.avaliacoes} ${ind.avaliacoes === 1 ? "avaliação" : "avaliações"}`}
          />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <BarraRanking
          titulo="Por tipo de serviço"
          itens={ind.porTipo.map((t) => ({ rotulo: t.chave, valor: t.total }))}
          sufixo=""
          vazio="Nenhum chamado no período."
        />
        <BarraRanking
          titulo="Áreas com mais chamados"
          subtitulo="Área que se repete é candidata a preventiva (DPO 6.2)."
          itens={ind.porLocal.slice(0, 10).map((t) => ({ rotulo: t.chave, valor: t.total }))}
          sufixo=""
          tom="gold"
          vazio="Nenhum chamado no período."
        />
      </section>

      {/* ---- O que está esperando ---- */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          ⏰ Atrasados agora <span className="text-slate-400">({atrasados.length})</span>
        </h2>
        {atrasados.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500">Nenhum. 🎉</p>
        ) : (
          <ul className="space-y-2">
            {atrasados.map((c) => (
              <li key={c.id}>
                <CartaoChamado chamado={c} href={`/chamados/${c.id}`} agora={agora} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Chamados do período <span className="text-slate-400">({doPeriodo.length})</span>
        </h2>
        {doPeriodo.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500">
            Nenhum chamado aberto no período.
          </p>
        ) : (
          <ul className="space-y-2">
            {doPeriodo
              .filter((c) => !emAberto(c.status) || situacaoDoPrazo(c, agora).tipo !== "atrasado")
              .slice(0, 50)
              .map((c) => (
                <li key={c.id}>
                  <CartaoChamado chamado={c} href={`/chamados/${c.id}`} agora={agora} />
                </li>
              ))}
          </ul>
        )}
        {doPeriodo.length > 50 && (
          <p className="mt-2 text-center text-xs text-slate-400">Mostrando os 50 mais recentes. O .csv traz todos.</p>
        )}
      </section>
    </div>
  );
}
