-- ==================================================================
-- 108 - A base de clientes vira uma Fonte de Dados como as outras
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (08/09/2026): "transfira o modulo de base de clientes
-- para a fonte de dados".
--
-- Ele esta certo, e o lugar era errado desde o comeco. A tela de Fontes de
-- Dados existe para responder "de onde vem cada numero deste app?" -- e a
-- base de clientes e uma fonte igual ao Rating, ao Refugo e a pre-rota:
-- link do Drive, botao de atualizar, data da ultima entrada. Deixa-la
-- escondida numa aba do cadastro de particularidades fazia a tela de
-- fontes mentir por omissao, dizendo "cinco fontes" quando eram seis.
--
-- A TELA DE FONTES LE SEMPRE AS MESMAS TRES COLUNAS, em qualquer tabela de
-- config: pasta_link, ultima_sincronizacao e ultimo_resultado. Eu havia
-- inventado nomes proprios na 107 (clientes_link, clientes_importado_em),
-- e um nome proprio para o mesmo conceito obriga a tela a conhecer cada
-- caso -- que e exatamente o que aquela tela veio acabar.
--
-- A 107 NAO E REESCRITA: ela ja rodou. Renomear aqui preserva o link e a
-- data que voce ja importou.

alter table public.pa_pdv_config
  rename column clientes_link to pasta_link;

alter table public.pa_pdv_config
  rename column clientes_importado_em to ultima_sincronizacao;

-- O que a ultima importacao respondeu, na integra. A tela de fontes mostra
-- esta frase embaixo do cartao -- e ela e a que diz "1.611 com telefone e
-- 231 sem", que e o que se quer saber sem abrir mais nada.
alter table public.pa_pdv_config
  add column if not exists ultimo_resultado text;

-- Sai `clientes_total`: virou parte do `ultimo_resultado`, e um numero
-- guardado em dois lugares e um numero que um dia vai discordar de si
-- mesmo.
alter table public.pa_pdv_config
  drop column if exists clientes_total;

comment on column public.pa_pdv_config.pasta_link is
  'Link do Drive da base de clientes: arquivo, planilha do Google ou pasta. Mesmo nome de coluna das outras fontes -- a tela de Fontes de Dados le as tres iguais em todas.';

notify pgrst, 'reload schema';

-- Confira: o link e a data que voce ja importou continuam ai.
select pasta_link, ultima_sincronizacao, ultimo_resultado
  from public.pa_pdv_config;
