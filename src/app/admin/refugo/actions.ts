"use server";

import { redirect } from "next/navigation";
import { avisarIndicadorAtualizado } from "@/lib/aviso-indicadores-server";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { baixarTextoDoDrive, listarArquivosDaPasta, listarSubpastas } from "@/lib/drive-pasta";
import { gravarEmLotes, lerTudoEmPaginas } from "@/lib/rating-server";
import { lerRelatorioDeRefugo } from "@/lib/refugo";

const ROTA = "/admin/refugo";
const PASTA_REFUGO = "Refugo";

function voltar(chave: "erro" | "sucesso", mensagem: string, destino = ROTA): never {
  redirect(`${destino}?${chave}=${encodeURIComponent(mensagem)}`);
}

/** Compara nome de gente ignorando acento, caixa e espaço repetido. */
function mesmoNome(a: string | null, b: string | null): boolean {
  const limpar = (s: string | null) =>
    (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const x = limpar(a);
  const y = limpar(b);
  return Boolean(x) && x === y;
}


/** O valor unitário de um item, em reais por garrafa. */
export async function salvarValorDoItem(formData: FormData) {
  await requireModulo("refugo", "editar");

  const codigo = String(formData.get("codigo") ?? "").trim();
  if (!codigo) voltar("erro", "Item inválido.");

  const bruto = String(formData.get("valor") ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!bruto) voltar("erro", "Informe o valor.");
  const valor = Number(bruto);
  if (!Number.isFinite(valor) || valor < 0) voltar("erro", "Valor inválido.");
  if (valor > 10_000) voltar("erro", "Valor fora do razoável -- confira o que digitou.");

  const admin = createAdminClient();
  const revendaId = await exigirRevenda(ROTA);
  const { error } = await admin
    .from("refugo_itens")
    .update({ valor_unitario: valor, atualizado_em: new Date().toISOString() })
    .eq("revenda_id", revendaId)
    .eq("codigo", codigo);

  if (error) voltar("erro", `Não foi possível salvar: ${error.message}`);
  voltar("sucesso", "Valor salvo.");
}

/**
 * Importa o relatório 03.11.34.05 e liga cada aferição às pessoas:
 *
 *  - MOTORISTA: vem no próprio relatório (Cod. Motorista) -- conferido
 *    nos 8 meses de 2026, bate com o 03.11.29 em 434 de 434 linhas.
 *  - AJUDANTE: sai do cruzamento pelo mapa com rating_viagens, porque o
 *    campo do relatório de refugo vem "Não cadastrado" em 427 das 434.
 *  - CONFERENTE: só tem nome ("Lucas P" no código), então casa por nome
 *    com os perfis. São 6 pessoas e todas casaram.
 *
 * Depende do Rating já ter sido importado: é de lá que vêm o cadastro de
 * pessoas e a tabela de viagens.
 */
export async function importarRefugo(formData?: FormData) {
  // Quem chamou: a tela do modulo (padrao) ou Fontes de Dados. E o
  // que permite o botao de atualizar existir nos dois lugares sem a
  // logica de importacao ser duplicada -- so o destino do resultado
  // muda, e a mensagem aparece onde a pessoa clicou.
  const destino = String(formData?.get("voltar_para") ?? "") || ROTA;
  const voltarAqui: (c: "erro" | "sucesso", m: string) => never = (c, m) => voltar(c, m, destino);

  await requireModulo("refugo", "criar");

  const admin = createAdminClient();
  const revendaId = await exigirRevenda(ROTA);

  const [{ data: cfg }, { data: cfgRating }] = await Promise.all([
    admin.from("refugo_config").select("pasta_id").eq("revenda_id", revendaId).maybeSingle(),
    admin.from("rating_config").select("pasta_id").eq("revenda_id", revendaId).maybeSingle(),
  ]);

  // A pasta Refugo mora dentro da mesma pasta mãe do Rating, então quando
  // não há link próprio o app reaproveita aquele -- uma coisa a menos
  // para colar errado.
  const pastaMae = cfg?.pasta_id || cfgRating?.pasta_id;
  if (!pastaMae) voltarAqui("erro", "Cadastre o link da pasta do Drive (aqui ou em Rating de Entrega).");

  const { pastas, erro } = await listarSubpastas(pastaMae);
  if (erro) voltarAqui("erro", `Não consegui ler a pasta: ${erro}.`);

  const pasta = pastas.find((p) => p.nome.trim().toLowerCase() === PASTA_REFUGO.toLowerCase());
  if (!pasta) voltarAqui("erro", `Não achei a subpasta "${PASTA_REFUGO}" dentro da pasta do Drive.`);

  const { arquivos } = await listarArquivosDaPasta(pasta.id);
  if (arquivos.length === 0) voltarAqui("erro", `A pasta "${PASTA_REFUGO}" está vazia.`);

  // --- Quem é quem: vem do Rating, que já resolveu CPF -> perfil ---
  type Pessoa = { tipo: string; codigo: string; nome: string; colaborador_id: string | null };
  const { linhas: pessoas } = await lerTudoEmPaginas<Pessoa>((de, ate) =>
    admin.from("rating_pessoas").select("tipo, codigo, nome, colaborador_id").eq("revenda_id", revendaId).range(de, ate),
  );
  const motoristaPorCodigo = new Map(
    pessoas.filter((p) => p.tipo === "motorista").map((p) => [p.codigo, p]),
  );

  type Viagem = {
    mapa: string;
    ajudante1_codigo: string | null; ajudante1_nome: string | null;
    ajudante2_codigo: string | null; ajudante2_nome: string | null;
  };
  const { linhas: viagens } = await lerTudoEmPaginas<Viagem>((de, ate) =>
    admin
      .from("rating_viagens")
      .select("mapa, ajudante1_codigo, ajudante1_nome, ajudante2_codigo, ajudante2_nome")
      .eq("revenda_id", revendaId)
      .range(de, ate),
  );
  const viagemPorMapa = new Map(viagens.map((v) => [v.mapa, v]));
  const ajudantePorCodigo = new Map(
    pessoas.filter((p) => p.tipo === "ajudante").map((p) => [p.codigo, p]),
  );

  const { linhas: perfis } = await lerTudoEmPaginas<{ id: string; nome: string }>((de, ate) =>
    admin.from("profiles").select("id, nome").range(de, ate),
  );

  const relatorio: string[] = [];
  let total = 0;
  let semMotorista = 0;
  let semAjudante = 0;
  let semConferente = 0;
  let alertas = 0;
  const itens = new Map<string, string>();

  for (const arquivo of arquivos) {
    const texto = await baixarTextoDoDrive(arquivo.id);
    if (!texto) {
      relatorio.push(`${arquivo.nome}: não consegui baixar`);
      continue;
    }

    const lido = lerRelatorioDeRefugo(texto);
    if (lido.faltando.length) {
      relatorio.push(`${arquivo.nome}: faltou ${lido.faltando.join(", ")}`);
      continue;
    }
    if (lido.contaNaoFecha > 0) {
      relatorio.push(`⚠️ ${arquivo.nome}: ${lido.contaNaoFecha} linha(s) em que aferido − boa ≠ soma dos defeitos`);
    }

    const linhas = lido.afericoes.map((a) => {
      const mot = a.motoristaCodigo ? motoristaPorCodigo.get(a.motoristaCodigo) : undefined;
      const viagem = viagemPorMapa.get(a.mapa);
      const aj1 = viagem?.ajudante1_codigo ? ajudantePorCodigo.get(viagem.ajudante1_codigo) : undefined;
      const aj2 = viagem?.ajudante2_codigo ? ajudantePorCodigo.get(viagem.ajudante2_codigo) : undefined;
      const conf = perfis.find((p) => mesmoNome(p.nome, a.conferenteNome));

      if (!mot?.colaborador_id) semMotorista++;
      if (!viagem?.ajudante1_codigo) semAjudante++;
      if (!conf) semConferente++;
      if (a.totalAferido > 0 && (a.qtFaltante + a.qtQualidade) / a.totalAferido >= 0.1) alertas++;
      if (a.itemDescricao) itens.set(a.itemCodigo, a.itemDescricao);

      return {
        revenda_id: revendaId,
        data: a.data,
        mapa: a.mapa,
        veiculo: a.veiculo,
        placa: a.placa,
        transportadora: a.transportadora,
        tipo_sorteio: a.tipoSorteio,
        pct_incidencia_veiculo: a.pctIncidenciaVeiculo,
        pct_nao_aferido: a.pctNaoAferido,
        item_codigo: a.itemCodigo,
        item_descricao: a.itemDescricao,
        total_aferido: a.totalAferido,
        qt_boa: a.qtBoa,
        qt_faltante: a.qtFaltante,
        qt_qualidade: a.qtQualidade,
        defeitos: a.defeitos,
        motorista_codigo: a.motoristaCodigo,
        motorista_nome: mot?.nome ?? a.motoristaNome,
        conferente_codigo: a.conferenteCodigo,
        conferente_nome: a.conferenteNome,
        motorista_colaborador_id: mot?.colaborador_id ?? null,
        ajudante1_colaborador_id: aj1?.colaborador_id ?? null,
        ajudante1_nome: aj1?.nome ?? viagem?.ajudante1_nome ?? null,
        ajudante2_colaborador_id: aj2?.colaborador_id ?? null,
        ajudante2_nome: aj2?.nome ?? viagem?.ajudante2_nome ?? null,
        conferente_colaborador_id: conf?.id ?? null,
        importado_em: new Date().toISOString(),
      };
    });

    const falha = await gravarEmLotes(linhas, 500, (lote) =>
      admin.from("refugo_afericoes").upsert(lote, { onConflict: "revenda_id,data,mapa,item_codigo" }),
    );
    if (falha) {
      relatorio.push(`${arquivo.nome}: erro ao gravar (${falha})`);
      continue;
    }
    total += lido.afericoes.length;
    relatorio.push(`${arquivo.nome}: ${lido.afericoes.length} aferição(ões)`);
  }

  // Os itens aparecem sozinhos no cadastro de valores -- ninguém precisa
  // digitar código de garrafa. Só o preço fica por conta da liderança, e
  // um item que já tem preço não é sobrescrito.
  if (itens.size > 0) {
    const linhasItens = [...itens].map(([codigo, descricao]) => ({
      revenda_id: revendaId,
      codigo,
      descricao,
      atualizado_em: new Date().toISOString(),
    }));
    await admin.from("refugo_itens").upsert(linhasItens, { onConflict: "revenda_id,codigo", ignoreDuplicates: true });
    relatorio.push(`${itens.size} item(ns) no cadastro de valores`);
  }

  if (semMotorista) relatorio.push(`${semMotorista} sem motorista no app`);
  if (semAjudante) relatorio.push(`${semAjudante} sem ajudante (mapa sem tripulação)`);
  if (semConferente) relatorio.push(`${semConferente} sem conferente no app`);
  if (alertas) relatorio.push(`⚠️ ${alertas} aferição(ões) destoante(s)`);

  await admin
    .from("refugo_config")
    .upsert(
      {
        revenda_id: revendaId,
        ultima_sincronizacao: new Date().toISOString(),
        ultimo_resultado: relatorio.join(" · "),
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "revenda_id" },
    );

  if (total === 0) voltarAqui("erro", `Nenhuma aferição importada. ${relatorio.join(" · ")}`);

  // Avisa quem ficou com pendencia. Direcionado: so quem tem algo a
  // explicar recebe, com o numero dele. Silencioso -- um erro de
  // notificacao nao pode derrubar um import que ja gravou tudo.
  await avisarIndicadorAtualizado(revendaId, "refugo");

  voltarAqui("sucesso", `Importado: ${relatorio.join(" · ")}`);
}
