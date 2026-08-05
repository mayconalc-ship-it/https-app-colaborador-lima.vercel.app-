"use client";

import { useRouter, useSearchParams } from "next/navigation";

function formatarMes(mesAno: string) {
  const [ano, mes] = mesAno.split("-");
  const data = new Date(Number(ano), Number(mes) - 1, 1);
  const texto = data.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function MonthSelect({
  meses,
  mesSelecionado,
}: {
  meses: string[];
  mesSelecionado: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mes_ano", e.target.value);
    router.push(`/ranking?${params.toString()}`);
  }

  return (
    <select
      value={mesSelecionado}
      onChange={handleChange}
      className="rounded-xl border border-slate-200 bg-white p-2 text-sm font-medium text-slate-700 focus:border-primary focus:outline-none"
    >
      {meses.map((mes) => (
        <option key={mes} value={mes}>
          {formatarMes(mes)}
        </option>
      ))}
    </select>
  );
}
