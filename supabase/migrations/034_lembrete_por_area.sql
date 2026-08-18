-- ==================================================================
-- 034 - LEMBRETE DO JORNAL TAMBÉM POR ÁREA
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O lembrete já sabia mirar cargos (ver 027). Faltava a outra metade do
-- cadastro: a área. Coluna irmã de `lembrete_cargos`, com a mesma regra
-- -- nulo/vazio quer dizer "todas as áreas", e quando as duas listas
-- vêm preenchidas elas se cruzam (esta área E este cargo).

alter table public.comunicados
  add column if not exists lembrete_areas text[];

notify pgrst, 'reload schema';
