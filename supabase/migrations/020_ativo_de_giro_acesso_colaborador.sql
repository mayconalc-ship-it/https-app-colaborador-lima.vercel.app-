-- ==================================================================
-- 020 - ACESSO POR COLABORADOR A MODULOS OPCIONAIS
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Alguns modulos (comecando pelo Ativo de Giro) nao sao para todo mundo.
-- Por padrao NINGUEM ve: o Admin libera colaborador por colaborador, aqui
-- dentro desta tabela. Diferente de lideranca_permissoes (que e sobre
-- administrar um modulo), esta tabela e sobre ENXERGAR o modulo como
-- colaborador comum.

create table if not exists public.colaborador_modulos_extra (
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  modulo text not null,
  liberado_em timestamptz not null default now(),
  liberado_por uuid references auth.users(id) on delete set null,
  primary key (colaborador_id, modulo)
);

create index if not exists colaborador_modulos_extra_pessoa_idx
  on public.colaborador_modulos_extra (colaborador_id);

-- RLS ligada e SEM NENHUMA politica: assim como lideranca_permissoes, so o
-- servidor (service role) le e grava, sempre depois de conferir que quem
-- pediu e o dono do app.
alter table public.colaborador_modulos_extra enable row level security;

do $$
declare politica record;
begin
  for politica in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'colaborador_modulos_extra'
  loop
    execute format(
      'drop policy %I on public.colaborador_modulos_extra', politica.policyname
    );
  end loop;
end $$;

grant select, insert, update, delete on public.colaborador_modulos_extra to service_role;
