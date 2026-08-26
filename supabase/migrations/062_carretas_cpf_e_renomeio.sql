-- ==================================================================
-- 062 - CARRETAS: CPF em motorista/empilhador, renomeio da Portaria
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- CPF fica NULLABLE no banco de propósito -- quem já estava cadastrado
-- antes desta migration (ex.: os "teste" usados na validação) não pode
-- virar linha quebrada. Nome completo e CPF obrigatórios são regra da
-- APLICAÇÃO (ver salvarMotorista/salvarEmpilhador), não do banco --
-- mesmo padrão que o resto do cadastro deste módulo já usa.

alter table public.pa_motoristas
  add column if not exists cpf text;
alter table public.pa_empilhadores
  add column if not exists cpf text;

-- "Portaria" (nome dado na 061) virou "Recebimento de Carreta" -- o
-- emoji de porteiro (👮) no lugar do genérico de "entrada" (🛂). UPDATE
-- de novo porque o INSERT original (057) só roda uma vez, e a 061 já
-- tinha corrigido pra um nome intermediário.
update public.menu_itens set titulo = 'Recebimento de Carreta', emoji = '👮'
  where chave = 'carretas-portaria';

notify pgrst, 'reload schema';
