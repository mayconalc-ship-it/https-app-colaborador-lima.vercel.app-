import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { CartaoDePainel } from "@/components/gestao/CartaoDePainel";
import { getRevendaAtiva } from "@/lib/revendas";
import { BLOCOS_DA_GESTAO } from "@/lib/gestao";
import { paineisVisiveis, sinaisDosPaineis } from "@/lib/gestao-server";

export const dynamic = "force-dynamic";

export default async function GestaoPage() {
  const [paineis, revenda] = await Promise.all([paineisVisiveis(), getRevendaAtiva()]);
  // O mesmo sinal da home: as duas telas mostram os mesmos cartões, e um
  // número que aparece só num lugar faria parecer que os painéis são
  // diferentes.
  const sinais = revenda ? await sinaisDosPaineis(paineis, revenda.id) : {};

  const blocos = BLOCOS_DA_GESTAO.map((bloco) => ({
    bloco,
    itens: paineis.filter((p) => p.bloco === bloco),
  })).filter((b) => b.itens.length > 0);

  return (
    <div>
      <PageHeader
        title="📊 Painel de Gestão"
        subtitle={
          revenda
            ? `${revenda.nome} — o que os números dizem`
            : "O que os números dizem"
        }
      />

      {/* O resumo de segunda-feira fica acima dos painéis: é a leitura
          de todos eles numa tela, e cada bloco dele respeita a permissão
          do módulo de origem. */}
      <Link
        href="/gestao/resumo-semanal"
        className="mb-6 flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary-soft p-4 hover:border-primary"
      >
        <span className="text-2xl">🗓️</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-primary-dark">Resumo da semana</span>
          <span className="block text-xs text-primary-dark">
            Ranking do armazém, metas e o que está esperando a liderança — chega toda segunda às 7h.
          </span>
        </span>
        <span className="text-primary-dark">→</span>
      </Link>

      {blocos.map(({ bloco, itens }) => (
        <section key={bloco} className="mb-6">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {bloco}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {itens.map((p) => (
              <CartaoDePainel key={p.id} painel={p} sinal={sinais[p.id]} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
