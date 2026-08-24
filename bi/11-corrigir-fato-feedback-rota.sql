-- ==================================================================
-- CORRECAO DE ACENTO -- bi.fato_feedback_rota -- 23/08/2026
-- ==================================================================
-- Ctrl+A e Ctrl+Enter.
--
-- O QUE ESTAVA ERRADO: a definicao da view no banco tinha
--   when 3 then 'Ã“tima'   <- 'Ótima' em UTF-8, lido como Latin-1
-- e por isso o grafico de distribuicao das notas mostrava a barra da
-- nota 3 com o nome torto. Os demais literais da mesma view ('Não
-- aceitou', 'Sem análise', 'Não respondeu') entraram quebrados junto --
-- foi a view inteira, colada de uma vez.
--
-- Diagnosticado em 23/08/2026 por 10-conferir-acentos.sql, consulta 1.
-- As outras 34 views do esquema passaram no teste: esta e a unica que
-- em algum momento foi recriada sozinha, e foi nessa colagem avulsa que
-- o acento se perdeu. O texto abaixo e o de 01-camada-semantica.sql,
-- recortado por script -- nao foi redigitado.
--
-- create or replace, e nao drop: a lista de colunas e identica a que ja
-- esta no banco, entao nada que dependa dela precisa ser recriado.

-- A escala e 0..3 (Ruim, Regular, Boa, Ótima). Guardo tres leituras da
-- mesma nota de proposito:
--   nota            -> para media na escala original, que e como o time fala
--   nota_percentual -> nota/3, para o cartao de KPI em % e para comparar
--                      com a Pesquisa de Satisfacao, que e 1..5
--   nota_ruim       -> o corte que o proprio app usa (<= 1 exige comentario)
create or replace view bi.fato_feedback_rota as
select
  f.id                                as feedback_id,
  f.revenda_id,
  f.colaborador_id,
  p.nome                              as colaborador,
  bi.area_padrao(p.area)              as area,
  bi.area_organizacional(p.area)      as area_rotulo,
  coalesce(nullif(btrim(p.cargo), ''), 'Sem cargo') as cargo,
  coalesce(nullif(btrim(f.rota), ''), 'Sem rota informada') as rota,
  f.nota,
  case f.nota
    when 0 then 'Ruim'
    when 1 then 'Regular'
    when 2 then 'Boa'
    when 3 then 'Ótima'
  end                                 as nota_rotulo,
  round(f.nota::numeric / 3, 4)       as nota_percentual,
  (f.nota <= 1)                       as nota_ruim,
  (f.nota = 3)                        as nota_otima,
  coalesce(cardinality(f.ocorrencias), 0) as qtd_ocorrencias,
  (coalesce(cardinality(f.ocorrencias), 0) = 0) as sem_ocorrencia,
  nullif(btrim(coalesce(f.comentario, '')), '') as comentario,
  (nullif(btrim(coalesce(f.comentario, '')), '') is not null) as tem_comentario,
  length(coalesce(btrim(f.comentario), ''))     as tamanho_comentario,
  f.criado_em,
  bi.dia_local(f.criado_em)           as data,
  extract(hour from (f.criado_em at time zone 'America/Sao_Paulo'))::int as hora,
  -- Existe analise de 5 Porques amarrada a este feedback?
  exists (
    select 1 from public.cinco_porques_analises a
     where a.feedback_rota_id = f.id
  )                                   as tem_cinco_porques,
  -- O ciclo fechado, na mesma linha da reclamacao: causa raiz, o que a
  -- lideranca respondeu e se o colaborador aceitou.
  --
  -- Colunas no FIM da lista de proposito: "create or replace view" do
  -- Postgres aceita acrescentar coluna no fim, e recusa no meio com
  -- 42P16. Assim esta view sozinha pode ser recriada sem derrubar o
  -- esquema inteiro -- e sem perder os GRANTs do powerbi_readonly.
  --
  -- LATERAL com limit 1, e nao join simples: se um feedback tivesse duas
  -- analises, o join duplicaria a linha e [Feedbacks] passaria a contar
  -- errado. Fica a mais recente, que e a que vale.
  a.causa_raiz                        as cp_causa_raiz,
  a.resposta_lideranca                as cp_devolutiva,
  case a.motorista_aceitou
    when true  then 'Aceitou'
    when false then 'Não aceitou'
    else case when a.id is null then 'Sem análise' else 'Não respondeu' end
  end                                 as cp_aceite_rotulo,
  a.motorista_aceitou                 as cp_aceitou,
  a.resposta_lideranca_em             as cp_devolutiva_em
from public.feedback_rota f
left join public.profiles p on p.id = f.colaborador_id
left join lateral (
  select a2.id, a2.causa_raiz, a2.resposta_lideranca, a2.motorista_aceitou,
         a2.resposta_lideranca_em
    from public.cinco_porques_analises a2
   where a2.feedback_rota_id = f.id
   order by a2.iniciada_em desc
   limit 1
) a on true;

comment on view bi.fato_feedback_rota is
  'Grao: um feedback. Uma linha por envio, com a nota em tres leituras.';

-- ------------------------------------------------------------------
-- CONFERENCIA
-- ------------------------------------------------------------------
-- A primeira tem de voltar VAZIA. A segunda tem de mostrar
-- Boa / Otima / Regular / Ruim escritos direito -- leia com os olhos.
select table_name as ainda_quebrada
  from information_schema.views
 where table_schema = 'bi'
   -- chr(195) = Ã, chr(194) = Â. Escrito assim porque o padrao literal
   -- chegaria quebrado pela mesma colagem que ele vigia -- ver
   -- 10-conferir-acentos.sql.
   and view_definition ~ ('[' || chr(195) || chr(194) || ']');

select nota_rotulo, count(*) as feedbacks
  from bi.fato_feedback_rota
 group by 1
 order by 1;