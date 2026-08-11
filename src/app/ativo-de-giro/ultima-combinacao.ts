import "server-only";
import { cookies } from "next/headers";
import {
  COMBINACAO_PADRAO,
  ehFormato,
  ehStatus,
  ehTipo,
  type Combinacao,
} from "@/lib/ativo-giro";

/**
 * A última combinação lançada neste aparelho, para o formulário reabrir
 * já nela em vez de sempre no padrão.
 *
 * Tudo é validado na volta: o cookie não é httpOnly (nada aqui é
 * segredo), então qualquer valor pode chegar torto. Um cookie adulterado
 * no máximo faz o formulário abrir no padrão -- a ação que grava confere
 * os campos de novo, então isto aqui não decide nada sobre o que entra
 * no banco.
 */
export async function getUltimaCombinacao(): Promise<Combinacao> {
  const bruto = (await cookies()).get("ag_ultima")?.value;
  if (!bruto) return COMBINACAO_PADRAO;

  try {
    const v = JSON.parse(bruto);
    if (ehTipo(v?.tipo) && ehFormato(v?.formato) && ehStatus(v?.status)) {
      return { tipo: v.tipo, formato: v.formato, status: v.status };
    }
  } catch {
    // JSON quebrado: cai no padrão, sem barulho.
  }

  return COMBINACAO_PADRAO;
}
