// Layout do relatorio -- a traducao de layout-relatorio.md para uma
// estrutura que o gerador transforma em PBIR.
//
// Canvas 1280 x 720. Faixas verticais (mais altas que em
// layout-relatorio.md -- ver o porque nos comentarios de Y e H):
//   cabecalho  y=16   h=48   -> 64
//   filtros    y=72   h=72   -> 144
//   KPIs       y=152  h=96   -> 248
//   meio       y=252  h=240  -> 492
//   base       y=500  h=166  -> 666
//   rodape     y=672  h=30   -> 702
//
// Referencia de campo:
//   'tabela.coluna'  -> coluna
//   '@Medida'        -> medida da tabela _Medidas
//   'tabela.coluna#soma' -> coluna agregada por soma

// Os filtros ganharam 16 px de altura e 11 de largura cada: com 40 px o
// rotulo e o valor selecionado disputavam a mesma linha e "Revenda Lima
// Sao Felix" saia cortado. Segmentacao que nao deixa ler o que esta
// selecionado e pior que segmentacao nenhuma -- o usuario filtra sem
// saber por que o numero mudou.
const Y = { filtros: 72, kpi: 152, meio: 252, base: 500 };
// A faixa de base perde 26 px em relacao ao layout-relatorio.md para
// abrir espaco a rodape de ressalva. Essas notas nao sao decoracao: sao
// o que impede alguem de ler "cliques no aviso" como "visualizacoes", ou
// a divergencia sem parque_confiavel como divergencia real.
// 72 px nos filtros, e nao 56: o segmentador empilha cabecalho e valor,
// e o de Periodo ainda traz dois campos de data. Com 56 o valor
// selecionado saia cortado -- e segmentacao em que nao se le o que esta
// selecionado e pior que segmentacao nenhuma.
const H = { filtros: 72, kpi: 96, meio: 240, base: 166 };
const XK = [16, 268, 520, 772, 1024]; // 5 colunas de KPI, 240 de largura
const LARG_KPI = 240;

// Os quatro filtros, identicos em todas as paginas. Sincronizados no
// Power BI depois (Exibir > Sincronizar segmentacoes) -- o PBIR nao
// carrega o grupo de sincronizacao, e esse e o unico passo manual que
// sobra do bloco de filtros.
const filtros = [
  { campo: 'dim_revenda.revenda', titulo: '🏢 Revenda' },
  { campo: 'dim_calendario.data', titulo: '🗓️ Período', modo: 'Between' },
  { campo: 'dim_colaborador.area_rotulo', titulo: '📍 Área' },
  // busca: caixa de "digite para procurar" dentro da segmentacao. So
  // aqui: sao ~160 nomes e a lista cresce a cada contratacao. Revenda
  // tem meia duzia de itens e Area tem duas -- caixa de busca nelas
  // gastaria altura sem economizar clique nenhum.
  { campo: 'dim_colaborador.colaborador', titulo: '👤 Colaborador', busca: true },
  /*
    O MES FECHADO, em todas as paginas (pedido do dono, 09/09/2026).

    O fechamento mensal e o ritual que manda na cobranca -- ninguem
    apresenta "os ultimos 30 dias", apresenta agosto. Antes ele existia
    so no Ativo de Giro e no Feedback da Rota, e nas outras paginas era
    preciso montar o mes na mao no filtro de Periodo, mes a mes, em cada
    aba.

    ATENCAO: Mes e Periodo filtram a MESMA tabela e se CRUZAM (E, nao
    OU). "ago/26" junto de um Periodo de 01/09 a 09/09 devolve tela
    vazia, e a tela vazia nao explica que os dois estao brigando. Use um
    ou outro: para o fechamento, escolha o Mes e deixe o Periodo em
    branco.
  */
  { campo: 'dim_calendario.ano_mes', titulo: '📆 Mês' },
];

/*
  O FILTRO DE COLABORADOR DAS PAGINAS DO ARMAZEM (10/09/2026).

  O filtro global lista a dim_colaborador inteira: ~160 nomes, e na
  pagina de Repack quase todos dariam tela vazia -- motorista, vendedor,
  quem nunca pisou na bancada. O dono pediu para ver so quem teve
  operacao.

  A troca: nestas paginas o filtro de Colaborador usa a coluna de NOME
  do proprio fato da pagina, que por definicao so tem quem lancou
  alguma coisa ali. E o mesmo caminho que ja provou funcionar nos
  filtros de Transportadora, Maquina, Familia e Embalagem.

  O preco, que esta escrito na nota de cada pagina:
    * ele filtra o fato PRINCIPAL da pagina. Visual de outro fato na
      mesma pagina (o bate palete no Repack, o ressuprimento no
      Abastecimento) nao acompanha -- use o filtro de Area ou a propria
      coluna de nome daquele visual;
    * ele nao sincroniza com o Colaborador das outras paginas (e outro
      campo). Escolher alguem no AG nao leva a escolha para a Bancada.
      As paginas que usam o MESMO fato (Bancada e Repack) sincronizam
      entre si.

  Por que nao um filtro de "medida nao vazia" na segmentacao global,
  que resolveria as duas coisas: o gerador ja tem uma construcao de
  filtro Advanced (o corte de amostra minima) e ela ZERA o visual no
  Desktop -- ver o cabecalho de gerar-pbip.js. Numa segmentacao, zerar
  e entregar uma lista vazia. Nao vale o risco sem um .pbix de
  referencia para copiar a forma certa.
*/
function filtrosComColaboradorDaPagina(campoDoNome, titulo = '👤 Colaborador') {
  return filtros.map((f) =>
    f.campo === 'dim_colaborador.colaborador' ? { campo: campoDoNome, titulo, busca: true } : f,
  );
}

// kpis: lista de [titulo, medida]
function faixaKpi(lista) {
  return lista.map((k, i) => ({
    t: 'cardVisual',
    x: XK[i], y: Y.kpi, w: LARG_KPI, h: H.kpi,
    titulo: k[0],
    roles: { Data: [k[1]] },
  }));
}

const paginas = [
  /*
    A CAPA SAIU (10/09/2026, pedido do dono).

    Ela nasceu com oito paginas, para resolver a tira de abas do rodape
    que escondia metade do relatorio. Com dezenove, a grade de botoes do
    Navegador de Paginas virou uma parede de retangulos apertados -- pior
    que a lista lateral de paginas do Power BI Service, que rola, mostra o
    nome inteiro e ja e o caminho que quem usa o BI conhece.

    Sem pagina com `capa: true`, o gerador deixa de criar tambem a seta
    de "voltar" em cada pagina (ela so existe para voltar a capa).

    O que a capa tinha de insubstituivel -- o carimbo "Dados atualizados
    em" -- veio para a Visao Geral, abaixo. Continua sendo mostrado UMA
    vez, na pagina que abre o relatorio, e nao em todas: repetido em
    dezenove paginas ele viraria moldura e ninguem mais leria.
  */

  // ================================================================
  {
    // Os emoji sao os do menu do app (public.menu_itens), para quem abre
    // o BI reconhecer as paginas pelo mesmo simbolo que ve no celular.
    // Onde o app nao tem item correspondente -- AG, Quiz, 5 Porques --
    // escolhi um que nao colide com os existentes.
    nome: '🏠 Visão Geral',
    // OCULTA (11/09/2026, pedido do dono): o relatorio passa a abrir na
    // primeira pagina do primeiro bloco (ver `blocos`, no fim do
    // arquivo). Ela continua existindo -- e o carimbo "Dados atualizados
    // em" com ela --, acessivel pela lista de paginas no modo de edicao.
    oculta: true,
    kpis: [
      ['👥 Colaboradores', '@Colaboradores'],
      // O rotulo diz a janela porque a medida ignora o filtro de data --
      // e a mesma conta do cartao "Adesao desde o lancamento" da tela de
      // /admin/metricas. Ver 07-medidas.dax.
      ['📲 % Adesão (desde o lançamento)', '@% Adesão'],
      ['👆 Interações', '@Interações'],
      ['📂 Módulos usados', '@Módulos usados'],
      ['⚠️ Aguardando tratativa', '@Aguardando tratativa'],
      // O CARIMBO que morava na capa. E a hora em que o MODELO atualizou,
      // nao a hora em que o arquivo foi aberto: um .pbix aberto na segunda
      // pode estar com dado de sexta, e quem leva o numero para a reuniao
      // precisa saber disso antes. Sexto cartao da faixa -- o gerador
      // reparte a largura sozinho, e como a medida e texto (MEDIDAS_TEXTO)
      // ela ganha corpo menor e cabe.
      ['🕒 Dados atualizados em', '@Atualizado em'],
    ],
    visuais: [
      {
        // Coluna empilhada por MES, e nao linha por semana.
        //
        // A versao anterior cruzava seis linhas (uma por modulo) sobre
        // cinquenta e duas semanas. Dava um emaranhado em que nem o
        // total nem a comparacao entre modulos saiam da tela: linha
        // serve para ver TENDENCIA de uma serie, e aqui sao seis.
        //
        // Empilhada resolve as duas leituras de uma vez -- a altura da
        // barra e o volume do mes, e as faixas dizem de onde ele veio.
        //
        // O eixo usa inicio_mes (coluna de data) em vez de mes_rotulo
        // (texto): data se ordena sozinha em ordem cronologica, texto
        // sairia em ordem alfabetica.
        t: 'columnChart', x: 16, y: Y.meio, w: 760, h: H.meio,
        titulo: '📈 Interações por mês e módulo',
        roles: {
          Category: ['dim_calendario.inicio_mes'],
          Y: ['@Interações'],
          Series: ['fato_atividade.modulo'],
        },
        // Rotulo em cada segmento da pilha vira poluicao: sao seis
        // numeros por barra, quase todos pequenos demais para caber.
        semRotulos: true,
      },
      {
        t: 'clusteredBarChart', x: 788, y: Y.meio, w: 460, h: H.meio,
        titulo: '📊 Interações por módulo',
        roles: { Category: ['fato_atividade.modulo'], Y: ['@Interações'] },
        ordem: { campo: '@Interações', dir: 'Descending' },
      },
      {
        t: 'pivotTable', x: 16, y: Y.base, w: 1248, h: H.base,
        titulo: '👥 Quem usa o quê — interações por colaborador e módulo',
        roles: {
          Rows: ['dim_colaborador.colaborador'],
          Columns: ['fato_atividade.modulo'],
          Values: ['@Interações'],
        },
      },
    ],
    nota:
      'Desde 10/09/2026 os gráficos de módulo incluem o ARMAZÉM — bancada, despejo, ' +
      'abastecimento, ressuprimento, bate palete, recebimento de carretas e empilhadeira —, ' +
      'somando 13 módulos. Na carreta contam as duas pontas (portaria e conferente); no bate ' +
      'palete conta o LOTE, não cada produto do lote. ' +
      'fato_atividade conta INTERAÇÕES, não qualidade. Um colaborador com 40 ' +
      'lançamentos de AG e nenhum feedback aparece aqui como "muito ativo". ' +
      'Adesão e desempenho são perguntas diferentes e moram em páginas diferentes.',
  },

  // ================================================================
  {
    nome: '📦 Ativo de Giro',
    // Cinco filtros aqui, e nao os quatro do padrao.
    //
    // "% Dias com contagem" divide dias contados por dias uteis JA
    // DECORRIDOS do periodo. Com o periodo aberto no ano inteiro, o
    // denominador vira 165 e todo mundo aparece com 4% -- numero que nao
    // mede disciplina nenhuma. O filtro de mes deixa a leitura certa a um
    // clique, e o de Periodo continua ali para recortes menores que o mes.
    //
    // ano_mes ("2026-08"), e nao mes_rotulo ("ago/26"): o segmentador
    // ordena texto em ordem alfabetica, e "ago" viria antes de "jul".
    // O filtro de Mês virou GLOBAL em 09/09/2026 (ver a lista `filtros`
    // no topo do arquivo) -- esta página não precisa mais declarar o
    // seu, e declarar de novo o duplicaria na barra.
    // O filtro de pagina parque_confiavel = True saiu daqui, e o mesmo
    // filtro saiu das medidas de conciliacao (ver 07-medidas.dax).
    //
    // O parque e FIXO por desenho: e o cadastro do que a revenda tem, e
    // a conciliacao e a contagem do dia contra esse cadastro. Exigir
    // "parque atualizado no mesmo dia da contagem" escondia a pagina
    // inteira -- e visual vazio nao avisa nada, so parece que nao ha
    // divergencia.
    kpis: [
      ['🔢 Ocorrências de contagem', '@Ocorrências de contagem',
        'Quantas VEZES alguém contou — uma por pessoa por dia. Não é o número de linhas '
        + 'digitadas: quem conta o pátio uma vez digita dezenas de linhas, uma por '
        + 'tipo/formato, e isso é UMA ocorrência. Em 22/08/2026 o Matheus contou uma vez e '
        + 'lançou 21 linhas. Para o volume digitado, use a coluna "Linhas lançadas" nas '
        + 'tabelas abaixo.'],
      ['🗓️ % Dias com contagem', '@% Dias com contagem'],
      ['👥 Contadores', '@Contadores'],
      // A META DA CIA, e o unico numero desta faixa que tem regua
      // externa: 3 contagens por semana. As duas medidas ao lado dizem
      // quanto se contou; esta diz se foi o bastante.
      //
      // Sao dois cartoes e nao um porque eles falam de coisas
      // diferentes: "% da meta" e acumulado (12 dias em 4 semanas =
      // 100%, mesmo que 8 tenham caido na mesma semana), e "% Semanas na
      // meta" cobra semana a semana. Quando os dois discordam, e a
      // rotina que esta irregular -- e e exatamente o que a meta quer
      // evitar.
      ['🎯 % da meta (3/semana)', '@% da meta de contagens',
        'Dias contados ÷ meta do período, sendo a meta 3 × o número de semanas já decorridas. ' +
        '"Contagem" aqui é DIA CONTADO, não linha lançada: 40 linhas numa terça e nada no ' +
        'resto da semana cumprem 1/3 da meta. É ACUMULADO — 12 dias em 4 semanas dão 100% ' +
        'mesmo que 8 deles tenham caído na mesma semana. Para cobrar regularidade, use o ' +
        'cartão ao lado. Filtre um mês: o denominador são as semanas já decorridas do que ' +
        'estiver selecionado, então com o ano inteiro aberto todo mundo parece ruim.'],
      ['📆 % Semanas na meta', '@% Semanas na meta',
        'Das semanas já decorridas no período, quantas fecharam com 3 ou mais dias contados. ' +
        'É o par duro de "% da meta": aqui não há compensação entre semanas — uma semana com ' +
        '6 contagens não paga a semana seguinte com nenhuma. Quando os dois cartões ' +
        'discordam, o volume está certo e a rotina está irregular, que é exatamente o que a ' +
        'meta de 3 por semana existe para evitar.'],
      ['✅ % Lançado no dia', '@% Lançado no dia'],
      // Substituiu "Recontagens pendentes": os tres visuais de volume
      // desta pagina falam de UM dia, e nao dizer qual e esconder a
      // metade da informacao.
      ['📅 Último dia contado', '@Último dia contado',
        'O dia mais recente com contagem DENTRO do período filtrado. É a data que manda nos '
        + 'três visuais de volume lá embaixo: eles mostram só quem contou neste dia, e não o '
        + 'acumulado. Se um colaborador que você sabe que contou não aparece na tabela, é '
        + 'porque contou em outro dia. Para mudar a fotografia, ajuste o filtro de Período '
        + 'para o dia que quer ver. Repare também no volume: dia com muito menos linha que o '
        + 'anterior costuma ser contagem parcial, e a fotografia sai incompleta sem avisar.'],
    ],
    // Duas faixas em vez das tres do padrao: esta pagina responde a tres
    // perguntas diferentes (a rotina esta sendo mantida? quem sustenta?
    // o que o Painel do app mostra?) e cada uma precisa de espaco proprio.
    visuais: [
      // --- faixa 1: a meta, a aderencia e quem sustenta --------------
      {
        // O RITMO DIA A DIA, em linha e no eixo por dia do mes -- o
        // mesmo desenho da evolucao da nota na pagina de Feedback.
        //
        // Era semanal ate 23/08/2026, com a meta como segunda serie. A
        // meta saiu do grafico junto com a semana, e nao por descuido:
        // "3 por semana" nao tem equivalente diario. Dividir por cinco
        // dias uteis daria uma reta em 0,6 contagem por dia, que nao e
        // regra nenhuma -- ninguem conta 0,6 vez. Reta que nao
        // corresponde a nenhuma regra real e pior que reta nenhuma,
        // porque parece criterio.
        //
        // A meta continua medida, e nos dois cartoes onde ela cabe: "%
        // da meta" (acumulado) e "% Semanas na meta" (semana a semana).
        // O grafico responde a pergunta vizinha, que a semana escondia:
        // EM QUE DIAS se contou. Tres contagens numa segunda e nada no
        // resto da semana cumprem a meta e sao uma rotina ruim -- e isso
        // so aparece no eixo diario.
        //
        // A serie e [Contagens no dia], que devolve ZERO no dia sem
        // lancamento em vez de vazio: categoria vazia nao e desenhada, e
        // o buraco -- justamente o que se quer ver -- sumiria.
        t: 'lineChart', x: 16, y: Y.meio, w: 380, h: 200,
        titulo: '📈 Contagens por dia do mês (sem domingos)',
        roles: {
          Category: ['dim_calendario.dia_rotulo'],
          Y: ['@Contagens no dia'],
        },
        // DOMINGO FORA DO EIXO.
        //
        // Nao se conta ativo de giro em domingo, entao todo domingo
        // aparecia como zero -- e quatro ou cinco quedas ao chao por mes
        // nao dizem nada sobre disciplina, so serrilham a linha e
        // achatam os dias que importam. Sabado FICA: la se conta, e
        // domingo sem contagem e rotina enquanto sabado sem contagem e
        // informacao.
        //
        // Lista de inclusao e nao exclusao porque o filtro categorico do
        // Power BI e um "IN". Sao os seis dias que ficam.
        filtroVisual: {
          campo: 'dim_calendario.dia_semana_nome',
          valores: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
        },
        dica:
          'Uma OCORRÊNCIA é uma vez que alguém contou — uma por pessoa por dia —, e não uma '
          + 'linha digitada: quem conta o pátio uma vez lança dezenas de linhas. '
          + 'Os domingos ficam fora do eixo: não se conta AG em domingo, e o zero de todo '
          + 'domingo só serrilhava a linha. Sábado continua, porque lá se conta e a falta '
          + 'é informação. '
          + 'O eixo é o DIA DO MÊS — escolha um mês no filtro, senão o dia 05 de dois meses '
          + 'diferentes vira o mesmo ponto.',
      },
      {
        // Tabela, e nao grafico de barras: a pergunta aqui e "houve
        // contagem em todo dia util?", e buraco em tabela e mais facil
        // de ver do que barra baixa em serie longa.
        //
        // As seis colunas de sempre. Elas tinham sido reduzidas a quatro
        // quando o grafico de meta entrou e comeu largura; foram
        // devolvidas em 23/08/2026 -- indicador que alguem ja usava nao
        // sai da tela para abrir espaco a indicador novo.
        // quebraTexto prende cada coluna em 96 px em vez de deixar a
        // tabela distribuir largura pelo conteudo, que e o que espremia
        // as ultimas para fora da area visivel.
        t: 'tableEx', x: 408, y: Y.meio, w: 420, h: 200,
        quebraTexto: 96,
        titulo: '📅 Aderência por dia',
        roles: {
          Values: [
            'dim_calendario.data',
            // Linhas, e nao ocorrencias: no grao de UM dia, "ocorrencias
            // de contagem" e a mesma conta de "contadores" -- as duas
            // seriam a mesma coluna repetida. Aqui a informacao que
            // falta e o volume digitado, que e o que denuncia contagem
            // parcial (21 linhas contra 117 no dia anterior).
            '@Linhas lançadas',
            '@Contadores',
            '@% Lançado no dia',
            '@Itens conciliados',
            '@% Itens que bateram',
          ],
        },
        ordem: { campo: 'dim_calendario.data', dir: 'Descending' },
      },
      {
        // Ranking por DISCIPLINA, nao por volume. Quem digita 40 linhas
        // num dia e some a semana inteira nao e o melhor colocado -- e o
        // que "Contagens" sozinho dizia antes.
        //
        // Ordenado por "% da meta", e nao mais por "% Dias com
        // contagem": a partir de agora a regua e a da cia, e o ranking
        // tem de premiar quem bate a meta, nao quem cobre o calendario.
        // "Ocorrencias de contagem" voltou junto com as colunas da
        // tabela ao lado, pelo mesmo motivo.
        t: 'tableEx', x: 840, y: Y.meio, w: 424, h: 200,
        quebraTexto: 96,
        titulo: '🏆 Ranking no AG — contra a meta',
        roles: {
          Values: [
            'fato_ag_contagem.colaborador_nome',
            '@Dias com contagem',
            '@% da meta de contagens',
            '@% Lançado no dia',
            '@Atraso médio (dias)',
            // Mesmo motivo da tabela ao lado: por pessoa, "ocorrencias
            // de contagem" e a mesma conta de "dias com contagem".
            '@Linhas lançadas',
          ],
        },
        ordem: { campo: '@% da meta de contagens', dir: 'Descending' },
      },

      // --- faixa 2: o Painel do app, no ultimo dia contado ----------
      //
      // As tres leem "@... no dia": o ultimo dia contado dentro do
      // periodo selecionado, nunca o acumulado. AG e contagem de
      // estoque, e somar dias conta o mesmo palete duas vezes. Ver o
      // bloco "Fotografia do dia" em 07-medidas.dax.
      {
        // Matriz, e nao tabela por formato: a pergunta virou "quem
        // contou o que", e o nome do colaborador precisa estar na
        // primeira coluna, com o total de cada um na ponta da linha.
        t: 'pivotTable', x: 16, y: 460, w: 450, h: 206,
        titulo: '📦 Total contado por colaborador e embalagem — último dia contado',
        dica:
          'Só quem contou NO ÚLTIMO DIA CONTADO aparece aqui — não é o acumulado do período. '
          + 'Se falta alguém que você sabe que contou, é porque contou em outro dia: veja o '
          + 'cartão "Último dia contado" e a tabela "Aderência por dia". '
          + 'É fotografia de propósito: AG é contagem de ESTOQUE, e somar dois dias contaria o '
          + 'mesmo palete duas vezes. '
          + 'Para ver outro dia, ajuste o filtro de Período para esse dia nas duas pontas — '
          + 'o "último dia" é sempre o último DENTRO do que está filtrado. '
          + 'Compare o volume com o do dia anterior: dia com muito menos linha costuma ser '
          + 'contagem parcial, e a fotografia sai incompleta sem avisar.',
        roles: {
          Rows: ['fato_ag_contagem.colaborador_nome'],
          Columns: ['fato_ag_contagem.formato'],
          Values: ['@Caixas no dia'],
        },
      },
      {
        // So GFE sem Garrafa, e nas unidades em que foi DIGITADO --
        // palete e caixa. O total convertido em caixas responde outra
        // pergunta e ja mora no visual ao lado.
        t: 'tableEx', x: 474, y: 460, w: 320, h: 206,
        titulo: '🧺 Garrafeira sem garrafa por colaborador e formato — último dia',
        dica:
          'Mesma regra do visual ao lado: só quem contou NO ÚLTIMO DIA CONTADO do período. '
          + 'Quem contou em outro dia não aparece — não é falta de dado. '
          + 'Paletes e caixas como foram DIGITADOS, sem conversão: a pergunta do painel de '
          + 'garrafeira é quantos paletes de GFE sem garrafa estão no pátio, e converter para '
          + 'caixas responde outra coisa (essa está no visual ao lado).',
        roles: {
          Values: [
            'fato_ag_contagem.colaborador_nome',
            // O formato, como no painel do app. Sem ele a linha somava
            // 600ml com 1000ml -- paletes de tamanhos diferentes, que
            // nao se somam na hora de decidir o que buscar no patio.
            'fato_ag_contagem.formato',
            '@Paletes GFE',
            '@Caixas GFE',
          ],
        },
        ordem: { campo: '@Paletes GFE', dir: 'Descending' },
      },
      {
        // A conciliacao da tela do app: contado x parque x diferenca,
        // item a item, do dia. Substituiu o ranking de divergencia
        // absoluta, que exigia parque_confiavel = True e por isso
        // aparecia VAZIO sempre que o parque nao era atualizado no
        // mesmo dia da contagem.
        //
        // parque_atualizado_em fica visivel como contexto: diz quando o
        // cadastro do parque foi mexido pela ultima vez. Nao e ressalva
        // sobre a conta -- o parque e fixo de proposito --, e sim a
        // resposta para "esse saldo ainda e o que combinamos?".
        t: 'tableEx', x: 802, y: 460, w: 454, h: 206,
        // A regra do app desde 10/09/2026 (contado + transito - parque).
        // Aqui a versao COMPACTA -- a tabela tem 454 px. As tres parcelas
        // do transito separadas, o % e a situacao estao na pagina
        // "Conciliacao do AG", logo depois desta.
        titulo: '⚖️ Conciliação do dia — detalhe na página seguinte',
        roles: {
          Values: [
            'fato_ag_conciliacao.item',
            '@Contado',
            '@Em trânsito',
            '@Parque',
            '@Diferença',
            '@% Diferença',
          ],
        },
        ordem: { campo: '@Diferença', dir: 'Ascending' },
      },
    ],
    nota:
      'VOLUME AQUI É FOTOGRAFIA, NÃO SOMA: os três visuais de baixo leem o último dia ' +
      'contado dentro do que estiver filtrado — mês, período ou um dia só. AG é contagem ' +
      'de estoque, e somar dois dias conta o mesmo palete duas vezes. Aderência e ranking, ' +
      'esses sim, somam o intervalo, porque medem frequência e não quantidade. ' +
      'META DA CIA: 3 contagens por semana — e "contagem" aqui é DIA CONTADO, não linha ' +
      'lançada: 40 linhas numa terça e nada no resto da semana cumpre 1/3 da meta. ' +
      '"% da meta" é acumulado no período; "% Semanas na meta" cobra semana a semana, e é o ' +
      'mais duro dos dois. Use o filtro de Mês para ler os percentuais: o denominador são as ' +
      'semanas e os dias úteis JÁ DECORRIDOS do que estiver selecionado, então com o ano ' +
      'inteiro aberto todo mundo parece ruim.',
  },

  // ================================================================
  {
    /*
      A CONCILIACAO DO AG, como a aba Conciliacao do app (10/09/2026).

      O dono: "no BI pega somente o contado vs o parque e sempre gera
      diferenca alta". Eram tres defeitos -- a recontagem somando em vez
      de sobrepor, o transito fora da conta e o fator ausente virando
      zero --, todos corrigidos em 15-armazem-e-desafio-no-bi.sql.

      Pagina propria, e nao so a tabela da pagina do AG, porque a conta do
      app tem nove colunas (contado, rota, carreta, comodato, parque,
      diferenca, %, situacao) e na pagina do AG a tabela tem 454 px: as
      tres parcelas do transito sao justamente o que diz ONDE esta o
      ativo que falta no patio, e espremidas elas deixariam de ser lidas.

      Sem os filtros de Area e Colaborador GLOBAIS: a conciliacao e da
      REVENDA no dia, e o Colaborador da dim_colaborador aqui nao
      filtraria nada -- segmentacao que nao filtra e pior que nenhuma. O
      que existe no lugar dele e o Conferente (12/09/2026), que filtra de
      verdade: ver `filtros` logo abaixo.
    */
    nome: '⚖️ Conciliação do AG',
    /*
      DIA E CONFERENTE no lugar de Período e Colaborador (12/09/2026,
      pedido do dono).

      Dia: a coluna do PRÓPRIO fato da conciliação, então a lista só traz
      dia que teve contagem -- um calendário inteiro na lista suspensa
      seria rolar anos para achar ontem. Marca um ou vários (Ctrl + clique).

      Conferente: o nome de quem contou, do fato das contagens. Ele troca o
      contado pelo daquela pessoa e tira da conta os itens que ela não
      contou -- ver [Contado do conferente na linha] em 07-medidas.dax. É
      por isso que aqui ele filtra de verdade, ao contrário do Colaborador
      global, que nesta página não mexia em nada.
    */
    filtros: [
      filtros.find((f) => f.campo === 'dim_revenda.revenda'),
      { campo: 'fato_ag_conciliacao.data', titulo: '📅 Dia' },
      { campo: 'fato_ag_contagem.colaborador_nome', titulo: '👤 Conferente', busca: true },
      filtros.find((f) => f.campo === 'dim_calendario.ano_mes'),
    ],
    kpis: [
      ['📅 Dia conciliado', '@Dia conciliado'],
      ['📦 Contado', '@Contado'],
      ['🚚 Fora do pátio', '@Em trânsito'],
      ['🏷️ Parque', '@Parque'],
      ['⚖️ Diferença (cx)', '@Diferença'],
      ['📊 % sobre o parque', '@% Diferença'],
    ],
    visuais: [
      {
        t: 'tableEx', x: 16, y: Y.meio, w: 1248, h: H.meio,
        titulo: '⚖️ Conciliação do dia — contado + rota + carreta + comodato − parque',
        roles: {
          Values: [
            // O DIA vem primeiro (12/09/2026): com mais de um dia marcado
            // no filtro, cada dia tem as suas linhas. Com um dia so, a
            // coluna repete a data -- e confirma de que dia e a conta.
            'fato_ag_conciliacao.data',
            'fato_ag_conciliacao.item',
            '@Contado',
            // As tres parcelas SEPARADAS, como na tela: e o que diz onde
            // esta o ativo que nao foi contado. Um numero so de transito
            // diria apenas que ele nao estava aqui.
            '@Trânsito rota',
            '@Trânsito carreta',
            '@Comodato',
            '@Parque',
            '@Diferença',
            '@% Diferença',
            '@Situação da conciliação',
          ],
        },
        // Maiores FALTAS no topo: e o que alguem precisa ir atras.
        ordem: { campo: '@Diferença', dir: 'Ascending' },
      },
      {
        t: 'columnChart', x: 16, y: Y.base, w: 620, h: H.base,
        titulo: '📉 Diferença por dia — a evolução das faltas e sobras',
        roles: {
          Category: ['dim_calendario.data'],
          Y: ['@Diferença por dia'],
        },
      },
      {
        t: 'tableEx', x: 648, y: Y.base, w: 616, h: H.base,
        titulo: '🗓️ Histórico dia a dia',
        roles: {
          Values: [
            'fato_ag_conciliacao.data',
            '@Contado por dia',
            '@Em trânsito por dia',
            '@Parque por dia',
            '@Diferença por dia',
            '@% Diferença por dia',
          ],
        },
        ordem: { campo: 'fato_ag_conciliacao.data', dir: 'Descending' },
      },
    ],
    nota:
      'A CONTA É A DO APP: contado + trânsito rota + trânsito carreta + comodato − parque. As três '
      + 'parcelas do meio são ativo da revenda que não está no pátio para ser contado — saiu com a '
      + 'entrega, está com o transportador ou emprestado ao cliente. Aceitável até 5% do parque, em '
      + 'módulo. '
      + 'O contado soma só as contagens VIVAS: quando há recontagem, ela SOBREPÕE a contagem antiga '
      + '(a antiga continua no histórico, mas sai do total). '
      + 'Filtro de Dia: marque um ou vários (Ctrl + clique). A tabela de cima traz uma linha por dia '
      + 'e item; os cartões são a FOTOGRAFIA do último dia marcado — o dia está no primeiro cartão. '
      + 'Filtro de Conferente: o contado passa a ser só o daquela pessoa, e os itens que ela não '
      + 'contou saem da conta inteira (parque, trânsito e comodato também). '
      + 'No histórico, cada linha é um dia exato; a linha de total é '
      + 'a média diária, porque somar o parque de trinta dias daria um número que não existe. '
      + 'Dia sem contagem não aparece: é dia sem medição, não dia com falta de 100%. '
      + 'O parque e o comodato são saldos que valem até alguém mudar — um dia de semanas atrás é '
      + 'conciliado com o parque e o comodato de HOJE, igual ao app.',
  },

  // ================================================================
  {
    nome: '📝 Feedback da Rota',
    // Cinco filtros, como no Ativo de Giro. O de Mes entrou junto com o
    // eixo por dia do grafico de evolucao: "01" de agosto e "01" de
    // setembro sao o mesmo rotulo, entao a leitura diaria so e correta
    // dentro de um mes. Com o mes escolhido, o grafico fica certo e
    // legivel ao mesmo tempo.
    // O filtro de Mês virou GLOBAL em 09/09/2026 (ver a lista `filtros`
    // no topo do arquivo) -- esta página não precisa mais declarar o
    // seu, e declarar de novo o duplicaria na barra.
    kpis: [
      ['📝 Feedbacks', '@Feedbacks'],
      ['★ Nota média (0 a 3)', '@Nota média'],
      ['🙂 % Satisfação', '@% Satisfação'],
      ['😞 % Notas ruins', '@% Notas ruins'],
      // Substituiu "Rota mais crítica" em 23/08/2026.
      //
      // O numero do mapa e gerado pela roteirizacao do dia: a rota 14768
      // de ontem nao e a rota 14768 do mes que vem. Apontar um mapa como
      // "o pior" nao dizia onde agir -- e o cartao ficava ali sem que
      // ninguem soubesse o que fazer com ele.
      //
      // A cidade se repete, e vem do cruzamento com o relatorio de rotas
      // que o proprio app ja importa em /admin/rotas. Ver
      // bi.fato_feedback_cidade em 01-camada-semantica.sql.
      ['🏙️ Cidade mais crítica', '@Cidade mais crítica',
        'A cidade com a PIOR nota média entre as que têm 3 ou mais feedbacks — não é a que ' +
        'tem mais reclamações nem a que tem mais notas ruins. A cidade vem do cruzamento do ' +
        'nº do mapa que o motorista digitou com o relatório de rotas de /admin/rotas; um mapa ' +
        'que passa por três cidades entra nas três. A ordenação usa a nota AJUSTADA pelo ' +
        'volume: média de 3 feedbacks oscila muito mais que a de 20, então cada cidade é ' +
        'puxada em direção à média geral na proporção de quantas avaliações sustentam a dela. ' +
        'Sem esse ajuste, duas cidades empatadas em 1,33 eram desempatadas por ordem ' +
        'alfabética. Feedback cujo mapa não foi encontrado fica fora da disputa — falha de ' +
        'importação não pode virar diagnóstico de operação.'],
    ],
    visuais: [
      {
        // Eixo por DIA, e nao pela data inteira.
        //
        // Com "01/08/2026" -- dez caracteres -- o Power BI nao consegue
        // desenhar os 31 rotulos e passa a pular dias: o grafico mostrava
        // 03, 06, 09 e quem lia achava que nos dias do meio nao houve
        // feedback nenhum. Com dois caracteres cabem todos.
        //
        // dia_rotulo e texto e ordenaria em ordem alfabetica; o modelo o
        // ordena pela coluna "dia" (ver ordenarPor em modelo.js). E ele
        // so e correto dentro de UM mes -- dai o filtro de Mes acima.
        t: 'lineChart', x: 16, y: Y.meio, w: 380, h: H.meio,
        titulo: '📈 Evolução da nota média — por dia do mês',
        roles: { Category: ['dim_calendario.dia_rotulo'], Y: ['@Nota média'] },
      },
      {
        // A ordenacao pelo VALOR da nota agora vem do modelo:
        // nota_rotulo tem sortByColumn = nota. Sem isso o visual
        // ordenava "Boa, Ótima, Regular, Ruim" -- alfabetico -- e uma
        // escala ordinal reordenada por nome deixa de ser escala.
        t: 'columnChart', x: 408, y: Y.meio, w: 250, h: H.meio,
        titulo: '📊 Distribuição das notas',
        roles: { Category: ['fato_feedback_rota.nota_rotulo'], Y: ['@Feedbacks'] },
        ordem: { campo: 'fato_feedback_rota.nota', dir: 'Ascending' },
      },
      {
        t: 'clusteredBarChart', x: 670, y: Y.meio, w: 290, h: H.meio,
        titulo: '⚠️ Principais problemas relatados',
        roles: {
          Category: ['fato_feedback_ocorrencia.ocorrencia'],
          Y: ['@Feedbacks com ocorrência'],
        },
        ordem: { campo: '@Feedbacks com ocorrência', dir: 'Descending' },
      },
      {
        // O que sustenta o cartao de cidade critica. Cartao de "o pior X"
        // sem o ranking atras vira boato: ninguem consegue conferir se a
        // diferenca para o segundo colocado e de meio ponto ou de um
        // centesimo.
        //
        // Ordenado pela PIOR nota (ascendente) -- a primeira barra ja
        // responde a pergunta sem varrer o grafico.
        //
        // A barra e a media SIMPLES, que e a que o time reconhece e
        // confere na mao. So que ela empata: em 23/08/2026, Coribe e
        // Jaborandi davam 1,33 os dois, com 6 e 3 feedbacks. Por isso o
        // cartao ordena pela media ajustada, e as duas entram na dica de
        // ferramenta junto com o volume -- passar o mouse numa barra
        // mostra em quantos feedbacks ela se apoia, que e a pergunta
        // seguinte de quem olha um ranking de medias.
        t: 'clusteredBarChart', x: 972, y: Y.meio, w: 292, h: H.meio,
        titulo: '🏙️ Nota média por cidade da rota',
        roles: {
          Category: ['fato_feedback_cidade.cidade'],
          Y: ['@Nota média por cidade'],
          Tooltips: ['@Feedbacks por cidade', '@Nota média ajustada da cidade'],
        },
        ordem: { campo: '@Nota média por cidade', dir: 'Ascending' },
      },
      {
        // O ciclo inteiro numa linha so: o que o colaborador reclamou, a
        // causa raiz que a analise achou, se ele aceitou a devolutiva e
        // qual foi ela.
        //
        // As colunas cp_* vem da propria view de feedback (LATERAL para a
        // analise mais recente daquele feedback), e nao de um
        // relacionamento entre os dois fatos -- ver o comentario em
        // modelo.js.
        //
        // Aceite ANTES da devolutiva: a tabela distribui largura pelo
        // conteudo, e texto corrido no meio empurra a coluna curta para
        // fora da area visivel.
        t: 'tableEx', x: 16, y: Y.base, w: 1248, h: H.base,
        // 7 colunas em 1248: 170 cada, com o resto de folga para a barra
        // de rolagem. Sem isso, comentario e devolutiva engoliam a
        // largura das outras cinco.
        quebraTexto: 170,
        titulo: '💬 Do comentário à devolutiva — o ciclo fechado',
        roles: {
          // Ordem por LARGURA, e nao pela narrativa do ciclo. As colunas
          // curtas primeiro; comentario e devolutiva, que sao texto
          // corrido, por ultimo, dividindo o que sobra. Com o comentario
          // no meio, tudo que vinha depois -- causa raiz e aceite --
          // ficava fora da area visivel. A rota saiu para abrir espaco:
          // ela e contexto do feedback, nao do ciclo.
          Values: [
            'fato_feedback_rota.data',
            'fato_feedback_rota.colaborador',
            'fato_feedback_rota.nota_rotulo',
            'fato_feedback_rota.cp_aceite_rotulo',
            'fato_feedback_rota.cp_causa_raiz',
            'fato_feedback_rota.comentario',
            'fato_feedback_rota.cp_devolutiva',
          ],
        },
        ordem: { campo: 'fato_feedback_rota.data', dir: 'Descending' },
      },
    ],
    nota:
      'A CIDADE vem do cruzamento do nº do mapa que o motorista digitou com o relatório de ' +
      'rotas importado em /admin/rotas — um mapa que passa por três cidades entra nas três. ' +
      '"Cidade mais crítica" exige ≥ 3 feedbacks e ignora o que não casou com nenhum mapa: ' +
      'sem esse corte, uma cidade com um único feedback ruim vira "a pior da revenda" na ' +
      'primeira reunião. O cartão ordena pela nota AJUSTADA por volume, não pela média simples ' +
      'do gráfico: média de 3 feedbacks e de 6 não têm o mesmo peso, e sem o ajuste um empate ' +
      'de médias era desempatado por ordem alfabética. Passe o mouse na barra para ver as duas ' +
      'e o volume. Se o gráfico de cidades vier magro, é a roteirização que não foi ' +
      'importada, não a operação que melhorou — confira "% Rotas localizadas". ' +
      'Só aparecem as cidades das revendas que já usam o app: Barreiras ainda não aderiu, ' +
      'então a ausência dela aqui é esperada e não é falha de cruzamento. ' +
      'O eixo do gráfico de evolução é o DIA DO MÊS: escolha um mês no filtro, senão o dia 01 ' +
      'de dois meses diferentes vira o mesmo ponto.',
  },

  // ================================================================
  {
    nome: '🔍 Cinco Porquês',
    kpis: [
      ['🔍 Análises', '@Análises'],
      ['✅ % Conclusão', '@% Conclusão'],
      ['🏁 % Chegou ao 5º', '@% Chegou ao 5º porquê',
        'Das análises CONCLUÍDAS, quantas percorreram os cinco porquês até o fim em vez de ' +
        'parar no 2º ou no 3º. É medida de profundidade, não de volume: parar cedo costuma ' +
        'achar sintoma ("o cliente estava fechado") e não causa ("não conferimos o horário na ' +
        'véspera") — e ação tomada sobre sintoma volta como o mesmo problema no mês seguinte. ' +
        'O denominador são só as concluídas: análise abandonada no meio não conta como quem ' +
        'deixou de aprofundar.'],
      ['⚠️ Aguardando tratativa', '@Aguardando tratativa'],
      // TMR no lugar de "Horas até resposta".
      //
      // O cartao mostrava 96,4 e esperava que quem lesse dividisse por
      // 24 de cabeca. A medida agora troca de unidade sozinha: abaixo de
      // 24 h sai em horas, acima sai em dias -- e e justamente acima de
      // 24 h que o numero deixa de ser detalhe operacional. Ver [TMR] em
      // 07-medidas.dax.
      //
      // Combinado desde a tratativa do feedback "Regular" (ver
      // [Horas médias até resposta] em 07-medidas.dax): pondera por CASO
      // respondido, nao por modulo, entao um mes com muita tratativa de
      // Regular pesa mais que um com poucas analises de 5 Porques -- e e
      // assim que a lideranca de fato vive o volume de resposta.
      ['⏱️ TMR — tempo médio de resposta', '@TMR',
        'Tempo médio para a liderança responder um relato do motorista — soma o 5 Porquês ' +
        '(motorista concluiu a análise) com a tratativa direta do feedback "Regular", que não ' +
        'tem análise de causa raiz por trás. Sai em HORAS até 24 h e em DIAS acima disso — ' +
        '96,4 h não se lê como "quatro dias" sem parar para dividir. É o indicador de saúde ' +
        'da resposta da liderança: caso concluído que ninguém responde ensina o time a não ' +
        'preencher o próximo, e passando de ~48 h o módulo morre por desuso antes de morrer ' +
        'por decisão. Só entram casos que JÁ receberam resposta, e feedback "Regular" que já ' +
        'existia antes da tratativa virar obrigatória fica de fora da média (foi reaberto em ' +
        'massa pela migration 056, e contar o tempo desde o envio original inflaria a métrica ' +
        'por um atraso que é do lançamento da funcionalidade, não da liderança).'],
      // Sexto cartao. A medida ja existia em 07-medidas.dax e nunca
      // tinha entrado em visual nenhum -- o denominador dela sao as
      // analises QUE RECEBERAM devolutiva, e nao todas: ninguem aceita
      // resposta que nao chegou.
      ['🤝 % Aceite do motorista', '@% Aceite do motorista'],
    ],
    visuais: [
      {
        t: 'clusteredBarChart', x: 16, y: Y.meio, w: 400, h: H.meio,
        titulo: '🔍 Principais causas-raiz',
        roles: { Category: ['fato_cinco_porques.categoria'], Y: ['@Análises'] },
        ordem: { campo: '@Análises', dir: 'Descending' },
      },
      {
        t: 'columnChart', x: 428, y: Y.meio, w: 400, h: H.meio,
        titulo: '📈 Evolução semanal por categoria de causa',
        roles: {
          Category: ['dim_calendario.inicio_semana'],
          Y: ['@Análises'],
          Series: ['fato_cinco_porques.categoria'],
        },
      },
      {
        t: 'pivotTable', x: 840, y: Y.meio, w: 424, h: H.meio,
        titulo: '🔀 Problema × causa',
        roles: {
          Rows: ['fato_cinco_porques.problema'],
          Columns: ['fato_cinco_porques.categoria'],
          Values: ['@Análises'],
        },
      },
      {
        // A devolutiva e o aceite NAO ficam aqui: eles vivem na tabela da
        // pagina de Feedback da Rota, na mesma linha da reclamacao que
        // originou a analise. E o ciclo fechado -- reclamou, achou a
        // causa, recebeu resposta, aceitou ou nao --, e ele so se le
        // inteiro quando esta tudo na mesma linha.
        //
        // A ressalva: analise sem feedback de origem (feedback_rota_id
        // nulo) nao aparece la. Se isso passar a acontecer, o lugar dela
        // e aqui.
        t: 'tableEx', x: 16, y: Y.base, w: 1248, h: H.base,
        // Problema, causa raiz, acao e tratativa sao frases inteiras.
        // 170 e nao 200: entrou uma sexta coluna de texto corrido.
        quebraTexto: 170,
        titulo: '📋 Problema · Causa · Ação · Tratativa — a pauta da reunião',
        roles: {
          Values: [
            'fato_cinco_porques_matriz.problema',
            'fato_cinco_porques_matriz.categoria',
            'fato_cinco_porques_matriz.causa_raiz',
            'fato_cinco_porques_matriz.acao_sugerida',
            // A TRATATIVA DO ANALISTA, na mesma linha da pauta.
            //
            // Sem ela a tabela levava a reuniao ate "este problema, por
            // esta causa, tantas vezes" e parava -- e a primeira
            // pergunta que alguem fazia era "e o que a lideranca
            // respondeu?". A resposta existia, mas so na pagina de
            // Feedback da Rota, uma linha por feedback: quem lia a pauta
            // tinha de trocar de pagina e cruzar a mao.
            //
            // Vale a MAIS RECENTE do grupo -- numa linha de tabela cabe
            // uma frase. O historico completo continua em
            // fato_cinco_porques, uma linha por analise, e a pagina de
            // Detalhe o abre por colaborador.
            'fato_cinco_porques_matriz.tratativa',
            'fato_cinco_porques_matriz.ocorrencias#soma',
            'fato_cinco_porques_matriz.tratadas#soma',
          ],
        },
        ordem: { campo: 'fato_cinco_porques_matriz.ocorrencias#soma', dir: 'Descending' },
      },
    ],
    nota:
      '"% Chegou ao 5º" = das análises CONCLUÍDAS, quantas percorreram os cinco porquês até o ' +
      'fim, em vez de parar no 2º ou 3º. É medida de profundidade: parar cedo costuma achar ' +
      'sintoma ("o cliente estava fechado") e não causa ("não conferimos o horário na véspera"). ' +
      'TMR = tempo médio para a liderança responder, somando o 5 Porquês com a tratativa direta ' +
      'do feedback "Regular"; sai em horas até 24 h e em dias acima disso. É o indicador de ' +
      'saúde da resposta da liderança, não de volume: caso concluído que ninguém responde ' +
      'ensina o time a não preencher o próximo — se passar de ~48 h, o módulo morre por desuso ' +
      'antes de morrer por decisão. Feedback "Regular" que já existia antes da tratativa virar ' +
      'obrigatória (migration 056) fica fora da média — contaria como demora da liderança um ' +
      'atraso que é só o lançamento da funcionalidade. ' +
      'No aceite, "Não respondeu" cobre dois casos diferentes: o motorista que recebeu ' +
      'a devolutiva e não respondeu, e a análise que nunca recebeu devolutiva nenhuma — ' +
      'esta última aparece com a coluna de resposta vazia. Por isso "% Aceite" divide ' +
      'pelas análises que RECEBERAM devolutiva, e não por todas.',
  },

  // ================================================================
  {
    nome: '📣 Comunicados',
    kpis: [
      ['📰 Comunicados publicados', '@Comunicados publicados'],
      ['👍 Curtidas', '@Curtidas'],
      ['❤️ Curtidas por comunicado', '@Curtidas por comunicado'],
      ['👥 % Participação', '@% Participação na comunicação'],
      ['🔔 Cliques no aviso (piso)', '@Cliques no aviso (piso)',
        'Quantas vezes alguém clicou no aviso do SINO, e não quantas pessoas leram o ' +
        'comunicado. O app não registra abertura: não existe rota por comunicado nem tabela ' +
        'de leitura. Este número vem de notificacao_estado, que por desenho só ganha linha de ' +
        'quem interagiu com o sino — quem leu o jornal direto na tela inicial não aparece ' +
        'aqui. Daí "(piso)": o alcance real é sempre MAIOR que este número, nunca menor. ' +
        'Não renomeie para "visualizações". Curtida é o sinal confiável desta página.'],
    ],
    visuais: [
      {
        t: 'columnChart', x: 16, y: Y.meio, w: 620, h: H.meio,
        titulo: '📰 Publicações por mês e categoria',
        roles: {
          Category: ['dim_calendario.inicio_mes'],
          Y: ['@Comunicados publicados'],
          Series: ['fato_comunicado.categoria'],
        },
      },
      {
        t: 'clusteredBarChart', x: 648, y: Y.meio, w: 300, h: H.meio,
        titulo: '👍 Engajamento por categoria',
        roles: { Category: ['fato_comunicado.categoria'], Y: ['@Taxa média de curtida'] },
        ordem: { campo: '@Taxa média de curtida', dir: 'Descending' },
      },
      {
        // Substitui "Quem participa da comunicacao", que so repetia em
        // barras o que a tabela abaixo ja diz melhor -- e num painel de
        // plano de comunicacao, ranking de quem curtiu nao decide nada.
        //
        // Esta pergunta decide: em quanto tempo o comunicado alcanca as
        // pessoas. Se a maior parte das curtidas cai no dia 0, publicar
        // de manha funciona; se a curva se arrasta por uma semana, o
        // aviso nao esta chegando e o horario de publicacao e o suspeito.
        t: 'columnChart', x: 960, y: Y.meio, w: 304, h: H.meio,
        titulo: '📅 Em quantos dias o comunicado alcança',
        roles: {
          Category: ['fato_comunicado_curtida.dias_ate_curtir'],
          Y: ['fato_comunicado_curtida.comunicado_id#contagem'],
        },
      },
      {
        t: 'tableEx', x: 16, y: Y.base, w: 1248, h: H.base,
        titulo: '🔥 Comunicados mais acessados',
        roles: {
          Values: [
            'fato_comunicado.titulo',
            'fato_comunicado.categoria',
            'fato_comunicado.data',
            '@Curtidas',
            '@Taxa média de curtida',
            '@Cliques no aviso (piso)',
          ],
        },
        ordem: { campo: '@Curtidas', dir: 'Descending' },
      },
    ],
    nota:
      'O app NÃO registra abertura de comunicado — não existe rota por comunicado nem ' +
      'tabela de leitura. "Cliques no aviso" vem de notificacao_estado, que por desenho ' +
      'só ganha linha de quem interagiu com o sino: é PISO, nunca total. Curtida é o ' +
      'sinal confiável desta página. Não renomeie esse cartão para "visualizações".',
  },

  // ================================================================
  {
    // O CALENDARIO DO PLANO DE COMUNICACAO.
    //
    // Pagina propria, e nao um visual espremido no rodape da pagina de
    // Comunicados. Um calendario e uma grade de seis semanas por sete
    // dias com o titulo do comunicado dentro da celula: nos 166 px que
    // sobravam la ele nao seria um calendario, seria uma tarja.
    //
    // A visao ja existe no app, em /admin/comunicados/calendario. Esta e
    // a mesma leitura -- a diferenca e que aqui ela convive com curtida,
    // participacao e categoria na mesma sessao de analise, e o gestor que
    // ve o buraco de duas semanas ja ve o que aconteceu com o engajamento
    // no mes em que isso ocorreu.
    nome: '📅 Cronograma da Comunicação',
    // Sem o filtro de Colaborador e sem o de Area: cronograma e o que a
    // revenda PUBLICA, e nao tem colaborador nem area. Um filtro que nao
    // altera nada da pagina so ensina o usuario a desconfiar dos que
    // alteram.
    filtros: [
      { campo: 'dim_revenda.revenda', titulo: '🏢 Revenda' },
      { campo: 'dim_calendario.ano_mes', titulo: '📆 Mês' },
      { campo: 'fato_comunicado_agenda.tipo', titulo: '🏷️ Tipo de marca' },
      { campo: 'fato_comunicado_agenda.categoria', titulo: '🗂️ Editoria' },
    ],
    kpis: [
      ['📰 Comunicados publicados', '@Comunicados publicados'],
      ['🗓️ Itens no cronograma', '@Itens do cronograma'],
      ['⏳ Marcas na fila', '@Marcas na fila'],
      ['🔔 Curtidas', '@Curtidas'],
      ['👥 % Participação', '@% Participação na comunicação'],
    ],
    visuais: [
      {
        // A GRADE. Linhas = semana, colunas = dia da semana, celula = o
        // numero do dia e o que sai nele.
        //
        // A pergunta do calendario nao e quanto se publicou -- e QUE DIAS
        // FICARAM VAZIOS. Numa lista ordenada por data o buraco de duas
        // semanas some entre duas linhas consecutivas; aqui ele e o
        // retangulo com um numero e mais nada.
        //
        // TRES CORRECOES sobre a primeira versao, que ficou ilegivel:
        //
        //   1. A celula traz o NUMERO DO DIA. Antes vinha so a lista de
        //      itens: dia sem publicacao ficava em branco, e a grade
        //      tinha sete colunas de dia da semana e nenhuma data --
        //      ninguem sabia se aquele retangulo era o dia 12 ou o 19.
        //      Ver [Célula do calendário] em 07-medidas.dax.
        //
        //   2. DOMINGO PRIMEIRO, e nao segunda. dia_semana_abrev sai
        //      "dom seg ter qua qui sex sáb" (ordenado por
        //      dia_semana_dom no modelo). Calendario que comeca na
        //      segunda nao e reconhecido como calendario -- e o app
        //      monta a grade domingo-primeiro.
        //
        //   3. SEM TOTAIS. A matriz nasce com linha e coluna de total, e
        //      num calendario isso somava os numeros dos dias: aparecia
        //      "112" ao lado de sabado.
        //   4. LARGURA TOTAL. A tabela de agenda detalhada que dividia a
        //      pagina saiu: ela repetia em lista o que a grade ja diz, e
        //      em 336 px nao cabia titulo de comunicado nenhum -- toda
        //      linha terminava em reticencias. O espaco dela vale mais
        //      como celula de calendario: sao 158 px por dia em vez de
        //      118, e o titulo passa a caber dentro do dia em que sai.
        //
        //   5. GRADE VISIVEL. O tema desliga linha vertical em matriz,
        //      que e o certo num cruzamento de numeros e errado aqui: a
        //      grade E o calendario. Sem ela, a publicacao do dia 11 e a
        //      do dia 12 sao dois blocos de texto encostados.
        t: 'pivotTable', x: 16, y: Y.meio, w: 1248, h: 414,
        grade: true,
        // A celula leva o numero e uma linha por marca, separadas por
        // quebra de linha (UNICHAR(10) na medida). Sem quebra de texto
        // ligada, tudo vira uma linha so, cortada no fim da celula.
        // 158 px e a setima parte de 1106 (a largura util depois do
        // cabecalho de linha): e o que faz as sete colunas caberem sem
        // barra de rolagem horizontal.
        quebraTexto: 158,
        semTotais: true,
        titulo: '🗓️ O mês em grade — o que sai em cada dia',
        roles: {
          Rows: ['dim_calendario.semana_dom'],
          Columns: ['dim_calendario.dia_semana_abrev'],
          Values: ['@Célula do calendário'],
        },
      },
      // A tabela "Agenda detalhada" ficava aqui e saiu em 23/08/2026.
      //
      // Ela nao acrescentava leitura: repetia em lista o que a grade ja
      // mostra, e em 336 px toda linha terminava em reticencias -- data,
      // hora, marca, titulo e situacao nao cabem lado a lado nessa
      // largura. Tabela ilegivel ao lado de um calendario legivel so
      // rouba espaco do calendario.
      //
      // O que ela respondia continua respondido: hora e marca estao
      // dentro da celula do dia ("🔔 08:00 Titulo"), e a situacao esta na
      // dica de ferramenta e no cartao "Marcas na fila".
    ],
    nota:
      'Cada comunicado gera até DUAS marcas, e elas são coisas diferentes: 📰 é a matéria ' +
      'entrando no jornal e 🔔 é o lembrete dela tocando o celular, que pode cair dias depois. ' +
      'Comunicado sem lembrete agendado gera só a primeira. "Na fila" é o que ainda não ' +
      'aconteceu — publicação agendada para o futuro, ou lembrete que ainda não disparou. ' +
      'Escolha um mês no filtro: sem isso a grade empilha as semanas do ano inteiro.',
  },

  // ================================================================
  {
    nome: '🧠 Quiz',
    kpis: [
      ['✅ Participações concluídas', '@Participações concluídas'],
      ['👥 Taxa de participação', '@Taxa de participação'],
      ['🎯 Aproveitamento médio', '@Aproveitamento médio'],
      ['👤 Participantes únicos', '@Participantes únicos'],
      ['⚠️ Questões críticas', '@Questões críticas'],
    ],
    visuais: [
      {
        t: 'clusteredColumnChart', x: 16, y: Y.meio, w: 430, h: H.meio,
        titulo: '📊 Elegíveis × concluídas por rodada',
        roles: {
          Category: ['fato_quiz_rodada_participacao.mes_ref'],
          Y: [
            'fato_quiz_rodada_participacao.elegiveis#soma',
            'fato_quiz_rodada_participacao.concluidas#soma',
          ],
        },
      },
      {
        t: 'lineChart', x: 458, y: Y.meio, w: 430, h: H.meio,
        titulo: '📈 Evolução do aproveitamento por área',
        roles: {
          Category: ['fato_quiz_participacao.mes_ref'],
          Y: ['@Aproveitamento médio'],
          Series: ['fato_quiz_participacao.area_rotulo'],
        },
      },
      {
        t: 'clusteredBarChart', x: 900, y: Y.meio, w: 364, h: H.meio,
        titulo: '❌ Perguntas com maior índice de erro',
        roles: {
          Category: ['fato_quiz_resposta.pergunta'],
          Y: ['@Taxa de erro (período)'],
        },
        ordem: { campo: '@Taxa de erro (período)', dir: 'Descending' },
        // Sem este corte, uma pergunta respondida uma unica vez por quem
        // errou aparece como 100% de erro no topo da lista.
        corteMinimo: { campo: 'fato_quiz_resposta.resposta_id', minimo: 5 },
      },
      {
        t: 'tableEx', x: 16, y: Y.base, w: 1248, h: H.base,
        titulo: '🏆 Ranking dos colaboradores',
        roles: {
          Values: [
            // A medalha vem primeiro: e o que o olho procura antes do
            // nome. 1o ouro, 2o prata, 3o bronze -- ver a medida Medalha
            // em 07-medidas.dax.
            '@Medalha',
            '@Posição na temporada',
            'fato_quiz_participacao.colaborador',
            'fato_quiz_participacao.area_rotulo',
            '@Rodadas',
            '@Pontos',
            '@Acertos',
            '@Erros',
            '@Aproveitamento médio',
            // O tempo fica visivel porque e criterio de desempate: sem a
            // coluna, duas pessoas com os mesmos pontos aparecem em ordem
            // diferente e ninguem consegue explicar por que.
            '@Tempo total (s)',
          ],
        },
        // Ordenar por Pontos deixava o desempate a cargo do visual, que
        // resolve empate por ordem alfabetica -- podia divulgar como
        // primeiro colocado alguem que o app coloca em segundo. A posicao
        // ja carrega a regra completa (pontos, acertos, tempo, conclusao).
        ordem: { campo: '@Posição na temporada', dir: 'Ascending' },
      },
    ],
    nota:
      'Elegíveis e concluídas ficam AGRUPADAS, não empilhadas — empilhar sugere que ' +
      'somam, e elegíveis já contém concluídas. Em "perguntas com maior erro", aplique ' +
      'no painel Filtros um corte de ≥ 5 respostas: sem ele, uma pergunta respondida ' +
      'uma única vez por alguém que errou aparece como 100% de erro no topo. ' +
      'O ranking é ordenado por "Posição na temporada", não por "Pontos": a posição ' +
      'aplica o desempate oficial do app (pontos → acertos → menos tempo → quem ' +
      'concluiu primeiro). Não troque a ordenação para Pontos — o BI passaria a ' +
      'divulgar como líder alguém que a tela do app coloca em segundo.',
  },

  // ================================================================
  {
    /*
      O DESAFIO PELO LADO DO TREINAMENTO.

      A pagina "Quiz" ao lado responde quem jogou e quem ganhou -- o lado
      JOGO, que e o que faz as pessoas responderem. Esta responde outra
      pergunta: uma rodada com 62% de acerto nao e um placar, e o aviso
      de que 38% do time nao sabe o procedimento que foi perguntado.

      Duas paginas e nao uma porque as leituras tem publicos diferentes:
      a classificacao vai para o grupo, esta vai para a reuniao de
      treinamento -- e misturar as duas faz a segunda desaparecer atras
      da primeira.
    */
    nome: '🎯 Desafio — o que treinar',
    filtros: [
      ...filtros,
      // A hora do dia entra aqui por um motivo especifico: taxa de chute
      // alta concentrada no fim do turno diz que o problema e o MOMENTO
      // em que o desafio esta sendo respondido, nao o conteudo.
      { campo: 'dim_hora.faixa_do_dia', titulo: '🕐 Faixa do dia' },
    ],
    kpis: [
      ['🎯 Taxa de acerto', '@Taxa de acerto'],
      ['💬 Respostas', '@Respostas'],
      ['⚠️ Perguntas em alerta', '@Perguntas em alerta'],
      ['⚡ % de chute', '@% de chute'],
      ['📄 Padrão mais crítico', '@Padrão mais crítico'],
    ],
    visuais: [
      {
        // O ACERTO POR PADRAO DE ORIGEM -- o visual que da endereco a
        // pauta. "62% de acerto" e uma nota; "62% no POP-ARM-001" e uma
        // acao com responsavel.
        t: 'clusteredBarChart', x: 16, y: Y.meio, w: 430, h: H.meio,
        titulo: '📄 Acerto por padrão de origem',
        roles: {
          Category: ['fato_quiz_resposta.origem'],
          Y: ['@Taxa de acerto'],
        },
        // Do PIOR para o melhor: a lista existe para achar o que treinar.
        ordem: { campo: '@Taxa de acerto', dir: 'Ascending' },
        corteMinimo: { campo: 'fato_quiz_resposta.resposta_id', minimo: 5 },
      },
      {
        // A dificuldade CADASTRADA contra a realidade. Uma pergunta
        // "facil" com acerto baixo e enunciado ruim ou padrao nao
        // treinado -- nao e a equipe, e tratar como se fosse ensina a
        // equipe a desconfiar do desafio.
        t: 'clusteredColumnChart', x: 458, y: Y.meio, w: 430, h: H.meio,
        titulo: '📊 Acerto por dificuldade cadastrada',
        roles: {
          Category: ['fato_quiz_resposta.dificuldade_rotulo'],
          Y: ['@Taxa de acerto', '@% de chute'],
        },
      },
      {
        t: 'columnChart', x: 900, y: Y.meio, w: 364, h: H.meio,
        titulo: '⚡ Chute por hora do dia',
        roles: {
          Category: ['dim_hora.hora_rotulo'],
          Y: ['@% de chute'],
        },
      },
      {
        // A PAUTA DA REUNIAO, com a resposta certa ao lado.
        //
        // A resposta vem de dim_quiz_gabarito, e isso e deliberado: sem
        // ela, a reuniao de treinamento tem a pergunta que o time errou
        // e nao tem o que ensinar -- alguem teria de abrir o app para
        // procurar cada uma.
        //
        // ATENCAO: esta tabela mostra o gabarito. Ver a nota do rodape.
        t: 'tableEx', x: 16, y: Y.base, w: 1248, h: H.base,
        titulo: '📋 Perguntas mais erradas — com a resposta certa e o padrão de origem',
        roles: {
          Values: [
            'fato_quiz_resposta.pergunta',
            'fato_quiz_resposta.origem',
            'fato_quiz_resposta.dificuldade_rotulo',
            '@Respostas',
            '@Taxa de acerto',
            '@% de chute',
            // Do FATO, não de uma dimensão à parte: uma dim_quiz_gabarito
            // sem relacionamento mostraria a resposta de TODAS as
            // perguntas em cada linha -- o mesmo erro de dimensão solta
            // que deixou "horas por máquina" com todas iguais.
            'fato_quiz_resposta.resposta_certa',
            'fato_quiz_resposta.explicacao',
          ],
        },
        ordem: { campo: '@Taxa de acerto', dir: 'Ascending' },
        corteMinimo: { campo: 'fato_quiz_resposta.resposta_id', minimo: 5 },
      },
    ],
    nota:
      'ESTA PÁGINA MOSTRA O GABARITO. Ela é para a liderança e para a reunião de treinamento — '
      + 'se o relatório for distribuído ao time inteiro, remova a tabela de resposta certa (ou a '
      + 'tabela dim_quiz_gabarito do modelo), ou o campeonato do mês acaba no primeiro '
      + 'compartilhamento. '
      + 'Abaixo de 60% de acerto a pergunta deixa de ser placar e vira pauta: metade do time não '
      + 'sabe o procedimento. Aplique no painel Filtros um corte de ≥ 5 respostas nos dois visuais '
      + 'de pergunta e no de padrão (o corte vem declarado mas nasce desligado — ver o cabeçalho de '
      + 'gerar-pbip.js): sem ele, uma pergunta respondida uma única vez por quem errou lidera a '
      + 'lista com 0% e o painel perde credibilidade na primeira reunião. '
      + '"% de chute" é errar respondendo em menos de 4 segundos: errar depois de pensar é falta '
      + 'de conhecimento e se treina, errar em quatro segundos é pressa — e cobrar conteúdo de '
      + 'quem só clicou rápido treina a coisa errada. Se o chute se concentrar numa faixa do dia, '
      + 'o problema é o momento em que o desafio está sendo respondido, não o conteúdo.',
  },

  // ================================================================
  {
    nome: '🏆 Super Matinal e Sonho',
    kpis: [
      ['🏆 Quadros publicados', '@Quadros publicados'],
      ['🗓️ Meses com publicação', '@Meses com publicação'],
      ['✅ % Cobertura', '@% Cobertura da publicação'],
      ['👥 Colaboradores', '@Colaboradores'],
      // O rotulo diz a janela porque a medida ignora o filtro de data --
      // e a mesma conta do cartao "Adesao desde o lancamento" da tela de
      // /admin/metricas. Ver 07-medidas.dax.
      ['📲 % Adesão (desde o lançamento)', '@% Adesão'],
    ],
    visuais: [
      {
        t: 'pivotTable', x: 16, y: Y.meio, w: 620, h: H.meio,
        titulo: '🗓️ Cobertura da publicação — o mês que faltou',
        roles: {
          Rows: ['fato_ranking_matinal_cobertura.categoria'],
          Columns: ['fato_ranking_matinal_cobertura.mes_ano'],
          Values: ['@% Cobertura da publicação'],
        },
      },
      {
        t: 'columnChart', x: 648, y: Y.meio, w: 616, h: H.meio,
        titulo: '🏆 Quadros publicados por mês e equipe',
        roles: {
          Category: ['fato_ranking_matinal.mes_rotulo'],
          Y: ['@Quadros publicados'],
          Series: ['fato_ranking_matinal.equipe_rotulo'],
        },
      },
      {
        t: 'tableEx', x: 16, y: Y.base, w: 620, h: H.base,
        titulo: '🖼️ Galeria dos quadros',
        roles: {
          Values: [
            'fato_ranking_matinal.mes_rotulo',
            'fato_ranking_matinal.equipe_rotulo',
            'fato_ranking_matinal.categoria',
            'fato_ranking_matinal.imagem_url',
          ],
        },
      },
      {
        t: 'tableEx', x: 648, y: Y.base, w: 616, h: H.base,
        titulo: '🎯 Sonho da Revenda — contexto',
        roles: {
          Values: [
            'dim_sonho_revenda.ano',
            'dim_sonho_revenda.titulo',
            'dim_sonho_revenda.frase',
            'dim_sonho_revenda.ano_decorrido',
            'dim_sonho_revenda.quadro_indicadores_url',
          ],
        },
      },
    ],
    nota:
      'Esta página é curta porque os dados não permitem mais. ranking_matinal guarda uma ' +
      'IMAGEM por mês/time/categoria: não há colaborador, não há ponto, não há colocação ' +
      '— ranking geral e evolução de pontuação não existem no banco. sonho_revenda guarda ' +
      'título, frase e arquivo: não há meta nem realizado, então "realizado × objetivo" e ' +
      '"% de atingimento" também não existem. Veja "Lacunas" no LEIA-ME.md antes de ' +
      'prometer esta página para a diretoria.',
  },

  // ================================================================
  {
    nome: '🧹 Programa 5S',
    kpis: [
      ['✅ % Conformidade', '@% Conformidade 5S'],
      ['📋 Aderência ao plano', '@% Aderência ao plano',
        'Auditorias REALIZADAS ÷ auditorias PLANEJADAS no período. Mede se o calendário do 5S ' +
        'está sendo cumprido, e não a nota delas. É o indicador que sustenta todos os outros: ' +
        '95% de conformidade em 3 áreas de 19 planejadas não diz nada sobre a revenda — área ' +
        'não auditada não puxa média nenhuma para baixo, ela simplesmente some do relatório. ' +
        'Leia este cartão ANTES do de conformidade.'],
      ['⚠️ Auditorias atrasadas', '@Auditorias atrasadas'],
      ['🔴 NC em aberto', '@NC em aberto',
        'Não conformidades ainda abertas: itens que uma auditoria reprovou, viraram ação no ' +
        'plano e ainda não foram concluídos nem validados. É a fila de trabalho do 5S. ' +
        'Diferente de "Ações atrasadas", que é o pedaço desta fila que já passou do prazo — ' +
        'NC em aberto dentro do prazo é processo funcionando, não problema. Conta a ação, não ' +
        'a auditoria: uma auditoria pode abrir várias.'],
      ['⏰ Ações atrasadas', '@Ações atrasadas'],
    ],
    visuais: [
      {
        // Barras e nao linha: a leitura aqui e comparacao entre areas, e
        // a ordenacao pela pior faz a primeira linha ja responder "onde
        // esta o problema" sem ninguem varrer o grafico inteiro.
        t: 'clusteredBarChart', x: 16, y: Y.meio, w: 500, h: H.meio,
        titulo: '🏢 Conformidade por área',
        roles: {
          Category: ['fato_5s_auditoria.area_5s'],
          Y: ['@% Conformidade 5S'],
        },
        ordem: { campo: '@% Conformidade 5S', dir: 'Ascending' },
      },
      {
        // O radar dos cinco sensos existe na tela do app, mas nao aqui:
        // o Power BI nao traz radar nativo, e instalar visual de
        // terceiro num relatorio que roda pelo gateway do escritorio e
        // dependencia que uma hora some da loja e quebra o arquivo.
        //
        // Reaberto e reafirmado em 19/08/2026: o radar foi pedido, o
        // custo (visual do AppSource) foi posto na mesa e a escolha foi
        // manter o nativo. Nao e esquecimento -- e decisao.
        // Colunas na ordem dos sensos dao a mesma leitura -- a forma do
        // 5S, na sequencia em que a operacao aprende os cinco.
        t: 'clusteredColumnChart', x: 528, y: Y.meio, w: 360, h: H.meio,
        titulo: '🧹 Conformidade por senso',
        roles: {
          Category: ['fato_5s_senso.senso_rotulo'],
          Y: ['@% Conformidade do senso'],
        },
      },
      {
        t: 'lineChart', x: 900, y: Y.meio, w: 364, h: H.meio,
        titulo: '📈 Evolução mensal da conformidade',
        roles: {
          // Coluna de DATA, e nao mes_rotulo (texto): texto ordena em
          // ordem alfabetica -- abril antes de agosto antes de dezembro
          // -- e ainda cria uma categoria (Em branco) para os meses do
          // calendario sem auditoria.
          Category: ['dim_calendario.inicio_mes'],
          Y: ['@% Conformidade 5S'],
        },
      },
      {
        // O corte de 5 avaliacoes esta dentro da medida. Sem ele, um
        // item respondido uma vez e reprovado encabecaria a lista para
        // sempre.
        t: 'tableEx', x: 16, y: Y.base, w: 620, h: H.base,
        // pergunta_curta continua sendo uma frase.
        quebraTexto: 120,
        titulo: '❌ Itens que mais reprovam (mín. 5 avaliações)',
        roles: {
          Values: [
            'dim_5s_pergunta.codigo', 'dim_5s_pergunta.senso_rotulo',
            'dim_5s_pergunta.pergunta_curta', '@Respostas NOK',
            '@% Reprovação do item',
          ],
        },
        ordem: { campo: '@% Reprovação do item', dir: 'Descending' },
      },
      {
        t: 'tableEx', x: 648, y: Y.base, w: 616, h: H.base,
        // 6 colunas em 616: o texto do problema e uma frase inteira e
        // saia cortado no meio.
        quebraTexto: 100,
        titulo: '🛠️ Plano de ação — o que está em aberto',
        roles: {
          Values: [
            'fato_5s_acao.area_5s', 'fato_5s_acao.senso_rotulo',
            'fato_5s_acao.problema', 'fato_5s_acao.responsavel',
            'fato_5s_acao.prazo', 'fato_5s_acao.status_rotulo',
          ],
        },
        ordem: { campo: 'fato_5s_acao.prazo', dir: 'Ascending' },
      },
    ],
    // A ressalva nao e decoracao: sem ela alguem le a serie de 2026
    // inteira como medicao, quando quatro meses entraram por estimativa
    // depois que a planilha de origem se perdeu.
    //
    // Estava como "rodape" e o gerador so renderiza "nota" -- ou seja,
    // este texto nunca chegou a aparecer no relatorio. Descoberto em
    // 23/08/2026, quando as definicoes de "NC em aberto" e "% Aderencia
    // ao plano" foram pedidas: elas ja estariam aqui embaixo.
    nota:
      'Conformidade = itens conformes ÷ (conformes + não conformes); "não se aplica" fica fora da conta. '
      + '"% Aderência ao plano" = auditorias REALIZADAS ÷ auditorias PLANEJADAS no período — mede se o '
      + 'calendário do 5S está sendo cumprido, e não a nota delas: 95% de conformidade em 3 áreas de 19 '
      + 'planejadas não diz nada sobre a revenda. "NC em aberto" = não conformidades (itens do plano de '
      + 'ação abertos numa auditoria) que ainda não foram concluídas nem validadas — é a fila de trabalho '
      + 'do 5S, e "Ações atrasadas" é o pedaço dela que já passou do prazo. '
      + 'Alguns meses de 2026 entraram por estimativa (campo "origem") porque o registro original se perdeu.',
  },

  // ================================================================
  {
    /*
      PRODUTIVIDADE DO ARMAZEM.

      A area inteira estava fora do BI ate setembro/2026 -- justamente a
      que tem indicador diario, meta cadastrada e ranking na tela do app.
      Quem cobrava produtividade de armazem cobrava por print da tela.

      O filtro de TURNO entra na barra desta pagina (e das duas
      seguintes) e sincroniza entre elas pelo campo: escolher T3 aqui
      mantem T3 no recebimento e na empilhadeira. E o recorte que a
      operacao usa para tudo -- escala, meta, cobranca -- e ter de
      reaplica-lo em cada aba era o caminho mais curto para alguem ler o
      numero do turno errado.
    */
    nome: '🧰 Bancada — Seleção e Repack',
    filtros: [
      ...filtrosComColaboradorDaPagina('fato_pa_bancada.colaborador'),
      // Pelo TURNO do lancamento, nao pela hora: o lancamento carrega o
      // turno apontado pela pessoa, e e ele que a escala usa.
      { campo: 'dim_hora.turno_rotulo', titulo: '🕐 Turno' },
    ],
    kpis: [
      ['🧰 Horas de bancada', '@Horas de bancada'],
      ['📅 Média por dia', '@Bancada h/dia'],
      ['🔍 % do tempo na triagem', '@% do tempo na triagem'],
      ['📦 Caixas repackadas', '@Caixas repackadas'],
      ['🔍 Unidades triadas', '@Unidades triadas'],
    ],
    visuais: [
      {
        // Coluna EMPILHADA por etapa.
        //
        // O tipo e `columnChart` -- que E o empilhado no Power BI. O
        // agrupado e `clusteredColumnChart`, e "stackedColumnChart" NAO
        // EXISTE: escrito assim, o Desktop mostra a caixa cinza de
        // "CustomVisualNotFound", que manda procurar um visual
        // personalizado inexistente. O validador agora barra isso.
        t: 'columnChart', x: 16, y: Y.meio, w: 620, h: H.meio,
        titulo: '🧰 Horas de bancada por dia — triagem × reembalagem',
        roles: {
          Category: ['dim_calendario.dia_rotulo'],
          Y: ['@Horas de bancada'],
          Series: ['fato_pa_bancada.etapa_rotulo'],
        },
      },
      {
        // A HORA DO DIA cruzando com dim_hora: clicar numa barra aqui
        // recorta a pagina inteira -- e as outras, pelo filtro
        // sincronizado.
        t: 'columnChart', x: 648, y: Y.meio, w: 616, h: H.meio,
        titulo: '🕐 Quando a bancada trabalha',
        roles: {
          Category: ['dim_hora.hora_rotulo'],
          Y: ['@Horas de bancada'],
        },
      },
      {
        t: 'tableEx', x: 16, y: Y.base, w: 620, h: H.base,
        titulo: '👥 Tempo de bancada por colaborador',
        roles: {
          Values: [
            'fato_pa_bancada.colaborador',
            '@Horas de bancada',
            '@Lançamentos de bancada',
            '@% do tempo na triagem',
            '@Caixas repackadas',
            '@Unidades triadas',
          ],
        },
        ordem: { campo: '@Horas de bancada', dir: 'Descending' },
      },
      {
        t: 'tableEx', x: 648, y: Y.base, w: 616, h: H.base,
        titulo: '🕐 Por turno — carga e divisão do ciclo',
        roles: {
          Values: [
            'fato_pa_bancada.turno_rotulo',
            '@Horas de bancada',
            '@Caixas repackadas',
            '@Repack cx/h',
            '@Unidades triadas',
            '@Seleção un/h',
            '@% do tempo na triagem',
          ],
        },
        ordem: { campo: '@Horas de bancada', dir: 'Descending' },
      },
    ],
    nota:
      'Seleção e Repack são as duas etapas do MESMO ciclo (POP-ARM-001, 7.2 a 7.6): o produto sai '
      + 'do palete avariado, é triado e volta embalado. Por isso a carga da bancada é a soma das '
      + 'duas — e por isso "% do tempo na triagem" é o número que interessa: se a triagem passar a '
      + 'puxar a maior fatia, o gargalo está na QUALIDADE DO QUE CHEGA, não na velocidade de quem '
      + 'embala, e antes disso aparecia como "repack lento". '
      + 'Caixas (repack) e unidades triadas (seleção) NÃO se somam — são unidades diferentes, e por '
      + 'isso vivem em colunas separadas. '
      + '"Média por dia" divide pelos dias que TIVERAM lançamento, não pelos dias do período: contar '
      + 'domingo e dia parado faria a bancada parecer ociosa quando ela apenas não operou. '
      + 'Duas pessoas na bancada ao mesmo tempo somam as duas horas — é carga de trabalho, não '
      + 'relógio de parede. O ritmo por produto está na página seguinte.',
  },

  // ================================================================
  {
    /*
      REPACK POR PRODUTO -- a segunda pagina da bancada.

      A pagina anterior responde "quanto tempo a bancada trabalhou"; esta
      responde "em que ritmo, e em quê". Sao leituras de publicos
      diferentes: a primeira e de escala, esta e de cronoanalise e meta.

      Separadas porque numa pagina so o ritmo por produto disputava
      espaco com a carga do dia, e o que sobrava era uma barra de 25
      produtos ilegivel no canto -- exatamente a queixa que motivou a
      divisao.
    */
    nome: '📦 Repack — produto e família',
    filtros: [
      ...filtrosComColaboradorDaPagina('fato_pa_bancada.colaborador'),
      { campo: 'dim_hora.turno_rotulo', titulo: '🕐 Turno' },
      // Familia e tipo saem do cadastro do SAP (cluster_produto e tipo).
      // Garrafa retornavel e lata descartavel nao embalam no mesmo ritmo,
      // e uma media unica das duas apaga a diferenca.
      { campo: 'fato_pa_bancada.familia', titulo: '🍺 Família' },
      { campo: 'fato_pa_bancada.tipo_rotulo', titulo: '♻️ Tipo' },
    ],
    kpis: [
      ['📦 Repack cx/h', '@Repack cx/h'],
      ['⏱️ Minutos por caixa', '@Minutos por caixa'],
      ['📦 Caixas repackadas', '@Caixas repackadas'],
      ['🧾 Lançamentos', '@Lançamentos de bancada'],
      ['🤲 % avaria no bate palete', '@% avaria no bate palete'],
    ],
    visuais: [
      {
        t: 'clusteredBarChart', x: 16, y: Y.meio, w: 430, h: H.meio,
        titulo: '📦 Ritmo por produto — caixas por hora',
        roles: {
          Category: ['fato_pa_bancada.produto'],
          Y: ['@Repack cx/h'],
        },
        ordem: { campo: '@Repack cx/h', dir: 'Descending' },
        // Sem corte minimo, um produto com um lancamento de dois minutos
        // aparece com taxa absurda no topo da lista.
        corteMinimo: { campo: 'fato_pa_bancada.horas', minimo: 1 },
      },
      {
        t: 'clusteredBarChart', x: 458, y: Y.meio, w: 430, h: H.meio,
        titulo: '🍺 Ritmo por família',
        roles: {
          Category: ['fato_pa_bancada.familia'],
          Y: ['@Repack cx/h'],
        },
        ordem: { campo: '@Repack cx/h', dir: 'Descending' },
      },
      {
        // Por EMBALAGEM, e nao so por produto: 25 produtos com um
        // lancamento cada nao formam padrao nenhum -- a embalagem junta,
        // e lata 350 contra long neck e uma comparacao que se sustenta.
        t: 'clusteredBarChart', x: 900, y: Y.meio, w: 364, h: H.meio,
        titulo: '📦 Ritmo por embalagem',
        roles: {
          Category: ['fato_pa_bancada.embalagem'],
          Y: ['@Repack cx/h'],
        },
        ordem: { campo: '@Repack cx/h', dir: 'Descending' },
      },
      {
        t: 'tableEx', x: 16, y: Y.base, w: 620, h: H.base,
        titulo: '📋 Produto — realizado contra a meta cadastrada',
        roles: {
          Values: [
            'fato_pa_bancada.produto',
            'fato_pa_bancada.familia',
            'fato_pa_bancada.tipo_rotulo',
            '@Caixas repackadas',
            '@Horas de bancada',
            '@Repack cx/h',
            '@Minutos por caixa',
          ],
        },
        // Do mais LENTO para o mais rapido: a lista existe para achar
        // onde o ritmo trava.
        ordem: { campo: '@Repack cx/h', dir: 'Ascending' },
      },
      {
        // O BATE PALETE mora aqui e nao no Despejo: ele e retrabalho de
        // produto avariado, e a pergunta que ele responde -- quanto do
        // palete voltou inteiro ao estoque -- e por SKU, igual ao ritmo
        // de repack ao lado.
        t: 'tableEx', x: 648, y: Y.base, w: 616, h: H.base,
        titulo: '🤲📦 Bate palete — onde está a avaria',
        roles: {
          Values: [
            'fato_pa_bate_palete.produto',
            '@HL batidos',
            '@HL avariados',
            '@% avaria no bate palete',
          ],
        },
        ordem: { campo: '@HL avariados', dir: 'Descending' },
      },
    ],
    nota:
      'Toda taxa desta página é SOMA ÷ SOMA (caixas do recorte ÷ horas do recorte), nunca média das '
      + 'taxas de cada lançamento: um lançamento de dois minutos tem taxa absurda e pesaria igual a '
      + 'um de seis horas. Pelo mesmo motivo, aplique no painel Filtros um corte de ≥ 1 hora '
      + 'apontada nos gráficos de ritmo (o corte vem declarado mas nasce desligado — ver o cabeçalho '
      + 'de gerar-pbip.js). '
      + '"Minutos por caixa" é por CAIXA, não por lançamento — é a mesma conta do cartão do app. '
      + 'A meta por produto é a cadastrada em Admin; produto sem meta simplesmente não entra na '
      + 'comparação, em vez de entrar como zero e derrubar a média de todo mundo. '
      + 'No bate palete, o % sai da soma sobre a soma: a média dos percentuais trataria um lote de '
      + '2 HL igual a um de 200, e o lote pequeno é sempre o de percentual extremo.',
  },

  // ================================================================
  {
    /*
      DESPEJO.

      Pagina propria porque a bombona nao cabia em rodape de outra: ela e
      o unico numero da tela que NAO segue filtro, e um cartao que nao
      reage ao filtro precisa de espaco para explicar por que -- espremido
      entre repack e abastecimento, ele so parecia quebrado.
    */
    nome: '🫗 Despejo',
    filtros: [
      ...filtrosComColaboradorDaPagina('fato_pa_despejo.colaborador'),
      { campo: 'dim_hora.turno_rotulo', titulo: '🕐 Turno' },
      { campo: 'fato_pa_despejo.embalagem_despejo', titulo: '🧴 Embalagem' },
    ],
    kpis: [
      // A bombona vem PRIMEIRO e o rotulo diz que ela nao segue filtro:
      // e o numero que decide QUANDO descartar, e e um so para o armazem.
      ['🪣 Na bombona agora (sem filtro)', '@Na bombona (L)'],
      ['📊 % da bombona', '@% da bombona'],
      ['📆 Dias sem esvaziar', '@Dias sem esvaziar'],
      ['🫗 Litros no recorte', '@Litros despejados'],
      ['⚡ Litros por hora', '@Litros por hora'],
    ],
    visuais: [
      {
        t: 'columnChart', x: 16, y: Y.meio, w: 430, h: H.meio,
        titulo: '📆 Litros despejados por dia',
        roles: {
          Category: ['dim_calendario.dia_rotulo'],
          Y: ['@Litros despejados'],
        },
      },
      {
        t: 'clusteredBarChart', x: 458, y: Y.meio, w: 430, h: H.meio,
        titulo: '🧴 Litros por hora, por embalagem',
        roles: {
          Category: ['fato_pa_despejo.embalagem_despejo'],
          Y: ['@Litros por hora'],
        },
        ordem: { campo: '@Litros por hora', dir: 'Descending' },
      },
      {
        t: 'columnChart', x: 900, y: Y.meio, w: 364, h: H.meio,
        titulo: '🕐 Quando se despeja',
        roles: {
          Category: ['dim_hora.hora_rotulo'],
          Y: ['@Litros despejados'],
        },
      },
      {
        t: 'tableEx', x: 16, y: Y.base, w: 620, h: H.base,
        titulo: '👥 Despejo por colaborador e turno',
        roles: {
          Values: [
            'fato_pa_despejo.colaborador',
            'fato_pa_despejo.turno_rotulo',
            '@Litros despejados',
            '@Horas de despejo',
            '@Litros por hora',
            '@Lançamentos de despejo',
          ],
        },
        ordem: { campo: '@Litros despejados', dir: 'Descending' },
      },
      {
        // O HISTORICO DE DESCARTE -- o que o app passou a registrar em
        // 09/09/2026 e nao existia em lugar nenhum. "% no descarte" muito
        // abaixo de 100% e viagem sobrando na rota do residuo; bombona
        // parada cheia e risco ambiental. Os dois lados sao decisao.
        t: 'tableEx', x: 648, y: Y.base, w: 616, h: H.base,
        titulo: '🪣 Descartes — a bombona foi cheia ou pela metade?',
        roles: {
          Values: [
            'fato_pa_esvaziamento.data',
            'fato_pa_esvaziamento.colaborador',
            'fato_pa_esvaziamento.turno_rotulo',
            'fato_pa_esvaziamento.litros_no_momento#soma',
            '@% médio no descarte',
          ],
        },
        ordem: { campo: 'fato_pa_esvaziamento.data', dir: 'Descending' },
      },
    ],
    nota:
      'OS TRÊS PRIMEIROS CARTÕES NÃO SEGUEM OS FILTROS, e isso é o desenho. A bombona é um '
      + 'recipiente físico: não tem turno nem dono, e não existe "quanto tinha nela em agosto". '
      + 'Filtrada por turno, o T1 veria a bombona pela metade e o T2 vazia — sendo a mesma bombona. '
      + 'A conta começa no último esvaziamento registrado no app. O filtro de Revenda continua '
      + 'valendo: cada revenda tem a sua. '
      + '"Litros no recorte" (4º cartão) é o oposto: esse sim segue período, turno, pessoa e '
      + 'embalagem — é produção, não nível. '
      + '"% no descarte" muito abaixo de 100% é viagem sobrando na rota do resíduo; "dias sem '
      + 'esvaziar" alto com a bombona cheia é risco ambiental. Nenhum dos dois aparece em '
      + '"litros despejados no mês".',
  },

  // ================================================================
  {
    /*
      ABASTECIMENTO DO PICKING E RESSUPRIMENTO.

      Duas coisas na mesma pagina porque sao as duas metades do mesmo
      movimento: o abastecimento mede o VOLUME que chegou na area, e o
      ressuprimento mede o TEMPO que se perdeu entre pedir, transportar e
      abastecer. Separadas, cada uma responde meia pergunta.

      As tres esperas tem responsaveis DIFERENTES, e e por isso que elas
      aparecem em colunas separadas em vez de um "tempo total": um ciclo
      de 40 minutos com 35 de espera nao se resolve treinando quem
      abastece.
    */
    nome: '🧃 Abastecimento e Ressuprimento',
    filtros: [
      ...filtrosComColaboradorDaPagina('fato_pa_abastecimento.colaborador', '👤 Quem abasteceu'),
      { campo: 'dim_hora.turno_rotulo', titulo: '🕐 Turno' },
      { campo: 'fato_pa_abastecimento.tipo_rotulo', titulo: '🔄 Tipo' },
    ],
    kpis: [
      ['🧃 HL abastecidos', '@HL abastecidos'],
      ['⚡ HL por hora', '@HL por hora'],
      ['🧾 Sessões', '@Sessões de abastecimento'],
      ['⏱️ Ciclo médio (min)', '@Ciclo médio (min)'],
      ['⏳ % do ciclo esperando', '@% do ciclo esperando'],
    ],
    visuais: [
      {
        t: 'columnChart', x: 16, y: Y.meio, w: 430, h: H.meio,
        titulo: '📆 HL abastecidos por dia — completo × pontual',
        roles: {
          Category: ['dim_calendario.dia_rotulo'],
          Y: ['@HL abastecidos'],
          Series: ['fato_pa_abastecimento.tipo_rotulo'],
        },
      },
      {
        // ONDE o tempo do ciclo e gasto, fase a fase. E o grafico que
        // muda a conversa de "quem abastece esta lento" para "a
        // empilhadeira demora a aceitar".
        t: 'clusteredColumnChart', x: 458, y: Y.meio, w: 430, h: H.meio,
        titulo: '⏳ Onde o ciclo do ressuprimento é gasto',
        roles: {
          Category: ['fato_pa_ressuprimento.tipo_rotulo'],
          Y: [
            '@Espera pela empilhadeira (min)',
            '@Transporte (min)',
            '@Espera pelo ajudante (min)',
          ],
        },
      },
      {
        t: 'columnChart', x: 900, y: Y.meio, w: 364, h: H.meio,
        titulo: '🕐 Quando se abastece',
        roles: {
          Category: ['dim_hora.hora_rotulo'],
          Y: ['@HL abastecidos'],
        },
      },
      {
        t: 'tableEx', x: 16, y: Y.base, w: 620, h: H.base,
        titulo: '🏗️ Quem transportou — o empilhador',
        roles: {
          Values: [
            'fato_pa_ressuprimento.empilhador',
            '@Ressuprimentos',
            '@Espera pela empilhadeira (min)',
            '@Transporte (min)',
            '@Ciclo médio (min)',
          ],
        },
        // Do mais lento para o mais rapido: e onde a fila se forma.
        ordem: { campo: '@Espera pela empilhadeira (min)', dir: 'Descending' },
      },
      {
        t: 'tableEx', x: 648, y: Y.base, w: 616, h: H.base,
        titulo: '🧾 Quem pediu — o solicitante',
        roles: {
          Values: [
            'fato_pa_ressuprimento.solicitante',
            '@Ressuprimentos',
            '@% urgentes',
            '@% cancelados',
            '@Ciclo médio (min)',
          ],
        },
        ordem: { campo: '@Ressuprimentos', dir: 'Descending' },
      },
    ],
    nota:
      'As três esperas têm DONOS diferentes e por isso não viram um "tempo total": espera pela '
      + 'empilhadeira é do pedido até alguém aceitar, transporte é do aceite até o último item na '
      + 'área, espera pelo ajudante é da área até começar a abastecer. Um ciclo de 40 minutos com '
      + '35 de espera não se resolve treinando quem abastece — e é isso que "% do ciclo esperando" '
      + 'diz num número só. '
      + 'Completo e pontual NÃO se misturam na média: uma varredura da manhã de 2h é normal, um '
      + 'chamado pontual de 2h é um problema. Somados, o "ciclo médio" não descreve nenhum dos '
      + 'dois — e é justamente o número que alguém usaria para cobrar a pessoa errada. Use o filtro '
      + 'de Tipo. '
      + 'Se "% urgentes" for a maioria, o campo perdeu o significado e a fila voltou a ser ordem de '
      + 'chegada com outro nome. '
      + 'O filtro de Colaborador alcança esta página pelo SOLICITANTE (é o dono do pedido); '
      + 'empilhador e ajudante são atributos, com as tabelas próprias abaixo.',
  },

  // ================================================================
  {
    /*
      RECEBIMENTO DE CARRETAS.

      A pagina responde tres perguntas que a operacao faz em ordem:
      quanto tempo a carreta ocupou (TMA), ONDE esse tempo foi (as fases)
      e DE QUEM e o tempo (conferente, portaria, transportadora,
      motorista).

      O histograma de chegada esta aqui e nao no fim porque ele muda a
      conversa: um TMA alto com cinco carretas chegando juntas as 7h e
      problema de FILA, e fila nao se resolve cobrando velocidade de
      conferente.
    */
    nome: '🚛 Recebimento de Carretas',
    filtros: [
      ...filtrosComColaboradorDaPagina('fato_carreta.conferente', '👤 Conferente'),
      { campo: 'dim_hora.turno_rotulo', titulo: '🕐 Turno' },
      // A transportadora vira segmentacao propria: e a entidade externa
      // da pagina, e a conversa com ela e diferente da conversa interna.
      { campo: 'fato_carreta.transportadora', titulo: '🚚 Transportadora' },
    ],
    kpis: [
      ['🚛 Carretas finalizadas', '@Carretas finalizadas'],
      // A UNIDADE VAI NO ROTULO. Sem ela, "TMA médio 78" foi lido como
      // percentual -- e 78 min e 78% sao conclusoes opostas sobre a
      // mesma operacao. Todo cartao de tempo desta pagina diz (min).
      ['⏱️ TMA médio (min)', '@TMA médio (min)'],
      // O P90 ao lado da media, e nao escondido numa tabela: sao as duas
      // carretas de cinco horas que geram a reclamacao e a estadia, e
      // elas somem dentro de uma media feita com vinte carretas rapidas.
      ['📈 TMA no pior 10% (min)', '@TMA P90 (min)'],
      // O LADO QUE GERA ACAO (10/09/2026): "14 carretas estouraram" e
      // uma frase que leva a conversa; "82% dentro" leva a um aceno. O
      // % dentro saiu porque os dois somam 100% -- mostrar os dois e
      // repetir o mesmo numero de costas.
      ['🚫 Carretas fora da meta', '@Carretas fora da meta'],
      ['🎯 % fora da meta', '@% fora da meta de TMA'],
      ['💥 % de avaria (paletes)', '@% de avaria'],
    ],
    visuais: [
      {
        t: 'columnChart', x: 16, y: Y.meio, w: 430, h: H.meio,
        titulo: '🕐 Quando as carretas chegam',
        roles: {
          Category: ['dim_hora.hora_rotulo'],
          Y: ['@Carretas finalizadas'],
        },
      },
      {
        // A MESMA hora no eixo, agora com o TMA: o pico de chegada e o
        // pico de TMA costumam ser o mesmo, e ver os dois lado a lado e
        // o que prova que o problema e fila e nao velocidade.
        t: 'lineChart', x: 458, y: Y.meio, w: 430, h: H.meio,
        titulo: '⏱️ TMA médio por hora de chegada',
        roles: {
          Category: ['dim_hora.hora_rotulo'],
          Y: ['@TMA médio (min)', '@Meta de TMA (min)'],
        },
      },
      {
        t: 'clusteredBarChart', x: 900, y: Y.meio, w: 364, h: H.meio,
        titulo: '💥 % de avaria por transportadora',
        roles: {
          Category: ['fato_carreta.transportadora'],
          Y: ['@% de avaria'],
        },
        ordem: { campo: '@% de avaria', dir: 'Descending' },
        // Duas carretas conferidas nao formam padrao. Sem o corte, a
        // transportadora que entregou uma unica carreta com um palete
        // batido lidera a lista com 100%.
        corteMinimo: { campo: 'fato_carreta.carreta_id', minimo: 3 },
      },
      {
        t: 'tableEx', x: 16, y: Y.base, w: 620, h: H.base,
        titulo: '👤 TMA por conferente e portaria',
        roles: {
          Values: [
            'fato_carreta.conferente',
            '@Carretas finalizadas',
            '@TMA médio (min)',
            '@Espera na portaria (min)',
            '@Descarga (min)',
            '@% dentro da meta de TMA',
          ],
        },
        // Do mais LENTO para o mais rapido: a lista existe para achar
        // onde o tempo esta sendo perdido, e isso mora no topo.
        ordem: { campo: '@TMA médio (min)', dir: 'Descending' },
      },
      {
        t: 'tableEx', x: 648, y: Y.base, w: 616, h: H.base,
        titulo: '🚚 Transportadora e motorista — tempo e avaria',
        roles: {
          Values: [
            'fato_carreta.transportadora',
            'fato_carreta.motorista',
            '@Carretas finalizadas',
            '@TMA médio (min)',
            // O atraso da CHEGADA separa "a carreta atrasou" de "a
            // operacao demorou", que se confundem dentro do TMA. O dado
            // estava no banco desde a migracao 057 e nunca tinha sido
            // comparado.
            '@Atraso do transportador (min)',
            '@% carretas atrasadas',
            '@% de avaria',
          ],
        },
        ordem: { campo: '@TMA médio (min)', dir: 'Descending' },
      },
    ],
    nota:
      'O TMA começa no horário AGENDADO quando havia agendamento, senão na chegada apontada pela '
      + 'portaria; termina no fim da descarga, ou no fim do carregamento se a carreta voltou '
      + 'carregada de AG. A CONFERÊNCIA nunca entra: a carreta não espera por ela. '
      + '"% de avaria" conta PALETES — um palete com uma garrafa quebrada conta inteiro, por isso '
      + 'o número fica na casa das dezenas; ele diz quantos paletes foram tocados por avaria, não '
      + 'quanto do volume veio avariado, e só carretas com conferência lançada entram na conta. '
      + 'Em "% de avaria por transportadora", aplique no painel Filtros um corte de ≥ 3 carretas (o '
      + 'corte vem declarado mas nasce desligado — ver o cabeçalho de gerar-pbip.js): sem ele, a '
      + 'transportadora que entregou uma única carreta com um palete batido lidera a lista com 100%. '
      + 'Nas listas por transportadora e motorista, confira o número de carretas antes de concluir: '
      + 'uma média feita com uma carreta é ruído, e a barra a desenha do mesmo tamanho de um padrão '
      + 'de quarenta. O turno da carreta é DERIVADO do início do atendimento (ou da chegada) — a '
      + 'tabela não tem coluna de turno.',
  },

  // ================================================================
  {
    /*
      EMPILHADEIRA.

      Duas leituras que se confundem e nao deviam: HORAS DE MOTOR
      (horimetro) e horas de operacao aberta. Quem abre as 6h e fecha as
      15h pode ter rodado tres horas, e a pagina inteira e construida em
      cima do horimetro por isso.

      O "% aproveitamento do apontamento" existe para nao deixar a
      diferenca virar conclusao errada: abaixo de uns 30% quase nunca e
      maquina ociosa, e operacao aberta e esquecida.
    */
    nome: '🏗️ Empilhadeira',
    filtros: [
      ...filtrosComColaboradorDaPagina('fato_empilhadeira_operacao.colaborador', '👤 Operador'),
      { campo: 'dim_hora.turno_rotulo', titulo: '🕐 Turno' },
      /*
        A MAQUINA VEM DO FATO, e nao de uma dim_empilhadeira.

        Era `dim_empilhadeira.empilhadeira`, e o resultado foi o defeito
        que o dono viu: "horas por maquina com todas iguais". A dimensao
        entrou ligada so em dim_revenda (o fato chega la pela chave
        composta), entao ela nao filtrava o fato -- cada maquina exibia o
        TOTAL GERAL repetido. Nao parece erro de modelo; parece dado
        errado, que e o pior tipo de bug num BI.

        Ligar dim -> fato criaria uma segunda rota ate dim_revenda, e o
        Power BI resolve ambiguidade desativando um relacionamento em
        silencio. A saida certa e a que o resto do modelo ja usa: o fato
        carrega `empilhadeira` denormalizada.
      */
      { campo: 'fato_empilhadeira_operacao.empilhadeira', titulo: '🏗️ Máquina' },
    ],
    kpis: [
      ['⏱️ Horas de horímetro', '@Horas de horímetro'],
      ['✅ Operações encerradas', '@Operações encerradas'],
      ['📐 Aproveitamento', '@% aproveitamento do apontamento'],
      ['⛽ Horas por botijão', '@Horas por botijão'],
      ['💰 Custo do gás (R$)', '@Custo do gás (R$)'],
    ],
    visuais: [
      {
        t: 'columnChart', x: 16, y: Y.meio, w: 430, h: H.meio,
        titulo: '🕐 Quando a empilhadeira roda — horas de motor por hora do dia',
        roles: {
          Category: ['dim_hora.hora_rotulo'],
          Y: ['@Horas de horímetro'],
        },
      },
      {
        t: 'clusteredBarChart', x: 458, y: Y.meio, w: 430, h: H.meio,
        titulo: '🏗️ Horas por máquina',
        roles: {
          // Do FATO, não de dim_empilhadeira -- ver o comentário no
          // filtro de Máquina acima. Era daqui que saía o "todas iguais".
          Category: ['fato_empilhadeira_operacao.empilhadeira'],
          Y: ['@Horas de horímetro'],
        },
        ordem: { campo: '@Horas de horímetro', dir: 'Descending' },
      },
      {
        t: 'clusteredBarChart', x: 900, y: Y.meio, w: 364, h: H.meio,
        titulo: '👤 Horas por operador',
        roles: {
          Category: ['fato_empilhadeira_operacao.colaborador'],
          Y: ['@Horas de horímetro'],
        },
        ordem: { campo: '@Horas de horímetro', dir: 'Descending' },
      },
      {
        t: 'tableEx', x: 16, y: Y.base, w: 620, h: H.base,
        titulo: '👥 Operador — horas, duração e qualidade do apontamento',
        roles: {
          Values: [
            'fato_empilhadeira_operacao.colaborador',
            '@Operações encerradas',
            '@Horas de horímetro',
            '@Duração média (h)',
            '@% aproveitamento do apontamento',
            // Nao e produtividade, e confianca no numero da linha: quando
            // o lider fecha no dia seguinte, o horimetro final e o que ele
            // achou na maquina e o consumo todo vai para quem abriu.
            '@Encerradas por terceiro',
          ],
        },
        ordem: { campo: '@Horas de horímetro', dir: 'Descending' },
      },
      {
        /*
          O CICLO DO BOTIJAO, com as duas pontas.

          A versao anterior listava as TROCAS: cada linha um carimbo
          solto, e quem lia tinha de subtrair uma linha da outra na
          cabeca para saber quanto o botijao durou. Agora cada linha e um
          ciclo FECHADO -- a troca que abriu, a que fechou, o horimetro
          de cada ponta e as horas rendidas.

          `dias_do_botijao` ao lado das horas separa "rendeu pouco" de "a
          maquina rodou muito": 8h em dois dias e 8h em duas semanas sao
          operacoes diferentes com o mesmo consumo.
        */
        t: 'tableEx', x: 648, y: Y.base, w: 616, h: H.base,
        titulo: '⛽ Ciclo do botijão — da troca anterior até esta',
        roles: {
          Values: [
            'fato_empilhadeira_ciclo_gas.empilhadeira',
            'fato_empilhadeira_ciclo_gas.inicio_em',
            'fato_empilhadeira_ciclo_gas.fim_em',
            'fato_empilhadeira_ciclo_gas.horimetro_inicio#soma',
            'fato_empilhadeira_ciclo_gas.horimetro_fim#soma',
            '@Horas por botijão',
            '@Dias por botijão',
            'fato_empilhadeira_ciclo_gas.trocou_no_fim',
          ],
        },
        ordem: { campo: 'fato_empilhadeira_ciclo_gas.fim_em', dir: 'Descending' },
      },
    ],
    nota:
      'Todas as horas desta página vêm do HORÍMETRO (motor rodando), nunca do tempo entre abrir e '
      + 'fechar a operação — quem abre às 6h e fecha às 15h pode ter rodado três horas. '
      + '"Aproveitamento" é a razão entre as duas: abaixo de uns 30% quase nunca é máquina ociosa, '
      + 'é operação aberta e esquecida, e a decisão muda de "cortar máquina" para "fechar '
      + 'apontamento". "Encerradas por terceiro" mede confiança, não desempenho: nesses casos o '
      + 'horímetro final é o que alguém encontrou na máquina depois. '
      + 'O CICLO do botijão (horas por P20, rateio por operador) NÃO está aqui de propósito — ele '
      + 'atravessa turnos e operadores, e qualquer segmentação desta página o quebraria pelo meio, '
      + 'fazendo o botijão render mais do que rende. Essa análise fica na tela de gás do app.',
  },

  // ================================================================
  {
    // Indice do relatorio e do app na mesma pagina. Serve a duas coisas:
    // orienta quem abre o BI pela primeira vez, e mostra a lideranca o
    // que existe no app -- inclusive o que esta oculto no menu, que e
    // uma informacao que ninguem tem hoje sem abrir o admin.
    nome: '🧭 Mapa do App',
    // Oculta: e ferramenta de quem administra o app, nao painel de
    // gestao. Continua acessivel pela lista de paginas no modo de edicao.
    oculta: true,
    kpis: [],
    visuais: [
      {
        t: 'tableEx', x: 16, y: 152, w: 1248, h: 310,
        titulo: '📱 Menu do app — o que o colaborador vê no celular',
        roles: {
          Values: [
            'dim_menu_app.ordem',
            'dim_menu_app.item',
            'dim_menu_app.caminho',
            'dim_menu_app.link',
            'dim_menu_app.situacao',
          ],
        },
        ordem: { campo: 'dim_menu_app.ordem', dir: 'Ascending' },
      },
      {
        t: 'clusteredBarChart', x: 16, y: 478, w: 616, h: 188,
        titulo: '🔒 Itens no ar × ocultos',
        roles: {
          Category: ['dim_menu_app.situacao'],
          Y: ['dim_menu_app.chave#contagem'],
        },
      },
    ],
    nota:
      'Os links só funcionam depois de definir bi.url_app() no 01-camada-semantica.sql — ' +
      'enquanto estiver nulo, a coluna Link fica vazia e vale o Caminho. ' +
      'O menu é editável pelo admin do app, então esta página acompanha sozinha.',
  },

  // ================================================================
  {
    nome: '🔎 Detalhe',
    oculta: true,
    // Destino de drill-through a partir de qualquer visual das outras
    // paginas. E o que responde "de onde saiu esse numero" sem poluir as
    // paginas executivas.
    drillthrough: 'dim_colaborador.colaborador',
    kpis: [],
    visuais: [
      {
        t: 'tableEx', x: 16, y: 76, w: 616, h: 300,
        titulo: '📦 Contagens (AG)',
        roles: {
          Values: [
            'fato_ag_contagem.data', 'fato_ag_contagem.colaborador_nome',
            'fato_ag_contagem.tipo', 'fato_ag_contagem.formato',
            'fato_ag_contagem.status', '@Total em caixas', '@Linhas lançadas',
          ],
        },
      },
      {
        t: 'tableEx', x: 648, y: 76, w: 616, h: 300,
        titulo: '⚖️ Conciliação (AG)',
        roles: {
          Values: [
            'fato_ag_conciliacao.data', 'fato_ag_conciliacao.item',
            'fato_ag_conciliacao.contado#soma', 'fato_ag_conciliacao.parque#soma',
            'fato_ag_conciliacao.diferenca#soma', 'fato_ag_conciliacao.resultado',
          ],
        },
      },
      {
        t: 'tableEx', x: 16, y: 392, w: 616, h: 312,
        titulo: '📝 Feedbacks e 5 Porquês',
        roles: {
          Values: [
            'fato_cinco_porques.data', 'fato_cinco_porques.colaborador',
            'fato_cinco_porques.rota', 'fato_cinco_porques.problema',
            'fato_cinco_porques.causa_raiz', 'fato_cinco_porques.acao_sugerida',
            'fato_cinco_porques.status', 'fato_cinco_porques.tratativa_status',
          ],
        },
      },
      {
        t: 'tableEx', x: 648, y: 392, w: 616, h: 312,
        titulo: '🧠 Quiz — respostas',
        roles: {
          Values: [
            'fato_quiz_resposta.data', 'fato_quiz_resposta.colaborador',
            'fato_quiz_resposta.rodada', 'fato_quiz_resposta.pergunta',
            'fato_quiz_resposta.correta', 'fato_quiz_resposta.tempo_segundos#soma',
          ],
        },
      },
    ],
  },
];

/*
  OS BLOCOS (11/09/2026, pedido do dono: "organizar as paginas por
  blocos, Distribuicao Urbana, Armazem Logistico e Gente").

  O Power BI nao tem pasta nem grupo de paginas. O bloco vira duas coisas
  que ele tem: a ORDEM das abas (um bloco inteiro antes do outro) e um
  prefixo no nome exibido ("DU · 📝 Feedback da Rota"). O id de cada pagina
  continua saindo do `nome` acima, entao drill-through e navegacao nao
  mudam.

  Pagina visivel fora de qualquer bloco vai para o fim, sem prefixo, e o
  gerador avisa -- e o lembrete para classificar a pagina nova.

  Ativo de Giro e Conciliacao ficam no Armazem (quem conta o parque e o
  armazem); Programa 5S fica em Gente (e o programa da empresa inteira; o
  5S DO ARMAZEM e outra coisa, dentro da Produtividade).
*/
const blocos = [
  {
    sigla: 'DU',
    nome: 'Distribuição Urbana',
    paginas: ['📝 Feedback da Rota', '🔍 Cinco Porquês'],
  },
  {
    sigla: 'AL',
    nome: 'Armazém Logístico',
    paginas: [
      '📦 Ativo de Giro',
      '⚖️ Conciliação do AG',
      '🧰 Bancada — Seleção e Repack',
      '📦 Repack — produto e família',
      '🫗 Despejo',
      '🧃 Abastecimento e Ressuprimento',
      '🚛 Recebimento de Carretas',
      '🏗️ Empilhadeira',
    ],
  },
  {
    sigla: 'Gente',
    nome: 'Gente',
    paginas: [
      '📣 Comunicados',
      '📅 Cronograma da Comunicação',
      '🧠 Quiz',
      '🎯 Desafio — o que treinar',
      '🏆 Super Matinal e Sonho',
      '🧹 Programa 5S',
    ],
  },
];

module.exports = { paginas, filtros, blocos, Y, H };
