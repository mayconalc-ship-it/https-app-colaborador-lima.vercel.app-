-- ==================================================================
-- 133 - COMPROVANTE DE PAGAMENTO: "DESCONSIDERADO" NA CONCILIACAO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (22/09/2026): motorista lancou boleto no meio dos PIX e
-- isso atrapalha fechar o mapa. O financeiro marca o comprovante como
-- DESCONSIDERADO, com o motivo (em conferencia_obs): ele sai da conta do
-- mapa, mas continua gravado -- nada e apagado.

-- Tira a regra antiga (feita na 129 sem nome explicito), qualquer que
-- seja o nome que o Postgres deu a ela.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.qr_comprovantes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%conferencia_situacao%'
  loop
    execute format('alter table public.qr_comprovantes drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.qr_comprovantes
  add constraint qr_comprovantes_conferencia_situacao_check
  check (conferencia_situacao is null
         or conferencia_situacao in ('conferido', 'divergente', 'desconsiderado'));

notify pgrst, 'reload schema';

-- Confira: deve aparecer 'desconsiderado' na regra.
select pg_get_constraintdef(oid) as regra
from pg_constraint
where conname = 'qr_comprovantes_conferencia_situacao_check';
