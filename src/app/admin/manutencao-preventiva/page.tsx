import { PageHeader } from "@/components/PageHeader";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { SeloDoPrazo } from "@/components/manutencao/PrazoDaPreventiva";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import {
  COLUNAS_EQUIPAMENTO,
  COLUNAS_ITEM,
  COLUNAS_MODELO,
  equipamentoDeLinha,
  itemDeLinha,
  modeloDeLinha,
  painelDaRevenda,
  PreventivaNaoAtualizada,
} from "@/lib/manutencao-preventiva-server";
import { formatarNumero, type EquipamentoPreventiva } from "@/lib/manutencao-preventiva";
import { alternarEquipamento, criarEquipamento, editarEquipamento, salvarFaixa, salvarModelo } from "./actions";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-[11px] font-semibold uppercase text-slate-500";
const botao = "rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark";

/** O que o rótulo de cada aparelho pede, conforme o tipo. */
const DICAS: Record<string, { codigo: string; local: string; capacidade: string }> = {
  "Ar-condicionado": { codigo: "AC-01", local: "Sala ADM", capacidade: "12.000 BTUs" },
  "Câmara fria": { codigo: "CF-01", local: "Armazém", capacidade: "40 m³" },
};

/**
 * PREVENTIVA NO MODO LIDERANÇA (16/11/2026): o cadastro, não o
 * acompanhamento. Cada aparelho com código (a etiqueta colada nele) e
 * local; a frequência do modelo vale para todos, e o aparelho pode ter a
 * sua. É desta frequência que sai o lembrete diário do que venceu.
 */
export default async function AdminPreventivaPage() {
  await requireModulo("manutencao-preventiva", "editar");
  const revendaId = await exigirRevenda("/admin");
  const admin = createAdminClient();

  let dados;
  try {
    const [modelos, equipamentos, itens, painel] = await Promise.all([
      admin.from("manut_prev_modelos").select(COLUNAS_MODELO).eq("revenda_id", revendaId).order("ordem").order("nome"),
      admin.from("manut_prev_equipamentos").select(COLUNAS_EQUIPAMENTO).eq("revenda_id", revendaId).order("codigo"),
      admin
        .from("manut_prev_itens")
        .select(`modelo_id, ${COLUNAS_ITEM}`)
        .eq("revenda_id", revendaId)
        .eq("ativo", true)
        .in("tipo", ["numero", "trifasico"])
        .order("ordem"),
      painelDaRevenda(revendaId, admin),
    ]);
    if (modelos.error || equipamentos.error || itens.error) {
      throw new PreventivaNaoAtualizada((modelos.error ?? equipamentos.error ?? itens.error)!.message);
    }
    dados = { modelos: modelos.data ?? [], equipamentos: equipamentos.data ?? [], itens: itens.data ?? [], painel };
  } catch (e) {
    if (!(e instanceof PreventivaNaoAtualizada)) throw e;
    return (
      <div>
        <PageHeader title="🔩 Manutenção Preventiva" />
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Falta rodar a <strong>migration 178</strong> no Supabase.
        </p>
      </div>
    );
  }

  const prazoPorChave = new Map(dados.painel.alvos.map((a) => [a.chave, a.prazo]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="🔩 Manutenção Preventiva"
        subtitle="Os aparelhos de cada checklist e a frequência. O lembrete do que venceu sai daqui."
      />

      {dados.modelos.map((linha) => {
        const modelo = modeloDeLinha(linha);
        const ativo = linha.ativo !== false;
        const equips = dados.equipamentos.filter((e) => e.modelo_id === modelo.id).map(equipamentoDeLinha);
        const ligados = equips.filter((e) => e.ativo);
        const faixas = dados.itens.filter((i) => i.modelo_id === modelo.id).map(itemDeLinha);
        const dica = DICAS[modelo.equipamento] ?? { codigo: "EQ-01", local: "Local", capacidade: "Capacidade" };
        const prazoDoModelo = prazoPorChave.get(`${modelo.id}:-`);

        return (
          <details key={modelo.id} className="group rounded-2xl border border-slate-200 bg-white shadow-sm" open={modelo.usaEquipamentos && ligados.length === 0 && ativo}>
            <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
              <span className="text-2xl" aria-hidden>
                {modelo.emoji ?? "🔩"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900">{modelo.nome}</span>
                <span className="block text-xs text-slate-500">
                  {ativo ? `A cada ${modelo.periodicidadeDias} dias` : "Desligado nesta revenda"}
                  {modelo.usaEquipamentos && ` · ${ligados.length} aparelho${ligados.length === 1 ? "" : "s"}`}
                </span>
              </span>
              {prazoDoModelo && <SeloDoPrazo prazo={prazoDoModelo} curto />}
              <span className="text-slate-400 transition group-open:rotate-90" aria-hidden>
                ›
              </span>
            </summary>

            <div className="space-y-4 border-t border-slate-100 p-4">
              {modelo.descricao && <p className="text-xs text-slate-500">{modelo.descricao}</p>}

              {/* Frequência do modelo */}
              <FormNoLugar acao={salvarModelo} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="modelo_id" value={modelo.id} />
                <div>
                  <label className={rotulo} htmlFor={`freq-${modelo.id}`}>
                    Frequência (dias)
                  </label>
                  <input
                    id={`freq-${modelo.id}`}
                    name="periodicidade_dias"
                    type="number"
                    min={1}
                    max={365}
                    defaultValue={modelo.periodicidadeDias}
                    required
                    className={`${campo} w-28`}
                  />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
                  <input type="checkbox" name="ativo" defaultChecked={ativo} className="h-4 w-4" />
                  Usar nesta revenda
                </label>
                <BotaoEnviar textoEnviando="Salvando..." className={botao}>
                  Salvar
                </BotaoEnviar>
              </FormNoLugar>

              {/* Aparelhos */}
              {modelo.usaEquipamentos && (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Aparelhos</h3>
                  {equips.length === 0 && (
                    <p className="mb-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                      Nenhum aparelho ainda. Cadastre cada um com o código da etiqueta colada nele.
                    </p>
                  )}
                  <ul className="space-y-1.5">
                    {equips.map((e) => (
                      <LinhaDoEquipamento
                        key={e.id}
                        e={e}
                        frequenciaDoModelo={modelo.periodicidadeDias}
                        prazo={prazoPorChave.get(`${modelo.id}:${e.id}`)}
                      />
                    ))}
                  </ul>

                  <details className="mt-2 rounded-xl border border-dashed border-primary/40 bg-primary-soft/30">
                    <summary className="cursor-pointer list-none p-3 text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
                      ＋ Cadastrar aparelho
                    </summary>
                    <FormNoLugar acao={criarEquipamento} limparAoSalvar className="space-y-3 px-3 pb-3">
                      <input type="hidden" name="modelo_id" value={modelo.id} />
                      <CamposDoEquipamento dica={dica} frequenciaDoModelo={modelo.periodicidadeDias} />
                      <BotaoEnviar textoEnviando="Cadastrando..." className={`${botao} w-full`}>
                        Cadastrar
                      </BotaoEnviar>
                    </FormNoLugar>
                  </details>
                </div>
              )}

              {/* Faixas */}
              {faixas.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Faixa aceitável</h3>
                  <p className="mb-2 text-xs text-slate-500">Fora dela, o item fica em alerta. Em branco = sem limite.</p>
                  <ul className="space-y-2">
                    {faixas.map((i) => (
                      <li key={i.id}>
                        <FormNoLugar acao={salvarFaixa} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="item_id" value={i.id} />
                          <p className="w-full text-xs font-semibold text-slate-700">
                            {i.pergunta} {i.unidade ? `(${i.unidade})` : ""}
                          </p>
                          <input
                            name="minimo"
                            inputMode="decimal"
                            placeholder="mín."
                            defaultValue={i.minimo === null ? "" : formatarNumero(i.minimo, i.casasDecimais)}
                            className={`${campo} w-24`}
                          />
                          <input
                            name="maximo"
                            inputMode="decimal"
                            placeholder="máx."
                            defaultValue={i.maximo === null ? "" : formatarNumero(i.maximo, i.casasDecimais)}
                            className={`${campo} w-24`}
                          />
                          <BotaoEnviar textoEnviando="..." className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            Salvar
                          </BotaoEnviar>
                        </FormNoLugar>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function CamposDoEquipamento({
  e,
  dica,
  frequenciaDoModelo,
}: {
  e?: EquipamentoPreventiva;
  dica: { codigo: string; local: string; capacidade: string };
  frequenciaDoModelo: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className={rotulo}>Código *</label>
        <input name="codigo" required maxLength={30} defaultValue={e?.codigo} placeholder={dica.codigo} className={campo} />
      </div>
      <div>
        <label className={rotulo}>Local</label>
        <input name="local" maxLength={80} defaultValue={e?.local} placeholder={dica.local} className={campo} />
      </div>
      <div>
        <label className={rotulo}>Marca / modelo</label>
        <input name="marca" maxLength={80} defaultValue={e?.marca ?? ""} placeholder="Ex.: Midea Inverter" className={campo} />
      </div>
      <div>
        <label className={rotulo}>Capacidade</label>
        <input name="capacidade" maxLength={40} defaultValue={e?.capacidade ?? ""} placeholder={dica.capacidade} className={campo} />
      </div>
      <div>
        <label className={rotulo}>Frequência própria</label>
        <input
          name="periodicidade_dias"
          type="number"
          min={1}
          max={365}
          defaultValue={e?.periodicidadeDias ?? ""}
          placeholder={`${frequenciaDoModelo} (padrão)`}
          className={campo}
        />
      </div>
      <div>
        <label className={rotulo}>Observação</label>
        <input name="observacao" maxLength={300} defaultValue={e?.observacao ?? ""} className={campo} />
      </div>
    </div>
  );
}

function LinhaDoEquipamento({
  e,
  frequenciaDoModelo,
  prazo,
}: {
  e: EquipamentoPreventiva;
  frequenciaDoModelo: number;
  prazo: Parameters<typeof SeloDoPrazo>[0]["prazo"] | undefined;
}) {
  return (
    <li>
      <details className={`rounded-xl border ${e.ativo ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 opacity-70"}`}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">
              {e.codigo}
              {e.local && <span className="font-normal text-slate-500"> · {e.local}</span>}
            </span>
            <span className="block text-[11px] text-slate-500">
              {e.ativo ? `a cada ${e.periodicidadeDias ?? frequenciaDoModelo} d${e.periodicidadeDias ? " (própria)" : ""}` : "desligado"}
              {e.capacidade && ` · ${e.capacidade}`}
            </span>
          </span>
          {e.ativo && prazo && <SeloDoPrazo prazo={prazo} curto />}
        </summary>
        <div className="space-y-2 border-t border-slate-100 p-3">
          <FormNoLugar acao={editarEquipamento} className="space-y-2">
            <input type="hidden" name="equipamento_id" value={e.id} />
            <CamposDoEquipamento e={e} dica={{ codigo: "", local: "", capacidade: "" }} frequenciaDoModelo={frequenciaDoModelo} />
            <BotaoEnviar textoEnviando="Salvando..." className={`${botao} w-full`}>
              Salvar alterações
            </BotaoEnviar>
          </FormNoLugar>
          <BotaoNoLugar
            acao={alternarEquipamento}
            campos={{ equipamento_id: e.id, ativo: String(!e.ativo) }}
            confirmacao={e.ativo ? `Desligar ${e.codigo}? Ele sai da lista e do lembrete; o histórico fica.` : undefined}
            rotuloConfirmar="Desligar"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            {e.ativo ? "Desligar aparelho (foi removido / trocado)" : "Religar aparelho"}
          </BotaoNoLugar>
        </div>
      </details>
    </li>
  );
}
