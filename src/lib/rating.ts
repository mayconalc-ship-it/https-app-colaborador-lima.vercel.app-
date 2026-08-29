/**
 * RATING DE ENTREGA
 *
 * O cliente avalia a entrega de 1 a 5 no LOG.CO. A planilha do LOG.CO
 * NÃO diz quem entregou (a coluna Motorista vem vazia) -- quem entregou
 * sai do 03.11.29, cruzando pelo número do mapa.
 *
 * Só matemática e leitura de arquivo aqui: sem banco, sem React. É o que
 * permite conferir os números contra os arquivos reais sem subir a tela.
 */

import { dataParaIso, normalizarMapa } from "@/lib/rotas";

// --------------------------------------------------------------------
// CLASSIFICAÇÃO
// --------------------------------------------------------------------

export type Classificacao = "detrator" | "neutro" | "promotor";

export const ROTULO_CLASSIFICACAO: Record<Classificacao, string> = {
  detrator: "Detrator",
  neutro: "Neutro",
  promotor: "Promotor",
};

/**
 * Conferido nas 14.211 avaliações de 2026: nota 1-3 sempre veio como
 * Detrator, 4 como Neutro e 5 como Promotor, sem uma exceção. Ainda
 * assim a importação prefere o texto do arquivo quando ele existe -- se
 * um dia o LOG.CO mudar a régua, o app segue a régua nova.
 */
export function classificacaoDaNota(nota: number): Classificacao {
  if (nota >= 5) return "promotor";
  if (nota === 4) return "neutro";
  return "detrator";
}

export function classificacaoDoTexto(texto: string): Classificacao | null {
  const t = (texto ?? "").trim().toLowerCase();
  if (t.startsWith("detrator")) return "detrator";
  if (t.startsWith("neutro")) return "neutro";
  if (t.startsWith("promotor")) return "promotor";
  return null;
}

/**
 * A meta é 5 estrelas. Qualquer coisa abaixo disso é o motorista devendo
 * uma explicação -- pedido do dono em 29/08/2026, e que na prática é
 * "detrator ou neutro", já que 4 é o teto de quem não deu 5.
 *
 * Volume conferido: 242 avaliações abaixo de 5 em 8 meses, algo como 2
 * por motorista por mês. Não vira enxurrada de pendência.
 */
export function precisaFeedback(nota: number): boolean {
  return nota < 5;
}

// --------------------------------------------------------------------
// CPF
// --------------------------------------------------------------------

/**
 * O cadastro exporta o CPF sem o zero à esquerda ("44.569.881.00" são os
 * 11 dígitos 04456988100). Completar às cegas seria chute, então o
 * dígito verificador decide: só devolve o CPF se ele fechar.
 *
 * Conferido nos 206 do cadastro de motoristas: 63 já vinham certos, 142
 * fecharam com o zero, e o único que não fecha é a linha "RECARGA", que
 * não é pessoa.
 */
export function normalizarCpf(bruto: string): string | null {
  const digitos = (bruto ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  if (digitos.length > 11) return null;

  const completo = digitos.padStart(11, "0");
  return cpfValido(completo) ? completo : null;
}

export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf)) return false;
  // 111.111.111-11 e afins passam na conta do dígito, mas não existem.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i);
  let d1 = (soma * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i);
  let d2 = (soma * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

// --------------------------------------------------------------------
// LEITURA DOS ARQUIVOS
// --------------------------------------------------------------------

/** Divide CSV com ponto e vírgula, respeitando aspas. */
function separarLinha(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else dentroDeAspas = !dentroDeAspas;
    } else if (c === ";" && !dentroDeAspas) {
      campos.push(atual);
      atual = "";
    } else atual += c;
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

/** Acha a coluna pelo nome do cabeçalho, tolerando acento e caixa. */
function indiceDaColuna(cabecalho: string[], ...nomes: string[]): number {
  const limpar = (s: string) =>
    (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const alvos = nomes.map(limpar);
  return cabecalho.findIndex((c) => alvos.includes(limpar(c)));
}

export type PessoaCadastro = {
  tipo: "motorista" | "ajudante";
  codigo: string;
  nome: string;
  cpf: string | null;
  status: string | null;
};

export type ResultadoCadastro = {
  pessoas: PessoaCadastro[];
  /** Colunas obrigatórias que não apareceram -- vira mensagem na tela em
   *  vez de uma importação silenciosamente vazia. */
  faltando: string[];
  semCpf: number;
};

/**
 * Cadastro de motoristas (01.20.01.47) ou de ajudantes (01.20.01.48).
 * O `tipo` NÃO sai do arquivo: os dois têm a mesma estrutura e códigos
 * que colidem entre si, então quem chama diz qual está lendo.
 */
export function lerCadastroPessoas(
  texto: string,
  tipo: "motorista" | "ajudante",
): ResultadoCadastro {
  const linhas = (texto ?? "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return { pessoas: [], faltando: ["arquivo vazio"], semCpf: 0 };

  const cab = separarLinha(linhas[0]);
  const iCodigo = indiceDaColuna(cab, "Codigo", "Código");
  // Os dois relatórios não usam o mesmo rótulo: o 01.20.01.47 escreve
  // "Nome" e o 01.20.01.48 escreve "Nome Ajudante".
  const iNome = indiceDaColuna(cab, "Nome", "Nome Ajudante", "Nome Motorista");
  const iCpf = indiceDaColuna(cab, "CPF");
  const iStatus = indiceDaColuna(cab, "Status");

  const faltando: string[] = [];
  if (iCodigo < 0) faltando.push("Codigo");
  if (iNome < 0) faltando.push("Nome");
  if (iCpf < 0) faltando.push("CPF");
  if (faltando.length) return { pessoas: [], faltando, semCpf: 0 };

  const pessoas: PessoaCadastro[] = [];
  const vistos = new Set<string>();
  let semCpf = 0;

  for (const linha of linhas.slice(1)) {
    const campos = separarLinha(linha);
    const codigo = (campos[iCodigo] ?? "").trim();
    const nome = (campos[iNome] ?? "").trim();
    if (!codigo || !nome) continue;
    // Código repetido no arquivo: fica o primeiro, senão o upsert
    // reclamaria de duas linhas com a mesma chave no mesmo lote.
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);

    const cpf = normalizarCpf(campos[iCpf] ?? "");
    if (!cpf) semCpf++;

    pessoas.push({
      tipo,
      codigo,
      nome,
      cpf,
      status: iStatus >= 0 ? (campos[iStatus] ?? "").trim() || null : null,
    });
  }

  return { pessoas, faltando: [], semCpf };
}

export type ViagemLida = {
  mapa: string;
  data: string | null;
  placa: string | null;
  supervisorNome: string | null;
  motoristaCodigo: string | null;
  motoristaNome: string | null;
  ajudante1Codigo: string | null;
  ajudante1Nome: string | null;
  ajudante2Codigo: string | null;
  ajudante2Nome: string | null;
};

/** 03.11.29: quem estava em cada mapa. */
export function lerViagens(texto: string): { viagens: ViagemLida[]; faltando: string[] } {
  const linhas = (texto ?? "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return { viagens: [], faltando: ["arquivo vazio"] };

  const cab = separarLinha(linhas[0]);
  const iMapa = indiceDaColuna(cab, "Mapa");
  const iData = indiceDaColuna(cab, "Data");
  const iPlaca = indiceDaColuna(cab, "Placa");
  const iSup = indiceDaColuna(cab, "Nome Superv. Rota", "Nome Superv Rota");
  const iMot = indiceDaColuna(cab, "Motorista");
  const iMotNome = indiceDaColuna(cab, "Nome Motorista");
  const iAj1 = indiceDaColuna(cab, "Ajudante 1");
  const iAj1Nome = indiceDaColuna(cab, "Nome Ajudante 1");
  const iAj2 = indiceDaColuna(cab, "Ajudante 2");
  const iAj2Nome = indiceDaColuna(cab, "Nome Ajudante 2");

  const faltando: string[] = [];
  if (iMapa < 0) faltando.push("Mapa");
  if (iMot < 0) faltando.push("Motorista");
  if (faltando.length) return { viagens: [], faltando };

  const porMapa = new Map<string, ViagemLida>();
  const campo = (c: string[], i: number) => (i >= 0 ? (c[i] ?? "").trim() || null : null);

  for (const linha of linhas.slice(1)) {
    const c = separarLinha(linha);
    const mapa = normalizarMapa(c[iMapa] ?? "");
    if (!mapa) continue;

    // Mapa repetido: fica o último, que é a versão mais recente da
    // escala daquele mapa.
    porMapa.set(mapa, {
      mapa,
      data: iData >= 0 ? dataParaIso(c[iData] ?? "") : null,
      placa: campo(c, iPlaca),
      supervisorNome: campo(c, iSup),
      motoristaCodigo: campo(c, iMot),
      motoristaNome: campo(c, iMotNome),
      ajudante1Codigo: campo(c, iAj1),
      ajudante1Nome: campo(c, iAj1Nome),
      ajudante2Codigo: campo(c, iAj2),
      ajudante2Nome: campo(c, iAj2Nome),
    });
  }

  return { viagens: [...porMapa.values()], faltando: [] };
}

export type AvaliacaoLida = {
  dataAvaliacao: string;
  nota: number;
  classificacao: Classificacao;
  mapa: string;
  codPdv: string | null;
  nomePdv: string | null;
  pedido: string | null;
  motivo: string | null;
  comentario: string | null;
  estado: string | null;
  cidade: string | null;
};

/** Uma linha da aba do LOG.CO, já com os nomes de coluna resolvidos. */
export type LinhaPlanilha = Record<string, string>;

/**
 * LOG.CO: as avaliações. Recebe as linhas já extraídas da planilha (a
 * leitura do .xlsx em si mora no servidor, porque depende do exceljs) --
 * assim esta função continua testável com dados de mentira.
 */
export function lerAvaliacoes(linhas: LinhaPlanilha[]): {
  avaliacoes: AvaliacaoLida[];
  ignoradas: number;
} {
  const avaliacoes: AvaliacaoLida[] = [];
  let ignoradas = 0;

  const pegar = (l: LinhaPlanilha, ...nomes: string[]) => {
    const chaves = Object.keys(l);
    const i = indiceDaColuna(chaves, ...nomes);
    return i >= 0 ? (l[chaves[i]] ?? "").trim() : "";
  };

  for (const l of linhas) {
    const mapa = normalizarMapa(pegar(l, "Mapa"));
    const nota = Number(pegar(l, "Avaliação", "Avaliacao"));
    const dataBruta = pegar(l, "Data da Avaliação", "Data da Avaliacao");
    // O exceljs devolve data como ISO; um export mais antigo poderia vir
    // em dd/mm/aaaa, então aceita os dois.
    const data = /^\d{4}-\d{2}-\d{2}$/.test(dataBruta)
      ? dataBruta
      : dataParaIso(dataBruta);

    if (!mapa || !data || !Number.isFinite(nota) || nota < 1 || nota > 5) {
      ignoradas++;
      continue;
    }

    const motivoBruto = pegar(l, "Motivo");

    avaliacoes.push({
      dataAvaliacao: data,
      nota,
      classificacao: classificacaoDoTexto(pegar(l, "Classificação", "Classificacao")) ?? classificacaoDaNota(nota),
      mapa,
      codPdv: pegar(l, "Cod PDV") || null,
      nomePdv: pegar(l, "Nome PDV") || null,
      // "508223.0" vem do Excel tratando o pedido como número.
      pedido: (pegar(l, "Pedido").replace(/\.0+$/, "")) || null,
      // "N/A" é ausência de motivo, não um motivo chamado N/A.
      motivo: motivoBruto && motivoBruto.toUpperCase() !== "N/A" ? motivoBruto : null,
      comentario: pegar(l, "Comentário", "Comentario") || null,
      estado: pegar(l, "Estado") || null,
      cidade: pegar(l, "Cidade") || null,
    });
  }

  return { avaliacoes, ignoradas };
}

// --------------------------------------------------------------------
// RESUMO
// --------------------------------------------------------------------

export type ResumoRating = {
  total: number;
  /** `null` sem nenhuma avaliação -- é "sem dado", não zero estrela. */
  media: number | null;
  /** A média arredondada para meia estrela, que é o que a tela desenha. */
  estrelas: number | null;
  promotores: number;
  neutros: number;
  detratores: number;
  /** Quantas ficaram abaixo de 5 -- é o número que de fato separa as
   *  pessoas, já que 98,3% das avaliações são 5 estrelas. */
  abaixoDaMeta: number;
  pctAbaixoDaMeta: number | null;
};

export function resumirRating(avaliacoes: { nota: number; classificacao: Classificacao }[]): ResumoRating {
  const total = avaliacoes.length;
  if (total === 0) {
    return {
      total: 0, media: null, estrelas: null,
      promotores: 0, neutros: 0, detratores: 0,
      abaixoDaMeta: 0, pctAbaixoDaMeta: null,
    };
  }

  const soma = avaliacoes.reduce((s, a) => s + a.nota, 0);
  const media = Math.round((soma / total) * 100) / 100;
  const conta = (c: Classificacao) => avaliacoes.filter((a) => a.classificacao === c).length;
  const abaixo = avaliacoes.filter((a) => precisaFeedback(a.nota)).length;

  return {
    total,
    media,
    // Meia estrela, não estrela cheia: com a média real girando entre
    // 4,93 e 4,99, arredondar para inteiro daria 5 para todo mundo
    // sempre. Meia estrela pelo menos separa o dia ruim do dia perfeito.
    estrelas: Math.round(media * 2) / 2,
    promotores: conta("promotor"),
    neutros: conta("neutro"),
    detratores: conta("detrator"),
    abaixoDaMeta: abaixo,
    pctAbaixoDaMeta: Math.round((abaixo / total) * 1000) / 10,
  };
}

/** Quantas estrelas cheias, meias e vazias desenhar. */
export function desenhoDasEstrelas(estrelas: number): {
  cheias: number;
  meia: boolean;
  vazias: number;
} {
  const cheias = Math.floor(estrelas);
  const meia = estrelas % 1 >= 0.5;
  return { cheias, meia, vazias: 5 - cheias - (meia ? 1 : 0) };
}

/** Agrupa por motivo, do mais frequente para o menos. */
export function motivosMaisComuns(
  avaliacoes: { motivo: string | null }[],
): { motivo: string; total: number }[] {
  const mapa = new Map<string, number>();
  for (const a of avaliacoes) {
    if (!a.motivo) continue;
    mapa.set(a.motivo, (mapa.get(a.motivo) ?? 0) + 1);
  }
  return [...mapa]
    .map(([motivo, total]) => ({ motivo, total }))
    .sort((a, b) => b.total - a.total);
}
