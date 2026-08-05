"use client";

export function BotaoExcluir({
  action,
  campos,
  confirmacao,
  children,
  className,
}: {
  action: (formData: FormData) => void;
  campos: Record<string, string | number>;
  confirmacao: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmacao)) e.preventDefault();
      }}
    >
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <button
        type="submit"
        className={
          className ??
          "rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        }
      >
        {children}
      </button>
    </form>
  );
}
