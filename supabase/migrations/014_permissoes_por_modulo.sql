-- Execute no Supabase: SQL Editor > New query > colar > Run

-- ==================================================================
-- 1) O PAPEL "OWNER" (dono do app)
-- ==================================================================
-- Antes existia 'admin', que podia tudo -- inclusive promover outro admin.
-- Agora o topo e 'owner', e ele e UNICO. A lideranca vira um papel
-- intermediario, que so faz o que o dono liberar, modulo por modulo.

alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'lideranca', 'colaborador'));

-- O dono e voce. Se um dia precisar transferir, troque o CPF aqui.
update public.profiles set role = 'owner' where cpf = '05738764528';

-- Qualquer 'admin' remanescente vira lideranca SEM nenhuma permissao --
-- entra no app normalmente, mas nao administra nada ate o dono liberar.
update public.profiles set role = 'lideranca' where role = 'admin';

-- Trava de banco: nao existe segundo dono.
drop index if exists profiles_owner_unico;
create unique index profiles_owner_unico
  on public.profiles ((role)) where role = 'owner';

-- ==================================================================
-- 2) PERMISSOES DA LIDERANCA -- uma linha por modulo + acao liberados
-- ==================================================================
create table if not exists public.lideranca_permissoes (
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  modulo text not null,
  acao text not null check (acao in ('ver', 'criar', 'editar', 'excluir')),
  concedido_em timestamptz not null default now(),
  concedido_por uuid references auth.users(id) on delete set null,
  primary key (colaborador_id, modulo, acao)
);

create index if not exists lideranca_permissoes_pessoa_idx
  on public.lideranca_permissoes (colaborador_id);

-- ==================================================================
-- 3) LOG DE AUDITORIA
-- ==================================================================
create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  ator_id uuid references auth.users(id) on delete set null,
  ator_nome text not null,
  acao text not null,
  alvo_id uuid references auth.users(id) on delete set null,
  alvo_nome text,
  detalhes text,
  criado_em timestamptz not null default now()
);

create index if not exists auditoria_data_idx
  on public.auditoria (criado_em desc);

-- ==================================================================
-- 4) PERMISSOES DAS TABELAS
-- ==================================================================
-- RLS ligada e NENHUMA politica. O banco nega tudo para quem usa a chave
-- publica do app. Ler ou gravar permissao so pelo servidor, por uma acao
-- que confere se quem pediu e o dono.
--
-- E isto que impede a escalada: mesmo que uma lideranca monte a requisicao
-- na mao, com o token dela, o banco recusa -- nao ha politica que a
-- autorize a escrever em lideranca_permissoes nem em profiles.

alter table public.lideranca_permissoes enable row level security;
alter table public.auditoria enable row level security;

do $$
declare politica record;
begin
  for politica in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('lideranca_permissoes', 'auditoria')
  loop
    execute format(
      'drop policy %I on public.%I', politica.policyname, politica.tablename
    );
  end loop;
end $$;

-- ==================================================================
-- 5) CONFERENCIA DA TABELA DE PERFIS
-- ==================================================================
-- profiles precisa continuar com UMA politica so: cada um le a propria
-- linha, e ninguem escreve. Sem politica de update, nao existe caminho
-- para alguem promover a si mesmo.

alter table public.profiles enable row level security;

do $$
declare politica record;
begin
  for politica in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy %I on public.profiles', politica.policyname);
  end loop;
end $$;

create policy "cada um le o proprio perfil"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);
