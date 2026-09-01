import Link from "next/link";
import { DicaLink } from "@/components/DicaLink";
import { Icone } from "@/components/Icone";

export function MenuCard({
  href,
  title,
  emoji,
  chave,
  destaque = false,
  legenda,
}: {
  href: string;
  title: string;
  emoji: string;
  /** Chave do item de menu -- é ela que escolhe o ícone. */
  chave?: string;
  /** Ocupa a linha inteira, com o ícone ao lado do texto em vez de acima.
   *  Reservado aos dois módulos que os dados mostram ser o motivo de a
   *  pessoa abrir o app (ver DESTAQUES_DO_MENU). */
  destaque?: boolean;
  legenda?: string;
}) {
  if (destaque) {
    return (
      <Link
        href={href}
        prefetch={false}
        className="group col-span-2 flex min-w-0 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-primary hover:shadow-md"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Icone chave={chave ?? ""} emoji={emoji} tamanho={26} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-base font-bold leading-tight text-slate-900 group-hover:text-primary">
            {title}
            <DicaLink />
          </span>
          {legenda && <span className="mt-0.5 block text-xs text-slate-500">{legenda}</span>}
        </span>
        <span aria-hidden className="shrink-0 text-slate-300 transition group-hover:text-primary">
          →
        </span>
      </Link>
    );
  }
  return (
    <Link
      href={href}
      prefetch={false}
      className="group flex min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:border-primary hover:shadow-md"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icone chave={chave ?? ""} emoji={emoji} tamanho={24} />
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold leading-tight text-slate-900 group-hover:text-primary">
        {title}
        <DicaLink />
      </span>
    </Link>
  );
}

/** O cartão antigo, só com emoji. Continua existindo para as telas que
 *  ainda não passaram pelo sistema de ícones -- some quando a última
 *  delas migrar. */
export function MenuCardEmoji({
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
