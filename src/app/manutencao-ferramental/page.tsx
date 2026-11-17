import { TelaDaSecao, type ParametrosDaTela } from "../manutencao-preventiva/TelaDaSecao";

export const dynamic = "force-dynamic";

/** Check Ferramental: fora da Preventiva, mesmo motor (17/11/2026). */
export default async function CheckFerramentalPage({ searchParams }: { searchParams: Promise<ParametrosDaTela> }) {
  return <TelaDaSecao secao="ferramental" sp={await searchParams} />;
}
