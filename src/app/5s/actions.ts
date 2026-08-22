"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarNotificacao } from "@/lib/notificacoes-server";
import { enviarPushDaRevenda } from "@/lib/push-server";
import {
  exigirContexto5S,
  consolidar,
  podeResponder,
  podeVerAuditoria,
} from "@/lib/cinco-s-server";
import {
  ehPrioridade,
  ehResposta,
  ehStatusNC,
  nokSemDescricao,
  resumoAuditoria,
  type Resposta,
  type StatusNC,
} from "@/lib/cinco-s";
import { SEGUNDOS_DE_CACHE } from "@/lib/storage";

/**
 * Ações do 5S que o colaborador dispara: executar a auditoria e tratar
 * a ação que caiu no colo dele.
 *
 * Todas devolvem `{ ok }` ou `{ erro }` em vez de redirecionar. A tela
 * do auditor é uma só, com o checklist inteiro, e um redirect a cada
 * resposta faria a página recarregar vinte e cinco vezes -- justamente
 * o que o requisito de "não recarregar a página inteira a cada ação"
 * proíbe. Quem chama mostra um toast e segue.
 */

type Resultado = { ok: true; mensagem?: string } | { ok: false; erro: string };

function falha(erro: string): Resultado {
  return { ok: false, erro };
}

/** Busca a auditoria e confere, de uma vez, se esta pessoa pode mexer nela. */
async function auditoriaPermitida(auditoriaId: string) {
  const ctx = await exigirContexto5S();
  const admin = createAdminClient();

  const { data } = await admin
    .from("cinco_s_auditorias")
    .select("id, revenda_id, area_id, auditor_id, dono_id, status, planejada_para")
    .eq("id", auditoriaId)
    // A revenda entra no filtro para que um id válido de OUTRA revenda
    // não abra porta nenhuma -- o contexto já é o da revenda ativa.
    .eq("revenda_id", ctx.revendaId)
    .maybeSingle();

  return { ctx, auditoria: data, admin };
}

/* ================================================================== */
/* EXECUÇÃO DA AUDITORIA                                              */
/* ================================================================== */

/**
 * Marca a auditoria como em andamento no primeiro toque.
 *
 * Serve ao indicador de aderência: sem isso, "planejada" e "o auditor
 * está lá agora" seriam o mesmo estado, e a tela de acompanhamento não
 * saberia distinguir quem esqueceu de quem está no meio.
 */
export async function iniciarAuditoria(auditoriaId: string): Promise<Resultado> {
  const { ctx, auditoria, admin } = await auditoriaPermitida(auditoriaId);
  if (!auditoria) return falha("Auditoria não encontrada.");
  if (!podeResponder(ctx, auditoria)) {
    return falha("Você não é o auditor designado para esta auditoria.");
  }
  if (auditoria.status !== "planejada") return { ok: true };

  await admin
    .from("cinco_s_auditorias")
    .update({ status: "em_andamento", iniciada_em: new Date().toISOString() })
    .eq("id", auditoriaId);

  revalidatePath(`/5s/auditoria/${auditoriaId}`);
  revalidatePath("/5s");
  return { ok: true };
}

/**
 * Grava UMA resposta.
 *
 * Item a item, e não o formulário inteiro no fim: a auditoria acontece
 * andando pela área, com o celular na mão e a conexão que houver. Um
 * envio único no final significaria perder vinte e cinco respostas
 * quando o sinal cai no fundo do armazém.
 *
 * O upsert pela chave (auditoria, pergunta) deixa a pessoa voltar e
 * trocar a resposta sem duplicar linha nem contar duas vezes.
 */
export async function salvarResposta(formData: FormData): Promise<Resultado> {
  const auditoriaId = String(formData.get("auditoria_id") ?? "");
  const perguntaId = String(formData.get("pergunta_id") ?? "");
  const valor = formData.get("valor");

  if (!auditoriaId || !perguntaId) return falha("Dados incompletos.");
  if (!ehResposta(valor)) return falha("Resposta inválida.");

  const { ctx, auditoria, admin } = await auditoriaPermitida(auditoriaId);
  if (!auditoria) return falha("Auditoria não encontrada.");
  if (!podeResponder(ctx, auditoria)) {
    return falha("Esta auditoria não está aberta para você.");
  }

  const observacaoBruta = formData.get("observacao");
  const observacao =
    typeof observacaoBruta === "string" && observacaoBruta.trim() !== ""
      ? observacaoBruta.trim()
      : null;

  const foto = formData.get("foto");
  let fotoUrl: string | null = null;
  if (foto instanceof File && foto.size > 0) {
    const enviada = await subirEvidencia(foto, `${auditoriaId}/${perguntaId}`);
    if (!enviada.ok) return falha(enviada.erro);
    fotoUrl = enviada.url;
  }

  // Sem foto nova, mantém a que já estava lá: trocar de OK para NOK não
  // pode apagar a evidência que o auditor tirou dois toques antes.
  const atualizacao: Record<string, unknown> = {
    auditoria_id: auditoriaId,
    pergunta_id: perguntaId,
    valor,
    observacao,
    respondida_em: new Date().toISOString(),
  };
  if (fotoUrl) atualizacao.foto_url = fotoUrl;

  const { error } = await admin
    .from("cinco_s_respostas")
    .upsert(atualizacao, { onConflict: "auditoria_id,pergunta_id" });

  if (error) return falha(`Não foi possível salvar: ${error.message}`);

  if (auditoria.status === "planejada") {
    await admin
      .from("cinco_s_auditorias")
      .update({ status: "em_andamento", iniciada_em: new Date().toISOString() })
      .eq("id", auditoriaId);
  }

  // A auditoria já finalizada que recebe correção precisa recalcular na
  // hora: o BI lê o consolidado, e deixá-lo velho faria o indicador
  // discordar da resposta que está na tela.
  if (auditoria.status === "finalizada") {
    await consolidar(auditoriaId);
    await registrarEdicao(auditoriaId, ctx.perfilId, ctx.nome);
    revalidatePath("/5s/bi");
  }

  return { ok: true };
}

/**
 * Fecha a auditoria: consolida, abre as não conformidades e avisa quem
 * precisa agir.
 *
 * A ordem importa. Consolidar primeiro garante que o resultado exibido
 * na tela seguinte é o mesmo que o BI vai somar. Só depois nascem as
 * NCs -- que são o produto da auditoria, não um efeito colateral dela.
 */
export async function finalizarAuditoria(
  auditoriaId: string,
): Promise<Resultado> {
  const { ctx, auditoria, admin } = await auditoriaPermitida(auditoriaId);
  if (!auditoria) return falha("Auditoria não encontrada.");
  if (auditoria.status === "finalizada") {
    return falha("Esta auditoria já foi finalizada.");
  }
  if (!podeResponder(ctx, auditoria)) {
    return falha("Você não é o auditor designado para esta auditoria.");
  }

  const [{ data: respostas }, { count: totalPerguntas }] = await Promise.all([
    admin
      .from("cinco_s_respostas")
      .select("id, pergunta_id, valor, observacao, foto_url")
      .eq("auditoria_id", auditoriaId),
    admin
      .from("cinco_s_perguntas")
      .select("id", { count: "exact", head: true })
      .eq("revenda_id", ctx.revendaId)
      .eq("ativa", true),
  ]);

  const respondidas = respostas ?? [];
  if (respondidas.length < (totalPerguntas ?? 0)) {
    const faltam = (totalPerguntas ?? 0) - respondidas.length;
    return falha(
      `Faltam ${faltam} pergunta${faltam === 1 ? "" : "s"} para responder.`,
    );
  }

  // Todo NOK precisa dizer o que precisa ser feito, porque é esse texto
  // que vira a descrição da ação no colo do dono da área. A trava está
  // aqui E na tela: esta ação é chamável sem passar por lá.
  const semDescricao = respondidas.filter((r) =>
    nokSemDescricao({ valor: r.valor as Resposta, observacao: r.observacao }),
  );
  if (semDescricao.length > 0) {
    return falha(
      semDescricao.length === 1
        ? "Descreva o que precisa ser feito no item não conforme. É esse texto que o dono da área vai ler no plano de ação."
        : `Descreva o que precisa ser feito nos ${semDescricao.length} itens não conformes. É esse texto que o dono da área vai ler no plano de ação.`,
    );
  }

  await admin
    .from("cinco_s_auditorias")
    .update({ status: "finalizada", finalizada_em: new Date().toISOString() })
    .eq("id", auditoriaId);

  await consolidar(auditoriaId);

  await abrirNaoConformidades(auditoriaId, ctx.revendaId, auditoria.area_id, ctx.perfilId);

  // O consolidado só existe depois do RPC, então a leitura vem aqui e
  // não junto com a consulta lá de cima.
  const { data: fechada } = await admin
    .from("cinco_s_auditorias")
    .select("total_ok, total_nok, conformidade, cinco_s_areas!inner(nome)")
    .eq("id", auditoriaId)
    .single();

  if (fechada && auditoria.dono_id) {
    const area = Array.isArray(fechada.cinco_s_areas)
      ? fechada.cinco_s_areas[0]
      : fechada.cinco_s_areas;

    const titulo = "🧹 Auditoria 5S da sua área";
    const mensagem = `${(area as { nome: string }).nome}: ${resumoAuditoria(fechada)}`;

    await criarNotificacao({
      modulo: "5s",
      tipo: fechada.total_nok > 0 ? "pendencia" : "novo",
      titulo,
      mensagem,
      url: `/5s/auditoria/${auditoriaId}`,
      revendaId: ctx.revendaId,
      destinatarioId: auditoria.dono_id,
      referenciaId: auditoriaId,
    });

    await enviarPushDaRevenda(ctx.revendaId, {
      modulo: "5s",
      titulo,
      mensagem,
      url: `/5s/auditoria/${auditoriaId}`,
      apenas: [auditoria.dono_id],
    });
  }

  revalidatePath(`/5s/auditoria/${auditoriaId}`);
  revalidatePath("/5s");
  revalidatePath("/5s/acoes");
  revalidatePath("/admin/5s");
  revalidatePath("/5s/bi");

  return { ok: true, mensagem: "Auditoria finalizada." };
}

/**
 * Cada item NOK vira uma não conformidade -- uma linha do plano de ação.
 *
 * É a correção do maior defeito da planilha: lá a ação corretiva era um
 * campo de texto solto por auditoria, desligado do item que a motivou,
 * e por isso ninguém conseguia responder "esta NC foi resolvida?".
 *
 * O responsável nasce como o dono da área, e o prazo em 30 dias. São
 * padrões, não decisões: a tela do plano de ação permite trocar os dois.
 * Nascer sem responsável faria a ação nascer órfã, que é como as coisas
 * deixam de ser feitas.
 */
async function abrirNaoConformidades(
  auditoriaId: string,
  revendaId: string,
  areaId: string,
  criadoPor: string,
) {
  const admin = createAdminClient();

  const [{ data: nok }, { data: auditoria }, { data: jaExistem }] =
    await Promise.all([
      admin
        .from("cinco_s_respostas")
        .select("id, pergunta_id, observacao, foto_url, cinco_s_perguntas!inner(senso, codigo, texto)")
        .eq("auditoria_id", auditoriaId)
        .eq("valor", "nao"),
      admin
        .from("cinco_s_auditorias")
        .select("dono_id")
        .eq("id", auditoriaId)
        .single(),
      // Finalizar duas vezes (correção depois de reabrir) não pode
      // duplicar o plano de ação.
      admin
        .from("cinco_s_nao_conformidades")
        .select("resposta_id")
        .eq("auditoria_id", auditoriaId),
    ]);

  const criadas = new Set((jaExistem ?? []).map((n) => n.resposta_id));
  const novas = (nok ?? []).filter((r) => !criadas.has(r.id));
  if (novas.length === 0) return;

  const prazo = new Date();
  prazo.setDate(prazo.getDate() + 30);

  const linhas = novas.map((r) => {
    const p = (Array.isArray(r.cinco_s_perguntas)
      ? r.cinco_s_perguntas[0]
      : r.cinco_s_perguntas) as {
      senso: string;
      codigo: string;
      texto: string;
    };
    return {
      revenda_id: revendaId,
      auditoria_id: auditoriaId,
      resposta_id: r.id,
      area_id: areaId,
      pergunta_id: r.pergunta_id,
      senso: p.senso,
      // A observação do auditor é a descrição da ação -- ele estava lá,
      // e desde a obrigatoriedade do NOK ela sempre existe. O fallback
      // pelo texto da pergunta fica só para as auditorias antigas,
      // fechadas antes da regra, que forem reabertas e refinalizadas.
      descricao: r.observacao?.trim() || `${p.codigo} — ${p.texto}`,
      evidencia_url: r.foto_url,
      responsavel_id: auditoria?.dono_id ?? null,
      prazo: prazo.toISOString().slice(0, 10),
      prioridade: "media",
      status: "aberta",
      criado_por: criadoPor,
    };
  });

  await admin.from("cinco_s_nao_conformidades").insert(linhas);
}

/** Deixa rastro de quem mexeu numa auditoria já fechada. */
async function registrarEdicao(
  auditoriaId: string,
  atorId: string,
  atorNome: string,
) {
  const admin = createAdminClient();
  await admin.from("auditoria").insert({
    ator_id: atorId,
    ator_nome: atorNome,
    acao: "EDITOU AUDITORIA 5S FINALIZADA",
    detalhes: `Auditoria ${auditoriaId} teve resposta alterada após a finalização. Consolidado recalculado.`,
  });
}

/* ================================================================== */
/* PLANO DE AÇÃO -- tratativa                                         */
/* ================================================================== */

/** Quem pode mexer nesta ação? Responsável, dono da área ou gestor. */
async function acaoPermitida(ncId: string) {
  const ctx = await exigirContexto5S();
  const admin = createAdminClient();

  const { data: nc } = await admin
    .from("cinco_s_nao_conformidades")
    .select(
      "id, revenda_id, area_id, auditoria_id, responsavel_id, status, descricao, prazo",
    )
    .eq("id", ncId)
    .eq("revenda_id", ctx.revendaId)
    .maybeSingle();

  if (!nc) return { ctx, nc: null, admin, pode: false, podeValidar: false };

  const pode =
    ctx.gestor ||
    nc.responsavel_id === ctx.perfilId ||
    ctx.areasComoDono.includes(nc.area_id);

  // Validar é o contraponto de concluir: quem executou não carimba o
  // próprio serviço. Fica com o gestor ou com o auditor da auditoria de
  // origem -- que é quem apontou o problema.
  const { data: origem } = await admin
    .from("cinco_s_auditorias")
    .select("auditor_id")
    .eq("id", nc.auditoria_id)
    .maybeSingle();

  const podeValidar =
    ctx.podeEditar || (origem?.auditor_id === ctx.perfilId);

  return { ctx, nc, admin, pode, podeValidar };
}

/**
 * O responsável move a ação e anexa a evidência da solução.
 *
 * "Concluída" não é o fim: fica esperando validação de quem apontou o
 * problema. Deixar o próprio executor encerrar transformaria o
 * indicador de conclusão em autodeclaração.
 */
export async function atualizarAcao(formData: FormData): Promise<Resultado> {
  const id = String(formData.get("id") ?? "");
  const novoStatus = formData.get("status");
  if (!id) return falha("Ação não informada.");
  if (!ehStatusNC(novoStatus)) return falha("Situação inválida.");

  const { ctx, nc, admin, pode, podeValidar } = await acaoPermitida(id);
  if (!nc) return falha("Ação não encontrada.");
  if (!pode) return falha("Esta ação não é sua.");

  if (novoStatus === "validada" && !podeValidar) {
    return falha("Só quem apontou o problema (ou o gestor) valida a conclusão.");
  }
  if (nc.status === "validada" && !ctx.podeEditar) {
    return falha("Ação já validada. Fale com o gestor do 5S para reabrir.");
  }

  const comentarioBruto = formData.get("comentario");
  const comentario =
    typeof comentarioBruto === "string" && comentarioBruto.trim() !== ""
      ? comentarioBruto.trim()
      : null;

  const mudanca: Record<string, unknown> = { status: novoStatus };

  const foto = formData.get("evidencia");
  if (foto instanceof File && foto.size > 0) {
    const enviada = await subirEvidencia(foto, `acoes/${id}`);
    if (!enviada.ok) return falha(enviada.erro);
    mudanca.evidencia_conclusao_url = enviada.url;
  }

  const acaoTexto = formData.get("acao");
  if (typeof acaoTexto === "string" && acaoTexto.trim() !== "") {
    mudanca.acao = acaoTexto.trim();
  }

  if (novoStatus === "concluida") {
    mudanca.concluido_em = new Date().toISOString();
    if (comentario) mudanca.comentario_encerramento = comentario;
  }
  if (novoStatus === "validada") {
    mudanca.validado_por = ctx.perfilId;
    mudanca.validado_em = new Date().toISOString();
  }
  // Reprovar é voltar para "em andamento". Não existe status "reprovada"
  // de propósito: reprovada É uma ação em andamento, e um status extra
  // só dividiria o mesmo trabalho em duas colunas do painel.
  if (novoStatus === "em_andamento" && nc.status === "concluida") {
    mudanca.concluido_em = null;
  }

  const { error } = await admin
    .from("cinco_s_nao_conformidades")
    .update(mudanca)
    .eq("id", id)
    .eq("revenda_id", ctx.revendaId);

  if (error) return falha(`Não foi possível salvar: ${error.message}`);

  await admin.from("cinco_s_nc_historico").insert({
    nc_id: id,
    ator_id: ctx.perfilId,
    ator_nome: ctx.nome,
    de_status: nc.status,
    para_status: novoStatus,
    comentario,
  });

  await avisarSobreAcao(ctx.revendaId, id, nc, novoStatus, ctx.perfilId);

  revalidatePath("/5s/acoes");
  revalidatePath("/5s");
  revalidatePath("/admin/5s");
  revalidatePath("/5s/bi");

  return { ok: true, mensagem: "Ação atualizada." };
}

/**
 * Avisa a pessoa certa a cada passo -- e ninguém além dela.
 *
 * Concluir avisa quem valida; validar ou reprovar avisa quem executou.
 * Quem fez a mudança nunca recebe aviso da própria mudança.
 */
async function avisarSobreAcao(
  revendaId: string,
  ncId: string,
  nc: { responsavel_id: string | null; auditoria_id: string },
  status: StatusNC,
  autorId: string,
) {
  const admin = createAdminClient();

  let destinatario: string | null = null;
  let titulo = "";
  let mensagem = "";

  if (status === "concluida") {
    const { data: origem } = await admin
      .from("cinco_s_auditorias")
      .select("auditor_id")
      .eq("id", nc.auditoria_id)
      .maybeSingle();
    destinatario = origem?.auditor_id ?? null;
    titulo = "🧹 Ação 5S aguardando validação";
    mensagem = "Uma ação da sua auditoria foi concluída e espera sua conferência.";
  } else if (status === "validada") {
    destinatario = nc.responsavel_id;
    titulo = "✅ Ação 5S validada";
    mensagem = "A ação que você tratou foi conferida e encerrada.";
  } else if (status === "em_andamento") {
    destinatario = nc.responsavel_id;
    titulo = "🔁 Ação 5S devolvida";
    mensagem = "A conclusão não foi aceita e a ação voltou para tratativa.";
  }

  if (!destinatario || destinatario === autorId) return;

  await criarNotificacao({
    modulo: "5s",
    tipo: "pendencia",
    titulo,
    mensagem,
    url: "/5s/acoes",
    revendaId,
    destinatarioId: destinatario,
    referenciaId: ncId,
  });

  await enviarPushDaRevenda(revendaId, {
    modulo: "5s",
    titulo,
    mensagem,
    url: "/5s/acoes",
    apenas: [destinatario],
  });
}

/* ================================================================== */
/* EVIDÊNCIAS                                                         */
/* ================================================================== */

const TAMANHO_MAXIMO = 8 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/**
 * Sobe a foto no mesmo bucket que o resto do app usa.
 *
 * `conteudo` é público para leitura, e a escrita não tem política
 * nenhuma -- só passa pela service role, aqui, depois de a ação já ter
 * conferido quem está pedindo. Mesmo desenho de comunicados, padrões e
 * ranking; um bucket novo só para o 5S seria mais uma permissão para
 * manter em dia sem ganhar nada.
 */
async function subirEvidencia(
  arquivo: File,
  prefixo: string,
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { ok: false, erro: "A foto passa de 8 MB. Tente outra." };
  }
  if (arquivo.type && !TIPOS.includes(arquivo.type)) {
    return { ok: false, erro: "Envie uma imagem (JPG, PNG ou WEBP)." };
  }

  const admin = createAdminClient();
  const extensao = (arquivo.name.split(".").pop() ?? "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 5);
  const caminho = `5s/${prefixo}-${Date.now()}.${extensao || "jpg"}`;

  const { error } = await admin.storage
    .from("conteudo")
    .upload(caminho, arquivo, {
      contentType: arquivo.type || "image/jpeg",
      upsert: true,
      cacheControl: SEGUNDOS_DE_CACHE,
    });

  if (error) return { ok: false, erro: `Falha ao enviar a foto: ${error.message}` };

  const { data } = admin.storage.from("conteudo").getPublicUrl(caminho);
  return { ok: true, url: data.publicUrl };
}

/* ================================================================== */
/* Reabertura controlada                                              */
/* ================================================================== */

/**
 * Reabre uma auditoria finalizada.
 *
 * Existe porque o requisito pede que a alteração de auditoria fechada
 * seja CONTROLADA, e não impossível: erro de digitação acontece, e sem
 * saída o auditor recorreria a refazer a auditoria inteira -- que
 * duplicaria o resultado no indicador.
 *
 * Só gestor reabre, o motivo é obrigatório e a reabertura entra no log
 * de auditoria do app.
 */
export async function reabrirAuditoria(formData: FormData): Promise<Resultado> {
  const id = String(formData.get("id") ?? "");
  const motivoBruto = formData.get("motivo");
  const motivo = typeof motivoBruto === "string" ? motivoBruto.trim() : "";

  if (!id) return falha("Auditoria não informada.");
  if (motivo.length < 10) {
    return falha("Explique em uma frase por que a auditoria precisa ser reaberta.");
  }

  const { ctx, auditoria, admin } = await auditoriaPermitida(id);
  if (!auditoria) return falha("Auditoria não encontrada.");
  if (!ctx.podeEditar) {
    return falha("Só o gestor do 5S reabre uma auditoria finalizada.");
  }
  if (auditoria.status !== "finalizada") {
    return falha("Esta auditoria não está finalizada.");
  }
  if (!podeVerAuditoria(ctx, auditoria)) {
    return falha("Auditoria fora do seu acesso.");
  }

  await admin
    .from("cinco_s_auditorias")
    .update({ status: "em_andamento", finalizada_em: null })
    .eq("id", id);

  await admin.from("auditoria").insert({
    ator_id: ctx.perfilId,
    ator_nome: ctx.nome,
    acao: "REABRIU AUDITORIA 5S",
    detalhes: `Auditoria ${id}. Motivo: ${motivo}`,
  });

  revalidatePath(`/5s/auditoria/${id}`);
  revalidatePath("/admin/5s");
  revalidatePath("/5s/bi");

  return { ok: true, mensagem: "Auditoria reaberta." };
}

/** Marca uma ação como prioritária sem abrir o modal inteiro. */
export async function mudarPrioridade(formData: FormData): Promise<Resultado> {
  const id = String(formData.get("id") ?? "");
  const prioridade = formData.get("prioridade");
  if (!id || !ehPrioridade(prioridade)) return falha("Dados inválidos.");

  const { ctx, nc, admin, pode } = await acaoPermitida(id);
  if (!nc) return falha("Ação não encontrada.");
  if (!pode) return falha("Esta ação não é sua.");

  await admin
    .from("cinco_s_nao_conformidades")
    .update({ prioridade })
    .eq("id", id)
    .eq("revenda_id", ctx.revendaId);

  revalidatePath("/5s/acoes");
  return { ok: true };
}
