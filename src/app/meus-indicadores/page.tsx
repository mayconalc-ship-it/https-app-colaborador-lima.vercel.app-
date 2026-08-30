import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { MenuCard } from "@/components/MenuCard";
import { getPerfil } from "@/lib/sessao";
import { getModulosAcessiveis, requireAcessoModulo } from "@/lib/require-admin";
import { buscarRVdoColaborador } from "@/lib/rv-server";
import { chaveCompetencia, formatarCompetencia } from "@/lib/rv";
import { montarResumo, vazio, type CampoDoResumo } from "@/lib/meus-indicadores";
import type { ModuloId } from "@/lib/acessos";

export const dynamic = "force-dynamic";

const SUBMODULOS: { chave: ModuloId; titulo: string; emoji: string; href: string; ajuda: string }[] = [
  { chave: "rating", titulo: "Meu Rating", emoji: "⭐", href: "/rating", ajuda: "Como os clientes avaliaram suas entregas" },
  { chave: "devolucao", titulo: "Minha Devolução", emoji: "↩️", href: "/devolucao", ajuda: "O que voltou e por quê" },
  { chave: "refugo", titulo: "Meu Refugo", emoji: "♻️", href: "/refugo", ajuda: "A aferição das garrafas que voltaram" },
];

export default async function MeusIndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  await requireAcessoModulo("meus-indicadores");
  const sp = await searchParams;

  const [perfil, acessiveis] = await Promise.all([getPerfil(), getModulosAcessiveis()]);
  const submodulos = SUBMODULOS.filter((s) => acessiveis.has(s.chave));

  // O resumo sai da MESMA planilha que calcula a RV -- recalcular por
  // fora daria um número parecido e diferente, e o app discordaria do
  // contracheque.
  const { encontrados, configurado } = perfil?.cpf
    ? await buscarRVdoColaborador(perfil.cpf)
    : { encontrados: [], configurado: false };

  const competencias = [...new Set(encontrados.map((e) => e.competencia).filter((c): c is string => Boolean(c)))]
    .sort((a, b) => chaveCompetencia(b) - chaveCompetencia(a));

  const mes = sp.mes && competencias.includes(sp.mes) ? sp.mes : (competencias[0] ?? null);
  const linha = mes ? encontrados.find((e) => e.competencia === mes) : encontrados[0];
  const resumo = linha ? montarResumo(linha.detalhes) : [];

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="📊 Meus Indicadores"
        subtitle="O seu mês em números, e o detalhe de cada indicador."
        fecharHref="/"
      />

      {/* ---------- RESUMO DO MÊS ---------- */}
      {competencias.length > 1 && (
        <nav className="flex flex-wrap gap-1.5">
          {competencias.slice(0, 6).map((c) => (
            <Link
              key={c}
              href={`/meus-indicadores?mes=${encodeURIComponent(c)}`}
              aria-current={c === mes ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                c === mes ? "bg-primary text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {formatarCompetencia(c)}
            </Link>
          ))}
        </nav>
      )}

      {resumo.length > 0 ? (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              Resumo de {mes ? formatarCompetencia(mes) : "—"}
            </h2>
            {linha?.rotulo && <span className="shrink-0 text-xs text-slate-400">{linha.rotulo}</span>}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {resumo.map((c) => (
              <Numero key={c.chave} campo={c} />
            ))}
          </div>

          <p className="mt-2 text-[11px] text-slate-400">
            Os mesmos números que entram no cálculo da sua remuneração variável.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-3xl">📊</p>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {!perfil?.cpf
              ? "Não foi possível identificar seu cadastro."
              : !configurado
                ? "O resumo do mês ainda não está disponível."
                : "Você ainda não aparece no fechamento do mês."}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {configurado && perfil?.cpf
              ? "Assim que o mês fechar, os números aparecem aqui. Os indicadores abaixo já funcionam."
              : "Fale com seu gestor."}
          </p>
        </section>
      )}

      {/* ---------- SUBMÓDULOS ---------- */}
      <section>
        <h2 className="mb-3 text-sm font-bold text-slate-900">Ver em detalhe</h2>
        {submodulos.length === 0 ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Nenhum indicador liberado para você ainda. Fale com o Admin.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {submodulos.map((s) => (
              <MenuCard key={s.chave} href={s.href} title={s.titulo} emoji={s.emoji} />
            ))}
          </div>
        )}
        <ul className="mt-3 space-y-1">
          {submodulos.map((s) => (
            <li key={s.chave} className="text-[11px] text-slate-400">
              <strong className="text-slate-500">{s.titulo}</strong> — {s.ajuda}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Numero({ campo }: { campo: CampoDoResumo }) {
  const semDado = vazio(campo.valor);
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase text-slate-400">
        <span className="mr-1">{campo.emoji}</span>
        {campo.titulo}
      </p>
      <p className={`truncate text-xl font-bold tabular-nums ${semDado ? "text-slate-300" : "text-slate-900"}`}>
        {semDado ? "—" : campo.valor}
      </p>
    </div>
  );
}
