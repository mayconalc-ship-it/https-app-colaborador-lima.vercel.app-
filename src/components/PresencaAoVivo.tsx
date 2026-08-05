"use client";

import { useEffect } from "react";
import { iniciarPresenca } from "@/lib/presenca";

/**
 * Anuncia que esta pessoa está com o app aberto agora.
 *
 * Fica no rodapé do app inteiro e não desenha nada. Toda a lógica mora em
 * `lib/presenca`, que é o dono único do canal — quem quiser LER a lista de
 * quem está online usa `assinarPresenca`, nunca o canal direto.
 *
 * O canal não é fechado ao desmontar: ele vale pela sessão inteira e cai
 * sozinho quando a aba fecha. Abrir e fechar a cada navegação faria a
 * pessoa piscar na lista dos outros.
 *
 * Sobre peso: o anúncio é enviado UMA vez, ao entrar, e não a cada tela
 * aberta. Navegar pelo app não gera tráfego nenhum aqui.
 */
export function PresencaAoVivo({
  id,
  nome,
  cargo,
}: {
  id: string;
  nome: string;
  cargo: string | null;
}) {
  useEffect(() => {
    iniciarPresenca({ id, nome, cargo });
  }, [id, nome, cargo]);

  return null;
}
