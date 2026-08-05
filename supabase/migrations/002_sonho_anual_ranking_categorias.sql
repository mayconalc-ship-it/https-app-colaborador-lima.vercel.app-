-- Execute no Supabase: SQL Editor > New query > colar > Run

-- Sonho da Revenda: agora e anual, com frase e quadro de indicadores
alter table public.sonho_revenda
  add column if not exists ano int,
  add column if not exists frase text,
  add column if not exists quadro_indicadores_url text;

update public.sonho_revenda set ano = extract(year from criado_em)::int where ano is null;

alter table public.sonho_revenda alter column ano set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sonho_revenda_ano_unique'
  ) then
    alter table public.sonho_revenda add constraint sonho_revenda_ano_unique unique (ano);
  end if;
end $$;

-- Ranking Super Matinal: agora tem time (DU/AL) e categoria de premiacao
-- Remove os envios de teste antigos, que nao tinham essa classificacao
delete from public.ranking_matinal;

alter table public.ranking_matinal
  add column if not exists time text,
  add column if not exists categoria text;

alter table public.ranking_matinal alter column time set not null;
alter table public.ranking_matinal alter column categoria set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ranking_matinal_time_check'
  ) then
    alter table public.ranking_matinal add constraint ranking_matinal_time_check check (time in ('DU', 'AL'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'ranking_matinal_unique'
  ) then
    alter table public.ranking_matinal add constraint ranking_matinal_unique unique (mes_ano, time, categoria);
  end if;
end $$;
