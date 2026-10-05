/**
 * Reduz a foto NO CELULAR antes de enviar: a câmera tira 3-8 MB, e a
 * Vercel recusa envio acima de ~4,5 MB -- a pessoa via um erro genérico
 * ao salvar e não sabia que o problema era a foto. 1600 px e JPEG 80
 * deixam evidência, horímetro e comprovante legíveis em ~300 KB.
 *
 * Nasceu no QR de Contingência (18/09/2026) e veio para cá em 01/10/2026,
 * quando passou a valer para todos os campos de foto da operação.
 *
 * Se o aparelho não conseguir reduzir, vai o original -- o servidor avisa
 * se passar do limite.
 *
 * `ladoMaior` e `qualidade` existem para quem não precisa de 1600 px: a
 * foto do chamado de manutenção mostra o problema, não é evidência de
 * auditoria, e sobe menor (05/10/2026).
 */
export async function reduzir(arquivo: File, nome = "foto.jpg", ladoMaior = 1600, qualidade = 0.8): Promise<File> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, ladoMaior / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return arquivo;
    // Fundo branco: PNG com transparência viraria fundo preto no JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob: Blob | null = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", qualidade));
    // Reduzir que não diminuiu (imagem já pequena e bem comprimida) não ajuda.
    if (!blob || blob.size >= arquivo.size) return arquivo;
    return new File([blob], nome, { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}
