-- ==================================================================
-- BI: PRODUTIVIDADE DO ARMAZEM, RECEBIMENTO DE CARRETAS E O DESAFIO
-- Execute no Supabase DEPOIS do 01-camada-semantica.sql
-- e RODE O 02-acesso-powerbi.sql EM SEGUIDA (o GRANT nao alcanca view
-- que ainda nao existia quando ele rodou).
-- ==================================================================
-- O BI cobria AG, Feedback de Rota, 5 Porques, Comunicados, Desafio,
-- Super Matinal, 5S e Uso do App. A Produtividade do Armazem inteira
-- estava de fora -- justamente a area que ganhou tela de indicadores
-- nova em setembro/2026. Este arquivo fecha essa lacuna e leva ao
-- modelo o que a tela do app passou a medir:
--
--   * bancada (selecao + repack), despejo, abastecimento, ressuprimento
--     e bate palete, no grao do lancamento;
--   * a bombona do despejo, com os esvaziamentos que zeram a contagem;
--   * recebimento de carretas com TMA, as fases do atendimento e a
--     avaria por transportadora, motorista, conferente e portaria;
--   * empilhadeira por horimetro, com o turno e a hora do dia;
--   * o perfil por HORA DO DIA como dimensao de verdade (bi.dim_hora),
--     que e o que torna "quando a fila se forma" uma pergunta
--     respondivel no relatorio e nao um grafico solto.
--
-- ------------------------------------------------------------------
-- REGRAS QUE VALEM PARA TODAS AS VIEWS DAQUI
-- ------------------------------------------------------------------
--
-- 1) FUSO. Todo timestamptz vira data e hora em America/Sao_Paulo antes
--    de virar coluna. Mesma convencao do 01. Sem isso, tudo que
--    acontece das 21h a meia-noite cai no dia seguinte -- e o turno da
--    noite, que e um terco da operacao do armazem, sairia inteiro no
--    dia errado.
--
-- 2) TURNO DERIVADO. Carreta, operacao de empilhadeira, ressuprimento e
--    5S nao tem coluna de turno: sao eventos, nao apontamentos. O turno
--    sai da HORA do evento, com a regua do app (T1 05-13, T2 13-21,
--    T3 21-05, ver turnoAtual em src/lib/produtividade-armazem.ts). Se
--    essa regua mudar la, mude bi.turno_local aqui -- senao o BI e a
--    tela passam a discordar sobre o que foi o T3.
--
-- 3) COLABORADOR_ID EM TODO FATO. E o que faz o filtro global de
--    Colaborador (e o de Area, que vem por dim_colaborador) alcancar as
--    paginas novas. Fato sem essa coluna vira uma pagina que ignora o
--    filtro em silencio -- que foi exatamente o defeito que a tela do
--    app tinha e que consertamos.
--
-- 4) FATO COM DUAS PESSOAS. Carreta tem portaria e conferente;
--    ressuprimento tem solicitante, empilhador e ajudante. O
--    colaborador_id do fato e o DONO DO ATENDIMENTO (o conferente na
--    carreta, o solicitante no ressuprimento) -- documentado em cada
--    view. As outras pessoas viajam como atributo, com segmentacao
--    propria na pagina. Escolher uma e explicitar e melhor que uma
--    tabela de papeis que soma TMA tres vezes sem ninguem perceber.
-- ==================================================================

-- ------------------------------------------------------------------
-- 0) FUNCOES DE APOIO
-- ------------------------------------------------------------------

-- O turno de um instante, no fuso da operacao. Espelha turnoAtual() de
-- src/lib/produtividade-armazem.ts.
create or replace function bi.turno_local(p_ts timestamptz)
returns text
language sql
immutable
as $$
  select case
    when h >= 5  and h < 13 then 'manha'
    when h >= 13 and h < 21 then 'tarde'
    else 'noite'
  end
  from (select extract(hour from (p_ts at time zone 'America/Sao_Paulo'))::int as h) x;
$$;

-- T1/T2/T3 junto do nome porque e assim que a operacao fala: o cadastro
-- diz "conferente T3" e a escala diz T1. Mesmo rotulo de
-- ROTULO_TURNO_CURTO no app.
create or replace function bi.turno_rotulo(p_turno text)
returns text
language sql
immutable
as $$
  select case p_turno
    when 'manha' then 'Manhã (T1)'
    when 'tarde' then 'Tarde (T2)'
    when 'noite' then 'Noite (T3)'
    else 'Sem turno'
  end;
$$;

-- A hora local (0-23). Usada para ligar qualquer fato em bi.dim_hora.
create or replace function bi.hora_local(p_ts timestamptz)
returns int
language sql
immutable
as $$
  select extract(hour from (p_ts at time zone 'America/Sao_Paulo'))::int;
$$;

-- Horas entre dois instantes, com uma casa. Null quando falta ponta --
-- e "nao medido", nunca zero: zero faria a operacao parecer instantanea.
create or replace function bi.horas_entre(p_ini timestamptz, p_fim timestamptz)
returns numeric
language sql
immutable
as $$
  select case
    when p_ini is null or p_fim is null or p_fim <= p_ini then null
    else round(extract(epoch from (p_fim - p_ini)) / 3600.0, 3)
  end;
$$;

-- Minutos entre dois instantes, inteiros. Mesma regra do null acima.
create or replace function bi.minutos_entre(p_ini timestamptz, p_fim timestamptz)
returns int
language sql
immutable
as $$
  select case
    when p_ini is null or p_fim is null or p_fim <= p_ini then null
    else round(extract(epoch from (p_fim - p_ini)) / 60.0)::int
  end;
$$;

-- ------------------------------------------------------------------
-- 1) DIMENSAO HORA DO DIA
-- ------------------------------------------------------------------
-- Existe como TABELA e nao como coluna solta em cada fato porque e o
-- que transforma o histograma num filtro: clicar nas 7h no grafico de
-- chegada de carreta passa a recortar o TMA, a avaria e a empilhadeira
-- na mesma tela. Com a hora presa dentro de cada fato, cada grafico
-- filtraria so a si mesmo e a pergunta "o que mais acontece no pico da
-- manha?" nao teria resposta no relatorio.
--
-- 24 linhas fixas, inclusive as horas sem movimento: o VALE conta
-- metade da historia ("das 13h as 15h a maquina para"), e hora que so
-- existe quando ha fato desapareceria justamente do lado vazio.
create or replace view bi.dim_hora as
select
  h                                          as hora,
  lpad(h::text, 2, '0') || 'h'               as hora_rotulo,
  case
    when h >= 5  and h < 13 then 'manha'
    when h >= 13 and h < 21 then 'tarde'
    else 'noite'
  end                                        as turno,
  bi.turno_rotulo(case
    when h >= 5  and h < 13 then 'manha'
    when h >= 13 and h < 21 then 'tarde'
    else 'noite'
  end)                                       as turno_rotulo,
  case
    when h >= 5  and h < 12 then 'Manhã'
    when h >= 12 and h < 18 then 'Tarde'
    when h >= 18 and h < 24 then 'Noite'
    else 'Madrugada'
  end                                        as faixa_do_dia
from generate_series(0, 23) as h;

comment on view bi.dim_hora is
  'Hora do dia (0-23) com turno. Ligue todo fato por hora para o histograma virar filtro cruzado.';

-- ------------------------------------------------------------------
-- 2) DIMENSOES DO ARMAZEM
-- ------------------------------------------------------------------

-- Familia e tipo saem da planilha de cadastro (migration 060) e estavam
-- parados no banco. Sao o que permite ler o repack por FAMILIA: garrafa
-- retornavel e lata descartavel nao embalam no mesmo ritmo, e uma media
-- unica das duas apaga a diferenca.
--
-- O cluster chega como "001 - CERVEJA"; o codigo na frente e do SAP e
-- nao diz nada para quem le o relatorio. Fica so a palavra.
create or replace view bi.dim_pa_produto as
select
  p.id                                        as produto_id,
  p.revenda_id,
  p.codigo,
  p.descricao                                 as produto,
  coalesce(
    nullif(btrim(regexp_replace(coalesce(p.cluster_produto, ''), '^\s*\d+\s*-\s*', '')), ''),
    'Sem família'
  )                                           as familia,
  coalesce(p.tipo, 'Não informado')           as tipo,
  case p.tipo
    when 'DESCARTAVEL' then 'Descartável'
    when 'RETORNAVEL'  then 'Retornável'
    else 'Não informado'
  end                                         as tipo_rotulo,
  e.nome                                      as embalagem,
  p.fator_hecto,
  p.unidades_por_caixa,
  p.caixas_pallet,
  p.caixas_por_lastro,
  p.meta_reepack_hora,
  p.meta_despejo_hora,
  p.ativo                                     as ativo,
  p.criado_em
from public.pa_produtos p
left join public.pa_embalagens e on e.id = p.embalagem_id;

create or replace view bi.dim_pa_embalagem_despejo as
select
  e.id                                        as embalagem_despejo_id,
  e.revenda_id,
  e.nome                                      as embalagem_despejo,
  e.litros_por_unidade,
  e.meta_litros_hora,
  e.ativo,
  e.criado_em
from public.pa_embalagens_despejo e;

create or replace view bi.dim_empilhadeira as
select
  m.id                                        as empilhadeira_id,
  m.revenda_id,
  'Empilhadeira ' || m.numero                 as empilhadeira,
  m.numero
from public.pa_empilhadeiras m;

create or replace view bi.dim_transportadora as
select
  t.id                                        as transportadora_id,
  t.revenda_id,
  t.nome                                      as transportadora
from public.pa_transportadoras t;

-- ------------------------------------------------------------------
-- 3) BANCADA -- SELECAO E REPACK
-- ------------------------------------------------------------------
-- As duas etapas do mesmo ciclo (POP-ARM-001, 7.2 a 7.6) numa view so,
-- separadas pela coluna `etapa`. Juntas porque o POP as trata como um
-- ciclo e a carga de trabalho da bancada e a soma das duas; separaveis
-- porque a QUANTIDADE tem unidade diferente (caixa reembalada x unidade
-- triada) e somar as duas daria um numero que nao quer dizer nada.
--
-- Por isso ha duas colunas de quantidade em vez de uma: quem arrastar
-- "caixas" para um grafico nunca soma triagem por engano.
create or replace view bi.fato_pa_bancada as
select
  l.id                                        as lancamento_id,
  l.revenda_id,
  l.colaborador_id,
  l.colaborador_nome                          as colaborador,
  l.etapa,
  case l.etapa when 'repack' then 'Repack' when 'selecao' then 'Seleção e Triagem'
    else initcap(l.etapa) end                 as etapa_rotulo,
  l.produto_id,
  pr.descricao                                as produto,
  coalesce(
    nullif(btrim(regexp_replace(coalesce(pr.cluster_produto, ''), '^\s*\d+\s*-\s*', '')), ''),
    'Sem família'
  )                                           as familia,
  case pr.tipo
    when 'DESCARTAVEL' then 'Descartável'
    when 'RETORNAVEL'  then 'Retornável'
    else 'Não informado'
  end                                         as tipo_rotulo,
  l.embalagem_id,
  emb.nome                                    as embalagem,
  l.turno,
  bi.turno_rotulo(l.turno)                    as turno_rotulo,
  -- Uma coluna por etapa. Ver o comentario do cabecalho.
  case when l.etapa = 'repack'  then l.quantidade end as caixas,
  case when l.etapa = 'selecao' then l.quantidade end as unidades_triadas,
  l.quantidade,
  bi.horas_entre(l.inicio, l.fim)             as horas,
  -- A taxa vem PRONTA do SQL, e o BI nao a soma: a media da taxa nao e
  -- a taxa da media. As medidas de taxa em 07-medidas.dax dividem
  -- quantidade por horas -- esta coluna serve para conferir linha a
  -- linha na pagina de detalhe.
  case when bi.horas_entre(l.inicio, l.fim) > 0
    then round(l.quantidade / bi.horas_entre(l.inicio, l.fim), 1) end as taxa_hora,
  pr.meta_reepack_hora                        as meta_hora,
  l.inicio,
  l.fim,
  bi.dia_local(l.inicio)                      as data,
  bi.hora_local(l.inicio)                     as hora
from public.pa_reepack_lancamentos l
left join public.pa_produtos   pr  on pr.id  = l.produto_id
left join public.pa_embalagens emb on emb.id = l.embalagem_id
where l.fim is not null;

comment on view bi.fato_pa_bancada is
  'Selecao + Repack, uma linha por lancamento. `caixas` e `unidades_triadas` sao excludentes de proposito.';

-- ------------------------------------------------------------------
-- 4) DESPEJO E A BOMBONA
-- ------------------------------------------------------------------
create or replace view bi.fato_pa_despejo as
select
  d.id                                        as lancamento_id,
  d.revenda_id,
  d.colaborador_id,
  d.colaborador_nome                          as colaborador,
  d.embalagem_despejo_id,
  emb.nome                                    as embalagem_despejo,
  emb.meta_litros_hora,
  d.turno,
  bi.turno_rotulo(d.turno)                    as turno_rotulo,
  d.litros,
  d.quantidade_pacotes,
  bi.horas_entre(d.inicio, d.fim)             as horas,
  case when bi.horas_entre(d.inicio, d.fim) > 0
    then round(d.litros / bi.horas_entre(d.inicio, d.fim), 1) end as litros_hora,
  d.inicio,
  d.fim,
  bi.dia_local(d.inicio)                      as data,
  bi.hora_local(d.inicio)                     as hora
from public.pa_despejo_lancamentos d
left join public.pa_embalagens_despejo emb on emb.id = d.embalagem_despejo_id
where d.fim is not null;

-- A BOMBONA E UM RECIPIENTE FISICO, e este e o unico fato do modelo que
-- NAO deve ser filtrado por periodo, turno ou pessoa.
--
-- O nivel de agora e a soma dos litros lancados depois do ultimo
-- esvaziamento. Recortado por turno, o T1 veria a bombona pela metade e
-- o T2 vazia -- sendo a MESMA bombona. Por isso o nivel vem calculado
-- aqui, uma linha por revenda, e nao como soma de um fato no DAX: uma
-- medida somavel seria filtrada pelas segmentacoes da pagina no
-- primeiro clique de quem nao leu esta nota.
create or replace view bi.fato_pa_bombona as
select
  r.id                                        as revenda_id,
  ult.esvaziamento_id,
  ult.esvaziada_em,
  bi.dia_local(ult.esvaziada_em)              as data_esvaziamento,
  ult.colaborador                             as esvaziada_por,
  ult.litros_no_momento,
  coalesce(niv.litros_agora, 0)               as litros_agora,
  cap.capacidade,
  case when cap.capacidade > 0
    then round(coalesce(niv.litros_agora, 0) / cap.capacidade, 4) end as pct_cheia,
  greatest(cap.capacidade - coalesce(niv.litros_agora, 0), 0)         as litros_livres,
  (coalesce(niv.litros_agora, 0) > cap.capacidade)                    as transbordou,
  -- Ha quantos dias a bombona nao e esvaziada. Bombona parada cheia e
  -- risco ambiental; bombona esvaziada pela metade e viagem
  -- desperdicada -- os dois lados sao decisao, e nenhum dos dois se ve
  -- em "litros despejados no mes".
  case when ult.esvaziada_em is not null
    then (current_date - bi.dia_local(ult.esvaziada_em)) end          as dias_desde_esvaziamento
from public.revendas r
left join lateral (
  select
    e.id                     as esvaziamento_id,
    e.esvaziada_em,
    e.colaborador_nome       as colaborador,
    e.litros_no_momento
  from public.pa_despejo_esvaziamentos e
  where e.revenda_id = r.id
  order by e.esvaziada_em desc
  limit 1
) ult on true
left join lateral (
  select round(sum(d.litros), 1) as litros_agora
  from public.pa_despejo_lancamentos d
  where d.revenda_id = r.id
    and d.fim is not null
    and (ult.esvaziada_em is null or d.inicio >= ult.esvaziada_em)
) niv on true
left join lateral (
  -- A capacidade e meta cadastrada em Admin > Metas. Sem linha, 1000 L,
  -- o mesmo padrao da tela do app -- para o medidor nao nascer dividido
  -- por zero e some do relatorio sem explicacao.
  select coalesce(max(m.valor), 1000)::numeric as capacidade
  from public.pa_metas m
  where m.revenda_id = r.id and m.chave = 'despejo_capacidade_bombona'
) cap on true;

comment on view bi.fato_pa_bombona is
  'Uma linha por revenda: o nivel ATUAL da bombona. Nao filtre por periodo/turno/pessoa -- ver a nota da view.';

-- O historico de esvaziamentos. Responde "a bombona esta sendo
-- descartada cheia ou pela metade?", que e disciplina de processo e
-- custo de viagem -- e que so existe porque o app passou a registrar o
-- evento (migration 110).
create or replace view bi.fato_pa_esvaziamento as
select
  e.id                                        as esvaziamento_id,
  e.revenda_id,
  e.colaborador_id,
  e.colaborador_nome                          as colaborador,
  e.litros_no_momento,
  cap.capacidade,
  case when cap.capacidade > 0
    then round(e.litros_no_momento / cap.capacidade, 4) end as pct_no_descarte,
  e.observacao,
  e.esvaziada_em,
  bi.dia_local(e.esvaziada_em)                as data,
  bi.hora_local(e.esvaziada_em)               as hora,
  bi.turno_local(e.esvaziada_em)              as turno,
  bi.turno_rotulo(bi.turno_local(e.esvaziada_em)) as turno_rotulo
from public.pa_despejo_esvaziamentos e
left join lateral (
  select coalesce(max(m.valor), 1000)::numeric as capacidade
  from public.pa_metas m
  where m.revenda_id = e.revenda_id and m.chave = 'despejo_capacidade_bombona'
) cap on true;

-- ------------------------------------------------------------------
-- 5) ABASTECIMENTO DO PICKING E RESSUPRIMENTO
-- ------------------------------------------------------------------
create or replace view bi.fato_pa_abastecimento as
select
  a.id                                        as abastecimento_id,
  a.revenda_id,
  a.colaborador_id,
  a.colaborador_nome                          as colaborador,
  a.tipo,
  case a.tipo when 'completo' then '🔄 Completo' when 'pontual' then '⚡ Pontual'
    else initcap(a.tipo) end                  as tipo_rotulo,
  a.turno,
  bi.turno_rotulo(a.turno)                    as turno_rotulo,
  a.ressuprimento_id,
  (a.ressuprimento_id is not null)            as de_solicitacao,
  itens.hl,
  itens.itens,
  bi.horas_entre(a.inicio, a.fim)             as horas,
  case when bi.horas_entre(a.inicio, a.fim) > 0
    then round(itens.hl / bi.horas_entre(a.inicio, a.fim), 2) end as hl_hora,
  a.inicio,
  a.fim,
  bi.dia_local(a.inicio)                      as data,
  bi.hora_local(a.inicio)                     as hora
from public.pa_abastecimentos a
left join lateral (
  select
    coalesce(round(sum(i.hl_calculado), 3), 0) as hl,
    count(*)                                   as itens
  from public.pa_abastecimento_itens i
  where i.abastecimento_id = a.id
) itens on true
where a.fim is not null;

-- O ressuprimento mede o TEMPO ENTRE tres pessoas, nao o volume (esse
-- ja esta no abastecimento). Cada fase tem responsavel diferente, e por
-- isso as tres saem em colunas separadas: um ciclo de 40 minutos com 35
-- de espera nao se resolve treinando quem abastece.
--
-- colaborador_id = SOLICITANTE (ver a regra 4 do cabecalho). Operador e
-- ajudante viajam como atributo, com segmentacao propria na pagina.
create or replace view bi.fato_pa_ressuprimento as
select
  s.id                                        as ressuprimento_id,
  s.revenda_id,
  s.solicitante_id                            as colaborador_id,
  s.solicitante_nome                          as colaborador,
  s.solicitante_nome                          as solicitante,
  s.operador_id,
  coalesce(s.operador_nome, 'Sem empilhador') as empilhador,
  coalesce(ab.colaborador_nome, 'Sem ajudante') as ajudante,
  s.prioridade,
  case s.prioridade when 'urgente' then '🔴 Urgente' else '⚪ Normal' end as prioridade_rotulo,
  s.tipo,
  case s.tipo when 'completo' then '🔄 Completo' when 'pontual' then '⚡ Pontual'
    else initcap(s.tipo) end                  as tipo_rotulo,
  (s.cancelado_em is not null)                as cancelado,
  (ab.fim is not null)                        as concluido,
  itens.hl,
  itens.itens,
  -- AS TRES ESPERAS, cada uma com dono diferente:
  bi.minutos_entre(s.criado_em, s.transporte_inicio)     as espera_empilhadeira_min,
  bi.minutos_entre(s.transporte_inicio, itens.ultima_entrega) as transporte_min,
  bi.minutos_entre(itens.ultima_entrega, ab.inicio)      as espera_ajudante_min,
  bi.minutos_entre(ab.inicio, ab.fim)                    as abastecimento_min,
  bi.minutos_entre(s.criado_em, ab.fim)                  as ciclo_min,
  s.criado_em,
  bi.dia_local(s.criado_em)                   as data,
  bi.hora_local(s.criado_em)                  as hora,
  bi.turno_local(s.criado_em)                 as turno,
  bi.turno_rotulo(bi.turno_local(s.criado_em)) as turno_rotulo
from public.pa_ressuprimentos s
left join lateral (
  select
    coalesce(round(sum(i.hl_calculado), 3), 0) as hl,
    count(*)                                   as itens,
    max(i.entregue_em)                         as ultima_entrega
  from public.pa_ressuprimento_itens i
  where i.ressuprimento_id = s.id
) itens on true
left join lateral (
  select a.inicio, a.fim, a.colaborador_nome
  from public.pa_abastecimentos a
  where a.ressuprimento_id = s.id
  order by a.inicio
  limit 1
) ab on true;

comment on view bi.fato_pa_ressuprimento is
  'Grao: um pedido. colaborador_id = SOLICITANTE; empilhador e ajudante sao atributos.';

-- ------------------------------------------------------------------
-- 6) BATE PALETE
-- ------------------------------------------------------------------
-- O percentual de avaria sai da SOMA sobre a SOMA, nunca da media dos
-- percentuais: um lote de 2 HL nao pode pesar o mesmo que um de 200. Por
-- isso a view entrega hl_batido e hl_avariado, e a divisao fica na
-- medida DAX -- somar percentual pronto seria o mesmo erro com outro
-- nome.
create or replace view bi.fato_pa_bate_palete as
select
  i.id                                        as item_id,
  b.id                                        as bate_palete_id,
  b.revenda_id,
  b.colaborador_id,
  b.colaborador_nome                          as colaborador,
  b.turno,
  bi.turno_rotulo(b.turno)                    as turno_rotulo,
  i.produto_id,
  pr.descricao                                as produto,
  i.paletes,
  i.hl_batido,
  i.hl_avariado,
  (i.hl_batido - i.hl_avariado)               as hl_aproveitado,
  bi.horas_entre(b.inicio, b.fim)             as horas,
  b.inicio,
  b.fim,
  bi.dia_local(b.inicio)                      as data,
  bi.hora_local(b.inicio)                     as hora
from public.pa_bate_palete_itens i
join public.pa_bate_palete b on b.id = i.bate_palete_id
left join public.pa_produtos pr on pr.id = i.produto_id
where b.fim is not null;

-- ------------------------------------------------------------------
-- 7) RECEBIMENTO DE CARRETAS
-- ------------------------------------------------------------------
-- A regra do TMA mora em src/lib/carretas.ts e ja mudou tres vezes.
-- Reescrita aqui em SQL, com as mesmas tres decisoes:
--
--   * comeca no AGENDADO quando havia agendamento, senao na chegada
--     apontada pela portaria -- carreta que chega tres horas antes do
--     horario nao gera TMA de tres horas para a operacao;
--   * termina no fim da descarga; se a carreta voltou carregada de AG,
--     no fim do CARREGAMENTO -- ate la ela continua ocupando o patio, e
--     o vao entre descarga e carga conta;
--   * a CONFERENCIA nunca entra. Ja houve conferencia terminando duas
--     horas depois de a carreta sair.
--
-- Se a regra mudar no app, mude aqui. Duas verdades sobre o mesmo TMA e
-- pior que uma so imperfeita.
--
-- colaborador_id = CONFERENTE (a regra 4 do cabecalho): e quem trabalha
-- a carreta. A portaria viaja como atributo e tem segmentacao propria.
create or replace view bi.fato_carreta as
select
  c.id                                        as carreta_id,
  c.revenda_id,
  c.conferente_colaborador_id                 as colaborador_id,
  coalesce(c.conferente_nome, 'Sem conferente')  as colaborador,
  coalesce(c.conferente_nome, 'Sem conferente')  as conferente,
  c.portaria_colaborador_id,
  coalesce(c.portaria_nome, 'Sem portaria')   as portaria,
  coalesce(c.motorista_nome, 'Sem motorista') as motorista,
  c.transportadora_id,
  t.nome                                      as transportadora,
  f.nome                                      as fabrica,
  c.numero_dt,
  c.placa_cavalo,
  c.status,
  c.carga_agendada,
  (c.agendamento_em is not null)              as tinha_agendamento,
  coalesce(c.tem_carga, false)                as voltou_carregada,

  -- TMA e as fases, em minutos.
  bi.minutos_entre(
    coalesce(c.agendamento_em, c.chegada_em),
    case when coalesce(c.tem_carga, false) then coalesce(c.fim_carga_em, c.fim_descarga_em)
         else c.fim_descarga_em end
  )                                           as tma_min,
  bi.minutos_entre(c.chegada_em, c.inicio_atendimento_em)     as espera_portaria_min,
  bi.minutos_entre(c.inicio_descarga_em, c.fim_descarga_em)   as descarga_min,
  bi.minutos_entre(c.inicio_conferencia_em, c.fim_conferencia_em) as conferencia_min,
  bi.minutos_entre(c.inicio_carga_em, c.fim_carga_em)         as carga_min,
  bi.minutos_entre(c.chegada_em, c.finalizacao_em)            as patio_min,
  -- Atraso do transportador: o agendado contra a chegada real. Estava no
  -- banco desde a 057 e nunca tinha sido comparado -- e o que separa
  -- "a carreta atrasou" de "a operacao demorou", que hoje se confundem
  -- dentro do TMA.
  bi.minutos_entre(c.agendamento_em, c.chegada_em)            as atraso_chegada_min,

  itens.paletes_recebidos,
  itens.paletes_avariados,
  (itens.paletes_recebidos > 0)               as teve_conferencia,

  -- A META de TMA vem cadastrada em Admin > Recebimento e viaja NA
  -- LINHA, nao numa medida com numero fixo: a regua e da operacao, e
  -- quando ela mudar o BI acompanha sozinho. Sem linha cadastrada, 120
  -- minutos -- o mesmo padrao do app (RECEBIMENTO_CONFIG_PADRAO).
  cfg.tma_alvo_minutos                        as tma_alvo_min,
  (bi.minutos_entre(
    coalesce(c.agendamento_em, c.chegada_em),
    case when coalesce(c.tem_carga, false) then coalesce(c.fim_carga_em, c.fim_descarga_em)
         else c.fim_descarga_em end
  ) <= cfg.tma_alvo_minutos)                  as dentro_da_meta,

  c.chegada_em,
  c.agendamento_em,
  c.inicio_atendimento_em,
  c.finalizacao_em,
  -- A data do fato e a FINALIZACAO: e quando a carreta virou historico.
  -- Usar a chegada poria no mes anterior a carreta que entrou dia 31 e
  -- saiu dia 1o, e o fechamento do mes nao bateria com o do app.
  bi.dia_local(coalesce(c.finalizacao_em, c.chegada_em))      as data,
  -- A hora e a da CHEGADA, e nao a da finalizacao: a fila do
  -- recebimento se forma na portaria, e e o perfil de chegada que
  -- responde "preciso de mais um conferente as 7h?".
  bi.hora_local(c.chegada_em)                 as hora,
  -- O turno e o de quem ASSUMIU a carreta; sem atendimento ainda, o da
  -- chegada. E o turno que trabalhou a carreta, que e do que o TMA fala.
  bi.turno_local(coalesce(c.inicio_atendimento_em, c.chegada_em)) as turno,
  bi.turno_rotulo(bi.turno_local(coalesce(c.inicio_atendimento_em, c.chegada_em))) as turno_rotulo
from public.atendimentos_carretas c
left join public.pa_transportadoras t on t.id = c.transportadora_id
left join public.pa_fabricas f        on f.id = c.fabrica_id
left join lateral (
  select
    coalesce(sum(i.quantidade), 0)                 as paletes_recebidos,
    coalesce(sum(i.quantidade_avariada), 0)        as paletes_avariados
  from public.atendimento_carretas_itens i
  where i.atendimento_id = c.id
) itens on true
left join lateral (
  select coalesce(max(rc.tma_alvo_minutos), 120) as tma_alvo_minutos
  from public.pa_recebimento_config rc
  where rc.revenda_id = c.revenda_id
) cfg on true
where c.status = 'finalizado';

comment on view bi.fato_carreta is
  'Uma carreta finalizada. TMA espelha src/lib/carretas.ts -- se mudar la, mude aqui.';

-- Grao item: a avaria por PRODUTO, que aponta a origem. Um SKU que chega
-- avariado em todo lote tem problema de paletizacao ou de transporte, e
-- nada dentro do armazem resolve.
create or replace view bi.fato_carreta_item as
select
  i.id                                        as item_id,
  c.id                                        as carreta_id,
  c.revenda_id,
  c.conferente_colaborador_id                 as colaborador_id,
  coalesce(c.conferente_nome, 'Sem conferente') as colaborador,
  coalesce(t.nome, 'Sem transportadora')      as transportadora,
  coalesce(f.nome, 'Sem fábrica')             as fabrica,
  coalesce(c.motorista_nome, 'Sem motorista') as motorista,
  i.produto_id,
  pr.descricao                                as produto,
  coalesce(
    nullif(btrim(regexp_replace(coalesce(pr.cluster_produto, ''), '^\s*\d+\s*-\s*', '')), ''),
    'Sem família'
  )                                           as familia,
  i.quantidade                                as paletes_recebidos,
  coalesce(i.quantidade_avariada, 0)          as paletes_avariados,
  bi.dia_local(coalesce(c.finalizacao_em, c.chegada_em)) as data,
  bi.hora_local(c.chegada_em)                 as hora,
  bi.turno_local(coalesce(c.inicio_atendimento_em, c.chegada_em)) as turno
from public.atendimento_carretas_itens i
join public.atendimentos_carretas c on c.id = i.atendimento_id
left join public.pa_transportadoras t on t.id = c.transportadora_id
left join public.pa_fabricas f        on f.id = c.fabrica_id
left join public.pa_produtos pr       on pr.id = i.produto_id
where c.status = 'finalizado';

-- ------------------------------------------------------------------
-- 8) EMPILHADEIRA
-- ------------------------------------------------------------------
-- As horas ativas vem do HORIMETRO (motor rodando), nunca do tempo
-- decorrido entre abrir e fechar a operacao. Quem abre as 6h e fecha as
-- 15h pode ter rodado tres horas, e a diferenca entre os dois numeros e
-- a diferenca entre "a maquina foi usada" e "a maquina estava com
-- alguem".
--
-- Operacao aberta (sem horimetro final) entra na view com horas nulas em
-- vez de ficar de fora: e ela que responde "quantas estao abertas
-- agora", e some-la faria o relatorio esconder o apontamento incompleto.
create or replace view bi.fato_empilhadeira_operacao as
select
  o.id                                        as operacao_id,
  o.revenda_id,
  o.operador_id                               as colaborador_id,
  o.operador_nome                             as colaborador,
  o.empilhadeira_id,
  'Empilhadeira ' || m.numero                 as empilhadeira,
  o.status,
  (o.horimetro_final is not null)             as encerrada,
  o.horimetro_inicial,
  o.horimetro_final,
  case when o.horimetro_final is not null
    then round((o.horimetro_final - o.horimetro_inicial)::numeric, 2) end as horas_ativas,
  bi.horas_entre(o.inicio, o.fim)             as horas_de_relogio,
  -- Quanto da operacao a maquina ficou LIGADA. Abaixo de uns 30% e
  -- operacao aberta e esquecida, nao maquina ociosa -- e a leitura muda
  -- de "sobra empilhadeira" para "falta fechar apontamento".
  case when bi.horas_entre(o.inicio, o.fim) > 0 and o.horimetro_final is not null
    then round((o.horimetro_final - o.horimetro_inicial)::numeric
               / bi.horas_entre(o.inicio, o.fim), 4) end as aproveitamento,
  o.encerrado_por_nome,
  -- Encerrada por outra pessoa: nao e produtividade, e qualidade do
  -- apontamento. Quando o lider fecha no dia seguinte, o horimetro final
  -- e o que ele achou na maquina e todo o consumo vai para quem abriu.
  (o.encerrado_por_nome is not null and o.encerrado_por_nome <> o.operador_nome) as encerrada_por_terceiro,
  o.inicio,
  o.fim,
  bi.dia_local(o.inicio)                      as data,
  bi.hora_local(o.inicio)                     as hora,
  bi.turno_local(o.inicio)                    as turno,
  bi.turno_rotulo(bi.turno_local(o.inicio))   as turno_rotulo
from public.pa_empilhadeira_operacoes o
left join public.pa_empilhadeiras m on m.id = o.empilhadeira_id;

-- Trocas de gas: o marco que fecha um ciclo de P20 e abre o proximo.
-- O CICLO em si (horas por botijao, rateio por operador) nao vem para o
-- BI de proposito -- ele atravessa turnos e operadores, e qualquer
-- segmentacao da pagina o quebraria pelo meio, fazendo o botijao render
-- mais do que rende. Quem precisa do ciclo tem a tela de gas do app.
create or replace view bi.fato_empilhadeira_gas as
select
  g.id                                        as troca_id,
  g.revenda_id,
  g.operador_id                               as colaborador_id,
  g.operador_nome                             as colaborador,
  g.empilhadeira_id,
  'Empilhadeira ' || m.numero                 as empilhadeira,
  g.horimetro,
  cfg.custo_p20,
  g.realizada_em,
  bi.dia_local(g.realizada_em)                as data,
  bi.hora_local(g.realizada_em)               as hora,
  bi.turno_local(g.realizada_em)              as turno,
  bi.turno_rotulo(bi.turno_local(g.realizada_em)) as turno_rotulo
from public.pa_empilhadeira_trocas_gas g
left join public.pa_empilhadeiras m on m.id = g.empilhadeira_id
left join public.pa_empilhadeira_config cfg on cfg.revenda_id = g.revenda_id;

-- ------------------------------------------------------------------
-- 9) DESAFIO DO MES -- o que a analise nova passou a olhar
-- ------------------------------------------------------------------
-- A view de resposta ja existia. Ganha duas colunas que a tela de
-- /gestao/desafio calcula e o BI nao tinha como reproduzir:
--
--   origem -- o padrao/atividade/pilar de onde a pergunta saiu. E o que
--     torna o numero acionavel: "62% de acerto" e uma nota; "62% no
--     POP-ARM-001" e uma pauta de treinamento com endereco.
--
--   chute -- errou E respondeu em menos de 4 segundos. Errar depois de
--     pensar e falta de conhecimento e se treina; errar em quatro
--     segundos e pressa, e cobrar conteudo de quem so clicou rapido
--     treina a coisa errada. O limiar espelha SEGUNDOS_DE_CHUTE em
--     src/lib/desafio-analise.ts.
--
-- E recriada inteira (e nao alterada) porque "create or replace view" do
-- Postgres so aceita acrescentar coluna no FIM -- ver a nota do 01.
-- A primeira versao deste arquivo criou bi.dim_quiz_gabarito, que saiu do
-- modelo em 10/09/2026 (a resposta certa virou coluna do fato, abaixo).
-- Quem ja tinha rodado aquela versao ficou com a view no banco, orfa --
-- e expondo o gabarito ao powerbi_readonly sem nenhuma pagina que
-- precisasse dele. Limpa aqui para ninguem ter de lembrar.
drop view if exists bi.dim_quiz_gabarito;

drop view if exists bi.fato_quiz_resposta;
create view bi.fato_quiz_resposta as
select
  resp.id                     as resposta_id,
  pa.revenda_id,
  pa.rodada_id,
  r.nome                      as rodada,
  make_date(r.temporada, r.mes, 1) as mes_ref,
  pa.colaborador_id,
  pa.colaborador_nome         as colaborador,
  pa.area,
  resp.questao_id,
  q.pergunta,
  q.dificuldade,
  initcap(q.dificuldade)      as dificuldade_rotulo,
  q.pilar,
  q.padrao_nome               as padrao,
  q.atividade,
  coalesce(
    nullif(btrim(q.padrao_nome), ''),
    nullif(btrim(q.atividade), ''),
    nullif(btrim(q.pilar), ''),
    'Sem padrão de origem'
  )                           as origem,
  q.explicacao,
  -- A RESPOSTA CERTA VIAJA NO FATO, e nao numa dimensao a parte.
  --
  -- Uma dim_quiz_gabarito sem relacionamento com este fato mostraria a
  -- resposta de TODAS as perguntas em cada linha da tabela -- o erro
  -- classico de dimensao solta, que nao acusa nada e so entrega numero
  -- errado. Denormalizar aqui e o mesmo caminho que o resto do modelo ja
  -- usa (ver dim_quiz_rodada no 01).
  gab.texto                   as resposta_certa,
  resp.correta,
  (not resp.correta)          as errou,
  round(resp.tempo_ms / 1000.0, 1) as tempo_segundos,
  ((not resp.correta) and resp.tempo_ms <= 4000) as chute,
  resp.respondida_em,
  bi.dia_local(resp.respondida_em) as data,
  bi.hora_local(resp.respondida_em) as hora
from public.quiz_respostas resp
join public.quiz_participacoes pa on pa.id = resp.participacao_id
join public.quiz_rodadas r        on r.id  = pa.rodada_id
join public.quiz_questoes q       on q.id  = resp.questao_id
left join lateral (
  -- CUIDADO DELIBERADO: isto traz a alternativa correta para o modelo.
  -- Existe porque a reuniao de treinamento precisa saber o que ENSINAR
  -- ao lado da pergunta que o time errou. Se o relatorio for distribuido
  -- ao time inteiro, remova esta coluna -- ou o campeonato do mes acaba
  -- no primeiro compartilhamento.
  select a.texto
  from public.quiz_alternativas a
  where a.questao_id = q.id and a.correta
  limit 1
) gab on true;

comment on view bi.fato_quiz_resposta is
  'Grao: uma resposta. `origem` da endereco a pauta; `chute` separa pressa de desconhecimento; `resposta_certa` e GABARITO.';

-- ------------------------------------------------------------------
-- 10) O CICLO DO BOTIJAO -- inicio, fim e quanto rendeu
-- ------------------------------------------------------------------
-- A lista de TROCAS respondia "quando trocou" e mais nada: cada linha
-- era um carimbo solto, e quem lia tinha de subtrair mentalmente uma
-- linha da outra para saber quanto durou o botijao.
--
-- Aqui cada linha e um CICLO FECHADO: a troca que abriu, a que fechou, o
-- horimetro de cada ponta e as horas rendidas. `lag()` por maquina,
-- ordenado no tempo -- e a primeira troca de cada maquina fica de fora
-- (fim_* nulo) porque sem ponto anterior nao ha intervalo para medir.
--
-- Continua valendo o que esta na view de trocas: este e um RELATORIO
-- para ler linha a linha, nao base de media filtrada por turno. Um ciclo
-- atravessa turnos e operadores; filtrado por T1, ele deixaria de
-- descrever qualquer botijao real.
create or replace view bi.fato_empilhadeira_ciclo_gas as
select * from (
  select
    g.id                                        as ciclo_id,
    g.revenda_id,
    g.operador_id                               as colaborador_id,
    g.operador_nome                             as colaborador,
    g.empilhadeira_id,
    'Empilhadeira ' || m.numero                 as empilhadeira,

    -- A ponta que ABRE o ciclo: a troca anterior desta mesma maquina.
    lag(g.realizada_em) over w                  as inicio_em,
    lag(g.horimetro)    over w                  as horimetro_inicio,
    lag(g.operador_nome) over w                 as trocou_no_inicio,

    -- A ponta que FECHA: esta troca.
    g.realizada_em                              as fim_em,
    g.horimetro                                 as horimetro_fim,
    g.operador_nome                             as trocou_no_fim,

    round((g.horimetro - lag(g.horimetro) over w)::numeric, 2) as horas_do_botijao,
    -- Quantos dias o botijao durou no relogio. Junto das horas de
    -- horimetro, e o que separa "rendeu pouco" de "a maquina rodou
    -- muito" -- 8h em dois dias e 8h em duas semanas sao operacoes
    -- diferentes com o mesmo consumo.
    (bi.dia_local(g.realizada_em) - bi.dia_local(lag(g.realizada_em) over w)) as dias_do_botijao,
    cfg.custo_p20,

    bi.dia_local(g.realizada_em)                as data,
    bi.hora_local(g.realizada_em)               as hora,
    bi.turno_local(g.realizada_em)              as turno,
    bi.turno_rotulo(bi.turno_local(g.realizada_em)) as turno_rotulo
  from public.pa_empilhadeira_trocas_gas g
  left join public.pa_empilhadeiras m on m.id = g.empilhadeira_id
  left join public.pa_empilhadeira_config cfg on cfg.revenda_id = g.revenda_id
  window w as (partition by g.empilhadeira_id order by g.realizada_em)
) c
-- Sem ponta de abertura nao ha ciclo. E horimetro que anda para tras e
-- digitacao errada, nao consumo negativo -- desenhar isso como se fosse
-- real poria uma barra invertida no meio do relatorio.
where c.inicio_em is not null
  and c.horas_do_botijao > 0;

comment on view bi.fato_empilhadeira_ciclo_gas is
  'Um ciclo de P20 por linha: da troca anterior ate esta. RELATORIO -- nao filtre por turno.';

-- ------------------------------------------------------------------
-- 10b) ATIVO DE GIRO -- A CONCILIACAO DO APP, E NAO SO CONTADO x PARQUE
-- ------------------------------------------------------------------
-- O dono (10/09/2026): "no BI pega somente o contado vs o parque e
-- sempre gera diferenca alta". Eram tres defeitos somados, e todos tem a
-- mesma raiz -- o BI ficou parado enquanto a regra do app evoluiu:
--
--   1. RECONTAGEM SOMAVA. Desde a migration 109 a recontagem SOBREPOE a
--      contagem antiga (ag_contagens.substituida_em), e o app so soma as
--      "vivas" (vivas() em src/lib/ativo-giro.ts). O BI somava as duas --
--      o item recontado entrava duas vezes e o contado subia.
--
--   2. SEM TRANSITO. Desde a 094 a conta do app e
--          contado + transito rota + transito carreta + comodato - parque
--      e o BI fazia contado - parque. Todo AG na rua, na estrada ou
--      emprestado ao cliente aparecia como FALTA no BI.
--
--   3. FATOR AUSENTE VIRAVA ZERO. O app converte palete e lastro com os
--      fatores padrao (FATORES_PADRAO) quando a revenda nao cadastrou o
--      seu; o BI multiplicava por zero e contava so a caixa solta.
--
-- Sem os tres, os numeros da tela e do BI eram numeros diferentes -- e o
-- dono passaria a auditar um contra o outro no Excel, que e exatamente o
-- que a camada de BI existe para evitar.

-- A contagem ganha as colunas da sobreposicao e passa a converter com o
-- fator padrao. Mesmas colunas, na mesma ordem, e tres novas NO FIM --
-- e o unico jeito que "create or replace" aceita (ver a nota do 01).
-- O historico continua vendo TODAS as linhas, como no app: a contagem
-- substituida some do TOTAL, nao do registro. Quem quer so as que valem
-- filtra `viva`.
create or replace view bi.fato_ag_contagem as
select
  c.id                                    as contagem_id,
  c.revenda_id,
  c.data,
  c.colaborador_id,
  c.colaborador_nome,
  c.tipo,
  c.formato,
  c.status,
  (c.status like 'Trânsito%')             as em_transito,
  c.palete,
  c.lastro,
  c.caixa,
  c.palete * coalesce(f.palete, pad.palete)
    + c.lastro * coalesce(f.lastro, pad.lastro)
    + c.caixa                             as total_caixas,
  case when coalesce(f.palete, pad.palete) > 0 then
    round((c.palete * coalesce(f.palete, pad.palete)
           + c.lastro * coalesce(f.lastro, pad.lastro) + c.caixa)::numeric
          / coalesce(f.palete, pad.palete), 2)
  end                                     as paletes_equivalentes,
  coalesce(f.palete, pad.palete)          as fator_palete,
  coalesce(f.lastro, pad.lastro)          as fator_lastro,
  -- Continua dizendo "a revenda nao cadastrou fator" -- so que agora a
  -- conta usa o padrao do app no lugar de zero, igual a tela.
  (f.formato is null)                     as fator_ausente,
  c.recontagem_id,
  (c.recontagem_id is not null)           as eh_recontagem,
  c.criado_em,
  bi.dia_local(c.criado_em)               as data_lancamento,
  (bi.dia_local(c.criado_em) - c.data)    as atraso_dias,
  (bi.dia_local(c.criado_em) = c.data)    as lancado_no_dia,
  -- ---- novas, no fim ----
  c.substituida_em,
  c.substituida_por,
  (c.substituida_em is null)              as viva
from public.ag_contagens c
left join public.ag_fatores f
  on f.revenda_id = c.revenda_id
 and f.formato    = c.formato
-- FATORES_PADRAO de src/lib/ativo-giro.ts. Se mudar la, mude aqui.
cross join lateral (
  select
    case c.formato when '600ml' then 42 when '300ml' then 90
                   when '1000ml' then 50 when 'Verde' then 42 end as palete,
    case c.formato when '600ml' then 7  when '300ml' then 10
                   when '1000ml' then 10 when 'Verde' then 7  end as lastro
) pad;

comment on view bi.fato_ag_contagem is
  'Grao: uma linha de contagem, TODAS (inclusive as sobrepostas por recontagem). Para volume, filtre viva = true.';

-- O resumo por pessoa e dia: o VOLUME passa a ser so das vivas; as
-- contagens de LINHAS continuam contando tudo, porque lancar e recontar
-- foram trabalho feito -- e e disso que a aderencia fala.
create or replace view bi.fato_ag_dia_colaborador as
select
  c.revenda_id,
  c.data,
  c.colaborador_id,
  max(c.colaborador_nome)                          as colaborador,
  count(*)                                         as lancamentos,
  count(*) filter (where c.eh_recontagem)          as lancamentos_recontagem,
  coalesce(sum(c.total_caixas) filter (where c.viva), 0) as total_caixas,
  count(distinct c.formato)                        as formatos_contados,
  min(c.criado_em)                                 as primeiro_lancamento,
  max(c.criado_em)                                 as ultimo_lancamento,
  bool_and(c.lancado_no_dia)                       as tudo_no_dia
from bi.fato_ag_contagem c
group by c.revenda_id, c.data, c.colaborador_id;

-- A CONCILIACAO, na regra de conciliarPorDia() do app.
--
--   * so dias com pelo menos uma contagem VIVA: dia sem contagem nao e
--     dia de falta de 100%, e dia sem medicao;
--   * em cada dia, todo tipo+formato que exista em ALGUM lugar -- no
--     contado, no parque, no transito do dia ou no comodato. O item que
--     tem parque e ninguem contou aparece com contado zero, como falta;
--     antes ele simplesmente sumia da tabela;
--   * rota e carreta sao DO DIA (ag_transito); o comodato e um saldo que
--     vale para todos os dias, igual ao parque (ag_comodato);
--   * aceitavel ate 5% do parque (LIMITE_DIFERENCA_PCT), diferenca em
--     MODULO sobre o parque -- a mesma conta da tela.
--
-- Recriada com drop porque a lista de colunas mudou no meio (ver a nota
-- do 01 sobre o 42P16).
drop view if exists bi.fato_ag_conciliacao;
create view bi.fato_ag_conciliacao as
with dias as (
  select distinct c.revenda_id, c.data
    from bi.fato_ag_contagem c
   where c.viva
),
contado as (
  select c.revenda_id, c.data, c.tipo, c.formato,
         sum(c.total_caixas)              as contado,
         count(*)                         as linhas,
         count(distinct c.colaborador_id) as contadores
    from bi.fato_ag_contagem c
   where c.viva
   group by 1, 2, 3, 4
),
itens as (
  select revenda_id, data, tipo, formato from contado
  union
  select d.revenda_id, d.data, p.tipo, p.formato
    from dias d
    join public.ag_parque p on p.revenda_id = d.revenda_id
  union
  select t.revenda_id, t.data, t.tipo, t.formato
    from public.ag_transito t
    join dias d on d.revenda_id = t.revenda_id and d.data = t.data
  union
  select d.revenda_id, d.data, cm.tipo, cm.formato
    from dias d
    join public.ag_comodato cm on cm.revenda_id = d.revenda_id
),
base as (
  select
    i.revenda_id, i.data, i.tipo, i.formato,
    coalesce(ct.contado, 0)         as contado,
    coalesce(ct.linhas, 0)          as linhas,
    coalesce(ct.contadores, 0)      as contadores,
    coalesce(t.transito_rota, 0)    as transito_rota,
    coalesce(t.transito_carreta, 0) as transito_carreta,
    coalesce(cm.quantidade, 0)      as comodato,
    p.quantidade                    as parque_cadastrado,
    coalesce(p.quantidade, 0)       as parque,
    p.atualizado_em                 as parque_atualizado_em,
    cm.atualizado_em                as comodato_atualizado_em
  from itens i
  left join contado ct
    on ct.revenda_id = i.revenda_id and ct.data = i.data
   and ct.tipo = i.tipo and ct.formato = i.formato
  left join public.ag_transito t
    on t.revenda_id = i.revenda_id and t.data = i.data
   and t.tipo = i.tipo and t.formato = i.formato
  left join public.ag_comodato cm
    on cm.revenda_id = i.revenda_id and cm.tipo = i.tipo and cm.formato = i.formato
  left join public.ag_parque p
    on p.revenda_id = i.revenda_id and p.tipo = i.tipo and p.formato = i.formato
)
select
  b.revenda_id,
  b.data,
  b.tipo,
  b.formato,
  b.tipo || ' · ' || b.formato                                  as item,
  b.contado,
  b.linhas,
  b.contadores,
  b.transito_rota,
  b.transito_carreta,
  b.comodato,
  (b.transito_rota + b.transito_carreta + b.comodato)           as transito,
  b.parque,
  x.dif                                                         as diferenca,
  abs(x.dif)                                                    as diferenca_abs,
  -- Em MODULO sobre o parque, como a tela. Sem parque nao ha
  -- percentual: dividir por zero nao da "0% de erro", da pergunta sem
  -- resposta.
  case when b.parque > 0 then round(abs(x.dif)::numeric / b.parque, 4) end as diferenca_pct,
  0.05::numeric                                                 as limite_pct,
  case when b.parque > 0 then abs(x.dif)::numeric / b.parque <= 0.05 end    as dentro_do_aceitavel,
  case
    when b.parque_cadastrado is null then 'Sem parque cadastrado'
    when x.dif = 0                   then 'Bateu'
    when x.dif > 0                   then 'Sobra'
    else                                  'Falta'
  end                                                           as resultado,
  -- O que a tela pinta de verde ou vermelho, em texto. E o que se
  -- filtra na hora de perguntar "o que precisa de alguem indo atras?".
  case
    when b.parque <= 0                                   then 'Sem parque'
    when abs(x.dif)::numeric / b.parque <= 0.05          then '✅ Dentro do aceitável'
    when x.dif > 0                                       then '⚠️ Sobra acima de 5%'
    else                                                      '❌ Falta acima de 5%'
  end                                                           as situacao,
  b.parque_atualizado_em,
  (b.data = bi.dia_local(b.parque_atualizado_em))              as parque_confiavel,
  b.comodato_atualizado_em
from base b
cross join lateral (
  select b.contado + b.transito_rota + b.transito_carreta + b.comodato - b.parque as dif
) x
-- Item sem nada em lugar nenhum nao existe para esta revenda (mesma
-- regra de conciliar(): contado, parque e transito todos zero).
where not (b.contado = 0 and b.parque = 0
           and b.transito_rota + b.transito_carreta + b.comodato = 0);

comment on view bi.fato_ag_conciliacao is
  'Conciliacao do app: contado (vivas) + rota + carreta + comodato - parque, por dia/item. Aceitavel ate 5% do parque.';

-- ------------------------------------------------------------------
-- 11) A VISAO GERAL PASSA A ENXERGAR O ARMAZEM
-- ------------------------------------------------------------------
-- bi.fato_atividade e a espinha da pagina Visao Geral: "interacoes por
-- modulo" e "quem usa o que" saem dela. Ela nasceu com seis modulos (AG,
-- Feedback, 5 Porques, Quiz, Comunicados e 5S) e nunca foi estendida --
-- entao, com o armazem inteiro dentro do BI, a pagina executiva
-- continuava dizendo que ninguem usava bancada, despejo, carreta ou
-- empilhadeira. O dono percebeu em 10/09/2026.
--
-- Recriada inteira aqui, e nao so acrescentada: e a mesma lista de
-- colunas, na mesma ordem, entao "create or replace" aceita. Os seis
-- ramos originais sao copia literal do 01 -- se mudar um la, mude aqui,
-- porque ESTA e a definicao que vale depois que o 15 roda.
--
-- Mesmo grao do resto: "a pessoa usou o modulo naquele dia", contando
-- lancamentos. O bate palete conta o LOTE, nao o item: contar item a
-- item faria quem bate um palete de dez SKUs parecer dez vezes mais
-- ativo que quem bate um palete de um SKU so.
create or replace view bi.fato_atividade as
  select c.revenda_id, c.data, c.colaborador_id, c.colaborador_nome as colaborador,
         'Ativo de Giro'::text as modulo, count(*)::bigint as interacoes
    from bi.fato_ag_contagem c
   group by 1, 2, 3, 4

union all
  select f.revenda_id, bi.dia_local(f.criado_em), f.colaborador_id,
         coalesce(p.nome, 'Sem cadastro'), 'Feedback de Rota', count(*)::bigint
    from public.feedback_rota f
    left join public.profiles p on p.id = f.colaborador_id
   group by 1, 2, 3, 4

union all
  select a.revenda_id, bi.dia_local(a.iniciada_em), a.colaborador_id,
         a.colaborador_nome, '5 Porquês', count(*)::bigint
    from public.cinco_porques_analises a
   group by 1, 2, 3, 4

union all
  select pa.revenda_id, bi.dia_local(pa.iniciada_em), pa.colaborador_id,
         pa.colaborador_nome, 'Quiz', count(*)::bigint
    from public.quiz_participacoes pa
   group by 1, 2, 3, 4

union all
  select c.revenda_id, bi.dia_local(ck.criado_em), ck.colaborador_id,
         coalesce(p.nome, 'Sem cadastro'), 'Comunicados', count(*)::bigint
    from public.comunicado_curtidas ck
    join public.comunicados c on c.id = ck.comunicado_id
    left join public.profiles p on p.id = ck.colaborador_id
   group by 1, 2, 3, 4

union all
  select au.revenda_id, bi.dia_local(au.finalizada_em), au.auditor_id,
         coalesce(p.nome, 'Auditor fora do cadastro'), 'Programa 5S', count(*)::bigint
    from public.cinco_s_auditorias au
    left join public.profiles p on p.id = au.auditor_id
   where au.status = 'finalizada'
     and au.finalizada_em is not null
     and au.auditor_id is not null
   group by 1, 2, 3, 4

-- ---- os modulos do armazem, a partir das views deste arquivo ----
union all
  select b.revenda_id, b.data, b.colaborador_id, b.colaborador,
         'Bancada (Seleção e Repack)', count(*)::bigint
    from bi.fato_pa_bancada b
   group by 1, 2, 3, 4

union all
  select d.revenda_id, d.data, d.colaborador_id, d.colaborador,
         'Despejo', count(*)::bigint
    from bi.fato_pa_despejo d
   group by 1, 2, 3, 4

union all
  select a.revenda_id, a.data, a.colaborador_id, a.colaborador,
         'Abastecimento do Picking', count(*)::bigint
    from bi.fato_pa_abastecimento a
   group by 1, 2, 3, 4

union all
  select r.revenda_id, r.data, r.colaborador_id, r.colaborador,
         'Ressuprimento', count(*)::bigint
    from bi.fato_pa_ressuprimento r
   group by 1, 2, 3, 4

union all
  select bp.revenda_id, bp.data, bp.colaborador_id, bp.colaborador,
         'Bate Palete', count(distinct bp.bate_palete_id)::bigint
    from bi.fato_pa_bate_palete bp
   group by 1, 2, 3, 4

union all
  -- A carreta tem DUAS pessoas usando o modulo: a portaria, que aponta a
  -- chegada, e o conferente, que atende. As duas contam. O `union` (e nao
  -- `union all`) interno descarta o par repetido quando a mesma pessoa
  -- fez as duas pontas da mesma carreta -- senao ela contaria dobrado.
  select x.revenda_id, x.data, x.colaborador_id, x.colaborador,
         'Recebimento de Carretas', count(*)::bigint
    from (
      select carreta_id, revenda_id, data, colaborador_id, colaborador
        from bi.fato_carreta where colaborador_id is not null
      union
      select carreta_id, revenda_id, data, portaria_colaborador_id, portaria
        from bi.fato_carreta where portaria_colaborador_id is not null
    ) x
   group by 1, 2, 3, 4

union all
  select o.revenda_id, o.data, o.colaborador_id, o.colaborador,
         'Empilhadeira', count(*)::bigint
    from bi.fato_empilhadeira_operacao o
   group by 1, 2, 3, 4;

comment on view bi.fato_atividade is
  'Grao: revenda x data x colaborador x modulo, 13 modulos incluindo o armazem. So contagem de interacoes.';

-- ==================================================================
-- FIM. Rode agora o 02-acesso-powerbi.sql -- sem ele o powerbi_readonly
-- nao enxerga nenhuma view deste arquivo e as paginas novas nascem
-- vazias, sem erro de conexao que explique o porque.
-- ==================================================================
