-- ==================================================================
-- BI: CHAMADOS PARA MANUTENCAO -- TMR E NPS DO ATENDIMENTO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- DEPOIS rode o 02-acesso-powerbi.sql (GRANT): sem ele o powerbi_readonly
-- nao enxerga a view nova e a pagina nasce vazia, sem erro de conexao.
-- ==================================================================
-- Pedido do dono (07/10/2026): "um BI dentro do BI do app com os dois
-- modulos novos da manutencao. O primeiro e o de Chamados, medindo o TMR
-- e a NPS do atendimento". O segundo (Check de Manutencao) vem depois.
--
-- A origem e a migration 165 (chamados). A regra de cada numero ESPELHA
-- calcularIndicadores() de src/lib/chamados.ts, que e o que o painel
-- /gestao/chamados mostra -- se a regra mudar la, mude aqui:
--
--   * a DATA do chamado e a da ABERTURA, como no painel (que filtra por
--     aberto_em). Um chamado aberto em 30/09 e concluido em 02/10 conta em
--     setembro, inteiro;
--   * CANCELADO entra no total e e contado a parte, mas sai de tudo que
--     mede o atendimento (prazo, tempo, reabertura): ele nao foi atendido;
--   * TMR = tempo medio de RESOLUCAO, da abertura a conclusao, so dos
--     concluidos. E o "Tempo medio de solucao" do painel (o MTTR). O tempo
--     ate alguem ASSUMIR vem separado (horas_ate_assumir);
--   * no prazo = concluido_em <= prazo_em. O prazo e o gravado na abertura
--     (Risco 4 h, Urgente 24 h, Normal 48 h em 07/10/2026) e nao e refeito
--     quando o chamado reabre -- se nao resolveu, o atraso e real;
--   * reaberto = reaberturas > 0. Reabrir (o "Nao resolveu" de quem pediu)
--     zera o concluido_em, entao o TMR de um reaberto ja conta ate a
--     conclusao QUE VALEU.
--
-- O NPS. O app pergunta uma nota de 1 a 5 a quem abriu, junto do
-- "Resolveu? Sim" -- nao a escala 0 a 10 do NPS classico. A conversao e
-- a usual para escala de 5 pontos:
--     5 = promotor, 4 = neutro, 1 a 3 = detrator
--     NPS = % promotores - % detratores  (de -100 a +100)
-- So quem confirmou "Resolveu" e deu nota entra. Quem respondeu "Nao
-- resolveu" nao avalia -- o chamado reabre e volta para a fila.
--
-- CHAMADOS DE TESTE. Os dois primeiros de Sao Felix (#0001 "Teste" e
-- #0002 "mzbvxbnzxv", 05 e 06/10/2026) foram o teste do modulo -- e o
-- #0002 carrega a unica nota do sistema em 07/10/2026 (5, o que daria
-- NPS +100 a partir de um teste). Ficam FORA pelo id. O caminho certo e
-- apagar os dois no app (Gestao > Chamados, permissao "excluir"); depois
-- disso a lista abaixo nao acha nada e pode ficar como esta.
-- ==================================================================

create or replace view bi.chamado_de_teste as
select x.chamado_id
from (values
  ('d853db5c-2904-41e0-89f6-0dcbc0c77c50'::uuid), -- Sao Felix #0001 "Teste"
  ('d9365c76-273d-444d-91f3-0e28e1c16dbb'::uuid)  -- Sao Felix #0002 "mzbvxbnzxv"
) as x(chamado_id);

comment on view bi.chamado_de_teste is
  'Chamados de teste do lancamento do modulo (05-06/10/2026). Fora do BI.';

create or replace view bi.fato_chamado as
select
  c.id                                        as chamado_id,
  c.revenda_id,
  c.numero,
  '#' || lpad(c.numero::text, 4, '0')         as protocolo,

  -- A AREA DE HOJE, e nao a do dia. O chamado grava o nome da area no dia
  -- (local_nome), e as areas foram reorganizadas em setores em 07/10/2026
  -- (migrations 168 e 170): "Sala ADM" e "ADM · Sala ADM" sao a MESMA
  -- sala. Agrupar pelo texto do dia partiria uma area em duas. Pelo
  -- local_id, a area segue o cadastro atual; o texto do dia fica em
  -- local_no_dia. Sem local (area apagada), o texto do dia e quebrado no
  -- " · " como o app grava ("Setor · Area").
  case
    when l.id is not null then coalesce(nullif(l.grupo, ''), 'Demais áreas')
    when position(' · ' in c.local_nome) > 0 then split_part(c.local_nome, ' · ', 1)
    else 'Demais áreas'
  end                                         as setor,
  case
    when l.id is not null then l.nome
    when position(' · ' in c.local_nome) > 0
      then substr(c.local_nome, position(' · ' in c.local_nome) + 3)
    else c.local_nome
  end                                         as area,
  c.local_nome                                as local_no_dia,

  c.tipo,
  case c.tipo
    when 'alvenaria'  then 'Alvenaria'
    when 'eletrica'   then 'Elétrica'
    when 'hidraulica' then 'Hidráulica'
    when 'jardinagem' then 'Jardinagem'
    when 'limpeza'    then 'Limpeza'
    when 'mobiliario' then 'Mobiliário'
    else 'Outros'
  end                                         as tipo_rotulo,
  c.prioridade,
  case c.prioridade
    when 'risco'   then 'Risco à segurança'
    when 'urgente' then 'Urgente'
    else 'Normal'
  end                                         as prioridade_rotulo,
  case c.prioridade when 'risco' then 1 when 'urgente' then 2 else 3 end as prioridade_ordem,
  c.status,
  case c.status
    when 'aberto'         then 'Aberto'
    when 'em_atendimento' then 'Em atendimento'
    when 'aguardando'     then 'Aguardando'
    when 'concluido'      then 'Concluído'
    else 'Cancelado'
  end                                         as status_rotulo,
  case c.status
    when 'aberto' then 1 when 'em_atendimento' then 2 when 'aguardando' then 3
    when 'concluido' then 4 else 5
  end                                         as status_ordem,
  c.origem,
  case c.origem when 'qr' then 'QR Code' else 'App' end as origem_rotulo,

  c.solicitante_nome                          as solicitante,
  c.solicitante_id,
  coalesce(c.responsavel_nome, 'Ninguém assumiu') as responsavel,
  c.responsavel_id,

  -- Horario LOCAL (sem fuso): e o que aparece nas tabelas. O rotulo de
  -- texto leva a hora, que a coluna de data do modelo (dd/MM/yyyy) esconde.
  (c.aberto_em at time zone 'America/Sao_Paulo')       as aberto_em,
  to_char(c.aberto_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as aberto_rotulo,
  bi.dia_local(c.aberto_em)                   as data,
  (c.prazo_em at time zone 'America/Sao_Paulo')        as prazo_em,
  to_char(c.prazo_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as prazo_rotulo,
  round((extract(epoch from (c.prazo_em - c.aberto_em)) / 3600.0)::numeric, 2) as prazo_horas,
  (c.atendimento_em at time zone 'America/Sao_Paulo')  as atendimento_em,
  (c.concluido_em at time zone 'America/Sao_Paulo')    as concluido_em,
  to_char(c.concluido_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as concluido_rotulo,
  bi.dia_local(c.concluido_em)                as data_conclusao,

  (c.status = 'cancelado')                    as cancelado,
  (c.status in ('aberto', 'em_atendimento', 'aguardando')) as em_aberto,
  (c.status = 'concluido' and c.concluido_em is not null)  as concluido,
  -- Atrasado AGORA: em aberto com o prazo vencido no instante da
  -- atualizacao do BI (e nao do dia em que se abre o arquivo).
  (c.status in ('aberto', 'em_atendimento', 'aguardando') and c.prazo_em < now()) as atrasado,
  -- So para concluido: os demais nao cumpriram nem estouraram ainda.
  case
    when c.status = 'concluido' and c.concluido_em is not null
      then c.concluido_em <= c.prazo_em
  end                                         as no_prazo,
  case
    when c.status = 'cancelado' then 'Cancelado'
    when c.status = 'concluido' and c.concluido_em <= c.prazo_em then 'Resolvido no prazo'
    when c.status = 'concluido' then 'Resolvido fora do prazo'
    when c.prazo_em < now() then 'Em aberto — atrasado'
    else 'Em aberto — no prazo'
  end                                         as situacao_prazo,

  -- Os tempos, em HORAS. Cancelado fica de fora dos dois (nao foi
  -- atendido), como em calcularIndicadores().
  case
    when c.status <> 'cancelado' and c.atendimento_em is not null
      then round((extract(epoch from (c.atendimento_em - c.aberto_em)) / 3600.0)::numeric, 4)
  end                                         as horas_ate_assumir,
  case
    when c.status = 'concluido' and c.concluido_em is not null
      then round((extract(epoch from (c.concluido_em - c.aberto_em)) / 3600.0)::numeric, 4)
  end                                         as horas_resolucao,
  case
    when c.status in ('aberto', 'em_atendimento', 'aguardando')
      then round((extract(epoch from (now() - c.aberto_em)) / 3600.0)::numeric, 2)
  end                                         as horas_em_aberto,

  c.reaberturas,
  (c.reaberturas > 0)                         as foi_reaberto,
  (c.status = 'concluido' and c.confirmacao is null) as aguardando_confirmacao,
  case
    when c.confirmacao = 'resolvido' then 'Confirmou: resolveu'
    when c.status = 'concluido'      then 'Aguardando quem pediu'
  end                                         as confirmacao_rotulo,

  -- A NOTA e o NPS. Nota fora de 1..5 nao existe (check da tabela).
  c.avaliacao,
  (c.avaliacao is not null)                   as avaliado,
  case when c.avaliacao is not null then c.avaliacao::text || ' ★' end as nota_rotulo,
  case
    when c.avaliacao = 5 then 'Promotor'
    when c.avaliacao = 4 then 'Neutro'
    when c.avaliacao between 1 and 3 then 'Detrator'
  end                                         as nps_grupo,
  case
    when c.avaliacao = 5 then 1
    when c.avaliacao = 4 then 2
    when c.avaliacao between 1 and 3 then 3
  end                                         as nps_ordem,
  coalesce((c.avaliacao = 5)::int, 0)         as eh_promotor,
  coalesce((c.avaliacao = 4)::int, 0)         as eh_neutro,
  coalesce((c.avaliacao between 1 and 3)::int, 0) as eh_detrator,
  c.avaliacao_comentario,

  c.descricao,
  c.solucao,
  coalesce(f.fotos, 0)                        as fotos
from public.chamados c
left join public.chamados_locais l on l.id = c.local_id
left join lateral (
  select count(*)::int as fotos from public.chamados_fotos ft where ft.chamado_id = c.id
) f on true
where not exists (select 1 from bi.chamado_de_teste t where t.chamado_id = c.id);

comment on view bi.fato_chamado is
  'Um chamado para manutencao. Datado pela ABERTURA. TMR = abertura->conclusao; NPS 5=promotor 4=neutro 1-3=detrator.';

-- ------------------------------------------------------------------
-- A VISAO GERAL PASSA A ENXERGAR OS CHAMADOS
-- ------------------------------------------------------------------
-- bi.fato_atividade precisa de um ramo a cada modulo novo -- em 09/09 o
-- armazem entrou no BI e a Visao Geral continuou dizendo que ninguem o
-- usava. Recriada inteira, como no 15: a MESMA lista de colunas, na mesma
-- ordem, entao "create or replace" aceita. Os treze ramos de cima sao
-- copia literal do 15 -- ESTA e a definicao que vale depois que o 17 roda.
--
-- No chamado, contam as DUAS pontas, como na carreta: quem ABRIU pelo app
-- (no dia da abertura; aberto pelo QR sem login nao tem pessoa) e quem
-- ASSUMIU (no dia em que assumiu). O `union` interno descarta o par
-- repetido quando a mesma pessoa abriu e assumiu no mesmo dia.
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
   where not exists (select 1 from bi.fora_do_bi x where x.colaborador_id = f.colaborador_id)
   group by 1, 2, 3, 4

union all
  select a.revenda_id, bi.dia_local(a.iniciada_em), a.colaborador_id,
         a.colaborador_nome, '5 Porquês', count(*)::bigint
    from public.cinco_porques_analises a
   where not exists (select 1 from bi.fora_do_bi x where x.colaborador_id = a.colaborador_id)
   group by 1, 2, 3, 4

union all
  select pa.revenda_id, bi.dia_local(pa.iniciada_em), pa.colaborador_id,
         pa.colaborador_nome, 'Quiz', count(*)::bigint
    from public.quiz_participacoes pa
   where not exists (select 1 from bi.fora_do_bi x where x.colaborador_id = pa.colaborador_id)
   group by 1, 2, 3, 4

union all
  select c.revenda_id, bi.dia_local(ck.criado_em), ck.colaborador_id,
         coalesce(p.nome, 'Sem cadastro'), 'Comunicados', count(*)::bigint
    from public.comunicado_curtidas ck
    join public.comunicados c on c.id = ck.comunicado_id
    left join public.profiles p on p.id = ck.colaborador_id
   group by 1, 2, 3, 4

union all
  select au.revenda_id, bi.dia_local(au.finalizada_em), au.auditor_id,
         coalesce(p.nome, 'Auditor fora do cadastro'), 'Programa 5S', count(*)::bigint
    from public.cinco_s_auditorias au
    left join public.profiles p on p.id = au.auditor_id
   where au.status = 'finalizada'
     and au.finalizada_em is not null
     and au.auditor_id is not null
   group by 1, 2, 3, 4

-- ---- os modulos do armazem, a partir das views do 15 ----
union all
  select b.revenda_id, b.data, b.colaborador_id, b.colaborador,
         'Bancada (Seleção e Repack)', count(*)::bigint
    from bi.fato_pa_bancada b
   group by 1, 2, 3, 4

union all
  select d.revenda_id, d.data, d.colaborador_id, d.colaborador,
         'Despejo', count(*)::bigint
    from bi.fato_pa_despejo d
   group by 1, 2, 3, 4

union all
  select a.revenda_id, a.data, a.colaborador_id, a.colaborador,
         'Abastecimento do Picking', count(*)::bigint
    from bi.fato_pa_abastecimento a
   group by 1, 2, 3, 4

union all
  select r.revenda_id, r.data, r.colaborador_id, r.colaborador,
         'Ressuprimento', count(*)::bigint
    from bi.fato_pa_ressuprimento r
   group by 1, 2, 3, 4

union all
  select bp.revenda_id, bp.data, bp.colaborador_id, bp.colaborador,
         'Bate Palete', count(distinct bp.bate_palete_id)::bigint
    from bi.fato_pa_bate_palete bp
   group by 1, 2, 3, 4

union all
  select x.revenda_id, x.data, x.colaborador_id, x.colaborador,
         'Recebimento de Carretas', count(*)::bigint
    from (
      select carreta_id, revenda_id, data, colaborador_id, colaborador
        from bi.fato_carreta where colaborador_id is not null
      union
      select carreta_id, revenda_id, data, portaria_colaborador_id, portaria
        from bi.fato_carreta where portaria_colaborador_id is not null
    ) x
   group by 1, 2, 3, 4

union all
  select o.revenda_id, o.data, o.colaborador_id, o.colaborador,
         'Empilhadeira', count(*)::bigint
    from bi.fato_empilhadeira_operacao o
   group by 1, 2, 3, 4

-- ---- 17: chamados para manutencao (07/10/2026) ----
union all
  select x.revenda_id, x.data, x.colaborador_id, x.colaborador,
         'Chamados para Manutenção', count(*)::bigint
    from (
      select ch.chamado_id, ch.revenda_id, ch.data, ch.solicitante_id as colaborador_id,
             ch.solicitante as colaborador
        from bi.fato_chamado ch where ch.solicitante_id is not null
      union
      select ch.chamado_id, ch.revenda_id, ch.atendimento_em::date, ch.responsavel_id,
             ch.responsavel
        from bi.fato_chamado ch
       where ch.responsavel_id is not null and ch.atendimento_em is not null
    ) x
   where not exists (select 1 from bi.fora_do_bi f where f.colaborador_id = x.colaborador_id)
   group by 1, 2, 3, 4;

comment on view bi.fato_atividade is
  'Grao: revenda x data x colaborador x modulo, 14 modulos (armazem e chamados inclusos). So contagem de interacoes.';

-- ------------------------------------------------------------------
-- Confira contra o painel Gestao > Chamados do app: tem de bater, com
-- uma diferenca enquanto os 2 de teste existirem -- o app ainda os conta
-- (2 a mais no total e 1 a mais nos concluidos, com a nota 5 do teste).
-- Conferido em 07/10/2026 16h: 11 chamados, 1 concluido (#0010,
-- torneira, 9 min, no prazo), 10 em aberto, nenhuma nota -- o NPS so
-- aparece com a primeira avaliacao.
-- ------------------------------------------------------------------
select r.revenda,
       count(*)                                         as chamados,
       count(*) filter (where ch.cancelado)             as cancelados,
       count(*) filter (where ch.em_aberto)             as em_aberto,
       count(*) filter (where ch.atrasado)              as atrasados_agora,
       count(*) filter (where ch.concluido)             as concluidos,
       round(avg(ch.horas_resolucao), 2)                as tmr_horas,
       count(*) filter (where ch.no_prazo)              as concluidos_no_prazo,
       count(*) filter (where ch.avaliado)              as avaliacoes,
       round(100.0 * (sum(ch.eh_promotor) - sum(ch.eh_detrator))
             / nullif(count(*) filter (where ch.avaliado), 0), 1) as nps
from bi.fato_chamado ch
join bi.dim_revenda r on r.revenda_id = ch.revenda_id
group by r.revenda
order by r.revenda;
