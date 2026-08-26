"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useConfirmacao } from "@/components/Confirmacao";

export function LogoutButton() {
  const router = useRouter();
  const confirmar = useConfirmacao();

  async function handleLogout() {
    const ok = await confirmar({
      titulo: "Sair do app?",
      confirmar: "Sair",
      perigo: false,
    });
    if (!ok) return;

    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="shrink-0 rounded-lg bg-white/10 px-2 py-1.5 text-sm font-medium hover:bg-white/20"
    >
      Sair
    </button>
  );
}
