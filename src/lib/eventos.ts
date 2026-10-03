"use client";

import { createClient } from "@/lib/supabase/client";

export type TipoEvento = "tela";

/** Uma sessão por aba: sobrevive à navegação, morre ao fechar a aba. */
const CHAVE_SESSAO = "lima_uso_sessao";

function idDaSessao() {
  let id = sessionStorage.getItem(CHAVE_SESSAO);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(CHAVE_SESSAO, id);
  }
  return id;
}

/**
 * Registra um evento de uso.
 *
 * Nunca lança erro: medir uso não pode atrapalhar quem está trabalhando.
 * O autor, o nome e a hora são preenchidos pelo banco — o que for mandado
 * daqui nesses três campos é ignorado.
 *
 * getSession, e não getUser: lê o usuário do cookie, sem ir ao servidor
 * de autenticação a cada tela (cada ida é mais uma linha de log).
 */
export async function registrarEvento(tipo: TipoEvento, alvo: string) {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const usuario = data.session?.user;
    if (!usuario) return;

    await supabase.from("eventos_acesso").insert({
      colaborador_id: usuario.id,
      nome: "",
      tipo,
      alvo,
      sessao_id: idDaSessao(),
    });
  } catch {
    // silêncio proposital
  }
}
