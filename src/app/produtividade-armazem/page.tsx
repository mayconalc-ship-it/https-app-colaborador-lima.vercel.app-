import { PageHeader } from "@/components/PageHeader";
import { MenuCard } from "@/components/MenuCard";
import { podeNoModulo, requireAcessoModulo } from "@/lib/require-admin";

const FUNCIONALIDADES = [
  { chave: "reepack", titulo: "Reepack", emoji: "📦", href: "/produtividade-armazem/reepack" },
  { chave: "despejo", titulo: "Despejo", emoji: "🫗", href: "/produtividade-armazem/despejo" },
  { chave: "empilhadeira", titulo: "Empilhadeira", emoji: "🏗️", href: "/produtividade-armazem/empilhadeira" },
  { chave: "recebimento", titulo: "Recebimento de Paletes", emoji: "🚛", href: "/produtividade-armazem/recebimento" },
  { chave: "cinco-s", titulo: "5S do Armazém", emoji: "🧹", href: "/produtividade-armazem/cinco-s" },
  { chave: "picking", titulo: "Reabastecimento de Picking", emoji: "🛒", href: "/produtividade-armazem/picking" },
];

export default async function ProdutividadeArmazemPage() {
  await requireAcessoModulo("produtividade-armazem");

  const podeConfigurar = await podeNoModulo("produtividade-armazem", "editar");

  return (
    <div>
      <PageHeader
        title="Produtividade do Armazém"
        subtitle="Escolha o que você vai lançar."
      />

      <div className="grid grid-cols-2 gap-3">
        {FUNCIONALIDADES.map((f) => (
          <MenuCard key={f.chave} href={f.href} title={f.titulo} emoji={f.emoji} />
        ))}
      </div>

      <a
        href="/produtividade-armazem/indicadores"
        className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        📊 Ver indicadores e ranking
      </a>

      {podeConfigurar && (
        <a
          href="/admin/produtividade-armazem"
          className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          ⚙️ Configuração (embalagens, empilhadeiras, catálogos)
        </a>
      )}
    </div>
  );
}
