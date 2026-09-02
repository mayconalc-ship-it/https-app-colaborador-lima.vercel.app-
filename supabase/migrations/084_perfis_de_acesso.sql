-- ==================================================================
-- 084 - PERFIS DE ACESSO: conjuntos nomeados de permissao
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O diagnostico de 31/08/2026: "Lideranca" nao e um perfil -- e um saco
-- de concessoes modulo x acao preenchido a mao, pessoa por pessoa. Nao ha
-- como dizer "este e um supervisor de armazem" e ele receber o conjunto
-- certo. Por isso a separacao entre colaborador, gestao e administracao
-- so podia ser feita escondendo botao.
--
-- Estas tabelas NAO substituem lideranca_permissoes. Elas sao uma camada
-- ACIMA: um perfil e uma lista de concessoes com nome, e aplica-lo grava
-- exatamente as mesmas linhas de sempre em lideranca_permissoes. Ninguem
-- perde permissao, nada muda no que ja funciona -- ganha-se um atalho e,
-- principalmente, um SIGNIFICADO.
--
-- Depois de aplicado, o perfil nao "prende" a pessoa: ela pode receber ou
-- perder concessoes soltas na tela de acessos como sempre. O perfil e um
-- ponto de partida, nao uma amarra -- amarrar obrigaria a inventar
-- excecao para o primeiro caso que fugisse do padrao, e sempre foge.

create table if not exists public.perfis_acesso (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  -- Uma frase dizendo QUEM e este perfil na operacao. Sem ela o nome
  -- sozinho vira sigla, e em dois meses ninguem lembra o que "Lideranca 2"
  -- devia significar.
  descricao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  unique (revenda_id, nome)
);

create table if not exists public.perfil_permissoes (
  perfil_id uuid not null references public.perfis_acesso(id) on delete cascade,
  modulo text not null,
  acao text not null check (acao in ('ver', 'criar', 'editar', 'excluir')),
  primary key (perfil_id, modulo, acao)
);

comment on table public.perfis_acesso is
  'Conjuntos nomeados de concessao. Aplicar um perfil grava linhas em lideranca_permissoes -- ver src/app/admin/perfis-de-acesso.';

-- -------------------- RLS --------------------
alter table public.perfis_acesso enable row level security;
alter table public.perfil_permissoes enable row level security;

-- Sem politica: quem le e escreve e o servidor, com o cliente de servico,
-- atras de requireModulo. Perfil de acesso decide quem ve o que -- deixar
-- a tabela aberta para leitura pelo cliente entregaria o mapa de
-- permissoes da revenda a qualquer pessoa logada.

-- -------------------- LIBERA O MODULO --------------------
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select distinct rm.revenda_id, 'perfis-acesso', true
from public.revenda_modulos rm
where rm.modulo = 'colaboradores' and rm.ativo
on conflict (revenda_id, modulo) do update set ativo = true;

notify pgrst, 'reload schema';

-- Confira: uma linha por revenda.
select r.nome, rm.modulo, rm.ativo
from public.revenda_modulos rm
join public.revendas r on r.id = rm.revenda_id
where rm.modulo = 'perfis-acesso';
