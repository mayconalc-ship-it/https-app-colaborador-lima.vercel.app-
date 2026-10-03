"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { registrarEvento } from "@/lib/eventos";

/**
 * Anota cada tela aberta: uma linha em "eventos_acesso" por navegação.
 * É o que a Limpeza de Acessos usa para achar módulo liberado e sem uso.
 *
 * O MEDIDOR DE TEMPO SAIU (03/10/2026, pedido do dono): ele mandava um
 * "ainda estou aqui" ao banco a cada 15 s de app aberto, por pessoa. Cada
 * chamada vira uma linha de log no Supabase, e foi isso que estourou a
 * cota de Log Ingestion do plano gratuito. A tela Uso do App, que era a
 * única a mostrar esse tempo, saiu junto.
 *
 * Registra apenas o endereço da tela, nunca o conteúdo visto.
 */
export function RegistroDeUso() {
  const caminho = usePathname();

  useEffect(() => {
    if (caminho) void registrarEvento("tela", caminho);
  }, [caminho]);

  return null;
}
