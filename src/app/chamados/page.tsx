import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { LinkDoGuia } from "@/components/LinkDoGuia";
import { FormChamado } from "@/components/chamados/FormChamado";
import { CartaoChamado } from "@/components/chamados/CartaoChamado";
import { getRevendaAtiva } from "@/lib/revendas";
import { emAberto, gruposDoFormulario, situacaoDoPrazo } from "@/lib/chamados";
import {
  ChamadosNaoInstalado,
  contextoChamados,
  lerLocais,
  listarFila,
  listarMeus,
  type Chamado,
} from "@/lib/chamados-server";
import { abrirChamadoNoApp } from "./actions";

export const dynamic = "force-dynamic";

type Aba = "abrir" | "meus" | "fila";

/**
 * CHAMADO PARA MANUTENÇÃO -- a tela do app.
 *
 * Três abas, e a terceira é só do time da manutenção:
 *   Abrir   o formulário (o mesmo do QR Code);
 *   Meus    o que eu pedi e em que pé está;
 *   Fila    tudo o que está aberto na revenda, o atrasado primeiro.
 *
 * Quem é do time abre direto na Fila: é o que ele veio fazer.
 */
export default async function ChamadosPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; local?: string }>;
}) {
  const ctx = await contextoChamados();
  if (!ctx.ok) redirect(`/?erro=${encodeURIComponent(ctx.erro)}`);
  const sp = await searchParams;
  const aba: Aba = sp.aba === "meus" || (sp.aba === "fila" && ctx.podeAtender) || sp.aba === "abrir" ? (sp.aba as Aba) : ctx.podeAtender ? "fila" : "abrir";

  let dados;
  try {
    const [revenda, locais, meus, fila] = await Promise.all([
      getRevendaAtiva(),
      lerLocais(ctx.revendaId),
      listarMeus(ctx.revendaId, ctx.perfil.id),
      ctx.podeAtender ? listarFila(ctx.revendaId) : Promise.resolve(null),
    ]);
    dados = { revenda, locais, meus, fila };
  } catch (e) {
    if (!(e instanceof ChamadosNaoInstalado)) throw e;
    return (
      <div>
        <PageHeader title="🔧 Chamado para Manutenção" />
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          O módulo ainda não foi instalado no banco. Falta rodar a <strong>migration 165</strong> no Supabase.
        </p>
      </div>
    );
  }

  const { revenda, locais, meus, fila } = dados;
  const agora = new Date();
  const meusAbertos = meus.filter((c) => emAberto(c.status) || (c.status === "concluido" && !c.confirmacao)).length;

  return (
    <div>
      <PageHeader
        title="🔧 Chamado para Manutenção"
        subtitle="Viu algo quebrado, vazando ou sem funcionar? Abra o chamado e acompanhe por aqui."
      />
      <LinkDoGuia slug={ctx.podeAtender ? "atender-chamado-manutencao" : "abrir-chamado-manutencao"} className="mb-4" />

      <nav className="mb-5 flex gap-1 rounded-2xl bg-slate-100 p-1" aria-label="Abas">
        <Aba href="/chamados?aba=abrir" ativa={aba === "abrir"}>
          ➕ Abrir
        </Aba>
        <Aba href="/chamados?aba=meus" ativa={aba === "meus"} contagem={meusAbertos}>
          Meus
        </Aba>
        {ctx.podeAtender && fila && (
          <Aba href="/chamados?aba=fila" ativa={aba === "fila"} contagem={fila.abertos.length} alerta={fila.abertos.some((c) => situacaoDoPrazo(c, agora).tipo === "atrasado")}>
            Fila
          </Aba>
        )}
      </nav>

      {aba === "abrir" &&
        (locais.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            Nenhuma área cadastrada nesta revenda ainda. Peça à liderança para cadastrar em Admin › Chamados.
          </p>
        ) : (
          <FormChamado
            acao={abrirChamadoNoApp}
            unidade={revenda?.nome ?? ""}
            locais={gruposDoFormulario(locais)}
            localInicial={locais.some((l) => l.id === sp.local) ? sp.local : ""}
            nomeInicial={ctx.perfil.nome}
            nomeTravado
          />
        ))}

      {aba === "meus" && (
        <Lista
          chamados={meus}
          agora={agora}
          vazio="Você ainda não abriu nenhum chamado por aqui."
          grupos={[
            { titulo: "Esperando você confirmar", filtro: (c) => c.status === "concluido" && !c.confirmacao },
            { titulo: "Em andamento", filtro: (c) => emAberto(c.status) },
            { titulo: "Encerrados", filtro: (c) => (c.status === "concluido" && !!c.confirmacao) || c.status === "cancelado" },
          ]}
        />
      )}

      {aba === "fila" && fila && (
        <Lista
          chamados={[...fila.abertos, ...fila.recentes]}
          agora={agora}
          vazio="Nenhum chamado aberto. 🎉"
          grupos={[
            { titulo: "⏰ Atrasados", filtro: (c) => emAberto(c.status) && situacaoDoPrazo(c, agora).tipo === "atrasado" },
            { titulo: "Abertos — ninguém assumiu", filtro: (c) => c.status === "aberto" && situacaoDoPrazo(c, agora).tipo !== "atrasado" },
            { titulo: "Em atendimento", filtro: (c) => c.status === "em_atendimento" && situacaoDoPrazo(c, agora).tipo !== "atrasado" },
            { titulo: "Aguardando material ou terceiro", filtro: (c) => c.status === "aguardando" && situacaoDoPrazo(c, agora).tipo !== "atrasado" },
            { titulo: "Fechados nos últimos 7 dias", filtro: (c) => !emAberto(c.status) },
          ]}
          ordenar={(a, b) => prioridadeNaFila(b) - prioridadeNaFila(a) || a.prazo_em.localeCompare(b.prazo_em)}
        />
      )}
    </div>
  );
}

/** Risco primeiro, depois urgente: dentro de cada grupo, o que pesa mais sobe. */
function prioridadeNaFila(c: Chamado) {
  return c.prioridade === "risco" ? 2 : c.prioridade === "urgente" ? 1 : 0;
}

function Aba({
  href,
  ativa,
  contagem,
  alerta,
  children,
}: {
  href: string;
  ativa: boolean;
  contagem?: number;
  alerta?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={ativa ? "page" : undefined}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${
        ativa ? "bg-white text-primary-dark shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
      {!!contagem && (
        <span
          className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums ${
            alerta ? "bg-red-600 text-white" : ativa ? "bg-primary text-white" : "bg-slate-300 text-slate-700"
          }`}
        >
          {contagem}
        </span>
      )}
    </Link>
  );
}

function Lista({
  chamados,
  agora,
  vazio,
  grupos,
  ordenar,
}: {
  chamados: Chamado[];
  agora: Date;
  vazio: string;
  grupos: { titulo: string; filtro: (c: Chamado) => boolean }[];
  ordenar?: (a: Chamado, b: Chamado) => number;
}) {
  if (chamados.length === 0) {
    return <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">{vazio}</p>;
  }
  const usados = new Set<string>();
  return (
    <div className="space-y-6">
      {grupos.map((g) => {
        const doGrupo = chamados.filter((c) => !usados.has(c.id) && g.filtro(c));
        doGrupo.forEach((c) => usados.add(c.id));
        if (doGrupo.length === 0) return null;
        if (ordenar) doGrupo.sort(ordenar);
        return (
          <section key={g.titulo}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {g.titulo} <span className="text-slate-400">({doGrupo.length})</span>
            </h2>
            <ul className="space-y-2">
              {doGrupo.map((c) => (
                <li key={c.id}>
                  <CartaoChamado chamado={c} href={`/chamados/${c.id}`} agora={agora} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
