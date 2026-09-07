-- ==================================================================
-- 106 - Mensagem pronta por categoria de particularidade
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (07/09/2026): "se achar boa a ideia de deixar mensagens
-- pre prontas para que ela possa encaminhar para o whatsapp do PDV,
-- exemplo, pdv detrator por entrega atrasada, ela informar ao pdv que o
-- pedido dele esta indo; o pdv com janela de atendimento especifico,
-- alertar esse pdv que a equipe estara realizando as entregas dentro da
-- janela".
--
-- A ideia e boa e o lugar dela e a CATEGORIA, nao a tela. Texto escrito no
-- codigo envelhece na primeira mudanca de tom da revenda e obriga um
-- deploy para trocar uma virgula; e texto digitado na hora, por quem esta
-- com quinze rotas para acompanhar, sai diferente a cada vez -- e o
-- cliente percebe. Na categoria, a lideranca escreve uma vez e todo mundo
-- manda a mesma coisa.
--
-- OS CAMPOS ENTRE CHAVES sao trocados na hora do envio:
--   {cliente}  nome do PDV          {codigo}  codigo do PDV
--   {cidade}   cidade do PDV        {janela}  o horario, por extenso
--   {aviso}    o texto da particularidade
--   {data}     a data da entrega, em dd/mm    {mapa}  o numero do mapa
-- Campo sem valor some junto com o espaco que sobraria.

alter table public.pa_pdv_categorias
  add column if not exists mensagem_modelo text;

comment on column public.pa_pdv_categorias.mensagem_modelo is
  'Mensagem pronta para o monitoramento encaminhar ao PDV. Campos entre chaves: {cliente} {codigo} {cidade} {janela} {aviso} {data} {mapa}. Vazio = a tela nao oferece o botao de enviar para esta categoria.';

-- Os textos abaixo sao um PONTO DE PARTIDA, e a lideranca edita na tela.
-- Escritos na voz de quem liga para o cliente: primeiro quem fala, depois
-- o que muda para ele, e nunca o jargao interno (nada de "PDV detrator" ou
-- "particularidade" na mensagem que o cliente le).
--
-- Nao sobrescreve o que ja foi escrito: `where mensagem_modelo is null`.

update public.pa_pdv_categorias
   set mensagem_modelo = 'Bom dia! Aqui e da Lima Logistica. Passando para avisar que a entrega do dia {data} para {cliente} esta programada e nossa equipe ja esta a caminho. Qualquer coisa, e so chamar por aqui.'
 where mensagem_modelo is null
   and nome ilike '%detrator%';

update public.pa_pdv_categorias
   set mensagem_modelo = 'Bom dia! Aqui e da Lima Logistica. A entrega de {cliente} do dia {data} sera feita dentro do horario combinado ({janela}). Se precisar ajustar alguma coisa, e so nos avisar.'
 where mensagem_modelo is null
   and nome ilike '%horario%';

update public.pa_pdv_categorias
   set mensagem_modelo = 'Bom dia! Aqui e da Lima Logistica. Nossa equipe passa em {cliente} no dia {data}. Anotamos aqui: {aviso}. Confirma para a gente se continua assim?'
 where mensagem_modelo is null
   and nome ilike '%acesso%';

update public.pa_pdv_categorias
   set mensagem_modelo = 'Bom dia! Aqui e da Lima Logistica. Estamos saindo para a entrega de {cliente} do dia {data} e avisamos assim que estivermos chegando.'
 where mensagem_modelo is null
   and nome ilike '%avisar%';

update public.pa_pdv_categorias
   set mensagem_modelo = 'Bom dia! Aqui e da Lima Logistica. Sobre a entrega de {cliente} do dia {data}: {aviso}. Podemos contar com voce nesse ponto?'
 where mensagem_modelo is null
   and nome ilike any (array['%descarga%', '%vasilhame%', '%pagamento%']);

notify pgrst, 'reload schema';

-- Confira: quais categorias ja tem mensagem e quais ficaram sem.
select nome,
       alerta_na_rota,
       case when mensagem_modelo is null then 'sem mensagem' else 'tem mensagem' end as modelo
  from public.pa_pdv_categorias
 order by ordem;
