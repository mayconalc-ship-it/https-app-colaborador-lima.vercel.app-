"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

/**
 * Um agrupamento que LEMBRA que está aberto.
 *
 * Fechado por padrão, para a tela abrir limpa. Ao abrir, o id do grupo
 * entra na URL -- e é por isso que ele continua aberto depois de salvar:
 * o formulário devolve os mesmos parâmetros, então a página volta no
 * mesmo estado em que estava, com o mesmo filtro e o mesmo grupo aberto.
 *
 * Sem isso, salvar fecharia tudo e jogaria a pessoa de volta ao começo a
 * cada meta cadastrada -- que é o jeito mais rápido de fazer alguém
 * desistir de cadastrar a segunda.
 */
export function GrupoDeMetas({
  id,
  emoji,
  titulo,
  ajuda,
  resumo,
  aberto,
  children,
}: {
  id: string;
  emoji: string;
  titulo: string;
  ajuda: string;
  /** Ex.: "2 de 3 cadastradas" -- deixa a pessoa decidir se precisa abrir. */
  resumo: string;
  aberto: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, comecarTransicao] = useTransition();

  function aoAlternar(e: React.SyntheticEvent<HTMLDetailsElement>) {
    const agoraAberto = e.currentTarget.open;
    const atuais = (params.get("abertos") ?? "").split(",").filter(Boolean);
    const novos = agoraAberto
      ? [...new Set([...atuais, id])]
      : atuais.filter((x) => x !== id);

    const p = new URLSearchParams(params.toString());
    if (novos.length) p.set("abertos", novos.join(","));
    else p.delete("abertos");
    // Mensagem de salvo não sobrevive a um clique de abrir/fechar --
    // senão ela fica pendurada na tela sem ter acabado de acontecer.
    p.delete("sucesso");
    p.delete("erro");

    // replace, não push: abrir e fechar um grupo não é navegação, e
    // encheria o botão "voltar" do navegador de estados intermediários.
    comecarTransicao(() => {
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    });
  }

  return (
    <details
      open={aberto}
      onToggle={aoAlternar}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 hover:bg-slate-50">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xl">
          {emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-900">{titulo}</span>
          <span className="block truncate text-xs text-slate-500">{ajuda}</span>
        </span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
          {resumo}
        </span>
        <span className="shrink-0 text-slate-400 transition-transform group-open:rotate-180">▾</span>
      </summary>

      <div className="border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}
