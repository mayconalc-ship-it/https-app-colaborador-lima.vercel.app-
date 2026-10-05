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

export type CategoriaDoGuia =
  | "primeiros-passos"
  | "entrega"
  | "armazem"
  | "ativo-giro"
  | "cinco-s"
  | "pessoas"
  | "comunicacao"
  | "rv";

export const CATEGORIAS_DO_GUIA: { id: CategoriaDoGuia; titulo: string; emoji: string }[] = [
  { id: "primeiros-passos", titulo: "Primeiros passos", emoji: "🚀" },
  { id: "entrega", titulo: "Rota e entrega", emoji: "🚚" },
  { id: "armazem", titulo: "Produtividade do Armazém", emoji: "🏭" },
  { id: "ativo-giro", titulo: "Ativo de Giro", emoji: "🔄" },
  { id: "cinco-s", titulo: "Programa 5S", emoji: "🧹" },
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

/** O caminho de toda tela do operador do armazém, a partir da inicial. */
const noArmazem = (cartao: string): Passo => ({
  texto: `Na tela inicial, toque em **Produtividade do Armazém** e depois em **${cartao}**.`,
  dica: "Não aparece o cartão? A tela ainda não foi liberada para você. Fale com a sua liderança.",
});

/**
 * Quem vê os guias do operador: quem tem a tela liberada (módulo do app)
 * ou quem administra a Produtividade do Armazém inteira -- esse vê todos
 * os cartões, como na própria tela.
 */
const doArmazem = (modulo: ModuloId): [ModuloId, Acao][] => [
  [modulo, "ver"],
  ["produtividade-armazem", "editar"],
];

/** Inicia, faz, finaliza: o ciclo de todo cronômetro do armazém. */
const CRONOMETRO_ABERTO: Passo = {
  texto: "Pronto, o cronômetro está correndo. Pode sair do app e trabalhar: ao voltar para a tela, a atividade continua aberta esperando você.",
};
const COMECEI_POR_ENGANO =
  "Começou por engano? Toque em **Cancelar (comecei por engano)**: a atividade é apagada sem contar como produção.";

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
  /* Rota e entrega                                                      */
  /* ------------------------------------------------------------------ */
  {
    slug: "consultar-minha-rota",
    titulo: "Consultar a minha rota (pré-rota)",
    emoji: "🚚",
    categoria: "entrega",
    resumo: "Ver veículo, caixas, ocupação, cidades e clientes do mapa antes de sair.",
    exige: [["rotas", "ver"]],
    palavras: ["rota", "pré-rota", "pre-rota", "mapa", "motorista", "ajudante", "clientes", "ocupação", "ocupacao", "caixas"],
    passos: [
      {
        texto: "Na tela inicial, toque em **Minha Rota**.",
        dica: "Não aparece o cartão? O módulo ainda não foi liberado para você. Fale com a sua liderança.",
      },
      {
        texto: "Em **🔢 Número do mapa**, digite o número e toque em **Consultar rota**.",
        dica: "Pode digitar com ou sem os zeros da frente.",
      },
      {
        texto: "Confira o **Veículo**, o **Motorista** e as **📦 Caixas por viagem**.",
        dica: "As cores comparam com a meta: 🟢 na meta, 🟡 quase lá (de 85% da meta para cima), 🔴 abaixo.",
      },
      {
        texto: "Em **🏙️ Cidades e clientes**, toque numa cidade para ver os clientes, com bairro, endereço e telefone.",
        dica: "Do telefone, dá para chamar o cliente direto no **WhatsApp**.",
      },
      { texto: "Para mandar a pré-rota para alguém, toque em **📤 Compartilhar Pré-rota**. Para ver outro mapa, toque em **Trocar**." },
    ],
    atencao: [
      "Alguma coisa não bate com o que você vai carregar? Procure a liderança **antes de sair**.",
      "A consulta precisa de internet. Sem sinal, o app avisa: tente de novo quando voltar.",
      "Não achou o mapa? Confira o número. Se estiver certo, a pré-rota ainda não foi atualizada: avise a liderança.",
    ],
    tela: { href: "/minha-rota", rotulo: "Abrir Minha Rota" },
    relacionados: ["registrar-comprovante"],
  },
  {
    slug: "registrar-comprovante",
    titulo: "Registrar o comprovante de um PIX",
    emoji: "📲",
    categoria: "entrega",
    resumo: "Quando o cliente paga pelo PIX da empresa: passar a chave e registrar o comprovante.",
    exige: [["qr-contingencia", "ver"]],
    palavras: ["pix", "pagamento", "comprovante", "contingência", "contingencia", "cnpj", "chave", "nota fiscal", "nf", "cliente"],
    passos: [
      { texto: "Na tela inicial, toque em **Comprovante de Pagamento**." },
      { texto: "Em **Qual cliente vai pagar?**, digite o **Número do mapa** e toque em **Buscar**." },
      {
        texto: "Ache o cliente na lista ou em **Procurar cliente** (nome, código ou bairro) e toque nele.",
        dica: "Não está na lista? Use **✍️ Cliente não está na lista? Informar o código**.",
      },
      {
        texto: "Em **PIX pela chave CNPJ**, mostre ao cliente: no app do banco ele escolhe **PIX → Pagar com chave**, tipo **CNPJ**, e digita a chave.",
        dica: "Toque em **📋 Copiar a chave (CNPJ)** para mandar a chave por mensagem. Peça para o cliente conferir o nome do favorecido antes de confirmar.",
      },
      { texto: "Pago? Em **Fotos do comprovante**, toque em **📷 Tirar foto** (ou **🖼️ Da galeria**)." },
      {
        texto: "Preencha o **Valor pago** e a **Nota fiscal (NF)** — uma ou mais. Se quiser, escreva uma **Observação**.",
        dica: "O valor entra como no app do banco: os números vão para os centavos (1-5-2-4-0 = R$ 152,40).",
      },
      { texto: "Toque em **Enviar comprovante**. Ele aparece em **Comprovantes de hoje**." },
    ],
    atencao: [
      "Sem internet? O botão vira **Guardar no celular (sem internet)**. O comprovante fica em **⏳ Aguardando envio**: quando o sinal voltar, toque em **Enviar agora**. Não limpe os dados do app antes disso.",
      "Errou o valor ou a NF? Em **Comprovantes de hoje**, toque em **✏️ Editar** e depois em **Salvar alterações**.",
      "Motorista e ajudante do mesmo mapa veem os mesmos comprovantes — não registre duas vezes.",
    ],
    tela: { href: "/qr-contingencia", rotulo: "Abrir Comprovante de Pagamento" },
    relacionados: ["consultar-minha-rota", "conferir-comprovantes"],
  },
  {
    slug: "conferir-comprovantes",
    titulo: "Conferir os comprovantes com o extrato",
    emoji: "🧾",
    categoria: "entrega",
    resumo: "Para a liderança e o financeiro: bater cada PIX com o extrato, mapa a mapa.",
    exige: [
      ["qr-contingencia", "criar"],
      ["qr-contingencia", "editar"],
    ],
    palavras: ["conciliação", "conciliacao", "extrato", "pix", "financeiro", "divergência", "divergencia", "comprovantes"],
    passos: [
      { texto: "Na tela inicial, no bloco **📊 Gestão**, toque em **🧾 Comprovantes de Pagamento**." },
      { texto: "Filtre o período em **De** e **Até** e, se quiser, por **Mapa**, **Motorista** ou **Cliente ou NF**." },
      { texto: "No **Resumo por mapa**, abra o mapa que vai conferir." },
      {
        texto: "Em cada comprovante, confira a foto com o extrato: caiu certo? Toque em **✓ Bate**.",
        dica: "Vários certos de uma vez? Marque-os e toque em **✓ Conferir marcados**.",
      },
      {
        texto: "Caiu diferente ou não caiu? Toque em **≠ Diverge**, informe o **Valor no extrato** (0 se não caiu), escolha o motivo e toque em **Registrar divergência**.",
      },
      {
        texto: "Não é PIX da contingência (boleto, duplicado)? Toque em **⊘ Desconsiderar**, escolha o motivo e confirme.",
        dica: "O comprovante continua gravado, riscado, mas sai da conta do mapa.",
      },
      { texto: "Mapa todo conferido sem divergência aparece como **✓ Fechado**. Para mandar o resumo, use **📋 Copiar resumo**." },
    ],
    tela: { href: "/gestao/comprovantes-qr", rotulo: "Abrir Comprovantes de Pagamento" },
    relacionados: ["registrar-comprovante", "configurar-pix"],
  },
  {
    slug: "configurar-pix",
    titulo: "Configurar o PIX do Comprovante de Pagamento",
    emoji: "📲",
    categoria: "entrega",
    resumo: "Cadastrar o favorecido, o CNPJ e as instruções que o motorista vê.",
    exige: [["qr-contingencia", "editar"]],
    palavras: ["pix", "cnpj", "favorecido", "chave", "configurar", "contingência", "contingencia"],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("⚙️ Configuração", "📲 Comprovante de Pagamento"),
      {
        texto: "Preencha o **Favorecido (nome que aparece no PIX)** e o **CNPJ**.",
        dica: "O CNPJ é a chave que o motorista mostra ao cliente. Sem ele, a tela do motorista avisa que falta cadastrar.",
      },
      {
        texto: "Se quiser, escreva as **Instruções para o motorista**.",
        dica: "Exemplo: \"confira o nome do favorecido no celular do cliente antes de ele confirmar\".",
      },
      { texto: "Toque em **Salvar a chave PIX**." },
    ],
    atencao: [
      "O pagamento é pela chave CNPJ, digitada pelo cliente. O PIX por imagem ou copia e cola gerava tarifa na conta da empresa, por isso não é usado.",
    ],
    tela: { href: "/admin/qr-contingencia", rotulo: "Abrir a configuração" },
    relacionados: ["registrar-comprovante"],
  },
  {
    slug: "atualizar-pre-rota",
    titulo: "Atualizar a pré-rota e as metas",
    emoji: "🚚",
    categoria: "entrega",
    resumo: "Ligar a pasta do Drive que alimenta a Minha Rota e definir as metas de ocupação e caixas.",
    exige: [["rotas", "criar"]],
    palavras: ["pré-rota", "pre-rota", "drive", "pasta", "csv", "metas", "ocupação", "ocupacao", "caixas"],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("⚙️ Configuração", "🔌 Fontes de Dados"),
      {
        texto: "Abra **Minha Rota (pré-rota)**. Em **Link da pasta no Drive**, cole o link da pasta onde o CSV da pré-rota cai todo dia e toque em **Salvar**.",
      },
      {
        texto: "Para trazer a pré-rota mais nova na hora, toque em **↻ Atualizar agora**.",
        dica: "O app lê o CSV mais recente da pasta. Reimportar não duplica nada.",
      },
      {
        texto: "Para as metas: na gaveta **🗄️ Gestão de Dados**, toque em **🚚 Minha Rota (pré-rota)** e abra **🎯 Metas da operação**.",
      },
      {
        texto: "Defina a **Ocupação (%)** e as **Caixas por viagem** e toque em **Salvar metas**.",
        dica: "É daqui que sai a cor das barras na tela do motorista: 🟢 na meta, 🟡 quase lá, 🔴 abaixo.",
      },
    ],
    tela: { href: "/admin/fontes-de-dados?aberta=rotas#fonte-rotas", rotulo: "Abrir Fontes de Dados" },
    relacionados: ["consultar-minha-rota"],
  },

  /* ------------------------------------------------------------------ */
  /* Produtividade do Armazém                                            */
  /* ------------------------------------------------------------------ */
  {
    slug: "lancar-reepack",
    titulo: "Lançar Reepack (seleção ou repack)",
    emoji: "📦",
    categoria: "armazem",
    resumo: "Marcar o tempo da Seleção e Triagem ou da Reembalagem e informar quanto foi feito.",
    exige: doArmazem("pa-reepack"),
    palavras: ["repack", "reembalagem", "seleção", "selecao", "triagem", "shrink", "caixas", "cronômetro", "cronometro"],
    passos: [
      noArmazem("Reepack"),
      { texto: "Na aba **Lançar**, escolha a atividade: **Seleção e Triagem** ou **Reembalagem (Repack)**." },
      {
        texto: "Em **Produto**, digite o código ou a descrição e escolha o produto da lista.",
        dica: "Os filtros Cluster Produto e Tipo ajudam a achar mais rápido.",
      },
      { texto: "Marque o seu **Turno** e toque em **▶️ Iniciar** (seleção ou repack) na hora em que começar o trabalho." },
      CRONOMETRO_ABERTO,
      {
        texto: "Ao terminar, informe quantas fez — **unidades triadas** na seleção, **caixas reembaladas** no repack — e toque em **Finalizar**.",
        dica: "O litro e a taxa por hora saem sozinhos.",
      },
    ],
    atencao: [
      "Na dúvida sobre o que entra no tempo, abra **ℹ️ Quando começar e quando parar o cronômetro**, na própria tela.",
      "Repack é na hora em que o Shrink termina de encolher: o pacote pronto e finalizado.",
      COMECEI_POR_ENGANO,
      "Não aparece o produto? Ele ainda não foi cadastrado. Peça à liderança.",
    ],
    tela: { href: "/produtividade-armazem/reepack", rotulo: "Abrir Reepack" },
    relacionados: ["lancar-despejo", "cadastrar-produto-armazem"],
  },
  {
    slug: "lancar-despejo",
    titulo: "Lançar Despejo",
    emoji: "🫗",
    categoria: "armazem",
    resumo: "Marcar o tempo do despejo e informar quantas unidades foram despejadas.",
    exige: doArmazem("pa-despejo"),
    palavras: ["despejo", "embalagem", "litros", "bombona", "cronômetro", "cronometro"],
    passos: [
      noArmazem("Despejo"),
      { texto: "Na aba **Lançar**, escolha a **Embalagem**." },
      { texto: "Marque o seu **Turno** e toque em **▶️ Iniciar despejo** na hora em que começar." },
      CRONOMETRO_ABERTO,
      {
        texto: "Ao terminar, preencha **Quantas unidades você despejou?** e toque em **Finalizar despejo**.",
        dica: "O litro é calculado sozinho, pelo litro por unidade da embalagem.",
      },
    ],
    atencao: [COMECEI_POR_ENGANO, "Não aparece a embalagem? Ela ainda não foi cadastrada. Peça à liderança."],
    tela: { href: "/produtividade-armazem/despejo", rotulo: "Abrir Despejo" },
    relacionados: ["lancar-reepack"],
  },
  {
    slug: "operar-empilhadeira",
    titulo: "Abrir e encerrar a operação da empilhadeira",
    emoji: "🏗️",
    categoria: "armazem",
    resumo: "Registrar o horímetro com foto no começo e no fim do uso da máquina.",
    exige: doArmazem("pa-empilhadeira"),
    palavras: ["empilhadeira", "horímetro", "horimetro", "máquina", "maquina", "turno", "operador"],
    passos: [
      noArmazem("Empilhadeira"),
      { texto: "Toque na máquina que você vai usar (as livres aparecem como **Livre**)." },
      {
        texto: "Na aba **🕐 Operação**, tire a **Foto do horímetro inicial** e digite o **Horímetro inicial**.",
        dica: "A foto é obrigatória: ela é a prova da leitura.",
      },
      { texto: "Toque em **▶️ Abrir operação**." },
      { texto: "No fim do uso, abra a mesma máquina, tire a **Foto do horímetro final**, digite o **Horímetro final** e toque em **Encerrar minha operação**." },
    ],
    atencao: [
      "A máquina está aberta no nome de outra pessoa que já foi embora? Preencha o horímetro final e toque em **Fechar operação de (nome)** antes de abrir a sua.",
      "O app avisa se o horímetro digitado for menor que a última leitura ou alto demais. Confira o número antes de salvar.",
    ],
    tela: { href: "/produtividade-armazem/empilhadeira", rotulo: "Abrir Empilhadeira" },
    relacionados: ["trocar-gas-empilhadeira"],
  },
  {
    slug: "trocar-gas-empilhadeira",
    titulo: "Registrar troca de gás da empilhadeira",
    emoji: "🛢️",
    categoria: "armazem",
    resumo: "Lançar a troca do botijão P20 com o horímetro e o estoque de botijões.",
    exige: doArmazem("pa-empilhadeira"),
    palavras: ["gás", "gas", "botijão", "botijao", "p20", "consumo"],
    passos: [
      noArmazem("Empilhadeira"),
      { texto: "Toque na máquina em que você trocou o botijão." },
      { texto: "Abra a aba **🛢️ Troca de Gás**." },
      { texto: "Tire a **Foto do horímetro** e digite o **Horímetro no momento da troca**." },
      { texto: "Em **Botijões P20 no estoque**, informe quantos ficaram **🟢 Cheios** e **⚪ Vazios**." },
      { texto: "Toque em **🛢️ Registrar troca de gás**." },
    ],
    atencao: [
      "Troca esquecida deixa o consumo errado: um botijão parece durar o dobro. Registre na hora da troca.",
      "O consumo por máquina aparece em **Consumo de gás P20**, na tela das empilhadeiras.",
    ],
    tela: { href: "/produtividade-armazem/empilhadeira", rotulo: "Abrir Empilhadeira" },
    relacionados: ["operar-empilhadeira"],
  },
  {
    slug: "pedir-abastecimento",
    titulo: "Pedir produto para o picking",
    emoji: "📥",
    categoria: "armazem",
    resumo: "Avisar a empilhadeira do que precisa descer do estoque para o picking.",
    exige: doArmazem("pa-picking"),
    palavras: ["pedido", "solicitar", "ressuprimento", "picking", "reabastecer", "faltando", "zerou"],
    passos: [
      noArmazem("Abastecimento do Picking"),
      { texto: "Toque em **➕ Pedir produto para o picking**." },
      {
        texto: "Escolha o tipo: **💯 Completo** (o abastecimento do turno) ou **⚡ Pontual** (um item que zerou no meio da separação).",
      },
      { texto: "Escolha o produto, a **Unidade** e a **Quantidade** e toque em **➕ Adicionar ao pedido**. Repita para cada produto." },
      {
        texto: "Confira o **Turno**, a **Prioridade** e, se ajudar, diga em **Onde está / observação** onde o produto fica.",
        dica: "Exemplo: \"corredor 3, posição do fundo\".",
      },
      { texto: "Toque em **📤 Enviar pedido**. A empilhadeira passa a ver o pedido na hora." },
    ],
    atencao: [
      "Pediu errado? Abra o pedido e use **Cancelar ou excluir este pedido**: cancelar guarda o motivo; excluir apaga de vez.",
    ],
    tela: { href: "/produtividade-armazem/abastecimento", rotulo: "Abrir Abastecimento do Picking" },
    relacionados: ["buscar-pedido-picking", "abastecer-picking"],
  },
  {
    slug: "buscar-pedido-picking",
    titulo: "Buscar um pedido no estoque (empilhadeira)",
    emoji: "🏗️",
    categoria: "armazem",
    resumo: "Pegar o pedido do picking, trazer do estoque e deixar na área.",
    exige: doArmazem("pa-empilhadeira"),
    palavras: ["empilhador", "transporte", "pedido", "estoque", "ressuprimento", "buscar"],
    passos: [
      noArmazem("Abastecimento do Picking"),
      { texto: "Abra o pedido que está **⏳ Esperando uma empilhadeira pegar**. Os pedidos com **🔴 Urgente** pedem pressa." },
      { texto: "Toque em **🏗️ Vou buscar este pedido no estoque**." },
      {
        texto: "Deixou tudo na área? Toque em **🏁 Terminei — deixei tudo na área**.",
        dica: "Veio em mais de uma viagem? Use **Vim em mais de uma viagem — marcar item por item** e toque em **Deixei este** em cada produto.",
      },
    ],
    atencao: [
      "Não tem o produto no estoque? Toque no **✏️** do item e use **🗑️ Não tem no estoque — tirar**.",
      "Chegou quantidade diferente da pedida? No **✏️** do item, use **Corrigir a quantidade**.",
    ],
    tela: { href: "/produtividade-armazem/abastecimento", rotulo: "Abrir Abastecimento do Picking" },
    relacionados: ["pedir-abastecimento", "abastecer-picking"],
  },
  {
    slug: "abastecer-picking",
    titulo: "Abastecer o picking",
    emoji: "📥",
    categoria: "armazem",
    resumo: "Levar o produto da área para o picking e finalizar o abastecimento.",
    exige: doArmazem("pa-picking"),
    palavras: ["ajudante", "picking", "abastecimento", "hl", "pedido"],
    passos: [
      noArmazem("Abastecimento do Picking"),
      { texto: "Abra o pedido que está **📌 Na área, esperando alguém levar ao picking**." },
      { texto: "Toque em **📥 Levar para o picking**. O cronômetro começa e os produtos do pedido já vêm lançados." },
      {
        texto: "Abasteça. Se algum produto não coube ou não foi levado, toque em **Remover** nele.",
        dica: "Só o que foi pedido pode ser abastecido aqui.",
      },
      { texto: "Toque em **⏹️ Finalizar abastecimento**. O HL sai sozinho." },
    ],
    atencao: [
      "Precisou abastecer algo que ninguém pediu? Use **▶️ Abastecer sem pedido**: escolha o tipo, o turno, inicie, lance os produtos em **Acrescentar produto** e finalize.",
      "Com um abastecimento aberto não dá para começar outro. Finalize o que está aberto primeiro.",
      COMECEI_POR_ENGANO,
    ],
    tela: { href: "/produtividade-armazem/abastecimento", rotulo: "Abrir Abastecimento do Picking" },
    relacionados: ["pedir-abastecimento", "buscar-pedido-picking"],
  },
  {
    slug: "lancar-bate-palete",
    titulo: "Lançar Bate Palete",
    emoji: "🤲📦",
    categoria: "armazem",
    resumo: "Registrar o que foi batido e quanto disso estava avariado.",
    exige: doArmazem("pa-bate-palete"),
    palavras: ["bate palete", "avaria", "avariado", "palete", "fábrica", "fabrica"],
    passos: [
      noArmazem("Bate Palete"),
      { texto: "Marque o seu **Turno** e toque em **▶️ Iniciar bate palete** ao puxar o primeiro palete." },
      {
        texto: "Em **Registrar o que foi batido**, escolha o produto, informe os **Paletes batidos** e, em **Dessa batida, quanto saiu avariado**, a quantidade avariada.",
        dica: "Meio palete é 0,5.",
      },
      { texto: "Toque em **➕ Registrar lote**. Repita para cada produto batido." },
      { texto: "Quando o último palete estiver pronto, toque em **⏹️ Finalizar bate palete**." },
    ],
    atencao: [
      "Inspecionar unidade por unidade, lavar, secar e reembalar não é bate palete: é **Seleção e Triagem**, no Reepack.",
      "Começou por engano? Use **Cancelar sem registrar**.",
    ],
    tela: { href: "/produtividade-armazem/bate-palete", rotulo: "Abrir Bate Palete" },
    relacionados: ["lancar-reepack"],
  },
  {
    slug: "executar-5s-armazem",
    titulo: "Registrar a execução do 5S do armazém",
    emoji: "🧹",
    categoria: "armazem",
    resumo: "Marcar o início, o checklist e o fim da limpeza e organização do armazém.",
    exige: doArmazem("pa-cinco-s"),
    palavras: ["5s", "limpeza", "organização", "organizacao", "checklist", "execução", "execucao"],
    passos: [
      noArmazem("5S do Armazém"),
      { texto: "Toque em **🧹 Iniciar execução do 5S** quando começar." },
      { texto: "Marque os itens do **Checklist 5S** conforme for fazendo." },
      { texto: "Se quiser, escreva em **Observações** e toque em **Encerrar execução**." },
    ],
    atencao: [
      "Saiu da tela no meio? A execução fica em andamento: toque em **Continuar →** para voltar a ela.",
      "Esta é a execução do dia a dia. A auditoria do Programa 5S é outra coisa, feita pelos auditores.",
    ],
    tela: { href: "/produtividade-armazem/cinco-s", rotulo: "Abrir 5S do Armazém" },
    relacionados: ["fazer-auditoria-5s"],
  },
  {
    slug: "informar-quebra-fefo",
    titulo: "Informar uma quebra de FEFO",
    emoji: "📆",
    categoria: "armazem",
    resumo: "Avisar o controle quando achar produto fora da ordem de validade.",
    exige: [["fefo", "ver"]],
    palavras: ["fefo", "validade", "vencimento", "quebra", "palete", "rua", "bloqueio"],
    passos: [
      noArmazem("Quebra de FEFO"),
      { texto: "Na aba **Informar**, em **O que você encontrou?**, toque no motivo." },
      { texto: "Em **📦 Produto**, digite o código ou a descrição e escolha. Informe a **Quantidade** e a **Unidade**." },
      {
        texto: "Em **📅 Validades**, preencha a **Validade do palete encontrado**.",
        dica: "Sabe a menor validade que existe no estoque? Preencha. Não sabe? Deixe em branco: o controle completa depois.",
      },
      { texto: "Em **📍 Onde está**, escolha o **Depósito** e a **Rua**. Se ajudar, descreva o **Ponto exato**." },
      { texto: "Bloqueou a rua? Marque **🔒 A rua foi bloqueada**." },
      {
        texto: "Se quiser, tire uma **Foto** e escreva uma **Observação**. Toque em **📆 Informar quebra de FEFO**.",
        dica: "O controle recebe na hora. O que você informou aparece em **O que eu informei**.",
      },
    ],
    atencao: [
      "Validade em vermelho é validade crítica, perto de vencer. Avise a liderança também.",
      "Não aparece o motivo, o depósito ou a rua? Eles ainda não foram cadastrados. Peça à liderança.",
    ],
    tela: { href: "/fefo", rotulo: "Abrir Quebra de FEFO" },
    relacionados: ["tratar-quebra-fefo"],
  },
  {
    slug: "tratar-quebra-fefo",
    titulo: "Tratar uma quebra de FEFO (controle)",
    emoji: "📆",
    categoria: "armazem",
    resumo: "Registrar a ação tomada numa quebra informada e encerrar.",
    exige: [["fefo-controle", "ver"]],
    palavras: ["fefo", "controle", "tratativa", "validade", "bloqueio", "encerrar"],
    passos: [
      noArmazem("Quebra de FEFO"),
      {
        texto: "Abra a aba **Controle**. O número ao lado mostra quantas estão em aberto.",
      },
      { texto: "Em **Aguardando tratativa**, encontre a quebra. As mais antigas e as de validade crítica pedem pressa." },
      {
        texto: "Se souber, preencha a **Menor validade no estoque**.",
      },
      {
        texto: "Em **Qual ação foi tomada?**, descreva o que foi feito e toque em **Registrar ação e encerrar**.",
        dica: "Exemplo: \"palete bloqueado no físico e no sistema, produto priorizado para saída\".",
      },
    ],
    atencao: ["As encerradas ficam em **Já tratadas**, com a ação registrada."],
    tela: { href: "/fefo?aba=controle", rotulo: "Abrir o Controle de FEFO" },
    relacionados: ["informar-quebra-fefo"],
  },
  {
    slug: "fazer-check-manutencao",
    titulo: "Fazer o Check de Manutenção do trimestre",
    emoji: "🛠️",
    categoria: "armazem",
    resumo: "Para o time da manutenção: avaliar os 36 itens do checklist da Ambev, com fotos, uma vez por trimestre.",
    exige: [["manutencao", "ver"]],
    palavras: ["manutenção", "manutencao", "checklist", "dpo", "2.2", "instalações", "instalacoes", "trimestre", "auditoria", "predial"],
    passos: [
      {
        texto: "Na tela inicial, toque em **Check de Manutenção**.",
        dica: "Não aparece o cartão? O módulo é só do time da manutenção e precisa ser liberado pelo Admin.",
      },
      {
        texto: "No cartão **Trimestre atual**, toque em **▶️ Iniciar a avaliação** (ou em **Continuar a avaliação →** se ela já começou).",
        dica: "É uma avaliação por trimestre. Dá para fazer em mais de um dia: tudo o que você toca já fica salvo.",
      },
      {
        texto: "Em cada item, leia **🔎 Como verificar** e toque na nota: **3**, **1**, **0** ou **N/A** (não se aplica).",
        dica: "Não tem botão de salvar: o toque na nota já salva. O cartão mostra **✓ Salvo** e o topo conta, por exemplo, **5 de 36 respondidas**.",
      },
      {
        texto: "Toque no quadradinho **📷 Foto** para abrir a câmera dentro do app e tire até 4 fotos.",
        dica: "A câmera abre no próprio app, sem sair da tela: o celular com pouca memória não perde o que já foi feito. Cada foto sobe na hora, já reduzida. Compare com a foto do trimestre anterior, que aparece no item.",
      },
      {
        texto: "Nota **1** ou **0**? Preencha o **🗒️ Plano de ação**: o que vai ser feito, o **Responsável** e o **Prazo**.",
        dica: "Salva sozinho quando você para de digitar. Item crítico já vem com prazo de 30 dias.",
      },
      {
        texto: "Precisa anotar algo? Toque em **＋ Observação**. Ela fica escondida até você abrir.",
      },
      {
        texto: "Use os filtros do topo — **Faltam** e **Abaixo de 3** — para achar o que falta.",
      },
      { texto: "Com os 36 itens respondidos, desça até **Terminou a ronda?** e toque em **✅ Fechar o checklist**." },
    ],
    atencao: [
      "O checklist só fecha com todos os itens respondidos e com o plano de ação completo nos itens abaixo de 3.",
      "Depois de fechada, a avaliação fica travada. Para corrigir, a liderança com permissão toca em **↩️ Reabrir para correção**.",
      "Para mostrar a evolução à auditoria: no painel, a tabela **📈 Evolução por seção** compara os trimestres; em cada item, **📈 Evolução** mostra todas as fotos, trimestre a trimestre.",
      "Trimestre que passou sem avaliação aparece em vermelho no painel: o DPO cobra no mínimo uma por trimestre.",
    ],
    tela: { href: "/manutencao", rotulo: "Abrir o Check de Manutenção" },
    relacionados: ["atualizar-fornecedores", "revisar-raci-manutencao"],
  },
  {
    slug: "abrir-chamado-manutencao",
    titulo: "Abrir um chamado para manutenção",
    emoji: "🔧",
    categoria: "primeiros-passos",
    resumo: "Lâmpada queimada, vazamento, porta emperrada: peça o conserto pelo app ou pelo QR Code da área.",
    palavras: ["manutenção", "manutencao", "chamado", "os", "ordem de serviço", "conserto", "quebrado", "vazamento", "qr", "forms"],
    passos: [
      {
        texto: "Na tela inicial, toque em **Chamado para Manutenção** (ou aponte a câmera para o QR Code do cartaz de manutenção).",
        dica: "Pelo QR não precisa de login: serve para quem não tem o app.",
      },
      { texto: "Em **1 · Onde é o problema?**, escolha a área." },
      { texto: "Em **2 · Que tipo de serviço?**, toque no desenho: Alvenaria, Elétrica, Hidráulica, Jardinagem, Limpeza, Mobiliário ou Outros." },
      {
        texto: "Em **3 · Descreva o problema**, conte o que é e onde exatamente. Se puder, toque em **Foto**.",
        dica: "Prefere falar? Toque no microfone do teclado do celular e dite.",
      },
      {
        texto: "Em **4 · Qual a urgência?**, deixe **Normal** ou marque **Urgente** ou **Risco à segurança**.",
        dica: "Risco à segurança é quando alguém pode se machucar ou a operação pode parar. Isole o local e avise a sua liderança também.",
      },
      { texto: "Confira o telefone e toque em **🔧 Abrir chamado**. Anote o número que aparece (ex.: **#0042**)." },
    ],
    atencao: [
      "O andamento chega no sino: quando alguém assumir, pausar ou concluir.",
      "Quando a manutenção concluir, responda **Resolveu?**. Se disser **Não resolveu**, o chamado volta para a fila.",
      "Abriu pelo QR sem login? Guarde o link que aparece depois de enviar: é por ele que você acompanha.",
    ],
    tela: { href: "/chamados", rotulo: "Abrir um chamado" },
    relacionados: ["atender-chamado-manutencao"],
  },
  {
    slug: "atender-chamado-manutencao",
    titulo: "Atender os chamados para manutenção",
    emoji: "🔧",
    categoria: "armazem",
    resumo: "Para o time da manutenção: a fila, assumir, pausar por material e concluir com foto.",
    exige: [["chamados-atender", "ver"]],
    palavras: ["manutenção", "manutencao", "chamado", "fila", "os", "ordem de serviço", "atender", "concluir"],
    passos: [
      {
        texto: "Na tela inicial, toque em **Chamado para Manutenção**. Você cai na aba **Fila**.",
        dica: "Chamado novo também chega no sino e no celular. Risco à segurança chega como importante.",
      },
      { texto: "Os **⏰ Atrasados** ficam no topo; dentro de cada grupo, risco e urgente vêm primeiro. Toque no chamado." },
      { texto: "Toque em **🙋 Assumir o chamado**. Quem pediu é avisado de que você está cuidando." },
      {
        texto: "Faltou peça ou depende de terceiro? Abra **⏸️ Pausar: aguardando material ou terceiro** e diga o que falta.",
        dica: "O prazo continua contando. Para voltar, toque em **▶️ Retomar o atendimento**.",
      },
      {
        texto: "Terminou? Em **✅ Concluir o serviço**, escreva o que foi feito, tire a foto do serviço pronto e toque em **✅ Concluir e avisar quem pediu**.",
      },
    ],
    atencao: [
      "Quem pediu confirma se resolveu. Se disser que não, o chamado volta para a fila como **reaberto** — e conta no painel.",
      "Precisa falar com quem pediu? No chamado tem o telefone e o botão do WhatsApp. Recados ficam no **Andamento**.",
      "Chamado repetido ou que não procede: **✖️ Cancelar**, com o motivo. Quem pediu recebe o motivo.",
    ],
    tela: { href: "/chamados?aba=fila", rotulo: "Abrir a fila" },
    relacionados: ["abrir-chamado-manutencao", "configurar-chamados-qr"],
  },
  {
    slug: "configurar-chamados-qr",
    titulo: "Imprimir o QR Code e cadastrar as áreas dos chamados",
    emoji: "🔧",
    categoria: "armazem",
    resumo: "O cartaz do QR Code (um só para a unidade), as áreas da lista e o prazo de cada prioridade.",
    exige: [["chamados", "editar"]],
    palavras: ["qr", "qrcode", "cartaz", "imprimir", "área", "area", "prazo", "sla", "chamado", "manutenção"],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("Configuração", "Chamados para Manutenção"),
      {
        texto: "Em **O QR Code da unidade**, toque em **🖨️ Imprimir o cartaz** e depois em **⬇️ Baixar em PDF**.",
        dica: "É um QR só para a unidade inteira. Imprima quantas cópias quiser e cole onde a equipe circula.",
      },
      {
        texto: "Em **📍 Áreas**, toque em **＋ Nova área** para incluir, ou toque numa área e em **Editar** para mudar nome, grupo e ordem.",
        dica: "Área que não existe mais: **⏻ Desligar**. Ela sai da lista do formulário, sem apagar o histórico.",
      },
      { texto: "Em **⏱️ Prazo de atendimento**, ajuste as horas de **Risco**, **Urgente** e **Normal** e toque em **Salvar**." },
    ],
    atencao: [
      "Imprima pelo app publicado: o QR leva o endereço de onde você está.",
      "O QR vazou para fora da empresa? **🔄 Gerar QR novo** invalida o antigo — e aí é preciso trocar todos os cartazes.",
      "O painel com prazo, reabertos e nota fica na **Gestão**, em **Chamados para Manutenção**.",
    ],
    tela: { href: "/admin/chamados", rotulo: "Abrir o cadastro dos chamados" },
    relacionados: ["atender-chamado-manutencao"],
  },
  {
    slug: "consultar-fornecedores",
    titulo: "Achar o contato de um fornecedor",
    emoji: "☎️",
    categoria: "primeiros-passos",
    resumo: "Ar-condicionado parou, faltou energia, precisa de pousada na rota: o telefone certo, com um toque.",
    palavras: ["fornecedor", "fornecedores", "contato", "telefone", "whatsapp", "manutenção", "emergência", "pousada", "hotel", "coelba", "embasa"],
    passos: [
      { texto: "Na tela inicial, em **Da empresa**, toque em **Fornecedores**." },
      {
        texto: "Digite na busca o que precisa: o serviço (**ar-condicionado**, **energia**), o nome ou a cidade.",
        dica: "Não precisa de acento, e dá para juntar palavras: \"ar barreiras\".",
      },
      { texto: "Ou toque numa categoria: **Manutenção e serviços**, **Segurança e emergência** ou **Apoio na rota**." },
      {
        texto: "No cartão, toque em **📞** para ligar ou em **WhatsApp** para mandar mensagem.",
        dica: "O WhatsApp só aparece para número de celular. Polícia, SAMU e Bombeiros ligam direto.",
      },
    ],
    atencao: [
      "Achou um número errado ou faltando? Avise o time da manutenção: é ele quem atualiza a base.",
      "Emergência com risco de vida: ligue **192** (SAMU) ou **193** (Bombeiros) antes de qualquer outra coisa.",
    ],
    tela: { href: "/fornecedores", rotulo: "Abrir os Fornecedores" },
  },
  {
    slug: "atualizar-fornecedores",
    titulo: "Incluir fornecedor e revisar o ANS",
    emoji: "☎️",
    categoria: "armazem",
    resumo: "Para o time da manutenção: manter a base de contatos em dia, com ANS e custo, e registrar quando o serviço não foi adequado.",
    exige: [["manutencao", "ver"]],
    palavras: ["fornecedor", "ans", "sla", "custo", "contato", "dpo", "2.2", "v.3", "v.4", "serviço ruim"],
    passos: [
      { texto: "Abra **Fornecedores** (na tela inicial ou pelo cartão **V.3** do Check de Manutenção)." },
      {
        texto: "Para um contato novo, toque em **➕ Incluir fornecedor**, preencha e toque em **Incluir na base**.",
        dica: "Nome, tipo de serviço e telefone são obrigatórios. ANS é o prazo combinado (\"atende em até 24 h\").",
      },
      {
        texto: "Para corrigir um contato, toque em **✏️ Editar** no cartão dele e em **Salvar**.",
      },
      {
        texto: "Fornecedor que atende item crítico (cobertura, elétrica, água): marque **Atende item crítico** e preencha o **ANS**.",
        dica: "Crítico sem ANS aparece em **⚠️ Pendências** até ser preenchido.",
      },
      {
        texto: "O serviço não foi adequado? Toque em **👎 O serviço não foi adequado**, conte o que houve e toque em **Marcar ANS para revisar**.",
      },
      {
        texto: "Depois de conversar com o fornecedor, toque em **🤝 Revisei o ANS com o fornecedor**, escreva o ANS combinado e registre.",
        dica: "A data da revisão fica no cartão: é o que a auditoria do DPO 2.2 (V.4) pede para ver.",
      },
    ],
    tela: { href: "/fornecedores", rotulo: "Abrir os Fornecedores" },
    relacionados: ["revisar-raci-manutencao", "consultar-fornecedores"],
  },
  {
    slug: "revisar-raci-manutencao",
    titulo: "Revisar a RACI da manutenção",
    emoji: "🧭",
    categoria: "armazem",
    resumo: "Quem executa, quem aprova, quem é consultado e quem é informado em cada atividade de manutenção, entre as áreas e os fornecedores.",
    exige: [["manutencao", "ver"]],
    palavras: ["raci", "matriz", "responsável", "aprovador", "fornecedor", "dpo", "2.2", "v.4", "vigente"],
    passos: [
      { texto: "No **Check de Manutenção**, toque no cartão **V.4 · RACI com fornecedores**." },
      {
        texto: "Toque na célula para trocar a letra: **–** → **R** → **A** → **C** → **I** → **–**. Salva sozinho.",
        dica: "R = executa · A = responde pelo resultado · C = opina antes · I = fica sabendo depois.",
      },
      {
        texto: "Cada atividade precisa de **um único A** e de **pelo menos um R**. A que não tem fica em vermelho.",
      },
      {
        texto: "Falta uma atividade ou uma área? Use **➕ Incluir atividade** ou **➕ Incluir área ou fornecedor**, no fim da matriz.",
        dica: "Marque **Rotina de item crítico** nas atividades de pane, energia, cobertura e incêndio.",
      },
      {
        texto: "Com a matriz conferida com o time e os fornecedores, toque em **✅ Revisamos a RACI hoje**.",
        dica: "A revisão vale 90 dias: refaça junto com o Check de Manutenção de cada trimestre.",
      },
    ],
    atencao: [
      "A matriz começa como sugestão. Ela só aparece como **vigente** depois da primeira revisão registrada.",
      "Com alguma atividade em vermelho, o app não deixa registrar a revisão: acerte as letras antes.",
    ],
    tela: { href: "/manutencao/raci", rotulo: "Abrir a RACI" },
    relacionados: ["atualizar-fornecedores", "fazer-check-manutencao"],
  },
  {
    slug: "cadastrar-produto-armazem",
    titulo: "Cadastrar produto do armazém",
    emoji: "🏭",
    categoria: "armazem",
    resumo: "Incluir um produto para aparecer no Reepack, Despejo, Abastecimento e FEFO.",
    exige: [["produtividade-armazem", "editar"]],
    palavras: ["produto", "sku", "promax", "fator hecto", "meta", "cadastro", "catálogo", "catalogo"],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("⚙️ Configuração", "🏭 Produtividade do Armazém"),
      { texto: "Na aba **📦 Produtos**, no **Cadastro de produtos**, toque em **Cadastrar um produto**." },
      {
        texto: "Preencha **Código Promax**, **Descrição**, **Fator Hecto (HL/caixa)** e **Embalagem do Repack** (obrigatórios).",
        dica: "Se o código já existir, o cadastro é atualizado — nunca duplicado.",
      },
      {
        texto: "Se tiver, preencha **Unidades por caixa**, **Caixas por pallet**, **Caixas por lastro**, **Cluster**, **Tipo** e as metas de repack (cx/h) e despejo (L/h).",
        dica: "Sem as metas, o lançamento não mostra se a pessoa ficou acima ou abaixo do esperado.",
      },
      { texto: "Toque em **Salvar produto**." },
    ],
    atencao: [
      "Muitos produtos de uma vez? Use **📑 Importar a base (planilha .xlsx)**: baixe a planilha atual, edite e importe de volta.",
      "As empilhadeiras são cadastradas na aba **🏗️ Empilhadeiras**, na mesma tela.",
    ],
    tela: { href: "/admin/produtividade-armazem", rotulo: "Abrir a configuração do Armazém" },
    relacionados: ["lancar-reepack", "lancar-despejo"],
  },

  /* ------------------------------------------------------------------ */
  /* Ativo de Giro                                                       */
  /* ------------------------------------------------------------------ */
  {
    slug: "contar-ativo-giro",
    titulo: "Lançar a contagem do Ativo de Giro",
    emoji: "🔄",
    categoria: "ativo-giro",
    resumo: "Registrar o que foi contado no pátio, combinação por combinação.",
    exige: [["ativo-giro", "ver"]],
    palavras: ["ativo de giro", "ag", "contagem", "kit", "gfe", "garrafeira", "palete", "lastro", "caixas", "600ml", "300ml"],
    passos: [
      {
        texto: "Na tela inicial, toque em **Ativo de Giro**.",
        dica: "Não aparece o cartão? O módulo ainda não foi liberado para você. Fale com a sua liderança.",
      },
      { texto: "Na aba **Contagem**, confira a **Data** (vem com o dia de hoje)." },
      {
        texto: "Escolha o **Tipo** (Kit AG ou GFE sem Garrafa), o **Formato** (600ml, 300ml, 1000ml ou Verde) e o **Status** (Cheio, Vazio, Trânsito Rota ou Trânsito Fábrica).",
      },
      {
        texto: "Informe quantos **Paletes**, **Lastros** e **Caixas** contou e toque em **Registrar contagem**.",
        dica: "O app converte tudo em caixas sozinho, pelo fator de cada formato.",
      },
      { texto: "Repita para cada combinação que existir no pátio. Cada uma vira uma linha em **Minhas contagens**." },
    ],
    atencao: [
      "Errou um número? Em **Minhas contagens**, toque em **✏️ Editar** na linha. Lançou em dobro? Use **🗑️ Excluir**.",
      "Ficou sem sinal? A contagem aparece em vermelho com **Reenviar**: toque quando a conexão voltar, nada se perde.",
      "Para mandar o resumo para a liderança, use **Compartilhar contagem de hoje**.",
    ],
    tela: { href: "/ativo-de-giro", rotulo: "Abrir Ativo de Giro" },
    relacionados: ["recontar-ativo-giro"],
  },
  {
    slug: "recontar-ativo-giro",
    titulo: "Fazer uma recontagem pedida",
    emoji: "🔄",
    categoria: "ativo-giro",
    resumo: "Quando a liderança pede para contar de novo um item que deu diferença.",
    exige: [["ativo-giro", "ver"]],
    palavras: ["recontagem", "recontar", "diferença", "diferenca", "ativo de giro"],
    passos: [
      { texto: "Na tela inicial, toque em **Ativo de Giro** e fique na aba **Contagem**." },
      { texto: "No cartão **🔁 Recontagem pedida**, leia o que precisa ser recontado." },
      {
        texto: "Vai fazer? Toque em **✔️ Aceitar e recontar**. Não é com você? Toque em **✖️ Recusar**.",
      },
      {
        texto: "Aceitou: o formulário abaixo já vem com o dia da recontagem. Conte de novo, preencha e toque em **Registrar contagem**.",
        dica: "A contagem nova substitui a antiga daquele item, e a linha aparece marcada com 🔁 recontagem.",
      },
    ],
    tela: { href: "/ativo-de-giro", rotulo: "Abrir Ativo de Giro" },
    relacionados: ["contar-ativo-giro", "pedir-recontagem-ativo-giro"],
  },
  {
    slug: "conciliar-ativo-giro",
    titulo: "Conciliar e congelar o dia do Ativo de Giro",
    emoji: "🔄",
    categoria: "ativo-giro",
    resumo: "Comparar o contado com o parque, justificar as diferenças e fechar o dia oficial.",
    exige: [["ativo-giro", "editar"]],
    palavras: ["conciliação", "conciliacao", "congelar", "parque", "diferença", "diferenca", "justificativa", "trânsito", "transito", "comodato", "bi"],
    passos: [
      { texto: "Na tela inicial, toque em **Ativo de Giro** e abra a aba **Concil.** (Conciliação)" },
      { texto: "Escolha o **Dia** e de quem é a contagem em **Colaborador** e toque em **Ver**." },
      {
        texto: "Em **🚚 Trânsito**, lance o que não estava no pátio: na coluna **Rota** (saiu na entrega) e na **Carreta** (entre unidades). Toque em **Salvar o trânsito**.",
        dica: "Sem isso, o que estava fora aparece como falta na conciliação.",
      },
      {
        texto: "Confira o **🤝 Comodato** (o emprestado ao cliente). Ele vale até alguém mudar; se mudou, ajuste e toque em **Salvar o comodato**.",
      },
      {
        texto: "Na tabela, confira a diferença de cada item. Escreva a **Justificativa** das que ficaram fora e toque em **Salvar justificativas**.",
      },
      {
        texto: "Tudo certo? Toque em **🧊 Congelar a conciliação** e confirme.",
        dica: "O dia congelado vira o oficial e vai para o BI. Depois disso, só o Admin reabre.",
      },
    ],
    atencao: [
      "Diferença grande num item? Antes de congelar, peça uma recontagem.",
      "Os status **Trânsito Rota** e **Trânsito Fábrica** da contagem são contados no pátio. O trânsito desta tela é o que NÃO estava lá para ser contado.",
    ],
    tela: { href: "/ativo-de-giro?aba=conciliacao", rotulo: "Abrir a Conciliação" },
    relacionados: ["pedir-recontagem-ativo-giro"],
  },
  {
    slug: "pedir-recontagem-ativo-giro",
    titulo: "Pedir uma recontagem do Ativo de Giro",
    emoji: "🔄",
    categoria: "ativo-giro",
    resumo: "Avisar quem contou que um item precisa ser contado de novo.",
    exige: [["ativo-giro", "editar"]],
    palavras: ["recontagem", "pedir", "diferença", "diferenca", "ativo de giro"],
    passos: [
      { texto: "Na tela inicial, toque em **Ativo de Giro** e abra a aba **Concil.** (Conciliação)" },
      { texto: "Desça até **Pedir recontagem**." },
      { texto: "Escolha o dia e escreva em **O que precisa ser recontado** o item e o motivo." },
      {
        texto: "Toque em **Solicitar**.",
        dica: "O aviso vai só para quem contou naquele dia, nesta revenda. Os pedidos em aberto ficam em **Pendentes**.",
      },
    ],
    tela: { href: "/ativo-de-giro?aba=conciliacao", rotulo: "Abrir a Conciliação" },
    relacionados: ["conciliar-ativo-giro", "recontar-ativo-giro"],
  },

  /* ------------------------------------------------------------------ */
  /* Programa 5S                                                         */
  /* ------------------------------------------------------------------ */
  {
    slug: "fazer-auditoria-5s",
    titulo: "Fazer uma auditoria 5S",
    emoji: "🧹",
    categoria: "cinco-s",
    resumo: "Para o auditor: responder o checklist de uma área e gerar o plano de ação.",
    exige: [["5s", "ver"]],
    palavras: ["auditoria", "auditor", "checklist", "senso", "nok", "não conformidade", "nao conformidade"],
    antes: ["Ser auditor do Programa 5S e ter uma auditoria agendada para você."],
    passos: [
      { texto: "Na tela inicial, toque em **Programa 5S**." },
      {
        texto: "Em **Para auditar**, toque em **Auditar** na área agendada.",
        dica: "As atrasadas aparecem em vermelho. São 25 itens, uns 10 minutos.",
      },
      { texto: "Responda cada item com **OK**, **NOK** ou **N/A**." },
      {
        texto: "Em todo **NOK**, escreva o que o dono da área precisa fazer — é obrigatório.",
        dica: "Exemplo: \"retirar as caixas do corredor e devolver ao estoque\". O dono lê exatamente este texto no plano de ação.",
      },
      { texto: "Toque em **Próximo** para ir ao senso seguinte. No último, toque em **Revisar e finalizar**." },
      { texto: "Confira a revisão e toque em **Finalizar auditoria**. Cada NOK vira uma ação no plano do dono da área." },
    ],
    atencao: [
      "Saiu no meio? A auditoria fica **▶ Iniciada**: toque em **Continuar** para seguir de onde parou.",
      "Errou uma resposta depois de finalizar? Peça à gestão do 5S: ela reabre a auditoria em **Precisa corrigir esta auditoria?**.",
    ],
    tela: { href: "/5s", rotulo: "Abrir Programa 5S" },
    relacionados: ["tratar-acao-5s", "configurar-5s"],
  },
  {
    slug: "tratar-acao-5s",
    titulo: "Tratar uma ação do 5S",
    emoji: "🧹",
    categoria: "cinco-s",
    resumo: "Para o dono da área: resolver o que a auditoria apontou e mostrar a solução.",
    exige: [["5s", "ver"]],
    palavras: ["ação", "acao", "plano de ação", "plano de acao", "dono da área", "dono da area", "nok", "tratativa"],
    passos: [
      { texto: "Na tela inicial, toque em **Programa 5S**." },
      {
        texto: "Em **Suas ações**, toque na ação (ou em **Ver todas**).",
        dica: "As vencidas aparecem em vermelho, com a data em que venceram.",
      },
      { texto: "Leia **O que foi encontrado** e toque em **Iniciar tratativa** quando começar a resolver." },
      {
        texto: "Resolvido, descreva **O que foi feito**, tire a **Foto da solução** e toque em **Concluir**.",
        dica: "A foto é o que convence quem valida. Sem ela, a ação costuma voltar.",
      },
    ],
    atencao: [
      "Depois de concluída, a ação ainda precisa ser **validada** pela gestão do 5S. Se ela for **devolvida**, volta para você tratar de novo.",
    ],
    tela: { href: "/5s/acoes", rotulo: "Abrir Plano de Ação 5S" },
    relacionados: ["fazer-auditoria-5s", "validar-acao-5s"],
  },
  {
    slug: "validar-acao-5s",
    titulo: "Validar ou devolver uma ação do 5S",
    emoji: "🧹",
    categoria: "cinco-s",
    resumo: "Para a gestão do 5S: conferir o que o dono da área fez e encerrar a ação.",
    exige: [["5s", "editar"]],
    palavras: ["validar", "validação", "validacao", "devolver", "plano de ação", "plano de acao", "concluída", "concluida"],
    passos: [
      { texto: "Na tela inicial, toque em **Programa 5S** e depois em **Ver todas** (em Suas ações)." },
      { texto: "No **Plano de Ação 5S**, toque no número **concluídas** para ver só o que espera validação." },
      { texto: "Abra a ação e confira **O que foi feito** e a foto da solução." },
      {
        texto: "Está resolvido? Toque em **Validar**. Não está? Toque em **Devolver**, com um comentário dizendo o que falta.",
        dica: "Devolvida, a ação volta para o dono da área como em andamento.",
      },
    ],
    tela: { href: "/5s/acoes?status=concluida", rotulo: "Ver ações concluídas" },
    relacionados: ["tratar-acao-5s"],
  },
  {
    slug: "configurar-5s",
    titulo: "Configurar o Programa 5S (áreas, auditores e agenda)",
    emoji: "🧹",
    categoria: "cinco-s",
    resumo: "Cadastrar as áreas e seus donos, habilitar auditores e agendar as auditorias.",
    exige: [
      ["5s", "editar"],
      ["5s", "criar"],
    ],
    palavras: ["área", "area", "dono", "auditor", "agendar", "planejamento", "cronograma", "configurar"],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("⚙️ Configuração", "🧹 Programa 5S"),
      {
        texto: "Aba **Áreas**: toque em **Cadastrar área**, preencha **Nome**, **Dono da área** e **Descrição** e toque em **Cadastrar**.",
        dica: "O dono da área é quem recebe as ações das auditorias.",
      },
      { texto: "Aba **Auditores**: escolha o colaborador e toque em **Habilitar**." },
      {
        texto: "Aba **Planejamento**: abra **Agendar uma auditoria**, escolha **Área**, **Auditor** e **Data prevista** e toque em **Agendar e avisar o auditor**.",
        dica: "Para planejar de uma vez, use **Agendar o mês inteiro** ou **Agendar o ano inteiro**.",
      },
    ],
    atencao: [
      "As perguntas da auditoria ficam na aba **Checklist**.",
      "Quem é auditor ou dono de área já passa a ver o cartão Programa 5S na tela inicial — não precisa liberar à parte.",
    ],
    tela: { href: "/admin/5s", rotulo: "Abrir a configuração do 5S" },
    relacionados: ["fazer-auditoria-5s"],
  },

  /* ------------------------------------------------------------------ */
  /* Pessoas e acessos                                                   */
  /* ------------------------------------------------------------------ */
  {
    slug: "cadastrar-colaborador",
    titulo: "Cadastrar um colaborador",
    emoji: "👥",
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
    emoji: "👥",
    categoria: "pessoas",
    resumo: "Cadastrar ou atualizar várias pessoas de uma vez, pelo Excel.",
    exige: [["colaboradores", "criar"]],
    palavras: ["planilha", "excel", "xlsx", "lote", "vários", "varios", "implantação", "implantacao"],
    antes: ["Confira no topo (🏢) se você está na revenda certa: todos da planilha entram na revenda ativa."],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("👥 Pessoas", "👥 Colaboradores"),
      { texto: "Toque em **📑 Importar planilha de colaboradores**." },
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
    emoji: "👥",
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
    emoji: "👥",
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
    emoji: "👥",
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
    slug: "criar-desafio-do-mes",
    titulo: "Criar o Desafio do Mês",
    emoji: "🧠",
    categoria: "comunicacao",
    resumo: "Montar o quiz do mês de uma área a partir de um padrão, revisar e publicar.",
    exige: [["quiz", "criar"]],
    palavras: ["desafio", "quiz", "perguntas", "padrão", "padrao", "rodada", "campeonato", "ia"],
    passos: [
      ENTRAR_NO_MODO,
      ABRIR_BARRA,
      gaveta("🎯 Engajamento", "🧠 Desafio do Mês"),
      {
        texto: "Antes de criar, olhe o **Histórico** da área (Armazém ou Distribuição): ele mostra o padrão de cada mês.",
        dica: "Assim o mesmo padrão não é cobrado de novo sem querer.",
      },
      { texto: "Toque em **Criar o desafio do mês**." },
      {
        texto: "Passo 1: escolha a área (**Distribuição** ou **Armazém**) e o mês. As datas de abrir e fechar acompanham o mês sozinhas.",
      },
      {
        texto: "Passo 2: escolha o **Pilar** e o **Padrão**.",
        dica: "Os padrões já usados naquela área aparecem com \"já usado em\" e o mês.",
      },
      { texto: "Passo 3: confira o número de **Perguntas** e toque em **Criar e montar as perguntas →**." },
      { texto: "Na tela da rodada, em **✨ Gerar perguntas a partir do padrão**, toque em **Gerar**. Leva de 30 segundos a 2 minutos." },
      {
        texto: "Desça a lista conferindo cada pergunta contra o **📄 Trecho do padrão**. Corrija em **✏️ Editar esta pergunta** ou toque em **✅ Ativa** para desativar.",
        dica: "Salvar não tira você do lugar: o aviso de salvo ou de erro aparece no rodapé.",
      },
      { texto: "No fim da lista, em **Conferiu tudo?**, toque em **🚀 Publicar para o time**." },
    ],
    atencao: [
      "Só publica com o número exato de perguntas configurado. Faltou? Gere mais ou ajuste em **✏️ Editar dados da rodada**.",
      "Depois de publicada, as perguntas ficam travadas para não mudar o desafio de quem já respondeu.",
    ],
    tela: { href: "/admin/quiz", rotulo: "Abrir o Desafio do Mês" },
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
