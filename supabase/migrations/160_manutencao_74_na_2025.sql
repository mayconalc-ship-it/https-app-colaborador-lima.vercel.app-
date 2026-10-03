-- ==================================================================
-- 160 - Check de Manutencao de Barreiras 2025: item 7.4 como N/A
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- Depende da 158. Pode rodar mais de uma vez.
-- ==================================================================
-- Decisao do dono (03/10/2026): o item 7.4 ("A unidade possui areas
-- internas comodatadas para parceiros?") fica como N/A.
--
-- A 158 importou o 7.4 com nota 0, como estava na aba Revenda da
-- planilha (a aba Geral trazia N/A). Com N/A o item sai da conta: a
-- secao 7 vai a 100% e o total de cada trimestre sobe:
--
--   2025 T1  89,9% -> 91,8%
--   2025 T2  93,1% -> 95,0%
--   2025 T3  93,1% -> 95,0%
--   2025 T4  86,8% -> 88,6%
--
-- (mesma formula do app: secao = soma(nota x peso) / soma(3 x peso), sem
-- N/A; total = media das 9 secoes -- conferido em
-- __testes__/manutencao.teste.mjs)
--
-- So mexe nas avaliacoes que vieram da planilha.
-- ==================================================================

update public.manut_respostas r
set nota = null,
    na = true,
    observacao = 'Importado da planilha (15/09/2025). 7.4 corrigido para N/A em 03/10/2026.'
from public.manut_avaliacoes av, public.manut_itens it
where r.avaliacao_id = av.id
  and r.item_id = it.id
  and av.revenda_id = 'fc365d16-ccbd-4322-ae02-e992a36861e8'
  and av.ano = 2025
  and av.iniciada_por_nome = 'Planilha da manutenção'
  and it.numero = '7.4';

update public.manut_avaliacoes av
set nota_total = n.total
from (
  values (1, 0.91787), (2, 0.94962), (3, 0.94962), (4, 0.88612)
) as n(trimestre, total)
where av.revenda_id = 'fc365d16-ccbd-4322-ae02-e992a36861e8'
  and av.ano = 2025
  and av.trimestre = n.trimestre
  and av.iniciada_por_nome = 'Planilha da manutenção';

-- Confira: 7.4 como N/A nos 4 trimestres e a nota nova.
select av.ano || ' T' || av.trimestre as trimestre,
       round(av.nota_total * 100, 1) as nota_pct,
       bool_and(r.na) filter (where it.numero = '7.4') as item_74_na
from public.manut_avaliacoes av
join public.manut_respostas r on r.avaliacao_id = av.id
join public.manut_itens it on it.id = r.item_id
where av.revenda_id = 'fc365d16-ccbd-4322-ae02-e992a36861e8' and av.ano = 2025
group by av.id
order by av.trimestre;
