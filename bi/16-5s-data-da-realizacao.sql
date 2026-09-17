-- ==================================================================
-- BI: 5S DATADO PELO DIA EM QUE A AUDITORIA FOI FEITA
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- Depois, atualize o BI (Desktop ou Service). Nao precisa mexer no
-- relatorio nem rodar o 02 de novo: "create or replace" mantem os GRANTs.
-- ==================================================================
-- Achado em 17/09/2026: as 13 auditorias de setembro foram FINALIZADAS em
-- 16/09, mas estavam PLANEJADAS para 21/09. As tres views do 5S datavam a
-- auditoria pela data planejada, entao com o Periodo do relatorio ate
-- 16/09 a pagina do 5S ficava vazia -- o dado estava no modelo, o filtro
-- escondia. Auditoria feita e fato do dia em que foi feita.
--
-- A REGRA da coluna `data`:
--   * finalizada, e o dia da realizacao cai no MES DA COMPETENCIA -> o dia
--     da realizacao;
--   * todo o resto -> a data planejada, como antes.
--
-- Por que a trava do mes: 4 auditorias antigas (competencias de 2025 e de
-- abril/2026) tem `finalizada_em` em agosto/2026 -- carimbo de correcao,
-- nao o dia da auditoria. Sem a trava, elas pulariam de mes no historico.
--
-- NAO MUDA: `atrasada`, `atraso_dias` e a Aderencia ao plano continuam
-- medidos contra a data PLANEJADA -- e ela que diz se o calendario foi
-- cumprido. Nenhuma coluna nova: o modelo do Power BI le as mesmas.

create or replace function bi.data_da_auditoria_5s(
  p_status text,
  p_planejada date,
  p_competencia date,
  p_finalizada_em timestamptz
) returns date
language sql
stable
as $$
  select case
    when p_status = 'finalizada'
     and p_finalizada_em is not null
     and date_trunc('month', bi.dia_local(p_finalizada_em)) = date_trunc('month', p_competencia)
      then bi.dia_local(p_finalizada_em)
    else p_planejada
  end
$$;

grant execute on function bi.data_da_auditoria_5s(text, date, date, timestamptz) to public;

create or replace view bi.fato_5s_auditoria as
select
  au.id                     as auditoria_5s_id,
  au.revenda_id,
  au.area_id                as area_5s_id,
  ar.nome                   as area_5s,
  au.auditor_id,
  au.auditor_id             as colaborador_id,
  coalesce(pa.nome, 'Auditor fora do cadastro') as auditor,
  au.dono_id,
  coalesce(pd.nome, 'Sem dono definido')        as dono,
  au.status,
  case au.status
    when 'planejada'    then 'Planejada'
    when 'em_andamento' then 'Em andamento'
    when 'finalizada'   then 'Finalizada'
    else 'Cancelada'
  end                       as status_rotulo,
  bi.data_da_auditoria_5s(au.status, au.planejada_para, au.competencia, au.finalizada_em) as data,
  au.competencia            as mes_ref,
  to_char(au.competencia, 'MM/YYYY')            as mes_rotulo,
  bi.dia_local(au.finalizada_em)                as data_realizada,
  (au.status = 'finalizada')                    as realizada,
  (au.status in ('planejada', 'em_andamento')
     and au.planejada_para < current_date)      as atrasada,
  case
    when au.status = 'finalizada' and au.finalizada_em is not null
      then greatest(0, bi.dia_local(au.finalizada_em) - au.planejada_para)
  end                       as atraso_dias,
  au.total_ok               as itens_ok,
  au.total_nok              as itens_nok,
  au.total_na               as itens_na,
  (au.total_ok + au.total_nok)                  as itens_avaliados,
  round(au.conformidade / 100.0, 4)             as conformidade,
  au.estimada,
  case when au.estimada then 'Estimada' else 'Medida' end as origem,
  au.observacao,
  bi.dia_local(au.criado_em)                    as data_planejamento
from public.cinco_s_auditorias au
join public.cinco_s_areas ar on ar.id = au.area_id
left join public.profiles pa on pa.id = au.auditor_id
left join public.profiles pd on pd.id = au.dono_id
where au.status <> 'cancelada';

create or replace view bi.fato_5s_senso as
select
  s.auditoria_id            as auditoria_5s_id,
  au.revenda_id,
  au.area_id                as area_5s_id,
  ar.nome                   as area_5s,
  au.auditor_id,
  au.dono_id,
  bi.data_da_auditoria_5s(au.status, au.planejada_para, au.competencia, au.finalizada_em) as data,
  au.competencia            as mes_ref,
  s.senso,
  case s.senso
    when 'utilizacao'  then 'Utilização'
    when 'organizacao' then 'Organização'
    when 'limpeza'     then 'Limpeza'
    when 'conservacao' then 'Conservação'
    when 'disciplina'  then 'Disciplina'
  end                       as senso_rotulo,
  case s.senso
    when 'utilizacao'  then 1 when 'organizacao' then 2
    when 'limpeza'     then 3 when 'conservacao' then 4
    else 5
  end                       as senso_ordem,
  s.ok                      as itens_ok,
  s.nok                     as itens_nok,
  s.na                      as itens_na,
  (s.ok + s.nok)            as itens_avaliados,
  round(s.conformidade / 100.0, 4)              as conformidade
from public.cinco_s_auditoria_sensos s
join public.cinco_s_auditorias au on au.id = s.auditoria_id
join public.cinco_s_areas ar on ar.id = au.area_id
where au.status = 'finalizada';

create or replace view bi.fato_5s_resposta as
select
  r.id                      as resposta_5s_id,
  r.auditoria_id            as auditoria_5s_id,
  au.revenda_id,
  au.area_id                as area_5s_id,
  ar.nome                   as area_5s,
  au.auditor_id,
  au.dono_id,
  bi.data_da_auditoria_5s(au.status, au.planejada_para, au.competencia, au.finalizada_em) as data,
  au.competencia            as mes_ref,
  r.pergunta_id             as pergunta_5s_id,
  q.codigo,
  q.senso,
  r.valor,
  case r.valor
    when 'sim' then 'Conforme'
    when 'nao' then 'Não conforme'
    else 'Não se aplica'
  end                       as resultado,
  (r.valor = 'sim')::int    as eh_ok,
  (r.valor = 'nao')::int    as eh_nok,
  (r.valor = 'na')::int     as eh_na,
  (r.valor in ('sim', 'nao'))::int as eh_avaliado,
  r.observacao,
  r.foto_url
from public.cinco_s_respostas r
join public.cinco_s_auditorias au on au.id = r.auditoria_id
join public.cinco_s_areas ar on ar.id = au.area_id
join public.cinco_s_perguntas q on q.id = r.pergunta_id
where au.status = 'finalizada';

-- Confira: as auditorias de setembro de Sao Felix. As finalizadas em 16/09
-- devem aparecer com data = 16/09 (antes era 21/09); as planejadas
-- continuam na data planejada.
select a.status, a.data, count(*) as auditorias
from bi.fato_5s_auditoria a
where a.mes_ref = date '2026-09-01'
group by a.status, a.data
order by a.data, a.status;
