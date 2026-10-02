/**
 * O que uma ação "no lugar" devolve: deu certo (com a frase para o aviso)
 * ou não deu (com o motivo). Ver components/FormNoLugar.
 *
 * Fica fora dos arquivos "use server" para poder ser importado dos dois
 * lados -- a ação monta, o formulário lê.
 */
export type ResultadoAcao =
  | {
      ok: true;
      mensagem: string;
      /** Deu certo E a tela é outra -- criar a rodada leva à página dela. */
      irPara?: string;
    }
  | { ok: false; erro: string };

export const deuCerto = (mensagem: string, irPara?: string): ResultadoAcao => ({ ok: true, mensagem, irPara });
export const deuErrado = (erro: string): ResultadoAcao => ({ ok: false, erro });
