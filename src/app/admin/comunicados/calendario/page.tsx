import Link from "next/link";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { PageHeader } from "@/components/PageHeader";
import { diaNoFuso, editoria, horaNoFuso } from "@/lib/comunicados";
import { editoriasDaRevenda } from "@/lib/editorias";

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function doisDigitos(n: number) {
  return String(n).padStart(2, "0");
}

/** "2026-09-15" a partir de uma Date montada com partes locais. */
function iso(d: Date) {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

/**
 * O mês pedido na URL, ou o atual.
 *
 * Só aceita "AAAA-MM": a alternativa seria confiar no texto da barra de
 * endereço para montar uma Date, e "?mes=banana" viraria uma grade de
 * NaN em vez de uma tela.
 */
function mesPedido(valor: string | undefined) {
  const m = /^(\d{4})-(\d{2})$/.exec(valor ?? "");
  if (m) {
    const ano = Number(m[1]);
    const mes = Number(m[2]);
    if (mes >= 1 && mes <= 12) return { ano, mes };
  }
  const hoje = new Date();
  return { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
}

type Marca = {
  id: number;
  tipo: "publicacao" | "lembrete";
  titulo: string;
  categoria: string;
  /** Já aconteceu, ou ainda está na fila? É o que separa as duas cores. */
  feito: boolean;
  hora: string | null;
};

/**
 * O plano de comunicação do mês numa tela só.
 *
 * O que motivou: com o agendamento, o RH passa a montar o mês inteiro de
 * uma vez -- e uma LISTA ordenada por data não responde a pergunta que
 * ele faz nessa hora, que é "que dias estão vazios?". Buraco de duas
 * semanas sem comunicação nenhuma não aparece numa lista; numa grade,
 * salta aos olhos.
 *
 * Duas marcas por dia, e elas são coisas diferentes: 📰 é a matéria
 * entrando no jornal, 🔔 é o lembrete dela tocando o celular de quem foi
 * escolhido -- que pode ser dias depois.
 */
export default async function CalendarioComunicadosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  await requireModulo("comunicados", "ver");
  const { mes: mesParam } = await searchParams;
  const { ano, mes } = mesPedido(mesParam);

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin");
  const editorias = await editoriasDaRevenda(revendaId);

  const primeiroDia = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0);
  const inicio = iso(primeiroDia);
  const fim = iso(ultimoDia);

  // Duas consultas em vez de uma: a matéria e o lembrete dela caem em
  // dias diferentes, e cada um tem seu próprio índice. Um `or` com dois
  // intervalos varreria a tabela inteira.
  const colunas =
    "id, titulo, categoria, data, publicar_em, lembrete_em, lembrete_enviado_em";

  // O lembrete é timestamp: a janela vai do primeiro instante do mês ao
  // primeiro instante do mês seguinte, em UTC-3.
  const inicioUTC = `${inicio}T00:00:00-03:00`;
  const fimUTC = `${iso(new Date(ano, mes, 1))}T00:00:00-03:00`;

  const [{ data: publicacoes }, { data: lembretes }] = await Promise.all([
    admin
      .from("comunicados")
      .select(colunas)
      .eq("revenda_id", revendaId)
      .gte("data", inicio)
      .lte("data", fim),
    admin
      .from("comunicados")
      .select(colunas)
      .eq("revenda_id", revendaId)
      .not("lembrete_em", "is", null)
      .gte("lembrete_em", inicioUTC)
      .lt("lembrete_em", fimUTC),
  ]);

  const agora = new Date().getTime();
  const porDia = new Map<string, Marca[]>();
  const guardar = (dia: string, marca: Marca) => {
    const atual = porDia.get(dia) ?? [];
    atual.push(marca);
    porDia.set(dia, atual);
  };

  for (const c of publicacoes ?? []) {
    guardar(c.publicar_em ? diaNoFuso(c.publicar_em) : c.data, {
      id: c.id,
      tipo: "publicacao",
      titulo: c.titulo,
      categoria: c.categoria,
      feito: !c.publicar_em || new Date(c.publicar_em).getTime() <= agora,
      hora: c.publicar_em ? horaNoFuso(c.publicar_em) : null,
    });
  }

  for (const c of lembretes ?? []) {
    guardar(diaNoFuso(c.lembrete_em!), {
      id: c.id,
      tipo: "lembrete",
      titulo: c.titulo,
      categoria: c.categoria,
      feito: Boolean(c.lembrete_enviado_em),
      hora: horaNoFuso(c.lembrete_em!),
    });
  }

  // Seis semanas fixas: um mês que começa no sábado precisa de seis
  // linhas, e uma grade que muda de altura conforme o mês faz a tela
  // "pular" a cada clique em avançar.
  const inicioGrade = new Date(ano, mes - 1, 1 - primeiroDia.getDay());
  const celulas = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(
      inicioGrade.getFullYear(),
      inicioGrade.getMonth(),
      inicioGrade.getDate() + i,
    );
    return d;
  });

  const hojeIso = iso(new Date());
  const rotuloMes = primeiroDia
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(/^./, (c) => c.toUpperCase());

  const mesVizinho = (delta: number) => {
    const d = new Date(ano, mes - 1 + delta, 1);
    return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}`;
  };

  const totalPublicacoes = (publicacoes ?? []).length;
  const agendadas = (publicacoes ?? []).filter(
    (c) => c.publicar_em && new Date(c.publicar_em).getTime() > agora,
  ).length;
  const diasComAlgo = [...porDia.keys()].filter(
    (dia) => dia >= inicio && dia <= fim,
  ).length;

  return (
    <div>
      <PageHeader
        title="Calendário do Jornal"
        subtitle="O que já saiu e o que está na fila, mês a mês"
      />

      <Link
        href="/admin/comunicados"
        className="mb-4 inline-block text-sm font-medium text-primary hover:underline"
      >
        ← Voltar para os comunicados
      </Link>

      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={`/admin/comunicados/calendario?mes=${mesVizinho(-1)}`}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ←
        </Link>
        <p className="text-center text-base font-bold text-slate-800">
          {rotuloMes}
        </p>
        <Link
          href={`/admin/comunicados/calendario?mes=${mesVizinho(1)}`}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          →
        </Link>
      </div>

      <p className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        <strong>{totalPublicacoes}</strong> publicaç
        {totalPublicacoes === 1 ? "ão" : "ões"} no mês
        {agendadas > 0 && (
          <>
            {" "}
            · <strong className="text-amber-700">{agendadas} na fila</strong>
          </>
        )}{" "}
        · em <strong>{diasComAlgo}</strong> dia
        {diasComAlgo === 1 ? "" : "s"} do mês
      </p>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 bg-slate-50">
          {DIAS_SEMANA.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {celulas.map((d) => {
            const dia = iso(d);
            const doMes = d.getMonth() === mes - 1;
            const marcas = porDia.get(dia) ?? [];

            return (
              <div
                key={dia}
                className={`min-h-20 border-b border-r border-slate-100 p-1 ${
                  doMes ? "" : "bg-slate-50/60"
                }`}
              >
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${
                    dia === hojeIso
                      ? "bg-primary text-white"
                      : doMes
                        ? "text-slate-500"
                        : "text-slate-300"
                  }`}
                >
                  {d.getDate()}
                </span>

                <div className="mt-0.5 space-y-0.5">
                  {marcas.map((m) => (
                    <div
                      key={`${m.tipo}-${m.id}`}
                      title={`${m.tipo === "lembrete" ? "Lembrete" : "Publicação"}${
                        m.hora ? ` às ${m.hora}` : ""
                      } — ${m.titulo}`}
                      className={`truncate rounded px-1 py-0.5 text-[10px] leading-tight ${
                        m.feito
                          ? "bg-slate-100 text-slate-600"
                          : "bg-amber-100 font-semibold text-amber-900"
                      }`}
                    >
                      {m.tipo === "lembrete"
                        ? "🔔"
                        : editoria(editorias, m.categoria).emoji}{" "}
                      {m.hora ? `${m.hora} ` : ""}
                      {m.titulo}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-slate-200" /> já saiu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-amber-300" /> na fila
        </span>
        <span className="flex items-center gap-1.5">🔔 lembrete</span>
      </div>
    </div>
  );
}
