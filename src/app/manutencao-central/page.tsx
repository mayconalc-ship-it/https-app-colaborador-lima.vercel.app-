import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Icone } from "@/components/Icone";
import { BarraDoPrazo, SeloDoPrazo } from "@/components/manutencao/PrazoDaPreventiva";
import { createAdminClient } from "@/lib/supabase/admin";
import { getModulosAcessiveis, podeNoModulo } from "@/lib/require-admin";
import { getPerfil } from "@/lib/sessao";
import { getModulosDaRevenda, getRevendaId } from "@/lib/revendas";
import { daSecao, painelDaRevenda, PreventivaNaoAtualizada, type PainelPreventiva } from "@/lib/manutencao-preventiva-server";
import { nomeDoEquipamento, SECOES } from "@/lib/manutencao-preventiva";
import { listarAvaliacoes } from "@/lib/manutencao-server";
import { rotuloTrimestre, trimestreDe } from "@/lib/manutencao";

export const dynamic = "force-dynamic";

type Tom = "ruim" | "atencao" | "bom" | "neutro";
const COR_DO_TOM: Record<Tom, string> = {
  ruim: "text-red-700",
  atencao: "text-amber-700",
  bom: "text-emerald-700",
  neutro: "text-slate-500",
};

/**
 * A VITRINE DA MANUTENÇÃO (16/11/2026, pedido do dono): como a do
 * Armazém, mas cada cartão já diz como está -- "2 vencidas", "3 em
 * aberto", "T4 em andamento" -- para a pessoa decidir onde tocar sem
 * entrar em três telas. Abaixo, só o que pede ação agora.
 *
 * Nenhuma permissão nova: cada cartão segue a concessão do seu módulo.
 */
export default async function ManutencaoCentralPage() {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  const revendaId = await getRevendaId();
  if (!revendaId) redirect("/");

  const [modulosDaRevenda, acessiveis, podeCadastrar, podePainelChamados] = await Promise.all([
    getModulosDaRevenda(revendaId),
    getModulosAcessiveis(),
    podeNoModulo("manutencao-preventiva", "editar"),
    podeNoModulo("chamados", "ver"),
  ]);

  const veChamado = modulosDaRevenda.has("chamados");
  const atende = acessiveis.has("chamados-atender");
  const veCheck = acessiveis.has("manutencao");
  const vePreventiva = acessiveis.has("manutencao-preventiva");
  if (!veChamado && !veCheck && !vePreventiva) redirect("/");

  const admin = createAdminClient();
  const agora = new Date();

  const [painelTodo, chamados, avaliacoes] = await Promise.all([
    vePreventiva || podeCadastrar
      ? painelDaRevenda(revendaId, admin).catch((e) => {
          if (e instanceof PreventivaNaoAtualizada) return null;
          throw e;
        })
      : Promise.resolve(null as PainelPreventiva | null),
    veChamado && (atende || podePainelChamados)
      ? admin
          .from("chamados")
          .select("id, prazo_em")
          .eq("revenda_id", revendaId)
          .in("status", ["aberto", "em_atendimento", "aguardando"])
          .then((r) => r.data ?? [])
      : Promise.resolve(null),
    veCheck ? listarAvaliacoes(revendaId, admin).catch(() => []) : Promise.resolve([]),
  ]);

  // ---- o que cada cartão diz ----
  // O Check Ferramental tem cartão próprio (17/11/2026): fora da Preventiva.
  const painel = painelTodo ? daSecao(painelTodo, "preventiva") : null;
  const ferramental = painelTodo ? daSecao(painelTodo, "ferramental") : null;
  const pedeAtencao = (a: PainelPreventiva["alvos"][number]) =>
    a.prazo.estado === "atrasada" || a.prazo.estado === "vence_hoje";
  const vencidas = painelTodo?.alvos.filter(pedeAtencao) ?? [];
  const logo = painelTodo?.alvos.filter((a) => a.prazo.estado === "proxima") ?? [];

  const statusDo = (p: PainelPreventiva | null): { texto: string; tom: Tom } | null => {
    if (!p) return null;
    const v = p.alvos.filter(pedeAtencao).length;
    const l = p.alvos.filter((a) => a.prazo.estado === "proxima").length;
    if (v > 0) return { texto: `${v} vencida${v === 1 ? "" : "s"}`, tom: "ruim" };
    if (l > 0) return { texto: `${l} vence${l === 1 ? "" : "m"} logo`, tom: "atencao" };
    return p.alvos.length > 0 ? { texto: "Tudo em dia", tom: "bom" } : { texto: "Nada cadastrado", tom: "neutro" };
  };
  const statusPreventiva = statusDo(painel);
  const statusFerramental = statusDo(ferramental);

  const atrasadosChamado = chamados?.filter((c) => new Date(c.prazo_em) < agora).length ?? 0;
  const statusChamado: { texto: string; tom: Tom } | null =
    chamados === null
      ? { texto: "Abrir e acompanhar", tom: "neutro" }
      : chamados.length === 0
        ? { texto: "Nenhum em aberto", tom: "bom" }
        : {
            texto: `${chamados.length} em aberto${atrasadosChamado ? ` · ${atrasadosChamado} fora do prazo` : ""}`,
            tom: atrasadosChamado ? "ruim" : "atencao",
          };

  const hojeIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const tri = trimestreDe(hojeIso);
  const doTri = avaliacoes.find((a) => a.ano === tri.ano && a.trimestre === tri.trimestre);
  const statusCheck: { texto: string; tom: Tom } = !doTri
    ? { texto: `${rotuloTrimestre(tri)} não iniciado`, tom: "atencao" }
    : doTri.status === "finalizada"
      ? { texto: `${rotuloTrimestre(tri)} concluído`, tom: "bom" }
      : { texto: `${rotuloTrimestre(tri)} em andamento`, tom: "atencao" };

  const cartoes = [
    vePreventiva && {
      chave: "manutencao-preventiva",
      emoji: "🔩",
      titulo: "Preventiva",
      href: "/manutencao-preventiva",
      status: statusPreventiva,
    },
    vePreventiva &&
      ferramental &&
      ferramental.alvos.length > 0 && {
        chave: "manutencao-ferramental",
        emoji: "🧰",
        titulo: "Check Ferramental",
        href: SECOES.ferramental.href,
        status: statusFerramental,
      },
    veChamado && {
      chave: "chamados",
      emoji: "🔧",
      titulo: "Chamado para Manutenção",
      href: atende ? "/chamados?aba=fila" : "/chamados",
      status: statusChamado,
    },
    veCheck && {
      chave: "manutencao",
      emoji: "☑️",
      titulo: "Check de Manutenção",
      href: "/manutencao",
      status: statusCheck,
    },
  ].filter(Boolean) as { chave: string; emoji: string; titulo: string; href: string; status: { texto: string; tom: Tom } | null }[];

  // O que pede ação: vencidas primeiro, depois as que vencem logo -- no
  // máximo 5, o resto está na tela da Preventiva.
  const agoraFazer = vePreventiva ? [...vencidas, ...logo].slice(0, 5) : [];
  const resto = vePreventiva ? vencidas.length + logo.length - agoraFazer.length : 0;

  return (
    <div>
      <PageHeader title="🛠️ Manutenção" subtitle="Preventiva, chamados e checks num lugar só." />

      <div className="grid grid-cols-2 gap-3">
        {cartoes.map((c, i) => (
          <Link
            key={c.chave}
            href={c.href}
            prefetch={false}
            className={`group flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-primary hover:shadow-md ${
              cartoes.length % 2 === 1 && i === 0 ? "col-span-2" : ""
            }`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Icone chave={c.chave} emoji={c.emoji} tamanho={22} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold leading-tight text-slate-900 group-hover:text-primary">{c.titulo}</span>
              {c.status && (
                <span className={`mt-0.5 block text-xs font-semibold ${COR_DO_TOM[c.status.tom]}`}>{c.status.texto}</span>
              )}
            </span>
          </Link>
        ))}
      </div>

      {vePreventiva && painelTodo === null && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          A preventiva está sendo atualizada. Falta rodar a migration 181 no Supabase.
        </p>
      )}

      {agoraFazer.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Pede atenção agora</h2>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {agoraFazer.map((a) => (
              <li key={a.chave}>
                <Link
                  href={`${SECOES[a.modelo.secao].href}?alvo=${encodeURIComponent(a.chave)}`}
                  prefetch={false}
                  className="flex items-center gap-3 px-3.5 py-3 hover:bg-slate-50"
                >
                  <span className="text-xl" aria-hidden>
                    {a.modelo.emoji ?? "🔩"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {a.equipamento ? `${a.modelo.equipamento} ${nomeDoEquipamento(a.equipamento)}` : a.modelo.nome}
                      </span>
                      <SeloDoPrazo prazo={a.prazo} curto />
                    </span>
                    <span className="mt-1.5 block">
                      <BarraDoPrazo prazo={a.prazo} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {resto > 0 && (
            <Link href="/manutencao-preventiva?ver=vencidas" className="mt-2 block text-right text-xs font-semibold text-primary">
              e mais {resto} →
            </Link>
          )}
        </section>
      )}

      {vePreventiva && painel && painel.semCadastro.length > 0 && (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Sem aparelho cadastrado: {painel.semCadastro.map((m) => m.equipamento).join(", ")}.{" "}
          {podeCadastrar ? (
            <Link href="/admin/manutencao-preventiva" className="font-semibold text-primary">
              Cadastrar agora
            </Link>
          ) : (
            "Peça à liderança para cadastrar."
          )}
        </p>
      )}

      {(podeCadastrar || podePainelChamados) && (
        <div className="mt-6 flex flex-col gap-2">
          {podePainelChamados && (
            <Link
              href="/gestao/chamados"
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              📊 Painel dos chamados
            </Link>
          )}
          {podeCadastrar && (
            <Link
              href="/admin/manutencao-preventiva"
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              ⚙️ Aparelhos e frequência das preventivas
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
