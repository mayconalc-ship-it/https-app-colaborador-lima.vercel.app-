"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRevendas, COOKIE_REVENDA } from "@/lib/revendas";

/**
 * Troca a revenda em que a pessoa está trabalhando.
 *
 * A conferência aqui é a que importa: o id só é aceito se estiver na lista
 * de vínculos de quem pediu. Sem isso, mudar de revenda seria uma questão
 * de editar um cookie no navegador.
 */
export async function trocarRevenda(formData: FormData) {
  const revendaId = ((formData.get("revenda_id") as string) || "").trim();

  const revendas = await getRevendas();
  const alvo = revendas.find((r) => r.id === revendaId);

  if (!alvo) {
    redirect(
      "/escolher-revenda?erro=" +
        encodeURIComponent("Você não tem acesso a essa revenda."),
    );
  }

  const jar = await cookies();
  jar.set(COOKIE_REVENDA, alvo.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Um mês: o suficiente para não perguntar toda semana, curto o
    // bastante para uma troca de vínculo não ficar valendo para sempre.
    maxAge: 60 * 60 * 24 * 30,
  });

  redirect("/");
}
