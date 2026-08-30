/**
 * ESTOQUE DE GÁS P20
 *
 * Na troca, o empilhador conta os botijões do depósito -- cheios e
 * vazios. Caindo ao mínimo, o app acende um alerta com o telefone do
 * fornecedor para ele mesmo ligar, e avisa a liderança escolhida.
 *
 * Só a regra aqui, sem banco e sem React.
 */

/** O padrão pedido pelo dono. A régua de verdade mora em
 *  pa_empilhadeira_config.estoque_minimo_p20, editável no Admin. */
export const ESTOQUE_MINIMO_PADRAO = 2;

/**
 * O estoque pede reposição?
 *
 * `null` não dispara: troca antiga não tem contagem, e tratar ausência
 * como zero acenderia alerta retroativo para todo mundo.
 */
export function precisaPedirGas(cheios: number | null, minimo: number): boolean {
  if (cheios === null) return false;
  return cheios <= minimo;
}

export type UrgenciaGas = "critico" | "baixo";

/** Zero cheio é parada de operação, não aviso -- e a tela precisa
 *  conseguir gritar mais alto nesse caso. */
export function urgenciaDoEstoque(cheios: number): UrgenciaGas {
  return cheios === 0 ? "critico" : "baixo";
}

export function textoDoAlerta(cheios: number): { titulo: string; mensagem: string } {
  if (cheios === 0) {
    return {
      titulo: "🔴 Acabou o gás P20",
      mensagem: "Não há nenhum botijão cheio no estoque. Ligue para o fornecedor agora.",
    };
  }
  return {
    titulo: "🟠 Gás P20 acabando",
    mensagem:
      cheios === 1
        ? "Resta 1 botijão cheio no estoque. Ligue para o fornecedor."
        : `Restam ${cheios} botijões cheios no estoque. Ligue para o fornecedor.`,
  };
}

/**
 * Telefone só com dígitos, para virar link de ligação.
 *
 * `null` quando não dá para discar -- aí a tela mostra o número como
 * texto em vez de um link que não faz nada, que é pior do que não ter
 * link nenhum.
 */
export function telefoneParaLink(bruto: string | null | undefined): string | null {
  const digitos = String(bruto ?? "").replace(/\D/g, "");
  // 8 dígitos é o menor telefone fixo sem DDD que ainda disca.
  if (digitos.length < 8) return null;
  return digitos;
}

/**
 * "(77) 99999-8888" a partir de 11 ou 10 dígitos; devolve o original
 * quando não reconhece, em vez de estragar um número válido.
 *
 * Número começando em ZERO passa intacto: 0800 tem 11 dígitos e cairia
 * na regra do celular, virando "(08) 00111-2222" na tela. DDD brasileiro
 * nunca começa com zero, então esse é o corte certo -- e 0800 de
 * fornecedor é comum demais para quebrar.
 */
export function formatarTelefone(bruto: string | null | undefined): string {
  const t = String(bruto ?? "").trim();
  const d = t.replace(/\D/g, "");
  if (d.startsWith("0")) return t;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

/** Há quanto tempo o pedido está aberto, em texto curto. Serve para o
 *  alerta ficar mais constrangedor quanto mais tempo passa. */
export function tempoAberto(desdeISO: string, agora = new Date()): string {
  const minutos = Math.max((agora.getTime() - new Date(desdeISO).getTime()) / 60_000, 0);
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const horas = minutos / 60;
  if (horas < 24) {
    const h = Math.floor(horas);
    const m = Math.round(minutos % 60);
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  }
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}
