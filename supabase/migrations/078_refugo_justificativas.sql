-- ==================================================================
-- 078 - REFUGO: a explicacao de quem entregou
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono, 30/08/2026: o Refugo passa a aceitar explicacao do
-- colaborador, como o Rating e a Devolucao ja aceitam.
--
-- POR QUE NAO E POR META, como na Devolucao: refugo e raro. Nas 434
-- afericoes do ano, so 115 tiveram algum refugo (26%), com mediana de
-- 0,19%. Uma meta de 1% faria o campo aparecer 4 vezes no ano inteiro
-- para a operacao toda -- um campo que ninguem ve nao e autonomia.
-- Entao o gatilho e TER REFUGO na afericao, e as destoantes (o alerta
-- que ja existe em lib/refugo.ts) so aparecem em destaque.

create table if not exists public.refugo_justificativas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  afericao_id uuid not null references public.refugo_afericoes(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,
  -- No refugo o conferente tambem aparece na afericao, e a explicacao
  -- dele vale tanto quanto a de quem entregou.
  papel text not null check (papel in ('motorista', 'ajudante', 'conferente')),
  texto text not null check (length(btrim(texto)) > 0),
  criado_em timestamptz not null default now(),
  -- Uma explicacao por pessoa por afericao. Reenviar corrige a propria,
  -- nao empilha uma segunda.
  unique (afericao_id, colaborador_id)
);

create index if not exists refugo_justificativas_afericao_idx
  on public.refugo_justificativas (afericao_id);

-- -------------------- RLS --------------------
alter table public.refugo_justificativas enable row level security;

-- Cada um enxerga e escreve a PROPRIA explicacao. Igual a devolucao: a
-- leitura pela lideranca acontece pela tela de Admin, com o cliente de
-- servico, nao afrouxando esta politica.
drop policy if exists "le a propria justificativa de refugo" on public.refugo_justificativas;
create policy "le a propria justificativa de refugo" on public.refugo_justificativas
  for select to authenticated
  using (colaborador_id = auth.uid());

drop policy if exists "escreve a propria justificativa de refugo" on public.refugo_justificativas;
create policy "escreve a propria justificativa de refugo" on public.refugo_justificativas
  for insert to authenticated
  with check (colaborador_id = auth.uid());

drop policy if exists "corrige a propria justificativa de refugo" on public.refugo_justificativas;
create policy "corrige a propria justificativa de refugo" on public.refugo_justificativas
  for update to authenticated
  using (colaborador_id = auth.uid())
  with check (colaborador_id = auth.uid());

notify pgrst, 'reload schema';
