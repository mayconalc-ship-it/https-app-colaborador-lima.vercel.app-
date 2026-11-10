-- ==================================================================
-- 176 -- PRIORIDADE DE PDV NOVO E ORDEM DAS PRIORIDADES
-- (10/11/2026, pedidos do dono)
--
-- 1) "No link das prioridades preciso deixar passar PDV novo: um campo
--    que consiga marcar como PDV novo e aceitar o envio."
--    PDV novo ainda não está na base de clientes (Fontes de Dados), então
--    o código fora da base é o esperado, não erro de digitação. A marca
--    fica na linha para a Gestão e o Gestor LOG não tratarem como código
--    errado; o nome (nome_pdv) é o que o GV escreveu, quando escreveu.
--
-- 2) "Dentro do modo liderança, preciso que deixe organizar a ordem das
--    prioridades." A ordem é por dia de entrega, montada na Gestão
--    (Subir/Descer). Nula = ainda não mexida: vale a ordem de envio, e o
--    que chega depois entra no fim.
--
-- Rodar ANTES do push: o envio e as listas já leem estas colunas.
-- ==================================================================

alter table public.prioridades add column if not exists pdv_novo boolean not null default false;
alter table public.prioridades add column if not exists ordem integer;
