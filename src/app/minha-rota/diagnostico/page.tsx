import { redirect } from "next/navigation";
import { getPerfil } from "@/lib/sessao";
import { ehOwner } from "@/lib/acessos";
import { consultarRota } from "../actions";

export const dynamic = "force-dynamic";

/**
 * DIAGNÓSTICO DA PRÉ-ROTA (22/09/2026, temporário).
 *
 * A consulta pelo botão vinha falhando sem dizer por quê. Esta tela roda a
 * MESMA função pelo endereço (GET), onde o erro aparece inteiro: se aqui
 * funciona e o botão não, o problema é o envio do pedido, não a consulta.
 * Só para o dono. Some quando a causa for achada.
 */
/** Fora do componente: o relógio não pode ser lido durante a renderização. */
async function rodar(mapa: string) {
  const comeco = Date.now();
  try {
    const r = await consultarRota(mapa);
    return { saida: JSON.stringify(r, null, 2), ms: Date.now() - comeco, quando: new Date().toISOString() };
  } catch (e) {
    const erro = e as Error;
    return {
      saida: `EXCEÇÃO: ${erro?.name}: ${erro?.message}\n\n${erro?.stack ?? ""}`,
      ms: Date.now() - comeco,
      quando: new Date().toISOString(),
    };
  }
}

export default async function DiagnosticoPreRota({
  searchParams,
}: {
  searchParams: Promise<{ mapa?: string }>;
}) {
  const perfil = await getPerfil();
  if (!perfil) redirect("/login");
  if (!ehOwner(perfil.role)) redirect("/minha-rota");

  const mapa = (await searchParams).mapa ?? "15950";
  const { saida, ms, quando } = await rodar(mapa);

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900">Diagnóstico da pré-rota</h1>
      <p className="mt-1 text-sm text-slate-600">
        Mapa {mapa} · {ms} ms · {quando}
      </p>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
        {saida}
      </pre>
    </div>
  );
}
