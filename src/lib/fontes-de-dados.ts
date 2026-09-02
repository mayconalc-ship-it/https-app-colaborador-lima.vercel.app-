/**
 * DE ONDE VÊM OS DADOS DO APP
 *
 * A configuração da fonte morava dentro da tela de cada módulo: o link do
 * Drive do Rating em /admin/rating, o do Refugo em /admin/refugo, os CSVs
 * da RV em /admin/rv, e assim por diante. Sete telas, sete layouts, sete
 * vocabulários -- e nenhum lugar que respondesse "de onde vêm os dados
 * deste app?".
 *
 * Aqui só a descrição das fontes. A leitura e a gravação ficam na tela;
 * o import de verdade continua na action de cada módulo, que é onde a
 * regra de leitura do arquivo mora.
 */

/** Como a fonte chega até o app. */
export type TipoDaFonte =
  /** Pasta pública do Drive, varrida pelo app. */
  | "pasta-drive"
  /** Planilha publicada como CSV, lida por URL. */
  | "csv-publicado"
  /** Arquivo enviado à mão na tela do módulo. Não há link a guardar. */
  | "upload";

export type Fonte = {
  chave: string;
  rotulo: string;
  /** O que esta fonte alimenta, em uma frase de operação. */
  alimenta: string;
  tipo: TipoDaFonte;
  /** Tabela e coluna onde o link vive. Só para as que guardam link. */
  tabela?: string;
  /** A tela do módulo, para quem quiser importar ou ver o histórico. */
  telaDoModulo: string;
  /** O módulo que manda na permissão -- reaproveitamos a que já existe,
   *  em vez de criar uma permissão nova por fonte. */
  modulo: string;
  /** Texto de ajuda específico: cada fonte tem uma pegadinha diferente. */
  ajuda: string;
};

export const FONTES: Fonte[] = [
  {
    chave: "rating",
    rotulo: "Rating de Entrega",
    alimenta: "Nota do cliente, cadastro de motoristas e ajudantes, e o mapa que liga um ao outro",
    tipo: "pasta-drive",
    tabela: "rating_config",
    telaDoModulo: "/admin/rating",
    modulo: "rating",
    ajuda:
      "Aponte para a pasta MÃE no Drive. O app varre as subpastas sozinho e reconhece os relatórios 01.20.01.47, 01.20.01.48, 03.11.29 e o LOG.CO pelo nome do arquivo.",
  },
  {
    chave: "refugo",
    rotulo: "Refugo de Vasilhame",
    alimenta: "Aferição de vasilhame por mapa, com o defeito encontrado em cada garrafa",
    tipo: "pasta-drive",
    tabela: "refugo_config",
    telaDoModulo: "/admin/refugo",
    modulo: "refugo",
    ajuda:
      "Deixar em branco faz o Refugo usar a MESMA pasta do Rating -- é o comportamento normal quando os relatórios chegam juntos.",
  },
  {
    chave: "devolucao",
    rotulo: "Devolução",
    alimenta: "Notas devolvidas por dia e por PDV, e a tabela de motivos",
    tipo: "pasta-drive",
    tabela: "devolucao_config",
    telaDoModulo: "/admin/devolucao",
    modulo: "devolucao",
    ajuda:
      "Precisa do 03.02.37 (as notas) e do 01.20.01.06 (a tabela de motivos). Sem o segundo, os motivos aparecem como código.",
  },
  {
    chave: "rotas",
    rotulo: "Minha Rota (pré-rota)",
    alimenta: "A pré-rota que o motorista consulta antes de sair",
    tipo: "pasta-drive",
    tabela: "rotas_config",
    telaDoModulo: "/admin/rotas",
    modulo: "rotas",
    ajuda: "Aponte para a pasta onde o CSV da pré-rota é depositado todo dia.",
  },
  {
    chave: "rv",
    rotulo: "Remuneração Variável",
    alimenta: "O resultado do mês de cada pessoa, e o resumo de Meus Indicadores",
    tipo: "csv-publicado",
    tabela: "rv_config",
    telaDoModulo: "/admin/rv",
    modulo: "rv",
    ajuda:
      "Uma planilha por área, publicada no Google Sheets como CSV. É a MESMA fonte que alimenta o resumo do mês em Meus Indicadores -- de propósito, para o app e o contracheque nunca discordarem.",
  },
  {
    chave: "produtos",
    rotulo: "Produtos do Armazém",
    alimenta: "Catálogo de produtos, embalagens e fatores de conversão do Reepack e do Despejo",
    tipo: "upload",
    telaDoModulo: "/admin/produtividade-armazem",
    modulo: "produtividade-armazem",
    ajuda:
      "Enviada à mão, pela tela do módulo. Não há link a guardar: você exporta a planilha padrão e sobe o arquivo quando houver cadastro novo.",
  },
  {
    chave: "quiz",
    rotulo: "Questões do Desafio",
    alimenta: "O banco de perguntas do Desafio do Mês",
    tipo: "upload",
    telaDoModulo: "/admin/quiz",
    modulo: "quiz",
    ajuda: "Enviada à mão, pela tela do módulo.",
  },
];

export const ROTULO_TIPO: Record<TipoDaFonte, string> = {
  "pasta-drive": "Pasta do Drive",
  "csv-publicado": "CSV publicado",
  upload: "Envio de arquivo",
};

/** As que guardam link e podem ser editadas aqui. */
export function fontesComLink(): Fonte[] {
  return FONTES.filter((f) => f.tipo !== "upload");
}

/** As que só existem pela tela do módulo. */
export function fontesPorUpload(): Fonte[] {
  return FONTES.filter((f) => f.tipo === "upload");
}

export function fonteDe(chave: string): Fonte | undefined {
  return FONTES.find((f) => f.chave === chave);
}

/**
 * "há 2 dias", "há 3 h", "agora".
 *
 * A última sincronização é o número que responde "isto ainda está vivo?".
 * Data absoluta obriga a fazer a conta de cabeça; o tempo decorrido não.
 */
export function tempoDesde(iso: string | null | undefined, agora = new Date()): string {
  if (!iso) return "nunca";
  const minutos = Math.max((agora.getTime() - new Date(iso).getTime()) / 60_000, 0);
  if (minutos < 2) return "agora";
  if (minutos < 60) return `há ${Math.round(minutos)} min`;
  const horas = minutos / 60;
  if (horas < 24) return `há ${Math.floor(horas)} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

/**
 * A fonte está velha demais?
 *
 * Três dias é o corte porque a operação importa em dia útil: sexta para
 * segunda já dá três, e isso é normal. Acima disso, alguém esqueceu.
 */
export const DIAS_ATE_ENVELHECER = 3;

export function estaVelha(iso: string | null | undefined, agora = new Date()): boolean {
  if (!iso) return true;
  const dias = (agora.getTime() - new Date(iso).getTime()) / 86_400_000;
  return dias > DIAS_ATE_ENVELHECER;
}
