-- ==================================================================
-- 163 - MENU NO MAPA DE EMOJIS
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O mapa de emojis (03/10/2026, src/lib/mapa-emojis.ts): um assunto, um
-- emoji, e o mesmo em todo o app. O menu da tela inicial guarda o emoji
-- no banco, por revenda -- aqui ele passa a ser o do mapa.
--
-- Onde o assunto tem desenho proprio (armazem, ativo de giro,
-- fornecedores...), o cartao mostra o desenho; o emoji abaixo fica para
-- a tela Ordem do Menu e para os avisos.
--
-- Sem a condicao "so se ainda for o antigo" da 162, de proposito: o
-- pedido e que o emoji seja o mesmo em todo lugar.

update public.menu_itens m
   set emoji = v.emoji
  from (values
  ('sonho', '🌟'),
  ('padroes', '📋'),
  ('ranking', '🏆'),
  ('comunicados', '📰'),
  ('escala', '🗓️'),
  ('rv', '💰'),
  ('rota', '🚚'),
  ('qr-contingencia', '📲'),
  ('feedback', '📝'),
  ('ativo-giro', '🔄'),
  ('material-apoio', '🧰'),
  ('quiz', '🧠'),
  ('5s', '🧹'),
  ('produtividade-armazem', '🏭'),
  ('meus-indicadores', '📈'),
  ('boas-praticas', '💡'),
  ('guia', '❓'),
  ('manutencao', '🛠️'),
  ('fornecedores', '☎️'),
  ('conta', '🔒')
  ) as v(chave, emoji)
 where m.chave = v.chave
   and m.emoji is distinct from v.emoji;

-- Confira: um emoji por item (a coluna revendas soma as duas).
select chave, emoji, count(*) as revendas
from public.menu_itens
group by chave, emoji
order by chave;
