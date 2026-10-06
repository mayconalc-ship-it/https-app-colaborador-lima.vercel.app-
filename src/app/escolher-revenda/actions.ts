"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getRevendas, COOKIE_REVENDA } from "@/lib/revendas";

async function gravarRevenda(revendaId: string, seFalhar: string) {
  const revendas = await getRevendas();
  const alvo = revendas.find((r) => r.id === revendaId);

  if (!alvo) {
    redirect(seFalhar + encodeURIComponent("Você não tem acesso a essa revenda."));
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
}

/**
 * Troca a revenda em que a pessoa está trabalhando.
 *
 * A conferência aqui é a que importa: o id só é aceito se estiver na lista
 * de vínculos de quem pediu. Sem isso, mudar de revenda seria uma questão
 * de editar um cookie no navegador.
 */
export async function trocarRevenda(formData: FormData) {
  const revendaId = ((formData.get("revenda_id") as string) || "").trim();
  await gravarRevenda(revendaId, "/escolher-revenda?erro=");
  redirect("/");
}

/**
 * A MESMA TROCA, SEM SAIR DA TELA (05/10/2026).
 *
 * A faixa da revenda na Gestão de Acessos troca a revenda do APP inteiro,
 * e não só a da tela: o defeito era justamente a Gestão de Acessos ter uma
 * revenda própria (na URL), que podia discordar do 🏢 do cabeçalho e da
 * aba Perfis. Uma revenda só, em todo lugar.
 *
 * Volta para onde estava -- trocar de unidade não é trocar de assunto. O
 * destino só pode ser uma tela do próprio Modo Liderança: um `volta`
 * forjado não vira redirecionamento para fora do app.
 */
export async function trocarRevendaEVoltar(formData: FormData) {
  const revendaId = ((formData.get("revenda_id") as string) || "").trim();
  const pedido = String(formData.get("volta") ?? "");
  // A aba das grades é a única que mora num parâmetro, e é a única aceita.
  const volta = /^\/admin(\/[\w\-/]*)?(\?aba=modulos)?$/.test(pedido) ? pedido : "/admin";
  await gravarRevenda(revendaId, `${volta}${volta.includes("?") ? "&" : "?"}erro=`);
  redirect(volta);
}
