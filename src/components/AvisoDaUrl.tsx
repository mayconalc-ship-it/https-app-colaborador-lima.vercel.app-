"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/Toast";

/**
 * Transforma `?sucesso=` e `?erro=` em aviso flutuante.
 *
 * As ações de servidor voltam com a mensagem na URL, e a tela a desenha
 * num <p> colorido no TOPO. Em tela curta funciona. Em tela longa, não:
 * no Admin de Produtividade do Armazém são 1.700 linhas de formulário, e
 * quem cadastra um lembrete lá embaixo é devolvido para a mesma posição
 * com a confirmação a três mil pixels de distância. Da cadeira dele, nada
 * aconteceu -- e o passo seguinte é clicar de novo. Foi o que o dono
 * relatou em 03/09/2026 ("não inicia a tela quando salvar ou incluir").
 *
 * O toast já existia no app justamente para isto -- o comentário dele diz,
 * com todas as letras, "o aviso nascia fora da vista quando o formulário
 * era longo". Faltava ligar as ações de servidor nele.
 *
 * Rolar para o topo seria a outra saída, e é pior: tira a pessoa de onde
 * ela estava trabalhando para mostrar um recado de três palavras, e ela
 * tem de rolar de volta.
 *
 * A mensagem sai da URL depois de mostrada (replace, sem entrada nova no
 * histórico): senão ela voltaria a cada recarga, e o "Voltar" do
 * navegador reviveria um "Salvo!" de dez minutos atrás.
 */
export function AvisoDaUrl() {
  const params = useSearchParams();
  const router = useRouter();
  const caminho = usePathname();
  const toast = useToast();

  const sucesso = params.get("sucesso");
  const erro = params.get("erro");

  // O StrictMode roda o efeito duas vezes no desenvolvimento, e o React
  // pode reexecutá-lo numa renderização qualquer. Sem esta trava, o mesmo
  // "Salvo!" apareceria duplicado -- e o toast já não duplica textos
  // iguais, mas depender disso seria depender de um detalhe dele.
  const mostrado = useRef<string | null>(null);

  useEffect(() => {
    const chave = `${sucesso ?? ""}|${erro ?? ""}`;
    if (chave === "|" || mostrado.current === chave) return;
    mostrado.current = chave;

    if (erro) toast.erro(erro);
    else if (sucesso) toast.sucesso(sucesso);

    const limpos = new URLSearchParams(params.toString());
    limpos.delete("sucesso");
    limpos.delete("erro");
    const busca = limpos.toString();
    router.replace(busca ? `${caminho}?${busca}` : caminho, { scroll: false });
  }, [sucesso, erro, params, router, caminho, toast]);

  return null;
}
