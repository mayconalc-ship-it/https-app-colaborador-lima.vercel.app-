-- ==================================================================
-- 045 - A TRAVA DA VARREDURA POR DENTRO DO APP
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- O disparo dos lembretes dependia só do GitHub Actions, e medindo as
-- execuções reais em 21/08/2026 o intervalo foi de 54 min no melhor
-- caso, ~100 min na mediana e 216 min no pior -- o `*/15` do workflow é
-- um pedido, não uma promessa.
--
-- Agora o próprio app varre a fila: toda visita de alguém logado, se a
-- última varredura foi há mais de 5 minutos, ela roda em segundo plano
-- (depois da resposta, via `after()` do Next). Durante o expediente,
-- que é quando comunicado importa, a fila anda em minutos. O GitHub
-- continua como rede de segurança para madrugada e fim de semana.
--
-- Esta tabela é a TRAVA que impede a enxurrada: sem ela, dez pessoas
-- abrindo o app no mesmo minuto fariam dez varreduras simultâneas.

create table if not exists public.cron_varreduras (
  chave text primary key,
  rodou_em timestamptz not null default now()
);

-- A trava é o próprio UPDATE condicional, não um SELECT seguido de
-- UPDATE:
--
--   update cron_varreduras set rodou_em = now()
--    where chave = 'lembretes' and rodou_em < now() - interval '5 min'
--
-- O Postgres serializa as escritas na mesma linha, então de dez
-- requisições concorrentes exatamente UMA vê a condição verdadeira e
-- leva a linha; as outras nove atualizam zero linhas e vão embora sem
-- varrer. Ler antes de escrever teria a janela clássica entre as duas
-- consultas, e todas as dez achariam que ganharam.
insert into public.cron_varreduras (chave, rodou_em)
values ('lembretes', now() - interval '1 hour')
on conflict (chave) do nothing;

-- Ninguém além da service_role tem o que fazer aqui. RLS ligada e sem
-- política nenhuma = a chave pública do app não lê nem escreve, que é
-- exatamente o desejado: quem varre é o servidor, nunca o navegador.
alter table public.cron_varreduras enable row level security;

notify pgrst, 'reload schema';
