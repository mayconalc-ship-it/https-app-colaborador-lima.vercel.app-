"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModulo } from "@/lib/require-admin";
import { exigirRevenda } from "@/lib/revendas";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  lerConfigDoMes,
  lerConfigsDosMeses,
  lerMes,
  lerMesesDoPeriodo,
  lerRealizado,
  lerRealizadoDoPeriodo,
  lerSalarios,
  primeiroDia,
  qlpVigente,
  registrarAlteracoes,
} from "@/lib/mao-de-obra-server";

/** O dia de hoje em Brasília, "AAAA-MM-DD" -- o servidor roda em UTC. */
function hojeNaOperacao() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
import {
  EH_FUNCAO,
  FUNCOES,
  LIMITES_MAO_DE_OBRA,
  MES_VAZIO,
  MODULO_MAO_DE_OBRA,
  DIAS_DO_SELLOUT,
  PARAMETROS_ARMAZEM,
  type ParametrosArmazem,
  RUBRICAS,
  validarSellout,
  diasDaCompetencia,
  dimensionamentoDoMes,
  tipoDoDia,
  ehCompetencia,
  lerNumeroDigitado,
  MOTIVOS_DIA_ACIMA,
  ROTULO_CAMPO_MES,
  ROTULO_FUNCAO,
  compararCampos,
  mostrarNumero,
  ehCampoNumericoDoMes,
  mesesDoPlanejamento,
  mesesPorExtenso,
  rotuloCompetencia,
  vagasDoMes,
  validarAcao,
  validarEmail,
  validarMes,
  type MesMaoDeObra,
} from "@/lib/mao-de-obra";

const ROTA = "/gestao/mao-de-obra";

type Aba = "planejar" | "dia" | "resultado" | "configurar";

/** Volta para a MESMA aba de onde a pessoa salvou -- não para o topo. */
function voltar(competencia: string, chave: "erro" | "sucesso", mensagem: string, aba: Aba = "planejar"): never {
  redirect(`${ROTA}?mes=${competencia}&aba=${aba}&${chave}=${encodeURIComponent(mensagem)}`);
}

function atualizarTelas() {
  revalidatePath(ROTA);
}

/** Número do formulário -- a MESMA leitura da tela (lerNumeroDigitado). */
const numero = (valor: FormDataEntryValue | null): number | null => lerNumeroDigitado(String(valor ?? ""));

/**
 * O MÊS DO SIMULADOR -- volume, dias, frota e os turnos do armazém.
 *
 * Um Salvar só para a grade inteira: são campos do mesmo assunto, e
 * salvar campo a campo faria a liderança digitar quinze vezes. A gravação
 * carimba a REVISÃO do mês, que é a evidência que o DPO pede.
 */
export async function salvarMes(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const competencia = String(formData.get("competencia") ?? "");
  if (!ehCompetencia(competencia)) voltar("", "erro", "Competência inválida.");

  const mes: MesMaoDeObra = { ...MES_VAZIO, competencia };
  for (const chave of Object.keys(MES_VAZIO) as (keyof MesMaoDeObra)[]) {
    if (!ehCampoNumericoDoMes(chave)) continue;
    (mes[chave] as number | null) = numero(formData.get(chave));
  }
  const texto = (campo: string, max: number) => String(formData.get(campo) ?? "").trim().slice(0, max) || null;
  mes.base_meta = String(formData.get("base_meta") ?? "") === "ppr" ? "ppr" : "negociado";
  mes.observacao = texto("observacao", LIMITES_MAO_DE_OBRA.observacaoMax);
  mes.qlp_justificativa_motivo = texto("qlp_justificativa_motivo", 80);
  mes.qlp_justificativa = texto("qlp_justificativa", LIMITES_MAO_DE_OBRA.observacaoMax);

  // A MESMA regra da tela (validarMes), agora no servidor.
  const problema = validarMes(mes);
  if (problema) voltar(competencia, "erro", problema);

  // A justificativa do VOLUME tem Salvar próprio (aba Resultado). Fica fora
  // daqui para o Salvar do mês não apagá-la.
  const gravar = (Object.keys(MES_VAZIO) as (keyof MesMaoDeObra)[]).filter(
    (k) => k !== "competencia" && k !== "volume_justificativa_motivo" && k !== "volume_justificativa",
  );

  // O antes, para o histórico (migration 151).
  const anterior = await lerMes(revendaId, competencia);

  const admin = createAdminClient();
  const { error } = await admin.from("mao_obra_meses").upsert(
    {
      revenda_id: revendaId,
      competencia: primeiroDia(competencia),
      ...Object.fromEntries(gravar.map((k) => [k, mes[k]])),
      revisado_em: new Date().toISOString(),
      revisado_por_nome: perfil.nome,
    },
    { onConflict: "revenda_id,competencia" },
  );
  // Volta para o mês que a tela estava planejando, não para o mês editado:
  // quem planeja outubro e ajusta dezembro continua vendo out-nov-dez.
  const base = String(formData.get("base") ?? "");
  const destino = ehCompetencia(base) ? base : competencia;
  if (error) voltar(destino, "erro", `Não foi possível salvar: ${error.message}`);

  // Mês novo vira UMA linha ("Mês lançado"); mês que já existia registra
  // campo a campo o que mudou -- trinta linhas de "vazio → x" num mês novo
  // só esconderiam as alterações que importam.
  await registrarAlteracoes(
    revendaId,
    perfil.nome,
    anterior
      ? compararCampos({
          onde: "mes",
          competencia,
          antes: anterior as unknown as Record<string, unknown>,
          depois: mes as unknown as Record<string, unknown>,
          campos: gravar
            .filter((k) => ROTULO_CAMPO_MES[k])
            .map((k) => ({ campo: k, rotulo: ROTULO_CAMPO_MES[k]!, formatar: k === "base_meta" ? (v: unknown) => (v === "ppr" ? "PPR" : "Negociado") : undefined })),
        })
      : [
          {
            onde: "mes",
            competencia,
            campo: "mes",
            rotulo: "Mês lançado",
            valorAnterior: null,
            valorNovo: `PPR ${mes.volume_ppr ?? "—"} HL · negociado ${mes.volume_negociado ?? "—"} HL`,
          },
        ],
  );

  atualizarTelas();
  voltar(destino, "sucesso", `${rotuloCompetencia(competencia)} salvo e revisão registrada.`);
}

/** O QLP real de cada função -- o outro lado do "dimensionado x realizado". */
export async function salvarRealizado(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const competencia = String(formData.get("competencia") ?? "");
  if (!ehCompetencia(competencia)) voltar("", "erro", "Competência inválida.");

  const linhas: { revenda_id: string; competencia: string; funcao: string; quantidade: number; atualizado_por_nome: string }[] = [];
  for (const f of FUNCOES) {
    const valor = numero(formData.get(`real_${f.id}`));
    if (valor == null) continue;
    if (valor < 0 || valor > LIMITES_MAO_DE_OBRA.pessoasMax) {
      voltar(competencia, "erro", `Quantidade inválida em ${f.rotulo}.`);
    }
    linhas.push({
      revenda_id: revendaId,
      competencia: primeiroDia(competencia),
      funcao: f.id,
      quantidade: Math.round(valor),
      atualizado_por_nome: perfil.nome,
    });
  }

  const antesDoQlp = await lerRealizado(revendaId, competencia);

  const admin = createAdminClient();
  if (linhas.length > 0) {
    const { error } = await admin
      .from("mao_obra_realizado")
      .upsert(linhas, { onConflict: "revenda_id,competencia,funcao" });
    if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`);
  }
  // Função deixada em branco volta a não ter realizado informado.
  const informadas = linhas.map((l) => l.funcao);
  const apagar = FUNCOES.map((f) => f.id).filter((f) => !informadas.includes(f));
  if (apagar.length > 0) {
    await admin
      .from("mao_obra_realizado")
      .delete()
      .eq("revenda_id", revendaId)
      .eq("competencia", primeiroDia(competencia))
      .in("funcao", apagar);
  }

  await registrarAlteracoes(
    revendaId,
    perfil.nome,
    compararCampos({
      onde: "qlp",
      competencia,
      antes: antesDoQlp,
      depois: Object.fromEntries(FUNCOES.map((f) => [f.id, linhas.find((l) => l.funcao === f.id)?.quantidade ?? null])),
      campos: FUNCOES.map((f) => ({ campo: f.id, rotulo: f.rotulo })),
    }),
  );

  atualizarTelas();
  voltar(competencia, "sucesso", "Quadro atual (QLP) atualizado.");
}

/** Os inputs do PPR Plan do Armazém e a curva de venda, congelados no mês. */
export async function salvarParametros(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  const competencia = String(formData.get("competencia") ?? "");

  // OS INPUTS DO PPR (migration 154): % na tela vira fração no banco.
  const armazem = {} as ParametrosArmazem;
  for (const p of PARAMETROS_ARMAZEM) {
    const v = numero(formData.get(`arm_${p.id}`));
    if (v == null || v < 0) voltar(competencia, "erro", `Informe um valor válido em ${p.grupo} — ${p.rotulo}.`, "configurar");
    if (p.unidade === "%" && v > 100) voltar(competencia, "erro", `${p.rotulo}: percentual acima de 100%.`, "configurar");
    armazem[p.id] = p.unidade === "%" ? v / 100 : v;
  }
  if (armazem.jornada_horas <= 0 || armazem.jornada_conferente_noite <= 0) voltar(competencia, "erro", "A jornada não pode ser zero.", "configurar");
  if (armazem.hl_por_caixa <= 0 || armazem.caixas_por_palete <= 0 || armazem.paletes_por_viagem <= 0) {
    voltar(competencia, "erro", "HL por caixa, caixas por palete e paletes por viagem não podem ser zero.", "configurar");
  }
  if (armazem.pux_ff_noite + armazem.pux_ff_manha > 1 || armazem.pux_spot_noite + armazem.pux_spot_manha > 1) {
    voltar(competencia, "erro", "Noite + manhã da puxada não podem passar de 100% (a tarde é o que sobra).", "configurar");
  }

  // A CURVA DE SELLOUT: ou está desligada (tudo zero) ou fecha em 100%.
  const curva: Record<string, number> = {};
  for (const d of DIAS_DO_SELLOUT) {
    const v = numero(formData.get(d.id)) ?? 0;
    if (v < 0 || v > 100) voltar(competencia, "erro", `Percentual inválido em ${d.rotulo}.`, "configurar");
    curva[d.id] = v;
  }
  const problemaDaCurva = validarSellout(curva as Parameters<typeof validarSellout>[0]);
  if (problemaDaCurva) voltar(competencia, "erro", problemaDaCurva, "configurar");
  if (!ehCompetencia(competencia)) voltar("", "erro", "Competência inválida.", "configurar");
  const antesDaConfig = (await lerConfigDoMes(revendaId, competencia)).config;
  const admin = createAdminClient();
  const agora = new Date().toISOString();

  /*
    CONGELA OS OUTROS MESES ANTES DE SALVAR (migration 152): o mês lançado
    depois deste que ainda não tem configuração própria herdava a deste --
    ganha agora uma cópia do que estava usando, para não mudar junto.
  */
  const { data: seguintes } = await admin
    .from("mao_obra_meses")
    .select("competencia")
    .eq("revenda_id", revendaId)
    .gt("competencia", primeiroDia(competencia));
  const depois = (seguintes ?? []).map((s) => String(s.competencia).slice(0, 7));
  if (depois.length > 0) {
    const vigentes = await lerConfigsDosMeses(revendaId, depois);
    const herdados = depois.filter((c) => vigentes.get(c)!.origem !== c);
    if (herdados.length > 0) {
      const { error: erroCongelar } = await admin.from("mao_obra_config_mes").insert(
        herdados.map((c) => ({
          revenda_id: revendaId,
          competencia: primeiroDia(c),
          ...vigentes.get(c)!.config,
          atualizado_em: agora,
          atualizado_por_nome: `Congelada ao alterar ${rotuloCompetencia(competencia)} (${perfil.nome})`,
        })),
      );
      if (erroCongelar) voltar(competencia, "erro", `Não foi possível congelar os outros meses: ${erroCongelar.message}`, "configurar");
    }
  }

  const { error } = await admin.from("mao_obra_config_mes").upsert(
    {
      revenda_id: revendaId,
      competencia: primeiroDia(competencia),
      ...antesDaConfig,
      ...curva,
      armazem,
      atualizado_em: agora,
      atualizado_por_nome: perfil.nome,
    },
    { onConflict: "revenda_id,competencia" },
  );
  if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`, "configurar");

  // Gravado como a tela mostra (40%, 7:20), que é o que o auditor lê.
  await registrarAlteracoes(
    revendaId,
    perfil.nome,
    compararCampos({
      onde: "parametros",
      competencia,
      antes: { ...antesDaConfig.armazem, ...antesDaConfig } as unknown as Record<string, unknown>,
      depois: { ...armazem, ...curva },
      campos: [
        ...PARAMETROS_ARMAZEM.map((p) => ({
          campo: p.id,
          rotulo: `${p.grupo} — ${p.rotulo}`,
          formatar: (v: unknown) => (p.unidade === "%" ? `${mostrarNumero(Number(v) * 100, 3)}%` : `${mostrarNumero(Number(v), 4)} ${p.unidade}`),
        })),        ...DIAS_DO_SELLOUT.map((d) => ({
          campo: d.id,
          rotulo: `Curva de venda — ${d.rotulo}`,
          formatar: (v: unknown) => `${mostrarNumero(Number(v), 3)}%`,
        })),
      ],
    }),
  );

  atualizarTelas();
  voltar(competencia, "sucesso", `Parâmetros de ${rotuloCompetencia(competencia)} salvos. Os outros meses não mudam.`, "configurar");
}

/** A base salarial de uma função -- o que multiplica o dimensionamento. */
export async function salvarSalario(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  const competencia = String(formData.get("competencia") ?? "");

  const funcao = String(formData.get("funcao") ?? "");
  if (!EH_FUNCAO(funcao)) voltar(competencia, "erro", "Função inválida.");

  const valores: Record<string, number> = {};
  for (const r of RUBRICAS) {
    const v = numero(formData.get(r.id)) ?? 0;
    if (v < 0 || v > 1_000_000) voltar(competencia, "erro", `Valor inválido em ${r.rotulo}.`);
    valores[r.id] = v;
  }

  const antesDoSalario = (await lerSalarios(revendaId))[funcao];

  const admin = createAdminClient();
  const { error } = await admin.from("mao_obra_salarios").upsert(
    {
      revenda_id: revendaId,
      funcao,
      ...valores,
      atualizado_em: new Date().toISOString(),
      atualizado_por_nome: perfil.nome,
    },
    { onConflict: "revenda_id,funcao" },
  );
  if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`);

  await registrarAlteracoes(
    revendaId,
    perfil.nome,
    compararCampos({
      onde: "salario",
      antes: antesDoSalario as unknown as Record<string, unknown>,
      depois: valores,
      campos: RUBRICAS.map((r) => ({
        campo: r.id,
        rotulo: `${ROTULO_FUNCAO[funcao]} — ${r.rotulo}`,
        formatar: (v: unknown) => `R$ ${mostrarNumero(Number(v), 2)}`,
      })),
    }),
  );

  atualizarTelas();
  voltar(competencia, "sucesso", "Base salarial atualizada.", "configurar");
}

/** Uma ação do plano -- o desvio que vira tarefa com dono e prazo. */
export async function criarAcao(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const competencia = String(formData.get("competencia") ?? "");
  if (!ehCompetencia(competencia)) voltar("", "erro", "Competência inválida.");

  const oQue = String(formData.get("o_que") ?? "").trim();
  const responsavel = String(formData.get("responsavel") ?? "").trim();
  const prazo = String(formData.get("prazo") ?? "").trim() || null;
  const funcao = String(formData.get("funcao") ?? "");

  const problema = validarAcao({ oQue, responsavel, prazo });
  if (problema) voltar(competencia, "erro", problema);

  const admin = createAdminClient();
  const { error } = await admin.from("mao_obra_acoes").insert({
    revenda_id: revendaId,
    competencia: primeiroDia(competencia),
    funcao: EH_FUNCAO(funcao) ? funcao : null,
    o_que: oQue.slice(0, LIMITES_MAO_DE_OBRA.textoMax),
    responsavel: responsavel.slice(0, LIMITES_MAO_DE_OBRA.responsavelMax),
    prazo,
    criado_por_nome: perfil.nome,
  });
  if (error) voltar(competencia, "erro", `Não foi possível salvar a ação: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", "Ação incluída no plano.", "resultado");
}

export async function mudarStatusDaAcao(formData: FormData) {
  await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const competencia = String(formData.get("competencia") ?? "");
  if (!id) voltar(competencia, "erro", "Ação inválida.");
  if (!["aberta", "em_andamento", "concluida"].includes(status)) voltar(competencia, "erro", "Situação inválida.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("mao_obra_acoes")
    .update({ status, concluida_em: status === "concluida" ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("revenda_id", revendaId);
  if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", "Situação da ação atualizada.", "resultado");
}

// ------------------------------------------------------------------
// VAGAS PARA O RECRUTAMENTO (25/09/2026)
// ------------------------------------------------------------------

/** Cadastra quem recebe o quadro de vagas. */
export async function adicionarDestinatario(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  const competencia = String(formData.get("competencia") ?? "");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 120) || null;
  const problema = validarEmail(email);
  if (problema) voltar(competencia, "erro", problema);

  const admin = createAdminClient();
  const { error } = await admin
    .from("mao_obra_destinatarios")
    .insert({ revenda_id: revendaId, email, nome, criado_por_nome: perfil.nome });
  if (error?.code === "23505") voltar(competencia, "erro", "Este e-mail já está cadastrado.");
  if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", `${email} vai receber o planejamento.`, "configurar");
}

export async function removerDestinatario(formData: FormData) {
  await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);
  const competencia = String(formData.get("competencia") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) voltar(competencia, "erro", "Destinatário inválido.");

  const admin = createAdminClient();
  const { error } = await admin.from("mao_obra_destinatarios").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) voltar(competencia, "erro", `Não foi possível remover: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", "Destinatário removido.", "configurar");
}

/**
 * FORMALIZAR O PLANEJAMENTO PARA O TIME DE GENTE (V.2 e V.3).
 *
 * O e-mail abre no cliente da pessoa (o app não tem SMTP, e assim ele sai
 * do endereço da empresa). O que fica aqui é a EVIDÊNCIA, em duas partes:
 *   1. o envio: quando, por quem, para quem e o quadro do mês;
 *   2. a FOTOGRAFIA dos 3 meses (migration 143): o que se projetou hoje
 *      para este mês e os dois seguintes. É ela que o V.3 compara daqui a
 *      2-3 meses -- sem congelar, o "projetado" seria recalculado com os
 *      parâmetros de hoje e o comparativo mediria o simulador contra ele
 *      mesmo.
 *
 * Tudo é recalculado AQUI, do banco: o que o formulário mandasse seria a
 * tela de quem clicou, não a verdade do mês.
 */
export async function formalizarPlanejamento(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const competencia = String(formData.get("competencia") ?? "");
  if (!ehCompetencia(competencia)) voltar("", "erro", "Competência inválida.");
  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, LIMITES_MAO_DE_OBRA.observacaoMax) || null;

  /*
    SEM DATA DO ENVIO (29/09/2026, pedido do dono): o registro vale o
    momento do clique, e só dentro do mês-base -- é ele que o envio
    documenta. A coluna `retroativo` fica no banco (registros antigos), mas
    nenhum registro novo nasce retroativo.
  */
  const hoje = hojeNaOperacao();
  if (hoje.slice(0, 7) !== competencia) {
    voltar(competencia, "erro", `A formalização de ${rotuloCompetencia(competencia)} é registrada dentro do próprio mês.`);
  }
  const retroativo = false;
  const enviadoEm = new Date().toISOString();

  const admin = createAdminClient();
  const horizonte = mesesDoPlanejamento(competencia);

  const [configs, salarios, meses, qlpPorMes, { data: destinos }] = await Promise.all([
    // Cada mês com a SUA configuração congelada (migration 152).
    lerConfigsDosMeses(revendaId, horizonte),
    lerSalarios(revendaId),
    lerMesesDoPeriodo(revendaId, horizonte[0], horizonte[2]),
    // O QLP vigente pode ter sido informado meses antes.
    lerRealizadoDoPeriodo(revendaId, "2000-01", horizonte[2]),
    admin.from("mao_obra_destinatarios").select("email").eq("revenda_id", revendaId).eq("ativo", true),
  ]);
  const emails = (destinos ?? []).map((d) => String(d.email));
  if (emails.length === 0) voltar(competencia, "erro", "Cadastre pelo menos um e-mail do time de Gente na aba Configurar.");

  const planejados = horizonte
    .map((c) => ({ competencia: c, mes: meses.get(c) ?? null }))
    .filter((x): x is { competencia: string; mes: MesMaoDeObra } => x.mes != null);
  if (planejados.length === 0) voltar(competencia, "erro", "Lance o volume de pelo menos um dos 3 meses antes de formalizar.");

  const quadros = planejados.map(({ competencia: c, mes }) => {
    const qlp = qlpVigente(qlpPorMes, c);
    const { linhas } = dimensionamentoDoMes(mes, configs.get(c)!.config, salarios, qlp);
    return { competencia: c, mes, qlp, vagas: vagasDoMes(linhas) };
  });

  // 1. O envio, registrado no mês-base (quando se planejou). O quadro que
  // vai nele é o do PRIMEIRO mês à frente -- desde 28/09/2026 o horizonte
  // são os 3 meses seguintes ao escolhido.
  const doMes = quadros[0];
  const totalVagas = doMes.vagas.reduce((s, v) => s + v.vagas, 0);
  const { data: envio, error } = await admin
    .from("mao_obra_envios")
    .insert({
      revenda_id: revendaId,
      competencia: primeiroDia(competencia),
      enviado_por_nome: perfil.nome,
      destinatarios: emails,
      vagas: doMes.vagas.map((v) => ({
        funcao: v.funcao,
        rotulo: v.rotulo,
        dimensionado: v.dimensionado,
        atual: v.atual,
        vagas: v.vagas,
      })),
      total_vagas: totalVagas,
      observacao,
      enviado_em: enviadoEm,
      retroativo,
    })
    .select("id")
    .single();
  if (error) voltar(competencia, "erro", `Não foi possível registrar o envio: ${error.message}`);

  // 2. A fotografia dos 3 meses.
  const { error: erroFoto } = await admin.from("mao_obra_projecoes").insert(
    quadros.map((q) => ({
      revenda_id: revendaId,
      competencia_base: primeiroDia(competencia),
      competencia_alvo: primeiroDia(q.competencia),
      volume_ppr: q.mes.volume_ppr,
      volume_negociado: q.mes.volume_negociado,
      dimensionado: Object.fromEntries(q.vagas.map((v) => [v.funcao, v.dimensionado])),
      total: q.vagas.reduce((s, v) => s + v.dimensionado, 0),
      qlp: Object.keys(q.qlp).length > 0 ? q.qlp : null,
      vagas: q.vagas.reduce((s, v) => s + v.vagas, 0),
      envio_id: envio.id,
      feita_em: enviadoEm,
      retroativa: retroativo,
      feita_por_nome: perfil.nome,
    })),
  );
  if (erroFoto) voltar(competencia, "erro", `O envio foi registrado, mas a fotografia falhou: ${erroFoto.message}`);

  atualizarTelas();
  voltar(
    competencia,
    "sucesso",
    `Planejamento de ${mesesPorExtenso(quadros.map((q) => q.competencia))} formalizado para ${emails.length} destinatário${emails.length === 1 ? "" : "s"}.`,
  );
}

/** O volume realizado de cada dia do mês -- um Salvar para a grade toda. */
export async function salvarDias(formData: FormData) {
  const perfil = await requireModulo(MODULO_MAO_DE_OBRA, "editar", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const competencia = String(formData.get("competencia") ?? "");
  if (!ehCompetencia(competencia)) voltar("", "erro", "Competência inválida.");

  const guardar: {
    revenda_id: string;
    competencia: string;
    dia: number;
    volume_realizado: number | null;
    opera: boolean;
    justificativa_motivo: string | null;
    justificativa: string | null;
    atualizado_por_nome: string;
  }[] = [];
  const apagar: number[] = [];
  for (let dia = 1; dia <= diasDaCompetencia(competencia); dia++) {
    const valor = numero(formData.get(`dia_${dia}`));
    // A caixinha só chega marcada; desmarcada não vem no formulário.
    const opera = formData.get(`opera_${dia}`) != null;
    // A justificativa só vem nos dias acima do ANS com Vendas (+20%): a
    // tela só mostra o campo neles, e dia que voltou para dentro limpa.
    const motivo = String(formData.get(`motivo_${dia}`) ?? "").trim();
    const justificativa = String(formData.get(`justificativa_${dia}`) ?? "").trim().slice(0, 300) || null;
    if (motivo && !(MOTIVOS_DIA_ACIMA as readonly string[]).includes(motivo)) {
      voltar(competencia, "erro", `Motivo inválido no dia ${dia}.`, "dia");
    }
    const padrao = tipoDoDia(`${competencia}-${String(dia).padStart(2, "0")}`) !== "domingo";
    if (valor == null && opera === padrao) {
      // Nada digitado e o dia está como nasce: não precisa de linha.
      apagar.push(dia);
      continue;
    }
    if (valor != null && (valor < 0 || valor > LIMITES_MAO_DE_OBRA.volumeMax)) {
      voltar(competencia, "erro", `Volume inválido no dia ${dia}.`);
    }
    guardar.push({
      revenda_id: revendaId,
      competencia: primeiroDia(competencia),
      dia,
      volume_realizado: valor,
      opera,
      justificativa_motivo: motivo || null,
      justificativa,
      atualizado_por_nome: perfil.nome,
    });
  }

  const admin = createAdminClient();
  if (guardar.length > 0) {
    const { error } = await admin
      .from("mao_obra_dias")
      .upsert(guardar, { onConflict: "revenda_id,competencia,dia" });
    if (error) voltar(competencia, "erro", `Não foi possível salvar: ${error.message}`);
  }
  if (apagar.length > 0) {
    await admin
      .from("mao_obra_dias")
      .delete()
      .eq("revenda_id", revendaId)
      .eq("competencia", primeiroDia(competencia))
      .in("dia", apagar);
  }

  atualizarTelas();
  redirect(`${ROTA}?mes=${competencia}&aba=dia&sucesso=${encodeURIComponent("Volume do dia salvo.")}`);
}

export async function excluirAcao(formData: FormData) {
  await requireModulo(MODULO_MAO_DE_OBRA, "excluir", ROTA);
  const revendaId = await exigirRevenda(ROTA);

  const id = String(formData.get("id") ?? "");
  const competencia = String(formData.get("competencia") ?? "");
  if (!id) voltar(competencia, "erro", "Ação inválida.");

  const admin = createAdminClient();
  const { error } = await admin.from("mao_obra_acoes").delete().eq("id", id).eq("revenda_id", revendaId);
  if (error) voltar(competencia, "erro", `Não foi possível apagar: ${error.message}`);

  atualizarTelas();
  voltar(competencia, "sucesso", "Ação apagada.");
}
