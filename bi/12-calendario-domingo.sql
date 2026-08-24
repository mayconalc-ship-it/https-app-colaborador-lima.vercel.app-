-- ==================================================================
-- CALENDARIO DOMINGO-PRIMEIRO + DIAGNOSTICO DE CIDADE -- 23/08/2026
-- ==================================================================
-- Ctrl+A e Ctrl+Enter. Depois rode a ULTIMA consulta separada, com o
-- mouse, porque o SQL Editor so exibe o resultado da ultima instrucao.
--
-- 1) dim_calendario ganha tres colunas, no FIM da lista (create or
--    replace do Postgres aceita acrescentar no fim e recusa no meio):
--
--      dia_semana_dom    1=dom .. 7=sab
--      dia_semana_abrev  dom, seg, ter, qua, qui, sex, sab
--      semana_dom        o domingo que abre a semana
--
--    Elas convivem com as ISO (dia_semana, inicio_semana) em vez de
--    substitui-las. As ISO comecam na segunda, que e o certo para
--    semana util -- e a meta de 3 contagens/semana do Ativo de Giro se
--    apoia nisso. Calendario de parede comeca no domingo. Sao duas
--    perguntas diferentes e cada uma fica com a sua coluna.
--
--    create or replace preserva os GRANTs: nao precisa rodar o 02.-- Calendario. Comeca no 1o de janeiro do ano do dado mais antigo do app
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
  to_char(d.data, 'DD')            as dia_rotulo,
  -- Semana COMECANDO NO DOMINGO, para o calendario do plano de
  -- comunicacao.
  --
  -- inicio_semana e dia_semana logo acima sao ISO: a semana comeca na
  -- segunda. Isso e o certo para indicador de operacao -- semana util e
  -- de segunda a sexta --, e errado para calendario: a tela de
  -- /admin/comunicados/calendario monta a grade com domingo na primeira
  -- coluna, como qualquer calendario de parede, e uma grade que comeca
  -- na segunda nao e reconhecida como calendario por quem olha.
  --
  -- As tres convivem com as ISO de proposito, em vez de substitui-las:
  -- trocar dia_semana por versao domingo-primeiro mudaria a conta de
  -- fim_de_semana e de dias uteis, e o AG mede meta em cima disso.
  (extract(dow from d.data) + 1)::int as dia_semana_dom,
  (array['dom','seg','ter','qua','qui','sex','sáb'])[extract(dow from d.data)::int + 1] as dia_semana_abrev,
  (d.data - extract(dow from d.data)::int)::date as semana_dom
from dias d;

comment on view bi.dim_calendario is
  'Tabela de datas em pt-BR. Marque como Tabela de Datas no Power BI e ligue em todas as colunas "data".';

-- ------------------------------------------------------------------
-- CONFERENCIA DO CALENDARIO
-- ------------------------------------------------------------------
select dia_semana_dom, dia_semana_abrev, count(*) as dias
  from bi.dim_calendario
 group by 1, 2
 order by 1;

-- ------------------------------------------------------------------
-- 2) DIAGNOSTICO: as notas por cidade
-- ------------------------------------------------------------------
-- RODE ESTA SEPARADO (selecione com o mouse e Ctrl+Enter).
--
-- Responde as duas duvidas de uma vez: por que a cidade critica deu
-- Jaborandi, e se o cruzamento so trouxe Barreiras.
--
-- elegivel = true e o corte de >= 3 feedbacks que a medida [Cidade mais
-- critica] aplica. A cidade critica e a de MENOR nota_media entre as
-- elegiveis -- nao a de mais feedbacks e nao a de mais notas ruins.
select
  cidade,
  count(distinct feedback_id)                          as feedbacks,
  round(avg(nota::numeric), 2)                         as nota_media,
  count(distinct feedback_id) filter (where nota_ruim) as notas_ruins,
  count(distinct feedback_id) >= 3                     as elegivel
from bi.fato_feedback_cidade
where rota_localizada
group by 1
order by nota_media asc, feedbacks desc;