-- ==================================================================
-- 079 - Libera o modulo JUSTIFICATIVAS no Modo Lideranca
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Tela nova em /admin/justificativas: as explicacoes que o colaborador
-- escreveu no Rating, na Devolucao e no Refugo, numa lista so.
--
-- Nao cria tabela nenhuma -- so cadastra o modulo. A barra lateral do
-- Admin so mostra o que esta em revenda_modulos, entao sem isto a tela
-- existe mas ninguem chega nela.
--
-- Nao entra em menu_itens de proposito: e tela de LIDERANCA, nao vira
-- cartao no app do colaborador.

-- Libera onde ja existe algum dos tres indicadores. Assim a revenda que
-- nao usa Rating/Refugo/Devolucao nao ganha uma tela que so mostraria
-- lista vazia -- e nao preciso fixar o id de nenhuma revenda aqui.
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select distinct rm.revenda_id, 'justificativas', true
from public.revenda_modulos rm
where rm.modulo in ('rating', 'devolucao', 'refugo')
  and rm.ativo
on conflict (revenda_id, modulo) do update set ativo = true;

-- Confira: deve listar uma linha por revenda que usa os indicadores.
select r.nome, rm.modulo, rm.ativo
from public.revenda_modulos rm
join public.revendas r on r.id = rm.revenda_id
where rm.modulo = 'justificativas';
