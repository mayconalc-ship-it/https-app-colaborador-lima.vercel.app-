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

export const RESPONSABILIDADES = ["cliente", "operacao", "entrega", "nao_conta", "nao_classificado"] as const;
export type Responsabilidade = (typeof RESPONSABILIDADES)[number];

export const ROTULO_RESPONSABILIDADE: Record<Responsabilidade, { curto: string; longo: string; ajuda: string }> = {
  cliente: {
    curto: "Cliente",
    longo: "Do cliente",
    ajuda: "PDV fechado, sem dinheiro, cancelou o pedido — a entrega chegou, o cliente é que não recebeu.",
  },
  operacao: {
    curto: "Operação",
    longo: "Da operação",
    ajuda: "Carga errada, NF errada, falta de produto, roteirização — resolvido antes da rua.",
  },
  entrega: {
    curto: "Entrega",
    longo: "Da entrega",
    ajuda: "Tempo insuficiente, entrega atrasada — o que de fato acontece na rua.",
  },
  nao_conta: {
    curto: "Não conta",
    longo: "Fora do indicador",
    ajuda: "Transferência para a fábrica e afins. Aparece para a liderança, mas não entra no número de ninguém.",
  },
  nao_classificado: {
    curto: "A classificar",
    longo: "Ainda não classificado",
    ajuda: "Motivo novo, que ainda não foi encaixado numa das faixas. Enquanto isso fica de fora da conta.",
  },
};

export function ehResponsabilidade(v: unknown): v is Responsabilidade {
  return typeof v === "string" && (RESPONSABILIDADES as readonly string[]).includes(v);
}

/**
 * Classificação SUGERIDA, aplicada só a motivo que ainda não foi
 * classificado pela liderança. É ponto de partida, não verdade: a régua
 * de verdade mora no banco e se muda na tela do Admin.
 *
 * Vem da leitura das descrições dos 30 motivos que apareceram em 2026.
 * O motivo 8 ("Mapa não carregado / não canc.") entra como `nao_conta`
 * porque é ele que carrega as quatro notas de transferência para a
 * FABRICA CAMACARI -- R$ 836 mil, 58% do valor devolvido do ano. Se a
 * liderança quiser as pequenas de volta, é só reclassificar.
 */
export const CLASSIFICACAO_SUGERIDA: Record<string, Responsabilidade> = {
  // --- do cliente ---
  "33": "cliente", // Nao Fez Pedido
  "37": "cliente", // PDV Fechado
  "38": "cliente", // Sem Dinheiro
  "39": "cliente", // Cliente Cancelou
  "40": "cliente", // Horario de Entrega
  "41": "cliente", // Sem Vasilhame
  "43": "cliente", // Forma de Pagamento
  "44": "cliente", // Estoque Cheio
  "46": "cliente", // Endereco Nao Encontrado
  "47": "cliente", // Dificil Acesso
  "48": "cliente", // PDV Fechado Apos
  "49": "cliente", // Area de Risco
  "70": "cliente", // CLIENTE CANCELOU
  "82": "cliente", // ENDERECO NAO ENCONTRADO

  // --- da operação / armazém ---
  "2": "operacao",  // Sem Vasilhame Ambev
  "19": "operacao", // (C)Produtiv. / roterizacao
  "34": "operacao", // Pedido Duplicado
  "35": "operacao", // Preco Errado
  "36": "operacao", // Prazo Errado
  "42": "operacao", // Produto/Quantidade Errada
  "50": "operacao", // CARGA ERRADA ARMAZEM
  "51": "operacao", // NF ERRADA
  "52": "operacao", // FALTA PRODUTO ESTOQUE
  "53": "operacao", // PROD PROXIMO VENCIM. COMERCIAL
  "55": "operacao", // QUALIDADE DO PRODUTO
  "57": "operacao", // Produto Danificado
  "58": "operacao", // Carga Errada
  "59": "operacao", // Qualidade do Produto
  "63": "operacao", // PRODUTO / QTDE. ERRADA
  "68": "operacao", // TROCA (SEM SELO / QTDE. ERRADA)
  "81": "operacao", // PRODUTO DANIFICADO / FALTA

  // --- da entrega ---
  "32": "entrega", // ENTREGA ATRASADA (BUFFER)
  "45": "entrega", // Tempo Insuficiente
  "87": "entrega", // TEMPO INSUFICIENTE

  // --- fora do indicador ---
  "3": "nao_conta", // Devolucao NFe
  "4": "nao_conta", // Devolucao NFe
  "5": "nao_conta", // Canc.Por Prazo Expirado SEFAZ
  "6": "nao_conta", // Canc. Aut. NF Ret. Vasilhame
  "7": "nao_conta", // OUTROS MOTIVOS VALIDADO AC
  "8": "nao_conta", // Mapa nao carregado / nao canc.
};

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

/** O dia de um motorista: o denominador do indicador. */
export type DiaDoMotorista = {
  data: string;
  motoristaCodigo: string;
  notasEntregues: number;
  valorEntregue: number;
  notasDevolvidas: number;
  valorDevolvido: number;
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
  const porDia = new Map<string, DiaDoMotorista>();
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
    if (motorista) {
      const chaveDia = `${data}|${motorista}`;
      const dia = porDia.get(chaveDia) ?? {
        data,
        motoristaCodigo: motorista,
        notasEntregues: 0,
        valorEntregue: 0,
        notasDevolvidas: 0,
        valorDevolvido: 0,
      };
      const v = i.valor >= 0 ? dinheiro(c[i.valor]) : 0;
      if (status === "A") {
        dia.notasEntregues++;
        dia.valorEntregue += v;
      } else {
        dia.notasDevolvidas++;
        dia.valorDevolvido += v;
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
  const dias = [...porDia.values()].map((d) => ({
    ...d,
    valorEntregue: Math.round(d.valorEntregue * 100) / 100,
    valorDevolvido: Math.round(d.valorDevolvido * 100) / 100,
  }));

  return { notas, dias, faltando: [], linhasLidas: linhas.length - 1 };
}

// --------------------------------------------------------------------
// A META
// --------------------------------------------------------------------

/** Padrão pedido pelo dono. A régua de verdade fica em
 *  devolucao_config.meta_pct, editável no Admin. */
export const META_PADRAO_PCT = 1.6;

/**
 * O % de devolução de um dia: devolvido sobre o que passou pelas mãos da
 * pessoa (entregue + devolvido).
 *
 * `foraDoIndicador` sai dos DOIS lados da divisão -- é transferência
 * para a fábrica e cancelamento fiscal, que não são entrega nem falha.
 * Sem tirar, uma única nota de R$ 547 mil jogaria o dia para 96%.
 *
 * `null` quando não houve movimento: dia sem entrega não tem percentual,
 * e mostrar 0% daria a impressão de dia perfeito.
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
};

export type ResumoDevolucao = {
  /** Só o que entra no indicador -- fora `nao_conta` e `nao_classificado`. */
  notas: number;
  valor: number;
  porResponsabilidade: Record<Responsabilidade, { notas: number; valor: number }>;
  /** Fora do indicador, mostrado à parte para ninguém achar que sumiu. */
  foraDoIndicador: { notas: number; valor: number };
  aClassificar: number;
};

export function resumirDevolucao(linhas: LinhaDevolucao[]): ResumoDevolucao {
  const vazio = () => ({ notas: 0, valor: 0 });
  const por: Record<Responsabilidade, { notas: number; valor: number }> = {
    cliente: vazio(),
    operacao: vazio(),
    entrega: vazio(),
    nao_conta: vazio(),
    nao_classificado: vazio(),
  };

  for (const l of linhas) {
    const alvo = por[l.responsabilidade] ?? por.nao_classificado;
    alvo.notas++;
    alvo.valor += l.valor;
  }
  for (const k of Object.keys(por) as Responsabilidade[]) {
    por[k].valor = Math.round(por[k].valor * 100) / 100;
  }

  const contam: Responsabilidade[] = ["cliente", "operacao", "entrega"];
  const notas = contam.reduce((s, k) => s + por[k].notas, 0);
  const valor = Math.round(contam.reduce((s, k) => s + por[k].valor, 0) * 100) / 100;

  return {
    notas,
    valor,
    porResponsabilidade: por,
    foraDoIndicador: {
      notas: por.nao_conta.notas + por.nao_classificado.notas,
      valor: Math.round((por.nao_conta.valor + por.nao_classificado.valor) * 100) / 100,
    },
    aClassificar: por.nao_classificado.notas,
  };
}

export function formatarReais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
