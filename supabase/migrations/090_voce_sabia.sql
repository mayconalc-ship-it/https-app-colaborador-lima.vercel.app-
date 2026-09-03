-- ==================================================================
-- 090 - "VOCE SABIA?" -- a lampada de revisao do Desafio
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Ideia do dono (03/09/2026): uma lampada no canto do app que traz, uma
-- por vez, uma pergunta do Desafio com a resposta e a explicacao. Serve
-- para a pessoa rever o que errou -- que e a unica parte do desafio que
-- ensina alguma coisa depois que a rodada fecha.
--
-- Esta tabela guarda so o que o app NAO consegue deduzir: o que cada
-- pessoa ja viu, e o que ela curtiu. Pergunta, resposta, explicacao e
-- taxa de acerto ja existem em quiz_questoes e quiz_alternativas; copiar
-- qualquer uma delas para ca criaria uma segunda versao da verdade, que
-- envelheceria sozinha quando a pergunta fosse corrigida.
--
-- POR QUE O "JA VI" E O CORACAO DA FUNCIONALIDADE, e nao um detalhe:
-- medido em 03/09/2026, existem 35 perguntas ja respondidas e apenas 10
-- com menos de 70% de acerto. Uma lampada que sorteia sem lembrar
-- repetiria o mesmo card em poucos dias, e uma peca fixa que se repete e
-- uma peca que se aprende a ignorar. E este registro que permite a
-- lampada APAGAR quando nao ha mais nada novo -- estar apagada e a
-- informacao "voce esta em dia".
--
-- A chave nao inclui revenda_id: uma questao ja pertence a uma revenda
-- (quiz_questoes.revenda_id), entao a dupla pessoa+questao nunca se
-- repete entre unidades. A coluna existe para filtrar e contar por
-- revenda sem ter de cruzar com a questao.

create table if not exists public.voce_sabia_vistos (
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  questao_id bigint not null references public.quiz_questoes(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  visto_em timestamptz not null default now(),
  -- Curtir e o unico retorno que a pessoa pode dar aqui. Nao vale ponto e
  -- nao entra em ranking nenhum de proposito: no minuto em que curtir
  -- valer ponto, ele deixa de dizer "isto me ensinou" e passa a dizer
  -- "vi que dava ponto".
  curtiu boolean not null default false,
  curtido_em timestamptz,
  primary key (colaborador_id, questao_id)
);

-- A consulta da lampada e sempre "o que esta pessoa ja viu, do mais
-- recente para o mais antigo" -- e a mais recente decide se ja houve card
-- hoje.
create index if not exists voce_sabia_vistos_pessoa_idx
  on public.voce_sabia_vistos (colaborador_id, visto_em desc);

-- Para o Admin poder perguntar depois "quais cards o time mais curtiu",
-- sem varrer a tabela inteira.
create index if not exists voce_sabia_vistos_curtidas_idx
  on public.voce_sabia_vistos (revenda_id, questao_id) where curtiu;

-- RLS ligada e NENHUMA politica, mesmo desenho de lideranca_permissoes:
-- quem usa a chave publica nao le nem escreve. Tudo passa por acao de
-- servidor, que sabe quem esta pedindo. Aqui isso importa por um motivo
-- concreto: a tabela diz o que cada pessoa errou no desafio, e isso e
-- assunto dela com o proprio aprendizado -- nao do colega ao lado.
alter table public.voce_sabia_vistos enable row level security;

comment on table public.voce_sabia_vistos is
  'O que cada pessoa ja viu e curtiu no "Voce sabia?" -- ver src/lib/voce-sabia.ts';

notify pgrst, 'reload schema';
