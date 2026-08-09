"use server";

import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarOuAgrupar } from "@/lib/notificacoes-server";
import {
  baixarTextoDoDrive,
  idDaPasta,
  listarArquivosDaPasta,
  mesDoNome,
} from "@/lib/drive-pasta";
import { lerPlanilhaDeRotas } from "@/lib/rotas";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`/admin/rotas?${chave}=${encodeURIComponent(mensagem)}`);
}

/** Guarda o link da pasta para não precisar colar de novo. */
export async function salvarPastaDeRotas(formData: FormData) {
  await requireModulo("rotas", "criar");

  const link = ((formData.get("link") as string) || "").trim();
  const pasta = idDaPasta(link);

  if (!pasta) {
    voltar(
      "erro",
      "Não reconheci o link. Abra a PASTA no Drive e copie o endereço da barra do navegador.",
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("rotas_config")
    .update({ pasta_id: pasta, pasta_link: link, atualizado_em: new Date().toISOString() })
    .eq("id", 1);

  if (error) voltar("erro", error.message);
  voltar("sucesso", "Pasta salva. Agora é só clicar em Atualizar rotas.");
}

/**
 * Metas da operação.
 *
 * É daqui que sai a cor das barras na tela do motorista. Deixar isso no
 * banco em vez de no código significa que mudar a régua é um campo de
 * formulário, não um pedido de alteração.
 */
export async function salvarMetasDeRota(formData: FormData) {
  await requireModulo("rotas", "criar");

  const ocupacao = Number(formData.get("meta_ocupacao"));
  const caixasTexto = ((formData.get("meta_caixas") as string) || "").trim();

  if (!Number.isFinite(ocupacao) || ocupacao <= 0 || ocupacao > 100) {
    voltar("erro", "A meta de ocupação precisa ser um número de 1 a 100.");
  }

  let caixas: number | null = null;
  if (caixasTexto) {
    caixas = Number(caixasTexto.replace(",", "."));
    if (!Number.isFinite(caixas) || caixas <= 0) {
      voltar("erro", "A meta de caixas precisa ser um número maior que zero.");
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("rotas_config")
    .update({
      meta_ocupacao: ocupacao,
      meta_caixas: caixas,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) voltar("erro", error.message);
  voltar(
    "sucesso",
    `Metas salvas: ocupação ${ocupacao}%${caixas ? ` · ${caixas} caixas por viagem` : " · sem meta de caixas"}.`,
  );
}

/**
 * Lê a pasta inteira e importa todos os arquivos de rota que encontrar.
 *
 * Reimporta tudo a cada vez, de propósito: são poucos arquivos de poucos KB,
 * e o mês corrente muda todo dia conforme a roteirização avança. Tentar
 * adivinhar o que mudou economizaria segundos e criaria o risco de deixar
 * dado velho na tela.
 *
 * A data de cada rota vem de DENTRO do arquivo, não do nome. O nome só
 * aparece no relatório da tela, para você conferir o que foi lido.
 */
export async function atualizarRotas(formData: FormData) {
  const eu = await requireModulo("rotas", "criar");
  const avisar = formData.get("avisar") === "on";

  const admin = createAdminClient();

  const { data: config } = await admin
    .from("rotas_config")
    .select("pasta_id")
    .eq("id", 1)
    .maybeSingle();

  if (!config?.pasta_id) {
    voltar("erro", "Cadastre primeiro o link da pasta do Drive.");
  }

  const { arquivos, erro } = await listarArquivosDaPasta(config.pasta_id);
  if (erro) voltar("erro", `Não consegui ler a pasta: ${erro}.`);

  const relatorio: string[] = [];
  let totalRotas = 0;

  for (const arquivo of arquivos) {
    const texto = await baixarTextoDoDrive(arquivo.id);
    if (!texto) {
      relatorio.push(`${arquivo.nome}: não consegui baixar`);
      continue;
    }

    const { rotas, faltando } = lerPlanilhaDeRotas(texto);
    if (rotas.length === 0) {
      relatorio.push(
        `${arquivo.nome}: nenhuma rota reconhecida${
          faltando.length ? ` (faltou ${faltando.slice(0, 3).join(", ")})` : ""
        }`,
      );
      continue;
    }

    const linhas = rotas.map((r) => ({
      data: r.data,
      mapa: r.mapa,
      mapa_original: r.mapaOriginal,
      veiculo: r.veiculo,
      placa: r.placa,
      motorista_codigo: r.motoristaCodigo,
      km_prev: r.kmPrev,
      tempo_prev: r.tempoPrev,
      entregas: r.entregas,
      caixas: r.caixas,
      ocupacao_caixas: r.ocupacaoCaixas,
      peso: r.peso,
      ocupacao_peso: r.ocupacaoPeso,
      armazem: r.armazem,
      classificacao: r.classificacao,
      cidades: r.cidades,
      importado_em: new Date().toISOString(),
      importado_por: eu.id,
    }));

    // Reimportar o mesmo período atualiza em vez de duplicar: a chave é
    // (data, mapa), então roteirização refeita sobrescreve a anterior.
    const { error } = await admin
      .from("rotas")
      .upsert(linhas, { onConflict: "data,mapa" });

    if (error) {
      relatorio.push(`${arquivo.nome}: erro ao gravar`);
      continue;
    }

    totalRotas += rotas.length;
    const mes = mesDoNome(arquivo.nome);
    relatorio.push(
      `${arquivo.nome}${mes ? ` (${mes})` : ""}: ${rotas.length} rota(s)`,
    );
  }

  await admin
    .from("rotas_config")
    .update({
      ultima_sincronizacao: new Date().toISOString(),
      ultimo_resultado: relatorio.join(" · "),
    })
    .eq("id", 1);

  if (totalRotas === 0) {
    voltar("erro", `Nenhuma rota importada. ${relatorio.join(" · ")}`);
  }

  if (avisar) {
    await criarOuAgrupar({
      modulo: "rotas",
      titulo: "Sua pré-rota está disponível!",
      mensagem: "Confira as informações do seu mapa antes de sair.",
      url: "/minha-rota",
      criadoPor: eu.id,
    });
  }

  voltar(
    "sucesso",
    `${totalRotas} rota(s) atualizada(s) de ${arquivos.length} arquivo(s). ${relatorio.join(" · ")}`,
  );
}

/** Apaga as rotas de uma data. Útil para corrigir uma importação errada. */
export async function apagarRotasDoDia(formData: FormData) {
  await requireModulo("rotas", "excluir");

  const data = ((formData.get("data") as string) || "").trim();
  if (!data) voltar("erro", "Data inválida.");

  const admin = createAdminClient();
  const { error } = await admin.from("rotas").delete().eq("data", data);

  if (error) voltar("erro", error.message);
  voltar("sucesso", `Rotas de ${data.split("-").reverse().join("/")} apagadas.`);
}
