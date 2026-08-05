export function somenteDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

export function cpfParaEmail(cpf: string) {
  return `${somenteDigitos(cpf)}@colaborador.limalog.internal`;
}
