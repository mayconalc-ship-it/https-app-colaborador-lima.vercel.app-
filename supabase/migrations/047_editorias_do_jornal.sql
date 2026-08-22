-- ==================================================================
-- 047 - EDITORIAS DO JORNAL VIRAM CADASTRO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- As seis editorias (Seguranca, Cultura, Engajamento, Operacao, Gente,
-- Geral) nasceram fixas no codigo E num check do banco. Toda vez que o RH
-- queria uma nova, era deploy -- e como o check tambem trancava, um deploy
-- que sem a migration certa fazia o formulario recusar a categoria nova
-- com erro de banco, nao com mensagem.
--
-- Agora e cadastro: o Modo Lideranca cria, renomeia, reordena e desliga
-- editoria em /admin/comunicados/editorias.
--
-- POR REVENDA, de proposito. Editoria e a linha editorial da unidade, e
-- uma tabela global deixaria o admin de Barreiras renomear a editoria que
-- Sao Felix usa nas materias dela.
--
-- A COR NAO E TEXTO LIVRE: o banco guarda a chave ("turquesa") e o par de
-- classes do Tailwind mora em src/lib/comunicados.ts. Classe que so existe
-- dentro de uma linha do Postgres nao entra no CSS gerado -- a etiqueta
-- sairia sem cor nenhuma em producao.

create table if not exists public.comunicado_editorias (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  id         text not null,
  rotulo     text not null,
  emoji      text not null default '📰',
  cor        text not null default 'cinza',
  ordem      int  not null default 100,
  ativa      boolean not null default true,
  criado_em  timestamptz not null default now(),
  primary key (revenda_id, id)
);

create index if not exists comunicado_editorias_revenda_idx
  on public.comunicado_editorias (revenda_id, ordem);

-- ------------------------------------------------------------------
-- SEMENTE: as seis de sempre + as duas novas, para cada revenda
-- ------------------------------------------------------------------
-- Saude e Treinamento sao os dois assuntos que hoje caem em "Gente" ou
-- "Geral" por falta de lugar proprio.
--
-- `on conflict do nothing` para esta migration poder rodar duas vezes sem
-- desfazer renomeacao que o RH ja tenha feito.
insert into public.comunicado_editorias (revenda_id, id, rotulo, emoji, cor, ordem)
select r.id, e.id, e.rotulo, e.emoji, e.cor, e.ordem
  from public.revendas r
 cross join (values
   ('seguranca',   'Segurança',         '🦺', 'vermelho', 10),
   ('cultura',     'Cultura',           '🎯', 'roxo',     20),
   ('engajamento', 'Engajamento',       '🎉', 'ambar',    30),
   ('operacao',    'Operação',          '🚚', 'azul',     40),
   ('gente',       'Gente',             '👥', 'verde',    50),
   ('saude',       'Saúde e Bem-estar', '🩺', 'turquesa', 60),
   ('treinamento', 'Treinamento',       '🎓', 'indigo',   70),
   ('geral',       'Geral',             '📰', 'cinza',    99)
 ) as e(id, rotulo, emoji, cor, ordem)
on conflict (revenda_id, id) do nothing;

-- ------------------------------------------------------------------
-- O CHECK SAI DE CENA
-- ------------------------------------------------------------------
-- Ele listava as seis categorias no proprio DDL. Mantido, nenhuma
-- editoria nova poderia ser publicada -- e o erro chegaria ao RH como
-- "violates check constraint", que nao quer dizer nada para quem esta
-- escrevendo uma materia.
--
-- Nao entra chave estrangeira no lugar: a materia guarda `categoria` como
-- texto e a exclusao de editoria e tratada na acao do servidor, que
-- devolve as materias orfas para "geral" antes de apagar. Uma FK
-- (revenda_id, categoria) recusaria a exclusao e deixaria o RH preso.
alter table public.comunicados
  drop constraint if exists comunicados_categoria_check;

-- ------------------------------------------------------------------
-- LEITURA: mesma regra dos comunicados
-- ------------------------------------------------------------------
-- O app fala com o Supabase pela chave publica. Sem politica, o jornal
-- abriria sem editoria nenhuma; com politica frouxa, Barreiras leria a
-- linha editorial de Sao Felix. Escrita nao tem politica: quem cadastra e
-- a service_role, do Modo Lideranca.
alter table public.comunicado_editorias enable row level security;

drop policy if exists "le as editorias da propria revenda" on public.comunicado_editorias;
create policy "le as editorias da propria revenda"
  on public.comunicado_editorias for select to authenticated
  using (
    public.ehowner_atual()
    or revenda_id in (select public.revendas_do_usuario())
  );

notify pgrst, 'reload schema';
