import Link from "next/link";
import { requireOwner } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { formatarNumero } from "@/lib/formatar";

const PERIODOS = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
];

const ROTULO_RECURSO: Record<string, string> = {
  cinco_porques: "5 Porquês",
  quiz: "Quiz (Desafio do Mês)",
};

type Registro = {
  recurso: string;
  modelo: string;
  tokens_entrada: number;
  tokens_saida: number;
  custo_usd: number;
  criado_em: string;
};

function formatarUsd(valor: number) {
  return valor.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export default async function CreditosIAPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  await requireOwner();

  const p = await searchParams;
  const dias = PERIODOS.some((x) => String(x.dias) === p.dias)
    ? Number(p.dias)
    : 30;

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const admin = createAdminClient();

  // Sem recorte por revenda, de propósito: o custo é do app inteiro (uma
  // única chave de API na Anthropic), não algo que se divida por revenda.
  const { data } = await admin
    .from("ia_uso_registros")
    .select("recurso, modelo, tokens_entrada, tokens_saida, custo_usd, criado_em")
    .gte("criado_em", desde.toISOString())
    .order("criado_em", { ascending: false })
    .limit(5000);

  const registros = (data ?? []) as Registro[];

  const custoTotal = registros.reduce((soma, r) => soma + r.custo_usd, 0);
  const tokensEntrada = registros.reduce((soma, r) => soma + r.tokens_entrada, 0);
  const tokensSaida = registros.reduce((soma, r) => soma + r.tokens_saida, 0);

  const porRecurso = new Map<string, { chamadas: number; custo: number }>();
  const porModelo = new Map<string, { chamadas: number; custo: number }>();

  for (const r of registros) {
    const recurso = porRecurso.get(r.recurso) ?? { chamadas: 0, custo: 0 };
    recurso.chamadas++;
    recurso.custo += r.custo_usd;
    porRecurso.set(r.recurso, recurso);

    const modelo = porModelo.get(r.modelo) ?? { chamadas: 0, custo: 0 };
    modelo.chamadas++;
    modelo.custo += r.custo_usd;
    porModelo.set(r.modelo, modelo);
  }

  const linhasRecurso = Array.from(porRecurso.entries()).sort(
    (a, b) => b[1].custo - a[1].custo,
  );
  const linhasModelo = Array.from(porModelo.entries()).sort(
    (a, b) => b[1].custo - a[1].custo,
  );

  const endereco = (novosDias: number) =>
    novosDias === 30 ? "/admin/creditos-ia" : `/admin/creditos-ia?dias=${novosDias}`;

  return (
    <div>
      <PageHeader
        title="💳 Créditos de IA"
        subtitle="Estimativa de gasto com as chamadas de IA do app"
      />

      <div className="mb-4 flex gap-2">
        {PERIODOS.map((x) => (
          <Link
            key={x.dias}
            href={endereco(x.dias)}
            className={`flex-1 rounded-xl border py-2 text-center text-sm font-semibold ${
              x.dias === dias
                ? "border-primary bg-primary-soft text-primary"
                : "border-slate-200 text-slate-600"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Cartao valor={formatarUsd(custoTotal)} rotulo={`custo estimado em ${dias} dias`} />
        <Cartao valor={formatarNumero(registros.length)} rotulo="chamadas de IA" />
        <Cartao valor={formatarNumero(tokensEntrada)} rotulo="tokens de entrada" />
        <Cartao valor={formatarNumero(tokensSaida)} rotulo="tokens de saída" />
      </div>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Por funcionalidade</h2>
        {linhasRecurso.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma chamada de IA no período.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {linhasRecurso.map(([recurso, v]) => (
              <li key={recurso} className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-700">
                  {ROTULO_RECURSO[recurso] ?? recurso}
                  <span className="ml-2 text-xs text-slate-400">
                    {v.chamadas} chamada{v.chamadas === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-primary">
                  {formatarUsd(v.custo)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Por modelo</h2>
        {linhasModelo.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma chamada de IA no período.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {linhasModelo.map(([modelo, v]) => (
              <li key={modelo} className="flex items-center justify-between py-2">
                <span className="text-sm text-slate-700">
                  {modelo}
                  <span className="ml-2 text-xs text-slate-400">
                    {v.chamadas} chamada{v.chamadas === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-primary">
                  {formatarUsd(v.custo)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Estimativa calculada pelo preço público por token de cada modelo — não
        é a fatura real. Para o saldo e o consumo oficial da conta, confira o{" "}
        <a
          href="https://console.anthropic.com/settings/billing"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Anthropic Console
        </a>
        . Chamadas feitas antes desta tela existir (sem registro salvo) não
        aparecem aqui.
      </p>
    </div>
  );
}

function Cartao({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-bold text-primary">{valor}</p>
      <p className="text-xs text-slate-500">{rotulo}</p>
    </div>
  );
}
