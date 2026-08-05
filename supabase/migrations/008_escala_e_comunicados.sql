-- Execute no Supabase: SQL Editor > New query > colar > Run

-- 1) Escala de trabalho: agora e uma por area (Distribuicao e Armazem).
-- A tabela antiga so guardava um arquivo solto e nunca chegou a ser usada.
drop table if exists public.escala_trabalho;

create table public.escala_trabalho (
  area text primary key check (area in ('DU', 'AL')),
  rotulo text not null,
  arquivo_url text,
  tipo text,
  observacao text,
  atualizado_em timestamptz not null default now()
);

alter table public.escala_trabalho enable row level security;

create policy "colaboradores leem escala"
  on public.escala_trabalho for select
  using (auth.role() = 'authenticated');

insert into public.escala_trabalho (area, rotulo) values
  ('DU', 'Distribuição Urbana'),
  ('AL', 'Armazém Logístico')
on conflict (area) do nothing;

-- 2) Comunicados viram um jornal: ganham editoria, resumo e destaque.
alter table public.comunicados
  add column if not exists categoria text not null default 'geral',
  add column if not exists resumo text,
  add column if not exists destaque boolean not null default false,
  add column if not exists autor text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'comunicados_categoria_check'
  ) then
    alter table public.comunicados
      add constraint comunicados_categoria_check
      check (categoria in ('cultura','seguranca','engajamento','operacao','gente','geral'));
  end if;
end $$;

create index if not exists comunicados_data_idx
  on public.comunicados (data desc, id desc);
