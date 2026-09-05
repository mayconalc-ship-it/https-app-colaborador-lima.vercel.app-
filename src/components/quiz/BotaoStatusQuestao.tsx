"use client";

import { useOptimistic, useTransition } from "react";

/**
 * Ligar/desligar a pergunta -- respondendo NA HORA.
 *
 * O bug (relatado pelo dono em 05/09/2026): "ao desativar uma pergunta,
 * ela fica rodando 'carregando' e não aparece como desativado; após
 * clicar em tirar da rodada e cancelar ele retorna com o status de
 * desativada".
 *
 * A ação sempre funcionou -- o banco era atualizado no primeiro clique.
 * O que faltava era a tela. Esta é a única ação da página que não
 * termina em `redirect`, e isso é de propósito: desativar é feito em
 * série descendo a lista, e cada redirect jogava a página de volta ao
 * topo. O preço escondido era este: sem redirect, a confirmação depende
 * do `revalidatePath`, que RE-RENDERIZA A PÁGINA INTEIRA -- e esta
 * página monta questões, alternativas, banco, padrões, classificação e
 * indicadores. Enquanto isso tudo volta do servidor, o botão fica na
 * rodinha e a etiqueta "Desativada" não existe ainda. Em produção, com
 * a latência do banco no meio, a espera passa de dez segundos e lê como
 * travado. Cancelar o outro diálogo forçava um novo render, e aí o
 * estado que já tinha chegado aparecia -- o "ele retorna com o status de
 * desativada" do relato.
 *
 * `useOptimistic` inverte a ordem: a etiqueta e o botão trocam no clique,
 * e o servidor confirma depois, quando puder. Se a ação falhar, o React
 * devolve o valor real sozinho -- a tela nunca mente por mais tempo do
 * que a ação demora.
 *
 * A ETIQUETA "Desativada" MORA AQUI, e não na página, porque é ela que
 * precisa trocar junto com o botão. Renderizada no servidor, ela ficaria
 * um render atrás -- exatamente o defeito que este componente conserta.
 */
export function BotaoStatusQuestao({
  acao,
  rodadaId,
  questaoId,
  status,
}: {
  acao: (formData: FormData) => Promise<void> | void;
  rodadaId: number;
  questaoId: number;
  status: string;
}) {
  const [mostrado, marcarOtimista] = useOptimistic(status);
  const [pendente, iniciarTransicao] = useTransition();

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
      await acao(dados);
    });
  }

  return (
    <>
      {!ativa && (
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
          Desativada
        </span>
      )}
      <button
        type="button"
        onClick={alternar}
        // Só o cursor muda enquanto o servidor confirma. Desligar o botão
        // aqui seria voltar ao problema: quem desativa em série clica na
        // próxima antes de a anterior terminar, e cada clique é numa
        // pergunta diferente.
        aria-busy={pendente}
        title={
          ativa
            ? "Tira a pergunta de circulação em rodadas futuras, sem apagar. Ela continua no banco e pode ser reativada depois."
            : "Volta a pergunta a ficar disponível para novas rodadas."
        }
        className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors ${
          ativa
            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
            : "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
        } ${pendente ? "opacity-70" : ""}`}
      >
        {ativa ? "🚫 Desativar" : "✅ Ativar"}
      </button>
    </>
  );
}
