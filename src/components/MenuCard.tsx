import Link from "next/link";

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
      className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:border-primary hover:shadow-md"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-3xl">
        {emoji}
      </span>
      <span className="text-sm font-semibold leading-tight text-slate-900 group-hover:text-primary">
        {title}
      </span>
    </Link>
  );
}
