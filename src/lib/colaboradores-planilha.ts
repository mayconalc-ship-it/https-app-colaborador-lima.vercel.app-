/**
 * A PLANILHA DE COLABORADORES -- só a regra, sem banco e sem arquivo.
 *
 * Pedido do dono (10/09/2026), na implantação de Barreiras: cadastrar 100
 * pessoas de uma vez, "com a planilha padrão para exportar da mesma forma
 * que fizemos com o código de produto". Até aqui o cadastro era um por
 * um, pela tela.
 *
 * IDA E VOLTA NO MESMO FORMATO. A rota de exportar sai com estas colunas,
 * preenchidas com quem já está na unidade; edita-se e importa-se de volta.
 * Quem já existe é ATUALIZADO (nome, cargo, área, matrícula), quem é novo
 * ganha acesso, e ninguém é apagado -- tirar alguém do arquivo não é
 * demitir ninguém do app.
 *
 * Aqui mora tudo que dá para testar sem rede: achar as colunas pelo nome,
 * validar o CPF, converter a área e decidir o que cada linha vai virar.
 */

/** As colunas da planilha padrão, na ordem em que o arquivo sai. */
export const COLUNAS_PLANILHA = ["Matrícula", "Nome", "CPF", "Cargo", "Área"] as const;

/** Tira acento, caixa e pontuação -- "Área" e "AREA " são a mesma coluna. */
export function chaveDoCabecalho(texto: string): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

type Campo = "matricula" | "nome" | "cpf" | "cargo" | "area";

/*
  SINÔNIMOS, porque a planilha vem do RH e não daqui: a de Barreiras chegou
  com "Matricula", "Nome", "Admissão", "Cargo", "Área", "CPF" -- e a
  próxima pode vir com "Função" ou "Setor". Achar pelo nome, e não pela
  posição, é o que deixa uma coluna a mais (como "Admissão") não quebrar
  nada.
*/
const SINONIMOS: Record<Campo, string[]> = {
  matricula: ["matricula", "registro", "mat"],
  nome: ["nome", "nomecompleto", "colaborador", "funcionario"],
  cpf: ["cpf"],
  cargo: ["cargo", "funcao"],
  area: ["area", "setor", "departamento"],
};

export function acharColunas(cabecalho: string[]): Partial<Record<Campo, number>> {
  const chaves = cabecalho.map(chaveDoCabecalho);
  const achado: Partial<Record<Campo, number>> = {};
  const usadas = new Set<number>();
  for (const [campo, nomes] of Object.entries(SINONIMOS) as [Campo, string[]][]) {
    for (const nome of nomes) {
      // Igual primeiro, depois "começa com" -- "mat" só vale exato, senão
      // pegaria qualquer coluna que comece com essas três letras.
      let i = chaves.findIndex((c, idx) => c === nome && !usadas.has(idx));
      if (i < 0 && nome.length > 3) {
        i = chaves.findIndex((c, idx) => c.startsWith(nome) && !usadas.has(idx));
      }
      if (i >= 0) {
        achado[campo] = i;
        usadas.add(i);
        break;
      }
    }
  }
  return achado;
}

/** Dígito verificador do CPF -- o mesmo cálculo da Receita. */
export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

/*
  AS ÁREAS QUE O RH ESCREVE DIFERENTE DAQUI.

  Decisão do dono (10/09/2026): a planilha de Barreiras veio com
  "TRANSPORTE" nas 100 linhas, e o app traduz área para DU/AL
  (`areaDoColaborador`, lib/quiz.ts) procurando "distribui", "armazém",
  "apoio" e "logístic" -- "transporte" não cai em nenhuma. Os 100 teriam
  entrado sem área, fora do Desafio do Mês, da Escala, do Você Sabia e dos
  comunicados por área, sem erro nenhum aparecer.

  Converter AQUI, e não pedir para editar a planilha: a próxima exportação
  do RH vai trazer "TRANSPORTE" de novo, e uma regra que depende de alguém
  lembrar de trocar a palavra falha na primeira contratação.
*/
export const EQUIVALENCIA_DE_AREA: Record<string, string> = {
  transporte: "DISTRIBUIÇÃO URBANA",
};

export function areaCanonica(area: string): { area: string; convertida: boolean } {
  const igual = EQUIVALENCIA_DE_AREA[chaveDoCabecalho(area)];
  return igual ? { area: igual, convertida: true } : { area: area.trim(), convertida: false };
}

export type LinhaBruta = {
  linha: number;
  matricula: string;
  nome: string;
  cpf: string;
  cargo: string;
  area: string;
};

export type LinhaColaborador = {
  linha: number;
  matricula: string | null;
  nome: string;
  /** Só dígitos, 11. */
  cpf: string;
  cargo: string;
  /** Já convertida (TRANSPORTE -> DISTRIBUIÇÃO URBANA). */
  area: string;
  /** Como veio no arquivo, para a prévia mostrar a conversão. */
  areaDaPlanilha: string;
  /** O Excel tinha comido o zero da frente, e ele voltou. */
  cpfCorrigido: boolean;
};

export type ProblemaDaLinha = { linha: number; nome: string; motivo: string };

/** A matriz de texto da planilha vira linhas, pelas colunas achadas. */
export function linhasDaMatriz(
  cabecalho: string[],
  dados: string[][],
  primeiraLinha: number,
): { brutas: LinhaBruta[]; faltam: string[] } {
  const col = acharColunas(cabecalho);
  const faltam = (["nome", "cpf", "cargo", "area"] as Campo[])
    .filter((c) => col[c] === undefined)
    .map((c) => ({ nome: "Nome", cpf: "CPF", cargo: "Cargo", area: "Área" })[c as "nome"]);
  if (faltam.length > 0) return { brutas: [], faltam };

  const pega = (linha: string[], c: Campo) => {
    const i = col[c];
    return i === undefined ? "" : String(linha[i] ?? "").trim();
  };

  const brutas: LinhaBruta[] = [];
  dados.forEach((linha, i) => {
    const nome = pega(linha, "nome");
    const cpf = pega(linha, "cpf");
    // Linha totalmente em branco é rodapé ou espaço, não um cadastro.
    if (!nome && !cpf && !pega(linha, "cargo")) return;
    brutas.push({
      linha: primeiraLinha + i,
      matricula: pega(linha, "matricula"),
      nome,
      cpf,
      cargo: pega(linha, "cargo"),
      area: pega(linha, "area"),
    });
  });
  return { brutas, faltam: [] };
}

/**
 * CADA LINHA OU VIRA CADASTRO OU DIZ POR QUE NÃO.
 *
 * Nada é pulado em silêncio: uma linha recusada aparece na prévia com o
 * número e o motivo, e quem importou corrige a planilha em vez de
 * descobrir semanas depois que o fulano nunca entrou.
 *
 * O ZERO DA FRENTE é devolvido, e só quando o CPF fica válido com ele: o
 * Excel guarda "01234567890" como número e o arquivo chega com 10
 * dígitos. Devolver sem conferir o dígito verificador transformaria
 * qualquer número de 10 dígitos em CPF.
 */
export function validarLinhas(brutas: LinhaBruta[]): {
  validas: LinhaColaborador[];
  problemas: ProblemaDaLinha[];
} {
  const validas: LinhaColaborador[] = [];
  const problemas: ProblemaDaLinha[] = [];
  const vistos = new Map<string, number>();

  for (const b of brutas) {
    const nome = b.nome.replace(/\s+/g, " ").trim();
    const recusar = (motivo: string) => problemas.push({ linha: b.linha, nome: nome || "(sem nome)", motivo });

    if (!nome) { recusar("sem nome"); continue; }
    if (nome.split(" ").length < 2) { recusar("nome incompleto — precisa de nome e sobrenome"); continue; }

    let cpf = b.cpf.replace(/\D/g, "");
    let cpfCorrigido = false;
    if (cpf.length === 10 && cpfValido(`0${cpf}`)) {
      cpf = `0${cpf}`;
      cpfCorrigido = true;
    }
    if (!cpf) { recusar("sem CPF"); continue; }
    if (cpf.length !== 11) { recusar(`CPF com ${cpf.length} dígitos`); continue; }
    if (!cpfValido(cpf)) { recusar("CPF inválido (o dígito verificador não confere)"); continue; }

    if (!b.cargo.trim()) { recusar("sem cargo"); continue; }
    if (!b.area.trim()) { recusar("sem área"); continue; }

    const repetida = vistos.get(cpf);
    if (repetida !== undefined) { recusar(`CPF repetido — já está na linha ${repetida}`); continue; }
    vistos.set(cpf, b.linha);

    const { area } = areaCanonica(b.area);
    validas.push({
      linha: b.linha,
      matricula: b.matricula.trim() || null,
      nome,
      cpf,
      cargo: b.cargo.replace(/\s+/g, " ").trim(),
      area,
      areaDaPlanilha: b.area.trim(),
      cpfCorrigido,
    });
  }
  return { validas, problemas };
}

/** Quem já tem cadastro no app, pelo CPF. */
export type Existente = {
  id: string;
  nome: string;
  cargo: string | null;
  area: string | null;
  matricula: string | null;
  /** As revendas a que a pessoa está vinculada. */
  revendas: string[];
};

export type LinhaParaAtualizar = LinhaColaborador & { id: string; mudancas: string[] };
export type LinhaDeOutraUnidade = LinhaColaborador & { nomeNoApp: string };

export type Classificacao = {
  criar: LinhaColaborador[];
  atualizar: LinhaParaAtualizar[];
  semMudanca: number;
  outraUnidade: LinhaDeOutraUnidade[];
};

/**
 * O QUE CADA LINHA VAI VIRAR -- decidido pelo CPF.
 *
 *   CPF novo                         -> CRIAR o acesso, nesta unidade.
 *   CPF desta unidade, algo mudou    -> ATUALIZAR nome, cargo, área e
 *                                       matrícula.
 *   CPF desta unidade, nada mudou    -> nada (e conta, para a prévia
 *                                       dizer que a planilha bateu).
 *   CPF de OUTRA unidade             -> NÃO MEXE.
 *
 * O último caso é o que exige cuidado. O perfil é um só para o app
 * inteiro: atualizar pelo arquivo de Barreiras o cargo de alguém de São
 * Félix trocaria o cargo dele lá também, e quem importou nem saberia que
 * aquela pessoa existia na outra unidade. Vincular a pessoa às duas é
 * decisão de quem administra, pela ficha dela -- não efeito colateral de
 * uma planilha.
 */
export function classificar(
  validas: LinhaColaborador[],
  existentes: Map<string, Existente>,
  revendaId: string,
): Classificacao {
  const saida: Classificacao = { criar: [], atualizar: [], semMudanca: 0, outraUnidade: [] };

  for (const l of validas) {
    const e = existentes.get(l.cpf);
    if (!e) { saida.criar.push(l); continue; }
    if (!e.revendas.includes(revendaId)) {
      saida.outraUnidade.push({ ...l, nomeNoApp: e.nome });
      continue;
    }

    const mudancas: string[] = [];
    const comparar = (rotulo: string, antes: string | null, depois: string | null) => {
      if ((antes ?? "").trim() !== (depois ?? "").trim()) {
        mudancas.push(`${rotulo}: "${antes ?? "—"}" → "${depois ?? "—"}"`);
      }
    };
    comparar("nome", e.nome, l.nome);
    comparar("cargo", e.cargo, l.cargo);
    comparar("área", e.area, l.area);
    // Matrícula em branco na planilha não APAGA a que existe: é a coluna
    // que mais chega vazia de arquivo montado à mão, e perder a matrícula
    // de alguém por uma célula esquecida seria o pior tipo de efeito.
    if (l.matricula) comparar("matrícula", e.matricula, l.matricula);

    if (mudancas.length === 0) saida.semMudanca++;
    else saida.atualizar.push({ ...l, id: e.id, mudancas });
  }
  return saida;
}

/** O que a leitura devolve para a tela mostrar antes de gravar. */
export type EstadoDaLeitura =
  | null
  | { ok: false; erro: string }
  | {
      ok: true;
      nomeArquivo: string;
      revendaNome: string;
      total: number;
      criar: LinhaColaborador[];
      atualizar: LinhaParaAtualizar[];
      semMudanca: number;
      outraUnidade: LinhaDeOutraUnidade[];
      problemas: ProblemaDaLinha[];
      areasConvertidas: { de: string; para: string; quantas: number }[];
      /** Áreas que o app não traduz para DU/AL -- ficariam sem Desafio,
       *  Escala e comunicado por área. */
      areasSemTraducao: { area: string; quantas: number }[];
      cpfsCorrigidos: number;
    };
