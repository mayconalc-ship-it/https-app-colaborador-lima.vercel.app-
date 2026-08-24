-- ==================================================================
-- CONFERENCIA DE ACENTOS DO ESQUEMA bi
-- ==================================================================
-- Rode DEPOIS de aplicar 01-camada-semantica.sql. Nao altera nada --
-- sao tres selects.
--
-- POR QUE ISTO EXISTE
--
-- Os rotulos que o relatorio mostra ("Ótima", "Março", "Veículo",
-- "Comunicação", "Porquê 3") nao vem das tabelas do app: eles sao
-- literais escritos DENTRO das views deste esquema. E quando o SQL e
-- colado no SQL Editor a partir de um clipboard lido como ANSI, esses
-- literais entram quebrados -- 'Ótima' vira 'Ã“tima' e fica gravado
-- assim na definicao da view.
--
-- O estrago nao aparece como erro. O SQL roda, a view e criada, o Power
-- BI atualiza sem reclamar, e o problema so se manifesta como uma
-- palavra torta no eixo de um grafico -- meses depois, e parecendo bug
-- do Power BI. Dado que vem das TABELAS do app passa intacto, o que faz
-- o estrago parecer aleatorio: o titulo do comunicado sai certo e o
-- nome da categoria sai errado, na mesma tabela.
--
-- Ao copiar o SQL pelo PowerShell, use SEMPRE:
--   [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8) | Set-Clipboard
-- Get-Content -Raw no PowerShell 5.1 le UTF-8 sem BOM como ANSI e e
-- exatamente ele que produz o defeito.

-- ------------------------------------------------------------------
-- 1) As views com acento quebrado na definicao
-- ------------------------------------------------------------------
-- 'Ã' e 'Â' maiusculos nao aparecem em nenhum rotulo legitimo deste
-- esquema -- eles sao a assinatura do UTF-8 lido como Latin-1. Se esta
-- consulta devolver qualquer linha, aquela view foi colada quebrada:
-- rode 01-camada-semantica.sql de novo, com a leitura UTF-8 acima, e
-- em seguida 02-acesso-powerbi.sql.
-- O padrao e montado com chr(), e nao escrito como '[ÃÂ]'.
--
-- Parece rebuscado e nao e: 'Ã' e 'Â' sao eles proprios caracteres
-- acentuados, entao a consulta que procura acento quebrado chegaria
-- quebrada no banco pela mesma colagem que ela existe para vigiar --
-- e devolveria linha nenhuma, dando a impressao de que esta tudo bem.
-- Aconteceu em 23/08/2026: o padrao chegou ao SQL Editor como '[AA]',
-- que casa com qualquer view que tenha a letra A.
--
-- chr(195) = Ã e chr(194) = Â. Digitos atravessam qualquer encoding.
select
  table_name as view_quebrada,
  substring(
    view_definition
    from '.{0,60}[' || chr(195) || chr(194) || '].{0,60}'
  ) as trecho
from information_schema.views
where table_schema = 'bi'
  and view_definition ~ ('[' || chr(195) || chr(194) || ']')
order by 1;

-- ------------------------------------------------------------------
-- 2) O teste positivo: os rotulos que o BI mostra
-- ------------------------------------------------------------------
-- A consulta acima acha o defeito na origem; esta confere o resultado.
-- Cada linha traz o que a view esta devolvendo HOJE. Leia a coluna
-- "valor" com os olhos: e o texto que vai aparecer no grafico.
select 'nota do feedback'    as onde, nota_rotulo      as valor from bi.fato_feedback_rota      group by 1, 2
union all
select 'mes do calendario',        mes_nome                from bi.dim_calendario                group by 1, 2
union all
select 'dia da semana',            dia_semana_nome         from bi.dim_calendario                group by 1, 2
union all
select 'categoria de causa raiz',  categoria               from bi.fato_cinco_porques            group by 1, 2
union all
select 'nivel do porque',          nivel_rotulo            from bi.fato_cinco_porques_resposta   group by 1, 2
union all
select 'aceite do motorista',      cp_aceite_rotulo        from bi.fato_feedback_rota            group by 1, 2
union all
select 'ocorrencia de rota',       ocorrencia              from bi.dim_ocorrencia_rota           group by 1, 2
union all
select 'senso do 5S',              senso_rotulo            from bi.dim_5s_pergunta               group by 1, 2
union all
select 'area organizacional',      area_rotulo             from bi.dim_colaborador               group by 1, 2
order by 1, 2;

-- ------------------------------------------------------------------
-- 3) O cruzamento feedback -> cidade, que e novo
-- ------------------------------------------------------------------
-- Nao e sobre acento: e a cobertura do cruzamento que sustenta o cartao
-- "Cidade mais critica". Se localizadas for muito menor que feedbacks,
-- a roteirizacao nao foi importada para aqueles dias -- e o painel de
-- cidade fica magro por falta de importacao, nao por melhora da
-- operacao. Importe em /admin/rotas e confira de novo.
select
  count(distinct feedback_id)                                          as feedbacks,
  count(distinct feedback_id) filter (where rota_localizada)            as localizadas,
  count(distinct cidade)      filter (where rota_localizada)            as cidades,
  round(
    100.0 * count(distinct feedback_id) filter (where rota_localizada)
          / nullif(count(distinct feedback_id), 0),
    1
  )                                                                    as pct_localizadas
from bi.fato_feedback_cidade;
