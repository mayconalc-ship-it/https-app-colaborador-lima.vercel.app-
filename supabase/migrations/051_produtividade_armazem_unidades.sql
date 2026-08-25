-- ==================================================================
-- 051 - PRODUTIVIDADE DO ARMAZEM: unidades e conversao do despejo
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Duas coisas:
--
--   1) Reepack conta em caixa OU peca, dependendo da embalagem -- a
--      tela precisa saber qual rotulo mostrar (nao da pra supor "un").
--   2) Despejo: quem lanca conta PACOTES despejados, nao litros de
--      cabeca. O litro sai de um fator de conversao por embalagem,
--      calculado no momento do lancamento e GRAVADO -- nao e coluna
--      gerada, porque se o Admin corrigir o fator depois, os
--      lancamentos antigos precisam continuar contando o litro de
--      quando aconteceram, nao o litro recalculado com o fator novo.

alter table public.pa_embalagens
  add column if not exists unidade_reepack text not null default 'cx'
    check (unidade_reepack in ('cx', 'pc')),
  add column if not exists litros_por_pacote numeric(10,3);

alter table public.pa_despejo_lancamentos
  add column if not exists quantidade_pacotes integer;

comment on column public.pa_despejo_lancamentos.litros is
  'Calculado no lancamento: quantidade_pacotes x litros_por_pacote da embalagem NAQUELE momento. Nao recalcula se o fator mudar depois.';

notify pgrst, 'reload schema';
