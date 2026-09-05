import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ROTULO_STATUS_RELATO,
  ROTULO_TOPICO,
  type StatusRelato,
  type TopicoAcao,
} from "@/lib/relato-anomalia";

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

/**
 * O PAINEL DE PENDÊNCIAS -- o que está esperando a liderança.
 *
 * É o único painel da Gestão que traz TAREFA em vez de leitura, e a tela
 * é organizada por isso: primeiro o que ninguém pegou, depois o que está
 * andando, e só no fim o que já fechou. A ordem é a da cobrança.
 *
 * A CONTAGEM DE DIAS aparece em toda linha aberta, e é ela que faz o
 * painel funcionar: "aberto há 6 dias" cobra; "aberto em 30/08" informa.
 * Relato de anomalia que envelhece calado é como a anomalia vira crônica.
 */
export default async function PainelDeAnomaliasPage() {
  await requireModulo("relato-anomalia", "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const admin = createAdminClient();

  const [{ data: relatosBanco, error }, { data: acoesBanco }] = await Promise.all([
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

  const acoesPorRelato = new Map<string, LinhaAcao[]>();
  for (const a of acoes) {
    const lista = acoesPorRelato.get(a.relato_id) ?? [];
    lista.push(a);
    acoesPorRelato.set(a.relato_id, lista);
  }

  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const atrasadas = acoes.filter((a) => a.prazo && a.prazo < hoje);

  const pendentes = relatos.filter((r) => r.status === "aberto");
  const andando = relatos.filter((r) => r.status === "em_analise" || r.status === "plano_definido");
  const fechados = relatos.filter(
    (r) => r.status === "concluido" || r.status === "eficacia_verificada",
  );

  return (
    <div>
      <PageHeader
        title="🚨 Anomalias"
        subtitle="Indicador fora da faixa vira relato — e o relato tem dono, prazo e verificação."
      />

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Numero valor={pendentes.length} rotulo="sem ninguém" alerta={pendentes.length > 0} />
        <Numero valor={andando.length} rotulo="em tratativa" />
        <Numero valor={atrasadas.length} rotulo="ações atrasadas" alerta={atrasadas.length > 0} />
        <Numero
          valor={relatos.filter((r) => r.status === "eficacia_verificada").length}
          rotulo="eficácia verificada"
        />
      </div>

      {relatos.length === 0 && (
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

      {/*
        AS AÇÕES ATRASADAS VÊM ANTES DOS RELATOS, atravessando todos eles.

        É a pergunta que a liderança faz primeiro ("o que passou do
        prazo?") e a que o formato de documento esconde: dentro de cada
        relato, uma ação vencida é uma linha no meio de uma tabela. Aqui
        ela é a primeira coisa da tela.
      */}
      {atrasadas.length > 0 && (
        <section className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-4">
          <h2 className="text-sm font-bold text-red-900">
            ⏰ {atrasadas.length} ação(ões) com prazo vencido
          </h2>
          <ul className="mt-2 space-y-2">
            {atrasadas.map((a) => {
              const relato = relatos.find((r) => r.id === a.relato_id);
              return (
                <li key={a.id} className="rounded-xl bg-white p-3">
                  <Link href={`/gestao/anomalias/${a.relato_id}`} className="block">
                    <p className="text-sm font-semibold text-slate-800">{a.o_que}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {ROTULO_TOPICO[a.topico].titulo} · {a.quem} · venceu em{" "}
                      <span className="font-semibold text-red-700">
                        {a.prazo ? brasileira(a.prazo) : "—"}
                      </span>
                      {relato && ` · ${relato.indicador_rotulo}`}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Grupo
        titulo="Esperando alguém pegar"
        ajuda="O gatilho disparou e a análise não começou."
        relatos={pendentes}
        acoesPorRelato={acoesPorRelato}
        destaque
      />
      <Grupo
        titulo="Em tratativa"
        ajuda="Alguém está analisando, ou o plano já tem dono e prazo."
        relatos={andando}
        acoesPorRelato={acoesPorRelato}
      />
      <Grupo
        titulo="Encerrados"
        ajuda="Assinados pelo gestor. A eficácia verificada é a que fecha o ciclo."
        relatos={fechados}
        acoesPorRelato={acoesPorRelato}
      />
    </div>
  );
}

function Grupo({
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
  if (relatos.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
        {titulo}
        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
          {relatos.length}
        </span>
      </h2>
      <p className="mb-2 text-xs text-slate-500">{ajuda}</p>
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
                  <span className="text-slate-500">
                    · {abertas.length} ação(ões) em aberto
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Numero({
  valor,
  rotulo,
  alerta = false,
}: {
  valor: number;
  rotulo: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 text-center shadow-sm ${
        alerta && valor > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
      }`}
    >
      <p
        className={`text-2xl font-bold tabular-nums ${
          alerta && valor > 0 ? "text-red-700" : "text-slate-900"
        }`}
      >
        {valor}
      </p>
      <p className="text-xs leading-tight text-slate-500">{rotulo}</p>
    </div>
  );
}
