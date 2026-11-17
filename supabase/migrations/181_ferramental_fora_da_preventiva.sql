-- ==================================================================
-- 181 - CHECK FERRAMENTAL fora da Preventiva
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- Depende da 180. Pode rodar mais de uma vez.
-- RODAR ANTES do push do codigo: a tela da Preventiva passa a ler a
-- coluna nova.
-- ==================================================================
-- Pedido do dono (17/11/2026): "Deixe ela fora de preventiva". O check
-- ferramental continua usando o mesmo motor (itens, prazo, fotos,
-- lembrete), mas aparece em cartao proprio na vitrine da Manutencao
-- (/manutencao-ferramental) e some da lista da Preventiva.

alter table public.manut_prev_modelos
  add column if not exists secao text not null default 'preventiva';

alter table public.manut_prev_modelos
  drop constraint if exists manut_prev_modelos_secao_valida;
alter table public.manut_prev_modelos
  add constraint manut_prev_modelos_secao_valida check (secao in ('preventiva', 'ferramental'));

update public.manut_prev_modelos set secao = 'ferramental' where nome = 'Check Ferramental';

notify pgrst, 'reload schema';

-- Conferencia: Check Ferramental = ferramental; o resto = preventiva.
select r.nome as revenda, m.nome, m.secao
from public.manut_prev_modelos m join public.revendas r on r.id = m.revenda_id
order by r.nome, m.ordem;
