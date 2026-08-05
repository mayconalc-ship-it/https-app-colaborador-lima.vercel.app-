-- Execute no Supabase: SQL Editor > New query > colar > Run

-- Guarda os links das planilhas de RV publicadas no Google Drive.
-- Fica no banco (e nao em variavel de ambiente) para o admin poder trocar
-- o link pelo proprio app, sem precisar de uma nova publicacao do site.
create table if not exists public.rv_config (
  area text primary key check (area in ('DU', 'AL')),
  rotulo text not null,
  csv_url text,
  coluna_cpf text,
  coluna_valor text,
  atualizado_em timestamptz not null default now()
);

alter table public.rv_config enable row level security;

insert into public.rv_config (area, rotulo) values
  ('DU', 'Distribuição'),
  ('AL', 'Armazém')
on conflict (area) do nothing;
