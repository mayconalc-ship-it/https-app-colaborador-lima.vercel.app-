-- ==================================================================
-- 127 - QR DE CONTINGENCIA: MODO SEM INTERNET
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (18/09/2026): funcionar sem sinal. O comprovante fica
-- guardado no celular e sobe quando o sinal volta. Duas colunas:
--
--   envio_id: gerado no celular. Se o sinal cair DEPOIS de o servidor
--             gravar e ANTES de a resposta chegar, o celular tenta de novo
--             -- e o mesmo comprovante nao entra duas vezes.
--   pago_em:  a hora em que o motorista registrou na frente do cliente. E
--             ela que vale como dia do pagamento, nao a hora do envio.

alter table public.qr_comprovantes
  add column if not exists envio_id uuid,
  add column if not exists pago_em timestamptz;

create unique index if not exists qr_comprovantes_envio_id_unico
  on public.qr_comprovantes (envio_id);

notify pgrst, 'reload schema';

-- Confira: as duas colunas novas.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'qr_comprovantes'
  and column_name in ('envio_id', 'pago_em')
order by column_name;
