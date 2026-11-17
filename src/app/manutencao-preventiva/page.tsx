import { TelaDaSecao, type ParametrosDaTela } from "./TelaDaSecao";

export const dynamic = "force-dynamic";

export default async function ManutencaoPreventivaPage({ searchParams }: { searchParams: Promise<ParametrosDaTela> }) {
  return <TelaDaSecao secao="preventiva" sp={await searchParams} />;
}
