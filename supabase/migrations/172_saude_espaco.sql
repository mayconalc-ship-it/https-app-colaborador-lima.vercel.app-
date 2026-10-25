-- ==================================================================
-- 172 - Saude do Sistema: espaco usado no Supabase
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- 25/10/2026: o projeto foi bloqueado por estourar o trafego do plano
-- gratuito, e o Storage estava em 929 MB de 1 GB sem ninguem saber. A
-- tela Saude do Sistema passa a mostrar o espaco usado (Storage por
-- bucket e o banco) e a avisar antes do limite.
--
-- O esquema storage nao sai pela API; esta funcao le de dentro do banco
-- e so a service_role (o servidor do app) pode chama-la.
-- ==================================================================

create or replace function public.saude_espaco()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'banco_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'buckets', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', b.bucket_id, 'bytes', b.bytes, 'arquivos', b.arquivos) order by b.bytes desc)
      from (
        select o.bucket_id, sum(coalesce((o.metadata->>'size')::bigint, 0)) as bytes, count(*) as arquivos
        from storage.objects o
        group by o.bucket_id
      ) b
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.saude_espaco() from public, anon, authenticated;
grant execute on function public.saude_espaco() to service_role;

-- Confira: o banco e cada bucket, em bytes.
select public.saude_espaco();
