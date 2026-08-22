import Link from "next/link";
import { DicaLink } from "@/components/DicaLink";

export function MenuCard({
  href,
  title,
  emoji,
}: {
  href: string;
  title: string;
  emoji: string;
}) {
  return (
    <Link
      href={href}
      // Sem prefetch de proposito. Os dez cartoes ficam visiveis de uma vez
      // na tela inicial, entao o padrao do Next buscava as DEZ telas antes
      // de qualquer toque -- e cada uma e uma renderizacao de servidor
      // completa, com as consultas dela ao banco. A pessoa abre o app para
      // ver o Jornal e pagava por dez telas; na troca de turno isso
      // multiplicava por dez a carga no Supabase.
      //
      // O que se perde e pouco: sao telas que ja abrem rapido, e no celular
      // nao existe passar o mouse antes de tocar para adiantar so a que
      // interessa.
      prefetch={false}
      className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:border-primary hover:shadow-md"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-3xl">
        {emoji}
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold leading-tight text-slate-900 group-hover:text-primary">
        {title}
        <DicaLink />
      </span>
    </Link>
  );
}
