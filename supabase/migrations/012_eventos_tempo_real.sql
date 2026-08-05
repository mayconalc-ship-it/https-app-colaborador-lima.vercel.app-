-- Execute no Supabase: SQL Editor > New query > colar > Run

-- ==================================================================
-- 1) URGENTE: FECHAR A TABELA DE COLABORADORES
-- ==================================================================
-- Hoje "profiles" pode ser lida por qualquer um que tenha a chave publica
-- do app -- e essa chave vai dentro do JavaScript que roda no navegador,
-- ou seja, e publica por natureza. Na pratica: qualquer pessoa que abra o
-- app consegue baixar a lista dos 82 colaboradores com nome e CPF.
--
-- A partir daqui cada pessoa le apenas a PROPRIA linha. As telas de gestao
-- continuam funcionando porque usam a chave de administrador do servidor,
-- que passa por cima do RLS.

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

-- ==================================================================
-- 2) ATALHO PARA DESCOBRIR O PAPEL DE QUEM ESTA PEDINDO
-- ==================================================================
-- "security definer" faz a funcao ler profiles ignorando o RLS. Sem isso,
-- uma politica que consulta profiles dentro de outra politica entraria em
-- loop. O search_path fixo evita que alguem crie uma tabela falsa chamada
-- profiles em outro esquema para enganar a funcao.

create or replace function public.papel_atual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.papel_atual() from public;
grant execute on function public.papel_atual() to authenticated;

-- ==================================================================
-- 3) TABELA UNICA DE EVENTOS
-- ==================================================================
-- Substitui a antiga "uso_telas", que so registrava navegacao. Agora um
-- unico lugar guarda login, abertura de tela e clique em funcao.
--
-- O nome fica gravado junto (e nao so o id) de proposito: e um registro
-- historico. Se a pessoa for renomeada depois, o que ela fez continua
-- registrado com o nome que ela tinha na hora -- e o feed ao vivo nao
-- precisa consultar outra tabela para mostrar quem foi.

create table if not exists public.eventos_acesso (
  id bigint generated always as identity primary key,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('login', 'tela', 'acao')),
  alvo text not null,
  sessao_id uuid not null,
  criado_em timestamptz not null default now()
);

create index if not exists eventos_acesso_data_idx
  on public.eventos_acesso (criado_em desc);
create index if not exists eventos_acesso_pessoa_idx
  on public.eventos_acesso (colaborador_id, criado_em desc);
create index if not exists eventos_acesso_tipo_idx
  on public.eventos_acesso (tipo, criado_em desc);

-- O navegador nao decide quem ele e. Este gatilho sobrescreve o autor, o
-- nome e a hora com o que o banco sabe -- entao nao adianta forjar o envio
-- para registrar evento em nome de outra pessoa.
create or replace function public.carimbar_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.colaborador_id := auth.uid();
  new.criado_em := now();
  select coalesce(p.nome, 'Colaborador') into new.nome
    from public.profiles p where p.id = auth.uid();
  if new.nome is null then new.nome := 'Colaborador'; end if;
  return new;
end;
$$;

drop trigger if exists eventos_acesso_carimbar on public.eventos_acesso;
create trigger eventos_acesso_carimbar
  before insert on public.eventos_acesso
  for each row execute function public.carimbar_evento();

alter table public.eventos_acesso enable row level security;

drop policy if exists "grava proprio evento" on public.eventos_acesso;
create policy "grava proprio evento"
  on public.eventos_acesso for insert
  to authenticated
  with check (auth.uid() = colaborador_id);

-- Leitura so para o admin: e ele quem abre o painel ao vivo. Colaborador
-- nao ve o que os outros estao fazendo.
drop policy if exists "admin le eventos" on public.eventos_acesso;
create policy "admin le eventos"
  on public.eventos_acesso for select
  to authenticated
  using (public.papel_atual() = 'admin');

-- ==================================================================
-- 4) LIGAR O TEMPO REAL NESTA TABELA
-- ==================================================================
-- Sem esta linha o painel nunca recebe aviso de linha nova. Da para
-- conferir depois em Database > Replication, no painel do Supabase.

do $$
begin
  alter publication supabase_realtime add table public.eventos_acesso;
exception
  when duplicate_object then null;  -- ja estava publicada
end $$;

-- ==================================================================
-- 5) LIMPEZA
-- ==================================================================
-- A antiga tabela de telas foi substituida pela de eventos.
drop table if exists public.uso_telas;
