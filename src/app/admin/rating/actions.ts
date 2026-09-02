"use server";

import { redirect } from "next/navigation";
import { avisarIndicadorAtualizado } from "@/lib/aviso-indicadores-server";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import {
  baixarTextoDoDrive,
  idDaPasta,
  listarArquivosDaPasta,
  listarSubpastas,
} from "@/lib/drive-pasta";
import { hojeISO } from "@/lib/produtividade-armazem";
import { lerCadastroPessoas, lerViagens, precisaFeedback } from "@/lib/rating";
import { gravarEmLotes, lerPlanilhaLogCo, lerTudoEmPaginas } from "@/lib/rating-server";

const ROTA = "/admin/rating";

function voltar(chave: "erro" | "sucesso", mensagem: string, destino = ROTA): never {
  redirect(`${destino}?${chave}=${encodeURIComponent(mensagem)}`);
}

/** Nome da subpasta -> o que ela contém. */
const PASTA_MOTORISTAS = "01.20.01.47";
const PASTA_AJUDANTES = "01.20.01.48";
const PASTA_VIAGENS = "03.11.29";
const PASTA_AVALIACOES = "LOG.CO";


/**
 * Importa os quatro relatórios e monta a corrente:
 *
 *   avaliação --mapa--> viagem --código+tipo--> pessoa --CPF--> perfil
 *
 * A ordem importa: cadastro e viagens primeiro, porque é deles que sai o
 * dono de cada avaliação. O vínculo é resolvido AQUI e gravado na
 * avaliação -- a tela do motorista pergunta "as minhas de hoje" e isso
 * vira um índice, em vez de três junções a cada abertura.
 *
 * Por padrão só o mês corrente das avaliações: são 8 planilhas de ~1.700
 * linhas cada, e reprocessar tudo todo dia gastaria o tempo da função
 * sem mudar nada nos meses fechados. `tudo=on` faz a carga completa.
 */
export async function importarRating(formData: FormData) {
  // Quem chamou: a tela do modulo (padrao) ou Fontes de Dados. E o
  // que permite o botao de atualizar existir nos dois lugares sem a
  // logica de importacao ser duplicada -- so o destino do resultado
  // muda, e a mensagem aparece onde a pessoa clicou.
  const destino = String(formData?.get("voltar_para") ?? "") || ROTA;
  const voltarAqui: (c: "erro" | "sucesso", m: string) => never = (c, m) => voltar(c, m, destino);

  await requireModulo("rating", "criar");
  const tudo = formData.get("tudo") === "on";

  const admin = createAdminClient();
  const revendaId = await exigirRevenda(ROTA);

  const { data: config } = await admin
    .from("rating_config")
    .select("pasta_id")
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!config?.pasta_id) voltarAqui("erro", "Cadastre primeiro o link da pasta do Drive.");

  const { pastas, erro } = await listarSubpastas(config.pasta_id);
  if (erro) voltarAqui("erro", `Não consegui ler a pasta: ${erro}.`);

  const acharPasta = (nome: string) => pastas.find((p) => p.nome.trim() === nome);
  const relatorio: string[] = [];

  // ---------- 1. CADASTROS ----------
  // Motorista e ajudante são registros SEPARADOS que colidem no número
  // do código -- por isso cada um entra com o seu `tipo`, que faz parte
  // da chave. Ver o comentário da migration 072.
  for (const [nomePasta, tipo] of [
    [PASTA_MOTORISTAS, "motorista"],
    [PASTA_AJUDANTES, "ajudante"],
  ] as const) {
    const pasta = acharPasta(nomePasta);
    if (!pasta) {
      relatorio.push(`${nomePasta}: pasta não encontrada`);
      continue;
    }
    const { arquivos } = await listarArquivosDaPasta(pasta.id);
    if (arquivos.length === 0) {
      relatorio.push(`${nomePasta}: pasta vazia`);
      continue;
    }

    let gravadas = 0;
    let semCpf = 0;
    for (const arquivo of arquivos) {
      const texto = await baixarTextoDoDrive(arquivo.id);
      if (!texto) continue;
      const lido = lerCadastroPessoas(texto, tipo);
      if (lido.faltando.length) {
        relatorio.push(`${arquivo.nome}: faltou ${lido.faltando.join(", ")}`);
        continue;
      }
      const linhas = lido.pessoas.map((p) => ({
        revenda_id: revendaId,
        tipo: p.tipo,
        codigo: p.codigo,
        nome: p.nome,
        cpf: p.cpf,
        status: p.status,
        atualizado_em: new Date().toISOString(),
      }));
      const falha = await gravarEmLotes(linhas, 500, (lote) =>
        admin.from("rating_pessoas").upsert(lote, { onConflict: "revenda_id,tipo,codigo" }),
      );
      if (falha) {
        relatorio.push(`${arquivo.nome}: erro ao gravar (${falha})`);
        continue;
      }
      gravadas += lido.pessoas.length;
      semCpf += lido.semCpf;
    }
    relatorio.push(`${nomePasta}: ${gravadas} ${tipo}(s)${semCpf ? `, ${semCpf} sem CPF` : ""}`);
  }

  // ---------- 2. LIGAR O CADASTRO AOS PERFIS DO APP ----------
  // O CPF é a única chave que os dois lados têm. Feito em memória e num
  // update só por pessoa: são ~250 linhas, não vale um join no banco.
  // Paginado pelo mesmo motivo das viagens: hoje são 69 perfis, mas o dia
  // em que passarem de 1.000 o corte seria silencioso.
  const { linhas: perfis } = await lerTudoEmPaginas<{ id: string; cpf: string | null }>((de, ate) =>
    admin.from("profiles").select("id, cpf").range(de, ate),
  );
  const perfilPorCpf = new Map<string, string>();
  for (const p of perfis) {
    const digitos = String(p.cpf ?? "").replace(/\D/g, "");
    if (digitos.length === 11) perfilPorCpf.set(digitos, p.id);
  }

  const { linhas: pessoas } = await lerTudoEmPaginas<{
    tipo: string; codigo: string; cpf: string | null; colaborador_id: string | null;
  }>((de, ate) =>
    admin
      .from("rating_pessoas")
      .select("tipo, codigo, cpf, colaborador_id")
      .eq("revenda_id", revendaId)
      .range(de, ate),
  );

  let vinculadas = 0;
  for (const pessoa of pessoas) {
    if (!pessoa.cpf) continue;
    const perfilId = perfilPorCpf.get(pessoa.cpf) ?? null;
    if (perfilId === pessoa.colaborador_id) {
      if (perfilId) vinculadas++;
      continue;
    }
    await admin
      .from("rating_pessoas")
      .update({ colaborador_id: perfilId })
      .eq("revenda_id", revendaId)
      .eq("tipo", pessoa.tipo)
      .eq("codigo", pessoa.codigo);
    if (perfilId) vinculadas++;
  }
  relatorio.push(`vínculo com o app: ${vinculadas} pessoa(s)`);

  // ---------- 3. VIAGENS (quem estava em cada mapa) ----------
  const pastaViagens = acharPasta(PASTA_VIAGENS);
  if (pastaViagens) {
    const { arquivos } = await listarArquivosDaPasta(pastaViagens.id);
    let total = 0;
    for (const arquivo of arquivos) {
      const texto = await baixarTextoDoDrive(arquivo.id);
      if (!texto) continue;
      const { viagens, faltando } = lerViagens(texto);
      if (faltando.length) {
        relatorio.push(`${arquivo.nome}: faltou ${faltando.join(", ")}`);
        continue;
      }
      const linhas = viagens.map((v) => ({
        revenda_id: revendaId,
        mapa: v.mapa,
        data: v.data,
        placa: v.placa,
        supervisor_nome: v.supervisorNome,
        motorista_codigo: v.motoristaCodigo,
        motorista_nome: v.motoristaNome,
        ajudante1_codigo: v.ajudante1Codigo,
        ajudante1_nome: v.ajudante1Nome,
        ajudante2_codigo: v.ajudante2Codigo,
        ajudante2_nome: v.ajudante2Nome,
        atualizado_em: new Date().toISOString(),
      }));
      const falha = await gravarEmLotes(linhas, 500, (lote) =>
        admin.from("rating_viagens").upsert(lote, { onConflict: "revenda_id,mapa" }),
      );
      if (falha) {
        relatorio.push(`${arquivo.nome}: erro ao gravar (${falha})`);
        continue;
      }
      total += viagens.length;
    }
    relatorio.push(`${PASTA_VIAGENS}: ${total} mapa(s)`);
  } else {
    relatorio.push(`${PASTA_VIAGENS}: pasta não encontrada`);
  }

  // ---------- 4. AVALIAÇÕES ----------
  const pastaAvaliacoes = acharPasta(PASTA_AVALIACOES);
  if (!pastaAvaliacoes) {
    await registrar(admin, revendaId, relatorio);
    voltarAqui("erro", `Pasta ${PASTA_AVALIACOES} não encontrada. ${relatorio.join(" · ")}`);
  }

  // Mapas e pessoas já gravados: é com eles que cada avaliação acha o
  // dono. As DUAS leituras passam de 1.000 linhas (3.651 viagens), então
  // vão paginadas -- ler sem paginar foi o que deixou 90% das avaliações
  // órfãs na primeira importação. Ver lerTudoEmPaginas.
  type ViagemBanco = {
    mapa: string;
    motorista_codigo: string | null; motorista_nome: string | null;
    ajudante1_codigo: string | null; ajudante1_nome: string | null;
    ajudante2_codigo: string | null; ajudante2_nome: string | null;
  };
  const { linhas: viagensBanco, erro: erroViagens } = await lerTudoEmPaginas<ViagemBanco>((de, ate) =>
    admin
      .from("rating_viagens")
      .select("mapa, motorista_codigo, motorista_nome, ajudante1_codigo, ajudante1_nome, ajudante2_codigo, ajudante2_nome")
      .eq("revenda_id", revendaId)
      .range(de, ate),
  );
  if (erroViagens) {
    await registrar(admin, revendaId, [...relatorio, `erro ao ler as viagens: ${erroViagens}`]);
    voltarAqui("erro", `Não consegui ler as viagens: ${erroViagens}`);
  }
  const viagemPorMapa = new Map(viagensBanco.map((v) => [v.mapa, v]));

  type PessoaBanco = { tipo: string; codigo: string; nome: string; colaborador_id: string | null };
  const { linhas: pessoasBanco } = await lerTudoEmPaginas<PessoaBanco>((de, ate) =>
    admin
      .from("rating_pessoas")
      .select("tipo, codigo, nome, colaborador_id")
      .eq("revenda_id", revendaId)
      .range(de, ate),
  );
  // A chave é tipo+código de propósito: o mesmo número é uma pessoa como
  // motorista e outra como ajudante.
  const pessoaPorChave = new Map(pessoasBanco.map((p) => [`${p.tipo}:${p.codigo}`, p]));

  const { arquivos } = await listarArquivosDaPasta(pastaAvaliacoes.id);
  // O mês é o da OPERAÇÃO, não o do servidor: a Vercel roda em UTC e às
  // 21h de 31/08 em São Paulo já é 01/09 lá. Sem isto, a importação do
  // "mês corrente" procuraria o arquivo do mês seguinte na virada.
  const [anoAtual, mesAtual] = hojeISO().split("-");
  const escolhidos = tudo
    ? arquivos
    : arquivos.filter((a) => a.nome.includes(`${mesAtual}.${anoAtual}`));

  if (escolhidos.length === 0) {
    relatorio.push(
      `${PASTA_AVALIACOES}: nenhuma planilha de ${mesAtual}/${anoAtual} (marque "importar todos os meses" para a carga completa)`,
    );
  }

  let totalAvaliacoes = 0;
  let semDono = 0;
  let pendentes = 0;

  for (const arquivo of escolhidos) {
    const { avaliacoes, erro: erroLeitura } = await lerPlanilhaLogCo(arquivo.id);
    if (erroLeitura) {
      relatorio.push(`${arquivo.nome}: ${erroLeitura}`);
      continue;
    }

    const linhas = avaliacoes.map((a) => {
      const viagem = viagemPorMapa.get(a.mapa);
      const mot = viagem?.motorista_codigo
        ? pessoaPorChave.get(`motorista:${viagem.motorista_codigo}`)
        : undefined;
      const aj1 = viagem?.ajudante1_codigo
        ? pessoaPorChave.get(`ajudante:${viagem.ajudante1_codigo}`)
        : undefined;
      const aj2 = viagem?.ajudante2_codigo
        ? pessoaPorChave.get(`ajudante:${viagem.ajudante2_codigo}`)
        : undefined;

      if (!viagem?.motorista_codigo) semDono++;
      if (precisaFeedback(a.nota)) pendentes++;

      return {
        revenda_id: revendaId,
        data_avaliacao: a.dataAvaliacao,
        nota: a.nota,
        classificacao: a.classificacao,
        mapa: a.mapa,
        cod_pdv: a.codPdv,
        nome_pdv: a.nomePdv,
        pedido: a.pedido,
        motivo: a.motivo,
        comentario: a.comentario,
        estado: a.estado,
        cidade: a.cidade,
        motorista_colaborador_id: mot?.colaborador_id ?? null,
        // O nome do cadastro vem completo; o da viagem vem cortado em 30
        // caracteres. Prefere o do cadastro quando existir.
        motorista_nome: mot?.nome ?? viagem?.motorista_nome ?? null,
        ajudante1_colaborador_id: aj1?.colaborador_id ?? null,
        ajudante1_nome: aj1?.nome ?? viagem?.ajudante1_nome ?? null,
        ajudante2_colaborador_id: aj2?.colaborador_id ?? null,
        ajudante2_nome: aj2?.nome ?? viagem?.ajudante2_nome ?? null,
        importado_em: new Date().toISOString(),
      };
    });

    const falha = await gravarEmLotes(linhas, 500, (lote) =>
      admin
        .from("rating_avaliacoes")
        .upsert(lote, { onConflict: "revenda_id,data_avaliacao,mapa,cod_pdv,pedido" }),
    );
    if (falha) {
      relatorio.push(`${arquivo.nome}: erro ao gravar (${falha})`);
      continue;
    }
    totalAvaliacoes += avaliacoes.length;
  }

  relatorio.push(
    `${PASTA_AVALIACOES}: ${totalAvaliacoes} avaliação(ões)` +
      (semDono ? `, ${semDono} sem motorista identificado` : "") +
      (pendentes ? `, ${pendentes} abaixo de 5 estrelas` : ""),
  );

  await registrar(admin, revendaId, relatorio);

  if (totalAvaliacoes === 0) {
    voltarAqui("erro", `Nenhuma avaliação importada. ${relatorio.join(" · ")}`);
  }

  // Avisa quem ficou com pendencia. Direcionado: so quem tem algo a
  // explicar recebe, com o numero dele. Silencioso -- um erro de
  // notificacao nao pode derrubar um import que ja gravou tudo.
  await avisarIndicadorAtualizado(revendaId, "rating");

  voltarAqui("sucesso", `Importado: ${relatorio.join(" · ")}`);
}

async function registrar(
  admin: ReturnType<typeof createAdminClient>,
  revendaId: string,
  relatorio: string[],
) {
  await admin
    .from("rating_config")
    .update({
      ultima_sincronizacao: new Date().toISOString(),
      ultimo_resultado: relatorio.join(" · "),
    })
    .eq("revenda_id", revendaId);
}
