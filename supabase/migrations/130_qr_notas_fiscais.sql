-- ==================================================================
-- 130 - COMPROVANTE DE PAGAMENTO: NOTAS FISCAIS
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (21/09/2026): informar a NF do pagamento, com teclado
-- numerico, e mais de uma NF por comprovante (um PIX pode quitar varias
-- notas do mesmo cliente). Guardadas como lista de numeros (so digitos,
-- sem zeros a esquerda), ate 20 por comprovante.
--
-- A edicao do motorista passa a registrar tambem as notas de antes e de
-- depois, como ja registra o valor e as fotos (128).

alter table public.qr_comprovantes
  add column if not exists notas_fiscais text[] not null default '{}'
    check (cardinality(notas_fiscais) <= 20);

alter table public.qr_comprovante_edicoes
  add column if not exists notas_antes text[],
  add column if not exists notas_depois text[];

-- Procurar comprovante pela NF (a tela de conciliacao filtra por ela).
create index if not exists qr_comprovantes_notas_idx
  on public.qr_comprovantes using gin (notas_fiscais);

notify pgrst, 'reload schema';

-- Confira: as 3 colunas novas.
select count(*) as colunas_novas
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'qr_comprovantes' and column_name = 'notas_fiscais')
    or (table_name = 'qr_comprovante_edicoes' and column_name in ('notas_antes', 'notas_depois')));
