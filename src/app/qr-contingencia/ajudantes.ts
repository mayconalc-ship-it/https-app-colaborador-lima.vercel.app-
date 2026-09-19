/**
 * Reduz a foto NO CELULAR antes de enviar: a câmera tira 3-4 MB, e o
 * servidor recusa envio acima de ~4,5 MB. 1600 px e JPEG 80 deixam o
 * comprovante legível em ~300 KB. Se o aparelho não conseguir reduzir,
 * vai o original -- o servidor avisa se passar do limite.
 */
export async function reduzir(arquivo: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    if (!blob) return arquivo;
    return new File([blob], "comprovante.jpg", { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
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
