-- ==================================================================
-- 124 - USO POR TELA (para a Limpeza de Acessos)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (16/09/2026): um relatorio de quem tem modulo liberado e
-- nao usa ha 30 dias, e de quem nao entra mais no app.
--
-- A pergunta e "esta pessoa abriu ESTA tela desde tal dia?". Respondida no
-- app, ela traria dezenas de milhares de linhas de eventos_acesso (medido
-- em 16/09/2026: ~30 mil em 30 dias) so para descartar quase tudo -- e em
-- paginas de mil, que e o teto do PostgREST. Aqui o banco agrupa e devolve
-- uma linha por pessoa + tela, com o ultimo acesso.
--
-- A "tela" e o endereco cortado em dois niveis: /produtividade-armazem/
-- reepack e /carretas-conferencia/<id> viram /produtividade-armazem/reepack
-- e /carretas-conferencia/<id>. O app compara pelo comeco do endereco.

create or replace function public.uso_por_tela(p_colaboradores uuid[], p_desde timestamptz)
returns table (colaborador_id uuid, tela text, ultimo_em timestamptz)
language sql
stable
as $$
  select
    e.colaborador_id,
    '/' || split_part(e.alvo, '/', 2)
      || case when split_part(e.alvo, '/', 3) <> '' then '/' || split_part(e.alvo, '/', 3) else '' end as tela,
    max(e.criado_em) as ultimo_em
  from public.eventos_acesso e
  where e.tipo = 'tela'
    and e.criado_em >= p_desde
    and e.colaborador_id = any (p_colaboradores)
  group by 1, 2
$$;

-- So o servidor chama (a tela confere quem pode ver o relatorio). Sem isto,
-- qualquer pessoa logada leria o uso de qualquer outra.
revoke all on function public.uso_por_tela(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.uso_por_tela(uuid[], timestamptz) to service_role;

notify pgrst, 'reload schema';

-- Confira: a funcao existe e responde (as telas mais abertas nos ultimos 7 dias).
select tela, count(*) as pessoas
from public.uso_por_tela(
  array(select id from public.profiles),
  now() - interval '7 days'
)
group by tela
order by pessoas desc
limit 10;
