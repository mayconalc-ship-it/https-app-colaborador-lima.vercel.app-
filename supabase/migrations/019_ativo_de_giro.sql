-- ==================================================================
-- 019 - ATIVO DE GIRO (AG)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Tres tabelas:
--   ag_contagens - o que cada colaborador contou, dia a dia
--   ag_parque    - o saldo oficial do parque (base da conciliacao)
--   ag_fatores   - caixas por palete e por lastro, de cada formato
--
-- Regra de acesso, em uma frase: todo mundo que esta logado LE tudo,
-- cada um so mexe na propria contagem, e parque/fatores so mudam pelo
-- servidor (service role), depois da acao conferir a permissao.

-- ------------------------------------------------------------------
-- 1) CONTAGENS
-- ------------------------------------------------------------------
create table if not exists public.ag_contagens (
  id bigint generated always as identity primary key,
  data date not null,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,
  tipo text not null check (tipo in ('Kit AG', 'GFE sem Garrafa')),
  formato text not null check (formato in ('600ml', '300ml', '1000ml', 'Verde')),
  status text not null check (status in ('Cheio', 'Vazio', 'Trânsito Rota', 'Trânsito Fábrica')),
  palete integer not null default 0 check (palete >= 0),
  lastro integer not null default 0 check (lastro >= 0),
  caixa integer not null default 0 check (caixa >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists ag_contagens_data_idx
  on public.ag_contagens (data desc);
create index if not exists ag_contagens_pessoa_idx
  on public.ag_contagens (colaborador_id, data desc);

-- ------------------------------------------------------------------
-- 2) PARQUE DE AG
-- ------------------------------------------------------------------
create table if not exists public.ag_parque (
  tipo text not null check (tipo in ('Kit AG', 'GFE sem Garrafa')),
  formato text not null check (formato in ('600ml', '300ml', '1000ml', 'Verde')),
  quantidade integer not null default 0 check (quantidade >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (tipo, formato)
);

-- ------------------------------------------------------------------
-- 3) FATORES DE CONVERSAO
-- ------------------------------------------------------------------
create table if not exists public.ag_fatores (
  formato text primary key check (formato in ('600ml', '300ml', '1000ml', 'Verde')),
  palete integer not null check (palete > 0),
  lastro integer not null check (lastro > 0),
  atualizado_em timestamptz not null default now()
);

insert into public.ag_fatores (formato, palete, lastro) values
  ('600ml', 42, 7),
  ('300ml', 90, 10),
  ('1000ml', 50, 10),
  ('Verde', 42, 7)
on conflict (formato) do nothing;

-- ------------------------------------------------------------------
-- 4) PERMISSOES DE TABELA (Data API)
-- ------------------------------------------------------------------
grant select, insert, update, delete on public.ag_contagens to authenticated;
grant select on public.ag_parque to authenticated;
grant select on public.ag_fatores to authenticated;
grant all on public.ag_contagens to service_role;
grant all on public.ag_parque to service_role;
grant all on public.ag_fatores to service_role;

-- ------------------------------------------------------------------
-- 5) RLS
-- ------------------------------------------------------------------
alter table public.ag_contagens enable row level security;
alter table public.ag_parque enable row level security;
alter table public.ag_fatores enable row level security;

drop policy if exists ag_contagens_ler on public.ag_contagens;
create policy ag_contagens_ler on public.ag_contagens
  for select to authenticated using (true);

drop policy if exists ag_contagens_criar on public.ag_contagens;
create policy ag_contagens_criar on public.ag_contagens
  for insert to authenticated with check (colaborador_id = auth.uid());

drop policy if exists ag_contagens_editar on public.ag_contagens;
create policy ag_contagens_editar on public.ag_contagens
  for update to authenticated
  using (colaborador_id = auth.uid())
  with check (colaborador_id = auth.uid());

drop policy if exists ag_contagens_excluir on public.ag_contagens;
create policy ag_contagens_excluir on public.ag_contagens
  for delete to authenticated using (colaborador_id = auth.uid());

-- Parque e fatores: leitura para quem esta logado. Escrita nao tem
-- politica nenhuma de proposito -- so passa pelo service role, e a acao
-- de servidor confere a permissao antes.
drop policy if exists ag_parque_ler on public.ag_parque;
create policy ag_parque_ler on public.ag_parque
  for select to authenticated using (true);

drop policy if exists ag_fatores_ler on public.ag_fatores;
create policy ag_fatores_ler on public.ag_fatores
  for select to authenticated using (true);

-- ------------------------------------------------------------------
-- 6) atualizado_em automatico nas contagens
-- ------------------------------------------------------------------
create or replace function public.ag_touch_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists ag_contagens_touch on public.ag_contagens;
create trigger ag_contagens_touch
  before update on public.ag_contagens
  for each row execute function public.ag_touch_atualizado_em();

-- ------------------------------------------------------------------
-- 7) Item no menu do app
-- ------------------------------------------------------------------
insert into public.menu_itens (chave, titulo, emoji, href, ordem, visivel)
values ('ativo-giro', 'Ativo de Giro', '📦', '/ativo-de-giro', 10, true)
on conflict (chave) do nothing;
