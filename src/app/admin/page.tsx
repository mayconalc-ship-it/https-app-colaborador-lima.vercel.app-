import { decodificar } from "@/lib/texto-url";
import Link from "next/link";
import { requireGestor } from "@/lib/require-admin";
import { getConcessoes } from "@/lib/concessoes";
import { getRevendaAtiva, getModulosDaRevenda } from "@/lib/revendas";
import { PageHeader } from "@/components/PageHeader";
import { MODULOS, ehOwner, podeFazer } from "@/lib/acessos";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const perfil = await requireGestor();
  const { erro } = await searchParams;
  const [concessoes, revenda] = await Promise.all([
    getConcessoes(),
    getRevendaAtiva(),
  ]);
  const dono = ehOwner(perfil.role);

  const modulosDaRevenda = revenda
    ? await getModulosDaRevenda(revenda.id)
    : new Set<string>();

  // A pessoa nem vê o cartão do que não pode abrir. Mostrar e barrar depois
  // só geraria a dúvida de "por que não posso?".
  //
  // Duas perguntas, nesta ordem: a revenda usa este módulo? e esta pessoa
  // pode abri-lo aqui? A primeira vale até para o dono -- não faz sentido
  // ele configurar a RV de uma revenda que ainda não tem RV.
  const liberados = MODULOS.filter(
    (m) =>
      // Módulo sem tela de Admin (ex.: Meus Indicadores) não vira cartão:
      // o href aponta para a tela do colaborador, e clicar aqui tirava o
      // gestor do Modo Liderança. A concessão segue na Gestão de Acessos.
      !m.semTelaAdmin &&
      modulosDaRevenda.has(m.id) &&
      podeFazer(perfil.role, concessoes, m.id, "ver"),
  );

  return (
    <div>
      <PageHeader
        title={dono ? "Painel Admin" : "Painel da Liderança"}
        subtitle={
          // Dizer em qual revenda a pessoa está mexendo é o aviso mais
          // importante desta tela: tudo o que ela salvar daqui vale só
          // para esta revenda.
          revenda
            ? `${revenda.nome} — ${
                dono
                  ? "controle total do app"
                  : "você administra os módulos liberados para você"
              }`
            : dono
              ? "Controle total do app"
              : "Você administra os módulos liberados para você"
        }
      />

      {erro && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {decodificar(erro)}
        </p>
      )}

      {liberados.length === 0 && !dono ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Você ainda não tem nenhum módulo liberado. Fale com o Admin do app.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
          Escolha um módulo no menu à esquerda
          <span className="md:hidden"> (toque em ☰)</span>.
        </div>
      )}

      {!dono && (
        <p className="mt-6 text-xs text-slate-400">
          Precisa de acesso a mais alguma coisa?{" "}
          <Link href="/" className="text-primary hover:underline">
            Fale com o Admin do app.
          </Link>
        </p>
      )}
    </div>
  );
}
