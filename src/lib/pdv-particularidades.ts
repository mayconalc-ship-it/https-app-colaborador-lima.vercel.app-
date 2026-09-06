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
};

export type Particularidade = {
  id: string;
  categoriaId: string;
  codPdv: string;
  nomePdv: string | null;
  cidade: string | null;
  bairro: string | null;
  aviso: string;
  detalhe: string | null;
  horaDe: string | null;
  horaAte: string | null;
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

/** "até as 11:00" · "das 08:00 às 11:00" · null quando não há horário. */
export function rotuloDoHorario(
  horaDe: string | null | undefined,
  horaAte: string | null | undefined,
): string | null {
  const hm = (h: string) => h.slice(0, 5);
  if (horaDe && horaAte) return `das ${hm(horaDe)} às ${hm(horaAte)}`;
  if (horaAte) return `até as ${hm(horaAte)}`;
  if (horaDe) return `a partir das ${hm(horaDe)}`;
  return null;
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
  const cidades = new Set(regioes.map((r) => chaveDeRegiao(r.cidade)).filter(Boolean));
  const bairros = new Set(
    regioes.flatMap((r) => (r.bairros ?? []).map((b) => chaveDeRegiao(b.nome))).filter(Boolean),
  );

  return avisosDoPdv(
    particularidades.filter((p) => {
      const cidade = chaveDeRegiao(p.cidade);
      const bairro = chaveDeRegiao(p.bairro);
      // Sem cidade cadastrada não dá para dizer que é desta rota, e
      // mostrar mesmo assim encheria todo mapa com o cadastro inteiro.
      if (!cidade) return false;
      if (!cidades.has(cidade)) return false;
      // Com bairro dos dois lados, exige o bairro; sem, a cidade basta.
      if (bairro && bairros.size > 0) return bairros.has(bairro);
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
