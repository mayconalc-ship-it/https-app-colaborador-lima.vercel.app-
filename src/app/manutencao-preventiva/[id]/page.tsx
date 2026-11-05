import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { itensDoModelo, modeloDeLinha, respostaDeLinha } from "@/lib/manutencao-preventiva-server";
import { itemVisivel, textoDaResposta, type RespostaPreventiva } from "@/lib/manutencao-preventiva";
import { FormPreventiva } from "./FormPreventiva";
import { cancelarPreventiva } from "../actions";

export const dynamic = "force-dynamic";

export default async function PreventivaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; sucesso?: string }>;
}) {
  const perfil = await requireAcessoModulo("manutencao-preventiva", "/");
  const { id } = await params;
  const sp = await searchParams;

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const admin = createAdminClient();
  const { data: execucao } = await admin
    .from("manut_prev_execucoes")
    .select(
      "id, modelo_id, status, iniciada_por, iniciada_por_nome, iniciada_em, finalizada_por_nome, finalizada_em, observacao, manut_prev_modelos(id, nome, equipamento, emoji, periodicidade_dias)",
    )
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!execucao) notFound();

  const modeloBruto = Array.isArray(execucao.manut_prev_modelos)
    ? execucao.manut_prev_modelos[0]
    : execucao.manut_prev_modelos;
  if (!modeloBruto) notFound();
  const modelo = modeloDeLinha(modeloBruto);

  const itens = await itensDoModelo(execucao.modelo_id, revendaId);
  const emAndamento = execucao.status === "em_andamento";
  const minha = execucao.iniciada_por === perfil.id;

  return (
    <div>
      <PageHeader
        title={`${modelo.emoji ? `${modelo.emoji} ` : ""}${modelo.nome}`}
        subtitle={
          emAndamento
            ? `Iniciada por ${execucao.iniciada_por_nome} em ${formatarDataHora(execucao.iniciada_em)}`
            : `Concluída por ${execucao.finalizada_por_nome ?? "—"} em ${
                execucao.finalizada_em ? formatarDataHora(execucao.finalizada_em) : "—"
              }`
        }
        fecharHref="/manutencao-preventiva"
      />

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}

      {emAndamento ? (
        minha ? (
          <div className="space-y-4">
            <FormPreventiva execucaoId={execucao.id} itens={itens} />
            <BotaoExcluir
              action={cancelarPreventiva}
              campos={{ execucao_id: execucao.id }}
              confirmacao="Cancelar esta preventiva? Ela será apagada e não entra no histórico."
              rotuloConfirmar="Cancelar"
              className="w-full rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar (abri por engano)
            </BotaoExcluir>
          </div>
        ) : (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {execucao.iniciada_por_nome} está preenchendo esta preventiva. Só quem iniciou pode finalizar.
          </p>
        )
      ) : (
        <Respostas execucaoId={execucao.id} itens={itens} observacao={execucao.observacao} />
      )}
    </div>
  );
}

/** Leitura do que foi respondido -- o registro de uma preventiva já feita. */
async function Respostas({
  execucaoId,
  itens,
  observacao,
}: {
  execucaoId: string;
  itens: Awaited<ReturnType<typeof itensDoModelo>>;
  observacao: string | null;
}) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("manut_prev_respostas")
    .select("item_id, valor_bool, valor_numero, valor_numeros, valor_texto, observacao")
    .eq("execucao_id", execucaoId);

  const respostas = new Map<string, RespostaPreventiva>(
    (data ?? []).map((l) => {
      const r = respostaDeLinha(l);
      return [r.itemId, r];
    }),
  );

  // Pergunta condicional que não se aplicou naquele dia não aparece --
  // mostrar "—" para ela só poluiria o registro.
  const mostrados = itens.filter((i) => respostas.has(i.id) || itemVisivel(i, itens, respostas));

  return (
    <div className="space-y-2">
      {mostrados.map((item, i) => {
        const r = respostas.get(item.id);
        const destaque = item.tipo === "sim_nao" && r?.valorBool === false;
        return (
          <div
            key={item.id}
            className={`rounded-xl border p-3 ${destaque ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}
          >
            <p className="text-xs text-slate-500">
              <span className="mr-1 text-slate-400">{i + 1}.</span>
              {item.pergunta}
            </p>
            <p className={`mt-0.5 text-sm font-semibold ${destaque ? "text-red-800" : "text-slate-900"}`}>
              {textoDaResposta(item, r)}
            </p>
            {r?.observacao && <p className="mt-1 text-xs text-slate-600">{r.observacao}</p>}
          </div>
        );
      })}

      {observacao && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Observação geral</p>
          <p className="mt-1 text-sm text-slate-800">{observacao}</p>
        </div>
      )}
    </div>
  );
}
