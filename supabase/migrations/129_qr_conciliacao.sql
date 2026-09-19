-- ==================================================================
-- 129 - COMPROVANTE DE PAGAMENTO: CONCILIACAO COM O EXTRATO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (19/09/2026): a conferencia "mais de contabilidade". Alem
-- de "conferido", o comprovante pode ficar DIVERGENTE do extrato: quem
-- concilia informa o valor que caiu no banco (0 = nao caiu) e o motivo, e
-- a tela mostra a diferenca.
--
--   conferencia_situacao: 'conferido' (bate com o extrato) | 'divergente'
--   valor_extrato:        o valor que caiu no banco (so na divergencia)
--   conferencia_obs:      o motivo da divergencia
--
-- Quem e quando continuam em conferido_em / conferido_por_nome (128).

alter table public.qr_comprovantes
  add column if not exists conferencia_situacao text
    check (conferencia_situacao is null or conferencia_situacao in ('conferido', 'divergente')),
  add column if not exists valor_extrato numeric(12,2)
    check (valor_extrato is null or (valor_extrato >= 0 and valor_extrato <= 1000000)),
  add column if not exists conferencia_obs text
    check (conferencia_obs is null or char_length(conferencia_obs) <= 200);

-- O que ja foi conferido pela 128 continua conferido.
update public.qr_comprovantes
set conferencia_situacao = 'conferido'
where conferido_em is not null and conferencia_situacao is null;

notify pgrst, 'reload schema';

-- Confira: as 3 colunas novas.
select count(*) as colunas_novas
from information_schema.columns
where table_schema = 'public' and table_name = 'qr_comprovantes'
  and column_name in ('conferencia_situacao', 'valor_extrato', 'conferencia_obs');
