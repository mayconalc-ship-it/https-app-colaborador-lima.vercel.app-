import type { Acao, ModuloId } from "@/lib/acessos";

/**
 * GUIA "COMO FAZER" (02/10/2026).
 *
 * Pedido do dono: "um novo usuário precisa saber como ele faz para tornar
 * uma pessoa liderança". O app cresceu para dezenas de telas, e o caminho
 * até cada uma -- botão dourado, gaveta da barra lateral, sanfona dentro
 * da tela -- só quem acompanhou a construção sabe de cor.
 *
 * Cada passo a passo descreve a tela COMO ELA É: os nomes dos botões
 * entre ** são os mesmos que aparecem na tela. Mudou um botão de nome?
 * Mude aqui também -- um guia que manda tocar num botão que não existe
 * é pior do que guia nenhum.
 *
 * `exige` decide quem vê o guia: basta UMA das permissões da lista. Sem
 * `exige`, o guia é de todo mundo. O dono vê todos.
 */

export type Passo = {
  /** O que fazer. `**texto**` sai em negrito: é o nome do botão ou campo. */
  texto: string;
  /** Uma observação curta, embaixo do passo. */
  dica?: string;
};

export type CategoriaDoGuia = "primeiros-passos" | "pessoas" | "comunicacao" | "rv";

export const CATEGORIAS_DO_GUIA: { id: CategoriaDoGuia; titulo: string; emoji: string }[] = [
  { id: "primeiros-passos", titulo: "Primeiros passos", emoji: "🚀" },
  { id: "pessoas", titulo: "Pessoas e acessos", emoji: "👥" },
  { id: "comunicacao", titulo: "Comunicação com o time", emoji: "📣" },
  { id: "rv", titulo: "RV e indicadores", emoji: "💰" },
];

export type Guia = {
  slug: string;
  titulo: string;
  emoji: string;
  categoria: CategoriaDoGuia;
  /** Uma frase: para que serve. Aparece na lista. */
  resumo: string;
  /** Quem pode seguir este guia. Basta UMA. Vazio = todo mundo. */
  exige?: [ModuloId, Acao][];
  /** O que precisa estar pronto antes de começar. */
  antes?: string[];
  passos: Passo[];
  /** O que costuma dar errado, ou o que a pessoa precisa saber depois. */
  atencao?: string[];
  /** Atalho para a tela onde o guia acontece. */
  tela?: { href: string; rotulo: string };
  /** Palavras que a pessoa digitaria na busca e que não estão no título. */
  palavras?: string[];
  relacionados?: string[];
};

/** Os três primeiros passos de toda tarefa do Modo Liderança. */
const ENTRAR_NO_MODO: Passo = {
  texto: "Toque no botão dourado **Liderança** no topo da tela (para o dono do app, o botão se chama **Admin**).",
  dica: "Não aparece o botão? Você ainda não tem nenhuma permissão de liderança. Fale com o Admin.",
};
const ABRIR_BARRA: Passo = {
  texto: "Abra o menu lateral: no celular, toque no **☰** à esquerda; no computador, passe o mouse na barra da esquerda.",
};
const gaveta = (grupo: string, item: string): Passo => ({
  texto: `Abra a gaveta **${grupo}** e toque em **${item}**.`,
});

export const GUIAS: Guia[] = [
  /* ------------------------------------------------------------------ */
  /* Primeiros passos                                                    */
  /* ------------------------------------------------------------------ */
  {
    slug: "primeiro-acesso",
    titulo: "Entrar no app pela primeira vez",
    emoji: "🔑",
    categoria: "primeiros-passos",
    resumo: "Login com o CPF e criação da sua senha pessoal.",
    palavras: ["login", "entrar", "senha", "cpf", "acesso"],
    antes: ["Seu cadastro feito pela liderança e a senha provisória que ela te passou."],
    passos: [
      { texto: "Na tela **Entrar**, digite o seu **CPF só com números**." },
      { texto: "Digite a **senha provisória** que a liderança te passou e toque em **Entrar**." },
      {
        texto: "O app abre a tela **Crie sua senha 🔒**. Escolha uma senha com **no mínimo 6 caracteres**.",
        dica: "A senha nova não pode ser igual à provisória.",
      },
      { texto: "Repita a senha no segundo campo e toque em **Salvar e entrar**." },
      { texto: "Aparece **Senha alterada com sucesso!** e o app abre sozinho." },
    ],
    atencao: [
      "Esqueceu a senha? Não existe recuperação por e-mail. Peça para a sua liderança redefinir — ela te passa uma nova senha provisória.",
    ],
    relacionados: ["trocar-senha", "ativar-avisos"],
  },
  {
    slug: "trocar-senha",
    titulo: "Trocar a minha senha",
    emoji: "🔒",
    categoria: "primeiros-passos",
    resumo: "Criar uma senha nova quando quiser.",
    palavras: ["senha", "conta", "alterar"],
    passos: [
      { texto: "No topo da tela, toque em **👤** (no computador aparece escrito **Minha conta**)." },
      { texto: "Digite a senha nova em **Nova senha** e repita em **Confirmar nova senha**." },
      { texto: "Toque em **Salvar nova senha**." },
    ],
    tela: { href: "/minha-conta", rotulo: "Abrir Minha Conta" },
    relacionados: ["primeiro-acesso"],
  },
  {
    slug: "ativar-avisos",
    titulo: "Receber os avisos no celular",
    emoji: "🔔",
    categoria: "primeiros-passos",
    resumo: "Ligar as notificações para saber na hora de comunicado, RV e lembretes.",
    palavras: ["notificação", "notificacao", "push", "sino", "aviso", "iphone"],
    passos: [
      { texto: "Toque no sino **🔔** no topo da tela." },
      { texto: "Toque em **📲 Receber avisos no celular** e aceite quando o celular perguntar." },
      {
        texto: "No **iPhone**, antes disso instale o app: no Safari, toque em **Compartilhar** e escolha **Adicionar à Tela de Início**. Abra o app pelo ícone novo e volte ao sino.",
        dica: "É exigência da Apple, não do app.",
      },
    ],
    atencao: [
      "Apareceu **Bloqueado no navegador**? O celular recusou as notificações antes. Toque no aviso: o app mostra como liberar nos ajustes, em uns 15 segundos.",
    ],
  },
  {
    slug: "trocar-revenda",
    titulo: "Trocar de revenda",
    emoji: "🏢",
    categoria: "primeiros-passos",
    resumo: "Para quem trabalha em mais de uma unidade: escolher em qual está mexendo agora.",
    palavras: ["unidade", "barreiras", "são félix", "sao felix", "matriz", "filial"],
    passos: [
      {
        texto: "No topo da tela, toque no botão **🏢** com o nome (ou a sigla) da revenda.",
        dica: "O botão só aparece para quem está vinculado a mais de uma revenda.",
      },
      { texto: "Na tela **Escolher revenda**, toque na revenda em que você vai trabalhar." },
    ],
    atencao: [
      "Tudo o que você vê e grava depois disso é da revenda escolhida — inclusive as permissões de liderança, que são separadas em cada unidade.",
    ],
  },

  /* ------------------------------------------------------------------ */
  /* Pessoas e acessos                                                   */
  /* ------------------------------------------------------------------ */
  {
    slug: "cadastrar-colaborador",
    titulo: "Cadastrar um colaborador",
    emoji: "➕",
    categoria: "pessoas",
    resumo: "Criar o acesso de uma pessoa nova, uma de cada vez.",
    exige: [["colaboradores", "criar"]],
    palavras: ["novo", "admissão", "admissao", "funcionário", "funcionario", "criar acesso"],
    antes: ["Confira no topo (🏢) se você está na revenda certa: a pessoa entra na revenda ativa."],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("👥 Pessoas", "👥 Colaboradores"),
      { texto: "Toque em **+ Cadastrar novo colaborador**." },
      {
        texto: "Preencha **Nome completo**, **CPF (será o login)**, **Matrícula**, **Cargo** e **Área**.",
        dica: "O CPF não pode ser mudado depois — ele é o login. Confira antes de salvar.",
      },
      { texto: "Toque em **Cadastrar**." },
      { texto: "Passe para a pessoa o CPF e a **senha inicial** que aparece na mensagem verde. No primeiro acesso, o app pede para ela criar a senha dela." },
    ],
    atencao: [
      "Chegaram muitas pessoas de uma vez? Use a importação por planilha — é mais rápido e mostra tudo antes de gravar.",
    ],
    tela: { href: "/admin/colaboradores", rotulo: "Abrir Colaboradores" },
    relacionados: ["importar-colaboradores", "tornar-lideranca", "primeiro-acesso"],
  },
  {
    slug: "importar-colaboradores",
    titulo: "Importar colaboradores por planilha",
    emoji: "📥",
    categoria: "pessoas",
    resumo: "Cadastrar ou atualizar várias pessoas de uma vez, pelo Excel.",
    exige: [["colaboradores", "criar"]],
    palavras: ["planilha", "excel", "xlsx", "lote", "vários", "varios", "implantação", "implantacao"],
    antes: ["Confira no topo (🏢) se você está na revenda certa: todos da planilha entram na revenda ativa."],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("👥 Pessoas", "👥 Colaboradores"),
      { texto: "Toque em **📥 Importar planilha de colaboradores**." },
      {
        texto: "Toque em **⬇️ Baixar planilha padrão**. Ela já vem com quem está na revenda.",
        dica: "Colunas: Matrícula, Nome, CPF, Cargo e Área. Coluna a mais é ignorada.",
      },
      { texto: "No Excel, acrescente as pessoas novas e corrija o que mudou. Salve o arquivo." },
      {
        texto: "De volta ao app, escolha o arquivo e toque em **Ler planilha**.",
        dica: "Nada é gravado ainda: a tela mostra quem entra, quem muda e quem foi recusado (e por quê).",
      },
      { texto: "Confira a prévia. Se estiver certa, toque no botão **Gravar** no fim da lista." },
    ],
    atencao: [
      "Ninguém é removido por não estar na planilha. Para tirar alguém do app, use **Remover do app** na ficha da pessoa.",
      "Área que o app não reconhece deixa a pessoa sem Desafio do Mês, Escala e comunicados da área. Se a prévia avisar, corrija a planilha antes de gravar.",
    ],
    tela: { href: "/admin/colaboradores", rotulo: "Abrir Colaboradores" },
    relacionados: ["cadastrar-colaborador"],
  },
  {
    slug: "tornar-lideranca",
    titulo: "Tornar uma pessoa liderança",
    emoji: "⭐",
    categoria: "pessoas",
    resumo: "Dar a alguém o acesso ao Modo Liderança — e depois liberar o que ela pode fazer.",
    exige: [
      ["colaboradores", "promover"],
      ["acessos", "editar"],
    ],
    palavras: ["promover", "líder", "lider", "supervisor", "gestor", "coordenador", "permissão", "permissao"],
    antes: [
      "A pessoa já precisa ter cadastro no app.",
      "Confira no topo (🏢) se você está na revenda certa: a liderança vale só para a revenda ativa.",
    ],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("👥 Pessoas", "👥 Colaboradores"),
      { texto: "Busque a pessoa em **Buscar por nome ou CPF** e toque no nome dela para abrir a ficha." },
      { texto: "Marque a caixa vermelha **Confirmo que (nome) passa a entrar no Modo Liderança**." },
      {
        texto: "Toque em **Tornar liderança** e confirme na pergunta que aparece.",
        dica: "Pronto: a pessoa ganha o botão dourado Liderança — mas ainda sem nenhuma tela liberada.",
      },
      {
        texto: "Agora libere o que ela pode fazer: no menu lateral, abra **🔐 Acessos por Pessoa** (o Admin encontra no topo da barra; a liderança, na gaveta 👥 Pessoas).",
      },
      { texto: "Na aba **Por pessoa**, em **Lideranças em (revenda)**, toque no nome da pessoa." },
      {
        texto: "Marque o que ela pode fazer em cada módulo — **Visualizar**, **Criar**, **Editar**, **Excluir** — ou use **Somar este perfil** para aplicar um perfil pronto.",
      },
      { texto: "Toque em **Salvar permissões em (revenda)**." },
    ],
    atencao: [
      "Promover dá o crachá, não as chaves: sem o passo de Acessos por Pessoa, a pessoa entra no Modo Liderança e não vê nada.",
      "Outro caminho para promover: em **🔐 Acessos por Pessoa**, aba **Por pessoa**, toque em **+ Tornar alguém liderança** e busque o nome.",
      "Quem trabalha em duas unidades precisa das permissões liberadas em cada uma delas — troque a revenda no 🏢 e repita.",
      "Para desfazer, abra a mesma ficha em Colaboradores e toque em **Tirar liderança**: a pessoa continua usando o app, mas perde todas as permissões.",
    ],
    tela: { href: "/admin/colaboradores", rotulo: "Abrir Colaboradores" },
    relacionados: ["cadastrar-colaborador", "trocar-revenda"],
  },
  {
    slug: "redefinir-senha",
    titulo: "Redefinir a senha de alguém",
    emoji: "🔁",
    categoria: "pessoas",
    resumo: "Quando um colaborador esquece a senha.",
    exige: [["colaboradores", "editar"]],
    palavras: ["esqueceu", "esqueci", "senha", "bloqueado", "não consegue entrar", "nao consegue entrar"],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("👥 Pessoas", "👥 Colaboradores"),
      { texto: "Busque a pessoa em **Buscar por nome ou CPF** e toque no nome dela." },
      { texto: "Toque em **Redefinir senha** e confirme." },
      {
        texto: "Passe para a pessoa a **senha provisória** que aparece na mensagem verde.",
        dica: "No próximo acesso, o app pede para ela criar uma senha nova.",
      },
    ],
    atencao: ["Não existe recuperação de senha por e-mail: o acesso é pelo CPF, e é por aqui que se resolve."],
    tela: { href: "/admin/colaboradores", rotulo: "Abrir Colaboradores" },
    relacionados: ["primeiro-acesso"],
  },
  {
    slug: "remover-colaborador",
    titulo: "Remover um colaborador do app",
    emoji: "🚪",
    categoria: "pessoas",
    resumo: "Tirar o acesso de quem saiu da empresa.",
    exige: [["colaboradores", "excluir"]],
    palavras: ["desligamento", "demissão", "demissao", "excluir", "apagar", "saiu"],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("👥 Pessoas", "👥 Colaboradores"),
      { texto: "Busque a pessoa em **Buscar por nome ou CPF** e toque no nome dela." },
      { texto: "Toque em **Remover do app** (botão vermelho, no fim da ficha) e confirme." },
    ],
    atencao: [
      "Não tem como desfazer. Se a pessoa voltar, é preciso cadastrar de novo.",
      "Se quem remove é uma liderança e a pessoa também trabalha em outra unidade, ela sai só da revenda ativa — o acesso às outras continua. O Admin remove do app inteiro.",
    ],
    tela: { href: "/admin/colaboradores", rotulo: "Abrir Colaboradores" },
  },

  /* ------------------------------------------------------------------ */
  /* Comunicação                                                         */
  /* ------------------------------------------------------------------ */
  {
    slug: "publicar-comunicado",
    titulo: "Publicar um comunicado no Jornal",
    emoji: "📰",
    categoria: "comunicacao",
    resumo: "Escrever uma notícia para o time, na hora ou agendada.",
    exige: [["comunicados", "criar"]],
    palavras: ["jornal", "notícia", "noticia", "aviso", "agendar", "matéria", "materia"],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("📣 Comunicação", "📰 Jornal / Comunicados"),
      { texto: "Toque em **+ Publicar novo comunicado**." },
      {
        texto: "Escolha a **Editoria** e preencha **Título**, **Chamada** (opcional) e **Conteúdo**.",
        dica: "Pule uma linha no Conteúdo para separar os parágrafos.",
      },
      { texto: "Se quiser, escolha uma **Foto** — ela é reduzida no próprio celular antes de enviar." },
      {
        texto: "Em **🗓️ Quando entra no jornal**, escolha **Publicar agora** ou **⏰ Agendar** (e a data e hora).",
        dica: "Agendado, o comunicado não aparece para o time até a hora marcada.",
      },
      { texto: "Toque em **Publicar**." },
    ],
    atencao: [
      "Marque **Matéria de capa** para o comunicado aparecer grande no topo do jornal.",
      "Quer lembrar o time de algo no dia (um treinamento, por exemplo)? Abra **🔔 Lembrete agendado** no formulário: ele chega pelo sino e pelo celular.",
    ],
    tela: { href: "/admin/comunicados", rotulo: "Abrir Jornal / Comunicados" },
    relacionados: ["ativar-avisos"],
  },
  {
    slug: "atualizar-escala",
    titulo: "Atualizar a escala de trabalho",
    emoji: "🗓️",
    categoria: "comunicacao",
    resumo: "Publicar a escala nova de uma área em PDF ou foto.",
    exige: [["escala", "editar"]],
    palavras: ["escala", "folga", "plantão", "plantao", "turno"],
    antes: ["A escala salva em PDF ou como imagem (foto ou print)."],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("📣 Comunicação", "🗓️ Escala de Trabalho"),
      { texto: "Vá até o bloco da área e escolha o arquivo em **Arquivo da escala (PDF ou imagem)**." },
      {
        texto: "Se quiser, escreva um recado em **Aviso para o time (opcional)**.",
        dica: "Exemplo: \"Vigora a partir de 01/08\".",
      },
      { texto: "Toque em **Salvar escala de (área)**." },
    ],
    atencao: ["A escala nova substitui a anterior daquela área. Atualize sempre que mudar."],
    tela: { href: "/admin/escala", rotulo: "Abrir Escala de Trabalho" },
  },

  /* ------------------------------------------------------------------ */
  /* RV e indicadores                                                    */
  /* ------------------------------------------------------------------ */
  {
    slug: "avisar-rv",
    titulo: "Avisar o time que a RV saiu",
    emoji: "💰",
    categoria: "rv",
    resumo: "Conferir a planilha da RV e mandar o aviso para quem tem valor a receber.",
    exige: [["rv", "editar"]],
    palavras: ["remuneração", "remuneracao", "variável", "variavel", "contracheque", "planilha", "fechamento"],
    antes: ["A planilha da RV do mês já atualizada no Drive (o app lê a planilha ao vivo)."],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("⚙️ Configuração", "🔌 Fontes de Dados"),
      { texto: "Abra o bloco **Remuneração Variável**." },
      {
        texto: "Confira se o link de cada área está certo. Se trocou a planilha, cole o link novo e toque em **Salvar**.",
        dica: "Use o link do PRÓPRIO ARQUIVO no Drive (Compartilhar → Copiar link), não o da pasta.",
      },
      {
        texto: "Em **🔔 Avisar que a RV foi atualizada**, toque em **Avisar quem tem RV**.",
        dica: "O aviso vai só para quem tem CPF na planilha — quem não recebe RV não é incomodado.",
      },
    ],
    atencao: [
      "Quer conferir antes uma pessoa? Use **Conferir um CPF na planilha →**, no mesmo bloco.",
    ],
    tela: { href: "/admin/fontes-de-dados?aberta=rv#fonte-rv", rotulo: "Abrir Fontes de Dados" },
    relacionados: ["ativar-avisos"],
  },
];

/** Busca sem acento e sem caixa: "promocao" acha "Promoção". */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Todas as palavras digitadas precisam aparecer em algum lugar do guia. */
export function guiaCombina(guia: Guia, termo: string): boolean {
  const palavras = normalizarBusca(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return true;
  const texto = normalizarBusca(
    [
      guia.titulo,
      guia.resumo,
      ...(guia.palavras ?? []),
      ...guia.passos.map((p) => p.texto),
    ].join(" "),
  );
  return palavras.every((p) => texto.includes(p));
}

/**
 * Os guias que esta pessoa consegue seguir. Mostrar o passo a passo de
 * uma tela que ela não abre só gera a pergunta "cadê esse botão?".
 */
export function guiasParaQuem(pode: (modulo: ModuloId, acao: Acao) => boolean): Guia[] {
  return GUIAS.filter((g) => !g.exige || g.exige.length === 0 || g.exige.some(([m, a]) => pode(m, a)));
}

export function guiaPorSlug(slug: string): Guia | undefined {
  return GUIAS.find((g) => g.slug === slug);
}

/** Quebra "toque em **Salvar**" em pedaços normais e em negrito. */
export function pedacosDoTexto(texto: string): { texto: string; negrito: boolean }[] {
  return texto
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((p) =>
      p.startsWith("**") && p.endsWith("**")
        ? { texto: p.slice(2, -2), negrito: true }
        : { texto: p, negrito: false },
    );
}
