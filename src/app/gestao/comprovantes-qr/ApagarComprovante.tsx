"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { excluirComprovante } from "@/app/qr-contingencia/actions";

/** Apagar comprovante lançado por engano -- só para quem tem "excluir". */
export function ApagarComprovante({ id }: { id: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => {
        if (!confirm("Apagar este comprovante e as fotos dele? Não dá para desfazer.")) return;
        iniciar(async () => {
          const r = await excluirComprovante(id);
          if (!r.ok) alert(r.erro);
          router.refresh();
        });
      }}
      className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 disabled:opacity-40"
    >
      {pendente ? "..." : "Apagar"}
    </button>
  );
}
