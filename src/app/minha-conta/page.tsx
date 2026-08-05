"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/client";
import { CHAVE_SENHA_ALTERADA, validarNovaSenha } from "@/lib/senha";

export default function MinhaContaPage() {
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [mensagem, setMensagem] = useState<{
    tipo: "erro" | "sucesso";
    texto: string;
  } | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMensagem(null);

    const problema = validarNovaSenha(novaSenha, confirmarSenha);
    if (problema) {
      setMensagem({ tipo: "erro", texto: problema });
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
      setMensagem({
        tipo: "erro",
        texto: "Não foi possível trocar a senha. Tente novamente.",
      });
      return;
    }

    // Renova o token para que ele passe a refletir a troca já feita.
    await supabase.auth.refreshSession();
    setCarregando(false);

    setNovaSenha("");
    setConfirmarSenha("");
    setMensagem({ tipo: "sucesso", texto: "Senha alterada com sucesso!" });
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
        {mensagem && (
          <p
            className={
              mensagem.tipo === "erro"
                ? "text-sm text-red-600"
                : "text-sm text-green-700"
            }
          >
            {mensagem.texto}
          </p>
        )}
        <button
          type="submit"
          disabled={carregando}
          className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {carregando ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </div>
  );
}
