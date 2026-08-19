"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { reabrirAuditoria } from "@/app/5s/actions";

/**
 * Reabertura de auditoria finalizada.
 *
 * O motivo é obrigatório na tela E na ação de servidor. Aqui ele serve
 * para a pessoa não perder o que digitou; lá é o que vale, porque a
 * ação pode ser chamada sem passar por esta tela.
 */
export function FormReabrir({ auditoriaId }: { auditoriaId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [enviando, iniciar] = useTransition();

  function enviar(formData: FormData) {
    formData.set("id", auditoriaId);
    iniciar(async () => {
      const r = await reabrirAuditoria(formData);
      if (r.ok) {
        toast.sucesso(r.mensagem ?? "Auditoria reaberta.");
        router.refresh();
      } else {
        toast.erro(r.erro);
      }
    });
  }

  return (
    <form action={enviar} className="mt-3 space-y-2">
      <textarea
        name="motivo"
        rows={2}
        required
        minLength={10}
        placeholder="Por que precisa reabrir? (ex.: item 3.2 foi marcado errado)"
        className="w-full rounded-xl border border-amber-300 bg-white p-3 text-base focus:border-amber-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white active:bg-amber-700 disabled:opacity-60"
      >
        {enviando ? (
          <span className="inline-flex items-center justify-center gap-2">
            <span className="rodinha" aria-hidden="true" />
            Reabrindo...
          </span>
        ) : (
          "Reabrir auditoria"
        )}
      </button>
    </form>
  );
}
