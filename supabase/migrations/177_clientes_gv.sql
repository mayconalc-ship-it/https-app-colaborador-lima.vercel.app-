-- ==================================================================
-- 177 -- O GV DE CADA PDV NA BASE DE CLIENTES (10/11/2026, pedido do dono)
--
-- "No link não preciso do campo de GV: o sistema pega pelo código do PDV."
-- A base do Promax traz a coluna "GV VDE" (001, 002, 003...; 009 = sem GV
-- na carteira). O import passa a guardá-la aqui, sem zeros à frente, e o
-- envio das prioridades grava o GV do PDV, com o nome da lista de GVs de
-- Configuração › Prioridades dos GVs.
--
-- Rodar ANTES do push. Depois do push, importar a base de novo em Fontes
-- de Dados para a coluna se preencher.
-- ==================================================================

alter table public.pa_pdv_clientes add column if not exists gv_codigo text;
