"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * O interruptor entre os dois modos, e o único botão do topo que troca de
 * modo.
 *
 * Antes ele apontava sempre para /admin: aceso dentro do Modo Liderança,
 * parecia um selo de "você está aqui" -- mas, ao ser tocado, jogava a
 * pessoa de volta para o painel, mesmo que ela estivesse no meio de uma
 * tela interna. Três controles disputavam o mesmo destino (este botão, o
 * "Voltar para o app" e o "Voltar ao Painel"), e nenhum dizia para onde ia.
 *
 * Agora ele tem um estado e um destino por vez: fora do modo de gestão,
 * ENTRA; dentro dele, SAI para o app. O rótulo diz qual dos dois vai
 * acontecer, então não há o que adivinhar antes de tocar.
 */
export function BotaoLiderancaCliente({ dono }: { dono: boolean }) {
  const caminho = usePathname();
  const noModoGestao = caminho?.startsWith("/admin");
  const modo = dono ? "Admin" : "Liderança";

  if (noModoGestao) {
    return (
      <Link
        href="/"
        aria-label={`Sair do Modo ${modo} e voltar para o app`}
        className="shrink-0 rounded-lg bg-white px-2 py-1.5 text-sm font-semibold text-primary-dark ring-2 ring-gold hover:brightness-95"
      >
        {/* O fundo branco com anel dourado continua marcando que o modo de
            gestão está em uso; o que mudou é o rótulo, que agora anuncia a
            saída. No celular sobra espaço para "← App" -- com o sino, a
            revenda e o Sair na mesma linha, a frase inteira não cabe. */}
        <span className="sm:hidden">← App</span>
        <span className="hidden sm:inline">← Sair do Modo {modo}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/admin"
      aria-label={`Entrar no Modo ${modo}`}
      className="shrink-0 rounded-lg bg-gold px-2 py-1.5 text-sm font-semibold text-primary-dark hover:brightness-95"
    >
      <span className="hidden sm:inline" aria-hidden="true">
        ⚙️{" "}
      </span>
      {modo}
    </Link>
  );
}
