import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { clientesPorCodigo } from "@/lib/clientes-base-server";
import {
  PESO_SEVERIDADE,
  avisosDaRegiao,
  avisosDoPdv,
  diasAte,
  montarMensagem,
  normalizarCodPdv,
  normalizarJanelas,
  rotuloDoHorario,
  rotuloDosDias,
  sugestoesDeDetrator,
  valeHoje,
  valeNoDia,
  type AvaliacaoDoPdv,
  type Categoria,
  type Janela,
  type Particularidade,
  type Severidade,
  type SugestaoDetrator,
} from "@/lib/pdv-particularidades";

/**
 * O LADO DO BANCO DAS PARTICULARIDADES DO PDV.
 *
 * A regra mora em lib/pdv-particularidades.ts, pura e testada. Aqui é a
 * leitura -- e uma decisão que vale explicar: NÃO EXISTE CADASTRO DE PDV
 * NESTE APP, e este módulo não cria um.
 *
 * O cliente já está no Rating (1.216 PDVs distintos, `cod_pdv` presente
 * em 100% das 14.623 avaliações) e na Devolução. Criar uma terceira lista
 * de clientes daria três verdades sobre o mesmo cliente e a obrigação de
 * manter as três em dia -- e a terceira envelheceria primeiro, porque
 * seria a única alimentada à mão. A particularidade se pendura no CÓDIGO;
 * o nome e a cidade vêm de quem já os tem, e ficam gravados na linha para
 * a tela não depender disso depois.
 */

const LIMITE_BUSCA = 12;

export type PdvEncontrado = {
  codPdv: string;
  nomePdv: string | null;
  cidade: string | null;
  /** Quantas entregas avaliadas -- diz se o código existe mesmo. */
  avaliacoes: number;
  /** Nota média, quando há. É o contexto que a pessoa quer ao cadastrar. */
  media: number | null;
  detratoras: number;
};

/**
 * A BUSCA DO PDV, por código ou por nome.
 *
 * DUAS BASES, e a ordem entre elas é o ponto:
 *
 *   1. A BASE DE CLIENTES do Drive (`pa_pdv_clientes`), quando importada.
 *      É a lista completa e atualizada do sistema da revenda -- o dono
 *      pediu justamente isso: "seria melhor linkar ela à busca dos PDVs,
 *      pois ela estará completa e atualizada sempre que necessário".
 *
 *   2. O RATING, sempre. Ele traz o que a base não tem: a nota e quantas
 *      vezes o cliente avaliou como detrator.
 *
 * O RATING SÓ CONHECE QUEM JÁ FOI AVALIADO, e era essa a limitação: o
 * cliente novo, ou o que nunca respondeu pesquisa, não aparecia na busca e
 * a pessoa tinha que digitar o código de cabeça. Com a base, ele aparece.
 *
 * VEM COM A NOTA JUNTO, e isso não é enfeite: quem vai cadastrar "cliente
 * detrator" precisa ver se é caso disso, e quem vai cadastrar um horário
 * de descarga se beneficia de saber que aquele cliente já reclamou de
 * atraso três vezes.
 */
export async function buscarPdv(revendaId: string, termo: string): Promise<PdvEncontrado[]> {
  const t = termo.trim();
  if (t.length < 2) return [];

  const admin = createAdminClient();
  const codigo = normalizarCodPdv(t);

  // A base de clientes, quando existe. Erro engolido: quem não rodou a
  // migration 107 (ou não importou) continua com a busca do Rating, que é
  // como era antes -- e não com uma tela quebrada.
  const { data: daBase } = await admin
    .from("pa_pdv_clientes")
    .select("cod_pdv, nome, cidade")
    .eq("revenda_id", revendaId)
    .or(`cod_pdv.eq.${codigo},nome.ilike.%${t}%`)
    .limit(60);

  // Duas consultas em vez de um `or` gigante: o `ilike` no nome e o
  // casamento por código são perguntas diferentes, e juntá-las numa só
  // deixaria o índice de fora em uma delas.
  const [porNome, porCodigo] = await Promise.all([
    admin
      .from("rating_avaliacoes")
      .select("cod_pdv, nome_pdv, cidade, nota, classificacao")
      .eq("revenda_id", revendaId)
      .ilike("nome_pdv", `%${t}%`)
      .limit(400),
    admin
      .from("rating_avaliacoes")
      .select("cod_pdv, nome_pdv, cidade, nota, classificacao")
      .eq("revenda_id", revendaId)
      .or(`cod_pdv.eq.${codigo},cod_pdv.ilike.%${codigo}`)
      .limit(400),
  ]);

  const porPdv = new Map<
    string,
    { nome: string | null; cidade: string | null; notas: number[]; det: number }
  >();
  type LinhaAval = {
    cod_pdv: string | null;
    nome_pdv: string | null;
    cidade: string | null;
    nota: number;
    classificacao: string;
  };
  const encontradas = [
    ...((porNome.data ?? []) as LinhaAval[]),
    ...((porCodigo.data ?? []) as LinhaAval[]),
  ];
  for (const l of encontradas) {
    const cod = normalizarCodPdv(l.cod_pdv);
    if (!cod) continue;
    const atual = porPdv.get(cod) ?? { nome: l.nome_pdv, cidade: l.cidade, notas: [], det: 0 };
    atual.notas.push(l.nota);
    if (l.classificacao === "detrator") atual.det += 1;
    porPdv.set(cod, atual);
  }

  // A base entra DEPOIS e sem apagar o que o Rating trouxe: quem já foi
  // avaliado mantém a nota. O que ela acrescenta é o cliente que o Rating
  // não conhece -- e, para quem ele conhece, o nome mais atual dos dois.
  for (const c of daBase ?? []) {
    const cod = normalizarCodPdv(c.cod_pdv as string);
    if (!cod) continue;
    const atual = porPdv.get(cod);
    if (atual) {
      atual.nome = (c.nome as string) ?? atual.nome;
      atual.cidade = (c.cidade as string) ?? atual.cidade;
    } else {
      porPdv.set(cod, {
        nome: (c.nome as string) ?? null,
        cidade: (c.cidade as string) ?? null,
        notas: [],
        det: 0,
      });
    }
  }

  return [...porPdv.entries()]
    .map(([codPdv, v]) => ({
      codPdv,
      nomePdv: v.nome,
      cidade: v.cidade,
      avaliacoes: v.notas.length,
      media: v.notas.length
        ? Math.round((v.notas.reduce((t2, n) => t2 + n, 0) / v.notas.length) * 10) / 10
        : null,
      detratoras: v.det,
    }))
    // O código exato primeiro: quem digitou o código quer aquele.
    .sort((a, b) => {
      if (a.codPdv === codigo) return -1;
      if (b.codPdv === codigo) return 1;
      return b.avaliacoes - a.avaliacoes;
    })
    .slice(0, LIMITE_BUSCA);
}

type LinhaCategoria = {
  id: string;
  nome: string;
  emoji: string | null;
  ajuda: string | null;
  severidade: string;
  exige_prazo: boolean;
  exige_horario: boolean;
  alerta_na_rota: boolean;
  mensagem_modelo: string | null;
  ordem: number;
  ativo: boolean;
};

type LinhaParticularidade = {
  id: string;
  categoria_id: string;
  cod_pdv: string;
  nome_pdv: string | null;
  cidade: string | null;
  bairro: string | null;
  aviso: string;
  detalhe: string | null;
  janelas: Janela[] | null;
  dias_semana: number[] | null;
  de: string | null;
  ate: string | null;
  status: string;
  origem: string;
  criado_por_nome: string | null;
  criado_em: string;
  resolvido_em: string | null;
  resolvido_por_nome: string | null;
  resolucao: string | null;
};

export type CategoriaCompleta = Categoria & {
  ajuda: string | null;
  ordem: number;
  ativo: boolean;
};

export type ParticularidadeCompleta = Particularidade & {
  origem: string;
  criadoPorNome: string | null;
  criadoEm: string;
  resolvidoEm: string | null;
  resolvidoPorNome: string | null;
  resolucao: string | null;
};

const paraCategoria = (l: LinhaCategoria): CategoriaCompleta => ({
  id: l.id,
  nome: l.nome,
  emoji: l.emoji,
  ajuda: l.ajuda,
  severidade: (l.severidade === "info" || l.severidade === "critico" ? l.severidade : "atencao"),
  exigePrazo: l.exige_prazo,
  exigeHorario: l.exige_horario,
  alertaNaRota: l.alerta_na_rota,
  mensagemModelo: l.mensagem_modelo,
  ordem: l.ordem,
  ativo: l.ativo,
});

const paraParticularidade = (l: LinhaParticularidade): ParticularidadeCompleta => ({
  id: l.id,
  categoriaId: l.categoria_id,
  codPdv: l.cod_pdv,
  nomePdv: l.nome_pdv,
  cidade: l.cidade,
  bairro: l.bairro,
  aviso: l.aviso,
  detalhe: l.detalhe,
  janelas: normalizarJanelas(l.janelas),
  diasSemana: l.dias_semana,
  de: l.de,
  ate: l.ate,
  status: (l.status === "resolvida" || l.status === "expirada" ? l.status : "ativa"),
  origem: l.origem,
  criadoPorNome: l.criado_por_nome,
  criadoEm: l.criado_em,
  resolvidoEm: l.resolvido_em,
  resolvidoPorNome: l.resolvido_por_nome,
  resolucao: l.resolucao,
});

export async function categoriasDaRevenda(
  revendaId: string,
  { incluirInativas = false } = {},
): Promise<CategoriaCompleta[]> {
  const admin = createAdminClient();
  let consulta = admin
    .from("pa_pdv_categorias")
    .select(
      "id, nome, emoji, ajuda, severidade, exige_prazo, exige_horario, alerta_na_rota, mensagem_modelo, ordem, ativo",
    )
    .eq("revenda_id", revendaId)
    .order("ordem");
  if (!incluirInativas) consulta = consulta.eq("ativo", true);

  const { data, error } = await consulta;
  // Erro não vira lista vazia: sem categoria a tela diria "cadastre a
  // primeira" para quem já tem onze.
  if (error) throw new Error(`Não foi possível ler as categorias: ${error.message}`);
  return ((data ?? []) as LinhaCategoria[]).map(paraCategoria);
}

export async function particularidadesDaRevenda(
  revendaId: string,
  { status }: { status?: string } = {},
): Promise<ParticularidadeCompleta[]> {
  const admin = createAdminClient();
  let consulta = admin
    .from("pa_pdv_particularidades")
    .select(
      "id, categoria_id, cod_pdv, nome_pdv, cidade, bairro, aviso, detalhe, janelas, dias_semana, de, ate, status, origem, criado_por_nome, criado_em, resolvido_em, resolvido_por_nome, resolucao",
    )
    .eq("revenda_id", revendaId)
    .order("criado_em", { ascending: false });
  if (status) consulta = consulta.eq("status", status);

  const { data, error } = await consulta;
  if (error) throw new Error(`Não foi possível ler as particularidades: ${error.message}`);
  return ((data ?? []) as LinhaParticularidade[]).map(paraParticularidade);
}

/** As particularidades de UM cliente -- o histórico inteiro, resolvido
 *  incluído: "já ficou bloqueado antes?" é a pergunta que se faz. */
export async function particularidadesDoPdv(
  revendaId: string,
  codPdv: string,
): Promise<ParticularidadeCompleta[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pa_pdv_particularidades")
    .select(
      "id, categoria_id, cod_pdv, nome_pdv, cidade, bairro, aviso, detalhe, janelas, dias_semana, de, ate, status, origem, criado_por_nome, criado_em, resolvido_em, resolvido_por_nome, resolucao",
    )
    .eq("revenda_id", revendaId)
    .eq("cod_pdv", normalizarCodPdv(codPdv))
    .order("criado_em", { ascending: false });
  if (error) throw new Error(`Não foi possível ler o cliente: ${error.message}`);
  return ((data ?? []) as LinhaParticularidade[]).map(paraParticularidade);
}

/**
 * OS CLIENTES QUE O RATING SUGERE, menos os que já foram tratados.
 *
 * A sugestão some assim que alguém cadastra ou dispensa -- senão a lista
 * cobraria para sempre o que já foi decidido, e uma lista que não
 * diminui é uma lista que se para de abrir.
 */
export async function sugestoesPendentes(revendaId: string): Promise<SugestaoDetrator[]> {
  const admin = createAdminClient();

  const [{ data: avaliacoes, error }, { data: jaTem }] = await Promise.all([
    admin
      .from("rating_avaliacoes")
      .select("cod_pdv, nome_pdv, cidade, nota, classificacao, motivo")
      .eq("revenda_id", revendaId)
      .eq("classificacao", "detrator"),
    admin
      .from("pa_pdv_particularidades")
      .select("cod_pdv, origem")
      .eq("revenda_id", revendaId)
      .eq("origem", "rating"),
  ]);
  if (error) throw new Error(`Não foi possível ler as avaliações: ${error.message}`);

  // A média precisa das notas BOAS também -- "8 detratoras de 92" é uma
  // história muito diferente de "8 de 8", e é a média que separa as duas.
  const codigos = [...new Set((avaliacoes ?? []).map((a) => a.cod_pdv).filter(Boolean))];
  if (codigos.length === 0) return [];

  const { data: todasDosPdvs } = await admin
    .from("rating_avaliacoes")
    .select("cod_pdv, nome_pdv, cidade, nota, classificacao, motivo")
    .eq("revenda_id", revendaId)
    .in("cod_pdv", codigos);

  const linhas: AvaliacaoDoPdv[] = (todasDosPdvs ?? []).map((a) => ({
    codPdv: a.cod_pdv,
    nomePdv: a.nome_pdv,
    cidade: a.cidade,
    nota: a.nota,
    classificacao: a.classificacao,
    motivo: a.motivo,
  }));

  const tratados = new Set((jaTem ?? []).map((p) => normalizarCodPdv(p.cod_pdv)));
  return sugestoesDeDetrator(linhas).filter((s) => !tratados.has(s.codPdv));
}

/* ------------------------------------------------------------------ */

export type AvisoNaRota = {
  codPdv: string;
  nomePdv: string | null;
  cidade: string | null;
  bairro: string | null;
  categoria: string;
  emoji: string | null;
  severidade: Severidade;
  aviso: string;
  detalhe: string | null;
  /** "até as 11:00" · null */
  horario: string | null;
  /** "seg, qua e sex" · null */
  dias: string | null;
  /** Dias até o fim do prazo, quando há. */
  diasDePrazo: number | null;
};

export type AvisosDoMapa = {
  avisos: AvisoNaRota[];
  /**
   * "cliente" quando sabemos exatamente quem está na carga; "regiao"
   * quando o casamento foi pelos bairros do mapa.
   *
   * A TELA MOSTRA ISSO, e não é detalhe: dizer "você vai entregar neste
   * cliente" quando na verdade é "há um cliente assim nesta região" é uma
   * promessa que o app não pode cumprir -- e a primeira vez que ela falha
   * o motorista para de ler todas as outras.
   */
  precisao: "cliente" | "regiao";
};

/**
 * OS AVISOS DE UM MAPA -- o triângulo da pré-rota.
 *
 * DOIS CAMINHOS, e o app usa o melhor que tiver:
 *
 *   1. Se o roteirizador já exportou os clientes daquele mapa
 *      (`pa_pdv_do_mapa`), o aviso é por CLIENTE: exato, com nome e tudo.
 *
 *   2. Sem isso, casa por REGIÃO -- cidade e bairro, que é o que a
 *      planilha traz hoje.
 *
 * O caminho 2 é o padrão de propósito, e não uma gambiarra: medido na
 * base, tentar adivinhar os clientes do dia pelo histórico do mapa daria
 * 88,2% de falso alarme (o número do mapa repete, é uma rota fixa, mas os
 * pedidos de cada dia mudam). Entre um aviso impreciso que se anuncia
 * impreciso e um aviso preciso que erra 9 de 10, o primeiro é o único que
 * continua sendo lido no segundo mês.
 */
export async function avisosDoMapa(
  revendaId: string,
  mapa: string,
  data: string,
  cidades: { cidade: string; bairros?: { nome: string }[] }[],
): Promise<AvisosDoMapa> {
  const admin = createAdminClient();
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  const [categorias, ativas] = await Promise.all([
    categoriasDaRevenda(revendaId),
    particularidadesDaRevenda(revendaId, { status: "ativa" }),
  ]);
  if (ativas.length === 0) return { avisos: [], precisao: "regiao" };

  const mapaCategorias = new Map(categorias.map((c) => [c.id, c as Categoria]));

  // A lista exata, se existir. Busca pela data da rota e, não achando,
  // pela mais recente daquele mapa -- a pré-rota pode ser consultada no
  // dia seguinte, e um aviso a menos por causa de um dia de diferença
  // seria o pior tipo de silêncio.
  const { data: doMapa } = await admin
    .from("pa_pdv_do_mapa")
    .select("cod_pdv, nome_pdv, cidade, bairro, data")
    .eq("revenda_id", revendaId)
    .eq("mapa", mapa)
    .order("data", { ascending: false })
    .limit(200);

  const daData = (doMapa ?? []).filter((l) => l.data === data);
  const lista = daData.length > 0 ? daData : (doMapa ?? []);

  let selecionadas = ativas;
  let precisao: AvisosDoMapa["precisao"] = "regiao";

  if (lista.length > 0) {
    const codigos = new Set(lista.map((l) => normalizarCodPdv(l.cod_pdv)));
    selecionadas = ativas.filter((p) => codigos.has(normalizarCodPdv(p.codPdv)));
    precisao = "cliente";
  }

  const achados =
    precisao === "cliente"
      ? avisosDoPdv(selecionadas, mapaCategorias, hoje)
      : avisosDaRegiao(ativas, mapaCategorias, cidades, hoje);

  return {
    precisao,
    avisos: achados.map(({ particularidade: p, categoria, dias }) => ({
      codPdv: p.codPdv,
      nomePdv: p.nomePdv,
      cidade: p.cidade,
      bairro: p.bairro,
      categoria: categoria.nome,
      emoji: categoria.emoji,
      severidade: categoria.severidade,
      aviso: p.aviso,
      detalhe: p.detalhe,
      horario: rotuloDoHorario(p.janelas),
      dias: rotuloDosDias(p.diasSemana),
      diasDePrazo: dias,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * O DIA -- as particularidades cruzadas com as entregas da data.
 * ------------------------------------------------------------------ */

export type ClienteDoDia = {
  /** O id da particularidade -- é por ela que o "já avisei" é marcado. */
  id: string;
  codPdv: string;
  nomePdv: string | null;
  cidade: string | null;
  bairro: string | null;
  categoria: string;
  emoji: string | null;
  severidade: Severidade;
  alertaNaRota: boolean;
  aviso: string;
  detalhe: string | null;
  horario: string | null;
  diasDePrazo: number | null;
  /** Já pronta para enviar; vazia quando a categoria não tem modelo. */
  mensagem: string;
  /** Da base de clientes do Drive. Null = o botão abre o seletor de contato. */
  telefone: string | null;
  /** Quem já falou com este cliente sobre isto, para esta entrega. */
  avisado: { porNome: string | null; em: string } | null;
};

export type RotaDoDia = {
  mapa: string;
  veiculo: string | null;
  placa: string | null;
  entregas: number | null;
  cidades: string[];
  clientes: ClienteDoDia[];
};

export type DiaDasParticularidades = {
  data: string;
  rotas: RotaDoDia[];
  /** Rotas da data, incluindo as que não têm nada a tratar. */
  totalDeRotas: number;
  /** Rotas cujos clientes o app conhece (o vínculo veio da planilha). */
  rotasComVinculo: number;
  datasDisponiveis: string[];
};

const soData = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/**
 * O DIA INTEIRO -- rotas da data, e o que cada uma tem para tratar antes
 * de sair.
 *
 * Pedido do dono (07/09/2026): "quero cruzar as particularidades com a
 * data de entrega do dia (...) a ideia é que o monitoramento tenha as
 * informações das particularidades dentro desse local, de maneira rápida e
 * fácil".
 *
 * O CRUZAMENTO É PELO CÓDIGO, não pela região: `pa_pdv_do_mapa` diz quais
 * clientes cada mapa atende naquela data -- a coluna "Clientes" da própria
 * planilha da pré-rota, separada por "/". Aqui não existe o caminho por
 * cidade que a `avisosDoMapa` tem de fallback, e é de propósito: quem
 * monitora vai LIGAR para o cliente, e ligar para o cliente errado é pior
 * do que não ligar.
 *
 * O BLOQUEIO ENTRA AQUI, mesmo não indo para o motorista. Um cliente
 * bloqueado dentro da rota do dia é carga que volta -- é a informação mais
 * cara desta tela, e quem a resolve é justamente quem lê aqui.
 *
 * A ORDEM DAS ROTAS é a da urgência: a que tem o caso mais grave primeiro,
 * depois a que tem mais casos. Numa manhã com quinze rotas, a ordem é o
 * que decide o que vai ser tratado antes do meio-dia.
 */
export async function particularidadesDoDia(
  revendaId: string,
  data: string,
): Promise<DiaDasParticularidades> {
  const admin = createAdminClient();

  const [
    { data: rotas },
    { data: vinculos },
    categorias,
    ativas,
    { data: todasAsDatas },
    { data: avisados },
  ] = await Promise.all([
      admin
        .from("rotas")
        .select("mapa, veiculo, placa, entregas, cidades")
        .eq("revenda_id", revendaId)
        .eq("data", data),
      admin
        .from("pa_pdv_do_mapa")
        .select("mapa, cod_pdv")
        .eq("revenda_id", revendaId)
        .eq("data", data),
      categoriasDaRevenda(revendaId),
      particularidadesDaRevenda(revendaId, { status: "ativa" }),
      admin
        .from("rotas")
        .select("data")
        .eq("revenda_id", revendaId)
        .order("data", { ascending: false })
        .limit(3000),
      // O que já foi avisado PARA ESTA DATA. Erro engolido de propósito:
      // quem não rodou a migration 107 não tem a tabela, e o dia inteiro
      // sumiria por causa de uma marca de acompanhamento.
      admin
        .from("pa_pdv_avisos_enviados")
        .select("particularidade_id, avisado_por_nome, avisado_em")
        .eq("revenda_id", revendaId)
        .eq("data", data),
    ]);

  const datasDisponiveis = [...new Set((todasAsDatas ?? []).map((d) => d.data as string))].slice(
    0,
    60,
  );

  const mapaCategorias = new Map(categorias.map((c) => [c.id, c]));

  // Só o que vale NA DATA da entrega -- e a data é a da rota, não a de
  // hoje. Abrir a tela de amanhã e ver o bloqueio que termina hoje seria
  // exatamente o alarme falso que faz o resto parar de ser lido.
  const valendo = ativas.filter((p) => valeHoje(p, data) && valeNoDia(p, data));
  const porCodigo = new Map<string, typeof valendo>();
  for (const p of valendo) {
    const chave = normalizarCodPdv(p.codPdv);
    porCodigo.set(chave, [...(porCodigo.get(chave) ?? []), p]);
  }

  const jaAvisado = new Map<string, { porNome: string | null; em: string }>();
  for (const a of avisados ?? []) {
    jaAvisado.set(a.particularidade_id as string, {
      porNome: (a.avisado_por_nome as string) ?? null,
      em: a.avisado_em as string,
    });
  }

  const clientesPorMapa = new Map<string, Set<string>>();
  for (const v of vinculos ?? []) {
    const mapa = v.mapa as string;
    const atual = clientesPorMapa.get(mapa) ?? new Set<string>();
    atual.add(normalizarCodPdv(v.cod_pdv as string));
    clientesPorMapa.set(mapa, atual);
  }

  const daData: RotaDoDia[] = [];
  for (const r of rotas ?? []) {
    const mapa = r.mapa as string;
    const codigos = clientesPorMapa.get(mapa);
    const cidades = ((r.cidades ?? []) as { cidade: string }[]).map((c) => c.cidade);

    const clientes: ClienteDoDia[] = [];
    for (const codigo of codigos ?? []) {
      for (const p of porCodigo.get(codigo) ?? []) {
        const categoria = mapaCategorias.get(p.categoriaId);
        if (!categoria) continue;
        const horario = rotuloDoHorario(p.janelas);
        clientes.push({
          id: p.id,
          telefone: null, // preenchido abaixo, numa consulta só para o dia
          avisado: jaAvisado.get(p.id) ?? null,
          codPdv: p.codPdv,
          nomePdv: p.nomePdv,
          cidade: p.cidade,
          bairro: p.bairro,
          categoria: categoria.nome,
          emoji: categoria.emoji,
          severidade: categoria.severidade,
          alertaNaRota: categoria.alertaNaRota,
          aviso: p.aviso,
          detalhe: p.detalhe,
          horario,
          diasDePrazo: diasAte(p.ate, data),
          mensagem: montarMensagem(categoria.mensagemModelo, {
            cliente: p.nomePdv ?? `o cliente ${p.codPdv}`,
            codigo: p.codPdv,
            cidade: p.cidade,
            janela: horario,
            aviso: p.aviso,
            data: soData(data),
            mapa,
          }),
        });
      }
    }

    if (clientes.length === 0) continue;
    clientes.sort(
      (a, b) => PESO_SEVERIDADE[b.severidade] - PESO_SEVERIDADE[a.severidade],
    );
    daData.push({
      mapa,
      veiculo: (r.veiculo as string) ?? null,
      placa: (r.placa as string) ?? null,
      entregas: (r.entregas as number) ?? null,
      cidades,
      clientes,
    });
  }

  daData.sort((a, b) => {
    const graveA = PESO_SEVERIDADE[a.clientes[0].severidade];
    const graveB = PESO_SEVERIDADE[b.clientes[0].severidade];
    if (graveA !== graveB) return graveB - graveA;
    return b.clientes.length - a.clientes.length;
  });

  /*
    O TELEFONE, numa consulta só para o dia inteiro.

    Vem da base do Drive (pa_pdv_clientes), e é ele que faz o link do
    WhatsApp abrir a CONVERSA CERTA -- sem número, o `wa.me` cai no seletor
    de contato e perde o texto no caminho, que foi o que o dono viu.

    Depois da montagem, e não durante: são poucos clientes por dia, e uma
    consulta por cliente dentro do laço seria uma ida ao banco por linha.
  */
  const codigos = daData.flatMap((r) => r.clientes.map((c) => normalizarCodPdv(c.codPdv)));
  const daBase = await clientesPorCodigo(revendaId, codigos);
  for (const rota of daData) {
    for (const c of rota.clientes) {
      c.telefone = daBase.get(normalizarCodPdv(c.codPdv))?.telefone ?? null;
    }
  }

  return {
    data,
    rotas: daData,
    totalDeRotas: (rotas ?? []).length,
    rotasComVinculo: clientesPorMapa.size,
    datasDisponiveis,
  };
}
