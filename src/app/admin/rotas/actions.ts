"use server";

import { redirect } from "next/navigation";
import { voltarCom } from "@/lib/url-de-volta";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import { criarOuAgrupar } from "@/lib/notificacoes-server";
import {
  baixarTextoDoDrive,
  idDaPasta,
  listarArquivosDaPasta,
  mesDoNome,
} from "@/lib/drive-pasta";
import { lerPlanilhaDeClientesPorMapa, lerPlanilhaDeRotas } from "@/lib/rotas";

const ROTA = "/admin/rotas";

function voltar(chave: "erro" | "sucesso", mensagem: string, destino = ROTA): never {
  redirect(voltarCom(destino, chave, mensagem));
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
  const revendaId = await exigirRevenda("/admin/rotas");
  const { error } = await admin.from("rotas_config").upsert(
    {
      revenda_id: revendaId,
      meta_ocupacao: ocupacao,
      meta_caixas: caixas,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "revenda_id" },
  );

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
  // Quem chamou: a tela do modulo (padrao) ou Fontes de Dados. E o
  // que permite o botao de atualizar existir nos dois lugares sem a
  // logica de importacao ser duplicada -- so o destino do resultado
  // muda, e a mensagem aparece onde a pessoa clicou.
  const destino = String(formData?.get("voltar_para") ?? "") || ROTA;
  const voltarAqui: (c: "erro" | "sucesso", m: string) => never = (c, m) => voltar(c, m, destino);

  const eu = await requireModulo("rotas", "criar");
  const avisar = formData.get("avisar") === "on";

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/rotas");

  const { data: config } = await admin
    .from("rotas_config")
    .select("pasta_id")
    .eq("revenda_id", revendaId)
    .maybeSingle();

  if (!config?.pasta_id) {
    voltarAqui("erro", "Cadastre primeiro o link da pasta do Drive.");
  }

  const { arquivos, erro } = await listarArquivosDaPasta(config.pasta_id);
  if (erro) voltarAqui("erro", `Não consegui ler a pasta: ${erro}.`);

  const relatorio: string[] = [];
  let totalRotas = 0;
  let totalClientes = 0;
  const hojeSP = () =>
    new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  for (const arquivo of arquivos) {
    const texto = await baixarTextoDoDrive(arquivo.id);
    if (!texto) {
      relatorio.push(`${arquivo.nome}: não consegui baixar`);
      continue;
    }

    const { rotas, faltando } = lerPlanilhaDeRotas(texto);
    if (rotas.length === 0) {
      /*
        NÃO É PRÉ-ROTA? TALVEZ SEJA A LISTA DE CLIENTES POR MAPA.

        Pedido do dono (07/09/2026): o motorista precisa saber, antes de
        sair, quais clientes da rota têm particularidade. A planilha da
        pré-rota não serve -- ela traz uma linha por MAPA, com as cidades
        somadas. Este segundo arquivo traz uma linha por CLIENTE.

        Entra na MESMA pasta do Drive e é reconhecido pelo cabeçalho, não
        pelo nome: sem tela nova e sem botão novo. Quem já solta a
        pré-rota lá solta este junto, e o alerta da pré-rota deixa de ser
        por região e passa a ser por cliente sozinho.
      */
      const clientes = lerPlanilhaDeClientesPorMapa(texto);
      if (clientes.length > 0) {
        const linhasDeCliente = clientes.map((c) => ({
          revenda_id: revendaId,
          // Sem data no arquivo, entra com a de hoje: o alerta procura a
          // lista daquele dia e, não achando, usa a mais recente do mapa.
          data: c.data || hojeSP(),
          mapa: c.mapa,
          cod_pdv: c.codPdv,
          nome_pdv: c.nomePdv,
          cidade: c.cidade,
          bairro: c.bairro,
          sequencia: c.sequencia,
          importado_em: new Date().toISOString(),
        }));

        const { error: erroClientes } = await admin
          .from("pa_pdv_do_mapa")
          .upsert(linhasDeCliente, { onConflict: "revenda_id,data,mapa,cod_pdv" });

        if (erroClientes) {
          relatorio.push(`${arquivo.nome}: erro ao gravar os clientes do mapa`);
        } else {
          totalClientes += clientes.length;
          const mapas = new Set(clientes.map((c) => c.mapa)).size;
          relatorio.push(
            `${arquivo.nome}: ${clientes.length} cliente(s) em ${mapas} mapa(s)`,
          );
        }
        continue;
      }

      relatorio.push(
        `${arquivo.nome}: nenhuma rota reconhecida${
          faltando.length ? ` (faltou ${faltando.slice(0, 3).join(", ")})` : ""
        }`,
      );
      continue;
    }

    const linhas = rotas.map((r) => ({
      revenda_id: revendaId,
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
    // (revenda, data, mapa), então roteirização refeita sobrescreve a
    // anterior -- sem uma revenda pisar na numeração da outra.
    const { error } = await admin
      .from("rotas")
      .upsert(linhas, { onConflict: "revenda_id,data,mapa" });

    if (error) {
      relatorio.push(`${arquivo.nome}: erro ao gravar`);
      continue;
    }

    /*
      OS CLIENTES DE CADA MAPA, DA MESMA PLANILHA.

      A coluna "Clientes" traz os códigos separados por barra, com zeros à
      esquerda: `0003163/0000588/0000461/...`. Estava ali desde sempre --
      eu é que não tinha visto, e cheguei a construir um importador para um
      segundo arquivo antes de o dono apontar (07/09/2026).

      É isto que faz o alerta da pré-rota deixar de ser por REGIÃO e passar
      a ser POR CLIENTE, sem base nova e sem importação nova: `avisosDoMapa`
      já procura esta tabela primeiro.

      Falha aqui NÃO derruba a importação da rota: o mapa, o veículo e as
      entregas são o que o motorista abre antes de sair; o alerta é a
      camada de cima, e sem ele a tela volta ao aviso por região.
    */
    const doMapa = rotas.flatMap((r) =>
      r.clientes.map((cod) => ({
        revenda_id: revendaId,
        data: r.data,
        mapa: r.mapa,
        cod_pdv: cod,
        importado_em: new Date().toISOString(),
      })),
    );
    let clientesGravados = 0;
    if (doMapa.length > 0) {
      const { error: erroPdv } = await admin
        .from("pa_pdv_do_mapa")
        .upsert(doMapa, { onConflict: "revenda_id,data,mapa,cod_pdv" });
      if (!erroPdv) {
        clientesGravados = doMapa.length;
        totalClientes += doMapa.length;
      }
    }

    totalRotas += rotas.length;
    const mes = mesDoNome(arquivo.nome);
    relatorio.push(
      `${arquivo.nome}${mes ? ` (${mes})` : ""}: ${rotas.length} rota(s)` +
        (clientesGravados > 0 ? `, ${clientesGravados} cliente(s)` : ""),
    );
  }

  await admin
    .from("rotas_config")
    .update({
      ultima_sincronizacao: new Date().toISOString(),
      ultimo_resultado: relatorio.join(" · "),
    })
    .eq("revenda_id", revendaId);

  // Um arquivo só de clientes é uma importação válida: não há rota nova,
  // mas o alerta da pré-rota passa a ser por cliente.
  if (totalRotas === 0 && totalClientes === 0) {
    voltarAqui("erro", `Nenhuma rota importada. ${relatorio.join(" · ")}`);
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

  voltarAqui(
    "sucesso",
    `${totalRotas} rota(s)${totalClientes > 0 ? ` e ${totalClientes} cliente(s) de mapa` : ""} de ${arquivos.length} arquivo(s). ${relatorio.join(" · ")}`,
  );
}

/** Apaga as rotas de uma data. Útil para corrigir uma importação errada. */
export async function apagarRotasDoDia(formData: FormData) {
  await requireModulo("rotas", "excluir");

  const data = ((formData.get("data") as string) || "").trim();
  if (!data) voltar("erro", "Data inválida.");

  const admin = createAdminClient();
  const revendaId = await exigirRevenda("/admin/rotas");
  const { error } = await admin
    .from("rotas")
    .delete()
    .eq("revenda_id", revendaId)
    .eq("data", data);

  if (error) voltar("erro", error.message);
  voltar("sucesso", `Rotas de ${data.split("-").reverse().join("/")} apagadas.`);
}
