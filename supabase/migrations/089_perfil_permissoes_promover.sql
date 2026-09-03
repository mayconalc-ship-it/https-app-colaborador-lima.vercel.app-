-- ==================================================================
-- 089 - A ACAO "PROMOVER" TAMBEM VALE DENTRO DE UM PERFIL
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- A mesma armadilha da migration 025, repetida um ano depois.
--
-- Em 025 a trava de lideranca_permissoes foi aberta para a quinta acao,
-- "promover" (dar ou tirar o papel de lideranca, separada de "editar" de
-- proposito). A tabela perfil_permissoes nasceu na 084, DEPOIS disso, e
-- mesmo assim copiou a lista de quatro acoes da 014 -- a lista antiga,
-- que ja estava errada quando foi copiada.
--
-- O erro so aparecia em quem tem a acao: criar um perfil a partir do
-- Artenio, que administra Colaboradores, parava em
--   new row for relation "perfil_permissoes" violates check constraint
--   "perfil_permissoes_acao_check"
-- (02/09/2026). Quem nao tinha "promover" copiava normalmente, e por
-- isso a falha passou despercebida desde a 084.
--
-- As duas tabelas guardam a MESMA coisa -- uma concessao de modulo mais
-- acao. Sempre que a lista mudar num lado, tem de mudar no outro; o
-- catalogo de verdade e o `MODULOS` de src/lib/acessos.ts.

alter table public.perfil_permissoes
  drop constraint if exists perfil_permissoes_acao_check;

alter table public.perfil_permissoes
  add constraint perfil_permissoes_acao_check
  check (acao in ('ver', 'criar', 'editar', 'excluir', 'promover'));

notify pgrst, 'reload schema';
