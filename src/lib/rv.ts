export type DetalheRV = { rotulo: string; valor: string };

export type LinhaRV = {
  area: string;
  rotulo: string;
  competencia: string | null;
  nome: string | null;
  valor: string | null;
  detalhes: DetalheRV[];
};

export function somenteDigitos(valor: string) {
  return (valor ?? "").replace(/\D/g, "");
}

/**
 * CPF sempre tem 11 digitos, mas o Excel trata a coluna como numero e come
 * o zero da esquerda (08455629592 vira 8455629592). Reponhamos o zero antes
 * de comparar, senao quem tem CPF iniciado em 0 nunca acha a propria linha.
 */
export function normalizarCpf(valor: string) {
  const digitos = somenteDigitos(valor);
  if (digitos.length === 0 || digitos.length > 11) return digitos;
  return digitos.padStart(11, "0");
}

export type OrigemPlanilha = {
  /** Endereços a tentar, em ordem. O Google mudou de endpoint algumas vezes. */
  candidatos: string[];
  descricao: string;
};

export class LinkDePastaError extends Error {
  constructor() {
    super(
      "esse é o link de uma PASTA. Abra a pasta, clique com o botão direito no arquivo e copie o link dele",
    );
  }
}

/**
 * Descobre como baixar a planilha a partir do link colado pelo admin.
 * Aceita Google Sheets (vira exportacao CSV) e arquivo .xlsx no Drive
 * (vira download direto), que e o caso quando o Excel e so copiado do
 * servidor da empresa para o Drive.
 */
export function resolverOrigem(url: string): OrigemPlanilha | null {
  const limpo = (url ?? "").trim();
  if (!limpo) return null;

  if (/\/drive\/(u\/\d+\/)?folders\//.test(limpo)) {
    throw new LinkDePastaError();
  }

  if (limpo.includes("output=csv") || limpo.includes("format=csv")) {
    return { candidatos: [limpo], descricao: "CSV publicado" };
  }

  const sheets = limpo.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (sheets) {
    const gid = limpo.match(/[#&?]gid=(\d+)/)?.[1] ?? "0";
    return {
      candidatos: [
        `https://docs.google.com/spreadsheets/d/${sheets[1]}/export?format=csv&gid=${gid}`,
        `https://docs.google.com/spreadsheets/d/${sheets[1]}/export?format=xlsx`,
      ],
      descricao: "Google Sheets",
    };
  }

  const id =
    limpo.match(/\/file\/d\/([a-zA-Z0-9-_]+)/)?.[1] ??
    limpo.match(/[?&]id=([a-zA-Z0-9-_]+)/)?.[1];
  if (id) {
    return {
      // O endpoint antigo (uc?export=download) passou a devolver 400 em
      // varios casos; o drive.usercontent e o atual. Tentamos os dois.
      candidatos: [
        `https://drive.usercontent.google.com/download?id=${id}&export=download`,
        `https://drive.google.com/uc?export=download&id=${id}`,
        `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
      ],
      descricao: "arquivo do Drive",
    };
  }

  return { candidatos: [limpo], descricao: "link direto" };
}

/** Parser de CSV que respeita aspas, quebras de linha e separador , ou ; */
export function lerCsv(texto: string): string[][] {
  const semBom = texto.replace(/^﻿/, "");
  const primeiraLinha = semBom.split("\n")[0] ?? "";
  const separador =
    (primeiraLinha.match(/;/g)?.length ?? 0) >
    (primeiraLinha.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";

  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < semBom.length; i++) {
    const c = semBom[i];

    if (dentroDeAspas) {
      if (c === '"') {
        if (semBom[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      dentroDeAspas = true;
    } else if (c === separador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else if (c !== "\r") {
      campo += c;
    }
  }

  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas.filter((l) => l.some((celula) => celula.trim() !== ""));
}

export function normalizarTexto(texto: string) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Planilhas reais costumam ter titulo e linhas em branco antes do cabecalho.
 * Aqui procuramos a primeira linha que parece um cabecalho de verdade.
 */
export function acharLinhaCabecalho(linhas: string[][]) {
  const limite = Math.min(linhas.length, 15);
  for (let i = 0; i < limite; i++) {
    const linha = linhas[i];
    const preenchidas = linha.filter((c) => c.trim() !== "").length;
    const temCpf = linha.some((c) => normalizarTexto(c).includes("cpf"));
    if (temCpf && preenchidas >= 2) return i;
  }
  // Sem coluna de CPF explicita: usa a primeira linha com 2+ celulas
  for (let i = 0; i < limite; i++) {
    if (linhas[i].filter((c) => c.trim() !== "").length >= 2) return i;
  }
  return 0;
}

function acharColunaPor(
  cabecalho: string[],
  configurada: string | null | undefined,
  exatos: string[],
  contidos: string[],
) {
  if (configurada) {
    const i = cabecalho.findIndex(
      (h) => normalizarTexto(h) === normalizarTexto(configurada),
    );
    if (i !== -1) return i;
  }
  for (const alvo of exatos) {
    const i = cabecalho.findIndex((h) => normalizarTexto(h) === alvo);
    if (i !== -1) return i;
  }
  for (const alvo of contidos) {
    const i = cabecalho.findIndex((h) => normalizarTexto(h).includes(alvo));
    if (i !== -1) return i;
  }
  return -1;
}

export function acharColunaCpf(
  cabecalho: string[],
  corpo: string[][],
  configurada?: string | null,
) {
  const porNome = acharColunaPor(cabecalho, configurada, ["cpf"], ["cpf"]);
  if (porNome !== -1) return porNome;

  // Ultimo recurso: a coluna cujos valores parecem CPF. Aceita 10 digitos
  // porque o Excel come o zero da esquerda.
  for (let col = 0; col < cabecalho.length; col++) {
    const parecem = corpo.slice(0, 30).filter((l) => {
      const n = somenteDigitos(l[col] ?? "").length;
      return n === 11 || n === 10;
    }).length;
    if (parecem >= 2) return col;
  }
  return -1;
}

export function acharColunaValor(
  cabecalho: string[],
  configurada?: string | null,
) {
  return acharColunaPor(
    cabecalho,
    configurada,
    // "Total R$" e a coluna final da planilha da LIMA: vem primeiro
    ["total r$", "total rs", "total", "valor rv", "total rv", "rv total", "valor"],
    ["total r$", "total rs", "total", "valor rv", "valor total", "rv"],
  );
}

export function acharColunaNome(cabecalho: string[]) {
  return acharColunaPor(cabecalho, null, ["nome"], ["nome"]);
}

export function acharColunaCompetencia(cabecalho: string[]) {
  return acharColunaPor(
    cabecalho,
    null,
    ["competencia", "mes", "mes/ano", "referencia", "periodo"],
    ["competencia", "referencia", "periodo", "mes"],
  );
}

/** Converte rotulos de mes variados numa chave ordenavel (AAAAMM). */
export function chaveCompetencia(rotulo: string) {
  const texto = normalizarTexto(rotulo);

  const isoOuTraco = texto.match(/(\d{4})[-/](\d{1,2})/);
  if (isoOuTraco) {
    return Number(isoOuTraco[1]) * 100 + Number(isoOuTraco[2]);
  }

  const mesAno = texto.match(/(\d{1,2})[-/](\d{4})/);
  if (mesAno) {
    return Number(mesAno[2]) * 100 + Number(mesAno[1]);
  }

  const meses = [
    "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const porNome = meses.findIndex((m) => texto.includes(m.slice(0, 3)));
  const ano = texto.match(/(\d{4})/);
  if (porNome !== -1 && ano) {
    return Number(ano[1]) * 100 + (porNome + 1);
  }

  return 0;
}

/** "Jul/26" se le mais rapido que "07/26" numa fila de botoes. */
const MESES_CURTOS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/**
 * Mostra a competencia sempre como Mes/AA.
 * Na planilha ela chega de tudo quanto e jeito -- "01/07/2026" quando a
 * celula e data, "2026-07", "Julho/2026" -- e o dia nao interessa ao
 * colaborador: a RV e mensal.
 */
export function formatarCompetencia(rotulo: string) {
  const chave = chaveCompetencia(rotulo);
  if (chave <= 0) return rotulo;

  const ano = Math.floor(chave / 100);
  const mes = chave % 100;
  if (mes < 1 || mes > 12) return rotulo;

  return `${MESES_CURTOS[mes - 1]}/${String(ano).slice(-2)}`;
}

/**
 * Todos os CPFs que aparecem na planilha, normalizados.
 *
 * É a pergunta inversa da `buscarLinhasDoColaborador`: em vez de "esta
 * pessoa tem RV?", responde "quem tem RV?". Serve ao aviso de RV
 * atualizada, que precisa da lista inteira de uma vez -- perguntar pessoa
 * por pessoa baixaria a mesma planilha uma vez para cada colaborador.
 *
 * Linha sem CPF reconhecível fica de fora em silêncio: planilha real tem
 * linha de total, de cabeçalho repetido e de observação no rodapé, e
 * nenhuma delas é gente.
 */
export function cpfsDaPlanilha(
  linhas: string[][],
  colunaCpfConfig?: string | null,
): Set<string> {
  const cpfs = new Set<string>();
  if (linhas.length < 2) return cpfs;

  const iCabecalho = acharLinhaCabecalho(linhas);
  const cabecalho = linhas[iCabecalho];
  const corpo = linhas.slice(iCabecalho + 1);

  const idxCpf = acharColunaCpf(cabecalho, corpo, colunaCpfConfig);
  if (idxCpf === -1) return cpfs;

  for (const linha of corpo) {
    const cpf = normalizarCpf(linha[idxCpf] ?? "");
    if (cpf.length === 11) cpfs.add(cpf);
  }

  return cpfs;
}

/**
 * Devolve TODAS as linhas do colaborador (uma por competencia).
 * Vazio quando o CPF nao aparece na planilha.
 */
export function buscarLinhasDoColaborador(
  linhas: string[][],
  cpf: string,
  colunaCpfConfig?: string | null,
  colunaValorConfig?: string | null,
) {
  if (linhas.length < 2) {
    return { linhas: [], colunaCpfEncontrada: false, cabecalho: [] as string[] };
  }

  const iCabecalho = acharLinhaCabecalho(linhas);
  const cabecalho = linhas[iCabecalho];
  const corpo = linhas.slice(iCabecalho + 1);

  const idxCpf = acharColunaCpf(cabecalho, corpo, colunaCpfConfig);
  if (idxCpf === -1) {
    return { linhas: [], colunaCpfEncontrada: false, cabecalho };
  }

  const idxValor = acharColunaValor(cabecalho, colunaValorConfig);
  const idxCompetencia = acharColunaCompetencia(cabecalho);
  const idxNome = acharColunaNome(cabecalho);

  const alvo = normalizarCpf(cpf);
  const encontradas = corpo.filter(
    (l) => normalizarCpf(l[idxCpf] ?? "") === alvo,
  );

  // Escondidas do detalhamento: o CPF nao acrescenta nada, e nome, valor e
  // competencia ja aparecem em destaque no topo do cartao.
  const ocultas = new Set([idxCpf, idxValor, idxCompetencia, idxNome]);

  const resultado = encontradas.map((linha) => ({
    competencia:
      idxCompetencia !== -1 ? (linha[idxCompetencia] ?? "").trim() || null : null,
    nome: idxNome !== -1 ? (linha[idxNome] ?? "").trim() || null : null,
    valor: idxValor !== -1 ? (linha[idxValor] ?? "").trim() : null,
    detalhes: cabecalho
      .map((titulo, i) => ({
        rotulo: (titulo ?? "").trim(),
        valor: (linha[i] ?? "").trim(),
      }))
      .filter(
        (d, i) => !ocultas.has(i) && d.rotulo !== "" && d.valor !== "",
      ),
  }));

  return { linhas: resultado, colunaCpfEncontrada: true, cabecalho };
}
