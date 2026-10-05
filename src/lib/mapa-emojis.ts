/**
 * O MAPA DE EMOJIS (03/10/2026, pedido do dono).
 *
 * Um assunto, um emoji -- e um emoji, um assunto. Antes cada tela
 * escolhia o seu: a Empilhadeira abria com o desenho no cartão e, lá
 * dentro, outro emoji; o ⏳ queria dizer FEFO numa tela e "aguardando"
 * na outra; o 🔄 era ativo de giro, ciclo da pesquisa e abastecimento
 * completo.
 *
 * REGRAS
 *
 *  1. Todo módulo, painel e guia usa o emoji do assunto dele, daqui.
 *     O teste `mapa-emojis.teste.mjs` reprova o que divergir.
 *  2. Nenhum emoji de assunto se repete entre assuntos.
 *  3. Onde NENHUM emoji diz o assunto (não existe emoji de empilhadeira,
 *     de armazém, de botijão...), o assunto tem um DESENHO próprio
 *     (`desenho`, ver components/Icone). O emoji dele continua existindo,
 *     exclusivo, para onde desenho não entra -- aviso no celular, texto
 *     copiado para o WhatsApp. Em TODA tela, esse emoji é trocado pelo
 *     desenho na hora de mostrar (ver `ComMarcas`): título, aba, botão,
 *     guia. É isso que mantém o cartão e o miolo da tela iguais.
 *
 * Os emojis de INTERFACE (✅ ⚠️ ✏️ 🗑️ setas, 🟢🟡🔴...) não são assunto e
 * ficam fora do mapa.
 */

export type DesenhoProprio =
  | "empilhadeira"
  | "abastecimento"
  | "fefo"
  | "fornecedores"
  | "ativo-giro"
  | "armazem"
  | "gas"
  | "mao-de-obra";

export type Assunto = {
  id: string;
  nome: string;
  /** O emoji do assunto -- exclusivo dele. */
  emoji: string;
  /** Desenho próprio, quando nenhum emoji serve. */
  desenho?: DesenhoProprio;
  /** Área do app, só para organizar a tela do mapa. */
  area: "Minha rotina" | "Armazém e recebimento" | "Operação e manutenção" | "Da empresa" | "Gestão" | "Administração";
  /** Os ids de módulo, item de menu, painel e categoria de guia que são este assunto. */
  chaves: string[];
};

export const MAPA_DE_EMOJIS: Assunto[] = [
  // ---- Minha rotina ----
  { id: "escala", nome: "Escala de Trabalho", emoji: "🗓️", area: "Minha rotina", chaves: ["escala"] },
  { id: "rota", nome: "Minha Rota (pré-rota)", emoji: "🚚", area: "Minha rotina", chaves: ["rota", "rotas"] },
  { id: "comprovante", nome: "Comprovante de Pagamento", emoji: "📲", area: "Minha rotina", chaves: ["qr-contingencia"] },
  { id: "rv", nome: "Remuneração Variável", emoji: "💰", area: "Minha rotina", chaves: ["rv"] },
  { id: "meus-indicadores", nome: "Meus Indicadores", emoji: "📈", area: "Minha rotina", chaves: ["meus-indicadores"] },
  { id: "rating", nome: "Rating de Entrega", emoji: "⭐", area: "Minha rotina", chaves: ["rating"] },
  { id: "devolucao", nome: "Devolução", emoji: "↩️", area: "Minha rotina", chaves: ["devolucao"] },
  { id: "refugo", nome: "Refugo de Vasilhame", emoji: "♻️", area: "Minha rotina", chaves: ["refugo", "refugo-indicadores"] },
  { id: "justificativas", nome: "Justificativas", emoji: "🗣️", area: "Minha rotina", chaves: ["justificativas"] },
  { id: "conta", nome: "Minha Conta", emoji: "🔒", area: "Minha rotina", chaves: ["conta"] },

  // ---- Armazém e recebimento ----
  {
    id: "armazem",
    nome: "Produtividade do Armazém",
    emoji: "🏭",
    desenho: "armazem",
    area: "Armazém e recebimento",
    chaves: ["produtividade-armazem", "armazem"],
  },
  { id: "reepack", nome: "Reepack", emoji: "📦", area: "Armazém e recebimento", chaves: ["pa-reepack"] },
  { id: "selecao", nome: "Seleção e Triagem", emoji: "🔍", area: "Armazém e recebimento", chaves: [] },
  { id: "despejo", nome: "Despejo", emoji: "🫗", area: "Armazém e recebimento", chaves: ["pa-despejo"] },
  {
    id: "empilhadeira",
    nome: "Empilhadeira",
    emoji: "🏗️",
    desenho: "empilhadeira",
    area: "Armazém e recebimento",
    chaves: ["pa-empilhadeira", "carretas-descarga", "empilhadeira"],
  },
  {
    id: "gas",
    nome: "Gás da Empilhadeira (botijão P20)",
    emoji: "🛢️",
    desenho: "gas",
    area: "Armazém e recebimento",
    chaves: ["gas"],
  },
  {
    id: "abastecimento",
    nome: "Abastecimento do Picking",
    emoji: "📥",
    desenho: "abastecimento",
    area: "Armazém e recebimento",
    chaves: ["pa-picking", "picking"],
  },
  { id: "bate-palete", nome: "Bate Palete", emoji: "🤲📦", area: "Armazém e recebimento", chaves: ["pa-bate-palete"] },
  { id: "portaria", nome: "Recebimento de Carreta (portaria)", emoji: "👮", area: "Armazém e recebimento", chaves: ["carretas-portaria"] },
  { id: "monitor", nome: "Monitor de Recebimento", emoji: "🖥️", area: "Armazém e recebimento", chaves: ["carretas-conferencia"] },
  { id: "carreta", nome: "Carreta (o veículo)", emoji: "🚛", area: "Armazém e recebimento", chaves: ["pa-recebimento"] },
  { id: "blitz", nome: "Blitz de carreta", emoji: "🔦", area: "Armazém e recebimento", chaves: [] },
  {
    id: "fefo",
    nome: "Quebra de FEFO",
    emoji: "📆",
    desenho: "fefo",
    area: "Armazém e recebimento",
    chaves: ["fefo", "fefo-controle"],
  },
  { id: "wqi", nome: "Baixa WQI (quebra de PA)", emoji: "💸", area: "Armazém e recebimento", chaves: ["wqi"] },

  // ---- Operação e manutenção ----
  { id: "feedback-rota", nome: "Feedback da Rota", emoji: "📝", area: "Operação e manutenção", chaves: ["feedback", "feedbacks"] },
  { id: "cinco-porques", nome: "5 Porquês", emoji: "5️⃣", area: "Operação e manutenção", chaves: [] },
  {
    id: "ativo-giro",
    nome: "Ativo de Giro (AG)",
    emoji: "🔄",
    desenho: "ativo-giro",
    area: "Operação e manutenção",
    chaves: ["ativo-giro"],
  },
  { id: "material-apoio", nome: "Material de Apoio", emoji: "🧰", area: "Operação e manutenção", chaves: ["material-apoio"] },
  { id: "manutencao", nome: "Check de Manutenção", emoji: "🛠️", area: "Operação e manutenção", chaves: ["manutencao"] },
  {
    id: "chamados",
    nome: "Chamados para Manutenção",
    emoji: "🔧",
    area: "Operação e manutenção",
    chaves: ["chamados", "chamados-atender"],
  },
  {
    id: "fornecedores",
    nome: "Fornecedores",
    emoji: "☎️",
    desenho: "fornecedores",
    area: "Operação e manutenção",
    chaves: ["fornecedores"],
  },
  { id: "raci", nome: "RACI da Manutenção", emoji: "🧭", area: "Operação e manutenção", chaves: [] },
  { id: "cinco-s", nome: "Programa 5S (e o 5S do Armazém)", emoji: "🧹", area: "Operação e manutenção", chaves: ["5s", "cinco-s", "pa-cinco-s"] },
  { id: "pdv", nome: "Particularidades do PDV", emoji: "📍", area: "Operação e manutenção", chaves: ["pdv-particularidades", "pdv"] },

  // ---- Da empresa ----
  { id: "comunicados", nome: "Jornal / Comunicados", emoji: "📰", area: "Da empresa", chaves: ["comunicados"] },
  { id: "padroes", nome: "Padrões", emoji: "📋", area: "Da empresa", chaves: ["padroes"] },
  { id: "sonho", nome: "Sonho da Revenda", emoji: "🌟", area: "Da empresa", chaves: ["sonho"] },
  { id: "metas", nome: "Metas", emoji: "🎯", area: "Da empresa", chaves: ["metas"] },
  { id: "ranking", nome: "Ranking Super Matinal", emoji: "🏆", area: "Da empresa", chaves: ["ranking"] },
  { id: "desafio", nome: "Desafio do Mês", emoji: "🧠", area: "Da empresa", chaves: ["quiz", "desafio"] },
  { id: "boas-praticas", nome: "Boas Práticas", emoji: "💡", area: "Da empresa", chaves: ["boas-praticas", "boas-praticas-config"] },
  { id: "pesquisa", nome: "Pesquisa de Satisfação", emoji: "💬", area: "Da empresa", chaves: ["pesquisa"] },
  { id: "guia", nome: "Como Fazer", emoji: "❓", area: "Da empresa", chaves: ["guia"] },

  // ---- Gestão ----
  { id: "gestao", nome: "Painel de Gestão", emoji: "📊", area: "Gestão", chaves: [] },
  { id: "anomalias", nome: "Anomalias e relatos", emoji: "🚨", area: "Gestão", chaves: ["anomalias", "relato-anomalia"] },
  { id: "comprovantes", nome: "Comprovantes de Pagamento (conferência)", emoji: "🧾", area: "Gestão", chaves: ["comprovantes-qr"] },
  {
    id: "mao-de-obra",
    nome: "Simulador de Mão de Obra",
    emoji: "🧮",
    desenho: "mao-de-obra",
    area: "Gestão",
    chaves: ["mao-de-obra"],
  },
  { id: "resumo-semanal", nome: "Resumo da semana", emoji: "📬", area: "Gestão", chaves: [] },

  // ---- Administração ----
  { id: "acessos", nome: "Acessos por Pessoa", emoji: "🔐", area: "Administração", chaves: ["acessos"] },
  { id: "perfis", nome: "Perfis de Acesso", emoji: "🎫", area: "Administração", chaves: ["perfis-acesso"] },
  { id: "colaboradores", nome: "Colaboradores", emoji: "👥", area: "Administração", chaves: ["colaboradores"] },
  { id: "revendas", nome: "Revendas", emoji: "🏢", area: "Administração", chaves: [] },
  { id: "auditoria", nome: "Log de Auditoria", emoji: "📜", area: "Administração", chaves: [] },
  { id: "fontes", nome: "Fontes de Dados", emoji: "🔌", area: "Administração", chaves: ["fontes-dados"] },
  { id: "notificacoes", nome: "Notificações", emoji: "🔔", area: "Administração", chaves: [] },
  { id: "creditos-ia", nome: "Créditos de IA", emoji: "💳", area: "Administração", chaves: [] },
  { id: "saude", nome: "Saúde do sistema", emoji: "🩺", area: "Administração", chaves: [] },
  { id: "menu", nome: "Ordem do Menu", emoji: "🔀", area: "Administração", chaves: ["menu"] },
  { id: "mapa-emojis", nome: "Mapa de emojis", emoji: "🎨", area: "Administração", chaves: [] },
];

/** O assunto de uma chave de módulo, menu, painel ou categoria de guia. */
export function assuntoDaChave(chave: string): Assunto | undefined {
  return MAPA_DE_EMOJIS.find((a) => a.chaves.includes(chave));
}

/** Os assuntos com desenho próprio, pelo emoji exclusivo de cada um. */
export const DESENHO_DO_EMOJI: Record<string, DesenhoProprio> = Object.fromEntries(
  MAPA_DE_EMOJIS.filter((a) => a.desenho).map((a) => [a.emoji, a.desenho as DesenhoProprio]),
);

/**
 * Corta um texto nos emojis que têm desenho, para quem desenha trocar
 * cada um pelo desenho. Só o emoji exato (com ou sem o seletor U+FE0F)
 * -- e nunca dentro de uma sequência com junção (ZWJ).
 */
export function partesComDesenho(texto: string): ({ texto: string } | { desenho: DesenhoProprio })[] {
  const emojis = Object.keys(DESENHO_DO_EMOJI);
  if (!emojis.some((e) => texto.includes(e.replace("️", "")))) return [{ texto }];
  const alternativas = emojis
    .map((e) => e.replace("️", ""))
    .sort((a, b) => b.length - a.length)
    .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "️?");
  const re = new RegExp(`(?<!‍)(?:${alternativas.join("|")})(?!‍)`, "gu");
  const partes: ({ texto: string } | { desenho: DesenhoProprio })[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > ultimo) partes.push({ texto: texto.slice(ultimo, i) });
    const chave = Object.keys(DESENHO_DO_EMOJI).find((e) => e.replace("️", "") === m[0].replace("️", ""));
    if (chave) partes.push({ desenho: DESENHO_DO_EMOJI[chave] });
    ultimo = i + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo) });
  return partes;
}
