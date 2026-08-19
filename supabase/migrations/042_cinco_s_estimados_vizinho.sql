-- ==================================================================
-- 042 - MESES ESTIMADOS PASSAM A OSCILAR
-- Execute no Supabase: SQL Editor > New query > colar > Ctrl+A > Run
-- ==================================================================
-- A 040 deu a cada area a MEDIA dela nos quatro meses sem registro. O
-- efeito colateral apareceu no grafico: os quatro meses ficaram com
-- 83,07% identicos, uma linha reta que nao existe em operacao nenhuma.
--
-- Esta migracao refaz esses meses por outro criterio: cada mes sem
-- registro recebe o resultado da auditoria REAL daquela area mais
-- proxima no tempo.
--
-- Por que o vizinho e nao um numero sorteado dentro de uma faixa:
--
--   1) Todo valor gravado aqui e um valor que a area de fato produziu
--      em alguma auditoria medida. Nao ha numero inventado -- ha numero
--      real reaproveitado, e isso e uma escolha que da para defender
--      para qualquer um que pergunte de onde veio.
--
--   2) O vizinho temporal e o melhor estimador disponivel. O estado da
--      Portaria em janeiro se parece muito mais com o de dezembro do
--      que com a media do ano inteiro -- 5S muda por acao e por
--      descuido, os dois locais no tempo.
--
--   3) A oscilacao sai de graca e na medida certa: meses diferentes
--      pegam vizinhos diferentes, e a variacao resultante e a variacao
--      que a area realmente tem, nao uma amplitude escolhida por mim.
--
-- O que NAO muda: continua marcado em `estimada`, continua sem auditor,
-- continua sem resposta item a item. E continua reversivel por inteiro.

-- ------------------------------------------------------------------
-- 1) Limpa o que a 040 gravou
-- ------------------------------------------------------------------
-- So o que e estimado. Auditoria medida nao e tocada -- e o `where`
-- abaixo e a unica coisa que separa as duas coisas, entao ele nao muda.
delete from public.cinco_s_auditorias where estimada = true;

-- ------------------------------------------------------------------
-- 2) Os meses a preencher
-- ------------------------------------------------------------------
drop table if exists public.est_5s_meses;

create table public.est_5s_meses (competencia date primary key);

insert into public.est_5s_meses (competencia) values
  (date '2026-01-01'),
  (date '2026-02-01'),
  (date '2026-05-01'),
  (date '2026-07-01');

-- ------------------------------------------------------------------
-- 3) Para cada area x mes, a auditoria real mais proxima
-- ------------------------------------------------------------------
-- `distinct on` com ordenacao pela distancia em dias resolve em uma
-- passada: para cada par (area, mes), o Postgres guarda so a primeira
-- linha da ordenacao, que e a auditoria medida mais proxima.
--
-- O desempate por data mais antiga existe para o resultado ser sempre o
-- mesmo se alguem rodar isto duas vezes. Sem ele, dois vizinhos a igual
-- distancia (um antes, um depois) sairiam em ordem imprevisivel.
drop table if exists public.est_5s_origem;

create table public.est_5s_origem as
select distinct on (real.area_id, mes.competencia)
  real.area_id,
  real.revenda_id,
  mes.competencia,
  real.id            as origem_id,
  real.total_ok,
  real.total_nok,
  real.total_na,
  real.conformidade,
  abs(real.competencia - mes.competencia) as distancia_dias
from public.cinco_s_auditorias real
cross join public.est_5s_meses mes
where real.status = 'finalizada'
  and real.estimada = false
  -- Nao reaproveita um mes que ja tem auditoria propria.
  and not exists (
    select 1 from public.cinco_s_auditorias x
     where x.area_id = real.area_id
       and x.competencia = mes.competencia
       and x.status <> 'cancelada'
  )
order by real.area_id, mes.competencia,
         abs(real.competencia - mes.competencia), real.competencia;

-- ------------------------------------------------------------------
-- 4) As auditorias
-- ------------------------------------------------------------------
insert into public.cinco_s_auditorias
  (revenda_id, area_id, auditor_id, dono_id, status, estimada,
   planejada_para, iniciada_em, finalizada_em, observacao,
   total_ok, total_nok, total_na, conformidade)
select
  o.revenda_id,
  o.area_id,
  null,                                     -- sem auditor
  d.colaborador_id,
  'finalizada',
  true,
  (o.competencia + interval '14 days')::date,
  (o.competencia + interval '14 days')::timestamptz,
  (o.competencia + interval '14 days')::timestamptz,
  null,                                     -- sem observacao
  o.total_ok,
  o.total_nok,
  o.total_na,
  o.conformidade
from public.est_5s_origem o
left join public.cinco_s_area_donos d
       on d.area_id = o.area_id and d.ate is null;

-- ------------------------------------------------------------------
-- 5) Os sensos, copiados da mesma auditoria de origem
-- ------------------------------------------------------------------
-- Copiar do MESMO vizinho que deu os totais e o que mantem o radar
-- coerente com o cartao: se pegassemos os totais de dezembro e os
-- sensos da media, a soma dos cinco sensos nao bateria com o total.
insert into public.cinco_s_auditoria_sensos
  (auditoria_id, senso, ok, nok, na, conformidade)
select nova.id, s.senso, s.ok, s.nok, s.na, s.conformidade
from public.cinco_s_auditorias nova
join public.est_5s_origem o
  on o.area_id = nova.area_id
 and o.competencia = nova.competencia
join public.cinco_s_auditoria_sensos s
  on s.auditoria_id = o.origem_id
where nova.estimada = true
on conflict (auditoria_id, senso) do nothing;

-- ------------------------------------------------------------------
-- 6) O que entrou
-- ------------------------------------------------------------------
-- Os quatro meses agora precisam ter percentuais DIFERENTES entre si.
-- Se ainda vierem iguais, o vizinho mais proximo saiu o mesmo para
-- todos -- o que so acontece se a area tiver uma unica auditoria real.
select
  to_char(a.competencia, 'MM/YYYY')                      as mes,
  count(*)                                               as auditorias,
  round(avg(a.conformidade), 2)::text || '%'             as conformidade_media,
  round(min(a.conformidade), 1)::text || '% a '
    || round(max(a.conformidade), 1)::text || '%'        as faixa_das_areas
from public.cinco_s_auditorias a
where a.estimada = true
group by a.competencia
order by a.competencia;

-- ------------------------------------------------------------------
-- 7) LIMPEZA (rode depois de conferir)
-- ------------------------------------------------------------------
--   drop table if exists public.est_5s_origem;
--   drop table if exists public.est_5s_meses;
--   drop table if exists public.est_5s_media;   -- sobrou da 040
--
-- PARA DESFAZER TUDO:
--   delete from public.cinco_s_auditorias where estimada = true;
