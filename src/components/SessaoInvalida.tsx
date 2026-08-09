"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

/**
 * Aparece quando o login é válido mas falta algo do lado de cá: o cadastro
 * do colaborador não existe mais (conta removida), ou ele existe mas não
 * está vinculado a revenda nenhuma. Sem isso a pessoa via a tela inicial
 * quebrada, com "Olá!" sem nome e sem dados.
 */
export function SessaoInvalida({
  titulo = "Sessão não reconhecida",
  mensagem = "Seu cadastro não foi encontrado. Entre novamente — se o problema continuar, procure seu gestor.",
}: {
  titulo?: string;
  mensagem?: string;
}) {
  const router = useRouter();

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-4xl">🔒</p>
        <h1 className="mt-3 text-lg font-bold text-slate-900">{titulo}</h1>
        <p className="mt-2 text-sm text-slate-500">{mensagem}</p>
        <button
          onClick={sair}
          className="mt-5 w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark"
        >
          Entrar novamente
        </button>
      </div>
    </div>
  );
}
