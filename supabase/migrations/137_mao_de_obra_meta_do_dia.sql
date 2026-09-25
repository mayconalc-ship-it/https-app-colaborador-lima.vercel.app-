-- ==================================================================
-- 137 - MAO DE OBRA: A META DO DIA FECHA COM O VOLUME (25/09/2026)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O dono viu a grade pedindo 15.898 HL num mes de 11.780: a meta saia dos
-- dias INFORMADOS (16 uteis) mas era distribuida pelos dias do CALENDARIO
-- (22 de semana). Agora a meta e distribuida pelos dias que REALMENTE
-- operam, e o total bate com o volume informado, sempre.
--
--   mao_obra_dias.opera      -- domingo ja nasce desligado; feriado se
--                               desliga com um clique, e a meta dos
--                               outros dias sobe sozinha.
--   mao_obra_meses.base_meta -- qual volume a grade distribui:
--                               'negociado' (padrao) ou 'ppr'.
-- ==================================================================

alter table public.mao_obra_dias
  add column if not exists opera boolean not null default true;

alter table public.mao_obra_meses
  add column if not exists base_meta text not null default 'negociado';

alter table public.mao_obra_meses
  drop constraint if exists mao_obra_meses_base_meta_check;
alter table public.mao_obra_meses
  add constraint mao_obra_meses_base_meta_check
  check (base_meta in ('negociado', 'ppr'));

notify pgrst, 'reload schema';

-- Confira: as duas colunas novas.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'mao_obra_dias' and column_name = 'opera')
    or (table_name = 'mao_obra_meses' and column_name = 'base_meta'))
order by table_name;
