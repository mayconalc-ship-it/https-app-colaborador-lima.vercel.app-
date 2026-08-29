-- ==================================================================
-- 071 - ABASTECIMENTO E RESSUPRIMENTO DO PICKING
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Substitui o "Reabastecimento de Picking" (pa_reabastecimentos_picking),
-- que media POSICOES reabastecidas -- campo que estava vazio em 100% dos
-- 8 lancamentos existentes, ou seja, ninguem preenchia. O novo mede o
-- que a operacao consegue informar de verdade: produto, quantidade e
-- unidade; o HL sai do cadastro.
--
-- A tabela antiga NAO e apagada: guarda o historico de quem lancou e
-- quanto tempo levou, que continua valido. So sai do menu.
--
-- Sessao (Abastecimentos) + itens, com o tempo cronometrado pelo app --
-- mesmo desenho do Reepack, que a operacao ja conhece.

create table if not exists public.pa_abastecimentos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,
  tipo text not null check (tipo in ('completo', 'pontual')),
  turno text not null check (turno in ('manha', 'tarde', 'noite')),
  inicio timestamptz not null default now(),
  fim timestamptz,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluido')),
  observacao text,
  criado_em timestamptz not null default now(),
  constraint pa_abastecimento_periodo_valido check (fim is null or fim >= inicio)
);

-- Uma sessao aberta por pessoa. A trava e o indice, nao a tela: dois
-- toques quase simultaneos passariam por qualquer checagem em codigo.
-- Mesmo desenho do reepack (migration 052).
drop index if exists pa_abastecimento_aberto_unico;
create unique index pa_abastecimento_aberto_unico
  on public.pa_abastecimentos (colaborador_id) where fim is null;

create index if not exists pa_abastecimento_revenda_idx
  on public.pa_abastecimentos (revenda_id, inicio desc);

create table if not exists public.pa_abastecimento_itens (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  abastecimento_id uuid not null references public.pa_abastecimentos(id) on delete cascade,
  produto_id uuid not null references public.pa_produtos(id) on delete restrict,
  unidade text not null check (unidade in ('caixa', 'palete')),
  quantidade numeric(10,2) not null check (quantidade > 0),
  -- HL GRAVADO, nao recalculado na leitura. Se o fator do produto mudar
  -- amanha, o que ja foi abastecido continua valendo o que valia --
  -- mesmo desenho do litro do reepack e do despejo (migrations 051/054).
  hl_calculado numeric(12,3) not null check (hl_calculado >= 0),
  criado_em timestamptz not null default now()
);

create index if not exists pa_abastecimento_itens_sessao_idx
  on public.pa_abastecimento_itens (abastecimento_id);
create index if not exists pa_abastecimento_itens_produto_idx
  on public.pa_abastecimento_itens (revenda_id, produto_id);

alter table public.pa_abastecimentos enable row level security;
alter table public.pa_abastecimento_itens enable row level security;

-- Leitura por revenda: o controle precisa ver o de todo mundo, e quem
-- lancou precisa acompanhar o proprio.
drop policy if exists "le abastecimento da revenda" on public.pa_abastecimentos;
create policy "le abastecimento da revenda" on public.pa_abastecimentos
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

drop policy if exists "le itens de abastecimento da revenda" on public.pa_abastecimento_itens;
create policy "le itens de abastecimento da revenda" on public.pa_abastecimento_itens
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Escrita: so a propria sessao, so na revenda ativa. Mesmo desenho dos
-- demais lancamentos do armazem (migration 055).
drop policy if exists "insere abastecimento proprio" on public.pa_abastecimentos;
create policy "insere abastecimento proprio" on public.pa_abastecimentos
  for insert to authenticated
  with check (
    colaborador_id = auth.uid()
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  );

drop policy if exists "edita abastecimento proprio" on public.pa_abastecimentos;
create policy "edita abastecimento proprio" on public.pa_abastecimentos
  for update to authenticated
  using (
    colaborador_id = auth.uid()
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  )
  with check (
    colaborador_id = auth.uid()
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  );

drop policy if exists "exclui abastecimento proprio" on public.pa_abastecimentos;
create policy "exclui abastecimento proprio" on public.pa_abastecimentos
  for delete to authenticated
  using (
    colaborador_id = auth.uid()
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  );

-- Os itens seguem o dono da sessao.
drop policy if exists "insere item de abastecimento proprio" on public.pa_abastecimento_itens;
create policy "insere item de abastecimento proprio" on public.pa_abastecimento_itens
  for insert to authenticated
  with check (
    exists (
      select 1 from public.pa_abastecimentos a
       where a.id = abastecimento_id and a.colaborador_id = auth.uid()
    )
  );

drop policy if exists "exclui item de abastecimento proprio" on public.pa_abastecimento_itens;
create policy "exclui item de abastecimento proprio" on public.pa_abastecimento_itens
  for delete to authenticated
  using (
    exists (
      select 1 from public.pa_abastecimentos a
       where a.id = abastecimento_id and a.colaborador_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
