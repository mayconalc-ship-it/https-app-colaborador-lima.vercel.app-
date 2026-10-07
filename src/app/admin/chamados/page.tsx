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
import { LinhaDaArea } from "@/components/chamados/LinhaDaArea";
import {
  adicionarEmail,
  alternarLocal,
  criarLocal,
  editarLocal,
  moverLocal,
  novoQr,
  ordenarLocal,
  removerEmail,
  renomearSetor,
  salvarPrazos,
} from "./actions";

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
        <PageHeader title="🔧 Chamados para Manutenção" />
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
        title="🔧 Chamados para Manutenção"
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
          <QrDoLink url={urlDoQr} rotulo="QR Code dos chamados para manutenção" nivel="Q" className="h-28 w-28 shrink-0 rounded-lg border border-slate-200" />
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
          <p className="text-xs text-slate-400">
            A lista do formulário, no app e no QR, na mesma ordem. Troque o setor na lista ao lado da área e use as setas
            para subir ou descer; o lápis muda o nome ou desliga.
          </p>
        </div>

        <details className="mb-3 rounded-2xl border border-dashed border-primary/40 bg-primary-soft/30">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-primary-dark">＋ Nova área</summary>
          <FormNoLugar acao={criarLocal} limparAoSalvar className="grid gap-3 px-4 pb-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
            <label>
              <span className={rotulo}>Setor</span>
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

        {/* O ORGANIZADOR (07/10/2026, pedido do dono): o setor numa lista
            que salva ao escolher, e as setas para subir/descer. A ordem aqui
            é a ordem do formulário. */}
        <div className="space-y-4">
          {agruparLocais(locais).map((g) => {
            const setor = g.itens[0]?.grupo ?? "";
            return (
              <div key={g.titulo}>
                <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {g.titulo} <span className="text-slate-400">({g.itens.length})</span>
                  </p>
                  {setor && (
                    <details className="relative">
                      <summary className="cursor-pointer list-none text-[11px] font-semibold text-primary [&::-webkit-details-marker]:hidden">
                        Renomear setor
                      </summary>
                      <FormNoLugar
                        acao={renomearSetor}
                        fecharAoSalvar
                        className="absolute right-0 z-10 mt-1 flex w-64 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
                      >
                        <input type="hidden" name="de" value={setor} />
                        <input name="para" required maxLength={60} defaultValue={setor} aria-label="Novo nome do setor" className={campo} />
                        <BotaoEnviar textoEnviando="..." className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
                          OK
                        </BotaoEnviar>
                      </FormNoLugar>
                    </details>
                  )}
                </div>
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {g.itens.map((l, i) => (
                    <LinhaDaArea
                      key={l.id}
                      local={l}
                      setores={grupos}
                      primeira={i === 0}
                      ultima={i === g.itens.length - 1}
                      mover={moverLocal}
                      ordenar={ordenarLocal}
                      editar={editarLocal}
                      alternar={alternarLocal}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* As áreas do 5S entram sozinhas, sem setor: alguém escolhe o setor aqui. */}
        <p className="mt-2 px-1 text-[11px] text-slate-400">
          As áreas marcadas <strong>do 5S</strong> vêm do cadastro do 5S: nome e liga/desliga são de lá (
          <Link href="/admin/5s" className="font-semibold text-primary underline">
            Admin › 5S
          </Link>
          ). Área nova do 5S aparece em &quot;Demais áreas&quot; até você escolher o setor dela.
        </p>
      </section>

      {/* ---- E-mails ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">✉️ Quem recebe o chamado por e-mail</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Cada chamado tem o botão <strong>Enviar por e-mail</strong>, que abre o Outlook de quem tocou já com estes
          destinatários, o assunto e o chamado inteiro no texto. O e-mail sai da conta da própria pessoa.
        </p>
        {config.emails.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {config.emails.map((e) => (
              <li key={e} className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1 text-sm text-slate-700">
                {e}
                <BotaoNoLugar
                  acao={removerEmail}
                  campos={{ email: e }}
                  confirmacao={`Tirar ${e} da lista?`}
                  rotuloConfirmar="Tirar"
                  className="rounded-full px-2 py-0.5 text-xs font-bold text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  ✕
                </BotaoNoLugar>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Nenhum e-mail cadastrado. Sem eles, o botão abre o e-mail sem destinatário.
          </p>
        )}
        <FormNoLugar acao={adicionarEmail} limparAoSalvar className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[14rem] flex-1">
            <span className={rotulo}>Novo e-mail</span>
            <input name="email" type="email" required maxLength={160} placeholder="manutencao@limalogistica.com.br" className={campo} />
          </label>
          <BotaoEnviar textoEnviando="Salvando..." className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark">
            Adicionar
          </BotaoEnviar>
        </FormNoLugar>
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
