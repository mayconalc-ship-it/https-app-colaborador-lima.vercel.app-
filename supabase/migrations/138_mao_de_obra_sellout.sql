-- ==================================================================
-- 138 - MAO DE OBRA: % DE SELLOUT POR DIA DA SEMANA (25/09/2026)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono: o volume do dia depende do DIA DA SEMANA -- segunda nao
-- vende como sexta, e sabado vende menos que os dois. A curva entra nos
-- parametros, em percentual, e a soma dos dias que operam tem de fechar
-- em 100%: e ela que distribui o volume do mes pela grade do dia.
--
-- Tudo zerado = curva desligada, e a meta volta a ser a media simples
-- (sabado com o volume cadastrado, o resto dividido pelos dias uteis).
-- ==================================================================

alter table public.mao_obra_config
  add column if not exists sellout_seg numeric(6,3) not null default 0,
  add column if not exists sellout_ter numeric(6,3) not null default 0,
  add column if not exists sellout_qua numeric(6,3) not null default 0,
  add column if not exists sellout_qui numeric(6,3) not null default 0,
  add column if not exists sellout_sex numeric(6,3) not null default 0,
  add column if not exists sellout_sab numeric(6,3) not null default 0,
  add column if not exists sellout_dom numeric(6,3) not null default 0;

-- Nenhum dia pode puxar mais que 100% nem menos que zero.
do $$
declare d text;
begin
  foreach d in array array['seg','ter','qua','qui','sex','sab','dom'] loop
    execute format(
      'alter table public.mao_obra_config drop constraint if exists mao_obra_sellout_%s_check', d);
    execute format(
      'alter table public.mao_obra_config add constraint mao_obra_sellout_%s_check check (sellout_%s >= 0 and sellout_%s <= 100)',
      d, d, d);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Confira: as 7 colunas novas.
select count(*) as colunas_de_sellout
from information_schema.columns
where table_schema = 'public' and table_name = 'mao_obra_config'
  and column_name like 'sellout_%';
