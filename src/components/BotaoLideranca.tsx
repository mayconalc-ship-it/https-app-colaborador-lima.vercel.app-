import { getPerfil } from "@/lib/sessao";
import { getConcessoes } from "@/lib/concessoes";
import { ehOwner, temAlgumAcesso } from "@/lib/acessos";
import { BotaoLiderancaCliente } from "@/components/BotaoLiderancaCliente";

/**
 * A porta do Modo Liderança, no topo do app -- a de entrada e a de saída,
 * sempre no mesmo lugar.
 *
 * Só aparece para quem tem ALGUMA coisa liberada. Ter o papel de liderança
 * não basta: uma liderança sem nenhuma permissão continua vendo o app como
 * qualquer colaborador -- e é assim que deve ser, porque não haveria nada
 * para ela fazer do outro lado.
 */
export async function BotaoLideranca() {
  const perfil = await getPerfil();
  if (!perfil) return null;

  const concessoes = await getConcessoes();
  if (!temAlgumAcesso(perfil.role, concessoes)) return null;

  return <BotaoLiderancaCliente dono={ehOwner(perfil.role)} />;
}
