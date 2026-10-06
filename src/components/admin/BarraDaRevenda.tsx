"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { trocarRevendaEVoltar } from "@/app/escolher-revenda/actions";
import { corDaRevenda } from "@/lib/revenda-cor";
import { nomeCurtoRevenda, siglaRevenda } from "@/lib/revenda-sigla";

export type RevendaDaBarra = { id: string; nome: string; slug: string };

/**
 * A FAIXA DA REVENDA, NO TOPO DA GESTÃO DE ACESSOS (05/10/2026).
 *
 * Relato do dono: "percebo que ela fica embaixo e às vezes acho que estou
 * mexendo em um ambiente e é outro". Eram três defeitos somados:
 *   - a revenda vinha DEPOIS do título, das abas e do link do guia, numa
 *     fileira de botões iguais aos de qualquer filtro;
 *   - a aba Perfis nem mostrava revenda nenhuma;
 *   - e as abas não concordavam entre si: Por pessoa lia a revenda da URL
 *     (e sem ela caía na primeira da lista), Perfis lia a do 🏢 do
 *     cabeçalho. Dava para estar em Barreiras numa aba e em São Félix na
 *     outra.
 *
 * Agora a revenda é UMA, a do app (a mesma do 🏢), e esta faixa é a
 * primeira coisa da tela, com a cor da revenda, e fica grudada no topo
 * enquanto se rola -- como os consoles de nuvem fazem com o ambiente de
 * produção. Trocar aqui troca o app inteiro e volta para a mesma tela.
 */
export function BarraDaRevenda({
  atual,
  revendas,
  volta,
  aviso,
}: {
  atual: RevendaDaBarra;
  /** As revendas em que quem olha pode estar NESTA tela. */
  revendas: RevendaDaBarra[];
  /** A tela para onde voltar depois de trocar. */
  volta: string;
  /** Uma linha a mais, quando a tela não está na revenda do app. */
  aviso?: string;
}) {
  const cor = corDaRevenda(atual.slug);
  const topo = useAlturaDoCabecalho();

  return (
    <div
      style={{ top: topo }}
      className={`sticky z-20 -mx-4 mb-4 ${cor.forte} text-white shadow-md sm:mx-0 sm:rounded-2xl`}
    >
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="text-xl leading-none" aria-hidden="true">
          🏢
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/80">Alterando em</p>
          <p className="truncate text-base font-bold leading-tight">{nomeCurtoRevenda(atual.nome)}</p>
        </div>
        {revendas.length > 1 && (
          <div
            role="group"
            aria-label="Trocar de revenda"
            className="flex shrink-0 gap-1 rounded-xl bg-black/15 p-1"
          >
            {revendas.map((r) => (
              <form key={r.id} action={trocarRevendaEVoltar}>
                <input type="hidden" name="revenda_id" value={r.id} />
                <input type="hidden" name="volta" value={volta} />
                <BotaoDaRevenda
                  ativa={r.id === atual.id}
                  sigla={siglaRevenda(r.slug, r.nome)}
                  nome={nomeCurtoRevenda(r.nome)}
                  corDoTexto={cor.texto}
                />
              </form>
            ))}
          </div>
        )}
      </div>
      {aviso && (
        <p className="border-t border-white/20 px-4 py-1.5 text-[11px] leading-snug text-white/90">{aviso}</p>
      )}
    </div>
  );
}

function BotaoDaRevenda({
  ativa,
  sigla,
  nome,
  corDoTexto,
}: {
  ativa: boolean;
  sigla: string;
  nome: string;
  corDoTexto: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={ativa || pending}
      aria-pressed={ativa}
      title={ativa ? `Você está em ${nome}` : `Trocar para ${nome}`}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
        ativa ? `bg-white ${corDoTexto} shadow-sm` : "text-white/90 hover:bg-white/15"
      } disabled:cursor-default`}
    >
      {pending ? "…" : sigla}
    </button>
  );
}

/**
 * A faixa gruda logo abaixo do cabeçalho do app -- cuja altura muda com a
 * largura da tela e com a revenda ter logo ou não. Medida em vez de
 * chutada: um número fixo deixaria uma fresta, ou a faixa por baixo dele.
 */
function useAlturaDoCabecalho() {
  const [altura, setAltura] = useState(64);
  useEffect(() => {
    const cabecalho = document.getElementById("cabecalho-app");
    if (!cabecalho) return;
    const medir = () => setAltura(cabecalho.offsetHeight);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(cabecalho);
    return () => observador.disconnect();
  }, []);
  return altura;
}
