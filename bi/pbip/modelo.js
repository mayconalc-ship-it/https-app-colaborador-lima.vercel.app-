// Especificacao do modelo semantico. Consumido por gerar-pbip.js.
//
// Tipos: s=string  i=int64  n=decimal  d=double  t=dateTime  b=boolean
//
// As colunas espelham exatamente as views de 01-camada-semantica.sql. Se
// uma view mudar la, mude aqui e rode o gerador de novo -- o Power BI so
// aceita o TMDL se a lista bater com o que a consulta devolve.

// Chave composta revenda|colaborador. Existe porque dim_colaborador tem
// grao colaborador x revenda (a lideranca que responde por duas revendas
// aparece duas vezes, de proposito). Sem a chave composta, o
// relacionamento por colaborador_id seria muitos-para-muitos e o filtro
// de revenda nao chegaria na dimensao.
const CHAVE = 'chave:s';

const tabelas = [
  // ---------------- DIMENSOES ----------------
  {
    nome: 'dim_revenda',
    view: 'dim_revenda',
    descricao: 'Uma linha por revenda. Filtro global do relatorio.',
    colunas: 'revenda_id:s slug:s revenda:s ativa:b ordem:i criado_em:t',
  },
  {
    nome: 'dim_colaborador',
    view: 'dim_colaborador',
    descricao: 'Colaborador x revenda. Sem CPF por decisao de privacidade.',
    colunas:
      'colaborador_id:s revenda_id:s revenda_principal:b colaborador:s matricula:s ' +
      'cargo:s area_cadastro:s area:s area_rotulo:s papel:s papel_rotulo:s eh_gestao:b ' +
      'data_cadastro:t ' + CHAVE,
    chaveComposta: true,
  },
  {
    nome: 'dim_calendario',
    view: 'dim_calendario',
    descricao: 'Tabela de datas em pt-BR.',
    tabelaDeDatas: 'data',
    colunas:
      'data:t ano:i mes:i mes_abrev:s mes_nome:s ano_mes:s mes_rotulo:s trimestre:s ' +
      'semana_iso:i ano_semana:s inicio_semana:t inicio_mes:t dia_semana:i ' +
      'dia_semana_nome:s fim_de_semana:b ja_aconteceu:b',
  },
  {
    nome: 'dim_ocorrencia_rota',
    view: 'dim_ocorrencia_rota',
    descricao: 'Catalogo de ocorrencias de rota. Espelha src/lib/feedback-ocorrencias.ts.',
    colunas: 'ocorrencia_id:s ocorrencia:s grupo:s',
  },
  {
    nome: 'dim_menu_app',
    view: 'dim_menu_app',
    descricao: 'Menu do app. Serve de indice do relatorio na pagina Mapa do App.',
    colunas: 'chave:s emoji:s titulo:s item:s caminho:s link:s ordem:i visivel:b situacao:s',
    urlWeb: 'link',
  },
  {
    nome: 'dim_quiz_rodada',
    view: 'dim_quiz_rodada',
    colunas:
      'rodada_id:s revenda_id:s rodada:s temporada:i mes:i mes_rotulo:s mes_ref:t area:s ' +
      'area_rotulo:s pilar:s padrao:s atividade:s inicio:t fim:t dias_aberta:i ' +
      'total_perguntas:i status:s status_rotulo:s publicada_em:t encerrada_em:t',
    // Liga so em dim_revenda, e nao nos fatos de quiz: os fatos ja trazem
    // rodada, mes_ref, area, pilar e padrao denormalizados. Criar tambem
    // dim_quiz_rodada -> fato daria a dim_revenda dois caminhos ate o
    // mesmo fato (direto e via rodada) e o Power BI desativaria um deles.
    revendaDireta: true,
  },
  {
    nome: 'dim_quiz_questao',
    view: 'dim_quiz_questao',
    descricao: 'Contadores acertos/erros aqui sao VITALICIOS -- nao respondem a filtro de data.',
    colunas:
      'questao_id:s revenda_id:s pergunta:s tipo:s dificuldade:s dificuldade_rotulo:s ' +
      'status:s ativa:b area:s area_rotulo:s pilar:s padrao:s atividade:s explicacao:s ' +
      'vezes_usada:i acertos:i erros:i taxa_erro_acumulada:n criado_em:t',
    revendaDireta: true,
  },
  {
    nome: 'dim_sonho_revenda',
    view: 'dim_sonho_revenda',
    descricao: 'Contexto do Sonho da Revenda. Nao ha meta nem realizado no banco.',
    colunas:
      'sonho_id:s revenda_id:s ano:i titulo:s frase:s tipo:s ativo:b arquivo_url:s ' +
      'tem_quadro_indicadores:b quadro_indicadores_url:s criado_em:t data_publicacao:t ' +
      'inicio_ano:t fim_ano:t ano_decorrido:n',
    revendaDireta: true,
  },

  // ---------------- ATIVO DE GIRO ----------------
  {
    nome: 'fato_ag_contagem',
    view: 'fato_ag_contagem',
    descricao: 'Grao: uma linha de contagem. total_caixas ja convertido pelos fatores da revenda.',
    colunas:
      'contagem_id:s revenda_id:s data:t colaborador_id:s colaborador_nome:s tipo:s ' +
      'formato:s status:s em_transito:b palete:i lastro:i caixa:i total_caixas:i ' +
      'paletes_equivalentes:n fator_palete:i fator_lastro:i ' +
      'fator_ausente:b recontagem_id:s eh_recontagem:b criado_em:t ' +
      'data_lancamento:t atraso_dias:i lancado_no_dia:b ' + CHAVE,
    chaveComposta: true,
    data: 'data',
  },
  {
    nome: 'fato_ag_dia_colaborador',
    view: 'fato_ag_dia_colaborador',
    colunas:
      'revenda_id:s data:t colaborador_id:s colaborador:s lancamentos:i ' +
      'lancamentos_recontagem:i total_caixas:i formatos_contados:i primeiro_lancamento:t ' +
      'ultimo_lancamento:t tudo_no_dia:b ' + CHAVE,
    chaveComposta: true,
    data: 'data',
  },
  {
    nome: 'fato_ag_conciliacao',
    view: 'fato_ag_conciliacao',
    descricao: 'Filtre parque_confiavel = true. ag_parque nao tem historico.',
    colunas:
      'revenda_id:s data:t tipo:s formato:s item:s contado:i linhas:i contadores:i ' +
      'parque:i diferenca:i diferenca_abs:i diferenca_pct:n resultado:s ' +
      'parque_atualizado_em:t parque_confiavel:b',
    revendaDireta: true,
    data: 'data',
  },
  {
    nome: 'fato_ag_recontagem',
    view: 'fato_ag_recontagem',
    colunas:
      'recontagem_id:s revenda_id:s dia:t descricao:s solicitado_por:s solicitado_nome:s ' +
      'criado_em:t data_solicitacao:t atendida_em:t atendida_por:s atendida_contagem_id:s ' +
      'cancelada_em:t situacao:s horas_para_atender:n horas_em_aberto:n',
    revendaDireta: true,
    data: 'data_solicitacao',
  },

  // ---------------- FEEDBACK DE ROTA ----------------
  {
    // As colunas cp_* fecham o ciclo na mesma linha da reclamacao: causa
    // raiz, devolutiva da lideranca e aceite. Vem por LATERAL na view --
    // ver 01-camada-semantica.sql. Nao da para fazer isso por
    // relacionamento no modelo: fato_feedback_rota e fato_cinco_porques
    // ja se encontram em dim_colaborador e dim_calendario, e um
    // relacionamento direto entre as duas fecharia um ciclo -- o Power BI
    // desativa um dos caminhos em silencio quando isso acontece.
    nome: 'fato_feedback_rota',
    view: 'fato_feedback_rota',
    descricao: 'Grao: um feedback. A nota em tres leituras (0..3, %, e o corte de ruim).',
    colunas:
      'feedback_id:s revenda_id:s colaborador_id:s colaborador:s area:s area_rotulo:s ' +
      'cargo:s rota:s nota:i nota_rotulo:s nota_percentual:n nota_ruim:b nota_otima:b ' +
      'qtd_ocorrencias:i sem_ocorrencia:b comentario:s tem_comentario:b ' +
      'tamanho_comentario:i criado_em:t data:t hora:i tem_cinco_porques:b ' +
      'cp_causa_raiz:s cp_devolutiva:s cp_aceite_rotulo:s cp_aceitou:b cp_devolutiva_em:t ' +
      CHAVE,
    chaveComposta: true,
    data: 'data',
  },
  {
    nome: 'fato_feedback_ocorrencia',
    view: 'fato_feedback_ocorrencia',
    descricao: 'Explodido: um feedback com 3 ocorrencias vira 3 linhas. Conte DISTINCT feedback_id.',
    colunas:
      'feedback_id:s revenda_id:s colaborador_id:s rota:s nota:i data:t ocorrencia_id:s ' +
      'ocorrencia:s grupo:s ' + CHAVE,
    chaveComposta: true,
    data: 'data',
  },

  // ---------------- CINCO PORQUES ----------------
  {
    nome: 'fato_cinco_porques',
    view: 'fato_cinco_porques',
    descricao: 'Tres ciclos distintos: status do motorista, tratativa da lideranca e aceite.',
    colunas:
      'analise_id:s revenda_id:s colaborador_id:s colaborador:s feedback_rota_id:s rota:s ' +
      'problema_id:s problema:s profundidade:i chegou_ao_quinto:b causa_raiz:s ' +
      'categoria_id:s categoria:s acao_sugerida:s status:s concluida:b tratativa_status:s ' +
      'tratada:b resposta_lideranca:s respondida_lideranca:b resposta_lideranca_em:t ' +
      'motorista_aceitou:b aceite_rotulo:s motorista_aceitou_em:t tempo_segundos:n ' +
      'iniciada_em:t concluida_em:t data:t porques_respondidos:i horas_ate_resposta:n ' +
      'horas_aguardando:n ' + CHAVE,
    chaveComposta: true,
    data: 'data',
  },
  {
    nome: 'fato_cinco_porques_resposta',
    view: 'fato_cinco_porques_resposta',
    descricao: 'Grao: analise x porque. Alimenta a cadeia causal nivel 1 -> 5.',
    colunas:
      'analise_id:s revenda_id:s problema:s data:t ordem:i nivel:i nivel_rotulo:s ' +
      'pergunta:s opcao_id:s resposta:s texto_livre:s escreveu_livre:b',
    revendaDireta: true,
    data: 'data',
  },
  {
    nome: 'fato_cinco_porques_matriz',
    view: 'fato_cinco_porques_matriz',
    descricao: 'Problema x causa x acao agrupado. E o entregavel da pagina.',
    colunas:
      'revenda_id:s problema:s categoria:s causa_raiz:s acao_sugerida:s ocorrencias:i ' +
      'colaboradores:i rotas:i tratadas:i primeira_vez:t ultima_vez:t',
    revendaDireta: true,
  },

  // ---------------- COMUNICADOS ----------------
  {
    nome: 'fato_comunicado',
    view: 'fato_comunicado',
    descricao: 'Curtidas sao reais. avisos_vistos/clicados sao PISO, nunca total.',
    colunas:
      'comunicado_id:s revenda_id:s titulo:s resumo:s categoria_id:s categoria:s autor:s ' +
      'destaque:b tem_imagem:b tamanho_texto:i minutos_leitura_estimados:i data:t ' +
      'criado_em:t lembrete_em:t tem_lembrete:b lembrete_enviado_em:t lembrete_disparado:b ' +
      'curtidas:i avisos_vistos:i avisos_clicados:i publico:i taxa_curtida:n taxa_clique:n',
    revendaDireta: true,
    data: 'data',
  },
  {
    nome: 'fato_comunicado_curtida',
    view: 'fato_comunicado_curtida',
    colunas:
      'comunicado_id:s revenda_id:s titulo:s categoria_id:s colaborador_id:s colaborador:s ' +
      'area:s criado_em:t data:t dias_ate_curtir:i ' + CHAVE,
    chaveComposta: true,
    data: 'data',
  },

  // ---------------- QUIZ ----------------
  {
    nome: 'fato_quiz_participacao',
    view: 'fato_quiz_participacao',
    descricao: 'Grao: uma tentativa por pessoa por rodada. posicao segue o desempate do app.',
    colunas:
      'participacao_id:s revenda_id:s rodada_id:s rodada:s temporada:i mes:i mes_ref:t ' +
      'rodada_inicio:t rodada_fim:t total_perguntas:i pilar:s padrao:s colaborador_id:s ' +
      'colaborador:s area:s area_rotulo:s status:s concluida:b pontos:i acertos:i ' +
      'respondidas:i erros:i taxa_acerto:n aproveitamento:n tempo_segundos:n ' +
      'segundos_por_pergunta:n iniciada_em:t concluida_em:t data:t data_conclusao:t ' +
      'posicao:i ' + CHAVE,
    chaveComposta: true,
    data: 'data',
  },
  {
    nome: 'fato_quiz_resposta',
    view: 'fato_quiz_resposta',
    descricao: 'Use para taxa de erro POR PERIODO -- os contadores da questao sao vitalicios.',
    colunas:
      'resposta_id:s revenda_id:s rodada_id:s rodada:s mes_ref:t colaborador_id:s ' +
      'colaborador:s area:s questao_id:s pergunta:s dificuldade:s pilar:s padrao:s ' +
      'correta:b errou:b tempo_segundos:n respondida_em:t data:t ' + CHAVE,
    chaveComposta: true,
    data: 'data',
  },
  {
    nome: 'fato_quiz_rodada_participacao',
    view: 'fato_quiz_rodada_participacao',
    descricao: 'Elegiveis x participantes por rodada. Elegibilidade ja resolvida na view.',
    colunas:
      'rodada_id:s revenda_id:s rodada:s temporada:i mes:i mes_ref:t area:s area_rotulo:s ' +
      'status:s inicio:t fim:t total_perguntas:i elegiveis:i participantes:i concluidas:i ' +
      'taxa_participacao:n media_pontos:n media_acertos:n melhor_pontos:i',
    revendaDireta: true,
    data: 'mes_ref',
  },

  // ---------------- SUPER MATINAL ----------------
  {
    nome: 'fato_ranking_matinal',
    view: 'fato_ranking_matinal',
    descricao: 'ATENCAO: so metadados. A pontuacao esta dentro da imagem.',
    colunas:
      'ranking_id:s revenda_id:s mes_ano:s mes_ref:t mes_rotulo:s equipe:s equipe_rotulo:s ' +
      'categoria:s imagem_url:s criado_em:t data_publicacao:t',
    revendaDireta: true,
    data: 'mes_ref',
    urlImagem: 'imagem_url',
  },
  {
    nome: 'fato_ranking_matinal_cobertura',
    view: 'fato_ranking_matinal_cobertura',
    descricao: 'Disciplina de publicacao: que mes/categoria deixou de ser publicado.',
    colunas: 'revenda_id:s mes_ano:s mes_ref:t equipe:s categoria:s publicado:b imagem_url:s',
    revendaDireta: true,
    data: 'mes_ref',
    urlImagem: 'imagem_url',
  },

  // ---------------- PROGRAMA 5S ----------------
  // As dimensoes ligam so em dim_revenda pelo mesmo motivo de
  // dim_quiz_rodada: os fatos ja trazem area_5s e senso denormalizados.
  // Ligar tambem dim -> fato daria a dim_revenda dois caminhos ate o
  // mesmo fato e o Power BI desativaria um deles.
  {
    nome: 'dim_5s_area',
    view: 'dim_5s_area',
    descricao: 'Area do 5S com o dono vigente.',
    colunas:
      'area_5s_id:s revenda_id:s area_5s:s local:s descricao:s ativa:b ordem:i ' +
      'dono_id:s dono:s data_cadastro:t',
    revendaDireta: true,
  },
  {
    nome: 'dim_5s_pergunta',
    view: 'dim_5s_pergunta',
    descricao: 'As 25 perguntas do checklist, na ordem da planilha de origem.',
    colunas:
      'pergunta_5s_id:s revenda_id:s codigo:s pergunta:s pergunta_curta:s senso:s ' +
      'senso_rotulo:s senso_japones:s ordem:i ativa:b',
    revendaDireta: true,
  },
  {
    nome: 'fato_5s_auditoria',
    view: 'fato_5s_auditoria',
    descricao:
      'Uma linha por auditoria. Conformidade ja vem consolidada do app -- nao recalcule em DAX.',
    colunas:
      'auditoria_5s_id:s revenda_id:s area_5s_id:s area_5s:s auditor_id:s ' +
      'colaborador_id:s auditor:s ' +
      'dono_id:s dono:s status:s status_rotulo:s data:t mes_ref:t mes_rotulo:s ' +
      'data_realizada:t realizada:b atrasada:b atraso_dias:i itens_ok:i itens_nok:i ' +
      'itens_na:i itens_avaliados:i conformidade:n estimada:b origem:s observacao:s ' +
      'data_planejamento:t ' + CHAVE,
    chaveComposta: true,
    data: 'data',
  },
  {
    nome: 'fato_5s_senso',
    view: 'fato_5s_senso',
    descricao: 'Grao: auditoria x senso. Base do radar dos cinco sensos.',
    colunas:
      'auditoria_5s_id:s revenda_id:s area_5s_id:s area_5s:s auditor_id:s dono_id:s ' +
      'data:t mes_ref:t senso:s senso_rotulo:s senso_ordem:i itens_ok:i itens_nok:i ' +
      'itens_na:i itens_avaliados:i conformidade:n',
    revendaDireta: true,
    data: 'data',
  },
  {
    nome: 'fato_5s_resposta',
    view: 'fato_5s_resposta',
    descricao: 'Grao: auditoria x pergunta. Sustenta o ranking de itens criticos.',
    colunas:
      'resposta_5s_id:s auditoria_5s_id:s revenda_id:s area_5s_id:s area_5s:s ' +
      'auditor_id:s dono_id:s data:t mes_ref:t pergunta_5s_id:s codigo:s senso:s ' +
      'valor:s resultado:s eh_ok:i eh_nok:i eh_na:i eh_avaliado:i observacao:s foto_url:s',
    revendaDireta: true,
    data: 'data',
    urlImagem: 'foto_url',
  },
  {
    nome: 'fato_5s_acao',
    view: 'fato_5s_acao',
    descricao: 'Plano de acao 5S: do apontamento a validacao.',
    colunas:
      'acao_5s_id:s revenda_id:s auditoria_5s_id:s area_5s_id:s area_5s:s ' +
      'pergunta_5s_id:s codigo:s senso:s senso_rotulo:s problema:s acao_corretiva:s ' +
      'responsavel_id:s responsavel:s prioridade:s prioridade_rotulo:s status:s ' +
      'status_rotulo:s em_aberto:b resolvida:b prazo:t mes_ref:t data_abertura:t ' +
      'data_conclusao:t data_validacao:t atrasada:b dias_para_resolver:i ' +
      'evidencia_url:s evidencia_conclusao_url:s comentario_encerramento:s',
    revendaDireta: true,
    data: 'data_abertura',
    urlImagem: 'evidencia_url',
  },

  // ---------------- USO DO APP ----------------
  {
    nome: 'fato_evento_acesso',
    view: 'fato_evento_acesso',
    colunas:
      'evento_id:s revenda_id:s colaborador_id:s colaborador:s tipo:s alvo:s modulo:s ' +
      'sessao_id:s criado_em:t data:t hora:i ' + CHAVE,
    chaveComposta: true,
    data: 'data',
  },
  {
    nome: 'fato_uso_sessao',
    view: 'fato_uso_sessao',
    descricao: 'Sem revenda_id na origem -- liga so no calendario.',
    colunas:
      'sessao_id:s colaborador_id:s colaborador:s iniciada_em:t ultima_atividade:t ' +
      'segundos:i minutos:n data:t',
    data: 'data',
  },
  {
    nome: 'fato_atividade',
    view: 'fato_atividade',
    descricao: 'Grao: revenda x data x colaborador x modulo. So contagem de interacoes.',
    colunas: 'revenda_id:s data:t colaborador_id:s colaborador:s modulo:s interacoes:i ' + CHAVE,
    chaveComposta: true,
    data: 'data',
  },
];

// Colunas que so servem de chave tecnica e poluem a lista de campos.
const ocultas = new Set([
  'chave', 'revenda_id', 'colaborador_id', 'contagem_id', 'feedback_id', 'analise_id',
  'comunicado_id', 'participacao_id', 'resposta_id', 'rodada_id', 'questao_id',
  'evento_id', 'sessao_id', 'ranking_id', 'sonho_id', 'recontagem_id', 'problema_id',
  'categoria_id', 'ocorrencia_id', 'opcao_id', 'solicitado_por', 'atendida_por',
  'atendida_contagem_id', 'feedback_rota_id',
  'area_5s_id', 'pergunta_5s_id', 'auditoria_5s_id', 'resposta_5s_id',
  'acao_5s_id', 'auditor_id', 'dono_id', 'responsavel_id',
]);

module.exports = { tabelas, ocultas };
