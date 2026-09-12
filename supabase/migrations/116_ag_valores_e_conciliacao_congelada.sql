-- ==================================================================
-- 116 - AG: VALOR EM R$ POR CAIXA E CONCILIACAO CONGELADA
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (12/09/2026), na analise do BI:
--
--   1. "insira um modulo em configuracao ativo de giro para colocar os
--      valores dos AGs e com isso ter valores em R$" -- um valor por
--      CAIXA de cada item (tipo + formato), a mesma unidade do parque,
--      do contado e do transito. A diferenca em R$ sai direto:
--      diferenca em caixas x valor da caixa.
--
--   2. "um botao congelar inventario ... congele a conciliacao e que va
--      somente para o BI essas conciliacoes congeladas". Quem congela e
--      quem tem a liberacao (lista na configuracao do AG, igual a do
--      transito) ou administra o modulo; REABRIR e so do Admin, decisao
--      do dono.
--
-- O DIA CONGELADO GUARDA OS NUMEROS, e nao so uma marca: contado, as
-- tres parcelas, o parque e o valor da caixa daquele momento. O parque,
-- o comodato e o preco mudam depois -- e o numero que foi para a reuniao
-- nao pode mudar junto.

-- ------------------------------------------------------------------
-- 1) VALOR DA CAIXA, por item -- saldo que vale ate alguem mudar
-- ------------------------------------------------------------------
create table if not exists public.ag_valores (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  tipo text not null check (tipo in ('Kit AG', 'GFE sem Garrafa')),
  formato text not null check (formato in ('600ml', '300ml', '1000ml', 'Verde')),
  valor_caixa numeric(12, 2) not null default 0 check (valor_caixa >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_por_nome text,
  primary key (revenda_id, tipo, formato)
);

alter table public.ag_valores enable row level security;
grant select on public.ag_valores to authenticated;
grant all on public.ag_valores to service_role;
drop policy if exists ag_valores_ler on public.ag_valores;
create policy ag_valores_ler on public.ag_valores
  for select to authenticated using (true);

comment on table public.ag_valores is
  'Valor em R$ de UMA caixa de cada item de AG. Grava so por acao de servidor.';

-- ------------------------------------------------------------------
-- 2) QUEM PODE CONGELAR -- mesmo desenho de ag_transito_liberados
-- ------------------------------------------------------------------
-- RLS ligada e policy nenhuma, de proposito: quem le pelo cliente comum
-- descobriria quem pode congelar, e quem escrevesse se liberaria sozinho.
create table if not exists public.ag_congelar_liberados (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  liberado_por uuid references auth.users(id) on delete set null,
  liberado_em timestamptz not null default now(),
  primary key (revenda_id, colaborador_id)
);

alter table public.ag_congelar_liberados enable row level security;
grant all on public.ag_congelar_liberados to service_role;

-- ------------------------------------------------------------------
-- 3) O DIA CONGELADO -- uma conciliacao oficial por revenda e dia
-- ------------------------------------------------------------------
create table if not exists public.ag_congelamentos (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  data date not null,
  -- Cada conferente conta o patio inteiro (dupla contagem cega): o dia
  -- congelado e a contagem de UM deles contra o parque.
  conferente_id uuid references auth.users(id) on delete set null,
  conferente_nome text not null,
  congelado_por uuid references auth.users(id) on delete set null,
  congelado_por_nome text,
  congelado_em timestamptz not null default now(),
  primary key (revenda_id, data)
);

create table if not exists public.ag_congelamento_itens (
  revenda_id uuid not null,
  data date not null,
  tipo text not null check (tipo in ('Kit AG', 'GFE sem Garrafa')),
  formato text not null check (formato in ('600ml', '300ml', '1000ml', 'Verde')),
  contado integer not null default 0,
  transito_rota integer not null default 0,
  transito_carreta integer not null default 0,
  comodato integer not null default 0,
  parque integer not null default 0,
  -- Nulo = o item nao tinha valor cadastrado quando o dia foi congelado.
  valor_caixa numeric(12, 2),
  primary key (revenda_id, data, tipo, formato),
  foreign key (revenda_id, data)
    references public.ag_congelamentos (revenda_id, data) on delete cascade
);

-- Lidos por quem esta logado: a tela da conciliacao mostra que o dia
-- esta congelado, e por quem. Escrever e apagar so por acao de servidor.
alter table public.ag_congelamentos enable row level security;
alter table public.ag_congelamento_itens enable row level security;
grant select on public.ag_congelamentos to authenticated;
grant select on public.ag_congelamento_itens to authenticated;
grant all on public.ag_congelamentos to service_role;
grant all on public.ag_congelamento_itens to service_role;

drop policy if exists ag_congelamentos_ler on public.ag_congelamentos;
create policy ag_congelamentos_ler on public.ag_congelamentos
  for select to authenticated using (true);
drop policy if exists ag_congelamento_itens_ler on public.ag_congelamento_itens;
create policy ag_congelamento_itens_ler on public.ag_congelamento_itens
  for select to authenticated using (true);

comment on table public.ag_congelamentos is
  'Conciliacao do AG congelada: a oficial do dia, a unica que vai para o BI. Reabrir e so do Admin.';

notify pgrst, 'reload schema';

-- Confira: as quatro tabelas, e todas com RLS ligada.
select c.relname as tabela, c.relrowsecurity as rls_ligada
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('ag_valores', 'ag_congelar_liberados', 'ag_congelamentos', 'ag_congelamento_itens')
order by 1;
