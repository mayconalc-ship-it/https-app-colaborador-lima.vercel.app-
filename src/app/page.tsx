import { MenuCard } from "@/components/MenuCard";
import { createClient } from "@/lib/supabase/server";
import { getPerfil } from "@/lib/sessao";
import { MENU_PADRAO } from "@/lib/menu";

export default async function Home() {
  const supabase = await createClient();

  // As duas consultas nao dependem uma da outra: buscamos em paralelo.
  const [perfil, { data: itensBanco }] = await Promise.all([
    getPerfil(),
    supabase
      .from("menu_itens")
      .select("chave, titulo, emoji, href, ordem, visivel")
      .eq("visivel", true)
      .order("ordem", { ascending: true }),
  ]);

  const primeiroNome = perfil?.nome?.split(" ")[0] ?? "";
  const itens = itensBanco && itensBanco.length > 0 ? itensBanco : MENU_PADRAO;

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
