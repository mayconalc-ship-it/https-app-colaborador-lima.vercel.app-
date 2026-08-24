-- ==================================================================
-- ATUALIZACAO DO ESQUEMA bi -- 23/08/2026
-- ==================================================================
-- Ctrl+A e Ctrl+Enter no SQL Editor do Supabase. O Run manda string
-- vazia se nao houver selecao explicita.
--
-- Este arquivo e o RECORTE de 01-camada-semantica.sql: exatamente os
-- quatro blocos que mudaram nesta rodada, e nada mais. Rodar o 01
-- inteiro tambem funciona e da no mesmo -- so custa dez colagens em vez
-- de uma, porque ele passa dos 65 KB.
--
-- Nao ha "drop" aqui. Os quatro blocos sao "create or replace", e as
-- colunas novas de dim_calendario e de fato_cinco_porques_matriz foram
-- escritas no FIM da lista de proposito: o Postgres aceita acrescentar
-- coluna no fim de uma view existente e recusa no meio (42P16).
--
-- O QUE ENTRA
--   1. dim_calendario            + colunas dia e dia_rotulo
--                                  (eixo diario sem pular dias)
--   2. mapa_normalizado + fato_feedback_cidade
--                                  (o cruzamento feedback -> cidade que
--                                  substitui "rota mais critica")
--   3. fato_cinco_porques_matriz + colunas tratativa e com_tratativa
--                                  (a devolutiva do analista na pauta)
--   4. fato_comunicado_agenda    (o calendario do plano de comunicacao)
--
-- DEPOIS DAQUI, NA ORDEM:
--   a) 02-acesso-powerbi.sql  -- as views novas nascem sem GRANT, e o
--      Power BI responde "permissao negada" na proxima atualizacao.
--      (O bloco no fim deste arquivo ja cobre o caso comum; o 02 e o
--      que garante o resto.)
--   b) 10-conferir-acentos.sql -- confere se algum rotulo entrou
--      quebrado. Leia o cabecalho dele ANTES de copiar qualquer SQL
--      por PowerShell.


-- ==================================================================
-- 1) CALENDARIO -- colunas dia e dia_rotulo
-- ==================================================================

-- Calendario. Comeca no 1o de janeiro do ano do dado mais antigo do app
-- e vai ate o fim do ano corrente, para o eixo de tempo nao "terminar"
-- no meio de um grafico de evolucao.
create or replace view bi.dim_calendario as
with limite as (
  select date_trunc('year', least(
    coalesce((select min(data) from public.ag_contagens), current_date),
    coalesce((select min(data) from public.comunicados), current_date),
    coalesce((select min(bi.dia_local(criado_em)) from public.feedback_rota), current_date)
  ))::date as inicio
),
dias as (
  select generate_series(
    (select inicio from limite),
    (date_trunc('year', current_date) + interval '1 year - 1 day')::date,
    interval '1 day'
  )::date as data
)
select
  d.data,
  extract(year  from d.data)::int  as ano,
  extract(month from d.data)::int  as mes,
  (array['jan','fev','mar','abr','mai','jun',
         'jul','ago','set','out','nov','dez'])[extract(month from d.data)::int] as mes_abrev,
  (array['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
         'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])[extract(month from d.data)::int] as mes_nome,
  to_char(d.data, 'YYYY-MM')       as ano_mes,
  (array['jan','fev','mar','abr','mai','jun',
         'jul','ago','set','out','nov','dez'])[extract(month from d.data)::int]
    || '/' || to_char(d.data, 'YY') as mes_rotulo,
  'T' || extract(quarter from d.data)::int as trimestre,
  extract(week from d.data)::int   as semana_iso,
  to_char(d.data, 'IYYY-"S"IW')    as ano_semana,
  date_trunc('week', d.data)::date as inicio_semana,
  date_trunc('month', d.data)::date as inicio_mes,
  extract(isodow from d.data)::int as dia_semana,
  (array['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'])[extract(isodow from d.data)::int] as dia_semana_nome,
  (extract(isodow from d.data) >= 6) as fim_de_semana,
  (d.data <= current_date)         as ja_aconteceu,
  -- Rotulo curto de dia, para eixo de grafico diario.
  --
  -- Existe por um motivo especifico: num eixo com a data inteira
  -- ("01/08/2026", 10 caracteres) o Power BI nao consegue desenhar todos
  -- os rotulos e passa a PULAR dias -- o grafico mostra 03, 06, 09 e
  -- quem le acha que nos dias do meio nao houve nada. Com dois
  -- caracteres cabem os 31 dias do mes.
  --
  -- dia_rotulo e TEXTO e por isso ordenaria em ordem alfabetica; a
  -- coluna dia existe para ser o sortByColumn dele no modelo. Nao use
  -- dia_rotulo em recorte de mais de um mes: "01" de agosto e "01" de
  -- setembro sao a mesma categoria.
  extract(day from d.data)::int    as dia,
  to_char(d.data, 'DD')            as dia_rotulo
from dias d;

comment on view bi.dim_calendario is
  'Tabela de datas em pt-BR. Marque como Tabela de Datas no Power BI e ligue em todas as colunas "data".';

-- ==================================================================
-- 2) FEEDBACK x CIDADE
-- ==================================================================

-- O feedback cruzado com o relatorio de rotas -> CIDADE
-- ------------------------------------------------------------------
--
-- Por que isto existe: "rota mais critica" nao decide nada. O numero do
-- mapa muda todo dia -- a rota 14768 de ontem nao e a rota 14768 do mes
-- que vem --, entao apontar um mapa como "o pior" nao diz onde agir. A
-- CIDADE, sim: ela se repete, e "as notas caem toda vez que o mapa passa
-- por Barreiras" e uma frase sobre a qual da para tomar decisao.
--
-- O cruzamento e possivel porque as duas pontas ja existem no banco:
--   feedback_rota.rota  -> o motorista digita o numero do mapa (so
--                          digitos: o app faz replace(/\D/g,'') antes de
--                          gravar -- ver src/app/feedback-rota/actions.ts)
--   rotas.mapa          -> a planilha do roteirizador importada em
--                          /admin/rotas, sem zeros a esquerda, com as
--                          cidades daquele mapa em rotas.cidades (jsonb)
--
-- A funcao abaixo poe os dois no mesmo formato. E o equivalente SQL de
-- normalizarMapa() em src/lib/rotas.ts -- se a regra mudar la, mude aqui.
create or replace function bi.mapa_normalizado(bruto text)
returns text
language sql
immutable
as $$
  select nullif(
    coalesce(
      nullif(ltrim(regexp_replace(coalesce(bruto, ''), '\D', '', 'g'), '0'), ''),
      regexp_replace(coalesce(bruto, ''), '\D', '', 'g')
    ),
    ''
  )
$$;

-- Grao: feedback x cidade. Um feedback de um mapa que passa por tres
-- cidades vira TRES linhas -- por isso [Feedbacks por cidade] conta
-- feedback_id distinto, nunca linhas.
--
-- LEFT JOIN nas duas pontas de proposito. Feedback cujo mapa nao foi
-- encontrado (roteirizacao ainda nao importada, numero digitado errado)
-- continua aparecendo, com cidade 'Rota nao localizada' e
-- rota_localizada = false. Descartar essas linhas em silencio faria a
-- cobertura do cruzamento parecer 100% quando nao e.
--
-- O mapa se repete em datas diferentes (a chave de public.rotas e
-- revenda+data+mapa), entao pega-se a roteirizacao mais recente ATE o
-- dia do feedback: e a que estava valendo quando o motorista saiu.
create or replace view bi.fato_feedback_cidade as
select
  f.id                                as feedback_id,
  f.revenda_id,
  f.colaborador_id,
  bi.dia_local(f.criado_em)           as data,
  coalesce(nullif(btrim(f.rota), ''), 'Sem rota informada') as rota,
  f.nota,
  (f.nota <= 1)                       as nota_ruim,
  coalesce(
    nullif(btrim(c.item ->> 'cidade'), ''),
    'Rota não localizada'
  )                                   as cidade,
  coalesce((c.item ->> 'entregas')::int, 0) as entregas,
  (r.mapa is not null)                as rota_localizada,
  r.data                              as data_roteirizacao
from public.feedback_rota f
left join lateral (
  select r2.mapa, r2.cidades, r2.data, r2.revenda_id
    from public.rotas r2
   where r2.revenda_id = f.revenda_id
     and r2.mapa = bi.mapa_normalizado(f.rota)
     and r2.data <= bi.dia_local(f.criado_em)
   order by r2.data desc
   limit 1
) r on true
left join lateral jsonb_array_elements(
  case when jsonb_typeof(r.cidades) = 'array' then r.cidades else '[]'::jsonb end
) as c(item) on true;

comment on view bi.fato_feedback_cidade is
  'Grao: feedback x cidade da rota. Conte DISTINCT feedback_id, nunca linhas.';

-- ==================================================================
-- 3) MATRIZ DOS 5 PORQUES -- coluna tratativa
-- ==================================================================

-- Problema x causa x acao, ja agrupado. E o quadro que a gestao le:
-- "este problema, por esta causa, tantas vezes -- e o que fazemos".
create or replace view bi.fato_cinco_porques_matriz as
select
  a.revenda_id,
  a.problema_label            as problema,
  case coalesce(a.categoria, 'sem_categoria')
    when 'pessoas'      then 'Pessoas'      when 'processo'    then 'Processo'
    when 'rota'         then 'Rota'         when 'cliente'     then 'Cliente'
    when 'veiculo'      then 'Veículo'      when 'pedido'      then 'Pedido'
    when 'sistema'      then 'Sistema'      when 'estoque'     then 'Estoque'
    when 'comunicacao'  then 'Comunicação'  when 'externo'     then 'Externo'
    when 'outro'        then 'Outro'        else 'Sem categoria'
  end                         as categoria,
  a.causa_raiz,
  a.acao_sugerida,
  count(*)                                            as ocorrencias,
  count(distinct a.colaborador_id)                    as colaboradores,
  count(distinct a.rota)                              as rotas,
  count(*) filter (where a.tratativa_status = 'concluida') as tratadas,
  min(bi.dia_local(a.iniciada_em))                    as primeira_vez,
  max(bi.dia_local(a.iniciada_em))                    as ultima_vez,
  -- A TRATATIVA DO ANALISTA, na mesma linha da pauta.
  --
  -- Sem ela a tabela leva a reuniao ate "este problema, por esta causa,
  -- tantas vezes" e para -- e a primeira pergunta que alguem faz e "e o
  -- que a lideranca respondeu?". A resposta existia, mas so na pagina de
  -- Feedback da Rota, uma linha por feedback: quem estava lendo a pauta
  -- tinha de trocar de pagina e cruzar a mao.
  --
  -- Vale a MAIS RECENTE do grupo, e nao um string_agg de todas: numa
  -- linha de tabela cabe uma frase, e a devolutiva que interessa na
  -- reuniao e a ultima que a lideranca deu para aquele problema. O
  -- historico completo continua em bi.fato_cinco_porques, uma linha por
  -- analise.
  (array_remove(
     array_agg(
       nullif(btrim(coalesce(a.resposta_lideranca, '')), '')
       order by a.resposta_lideranca_em desc nulls last, a.iniciada_em desc
     ),
     null
   ))[1]                                              as tratativa,
  count(*) filter (where a.resposta_lideranca is not null) as com_tratativa
from public.cinco_porques_analises a
where a.status = 'concluida'
group by 1, 2, 3, 4, 5;

-- ==================================================================
-- 4) CRONOGRAMA DA COMUNICACAO
-- ==================================================================

-- CRONOGRAMA DE COMUNICACAO (a visao de calendario do app)
-- ------------------------------------------------------------------
--
-- Espelha /admin/comunicados/calendario. A pergunta que a lista ordenada
-- por data NAO responde e "que dias estao vazios?" -- buraco de duas
-- semanas sem comunicacao nenhuma nao aparece numa lista e salta aos
-- olhos numa grade.
--
-- Duas marcas por comunicado, e elas sao coisas diferentes:
--   Publicacao -> a materia entrando no jornal
--   Lembrete   -> o aviso dela tocando o celular, que pode ser dias depois
--
-- Por isso e um UNION ALL e nao duas colunas de data: no calendario elas
-- caem em CELULAS diferentes. Um comunicado sem lembrete gera uma linha
-- so; com lembrete, duas.
--
-- A data da publicacao sai de publicar_em quando ha agendamento, e de
-- data quando nao ha -- e a mesma regra da tela.
create or replace view bi.fato_comunicado_agenda as
select
  c.id                        as comunicado_id,
  c.revenda_id,
  c.titulo,
  c.categoria                 as categoria_id,
  initcap(c.categoria)        as categoria,
  'Publicação'::text          as tipo,
  '📰'::text                  as marca,
  coalesce(bi.dia_local(c.publicar_em), c.data) as data,
  case
    when c.publicar_em is null or c.publicar_em <= now() then 'Publicado'
    else 'Na fila'
  end                         as situacao,
  (c.publicar_em is not null and c.publicar_em > now()) as na_fila,
  to_char(c.publicar_em at time zone 'America/Sao_Paulo', 'HH24:MI') as hora,
  '📰 ' || coalesce(to_char(c.publicar_em at time zone 'America/Sao_Paulo', 'HH24:MI') || ' ', '')
        || c.titulo           as rotulo
from public.comunicados c

union all

select
  c.id,
  c.revenda_id,
  c.titulo,
  c.categoria,
  initcap(c.categoria),
  'Lembrete',
  '🔔',
  bi.dia_local(c.lembrete_em),
  case when c.lembrete_enviado_em is not null then 'Enviado' else 'Na fila' end,
  (c.lembrete_enviado_em is null),
  to_char(c.lembrete_em at time zone 'America/Sao_Paulo', 'HH24:MI'),
  '🔔 ' || to_char(c.lembrete_em at time zone 'America/Sao_Paulo', 'HH24:MI')
        || ' ' || c.titulo
from public.comunicados c
where c.lembrete_em is not null;

comment on view bi.fato_comunicado_agenda is
  'Grao: comunicado x marca (publicacao ou lembrete). Base do calendario do plano de comunicacao.';

-- ==================================================================
-- GRANTS
-- ==================================================================
-- View nova nasce sem permissao nenhuma para o powerbi_readonly, e o
-- sintoma disso aparece so na proxima atualizacao do Power BI, como
-- "permissao negada" numa consulta que ninguem mexeu.
--
-- Se o role ainda nao existir (banco novo), esta parte falha -- e a
-- resposta certa e rodar o 02-acesso-powerbi.sql, que o cria.
grant usage on schema bi to powerbi_readonly;
grant select on all tables in schema bi to powerbi_readonly;
grant execute on function bi.mapa_normalizado(text) to powerbi_readonly;

-- ==================================================================
-- CONFERENCIA RAPIDA
-- ==================================================================
-- As quatro linhas abaixo tem de devolver numero, e nao erro.
select 'dim_calendario.dia_rotulo' as conferindo, count(*) as linhas from bi.dim_calendario where dia_rotulo is not null
union all
select 'fato_feedback_cidade',                    count(*)            from bi.fato_feedback_cidade
union all
select 'matriz.tratativa (preenchidas)',          count(*)            from bi.fato_cinco_porques_matriz where tratativa is not null
union all
select 'fato_comunicado_agenda',                  count(*)            from bi.fato_comunicado_agenda;
