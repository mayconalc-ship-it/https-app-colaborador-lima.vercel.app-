"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRevendaId } from "@/lib/revendas";
import { getPerfil } from "@/lib/sessao";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import { ehAreaValida, type AreaId } from "@/lib/areas";
import { hojeIso } from "@/lib/pesquisa";
import {
  getPessoasDaArea,
  getRodada,
  listarRodadas,
} from "@/lib/quiz-server";
import {
  gerarQuestoes,
  iaConfigurada,
  lerPadrao,
  mensagemDeErro,
  MODELO as MODELO_IA_QUIZ,
} from "@/lib/quiz-ia";
import { registrarUsoIA } from "@/lib/ia-uso";
import {
  MAX_PERGUNTAS,
  PERGUNTAS_PADRAO,
  PONTOS_POR_QUESTAO,
  comPosicao,
  nomeDoMes,
} from "@/lib/quiz";

/**
 * Administração do Desafio do Mês.
 *
 * Toda ação daqui começa igual: confere a permissão do módulo e descobre
 * a revenda. As duas coisas juntas são o que impede uma liderança de
 * Barreiras de mexer no campeonato de São Félix, mesmo sabendo o número
 * da rodada.
 */

const BASE = "/admin/quiz";

function texto(formData: FormData, campo: string) {
  return ((formData.get(campo) as string) ?? "").trim();
}

function numero(formData: FormData, campo: string) {
  return Number(formData.get(campo) ?? 0);
}

async function contexto(destino = BASE) {
  const revendaId = await getRevendaId();
  if (!revendaId) {
    redirect(`${destino}?erro=${encodeURIComponent("Você não está em nenhuma revenda.")}`);
  }
  return revendaId;
}

/**
 * A rodada existe E é desta revenda?
 *
 * A segunda metade é a que importa: sem ela, trocar o número na URL daria
 * acesso à rodada da outra unidade.
 */
async function rodadaDaRevenda(id: number, revendaId: string) {
  const rodada = await getRodada(id);
  if (!rodada || rodada.revendaId !== revendaId) {
    redirect(`${BASE}?erro=${encodeURIComponent("Rodada não encontrada.")}`);
  }
  return rodada;
}

// ---------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------

export async function salvarConfig(formData: FormData) {
  await requireModulo("quiz", "editar");
  const revendaId = await contexto();

  const posicoes = numero(formData, "posicoes_visiveis");
  if (!Number.isInteger(posicoes) || posicoes < 3 || posicoes > 50) {
    redirect(`${BASE}?erro=${encodeURIComponent("Escolha de 3 a 50 posições.")}`);
  }

  const admin = createAdminClient();
  await admin.from("quiz_config").upsert(
    {
      revenda_id: revendaId,
      posicoes_visiveis: posicoes,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id" },
  );

  revalidatePath("/desafio/classificacao");
  redirect(`${BASE}?sucesso=${encodeURIComponent("Classificação atualizada.")}`);
}

// ---------------------------------------------------------------------
// Rodadas
// ---------------------------------------------------------------------

export async function criarRodada(formData: FormData) {
  await requireModulo("quiz", "criar");
  const revendaId = await contexto();
  const perfil = await getPerfil();

  const area = texto(formData, "area");
  if (!ehAreaValida(area)) {
    redirect(`${BASE}?erro=${encodeURIComponent("Escolha a área do desafio.")}`);
  }

  const mes = numero(formData, "mes");
  const temporada = numero(formData, "temporada");
  const inicio = texto(formData, "inicio");
  const fim = texto(formData, "fim");
  const totalPerguntas = numero(formData, "total_perguntas") || PERGUNTAS_PADRAO;

  // O teto é conferido aqui, não só no <select>: quem chamar a ação por
  // fora do formulário passaria por cima do limite do campo.
  if (totalPerguntas < 1 || totalPerguntas > MAX_PERGUNTAS) {
    redirect(
      `${BASE}?erro=${encodeURIComponent(
        `A rodada pode ter de 1 a ${MAX_PERGUNTAS} perguntas.`,
      )}`,
    );
  }

  if (mes < 1 || mes > 12 || temporada < 2020 || temporada > 2100) {
    redirect(`${BASE}?erro=${encodeURIComponent("Mês ou ano inválido.")}`);
  }
  if (!inicio || !fim || fim < inicio) {
    redirect(`${BASE}?erro=${encodeURIComponent("O período está invertido ou incompleto.")}`);
  }

  const padraoId = numero(formData, "padrao_id");
  const admin = createAdminClient();

  // O nome do padrão é copiado para dentro da rodada: se o arquivo for
  // substituído no acervo, a rodada antiga continua sabendo dizer sobre
  // o que ela foi.
  let padraoNome: string | null = null;
  if (padraoId) {
    const { data } = await admin
      .from("padroes")
      .select("nome")
      .eq("id", padraoId)
      .eq("revenda_id", revendaId)
      .maybeSingle();
    padraoNome = data?.nome ?? null;
  }

  const nome =
    texto(formData, "nome") ||
    `Desafio de ${nomeDoMes(mes)} — ${area === "AL" ? "Armazém" : "Distribuição"}`;

  const { data: criada, error } = await admin
    .from("quiz_rodadas")
    .insert({
      revenda_id: revendaId,
      nome,
      temporada,
      mes,
      area,
      pilar: texto(formData, "pilar") || null,
      padrao_id: padraoId || null,
      padrao_nome: padraoNome,
      atividade: texto(formData, "atividade") || null,
      inicio,
      fim,
      total_perguntas: totalPerguntas,
      criado_por: perfil?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !criada) {
    redirect(`${BASE}?erro=${encodeURIComponent(error?.message ?? "Não foi possível criar.")}`);
  }

  redirect(`${BASE}/${criada.id}`);
}

export async function atualizarRodada(formData: FormData) {
  await requireModulo("quiz", "editar");
  const revendaId = await contexto();

  const id = numero(formData, "id");
  const rodada = await rodadaDaRevenda(id, revendaId);
  const destino = `${BASE}/${rodada.id}`;

  const inicio = texto(formData, "inicio");
  const fim = texto(formData, "fim");
  if (!inicio || !fim || fim < inicio) {
    redirect(`${destino}?erro=${encodeURIComponent("O período está invertido.")}`);
  }

  const totalPerguntas =
    numero(formData, "total_perguntas") || rodada.totalPerguntas;
  if (totalPerguntas < 1 || totalPerguntas > MAX_PERGUNTAS) {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        `A rodada pode ter de 1 a ${MAX_PERGUNTAS} perguntas.`,
      )}`,
    );
  }

  const admin = createAdminClient();

  /*
    O PADRÃO passa a ser editável (pedido do dono, 05/09/2026). Ele só
    existia na criação -- e a tela de geração mandava "defina em Editar
    dados da rodada", para um campo que não estava lá. Rodada criada sem
    padrão ficava sem saída a não ser recriar.

    Guarda o NOME junto do id, como a criação já faz: se o documento
    sair do acervo, a rodada continua dizendo de onde as perguntas
    vieram.
  */
  const padraoId = numero(formData, "padrao_id");
  let padraoNome: string | null = null;
  if (padraoId) {
    const { data } = await admin
      .from("padroes")
      .select("nome")
      .eq("id", padraoId)
      .eq("revenda_id", revendaId)
      .maybeSingle();
    if (!data) {
      redirect(
        `${destino}?erro=${encodeURIComponent(
          "Esse padrão não está no acervo desta revenda.",
        )}`,
      );
    }
    padraoNome = data.nome;
  }

  const { error } = await admin
    .from("quiz_rodadas")
    .update({
      nome: texto(formData, "nome") || rodada.nome,
      pilar: texto(formData, "pilar") || null,
      padrao_id: padraoId || null,
      padrao_nome: padraoNome,
      atividade: texto(formData, "atividade") || null,
      inicio,
      fim,
      total_perguntas: totalPerguntas,
    })
    .eq("id", rodada.id)
    .eq("revenda_id", revendaId);

  if (error) redirect(`${destino}?erro=${encodeURIComponent(error.message)}`);

  revalidatePath("/desafio");
  redirect(`${destino}?sucesso=${encodeURIComponent("Rodada atualizada.")}`);
}

/**
 * Publica a rodada — o momento em que ela passa a valer para o time.
 *
 * Três conferências antes: tem pergunta suficiente, o número bate com o
 * que foi prometido na tela do colaborador, e não há outra rodada aberta
 * na mesma área no mesmo período. A última evita o pior caso possível:
 * duas classificações concorrentes para a mesma gente.
 */
export async function publicarRodada(formData: FormData) {
  await requireModulo("quiz", "editar");
  const revendaId = await contexto();

  const id = numero(formData, "id");
  const rodada = await rodadaDaRevenda(id, revendaId);
  const destino = `${BASE}/${rodada.id}`;

  const admin = createAdminClient();
  const { count } = await admin
    .from("quiz_rodada_questoes")
    .select("*", { count: "exact", head: true })
    .eq("rodada_id", rodada.id);

  // Precisa bater exatamente com o prometido -- não só "pelo menos". Sobrar
  // pergunta é o mesmo problema que faltar: foi essa divergência (rodada
  // dizendo 10 com 12 já cadastradas) que travou quem estava jogando na
  // pergunta 10, mesmo com a barra de progresso mostrando 12.
  if ((count ?? 0) !== rodada.totalPerguntas) {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        (count ?? 0) < rodada.totalPerguntas
          ? `A rodada promete ${rodada.totalPerguntas} perguntas e tem ${count ?? 0}. Complete o desafio antes de publicar.`
          : `A rodada tem ${count ?? 0} perguntas cadastradas, mas o campo "Perguntas" está em ${rodada.totalPerguntas}. Ajuste esse número em "Editar dados da rodada" antes de publicar.`,
      )}`,
    );
  }

  const concorrentes = (
    await listarRodadas(revendaId, { area: rodada.area, publicadas: true })
  ).filter(
    (r) =>
      r.id !== rodada.id &&
      r.status === "publicada" &&
      r.inicio <= rodada.fim &&
      r.fim >= rodada.inicio,
  );

  if (concorrentes.length > 0) {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        `O período bate com o da rodada "${concorrentes[0].nome}". Encerre ou mude a data antes.`,
      )}`,
    );
  }

  const agora = new Date().toISOString();
  // Publicar é uma coisa, avisar é outra. Publicar em agosto um desafio
  // que só abre em setembro é normal -- avisar o time nesse momento não
  // é: getRodadaAtual só devolve a rodada dentro do período, então o
  // aviso levaria a uma tela vazia. Aconteceu em 27/08/2026.
  const comecouHoje = rodada.inicio <= hojeIso();

  const { error } = await admin
    .from("quiz_rodadas")
    .update({
      status: "publicada",
      publicada_em: agora,
      // Marca já como avisada quando o aviso sai agora; deixa nulo para
      // a varredura de lembretes avisar no dia do início.
      aviso_inicio_em: comecouHoje ? agora : null,
    })
    .eq("id", rodada.id)
    .eq("revenda_id", revendaId);

  if (error) redirect(`${destino}?erro=${encodeURIComponent(error.message)}`);

  const avisados = comecouHoje
    ? await avisarDaArea(revendaId, rodada.area, {
        titulo: "🏆 Novo desafio disponível",
        mensagem: `${rodada.nome} — ${rodada.totalPerguntas} perguntas, ${
          rodada.totalPerguntas * PONTOS_POR_QUESTAO
        } pontos em jogo.`,
      })
    : 0;

  revalidatePath("/desafio");
  revalidatePath("/");
  redirect(
    `${destino}?sucesso=${encodeURIComponent(
      comecouHoje
        ? `Rodada publicada. ${resumoDoAviso(avisados, rodada.area)}`
        : `Rodada publicada. O time será avisado em ${formatarDiaBr(rodada.inicio)}, quando o desafio abrir.`,
    )}`,
  );
}

/**
 * Encerra a rodada e entrega os selos de posição.
 *
 * É aqui, e não na hora em que cada um conclui, porque enquanto a rodada
 * está aberta a classificação ainda muda — um selo de 1º lugar dado no
 * dia 3 estaria mentindo no dia 30.
 */
export async function encerrarRodada(formData: FormData) {
  await requireModulo("quiz", "editar");
  const revendaId = await contexto();

  const id = numero(formData, "id");
  const rodada = await rodadaDaRevenda(id, revendaId);
  const destino = `${BASE}/${rodada.id}`;

  const admin = createAdminClient();
  await admin
    .from("quiz_rodadas")
    .update({ status: "encerrada", encerrada_em: new Date().toISOString() })
    .eq("id", rodada.id)
    .eq("revenda_id", revendaId);

  await premiarPosicoes(rodada.id, revendaId);

  const avisados = await avisarDaArea(revendaId, rodada.area, {
    titulo: "🎉 Resultado disponível",
    mensagem: `${rodada.nome} encerrou. Veja onde você ficou na classificação.`,
  });

  revalidatePath("/desafio");
  redirect(
    `${destino}?sucesso=${encodeURIComponent(
      `Rodada encerrada e premiada. ${resumoDoAviso(avisados, rodada.area)}`,
    )}`,
  );
}

export async function excluirRodada(formData: FormData) {
  await requireModulo("quiz", "excluir");
  const revendaId = await contexto();

  const id = numero(formData, "id");
  const rodada = await rodadaDaRevenda(id, revendaId);

  // Rodada que já valeu não se apaga: apagá-la levaria junto a
  // participação e a pontuação de todo mundo. Encerrar é o caminho.
  if (rodada.status !== "rascunho") {
    redirect(
      `${BASE}/${rodada.id}?erro=${encodeURIComponent(
        "Só dá para excluir rodada em rascunho. Esta já foi publicada — encerre-a.",
      )}`,
    );
  }

  const admin = createAdminClient();
  await admin
    .from("quiz_rodadas")
    .delete()
    .eq("id", rodada.id)
    .eq("revenda_id", revendaId);

  redirect(`${BASE}?sucesso=${encodeURIComponent("Rascunho excluído.")}`);
}

// ---------------------------------------------------------------------
// Questões
// ---------------------------------------------------------------------

type QuestaoEntrada = {
  pergunta: string;
  tipo: string;
  dificuldade: string;
  explicacao: string;
  alternativas: string[];
  correta: number;
  /** Só a geração automática preenche: o trecho do padrão que prova a
   *  resposta. Ver a migration 030. */
  trecho?: string;
};

const TIPOS_ACEITOS = new Set(["multipla", "vf", "situacao", "procedimento"]);
const DIFICULDADES_ACEITAS = new Set(["facil", "media", "dificil"]);

/**
 * Confere uma questão antes de ela entrar no banco.
 *
 * As regras aqui são as do pedido, cobradas uma a uma: uma única
 * resposta certa, alternativas que não se repetem, explicação
 * obrigatória. Vale para a questão digitada à mão e para a importada --
 * é a mesma porta.
 */
function validar(q: QuestaoEntrada): string | null {
  if (!q.pergunta || q.pergunta.length < 10) {
    return "A pergunta está vazia ou curta demais.";
  }
  if (!q.explicacao) {
    return `Falta a explicação da resposta em: "${q.pergunta.slice(0, 40)}..."`;
  }
  const alternativas = q.alternativas.map((a) => a.trim()).filter(Boolean);
  if (alternativas.length < 2 || alternativas.length > 6) {
    return `A questão "${q.pergunta.slice(0, 40)}..." precisa de 2 a 6 alternativas.`;
  }
  const unicas = new Set(alternativas.map((a) => a.toLowerCase()));
  if (unicas.size !== alternativas.length) {
    return `Há alternativas repetidas em: "${q.pergunta.slice(0, 40)}..."`;
  }
  if (
    !Number.isInteger(q.correta) ||
    q.correta < 0 ||
    q.correta >= alternativas.length
  ) {
    return `A resposta correta indicada não existe em: "${q.pergunta.slice(0, 40)}..."`;
  }
  if (!TIPOS_ACEITOS.has(q.tipo)) return "Tipo de questão desconhecido.";
  if (!DIFICULDADES_ACEITAS.has(q.dificuldade)) return "Dificuldade inválida.";
  return null;
}

/** Grava a questão e suas alternativas, e a prende à rodada. */
async function gravar(
  q: QuestaoEntrada,
  rodadaId: number,
  revendaId: string,
  area: AreaId,
  origem: {
    pilar: string | null;
    padraoId: number | null;
    padraoNome: string | null;
    atividade: string | null;
  },
  criadoPor: string | null,
) {
  const admin = createAdminClient();

  const { data: questao, error } = await admin
    .from("quiz_questoes")
    .insert({
      revenda_id: revendaId,
      pergunta: q.pergunta,
      tipo: q.tipo,
      explicacao: q.explicacao,
      dificuldade: q.dificuldade,
      area,
      pilar: origem.pilar,
      padrao_id: origem.padraoId,
      padrao_nome: origem.padraoNome,
      atividade: origem.atividade,
      origem_trecho: q.trecho?.trim() || null,
      criado_por: criadoPor,
    })
    .select("id")
    .single();

  if (error || !questao) {
    // 23505 = já existe pergunta igual nesta área. É o índice de
    // duplicidade fazendo o trabalho dele.
    throw new Error(
      error?.code === "23505"
        ? `Esta pergunta já existe no banco: "${q.pergunta.slice(0, 40)}..."`
        : (error?.message ?? "Não foi possível gravar a questão."),
    );
  }

  const alternativas = q.alternativas.map((a) => a.trim()).filter(Boolean);
  await admin.from("quiz_alternativas").insert(
    alternativas.map((texto, i) => ({
      questao_id: questao.id,
      texto,
      correta: i === q.correta,
      ordem: i,
    })),
  );

  const { data: ultima } = await admin
    .from("quiz_rodada_questoes")
    .select("ordem")
    .eq("rodada_id", rodadaId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  await admin.from("quiz_rodada_questoes").insert({
    rodada_id: rodadaId,
    questao_id: questao.id,
    ordem: (ultima?.ordem ?? 0) + 1,
  });

  return questao.id;
}

export async function criarQuestao(formData: FormData) {
  await requireModulo("quiz", "criar");
  const revendaId = await contexto();
  const perfil = await getPerfil();

  const rodadaId = numero(formData, "rodada_id");
  const rodada = await rodadaDaRevenda(rodadaId, revendaId);
  const destino = `${BASE}/${rodada.id}`;

  const alternativas = [0, 1, 2, 3, 4, 5]
    .map((i) => texto(formData, `alternativa_${i}`))
    .filter(Boolean);

  const entrada: QuestaoEntrada = {
    pergunta: texto(formData, "pergunta"),
    tipo: texto(formData, "tipo") || "multipla",
    dificuldade: texto(formData, "dificuldade") || "media",
    explicacao: texto(formData, "explicacao"),
    alternativas,
    correta: numero(formData, "correta"),
  };

  const problema = validar(entrada);
  if (problema) redirect(`${destino}?erro=${encodeURIComponent(problema)}`);

  try {
    await gravar(entrada, rodada.id, revendaId, rodada.area, rodada, perfil?.id ?? null);
  } catch (e) {
    redirect(`${destino}?erro=${encodeURIComponent((e as Error).message)}`);
  }

  redirect(`${destino}?sucesso=${encodeURIComponent("Pergunta adicionada.")}`);
}

/**
 * Gera as perguntas a partir do arquivo do padrão da rodada.
 *
 * Existia ao lado disto uma importação em JSON, para colar uma lista
 * preparada fora do app. Saiu em 02/09/2026 a pedido do dono -- ninguém
 * usava. Ela pedia que a liderança do armazém escrevesse JSON à mão, com
 * "correta" contando a partir do zero; a geração pelo padrão faz o mesmo
 * trabalho sem essa exigência. O `validar()` abaixo, que era a porta
 * comum das duas, continua no lugar.
 *
 * O gravar é peça por peça, e não tudo ou nada: a lista gerada não foi
 * curada por ninguém ainda -- descartar nove boas por causa de uma
 * repetida só faria o Admin clicar de novo e pagar outra geração.
 */
export async function gerarComIA(formData: FormData) {
  await requireModulo("quiz", "criar");
  const revendaId = await contexto();
  const perfil = await getPerfil();

  const rodadaId = numero(formData, "rodada_id");
  const rodada = await rodadaDaRevenda(rodadaId, revendaId);
  const destino = `${BASE}/${rodada.id}`;

  if (!iaConfigurada()) {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        "A geração automática não está configurada: falta a variável ANTHROPIC_API_KEY.",
      )}`,
    );
  }

  if (rodada.status !== "rascunho") {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        "A rodada já está no ar. Só dá para gerar perguntas em rascunho.",
      )}`,
    );
  }

  if (!rodada.padraoId) {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        "Esta rodada não tem padrão escolhido — é dele que as perguntas saem. Defina em 'Editar dados da rodada'.",
      )}`,
    );
  }

  // 15 perguntas com raciocínio passa do teto de 60s do plano Hobby (ver
  // maxDuration em app/admin/quiz/[id]/page.tsx) — por isso o máximo aqui é 10.
  const quantidade = Math.min(Math.max(numero(formData, "quantidade") || 5, 1), 10);

  const admin = createAdminClient();
  const [{ data: padrao }, { data: doBanco }] = await Promise.all([
    admin
      .from("padroes")
      .select("nome, tipo, arquivo_url")
      .eq("id", rodada.padraoId)
      .eq("revenda_id", revendaId)
      .maybeSingle(),
    admin
      .from("quiz_questoes")
      .select("pergunta")
      .eq("revenda_id", revendaId)
      .eq("area", rodada.area)
      .eq("status", "ativa"),
  ]);

  if (!padrao) {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        "O padrão desta rodada não está mais no acervo. Escolha outro.",
      )}`,
    );
  }

  let geradas;
  try {
    const fonte = await lerPadrao(padrao.arquivo_url, padrao.tipo);
    geradas = await gerarQuestoes({
      fonte,
      quantidade,
      padrao: padrao.nome,
      pilar: rodada.pilar,
      atividade: rodada.atividade,
      existentes: (doBanco ?? []).map((q) => q.pergunta),
    });
    await registrarUsoIA({
      recurso: "quiz",
      modelo: MODELO_IA_QUIZ,
      revendaId,
      colaboradorId: perfil?.id ?? null,
      entrada: geradas.custo.entrada,
      saida: geradas.custo.saida,
    });
  } catch (e) {
    redirect(`${destino}?erro=${encodeURIComponent(mensagemDeErro(e))}`);
    return;
  }

  let gravadas = 0;
  const recusadas: string[] = [];

  for (const q of geradas.questoes) {
    const entrada: QuestaoEntrada = {
      pergunta: (q.pergunta ?? "").trim(),
      tipo: q.tipo,
      dificuldade: q.dificuldade,
      explicacao: (q.explicacao ?? "").trim(),
      alternativas: (q.alternativas ?? []).map((a) => String(a)),
      correta: Number(q.correta),
      trecho: q.trecho,
    };

    const problema = validar(entrada);
    if (problema) {
      recusadas.push(problema);
      continue;
    }

    try {
      await gravar(entrada, rodada.id, revendaId, rodada.area, rodada, perfil?.id ?? null);
      gravadas++;
    } catch (e) {
      recusadas.push((e as Error).message);
    }
  }

  const resumo =
    gravadas === 0
      ? "Nenhuma pergunta aproveitada."
      : `${gravadas} pergunta(s) gerada(s) — revise cada uma contra o trecho do padrão antes de publicar.`;

  const sobra =
    recusadas.length > 0
      ? ` ${recusadas.length} descartada(s): ${recusadas[0]}`
      : "";

  redirect(
    gravadas === 0
      ? `${destino}?erro=${encodeURIComponent(resumo + sobra)}`
      : `${destino}?sucesso=${encodeURIComponent(resumo + sobra)}`,
  );
}

/**
 * Edita uma pergunta inteira, alternativas incluídas.
 *
 * Só em rascunho, e o motivo é técnico além de editorial: trocar as
 * alternativas apaga e recria as linhas, e as respostas já dadas apontam
 * para elas. Enquanto a rodada é rascunho não existe resposta nenhuma,
 * então a troca é segura.
 */
export async function editarQuestao(formData: FormData) {
  await requireModulo("quiz", "editar");
  const revendaId = await contexto();

  const rodadaId = numero(formData, "rodada_id");
  const rodada = await rodadaDaRevenda(rodadaId, revendaId);
  const destino = `${BASE}/${rodada.id}`;
  const questaoId = numero(formData, "questao_id");

  if (rodada.status !== "rascunho") {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        "A rodada já está no ar — editar a pergunta agora mudaria o desafio para quem já respondeu.",
      )}`,
    );
  }

  const alternativas = [0, 1, 2, 3, 4, 5]
    .map((i) => texto(formData, `alternativa_${i}`))
    .filter(Boolean);

  const entrada: QuestaoEntrada = {
    pergunta: texto(formData, "pergunta"),
    tipo: texto(formData, "tipo") || "multipla",
    dificuldade: texto(formData, "dificuldade") || "media",
    explicacao: texto(formData, "explicacao"),
    alternativas,
    correta: numero(formData, "correta"),
  };

  const problema = validar(entrada);
  if (problema) redirect(`${destino}?erro=${encodeURIComponent(problema)}`);

  const admin = createAdminClient();

  const { error } = await admin
    .from("quiz_questoes")
    .update({
      pergunta: entrada.pergunta,
      tipo: entrada.tipo,
      dificuldade: entrada.dificuldade,
      explicacao: entrada.explicacao,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", questaoId)
    .eq("revenda_id", revendaId);

  if (error) {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        error.code === "23505"
          ? "Já existe outra pergunta com esse texto nesta área."
          : error.message,
      )}`,
    );
  }

  await admin.from("quiz_alternativas").delete().eq("questao_id", questaoId);
  await admin.from("quiz_alternativas").insert(
    entrada.alternativas.map((texto, i) => ({
      questao_id: questaoId,
      texto,
      correta: i === entrada.correta,
      ordem: i,
    })),
  );

  redirect(`${destino}?sucesso=${encodeURIComponent("Pergunta atualizada.")}`);
}

/**
 * Liga e desliga a pergunta -- SEM sair do lugar.
 *
 * Esta é a única ação da tela que não termina em `redirect`, e é de
 * propósito. Desativar é feito em série, descendo a lista: a pergunta 7,
 * depois a 9, depois a 12. Cada `redirect` era uma navegação, e toda
 * navegação joga a página de volta para o topo -- a cada clique a pessoa
 * rolava de novo até onde estava (pedido do dono, 02/09/2026).
 *
 * Sem redirect, o `revalidatePath` redesenha a rota no lugar e a rolagem
 * fica onde estava. O preço é não ter faixa verde de "pronto"; o retorno
 * é a própria etiqueta "Desativada" aparecendo na linha que foi clicada,
 * que é uma confirmação melhor por estar do lado do que mudou.
 */
export async function alternarStatusQuestao(formData: FormData) {
  await requireModulo("quiz", "editar");
  const revendaId = await contexto();

  const rodadaId = numero(formData, "rodada_id");
  const questaoId = numero(formData, "questao_id");
  const ativa = texto(formData, "status") === "ativa";

  const admin = createAdminClient();
  await admin
    .from("quiz_questoes")
    .update({
      status: ativa ? "inativa" : "ativa",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", questaoId)
    .eq("revenda_id", revendaId);

  revalidatePath(`${BASE}/${rodadaId}`);
}

/**
 * Tira a pergunta da rodada.
 *
 * A questão continua no banco: ela pode servir no mês que vem, e as
 * respostas já dadas por quem participou continuam apontando para ela.
 * Depois que a rodada foi publicada, mexer nas perguntas fica barrado --
 * mudaria o desafio embaixo de quem já respondeu.
 */
export async function removerDaRodada(formData: FormData) {
  await requireModulo("quiz", "editar");
  const revendaId = await contexto();

  const rodadaId = numero(formData, "rodada_id");
  const rodada = await rodadaDaRevenda(rodadaId, revendaId);
  const destino = `${BASE}/${rodada.id}`;

  if (rodada.status !== "rascunho") {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        "A rodada já está no ar. Tirar uma pergunta agora mudaria o desafio para quem já respondeu.",
      )}`,
    );
  }

  const admin = createAdminClient();
  await admin
    .from("quiz_rodada_questoes")
    .delete()
    .eq("rodada_id", rodada.id)
    .eq("questao_id", numero(formData, "questao_id"));

  redirect(`${destino}?sucesso=${encodeURIComponent("Pergunta tirada da rodada.")}`);
}

/** Puxa para a rodada uma questão que já estava no banco. */
export async function adicionarDoBanco(formData: FormData) {
  await requireModulo("quiz", "editar");
  const revendaId = await contexto();

  const rodadaId = numero(formData, "rodada_id");
  const rodada = await rodadaDaRevenda(rodadaId, revendaId);
  const destino = `${BASE}/${rodada.id}`;

  const questaoId = numero(formData, "questao_id");
  const admin = createAdminClient();

  // A questão precisa ser desta revenda E desta área: puxar uma de
  // Armazém para um desafio de Distribuição seria perguntar da operação
  // errada.
  const { data: questao } = await admin
    .from("quiz_questoes")
    .select("id")
    .eq("id", questaoId)
    .eq("revenda_id", revendaId)
    .eq("area", rodada.area)
    .maybeSingle();

  if (!questao) {
    redirect(`${destino}?erro=${encodeURIComponent("Pergunta não encontrada nesta área.")}`);
  }

  const { data: ultima } = await admin
    .from("quiz_rodada_questoes")
    .select("ordem")
    .eq("rodada_id", rodada.id)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  await admin.from("quiz_rodada_questoes").upsert(
    {
      rodada_id: rodada.id,
      questao_id: questaoId,
      ordem: (ultima?.ordem ?? 0) + 1,
    },
    { onConflict: "rodada_id,questao_id", ignoreDuplicates: true },
  );

  redirect(`${destino}?sucesso=${encodeURIComponent("Pergunta trazida do banco.")}`);
}

export async function excluirQuestao(formData: FormData) {
  await requireModulo("quiz", "excluir");
  const revendaId = await contexto();

  const rodadaId = numero(formData, "rodada_id");
  const questaoId = numero(formData, "questao_id");
  const destino = `${BASE}/${rodadaId}`;

  const admin = createAdminClient();

  // Se alguém já respondeu esta pergunta, ela não sai do banco: sairiam
  // junto as respostas, e o resultado de quem participou mudaria sozinho.
  const { count } = await admin
    .from("quiz_respostas")
    .select("*", { count: "exact", head: true })
    .eq("questao_id", questaoId);

  if (count && count > 0) {
    redirect(
      `${destino}?erro=${encodeURIComponent(
        "Esta pergunta já foi respondida por alguém. Desative-a em vez de excluir.",
      )}`,
    );
  }

  await admin
    .from("quiz_questoes")
    .delete()
    .eq("id", questaoId)
    .eq("revenda_id", revendaId);

  redirect(`${destino}?sucesso=${encodeURIComponent("Pergunta excluída.")}`);
}

// ---------------------------------------------------------------------
// Avisos e premiação
// ---------------------------------------------------------------------

/**
 * Avisa só quem é da área do desafio.
 *
 * Usa o sino e o push que já existem — o pedido é explícito em não criar
 * um segundo sistema de notificação. Um aviso por pessoa (e não um da
 * revenda inteira) porque o desafio de Armazém não é assunto de quem
 * está na rua entregando.
 *
 * Devolve quantas pessoas foram avisadas: quem publica precisa saber que
 * o desafio subiu para ninguém, e "o time já foi avisado" numa área sem
 * cadastro é uma mentira que só apareceria no fim do mês, com zero
 * participantes e ninguém entendendo por quê.
 */
async function avisarDaArea(
  revendaId: string,
  area: AreaId,
  recado: { titulo: string; mensagem: string },
): Promise<number> {
  const pessoas = await getPessoasDaArea(revendaId, area);
  if (pessoas.length === 0) return 0;

  await Promise.all(
    pessoas.map((colaboradorId) =>
      criarNotificacao({
        modulo: "quiz",
        tipo: "novo",
        titulo: recado.titulo,
        mensagem: recado.mensagem,
        url: "/desafio",
        revendaId,
        destinatarioId: colaboradorId,
      }),
    ),
  );

  await enviarPushDaRevenda(revendaId, {
    modulo: "quiz",
    titulo: recado.titulo,
    mensagem: recado.mensagem,
    url: "/desafio",
    apenas: pessoas,
  });

  return pessoas.length;
}

/** "2026-09-01" vira "01/09" -- só para a mensagem de confirmação. */
function formatarDiaBr(iso: string) {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

/** "12 pessoas avisadas" — ou o alerta de que não havia quem avisar. */
function resumoDoAviso(avisados: number, area: AreaId) {
  if (avisados === 0) {
    return `ATENÇÃO: ninguém foi avisado — não há colaborador com a área ${
      area === "AL" ? "Armazém" : "Distribuição"
    } no cadastro.`;
  }
  return avisados === 1
    ? "1 pessoa foi avisada."
    : `${avisados} pessoas foram avisadas.`;
}

/** Selos de posição, entregues no encerramento. */
async function premiarPosicoes(rodadaId: number, revendaId: string) {
  try {
    const admin = createAdminClient();

    const { data: participacoes } = await admin
      .from("quiz_participacoes")
      .select("colaborador_id, colaborador_nome, pontos, acertos, tempo_ms, concluida_em")
      .eq("rodada_id", rodadaId)
      .eq("status", "concluida");

    const classificacao = comPosicao(
      (participacoes ?? []).map((p) => ({
        colaboradorId: p.colaborador_id,
        nome: p.colaborador_nome,
        pontos: p.pontos,
        acertos: p.acertos,
        jogos: 1,
        totalPerguntas: 0,
        tempoMs: Number(p.tempo_ms),
        concluidaEm: p.concluida_em,
      })),
    );

    const selos = classificacao.flatMap((l) => {
      const codigos: string[] = [];
      if (l.posicao === 1) codigos.push("campeao");
      if (l.posicao <= 3) codigos.push("top3");
      if (l.posicao <= 5) codigos.push("top5");
      return codigos.map((codigo) => ({
        revenda_id: revendaId,
        colaborador_id: l.colaboradorId,
        rodada_id: rodadaId,
        codigo,
      }));
    });

    if (selos.length === 0) return;

    await admin.from("quiz_conquistas").upsert(selos, {
      onConflict: "colaborador_id,rodada_id,codigo",
      ignoreDuplicates: true,
    });
  } catch {
    // Selo é enfeite: a classificação já está gravada e é ela que vale.
  }
}
