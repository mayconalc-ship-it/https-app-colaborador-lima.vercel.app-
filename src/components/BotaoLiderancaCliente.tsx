"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Fica aceso enquanto a pessoa está no Modo Liderança, para deixar claro
 * em qual dos dois modos ela está navegando.
 */
export function BotaoLiderancaCliente({ dono }: { dono: boolean }) {
  const caminho = usePathname();
  const noModoLideranca = caminho?.startsWith("/admin");
  const rotulo = dono ? "Admin" : "Liderança";

  return (
    <Link
      href="/admin"
      aria-current={noModoLideranca ? "page" : undefined}
      className={`shrink-0 rounded-lg px-2 py-1.5 text-sm font-semibold ${
        noModoLideranca
          ? "bg-white text-primary-dark ring-2 ring-gold"
          : "bg-gold text-primary-dark hover:brightness-95"
      }`}
    >
      {noModoLideranca ? `⚙️ ${rotulo}` : rotulo}
    </Link>
  );
}
