"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useToast } from "@/components/Toast";
import { createClient } from "@/lib/supabase/client";
import { CHAVE_SENHA_ALTERADA, validarNovaSenha } from "@/lib/senha";

export default function MinhaContaPage() {
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  // Erro de preenchimento continua colado no formulário: ele fala dos
  // campos ali em cima e precisa ficar na tela enquanto a pessoa corrige.
  // O que virou toast foi a confirmação -- ela aparecia embaixo do botão,
  // e depois de limpar os campos não sobrava sinal nenhum de que salvou.
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const toast = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const problema = validarNovaSenha(novaSenha, confirmarSenha);
    if (problema) {
      setErro(problema);
      return;
    }

    setCarregando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password: novaSenha,
      data: { [CHAVE_SENHA_ALTERADA]: true },
    });

    if (error) {
      setCarregando(false);
      setErro("Não foi possível trocar a senha. Tente novamente.");
      return;
    }

    // Renova o token para que ele passe a refletir a troca já feita.
    await supabase.auth.refreshSession();
    setCarregando(false);

    setNovaSenha("");
    setConfirmarSenha("");
    toast.sucesso("Senha alterada com sucesso!");
  }

  return (
    <div>
      <PageHeader title="Minha Conta" subtitle="Altere sua senha de acesso" />
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
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
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
            required
            minLength={6}
          />
        </div>
        <div>
          <label
            htmlFor="confirmar"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Confirmar nova senha
          </label>
          <input
            id="confirmar"
            type="password"
            value={confirmarSenha}
            onChange={(e) => setConfirmarSenha(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
            required
            minLength={6}
          />
        </div>
        {erro && (
          <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        )}
        <button
          type="submit"
          disabled={carregando}
          aria-busy={carregando}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {carregando && <span className="rodinha" aria-hidden="true" />}
          {carregando ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </div>
  );
}
