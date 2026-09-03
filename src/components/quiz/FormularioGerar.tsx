"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/BotaoEnviar";
import { useConfirmarEnvio } from "@/components/Confirmacao";

/**
 * "Gerar perguntas a partir do padrão" -- com a conta feita ANTES.
 *
 * A rodada promete um número de perguntas, e publicar exige que o
 * cadastro bata exatamente com esse número (ver publicarRodada). Só que a
 * divergência aparecia lá, dois minutos e uma geração paga depois:
 * gerava-se 10 numa rodada de 8 e a tela dizia "sobram 2, ajuste o
 * campo". A conta é simples e sempre esteve disponível aqui na tela --
 * agora ela é feita na hora de clicar (pedido do dono, 02/09/2026).
 *
 * Duas conversas diferentes, porque são dois problemas diferentes:
 * - PASSOU do configurado: pergunta se é para subir mais do que o
 *   combinado. Quem responde sim geralmente quer mesmo -- e aí precisa
 *   saber que o campo "Perguntas" também terá de mudar.
 * - FALTOU: não é erro nenhum, gerar em duas levas é normal. Aqui a tela
 *   só diz quantas ainda faltam, que é a instrução que ela não dava.
 *
 * O limite de 10 por vez é do tempo de execução, não do desenho: acima
 * disso a geração estoura os 60s do plano (ver maxDuration na página).
 */
const MAXIMO_POR_VEZ = 10;

export function FormularioGerar({
  action,
  rodadaId,
  cadastradas,
  configurado,
}: {
  action: (formData: FormData) => void;
  rodadaId: number;
  /** Quantas a rodada já tem. */
  cadastradas: number;
  /** Quantas ela promete -- o campo "Perguntas". */
  configurado: number;
}) {
  const faltam = configurado - cadastradas;
  const inicial = Math.min(Math.max(faltam, 1), MAXIMO_POR_VEZ);
  const [quantidade, setQuantidade] = useState(inicial);

  const total = cadastradas + quantidade;
  const sobra = total - configurado;
  const confirmarEnvio = useConfirmarEnvio();

  const pedido =
    sobra > 0
      ? {
          titulo: `A rodada é de ${configurado} perguntas — vai ficar com ${total}`,
          detalhe:
            `Já são ${cadastradas} cadastradas e você está gerando ${quantidade}: ` +
            `${sobra} a mais do que o configurado. Para publicar assim, o campo ` +
            `"Perguntas" também terá de ir para ${total}.`,
          confirmar: `Gerar ${quantidade} mesmo assim`,
          perigo: false,
        }
      : sobra < 0
        ? {
            titulo: `Vai ficar com ${total} de ${configurado} — ainda faltam ${-sobra}`,
            detalhe:
              `A rodada só publica com as ${configurado} perguntas completas. ` +
              `Depois desta leva, gere mais ${-sobra} para fechar (ou baixe o ` +
              `campo "Perguntas" para ${total}).`,
            confirmar: `Gerar ${quantidade} agora`,
            perigo: false,
          }
        : null;

  return (
    <form
      action={action}
      // Bate exatamente com o configurado: não há o que perguntar.
      onSubmit={pedido ? confirmarEnvio(pedido) : undefined}
      className="mt-3 flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="rodada_id" value={rodadaId} />
      <div className="w-40">
        <label
          htmlFor="qtd-ia"
          className="mb-1 block text-xs font-medium text-slate-600"
        >
          Quantas gerar agora
        </label>
        <select
          id="qtd-ia"
          name="quantidade"
          value={quantidade}
          onChange={(e) => setQuantidade(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-200 p-2 text-base focus:border-primary focus:outline-none"
        >
          {Array.from({ length: MAXIMO_POR_VEZ }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} pergunta{n > 1 ? "s" : ""}
              {n === faltam ? " — completa a rodada" : ""}
            </option>
          ))}
        </select>
      </div>
      <BotaoEnviar
        textoEnviando="Lendo o padrão e escrevendo..."
        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
      >
        Gerar
      </BotaoEnviar>

      {/* O mesmo aviso da confirmação, visível antes do clique: quem já
          leu aqui não precisa da caixa para decidir. */}
      <p className="w-full text-xs text-slate-600">
        {sobra === 0
          ? `Fecha a rodada: ${total} de ${configurado}.`
          : sobra > 0
            ? `Atenção: a rodada ficaria com ${total}, e ela está configurada para ${configurado}.`
            : `A rodada ficaria com ${total} de ${configurado} — faltariam ${-sobra}.`}
      </p>
    </form>
  );
}
