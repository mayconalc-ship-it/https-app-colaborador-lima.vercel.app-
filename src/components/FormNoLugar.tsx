"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { useConfirmacao } from "@/components/Confirmacao";
import { EnviandoNoLugar } from "@/components/EnviandoNoLugar";
import type { ResultadoAcao } from "@/lib/resultado-acao";


/**
 * FORMULÁRIO QUE SALVA SEM SAIR DO LUGAR (02/10/2026).
 *
 * Pedido do dono: "revise todos botões de salvar, precisa trazer a
 * informação que foi salvo ou deu erro e permanecer ali no mesmo lugar,
 * sem subir a tela". Toda ação terminava em `redirect(?sucesso=...)`, e
 * redirect é navegação: a página voltava ao topo e o aviso verde aparecia
 * lá em cima, longe de quem tinha acabado de salvar a pergunta 12.
 *
 * Aqui a ação DEVOLVE o resultado em vez de redirecionar. O aviso sai no
 * rodapé (Toast), perto do polegar, e `router.refresh()` traz os dados
 * novos sem mexer na rolagem.
 *
 * Por que `onSubmit` e não `<form action>`: com `action`, o React limpa o
 * formulário quando a ação termina -- e no erro de validação a pessoa
 * perderia tudo o que digitou na pergunta. Aqui só limpa quem pedir
 * (`limparAoSalvar`), e só quando deu certo.
 */
export function FormNoLugar({
  acao,
  children,
  className,
  confirmacao,
  limparAoSalvar = false,
  fecharAoSalvar = false,
  aoSalvar,
}: {
  acao: (formData: FormData) => Promise<ResultadoAcao>;
  children: React.ReactNode;
  className?: string;
  /** Pergunta antes de enviar (excluir, publicar, encerrar). */
  confirmacao?: { titulo: string; detalhe?: string; confirmar?: string; perigo?: boolean };
  /** Volta os campos ao vazio depois de salvar -- é o "Nova pergunta". */
  limparAoSalvar?: boolean;
  /** Fecha a sanfona (<details>) em que o formulário mora. */
  fecharAoSalvar?: boolean;
  aoSalvar?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmar = useConfirmacao();
  const [enviando, iniciar] = useTransition();

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    const form = e.currentTarget;
    // Lido ANTES de qualquer espera: depois do diálogo de confirmação o
    // formulário ainda existe, mas é o que estava na tela no clique que vale.
    const dados = new FormData(form);

    if (confirmacao && !(await confirmar(confirmacao))) return;

    iniciar(async () => {
      let r: ResultadoAcao | undefined;
      try {
        r = await acao(dados);
      } catch {
        // Queda de rede, servidor fora: a pessoa precisa saber que NÃO salvou.
        toast.erro("Não foi possível salvar agora. Confira a conexão e tente de novo.");
        return;
      }
      // Sem resultado é a trava da ação mandando para outra tela (sessão
      // vencida, sem permissão): o roteador já está navegando.
      if (!r) return;
      if (!r.ok) {
        toast.erro(r.erro);
        return;
      }
      toast.sucesso(r.mensagem);
      if (r.irPara) {
        router.push(r.irPara);
        return;
      }
      if (limparAoSalvar) form.reset();
      if (fecharAoSalvar) form.closest("details")?.removeAttribute("open");
      aoSalvar?.();
      router.refresh();
    });
  }

  return (
    <EnviandoNoLugar.Provider value={enviando}>
      <form onSubmit={enviar} className={className} aria-busy={enviando}>
        {children}
      </form>
    </EnviandoNoLugar.Provider>
  );
}
