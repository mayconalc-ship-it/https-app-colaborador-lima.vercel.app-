-- Execute no Supabase: SQL Editor > New query > colar > Run

-- 1) ENVIO DIRETO DO NAVEGADOR
-- Nao precisa de nada aqui. A hospedagem (Vercel) recusa qualquer requisicao
-- acima de 4,5 MB e varios padroes passam disso (o maior tem 49 MB), entao o
-- navegador envia o arquivo direto ao armazenamento -- usando uma URL assinada
-- que o proprio app gera com a chave de administrador. Assim nao e preciso
-- abrir permissao de escrita no bucket "conteudo" para ninguem.

-- 2) PILARES EDITAVEIS
-- Antes os pilares eram fixos no codigo e travados por uma restricao no
-- banco. Agora viram cadastro, para o admin renomear, ocultar ou excluir.
alter table public.padroes drop constraint if exists padroes_pilar_check;

create table if not exists public.padroes_pilares (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ordem int not null,
  visivel boolean not null default true
);

alter table public.padroes_pilares enable row level security;

create policy "colaboradores leem pilares"
  on public.padroes_pilares for select
  using (auth.role() = 'authenticated');

insert into public.padroes_pilares (nome, ordem) values
  ('Armazém', 1),
  ('Controle', 2),
  ('Entrega', 3),
  ('Frota', 4),
  ('Planejamento', 5)
on conflict (nome) do nothing;
