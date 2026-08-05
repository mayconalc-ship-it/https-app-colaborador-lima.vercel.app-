export const SENHA_PADRAO = "Lima@123";

// A troca obrigatoria e marcada no user_metadata do proprio usuario, e nao
// numa tabela. Assim o proxy sabe se ja trocou sem precisar consultar o banco
// a cada requisicao.
export const CHAVE_SENHA_ALTERADA = "senha_alterada";

export function precisaTrocarSenha(
  metadata: Record<string, unknown> | undefined | null,
) {
  return metadata?.[CHAVE_SENHA_ALTERADA] !== true;
}

export function validarNovaSenha(senha: string, confirmacao: string) {
  if (senha.length < 6) {
    return "A senha deve ter pelo menos 6 caracteres.";
  }
  if (senha !== confirmacao) {
    return "As senhas não coincidem.";
  }
  if (senha === SENHA_PADRAO) {
    return "Escolha uma senha diferente da senha padrão.";
  }
  return null;
}
