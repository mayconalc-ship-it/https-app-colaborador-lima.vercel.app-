import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { ChecklistFrota } from "@/components/frota-check/ChecklistFrota";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeNoModulo, requireAcessoModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { formatarDataHora } from "@/lib/produtividade-armazem";
import { lerCheck, lerItensFrota, lerRespostasFrota, lerVeiculo, primeiroEUltimo } from "@/lib/frota-check-server";
import {
  COR_GRAVIDADE,
  EMOJI_GRUPO,
  MODULO_FROTA_CHECK,
  ROTULO_GRAVIDADE,
  ehGravidade,
  formatarPct,
  placaParaLer,
  rotuloBimestre,
  type RespostaFrota,
} from "@/lib/frota-check";
import {
  apagarFotoFrota,
  assinarCheck,
  cancelarCheck,
  corrigirPendencia,
  enviarFotoFrota,
  grupoTodoOk,
  salvarItemFrota,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function CheckDaFrotaPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await requireAcessoModulo(MODULO_FROTA_CHECK, "/");
  const revendaId = await exigirRevenda("/frota-check");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const admin = createAdminClient();
  const check = await lerCheck(id, revendaId, admin);
  if (!check) notFound();
  const [veiculo, itens, respostas, lideranca] = await Promise.all([
    lerVeiculo(check.veiculo_id, revendaId, admin),
    lerItensFrota(admin),
    lerRespostasFrota(check.id, revendaId, admin),
    podeNoModulo(MODULO_FROTA_CHECK, "editar"),
  ]);
  if (!veiculo) notFound();
  const placa = placaParaLer(veiculo.placa);
  const bim = { ano: check.ano, bimestre: check.bimestre };

  // ---------------- preenchendo
  if (check.status === "em_andamento") {
    const minha = check.iniciado_por === perfil.id;
    // o último check feito antes deste: o que deu NOK lá aparece marcado
    const { data: anterior } = await admin
      .from("cf_checks")
      .select("id, ano, bimestre")
      .eq("veiculo_id", veiculo.id)
      .in("status", ["assinado", "planilha"])
      .order("ano", { ascending: false })
      .order("bimestre", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: nokAnt } = anterior
      ? await admin.from("cf_respostas").select("item_id").eq("check_id", anterior.id).eq("ok", false)
      : { data: [] };

    return (
      <div>
        <PageHeader title={`🚚 ${placa}`} subtitle={`Check ${rotuloBimestre(bim)} · ${check.iniciado_por_nome}`} fecharHref="/frota-check" />
        {(minha || lideranca) && (
          <div className="-mt-2 mb-3 flex justify-end">
            <BotaoNoLugar
              acao={cancelarCheck}
              campos={{ check_id: check.id }}
              confirmacao={minha ? "Cancelar este check? O que foi preenchido é apagado." : `Cancelar o check que ${check.iniciado_por_nome} abriu?`}
              rotuloConfirmar="Cancelar check"
              className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              ✕ Cancelar check
            </BotaoNoLugar>
          </div>
        )}
        <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">Responsável: {veiculo.responsavel_nome ?? "—"}</span>
          {anterior && ` · ${(nokAnt ?? []).length} NOK no último check (${rotuloBimestre(anterior, true)})`}
          <span className="block">Foto obrigatória em todo NOK. Cada toque salva sozinho.</span>
        </div>
        {minha ? (
          <ChecklistFrota
            checkId={check.id}
            placa={placa}
            itens={itens}
            respostas={Object.fromEntries([...respostas.entries()].map(([k, r]) => [k, r as RespostaFrota]))}
            nokAnterior={(nokAnt ?? []).map((r) => r.item_id)}
            rotuloAnterior={anterior ? rotuloBimestre(anterior, true) : null}
            assinante={{ nome: perfil.nome, cargo: perfil.cargo }}
            salvarItem={salvarItemFrota}
            grupoOk={grupoTodoOk}
            enviarFoto={enviarFotoFrota}
            apagarFoto={apagarFotoFrota}
            assinar={assinarCheck}
          />
        ) : (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {check.iniciado_por_nome} está fazendo este check. Só quem abriu preenche e assina.
          </p>
        )}
      </div>
    );
  }

  // ---------------- relatório (assinado ou da planilha)
  const planilha = check.status === "planilha";
  const pior = ehGravidade(check.pior_gravidade) ? check.pior_gravidade : null;
  const noks = itens.filter((i) => respostas.get(i.id)?.ok === false);
  const conf = check.conformidade === null ? null : Number(check.conformidade);
  const defeitoDe = new Map(itens.flatMap((i) => i.defeitos.map((d) => [d.id, d.descricao] as const)));
  const campo = "w-full rounded-xl border border-slate-300 bg-white p-2.5 text-base focus:border-primary focus:outline-none";

  return (
    <div className="space-y-3">
      <PageHeader title={`🚚 ${placa}`} subtitle={`Check ${rotuloBimestre(bim)}`} fecharHref="/frota-check" />

      <section
        className={`rounded-2xl p-4 shadow-sm ${pior === "bloqueio" ? "bg-red-700 text-white" : noks.length ? "border border-amber-200 bg-amber-50" : "border border-emerald-200 bg-emerald-50"}`}
      >
        <div className="flex items-end justify-between">
          <div>
            <p className="text-4xl font-black">{formatarPct(conf, 1)}</p>
            <p className="text-sm font-semibold">
              {check.ok ?? 0} OK · {check.nok ?? 0} NOK{pior ? ` · pior: ${ROTULO_GRAVIDADE[pior]}` : ""}
            </p>
          </div>
          <span className="text-4xl" aria-hidden>
            {pior === "bloqueio" ? "⛔" : noks.length ? "⚠️" : "✅"}
          </span>
        </div>
        {pior === "bloqueio" && <p className="mt-2 text-sm">Item de bloqueio imediato: o caminhão não sai até corrigir.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
        {planilha ? (
          <p className="text-slate-600">
            Veio da planilha 2026 (mês {String(check.mes_planilha ?? "").padStart(2, "0")}). Sem fotos e sem assinatura: o check do app passa a ser
            assinado.
          </p>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Assinado por</p>
              <p className="font-bold text-slate-900">{check.assinado_por_nome}</p>
              <p className="text-xs text-slate-500">
                {check.assinado_cargo ? `${check.assinado_cargo} · ` : ""}
                {check.assinado_em ? formatarDataHora(check.assinado_em) : ""}
                {check.km ? ` · ${check.km.toLocaleString("pt-BR")} km` : ""}
              </p>
            </div>
            {check.assinatura_caminho && (
              // eslint-disable-next-line @next/next/no-img-element -- imagem da rota do app
              <img src={`/api/frota-check/assinatura/${check.id}`} alt="Assinatura" className="h-16 rounded-lg border border-slate-200 bg-white" />
            )}
          </div>
        )}
        {check.observacao && <p className="mt-2 border-t border-slate-100 pt-2 text-slate-700">{check.observacao}</p>}
      </section>

      {noks.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Itens NOK ({noks.length})</h2>
          <ul className="space-y-2">
            {noks.map((i) => {
              const r = respostas.get(i.id)!;
              return (
                <li key={i.id} id={`pend-${r.id}`} className="scroll-mt-20 rounded-2xl border border-red-200 bg-white p-3 shadow-sm">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900">
                        {EMOJI_GRUPO[i.grupo]} {i.nome}
                      </p>
                      <p className="text-xs text-slate-600">
                        {r.defeitoId ? defeitoDe.get(r.defeitoId) : planilha ? "Marcado NOK na planilha" : "Outro defeito"}
                      </p>
                      {r.observacao && <p className="mt-1 text-xs text-slate-700">“{r.observacao}”</p>}
                    </div>
                    {r.gravidade && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${COR_GRAVIDADE[r.gravidade]}`}>{ROTULO_GRAVIDADE[r.gravidade]}</span>
                    )}
                  </div>
                  {r.fotos.length > 0 && (
                    <div className="mt-2 flex gap-2">
                      {r.fotos.map((f) => (
                        <a key={f.id} href={f.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element -- miniatura da rota do app */}
                          <img src={f.mini} alt="Foto do NOK" className="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  {r.corrigidoEm ? (
                    <p className="mt-2 rounded-xl bg-emerald-50 p-2 text-xs text-emerald-900">
                      ✅ Corrigido por {primeiroEUltimo(r.corrigidoPorNome)} em {formatarDataHora(r.corrigidoEm)}: {r.correcao}
                    </p>
                  ) : (
                    <details className="mt-2 rounded-xl border border-dashed border-emerald-400">
                      <summary className="cursor-pointer list-none p-2 text-xs font-bold text-emerald-800 [&::-webkit-details-marker]:hidden">
                        ✔ Marcar como corrigido
                      </summary>
                      <FormNoLugar acao={corrigirPendencia} className="space-y-2 px-2 pb-2">
                        <input type="hidden" name="resposta_id" value={r.id} />
                        <textarea name="correcao" rows={2} maxLength={500} required placeholder="O que foi feito? (ex.: trocada a lâmpada do farol esquerdo)" className={campo} />
                        <BotaoEnviar textoEnviando="Salvando..." className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white">
                          Salvar correção
                        </BotaoEnviar>
                      </FormNoLugar>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!planilha && (
        <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none p-3 text-sm font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
            Ver os {itens.length - noks.length} itens OK
          </summary>
          <ul className="grid gap-x-4 gap-y-1 border-t border-slate-100 p-3 text-xs text-slate-600 sm:grid-cols-2">
            {itens
              .filter((i) => respostas.get(i.id)?.ok)
              .map((i) => (
                <li key={i.id}>
                  ✓ {i.nome} <span className="text-slate-400">· {i.grupo}</span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
