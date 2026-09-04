"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirContextoCarretas } from "@/lib/carretas-server";
import { podeNoModulo, temAcessoModulo } from "@/lib/require-admin";
import { getRevendaId } from "@/lib/revendas";
import {
  MAX_ITENS_CONFERENCIA,
  ehUnidadeItem,
  quantidadeNaoNegativa,
  quantidadePositiva,
} from "@/lib/carretas";

function rota(id: string) {
  return `/carretas-conferencia/${id}`;
}

function erro(id: string, mensagem: string): never {
  redirect(`${rota(id)}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Cadastro rápido de empilhador, direto do "+" no campo da Conferência
 * (pedido do dono, 27/08/2026) -- mesma ideia do criarMotoristaRapido em
 * carretas-portaria/actions.ts. Quem tem acesso de conferência OU de
 * descarga pode cadastrar -- o campo empilhador aparece pros dois lados
 * eventualmente precisarem indicar quem descarregou.
 */
export async function criarEmpilhadorRapido(
  formData: FormData,
): Promise<{ ok: true; valor: string; rotulo: string } | { ok: false; erro: string }> {
  const [podeConferencia, podeDescarga] = await Promise.all([
    temAcessoModulo("carretas-conferencia"),
    temAcessoModulo("carretas-descarga"),
  ]);
  if (!podeConferencia && !podeDescarga) {
    return { ok: false, erro: "Sem permissão para cadastrar empilhador." };
  }
  const revendaId = await getRevendaId();
  if (!revendaId) return { ok: false, erro: "Você não está em nenhuma revenda." };

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { ok: false, erro: "Informe o nome do empilhador." };
  if (nome.split(/\s+/).filter(Boolean).length < 2) {
    return { ok: false, erro: "Informe o nome completo do empilhador." };
  }
  const cpf = String(formData.get("cpf") ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) return { ok: false, erro: "Informe um CPF válido, com 11 dígitos." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pa_empilhadores")
    .insert({ revenda_id: revendaId, nome, cpf })
    .select("nome")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, erro: "Já existe um empilhador cadastrado com esse nome." };
    return { ok: false, erro: `Não foi possível cadastrar: ${error.message}` };
  }

  // Empilhador é texto livre no item da conferência -- grava o nome.
  return { ok: true, valor: data.nome, rotulo: data.nome };
}

/**
 * Descarga e conferência são fases independentes (desde a 063) -- o
 * empilhador descarrega, o conferente confere o que chegou, e uma pode
 * começar sem a outra ter começado.
 *
 * Quem manda no destino da carreta é a DESCARGA (pedido do dono,
 * 27/08/2026): terminada a descarga o caminhão pode ir embora, e a
 * conferência do que chegou continua no chão do armazém depois. Segurar o
 * motorista esperando a contagem só queimaria pátio.
 *
 * Por isso a decisão do retorno virou um FATO à parte, que o conferente
 * registra assim que sabe -- e não mais o gatilho que finaliza. Ao fim da
 * descarga, o que já foi decidido é aplicado:
 *   vazia   -> finalizado
 *   com AG  -> em_carga (o empilhador carrega)
 *   nada    -> aguardando_retorno (a decisão ainda não veio)
 */
async function aplicarFimDaDescarga(
  supabase: Awaited<ReturnType<typeof createClient>>,
  atendimentoId: string,
  agora: string,
) {
  const { data } = await supabase
    .from("atendimentos_carretas")
    .select("tem_carga")
    .eq("id", atendimentoId)
    .maybeSingle();

  if (data?.tem_carga === true) {
    // Carregar só pode começar depois de terminar de descarregar, mesmo
    // que o conferente tenha decidido o retorno lá no começo.
    return supabase
      .from("atendimentos_carretas")
      .update({ status: "em_carga", inicio_carga_em: agora })
      .eq("id", atendimentoId);
  }
  if (data?.tem_carga === false) {
    return supabase
      .from("atendimentos_carretas")
      .update({ status: "finalizado", finalizacao_em: agora })
      .eq("id", atendimentoId);
  }
  return supabase
    .from("atendimentos_carretas")
    .update({ status: "aguardando_retorno" })
    .eq("id", atendimentoId);
}

/** O empilhador clica ao começar a tirar as caixas do caminhão. */
export async function iniciarDescarga(formData: FormData) {
  const { revendaId } = await exigirContextoCarretas("carretas-descarga", "/carretas-conferencia");
  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");

  const supabase = await createClient();
  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update({ inicio_descarga_em: new Date().toISOString(), status: "em_andamento" })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .is("inicio_descarga_em", null)
    .in("status", ["aguardando_conferente", "em_andamento"])
    .select("id");

  if (error) erro(atendimentoId, `Não foi possível iniciar a descarga: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "A descarga já foi iniciada por outra pessoa.");

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Descarga+iniciada`);
}

/** O empilhador clica ao terminar de tirar tudo do caminhão. */
export async function finalizarDescarga(formData: FormData) {
  const { revendaId } = await exigirContextoCarretas("carretas-descarga", "/carretas-conferencia");
  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");

  const agora = new Date().toISOString();
  const supabase = await createClient();
  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update({ fim_descarga_em: agora })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .not("inicio_descarga_em", "is", null)
    .is("fim_descarga_em", null)
    .select("id");

  if (error) erro(atendimentoId, `Não foi possível finalizar a descarga: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "A descarga já foi finalizada ou ainda não foi iniciada.");

  await aplicarFimDaDescarga(supabase, atendimentoId, agora);

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Descarga+finalizada`);
}

/**
 * O conferente clica ao começar a contar o que chegou no chão. Não mexe
 * na descarga: pode clicar antes, durante ou DEPOIS dela.
 *
 * O nome gravado aqui é PROVISÓRIO -- serve para a tela mostrar quem
 * está com a conferência na mão agora. Quem fica no registro é quem
 * LANÇAR a contagem (ver finalizarConferencia): abrir a tela é um toque,
 * e um toque por engano não pode assinar o trabalho de outra pessoa.
 *
 * "Depois" inclui o atendimento já encerrado: desde 27/08/2026 o ciclo
 * fecha no fim da descarga (o caminhão vai embora), e a contagem do que
 * chegou segue no chão do armazém. Aconteceu de verdade -- carreta
 * finalizada com a conferência por fazer, e sem jeito de lançar o tempo.
 * Por isso não há mais trava por status aqui.
 */
export async function iniciarConferencia(formData: FormData) {
  const { perfil, revendaId } = await exigirContextoCarretas("carretas-conferencia", "/carretas-conferencia");
  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");

  const supabase = await createClient();
  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update({
      inicio_conferencia_em: new Date().toISOString(),
      conferente_colaborador_id: perfil.id,
      conferente_nome: perfil.nome,
    })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .is("inicio_conferencia_em", null)
    .select("id");

  if (error) erro(atendimentoId, `Não foi possível iniciar a conferência: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "A conferência já foi iniciada por outra pessoa.");

  // Sai de "aguardando_conferente" só se ainda estiver lá. Um atendimento
  // já finalizado NÃO volta para "em_andamento" -- a carreta saiu, e
  // reabrir o ciclo estragaria o TMA que já foi apurado.
  await supabase
    .from("atendimentos_carretas")
    .update({ status: "em_andamento" })
    .eq("id", atendimentoId)
    .eq("status", "aguardando_conferente");

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Conferência+iniciada`);
}

/**
 * O conferente salva os itens contados e encerra a conferência. Cada
 * item grava quantidade RECEBIDA e quantidade AVARIADA (novo desde a
 * 063 -- antes só existia "quantidade"), pra dar o % de avaria do
 * atendimento na tela de finalizado.
 */
export async function finalizarConferencia(formData: FormData) {
  const { perfil, revendaId } = await exigirContextoCarretas("carretas-conferencia", "/carretas-conferencia");
  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");

  const produtoIds = formData.getAll("produto_id").map(String);
  const quantidades = formData.getAll("quantidade").map(String);
  const quantidadesAvariadas = formData.getAll("quantidade_avariada").map(String);
  const unidades = formData.getAll("unidade").map(String);
  const lotes = formData.getAll("lote").map(String);
  const validades = formData.getAll("validade").map(String);
  const empilhadores = formData.getAll("empilhador").map(String);

  if (produtoIds.length === 0) {
    erro(atendimentoId, "Adicione ao menos um item.");
  }
  // A mensagem diz QUAL item está sem produto. Antes era "adicione ao
  // menos um item com o produto escolhido" para qualquer caso -- e numa
  // conferência de onze itens isso mandava a pessoa procurar sozinha
  // qual deles ela esqueceu de escolher da lista. Agora o navegador
  // barra antes de chegar aqui (ver ComboboxProduto), mas a ação pode
  // ser chamada sem passar pela tela.
  const semProduto = produtoIds.findIndex((id) => !id);
  if (semProduto >= 0) {
    erro(
      atendimentoId,
      `O item ${semProduto + 1} está sem produto — é preciso TOCAR no produto na lista, não só digitar.`,
    );
  }
  if (produtoIds.length > MAX_ITENS_CONFERENCIA) {
    erro(
      atendimentoId,
      `Máximo de ${MAX_ITENS_CONFERENCIA} itens por conferência. Finalize esta e abra outra para o restante.`,
    );
  }

  const itens = produtoIds.map((produtoId, i) => {
    let quantidade: number;
    let quantidadeAvariada: number;
    try {
      quantidade = quantidadePositiva(quantidades[i]);
      quantidadeAvariada = quantidadeNaoNegativa(quantidadesAvariadas[i] || "0");
    } catch (e) {
      erro(atendimentoId, e instanceof Error ? e.message : "Quantidade inválida em um dos itens.");
    }
    if (quantidadeAvariada > quantidade) {
      erro(atendimentoId, "A quantidade avariada não pode ser maior que a recebida.");
    }
    const unidade = unidades[i];
    if (!ehUnidadeItem(unidade)) erro(atendimentoId, "Escolha a unidade (palete/caixa) de cada item.");
    // Lote e validade são OPCIONAIS desde 03/09/2026 (migration 095):
    // a operação não usa o lote, e há item que não vence -- destilado de
    // marketplace. Exigir a data obrigava a INVENTAR uma, e data
    // inventada entra no alerta de validade mínima: vira aviso de
    // vencimento para produto que não vence.
    //
    // Vazio vira null, e não string vazia: "não informado" e "informado
    // como nada" são coisas diferentes na hora de ler o histórico.
    const lote = (lotes[i] ?? "").trim() || null;
    const validade = (validades[i] ?? "").trim() || null;
    const empilhador = (empilhadores[i] ?? "").trim();
    if (!empilhador) erro(atendimentoId, "Informe o empilhador de cada item.");
    return { produtoId, quantidade, quantidadeAvariada, unidade, lote, validade, empilhador };
  });

  const supabase = await createClient();

  const { error: erroItens } = await supabase.from("atendimento_carretas_itens").insert(
    itens.map((i) => ({
      revenda_id: revendaId,
      atendimento_id: atendimentoId,
      produto_id: i.produtoId,
      quantidade: i.quantidade,
      quantidade_avariada: i.quantidadeAvariada,
      unidade: i.unidade,
      lote: i.lote,
      validade: i.validade,
      empilhador: i.empilhador,
    })),
  );
  if (erroItens) erro(atendimentoId, `Não foi possível salvar os itens: ${erroItens.message}`);

  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update({
      fim_conferencia_em: new Date().toISOString(),
      // O conferente do registro é QUEM LANÇOU a contagem, não quem
      // abriu a tela. Antes o nome era carimbado no "Conferir carga" e
      // nunca mais mexido: um toque por engano roubava o crédito de quem
      // fez o trabalho. Aconteceu de verdade -- a DT 740912 saiu no nome
      // de quem só abriu, e quem contou não aparecia em lugar nenhum.
      conferente_colaborador_id: perfil.id,
      conferente_nome: perfil.nome,
    })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .not("inicio_conferencia_em", "is", null)
    .is("fim_conferencia_em", null)
    .select("id");

  if (error) erro(atendimentoId, `Itens salvos, mas não foi possível finalizar a conferência: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "A conferência já foi finalizada ou ainda não foi iniciada.");

  // A conferência não mexe mais no destino da carreta -- quem manda nisso
  // é a descarga. Terminar a contagem depois que o caminhão já saiu é o
  // caso NORMAL agora, e não pode reabrir um atendimento finalizado.

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Conferência+finalizada`);
}

/**
 * O conferente informa se a carreta volta vazia ou carregada -- e, se
 * carregada, com qual destino e quais AGs.
 *
 * Desde 27/08/2026 (pedido do dono) isto é um FATO registrado assim que
 * ele sabe, normalmente logo na chegada, e não mais o botão que finaliza
 * o atendimento. Registrar cedo tem dois ganhos: o empilhador já enxerga
 * o que vai carregar enquanto descarrega, e ninguém fica esperando o fim
 * da conferência para saber o destino do caminhão.
 *
 * O status só anda quando a DESCARGA termina (ver aplicarFimDaDescarga).
 * A exceção é decidir DEPOIS que a descarga já acabou -- aí a transição
 * que ficou pendente acontece agora.
 */
export async function decidirRetorno(formData: FormData) {
  const { revendaId } = await exigirContextoCarretas("carretas-conferencia", "/carretas-conferencia");

  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");
  const retornaComAg = formData.get("retorno") === "com_ag";

  let destinoRetorno: string | null = null;
  let itensAg: { agId: string; quantidade: number }[] = [];

  if (retornaComAg) {
    destinoRetorno = String(formData.get("destino_retorno") ?? "").trim();
    if (!destinoRetorno) erro(atendimentoId, "Informe o destino da carreta.");

    const agIds = formData.getAll("ag_id").map(String);
    const quantidades = formData.getAll("ag_quantidade").map(String);
    if (agIds.length === 0 || agIds.some((v) => !v)) {
      erro(atendimentoId, "Escolha o AG de cada item.");
    }
    itensAg = agIds.map((agId, i) => {
      let quantidade: number;
      try {
        quantidade = quantidadePositiva(quantidades[i]);
      } catch {
        erro(atendimentoId, "Quantidade inválida em um dos itens de AG.");
      }
      return { agId, quantidade };
    });
  }

  const agora = new Date().toISOString();
  const supabase = await createClient();
  // Grava só a DECISÃO. Nada de status/finalização aqui -- quem aplica é
  // o fim da descarga. Aceita qualquer atendimento ainda em andamento e
  // que ninguém tenha decidido antes (`tem_carga is null` segura o clique
  // duplo e a corrida entre dois conferentes).
  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update({ retorno_decidido_em: agora, tem_carga: retornaComAg, destino_retorno: destinoRetorno })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .is("tem_carga", null)
    .in("status", ["aguardando_conferente", "em_andamento", "aguardando_retorno"])
    .select("id, fim_descarga_em");

  if (error) erro(atendimentoId, `Não foi possível confirmar o retorno: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "Este atendimento já foi atualizado por outra pessoa.");

  if (itensAg.length > 0) {
    const { error: erroAg } = await supabase.from("atendimento_carretas_ag_itens").insert(
      itensAg.map((i) => ({
        revenda_id: revendaId,
        atendimento_id: atendimentoId,
        ag_id: i.agId,
        quantidade: i.quantidade,
      })),
    );
    if (erroAg) erro(atendimentoId, `Retorno confirmado, mas os itens de AG falharam: ${erroAg.message}`);
  }

  // Decidiu depois que a descarga já tinha acabado: a transição que ficou
  // pendente naquele momento (aguardando_retorno) acontece agora.
  if (atualizado[0]?.fim_descarga_em) {
    await aplicarFimDaDescarga(supabase, atendimentoId, agora);
  }

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Retorno+confirmado`);
}

/**
 * A LIDERANÇA CORRIGE O AG DO RETORNO -- pedido do dono (05/09/2026):
 * "aconteceu de um conferente enviar a informação e estava incompleto.
 * Preciso editar para que possa aparecer para o empilhador a informação
 * correta."
 *
 * Até aqui o retorno era decidido UMA vez e só: `decidirRetorno` grava
 * com `.is("tem_carga", null)`, que trava o clique duplo e a corrida
 * entre dois conferentes -- e, sem querer, travava também o conserto. Um
 * item esquecido virava um empilhador carregando a carreta errada, sem
 * saída dentro do app.
 *
 * TRÊS COISAS QUE ESTA AÇÃO NÃO FAZ, e cada uma tem motivo:
 *
 * 1. Não muda vazia <-> com AG. Isso não é corrigir uma quantidade, é
 *    refazer a decisão: mudar para "vazia" apagaria a fase de carga com
 *    o empilhador já trabalhando nela, e o contrário criaria uma fase
 *    que a máquina de status não abriu. Quem precisa disso cancela o
 *    atendimento.
 * 2. Não mexe em atendimento FINALIZADO. Depois de finalizado a lista
 *    virou histórico do que saiu no caminhão; reescrevê-la seria mudar
 *    um fato passado, não corrigir uma instrução.
 * 3. Não apaga o rastro. Toda correção carimba quem, quando, e soma no
 *    contador -- duas correções no mesmo atendimento não são a mesma
 *    coisa que uma.
 */
export async function editarRetornoAg(formData: FormData) {
  // "excluir" é a ação de liderança do módulo, a mesma que destrava
  // sessão de abastecimento: corrigir o trabalho declarado por outra
  // pessoa não pode ficar com quem só tem acesso de execução.
  const { perfil, revendaId } = await exigirContextoCarretas(
    "carretas-conferencia",
    "/carretas-conferencia",
  );
  const podeCorrigir = await podeNoModulo("produtividade-armazem", "excluir");
  if (!podeCorrigir) {
    erro(
      String(formData.get("atendimento_id") ?? ""),
      "Só a liderança pode corrigir o AG do retorno.",
    );
  }

  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");

  const destinoRetorno = String(formData.get("destino_retorno") ?? "").trim();
  if (!destinoRetorno) erro(atendimentoId, "Informe o destino da carreta.");

  const agIds = formData.getAll("ag_id").map(String).filter(Boolean);
  const quantidades = formData.getAll("ag_quantidade").map(String);
  if (agIds.length === 0) erro(atendimentoId, "A carreta volta com AG: informe ao menos um item.");

  const itensAg = agIds.map((agId, i) => {
    let quantidade: number;
    try {
      quantidade = quantidadePositiva(quantidades[i]);
    } catch {
      erro(atendimentoId, "Quantidade inválida em um dos itens de AG.");
    }
    return { agId, quantidade };
  });

  const supabase = await createClient();

  // Só atendimento que JÁ foi decidido como "com AG" e que ainda não
  // acabou. As duas condições vão na consulta, e não num if depois de
  // ler: entre ler e escrever, o empilhador pode ter finalizado.
  const { data: atual, error: erroLeitura } = await supabase
    .from("atendimentos_carretas")
    .select("id, retorno_edicoes")
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .eq("tem_carga", true)
    .neq("status", "finalizado")
    .maybeSingle();

  if (erroLeitura) erro(atendimentoId, `Não foi possível ler o atendimento: ${erroLeitura.message}`);
  if (!atual) {
    erro(
      atendimentoId,
      "Só dá para corrigir um atendimento que volta com AG e ainda não foi finalizado.",
    );
  }

  const agora = new Date().toISOString();

  // A lista NOVA substitui a antiga inteira. Casar item a item exigiria
  // um id estável por linha que a tela não tem, e "corrigir" aqui quase
  // sempre é acrescentar o que faltou -- reescrever é o que a pessoa
  // espera ao salvar o formulário que está vendo.
  const { error: erroApagar } = await supabase
    .from("atendimento_carretas_ag_itens")
    .delete()
    .eq("atendimento_id", atendimentoId)
    .eq("revenda_id", revendaId);
  if (erroApagar) erro(atendimentoId, `Não foi possível atualizar os itens: ${erroApagar.message}`);

  const { error: erroInserir } = await supabase.from("atendimento_carretas_ag_itens").insert(
    itensAg.map((i) => ({
      revenda_id: revendaId,
      atendimento_id: atendimentoId,
      ag_id: i.agId,
      quantidade: i.quantidade,
    })),
  );
  if (erroInserir) erro(atendimentoId, `Não foi possível gravar os itens: ${erroInserir.message}`);

  const { error: erroCarimbo } = await supabase
    .from("atendimentos_carretas")
    .update({
      destino_retorno: destinoRetorno,
      retorno_editado_em: agora,
      retorno_editado_por_id: perfil.id,
      // O NOME junto do id: se a pessoa sair da revenda, o histórico
      // continua dizendo quem mandou carregar aquilo.
      retorno_editado_por_nome: perfil.nome,
      retorno_edicoes: (atual.retorno_edicoes ?? 0) + 1,
    })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId);
  if (erroCarimbo) erro(atendimentoId, `Itens salvos, mas o registro da edição falhou: ${erroCarimbo.message}`);

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=AG+do+retorno+corrigido`);
}

export async function concluirCarga(formData: FormData) {
  const { revendaId } = await exigirContextoCarretas("carretas-descarga", "/carretas-conferencia");

  const atendimentoId = String(formData.get("atendimento_id") ?? "");
  if (!atendimentoId) erro(atendimentoId, "Atendimento inválido.");

  const agora = new Date().toISOString();
  const supabase = await createClient();
  const { data: atualizado, error } = await supabase
    .from("atendimentos_carretas")
    .update({ fim_carga_em: agora, finalizacao_em: agora, status: "finalizado" })
    .eq("id", atendimentoId)
    .eq("revenda_id", revendaId)
    .eq("status", "em_carga")
    .select("id");

  if (error) erro(atendimentoId, `Não foi possível concluir a carga: ${error.message}`);
  if (!atualizado || atualizado.length === 0) erro(atendimentoId, "Este atendimento já foi atualizado por outra pessoa.");

  revalidatePath(rota(atendimentoId));
  revalidatePath("/carretas-conferencia");
  redirect(`${rota(atendimentoId)}?sucesso=Atendimento+finalizado`);
}
