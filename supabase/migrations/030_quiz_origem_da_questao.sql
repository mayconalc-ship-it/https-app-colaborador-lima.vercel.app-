-- ==================================================================
-- 030 - DE ONDE SAIU A PERGUNTA
-- Execute no Supabase: SQL Editor > New query > colar > Run
-- ==================================================================
-- Uma coluna so, e ela existe por causa da geracao automatica.
--
-- Quando a pergunta e escrita por uma pessoa, a origem esta na cabeca
-- de quem escreveu. Quando ela e gerada a partir do arquivo do padrao,
-- a liderança precisa conferir se a resposta bate com o documento --
-- e conferir sem o trecho na frente vira leitura de fe.
--
-- Entao a geracao e obrigada a devolver a passagem do padrao que
-- sustenta a resposta, e ela fica guardada aqui. Serve na revisao,
-- antes de publicar, e depois como procedencia: daqui a um ano ainda
-- da para saber de que parte do padrao a pergunta veio.
--
-- Fica nulo na pergunta cadastrada a mao, que e o certo: ninguem deve
-- ser obrigado a copiar trecho para digitar uma pergunta que ja sabe.

alter table public.quiz_questoes
  add column if not exists origem_trecho text;

notify pgrst, 'reload schema';
