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
  { campo: 'dim_colaborador.colaborador', titulo: '👤 Colaborador' },
];

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
  // ================================================================
  {
    // Os emoji sao os do menu do app (public.menu_itens), para quem abre
    // o BI reconhecer as paginas pelo mesmo simbolo que ve no celular.
    // Onde o app nao tem item correspondente -- AG, Quiz, 5 Porques --
    // escolhi um que nao colide com os existentes.
    nome: '🏠 Visão Geral',
    kpis: [
      ['👥 Colaboradores', '@Colaboradores'],
      // O rotulo diz a janela porque a medida ignora o filtro de data --
      // e a mesma conta do cartao "Adesao desde o lancamento" da tela de
      // /admin/metricas. Ver 07-medidas.dax.
      ['📲 % Adesão (desde o lançamento)', '@% Adesão'],
      ['👆 Interações', '@Interações'],
      ['📂 Módulos usados', '@Módulos usados'],
      ['⚠️ Aguardando tratativa', '@Aguardando tratativa'],
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
    filtros: [...filtros, { campo: 'dim_calendario.ano_mes', titulo: '📆 Mês' }],
    // O filtro de pagina parque_confiavel = True saiu daqui, e o mesmo
    // filtro saiu das medidas de conciliacao (ver 07-medidas.dax).
    //
    // O parque e FIXO por desenho: e o cadastro do que a revenda tem, e
    // a conciliacao e a contagem do dia contra esse cadastro. Exigir
    // "parque atualizado no mesmo dia da contagem" escondia a pagina
    // inteira -- e visual vazio nao avisa nada, so parece que nao ha
    // divergencia.
    kpis: [
      ['🔢 Ocorrências de contagem', '@Ocorrências de contagem'],
      ['🗓️ % Dias com contagem', '@% Dias com contagem'],
      ['👥 Contadores', '@Contadores'],
      ['✅ % Lançado no dia', '@% Lançado no dia'],
      // Substituiu "Recontagens pendentes": os tres visuais de volume
      // desta pagina falam de UM dia, e nao dizer qual e esconder a
      // metade da informacao.
      ['📅 Último dia contado', '@Último dia contado'],
    ],
    // Duas faixas em vez das tres do padrao: esta pagina responde a tres
    // perguntas diferentes (a rotina esta sendo mantida? quem sustenta?
    // o que o Painel do app mostra?) e cada uma precisa de espaco proprio.
    visuais: [
      // --- faixa 1: aderencia e quem sustenta -----------------------
      {
        // Tabela, e nao grafico de barras: a pergunta aqui e "houve
        // contagem em todo dia util?", e buraco em tabela e mais facil
        // de ver do que barra baixa em serie longa.
        t: 'tableEx', x: 16, y: Y.meio, w: 620, h: 200,
        titulo: '📅 Aderência por dia — ocorrências de contagem',
        roles: {
          Values: [
            'dim_calendario.data',
            '@Ocorrências de contagem',
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
        t: 'tableEx', x: 648, y: Y.meio, w: 616, h: 200,
        titulo: '🏆 Ranking de desempenho no AG — por disciplina',
        roles: {
          Values: [
            'fato_ag_contagem.colaborador_nome',
            '@Dias com contagem',
            '@% Dias com contagem',
            '@% Lançado no dia',
            '@Atraso médio (dias)',
            '@Ocorrências de contagem',
          ],
        },
        ordem: { campo: '@% Dias com contagem', dir: 'Descending' },
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
        titulo: '🧺 Garrafeira sem garrafa por colaborador — último dia',
        roles: {
          Values: [
            'fato_ag_contagem.colaborador_nome',
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
        titulo: '⚖️ Conciliação do dia — contado × parque',
        roles: {
          Values: [
            'fato_ag_conciliacao.item',
            '@Contado',
            '@Parque',
            '@Diferença',
            // A coluna "resultado" saiu: Falta/Sobra/Bateu e o sinal da
            // diferenca dito de novo, e o espaco vale mais para a data
            // do parque, que e o que diz se dá para confiar na conta.
            'fato_ag_conciliacao.parque_atualizado_em',
          ],
        },
        ordem: { campo: '@Diferença', dir: 'Ascending' },
      },
    ],
    nota:
      'VOLUME AQUI É FOTOGRAFIA, NÃO SOMA: os três visuais de baixo leem o último dia ' +
      'contado dentro do que estiver filtrado — mês, período ou um dia só. AG é contagem ' +
      'de estoque, e somar dois dias conta o mesmo palete duas vezes. Aderência e ranking, ' +
      'esses sim, somam o intervalo, porque medem frequência e não quantidade. Use o filtro ' +
      'de Mês para ler "% Dias com contagem": o denominador são os dias úteis já decorridos ' +
      'do que estiver selecionado, então com o ano inteiro aberto todo mundo parece ruim.',
  },

  // ================================================================
  {
    nome: '📝 Feedback da Rota',
    kpis: [
      ['📝 Feedbacks', '@Feedbacks'],
      ['★ Nota média (0 a 3)', '@Nota média'],
      ['🙂 % Satisfação', '@% Satisfação'],
      ['😞 % Notas ruins', '@% Notas ruins'],
      ['🚚 Rota mais crítica', '@Rota mais crítica'],
    ],
    visuais: [
      {
        t: 'lineChart', x: 16, y: Y.meio, w: 620, h: H.meio,
        titulo: '📈 Evolução da nota média',
        roles: { Category: ['dim_calendario.data'], Y: ['@Nota média'] },
      },
      {
        t: 'columnChart', x: 648, y: Y.meio, w: 290, h: H.meio,
        titulo: '📊 Distribuição das notas',
        roles: { Category: ['fato_feedback_rota.nota_rotulo'], Y: ['@Feedbacks'] },
        ordem: { campo: 'fato_feedback_rota.nota', dir: 'Ascending' },
      },
      {
        t: 'clusteredBarChart', x: 950, y: Y.meio, w: 314, h: H.meio,
        titulo: '⚠️ Principais problemas relatados',
        roles: {
          Category: ['fato_feedback_ocorrencia.ocorrencia'],
          Y: ['@Feedbacks com ocorrência'],
        },
        ordem: { campo: '@Feedbacks com ocorrência', dir: 'Descending' },
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
      'Ordene a distribuição pelo VALOR da nota, não pela contagem — escala ordinal ' +
      'reordenada por frequência deixa de ser legível como escala. "Rota mais crítica" ' +
      'já exige ≥ 3 feedbacks: sem esse corte, uma rota com um único feedback ruim ' +
      'vira "a pior da revenda" na primeira reunião.',
  },

  // ================================================================
  {
    nome: '🔍 Cinco Porquês',
    kpis: [
      ['🔍 Análises', '@Análises'],
      ['✅ % Conclusão', '@% Conclusão'],
      ['🏁 % Chegou ao 5º', '@% Chegou ao 5º porquê'],
      ['⚠️ Aguardando tratativa', '@Aguardando tratativa'],
      ['⏱️ Horas até resposta', '@Horas médias até resposta'],
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
        // Problema, causa raiz e acao sugerida sao frases inteiras.
        quebraTexto: 200,
        titulo: '📋 Problema · Causa · Ação — a pauta da reunião',
        roles: {
          Values: [
            'fato_cinco_porques_matriz.problema',
            'fato_cinco_porques_matriz.categoria',
            'fato_cinco_porques_matriz.causa_raiz',
            'fato_cinco_porques_matriz.acao_sugerida',
            'fato_cinco_porques_matriz.ocorrencias#soma',
            'fato_cinco_porques_matriz.tratadas#soma',
          ],
        },
        ordem: { campo: 'fato_cinco_porques_matriz.ocorrencias#soma', dir: 'Descending' },
      },
    ],
    nota:
      '"Horas médias até resposta" é o indicador de saúde do módulo, não de volume. ' +
      'Análise concluída que ninguém responde ensina o time a não preencher a próxima — ' +
      'se passar de ~48 h, o módulo morre por desuso antes de morrer por decisão. ' +
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
      ['🔔 Cliques no aviso (piso)', '@Cliques no aviso (piso)'],
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
      ['📋 Aderência ao plano', '@% Aderência ao plano'],
      ['⚠️ Auditorias atrasadas', '@Auditorias atrasadas'],
      ['🔴 NC em aberto', '@NC em aberto'],
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
    rodape:
      'Conformidade = itens conformes ÷ (conformes + não conformes); "não se aplica" fica fora da conta. '
      + 'Alguns meses de 2026 entraram por estimativa (campo "origem") porque o registro original se perdeu.',
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
            'fato_ag_contagem.status', '@Total em caixas', '@Contagens',
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

module.exports = { paginas, filtros, Y, H };
