-- ==================================================================
-- 102 - PDV bloqueado nao vai para a rota
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Correcao do dono (06/09/2026): "os PDVs bloqueados nao podem aparecer
-- para o motorista, poderia gerar ruido com o cliente, entao seria um
-- acompanhamento a parte e apareceria para a lideranca acompanhar".
--
-- Ele esta certo, e o erro era meu: semeei "PDV bloqueado" com
-- `alerta_na_rota = true` na 101. Bloqueio e assunto COMERCIAL -- entre a
-- revenda e o cliente --, e quem entrega nao e quem negocia. Um motorista
-- que sabe do bloqueio pode comentar na porta do cliente sem querer, e a
-- conversa que era da area comercial vira um problema na entrega. Pior:
-- ele nao teria o que fazer com a informacao, porque a carga daquele
-- cliente simplesmente nao existe.
--
-- NAO PRECISOU DE CODIGO NOVO. A trava ja existia: `alerta_na_rota` foi
-- criada na 101 justamente porque nem toda particularidade e do motorista
-- ("Observacao da lideranca" ja nascia assim). Aqui e so a chave virando
-- para o lado certo -- e o acompanhamento de prazos, que a lideranca ve
-- na tela do modulo, continua igual.

update public.pa_pdv_categorias
   set alerta_na_rota = false
 where nome ilike '%bloquead%';

comment on column public.pa_pdv_categorias.alerta_na_rota is
  'Falso = a particularidade NAO aparece para quem esta na rota, so para quem acompanha. E o caso do PDV bloqueado (assunto comercial: o motorista nao negocia, e comentar na porta do cliente gera ruido) e da Observacao da lideranca.';

notify pgrst, 'reload schema';

-- Confira: nenhuma categoria de bloqueio deve estar indo para a rota.
select nome, severidade, exige_prazo, alerta_na_rota
  from public.pa_pdv_categorias
 order by ordem;
