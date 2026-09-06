-- ==================================================================
-- 103 - Blitz: conserta o que a 100 revisada nao conseguiu aplicar
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- ACHADO EM 06/09/2026, testando a corrente da blitz de ponta a ponta
-- contra o banco. O erro e meu, e a armadilha vale ficar escrita:
--
-- A 100 foi rodada DUAS vezes. Entre uma e outra eu a REESCREVI (commit
-- "Blitz: a carreta primeiro, o motorista no cruzamento, e o checklist na
-- lingua da doca"), a pedido do dono. So que a segunda passada nao
-- aplicou quase nada:
--
--   * `create table IF NOT EXISTS` pulou as tabelas inteiras -- entao as
--     colunas novas (`gatilho_dimensao`, `gatilho_nome` em pa_blitz;
--     `grupo` em pa_blitz_itens) NUNCA foram criadas;
--   * o seed com `on conflict (revenda_id, pergunta) DO NOTHING` nao
--     tocou nas perguntas antigas, porque a chave e o TEXTO da pergunta:
--     as 13 novas nao entraram e as 8 velhas continuaram.
--
-- Resultado no banco: pa_blitz sem as duas colunas que o codigo grava --
-- ou seja, ABRIR UMA BLITZ FALHARIA no primeiro conferente que tentasse
-- -- e o checklist ainda com "Carga estivada corretamente", o termo que o
-- dono pediu para trocar ("estiva, nao sei o que significa").
--
-- LICAO, para as proximas: migration ja rodada nao se reescreve. Corrige-
-- se com uma nova, que e o que esta aqui.
--
-- Nenhuma blitz foi realizada ainda (0 blitz, 0 respostas na base), entao
-- trocar as perguntas nao apaga historico de ninguem.

-- ------------------------------------------------------------------
-- 1) AS COLUNAS QUE FALTARAM
-- ------------------------------------------------------------------
-- QUAL DAS TRES DIMENSOES ESTOUROU, e com que nome. Sem isto o relato de
-- ocorrencia diria "avaria acima do limite" sem dizer se o problema e a
-- placa, o motorista ou a frota -- que sao tres acoes diferentes.
alter table public.pa_blitz
  add column if not exists gatilho_dimensao text,
  add column if not exists gatilho_nome text;

alter table public.pa_blitz
  drop constraint if exists pa_blitz_gatilho_dimensao_check;
alter table public.pa_blitz
  add constraint pa_blitz_gatilho_dimensao_check
  check (gatilho_dimensao is null
         or gatilho_dimensao in ('carreta', 'motorista', 'transportadora'));

-- O BLOCO a que a pergunta pertence. Doze perguntas numa lista corrida no
-- celular, na doca, viram rolagem; agrupadas, o conferente confere andando
-- pela carreta na ordem em que ele anda.
alter table public.pa_blitz_itens
  add column if not exists grupo text;

-- ------------------------------------------------------------------
-- 2) O CHECKLIST NA LINGUA DA DOCA
-- ------------------------------------------------------------------
-- Fora as 8 antigas, genericas demais e com termo tecnico. Seguro porque
-- nao ha nenhuma resposta gravada -- e `on delete set null` na FK da
-- resposta protegeria o historico de qualquer jeito, ja que a resposta
-- guarda o TEXTO da pergunta, nao so a chave.
delete from public.pa_blitz_itens
 where pergunta in (
   'Lona e amarracao em bom estado?',
   'Assoalho da carreta integro e limpo?',
   'Carga estivada corretamente?',
   'Lacre integro e conferido com a nota?',
   'Ausencia de infiltracao ou umidade?',
   'Veiculo sem odor ou contaminacao?',
   'Temperatura adequada (quando aplicavel)?',
   'Motorista com EPI e em condicoes de operar?'
 );

-- ESCRITO NA CAUSA, E NA LINGUA DA DOCA. Ajuste do dono (05/09/2026):
--   - "Carga estivada corretamente" virou "Carga travada, sem palete
--     tombado nem vao sobrando" -- diz o que olhar, nao o termo tecnico;
--   - "Lona e amarracao" (uma pergunta so, generica demais) virou QUATRO:
--     grade, asa delta, lona e cinta. Sao as maiores causas de avaria da
--     operacao, e uma pergunta unica nao diz ao transportador o que
--     consertar;
--   - entraram os paletes, as pontas de ferro e o "sinal de que a carga
--     andou" -- este ultimo e a pista de CONDUCAO, o cruzamento com o
--     motorista.
insert into public.pa_blitz_itens (revenda_id, grupo, pergunta, ajuda, ordem)
select r.id, i.grupo, i.pergunta, i.ajuda, i.ordem
from public.revendas r
cross join (
  values
    ('Asa delta e grade', 'Grades laterais completas e travadas?',
     'Grade faltando, entortada, pino ou trava quebrada. E por ai que o palete anda e a carga bate.', 1),
    ('Asa delta e grade', 'A asa delta abre e fecha travando por completo?',
     'Roldana emperrada, trilho torto, asa que nao fecha de vez: a carga vai batendo na lateral o caminho inteiro.', 2),
    ('Asa delta e grade', 'Lona sem rasgo e bem esticada?',
     'Rasgo, furo, ou lona bamba que chicoteia e vai raspando na carga.', 3),
    ('Asa delta e grade', 'Cintas e catracas suficientes e sem desgaste?',
     'Cinta puida ou cortada, catraca que nao prende, carga com menos cinta do que precisa.', 4),

    ('Assoalho e estrutura', 'Assoalho sem tabua solta, prego ou parafuso para fora?',
     'Tabua bailando, prego levantado, buraco. Fura a embalagem de baixo e derruba o palete.', 5),
    ('Assoalho e estrutura', 'Carroceria sem ponta de ferro ou aresta cortante?',
     'Rebite solto, cantoneira torta, ferro exposto na lateral ou no teto.', 6),
    ('Assoalho e estrutura', 'Piso limpo e seco, sem resto de carga anterior?',
     'Caco de vidro, liquido derramado, papelao molhado, sujeira da viagem passada.', 7),
    ('Assoalho e estrutura', 'Sem infiltracao, umidade ou cheiro forte?',
     'Marca de agua no teto, mofo, cheiro de combustivel ou de produto de limpeza.', 8),

    ('Carga', 'Carga travada, sem palete tombado nem vao sobrando?',
     'Palete torto, carga encostada na porta, espaco vazio que deixa o palete andar na curva.', 9),
    ('Carga', 'Paletes em bom estado, sem tabua quebrada?',
     'Palete rachado, tabua faltando, palete que nao aguenta o proximo empilhamento.', 10),
    ('Carga', 'Carga sem sinal de que andou na viagem?',
     'Filme rasgado, caixa amassada no canto, garrafa quebrada no piso. E a pista de freada brusca ou de carga mal travada.', 11),

    ('Documento e seguranca', 'Lacre inteiro e igual ao da nota?',
     'Lacre rompido, ausente, ou com numero diferente do documento.', 12),
    ('Documento e seguranca', 'Motorista com EPI e em condicoes de operar?',
     'Calcado fechado, colete, e condicao de trabalhar com seguranca.', 13)
) as i(grupo, pergunta, ajuda, ordem)
on conflict (revenda_id, pergunta) do update
  set grupo = excluded.grupo,
      ajuda = excluded.ajuda,
      ordem = excluded.ordem,
      ativo = true;

notify pgrst, 'reload schema';

-- Confira: 13 perguntas por revenda, todas com grupo, e as colunas do
-- gatilho existindo.
select
  (select count(*) from public.pa_blitz_itens) as perguntas,
  (select count(*) from public.pa_blitz_itens where grupo is null) as sem_grupo,
  (select count(*) from public.pa_blitz_itens where pergunta ilike '%estivada%') as com_termo_antigo;
