-- ==================================================================
-- 125 - MATERIAL DE APOIO: LEMBRETE DIARIO DA CONTAGEM
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (16/09/2026): o material de apoio precisa ser contado
-- TODO DIA -- e so contando todo dia se sabe de fato quanto sai. Um aviso
-- diario, num horario escolhido, para as pessoas escolhidas.
--
-- O aviso so sai se ainda nao houve contagem no dia (fuso da operacao), e
-- sai uma vez por dia. Quem conta tira o aviso do sino de todos.

-- A configuracao: uma linha por revenda.
create table if not exists public.ma_lembrete_config (
  revenda_id uuid primary key references public.revendas(id) on delete cascade,
  ativo boolean not null default true,
  -- Hora cheia, no horario de Brasilia. Entre 5h e 22h: fora disso o aviso
  -- acorda alguem de madrugada.
  hora smallint not null default 14 check (hora between 5 and 22),
  atualizado_em timestamptz not null default now(),
  atualizado_por_nome text
);

-- Quem recebe. Separado de ma_destinatarios (o alerta de COMPRA): quem
-- compra nao e, em geral, quem conta.
create table if not exists public.ma_lembrete_destinatarios (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (revenda_id, colaborador_id)
);

alter table public.ma_lembrete_config enable row level security;
alter table public.ma_lembrete_destinatarios enable row level security;

drop policy if exists "le lembrete da revenda" on public.ma_lembrete_config;
create policy "le lembrete da revenda" on public.ma_lembrete_config
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

drop policy if exists "le destinatarios do lembrete da revenda" on public.ma_lembrete_destinatarios;
create policy "le destinatarios do lembrete da revenda" on public.ma_lembrete_destinatarios
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

notify pgrst, 'reload schema';

-- Confira: as duas tabelas novas, com RLS ligada.
select c.relname as tabela, c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('ma_lembrete_config', 'ma_lembrete_destinatarios')
order by 1;
