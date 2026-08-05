-- Execute este script inteiro no Supabase: Dashboard > SQL Editor > New query > colar > Run

-- 1) Perfis dos colaboradores (espelha auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  cpf text unique not null,
  matricula text,
  cargo text,
  area text,
  revenda text,
  empresa text,
  role text not null default 'colaborador' check (role in ('colaborador', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "usuario ve o proprio perfil"
  on public.profiles for select
  using (auth.uid() = id);

-- 2) Sonho da Revenda (um registro por ano)
create table if not exists public.sonho_revenda (
  id bigint generated always as identity primary key,
  ano int not null unique,
  titulo text not null,
  frase text,
  tipo text not null check (tipo in ('imagem', 'pptx', 'pdf')),
  arquivo_url text not null,
  quadro_indicadores_url text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.sonho_revenda enable row level security;

create policy "colaboradores leem sonho da revenda"
  on public.sonho_revenda for select
  using (auth.role() = 'authenticated');

-- 3) Ranking Super Matinal (uma foto por mes + time + categoria de premiacao)
create table if not exists public.ranking_matinal (
  id bigint generated always as identity primary key,
  mes_ano text not null,
  time text not null check (time in ('DU', 'AL')),
  categoria text not null,
  imagem_url text not null,
  criado_em timestamptz not null default now(),
  unique (mes_ano, time, categoria)
);

alter table public.ranking_matinal enable row level security;

create policy "colaboradores leem ranking"
  on public.ranking_matinal for select
  using (auth.role() = 'authenticated');

-- 4) Comunicados (formato jornal: editoria, resumo e materia de capa)
create table if not exists public.comunicados (
  id bigint generated always as identity primary key,
  titulo text not null,
  resumo text,
  texto text not null,
  categoria text not null default 'geral'
    check (categoria in ('cultura','seguranca','engajamento','operacao','gente','geral')),
  autor text,
  imagem_url text,
  destaque boolean not null default false,
  data date not null default current_date,
  criado_em timestamptz not null default now()
);

alter table public.comunicados enable row level security;

create policy "colaboradores leem comunicados"
  on public.comunicados for select
  using (auth.role() = 'authenticated');

-- 5) Escala de trabalho (uma por area)
create table if not exists public.escala_trabalho (
  area text primary key check (area in ('DU', 'AL')),
  rotulo text not null,
  arquivo_url text,
  tipo text,
  observacao text,
  atualizado_em timestamptz not null default now()
);

alter table public.escala_trabalho enable row level security;

create policy "colaboradores leem escala"
  on public.escala_trabalho for select
  using (auth.role() = 'authenticated');

-- 6) Padroes (organizados por pilar e pasta/topico)
create table if not exists public.padroes (
  id bigint generated always as identity primary key,
  pilar text not null check (pilar in ('Planejamento', 'Armazém', 'Controle', 'Entrega', 'Frota')),
  caminho text not null default '',
  nome text not null,
  tipo text not null,
  arquivo_url text not null,
  criado_em timestamptz not null default now()
);

alter table public.padroes enable row level security;

create policy "colaboradores leem padroes"
  on public.padroes for select
  using (auth.role() = 'authenticated');

-- 7) Feedback da rota
create table if not exists public.feedback_rota (
  id bigint generated always as identity primary key,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  nota int not null check (nota between 0 and 3),
  rota text,
  ocorrencias text[] not null default '{}',
  comentario text,
  criado_em timestamptz not null default now()
);

alter table public.feedback_rota enable row level security;

create policy "colaborador insere seu feedback"
  on public.feedback_rota for insert
  with check (auth.uid() = colaborador_id);

create policy "colaborador ve seu proprio feedback"
  on public.feedback_rota for select
  using (auth.uid() = colaborador_id);

-- 8) Itens do menu inicial (ordem e visibilidade controladas pelo admin)
create table if not exists public.menu_itens (
  chave text primary key,
  titulo text not null,
  emoji text not null,
  href text not null,
  ordem int not null,
  visivel boolean not null default true
);

alter table public.menu_itens enable row level security;

create policy "colaboradores leem menu"
  on public.menu_itens for select
  using (auth.role() = 'authenticated');

-- 9) Configuracao das planilhas de RV publicadas no Google Drive.
-- Sem policy de leitura de proposito: o link da planilha expoe a RV de todo
-- mundo, entao so o servidor (service_role) le esta tabela. O app devolve ao
-- colaborador apenas a linha dele.
create table if not exists public.rv_config (
  area text primary key check (area in ('DU', 'AL')),
  rotulo text not null,
  csv_url text,
  coluna_cpf text,
  coluna_valor text,
  atualizado_em timestamptz not null default now()
);

alter table public.rv_config enable row level security;

-- 10) Bucket de armazenamento para as imagens/arquivos enviados pelo admin
insert into storage.buckets (id, name, public)
values ('conteudo', 'conteudo', true)
on conflict (id) do nothing;

-- Observacao: todas as inclusoes/edicoes (INSERT/UPDATE/DELETE) nas tabelas acima
-- sao feitas pelas rotas administrativas do app usando a service_role key,
-- que ignora o RLS. Por isso nao ha politicas de escrita para usuarios comuns aqui.
