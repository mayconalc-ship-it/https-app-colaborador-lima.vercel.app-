-- ==================================================================
-- 123 - AG: JUSTIFICATIVA POR LINHA NA CONCILIACAO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (16/09/2026): um campo de observacao para justificar os
-- itens da conciliacao do AG -- opcional, e linha por linha.
--
-- A conciliacao e de UM conferente num dia (cada um conta o patio
-- inteiro), entao a justificativa e de revenda + dia + conferente +
-- tipo + formato. Ao congelar o dia, ela vai junto dos numeros para
-- ag_congelamento_itens -- e o que foi para a reuniao nao muda depois.

create table if not exists public.ag_conciliacao_justificativas (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  data date not null,
  conferente_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('Kit AG', 'GFE sem Garrafa')),
  formato text not null check (formato in ('600ml', '300ml', '1000ml', 'Verde')),
  justificativa text not null check (char_length(btrim(justificativa)) between 1 and 500),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_por_nome text,
  primary key (revenda_id, data, conferente_id, tipo, formato)
);

-- Lida por quem esta logado (a tela da conciliacao mostra a justificativa
-- para todos que a abrem); escrita so por acao de servidor, que confere
-- quem pode.
alter table public.ag_conciliacao_justificativas enable row level security;
grant select on public.ag_conciliacao_justificativas to authenticated;
grant all on public.ag_conciliacao_justificativas to service_role;
drop policy if exists ag_conciliacao_justificativas_ler on public.ag_conciliacao_justificativas;
create policy ag_conciliacao_justificativas_ler on public.ag_conciliacao_justificativas
  for select to authenticated using (true);

-- O dia congelado guarda a justificativa daquele momento.
alter table public.ag_congelamento_itens
  add column if not exists justificativa text
    check (justificativa is null or char_length(justificativa) <= 500);

notify pgrst, 'reload schema';

-- Confira: a tabela nova com RLS ligada, e a coluna nova nos itens congelados.
select 'ag_conciliacao_justificativas' as objeto, c.relrowsecurity::text as detalhe
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'ag_conciliacao_justificativas'
union all
select 'ag_congelamento_itens.justificativa', data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'ag_congelamento_itens' and column_name = 'justificativa';
