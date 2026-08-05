"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { cpfParaEmail, somenteDigitos } from "@/lib/auth-helpers";

export default function LoginPage() {
  const router = useRouter();
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: cpfParaEmail(cpf),
      password: senha,
    });

    setCarregando(false);

    if (error) {
      // Só a credencial errada vira mensagem amigável. Qualquer outra falha
      // (rede, configuração) precisa aparecer, senão fica impossível resolver.
      const credencialInvalida = error.message
        ?.toLowerCase()
        .includes("invalid login credentials");
      setErro(
        credencialInvalida
          ? "CPF ou senha incorretos."
          : `Não foi possível entrar: ${error.message}`,
      );
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <div className="mb-6 flex h-16 items-center rounded-xl bg-white px-4 py-2 shadow-md">
        <Image
          src="/logo-v2.png"
          alt="Cervejaria Ambev Lima"
          width={220}
          height={146}
          quality={100}
          className="h-12 w-auto object-contain"
          priority
        />
      </div>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-bold text-slate-900">Entrar</h1>
          <p className="text-sm text-slate-500">
            Use seu CPF (só números) e sua senha
          </p>
        </div>
        <div>
          <label
            htmlFor="cpf"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            CPF
          </label>
          <input
            id="cpf"
            inputMode="numeric"
            autoComplete="username"
            value={cpf}
            onChange={(e) => setCpf(somenteDigitos(e.target.value))}
            maxLength={11}
            placeholder="Somente números"
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
            required
          />
        </div>
        <div>
          <label
            htmlFor="senha"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Senha
          </label>
          <input
            id="senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-primary focus:outline-none"
            required
          />
        </div>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button
          type="submit"
          disabled={carregando}
          className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {carregando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
