-- ==================================================================
-- BI DO APP DO COLABORADOR - CAMADA SEMANTICA
-- Execute no Supabase: SQL Editor > New query > colar > Run
-- ==================================================================
-- Este script NAO altera nenhuma tabela do app. Ele so cria views de
-- leitura no esquema "bi", que e o que o Power BI vai enxergar.
--
-- Por que um esquema separado, e nao views em "public":
--
--   1) "public" e o que o PostgREST expoe como API do app. View nova ali
--      viraria endpoint novo sem ninguem pedir.
--   2) O Power BI abre o Navegador listando esquemas. Com "bi" separado,
--      quem monta o relatorio ve 20 objetos prontos em vez de 40 tabelas
--      cruas + tabelas de sistema.
--
-- Por que as views RESOLVEM o problema de RLS (isto e o ponto central):
--
--   Quase toda tabela deste banco tem Row Level Security, e varias
--   (quiz_*, notificacoes, cinco_porques, profiles) so devolvem linha
--   para o proprio dono do dado -- ou nao devolvem nada para ninguem
--   que nao seja o service_role. Um usuario "powerbi_readonly" com
--   GRANT SELECT nas tabelas leria ZERO linha e o relatorio nasceria
--   vazio.
--
--   Uma view em Postgres roda com os privilegios do DONO dela (o
--   default e security_invoker = false). Como estas views nascem do
--   role "postgres", que e dono das tabelas de public -- e dono de
--   tabela nao e submetido a RLS -- as views leem tudo. O powerbi_readonly
--   recebe SELECT so nas views, e nunca nas tabelas.
--
--   Consequencia consciente: o isolamento por revenda deixa de ser feito
--   pelo banco e passa a ser responsabilidade do relatorio. Toda view aqui
--   carrega revenda_id justamente para isso. Se um dia o BI for
--   distribuido para lideranca de uma revenda so, use RLS do proprio
--   Power BI (Modelagem > Gerenciar funcoes) filtrando dim_revenda.
--
--   O Advisor do Supabase vai sinalizar estas views como "SECURITY DEFINER
--   view". E esperado e e o desenho pretendido -- elas nao sao expostas
--   pela API e so o usuario de BI as le.
--
-- Convencao de fuso: TODO timestamptz vira data em America/Sao_Paulo
-- antes de virar coluna de data. O servidor grava em UTC; sem isso, tudo
-- que acontece das 21h a meia-noite cai no dia seguinte no relatorio.

-- Por que DROP e nao so CREATE OR REPLACE:
--
--   "create or replace view" do Postgres so aceita ACRESCENTAR coluna no
--   fim. Inserir uma coluna no meio, reordenar ou renomear falha com
--
--     ERROR 42P16: cannot change name of view column "x" to "y"
--
--   ...e como o SQL Editor roda o arquivo inteiro numa transacao so,
--   NADA e aplicado -- inclusive as mudancas que nao tinham problema
--   nenhum. O erro aponta a ultima view do arquivo e nao diz que o
--   verdadeiro motivo foi a ordem das colunas de outra.
--
--   Este esquema so tem views e funcoes. Nao ha dado aqui para perder, e
--   derrubar tudo antes de recriar deixa este arquivo tolerante a
--   qualquer mudanca de coluna, hoje e daqui a um ano.
--
-- CONSEQUENCIA: os GRANTs do powerbi_readonly caem junto.
-- RODE O 02-acesso-powerbi.sql DEPOIS DESTE, SEMPRE.
drop schema if exists bi cascade;

create schema bi;

comment on schema bi is
  'Camada de leitura para Power BI. Views apenas -- nada aqui e escrito pelo app.';

-- ------------------------------------------------------------------
-- 0) FUNCOES DE APOIO
-- ------------------------------------------------------------------

-- profiles.area e texto livre digitado no cadastro ("DISTRIBUIÇÃO
-- URBANA", "APOIO LOGISTICO", "GENTE", cadastro pela metade). Esta e a
-- MESMA traducao que o app faz em src/lib/quiz.ts -- manter as duas
-- iguais e o que impede o BI e a tela de discordarem sobre quem e DU.
-- Quem nao se encaixa devolve null, e nao um chute.
create or replace function bi.area_padrao(p_area text)
returns text
language sql
immutable
as $$
  select case
    when t like '%distribui%' or t = 'du' then 'DU'
    when t like '%armazem%' or t like '%apoio%'
      or t like '%logistic%' or t = 'al' then 'AL'
    else null
  end
  from (
    select translate(
      lower(btrim(coalesce(p_area, ''))),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    ) as t
  ) s;
$$;

create or replace function bi.area_rotulo(p_area text)
returns text
language sql
immutable
as $$
  select case p_area
    when 'DU' then 'Distribuição Urbana'
    when 'AL' then 'Armazém Logístico'
    else 'Sem área definida'
  end;
$$;

-- area_padrao acima responde "esta pessoa disputa a rodada de DU/AL?" --
-- e so isso. Ela devolve null para Gente, Comercial, Administrativo e
-- qualquer outra area, porque para o Quiz elas realmente nao existem.
--
-- Usar aquela resposta como rotulo de area no relatorio foi um erro: a
-- pessoa de Gente aparecia como "Sem area definida" mesmo com cadastro
-- correto. Sao duas perguntas diferentes e agora tem duas funcoes.
--
-- Esta aqui responde "em que area esta pessoa trabalha?", e o fallback e
-- o proprio texto do cadastro com iniciais maiusculas -- nunca null. Area
-- nova cadastrada no app aparece com o nome dela no BI, e nao some num
-- balde de "sem area".
create or replace function bi.area_organizacional(p_area text)
returns text
language sql
immutable
as $$
  select case
    when t = ''                                    then 'Sem área cadastrada'
    when t like '%distribui%' or t = 'du'          then 'Distribuição Urbana'
    when t like '%armazem%'   or t like '%apoio%'
      or t like '%logistic%'  or t = 'al'          then 'Armazém Logístico'
    when t like '%gente%'     or t = 'rh'
      or t like '%recursos human%'                 then 'Gente'
    when t like '%comercial%' or t like '%vendas%' then 'Comercial'
    when t like '%administrat%' or t = 'adm'       then 'Administrativo'
    when t like '%financ%'    or t like '%fiscal%' then 'Financeiro'
    when t like '%frota%'     or t like '%manuten%' then 'Frota'
    when t like '%seguranc%'  or t like '%sesmt%'  then 'Segurança'
    when t like '%ti%' and length(t) <= 3          then 'Tecnologia'
    else initcap(btrim(p_area))
  end
  from (
    select translate(
      lower(btrim(coalesce(p_area, ''))),
      'áàâãäéèêëíìîïóòôõöúùûüç',
      'aaaaaeeeeiiiiooooouuuuc'
    ) as t
  ) s;
$$;

comment on function bi.area_organizacional(text) is
  'Rotulo de area para o relatorio. NAO use para elegibilidade de quiz -- para isso e a area_padrao.';

-- Data local da revenda a partir de um timestamptz.
create or replace function bi.dia_local(p_ts timestamptz)
returns date
language sql
immutable
as $$
  select (p_ts at time zone 'America/Sao_Paulo')::date;
$$;

-- ------------------------------------------------------------------
-- 1) DIMENSOES
-- ------------------------------------------------------------------

create or replace view bi.dim_revenda as
select
  r.id            as revenda_id,
  r.slug,
  r.nome          as revenda,
  r.ativa,
  r.ordem,
  r.criado_em
from public.revendas r;

comment on view bi.dim_revenda is
  'Uma linha por revenda. Filtro global do relatorio inteiro.';

-- Grao: colaborador x revenda. E N:N de proposito -- a lideranca que
-- responde por Sao Felix e Barreiras aparece duas vezes, e e assim que
-- ela precisa aparecer quando o relatorio esta filtrado por uma delas.
--
-- CPF fica DE FORA de proposito: e dado pessoal sensivel, nao serve a
-- nenhum indicador, e uma vez importado no .pbix ele viaja em anexo de
-- e-mail junto com o relatorio. Se algum dia precisar casar com uma base
-- externa, use a matricula.
create or replace view bi.dim_colaborador as
select
  cr.colaborador_id,
  cr.revenda_id,
  cr.principal                        as revenda_principal,
  p.nome                              as colaborador,
  p.matricula,
  coalesce(nullif(btrim(p.cargo), ''), 'Sem cargo')   as cargo,
  p.area                              as area_cadastro,
  -- "area" continua sendo DU/AL/null: e a chave que casa com a area das
  -- rodadas de quiz. "area_rotulo" e o que o relatorio mostra, e cobre a
  -- empresa inteira.
  bi.area_padrao(p.area)              as area,
  bi.area_organizacional(p.area)      as area_rotulo,
  p.role                              as papel,
  case p.role
    when 'owner'      then 'Dono'
    when 'lideranca'  then 'Liderança'
    else 'Colaborador'
  end                                 as papel_rotulo,
  (p.role in ('owner', 'lideranca'))  as eh_gestao,
  bi.dia_local(p.created_at)          as data_cadastro
from public.colaborador_revendas cr
join public.profiles p on p.id = cr.colaborador_id;

comment on view bi.dim_colaborador is
  'Colaborador x revenda. Sem CPF por decisao de privacidade -- use matricula.';

-- Calendario. Comeca no 1o de janeiro do ano do dado mais antigo do app
-- e vai ate o fim do ano corrente, para o eixo de tempo nao "terminar"
-- no meio de um grafico de evolucao.
create or replace view bi.dim_calendario as
with limite as (
  select date_trunc('year', least(
    coalesce((select min(data) from public.ag_contagens), current_date),
    coalesce((select min(data) from public.comunicados), current_date),
    coalesce((select min(bi.dia_local(criado_em)) from public.feedback_rota), current_date)
  ))::date as inicio
),
dias as (
  select generate_series(
    (select inicio from limite),
    (date_trunc('year', current_date) + interval '1 year - 1 day')::date,
    interval '1 day'
  )::date as data
)
select
  d.data,
  extract(year  from d.data)::int  as ano,
  extract(month from d.data)::int  as mes,
  (array['jan','fev','mar','abr','mai','jun',
         'jul','ago','set','out','nov','dez'])[extract(month from d.data)::int] as mes_abrev,
  (array['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
         'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'])[extract(month from d.data)::int] as mes_nome,
  to_char(d.data, 'YYYY-MM')       as ano_mes,
  (array['jan','fev','mar','abr','mai','jun',
         'jul','ago','set','out','nov','dez'])[extract(month from d.data)::int]
    || '/' || to_char(d.data, 'YY') as mes_rotulo,
  'T' || extract(quarter from d.data)::int as trimestre,
  extract(week from d.data)::int   as semana_iso,
  to_char(d.data, 'IYYY-"S"IW')    as ano_semana,
  date_trunc('week', d.data)::date as inicio_semana,
  date_trunc('month', d.data)::date as inicio_mes,
  extract(isodow from d.data)::int as dia_semana,
  (array['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'])[extract(isodow from d.data)::int] as dia_semana_nome,
  (extract(isodow from d.data) >= 6) as fim_de_semana,
  (d.data <= current_date)         as ja_aconteceu,
  -- Rotulo curto de dia, para eixo de grafico diario.
  --
  -- Existe por um motivo especifico: num eixo com a data inteira
  -- ("01/08/2026", 10 caracteres) o Power BI nao consegue desenhar todos
  -- os rotulos e passa a PULAR dias -- o grafico mostra 03, 06, 09 e
  -- quem le acha que nos dias do meio nao houve nada. Com dois
  -- caracteres cabem os 31 dias do mes.
  --
  -- dia_rotulo e TEXTO e por isso ordenaria em ordem alfabetica; a
  -- coluna dia existe para ser o sortByColumn dele no modelo. Nao use
  -- dia_rotulo em recorte de mais de um mes: "01" de agosto e "01" de
  -- setembro sao a mesma categoria.
  extract(day from d.data)::int    as dia,
  to_char(d.data, 'DD')            as dia_rotulo,
  -- Semana COMECANDO NO DOMINGO, para o calendario do plano de
  -- comunicacao.
  --
  -- inicio_semana e dia_semana logo acima sao ISO: a semana comeca na
  -- segunda. Isso e o certo para indicador de operacao -- semana util e
  -- de segunda a sexta --, e errado para calendario: a tela de
  -- /admin/comunicados/calendario monta a grade com domingo na primeira
  -- coluna, como qualquer calendario de parede, e uma grade que comeca
  -- na segunda nao e reconhecida como calendario por quem olha.
  --
  -- As tres convivem com as ISO de proposito, em vez de substitui-las:
  -- trocar dia_semana por versao domingo-primeiro mudaria a conta de
  -- fim_de_semana e de dias uteis, e o AG mede meta em cima disso.
  (extract(dow from d.data) + 1)::int as dia_semana_dom,
  (array['dom','seg','ter','qua','qui','sex','sáb'])[extract(dow from d.data)::int + 1] as dia_semana_abrev,
  (d.data - extract(dow from d.data)::int)::date as semana_dom
from dias d;

comment on view bi.dim_calendario is
  'Tabela de datas em pt-BR. Marque como Tabela de Datas no Power BI e ligue em todas as colunas "data".';

-- O menu do app, do jeito que o colaborador ve no celular. Serve de
-- indice do relatorio: quem abre o BI reconhece a pagina pelo mesmo
-- emoji e pelo mesmo nome que ve na tela.
--
-- Vem da tabela, e nao de uma lista escrita a mao no Power BI, porque o
-- menu e editavel pelo admin (src/components/MenuItemRow.tsx). Lista
-- fixa aqui descolaria do app no primeiro item novo.
-- >>> TROQUE PELO DOMINIO DE PRODUCAO DO APP <<<
-- Nao encontrei o dominio em lugar nenhum do repositorio, entao nao
-- chutei um: enquanto este valor estiver como esta, a coluna "link" sai
-- nula e a pagina do BI mostra so o caminho. Link errado num relatorio e
-- pior que link nenhum -- quem clica e cai em 404 desconfia do resto.
create or replace function bi.url_app()
returns text
language sql
immutable
as $$ select null::text $$;   -- ex.: select 'https://appdocolaborador.vercel.app'

create or replace view bi.dim_menu_app as
select
  m.chave,
  m.emoji,
  m.titulo,
  m.emoji || ' ' || m.titulo   as item,
  m.href                       as caminho,
  case when bi.url_app() is not null
       then bi.url_app() || m.href
  end                          as link,
  m.ordem,
  m.visivel,
  case when m.visivel then 'No ar' else 'Oculto' end as situacao
from public.menu_itens m;

comment on view bi.dim_menu_app is
  'Menu do app como indice do relatorio. Defina bi.url_app() para os links funcionarem.';

-- ==================================================================
-- 2) ATIVO DE GIRO (AG)
-- ==================================================================

-- O grao e a LINHA de contagem: uma pessoa, num dia, contando uma
-- combinacao tipo+formato+status.
--
-- total_caixas e a conversao que o app faz em src/lib/ativo-giro.ts
-- (totalEmCaixas). Fica aqui, e nao em DAX, porque o fator vem de
-- ag_fatores e e por REVENDA -- reescrever isso em medida seria
-- reimplementar a regra de negocio num lugar onde ninguem vai lembrar
-- de atualizar quando o palete de 600ml mudar de 42 para outra coisa.
--
-- fator_ausente existe porque o LEFT JOIN sem fator produziria
-- total_caixas contando so as caixas soltas -- um numero plausivel e
-- errado. Melhor ele aparecer como sinalizador no relatorio.
create or replace view bi.fato_ag_contagem as
select
  c.id                                    as contagem_id,
  c.revenda_id,
  c.data,
  c.colaborador_id,
  c.colaborador_nome,
  c.tipo,
  c.formato,
  c.status,
  (c.status like 'Trânsito%')             as em_transito,
  c.palete,
  c.lastro,
  c.caixa,
  c.palete * coalesce(f.palete, 0)
    + c.lastro * coalesce(f.lastro, 0)
    + c.caixa                             as total_caixas,
  case when coalesce(f.palete, 0) > 0 then
    round((c.palete * f.palete + c.lastro * f.lastro + c.caixa)::numeric
          / f.palete, 2)
  end                                     as paletes_equivalentes,
  -- O fator sai cru tambem porque o painel do app divide o total JA
  -- SOMADO do formato pelo fator (paletesEquivalentes em
  -- src/lib/ativo-giro.ts), e nao soma o equivalente de cada linha.
  -- Matematicamente da no mesmo, mas o arredondamento nao: somar 40
  -- linhas arredondadas a 2 casas afasta o BI da tela. Com o fator
  -- disponivel, o DAX reproduz a conta do app exatamente.
  f.palete                                as fator_palete,
  f.lastro                                as fator_lastro,
  (f.formato is null)                     as fator_ausente,
  c.recontagem_id,
  (c.recontagem_id is not null)           as eh_recontagem,
  c.criado_em,
  bi.dia_local(c.criado_em)               as data_lancamento,
  -- Quantos dias depois do dia contado a linha foi digitada. 0 = no dia.
  -- E o indicador de disciplina do processo, nao de volume.
  (bi.dia_local(c.criado_em) - c.data)    as atraso_dias,
  (bi.dia_local(c.criado_em) = c.data)    as lancado_no_dia
from public.ag_contagens c
left join public.ag_fatores f
  on f.revenda_id = c.revenda_id
 and f.formato    = c.formato;

comment on view bi.fato_ag_contagem is
  'Grao: uma linha de contagem. total_caixas ja convertido pelos fatores da revenda.';

-- Um resumo por dia x pessoa. E a base dos indicadores de PARTICIPACAO
-- do modulo (quantos contaram hoje, quantos dias cada um contou no mes)
-- sem obrigar o DAX a fazer DISTINCTCOUNT sobre a tabela grande.
create or replace view bi.fato_ag_dia_colaborador as
select
  c.revenda_id,
  c.data,
  c.colaborador_id,
  max(c.colaborador_nome)                          as colaborador,
  count(*)                                         as lancamentos,
  count(*) filter (where c.eh_recontagem)          as lancamentos_recontagem,
  sum(c.total_caixas)                              as total_caixas,
  count(distinct c.formato)                        as formatos_contados,
  min(c.criado_em)                                 as primeiro_lancamento,
  max(c.criado_em)                                 as ultimo_lancamento,
  bool_and(c.lancado_no_dia)                       as tudo_no_dia
from bi.fato_ag_contagem c
group by c.revenda_id, c.data, c.colaborador_id;

-- Conciliacao: o contado do dia contra o saldo oficial do parque.
--
-- ATENCAO, e a maior limitacao do modelo hoje: ag_parque guarda UM saldo
-- por revenda/tipo/formato, sobrescrito a cada ajuste. Nao existe
-- historico. Entao a diferenca calculada aqui so e verdadeira para o dia
-- em que o parque foi atualizado pela ultima vez -- para os dias
-- anteriores ela compara o passado com o saldo de hoje.
--
-- A coluna parque_confiavel marca essa fronteira. Use-a como filtro em
-- qualquer visual de divergencia; sem ela o grafico de "evolucao das
-- divergencias" desenha uma serie que nunca existiu.
--
-- O arquivo 03-opcional-historico-parque-ag.sql resolve isso de vez.
create or replace view bi.fato_ag_conciliacao as
with contado as (
  select
    c.revenda_id,
    c.data,
    c.tipo,
    c.formato,
    sum(c.total_caixas)        as contado,
    count(*)                   as linhas,
    count(distinct c.colaborador_id) as contadores
  from bi.fato_ag_contagem c
  group by c.revenda_id, c.data, c.tipo, c.formato
)
select
  ct.revenda_id,
  ct.data,
  ct.tipo,
  ct.formato,
  ct.tipo || ' · ' || ct.formato          as item,
  ct.contado,
  ct.linhas,
  ct.contadores,
  coalesce(p.quantidade, 0)               as parque,
  ct.contado - coalesce(p.quantidade, 0)  as diferenca,
  abs(ct.contado - coalesce(p.quantidade, 0)) as diferenca_abs,
  case when coalesce(p.quantidade, 0) > 0 then
    round((ct.contado - p.quantidade)::numeric / p.quantidade, 4)
  end                                     as diferenca_pct,
  case
    when p.quantidade is null                              then 'Sem parque cadastrado'
    when ct.contado = p.quantidade                         then 'Bateu'
    when ct.contado > p.quantidade                         then 'Sobra'
    else                                                        'Falta'
  end                                     as resultado,
  p.atualizado_em                         as parque_atualizado_em,
  (ct.data = bi.dia_local(p.atualizado_em)) as parque_confiavel
from contado ct
left join public.ag_parque p
  on p.revenda_id = ct.revenda_id
 and p.tipo       = ct.tipo
 and p.formato    = ct.formato;

comment on view bi.fato_ag_conciliacao is
  'Contado x parque por dia/tipo/formato. Filtre parque_confiavel = true para divergencia real -- ag_parque nao tem historico.';

create or replace view bi.fato_ag_recontagem as
select
  r.id                    as recontagem_id,
  r.revenda_id,
  r.dia,
  r.descricao,
  r.solicitado_por,
  r.solicitado_nome,
  r.criado_em,
  bi.dia_local(r.criado_em) as data_solicitacao,
  r.atendida_em,
  r.atendida_por,
  r.atendida_contagem_id,
  r.cancelada_em,
  case
    when r.cancelada_em is not null then 'Cancelada'
    when r.atendida_em  is not null then 'Atendida'
    else 'Pendente'
  end                     as situacao,
  round(extract(epoch from (r.atendida_em - r.criado_em)) / 3600.0, 1)
                          as horas_para_atender,
  case when r.atendida_em is null and r.cancelada_em is null then
    round(extract(epoch from (now() - r.criado_em)) / 3600.0, 1)
  end                     as horas_em_aberto
from public.ag_recontagens r;

-- ==================================================================
-- 3) FEEDBACK DE ROTA
-- ==================================================================

-- A escala e 0..3 (Ruim, Regular, Boa, Ótima). Guardo tres leituras da
-- mesma nota de proposito:
--   nota            -> para media na escala original, que e como o time fala
--   nota_percentual -> nota/3, para o cartao de KPI em % e para comparar
--                      com a Pesquisa de Satisfacao, que e 1..5
--   nota_ruim       -> o corte que o proprio app usa (<= 1 exige comentario)
create or replace view bi.fato_feedback_rota as
select
  f.id                                as feedback_id,
  f.revenda_id,
  f.colaborador_id,
  p.nome                              as colaborador,
  bi.area_padrao(p.area)              as area,
  bi.area_organizacional(p.area)      as area_rotulo,
  coalesce(nullif(btrim(p.cargo), ''), 'Sem cargo') as cargo,
  coalesce(nullif(btrim(f.rota), ''), 'Sem rota informada') as rota,
  f.nota,
  case f.nota
    when 0 then 'Ruim'
    when 1 then 'Regular'
    when 2 then 'Boa'
    when 3 then 'Ótima'
  end                                 as nota_rotulo,
  round(f.nota::numeric / 3, 4)       as nota_percentual,
  (f.nota <= 1)                       as nota_ruim,
  (f.nota = 3)                        as nota_otima,
  coalesce(cardinality(f.ocorrencias), 0) as qtd_ocorrencias,
  (coalesce(cardinality(f.ocorrencias), 0) = 0) as sem_ocorrencia,
  nullif(btrim(coalesce(f.comentario, '')), '') as comentario,
  (nullif(btrim(coalesce(f.comentario, '')), '') is not null) as tem_comentario,
  length(coalesce(btrim(f.comentario), ''))     as tamanho_comentario,
  f.criado_em,
  bi.dia_local(f.criado_em)           as data,
  extract(hour from (f.criado_em at time zone 'America/Sao_Paulo'))::int as hora,
  -- Existe analise de 5 Porques amarrada a este feedback?
  exists (
    select 1 from public.cinco_porques_analises a
     where a.feedback_rota_id = f.id
  )                                   as tem_cinco_porques,
  -- O ciclo fechado, na mesma linha da reclamacao: causa raiz, o que a
  -- lideranca respondeu e se o colaborador aceitou.
  --
  -- Colunas no FIM da lista de proposito: "create or replace view" do
  -- Postgres aceita acrescentar coluna no fim, e recusa no meio com
  -- 42P16. Assim esta view sozinha pode ser recriada sem derrubar o
  -- esquema inteiro -- e sem perder os GRANTs do powerbi_readonly.
  --
  -- LATERAL com limit 1, e nao join simples: se um feedback tivesse duas
  -- analises, o join duplicaria a linha e [Feedbacks] passaria a contar
  -- errado. Fica a mais recente, que e a que vale.
  a.causa_raiz                        as cp_causa_raiz,
  a.resposta_lideranca                as cp_devolutiva,
  case a.motorista_aceitou
    when true  then 'Aceitou'
    when false then 'Não aceitou'
    else case when a.id is null then 'Sem análise' else 'Não respondeu' end
  end                                 as cp_aceite_rotulo,
  a.motorista_aceitou                 as cp_aceitou,
  a.resposta_lideranca_em             as cp_devolutiva_em,
  -- Tratativa da lideranca sobre o proprio feedback "Regular" -- nao tem
  -- relacao com o 5 Porques (colunas cp_* acima), que so existe para
  -- feedback "Ruim". reg_conta_tmr comeca false nos feedbacks antigos,
  -- reabertos em massa quando a tratativa de "Regular" foi lancada (ver
  -- migration 056): sem essa marca, o TMR contaria como demora da
  -- lideranca um atraso que era, na verdade, a funcionalidade nao existir
  -- ainda. reg_horas_ate_resposta so calcula quando reg_conta_tmr e
  -- verdadeiro, pelo mesmo motivo.
  f.tratativa_status                  as reg_tratativa_status,
  (f.tratativa_status = 'concluida')  as reg_tratada,
  f.resposta_lideranca                as reg_devolutiva,
  (f.resposta_lideranca is not null)  as reg_respondida_lideranca,
  f.resposta_lideranca_em             as reg_devolutiva_em,
  f.colaborador_aceitou               as reg_aceitou,
  case f.colaborador_aceitou
    when true  then 'Aceitou'
    when false then 'Não aceitou'
    else case when f.resposta_lideranca is null then 'Sem resposta' else 'Não respondeu' end
  end                                  as reg_aceite_rotulo,
  f.conta_tmr                         as reg_conta_tmr,
  case when f.conta_tmr and f.resposta_lideranca_em is not null then
    round(extract(epoch from (f.resposta_lideranca_em - f.criado_em)) / 3600.0, 1)
  end                                  as reg_horas_ate_resposta
from public.feedback_rota f
left join public.profiles p on p.id = f.colaborador_id
left join lateral (
  select a2.id, a2.causa_raiz, a2.resposta_lideranca, a2.motorista_aceitou,
         a2.resposta_lideranca_em
    from public.cinco_porques_analises a2
   where a2.feedback_rota_id = f.id
   order by a2.iniciada_em desc
   limit 1
) a on true;

comment on view bi.fato_feedback_rota is
  'Grao: um feedback. Uma linha por envio, com a nota em tres leituras.';

-- Catalogo dos codigos de ocorrencia. Espelha src/lib/feedback-ocorrencias.ts.
-- Fica como VALUES, e nao como tabela, porque a lista mora no codigo do
-- app: se ela mudar la, muda aqui, e o desencontro aparece na hora
-- (ocorrencia nova cai em "Não catalogada" no relatorio).
create or replace view bi.dim_ocorrencia_rota as
select * from (values
  ('cliente_fechado',     'Cliente fechado',            'Cliente'),
  ('devolucao',           'Devolução / recusa',         'Cliente'),
  ('falta_produto',       'Falta de produto',           'Estoque'),
  ('carga_errada',        'Carga errada',               'Armazém'),
  ('veiculo',             'Problema no veículo',        'Frota'),
  ('transito',            'Trânsito / via bloqueada',   'Externo'),
  ('atraso_carregamento', 'Atraso no carregamento',     'Armazém'),
  ('acesso_descarga',     'Dificuldade de descarga',    'Cliente'),
  ('pagamento',           'Problema no pagamento',      'Cliente'),
  ('seguranca',           'Risco de segurança',         'Segurança')
) as t(ocorrencia_id, ocorrencia, grupo);

-- Grao: feedback x ocorrencia. Um feedback com 3 ocorrencias vira 3
-- linhas -- por isso NUNCA some "feedbacks" aqui: conte feedback_id
-- distinto, ou use bi.fato_feedback_rota.
create or replace view bi.fato_feedback_ocorrencia as
select
  f.id                        as feedback_id,
  f.revenda_id,
  f.colaborador_id,
  coalesce(nullif(btrim(f.rota), ''), 'Sem rota informada') as rota,
  f.nota,
  bi.dia_local(f.criado_em)   as data,
  o.ocorrencia_id,
  coalesce(d.ocorrencia, o.ocorrencia_id || ' (não catalogada)') as ocorrencia,
  coalesce(d.grupo, 'Não catalogada') as grupo
from public.feedback_rota f
cross join lateral unnest(f.ocorrencias) as o(ocorrencia_id)
left join bi.dim_ocorrencia_rota d on d.ocorrencia_id = o.ocorrencia_id;

comment on view bi.fato_feedback_ocorrencia is
  'Grao: feedback x ocorrencia (explodido). Conte DISTINCT feedback_id, nunca linhas.';

-- ------------------------------------------------------------------
-- O feedback cruzado com o relatorio de rotas -> CIDADE
-- ------------------------------------------------------------------
--
-- Por que isto existe: "rota mais critica" nao decide nada. O numero do
-- mapa muda todo dia -- a rota 14768 de ontem nao e a rota 14768 do mes
-- que vem --, entao apontar um mapa como "o pior" nao diz onde agir. A
-- CIDADE, sim: ela se repete, e "as notas caem toda vez que o mapa passa
-- por Barreiras" e uma frase sobre a qual da para tomar decisao.
--
-- O cruzamento e possivel porque as duas pontas ja existem no banco:
--   feedback_rota.rota  -> o motorista digita o numero do mapa (so
--                          digitos: o app faz replace(/\D/g,'') antes de
--                          gravar -- ver src/app/feedback-rota/actions.ts)
--   rotas.mapa          -> a planilha do roteirizador importada em
--                          /admin/rotas, sem zeros a esquerda, com as
--                          cidades daquele mapa em rotas.cidades (jsonb)
--
-- A funcao abaixo poe os dois no mesmo formato. E o equivalente SQL de
-- normalizarMapa() em src/lib/rotas.ts -- se a regra mudar la, mude aqui.
create or replace function bi.mapa_normalizado(bruto text)
returns text
language sql
immutable
as $$
  select nullif(
    coalesce(
      nullif(ltrim(regexp_replace(coalesce(bruto, ''), '\D', '', 'g'), '0'), ''),
      regexp_replace(coalesce(bruto, ''), '\D', '', 'g')
    ),
    ''
  )
$$;

-- Grao: feedback x cidade. Um feedback de um mapa que passa por tres
-- cidades vira TRES linhas -- por isso [Feedbacks por cidade] conta
-- feedback_id distinto, nunca linhas.
--
-- LEFT JOIN nas duas pontas de proposito. Feedback cujo mapa nao foi
-- encontrado (roteirizacao ainda nao importada, numero digitado errado)
-- continua aparecendo, com cidade 'Rota nao localizada' e
-- rota_localizada = false. Descartar essas linhas em silencio faria a
-- cobertura do cruzamento parecer 100% quando nao e.
--
-- O mapa se repete em datas diferentes (a chave de public.rotas e
-- revenda+data+mapa), entao pega-se a roteirizacao mais recente ATE o
-- dia do feedback: e a que estava valendo quando o motorista saiu.
create or replace view bi.fato_feedback_cidade as
select
  f.id                                as feedback_id,
  f.revenda_id,
  f.colaborador_id,
  bi.dia_local(f.criado_em)           as data,
  coalesce(nullif(btrim(f.rota), ''), 'Sem rota informada') as rota,
  f.nota,
  (f.nota <= 1)                       as nota_ruim,
  coalesce(
    nullif(btrim(c.item ->> 'cidade'), ''),
    'Rota não localizada'
  )                                   as cidade,
  coalesce((c.item ->> 'entregas')::int, 0) as entregas,
  (r.mapa is not null)                as rota_localizada,
  r.data                              as data_roteirizacao
from public.feedback_rota f
left join lateral (
  select r2.mapa, r2.cidades, r2.data, r2.revenda_id
    from public.rotas r2
   where r2.revenda_id = f.revenda_id
     and r2.mapa = bi.mapa_normalizado(f.rota)
     and r2.data <= bi.dia_local(f.criado_em)
   order by r2.data desc
   limit 1
) r on true
left join lateral jsonb_array_elements(
  case when jsonb_typeof(r.cidades) = 'array' then r.cidades else '[]'::jsonb end
) as c(item) on true;

comment on view bi.fato_feedback_cidade is
  'Grao: feedback x cidade da rota. Conte DISTINCT feedback_id, nunca linhas.';

-- ==================================================================
-- 4) 5 PORQUES
-- ==================================================================

-- Dois ciclos de vida convivem nesta tabela e o relatorio precisa
-- separa-los, senao "concluida" fica ambiguo:
--   status            -> o motorista terminou a analise
--   tratativa_status  -> a lideranca respondeu e fechou
--   motorista_aceitou -> o motorista aceitou o retorno da lideranca
-- Sao tres perguntas diferentes, e o funil do modulo e exatamente elas
-- em sequencia.
create or replace view bi.fato_cinco_porques as
select
  a.id                        as analise_id,
  a.revenda_id,
  a.colaborador_id,
  a.colaborador_nome          as colaborador,
  a.feedback_rota_id,
  coalesce(nullif(btrim(a.rota), ''), 'Sem rota informada') as rota,
  a.problema_id,
  a.problema_label            as problema,
  a.profundidade,
  (a.profundidade >= 5)       as chegou_ao_quinto,
  a.causa_raiz,
  coalesce(a.categoria, 'sem_categoria') as categoria_id,
  case coalesce(a.categoria, 'sem_categoria')
    when 'pessoas'      then 'Pessoas'
    when 'processo'     then 'Processo'
    when 'rota'         then 'Rota'
    when 'cliente'      then 'Cliente'
    when 'veiculo'      then 'Veículo'
    when 'pedido'       then 'Pedido'
    when 'sistema'      then 'Sistema'
    when 'estoque'      then 'Estoque'
    when 'comunicacao'  then 'Comunicação'
    when 'externo'      then 'Externo'
    when 'outro'        then 'Outro'
    else 'Sem categoria'
  end                         as categoria,
  a.acao_sugerida,
  a.status,
  (a.status = 'concluida')    as concluida,
  a.tratativa_status,
  (a.tratativa_status = 'concluida') as tratada,
  a.resposta_lideranca,
  (a.resposta_lideranca is not null) as respondida_lideranca,
  a.resposta_lideranca_em,
  a.motorista_aceitou,
  case a.motorista_aceitou
    when true  then 'Aceitou'
    when false then 'Não aceitou'
    else 'Não respondeu'
  end                         as aceite_rotulo,
  a.motorista_aceitou_em,
  round(a.tempo_ms / 1000.0, 0) as tempo_segundos,
  a.iniciada_em,
  a.concluida_em,
  bi.dia_local(a.iniciada_em) as data,
  jsonb_array_length(a.respostas) as porques_respondidos,
  -- Quanto tempo a lideranca levou para responder a analise concluida.
  -- E o SLA do modulo: analise que fica semanas sem resposta ensina o
  -- time a nao preencher a proxima.
  round(extract(epoch from (a.resposta_lideranca_em - a.concluida_em)) / 3600.0, 1)
                              as horas_ate_resposta,
  case when a.status = 'concluida' and a.tratativa_status = 'pendente' then
    round(extract(epoch from (now() - a.concluida_em)) / 3600.0, 1)
  end                         as horas_aguardando
from public.cinco_porques_analises a;

comment on view bi.fato_cinco_porques is
  'Grao: uma analise. Tres status distintos: do motorista, da lideranca e do aceite.';

-- Grao: analise x "porque" respondido. E o que permite ler a cadeia
-- causal inteira numa matriz (nivel 1 -> nivel 5) em vez de so a causa
-- raiz final.
create or replace view bi.fato_cinco_porques_resposta as
select
  a.id                          as analise_id,
  a.revenda_id,
  a.problema_label              as problema,
  bi.dia_local(a.iniciada_em)   as data,
  r.ord::int                    as ordem,
  coalesce((r.item ->> 'nivel')::int, r.ord::int) as nivel,
  'Porquê ' || coalesce((r.item ->> 'nivel')::int, r.ord::int) as nivel_rotulo,
  r.item ->> 'pergunta'         as pergunta,
  r.item ->> 'opcaoId'          as opcao_id,
  r.item ->> 'opcaoLabel'       as resposta,
  r.item ->> 'textoLivre'       as texto_livre,
  (nullif(btrim(coalesce(r.item ->> 'textoLivre', '')), '') is not null) as escreveu_livre
from public.cinco_porques_analises a
cross join lateral jsonb_array_elements(a.respostas)
  with ordinality as r(item, ord);

comment on view bi.fato_cinco_porques_resposta is
  'Grao: analise x porque. Alimenta a matriz problema -> causa -> acao.';

-- Problema x causa x acao, ja agrupado. E o quadro que a gestao le:
-- "este problema, por esta causa, tantas vezes -- e o que fazemos".
create or replace view bi.fato_cinco_porques_matriz as
select
  a.revenda_id,
  a.problema_label            as problema,
  case coalesce(a.categoria, 'sem_categoria')
    when 'pessoas'      then 'Pessoas'      when 'processo'    then 'Processo'
    when 'rota'         then 'Rota'         when 'cliente'     then 'Cliente'
    when 'veiculo'      then 'Veículo'      when 'pedido'      then 'Pedido'
    when 'sistema'      then 'Sistema'      when 'estoque'     then 'Estoque'
    when 'comunicacao'  then 'Comunicação'  when 'externo'     then 'Externo'
    when 'outro'        then 'Outro'        else 'Sem categoria'
  end                         as categoria,
  a.causa_raiz,
  a.acao_sugerida,
  count(*)                                            as ocorrencias,
  count(distinct a.colaborador_id)                    as colaboradores,
  count(distinct a.rota)                              as rotas,
  count(*) filter (where a.tratativa_status = 'concluida') as tratadas,
  min(bi.dia_local(a.iniciada_em))                    as primeira_vez,
  max(bi.dia_local(a.iniciada_em))                    as ultima_vez,
  -- A TRATATIVA DO ANALISTA, na mesma linha da pauta.
  --
  -- Sem ela a tabela leva a reuniao ate "este problema, por esta causa,
  -- tantas vezes" e para -- e a primeira pergunta que alguem faz e "e o
  -- que a lideranca respondeu?". A resposta existia, mas so na pagina de
  -- Feedback da Rota, uma linha por feedback: quem estava lendo a pauta
  -- tinha de trocar de pagina e cruzar a mao.
  --
  -- Vale a MAIS RECENTE do grupo, e nao um string_agg de todas: numa
  -- linha de tabela cabe uma frase, e a devolutiva que interessa na
  -- reuniao e a ultima que a lideranca deu para aquele problema. O
  -- historico completo continua em bi.fato_cinco_porques, uma linha por
  -- analise.
  (array_remove(
     array_agg(
       nullif(btrim(coalesce(a.resposta_lideranca, '')), '')
       order by a.resposta_lideranca_em desc nulls last, a.iniciada_em desc
     ),
     null
   ))[1]                                              as tratativa,
  count(*) filter (where a.resposta_lideranca is not null) as com_tratativa
from public.cinco_porques_analises a
where a.status = 'concluida'
group by 1, 2, 3, 4, 5;

-- ==================================================================
-- 5) PLANO DE COMUNICACAO (COMUNICADOS)
-- ==================================================================

-- Sobre "alcance/visualizacoes", e preciso ser honesto no relatorio:
-- o app NAO registra abertura de comunicado. Nao ha rota /comunicados/[id]
-- e nao ha tabela de leitura. O que existe sao dois sinais indiretos:
--
--   curtidas  -> comunicado_curtidas. Engajamento explicito, e o mais
--                confiavel dos dois, mas mede quem gostou, nao quem leu.
--   vistas/cliques -> notificacao_estado, casado por notificacoes.
--                referencia_id. Cobre so quem recebeu o aviso no sino E
--                interagiu -- a tabela so ganha linha de quem interagiu,
--                por desenho. E piso, nunca total.
--
-- Por isso as colunas se chamam curtidas/avisos_vistos/avisos_clicados, e
-- nao "visualizacoes". Nomear direito aqui evita a reuniao em que alguem
-- conclui que 12% do time le o jornal.

-- ------------------------------------------------------------------
-- EDITORIAS -- o nome e o emoji que o colaborador ve no jornal
-- ------------------------------------------------------------------
--
-- comunicados.categoria guarda a CHAVE ('seguranca', 'saude'), e o
-- rotulo mora em comunicado_editorias, POR REVENDA -- cada uma pode
-- renomear e trocar o emoji das suas (ver src/lib/editorias.ts).
-- initcap na chave, que era o que o BI fazia, devolvia "Seguranca" sem
-- cedilha e "Saude" onde a tela do celular diz "Saude e Bem-estar". O
-- BI e o app discordavam no nome da propria editoria.
--
-- Duas funcoes e nao um join porque as duas views que precisam disso ja
-- tem lateral demais, e porque a agenda e um UNION ALL: o mesmo join
-- teria de ser repetido nos dois lados, e um dia alguem mudaria so um.
--
-- Ficam ANTES das views que as usam: view em Postgres exige que a
-- funcao exista na hora da criacao, e este arquivo roda de cima para
-- baixo depois de um drop schema.
--
-- AS FUNCOES LEEM bi.dim_editoria, E NAO public.comunicado_editorias.
--
-- Isso nao e preciosismo -- a primeira versao lia a tabela direto e
-- derrubou a atualizacao inteira do Power BI:
--
--   PostgreSQL 42501: permission denied for table comunicado_editorias
--
-- O motivo e uma diferenca que o resto deste arquivo esconde bem: view
-- roda com os privilegios do DONO, mas corpo de funcao roda com os
-- privilegios de QUEM CHAMA. bi.fato_comunicado e do postgres e le
-- public.comunicados sem problema; quando ela chama a funcao, o corpo
-- passa a ser verificado contra o powerbi_readonly, que nao tem -- e
-- nao deve ter -- acesso a tabela nenhuma de public.
--
-- A saida NAO e SECURITY DEFINER. Seria mais curto e criaria uma
-- segunda porta de entrada para public, fora do desenho de "so views
-- do esquema bi leem as tabelas do app". bi.dim_editoria e essa view:
-- o powerbi_readonly ja tem SELECT nela, e a funcao volta a funcionar
-- com privilegio comum.
create or replace view bi.dim_editoria as
select
  e.revenda_id,
  e.id                        as editoria_id,
  e.rotulo                    as editoria,
  e.emoji,
  e.emoji || ' ' || e.rotulo  as etiqueta,
  e.cor,
  e.ordem,
  e.ativa
from public.comunicado_editorias e;

comment on view bi.dim_editoria is
  'Editorias do jornal, por revenda. Rotulo e emoji como o colaborador ve no celular.';

-- coalesce para a chave capitalizada: editoria de comunicado antigo que
-- tenha sido apagada do cadastro continua legivel em vez de sair vazia.
-- Perder a etiqueta e pior que mostrar a chave.
create or replace function bi.editoria_rotulo(p_revenda uuid, p_chave text)
returns text
language sql
stable
as $$
  select coalesce(
    (select e.editoria
       from bi.dim_editoria e
      where e.revenda_id = p_revenda and e.editoria_id = p_chave
      limit 1),
    initcap(coalesce(p_chave, 'Geral'))
  )
$$;

-- "🦺 Segurança" -- o emoji e o rotulo juntos, que e como a etiqueta
-- aparece na tela do celular.
create or replace function bi.editoria_etiqueta(p_revenda uuid, p_chave text)
returns text
language sql
stable
as $$
  select coalesce(
    (select e.etiqueta
       from bi.dim_editoria e
      where e.revenda_id = p_revenda and e.editoria_id = p_chave
      limit 1),
    '📰 ' || initcap(coalesce(p_chave, 'Geral'))
  )
$$;

create or replace view bi.fato_comunicado as
select
  c.id                        as comunicado_id,
  c.revenda_id,
  c.titulo,
  c.resumo,
  c.categoria                 as categoria_id,
  -- O rotulo da revenda, e nao initcap da chave: e o mesmo nome que o
  -- colaborador ve na barra de editorias do jornal.
  bi.editoria_rotulo(c.revenda_id, c.categoria) as categoria,
  coalesce(nullif(btrim(c.autor), ''), 'Sem autor') as autor,
  c.destaque,
  (c.imagem_url is not null)  as tem_imagem,
  length(c.texto)             as tamanho_texto,
  ceil(length(c.texto) / 1000.0)::int as minutos_leitura_estimados,
  c.data,
  c.criado_em,
  c.lembrete_em,
  (c.lembrete_em is not null) as tem_lembrete,
  c.lembrete_enviado_em,
  (c.lembrete_em is not null and c.lembrete_enviado_em is not null) as lembrete_disparado,
  coalesce(k.curtidas, 0)     as curtidas,
  coalesce(n.vistos, 0)       as avisos_vistos,
  coalesce(n.clicados, 0)     as avisos_clicados,
  pub.publico,
  case when pub.publico > 0 then
    round(coalesce(k.curtidas, 0)::numeric / pub.publico, 4)
  end                         as taxa_curtida,
  case when pub.publico > 0 then
    round(coalesce(n.clicados, 0)::numeric / pub.publico, 4)
  end                         as taxa_clique
from public.comunicados c
left join lateral (
  select count(*) as curtidas
  from public.comunicado_curtidas ck
  where ck.comunicado_id = c.id
) k on true
left join lateral (
  select
    count(*) filter (where e.vista_em   is not null) as vistos,
    count(*) filter (where e.clicada_em is not null) as clicados
  from public.notificacoes nt
  join public.notificacao_estado e on e.chave = 'n:' || nt.id
  where nt.modulo = 'comunicados'
    and nt.referencia_id = c.id::text
) n on true
left join lateral (
  -- Publico da revenda HOJE, nao na data da publicacao. O vinculo
  -- colaborador_revendas nao guarda historico de entrada/saida, entao
  -- comunicado antigo e medido contra o quadro atual. Serve para
  -- comparar publicacoes recentes entre si; nao serve para serie longa.
  select count(*) as publico
  from public.colaborador_revendas cr
  where cr.revenda_id = c.revenda_id
) pub on true;

comment on view bi.fato_comunicado is
  'Grao: um comunicado. Curtidas sao reais; avisos_vistos/clicados sao PISO (so quem interagiu com o sino).';

-- Grao: comunicado x colaborador que curtiu. Serve para "quem participa
-- da comunicacao interna" -- e para achar quem nunca interagiu.
create or replace view bi.fato_comunicado_curtida as
select
  ck.comunicado_id,
  c.revenda_id,
  c.titulo,
  c.categoria                 as categoria_id,
  ck.colaborador_id,
  p.nome                      as colaborador,
  bi.area_padrao(p.area)      as area,
  ck.criado_em,
  bi.dia_local(ck.criado_em)  as data,
  (bi.dia_local(ck.criado_em) - c.data) as dias_ate_curtir
from public.comunicado_curtidas ck
join public.comunicados c on c.id = ck.comunicado_id
left join public.profiles p on p.id = ck.colaborador_id;

-- ------------------------------------------------------------------
-- CRONOGRAMA DE COMUNICACAO (a visao de calendario do app)
-- ------------------------------------------------------------------
--
-- Espelha /admin/comunicados/calendario. A pergunta que a lista ordenada
-- por data NAO responde e "que dias estao vazios?" -- buraco de duas
-- semanas sem comunicacao nenhuma nao aparece numa lista e salta aos
-- olhos numa grade.
--
-- Duas marcas por comunicado, e elas sao coisas diferentes:
--   Publicacao -> a materia entrando no jornal
--   Lembrete   -> o aviso dela tocando o celular, que pode ser dias depois
--
-- Por isso e um UNION ALL e nao duas colunas de data: no calendario elas
-- caem em CELULAS diferentes. Um comunicado sem lembrete gera uma linha
-- so; com lembrete, duas.
--
-- A data da publicacao sai de publicar_em quando ha agendamento, e de
-- data quando nao ha -- e a mesma regra da tela.
create or replace view bi.fato_comunicado_agenda as
select
  c.id                        as comunicado_id,
  c.revenda_id,
  c.titulo,
  c.categoria                 as categoria_id,
  bi.editoria_rotulo(c.revenda_id, c.categoria) as categoria,
  'Publicação'::text          as tipo,
  '📰'::text                  as marca,
  coalesce(bi.dia_local(c.publicar_em), c.data) as data,
  case
    when c.publicar_em is null or c.publicar_em <= now() then 'Publicado'
    else 'Na fila'
  end                         as situacao,
  (c.publicar_em is not null and c.publicar_em > now()) as na_fila,
  to_char(c.publicar_em at time zone 'America/Sao_Paulo', 'HH24:MI') as hora,
  -- A EDITORIA ABRE A LINHA, com o emoji dela.
  --
  -- Antes toda publicacao comecava com o mesmo '📰', que so repetia o
  -- que a celula ja era. Numa grade em que cabem quatro linhas por dia,
  -- o primeiro simbolo e a unica coisa que se le de relance -- e ele
  -- tem de dizer DE QUE EDITORIA e a materia, que e o corte pelo qual o
  -- plano de comunicacao se equilibra. E o mesmo emoji que o
  -- colaborador ve no jornal do celular.
  bi.editoria_etiqueta(c.revenda_id, c.categoria)
        || ' · '
        || coalesce(to_char(c.publicar_em at time zone 'America/Sao_Paulo', 'HH24:MI') || ' ', '')
        || c.titulo           as rotulo
from public.comunicados c

union all

select
  c.id,
  c.revenda_id,
  c.titulo,
  c.categoria,
  bi.editoria_rotulo(c.revenda_id, c.categoria),
  'Lembrete',
  '🔔',
  bi.dia_local(c.lembrete_em),
  case when c.lembrete_enviado_em is not null then 'Enviado' else 'Na fila' end,
  (c.lembrete_enviado_em is null),
  to_char(c.lembrete_em at time zone 'America/Sao_Paulo', 'HH24:MI'),
  -- O sino vem ANTES da editoria: e o que separa lembrete de
  -- publicacao, e essa e a primeira distincao que o olho precisa fazer
  -- na celula. A editoria vem logo atras, igual a da publicacao.
  '🔔 ' || bi.editoria_etiqueta(c.revenda_id, c.categoria)
        || ' · ' || to_char(c.lembrete_em at time zone 'America/Sao_Paulo', 'HH24:MI')
        || ' ' || c.titulo
from public.comunicados c
where c.lembrete_em is not null;

comment on view bi.fato_comunicado_agenda is
  'Grao: comunicado x marca (publicacao ou lembrete). Base do calendario do plano de comunicacao.';

-- ==================================================================
-- 6) QUIZ / DESAFIO DO MES
-- ==================================================================

create or replace view bi.dim_quiz_rodada as
select
  r.id                        as rodada_id,
  r.revenda_id,
  r.nome                      as rodada,
  r.temporada,
  r.mes,
  (array['jan','fev','mar','abr','mai','jun',
         'jul','ago','set','out','nov','dez'])[r.mes] || '/' ||
    right(r.temporada::text, 2) as mes_rotulo,
  make_date(r.temporada, r.mes, 1) as mes_ref,
  r.area,
  bi.area_rotulo(r.area)      as area_rotulo,
  r.pilar,
  r.padrao_nome               as padrao,
  r.atividade,
  r.inicio,
  r.fim,
  (r.fim - r.inicio + 1)      as dias_aberta,
  r.total_perguntas,
  r.status,
  case r.status
    when 'rascunho'  then 'Rascunho'
    when 'publicada' then 'No ar'
    else 'Encerrada'
  end                         as status_rotulo,
  r.publicada_em,
  r.encerrada_em
from public.quiz_rodadas r;

-- Grao: uma tentativa de uma pessoa numa rodada (a chave unica do banco
-- garante uma so).
--
-- A posicao e calculada aqui, no mesmo criterio de desempate do app:
-- pontos > acertos > menor tempo. E concluida sempre na frente de
-- em_andamento -- quem abriu e nao terminou nao disputa colocacao.
create or replace view bi.fato_quiz_participacao as
select
  pa.id                       as participacao_id,
  pa.revenda_id,
  pa.rodada_id,
  r.nome                      as rodada,
  r.temporada,
  r.mes,
  make_date(r.temporada, r.mes, 1) as mes_ref,
  r.inicio                    as rodada_inicio,
  r.fim                       as rodada_fim,
  r.total_perguntas,
  r.pilar,
  r.padrao_nome               as padrao,
  pa.colaborador_id,
  pa.colaborador_nome         as colaborador,
  pa.area,
  bi.area_rotulo(pa.area)     as area_rotulo,
  pa.status,
  (pa.status = 'concluida')   as concluida,
  pa.pontos,
  pa.acertos,
  pa.respondidas,
  pa.respondidas - pa.acertos as erros,
  case when pa.respondidas > 0 then
    round(pa.acertos::numeric / pa.respondidas, 4)
  end                         as taxa_acerto,
  case when r.total_perguntas > 0 then
    round(pa.acertos::numeric / r.total_perguntas, 4)
  end                         as aproveitamento,
  round(pa.tempo_ms / 1000.0, 0) as tempo_segundos,
  case when pa.respondidas > 0 then
    round(pa.tempo_ms / 1000.0 / pa.respondidas, 1)
  end                         as segundos_por_pergunta,
  pa.iniciada_em,
  pa.concluida_em,
  bi.dia_local(pa.iniciada_em)  as data,
  bi.dia_local(pa.concluida_em) as data_conclusao,
  rank() over (
    partition by pa.rodada_id
    order by (pa.status = 'concluida') desc,
             pa.pontos desc, pa.acertos desc, pa.tempo_ms asc
  )                           as posicao
from public.quiz_participacoes pa
join public.quiz_rodadas r on r.id = pa.rodada_id;

comment on view bi.fato_quiz_participacao is
  'Grao: uma tentativa por pessoa por rodada. posicao segue o desempate do app (pontos > acertos > tempo).';

create or replace view bi.dim_quiz_questao as
select
  q.id                        as questao_id,
  q.revenda_id,
  q.pergunta,
  q.tipo,
  q.dificuldade,
  initcap(q.dificuldade)      as dificuldade_rotulo,
  q.status,
  (q.status = 'ativa')        as ativa,
  q.area,
  bi.area_rotulo(q.area)      as area_rotulo,
  q.pilar,
  q.padrao_nome               as padrao,
  q.atividade,
  q.explicacao,
  q.vezes_usada,
  q.acertos,
  q.erros,
  case when q.vezes_usada > 0 then
    round(q.erros::numeric / q.vezes_usada, 4)
  end                         as taxa_erro_acumulada,
  q.criado_em
from public.quiz_questoes q;

-- Grao: uma resposta. E ela que permite "questao mais errada NO PERIODO"
-- -- os contadores de quiz_questoes sao acumulados desde sempre e nao
-- respondem a filtro de data nenhum.
create or replace view bi.fato_quiz_resposta as
select
  resp.id                     as resposta_id,
  pa.revenda_id,
  pa.rodada_id,
  r.nome                      as rodada,
  make_date(r.temporada, r.mes, 1) as mes_ref,
  pa.colaborador_id,
  pa.colaborador_nome         as colaborador,
  pa.area,
  resp.questao_id,
  q.pergunta,
  q.dificuldade,
  q.pilar,
  q.padrao_nome               as padrao,
  resp.correta,
  (not resp.correta)          as errou,
  round(resp.tempo_ms / 1000.0, 1) as tempo_segundos,
  resp.respondida_em,
  bi.dia_local(resp.respondida_em) as data
from public.quiz_respostas resp
join public.quiz_participacoes pa on pa.id = resp.participacao_id
join public.quiz_rodadas r        on r.id  = pa.rodada_id
join public.quiz_questoes q       on q.id  = resp.questao_id;

comment on view bi.fato_quiz_resposta is
  'Grao: uma resposta. Use para taxa de erro POR PERIODO -- os contadores da questao sao vitalicios.';

-- Participacao por rodada: quem podia jogar x quem jogou. O elegivel sai
-- da area normalizada do cadastro (mesma regra do app: quem nao e DU nem
-- AL fica de fora da rodada, nao entra na area errada).
create or replace view bi.fato_quiz_rodada_participacao as
select
  r.id                        as rodada_id,
  r.revenda_id,
  r.nome                      as rodada,
  r.temporada,
  r.mes,
  make_date(r.temporada, r.mes, 1) as mes_ref,
  r.area,
  bi.area_rotulo(r.area)      as area_rotulo,
  r.status,
  r.inicio,
  r.fim,
  r.total_perguntas,
  eleg.elegiveis,
  coalesce(pa.participantes, 0) as participantes,
  coalesce(pa.concluidas, 0)    as concluidas,
  case when eleg.elegiveis > 0 then
    round(coalesce(pa.concluidas, 0)::numeric / eleg.elegiveis, 4)
  end                         as taxa_participacao,
  pa.media_pontos,
  pa.media_acertos,
  pa.melhor_pontos
from public.quiz_rodadas r
left join lateral (
  select count(*) as elegiveis
  from public.colaborador_revendas cr
  join public.profiles p on p.id = cr.colaborador_id
  where cr.revenda_id = r.revenda_id
    and bi.area_padrao(p.area) = r.area
    and p.role = 'colaborador'
) eleg on true
left join lateral (
  select
    count(*)                                          as participantes,
    count(*) filter (where q.status = 'concluida')    as concluidas,
    round(avg(q.pontos)  filter (where q.status = 'concluida'), 1) as media_pontos,
    round(avg(q.acertos) filter (where q.status = 'concluida'), 1) as media_acertos,
    max(q.pontos)                                     as melhor_pontos
  from public.quiz_participacoes q
  where q.rodada_id = r.id
) pa on true;

comment on view bi.fato_quiz_rodada_participacao is
  'Elegiveis x participantes por rodada. Elegivel = colaborador da revenda cuja area normalizada bate com a da rodada.';

-- ==================================================================
-- 7) SUPER MATINAL
-- ==================================================================
-- LIMITACAO IMPORTANTE: ranking_matinal guarda IMAGEM, nao pontuacao.
-- Uma linha e "a foto do ranking do mes X, do time Y, na categoria Z".
-- Nao existe colaborador, nao existe ponto, nao existe colocacao no
-- banco -- tudo isso esta DENTRO do arquivo publicado.
--
-- Logo, "ranking geral", "pontuacao por colaborador" e "evolucao da
-- pontuacao" NAO SAO CALCULAVEIS hoje. O que da para medir e a
-- disciplina de publicacao: quais meses/times/categorias foram
-- publicados e quais faltaram. E isso que esta view entrega.
--
-- Ver o arquivo LEIA-ME.md, secao "Lacunas", para o que precisa existir
-- no app antes de este bloco virar o que o prompt pediu.
create or replace view bi.fato_ranking_matinal as
select
  rm.id                       as ranking_id,
  rm.revenda_id,
  rm.mes_ano,
  to_date(rm.mes_ano || '-01', 'YYYY-MM-DD') as mes_ref,
  (array['jan','fev','mar','abr','mai','jun',
         'jul','ago','set','out','nov','dez'])[
    extract(month from to_date(rm.mes_ano || '-01', 'YYYY-MM-DD'))::int]
    || '/' || right(rm.mes_ano, 2) as mes_rotulo,
  rm.time                     as equipe,
  bi.area_rotulo(rm.time)     as equipe_rotulo,
  rm.categoria,
  rm.imagem_url,
  rm.criado_em,
  bi.dia_local(rm.criado_em)  as data_publicacao
from public.ranking_matinal rm;

comment on view bi.fato_ranking_matinal is
  'ATENCAO: so metadados da publicacao. A pontuacao esta dentro da imagem -- nao ha ranking calculavel.';

-- Cobertura da publicacao: mes x time x categoria que ja existiu alguma
-- vez, cruzado com o que foi publicado em cada mes. Responde "faltou
-- publicar o quadro de Assiduidade da AL em junho?".
create or replace view bi.fato_ranking_matinal_cobertura as
with grade as (
  select distinct
    rm.revenda_id, rm.time, rm.categoria
  from public.ranking_matinal rm
),
meses as (
  select distinct
    rm.revenda_id,
    to_date(rm.mes_ano || '-01', 'YYYY-MM-DD') as mes_ref,
    rm.mes_ano
  from public.ranking_matinal rm
)
select
  g.revenda_id,
  m.mes_ano,
  m.mes_ref,
  g.time                      as equipe,
  g.categoria,
  (rm.id is not null)         as publicado,
  rm.imagem_url
from grade g
join meses m on m.revenda_id = g.revenda_id
left join public.ranking_matinal rm
  on rm.revenda_id = g.revenda_id
 and rm.time       = g.time
 and rm.categoria  = g.categoria
 and rm.mes_ano    = m.mes_ano;

-- ==================================================================
-- 8) SONHO DA REVENDA
-- ==================================================================
-- MESMA LIMITACAO do Super Matinal, e por isso o bloco fica curto:
-- sonho_revenda guarda titulo, frase e o ARQUIVO (imagem/pptx/pdf) do
-- sonho, mais a URL do quadro de indicadores. Nao ha meta, nao ha
-- realizado, nao ha percentual -- os numeros vivem dentro do arquivo.
--
-- "Realizado x objetivo" e "% de atingimento" nao existem no banco.
-- Ver LEIA-ME.md, secao "Lacunas".
create or replace view bi.dim_sonho_revenda as
select
  s.id                        as sonho_id,
  s.revenda_id,
  s.ano,
  s.titulo,
  s.frase,
  s.tipo,
  s.ativo,
  s.arquivo_url,
  (s.quadro_indicadores_url is not null) as tem_quadro_indicadores,
  s.quadro_indicadores_url,
  s.criado_em,
  bi.dia_local(s.criado_em)   as data_publicacao,
  make_date(s.ano, 1, 1)      as inicio_ano,
  make_date(s.ano, 12, 31)    as fim_ano,
  case when s.ano = extract(year from current_date)::int then
    round(
      (current_date - make_date(s.ano, 1, 1))::numeric
      / (make_date(s.ano, 12, 31) - make_date(s.ano, 1, 1)), 4
    )
  end                         as ano_decorrido
from public.sonho_revenda s;

-- ==================================================================
-- 8b) PROGRAMA 5S
-- ==================================================================
-- Este bloco e o unico do BI que NAO precisa recalcular nada: o app ja
-- consolida os totais de cada auditoria na hora em que ela e finalizada
-- (ver supabase/migrations/035_cinco_s.sql). As views abaixo so expoem
-- esse consolidado.
--
-- A consequencia pratica importa: a regra de conformidade existe em UM
-- lugar -- a funcao public.cinco_s_taxa -- e tanto a tela do app quanto
-- o Power BI leem o mesmo numero. Recalcular a taxa em DAX daria uma
-- segunda formula para manter em dia, e no dia em que a operacao
-- decidisse contar "N/A" de outro jeito, o app e o relatorio passariam
-- a discordar sem ninguem perceber.

-- Area 5S com o dono VIGENTE resolvido. O historico de donos fica na
-- tabela cinco_s_area_donos; aqui interessa quem responde hoje, que e
-- por quem a lideranca cobra.
create or replace view bi.dim_5s_area as
select
  a.id                                   as area_5s_id,
  a.revenda_id,
  a.nome                                 as area_5s,
  coalesce(nullif(btrim(a.local), ''), 'Sem local')     as local,
  a.descricao,
  a.ativa,
  a.ordem,
  d.colaborador_id                       as dono_id,
  coalesce(p.nome, 'Sem dono definido')  as dono,
  bi.dia_local(a.criado_em)              as data_cadastro
from public.cinco_s_areas a
left join public.cinco_s_area_donos d
       on d.area_id = a.id and d.ate is null
left join public.profiles p on p.id = d.colaborador_id;

comment on view bi.dim_5s_area is
  'Area do 5S com o dono vigente. Uma linha por area.';

-- As 25 perguntas do checklist. O rotulo do senso e montado aqui para o
-- relatorio nao depender de um "de/para" escrito dentro de um visual.
create or replace view bi.dim_5s_pergunta as
select
  q.id                as pergunta_5s_id,
  q.revenda_id,
  q.codigo,
  q.texto             as pergunta,
  q.codigo || ' ' || left(q.texto, 80) as pergunta_curta,
  q.senso,
  case q.senso
    when 'utilizacao'  then 'Utilização'
    when 'organizacao' then 'Organização'
    when 'limpeza'     then 'Limpeza'
    when 'conservacao' then 'Conservação'
    when 'disciplina'  then 'Disciplina'
  end                 as senso_rotulo,
  case q.senso
    when 'utilizacao'  then 'Seiri'
    when 'organizacao' then 'Seiton'
    when 'limpeza'     then 'Seiso'
    when 'conservacao' then 'Seiketsu'
    when 'disciplina'  then 'Shitsuke'
  end                 as senso_japones,
  q.ordem,
  q.ativa
from public.cinco_s_perguntas q;

comment on view bi.dim_5s_pergunta is
  'Catalogo do checklist 5S. A ordem e a mesma da planilha de origem.';

-- Uma linha por auditoria. Traz planejada e realizada na mesma linha
-- porque aderencia (fez? no prazo?) e resultado (que nota?) sao lidos
-- juntos -- separar em dois fatos obrigaria o relatorio a cruzar duas
-- tabelas para responder "quantas areas ficaram sem auditoria".
create or replace view bi.fato_5s_auditoria as
select
  au.id                     as auditoria_5s_id,
  au.revenda_id,
  au.area_id                as area_5s_id,
  ar.nome                   as area_5s,
  au.auditor_id,
  -- Apelido do auditor. E o que liga a auditoria a dim_colaborador e faz
  -- o filtro global de Colaborador funcionar nesta pagina: escolher uma
  -- pessoa passa a mostrar as auditorias que ELA fez. Sem esta coluna, o
  -- relacionamento nao existe e o filtro do topo nao afeta o bloco do 5S
  -- -- o usuario filtra e o numero nao muda, que e pior do que nao ter
  -- filtro nenhum.
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
  au.planejada_para         as data,
  au.competencia            as mes_ref,
  to_char(au.competencia, 'MM/YYYY')            as mes_rotulo,
  bi.dia_local(au.finalizada_em)                as data_realizada,
  (au.status = 'finalizada')                    as realizada,
  -- Atraso medido contra HOJE, nao contra um carimbo gravado: assim o
  -- indicador se corrige sozinho quando a auditoria e feita.
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
  -- Ja calculada pelo app. Vem como fracao para o Power BI formatar
  -- como percentual sem dividir por 100 em cada visual.
  round(au.conformidade / 100.0, 4)             as conformidade,
  -- Separa o que foi medido do que entrou por media (meses cujo registro
  -- na planilha se perdeu, ver migracao 039). Nao aparece em visual
  -- nenhum por padrao -- serve para conferir, e para o dia em que
  -- alguem perguntar de onde veio o numero de janeiro.
  au.estimada,
  case when au.estimada then 'Estimada' else 'Medida' end as origem,
  au.observacao,
  bi.dia_local(au.criado_em)                    as data_planejamento
from public.cinco_s_auditorias au
join public.cinco_s_areas ar on ar.id = au.area_id
left join public.profiles pa on pa.id = au.auditor_id
left join public.profiles pd on pd.id = au.dono_id
where au.status <> 'cancelada';

comment on view bi.fato_5s_auditoria is
  'Uma linha por auditoria 5S, planejada ou realizada. Conformidade vem consolidada do app.';

-- O radar dos cinco sensos. Ja somado pelo app na finalizacao: cinco
-- linhas por auditoria em vez de vinte e cinco.
create or replace view bi.fato_5s_senso as
select
  s.auditoria_id            as auditoria_5s_id,
  au.revenda_id,
  au.area_id                as area_5s_id,
  ar.nome                   as area_5s,
  au.auditor_id,
  au.dono_id,
  au.planejada_para         as data,
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

comment on view bi.fato_5s_senso is
  'Grao: auditoria x senso. Base do radar. Ja somado pelo app.';

-- Resposta a resposta. E o unico fato do 5S com grao fino, e existe por
-- causa de uma pergunta que os demais nao respondem: QUAL item reprova
-- mais, e em que areas.
create or replace view bi.fato_5s_resposta as
select
  r.id                      as resposta_5s_id,
  r.auditoria_id            as auditoria_5s_id,
  au.revenda_id,
  au.area_id                as area_5s_id,
  ar.nome                   as area_5s,
  au.auditor_id,
  au.dono_id,
  au.planejada_para         as data,
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
  -- "Avaliado" e o denominador da conformidade: N/A fica de fora, mesma
  -- regra da planilha que a operacao usa desde antes do app.
  (r.valor in ('sim', 'nao'))::int as eh_avaliado,
  r.observacao,
  r.foto_url
from public.cinco_s_respostas r
join public.cinco_s_auditorias au on au.id = r.auditoria_id
join public.cinco_s_areas ar on ar.id = au.area_id
join public.cinco_s_perguntas q on q.id = r.pergunta_id
where au.status = 'finalizada';

comment on view bi.fato_5s_resposta is
  'Grao: auditoria x pergunta. Sustenta o ranking de itens criticos.';

-- Plano de acao. Uma linha por nao conformidade, com o ciclo inteiro
-- ate a validacao.
create or replace view bi.fato_5s_acao as
select
  n.id                      as acao_5s_id,
  n.revenda_id,
  n.auditoria_id            as auditoria_5s_id,
  n.area_id                 as area_5s_id,
  ar.nome                   as area_5s,
  n.pergunta_id             as pergunta_5s_id,
  q.codigo,
  n.senso,
  case n.senso
    when 'utilizacao'  then 'Utilização'
    when 'organizacao' then 'Organização'
    when 'limpeza'     then 'Limpeza'
    when 'conservacao' then 'Conservação'
    when 'disciplina'  then 'Disciplina'
  end                       as senso_rotulo,
  n.descricao               as problema,
  n.acao                    as acao_corretiva,
  n.responsavel_id,
  coalesce(pr.nome, 'Sem responsável')          as responsavel,
  n.prioridade,
  case n.prioridade
    when 'alta' then 'Alta' when 'media' then 'Média' else 'Baixa'
  end                       as prioridade_rotulo,
  n.status,
  case n.status
    when 'aberta'       then 'Aberta'
    when 'em_andamento' then 'Em andamento'
    when 'concluida'    then 'Concluída'
    else 'Validada'
  end                       as status_rotulo,
  (n.status in ('aberta', 'em_andamento'))      as em_aberto,
  (n.status in ('concluida', 'validada'))       as resolvida,
  n.prazo,
  au.competencia            as mes_ref,
  bi.dia_local(n.criado_em) as data_abertura,
  bi.dia_local(n.concluido_em)                  as data_conclusao,
  bi.dia_local(n.validado_em)                   as data_validacao,
  (n.status in ('aberta', 'em_andamento')
     and n.prazo is not null and n.prazo < current_date) as atrasada,
  -- Quantos dias levou para resolver. So conta o que foi concluido --
  -- media de ciclo contando o que ainda esta aberto seria otimista de
  -- proposito, porque justamente o que demora nao entraria na conta.
  case
    when n.concluido_em is not null
      then bi.dia_local(n.concluido_em) - bi.dia_local(n.criado_em)
  end                       as dias_para_resolver,
  n.evidencia_url,
  n.evidencia_conclusao_url,
  n.comentario_encerramento
from public.cinco_s_nao_conformidades n
join public.cinco_s_areas ar on ar.id = n.area_id
join public.cinco_s_auditorias au on au.id = n.auditoria_id
left join public.cinco_s_perguntas q on q.id = n.pergunta_id
left join public.profiles pr on pr.id = n.responsavel_id;

comment on view bi.fato_5s_acao is
  'Plano de acao 5S: uma linha por nao conformidade, do apontamento a validacao.';

-- ==================================================================
-- 9) USO DO APP (adesao -- sustenta todos os outros blocos)
-- ==================================================================
-- Nenhum indicador de participacao significa nada sem isto: se so 30 das
-- 83 pessoas abrem o app, "70% de participacao no quiz" e 70% de 30.
create or replace view bi.fato_evento_acesso as
select
  e.id                        as evento_id,
  e.revenda_id,
  e.colaborador_id,
  e.nome                      as colaborador,
  e.tipo,
  e.alvo,
  case
    when e.tipo = 'login' then 'Login'
    when e.tipo = 'acao'  then 'Ação'
    else coalesce(
      nullif('/' || split_part(e.alvo, '/', 2), '/'),
      '/'
    )
  end                         as modulo,
  e.sessao_id,
  e.criado_em,
  bi.dia_local(e.criado_em)   as data,
  extract(hour from (e.criado_em at time zone 'America/Sao_Paulo'))::int as hora
from public.eventos_acesso e;

create or replace view bi.fato_uso_sessao as
select
  s.id                        as sessao_id,
  s.colaborador_id,
  p.nome                      as colaborador,
  s.iniciada_em,
  s.ultima_atividade,
  s.segundos,
  round(s.segundos / 60.0, 1) as minutos,
  bi.dia_local(s.iniciada_em) as data
from public.uso_sessoes s
left join public.profiles p on p.id = s.colaborador_id;

-- ==================================================================
-- 10) ATIVIDADE CONSOLIDADA -- a espinha da pagina executiva
-- ==================================================================
-- Um unico fato com o grao revenda x data x colaborador x modulo. E o
-- que permite um so cartao de "participacao geral" e um so grafico de
-- evolucao cobrindo os cinco modulos, em vez de cinco visuais que nao
-- conversam.
--
-- Ele NAO substitui os fatos especificos: aqui so ha contagem de
-- interacoes. Nota, ponto, divergencia e causa continuam em suas views.
create or replace view bi.fato_atividade as
  select c.revenda_id, c.data, c.colaborador_id, c.colaborador_nome as colaborador,
         'Ativo de Giro'::text as modulo, count(*)::bigint as interacoes
    from bi.fato_ag_contagem c
   group by 1, 2, 3, 4

union all
  select f.revenda_id, bi.dia_local(f.criado_em), f.colaborador_id,
         coalesce(p.nome, 'Sem cadastro'), 'Feedback de Rota', count(*)::bigint
    from public.feedback_rota f
    left join public.profiles p on p.id = f.colaborador_id
   group by 1, 2, 3, 4

union all
  select a.revenda_id, bi.dia_local(a.iniciada_em), a.colaborador_id,
         a.colaborador_nome, '5 Porquês', count(*)::bigint
    from public.cinco_porques_analises a
   group by 1, 2, 3, 4

union all
  select pa.revenda_id, bi.dia_local(pa.iniciada_em), pa.colaborador_id,
         pa.colaborador_nome, 'Quiz', count(*)::bigint
    from public.quiz_participacoes pa
   group by 1, 2, 3, 4

union all
  select c.revenda_id, bi.dia_local(ck.criado_em), ck.colaborador_id,
         coalesce(p.nome, 'Sem cadastro'), 'Comunicados', count(*)::bigint
    from public.comunicado_curtidas ck
    join public.comunicados c on c.id = ck.comunicado_id
    left join public.profiles p on p.id = ck.colaborador_id
   group by 1, 2, 3, 4

union all
  -- A auditoria 5S conta como UMA interacao, e nao vinte e cinco: o
  -- grao aqui e "a pessoa usou o modulo naquele dia". Contar resposta a
  -- resposta faria o auditor aparecer como o colaborador mais ativo da
  -- revenda so por ter respondido um checklist longo.
  --
  -- A data e a da FINALIZACAO, nao a planejada: e quando a pessoa
  -- efetivamente mexeu no app.
  select au.revenda_id, bi.dia_local(au.finalizada_em), au.auditor_id,
         coalesce(p.nome, 'Auditor fora do cadastro'), 'Programa 5S', count(*)::bigint
    from public.cinco_s_auditorias au
    left join public.profiles p on p.id = au.auditor_id
   where au.status = 'finalizada'
     and au.finalizada_em is not null
     and au.auditor_id is not null
   group by 1, 2, 3, 4;

comment on view bi.fato_atividade is
  'Grao: revenda x data x colaborador x modulo. So contagem de interacoes -- os KPIs de qualidade ficam nos fatos especificos.';

-- ------------------------------------------------------------------
-- FIM
-- ------------------------------------------------------------------
-- RODE AGORA O 02-acesso-powerbi.sql. Nao e opcional nem "so na
-- primeira vez": o drop schema no inicio deste arquivo levou junto os
-- GRANTs do powerbi_readonly. Sem rodar o 02, o Power BI passa a
-- responder "permissao negada" na proxima atualizacao.
