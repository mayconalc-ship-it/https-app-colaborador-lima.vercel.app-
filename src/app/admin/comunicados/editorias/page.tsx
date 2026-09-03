import { decodificar } from "@/lib/texto-url";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { editoriasDaRevenda } from "@/lib/editorias";
import { PageHeader } from "@/components/PageHeader";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { MaisOuFechar } from "@/components/BotaoMais";
import { LinkVoltar } from "@/components/LinkVoltar";
import { CamposDaEditoria, EditoriaItem } from "@/components/EditoriaItem";
import {
  alternarEditoria,
  criarEditoria,
  excluirEditoria,
  moverEditoria,
  salvarEditoria,
} from "./actions";

/**
 * Cadastro das editorias do jornal.
 *
 * Antes as seis editorias eram constante no código E check no banco: uma
 * editoria nova custava um deploy, e um deploy sem a migration certa fazia
 * o formulário recusar a matéria com "violates check constraint" -- erro
 * de banco chegando ao RH como se fosse mensagem.
 */
export default async function EditoriasPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  await requireModulo("comunicados", "ver");
  const { erro, sucesso } = await searchParams;

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin");
  const editorias = await editoriasDaRevenda(revendaId);

  // Quantas matérias cada editoria carrega. É o número que decide se
  // excluir é inofensivo ou se vai mexer no arquivo -- e ele aparece na
  // confirmação, antes do clique, não depois.
  const { data: materias } = await admin
    .from("comunicados")
    .select("categoria")
    .eq("revenda_id", revendaId);

  const porEditoria = new Map<string, number>();
  for (const m of materias ?? []) {
    porEditoria.set(m.categoria, (porEditoria.get(m.categoria) ?? 0) + 1);
  }

  return (
    <div>
      <PageHeader
        title="Editorias do jornal"
        subtitle="As seções em que as matérias são publicadas"
      />

      <LinkVoltar
        href="/admin/comunicados"
        className="mb-4 inline-block text-sm text-primary hover:underline"
      >
        ← Voltar ao jornal
      </LinkVoltar>

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

      <details className="group mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-4 font-semibold text-primary-dark marker:content-none [&::-webkit-details-marker]:hidden">
          <MaisOuFechar />
          <span className="group-open:hidden">Nova editoria</span>
          <span className="hidden group-open:inline">Fechar</span>
        </summary>
        <form action={criarEditoria} className="border-t border-slate-100 p-4">
          <CamposDaEditoria />
          <BotaoEnviar
            textoEnviando="Criando..."
            className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white"
          >
            Criar editoria
          </BotaoEnviar>
        </form>
      </details>

      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {editorias.map((e, i) => (
          <EditoriaItem
            key={e.id}
            editoria={e}
            materias={porEditoria.get(e.id) ?? 0}
            primeira={i === 0}
            ultima={i === editorias.length - 1}
            onSalvar={salvarEditoria}
            onMover={moverEditoria}
            onAlternar={alternarEditoria}
            onExcluir={excluirEditoria}
          />
        ))}
      </div>

      <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
        <strong>Desligar</strong> tira a editoria do jornal e do formulário,
        mas guarda o nome: as matérias antigas continuam com a etiqueta certa.{" "}
        <strong>Excluir</strong> apaga de vez e devolve as matérias dela para a
        editoria Geral. A ordem aqui é a mesma que o colaborador vê na barra de
        filtros do jornal.
      </p>
    </div>
  );
}
