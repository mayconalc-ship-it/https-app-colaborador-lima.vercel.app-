"use client";

import { useOptimistic, useTransition } from "react";
import { useToast } from "@/components/Toast";
import type { ResultadoAcao } from "@/lib/resultado-acao";

/**
 * Ligar/desligar a pergunta -- UM BOTÃO SÓ, que mostra o ESTADO.
 *
 * Pedido do dono (02/10/2026): "ao desativar uma pergunta, deixe que ela
 * está em um único botão desativada, e para ativar precisa clicar nesse
 * mesmo botão". Antes eram duas coisas lado a lado: a etiqueta cinza
 * "Desativada" e um botão "✅ Ativar". O botão falava da AÇÃO e a
 * etiqueta do ESTADO -- e quem descia a lista conferindo lia "Ativar"
 * numa pergunta e achava que ela estava ativa.
 *
 * Agora o botão diz como a pergunta ESTÁ ("✅ Ativa" / "🚫 Desativada"),
 * com a cor do estado, e o toque troca. É o interruptor de parede: o que
 * se vê é a posição, e mudar é apertar o mesmo lugar.
 *
 * A resposta continua OTIMISTA (05/09/2026): o botão troca no toque e o
 * servidor confirma depois. Se falhar, o React volta o valor real e o
 * aviso do rodapé diz que não deu.
 */
export function BotaoStatusQuestao({
  acao,
  rodadaId,
  questaoId,
  status,
}: {
  acao: (formData: FormData) => Promise<ResultadoAcao>;
  rodadaId: number;
  questaoId: number;
  status: string;
}) {
  const [mostrado, marcarOtimista] = useOptimistic(status);
  const [pendente, iniciarTransicao] = useTransition();
  const toast = useToast();

  const ativa = mostrado === "ativa";

  function alternar() {
    iniciarTransicao(async () => {
      marcarOtimista(ativa ? "inativa" : "ativa");
      const dados = new FormData();
      dados.set("rodada_id", String(rodadaId));
      dados.set("questao_id", String(questaoId));
      // O servidor recebe o status ATUAL e inverte -- mesmo contrato de
      // antes, para não haver duas regras de inversão em lugares
      // diferentes.
      dados.set("status", status);
      try {
        const r = await acao(dados);
        if (r && !r.ok) toast.erro(r.erro);
        else if (r) toast.sucesso(r.mensagem);
      } catch {
        toast.erro("Não foi possível mudar a pergunta agora. Confira a conexão e tente de novo.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={alternar}
      role="switch"
      aria-checked={ativa}
      // Só o cursor muda enquanto o servidor confirma. Desligar o botão
      // aqui seria voltar ao problema: quem desativa em série clica na
      // próxima antes de a anterior terminar.
      aria-busy={pendente}
      title={
        ativa
          ? "Pergunta ativa. Toque para desativar: ela sai de circulação nas próximas rodadas, sem ser apagada."
          : "Pergunta desativada. Toque para ativar de novo."
      }
      className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${
        ativa
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
          : "border-slate-300 bg-slate-200 text-slate-700 hover:bg-slate-300"
      } ${pendente ? "opacity-70" : ""}`}
    >
      {ativa ? "✅ Ativa" : "🚫 Desativada"}
    </button>
  );
}
