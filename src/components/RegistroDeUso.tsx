"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { idDaSessao, registrarEvento } from "@/lib/eventos";

/** De quanto em quanto tempo o relógio confere quanto passou. */
const TIQUE_MS = 10_000;

/** De quanto em quanto tempo o total é enviado ao servidor. */
const ENVIO_SEGUNDOS = 15;

/** O acumulado fica guardado aqui para sobreviver a um recarregamento. */
const CHAVE_SEGUNDOS = "lima_uso_segundos";

/** Marca que a linha da sessão já foi criada, para não tentar de novo. */
const CHAVE_CRIADA = "lima_uso_sessao_criada";

/**
 * Mede a adesão ao app: quem entrou, quanto tempo ficou e o que abriu.
 *
 * São duas medições diferentes, de propósito:
 *   - "uso_sessoes" guarda o TEMPO, num registro por aba que vai sendo
 *     atualizado. Uma linha por sessão, não uma por segundo.
 *   - "eventos_acesso" guarda O QUE ACONTECEU, uma linha por evento. É
 *     essa que alimenta o feed ao vivo do painel.
 *
 * Registra apenas o endereço da tela, nunca o conteúdo visto.
 */
export function RegistroDeUso() {
  const caminho = usePathname();

  // ---- Tempo de uso -----------------------------------------------
  useEffect(() => {
    const supabase = createClient();
    const sessaoId = idDaSessao();

    let acumulado = Number(sessionStorage.getItem(CHAVE_SEGUNDOS) ?? 0) || 0;
    let ultimoTique = Date.now();
    let naoEnviado = 0;
    let ativo = true;
    let token: string | undefined;

    async function abrirSessao() {
      const { data } = await supabase.auth.getUser();
      if (!data.user || !ativo) return null;

      const { data: sessao } = await supabase.auth.getSession();
      token = sessao.session?.access_token;

      if (sessionStorage.getItem(CHAVE_CRIADA) === sessaoId) return data.user.id;

      // Insert simples, nunca upsert: o upsert usa ON CONFLICT, que precisa
      // LER a tabela para achar a linha em conflito -- e ninguém tem
      // permissão de leitura aqui. Como o id é sorteado agora, conflito
      // não existe.
      const { error } = await supabase.from("uso_sessoes").insert({
        id: sessaoId,
        colaborador_id: data.user.id,
        segundos: Math.round(acumulado),
      });

      // 23505 = a linha já estava lá (a mesma aba abriu duas vezes).
      if (error && error.code !== "23505") return null;

      sessionStorage.setItem(CHAVE_CRIADA, sessaoId);
      void registrarEvento("login", "Entrou no app");
      return data.user.id;
    }

    const pronta = abrirSessao();

    async function enviar() {
      if (naoEnviado <= 0) return;
      if (!(await pronta)) return;

      naoEnviado = 0;
      await supabase
        .from("uso_sessoes")
        .update({
          segundos: Math.round(acumulado),
          ultima_atividade: new Date().toISOString(),
        })
        .eq("id", sessaoId);
    }

    function contar() {
      const agora = Date.now();
      const decorrido = (agora - ultimoTique) / 1000;
      ultimoTique = agora;

      // Só conta com o app na frente: celular no bolso não soma horas.
      if (document.visibilityState !== "visible") return;

      // Um salto grande significa que o aparelho dormiu ou a aba ficou
      // congelada -- descartamos para não inventar tempo de uso.
      if (decorrido > TIQUE_MS / 1000 + 30) return;

      acumulado += decorrido;
      naoEnviado += decorrido;
      sessionStorage.setItem(CHAVE_SEGUNDOS, String(Math.round(acumulado)));

      if (naoEnviado >= ENVIO_SEGUNDOS) void enviar();
    }

    const relogio = setInterval(contar, TIQUE_MS);

    /**
     * Envio de despedida. Ao fechar a aba o navegador mata as requisições
     * pendentes, e o último trecho de tempo se perdia. Com "keepalive" o
     * navegador se compromete a terminar o envio mesmo com a página já
     * fechada -- por isso aqui é fetch cru, e não o cliente do Supabase.
     */
    function enviarNaSaida() {
      if (naoEnviado <= 0 || !token) return;
      naoEnviado = 0;

      fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/uso_sessoes?id=eq.${sessaoId}`,
        {
          method: "PATCH",
          keepalive: true,
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            segundos: Math.round(acumulado),
            ultima_atividade: new Date().toISOString(),
          }),
        },
      ).catch(() => {});
    }

    function aoEsconder() {
      contar();
      if (document.visibilityState === "hidden") enviarNaSaida();
    }

    function aoFechar() {
      contar();
      enviarNaSaida();
    }

    document.addEventListener("visibilitychange", aoEsconder);
    window.addEventListener("pagehide", aoFechar);

    return () => {
      ativo = false;
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("pagehide", aoFechar);
    };
  }, []);

  // ---- Telas visitadas --------------------------------------------
  useEffect(() => {
    if (caminho) void registrarEvento("tela", caminho);
  }, [caminho]);

  return null;
}
