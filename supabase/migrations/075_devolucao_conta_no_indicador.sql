-- ==================================================================
-- 075 - DEVOLUCAO: separar "de quem e" de "entra na conta"
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Na 074 as duas coisas eram um campo so: um motivo marcado como
-- "nao_conta" saia da conta, e qualquer outro entrava. Sao eixos
-- diferentes, e misturar travava a lideranca.
--
-- Exemplo do proprio dono: cancelamento por NF rejeitada e falha da
-- OPERACAO (responsabilidade), mas nao e devolucao de verdade e nao deve
-- entrar no % da revenda (conta). Com um campo so, para tirar do % era
-- preciso mentir sobre de quem foi.
--
-- Agora sao dois:
--   responsabilidade -> de quem foi (cliente / operacao / entrega)
--   conta_no_indicador -> entra ou nao no % de devolucao

alter table public.devolucao_motivos
  add column if not exists conta_no_indicador boolean not null default true;

-- Quem ja estava como "nao_conta" continua fora do indicador, agora pelo
-- campo certo. (Na pratica a tabela esta vazia -- a linha existe para o
-- caso de a 074 ja ter sido importada em outra revenda.)
update public.devolucao_motivos
   set conta_no_indicador = false
 where responsabilidade = 'nao_conta';

-- Motivo ainda nao classificado tambem fica fora ate alguem decidir:
-- nunca entra como numero de ninguem por engano.
update public.devolucao_motivos
   set conta_no_indicador = false
 where responsabilidade = 'nao_classificado';

comment on column public.devolucao_motivos.conta_no_indicador is
  'Se esta devolucao entra no % de devolucao. Independente de responsabilidade: NF rejeitada e da operacao, mas nao conta.';

notify pgrst, 'reload schema';
