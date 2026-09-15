// COMO CADA NUMERO E CALCULADO -- o texto que aparece na pagina "Sobre" de
// cada pagina do relatorio, a que abre ao clicar no C do cabecalho
// (14/09/2026, pedido do dono: "mostrar como e feito os calculos, para que
// quem abrisse o BI e tivesse duvida ia nesse C e tirava a duvida la").
//
// Chave = nome da medida em 07-medidas.dax (sem o @), ou a referencia de
// coluna agregada ('tabela.coluna#soma') como esta em paginas.js. Valor =
// a conta em portugues de balcao, lida do DAX e da view -- NAO de memoria.
// Coluna agregada leva [rotulo, texto], porque nao tem nome de medida.
//
// Mudou a formula em 07-medidas.dax? Mude aqui na mesma entrega. Medida
// nova sem linha aqui gera aviso no gerar-pbip.js.
module.exports = {
  // --- Visao Geral / uso do app ---------------------------------------
  'Colaboradores': 'colaboradores cadastrados (pessoas diferentes) no recorte de revenda e área.',
  '% Adesão': 'colaboradores que já fizeram login no app alguma vez ÷ colaboradores cadastrados. Ignora o período: é desde o lançamento.',
  'Interações': 'soma dos registros feitos no app — lançamento, feedback, curtida, resposta do quiz… —, contados por módulo e por dia.',
  'Módulos usados': 'módulos diferentes com pelo menos uma interação no recorte.',
  'Atualizado em': 'data e hora da última atualização do modelo, no horário de Brasília — não a hora em que o arquivo foi aberto.',

  // --- Ativo de Giro ----------------------------------------------------
  'Ocorrências de contagem': 'vezes que alguém contou — uma por pessoa por dia, não uma por linha digitada.',
  'Contagens no dia': 'as ocorrências de contagem daquele período; dia sem contagem aparece como 0 em vez de sumir do gráfico.',
  '% Dias com contagem': 'dias com pelo menos uma contagem ÷ dias úteis já decorridos do período.',
  'Contadores': 'pessoas diferentes que lançaram contagem.',
  '% da meta de contagens': 'dias com contagem ÷ meta do período (3 por semana × semanas já decorridas). É acumulado.',
  'Último dia contado': 'o dia mais recente com contagem dentro do período filtrado.',
  'Linhas lançadas': 'linhas digitadas na contagem — uma por tipo e formato de embalagem.',
  'Itens conciliados': 'itens (linhas) da conciliação dos dias congelados.',
  '% Itens que bateram': 'itens da conciliação com resultado "Bateu" ÷ itens conciliados.',
  'Dias com contagem': 'dias diferentes com pelo menos uma contagem lançada.',
  'Atraso médio (dias)': 'média de dias entre o dia contado e o dia em que a linha foi digitada. 0 = lançado no próprio dia.',
  'Total em caixas': 'soma das caixas contadas, já convertidas, sem as linhas substituídas por recontagem.',

  // --- Conciliacao do AG ------------------------------------------------
  'Dia conciliado': 'o dia congelado que os cartões mostram; com vários dias marcados no filtro, o último deles.',
  'Contado': 'caixas contadas no pátio no dia conciliado, com palete e lastro convertidos pelos fatores da revenda.',
  'Em trânsito': 'trânsito rota + trânsito carreta + comodato, em caixas, no dia conciliado.',
  'Trânsito rota': 'caixas que saíram na entrega (rota) no dia conciliado.',
  'Trânsito carreta': 'caixas que estão com o transportador (carreta) no dia conciliado.',
  'Comodato': 'caixas emprestadas a clientes no dia conciliado.',
  'Parque': 'saldo oficial de caixas cadastrado no AG, como estava no dia em que a conciliação foi congelada.',
  'Diferença': 'contado + rota + carreta + comodato − parque, em caixas, no dia conciliado. Negativo é falta; positivo, sobra.',
  '% Diferença': 'diferença (sem sinal) ÷ parque, no dia conciliado. Até 5% é aceitável.',
  'Diferença (R$)': 'soma, item a item, da diferença em caixas × valor da caixa gravado no congelamento. Item sem valor fica fora.',
  'Situação da conciliação': '✅ até 5% de diferença sobre o parque; ⚠️ sobra ou ❌ falta acima de 5%; "Sem parque" se não há parque cadastrado.',
  'Diferença por dia (R$)': 'média da diferença em R$ entre os dias conciliados do recorte.',
  'Diferença por dia': 'média da diferença em caixas entre os dias conciliados do recorte.',
  '% Diferença por dia': 'média, entre os dias conciliados, do % de diferença de cada dia.',
  'Paletes GFE do dia conciliado': 'paletes de GFE sem garrafa digitados no dia conciliado, sem conversão.',
  'Caixas GFE do dia conciliado': 'caixas de GFE sem garrafa digitadas no dia conciliado, sem conversão.',
  'fato_ag_conciliacao.contado#soma': ['Contado', 'soma das caixas contadas nas linhas da conciliação.'],
  'fato_ag_conciliacao.parque#soma': ['Parque', 'soma do parque, em caixas, nas linhas da conciliação.'],
  'fato_ag_conciliacao.diferenca#soma': ['Diferença', 'soma da diferença, em caixas, nas linhas da conciliação.'],

  // --- Feedback da Rota -------------------------------------------------
  'Feedbacks': 'feedbacks de rota enviados no período.',
  'Nota média': 'média das notas dos feedbacks: 0 Ruim, 1 Regular, 2 Boa, 3 Ótima.',
  '% Satisfação': 'média de (nota ÷ 3) de cada feedback — a nota média em porcentagem. Nota média 1,88 = 62,5%.',
  '% Notas ruins': 'feedbacks com nota Ruim ou Regular (0 ou 1) ÷ total de feedbacks.',
  'Cidade mais crítica': 'a cidade com a pior nota média ajustada entre as que têm 3 ou mais feedbacks com mapa localizado.',
  'Feedbacks com ocorrência': 'feedbacks que marcaram aquele problema — um feedback pode marcar vários.',
  'Nota média por cidade': 'média simples das notas (0 a 3) dos feedbacks cujo mapa passa pela cidade.',
  'Feedbacks por cidade': 'feedbacks cujo mapa passa pela cidade.',
  'Nota média ajustada da cidade': '(soma das notas + 5 × média geral) ÷ (feedbacks + 5): cidade com poucos feedbacks é puxada para a média.',

  // --- 5 Porques --------------------------------------------------------
  'Análises': 'análises de 5 Porquês abertas no recorte — concluídas e em andamento.',
  'Análises concluídas': 'análises que o motorista terminou e enviou.',
  'Análises em andamento': 'análises abertas e ainda não enviadas.',
  '% Conclusão': 'análises concluídas ÷ análises abertas.',
  '% Chegou ao 5º porquê': 'análises concluídas que responderam os cinco porquês ÷ análises concluídas.',
  'Aguardando tratativa': 'análises concluídas pelo motorista cuja tratativa da liderança ainda não foi concluída.',
  'TMR': 'média de horas até a liderança responder — 5 Porquês concluídos + tratativa dos feedbacks Regular. Em horas até 24 h; em dias acima.',
  '% Aceite do motorista': 'análises em que o motorista aceitou a devolutiva ÷ análises que receberam devolutiva.',
  '1º porquê': 'a resposta do motorista ao 1º porquê — a opção marcada e, depois do "—", o que ele escreveu.',
  '2º porquê': 'a resposta ao 2º porquê. Em branco: a análise parou antes.',
  '3º porquê': 'a resposta ao 3º porquê. Em branco: a análise parou antes.',
  '4º porquê': 'a resposta ao 4º porquê. Em branco: a análise parou antes.',
  '5º porquê': 'a resposta ao 5º porquê. Em branco: a análise parou antes.',
  'fato_cinco_porques_matriz.ocorrencias#soma': ['Ocorrências', 'análises com o mesmo problema, causa e ação.'],
  'fato_cinco_porques_matriz.tratadas#soma': ['Tratadas', 'dessas análises, quantas já têm a tratativa concluída.'],

  // --- Comunicados e Cronograma -----------------------------------------
  'Comunicados publicados': 'comunicados publicados no período.',
  'Curtidas': 'soma das curtidas dos comunicados publicados no período.',
  'Curtidas por comunicado': 'curtidas ÷ comunicados publicados.',
  '% Participação na comunicação': 'colaboradores que curtiram algum comunicado no período ÷ colaboradores cadastrados.',
  'Cliques no aviso (piso)': 'soma dos cliques no aviso do sino. É piso: o app não registra leitura, e quem leu direto na tela inicial não conta.',
  'Taxa média de curtida': 'média, entre os comunicados, de curtidas ÷ pessoas que podiam ver o comunicado.',
  'fato_comunicado_curtida.comunicado_id#contagem': ['Curtidas', 'número de curtidas, agrupadas por quantos dias depois da publicação elas vieram.'],
  'Itens do cronograma': 'marcas na agenda — 📰 publicação e 🔔 lembrete. Com um Publicador no filtro, só as dos comunicados dele.',
  'Marcas na fila': 'marcas que ainda não aconteceram: publicação agendada para o futuro ou lembrete que ainda não tocou.',
  'Célula do calendário': 'o número do dia e, abaixo, cada publicação (📰) e lembrete (🔔) marcados para ele.',

  // --- Quiz e Desafio ---------------------------------------------------
  'Participações concluídas': 'participações em que a pessoa terminou a rodada.',
  'Taxa de participação': 'participações concluídas ÷ colaboradores elegíveis das rodadas.',
  'Aproveitamento médio': 'média, por participação, de acertos ÷ total de perguntas da rodada.',
  'Participantes únicos': 'pessoas diferentes que participaram de alguma rodada.',
  'Questões críticas': 'perguntas com mais de 40% de erro e pelo menos 5 respostas.',
  'Taxa de acerto': 'respostas certas ÷ respostas.',
  'fato_quiz_rodada_participacao.elegiveis#soma': ['Elegíveis', 'colaboradores que podiam jogar as rodadas do mês (área da rodada).'],
  'fato_quiz_rodada_participacao.concluidas#soma': ['Concluídas', 'participações concluídas nas rodadas do mês.'],
  'Medalha': '🥇 🥈 🥉 para as posições 1, 2 e 3 da temporada na área.',
  'Posição na temporada': 'colocação dentro da própria área: mais pontos; empate, mais acertos; depois menos tempo; depois quem concluiu antes.',
  'Rodadas': 'rodadas diferentes de que a pessoa participou.',
  'Pontos': 'soma dos pontos da pessoa nas rodadas do recorte.',
  'Acertos': 'soma das respostas certas da pessoa nas rodadas do recorte.',
  'Erros': 'soma das respostas erradas da pessoa nas rodadas do recorte.',
  'Tempo total (s)': 'soma dos segundos que a pessoa levou para responder — é critério de desempate.',
  'Respostas': 'respostas dadas às perguntas do Desafio.',
  'Perguntas em alerta': 'perguntas com menos de 60% de acerto e pelo menos 5 respostas.',
  '% de chute': 'respostas erradas dadas em menos de 4 segundos ÷ todas as respostas.',
  'Padrão mais crítico': 'o padrão (POP) com a menor taxa de acerto entre os que têm 5 ou mais respostas.',
  'Resposta certa': 'o gabarito da pergunta — só aparece na linha de uma pergunta, e fica em branco para quem está numa função "sem gabarito".',
  'fato_quiz_resposta.tempo_segundos#soma': ['Tempo (s)', 'segundos que a pessoa levou para responder a pergunta.'],

  // --- Super Matinal e Sonho --------------------------------------------
  'Quadros publicados': 'quadros (imagens) do Super Matinal publicados.',
  'Meses com publicação': 'meses diferentes com pelo menos um quadro publicado.',
  '% Cobertura da publicação': 'combinações de mês, equipe e categoria com quadro publicado ÷ todas as que deveriam ter quadro.',

  // --- Programa 5S ------------------------------------------------------
  '% Conformidade 5S': 'itens conformes ÷ itens avaliados, somando as auditorias do recorte. "Não se aplica" fica fora.',
  '% Aderência ao plano': 'auditorias com data já vencida que foram feitas ÷ auditorias com data já vencida. Data futura não entra.',
  'Auditorias atrasadas': 'auditorias planejadas ou em andamento cuja data planejada já passou.',
  'NC em aberto': 'ações do plano 5S abertas ou em andamento — a fila de trabalho.',
  'Ações atrasadas': 'ações do plano 5S em aberto com o prazo já vencido.',
  '% Conformidade do senso': 'itens conformes do senso ÷ itens avaliados do senso.',
  'Respostas NOK': 'respostas "não conforme" do item nas auditorias.',
  '% Reprovação do item': 'respostas "não conforme" do item ÷ respostas avaliadas do item. Só itens com 5 ou mais avaliações.',

  // --- Bancada e Repack ---------------------------------------------------
  'Horas de bancada': 'soma de (fim − início) de cada lançamento de bancada, seleção e repack.',
  'Bancada h/dia': 'horas de bancada ÷ dias que tiveram lançamento de bancada.',
  'Pico da bancada': 'a hora do dia com mais horas de bancada no recorte, e quanto ela representa do total.',
  'Caixas repackadas': 'soma das caixas dos lançamentos de repack.',
  'Unidades triadas': 'soma das unidades dos lançamentos de seleção.',
  '% da etapa': 'horas da etapa ÷ horas de bancada (seleção + repack) no mesmo recorte.',
  '% do tempo no repack': 'horas de repack ÷ horas de bancada (seleção + repack).',
  '% do tempo na triagem': 'horas de seleção ÷ horas de bancada (seleção + repack).',
  'Lançamentos de bancada': 'lançamentos de bancada, seleção e repack.',
  'Repack cx/h': 'caixas repackadas ÷ horas de repack — soma ÷ soma, nunca média das taxas.',
  'Seleção un/h': 'unidades triadas ÷ horas de seleção.',
  'Minutos por caixa': 'horas de repack × 60 ÷ caixas repackadas.',
  '% da meta de repack': 'caixas por hora do repack ÷ média das metas cadastradas dos produtos repackados.',
  'Meta de repack cx/h': 'média das metas de caixas por hora cadastradas nos produtos repackados. Produto sem meta fica fora.',
  'Lançamentos de repack': 'lançamentos da etapa repack.',
  'Dias de repack': 'dias diferentes com lançamento de repack.',

  // --- Bate palete --------------------------------------------------------
  'Paletes batidos': 'soma dos paletes lançados no bate palete.',
  'HL batidos': 'soma dos hectolitros dos paletes batidos.',
  'HL avariados': 'soma dos hectolitros perdidos no bate palete.',
  'HL aproveitados': 'HL batidos − HL avariados: o que voltou inteiro ao estoque.',
  '% avaria no bate palete': 'HL avariados ÷ HL batidos, somados no recorte.',
  'Lançamentos de bate palete': 'lotes de bate palete lançados — um lote com vários produtos conta uma vez.',

  // --- Despejo ------------------------------------------------------------
  'Na bombona (L)': 'litros despejados desde o último esvaziamento registrado; sem nenhum, desde o primeiro despejo. Não segue filtros.',
  '% da bombona': 'litros na bombona agora ÷ capacidade cadastrada. Não segue filtros.',
  'Dias sem esvaziar': 'dias desde o último esvaziamento registrado; sem nenhum, desde o primeiro despejo. Não segue filtros.',
  'Litros despejados': 'soma dos litros dos lançamentos de despejo no recorte filtrado.',
  'Litros por hora': 'litros despejados ÷ horas de despejo (fim − início de cada lançamento).',
  'Horas de despejo': 'soma de (fim − início) de cada lançamento de despejo.',
  'Lançamentos de despejo': 'lançamentos de despejo.',
  'Descartes': 'esvaziamentos da bombona registrados no app.',
  '% médio no descarte': 'média de (litros na bombona no momento do esvaziamento ÷ capacidade).',
  'fato_pa_despejo.quantidade_pacotes#soma': ['Pacotes', 'soma dos pacotes lançados no despejo.'],
  'fato_pa_esvaziamento.litros_no_momento#soma': ['Litros no descarte', 'litros que havia na bombona quando ela foi esvaziada.'],

  // --- Abastecimento e Ressuprimento ------------------------------------
  'HL abastecidos': 'soma dos hectolitros dos itens abastecidos (quantidade × fator do produto).',
  'HL por hora': 'HL abastecidos ÷ horas das sessões de abastecimento (fim − início).',
  'Sessões de abastecimento': 'sessões de abastecimento lançadas.',
  'Ressuprimentos': 'pedidos de ressuprimento.',
  'Espera pela empilhadeira (min)': 'média de minutos do pedido até o empilhador iniciar o transporte.',
  'Transporte (min)': 'média de minutos do início do transporte até a última entrega na área.',
  'Espera pelo ajudante (min)': 'média de minutos da última entrega na área até o início do abastecimento.',
  'Ciclo médio (min)': 'média de minutos do pedido até o fim do abastecimento. Só pedidos concluídos.',
  '% urgentes': 'pedidos marcados como urgentes ÷ pedidos.',
  '% cancelados': 'pedidos cancelados ÷ pedidos.',

  // --- Recebimento de Carretas ------------------------------------------
  'Carretas finalizadas': 'carretas finalizadas no recorte.',
  'TMA médio (min)': 'média, em minutos, do agendamento (ou da chegada) até o fim da descarga — ou da carga, se voltou carregada.',
  'TMA P90 (min)': 'o TMA abaixo do qual ficam 90% das carretas — mostra como estão as 10% piores.',
  'Carretas fora da meta': 'carretas cujo TMA passou da meta cadastrada em Admin > Recebimento (padrão 120 min).',
  '% fora da meta de TMA': 'carretas com TMA acima da meta ÷ carretas com TMA calculado.',
  '% dentro da meta de TMA': 'carretas com TMA até a meta ÷ carretas com TMA calculado.',
  'Meta de TMA (min)': 'a meta de TMA cadastrada em Admin > Recebimento (padrão 120 min), média das carretas do recorte.',
  '% de avaria': 'paletes com avaria ÷ paletes recebidos, só nas carretas com conferência. Um palete com uma garrafa quebrada conta inteiro.',
  'Espera na portaria (min)': 'média de minutos da chegada na portaria até o início do atendimento.',
  'Descarga (min)': 'média de minutos do início ao fim da descarga.',
  'Pátio (min)': 'média de minutos da chegada até a finalização da carreta.',
  'Conferência (min)': 'média de minutos do início ao fim da conferência. Não entra no TMA.',
  'Atraso do transportador (min)': 'média de (chegada real − horário agendado), em minutos. Negativo: chegou antes.',
  '% carretas atrasadas': 'carretas que chegaram depois do horário agendado ÷ carretas com agendamento.',
  'Paletes recebidos': 'soma dos paletes conferidos.',
  'Paletes avariados': 'soma dos paletes com avaria na conferência.',

  // --- Empilhadeira -------------------------------------------------------
  'Horas de horímetro': 'soma de (horímetro final − inicial) das operações encerradas: horas de motor, não de operação aberta.',
  'Operações encerradas': 'operações de empilhadeira com horímetro final lançado.',
  'Horas por botijão': 'média de horas de horímetro entre uma troca de botijão e a seguinte, na mesma máquina.',
  'Dias por botijão': 'média de dias entre uma troca de botijão e a seguinte, na mesma máquina.',
  'Custo do gás (R$)': 'soma do custo de cada botijão P20 trocado no período.',
  'Duração média (h)': 'horas de horímetro ÷ operações encerradas.',
  'Encerradas por terceiro': 'operações encerradas por uma pessoa diferente de quem abriu.',
  'fato_empilhadeira_ciclo_gas.horimetro_inicio#soma': ['Horímetro no início', 'horímetro da máquina na troca que abriu o ciclo.'],
  'fato_empilhadeira_ciclo_gas.horimetro_fim#soma': ['Horímetro no fim', 'horímetro da máquina na troca que fechou o ciclo.'],

  // --- Mapa do App --------------------------------------------------------
  'dim_menu_app.chave#contagem': ['Itens do menu', 'quantidade de itens do menu do app.'],
};
