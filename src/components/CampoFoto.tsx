"use client";

import type { ChangeEvent, InputHTMLAttributes } from "react";
import { reduzir } from "@/lib/reduzir-foto";

/** Abaixo disto a foto já passa folgada no limite e não é mexida. */
const REDUZIR_ACIMA_DE = 1024 * 1024;

const precisaReduzir = (a: File) => a.type.startsWith("image/") && a.size > REDUZIR_ACIMA_DE;

/**
 * CAMPO DE FOTO QUE JÁ ENVIA REDUZIDA (01/10/2026).
 *
 * Um <input type="file"> comum, com uma diferença: ao escolher a foto, ela
 * é reduzida ali no celular e TROCADA dentro do próprio campo. O
 * formulário e a ação do servidor seguem iguais -- o FormData lê o
 * arquivo do campo, e o arquivo do campo já é o pequeno.
 *
 * Enquanto reduz (meio segundo, em geral), o campo fica "inválido": se a
 * pessoa tocar em Salvar nesse instante, o navegador segura o envio em
 * vez de mandar a foto original de 6 MB que a Vercel recusaria.
 */
export function CampoFoto({ onChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  async function aoEscolher(e: ChangeEvent<HTMLInputElement>) {
    onChange?.(e);

    const campo = e.currentTarget;
    const escolhidos = Array.from(campo.files ?? []);

    // Marca desta escolha: se a pessoa trocar a foto enquanto a anterior
    // reduz, só a última pode gravar no campo e liberar o envio.
    const vez = String(Date.now() + Math.random());
    campo.dataset.preparo = vez;
    campo.setCustomValidity("");

    if (typeof DataTransfer === "undefined" || !escolhidos.some(precisaReduzir)) return;

    campo.setCustomValidity("Preparando a foto, aguarde um instante...");
    try {
      const prontos = await Promise.all(
        escolhidos.map((a) =>
          precisaReduzir(a) ? reduzir(a, `${a.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`) : a,
        ),
      );
      if (campo.dataset.preparo !== vez) return;
      const dt = new DataTransfer();
      prontos.forEach((a) => dt.items.add(a));
      campo.files = dt.files;
    } catch {
      // Fica a original; o servidor avisa se passar do limite.
    } finally {
      if (campo.dataset.preparo === vez) campo.setCustomValidity("");
    }
  }

  return <input {...props} type="file" onChange={aoEscolher} />;
}
