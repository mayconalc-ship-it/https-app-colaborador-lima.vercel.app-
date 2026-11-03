import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ExportarCsv } from "@/components/ExportarCsv";
import { FormNoLugar } from "@/components/FormNoLugar";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { BotaoNoLugar } from "@/components/BotaoNoLugar";
import { requireModulo, podeNoModulo } from "@/lib/require-admin";
import { exigirRevenda, getRevendaAtiva } from "@/lib/revendas";
import {
  MODULO_PRIORIDADES,
  dataCurta,
  hojeEmSaoPaulo,
  proximaEntrega,
  rotuloDoGv,
  somarDias,
} from "@/lib/prioridades";
import { PrioridadesNaoInstalado, diasComPrioridade, lerConfig, prioridadesDoDia } from "@/lib/prioridades-server";
import { adicionarGv, adicionarMotivo, novoLink, removerGv, removerMotivo, removerPrioridade } from "./actions";
import { LinkDosGvs } from "./LinkDosGvs";

export const dynamic = "force-dynamic";

const campo =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none";
const rotulo = "mb-1 block text-[11px] font-semibold uppercase text-slate-500";

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * AS PRIORIDADES DOS GVs -- o que chegou pelo link, por dia de entrega.
 *
 * Abre na PRÓXIMA ENTREGA, que é a lista que a roteirização precisa
 * agora. O .csv é o que o Gestor LOG lê na sub-aba Prioridades (a coluna
 * "Cód. PDV" é a que ele procura, e "prioridades" no nome do arquivo o
 * faz reconhecer o tipo).
 */
export default async function PrioridadesDosGvsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await requireModulo(MODULO_PRIORIDADES, "ver", "/gestao");
  const revendaId = await exigirRevenda("/gestao");
  const podeEditar = await podeNoModulo(MODULO_PRIORIDADES, "editar");
  const { d } = await searchParams;

  const hoje = hojeEmSaoPaulo();
  const padrao = proximaEntrega(hoje);
  const dia = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : padrao;

  let dados;
  try {
    dados = await Promise.all([
      lerConfig(revendaId),
      prioridadesDoDia(revendaId, dia),
      diasComPrioridade(revendaId, somarDias(hoje, -30)),
      getRevendaAtiva(),
    ]);
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
  const [config, lista, dias, revenda] = dados;

  // Os atalhos de dia: hoje, a próxima entrega e os dias que têm lista.
  const atalhos = [...new Set([padrao, hoje, ...dias.map((x) => x.dia)])].sort().reverse().slice(0, 10);
  const totalDoDia = new Map(dias.map((x) => [x.dia, x.total]));

  const porGv = new Map<string, number>();
  for (const p of lista) porGv.set(p.gv_nome, (porGv.get(p.gv_nome) ?? 0) + 1);
  const gvsDoDia = [...porGv].sort((a, b) => b[1] - a[1]);
  const semNome = lista.filter((p) => !p.nome_pdv).length;

  return (
    <div className="space-y-6">
      <PageHeader title="🚩 Prioridades dos GVs" subtitle="O que os GVs pediram para sair primeiro, por dia de entrega" />

      {/* ---- Dia ---- */}
      <section className="space-y-2">
        <nav className="flex flex-wrap gap-1.5" aria-label="Dia de entrega">
          {atalhos.map((x) => (
            <Link
              key={x}
              href={`/gestao/prioridades?d=${x}`}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                x === dia ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-600 hover:border-primary"
              }`}
            >
              {x === hoje ? "Hoje" : dataCurta(x)}
              {totalDoDia.get(x) ? <span className={x === dia ? "text-white/80" : "text-slate-400"}> · {totalDoDia.get(x)}</span> : null}
            </Link>
          ))}
        </nav>
        <form method="get" className="flex items-end gap-2">
          <label className="text-xs text-slate-500">
            Outro dia
            <input type="date" name="d" defaultValue={dia} className="ml-2 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Ver
          </button>
        </form>
      </section>

      {/* ---- A lista do dia ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Entrega {dataCurta(dia)} <span className="font-normal text-slate-400">· {lista.length} {lista.length === 1 ? "PDV" : "PDVs"}</span>
            </h2>
            {gvsDoDia.length > 0 && (
              <p className="text-xs text-slate-500">{gvsDoDia.map(([gv, n]) => `${gv}: ${n}`).join(" · ")}</p>
            )}
          </div>
          <ExportarCsv
            nome="prioridades"
            complemento={dia}
            rotulo="Baixar .csv para o Gestor LOG"
            cabecalho={["Cód. PDV", "PDV", "Motivo", "GV", "Cód. GV", "Entrega", "Enviado em"]}
            linhas={[...lista].reverse().map((p) => [
              p.cod_pdv,
              p.nome_pdv ?? "",
              p.motivo,
              p.gv_nome,
              p.gv_codigo ?? "",
              dia.split("-").reverse().join("/"),
              hora(p.enviado_em),
            ])}
          />
        </div>
        {lista.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Nenhuma prioridade para {dataCurta(dia)}.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lista.map((p) => (
              <li key={p.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">
                    {p.cod_pdv}
                    {p.nome_pdv ? (
                      <span className="font-normal text-slate-600"> · {p.nome_pdv}</span>
                    ) : (
                      <span className="font-normal text-amber-700"> · fora da base de clientes</span>
                    )}
                  </p>
                  <p className="text-sm text-slate-600">{p.motivo}</p>
                  <p className="text-xs text-slate-400">
                    {p.gv_nome} · {hora(p.enviado_em)}
                  </p>
                </div>
                {podeEditar && (
                  <BotaoNoLugar
                    acao={removerPrioridade}
                    campos={{ id: p.id }}
                    confirmacao={`Tirar o PDV ${p.cod_pdv} da lista de ${dataCurta(dia)}?`}
                    detalhe="Use para código errado ou PDV que não é prioridade. O GV não é avisado."
                    rotuloConfirmar="Tirar"
                    className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Tirar
                  </BotaoNoLugar>
                )}
              </li>
            ))}
          </ul>
        )}
        {semNome > 0 && (
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-amber-800">
            {semNome} {semNome === 1 ? "código não está" : "códigos não estão"} na base de clientes (Fontes de Dados): confira se o GV digitou certo.
          </p>
        )}
      </section>

      {/* ---- O link e os GVs ---- */}
      {podeEditar && (
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
                  <li key={g.nome} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="text-slate-800">{rotuloDoGv(g)}</span>
                    <BotaoNoLugar
                      acao={removerGv}
                      campos={{ nome: g.nome }}
                      confirmacao={`Tirar ${g.nome} da lista do link?`}
                      detalhe="O que ele já enviou continua no painel."
                      rotuloConfirmar="Tirar"
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Tirar
                    </BotaoNoLugar>
                  </li>
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
                <li key={m} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="text-slate-800">{m}</span>
                  <BotaoNoLugar
                    acao={removerMotivo}
                    campos={{ motivo: m }}
                    confirmacao={`Tirar "${m}" da lista?`}
                    detalhe="O que já foi enviado com esse motivo continua no painel."
                    rotuloConfirmar="Tirar"
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Tirar
                  </BotaoNoLugar>
                </li>
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
        </section>
      )}
    </div>
  );
}
