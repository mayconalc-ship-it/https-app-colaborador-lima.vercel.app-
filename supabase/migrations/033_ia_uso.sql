-- Execute no Supabase: SQL Editor > New query > colar > Run

-- ==================================================================
-- 033 - USO DE IA (CREDITOS)
-- ==================================================================
-- Cada linha e UMA chamada de IA (5 Porques ou geracao de Quiz), com o
-- custo em tokens ja convertido para USD pelo preco publico do modelo.
-- Existe so para alimentar o painel /admin/creditos-ia -- o Anthropic
-- Console continua sendo a fonte de verdade do saldo/fatura real.
--
-- So a chave de administrador grava e le: nao ha policy para
-- `authenticated` de proposito, porque isso e informacao de custo do
-- app inteiro, nao algo que o colaborador ou a lideranca precisem ver
-- direto na tabela.

create table if not exists public.ia_uso_registros (
  id bigint generated always as identity primary key,
  recurso text not null check (recurso in ('cinco_porques', 'quiz')),
  modelo text not null,

  -- Sem FK para nao derrubar o registro de custo se a revenda ou o
  -- colaborador forem removidos depois -- o gasto ja aconteceu.
  revenda_id uuid references public.revendas(id) on delete set null,
  colaborador_id uuid references auth.users(id) on delete set null,

  tokens_entrada int not null,
  tokens_saida int not null,
  custo_usd numeric(10, 6) not null default 0,

  criado_em timestamptz not null default now()
);

create index if not exists ia_uso_criado_idx
  on public.ia_uso_registros (criado_em desc);
create index if not exists ia_uso_recurso_idx
  on public.ia_uso_registros (recurso, criado_em desc);

grant all on public.ia_uso_registros to service_role;
alter table public.ia_uso_registros enable row level security;

notify pgrst, 'reload schema';
