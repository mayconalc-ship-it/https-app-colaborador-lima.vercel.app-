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
  /** Um link que o app só abre -- não lê nem importa nada dele. */
  | "link-canal";

/**
 * O QUE COLAR NO CAMPO (11/09/2026, pedido do dono: "seria bom deixar uma
 * observação se aquele caminho ou link do Drive é para o arquivo ou pasta").
 *
 * O tipo da fonte ("Pasta do Drive", "CSV publicado") diz como o app LÊ,
 * não o que a pessoa COLA -- a RV é "CSV publicado" e o que se cola nela é
 * o link do arquivo da planilha. Quem configura precisa da segunda
 * informação, dita antes de colar, e não descoberta pelo erro.
 */
export type OQueColar = "pasta" | "arquivo" | "arquivo-ou-pasta" | "site";

export const COMO_COLAR: Record<
  OQueColar,
  { emoji: string; curto: string; titulo: string; comoCopiar: string; comecaCom: string }
> = {
  pasta: {
    emoji: "📁",
    curto: "link da pasta",
    titulo: "Cole o link da PASTA do Drive — não o de um arquivo",
    comoCopiar:
      "Abra a pasta no Drive e copie o endereço da barra do navegador. O app procura os arquivos lá dentro sozinho.",
    comecaCom: "https://drive.google.com/drive/folders/…",
  },
  arquivo: {
    emoji: "📄",
    curto: "link do arquivo",
    titulo: "Cole o link do ARQUIVO (a planilha) — não o da pasta",
    comoCopiar:
      "No Drive, clique com o botão direito no arquivo → Compartilhar → Copiar link, com o acesso em “Qualquer pessoa com o link”.",
    comecaCom: "https://docs.google.com/spreadsheets/d/… ou https://drive.google.com/file/d/…",
  },
  "arquivo-ou-pasta": {
    emoji: "📄",
    curto: "link do arquivo (ou da pasta)",
    titulo: "Cole o link do ARQUIVO — de preferência. O da pasta também funciona",
    comoCopiar:
      "No Drive, clique com o botão direito no arquivo → Compartilhar → Copiar link. Pela pasta, o app precisa ler a listagem do Drive, que é o que mais falha.",
    comecaCom: "https://drive.google.com/file/d/… ou https://docs.google.com/spreadsheets/d/…",
  },
  site: {
    emoji: "🔗",
    curto: "endereço do site",
    titulo: "Cole o endereço do formulário ou do site — não é link do Drive",
    comoCopiar: "Abra o formulário ou o site no navegador e copie o endereço inteiro da barra.",
    comecaCom: "https://…",
  },
};

/**
 * Que tipo de link a pessoa colou -- para o erro dizer "isso é o link de
 * um ARQUIVO, aqui vai o da PASTA" em vez de "não reconheci o link".
 */
export function tipoDoLink(bruto: string): "pasta" | "arquivo" | "site" | "outro" {
  const link = (bruto ?? "").trim();
  if (!link) return "outro";
  if (/\/drive\/(u\/\d+\/)?folders\//.test(link)) return "pasta";
  if (
    /\/file\/d\//.test(link) ||
    /\/spreadsheets\/d\//.test(link) ||
    /drive\.google\.com\/.*[?&]id=/.test(link) ||
    /output=csv|format=csv/.test(link)
  ) {
    return "arquivo";
  }
  if (/^https?:\/\//i.test(link)) return "site";
  return "outro";
}

export type Fonte = {
  chave: string;
  rotulo: string;
  /** O que a pessoa cola no campo -- ver COMO_COLAR. */
  colar: OQueColar;
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
  /**
   * A ação do módulo que autoriza configurar esta fonte. Quase todas usam
   * "criar", que é a permissão de importar. A base de clientes usa
   * "editar": nela, "criar" é cadastrar a particularidade de um cliente --
   * coisa que quem monitora rota faz, e não tem por que dar a essa pessoa o
   * poder de trocar a base inteira.
   */
  acaoParaEditar?: "criar" | "editar";
  /**
   * As opções que o import aceita, para o botão viver longe da tela do
   * módulo sem perder o que ele sabia fazer.
   *
   * Era o pedaço que faltava para juntar tudo num lugar só (08/09/2026): o
   * botão de "atualizar" já estava aqui, mas o "importar todos os meses"
   * do Rating e da Devolução e o "avisar o time" das Rotas existiam apenas
   * na tela de cada módulo. Mover o botão sem elas seria trocar um caminho
   * completo por um pela metade.
   */
  opcoes?: { nome: string; rotulo: string; ajuda?: string; marcado?: boolean }[];
  /**
   * O link é salvo pela PRÓPRIA importação, num gesto só.
   *
   * O caminho normal desta tela tem dois botões (salvar o link, depois
   * atualizar) e uma tabela com `pasta_id`. A base de clientes não tem
   * `pasta_id` -- ela aceita link de arquivo e de planilha do Google, que
   * não são pasta nenhuma -- e separar salvar de importar deixaria metade
   * das vezes um link certo com a tela dizendo "nunca importada".
   */
  salvaNoImport?: boolean;
  /**
   * O que o botão de atualizar faz, em uma frase.
   *
   * Cada import tem um custo diferente -- o da devolução lê ~7 mil linhas
   * por mês e leva minutos; o do refugo é quase instantâneo. Dizer antes
   * evita a pessoa achar que travou e clicar de novo.
   */
  aoAtualizar?: string;
  /**
   * Link fixo, sem importação: não "envelhece". Os canais do rodapé valem
   * até alguém trocá-los -- contá-los em "sem atualizar há 3 dias" poria
   * um alarme permanente numa gaveta que está certa.
   */
  estatica?: boolean;
};

export const FONTES: Fonte[] = [
  {
    chave: "rating",
    rotulo: "Rating de Entrega",
    alimenta: "Nota do cliente, cadastro de motoristas e ajudantes, e o mapa que liga um ao outro",
    tipo: "pasta-drive",
    tabela: "rating_config",
    colar: "pasta",
    telaDoModulo: "/admin/rating",
    modulo: "rating",
    aoAtualizar: "Lê os quatro relatórios da pasta. Leva cerca de um minuto.",
    opcoes: [
      {
        nome: "tudo",
        rotulo: "Importar todos os meses",
        ajuda: "Sem marcar, traz só o mês corrente — é o que muda no dia a dia. Marque na primeira carga.",
      },
    ],
    ajuda:
      "Aponte para a pasta MÃE no Drive. O app varre as subpastas sozinho e reconhece os relatórios 01.20.01.47, 01.20.01.48, 03.11.29 e o LOG.CO pelo nome do arquivo.",
  },
  {
    chave: "refugo",
    rotulo: "Refugo de Vasilhame",
    alimenta: "Aferição de vasilhame por mapa, com o defeito encontrado em cada garrafa",
    tipo: "pasta-drive",
    tabela: "refugo_config",
    colar: "pasta",
    telaDoModulo: "/admin/refugo",
    modulo: "refugo",
    aoAtualizar: "Lê a subpasta Refugo. Rápido, mas depende do Rating já ter sido importado.",
    ajuda:
      "Deixar em branco faz o Refugo usar a MESMA pasta do Rating -- é o comportamento normal quando os relatórios chegam juntos.",
  },
  {
    chave: "devolucao",
    rotulo: "Devolução",
    alimenta: "Notas devolvidas por dia e por PDV, e a tabela de motivos",
    tipo: "pasta-drive",
    tabela: "devolucao_config",
    colar: "pasta",
    telaDoModulo: "/admin/devolucao",
    modulo: "devolucao",
    aoAtualizar: "Traz só o mês corrente. Cada arquivo tem ~7 mil linhas — pode levar alguns minutos.",
    opcoes: [
      {
        nome: "tudo",
        rotulo: "Importar todos os meses",
        ajuda: "Cada arquivo mensal tem ~7 mil linhas e 9 MB. Sem marcar, traz só o mês corrente.",
      },
    ],
    ajuda:
      "Precisa do 03.02.37 (as notas) e do 01.20.01.06 (a tabela de motivos). Sem o segundo, os motivos aparecem como código.",
  },
  {
    chave: "rotas",
    rotulo: "Minha Rota (pré-rota)",
    alimenta: "A pré-rota que o motorista consulta antes de sair",
    tipo: "pasta-drive",
    tabela: "rotas_config",
    colar: "pasta",
    telaDoModulo: "/admin/rotas",
    modulo: "rotas",
    aoAtualizar: "Lê o CSV mais recente da pasta. Reimportar não duplica nada.",
    opcoes: [
      {
        nome: "avisar",
        rotulo: "Avisar o time que a pré-rota está disponível",
        marcado: true,
      },
    ],
    ajuda: "Aponte para a pasta onde o CSV da pré-rota é depositado todo dia.",
  },
  {
    chave: "rv",
    rotulo: "Remuneração Variável",
    alimenta: "O resultado do mês de cada pessoa, e o resumo de Meus Indicadores",
    tipo: "csv-publicado",
    tabela: "rv_config",
    // O tipo diz "CSV publicado", mas o que se cola é o link do ARQUIVO
    // da planilha -- que é justamente o motivo de `colar` existir.
    colar: "arquivo",
    telaDoModulo: "/admin/rv",
    modulo: "rv",
    // O módulo RV não tem "criar": a chave que aponta a planilha é
    // "editar". Sem isto, o campo do link nunca apareceria para ninguém.
    acaoParaEditar: "editar",
    ajuda:
      "Uma planilha por área, publicada no Google Sheets como CSV. É a MESMA fonte que alimenta o resumo do mês em Meus Indicadores -- de propósito, para o app e o contracheque nunca discordarem.",
  },
  {
    chave: "clientes",
    rotulo: "Base de Clientes",
    alimenta: "O telefone do PDV (que abre a conversa certa no WhatsApp) e a busca de clientes no cadastro de particularidades",
    tipo: "pasta-drive",
    tabela: "pa_pdv_config",
    colar: "arquivo-ou-pasta",
    telaDoModulo: "/admin/pdv-particularidades",
    modulo: "pdv-particularidades",
    acaoParaEditar: "editar",
    salvaNoImport: true,
    aoAtualizar: "Lê a planilha inteira e guarda seis colunas. Uma base de milhares de clientes leva alguns minutos.",
    ajuda:
      "Prefira o link do PRÓPRIO ARQUIVO (abra a planilha no Drive → Compartilhar → Copiar link); pasta também funciona, mas depende de o app ler a listagem do Drive, que é a parte que mais falha. Vale para .csv, .xlsx e planilha do Google. As colunas são achadas pelo nome (Código Cliente, Razão Social, Celular, Município...), então mudar o layout da exportação não quebra o import. Acima de uns 15 MB, exporte em CSV: o XLSX descompacta para várias vezes o próprio tamanho no servidor.",
  },
  {
    // 11/09/2026, implantação de Barreiras: os links moravam fixos no
    // código e valiam para todas as revendas (ver RodapeCanais).
    chave: "canais",
    rotulo: "Canais do Rodapé (EPI e Ouvidoria)",
    alimenta:
      "Os links da Solicitação de EPI e do Canal de Ouvidoria no rodapé da tela inicial -- e o QR code da ouvidoria, gerado a partir do link",
    tipo: "link-canal",
    tabela: "revenda_canais",
    colar: "site",
    telaDoModulo: "/",
    modulo: "fontes-dados",
    acaoParaEditar: "editar",
    estatica: true,
    ajuda:
      "Cada revenda tem os próprios canais. Canal sem link NÃO aparece no app desta revenda — melhor nenhum botão do que um que leve à ouvidoria de outra unidade. Cole o endereço completo, começando com https://.",
  },
];

/**
 * O link de um canal, se for um endereço de site de verdade.
 *
 * Só http e https: um `javascript:` salvo aqui viraria um botão que roda
 * código no celular de quem toca -- e este botão é o da ouvidoria, que
 * todo mundo vê. Validado ao salvar E ao desenhar.
 */
export function linkDeCanalValido(bruto: string): string | null {
  const texto = (bruto ?? "").trim();
  if (!texto || texto.length > 2000 || /\s/.test(texto)) return null;
  try {
    const url = new URL(texto);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/*
  PRODUTOS DO ARMAZÉM E QUESTÕES DO DESAFIO SAÍRAM DAQUI (08/09/2026,
  pedido do dono: "Desafio do Mês e produtos pode retirar de lá").

  Elas eram fontes do tipo "upload": entravam na lista só para a resposta
  "de onde vêm os dados deste app?" ficar completa. O argumento parecia
  bom e não era -- esta tela é onde se APONTA e se ATUALIZA, e nenhuma das
  duas tem link para apontar ou botão para apertar. Uma linha que só diz
  "vá para outra tela" ocupa o lugar de uma fonte de verdade e ensina que
  algumas gavetas não fazem nada.

  O arquivo delas vem do computador da pessoa e sobe na tela do módulo,
  junto do catálogo que ele altera -- que é onde continua.

  Com as duas fora, todas as fontes têm link, e `fontesComLink`/
  `fontesPorUpload` deixaram de separar coisa nenhuma: quem quer a lista
  usa FONTES.
*/

export const ROTULO_TIPO: Record<TipoDaFonte, string> = {
  "pasta-drive": "Pasta do Drive",
  "csv-publicado": "CSV publicado",
  "link-canal": "Link fixo",
};

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
