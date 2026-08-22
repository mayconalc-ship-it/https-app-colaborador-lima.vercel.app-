import Link from "next/link";
import { decodificar } from "@/lib/texto-url";
import { ehFuturo } from "@/lib/comunicados";
import { editoriasDaRevenda } from "@/lib/editorias";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { PageHeader } from "@/components/PageHeader";
import { ComunicadoForm } from "@/components/ComunicadoForm";
import { ComunicadoItem } from "@/components/ComunicadoItem";
import { salvarComunicado, excluirComunicado } from "./actions";

export default async function AdminComunicadosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("comunicados", "ver");
  const { erro, sucesso } = await searchParams;

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin");
  const { data: comunicados } = await admin
    .from("comunicados")
    .select(
      "id, titulo, resumo, texto, categoria, destaque, data, imagem_url, publicar_em, lembrete_em, lembrete_areas, lembrete_cargos, lembrete_mensagem, lembrete_enviado_em",
    )
    .eq("revenda_id", revendaId)
    .order("data", { ascending: false })
    .order("id", { ascending: false })
    .limit(60);

  // Cargos de quem está NESTA revenda, sem repetição -- é o que alimenta
  // o seletor do lembrete. Vem do cadastro (texto livre), não de uma
  // lista fixa, então é isto ou deixar o Admin digitar e arriscar um
  // typo que nunca bate com ninguém.
  const { data: vinculosRevenda } = await admin
    .from("colaborador_revendas")
    .select("colaborador_id")
    .eq("revenda_id", revendaId);
  const idsRevenda = (vinculosRevenda ?? []).map((v) => v.colaborador_id);
  const { data: cargosBanco } =
    idsRevenda.length > 0
      ? await admin.from("profiles").select("cargo").in("id", idsRevenda)
      : { data: [] };
  const cargosDisponiveis = [
    ...new Set(
      (cargosBanco ?? [])
        .map((c) => c.cargo?.trim())
        .filter((c): c is string => Boolean(c)),
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const naFila = (comunicados ?? []).filter((c) =>
    ehFuturo(c.publicar_em),
  ).length;

  // Só as ligadas entram no formulário: editoria desativada é editoria que
  // o RH tirou de circulação, e continuar oferecendo no seletor seria
  // desligar sem desligar.
  const todasEditorias = await editoriasDaRevenda(revendaId);
  const editoriasAtivas = todasEditorias.filter((e) => e.ativa);

  return (
    <div>
      <PageHeader
        title="Jornal do Colaborador"
        subtitle="Publicar, agendar e acompanhar o plano de comunicação"
      />

      <Link
        href="/admin/comunicados/calendario"
        className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50"
      >
        <span className="text-sm font-semibold text-primary">
          🗓️ Calendário do mês
        </span>
        <span className="text-xs text-slate-500">
          {naFila === 0
            ? "nada agendado"
            : `${naFila} agendad${naFila === 1 ? "a" : "as"} na fila`}{" "}
          →
        </span>
      </Link>

      <Link
        href="/admin/comunicados/editorias"
        className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50"
      >
        <span className="text-sm font-semibold text-primary">
          🏷️ Editorias do jornal
        </span>
        <span className="text-xs text-slate-500">
          {editoriasAtivas.length} no ar →
        </span>
      </Link>

      {erro && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}
      {sucesso && (
        <p className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {decodificar(sucesso)}
        </p>
      )}

      <details className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer p-4 font-semibold text-primary">
          + Publicar novo comunicado
        </summary>
        <div className="border-t border-slate-100 p-4">
          <ComunicadoForm
            action={salvarComunicado}
            cargosDisponiveis={cargosDisponiveis}
            editorias={editoriasAtivas}
          />
        </div>
      </details>

      <h2 className="mb-2 font-semibold text-slate-700">
        Publicados ({comunicados?.length ?? 0})
      </h2>

      {!comunicados || comunicados.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Nenhum comunicado publicado ainda.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {comunicados.map((c) => (
            <ComunicadoItem
              key={c.id}
              comunicado={c}
              onSalvar={salvarComunicado}
              onExcluir={excluirComunicado}
              cargosDisponiveis={cargosDisponiveis}
              editorias={todasEditorias}
              editoriasAtivas={editoriasAtivas}
            />
          ))}
        </div>
      )}
    </div>
  );
}
