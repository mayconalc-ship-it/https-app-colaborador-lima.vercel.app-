-- ==================================================================
-- 095 - CONFERENCIA DE CARRETA: LOTE E VALIDADE VIRAM OPCIONAIS
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (03/09/2026), com o motivo de cada um:
--
-- VALIDADE  ha item que nao tem. Destilado de marketplace nao vence, e
--           exigir uma data obrigava o conferente a INVENTAR uma para o
--           formulario deixar salvar. Data inventada e pior que campo
--           vazio: ela entra no alerta de validade minima e vira aviso
--           de vencimento para um produto que nao vence.
--
-- LOTE      "hoje nao utilizamos essa informacao". Campo obrigatorio que
--           ninguem usa e digitacao que ninguem le -- e numa conferencia
--           de 17 itens sao 17 digitacoes inuteis, cada uma um lugar a
--           mais para o envio ser recusado e o trabalho ser perdido.
--
-- O que NAO muda: produto, quantidade, unidade e empilhador continuam
-- obrigatorios. Sao eles que dizem o que chegou e quem descarregou.
--
-- Os itens ja gravados nao mudam: afrouxar um `not null` nao mexe em
-- linha nenhuma. O que estava preenchido continua preenchido.

alter table public.atendimento_carretas_itens
  alter column lote drop not null,
  alter column validade drop not null;

comment on column public.atendimento_carretas_itens.lote is
  'Opcional desde 03/09/2026 -- a operacao nao usa a informacao.';
comment on column public.atendimento_carretas_itens.validade is
  'Opcional desde 03/09/2026 -- ha item que nao vence (destilado de marketplace).';

notify pgrst, 'reload schema';

-- Confira: as duas colunas com is_nullable = YES.
select column_name, is_nullable
from information_schema.columns
where table_name = 'atendimento_carretas_itens'
  and column_name in ('lote', 'validade');
