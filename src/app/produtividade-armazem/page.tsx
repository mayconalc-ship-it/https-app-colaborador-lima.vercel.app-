import { PageHeader } from "@/components/PageHeader";
import { MenuCard } from "@/components/MenuCard";
import { podeNoModulo, getModulosAcessiveis } from "@/lib/require-admin";
import { requireAcessoArmazem } from "@/lib/produtividade-armazem-server";
import { ehOwner } from "@/lib/acessos";
import { getPerfil } from "@/lib/sessao";
import type { ModuloId } from "@/lib/acessos";

// Cada card só aparece pra quem tem o sub-módulo concedido (ver
// SUBMODULOS_ARMAZEM em lib/produtividade-armazem-server.ts) -- é o que
// torna real o pedido de liberar cada funcionalidade separadamente, em vez
// de um "produtividade-armazem" único que dava tudo de uma vez.
const FUNCIONALIDADES: { chave: ModuloId; titulo: string; emoji: string; href: string }[] = [
  { chave: "pa-reepack", titulo: "Reepack", emoji: "📦", href: "/produtividade-armazem/reepack" },
  { chave: "pa-despejo", titulo: "Despejo", emoji: "🫗", href: "/produtividade-armazem/despejo" },
  { chave: "pa-empilhadeira", titulo: "Empilhadeira", emoji: "🏗️", href: "/produtividade-armazem/empilhadeira" },
  // "Recebimento de Paletes" saiu da vitrine em 27/08/2026, a pedido do
  // dono: o Monitor de Recebimento (Carretas) já cobre recebido/avariado
  // por item na descarga, e as duas telas duplicavam o mesmo acesso. A
  // rota /produtividade-armazem/recebimento e a concessão "pa-recebimento"
  // continuam existindo -- só o card de entrada foi removido.
  { chave: "pa-cinco-s", titulo: "5S do Armazém", emoji: "🧹", href: "/produtividade-armazem/cinco-s" },
  { chave: "pa-picking", titulo: "Reabastecimento de Picking", emoji: "🛒", href: "/produtividade-armazem/picking" },
  { chave: "carretas-portaria", titulo: "Recebimento de Carreta", emoji: "👮", href: "/carretas-portaria" },
  { chave: "carretas-conferencia", titulo: "Monitor de Recebimento", emoji: "🖥️", href: "/carretas-conferencia" },
  // Um card só para os dois papéis (informar e controle): a tela é a
  // mesma e decide sozinha o que mostrar para quem abriu.
  { chave: "fefo", titulo: "Quebra de FEFO", emoji: "🚨", href: "/fefo" },
  { chave: "fefo-controle", titulo: "Quebra de FEFO", emoji: "🚨", href: "/fefo" },
];

export default async function ProdutividadeArmazemPage() {
  await requireAcessoArmazem("/");

  const [perfil, podeConfigurar, acessiveis] = await Promise.all([
    getPerfil(),
    podeNoModulo("produtividade-armazem", "editar"),
    getModulosAcessiveis(),
  ]);

  // Dono e quem administra a área inteira (editar catálogos) veem tudo --
  // as demais pessoas só o que foi concedido pessoa a pessoa.
  const visiveis =
    ehOwner(perfil?.role) || podeConfigurar
      ? FUNCIONALIDADES
      : FUNCIONALIDADES.filter((f) => acessiveis.has(f.chave));

  // Uma tela pode ser alcançada por mais de uma permissão (o FEFO tem
  // "informar" e "controle"). Quem tem as duas não precisa ver o card
  // repetido -- a própria tela decide o que mostrar para cada papel.
  const funcionalidades = visiveis.filter(
    (f, i) => visiveis.findIndex((o) => o.href === f.href) === i,
  );

  return (
    <div>
      <PageHeader
        title="Produtividade do Armazém"
        subtitle="Escolha o que você vai lançar."
      />

      <div className="grid grid-cols-2 gap-3">
        {funcionalidades.map((f) => (
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
