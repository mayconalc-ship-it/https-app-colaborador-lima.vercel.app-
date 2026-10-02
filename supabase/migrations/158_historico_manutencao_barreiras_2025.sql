-- ==================================================================
-- 158 - Historico do Check de Manutencao de Barreiras (2025, T1 a T4)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- Depende da 156. Pode rodar mais de uma vez.
-- ==================================================================
-- Pedido do dono (02/10/2026): trazer para o app as notas T1 a T4 da
-- planilha "09_Set Checklist Global de Manutencao" (aba Revenda, data
-- 15/09/2025, Revenda Lima BA - Barreiras), para a evolucao do painel
-- ja comecar com o historico de 2025.
--
-- - 4 avaliacoes FINALIZADAS (2025 T1 a T4), com a nota total da
--   planilha (89,9% / 93,1% / 93,1% / 86,8%) -- a mesma que o app
--   calcula (ver __testes__/manutencao.teste.mjs). Data de fechamento:
--   o ultimo dia de cada trimestre.
-- - 144 respostas (36 itens x 4). Sem foto: a planilha nao tem.
-- - O "Plano de Acao" da planilha entra nos itens abaixo de 3 que o
--   tinham (3.2, 9.1, 9.2), sem responsavel e prazo (a planilha nao traz).
-- - 7.4 entra com nota 0, como na aba Revenda (e a que fecha a conta).
--
-- Nao mexe em avaliacao criada no app: se ja existir 2025 Tx feita pelo
-- time, ela fica como esta e a da planilha nao entra.
-- ==================================================================

insert into public.manut_avaliacoes
  (revenda_id, ano, trimestre, status, iniciada_por_nome, iniciada_em, finalizada_por_nome, finalizada_em, nota_total)
select 'fc365d16-ccbd-4322-ae02-e992a36861e8'::uuid, 2025, a.trimestre, 'finalizada',
       'Planilha da manutenção', (a.fim || 'T12:00:00-03:00')::timestamptz,
       'Planilha da manutenção', (a.fim || 'T12:00:00-03:00')::timestamptz, a.total
from (
  values
    (1, 0.89935, '2025-03-31'),
    (2, 0.9311, '2025-06-30'),
    (3, 0.9311, '2025-09-30'),
    (4, 0.8676, '2025-12-31')
) as a(trimestre, total, fim)
where exists (select 1 from public.revendas r where r.id = 'fc365d16-ccbd-4322-ae02-e992a36861e8')
on conflict (revenda_id, ano, trimestre) do nothing;

insert into public.manut_respostas
  (avaliacao_id, item_id, revenda_id, nota, na, observacao, plano_acao, respondido_por_nome, atualizado_em)
select av.id, it.id, av.revenda_id, r.nota, r.na, 'Importado da planilha (15/09/2025)', r.plano,
       'Planilha da manutenção', av.finalizada_em
from (
  values
    (1, '1.1', 0, false, null),
    (2, '1.1', 3, false, null),
    (3, '1.1', 3, false, null),
    (4, '1.1', 3, false, null),
    (1, '1.2', 3, false, null),
    (2, '1.2', 3, false, null),
    (3, '1.2', 3, false, null),
    (4, '1.2', 3, false, null),
    (1, '1.3', 3, false, null),
    (2, '1.3', 3, false, null),
    (3, '1.3', 3, false, null),
    (4, '1.3', 3, false, null),
    (1, '1.4', 3, false, null),
    (2, '1.4', 3, false, null),
    (3, '1.4', 3, false, null),
    (4, '1.4', 3, false, null),
    (1, '1.5', 3, false, null),
    (2, '1.5', 3, false, null),
    (3, '1.5', 3, false, null),
    (4, '1.5', 3, false, null),
    (1, '1.6', 3, false, null),
    (2, '1.6', 3, false, null),
    (3, '1.6', 3, false, null),
    (4, '1.6', 3, false, null),
    (1, '1.7', 1, false, null),
    (2, '1.7', 1, false, null),
    (3, '1.7', 1, false, null),
    (4, '1.7', 1, false, null),
    (1, '2.1', 3, false, null),
    (2, '2.1', 3, false, null),
    (3, '2.1', 3, false, null),
    (4, '2.1', 3, false, null),
    (1, '2.2', 3, false, null),
    (2, '2.2', 3, false, null),
    (3, '2.2', 3, false, null),
    (4, '2.2', 3, false, null),
    (1, '2.3', 3, false, null),
    (2, '2.3', 3, false, null),
    (3, '2.3', 3, false, null),
    (4, '2.3', 3, false, null),
    (1, '3.1', 3, false, null),
    (2, '3.1', 3, false, null),
    (3, '3.1', 3, false, null),
    (4, '3.1', 3, false, null),
    (1, '3.2', 1, false, 'Implantação de chamado digital em andamento'),
    (2, '3.2', 1, false, 'Implantação de chamado digital em andamento'),
    (3, '3.2', 1, false, 'Implantação de chamado digital em andamento'),
    (4, '3.2', 1, false, 'Implantação de chamado digital em andamento'),
    (1, '3.3', 3, false, null),
    (2, '3.3', 3, false, null),
    (3, '3.3', 3, false, null),
    (4, '3.3', 3, false, null),
    (1, '3.4', 3, false, null),
    (2, '3.4', 3, false, null),
    (3, '3.4', 3, false, null),
    (4, '3.4', 3, false, null),
    (1, '3.5', 3, false, null),
    (2, '3.5', 3, false, null),
    (3, '3.5', 3, false, null),
    (4, '3.5', 3, false, null),
    (1, '4.1', 3, false, null),
    (2, '4.1', 3, false, null),
    (3, '4.1', 3, false, null),
    (4, '4.1', 3, false, null),
    (1, '4.2', 3, false, null),
    (2, '4.2', 3, false, null),
    (3, '4.2', 3, false, null),
    (4, '4.2', 3, false, null),
    (1, '4.3', 3, false, null),
    (2, '4.3', 3, false, null),
    (3, '4.3', 3, false, null),
    (4, '4.3', 3, false, null),
    (1, '5.1', 3, false, null),
    (2, '5.1', 3, false, null),
    (3, '5.1', 3, false, null),
    (4, '5.1', 3, false, null),
    (1, '5.2', 3, false, null),
    (2, '5.2', 3, false, null),
    (3, '5.2', 3, false, null),
    (4, '5.2', 1, false, null),
    (1, '5.3', 3, false, null),
    (2, '5.3', 3, false, null),
    (3, '5.3', 3, false, null),
    (4, '5.3', 1, false, null),
    (1, '6.1', 3, false, null),
    (2, '6.1', 3, false, null),
    (3, '6.1', 3, false, null),
    (4, '6.1', 3, false, null),
    (1, '6.2', 3, false, null),
    (2, '6.2', 3, false, null),
    (3, '6.2', 3, false, null),
    (4, '6.2', 3, false, null),
    (1, '7.1', 3, false, null),
    (2, '7.1', 3, false, null),
    (3, '7.1', 3, false, null),
    (4, '7.1', 3, false, null),
    (1, '7.2', 3, false, null),
    (2, '7.2', 3, false, null),
    (3, '7.2', 3, false, null),
    (4, '7.2', 3, false, null),
    (1, '7.3', 3, false, null),
    (2, '7.3', 3, false, null),
    (3, '7.3', 3, false, null),
    (4, '7.3', 3, false, null),
    (1, '7.4', 0, false, null),
    (2, '7.4', 0, false, null),
    (3, '7.4', 0, false, null),
    (4, '7.4', 0, false, null),
    (1, '7.5', 3, false, null),
    (2, '7.5', 3, false, null),
    (3, '7.5', 3, false, null),
    (4, '7.5', 3, false, null),
    (1, '7.6', 3, false, null),
    (2, '7.6', 3, false, null),
    (3, '7.6', 3, false, null),
    (4, '7.6', 3, false, null),
    (1, '8.1', 3, false, null),
    (2, '8.1', 3, false, null),
    (3, '8.1', 3, false, null),
    (4, '8.1', 3, false, null),
    (1, '8.2', 3, false, null),
    (2, '8.2', 3, false, null),
    (3, '8.2', 3, false, null),
    (4, '8.2', 3, false, null),
    (1, '8.3', 3, false, null),
    (2, '8.3', 3, false, null),
    (3, '8.3', 3, false, null),
    (4, '8.3', 3, false, null),
    (1, '9.1', 3, false, null),
    (2, '9.1', 3, false, null),
    (3, '9.1', 3, false, null),
    (4, '9.1', 3, false, null),
    (1, '9.2', 1, false, 'Executar o processo na revenda a partir de maio'),
    (2, '9.2', 1, false, 'Executar o processo na revenda a partir de maio'),
    (3, '9.2', 1, false, 'Executar o processo na revenda a partir de maio'),
    (4, '9.2', 1, false, 'Executar o processo na revenda a partir de maio'),
    (1, '9.3', 3, false, null),
    (2, '9.3', 3, false, null),
    (3, '9.3', 3, false, null),
    (4, '9.3', 3, false, null),
    (1, '9.4', 3, false, null),
    (2, '9.4', 3, false, null),
    (3, '9.4', 3, false, null),
    (4, '9.4', 3, false, null)
) as r(trimestre, numero, nota, na, plano)
join public.manut_avaliacoes av
  on av.revenda_id = 'fc365d16-ccbd-4322-ae02-e992a36861e8'
 and av.ano = 2025 and av.trimestre = r.trimestre
 -- So nas avaliacoes que vieram da planilha.
 and av.iniciada_por_nome = 'Planilha da manutenção'
join public.manut_itens it on it.revenda_id = av.revenda_id and it.numero = r.numero
on conflict (avaliacao_id, item_id) do nothing;

-- Confira: 4 avaliacoes de 2025, 36 respostas em cada, e a nota total.
select av.ano || ' T' || av.trimestre as trimestre, av.status, round(av.nota_total * 100, 1) as nota_pct, count(r.id) as respostas
from public.manut_avaliacoes av
left join public.manut_respostas r on r.avaliacao_id = av.id
where av.revenda_id = 'fc365d16-ccbd-4322-ae02-e992a36861e8' and av.ano = 2025
group by av.id
order by av.trimestre;
