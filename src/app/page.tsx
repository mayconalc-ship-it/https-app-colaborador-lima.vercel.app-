import { MenuCard } from "@/components/MenuCard";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/sessao";
import { getRevendaAtiva, getModulosDaRevenda } from "@/lib/revendas";
import { MENU_PADRAO, MODULO_DO_ITEM } from "@/lib/menu";
import { temAcessoModulo } from "@/lib/require-admin";

// Itens de menu que, além de "visivel", exigem uma permissão específica
// antes de aparecer. Módulos opcionais entram aqui.
const MODULOS_RESTRITOS: Record<string, "ativo-giro"> = {
  "ativo-giro": "ativo-giro",
};

export default async function Home() {
  const supabase = await createClient();

  const [perfil, revenda, acessoAtivoGiro] = await Promise.all([
    getPerfil(),
    getRevendaAtiva(),
    temAcessoModulo("ativo-giro"),
  ]);

  // Sem revenda não há menu: o layout já mostra o aviso de cadastro
  // incompleto no lugar desta tela.
  if (!revenda) return null;

  const [{ data: itensBanco }, modulosDaRevenda] = await Promise.all([
    supabase
      .from("menu_itens")
      .select("chave, titulo, emoji, href, ordem, visivel")
      .eq("revenda_id", revenda.id)
      .order("ordem", { ascending: true }),
    getModulosDaRevenda(revenda.id),
  ]);

  const primeiroNome = perfil?.nome?.split(" ")[0] ?? "";
  const acessosExtras: Record<string, boolean> = {
    "ativo-giro": acessoAtivoGiro,
  };
  const todos = itensBanco && itensBanco.length > 0 ? itensBanco : MENU_PADRAO;
  const itens = todos.filter((item) => {
    if (!item.visivel) return false;

    // A revenda usa este módulo? Vem antes de tudo: não adianta o cartão
    // estar visível e ordenado se a tela dele não existe aqui.
    const modulo = MODULO_DO_ITEM[item.chave];
    if (modulo && !modulosDaRevenda.has(modulo)) return false;

    const restricao = MODULOS_RESTRITOS[item.chave];
    return !restricao || acessosExtras[restricao];
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Olá{primeiroNome ? `, ${primeiroNome}` : ""}! 👋
        </h1>
        <p className="text-slate-500">Escolha uma opção abaixo</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {itens.map((item) => (
          <MenuCard
            key={item.chave}
            href={item.href}
            title={item.titulo}
            emoji={item.emoji}
          />
        ))}
      </div>
    </div>
  );
}
