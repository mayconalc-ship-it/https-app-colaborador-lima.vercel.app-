/**
 * OS TIPOS DA PRÉ-ROTA -- fora do arquivo de ações (23/09/2026).
 *
 * Um arquivo "use server" só pode exportar função assíncrona: cada export
 * vira uma ação registrada. Os tipos moravam em actions.ts e o compilador
 * tentava registrá-los como ação ("Export ClienteDaRota doesn't exist"),
 * o que quebrava a consulta no ar -- a tela ficava em "Consultando..."
 * para sempre. Tipo é coisa de compilação e mora aqui.
 */
import type { CidadeEntregas } from "@/lib/rotas";
import type { AvisoNaRota } from "@/lib/pdv-particularidades-server";
import type { ClienteDaRota } from "@/lib/clientes-do-mapa-server";

export type { ClienteDaRota };

export type RotaEncontrada = {
  data: string;
  mapa: string;
  /** O que o motorista precisa saber sobre os clientes desta rota. */
  avisos: AvisoNaRota[];
  precisaoDosAvisos: "cliente" | "regiao";
  veiculo: string | null;
  placa: string | null;
  motorista: string;
  kmPrev: number | null;
  tempoPrev: string | null;
  entregas: number | null;
  caixas: number | null;
  ocupacaoCaixas: number | null;
  peso: number | null;
  ocupacaoPeso: number | null;
  armazem: string | null;
  classificacao: string | null;
  cidades: CidadeEntregas[];
  /**
   * OS CLIENTES DO MAPA, pela base de clientes (11/09/2026, pedido do
   * dono). Vazio quando a pré-rota do dia não trouxe a lista de clientes
   * -- e aí a tela volta ao bloco de cidades de sempre.
   */
  clientes: ClienteDaRota[];
};

export type ResultadoConsulta =
  | { ok: true; rota: RotaEncontrada }
  | { ok: false; erro: string };
