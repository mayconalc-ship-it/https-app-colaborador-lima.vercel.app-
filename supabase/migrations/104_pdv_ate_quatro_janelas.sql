-- ==================================================================
-- 104 - Particularidades do PDV: ate quatro janelas de horario
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (06/09/2026): "deixe para informar 4 horarios no dia. Tem
-- PDV que recebe por exemplo das 08 as 11 e das 15 as 16h".
--
-- O caso e real e comum: o cliente fecha para o almoco, ou so recebe antes
-- de abrir e depois que fecha. Com UMA janela so, quem cadastrava tinha
-- duas saidas ruins -- escrever "das 08 as 16" (que manda o motorista
-- chegar as 12h e voltar) ou jogar o segundo horario no texto do aviso,
-- onde nenhuma regra enxerga.
--
-- UMA COLUNA JSONB, E NAO OITO COLUNAS DE HORA. `hora_de_2`, `hora_ate_2`,
-- `hora_de_3`... seria a tabela carregando um limite do formulario, e o
-- dia em que alguem precisar da quinta janela pediria migration. O limite
-- de quatro e da TELA, que e onde ele existe de verdade: e o que cabe na
-- cabeca de quem le na porta do cliente.
--
-- A forma de cada janela: {"de": "08:00", "ate": "11:00"}, com qualquer um
-- dos dois podendo faltar ("ate as 11h" e um horario legitimo).

alter table public.pa_pdv_particularidades
  add column if not exists janelas jsonb not null default '[]'::jsonb;

comment on column public.pa_pdv_particularidades.janelas is
  'Ate 4 janelas de horario, na forma [{"de":"08:00","ate":"11:00"},...]. O limite de 4 e da tela. Janela sem "de" vale como "ate as X"; sem "ate", como "a partir das X".';

-- A JANELA ANTIGA VIRA A PRIMEIRA DA LISTA. Hoje nao ha nenhuma linha com
-- horario preenchido (5 particularidades na base, todas do Rating, todas
-- sem hora), mas o backfill vai escrito de qualquer jeito: migration que
-- so funciona no banco de hoje e uma armadilha para o banco de amanha.
update public.pa_pdv_particularidades
   set janelas = jsonb_build_array(
         jsonb_strip_nulls(
           jsonb_build_object(
             'de',  case when hora_de  is null then null else to_char(hora_de,  'HH24:MI') end,
             'ate', case when hora_ate is null then null else to_char(hora_ate, 'HH24:MI') end
           )
         )
       )
 where (hora_de is not null or hora_ate is not null)
   and janelas = '[]'::jsonb;

-- E AS COLUNAS ANTIGAS SAEM. Deixa-las seria manter DUAS verdades sobre o
-- mesmo fato -- e a que o codigo parasse de escrever envelheceria calada,
-- ate alguem ler a errada. Seguro: o backfill acima ja levou o conteudo.
alter table public.pa_pdv_particularidades
  drop column if exists hora_de,
  drop column if exists hora_ate;

notify pgrst, 'reload schema';

-- Confira: nenhuma linha perdida, e a coluna nova no lugar.
select
  count(*) as particularidades,
  count(*) filter (where jsonb_array_length(janelas) > 0) as com_horario
from public.pa_pdv_particularidades;
