-- ==================================================================
-- 115 - NOME FANTASIA na base de clientes
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (11/09/2026): a Minha Rota passa a mostrar os clientes
-- do mapa agrupados por cidade, com "codigo + Fantasia" e, abaixo,
-- bairro, endereco e telefone -- tudo tirado da base de clientes.
--
-- A base guardava um nome so, e a Razao Social ganhava da Fantasia
-- ("52.535.056 ROMARIO DOS SANTOS SILVA"), que nao e como o motorista
-- conhece o cliente. As planilhas das duas revendas trazem as duas
-- colunas; agora a Fantasia tem o lugar dela.
--
-- DEPOIS DE RODAR: em Fontes de Dados > Base de Clientes, toque em
-- "Salvar e importar" em cada revenda para a Fantasia entrar.

alter table public.pa_pdv_clientes
  add column if not exists fantasia text;

comment on column public.pa_pdv_clientes.fantasia is
  'Nome Fantasia da planilha da revenda. O nome (Razao Social) continua em "nome"; a tela prefere a Fantasia.';

notify pgrst, 'reload schema';

-- Confira: a coluna nova, vazia ate a proxima importacao.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'pa_pdv_clientes'
order by ordinal_position;
