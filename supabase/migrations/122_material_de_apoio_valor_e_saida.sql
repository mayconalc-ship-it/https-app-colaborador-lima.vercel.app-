-- ==================================================================
-- 122 - MATERIAL DE APOIO: valor do material e entrada na contagem
-- Execute no Supabase do App Colaborador DEPOIS da 121:
-- SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (16/09/2026): "informar os valores para ter nocao do
-- custo diario e mensal" e "verificar a saida desses itens para ter
-- realmente a media utilizada na operacao" -- hoje nao se gerencia nem a
-- media nem o custo.
--
--   * valor_unitario: R$ por unidade de medida do produto (un, m ou kg).
--     Custo por dia = consumo por dia x valor.
--   * entrada: quanto ENTROU (compra recebida) desde a contagem anterior.
--     A saida real entre duas contagens e
--        contagem anterior + entrada - contagem atual.
--     Sem a entrada, uma reposicao pareceria consumo negativo.

alter table public.ma_produtos
  add column if not exists valor_unitario numeric(14,4)
    check (valor_unitario is null or valor_unitario >= 0);

alter table public.ma_contagens
  add column if not exists entrada numeric(14,3) not null default 0
    check (entrada >= 0);

-- Confira: as duas colunas novas.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'ma_produtos' and column_name = 'valor_unitario')
    or (table_name = 'ma_contagens' and column_name = 'entrada'))
order by table_name;
