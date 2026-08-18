-- ==================================================================
-- 036 - BI 5S: um dashboard, uma consulta
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O requisito era explicito: abrir o BI nao pode disparar uma serie de
-- consultas pesadas, e navegar pelos filtros tem que responder rapido
-- mesmo com anos de auditoria acumulada.
--
-- A resposta esta desenhada em tres camadas, da mais barata para a mais
-- cara:
--
--   1) O consolidado ja existe (ver 035). Nenhum cartao e nenhum grafico
--      soma resposta: eles somam auditoria, que ja tem o total pronto.
--      Uma auditoria vale 1 linha em vez de 25.
--
--   2) TODO o dashboard sai de UMA chamada. Sete cartoes, cinco graficos
--      e tres listas viriam, no desenho ingenuo, de quinze consultas
--      independentes -- cada uma refiltrando a mesma base. Aqui a base
--      e filtrada uma vez, em CTE, e os quinze recortes saem dela.
--      O app faz um round-trip e recebe um JSON.
--
--   3) Os indices da 035 cobrem os caminhos que esta funcao percorre;
--      os que faltavam entram no fim deste arquivo.
--
-- Por que funcao e nao view: a view materializada precisaria ser
-- atualizada (e ficaria velha entre atualizacoes, mostrando numero
-- errado logo depois de uma auditoria ser finalizada), e a view comum
-- nao aceita os sete filtros sem virar sete views. A funcao resolve as
-- duas coisas -- sempre atual, e o filtro entra antes da agregacao, nao
-- depois.

-- ------------------------------------------------------------------
-- Indice que faltava
-- ------------------------------------------------------------------
-- O ranking de perguntas criticas e o unico bloco do BI que precisa
-- descer ate as respostas. Este indice deixa ele varrer so o que
-- interessa, em vez da tabela inteira.
create index if not exists cinco_s_respostas_auditoria_valor_idx
  on public.cinco_s_respostas (auditoria_id, valor);

-- ------------------------------------------------------------------
-- O dashboard
-- ------------------------------------------------------------------
-- p_revenda e obrigatorio e NAO vem do usuario: quem o preenche e a
-- acao de servidor, com a revenda ativa da sessao, depois de conferir
-- requireModulo("5s", "ver"). Os demais parametros sao filtros de tela
-- e podem vir nulos, que significa "todos".
--
-- p_dono filtra pelo dono CONGELADO na auditoria, nao pelo dono atual
-- da area. E o que faz "resultado do Joao em marco" continuar sendo o
-- resultado do Joao depois que a area trocar de responsavel.
create or replace function public.cinco_s_dashboard(
  p_revenda uuid,
  p_competencia date default null,
  p_ano int default null,
  p_area uuid default null,
  p_dono uuid default null,
  p_auditor uuid default null,
  p_senso text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with
-- Toda auditoria que o filtro alcanca, em qualquer status. Base dos
-- numeros de PLANEJAMENTO (previstas, pendentes, atrasadas).
base as (
  select a.*
    from public.cinco_s_auditorias a
   where a.revenda_id = p_revenda
     and a.status <> 'cancelada'
     and (p_competencia is null or a.competencia = date_trunc('month', p_competencia)::date)
     and (p_ano is null or extract(year from a.competencia) = p_ano)
     and (p_area is null or a.area_id = p_area)
     and (p_dono is null or a.dono_id = p_dono)
     and (p_auditor is null or a.auditor_id = p_auditor)
),
-- So as finalizadas. Base dos numeros de RESULTADO: uma auditoria pela
-- metade nao tem conformidade, e incluir a media dela como zero mentiria
-- sobre a area.
feitas as (
  select * from base where status = 'finalizada'
),
-- Nao conformidades do mesmo recorte. O filtro de senso entra so aqui e
-- no radar: filtrar auditoria por senso nao faz sentido -- toda auditoria
-- tem os cinco.
ncs as (
  select n.*
    from public.cinco_s_nao_conformidades n
    join base b on b.id = n.auditoria_id
   where (p_senso is null or n.senso = p_senso)
),

-- ---- CARTOES DO TOPO -------------------------------------------------
cartoes as (
  select jsonb_build_object(
    'conformidade', public.cinco_s_taxa(
      coalesce((select sum(total_ok) from feitas), 0)::int,
      coalesce((select sum(total_nok) from feitas), 0)::int
    ),
    'areas_auditadas',    (select count(distinct area_id) from feitas),
    'realizadas',         (select count(*) from feitas),
    'planejadas',         (select count(*) from base),
    'pendentes',          (select count(*) from base where status in ('planejada', 'em_andamento')),
    -- Atrasada = passou do dia planejado e ninguem finalizou. A conta
    -- olha a data de hoje, entao ela se corrige sozinha -- nao existe
    -- carimbo de "atrasado" para envelhecer e virar mentira.
    'atrasadas',          (select count(*) from base
                            where status in ('planejada', 'em_andamento')
                              and planejada_para < current_date),
    'itens_ok',           coalesce((select sum(total_ok)  from feitas), 0),
    'itens_nok',          coalesce((select sum(total_nok) from feitas), 0),
    'itens_na',           coalesce((select sum(total_na)  from feitas), 0),
    'nc_abertas',         (select count(*) from ncs where status in ('aberta', 'em_andamento')),
    'nc_total',           (select count(*) from ncs),
    'nc_concluidas',      (select count(*) from ncs where status in ('concluida', 'validada')),
    'nc_validadas',       (select count(*) from ncs where status = 'validada'),
    'acoes_atrasadas',    (select count(*) from ncs
                            where status in ('aberta', 'em_andamento')
                              and prazo is not null and prazo < current_date),
    'pct_acoes_concluidas', case
      when (select count(*) from ncs) = 0 then null
      else round(
        (select count(*) from ncs where status in ('concluida', 'validada'))::numeric * 100
        / (select count(*) from ncs), 1)
    end
  ) as j
),

-- ---- CONFORMIDADE POR AREA ------------------------------------------
-- Left join a partir das areas para que a area sem auditoria no periodo
-- apareca com conformidade nula em vez de sumir do grafico. Uma area
-- que ninguem auditou e justamente a que a lideranca precisa ver.
por_area as (
  select coalesce(jsonb_agg(x order by x->>'ordem_nula', (x->>'conformidade')::numeric nulls last), '[]'::jsonb) as j
  from (
    select jsonb_build_object(
      'area_id', ar.id,
      'area', ar.nome,
      'conformidade', public.cinco_s_taxa(
        coalesce(sum(f.total_ok), 0)::int, coalesce(sum(f.total_nok), 0)::int),
      'auditorias', count(f.id),
      'nok', coalesce(sum(f.total_nok), 0),
      'itens', coalesce(sum(f.total_ok + f.total_nok), 0),
      'nc_abertas', (
        select count(*) from ncs n
         where n.area_id = ar.id and n.status in ('aberta', 'em_andamento')
      ),
      -- Ordena as sem auditoria por ultimo, para o grafico comecar pelo
      -- pior resultado REAL e nao por um vazio.
      'ordem_nula', case when count(f.id) = 0 then '1' else '0' end
    ) as x
    from public.cinco_s_areas ar
    left join feitas f on f.area_id = ar.id
    where ar.revenda_id = p_revenda
      and (ar.ativa or exists (select 1 from feitas f2 where f2.area_id = ar.id))
      and (p_area is null or ar.id = p_area)
    group by ar.id, ar.nome, ar.ordem
  ) t
),

-- ---- RADAR DOS CINCO SENSOS -----------------------------------------
-- Sai de cinco_s_auditoria_sensos, ja somado na finalizacao: cinco
-- linhas por auditoria, sem tocar em resposta nenhuma.
por_senso as (
  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) as j
  from (
    select
      s.ord,
      jsonb_build_object(
        'senso', s.senso,
        'conformidade', public.cinco_s_taxa(
          coalesce(sum(cs.ok), 0)::int, coalesce(sum(cs.nok), 0)::int),
        'ok',  coalesce(sum(cs.ok), 0),
        'nok', coalesce(sum(cs.nok), 0),
        'na',  coalesce(sum(cs.na), 0)
      ) as x
    from (values
      ('utilizacao', 1), ('organizacao', 2), ('limpeza', 3),
      ('conservacao', 4), ('disciplina', 5)
    ) as s(senso, ord)
    left join public.cinco_s_auditoria_sensos cs
      on cs.senso = s.senso
     and cs.auditoria_id in (select id from feitas)
    group by s.senso, s.ord
  ) t
),

-- ---- EVOLUCAO MENSAL -------------------------------------------------
-- Ignora o filtro de competencia de proposito: um grafico de evolucao
-- filtrado por um mes so mostraria um ponto. Os demais filtros (area,
-- dono, auditor) continuam valendo, que e o que permite "evolucao desta
-- area".
evolucao as (
  select coalesce(jsonb_agg(x order by comp), '[]'::jsonb) as j
  from (
    select
      a.competencia as comp,
      jsonb_build_object(
        'competencia', to_char(a.competencia, 'YYYY-MM'),
        'conformidade', public.cinco_s_taxa(
          sum(a.total_ok)::int, sum(a.total_nok)::int),
        'auditorias', count(*),
        'nok', sum(a.total_nok)
      ) as x
    from public.cinco_s_auditorias a
    where a.revenda_id = p_revenda
      and a.status = 'finalizada'
      and (p_ano is null or extract(year from a.competencia) = p_ano)
      and (p_area is null or a.area_id = p_area)
      and (p_dono is null or a.dono_id = p_dono)
      and (p_auditor is null or a.auditor_id = p_auditor)
    group by a.competencia
    order by a.competencia desc
    limit 24
  ) t
),

-- ---- POR AUDITOR -----------------------------------------------------
por_auditor as (
  select coalesce(jsonb_agg(x order by (x->>'realizadas')::int desc), '[]'::jsonb) as j
  from (
    select jsonb_build_object(
      'auditor_id', b.auditor_id,
      'nome', p.nome,
      'planejadas', count(*),
      'realizadas', count(*) filter (where b.status = 'finalizada'),
      'pendentes',  count(*) filter (where b.status in ('planejada', 'em_andamento')),
      'areas', count(distinct b.area_id),
      'conformidade', public.cinco_s_taxa(
        coalesce(sum(b.total_ok)  filter (where b.status = 'finalizada'), 0)::int,
        coalesce(sum(b.total_nok) filter (where b.status = 'finalizada'), 0)::int),
      'nc', (select count(*) from ncs n where n.auditoria_id in (
               select id from base b2 where b2.auditor_id = b.auditor_id))
    ) as x
    from base b
    join public.profiles p on p.id = b.auditor_id
    group by b.auditor_id, p.nome
  ) t
),

-- ---- PERGUNTAS MAIS CRITICAS ----------------------------------------
-- O unico bloco que desce ate as respostas -- nao ha como ranquear
-- pergunta sem olhar pergunta. O custo fica contido porque a varredura
-- e limitada as auditorias JA filtradas (via o in (select id from
-- feitas), que usa o indice de auditoria_id) e o resultado sai cortado
-- em 10.
perguntas as (
  select coalesce(jsonb_agg(x order by (x->>'taxa_nok')::numeric desc, (x->>'nok')::int desc), '[]'::jsonb) as j
  from (
    select jsonb_build_object(
      'pergunta_id', q.id,
      'codigo', q.codigo,
      'senso', q.senso,
      'texto', q.texto,
      'nok', count(*) filter (where r.valor = 'nao'),
      'ok',  count(*) filter (where r.valor = 'sim'),
      'na',  count(*) filter (where r.valor = 'na'),
      'taxa_nok', round(
        (count(*) filter (where r.valor = 'nao'))::numeric * 100
        / nullif(count(*) filter (where r.valor in ('sim', 'nao')), 0), 1)
    ) as x
    from public.cinco_s_respostas r
    join public.cinco_s_perguntas q on q.id = r.pergunta_id
    where r.auditoria_id in (select id from feitas)
      and (p_senso is null or q.senso = p_senso)
    group by q.id, q.codigo, q.senso, q.texto
    having count(*) filter (where r.valor = 'nao') > 0
    -- O ORDER BY tem que vir ANTES do LIMIT, e nao so no jsonb_agg de
    -- fora: sem ele o LIMIT 10 recolheria dez perguntas quaisquer e o
    -- agregado ordenaria essas dez -- um "ranking dos mais criticos"
    -- que poderia nao conter o mais critico.
    order by
      (count(*) filter (where r.valor = 'nao'))::numeric
        / nullif(count(*) filter (where r.valor in ('sim', 'nao')), 0) desc nulls last,
      count(*) filter (where r.valor = 'nao') desc
    limit 10
  ) t
),

-- ---- AUDITORIAS EM ABERTO -------------------------------------------
-- Lista curta e acionavel: da para clicar e ir direto executar. Cortada
-- em 30 -- ninguem age sobre uma lista maior que isso, e o resto vive na
-- tela de planejamento, com paginacao.
abertas as (
  select coalesce(jsonb_agg(x order by (x->>'planejada_para')), '[]'::jsonb) as j
  from (
    select jsonb_build_object(
      'id', b.id,
      'area', ar.nome,
      'area_id', ar.id,
      'auditor', p.nome,
      'auditor_id', b.auditor_id,
      'planejada_para', b.planejada_para,
      'status', b.status,
      'atrasada', b.planejada_para < current_date
    ) as x
    from base b
    join public.cinco_s_areas ar on ar.id = b.area_id
    join public.profiles p on p.id = b.auditor_id
    where b.status in ('planejada', 'em_andamento')
    order by b.planejada_para
    limit 30
  ) t
)

select jsonb_build_object(
  'cartoes',      (select j from cartoes),
  'por_area',     (select j from por_area),
  'por_senso',    (select j from por_senso),
  'evolucao',     (select j from evolucao),
  'por_auditor',  (select j from por_auditor),
  'perguntas',    (select j from perguntas),
  'abertas',      (select j from abertas)
);
$$;

revoke all on function public.cinco_s_dashboard(uuid, date, int, uuid, uuid, uuid, text) from public;
grant execute on function public.cinco_s_dashboard(uuid, date, int, uuid, uuid, uuid, text) to service_role;

-- ------------------------------------------------------------------
-- Meses que existem na base -- alimenta o seletor de periodo
-- ------------------------------------------------------------------
-- Consulta minuscula e propria, em vez de vir junto do dashboard: o
-- seletor precisa da lista COMPLETA de meses, que nao pode depender do
-- filtro de mes atual. Junta-los faria o seletor perder as opcoes assim
-- que a pessoa escolhesse uma.
create or replace function public.cinco_s_competencias(p_revenda uuid)
returns table (competencia text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct to_char(a.competencia, 'YYYY-MM')
    from public.cinco_s_auditorias a
   where a.revenda_id = p_revenda
     and a.status <> 'cancelada'
   order by 1 desc;
$$;

revoke all on function public.cinco_s_competencias(uuid) from public;
grant execute on function public.cinco_s_competencias(uuid) to service_role;

notify pgrst, 'reload schema';
