-- ==================================================================
-- 087 - BATE PALETE
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O palete chega da fabrica com avaria. Alguem precisa desmonta-lo,
-- TIRAR as caixas avariadas e REPOR com caixas boas ate o palete voltar
-- a ficar inteiro. E isso que a operacao chama de "bater o palete", e ate
-- hoje esse trabalho nao era medido em lugar nenhum.
--
-- NAO E A SELECAO E TRIAGEM do Repack (POP-ARM-001, migration 065), e a
-- diferenca precisa ficar dita para as duas nao contarem o mesmo
-- trabalho:
--
--   Selecao e Triagem -> inspeciona unidade por unidade, lava, seca e
--                        decide o que e descarte e o que e recuperavel.
--                        O produto dela e a unidade limpa.
--   Bate palete       -> remonta o PALETE: tira o avariado, completa com
--                        bom, e o palete volta inteiro para o estoque.
--                        O produto dela e o palete.
--
-- Um lote pode passar pelas duas. Somadas, dariam um numero que nao
-- descreve nenhuma.
--
-- Sessao + itens, com o tempo cronometrado pelo app -- o mesmo desenho do
-- Abastecimento (migration 071) e do Reepack, que a operacao ja conhece.
-- Um item = UM PALETE batido.

create table if not exists public.pa_bate_palete (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,
  turno text not null check (turno in ('manha', 'tarde', 'noite')),
  inicio timestamptz not null default now(),
  fim timestamptz,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluido')),
  observacao text,
  criado_em timestamptz not null default now(),
  constraint pa_bate_palete_periodo_valido check (fim is null or fim >= inicio)
);

-- Uma sessao aberta por pessoa. A trava e o indice, nao a tela: dois
-- toques quase simultaneos passariam por qualquer checagem em codigo.
-- Mesmo desenho do reepack (052) e do abastecimento (071).
drop index if exists pa_bate_palete_aberto_unico;
create unique index pa_bate_palete_aberto_unico
  on public.pa_bate_palete (colaborador_id) where fim is null;

create index if not exists pa_bate_palete_revenda_idx
  on public.pa_bate_palete (revenda_id, inicio desc);

create table if not exists public.pa_bate_palete_itens (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  bate_palete_id uuid not null references public.pa_bate_palete(id) on delete cascade,
  produto_id uuid not null references public.pa_produtos(id) on delete restrict,

  -- As duas metades da atividade: o que SAIU do palete e o que ENTROU.
  -- Guardadas separadas de proposito -- a soma delas e o esforco (o que
  -- passou pela mao), a diferenca conta outra historia (palete que
  -- voltou incompleto).
  caixas_avariadas integer not null check (caixas_avariadas >= 0),
  caixas_repostas integer not null check (caixas_repostas >= 0),

  -- HL RECUPERADO, gravado e nao recalculado na leitura: se o fator do
  -- produto mudar amanha, o que ja foi batido continua valendo o que
  -- valia. Mesmo desenho do litro do reepack e do HL do abastecimento.
  hl_recuperado numeric(12,3) not null check (hl_recuperado >= 0),

  observacao text,
  criado_em timestamptz not null default now(),

  -- Um palete com zero avariada E zero reposta nao foi batido: e um
  -- lancamento em branco que so faz a media de caixas/h cair.
  constraint pa_bate_palete_item_tem_trabalho
    check (caixas_avariadas > 0 or caixas_repostas > 0)
);

create index if not exists pa_bate_palete_itens_sessao_idx
  on public.pa_bate_palete_itens (bate_palete_id);
create index if not exists pa_bate_palete_itens_produto_idx
  on public.pa_bate_palete_itens (revenda_id, produto_id);

-- -------------------- RLS --------------------
alter table public.pa_bate_palete enable row level security;
alter table public.pa_bate_palete_itens enable row level security;

-- Leitura por revenda: o controle precisa ver o de todo mundo, e quem
-- lancou precisa acompanhar o proprio.
drop policy if exists "le bate palete da revenda" on public.pa_bate_palete;
create policy "le bate palete da revenda" on public.pa_bate_palete
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

drop policy if exists "le itens de bate palete da revenda" on public.pa_bate_palete_itens;
create policy "le itens de bate palete da revenda" on public.pa_bate_palete_itens
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Escrita: so a propria sessao, so na revenda ativa.
drop policy if exists "insere bate palete proprio" on public.pa_bate_palete;
create policy "insere bate palete proprio" on public.pa_bate_palete
  for insert to authenticated
  with check (
    colaborador_id = auth.uid()
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  );

drop policy if exists "edita bate palete proprio" on public.pa_bate_palete;
create policy "edita bate palete proprio" on public.pa_bate_palete
  for update to authenticated
  using (
    colaborador_id = auth.uid()
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  )
  with check (
    colaborador_id = auth.uid()
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  );

drop policy if exists "exclui bate palete proprio" on public.pa_bate_palete;
create policy "exclui bate palete proprio" on public.pa_bate_palete
  for delete to authenticated
  using (
    colaborador_id = auth.uid()
    and (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))
  );

-- Os itens seguem o dono da sessao.
drop policy if exists "insere item de bate palete proprio" on public.pa_bate_palete_itens;
create policy "insere item de bate palete proprio" on public.pa_bate_palete_itens
  for insert to authenticated
  with check (
    exists (
      select 1 from public.pa_bate_palete b
       where b.id = bate_palete_id and b.colaborador_id = auth.uid()
    )
  );

drop policy if exists "exclui item de bate palete proprio" on public.pa_bate_palete_itens;
create policy "exclui item de bate palete proprio" on public.pa_bate_palete_itens
  for delete to authenticated
  using (
    exists (
      select 1 from public.pa_bate_palete b
       where b.id = bate_palete_id and b.colaborador_id = auth.uid()
    )
  );

-- -------------------- LIBERA O MODULO --------------------
-- Onde ja existe Produtividade do Armazem. Ninguem recebe a concessao
-- automaticamente: como todo sub-modulo do armazem, ela e liberada pessoa
-- a pessoa em Usuarios e Acessos.
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select distinct rm.revenda_id, 'pa-bate-palete', true
from public.revenda_modulos rm
where rm.modulo = 'produtividade-armazem' and rm.ativo
on conflict (revenda_id, modulo) do update set ativo = true;

notify pgrst, 'reload schema';

-- Confira: uma linha por revenda que tem o modulo do armazem.
select r.nome, rm.modulo, rm.ativo
from public.revenda_modulos rm
join public.revendas r on r.id = rm.revenda_id
where rm.modulo = 'pa-bate-palete';
