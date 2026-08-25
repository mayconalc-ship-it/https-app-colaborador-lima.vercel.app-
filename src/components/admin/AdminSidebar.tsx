"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type ItemNav = { id: string; href: string; rotulo: string; emoji: string };
export type GrupoNav = { titulo: string; itens: ItemNav[] };

/**
 * Navegação do Modo Liderança/Admin.
 *
 * Fica ABAIXO da barra azul do cabeçalho (que é sticky e continua com o
 * seletor de revenda, sino e sair) -- por isso o `top` não é 0, é a
 * altura medida do cabeçalho nos dois breakpoints em que ele muda de
 * tamanho (56px até 640px, 88px dali pra cima).
 *
 * No desktop (md+): recolhida por padrão -- só emoji -- e expande ao
 * passar o mouse, revelando o nome de cada módulo. É sobreposição
 * (`position: fixed`), não empurra o conteúdo, então o hover nunca "pula"
 * a página. No celular não existe hover, então vira gaveta: um botão ☰
 * fixo abre e fecha por toque, sempre com o nome visível (é um toque
 * deliberado, não uma barra que fica o tempo todo disputando espaço com
 * o dedo), e escolher um item já fecha sozinho.
 *
 * Só troca a APRESENTAÇÃO. Os grupos e itens que chegam por prop são
 * exatamente os que `podeFazer`/`revendaTemModulo` já filtraram em
 * admin/layout.tsx -- a regra de quem vê o quê não mudou uma linha.
 */
export function AdminSidebar({
  grupos,
  grupoDono,
  home,
}: {
  grupos: GrupoNav[];
  grupoDono: ItemNav[] | null;
  home: { href: string; rotulo: string; emoji: string };
}) {
  const pathname = usePathname();
  const [abertoMobile, setAbertoMobile] = useState(false);

  const ativo = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  const fechar = () => setAbertoMobile(false);

  const classeItem = (href: string, tom: "primary" | "gold") =>
    `flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-medium ${
      ativo(href)
        ? tom === "gold"
          ? "bg-gold-soft text-primary-dark"
          : "bg-primary-soft text-primary-dark"
        : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbertoMobile(true)}
        aria-label="Abrir menu de navegação"
        className="fixed left-3 top-[68px] z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg shadow-md sm:top-[100px] md:hidden"
      >
        ☰
      </button>

      {abertoMobile && (
        <div
          role="presentation"
          onClick={fechar}
          className="fixed inset-x-0 bottom-0 top-14 z-40 bg-slate-900/40 sm:top-[88px] md:hidden"
        />
      )}

      {/* `group` no <aside>: o hover de QUALQUER ponto da barra (não só de
          um item) expande a largura, e os rótulos (`md:group-hover:...`)
          só ficam legíveis quando ela está larga o bastante para caber. */}
      <aside
        className={`group fixed bottom-0 left-0 top-14 z-40 flex w-64 flex-col overflow-y-auto overflow-x-hidden border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 sm:top-[88px] md:w-16 md:translate-x-0 md:shadow-none md:transition-[width] md:duration-150 md:hover:w-64 md:hover:shadow-xl ${
          abertoMobile ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex w-64 shrink-0 flex-col gap-1 p-3">
          <div className="mb-2 flex items-center justify-between">
            <Link
              href={home.href}
              onClick={fechar}
              title={home.rotulo}
              className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-sm font-bold ${
                pathname === home.href
                  ? "bg-primary-soft text-primary-dark"
                  : "text-slate-800 hover:bg-slate-100"
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center text-lg">
                {home.emoji}
              </span>
              <span className="truncate">{home.rotulo}</span>
            </Link>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar menu"
              className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 md:hidden"
            >
              ✕
            </button>
          </div>

          {grupos.map((grupo) => (
            <div key={grupo.titulo} className="mb-2">
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {grupo.titulo}
              </p>
              {grupo.itens.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={fechar}
                  title={item.rotulo}
                  className={classeItem(item.href, "primary")}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center text-lg">
                    {item.emoji}
                  </span>
                  <span className="truncate">{item.rotulo}</span>
                </Link>
              ))}
            </div>
          ))}

          {grupoDono && grupoDono.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-gold">
                Só do Admin
              </p>
              {grupoDono.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={fechar}
                  title={item.rotulo}
                  className={classeItem(item.href, "gold")}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center text-lg">
                    {item.emoji}
                  </span>
                  <span className="truncate">{item.rotulo}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
