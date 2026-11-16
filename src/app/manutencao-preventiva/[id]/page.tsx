import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoExcluir } from "@/components/BotaoExcluir";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo, requireAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import {
  COLUNAS_EQUIPAMENTO,
  COLUNAS_MODELO,
  equipamentoDeLinha,
  itensDoModelo,
  modeloDeLinha,
  respostaDeLinha,
} from "@/lib/manutencao-preventiva-server";
import {
  emAlerta,
  itemVisivel,
  nomeDoEquipamento,
  textoDaResposta,
  type RespostaPreventiva,
} from "@/lib/manutencao-preventiva";
import { enderecosDaFoto } from "@/lib/foto-privada-server";
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
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const revendaId = await getRevendaId();
  if (!revendaId) redirect(`/?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);

  const admin = createAdminClient();
  const { data: execucao } = await admin
    .from("manut_prev_execucoes")
    .select(
      "id, modelo_id, equipamento_id, status, iniciada_por, iniciada_por_nome, iniciada_em, finalizada_por_nome, finalizada_em, observacao, alertas",
    )
    .eq("id", id)
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!execucao) notFound();

  const [{ data: modeloBruto }, { data: equipBruto }, itens] = await Promise.all([
    admin.from("manut_prev_modelos").select(COLUNAS_MODELO).eq("id", execucao.modelo_id).maybeSingle(),
    execucao.equipamento_id
      ? admin.from("manut_prev_equipamentos").select(COLUNAS_EQUIPAMENTO).eq("id", execucao.equipamento_id).maybeSingle()
      : Promise.resolve({ data: null }),
    itensDoModelo(execucao.modelo_id, revendaId),
  ]);
  if (!modeloBruto) notFound();
  const modelo = modeloDeLinha(modeloBruto);
  const equipamento = equipBruto ? equipamentoDeLinha(equipBruto) : null;

  const emAndamento = execucao.status === "em_andamento";
  const minha = execucao.iniciada_por === perfil.id;
  const podeCancelarDosOutros = emAndamento && !minha && (await podeNoModulo("manutencao-preventiva", "editar"));
  const titulo = equipamento ? `${modelo.emoji ?? ""} ${modelo.equipamento} ${equipamento.codigo}`.trim() : `${modelo.emoji ? `${modelo.emoji} ` : ""}${modelo.nome}`;

  return (
    <div>
      <PageHeader
        title={titulo}
        subtitle={
          emAndamento
            ? `Iniciada por ${execucao.iniciada_por_nome} em ${formatarDataHora(execucao.iniciada_em)}`
            : `Concluída por ${execucao.finalizada_por_nome ?? "—"} em ${
                execucao.finalizada_em ? formatarDataHora(execucao.finalizada_em) : "—"
              }`
        }
        fecharHref="/manutencao-preventiva"
      />

      {/* Cancelar no TOPO (16/11/2026): no fim do formulário ficava
          escondido atrás do rodapé fixo e ninguém achava. */}
      {emAndamento && (minha || podeCancelarDosOutros) && (
        <div className="-mt-2 mb-3 flex justify-end">
          <BotaoExcluir
            action={cancelarPreventiva}
            campos={{ execucao_id: execucao.id }}
            confirmacao={
              minha
                ? "Cancelar esta preventiva? Ela é apagada e não entra no histórico."
                : `Cancelar a preventiva que ${execucao.iniciada_por_nome} abriu? Ela é apagada e não entra no histórico.`
            }
            rotuloConfirmar="Cancelar preventiva"
            className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            ✕ Cancelar preventiva
          </BotaoExcluir>
        </div>
      )}

      {equipamento && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p className="text-sm font-bold text-slate-900">{nomeDoEquipamento(equipamento)}</p>
          {[equipamento.marca, equipamento.capacidade, equipamento.observacao].filter(Boolean).join(" · ") || null}
        </div>
      )}

      {sp.erro && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{sp.erro}</p>}

      {emAndamento ? (
        minha ? (
          <FormPreventiva execucaoId={execucao.id} itens={itens} />
        ) : (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {execucao.iniciada_por_nome} está preenchendo esta preventiva. Só quem iniciou pode finalizar.
          </p>
        )
      ) : (
        <Respostas execucaoId={execucao.id} revendaId={revendaId} itens={itens} observacao={execucao.observacao} />
      )}
    </div>
  );
}

/** Leitura do que foi respondido: alertas primeiro, depois o resto por bloco. */
async function Respostas({
  execucaoId,
  revendaId,
  itens,
  observacao,
}: {
  execucaoId: string;
  revendaId: string;
  itens: Awaited<ReturnType<typeof itensDoModelo>>;
  observacao: string | null;
}) {
  const admin = createAdminClient();
  const [{ data }, { data: fotosBanco }] = await Promise.all([
    admin
      .from("manut_prev_respostas")
      .select("item_id, valor_bool, valor_numero, valor_numeros, valor_texto, observacao")
      .eq("execucao_id", execucaoId),
    admin.from("manut_prev_fotos").select("id, item_id").eq("execucao_id", execucaoId).eq("revenda_id", revendaId),
  ]);

  const respostas = new Map<string, RespostaPreventiva>(
    (data ?? []).map((l) => {
      const r = respostaDeLinha(l);
      return [r.itemId, r];
    }),
  );
  const fotosPorItem = new Map<string, { url: string; mini: string }[]>();
  for (const f of fotosBanco ?? []) {
    const lista = fotosPorItem.get(f.item_id ?? "") ?? [];
    lista.push(enderecosDaFoto("/api/manutencao-preventiva/foto", f.id));
    fotosPorItem.set(f.item_id ?? "", lista);
  }

  // Preventiva registrada sem checklist (ex.: a feita antes do app, vinda
  // da lista): não há o que mostrar item a item, nem "tudo normal" a dizer.
  if (respostas.size === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">Registrada sem checklist preenchido.</p>
        {observacao && <p className="mt-1">{observacao}</p>}
        <p className="mt-2 text-xs text-slate-500">Conta só para o prazo. A próxima já sai pelo checklist do app.</p>
      </div>
    );
  }

  // Pergunta condicional que não se aplicou naquele dia não aparece.
  const mostrados = itens.filter((i) => respostas.has(i.id) || itemVisivel(i, itens, respostas));
  const comAlerta = mostrados.filter((i) => emAlerta(i, respostas.get(i.id)));

  return (
    <div className="space-y-2">
      <div
        className={`rounded-2xl p-3 text-sm font-semibold ${
          comAlerta.length ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"
        }`}
      >
        {comAlerta.length
          ? `⚠️ ${comAlerta.length} ${comAlerta.length === 1 ? "item em alerta" : "itens em alerta"}`
          : "✅ Tudo dentro do normal"}
        {comAlerta.length > 0 && (
          <Link href="/chamados" className="ml-2 text-xs font-bold text-primary underline">
            Abrir chamado
          </Link>
        )}
      </div>

      {mostrados.map((item, i) => {
        const r = respostas.get(item.id);
        const alerta = emAlerta(item, r);
        const fotos = fotosPorItem.get(item.id) ?? [];
        const novoBloco = item.bloco && item.bloco !== mostrados[i - 1]?.bloco;
        return (
          <div key={item.id}>
            {novoBloco && <h2 className="mb-1.5 mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">{item.bloco}</h2>}
            <div className={`flex gap-3 rounded-xl border p-3 ${alerta ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">{item.pergunta}</p>
                <p className={`mt-0.5 text-sm font-semibold ${alerta ? "text-red-800" : "text-slate-900"}`}>
                  {alerta ? "⚠️ " : ""}
                  {textoDaResposta(item, r)}
                </p>
                {r?.observacao && <p className="mt-1 text-xs text-slate-600">{r.observacao}</p>}
              </div>
              {fotos.map((f) => (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- miniatura da rota do app, com cache */}
                  <img src={f.mini} alt="Foto do item" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                </a>
              ))}
            </div>
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
