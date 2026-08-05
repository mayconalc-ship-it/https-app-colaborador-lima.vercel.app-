-- Execute no Supabase: SQL Editor > New query > colar > Run

drop table if exists public.padroes;

create table public.padroes (
  id bigint generated always as identity primary key,
  pilar text not null check (pilar in ('Planejamento', 'Armazém', 'Controle', 'Entrega', 'Frota')),
  caminho text not null default '',
  nome text not null,
  tipo text not null,
  arquivo_url text not null,
  criado_em timestamptz not null default now()
);

alter table public.padroes enable row level security;

create policy "colaboradores leem padroes"
  on public.padroes for select
  using (auth.role() = 'authenticated');
