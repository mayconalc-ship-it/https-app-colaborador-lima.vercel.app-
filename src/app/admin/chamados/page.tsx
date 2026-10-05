import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { LinkDoGuia } from "@/components/LinkDoGuia";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { QrDoLink } from "@/components/QrDoLink";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { MODULO_CHAMADOS, agruparLocais, dataHora } from "@/lib/chamados";
import { ChamadosNaoInstalado, lerConfig, lerLocais, origemDoSite } from "@/lib/chamados-server";
import { alternarLocal, criarLocal, editarLocal, novoQr, salvarPrazos } from "./actions";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-[11px] font-semibold uppercase text-slate-500";

/**
 * CHAMADOS NO MODO LIDERANÇA -- o cadastro, não a leitura (que é na
 * Gestão): as áreas, o QR Code que vai para a parede (UM só por revenda,
 * pedido do dono) e o prazo de cada prioridade. É o 8.1 do DPO: "gestão e
 * conservação dos QR Codes".
 */
export default async function AdminChamadosPage() {
  await requireModulo(MODULO_CHAMADOS, "editar");
  const revendaId = await exigirRevenda("/admin");

  let dados;
  try {
    dados = await Promise.all([lerConfig(revendaId), lerLocais(revendaId, false), origemDoSite()]);
  } catch (e) {
    if (!(e instanceof ChamadosNaoInstalado)) throw e;
    return (
      <div>
        <PageHeader title="🔧 Chamados de Manutenção" />
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Falta rodar a <strong>migration 165</strong> no Supabase.
        </p>
      </div>
    );
  }
  const [config, locais, site] = dados;
  const ativos = locais.filter((l) => l.ativo).length;
  const grupos = [...new Set(locais.map((l) => l.grupo).filter(Boolean))];
  const urlDoQr = `${site.origem}/os/${config.tokenPublico}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="🔧 Chamados de Manutenção"
        subtitle="O QR Code que vai para a parede, as áreas da lista e o prazo de cada prioridade"
      />
      <LinkDoGuia slug="configurar-chamados-qr" />

      {site.local && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ Você está no endereço de teste ({site.origem}). O QR Code daqui aponta para ele e não abre no celular de
          ninguém. Imprima pelo app publicado.
        </p>
      )}

      {/* ---- O QR (um só) ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">O QR Code da unidade</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Um só para a unidade inteira, como era o Forms. Imprima quantas cópias quiser e cole onde a equipe circula:
          quem escaneia escolhe a área na lista.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <QrDoLink url={urlDoQr} rotulo="QR Code dos chamados de manutenção" nivel="Q" className="h-28 w-28 shrink-0 rounded-lg border border-slate-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="break-all rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-600">{urlDoQr}</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/chamados/qr"
                target="_blank"
                className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                🖨️ Imprimir o cartaz
              </Link>
              <BotaoNoLugar
                acao={novoQr}
                campos={{}}
                confirmacao="Gerar um QR Code novo?"
                detalhe="TODOS os cartazes já colados param de abrir chamado e precisam ser trocados. Use só quando o QR vazou para fora da empresa."
                rotuloConfirmar="Gerar novo"
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                🔄 Gerar QR novo
              </BotaoNoLugar>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Áreas ---- */}
      <section>
        <div className="mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            📍 Áreas <span className="text-slate-400">({ativos} ligadas)</span>
          </h2>
          <p className="text-xs text-slate-400">A lista que aparece no formulário, no app e no QR.</p>
        </div>

        <details className="mb-3 rounded-2xl border border-dashed border-primary/40 bg-primary-soft/30">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-primary-dark">＋ Nova área</summary>
          <FormNoLugar acao={criarLocal} limparAoSalvar className="grid gap-3 px-4 pb-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
            <label>
              <span className={rotulo}>Grupo (opcional)</span>
              <input name="grupo" list="grupos-de-area" maxLength={60} placeholder="Ex.: Armazém" className={campo} />
            </label>
            <label>
              <span className={rotulo}>Nome da área</span>
              <input name="nome" required maxLength={80} placeholder="Ex.: Doca 3" className={campo} />
            </label>
            <BotaoEnviar textoEnviando="Criando..." className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
              Criar
            </BotaoEnviar>
          </FormNoLugar>
        </details>
        <datalist id="grupos-de-area">
          {grupos.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>

        <div className="space-y-4">
          {agruparLocais(locais).map((g) => (
            <div key={g.titulo}>
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.titulo}</p>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {g.itens.map((l) => (
                  <li key={l.id} className={l.ativo ? "" : "bg-slate-50"}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-sm font-semibold ${l.ativo ? "text-slate-900" : "text-slate-400 line-through"}`}>
                            {l.nome}
                          </span>
                          {!l.ativo && <span className="block text-[11px] text-slate-400">Desligada: fora da lista do formulário</span>}
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-primary group-open:hidden">Editar</span>
                        <span className="hidden shrink-0 text-xs font-semibold text-slate-400 group-open:inline">Fechar</span>
                      </summary>

                      <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-3">
                        <FormNoLugar acao={editarLocal} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_5rem_auto] sm:items-end">
                          <input type="hidden" name="id" value={l.id} />
                          <label>
                            <span className={rotulo}>Grupo</span>
                            <input name="grupo" list="grupos-de-area" defaultValue={l.grupo} maxLength={60} className={campo} />
                          </label>
                          <label>
                            <span className={rotulo}>Nome</span>
                            <input name="nome" required defaultValue={l.nome} maxLength={80} className={campo} />
                          </label>
                          <label>
                            <span className={rotulo}>Ordem</span>
                            <input name="ordem" type="number" min={0} max={999} defaultValue={l.ordem} className={campo} />
                          </label>
                          <BotaoEnviar textoEnviando="Salvando..." className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
                            Salvar
                          </BotaoEnviar>
                        </FormNoLugar>
                        <div className="flex flex-wrap gap-2">
                          <BotaoNoLugar
                            acao={alternarLocal}
                            campos={{ id: l.id, ativo: l.ativo ? "0" : "1" }}
                            perigo={l.ativo}
                            confirmacao={l.ativo ? `Desligar "${l.nome}"?` : undefined}
                            detalhe="A área sai da lista do formulário. Os chamados antigos continuam."
                            rotuloConfirmar="Desligar"
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            {l.ativo ? "⏻ Desligar" : "⏻ Ligar de novo"}
                          </BotaoNoLugar>
                        </div>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Prazos ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">⏱️ Prazo de atendimento, por prioridade</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Em horas corridas, contadas da abertura. É a régua do &quot;concluído no prazo&quot; do painel (DPO 9.2). Mudar
          vale para os chamados abertos daqui em diante.
        </p>
        <FormNoLugar acao={salvarPrazos} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label>
            <span className={rotulo}>⚠️ Risco à segurança</span>
            <input name="risco" type="number" min={1} max={2160} required defaultValue={config.prazos.risco} className={campo} />
          </label>
          <label>
            <span className={rotulo}>Urgente</span>
            <input name="urgente" type="number" min={1} max={2160} required defaultValue={config.prazos.urgente} className={campo} />
          </label>
          <label>
            <span className={rotulo}>Normal</span>
            <input name="normal" type="number" min={1} max={2160} required defaultValue={config.prazos.normal} className={campo} />
          </label>
          <BotaoEnviar textoEnviando="Salvando..." className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
            Salvar
          </BotaoEnviar>
        </FormNoLugar>
        {config.atualizadoEm && (
          <p className="mt-2 text-[11px] text-slate-400">
            Alterado em {dataHora(config.atualizadoEm)}
            {config.atualizadoPorNome ? ` por ${config.atualizadoPorNome}` : ""}.
          </p>
        )}
      </section>

      <Link href="/gestao/chamados" className="inline-block text-sm font-semibold text-primary underline">
        Ver o painel dos chamados na Gestão →
      </Link>
    </div>
  );
}
