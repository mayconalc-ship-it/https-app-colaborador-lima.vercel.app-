-- ==================================================================
-- 166 - ICONE DO CHECK DE MANUTENCAO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (06/10/2026): o Check de Manutencao passa a ter o
-- icone de checklist -- um desenho proprio (prancheta com itens
-- marcados, ver components/Icone). O emoji do assunto no mapa
-- (src/lib/mapa-emojis.ts) troca de 🛠️ para ☑️, e o menu guarda o
-- emoji no banco, por revenda: e o que aparece na tela Ordem do Menu.
--
-- O cartao da tela inicial ja desenha a prancheta sem esta migration
-- (o desenho vem da chave "manutencao"); ela so alinha o banco ao mapa.

update public.menu_itens
   set emoji = '☑️'
 where chave = 'manutencao'
   and emoji is distinct from '☑️';

-- Confira: so ☑️ (a coluna revendas soma as duas).
select chave, emoji, count(*) as revendas
from public.menu_itens
where chave = 'manutencao'
group by chave, emoji;
