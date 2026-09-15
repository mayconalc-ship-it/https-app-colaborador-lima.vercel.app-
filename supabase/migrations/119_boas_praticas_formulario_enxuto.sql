-- ==================================================================
-- 119 - BOAS PRATICAS: formulario enxuto
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (15/09/2026): o formulario fica so com o NOME DA BOA
-- PRATICA, o PROBLEMA e os BENEFICIOS. Objetivo e escopo sairam.
--
-- As colunas continuam existindo (o que ja foi escrito nao se perde),
-- so deixam de ser obrigatorias. A trava de tamanho (10 a 1500) segue
-- valendo quando o campo vier preenchido: com o campo vazio (nulo), a
-- checagem nao se aplica.

alter table public.boas_praticas alter column objetivo drop not null;
alter table public.boas_praticas alter column escopo drop not null;

-- Confira: as duas linhas com is_nullable = YES.
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'boas_praticas'
  and column_name in ('objetivo', 'escopo')
order by column_name;
