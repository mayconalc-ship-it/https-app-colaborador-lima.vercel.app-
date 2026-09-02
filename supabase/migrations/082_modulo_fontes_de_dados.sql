-- ==================================================================
-- 082 - Libera o modulo FONTES DE DADOS no Modo Lideranca
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Tela nova em /admin/fontes-de-dados: de onde vem cada numero do app, e
-- quando entrou pela ultima vez.
--
-- A configuracao da fonte morava dentro da tela de cada modulo -- o link
-- do Drive do Rating em /admin/rating, o do Refugo em /admin/refugo, os
-- CSVs da RV em /admin/rv. Sete telas, sete layouts, e nenhum lugar que
-- respondesse "de onde vem os dados deste app?".
--
-- NAO cria tabela nenhuma. A tela le e grava exatamente as mesmas linhas
-- de sempre (rating_config, refugo_config, devolucao_config,
-- rotas_config, rv_config) -- mover qualquer uma quebraria a importacao
-- que ja roda, sem ganhar nada.
--
-- A EDICAO de cada fonte herda a permissao do modulo dela: quem podia
-- importar o Rating continua sendo quem configura a fonte do Rating.
-- Esta concessao so abre a tela.

insert into public.revenda_modulos (revenda_id, modulo, ativo)
select distinct rm.revenda_id, 'fontes-dados', true
from public.revenda_modulos rm
where rm.modulo in ('rating', 'refugo', 'devolucao', 'rotas', 'rv')
  and rm.ativo
on conflict (revenda_id, modulo) do update set ativo = true;

notify pgrst, 'reload schema';

-- Confira: uma linha por revenda que importa alguma fonte.
select r.nome, rm.modulo, rm.ativo
from public.revenda_modulos rm
join public.revendas r on r.id = rm.revenda_id
where rm.modulo = 'fontes-dados';
