import { reduzir as reduzirFoto } from "@/lib/reduzir-foto";

/** O redutor mora em lib/reduzir-foto; aqui só o nome do arquivo. */
export function reduzir(arquivo: File): Promise<File> {
  return reduzirFoto(arquivo, "comprovante.jpg");
}

/**
 * Leva o cursor do campo de valor para o fim. O CURSOR MORA NO FIM (pedido
 * do dono, 18/09/2026: tocando na frente do número e digitando 123, virava
 * R$ 1.000,23) -- o dígito entra sempre pela direita, como no app do banco.
 */
export function cursorNoFim(e: React.SyntheticEvent<HTMLInputElement>) {
  const campo = e.currentTarget;
  const fim = campo.value.length;
  if (campo.selectionStart !== fim || campo.selectionEnd !== fim) {
    // Depois do navegador posicionar o cursor do toque -- senão ele ganha.
    requestAnimationFrame(() => campo.setSelectionRange(fim, fim));
  }
}
