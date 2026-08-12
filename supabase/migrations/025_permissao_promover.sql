-- ==================================================================
-- 025 - PERMISSAO "PROMOVER" NO MODULO COLABORADORES
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- lib/acessos.ts ganhou a acao "promover" (dar ou tirar o papel de
-- lideranca de alguem, separada de "editar" o cadastro de proposito --
-- da para confiar o cadastro a alguem sem confiar a ela o poder de criar
-- novas liderancas). A tabela lideranca_permissoes, porem, nasceu na 014
-- com uma trava que so aceitava quatro acoes -- essa quinta nunca entrou.
--
-- Efeito pratico: em Gestao de Acessos, marcar "Tornar lideranca" no
-- modulo Colaboradores e salvar falhava com
-- "new row ... violates check constraint lideranca_permissoes_acao_check".

alter table public.lideranca_permissoes
  drop constraint if exists lideranca_permissoes_acao_check;

alter table public.lideranca_permissoes
  add constraint lideranca_permissoes_acao_check
  check (acao in ('ver', 'criar', 'editar', 'excluir', 'promover'));

notify pgrst, 'reload schema';
