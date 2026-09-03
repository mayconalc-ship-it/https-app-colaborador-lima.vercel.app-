import { Suspense } from "react";
import { getDicaDoDia } from "@/lib/voce-sabia-server";
import { VoceSabia } from "@/components/VoceSabia";

/**
 * A lâmpada, montada no layout -- mas SEM segurar a tela.
 *
 * Ela mora no layout de propósito: a revisão do desafio não é uma tela
 * que alguém vá procurar, e a graça é ela estar do lado enquanto a pessoa
 * usa o app para outra coisa. Só que o layout é o caminho de TODAS as
 * telas, e as quatro consultas de `getDicaDoDia` entrariam no tempo de
 * abertura de cada uma delas.
 *
 * Por isso o Suspense com fallback nulo: a página é entregue primeiro e a
 * lâmpada chega logo depois, sozinha. Ninguém espera meio segundo a mais
 * pelo Reepack por causa de uma dica -- e, no celular do armazém, meio
 * segundo em toda tela é o tipo de coisa que faz o app "parecer pesado"
 * sem que ninguém saiba dizer por quê.
 *
 * A falha é calada e some junto: se a consulta der erro, o app não pode
 * quebrar por causa da lâmpada. O próximo carregamento tenta de novo.
 */
export function LampadaVoceSabia({
  colaboradorId,
  revendaId,
}: {
  colaboradorId: string;
  revendaId: string;
}) {
  return (
    <Suspense fallback={null}>
      <Lampada colaboradorId={colaboradorId} revendaId={revendaId} />
    </Suspense>
  );
}

async function Lampada({
  colaboradorId,
  revendaId,
}: {
  colaboradorId: string;
  revendaId: string;
}) {
  let estado = null;
  try {
    estado = await getDicaDoDia(colaboradorId, revendaId);
  } catch {
    return null;
  }

  if (!estado) return null;

  return (
    <VoceSabia
      dica={estado.dica}
      jaVistaHoje={estado.jaVistaHoje}
      curtiu={estado.curtiu}
      areaCurta={estado.areaCurta}
    />
  );
}
