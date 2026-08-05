/**
 * Leitura da planilha do roteirizador.
 *
 * O arquivo é um CSV separado por ponto e vírgula, gerado em ISO-8859-1
 * (latin1) -- lido como UTF-8, "SERRA DOURADA" viraria "SERRA DOURADA" com
 * acentos quebrados. Por isso este módulo não reaproveita o leitor da RV,
 * que assume UTF-8 e trata outra estrutura.
 */

export type BairroEntregas = { nome: string; entregas: number };
export type CidadeEntregas = {
  cidade: string;
  entregas: number;
  /** Detalhe por bairro, quando a planilha trouxe a coluna de região. */
  bairros?: BairroEntregas[];
};

export type Rota = {
  data: string; // AAAA-MM-DD
  mapa: string; // sem zeros à esquerda
  mapaOriginal: string;
  veiculo: string | null;
  placa: string | null;
  motoristaCodigo: string | null;
  kmPrev: number | null;
  tempoPrev: string | null;
  entregas: number | null;
  caixas: number | null;
  ocupacaoCaixas: number | null;
  peso: number | null;
  ocupacaoPeso: number | null;
  armazem: string | null;
  classificacao: string | null;
  cidades: CidadeEntregas[];
};

/**
 * O motorista digita "14768"; a planilha traz "014768". Comparar texto
 * cru falharia sempre, então os dois lados passam por aqui.
 */
export function normalizarMapa(valor: string) {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos.replace(/^0+/, "") || digitos;
}

/** "01/08/2026" -> "2026-08-01". Devolve null se não reconhecer. */
export function dataParaIso(valor: string) {
  const m = (valor ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

/** "58,88" -> 58.88 · "6548" -> 6548 · "" -> null */
export function numeroBr(valor: string): number | null {
  const limpo = (valor ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * "SERRA DOURADA (20) / TABOCAS DO BREJO VELHO (6)" vira duas linhas.
 *
 * A planilha junta cidade e quantidade num campo só, com a quantidade
 * entre parênteses e as cidades separadas por barra. Conferi em toda a
 * planilha: a soma sempre bate com a coluna "Entregas".
 */
export function separarCidades(bruto: string): CidadeEntregas[] {
  return (bruto ?? "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(.*?)\s*\((\d+)\)\s*$/);
      // Sem parênteses, guardamos o nome e deixamos a quantidade em zero
      // em vez de descartar a cidade: perder informação é pior.
      if (!m) return { cidade: p, entregas: 0 };
      return { cidade: m[1].trim(), entregas: Number(m[2]) };
    })
    .filter((c) => c.cidade.length > 0);
}

/**
 * "[SER]: CENTRO (5) / CENTRO (5) / [TAB]: CENTRO (3) / ..." vira um bloco
 * de bairros por cidade.
 *
 * A planilha marca o início de cada cidade com um código entre colchetes
 * (a sigla dela), então cortamos ali. O casamento com a lista de cidades é
 * pela ORDEM, não pelo código -- testado contra a planilha real e a soma
 * dos bairros sempre bate com a contagem da cidade correspondente.
 */
export function separarRegioes(bruto: string): BairroEntregas[][] {
  return (bruto ?? "")
    .split(/\[[A-Z0-9]{2,6}\]:\s*/)
    .filter((b) => b.trim())
    .map((bloco) =>
      bloco
        .split("/")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const m = p.match(/^(.*?)\s*\((\d+)\)\s*$/);
          return m
            ? { nome: m[1].trim(), entregas: Number(m[2]) }
            : { nome: p, entregas: 0 };
        })
        .filter((b) => b.nome.length > 0),
    );
}

/**
 * Junta cidades com o detalhe de bairro, na mesma posição.
 *
 * Só anexa quando as duas listas têm o mesmo tamanho: um descompasso
 * significa que a planilha mudou de formato, e é mais seguro mostrar a
 * cidade sem o detalhe do que arriscar atribuir o bairro errado a ela.
 */
export function juntarComBairros(
  cidades: CidadeEntregas[],
  blocos: BairroEntregas[][],
): CidadeEntregas[] {
  if (cidades.length !== blocos.length) return cidades;
  return cidades.map((c, i) => ({ ...c, bairros: blocos[i] }));
}

/** Divide uma linha de CSV com ponto e vírgula, respeitando aspas. */
function separarLinha(linha: string) {
  const campos: string[] = [];
  let atual = "";
  let dentroDeAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroDeAspas = !dentroDeAspas;
      }
    } else if (c === ";" && !dentroDeAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

/** Nomes exatos das colunas na planilha do roteirizador. */
const COLUNA = {
  data: "Data Entrega",
  mapa: "Nro do Mapa",
  veiculo: "Veículo",
  placa: "Placa",
  motorista: "Motorista",
  km: "KM Prev.",
  tempo: "Tempo Prev. (+almoço)",
  entregas: "Entregas",
  caixas: "Total de caixas",
  ocupCaixas: "% Ocupação Caixas",
  peso: "Total peso",
  ocupPeso: "% Ocupação Peso",
  armazem: "Armazém",
  classificacao: "Classificação",
  cidades: "Cidades +Entregas",
  regiao: "Região +Entregas",
};

export type ResultadoLeitura = {
  rotas: Rota[];
  /** Colunas esperadas que não foram encontradas no arquivo. */
  faltando: string[];
};

export function lerPlanilhaDeRotas(texto: string): ResultadoLeitura {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return { rotas: [], faltando: [] };

  const cabecalho = separarLinha(linhas[0]);
  const posicao = new Map(cabecalho.map((c, i) => [c, i]));

  const faltando = Object.values(COLUNA).filter((c) => !posicao.has(c));
  // Sem data ou mapa não há como identificar a rota; o resto é opcional.
  if (!posicao.has(COLUNA.data) || !posicao.has(COLUNA.mapa)) {
    return { rotas: [], faltando };
  }

  const pegar = (campos: string[], nome: string) => {
    const i = posicao.get(nome);
    return i === undefined ? "" : (campos[i] ?? "");
  };

  const rotas: Rota[] = [];

  for (const linha of linhas.slice(1)) {
    const campos = separarLinha(linha);

    const data = dataParaIso(pegar(campos, COLUNA.data));
    const mapaOriginal = pegar(campos, COLUNA.mapa);
    const mapa = normalizarMapa(mapaOriginal);
    if (!data || !mapa) continue;

    rotas.push({
      data,
      mapa,
      mapaOriginal,
      veiculo: pegar(campos, COLUNA.veiculo) || null,
      placa: pegar(campos, COLUNA.placa) || null,
      motoristaCodigo: pegar(campos, COLUNA.motorista) || null,
      kmPrev: numeroBr(pegar(campos, COLUNA.km)),
      tempoPrev: pegar(campos, COLUNA.tempo) || null,
      entregas: numeroBr(pegar(campos, COLUNA.entregas)),
      caixas: numeroBr(pegar(campos, COLUNA.caixas)),
      ocupacaoCaixas: numeroBr(pegar(campos, COLUNA.ocupCaixas)),
      peso: numeroBr(pegar(campos, COLUNA.peso)),
      ocupacaoPeso: numeroBr(pegar(campos, COLUNA.ocupPeso)),
      armazem: pegar(campos, COLUNA.armazem) || null,
      classificacao: pegar(campos, COLUNA.classificacao) || null,
      cidades: juntarComBairros(
        separarCidades(pegar(campos, COLUNA.cidades)),
        separarRegioes(pegar(campos, COLUNA.regiao)),
      ),
    });
  }

  return { rotas, faltando };
}

/* ---------------- Formatação para a tela ---------------- */

export function formatarKm(km: number | null) {
  if (km === null) return "—";
  return `${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

/** "05:21:00" vira "5h21" — ninguém precisa dos segundos. */
export function formatarTempo(tempo: string | null) {
  if (!tempo) return "—";
  const m = tempo.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return tempo;
  return `${Number(m[1])}h${m[2]}`;
}

export function formatarPeso(peso: number | null) {
  if (peso === null) return "—";
  return `${peso.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
}

export function formatarCaixas(caixas: number | null) {
  if (caixas === null) return "—";
  return caixas.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function formatarPercentual(valor: number | null) {
  if (valor === null) return "—";
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
}

export function formatarDataBr(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export type Metas = {
  /** Meta de ocupação em %, vale para caixas e peso. */
  ocupacao: number;
  /** Meta de caixas por viagem. Null = a operação não cobra. */
  caixas: number | null;
};

export const METAS_PADRAO: Metas = { ocupacao: 70, caixas: null };

export type Aferição = {
  rotulo: string;
  cor: string;
  fundo: string;
  barra: string;
  icone: string;
};

/**
 * Compara um valor com a meta e devolve como mostrar isso na tela.
 *
 * Ocupação baixa é o problema: caminhão saindo com espaço sobrando é
 * viagem paga por carga que não foi. Por isso a escala sobe com o número.
 *
 * A régua é RELATIVA à meta, não a números fixos. Com meta de 70%, 68% é
 * quase lá; com meta de 90%, o mesmo 68% está longe. Só comparando com a
 * meta o aviso diz a verdade para a operação de vocês.
 */
export function aferir(valor: number | null, meta: number | null): Aferição {
  if (valor === null || !meta) {
    return {
      rotulo: "—",
      cor: "text-slate-400",
      fundo: "bg-slate-100",
      barra: "bg-slate-300",
      icone: "",
    };
  }

  const proporcao = valor / meta;

  if (proporcao >= 1) {
    return {
      rotulo: "Na meta",
      cor: "text-green-700",
      fundo: "bg-green-50",
      barra: "bg-green-500",
      icone: "✅",
    };
  }

  // A 15% da meta ainda é "quase": vale sinalizar sem soar alarme.
  if (proporcao >= 0.85) {
    return {
      rotulo: "Quase lá",
      cor: "text-amber-700",
      fundo: "bg-amber-50",
      barra: "bg-amber-400",
      icone: "⚠️",
    };
  }

  return {
    rotulo: "Abaixo",
    cor: "text-red-700",
    fundo: "bg-red-50",
    barra: "bg-red-500",
    icone: "🔴",
  };
}
