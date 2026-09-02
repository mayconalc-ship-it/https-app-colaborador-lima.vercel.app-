-- ==================================================================
-- 083 - Controle de repeticao do aviso de indicador atualizado
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono, 02/09/2026: depois de importar Rating, Refugo ou
-- Devolucao, avisar quem ficou com pendencia e convidar a explicar.
--
-- O aviso e DIRECIONADO: so quem tem algo a fazer recebe, com o numero
-- dele. "Os indicadores foram atualizados" para todo mundo e ruido --
-- chega para quem nao tem nada pendente, ensina a ignorar, e o aviso que
-- importava passa despercebido junto.
--
-- Esta tabela existe por um motivo so: nao repetir. Reimportar no mesmo
-- dia e comum (corrigir a pasta, refazer um mes), e sem a trava a pessoa
-- levaria o mesmo aviso a cada importacao. E assim que uma notificacao
-- util vira spam em uma semana.

create table if not exists public.indicador_avisos (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  indicador text not null check (indicador in ('rating', 'refugo', 'devolucao')),
  avisado_em timestamptz not null default now(),
  -- Quantas pessoas foram avisadas. Serve para conferir depois se o
  -- aviso esta chegando a quem deveria.
  pessoas integer not null default 0,
  primary key (revenda_id, indicador)
);

comment on table public.indicador_avisos is
  'Ultima vez que cada indicador avisou os colaboradores. Ver HORAS_ENTRE_AVISOS em src/lib/aviso-indicadores.ts.';

-- -------------------- RLS --------------------
alter table public.indicador_avisos enable row level security;

-- Ninguem le nem escreve daqui de fora: quem mexe e o servidor, com o
-- cliente de servico, no fim da importacao. Sem politica nenhuma, a
-- tabela fica fechada -- que e o desenho certo para um controle interno.

notify pgrst, 'reload schema';
