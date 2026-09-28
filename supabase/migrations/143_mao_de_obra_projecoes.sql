-- ==================================================================
-- 143 - MAO DE OBRA: A FOTOGRAFIA DA PROJECAO (28/09/2026)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O DPO (item 1.2, V.3) pede comparar o dimensionamento PROJETADO ha 2 a
-- 3 meses com o do mes corrente. Ate aqui o "comparativo" recalculava os
-- meses anteriores com os parametros de HOJE -- ou seja, comparava o
-- simulador com ele mesmo, nao com o que foi planejado na epoca.
--
-- Agora, ao FORMALIZAR o planejamento para o time de Gente (o envio do
-- quadro, V.2), o app congela aqui o que foi projetado para o mes atual e
-- os dois seguintes. Cada linha e um mes-alvo visto de um mes-base:
--   "em julho, projetamos setembro com 36 pessoas".
-- Linhas nao se editam: sao a evidencia do que foi dito na epoca.
-- ==================================================================

create table if not exists public.mao_obra_projecoes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- De ONDE se olhou (o mes em que a projecao foi feita)...
  competencia_base date not null,
  -- ...e PARA onde (o mes projetado).
  competencia_alvo date not null,
  volume_ppr numeric(14,2),
  volume_negociado numeric(14,2),
  -- {funcao: pessoas} -- o dimensionado de cada funcao, congelado.
  dimensionado jsonb not null default '{}'::jsonb,
  total integer not null default 0,
  -- {funcao: pessoas} -- o QLP que existia no dia da projecao.
  qlp jsonb,
  vagas integer not null default 0,
  envio_id uuid references public.mao_obra_envios(id) on delete set null,
  feita_em timestamptz not null default now(),
  feita_por_nome text,
  constraint mao_obra_projecao_alvo_depois check (competencia_alvo >= competencia_base)
);

create index if not exists mao_obra_projecoes_alvo_idx
  on public.mao_obra_projecoes (revenda_id, competencia_alvo, feita_em desc);

-- So o servidor le e escreve, como o resto do simulador.
alter table public.mao_obra_projecoes enable row level security;

notify pgrst, 'reload schema';

-- Confira: a tabela existe (0 linhas ate a primeira formalizacao).
select count(*) as projecoes from public.mao_obra_projecoes;
