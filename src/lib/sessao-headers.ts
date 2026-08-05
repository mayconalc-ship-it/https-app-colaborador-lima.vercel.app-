/**
 * Cabeçalho interno usado pelo proxy para informar à renderização qual
 * usuário já foi autenticado. Fica num arquivo próprio porque o proxy roda
 * no runtime de borda e não pode importar código de servidor.
 */
export const CABECALHO_USUARIO = "x-lima-usuario-id";
