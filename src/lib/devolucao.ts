/**
 * DEVOLUÇÃO
 *
 * Sai do relatório 03.02.37, que é por NOTA FISCAL -- as colunas de
 * produto e quantidade vêm vazias em 100% das linhas, então não dá para
 * saber QUAL item voltou, só o valor da nota.
 *
 * Só matemática e leitura de arquivo aqui: sem banco e sem React.
 */

import { dataParaIso, normalizarMapa } from "@/lib/rotas";

// --------------------------------------------------------------------
// RESPONSABILIDADE
// --------------------------------------------------------------------

/** Os clusters da casa, como a operação fala. */
export const RESPONSABILIDADES = [
  "mercado",
  "armazem_financeiro",
  "vendas",
  "entrega",
  "nao_classificado",
] as const;
export type Responsabilidade = (typeof RESPONSABILIDADES)[number];

export const ROTULO_RESPONSABILIDADE: Record<Responsabilidade, { curto: string; longo: string; ajuda: string }> = {
  mercado: {
    curto: "Mercado",
    longo: "Mercado",
    ajuda: "PDV fechado, sem dinheiro, cancelou o pedido — a entrega chegou, o PDV é que não recebeu.",
  },
  armazem_financeiro: {
    curto: "Armazém/Fin.",
    longo: "Armazém/Financeiro",
    ajuda: "Carga errada, NF errada, falta de produto, cancelamento fiscal — resolvido antes da rua.",
  },
  vendas: {
    curto: "Vendas",
    longo: "Vendas",
    ajuda: "Pedido que não devia ter sido feito: não fez pedido, pedido duplicado, preço ou prazo errado.",
  },
  entrega: {
    curto: "Entrega",
    longo: "Entrega",
    ajuda: "Tempo insuficiente, entrega atrasada — o que de fato acontece na rua.",
  },
  nao_classificado: {
    curto: "A classificar",
    longo: "Ainda não classificado",
    ajuda: "Motivo novo, que ainda não foi encaixado num cluster. Enquanto isso fica de fora da conta.",
  },
};

export function ehResponsabilidade(v: unknown): v is Responsabilidade {
  return typeof v === "string" && (RESPONSABILIDADES as readonly string[]).includes(v);
}

/**
 * DE QUEM FOI e ENTRA NA CONTA são coisas diferentes.
 *
 * Um cancelamento por NF rejeitada é falha da OPERAÇÃO, mas não é
 * devolução de verdade e não deve entrar no % da revenda. Com um campo
 * só, para tirar do percentual era preciso mentir sobre de quem foi.
 *
 * `responsabilidade` responde "de quem foi"; `conta_no_indicador`
 * responde "entra no %". Os dois se ajustam no Admin.
 */
export type ClassificacaoDoMotivo = {
  responsabilidade: Responsabilidade;
  contaNoIndicador: boolean;
};

/** Motivo que ainda não conta: fora do indicador até alguém decidir. */
export const MOTIVOS_FORA_DO_INDICADOR = new Set<string>([
  "3",  // Devolucao NFe
  "4",  // Devolucao NFe
  "5",  // Canc.Por Prazo Expirado SEFAZ
  "6",  // Canc. Aut. NF Ret. Vasilhame
  "7",  // OUTROS MOTIVOS VALIDADO AC
  // Carrega as quatro notas de transferência para a FABRICA CAMACARI --
  // R$ 836 mil, 58% do valor devolvido do ano.
  "8",  // Mapa nao carregado / nao canc.
]);

/**
 * Classificação SUGERIDA, aplicada só a motivo que ainda não foi
 * classificado pela liderança. É ponto de partida, não verdade: a régua
 * de verdade mora no banco e se muda na tela do Admin.
 *
 * Vem da leitura das descrições dos 30 motivos que apareceram em 2026.
 */
export const CLASSIFICACAO_SUGERIDA: Record<string, Responsabilidade> = {
  // --- MERCADO: a entrega chegou, o PDV é que não recebeu ---
  "37": "mercado", // PDV Fechado
  "38": "mercado", // Sem Dinheiro
  "39": "mercado", // Cliente Cancelou
  "40": "mercado", // Horario de Entrega
  "41": "mercado", // Sem Vasilhame
  "43": "mercado", // Forma de Pagamento
  "44": "mercado", // Estoque Cheio
  "46": "mercado", // Endereco Nao Encontrado
  "47": "mercado", // Dificil Acesso
  "48": "mercado", // PDV Fechado Apos
  "49": "mercado", // Area de Risco
  "70": "mercado", // CLIENTE CANCELOU
  "82": "mercado", // ENDERECO NAO ENCONTRADO

  // --- VENDAS: pedido que não devia ter sido feito daquele jeito ---
  "22": "vendas", // (C)Solicitacao vendas/cliente
  "23": "vendas", // (C)Pedidos duplicados
  "33": "vendas", // Nao Fez Pedido
  "34": "vendas", // Pedido Duplicado
  "35": "vendas", // Preco Errado
  "36": "vendas", // Prazo Errado

  // --- ARMAZÉM / FINANCEIRO: resolvido antes da rua ---
  "2": "armazem_financeiro",  // Sem Vasilhame Ambev
  "19": "armazem_financeiro", // (C)Produtiv. / roterizacao
  "42": "armazem_financeiro", // Produto/Quantidade Errada
  "50": "armazem_financeiro", // CARGA ERRADA ARMAZEM
  "51": "armazem_financeiro", // NF ERRADA
  "52": "armazem_financeiro", // FALTA PRODUTO ESTOQUE
  "53": "armazem_financeiro", // PROD PROXIMO VENCIM. COMERCIAL
  "55": "armazem_financeiro", // QUALIDADE DO PRODUTO
  "57": "armazem_financeiro", // Produto Danificado
  "58": "armazem_financeiro", // Carga Errada
  "59": "armazem_financeiro", // Qualidade do Produto
  "63": "armazem_financeiro", // PRODUTO / QTDE. ERRADA
  "68": "armazem_financeiro", // TROCA (SEM SELO / QTDE. ERRADA)
  "81": "armazem_financeiro", // PRODUTO DANIFICADO / FALTA

  // --- ENTREGA: o que de fato acontece na rua ---
  "32": "entrega", // ENTREGA ATRASADA (BUFFER)
  "45": "entrega", // Tempo Insuficiente
  "87": "entrega", // TEMPO INSUFICIENTE

  // --- Armazém/Financeiro, mas FORA do indicador (ver MOTIVOS_FORA_DO_INDICADOR) ---
  "3": "armazem_financeiro", // Devolucao NFe
  "4": "armazem_financeiro", // Devolucao NFe
  "5": "armazem_financeiro", // Canc.Por Prazo Expirado SEFAZ
  "6": "armazem_financeiro", // Canc. Aut. NF Ret. Vasilhame
  "7": "armazem_financeiro", // OUTROS MOTIVOS VALIDADO AC
  "8": "armazem_financeiro", // Mapa nao carregado / nao canc.
};

/** O que sugerir para um motivo novo, nos dois eixos. */
export function classificacaoSugerida(codigo: string): ClassificacaoDoMotivo {
  return {
    responsabilidade: CLASSIFICACAO_SUGERIDA[codigo] ?? "nao_classificado",
    // Motivo desconhecido nasce fora do indicador: nunca entra como
    // número de alguém antes de a liderança olhar.
    contaNoIndicador: Boolean(CLASSIFICACAO_SUGERIDA[codigo]) && !MOTIVOS_FORA_DO_INDICADOR.has(codigo),
  };
}

// --------------------------------------------------------------------
// LEITURA DO RELATÓRIO
// --------------------------------------------------------------------

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

function indiceDaColuna(cabecalho: string[], ...nomes: string[]): number {
  const limpar = (s: string) =>
    (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const alvos = nomes.map(limpar);
  return cabecalho.findIndex((c) => alvos.includes(limpar(c)));
}

/** "1.485,41" -> 1485.41 */
function dinheiro(bruto: string | undefined): number {
  const limpo = String(bruto ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

export function normalizarCodigo(bruto: string | undefined): string | null {
  const digitos = String(bruto ?? "").trim().replace(/\D/g, "");
  if (!digitos) return null;
  return digitos.replace(/^0+/, "") || null;
}

export type NotaDevolvida = {
  data: string;
  nota: string;
  serie: string | null;
  mapa: string | null;
  motivoCodigo: string | null;
  clienteCodigo: string | null;
  clienteNome: string | null;
  valor: number;
  motoristaCodigo: string | null;
};

/**
 * O dia de um motorista: o denominador do indicador.
 *
 * `pdvsEntregues` e `pdvsDevolvidos` contam PONTOS DE VENDA DISTINTOS --
 * é a régua principal, porque é assim que a operação mede (inclusive na
 * RV). Um mesmo PDV com duas notas no dia conta uma vez só.
 */
export type DiaDoMotorista = {
  data: string;
  motoristaCodigo: string;
  notasEntregues: number;
  valorEntregue: number;
  notasDevolvidas: number;
  valorDevolvido: number;
  pdvsEntregues: number;
  pdvsDevolvidos: number;
  /** Os códigos, para quem chama conseguir descontar os motivos que não
   *  entram na conta antes de gravar. */
  pdvsEntreguesCodigos: string[];
  pdvsDevolvidosPorMotivo: { pdv: string; motivo: string | null }[];
};

/**
 * Lê o 03.02.37.
 *
 * Devolve DUAS coisas: as notas devolvidas (status "D", com todo o
 * detalhe) e o AGREGADO do dia de cada motorista, que inclui o entregue
 * (status "A").
 *
 * O entregue vem agregado de propósito: são 58.005 notas em 8 meses
 * contra 727 devoluções, e o app não precisa da nota entregue
 * individual para nada -- só do total, que é o denominador do "% de
 * devolução". Agregando, o mesmo período cabe em 2.167 linhas.
 */
export function lerRelatorioDeDevolucao(texto: string): {
  notas: NotaDevolvida[];
  dias: DiaDoMotorista[];
  faltando: string[];
  /** Quantas linhas o arquivo tinha, para o relatório da importação. */
  linhasLidas: number;
} {
  const linhas = (texto ?? "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return { notas: [], dias: [], faltando: ["arquivo vazio"], linhasLidas: 0 };

  const cab = separarLinha(linhas[0]);
  const iStatus = indiceDaColuna(cab, "Status");
  const iNota = indiceDaColuna(cab, "Nota");
  const iData = indiceDaColuna(cab, "Dt. Operacao", "Dt Operacao", "Dt. Operação");

  const faltando: string[] = [];
  if (iStatus < 0) faltando.push("Status");
  if (iNota < 0) faltando.push("Nota");
  if (iData < 0) faltando.push("Dt. Operacao");
  if (faltando.length) return { notas: [], dias: [], faltando, linhasLidas: linhas.length - 1 };

  const i = {
    serie: indiceDaColuna(cab, "Serie", "Série"),
    mapa: indiceDaColuna(cab, "Mapa"),
    motivo: indiceDaColuna(cab, "Mot. Cancelamento"),
    // "Cliente" é o código e "Nome" é a razão social -- nomes infelizes,
    // mas são os do relatório.
    clienteCodigo: indiceDaColuna(cab, "Cliente"),
    clienteNome: indiceDaColuna(cab, "Nome"),
    valor: indiceDaColuna(cab, "Total"),
    motorista: indiceDaColuna(cab, "Motorista"),
  };

  const notas: NotaDevolvida[] = [];
  const vistas = new Set<string>();
  type Acumulado = DiaDoMotorista & { setEntregues: Set<string> };
  const porDia = new Map<string, Acumulado>();
  const txt = (c: string[], idx: number) => (idx >= 0 ? c[idx]?.trim() || null : null);

  for (const linha of linhas.slice(1)) {
    const c = separarLinha(linha);
    const status = c[iStatus];
    // "A" = Entregue, "E" = Emitida, "D" = Devolvida, "C" = Cancelada.
    // Só entregue e devolvida entram na conta: emitida ainda não virou
    // entrega e cancelada nunca saiu.
    if (status !== "D" && status !== "A") continue;

    const data = dataParaIso(c[iData] ?? "");
    if (!data) continue;

    // --- O agregado do dia, que vale para entregue e devolvida ---
    const motorista = normalizarCodigo(c[i.motorista]);
    const pdv = txt(c, i.clienteCodigo);
    if (motorista) {
      const chaveDia = `${data}|${motorista}`;
      const dia = porDia.get(chaveDia) ?? {
        data,
        motoristaCodigo: motorista,
        notasEntregues: 0,
        valorEntregue: 0,
        notasDevolvidas: 0,
        valorDevolvido: 0,
        pdvsEntregues: 0,
        pdvsDevolvidos: 0,
        pdvsEntreguesCodigos: [],
        pdvsDevolvidosPorMotivo: [],
        setEntregues: new Set<string>(),
      };
      const v = i.valor >= 0 ? dinheiro(c[i.valor]) : 0;
      if (status === "A") {
        dia.notasEntregues++;
        dia.valorEntregue += v;
        // PDV distinto: o mesmo cliente com duas notas no dia conta uma vez.
        if (pdv) dia.setEntregues.add(pdv);
      } else {
        dia.notasDevolvidas++;
        dia.valorDevolvido += v;
        if (pdv) dia.pdvsDevolvidosPorMotivo.push({ pdv, motivo: normalizarCodigo(c[i.motivo]) });
      }
      porDia.set(chaveDia, dia);
    }

    if (status !== "D") continue;

    const nota = (c[iNota] ?? "").trim();
    if (!nota) continue;

    // Conferido nas 727 devoluções de 2026: o número da nota não repete.
    // A trava existe porque duas linhas com a mesma chave no mesmo lote
    // fariam o upsert reclamar.
    const serie = txt(c, i.serie);
    const chave = `${nota}|${serie ?? ""}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);

    const mapaBruto = txt(c, i.mapa);

    notas.push({
      data,
      nota,
      serie,
      mapa: mapaBruto ? normalizarMapa(mapaBruto) || null : null,
      motivoCodigo: normalizarCodigo(c[i.motivo]),
      clienteCodigo: txt(c, i.clienteCodigo),
      clienteNome: txt(c, i.clienteNome),
      valor: i.valor >= 0 ? dinheiro(c[i.valor]) : 0,
      motoristaCodigo: motorista,
    });
  }

  // Centavos não sobrevivem à soma de milhares de notas sem isto.
  const dias: DiaDoMotorista[] = [...porDia.values()].map((d) => {
    const { setEntregues, ...resto } = d;
    return {
      ...resto,
      valorEntregue: Math.round(d.valorEntregue * 100) / 100,
      valorDevolvido: Math.round(d.valorDevolvido * 100) / 100,
      pdvsEntreguesCodigos: [...setEntregues],
      pdvsEntregues: setEntregues.size,
      // Quantos PDVs distintos tiveram devolução, sem filtrar motivo. Quem
      // grava aplica a régua do Admin e recalcula -- ver contarPdvsQueContam.
      pdvsDevolvidos: new Set(d.pdvsDevolvidosPorMotivo.map((x) => x.pdv)).size,
    };
  });

  return { notas, dias, faltando: [], linhasLidas: linhas.length - 1 };
}

/**
 * PDVs distintos com devolução que CONTA, descontando os motivos que a
 * liderança tirou do indicador.
 *
 * Feito à parte da leitura porque a régua mora no banco: o mesmo arquivo
 * dá números diferentes conforme a classificação dos motivos.
 */
export function contarPdvsQueContam(
  devolvidos: { pdv: string; motivo: string | null }[],
  motivoConta: (codigo: string | null) => boolean,
): number {
  const pdvs = new Set<string>();
  for (const d of devolvidos) {
    if (!motivoConta(d.motivo)) continue;
    pdvs.add(d.pdv);
  }
  return pdvs.size;
}

// --------------------------------------------------------------------
// A META
// --------------------------------------------------------------------

/** Padrão pedido pelo dono. A régua de verdade fica em
 *  devolucao_config.meta_pct, editável no Admin. */
export const META_PADRAO_PCT = 1.6;

/**
 * O INDICADOR PRINCIPAL: % de PDVs com devolução sobre os PDVs
 * atendidos. É como a operação mede, inclusive para a RV.
 *
 * `null` sem PDV atendido: dia sem entrega não tem percentual, e mostrar
 * 0% daria a impressão de dia perfeito.
 *
 * A régua é grossa no dia, e é bom saber: com ~16 PDVs por dia, uma
 * única devolução dá ~6%. Medido nos 8 meses de 2026, a operação roda a
 * 1,47% e 18% dos dias passam de 1,6% -- que são exatamente os dias que
 * tiveram alguma devolução.
 */
export function pctPdvDoDia(pdvsEntregues: number, pdvsDevolvidos: number): number | null {
  const base = pdvsEntregues + pdvsDevolvidos;
  if (base <= 0) return null;
  return Math.round((pdvsDevolvidos / base) * 10000) / 100;
}

/**
 * O mesmo em VALOR -- segundo plano na tela, mas continua existindo.
 *
 * `foraDoIndicador` sai dos DOIS lados da divisão: é transferência para
 * a fábrica e cancelamento fiscal, que não são entrega nem falha. Sem
 * tirar, uma única nota de R$ 547 mil jogaria o dia para 96%.
 */
export function pctDoDia(
  valorEntregue: number,
  valorDevolvido: number,
  foraDoIndicador = 0,
): number | null {
  const devolvido = Math.max(valorDevolvido - foraDoIndicador, 0);
  const base = valorEntregue + devolvido;
  if (base <= 0) return null;
  return Math.round((devolvido / base) * 10000) / 100;
}

/** O dia pede justificativa? Só quando há percentual e ele passa da meta. */
export function precisaJustificar(pct: number | null, meta: number): boolean {
  return pct !== null && pct > meta;
}

/** Lê a tabela de motivos (01.20.01.06): código -> descrição. */
export function lerTabelaDeMotivos(texto: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const linhas = (texto ?? "").split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return mapa;

  const cab = separarLinha(linhas[0]);
  const iCod = indiceDaColuna(cab, "Codigo", "Código");
  const iDesc = indiceDaColuna(cab, "Descricao", "Descrição");
  if (iCod < 0 || iDesc < 0) return mapa;

  for (const linha of linhas.slice(1)) {
    const c = separarLinha(linha);
    const cod = normalizarCodigo(c[iCod]);
    const desc = (c[iDesc] ?? "").trim();
    if (cod && desc && !mapa.has(cod)) mapa.set(cod, desc);
  }
  return mapa;
}

// --------------------------------------------------------------------
// RESUMO
// --------------------------------------------------------------------

export type LinhaDevolucao = {
  valor: number;
  responsabilidade: Responsabilidade;
  /** A régua do Admin. Ausente = não conta, para motivo novo nunca virar
   *  número de alguém antes de a liderança olhar. */
  contaNoIndicador?: boolean;
};

export type ResumoDevolucao = {
  /** Só o que entra no indicador. */
  notas: number;
  valor: number;
  /** A quebra por responsabilidade, SÓ do que conta. */
  porResponsabilidade: Record<Responsabilidade, { notas: number; valor: number }>;
  /** Fora do indicador, mostrado à parte para ninguém achar que sumiu. */
  foraDoIndicador: { notas: number; valor: number };
  aClassificar: number;
};

export function resumirDevolucao(linhas: LinhaDevolucao[]): ResumoDevolucao {
  const vazio = () => ({ notas: 0, valor: 0 });
  const por: Record<Responsabilidade, { notas: number; valor: number }> = {
    mercado: vazio(),
    armazem_financeiro: vazio(),
    vendas: vazio(),
    entrega: vazio(),
    nao_classificado: vazio(),
  };
  const fora = vazio();
  let aClassificar = 0;

  for (const l of linhas) {
    if (l.responsabilidade === "nao_classificado") aClassificar++;
    // "Entra na conta" é decisão à parte de "de quem foi": uma NF
    // rejeitada é do Armazém/Financeiro e mesmo assim não entra no
    // percentual.
    if (l.contaNoIndicador === false || l.responsabilidade === "nao_classificado") {
      fora.notas++;
      fora.valor += l.valor;
      continue;
    }
    const alvo = por[l.responsabilidade] ?? por.nao_classificado;
    alvo.notas++;
    alvo.valor += l.valor;
  }

  for (const k of Object.keys(por) as Responsabilidade[]) {
    por[k].valor = Math.round(por[k].valor * 100) / 100;
  }

  const contam: Responsabilidade[] = ["mercado", "armazem_financeiro", "vendas", "entrega"];
  return {
    notas: contam.reduce((s, k) => s + por[k].notas, 0),
    valor: Math.round(contam.reduce((s, k) => s + por[k].valor, 0) * 100) / 100,
    porResponsabilidade: por,
    foraDoIndicador: { notas: fora.notas, valor: Math.round(fora.valor * 100) / 100 },
    aClassificar,
  };
}

// --------------------------------------------------------------------
// POR PDV
// --------------------------------------------------------------------

export type LinhaPdv = {
  clienteCodigo: string | null;
  clienteNome: string | null;
  valor: number;
  contaNoIndicador?: boolean;
};

/**
 * Devolução por ponto de venda, do maior valor para o menor. Só o que
 * entra no indicador -- transferência para a fábrica ficaria em primeiro
 * lugar e esconderia os clientes de verdade.
 */
export function porPdv(linhas: LinhaPdv[]): { chave: string; total: number; notas: number }[] {
  const mapa = new Map<string, { valor: number; notas: number }>();
  for (const l of linhas) {
    if (l.contaNoIndicador === false) continue;
    const nome = l.clienteNome?.trim() || (l.clienteCodigo ? `Cliente ${l.clienteCodigo}` : null);
    if (!nome) continue;
    const o = mapa.get(nome) ?? { valor: 0, notas: 0 };
    o.valor += l.valor;
    o.notas++;
    mapa.set(nome, o);
  }
  return [...mapa]
    .map(([chave, o]) => ({ chave, total: Math.round(o.valor * 100) / 100, notas: o.notas }))
    .sort((a, b) => b.total - a.total);
}

export function formatarReais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
