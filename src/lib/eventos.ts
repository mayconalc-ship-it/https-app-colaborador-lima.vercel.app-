"use client";

import { createClient } from "@/lib/supabase/client";

export type TipoEvento = "login" | "tela" | "acao";

/** Uma sessão por aba: sobrevive à navegação, morre ao fechar a aba. */
const CHAVE_SESSAO = "lima_uso_sessao";

export function idDaSessao() {
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
 */
export async function registrarEvento(tipo: TipoEvento, alvo: string) {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;

    await supabase.from("eventos_acesso").insert({
      colaborador_id: data.user.id,
      nome: "",
      tipo,
      alvo,
      sessao_id: idDaSessao(),
    });
  } catch {
    // silêncio proposital
  }
}

/**
 * Atalho para usar em botões: `onClick={() => registrarAcao("Baixou padrão")}`.
 * Não espera a resposta, para não segurar o clique.
 */
export function registrarAcao(nomeDaFuncao: string) {
  void registrarEvento("acao", nomeDaFuncao);
}
