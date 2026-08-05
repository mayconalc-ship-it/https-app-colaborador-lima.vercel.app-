-- Execute no Supabase: SQL Editor > New query > colar > Run

-- Uma curtida por colaborador por publicacao: a chave primaria composta
-- impede curtir duas vezes sem precisar de verificacao no aplicativo.
create table if not exists public.comunicado_curtidas (
  comunicado_id bigint not null references public.comunicados(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (comunicado_id, colaborador_id)
);

alter table public.comunicado_curtidas enable row level security;

-- Todo mundo pode ver a contagem...
create policy "colaboradores leem curtidas"
  on public.comunicado_curtidas for select
  using (auth.role() = 'authenticated');

-- ...mas cada um só cria e apaga a própria curtida.
create policy "colaborador curte"
  on public.comunicado_curtidas for insert
  with check (auth.uid() = colaborador_id);

create policy "colaborador descurte"
  on public.comunicado_curtidas for delete
  using (auth.uid() = colaborador_id);

create index if not exists comunicado_curtidas_por_post
  on public.comunicado_curtidas (comunicado_id);
