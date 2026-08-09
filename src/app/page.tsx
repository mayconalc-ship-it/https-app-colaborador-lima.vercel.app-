import { MenuCard } from "@/components/MenuCard";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/sessao";
import { MENU_PADRAO } from "@/lib/menu";
import { temAcessoModulo } from "@/lib/require-admin";

// Itens de menu que, além de "visivel", exigem uma permissão específica
// antes de aparecer. Módulos opcionais entram aqui.
const MODULOS_RESTRITOS: Record<string, "ativo-giro"> = {
  "ativo-giro": "ativo-giro",
};

export default async function Home() {
  const supabase = await createClient();

  // As tres consultas nao dependem uma da outra: buscamos em paralelo.
  const [perfil, { data: itensBanco }, acessoAtivoGiro] = await Promise.all([
    getPerfil(),
    supabase
      .from("menu_itens")
      .select("chave, titulo, emoji, href, ordem, visivel")
      .order("ordem", { ascending: true }),
    temAcessoModulo("ativo-giro"),
  ]);

  const primeiroNome = perfil?.nome?.split(" ")[0] ?? "";
  const acessosExtras: Record<string, boolean> = {
    "ativo-giro": acessoAtivoGiro,
  };
  const todos = itensBanco && itensBanco.length > 0 ? itensBanco : MENU_PADRAO;
  const itens = todos.filter((item) => {
    if (!item.visivel) return false;
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
