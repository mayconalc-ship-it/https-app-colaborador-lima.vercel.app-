/**
 * ESTOQUE DE GÁS P20 -- o lado que fala com o banco.
 *
 * A regra pura (quando pedir, como escrever o aviso) mora em
 * `lib/gas-p20.ts`. Aqui só a leitura da config, a abertura do pedido e o
 * disparo do aviso.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import {
  ESTOQUE_MINIMO_PADRAO,
  precisaPedirGas,
  textoDoAlerta,
  formatarTelefone,
} from "@/lib/gas-p20";

export const ROTA_GAS = "/produtividade-armazem/empilhadeira";

export type ConfigDeGas = {
  estoqueMinimo: number;
  fornecedorNome: string | null;
  fornecedorTelefone: string | null;
  custoP20: number | null;
};

export type PedidoDeGas = {
  id: string;
  botijoesCheios: number;
  botijoesVazios: number | null;
  abertoEm: string;
  abertoPorNome: string | null;
};

/** A config nunca falta: sem linha na tabela, vale o padrão. Uma tela que
 *  some porque o Admin não cadastrou nada é pior que um padrão. */
export async function lerConfigDeGas(revendaId: string): Promise<ConfigDeGas> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pa_empilhadeira_config")
    .select("estoque_minimo_p20, fornecedor_nome, fornecedor_telefone, custo_p20")
    .eq("revenda_id", revendaId)
    .maybeSingle();

  return {
    estoqueMinimo: data?.estoque_minimo_p20 ?? ESTOQUE_MINIMO_PADRAO,
    fornecedorNome: data?.fornecedor_nome ?? null,
    fornecedorTelefone: data?.fornecedor_telefone ?? null,
    custoP20: data?.custo_p20 ?? null,
  };
}

/** O pedido em aberto da revenda, ou null. É ele que segura o alerta na
 *  tela até alguém confirmar que ligou para o fornecedor. */
export async function pedidoDeGasAberto(revendaId: string): Promise<PedidoDeGas | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pa_gas_pedidos")
    .select("id, botijoes_cheios, botijoes_vazios, aberto_em, aberto_por_nome")
    .eq("revenda_id", revendaId)
    .is("confirmado_em", null)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id as string,
    botijoesCheios: Number(data.botijoes_cheios),
    botijoesVazios: data.botijoes_vazios === null ? null : Number(data.botijoes_vazios),
    abertoEm: data.aberto_em as string,
    abertoPorNome: (data.aberto_por_nome as string) ?? null,
  };
}

/** Quem a liderança escolheu no Admin para receber o aviso de gás. */
export async function lerNotificadosDeGas(revendaId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pa_gas_notificados")
    .select("colaborador_id")
    .eq("revenda_id", revendaId);
  return (data ?? []).map((l) => l.colaborador_id as string);
}

/**
 * Depois de uma troca, decide se o estoque acende o alerta.
 *
 * Sem contagem (`null`) não faz nada: troca lançada antes de o campo
 * existir não pode disparar alerta retroativo.
 *
 * Um pedido por vez. Se já há um aberto, ele NÃO vira um segundo -- só
 * atualiza a contagem, para o alerta mostrar o número de agora. Repetir o
 * push a cada troca com estoque baixo transformaria o aviso em ruído, que
 * é exatamente como um alerta morre.
 */
export async function avaliarEstoqueDeGas(opcoes: {
  revendaId: string;
  trocaId: string | null;
  cheios: number | null;
  vazios: number | null;
  operadorId: string;
  operadorNome: string;
}): Promise<void> {
  const { revendaId, trocaId, cheios, vazios, operadorId, operadorNome } = opcoes;

  const config = await lerConfigDeGas(revendaId);
  if (!precisaPedirGas(cheios, config.estoqueMinimo)) return;
  const nivel = cheios as number;

  const admin = createAdminClient();

  const { data: jaAberto } = await admin
    .from("pa_gas_pedidos")
    .select("id")
    .eq("revenda_id", revendaId)
    .is("confirmado_em", null)
    .maybeSingle();

  if (jaAberto) {
    // Só atualiza a foto do estoque -- sem novo push.
    await admin
      .from("pa_gas_pedidos")
      .update({ botijoes_cheios: nivel, botijoes_vazios: vazios, troca_id: trocaId })
      .eq("id", jaAberto.id);
    return;
  }

  const { error } = await admin.from("pa_gas_pedidos").insert({
    revenda_id: revendaId,
    troca_id: trocaId,
    botijoes_cheios: nivel,
    botijoes_vazios: vazios,
    aberto_por: operadorId,
    aberto_por_nome: operadorNome,
  });

  // 23505 = o índice único pegou uma corrida entre duas trocas quase
  // simultâneas. O outro pedido já está aberto; não é erro nem duplica.
  if (error) return;

  await avisarSobreGas({ revendaId, cheios: nivel, config, operadorId });
}

/**
 * O aviso. Vai para o empilhador que registrou a troca -- é ele quem liga
 * para o fornecedor -- e para a liderança escolhida no Admin.
 *
 * O telefone entra no texto do push de propósito: no celular, quem lê o
 * aviso já tem o número na mão sem precisar abrir o app.
 */
async function avisarSobreGas(opcoes: {
  revendaId: string;
  cheios: number;
  config: ConfigDeGas;
  operadorId: string;
}): Promise<void> {
  const { revendaId, cheios, config, operadorId } = opcoes;
  const { titulo, mensagem } = textoDoAlerta(cheios);

  const fornecedor = config.fornecedorNome
    ? `${config.fornecedorNome}${
        config.fornecedorTelefone ? ` — ${formatarTelefone(config.fornecedorTelefone)}` : ""
      }`
    : null;

  // Sem fornecedor cadastrado o aviso ainda vale -- ele só passa a pedir o
  // cadastro em vez de dar o número. Calar seria pior: o gás acaba igual.
  const completa = fornecedor
    ? `${mensagem} Fornecedor: ${fornecedor}.`
    : `${mensagem} Nenhum fornecedor cadastrado — avise a liderança.`;

  const admin = createAdminClient();
  const { data: lideres } = await admin
    .from("pa_gas_notificados")
    .select("colaborador_id")
    .eq("revenda_id", revendaId);

  const destinos = [...new Set([operadorId, ...(lideres ?? []).map((l) => l.colaborador_id as string)])];

  await Promise.all(
    destinos.map((id) =>
      criarNotificacao({
        modulo: "produtividade-armazem",
        tipo: "importante",
        titulo,
        mensagem: completa,
        url: ROTA_GAS,
        destinatarioId: id,
        revendaId,
      }),
    ),
  );

  await enviarPushDaRevenda(revendaId, {
    modulo: "produtividade-armazem",
    titulo,
    mensagem: completa,
    url: ROTA_GAS,
    apenas: destinos,
  });
}
