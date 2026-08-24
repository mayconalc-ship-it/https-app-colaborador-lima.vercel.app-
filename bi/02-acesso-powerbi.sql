-- ==================================================================
-- BI DO APP DO COLABORADOR - USUARIO DE LEITURA PARA O POWER BI
-- Execute no Supabase DEPOIS do 01-camada-semantica.sql
-- ==================================================================
-- Troque a senha abaixo antes de rodar. Ela vai ser digitada no Power BI
-- e guardada no Power BI Service -- use um gerenciador de senhas, nao o
-- bloco de notas.
--
-- E NAO SALVE A SENHA DE VOLTA NESTE ARQUIVO. Este repositorio e
-- publico: a senha escrita aqui e commitada vira permanente, porque
-- apagar depois nao a tira do historico nem dos clones que ja existem.
-- Troque, rode, e deixe o placeholder no lugar.

-- ------------------------------------------------------------------
-- 1) O USUARIO
-- ------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'powerbi_readonly') then
    create role powerbi_readonly with login password 'TROQUE-ESTA-SENHA';
  end if;
end $$;

-- Se o usuario ja existe de uma tentativa anterior, descomente para
-- redefinir a senha:
-- alter role powerbi_readonly with password 'TROQUE-ESTA-SENHA';

-- ------------------------------------------------------------------
-- 2) TIRAR O ACESSO AMPLO, SE ELE FOI DADO ANTES
-- ------------------------------------------------------------------
-- O passo a passo generico de "conectar Power BI no Supabase" costuma
-- mandar dar SELECT em todas as tabelas de public. Aqui isso e ao mesmo
-- tempo amplo demais e inutil: amplo porque inclui profiles (com CPF) e
-- rv_config (que aponta para a planilha de remuneracao de todo mundo), e
-- inutil porque o RLS destas tabelas devolveria zero linha mesmo assim.
--
-- Quem le e a camada bi. Estas revogacoes nao quebram nada.
revoke all on all tables    in schema public from powerbi_readonly;
revoke all on all sequences in schema public from powerbi_readonly;
revoke all on schema public from powerbi_readonly;
alter default privileges in schema public revoke select on tables from powerbi_readonly;

-- ------------------------------------------------------------------
-- 3) DAR ACESSO SO A CAMADA DE BI
-- ------------------------------------------------------------------
grant usage on schema bi to powerbi_readonly;
grant select on all tables in schema bi to powerbi_readonly;

-- View nova criada depois ja nasce liberada -- sem isto, cada view nova
-- exigiria lembrar de voltar aqui.
alter default privileges in schema bi
  grant select on tables to powerbi_readonly;

-- ------------------------------------------------------------------
-- 4) CONFERENCIA
-- ------------------------------------------------------------------
-- ATENCAO: nao use "set role powerbi_readonly" aqui. O usuario postgres
-- do Supabase NAO e superusuario -- ele cria o role, mas nao pode assumir
-- a identidade dele, e o SQL Editor responde
--
--   ERROR 42501: permission denied to set role "powerbi_readonly"
--
-- ...o que parece falha do script, e nao e. A conferencia abaixo prova a
-- mesma coisa sem assumir o role:
--
--   select (select count(*) from pg_views where schemaname = 'bi')            as views_criadas,
--          (select count(*) from pg_roles where rolname = 'powerbi_readonly') as role_existe,
--          (select count(*) from information_schema.role_table_grants
--            where grantee = 'powerbi_readonly' and table_schema = 'bi')      as permissoes,
--          (select count(*) from bi.fato_ag_contagem)                         as linhas_ag,
--          (select count(*) from bi.fato_quiz_participacao)                   as linhas_quiz,
--          (select count(*) from bi.fato_comunicado)                          as linhas_comunicado;
--
-- Esperado: views_criadas = 35, role_existe = 1, permissoes > 0.
-- (Eram 26 ate 22/08/2026. Entraram fato_feedback_cidade,
-- fato_comunicado_agenda e as demais views acrescentadas desde entao --
-- se este numero vier MENOR que o de views, faltou rodar o 01 ou o
-- recorte 09-atualizacao-23-08-2026.sql ate o fim.)
-- As colunas de linhas sao o volume real do app -- zero ali significa que
-- ainda nao ha lancamento, e nao falta de permissao.
--
-- E confira que o caminho fechado continua fechado. Aqui a pergunta nao e
-- "o select falha?" e sim "existe grant?", que e o que de fato importa:
--
--   select count(*) as deve_ser_zero
--     from information_schema.role_table_grants
--    where grantee = 'powerbi_readonly' and table_schema = 'public';
--
-- Se quiser mesmo testar assumindo o role, e preciso virar membro dele
-- antes. Isso e mudanca de privilegio -- desfaca depois:
--
--   grant powerbi_readonly to current_user;
--   set role powerbi_readonly;
--   select count(*) from bi.fato_ag_contagem;
--   reset role;
--   revoke powerbi_readonly from current_user;

-- ------------------------------------------------------------------
-- 5) O QUE DIGITAR NO POWER BI
-- ------------------------------------------------------------------
-- Servidor:  aws-0-<regiao>.pooler.supabase.com:5432   (Session Pooler)
-- Banco:     postgres
-- Usuario:   powerbi_readonly.<project-ref>
--            ^ o sufixo com o project-ref e OBRIGATORIO no Session
--              Pooler. Sem ele o pooler nao sabe para qual projeto
--              rotear e a autenticacao falha com "Tenant or user not
--              found" -- que parece senha errada, mas nao e.
--              Pela Direct Connection (db.<ref>.supabase.co), o usuario
--              e so "powerbi_readonly".
-- Senha:     a que voce definiu no passo 1
-- Conexao criptografada: marcada
-- Modo:      Importar
--
-- No Navegador, marque APENAS o esquema "bi". As tabelas de public nao
-- vao devolver dado nenhum para este usuario, e listar as duas coisas so
-- confunde na hora de atualizar o modelo.
