-- ==================================================================
-- CORRECAO -- permission denied for table comunicado_editorias
-- ==================================================================
-- Ctrl+A e Ctrl+Enter. Nao precisa rodar o 13 de novo: as views que ele
-- criou continuam validas, so as funcoes que elas chamam e que mudam.
--
-- O QUE ACONTECEU
--
-- O 13-editorias-no-bi.sql criou duas funcoes que liam
-- public.comunicado_editorias direto, e a atualizacao do Power BI parou
-- com 42501 em fato_comunicado -- derrubando as outras 36 tabelas em
-- cascata, com a mensagem inutil "um erro ao carregar uma tabela
-- anterior cancelou o carregamento".
--
-- POR QUE
--
-- View roda com os privilegios do DONO. Corpo de funcao roda com os
-- privilegios de QUEM CHAMA. bi.fato_comunicado e do postgres e le
-- public.comunicados sem problema; ao chamar a funcao, o corpo passou a
-- ser verificado contra o powerbi_readonly, que nao tem -- e nao deve
-- ter -- acesso a tabela nenhuma de public.
--
-- A CORRECAO
--
-- Uma view nova, bi.dim_editoria, e as funcoes passam a ler ELA. Nao
-- usei SECURITY DEFINER: seria mais curto e abriria uma segunda porta
-- para public, fora do desenho de "so views do esquema bi leem as
-- tabelas do app".
--
-- De brinde, dim_editoria vira dimensao de verdade -- rotulo, emoji,
-- cor e ordem por revenda, disponiveis para qualquer visual.
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


-- ------------------------------------------------------------------
-- GRANT
-- ------------------------------------------------------------------
-- A view e nova. O "alter default privileges" do 02 costuma cobrir,
-- mas explicito custa uma linha e evita outra rodada de 42501.
grant select on bi.dim_editoria to powerbi_readonly;

-- ------------------------------------------------------------------
-- CONFERENCIA -- rode cada uma separada (o editor so mostra a ultima)
-- ------------------------------------------------------------------
select revenda_id, editoria_id, etiqueta from bi.dim_editoria order by ordem, editoria;

select categoria, count(*) as comunicados from bi.fato_comunicado group by 1 order by 2 desc;

select tipo, data, rotulo from bi.fato_comunicado_agenda order by data desc limit 12;