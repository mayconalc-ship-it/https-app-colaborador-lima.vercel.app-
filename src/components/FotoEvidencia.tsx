import Image from "next/image";

/**
 * Foto de evidência do 5S, no tamanho que a tela realmente usa.
 *
 * As fotos do 5S vêm da câmera do celular do auditor, sem passar por
 * compressão nenhuma: medido em 21/08/2026, as maiores tinham 3,6 MB. E
 * eram entregues assim, inteiras, para caber numa faixa de 100 pixels de
 * altura -- em lista, várias por tela.
 *
 * Com `next/image` o servidor entrega WebP do tamanho do espaço, e o
 * arquivo grande é buscado uma vez só, pelo otimizador, em vez de uma vez
 * por pessoa que abre a auditoria.
 *
 * Isso importa duas vezes. Para quem usa: a auditoria abre no 4G do
 * armazém em vez de ficar em branco. Para a conta: o armazenamento do
 * Supabase responde `Cache-Control: no-cache` e ignora o que a gente pede
 * no envio (conferido em 22/08/2026, inclusive em arquivo recém-subido),
 * então SEM o otimizador cada visita rebaixava a foto inteira de novo.
 *
 * A caixa tem altura antes de a foto chegar -- é o mesmo cuidado do
 * FotoAmpliavel: sem altura reservada a lista dá um pulo quando as fotos
 * carregam, e quem está lendo perde a linha.
 */
export function FotoEvidencia({
  src,
  alt,
  classeCaixa,
  sizes = "(max-width: 768px) 100vw, 720px",
}: {
  src: string;
  alt: string;
  /** Altura reservada para a foto: `h-40 w-full`, `h-24 w-full`, etc. */
  classeCaixa: string;
  sizes?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-slate-100 ${classeCaixa}`}
    >
      <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />
    </div>
  );
}
