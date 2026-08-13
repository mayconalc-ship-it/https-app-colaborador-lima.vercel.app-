import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CABECALHO_USUARIO } from "@/lib/sessao-headers";

export type Perfil = {
  id: string;
  nome: string;
  cpf: string;
  cargo: string | null;
  /** Texto livre do cadastro ("DISTRIBUIÇÃO URBANA"). Quem traduz para
   *  DU/AL é `areaDoColaborador`, em lib/quiz.ts. */
  area: string | null;
  role: string;
  /** Usado para não mostrar a quem entrou depois avisos que não viveu. */
  criadoEm: string | null;
};

/**
 * Id do usuário já autenticado. O proxy validou o token no Supabase e
 * repassou o id por cabeçalho — ele apaga qualquer valor que venha de fora
 * antes de escrever o seu, então este valor é confiável.
 *
 * Se por algum motivo o cabeçalho não vier, caímos na validação completa.
 */
export const getUsuarioId = cache(async (): Promise<string | null> => {
  const cabecalhos = await headers();
  const doProxy = cabecalhos.get(CABECALHO_USUARIO);
  if (doProxy) return doProxy;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
});

/**
 * Perfil (nome, CPF e papel). O cache() garante uma única consulta por
 * requisição, mesmo que o layout, a página e o requireAdmin peçam o perfil.
 */
export const getPerfil = cache(async (): Promise<Perfil | null> => {
  const id = await getUsuarioId();
  if (!id) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, nome, cpf, cargo, area, role, created_at")
    .eq("id", id)
    .single();

  if (!data) return null;
  return { ...data, criadoEm: data.created_at ?? null };
});
