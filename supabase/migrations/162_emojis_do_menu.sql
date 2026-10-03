-- ==================================================================
-- 162 - EMOJIS DO MENU
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Revisao dos emojis (03/10/2026, pedido do dono): o emoji tem de dizer
-- o que a tela faz, e duas telas nao dividem o mesmo.
--
--   Desafio do Mes    🏆 -> 🧠  (o 🏆 e do Ranking Super Matinal)
--   Ativo de Giro     📦 -> 🍺  (o 📦 e do Reepack; ativo de giro e o
--                                vasilhame e a garrafeira)
--   Sonho da Revenda  🎯 -> 🌟  (o 🎯 e das Metas)
--   Fornecedores      📇 -> 📞  (o cartao ja desenha predio + telefone)
--
-- So troca onde o emoji ainda e o antigo: se o Admin escolheu outro na
-- Ordem do Menu, a escolha dele fica.

update public.menu_itens set emoji = '🧠' where chave = 'quiz' and emoji = '🏆';
update public.menu_itens set emoji = '🍺' where chave = 'ativo-giro' and emoji = '📦';
update public.menu_itens set emoji = '🌟' where chave = 'sonho' and emoji = '🎯';
update public.menu_itens set emoji = '📞' where chave = 'fornecedores' and emoji = '📇';

-- Confira: os quatro itens, por revenda.
select chave, emoji, count(*) as revendas
from public.menu_itens
where chave in ('quiz', 'ativo-giro', 'sonho', 'fornecedores')
group by chave, emoji
order by chave;
