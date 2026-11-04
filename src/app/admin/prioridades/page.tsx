import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda, getRevendaAtiva } from "@/lib/revendas";
import { MODULO_PRIORIDADES } from "@/lib/prioridades";
import { PrioridadesNaoInstalado, chaveGestorLog, lerConfig } from "@/lib/prioridades-server";
import { adicionarGv, adicionarMotivo, editarGv, editarMotivo, novoLink, removerGv, removerMotivo } from "./actions";
import { EnderecoGestorLog, LinkDosGvs } from "./LinkDosGvs";
import { LinhaDoGv, LinhaDoMotivo } from "./LinhaDoCadastro";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-[11px] font-semibold uppercase text-slate-500";

/**
 * PRIORIDADES DOS GVs NO MODO LIDERANÇA -- o cadastro, não a leitura (que
 * é na Gestão), como em Chamados (pedido do dono, 03/11/2026): o link que
 * vai para os GVs, quem aparece para escolher nele e os motivos da lista.
 */
export default async function AdminPrioridadesPage() {
  await requireModulo(MODULO_PRIORIDADES, "editar");
  const revendaId = await exigirRevenda("/admin");

  let dados;
  try {
    dados = await Promise.all([lerConfig(revendaId), getRevendaAtiva()]);
  } catch (e) {
    if (!(e instanceof PrioridadesNaoInstalado)) throw e;
    return (
      <div>
        <PageHeader title="🚩 Prioridades dos GVs" />
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Falta rodar a <strong>migration 173</strong> no Supabase.
        </p>
      </div>
    );
  }
  const [config, revenda] = dados;

  return (
    <div className="space-y-6">
      <PageHeader title="🚩 Prioridades dos GVs" subtitle="O link que vai para os GVs, quem escolhe nele e os motivos da lista" />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-bold text-slate-900">O link dos GVs</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Abre sem login. O GV escolhe o nome uma vez, lança código e motivo, e envia tudo de uma vez.
            </p>
          </div>
          <LinkDosGvs token={config.tokenPublico} revendaNome={revenda?.nome ?? "revenda"} />
          <BotaoNoLugar
            acao={novoLink}
            campos={{}}
            confirmacao="Gerar um link novo?"
            detalhe="O link que já está com os GVs para de aceitar prioridades na hora. Use só se ele vazou para fora da empresa."
            rotuloConfirmar="Gerar novo"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
          >
            Gerar link novo
          </BotaoNoLugar>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-bold text-slate-900">GVs da lista</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Quem aparece para escolher no link. O código é o do Promax (Cód. gerente vendas), o mesmo do Gestor LOG.
            </p>
          </div>
          {config.gvs.length === 0 ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Nenhum GV ainda: o link não abre sem a lista.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {config.gvs.map((g) => (
                <LinhaDoGv key={g.nome} gv={g} editar={editarGv} remover={removerGv} />
              ))}
            </ul>
          )}
          <FormNoLugar acao={adicionarGv} limparAoSalvar className="grid grid-cols-[5rem_1fr_auto] items-end gap-2">
            <label>
              <span className={rotulo}>Código</span>
              <input name="codigo" inputMode="numeric" className={campo} placeholder="1" />
            </label>
            <label>
              <span className={rotulo}>Nome</span>
              <input name="nome" required className={campo} placeholder="Nome do GV" />
            </label>
            <BotaoEnviar className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
              Incluir
            </BotaoEnviar>
          </FormNoLugar>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Motivos da lista</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              O que o GV escolhe na lista suspensa, nesta ordem. &quot;Outro motivo (escrever)&quot; aparece sempre, no fim.
            </p>
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {config.motivos.map((m) => (
              <LinhaDoMotivo key={m} motivo={m} editar={editarMotivo} remover={removerMotivo} />
            ))}
          </ul>
          <FormNoLugar acao={adicionarMotivo} limparAoSalvar className="grid grid-cols-[1fr_auto] items-end gap-2">
            <label>
              <span className={rotulo}>Novo motivo</span>
              <input name="motivo" required maxLength={60} className={campo} placeholder="Ex.: Cliente fecha para reforma" />
            </label>
            <BotaoEnviar className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
              Incluir
            </BotaoEnviar>
          </FormNoLugar>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Ligar ao Gestor LOG</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Cole este endereço uma vez no Gestor LOG (Pré-roteirização › Prioridades › Ligar ao link dos GVs). Daí em diante, o que os GVs
              lançam chega sozinho lá. Não mande no grupo: ele mostra a lista de todos. Gerar link novo troca este endereço também.
            </p>
          </div>
          <EnderecoGestorLog chave={chaveGestorLog(config.tokenPublico)} />
        </div>
      </section>

      <Link href="/gestao/prioridades" className="inline-block text-sm font-semibold text-primary underline">
        Ver as prioridades que chegaram na Gestão →
      </Link>
    </div>
  );
}
