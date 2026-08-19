-- ==================================================================
-- 040 - PREENCHER OS MESES SEM REGISTRO (jan, fev, mai e jul de 2026)
-- Execute no Supabase: SQL Editor > New query > colar > Ctrl+A > Run
-- ==================================================================
-- RODE A MIGRACAO 039 ANTES desta. Ela cria a coluna `estimada`, que e
-- o que impede este numero de se passar por medicao.
--
-- Contexto: esses meses tiveram auditoria, mas a planilha que guardava o
-- resultado se perdeu. Para o historico do ano nao ficar com buracos,
-- cada area recebe nesses meses o total MEDIO das auditorias reais dela.
--
-- Tres decisoes que valem ler antes de rodar:
--
-- 1) MARCADO NA COLUNA, NAO NA TELA. `estimada = true` em toda linha
--    criada aqui. A observacao fica VAZIA de proposito: ela apareceria
--    na tela da auditoria e nas exportacoes, e isso e ruido para quem
--    so quer ver o historico.
--
--    A coluna, por outro lado, nao aparece em lugar nenhum do app nem
--    dos graficos -- e o unico jeito de alguem responder, daqui a um
--    ano, se aquele mes foi medido ou calculado. Sem ela esses quatro
--    meses viram medicao que nunca aconteceu, e num programa de
--    qualidade isso costuma voltar como problema em auditoria externa.
--
-- 2) SEM RESPOSTA ITEM A ITEM. Nao invento "4.3 = NOK". O ranking de
--    perguntas criticas continua saindo 100% de auditoria medida -- que
--    e justamente o indicador que manda alguem consertar alguma coisa.
--    O que entra e o consolidado: total de OK, NOK e N/A por senso.
--
-- 3) SEM AUDITOR. `auditor_id` fica nulo. Creditar a media a uma pessoa
--    real inflaria a contagem dela no bloco "Por auditor" com trabalho
--    que ninguem consegue comprovar.
--
-- Roda duas vezes sem duplicar: mes que ja tem auditoria e ignorado.
-- Para desfazer, o comando esta no fim do arquivo.

-- ------------------------------------------------------------------
-- 1) Os meses a preencher
-- ------------------------------------------------------------------
-- Marco NAO entra: ele tem 17 auditorias reais. Se quiser outro mes,
-- acrescente aqui.
drop table if exists public.est_5s_meses;

create table public.est_5s_meses (competencia date primary key);

insert into public.est_5s_meses (competencia) values
  (date '2026-01-01'),
  (date '2026-02-01'),
  (date '2026-05-01'),
  (date '2026-07-01');

-- ------------------------------------------------------------------
-- 2) A media de cada area
-- ------------------------------------------------------------------
-- Media das auditorias REAIS da area (estimada = false). Area que nunca
-- foi auditada nao entra: nao ha do que tirar media, e inventar um
-- numero para ela seria chute puro, nao estimativa.
--
-- Os totais sao arredondados para inteiro porque representam contagem
-- de itens -- "18,4 itens conformes" nao existe.
drop table if exists public.est_5s_media;

create table public.est_5s_media as
select
  au.area_id,
  au.revenda_id,
  round(avg(au.total_ok))::smallint  as total_ok,
  round(avg(au.total_nok))::smallint as total_nok,
  round(avg(au.total_na))::smallint  as total_na,
  count(*)                           as auditorias_na_media
from public.cinco_s_auditorias au
where au.status = 'finalizada'
  and au.estimada = false
group by au.area_id, au.revenda_id
having count(*) >= 2;   -- uma auditoria so nao e media

-- ------------------------------------------------------------------
-- 3) As auditorias estimadas
-- ------------------------------------------------------------------
insert into public.cinco_s_auditorias
  (revenda_id, area_id, auditor_id, dono_id, status, estimada,
   planejada_para, iniciada_em, finalizada_em, observacao,
   total_ok, total_nok, total_na, conformidade)
select
  m.revenda_id,
  m.area_id,
  null,                                   -- sem auditor: ver decisao 3
  d.colaborador_id,
  'finalizada',
  true,
  -- Dia 15, meio do mes, para nao sugerir uma data exata que ninguem
  -- tem como confirmar.
  (mes.competencia + interval '14 days')::date,
  (mes.competencia + interval '14 days')::timestamptz,
  (mes.competencia + interval '14 days')::timestamptz,
  null,                                   -- sem observacao: ver decisao 1
  m.total_ok,
  m.total_nok,
  m.total_na,
  public.cinco_s_taxa(m.total_ok::int, m.total_nok::int)
from public.est_5s_media m
cross join public.est_5s_meses mes
left join public.cinco_s_area_donos d
       on d.area_id = m.area_id and d.ate is null
where not exists (
  select 1 from public.cinco_s_auditorias x
   where x.area_id = m.area_id
     and x.competencia = mes.competencia
     and x.status <> 'cancelada'
);

-- ------------------------------------------------------------------
-- 4) O consolidado por senso
-- ------------------------------------------------------------------
-- O radar precisa de cinco linhas por auditoria. Aqui elas saem da
-- media da area POR SENSO -- e nao de uma divisao igual dos totais,
-- que achataria o radar e apagaria justamente o que ele existe para
-- mostrar: que Disciplina reprova mais que Limpeza.
--
-- O ajuste do fim garante que a soma dos cinco sensos bata com o total
-- da auditoria. Sem ele, o cartao do topo e o radar diriam numeros
-- diferentes para a mesma auditoria.
insert into public.cinco_s_auditoria_sensos
  (auditoria_id, senso, ok, nok, na, conformidade)
select
  nova.id,
  med.senso,
  round(med.ok)::smallint,
  round(med.nok)::smallint,
  round(med.na)::smallint,
  public.cinco_s_taxa(round(med.ok)::int, round(med.nok)::int)
from public.cinco_s_auditorias nova
join (
  select au.area_id, s.senso,
         avg(s.ok) as ok, avg(s.nok) as nok, avg(s.na) as na
    from public.cinco_s_auditoria_sensos s
    join public.cinco_s_auditorias au on au.id = s.auditoria_id
   where au.status = 'finalizada' and au.estimada = false
   group by au.area_id, s.senso
) med on med.area_id = nova.area_id
where nova.estimada = true
on conflict (auditoria_id, senso) do nothing;

-- Reconcilia o total da auditoria com a soma dos sensos arredondados.
update public.cinco_s_auditorias a
   set total_ok  = s.ok,
       total_nok = s.nok,
       total_na  = s.na,
       conformidade = public.cinco_s_taxa(s.ok::int, s.nok::int)
  from (
    select auditoria_id,
           sum(ok)::smallint as ok, sum(nok)::smallint as nok,
           sum(na)::smallint as na
      from public.cinco_s_auditoria_sensos
     group by auditoria_id
  ) s
 where a.id = s.auditoria_id
   and a.estimada = true;

-- ------------------------------------------------------------------
-- 5) O que entrou
-- ------------------------------------------------------------------
select
  to_char(competencia, 'MM/YYYY')                as mes,
  count(*)                                       as auditorias_estimadas,
  round(avg(conformidade), 2)::text || '%'       as conformidade_media
from public.cinco_s_auditorias
where estimada = true
group by competencia
order by competencia;

-- ------------------------------------------------------------------
-- 6) LIMPEZA (rode depois de conferir)
-- ------------------------------------------------------------------
--   drop table if exists public.est_5s_media;
--   drop table if exists public.est_5s_meses;
--
-- PARA DESFAZER TUDO -- apaga so o que este arquivo criou:
--   delete from public.cinco_s_auditorias where estimada = true;
