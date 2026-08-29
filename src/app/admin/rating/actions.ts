"use server";

import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirRevenda } from "@/lib/revendas";
import {
  baixarTextoDoDrive,
  idDaPasta,
  listarArquivosDaPasta,
  listarSubpastas,
} from "@/lib/drive-pasta";
import { lerCadastroPessoas, lerViagens, precisaFeedback } from "@/lib/rating";
import { gravarEmLotes, lerPlanilhaLogCo } from "@/lib/rating-server";

const ROTA = "/admin/rating";

function voltar(chave: "erro" | "sucesso", mensagem: string): never {
  redirect(`${ROTA}?${chave}=${encodeURIComponent(mensagem)}`);
}

/** Nome da subpasta -> o que ela contém. */
const PASTA_MOTORISTAS = "01.20.01.47";
const PASTA_AJUDANTES = "01.20.01.48";
const PASTA_VIAGENS = "03.11.29";
const PASTA_AVALIACOES = "LOG.CO";

export async function salvarPastaDeRating(formData: FormData) {
  await requireModulo("rating", "criar");

  const link = ((formData.get("link") as string) || "").trim();
  const pasta = idDaPasta(link);
  if (!pasta) {
    voltar("erro", "Não reconheci o link. Abra a pasta MÃE no Drive e copie o endereço da barra do navegador.");
  }

  const admin = createAdminClient();
  const revendaId = await exigirRevenda(ROTA);
  const { error } = await admin.from("rating_config").upsert(
    { revenda_id: revendaId, pasta_id: pasta, pasta_link: link, atualizado_em: new Date().toISOString() },
    { onConflict: "revenda_id" },
  );
  if (error) voltar("erro", error.message);
  voltar("sucesso", "Pasta salva. Agora clique em Importar.");
}

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
  await requireModulo("rating", "criar");
  const tudo = formData.get("tudo") === "on";

  const admin = createAdminClient();
  const revendaId = await exigirRevenda(ROTA);

  const { data: config } = await admin
    .from("rating_config")
    .select("pasta_id")
    .eq("revenda_id", revendaId)
    .maybeSingle();
  if (!config?.pasta_id) voltar("erro", "Cadastre primeiro o link da pasta do Drive.");

  const { pastas, erro } = await listarSubpastas(config.pasta_id);
  if (erro) voltar("erro", `Não consegui ler a pasta: ${erro}.`);

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
  const { data: perfis } = await admin.from("profiles").select("id, cpf");
  const perfilPorCpf = new Map<string, string>();
  for (const p of perfis ?? []) {
    const digitos = String(p.cpf ?? "").replace(/\D/g, "");
    if (digitos.length === 11) perfilPorCpf.set(digitos, p.id);
  }

  const { data: pessoas } = await admin
    .from("rating_pessoas")
    .select("tipo, codigo, cpf, colaborador_id")
    .eq("revenda_id", revendaId);

  let vinculadas = 0;
  for (const pessoa of pessoas ?? []) {
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
    voltar("erro", `Pasta ${PASTA_AVALIACOES} não encontrada. ${relatorio.join(" · ")}`);
  }

  // Mapas e pessoas já gravados: é com eles que cada avaliação acha o dono.
  const { data: viagensBanco } = await admin
    .from("rating_viagens")
    .select("mapa, motorista_codigo, motorista_nome, ajudante1_codigo, ajudante1_nome, ajudante2_codigo, ajudante2_nome")
    .eq("revenda_id", revendaId);
  const viagemPorMapa = new Map((viagensBanco ?? []).map((v) => [v.mapa, v]));

  const { data: pessoasBanco } = await admin
    .from("rating_pessoas")
    .select("tipo, codigo, nome, colaborador_id")
    .eq("revenda_id", revendaId);
  // A chave é tipo+código de propósito: o mesmo número é uma pessoa como
  // motorista e outra como ajudante.
  const pessoaPorChave = new Map(
    (pessoasBanco ?? []).map((p) => [`${p.tipo}:${p.codigo}`, p]),
  );

  const { arquivos } = await listarArquivosDaPasta(pastaAvaliacoes.id);
  const mesAtual = String(new Date().getMonth() + 1).padStart(2, "0");
  const anoAtual = String(new Date().getFullYear());
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
    voltar("erro", `Nenhuma avaliação importada. ${relatorio.join(" · ")}`);
  }
  voltar("sucesso", `Importado: ${relatorio.join(" · ")}`);
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
