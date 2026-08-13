-- ==================================================================
-- 028 - RECONTAGEM SIMPLIFICADA: DESCRIÇÃO LIVRE + VÍNCULO DIRETO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- A ideia original (tipo+formato+status estruturados, com "qualquer" em
-- cada campo) complicou mais do que ajudou. Troca por duas coisas mais
-- simples:
--
-- 1) O pedido vira um campo de texto livre ("o que precisa ser
--    recontado") em vez de três seletores. Quem pede escreve, quem lê
--    entende -- não precisa decifrar "Todos os tipos · 600ml · Todos os
--    status".
--
-- 2) A contagem que atende o pedido carrega o ID do pedido direto
--    (`recontagem_id`). Antes o sistema tentava ADIVINHAR se uma
--    contagem nova atendia um pedido comparando tipo/formato/status/dia
--    -- frágil, e não sobra ambiguidade nenhuma se o colaborador entrar
--    no pedido pelo botão certo e a própria tela já marcar a contagem
--    com o ID dele.

-- ------------------------------------------------------------------
-- 1) ag_recontagens: tipo/formato/status saem, descrição entra
-- ------------------------------------------------------------------
alter table public.ag_recontagens
  drop column if exists tipo,
  drop column if exists formato,
  drop column if exists status;

alter table public.ag_recontagens
  add column if not exists descricao text not null default '';

alter table public.ag_recontagens alter column descricao drop default;

-- ------------------------------------------------------------------
-- 2) ag_contagens sabe a qual pedido de recontagem ela atende (se algum)
-- ------------------------------------------------------------------
alter table public.ag_contagens
  add column if not exists recontagem_id bigint
    references public.ag_recontagens(id) on delete set null;

create index if not exists ag_contagens_recontagem_idx
  on public.ag_contagens (recontagem_id)
  where recontagem_id is not null;

-- ------------------------------------------------------------------
-- 3) Dispensa pessoal: "não é comigo" tira o cartão SÓ da minha tela
-- ------------------------------------------------------------------
-- Continua pendente para o resto do time e para o controle -- é a
-- diferença para "Cancelar" (que o controle usa e mata o pedido para
-- todo mundo). Mesmo desenho de notificacao_estado: uma linha só para
-- quem interagiu, não uma linha por pessoa alcançada.
create table if not exists public.ag_recontagens_dispensas (
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  recontagem_id bigint not null references public.ag_recontagens(id) on delete cascade,
  dispensado_em timestamptz not null default now(),
  primary key (colaborador_id, recontagem_id)
);

grant all on public.ag_recontagens_dispensas to service_role;

alter table public.ag_recontagens_dispensas enable row level security;

-- RLS ligada e nenhuma política, como o resto das tabelas administrativas
-- do AG: a leitura que decide o que aparece na tela passa pelo service
-- role dentro da ação de servidor, que já sabe quem está pedindo.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'ag_recontagens_dispensas'
  loop
    execute format(
      'drop policy %I on public.ag_recontagens_dispensas', pol.policyname
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
