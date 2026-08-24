-- ==================================================================
-- EDITORIAS NO BI -- 23/08/2026
-- ==================================================================
-- Ctrl+A e Ctrl+Enter. Uma colagem so.
--
-- O QUE MUDA
--
-- comunicados.categoria guarda a CHAVE ('seguranca', 'saude'). O rotulo
-- e o emoji moram em comunicado_editorias, POR REVENDA -- cada uma pode
-- renomear e trocar o emoji das suas. O BI ignorava isso e fazia
-- initcap na chave: mostrava "Seguranca" sem cedilha e "Saude" onde a
-- tela do celular diz "Saude e Bem-estar". BI e app discordavam no nome
-- da propria editoria.
--
--   1. bi.editoria_rotulo()    -> "Saude e Bem-estar"
--   2. bi.editoria_etiqueta()  -> emoji + rotulo, como no jornal
--   3. fato_comunicado.categoria passa a usar o rotulo da revenda
--   4. fato_comunicado_agenda.rotulo passa a ABRIR com a etiqueta da
--      editoria -- numa celula de calendario com quatro linhas, o
--      primeiro simbolo e a unica coisa que se le de relance, e ele
--      tem de dizer de que editoria e a materia
--
-- As funcoes vem primeiro de proposito: view em Postgres exige que a
-- funcao exista na hora da criacao.
--
-- create or replace preserva os GRANTs -- nao precisa rodar o 02.
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
-- coalesce para a chave capitalizada: editoria de comunicado antigo que
-- tenha sido apagada do cadastro continua legivel em vez de sair vazia.
-- Perder a etiqueta e pior que mostrar a chave.
create or replace function bi.editoria_rotulo(p_revenda uuid, p_chave text)
returns text
language sql
stable
as $$
  select coalesce(
    (select e.rotulo
       from public.comunicado_editorias e
      where e.revenda_id = p_revenda and e.id = p_chave
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
    (select e.emoji || ' ' || e.rotulo
       from public.comunicado_editorias e
      where e.revenda_id = p_revenda and e.id = p_chave
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

-- ------------------------------------------------------------------
-- CONFERENCIA -- rode cada uma separada (o editor so mostra a ultima)
-- ------------------------------------------------------------------
-- A primeira tem de sair com acento: "Seguranca" com cedilha, "Saude e
-- Bem-estar" por extenso. A segunda tem de abrir cada linha com o emoji
-- da editoria. Se sair o emoji generico de jornal, a editoria nao foi
-- encontrada para aquela revenda -- confira comunicado_editorias.
select categoria, count(*) as comunicados
  from bi.fato_comunicado
 group by 1
 order by 2 desc;

select tipo, data, rotulo
  from bi.fato_comunicado_agenda
 order by data desc
 limit 12;