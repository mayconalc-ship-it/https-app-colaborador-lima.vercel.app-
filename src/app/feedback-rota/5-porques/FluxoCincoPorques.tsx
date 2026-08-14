"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SelecaoProblema } from "./SelecaoProblema";
import { AnaliseCincoPorques } from "./AnaliseCincoPorques";
import type { ArvoreDecisao } from "@/lib/cinco-porques-ia";

type AnaliseIniciada = {
  analiseId: number;
  problemaLabel: string;
  arvore: ArvoreDecisao;
};

/**
 * Dono do estado do fluxo inteiro: escolha do problema -> árvore -> wizard.
 * Fica num componente só para "Refazer análise" poder voltar para a
 * seleção de problema sem precisar de navegação (router.push perderia o
 * fluxo de useTransition otimista das telas seguintes).
 */
export function FluxoCincoPorques() {
  const [iniciada, setIniciada] = useState<AnaliseIniciada | null>(null);
  const [chave, setChave] = useState(0);

  if (!iniciada) {
    return (
      <div>
        <PageHeader
          title="🧠 Analisar problema"
          subtitle="O que aconteceu na rota? Vamos te ajudar a encontrar a causa."
        />
        <SelecaoProblema onIniciar={setIniciada} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="🧠 Analisar problema" subtitle={iniciada.problemaLabel} />
      <AnaliseCincoPorques
        key={chave}
        analiseId={iniciada.analiseId}
        problemaLabel={iniciada.problemaLabel}
        arvoreInicial={iniciada.arvore}
        onRefazer={() => {
          setChave((c) => c + 1);
          setIniciada(null);
        }}
      />
    </div>
  );
}
