"use client";

import { useRef, useState } from "react";
import { formatarDiaEHora } from "@/lib/comunicados";

/**
 * Quanto tempo o botão fica dizendo "baixando".
 *
 * Não é o tempo real do download -- não dá para saber daqui quando o
 * sistema terminou. É o tempo em que o botão para de aceitar toque, que
 * é o problema que ele resolve.
 */
const ESPERA_MS = 6000;

/**
 * O "reloginho": leva a data marcada para o calendário do celular.
 *
 * Âncora comum apontando para um arquivo .ics (ver
 * /api/comunicados/[id]/agenda). É o próprio sistema do telefone que abre
 * o calendário -- Android e iPhone, sem instalar nada, sem conta de
 * Google e sem permissão para pedir.
 *
 * O JS aqui NÃO faz o download; ele só dá notícia. O primeiro toque segue
 * o caminho nativo da âncora, sem `preventDefault` -- interceptar isso
 * quebraria justamente a parte que funciona.
 *
 * Por que existe: no primeiro teste em celular de verdade, o toque baixava
 * o arquivo e só DEPOIS o Android abria a escolha do calendário. No meio
 * havia um silêncio de alguns segundos com o botão parecendo morto, e a
 * reação natural foi tocar de novo -- dois downloads, duas caixas de
 * diálogo, cara de bug. O botão não avisava nem que ia baixar nem que
 * estava baixando.
 *
 * Então ele passou a fazer as duas coisas: dizer ANTES o que vai
 * acontecer, e recusar o segundo toque enquanto o primeiro está em
 * andamento.
 *
 * Tocar duas vezes assim mesmo não duplica compromisso: o UID do evento é
 * fixo por comunicado, então o calendário ATUALIZA em vez de criar outro.
 * A trava é contra a confusão, não contra a duplicidade.
 */
export function BotaoAgenda({
  comunicadoId,
  quando,
  compacto = false,
}: {
  comunicadoId: number;
  quando: string;
  /** Versão etiqueta, para a lista do Modo Liderança. */
  compacto?: boolean;
}) {
  const [baixando, setBaixando] = useState(false);
  const liberadoEm = useRef(0);

  function aoTocar(e: React.MouseEvent<HTMLAnchorElement>) {
    const agora = Date.now();

    // Segundo toque dentro da janela: engole. Sem isto, cada toque
    // extra vira mais um arquivo na pasta de downloads.
    if (agora < liberadoEm.current) {
      e.preventDefault();
      return;
    }

    liberadoEm.current = agora + ESPERA_MS;
    setBaixando(true);
    setTimeout(() => setBaixando(false), ESPERA_MS);
  }

  const comum = {
    href: `/api/comunicados/${comunicadoId}/agenda`,
    // O download explícito é o que faz o Android tratar o arquivo como
    // convite em vez de abrir texto cru numa aba.
    download: `comunicado-${comunicadoId}.ics`,
    onClick: aoTocar,
    "aria-live": "polite" as const,
  };

  if (compacto) {
    return (
      <a
        {...comum}
        title="Baixa um arquivo e o celular abre o calendário"
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          baixando
            ? "bg-amber-200 text-amber-900"
            : "bg-amber-100 text-amber-800 hover:bg-amber-200"
        }`}
      >
        {baixando ? (
          "⏳ baixando… abra o arquivo"
        ) : (
          <>🔔 {formatarDiaEHora(quando)} · 📅 agenda</>
        )}
      </a>
    );
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <a
        {...comum}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
          baixando
            ? "bg-amber-200 text-amber-900"
            : "bg-amber-100 text-amber-900 hover:bg-amber-200"
        }`}
      >
        {baixando ? (
          <>⏳ Baixando… abra o arquivo para o calendário</>
        ) : (
          <>
            ⏰ {formatarDiaEHora(quando)}
            <span className="font-normal text-amber-700">
              · salvar no meu celular
            </span>
          </>
        )}
      </a>
      {/* Dizer ANTES o que o toque faz. O passo do download é do sistema,
          não dá para pular -- mas surpresa só existe quando ninguém
          avisou. */}
      {!baixando && (
        <span className="pl-3 text-[11px] text-slate-400">
          baixa um arquivo e o celular abre o calendário
        </span>
      )}
    </span>
  );
}
