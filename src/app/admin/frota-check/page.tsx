import { PageHeader } from "@/components/PageHeader";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { MODULO_FROTA_CHECK, placaParaLer } from "@/lib/frota-check";
import { alternarVeiculo, cadastrarPlacas, salvarVeiculo, trocarResponsavelEmMassa } from "./actions";

export const dynamic = "force-dynamic";

const campo = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const botao = "rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark";

/** Placas do Check da Frota e quem responde por cada uma (Modo Liderança). */
export default async function AdminFrotaCheckPage() {
  await requireModulo(MODULO_FROTA_CHECK, "editar");
  const revendaId = await exigirRevenda("/admin");
  const admin = createAdminClient();

  const [{ data: veiculos, error }, { data: vinculos }] = await Promise.all([
    admin.from("cf_veiculos").select("id, placa, descricao, responsavel_id, responsavel_nome, ativo").eq("revenda_id", revendaId).order("placa"),
    admin.from("colaborador_revendas").select("colaborador_id").eq("revenda_id", revendaId),
  ]);
  if (error) {
    return (
      <div>
        <PageHeader title="🚚 Check da Frota" />
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Falta rodar a <strong>migration 184</strong> no Supabase.
        </p>
      </div>
    );
  }
  const ids = (vinculos ?? []).map((v) => v.colaborador_id as string);
  const pessoas: { id: string; nome: string; cargo: string | null; area: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("profiles").select("id, nome, cargo, area").in("id", ids.slice(i, i + 200));
    pessoas.push(...((data ?? []) as typeof pessoas));
  }
  // a frota primeiro na lista (é quem faz o check), depois o resto
  const daFrota = (p: (typeof pessoas)[number]) => /frota|manuten/i.test(`${p.cargo ?? ""} ${p.area ?? ""}`);
  pessoas.sort((a, b) => Number(daFrota(b)) - Number(daFrota(a)) || a.nome.localeCompare(b.nome, "pt-BR"));
  const nomeDe = new Map(pessoas.map((p) => [p.id, p.nome]));

  const ativos = (veiculos ?? []).filter((v) => v.ativo);
  const inativos = (veiculos ?? []).filter((v) => !v.ativo);
  const soPlanilha = [...new Set(ativos.filter((v) => !v.responsavel_id && v.responsavel_nome).map((v) => v.responsavel_nome as string))];

  const opcoes = (
    <>
      <option value="">— escolher —</option>
      {pessoas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
          {p.cargo ? ` · ${p.cargo}` : ""}
        </option>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="🚚 Check da Frota" subtitle="Placas e quem responde por cada uma. Escolher a pessoa já libera o check para ela." />

      {soPlanilha.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-bold text-amber-900">Nomes da planilha sem cadastro no app</h2>
          <p className="mb-3 text-xs text-amber-900">
            A aba &quot;Divisão placas&quot; trazia só o primeiro nome. Escolha a pessoa e todas as placas dela passam de uma vez.
          </p>
          <div className="space-y-2">
            {soPlanilha.map((n) => (
              <FormNoLugar key={n} acao={trocarResponsavelEmMassa} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="nome_planilha" value={n} />
                <span className="w-28 text-sm font-bold text-slate-900">
                  {n} <span className="font-normal text-slate-500">({ativos.filter((v) => v.responsavel_nome === n && !v.responsavel_id).length})</span>
                </span>
                <select name="responsavel_id" required className={`${campo} min-w-0 flex-1`}>
                  {opcoes}
                </select>
                <BotaoEnviar textoEnviando="Salvando..." className={botao}>
                  Passar
                </BotaoEnviar>
              </FormNoLugar>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 p-3 text-xs font-bold uppercase tracking-wide text-slate-500">
          Caminhões ativos ({ativos.length})
        </h2>
        <ul className="divide-y divide-slate-100">
          {ativos.map((v) => (
            <li key={v.id} className="p-3">
              <FormNoLugar acao={salvarVeiculo} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="veiculo_id" value={v.id} />
                <span className="w-24 font-mono text-sm font-bold text-slate-900">{placaParaLer(v.placa)}</span>
                <select name="responsavel_id" defaultValue={v.responsavel_id ?? ""} className={`${campo} min-w-0 flex-1 sm:max-w-xs`}>
                  {opcoes}
                </select>
                <input name="descricao" defaultValue={v.descricao ?? ""} placeholder="Modelo / apelido" className={`${campo} w-40`} />
                <BotaoEnviar textoEnviando="..." className={botao}>
                  Salvar
                </BotaoEnviar>
                <BotaoNoLugar
                  acao={alternarVeiculo}
                  campos={{ veiculo_id: v.id, ativo: "0" }}
                  confirmacao={`Desativar a ${placaParaLer(v.placa)}?`}
                  detalhe="Sai do farol e da lista. O histórico de checks fica."
                  rotuloConfirmar="Desativar"
                  className="text-xs font-semibold text-red-700"
                >
                  Desativar
                </BotaoNoLugar>
              </FormNoLugar>
              {!v.responsavel_id && (
                <p className="mt-1 text-[11px] text-amber-800">
                  {v.responsavel_nome ? `Na planilha: ${v.responsavel_nome} (sem cadastro no app)` : "Sem responsável"}
                </p>
              )}
              {v.responsavel_id && !nomeDe.has(v.responsavel_id) && (
                <p className="mt-1 text-[11px] text-amber-800">{v.responsavel_nome} não está mais nesta revenda.</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-dashed border-primary/40 bg-primary-soft/30 p-4">
        <h2 className="mb-2 text-sm font-bold text-slate-900">＋ Cadastrar placas</h2>
        <FormNoLugar acao={cadastrarPlacas} limparAoSalvar className="space-y-2">
          <textarea name="placas" rows={3} required placeholder="Uma ou várias, separadas por espaço ou linha: ABC1D23 XYZ9A87" className={campo} />
          <BotaoEnviar textoEnviando="Cadastrando..." className={`${botao} w-full`}>
            Cadastrar
          </BotaoEnviar>
        </FormNoLugar>
      </section>

      {inativos.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="cursor-pointer list-none p-3 text-sm font-semibold text-slate-600 [&::-webkit-details-marker]:hidden">
            Desativadas ({inativos.length})
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {inativos.map((v) => (
              <li key={v.id} className="flex items-center justify-between p-3">
                <span className="font-mono text-sm text-slate-500">{placaParaLer(v.placa)}</span>
                <BotaoNoLugar acao={alternarVeiculo} campos={{ veiculo_id: v.id, ativo: "1" }} className="text-xs font-semibold text-primary">
                  Reativar
                </BotaoNoLugar>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
