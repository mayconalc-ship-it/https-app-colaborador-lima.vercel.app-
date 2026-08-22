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
 *
 * A revenda entra na conta porque o canal é um por revenda (ver
 * lib/presenca): trocar de revenda pelo seletor troca de canal, para não
 * continuar aparecendo como online para quem ficou na outra.
 *
 * Nome e cargo saíram daqui: o canal carrega só o id, e quem exibe a lista
 * resolve os nomes por conta própria. Este componente vive no rodapé de
 * TODAS as telas, então quanto menos dado pessoal ele carregar, melhor.
 */
export function PresencaAoVivo({
  id,
  revendaId,
}: {
  id: string;
  revendaId: string;
}) {
  useEffect(() => {
    void iniciarPresenca({ id, revendaId });
  }, [id, revendaId]);

  return null;
}
