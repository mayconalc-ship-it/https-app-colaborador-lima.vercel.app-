-- ==================================================================
-- 098 - Carretas: a lideranca pode corrigir o AG do retorno, e fica
--       registrado que foi corrigido e por quem
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (05/09/2026): "Hoje aconteceu de um conferente enviar a
-- informacao e estava incompleto. Preciso editar para que possa
-- aparecer para o empilhador a informacao correta. Essa edicao deve
-- aparecer no app como que ela foi editada e por quem editou."
--
-- Ate aqui o retorno era decidido UMA vez e so: `decidirRetorno` grava
-- com `.is("tem_carga", null)`, que trava o clique duplo e a corrida
-- entre dois conferentes -- e, sem querer, tambem trava o conserto. Um
-- item de AG esquecido pelo conferente virava um empilhador carregando
-- a carreta errada, sem saida dentro do app.
--
-- POR QUE REGISTRAR QUEM EDITOU, e nao so deixar editar: a lista de AG
-- e o que o empilhador executa. Se ela muda debaixo dele sem dizer
-- nada, a versao que ele leu ha cinco minutos deixa de valer e ele nao
-- tem como saber. O carimbo transforma a mudanca em informacao -- e
-- responde depois quem mandou carregar o que.

alter table public.atendimentos_carretas
  add column if not exists retorno_editado_em timestamptz,
  add column if not exists retorno_editado_por_id uuid,
  add column if not exists retorno_editado_por_nome text,
  -- Quantas vezes ja foi corrigido. Duas correcoes no mesmo atendimento
  -- nao sao a mesma coisa que uma, e sem o contador a segunda apagaria o
  -- rastro da primeira.
  add column if not exists retorno_edicoes smallint not null default 0;

comment on column public.atendimentos_carretas.retorno_editado_em is
  'Quando a lideranca corrigiu o AG/destino do retorno. Nulo = o que o conferente informou esta intacto.';
comment on column public.atendimentos_carretas.retorno_editado_por_nome is
  'Nome de quem corrigiu, guardado junto (e nao so o id) para o historico continuar legivel se a pessoa sair da revenda.';

notify pgrst, 'reload schema';

-- Confira: as colunas novas, e quantos atendimentos ja foram corrigidos.
select
  count(*) as atendimentos,
  count(retorno_editado_em) as com_retorno_corrigido
from public.atendimentos_carretas;
