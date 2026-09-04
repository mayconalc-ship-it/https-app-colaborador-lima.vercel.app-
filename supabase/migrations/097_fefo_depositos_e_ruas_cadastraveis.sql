-- ==================================================================
-- 097 - FEFO: depositos e ruas viram cadastro, como ja sao os motivos
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (04/09/2026): no ADM de FEFO, alem do cadastro de
-- motivo, cadastrar Depositos e Ruas.
--
-- Hoje os dois estao travados no CODIGO (lib/fefo.ts): deposito A, B ou
-- C, rua de 1 a 10 -- e o banco repetia a trava em dois CHECK. Armazem
-- que ganha um deposito, ou uma rua 11, esperava deploy. E a rua 1 do
-- deposito A e a rua 1 do C sao lugares diferentes que o codigo tratava
-- como o mesmo numero, porque a lista de ruas era uma so para todos.
--
-- Por isso a RUA PERTENCE AO DEPOSITO aqui: cada deposito tem as suas,
-- e escolher o deposito passa a filtrar a lista. E o mesmo motivo pelo
-- qual a 067 tirou os motivos do codigo -- a operacao descobre o caso
-- novo antes de alguem lembrar de pedir codigo.

-- ------------------------------------------------------------------
-- 1) DEPOSITOS
-- ------------------------------------------------------------------
create table if not exists public.pa_fefo_depositos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- O nome e o que a pessoa ve e o que fica gravado na ocorrencia.
  -- Curto de proposito: "A", "Deposito 2", "Camara fria".
  nome text not null,
  ordem smallint not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint pa_fefo_deposito_unico unique (revenda_id, nome)
);

create index if not exists pa_fefo_depositos_revenda_idx
  on public.pa_fefo_depositos (revenda_id, ativo, ordem);

alter table public.pa_fefo_depositos enable row level security;

drop policy if exists "le depositos fefo da revenda" on public.pa_fefo_depositos;
create policy "le depositos fefo da revenda" on public.pa_fefo_depositos
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- ------------------------------------------------------------------
-- 2) RUAS -- de um deposito, nao do armazem
-- ------------------------------------------------------------------
create table if not exists public.pa_fefo_ruas (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  deposito_id uuid not null references public.pa_fefo_depositos(id) on delete cascade,
  -- TEXTO, e nao numero: rua "01", "A1" e "R-12" existem em armazem, e
  -- um smallint obrigaria a inventar um numero para elas.
  nome text not null,
  ordem smallint not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint pa_fefo_rua_unica unique (deposito_id, nome)
);

create index if not exists pa_fefo_ruas_deposito_idx
  on public.pa_fefo_ruas (deposito_id, ativo, ordem);

alter table public.pa_fefo_ruas enable row level security;

drop policy if exists "le ruas fefo da revenda" on public.pa_fefo_ruas;
create policy "le ruas fefo da revenda" on public.pa_fefo_ruas
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Escrita so pelo servidor (service role), como os motivos e os demais
-- catalogos do armazem: quem cadastra passa pelo Admin, que ja confere
-- permissao.

-- ------------------------------------------------------------------
-- 3) SEMENTE: exatamente o que estava no codigo
-- ------------------------------------------------------------------
-- A, B, C em cada revenda que ja existe. Revenda nova comeca vazia e
-- cadastra os proprios -- de proposito, e o ponto do pedido.
insert into public.pa_fefo_depositos (revenda_id, nome, ordem)
select r.id, d.nome, d.ordem
from public.revendas r
cross join (values ('A', 1), ('B', 2), ('C', 3)) as d(nome, ordem)
on conflict (revenda_id, nome) do nothing;

-- Ruas 1 a 10 em cada deposito, que era a lista fixa do codigo.
insert into public.pa_fefo_ruas (revenda_id, deposito_id, nome, ordem)
select d.revenda_id, d.id, n::text, n::smallint
from public.pa_fefo_depositos d
cross join generate_series(1, 10) as n
on conflict (deposito_id, nome) do nothing;

-- ------------------------------------------------------------------
-- 4) A OCORRENCIA GUARDA O NOME, NAO A CHAVE
-- ------------------------------------------------------------------
-- De proposito, e e a diferenca para o motivo_id da 067. O motivo
-- CLASSIFICA (e agrupar por ele e a razao do cadastro existir); o
-- deposito e a rua sao um ENDERECO, e endereco de um fato passado nao
-- muda quando alguem renomeia a rua hoje. Guardando o nome, a
-- ocorrencia de ontem continua dizendo onde a quebra estava, e desativar
-- uma rua nunca trava a leitura do historico.
alter table public.pa_fefo_ocorrencias
  drop constraint if exists pa_fefo_ocorrencias_deposito_check;

alter table public.pa_fefo_ocorrencias
  drop constraint if exists pa_fefo_ocorrencias_rua_check;

-- smallint -> text: "01" e "A1" nao cabem em numero. A unica ocorrencia
-- gravada ate aqui (deposito B, rua 9) vira o texto "9".
alter table public.pa_fefo_ocorrencias
  alter column rua type text using rua::text;

notify pgrst, 'reload schema';

-- Confira: os depositos criados, com quantas ruas cada um.
select
  r.nome as revenda,
  d.nome as deposito,
  count(ru.id) as ruas
from public.pa_fefo_depositos d
join public.revendas r on r.id = d.revenda_id
left join public.pa_fefo_ruas ru on ru.deposito_id = d.id
group by r.nome, d.nome, d.ordem
order by r.nome, d.ordem;
