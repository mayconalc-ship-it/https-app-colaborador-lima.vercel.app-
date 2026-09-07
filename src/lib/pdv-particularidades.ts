/**
 * PARTICULARIDADES DO PDV -- o que este cliente tem de diferente.
 *
 * Pedido do dono (06/09/2026): um lembrete por cliente, em categorias
 * cadastráveis, que avise quem está na rota e cobre quem acompanha.
 *
 * Só a regra aqui: sem banco, sem tela.
 *
 * O PRINCÍPIO QUE MANDA NESTE ARQUIVO: aviso que aparece demais deixa de
 * ser lido. É por isso que quase toda função aqui serve para NÃO mostrar
 * alguma coisa -- o prazo que venceu, o horário que não é hoje, a
 * categoria que não é da rota. Um app que avisa tudo é igual a um app que
 * não avisa nada, com o custo a mais de fazer a pessoa procurar.
 */

export const SEVERIDADES = ["info", "atencao", "critico"] as const;
export type Severidade = (typeof SEVERIDADES)[number];

export const ROTULO_SEVERIDADE: Record<Severidade, { titulo: string; icone: string }> = {
  info: { titulo: "Informação", icone: "ℹ️" },
  atencao: { titulo: "Atenção", icone: "⚠️" },
  critico: { titulo: "Crítico", icone: "🛑" },
};

/** Ordena do mais grave para o menos -- é a ordem em que se lê. */
export const PESO_SEVERIDADE: Record<Severidade, number> = {
  critico: 3,
  atencao: 2,
  info: 1,
};

export const STATUS_PARTICULARIDADE = ["ativa", "resolvida", "expirada"] as const;
export type StatusParticularidade = (typeof STATUS_PARTICULARIDADE)[number];

export type Categoria = {
  id: string;
  nome: string;
  emoji: string | null;
  severidade: Severidade;
  exigePrazo: boolean;
  exigeHorario: boolean;
  alertaNaRota: boolean;
  /** A mensagem pronta para o monitoramento encaminhar ao PDV. */
  mensagemModelo?: string | null;
};

/** Os campos que a mensagem pronta aceita entre chaves. */
export const CAMPOS_DA_MENSAGEM = [
  "cliente",
  "codigo",
  "cidade",
  "janela",
  "aviso",
  "data",
  "mapa",
] as const;
export type CampoDaMensagem = (typeof CAMPOS_DA_MENSAGEM)[number];

/**
 * A MENSAGEM PRONTA, com os campos preenchidos.
 *
 * Pedido do dono (07/09/2026): mensagens pré-prontas para o monitoramento
 * encaminhar ao PDV -- avisar o detrator de que o pedido está indo, avisar
 * o cliente de janela que a entrega respeita o horário.
 *
 * CAMPO SEM VALOR SOME COM O ESPAÇO QUE SOBRARIA, e não vira "()" ou dois
 * espaços no meio da frase. A mensagem é lida pelo dono do bar, não pelo
 * app: uma frase com buraco denuncia texto automático e é justamente o que
 * faz o cliente parar de responder.
 *
 * Também some a pontuação órfã -- "no horário ()." vira "no horário." --
 * porque o modelo natural é escrever o campo entre parênteses.
 */
export function montarMensagem(
  modelo: string | null | undefined,
  dados: Partial<Record<CampoDaMensagem, string | null | undefined>>,
): string {
  if (!modelo?.trim()) return "";
  const texto = modelo.replace(/\{(\w+)\}/g, (_, campo: string) => {
    const valor = dados[campo as CampoDaMensagem];
    return (valor ?? "").trim();
  });
  return texto
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/**
 * UMA JANELA DE RECEBIMENTO.
 *
 * Os dois lados são opcionais, e cada combinação quer dizer uma coisa
 * diferente na porta do cliente: com os dois, é uma faixa; só com `ate`, é
 * "até as 11h"; só com `de`, "a partir das 14h". Janela sem nenhum dos
 * dois não existe -- é o campo que a pessoa abriu e não preencheu.
 */
export type Janela = { de?: string | null; ate?: string | null };

/** O limite é da TELA, não do banco: é o que cabe na cabeça de quem lê na
 *  porta do cliente. Pedido do dono (06/09/2026). */
export const MAXIMO_DE_JANELAS = 4;

export type Particularidade = {
  id: string;
  categoriaId: string;
  codPdv: string;
  nomePdv: string | null;
  cidade: string | null;
  bairro: string | null;
  aviso: string;
  detalhe: string | null;
  /** Até 4 faixas de horário no dia — o PDV que fecha para o almoço. */
  janelas: Janela[];
  diasSemana: number[] | null;
  de: string | null;
  ate: string | null;
  status: StatusParticularidade;
};

/**
 * O CÓDIGO DO PDV, NORMALIZADO.
 *
 * A planilha traz "000507" e a pessoa digita "507". Sem isto o mesmo
 * cliente vira dois cadastros, cada um com metade da história -- e o
 * segundo nunca é encontrado por quem procura. Mesmo raciocínio de
 * `normalizarMapa` em lib/rotas.ts, e do mesmo jeito: se não sobrar
 * dígito nenhum, devolve o que veio (código com letra existe em algumas
 * bases).
 */
export function normalizarCodPdv(valor: string | null | undefined): string {
  const cru = (valor ?? "").trim();
  if (!cru) return "";
  const digitos = cru.replace(/\D/g, "");
  if (!digitos) return cru.toUpperCase();
  return digitos.replace(/^0+/, "") || "0";
}

/**
 * ISTO É UM CÓDIGO DE PDV?
 *
 * Correção do dono (06/09/2026): "ao adicionar nova particularidade, se eu
 * digitar um nome errado, como você linkaria esse PDV ao relatório da
 * pré-rota? Não seria melhor restringir somente no código, e a descrição
 * em campo separado?".
 *
 * Ele está certo, e o efeito era pior do que parece. O campo era um só --
 * código OU nome --, e o que a pessoa digitasse virava o código. Digitar
 * "BAR LINHA DIRETA" sem escolher da lista gravava "BARLINHADIRETA" como
 * código: a particularidade fica bonita no cadastro, aparece na lista, e
 * NUNCA casa com o cliente. O alerta por região até dispara (ele casa por
 * cidade e bairro), mas com a identidade errada -- e o alerta por cliente,
 * que é o destino do módulo, nunca dispararia. Falha silenciosa, a pior
 * espécie.
 *
 * MEDIDO ANTES DE RESTRINGIR: os 1.216 PDVs distintos do Rating são
 * 100% numéricos, de 1 a 5 dígitos, nenhum com zero à esquerda. Exigir
 * dígitos não deixa nenhum cliente real de fora.
 *
 * OLHA O QUE FOI DIGITADO, NÃO O NORMALIZADO -- e essa distinção custou um
 * teste vermelho para aparecer. `normalizarCodPdv("BAR 24 HORAS")` devolve
 * "24", que é um código perfeitamente válido: a validação passaria e a
 * particularidade iria parar no cliente 24, que não tem nada com isso.
 * Errar de cliente é pior do que recusar o cadastro -- o primeiro é
 * silencioso, o segundo a pessoa vê e corrige.
 */
export function ehCodigoValido(valor: string | null | undefined): boolean {
  return /^\d{1,10}$/.test((valor ?? "").trim());
}

/** Cidade e bairro comparáveis: sem acento, sem caixa, sem espaço dobrado. */
export function chaveDeRegiao(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * ONDE O RELATÓRIO CORTA A CIDADE.
 *
 * O LOG.CO grava a cidade em no máximo 20 caracteres. Não é estimativa:
 * na base de hoje, as únicas cidades com exatamente 20 são as duas que
 * foram cortadas -- "Santa maria da vitor" (de SANTA MARIA DA VITORIA) e
 * "Tabocas do brejo vel" (de TABOCAS DO BREJO VELHO). Nenhuma cidade real
 * atendida tem 20 caracteres exatos.
 */
const CORTE_DO_RELATORIO = 20;

/**
 * DUAS REGIÕES SÃO A MESMA?
 *
 * Igual, ou uma é o COMEÇO da outra -- e esse segundo caso não é
 * frouxidão, é a correção de um defeito real da base.
 *
 * O relatório do LOG.CO corta a cidade em 20 caracteres. Na base de hoje
 * isso atinge duas das maiores: "Santa maria da vitor" (por SANTA MARIA
 * DA VITORIA) e "Tabocas do brejo vel" (por TABOCAS DO BREJO VELHO). O
 * roteirizador, que alimenta a pré-rota, escreve o nome inteiro. Comparar
 * texto exato faz o cliente dessas duas cidades NUNCA aparecer no alerta
 * -- e sem erro nenhum na tela, que é o pior jeito de falhar. Foi assim
 * que o dono cadastrou um PDV de Santa Maria da Vitória e não viu o aviso
 * (07/09/2026).
 *
 * Poderia consertar a importação do Rating, mas isso só valeria para o que
 * entrasse dali em diante: as 157 avaliações já gravadas continuariam
 * cortadas.
 *
 * A TRAVA É O TAMANHO EXATO, e ela existe por causa de um caso real desta
 * operação: "Sao felix" e "Sao felix do coribe" são cidades DIFERENTES, e
 * as duas aparecem nas rotas. Um prefixo qualquer faria o cliente de uma
 * alertar na rota da outra -- exatamente o falso alarme que este módulo
 * não pode ter. Por isso só vale como começo o texto que tem os 20
 * caracteres do corte: é a assinatura do defeito, não uma semelhança.
 */
export function mesmaRegiao(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = chaveDeRegiao(a);
  const y = chaveDeRegiao(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const menor = x.length <= y.length ? x : y;
  const maior = x.length <= y.length ? y : x;
  return menor.length === CORTE_DO_RELATORIO && maior.startsWith(menor);
}

/**
 * QUANTOS DIAS FALTAM até a data de liberação.
 *
 * Negativo quer dizer que o prazo passou -- e isso não é detalhe: um PDV
 * que deveria ter sido desbloqueado ontem é o caso que o painel existe
 * para pegar. Zero é hoje.
 */
export function diasAte(ate: string | null | undefined, hoje: string): number | null {
  if (!ate) return null;
  const fim = new Date(`${ate}T00:00:00`).getTime();
  const agora = new Date(`${hoje}T00:00:00`).getTime();
  if (!Number.isFinite(fim) || !Number.isFinite(agora)) return null;
  return Math.round((fim - agora) / 86_400_000);
}

/**
 * A PARTICULARIDADE VALE HOJE?
 *
 * Uma com prazo só vale dentro dele. Fora, ela não é apagada -- vira
 * histórico, que é o que responde "esse cliente já ficou bloqueado antes?"
 * na próxima vez.
 */
export function valeHoje(p: Particularidade, hoje: string): boolean {
  if (p.status !== "ativa") return false;
  if (p.de && hoje < p.de) return false;
  if (p.ate && hoje > p.ate) return false;
  return true;
}

/**
 * VENCEU E NINGUÉM MEXEU?
 *
 * É o que o painel cobra. Diferente de `valeHoje`: aqui a pergunta não é
 * "aviso o motorista?", é "alguém precisa fechar isto?". Um bloqueio que
 * venceu e continua aberto é exatamente o que se perde de vista.
 */
export function venceuEmAberto(p: Particularidade, hoje: string): boolean {
  return p.status === "ativa" && Boolean(p.ate) && hoje > p.ate!;
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** 1=domingo … 7=sábado, como está gravado. */
export function diaDaSemanaDe(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay() + 1;
}

/** A particularidade se aplica ao dia da semana de hoje? */
export function valeNoDia(p: Particularidade, hoje: string): boolean {
  if (!p.diasSemana || p.diasSemana.length === 0) return true;
  return p.diasSemana.includes(diaDaSemanaDe(hoje));
}

/** "seg, qua e sex" -- para a tela não imprimir "[2,4,6]". */
export function rotuloDosDias(dias: number[] | null | undefined): string | null {
  if (!dias || dias.length === 0 || dias.length === 7) return null;
  const nomes = [...dias]
    .sort((a, b) => a - b)
    .map((d) => DIAS[d - 1]?.slice(0, 3))
    .filter(Boolean);
  if (nomes.length === 0) return null;
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

const hm = (h: string) => h.slice(0, 5);

/** Uma janela por extenso. Null quando ela está vazia. */
export function rotuloDaJanela(j: Janela): string | null {
  if (j.de && j.ate) return `das ${hm(j.de)} às ${hm(j.ate)}`;
  if (j.ate) return `até as ${hm(j.ate)}`;
  if (j.de) return `a partir das ${hm(j.de)}`;
  return null;
}

/**
 * LIMPA E ORDENA as janelas: fora as vazias, fora as repetidas, e em
 * ordem de horário.
 *
 * A ORDEM NÃO É ENFEITE. "das 15h às 16h e das 08h às 11h" faz quem lê na
 * porta do cliente reler para achar a janela da manhã -- e ela é a que
 * importa, porque é a primeira que passa.
 */
export function normalizarJanelas(
  janelas: Janela[] | null | undefined,
  maximo = MAXIMO_DE_JANELAS,
): Janela[] {
  const limpas: Janela[] = [];
  for (const j of janelas ?? []) {
    const de = j.de?.trim() ? hm(j.de.trim()) : null;
    const ate = j.ate?.trim() ? hm(j.ate.trim()) : null;
    if (!de && !ate) continue;
    // A mesma janela duas vezes é erro de digitação, não intenção.
    if (limpas.some((x) => (x.de ?? "") === (de ?? "") && (x.ate ?? "") === (ate ?? ""))) continue;
    limpas.push({ de, ate });
  }
  return limpas
    .sort((a, b) => (a.de ?? a.ate ?? "").localeCompare(b.de ?? b.ate ?? ""))
    .slice(0, maximo);
}

/**
 * O horário inteiro, numa frase: "das 08:00 às 11:00 e das 15:00 às 16:00".
 *
 * Uma frase só, e não uma lista de linhas: o motorista lê isto dentro de
 * um cartão, entre uma entrega e outra.
 */
export function rotuloDoHorario(janelas: Janela[] | null | undefined): string | null {
  const partes = normalizarJanelas(janelas)
    .map(rotuloDaJanela)
    .filter((t): t is string => Boolean(t));
  if (partes.length === 0) return null;
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/** A janela fecha antes de abrir? É o erro que passa despercebido no
 *  cadastro e vira um horário impossível na rota. */
export function janelaInvertida(j: Janela): boolean {
  return Boolean(j.de && j.ate && hm(j.ate) <= hm(j.de));
}

export type AvisoDeRota = {
  particularidade: Particularidade;
  categoria: Categoria;
  /** Dias até o fim do prazo, quando há prazo. */
  dias: number | null;
};

/**
 * OS AVISOS DE UM PDV, para quem está na rota.
 *
 * Três filtros, e cada um existe por um motivo diferente:
 *   - a categoria tem de ser DE ROTA. "Observação da liderança" é para
 *     quem acompanha; mandá-la ao motorista é ruído no celular de quem
 *     está na porta do cliente;
 *   - a particularidade tem de valer HOJE (prazo e dia da semana). Avisar
 *     de um bloqueio que terminou semana passada ensina a ignorar o
 *     próximo;
 *   - o mais grave vem primeiro. Numa lista de quatro, a que importa não
 *     pode ser a última.
 */
export function avisosDoPdv(
  particularidades: Particularidade[],
  categorias: Map<string, Categoria>,
  hoje: string,
  { apenasRota = true }: { apenasRota?: boolean } = {},
): AvisoDeRota[] {
  return particularidades
    .flatMap((p) => {
      const categoria = categorias.get(p.categoriaId);
      if (!categoria) return [];
      if (apenasRota && !categoria.alertaNaRota) return [];
      if (!valeHoje(p, hoje) || !valeNoDia(p, hoje)) return [];
      return [{ particularidade: p, categoria, dias: diasAte(p.ate, hoje) }];
    })
    .sort(
      (a, b) =>
        PESO_SEVERIDADE[b.categoria.severidade] - PESO_SEVERIDADE[a.categoria.severidade],
    );
}

/**
 * OS AVISOS DE UMA REGIÃO -- o que a pré-rota consegue responder HOJE.
 *
 * MEDIDO, e o número decidiu o desenho: prever os clientes do dia pelo
 * histórico do número do mapa daria 88,2% de falso alarme (dos PDVs que
 * um mapa já atendeu, quase 9 em cada 10 não estão na carga de hoje). O
 * mapa repete -- é uma rota fixa --, mas os pedidos de cada dia mudam.
 *
 * Então o casamento é por CIDADE e BAIRRO, que é o que a planilha do
 * roteirizador traz. É menos preciso de propósito, e a tela DIZ isso: o
 * aviso é "há clientes com particularidade nos bairros deste mapa", não
 * "você vai entregar neste cliente". Prometer precisão que não existe
 * seria pior do que a imprecisão.
 *
 * Quando o roteirizador exportar os clientes por mapa (pa_pdv_do_mapa),
 * a mesma tela passa a listar por cliente, e esta função vira o caminho
 * de reserva para os mapas sem lista.
 */
export function avisosDaRegiao(
  particularidades: Particularidade[],
  categorias: Map<string, Categoria>,
  regioes: { cidade: string; bairros?: { nome: string }[] }[],
  hoje: string,
): AvisoDeRota[] {
  const cidades = regioes.map((r) => r.cidade).filter(Boolean);
  const bairros = regioes.flatMap((r) => (r.bairros ?? []).map((b) => b.nome)).filter(Boolean);

  return avisosDoPdv(
    particularidades.filter((p) => {
      // Sem cidade cadastrada não dá para dizer que é desta rota, e
      // mostrar mesmo assim encheria todo mapa com o cadastro inteiro.
      // (A tela de cadastro avisa quem ficar sem cidade -- do contrário
      // a particularidade some sem ninguém saber por quê.)
      if (!chaveDeRegiao(p.cidade)) return false;
      if (!cidades.some((c) => mesmaRegiao(c, p.cidade))) return false;
      // Com bairro dos dois lados, exige o bairro; sem, a cidade basta.
      if (chaveDeRegiao(p.bairro) && bairros.length > 0) {
        return bairros.some((b) => mesmaRegiao(b, p.bairro));
      }
      return true;
    }),
    categorias,
    hoje,
  );
}

export type LinhaDaPendencia = {
  particularidade: Particularidade;
  categoria: Categoria;
  dias: number;
  vencida: boolean;
};

/**
 * O PAINEL DE PENDÊNCIAS -- o que tem prazo e está correndo.
 *
 * Vencidas primeiro, depois as que vencem antes. É a ordem da cobrança, e
 * não a da data de cadastro: um bloqueio que passou do prazo custa
 * entrega todo dia em que ninguém olha.
 */
export function pendenciasComPrazo(
  particularidades: Particularidade[],
  categorias: Map<string, Categoria>,
  hoje: string,
): LinhaDaPendencia[] {
  return particularidades
    .flatMap((p) => {
      if (p.status !== "ativa" || !p.ate) return [];
      const categoria = categorias.get(p.categoriaId);
      if (!categoria) return [];
      const dias = diasAte(p.ate, hoje);
      if (dias === null) return [];
      return [{ particularidade: p, categoria, dias, vencida: dias < 0 }];
    })
    .sort((a, b) => a.dias - b.dias);
}

/** "vence hoje" · "faltam 3 dias" · "venceu há 2 dias" */
export function rotuloDoPrazo(dias: number): string {
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "falta 1 dia";
  if (dias > 1) return `faltam ${dias} dias`;
  if (dias === -1) return "venceu ontem";
  return `venceu há ${Math.abs(dias)} dias`;
}

/* ------------------------------------------------------------------ */

/**
 * QUEM MERECE UMA PARTICULARIDADE DE "CLIENTE DETRATOR", pelo Rating.
 *
 * A sugestão é automática; a particularidade, não. O app propõe e uma
 * pessoa confirma -- porque a nota detratora nem sempre é do cliente
 * difícil: pode ter sido a entrega atrasada de um dia ruim, e carimbar o
 * cliente por isso é injusto com ele e inútil para o motorista.
 *
 * MÍNIMO DE DUAS. Medido na base: 1,0% das 14.623 avaliações são
 * detratoras e apenas 17 PDVs (de 1.216) têm duas ou mais. Uma avaliação
 * ruim é um dia ruim; duas é um padrão -- e com duas a lista cabe numa
 * tela, que é o que faz alguém lê-la.
 */
export const MINIMO_DETRATORAS = 2;

export type AvaliacaoDoPdv = {
  codPdv: string;
  nomePdv: string | null;
  cidade: string | null;
  nota: number;
  classificacao: string;
  motivo: string | null;
};

export type SugestaoDetrator = {
  codPdv: string;
  nomePdv: string | null;
  cidade: string | null;
  avaliacoes: number;
  detratoras: number;
  media: number;
  /** O motivo que mais se repete -- é o que o motorista precisa saber. */
  motivoMaisComum: string | null;
  /** A frase pronta, para a pessoa só conferir e salvar. */
  aviso: string;
};

export function sugestoesDeDetrator(
  avaliacoes: AvaliacaoDoPdv[],
  minimo = MINIMO_DETRATORAS,
): SugestaoDetrator[] {
  const porPdv = new Map<
    string,
    { nome: string | null; cidade: string | null; notas: number[]; det: number; motivos: Map<string, number> }
  >();

  for (const a of avaliacoes) {
    const cod = normalizarCodPdv(a.codPdv);
    if (!cod) continue;
    const atual =
      porPdv.get(cod) ??
      { nome: a.nomePdv, cidade: a.cidade, notas: [], det: 0, motivos: new Map<string, number>() };
    atual.notas.push(a.nota);
    if (a.classificacao === "detrator") {
      atual.det += 1;
      const motivo = a.motivo?.trim();
      if (motivo) atual.motivos.set(motivo, (atual.motivos.get(motivo) ?? 0) + 1);
    }
    porPdv.set(cod, atual);
  }

  return [...porPdv.entries()]
    .filter(([, v]) => v.det >= minimo)
    .map(([codPdv, v]) => {
      const media = v.notas.reduce((t, n) => t + n, 0) / v.notas.length;
      const motivoMaisComum =
        [...v.motivos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        codPdv,
        nomePdv: v.nome,
        cidade: v.cidade,
        avaliacoes: v.notas.length,
        detratoras: v.det,
        media: Math.round(media * 10) / 10,
        motivoMaisComum,
        aviso: motivoMaisComum
          ? `Já avaliou ${v.det}x como detrator. O que mais se repete: ${motivoMaisComum.toLowerCase()}.`
          : `Já avaliou ${v.det}x como detrator.`,
      };
    })
    .sort((a, b) => b.detratoras - a.detratoras);
}
