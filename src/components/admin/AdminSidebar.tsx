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
  atalho,
}: {
  grupos: GrupoNav[];
  grupoDono: ItemNav[] | null;
  home: { href: string; rotulo: string; emoji: string };
  /**
   * A porta para a OUTRA área -- Gestão a partir do Modo Liderança, e
   * vice-versa. Fica logo abaixo do painel, antes das gavetas, porque é
   * uma troca de assunto, não mais um item de configuração: quem está
   * cadastrando produto e quer ver o ranking não procura o ranking dentro
   * de uma gaveta de cadastro.
   */
  atalho?: ItemNav | null;
}) {
  const pathname = usePathname();
  const [abertoMobile, setAbertoMobile] = useState(false);

  const ativo = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  /**
   * A gaveta que contém a tela aberta começa aberta; as outras, fechadas.
   *
   * Deriva da rota em vez de guardar estado: quem clica num item de uma
   * gaveta navega e continua vendo aquela gaveta aberta, sem precisar de
   * localStorage nem de um efeito que pisca depois da montagem. O que se
   * perde é a gaveta que a pessoa abriu só para espiar e não usou --
   * troca barata pela ausência de estado persistido.
   */
  const grupoDaTelaAtual =
    grupos.find((g) => g.itens.some((i) => ativo(i.href)))?.titulo ?? null;

  const [abertos, setAbertos] = useState<Set<string>>(
    () => new Set(grupoDaTelaAtual ? [grupoDaTelaAtual] : []),
  );

  const alternar = (titulo: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(titulo)) novo.delete(titulo);
      else novo.add(titulo);
      return novo;
    });

  const fechar = () => setAbertoMobile(false);

  /**
   * Some de verdade quando a barra está recolhida.
   *
   * A barra encolhe para 64px mas o conteúdo tem 256px fixos, e o
   * `overflow-x-hidden` cortava os rótulos no meio da palavra -- não era
   * nome escondido, era nome decepado, e parecia erro de renderização.
   * Agora o texto zera a opacidade junto com a largura e volta no hover.
   */
  const classeRotulo =
    "truncate whitespace-nowrap transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100";

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
              <span className={classeRotulo}>{home.rotulo}</span>
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

          {atalho && (
            <Link
              href={atalho.href}
              onClick={fechar}
              title={atalho.rotulo}
              className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 px-2 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center text-lg">
                {atalho.emoji}
              </span>
              <span className={classeRotulo}>{atalho.rotulo}</span>
            </Link>
          )}

          {grupos.map((grupo) => {
            const aberta = abertos.has(grupo.titulo);
            const temAtivo = grupo.itens.some((i) => ativo(i.href));
            return (
              <div key={grupo.titulo} className="mb-1">
                {/* O cabeçalho da gaveta só existe quando há espaço para
                    ler o nome: na barra recolhida ele viraria um texto
                    cortado, e um botão que não se lê não é um botão.
                    Recolhida, os ícones aparecem soltos e levam direto. */}
                <button
                  type="button"
                  onClick={() => alternar(grupo.titulo)}
                  aria-expanded={aberta}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors md:hidden md:group-hover:flex ${
                    temAtivo ? "text-primary-dark" : "text-slate-400"
                  } hover:bg-slate-100`}
                >
                  <span className="truncate">{grupo.titulo}</span>
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    <span className="tabular-nums">{grupo.itens.length}</span>
                    <span className={`transition-transform ${aberta ? "rotate-180" : ""}`}>▾</span>
                  </span>
                </button>

                {/* Aberta: sempre visível. Fechada: some no celular e na
                    barra expandida, mas os ícones CONTINUAM na barra
                    recolhida -- senão ela ficaria quase vazia e o atalho
                    de um clique se perderia. */}
                <div className={aberta ? "block" : "hidden md:block md:group-hover:hidden"}>
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
                      <span className={classeRotulo}>{item.rotulo}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}

          {grupoDono && grupoDono.length > 0 && (
            <div className="mt-2 border-t border-slate-100 pt-2">
              <p className="mb-1 truncate px-2 text-xs font-semibold uppercase tracking-wide text-gold transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100">
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
                  <span className={classeRotulo}>{item.rotulo}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
