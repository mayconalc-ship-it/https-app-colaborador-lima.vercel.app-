"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MarcaApp } from "@/components/MarcaApp";
import {
  CHAVE_SENHA_ALTERADA,
  validarNovaSenha,
} from "@/lib/senha";

export default function DefinirSenhaPage() {
  const router = useRouter();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const problema = validarNovaSenha(novaSenha, confirmarSenha);
    if (problema) {
      setErro(problema);
      return;
    }

    setSalvando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password: novaSenha,
      data: { [CHAVE_SENHA_ALTERADA]: true },
    });

    if (error) {
      setSalvando(false);
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }

    // O app confere "já trocou a senha?" lendo o token guardado no aparelho.
    // O updateUser grava no servidor, mas o token antigo continua dizendo que
    // não trocou — sem renovar aqui, o colaborador voltaria para esta tela.
    const { error: erroRenovar } = await supabase.auth.refreshSession();
    setSalvando(false);

    if (erroRenovar) {
      setErro(
        "A senha foi alterada, mas não conseguimos entrar automaticamente. Entre novamente com a nova senha.",
      );
      return;
    }

    setSucesso(true);
    router.refresh();
    setTimeout(() => router.push("/"), 1400);
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      {/* Marca do app, e não da empresa: aqui ainda não se sabe de qual
          revenda é quem está entrando. */}
      <MarcaApp tamanho={64} variante="ladrilho" className="mb-6" />

      {sucesso ? (
        <div className="w-full max-w-sm rounded-2xl border border-green-200 bg-green-50 p-6 text-center shadow-sm">
          <p className="text-4xl">✅</p>
          <p className="mt-3 text-lg font-bold text-green-900">
            Senha alterada com sucesso!
          </p>
          <p className="mt-1 text-sm text-green-800">
            Guarde bem a sua nova senha. Estamos abrindo o app...
          </p>
        </div>
      ) : (
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Crie sua senha 🔒
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Este é seu primeiro acesso. Por segurança, defina uma senha pessoal
            para continuar.
          </p>
        </div>

        <div>
          <label
            htmlFor="nova"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Nova senha
          </label>
          <input
            id="nova"
            type="password"
            autoComplete="new-password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
            required
            minLength={6}
          />
          <p className="mt-1 text-xs text-slate-400">
            Mínimo de 6 caracteres. Não pode ser a senha padrão.
          </p>
        </div>

        <div>
          <label
            htmlFor="confirmar"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Repita a nova senha
          </label>
          <input
            id="confirmar"
            type="password"
            autoComplete="new-password"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
            required
            minLength={6}
          />
        </div>

        {erro && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>
        )}

        <button
          type="submit"
          disabled={salvando}
          className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {salvando ? "Salvando..." : "Salvar e entrar"}
        </button>
      </form>
      )}
    </div>
  );
}
