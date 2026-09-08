-- ==================================================================
-- 109 - Recontagem SOBREPOE a contagem, nao soma
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Defeito relatado pelo dono (08/09/2026): "no modulo de conciliacao do
-- ativo de giro, quando e solicitada uma recontagem, o item que foi
-- recontado esta somando a contagem antiga, deixando o numero de contado
-- bem acima do que de fato era pra ser. A recontagem, como o nome ja diz,
-- e pra sobrepor e nao somar".
--
-- Ele esta certo, e o defeito e do desenho da 024: a recontagem grava uma
-- linha NOVA em ag_contagens e a antiga fica onde estava. A conciliacao
-- soma todas as linhas do dia (lib/ativo-giro.ts, funcao `conciliar`),
-- entao contar de novo 40 caixas que ja tinham sido contadas como 60
-- resultava em 100 -- um numero que nunca existiu no patio, e justamente
-- na tela que existe para achar diferenca.
--
-- A LINHA ANTIGA NAO E APAGADA. Ela e a evidencia do que foi contado da
-- primeira vez, e a diferenca entre as duas e a informacao mais util do
-- modulo: e ela que diz se o problema era contagem ou movimento de
-- estoque. Some do TOTAL, fica no HISTORICO.
--
-- CORRECAO DA PRIMEIRA VERSAO DESTE ARQUIVO (08/09/2026): ela casava as
-- linhas por `r.formato`, `r.tipo` e `r.status` do PEDIDO -- colunas que
-- a migration 028 tinha removido, quando o pedido virou texto livre. O
-- erro aparecia na hora ("column r.formato does not exist"), entao nada
-- chegou a rodar. Todos os comandos aqui sao idempotentes; rode de novo.
--
-- QUEM DIZ O QUE FOI RECONTADO E A CONTAGEM NOVA, nao o pedido. E melhor
-- assim: o pedido e uma frase que alguem escreveu ("conferir o 600ml"),
-- e a contagem que o atendeu tem tipo, formato e status exatos. E ela
-- que define o que sai da soma.

alter table public.ag_contagens
  add column if not exists substituida_em timestamptz,
  add column if not exists substituida_por bigint references public.ag_contagens(id) on delete set null;

comment on column public.ag_contagens.substituida_em is
  'Quando esta contagem foi sobreposta por uma recontagem. Preenchida = nao entra no total da conciliacao, mas continua no historico.';
comment on column public.ag_contagens.substituida_por is
  'A contagem que substituiu esta. E o par que permite mostrar "antes 60, depois 40" sem adivinhar por semelhanca.';

-- So as vivas sao somadas, e sao a maioria esmagadora: indice parcial,
-- que fica pequeno para sempre.
create index if not exists ag_contagens_vivas_idx
  on public.ag_contagens (revenda_id, data)
  where substituida_em is null;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------
-- O ESTRAGO QUE JA ESTA NO BANCO
-- ------------------------------------------------------------------
-- As recontagens ja atendidas antes desta migration deixaram as linhas
-- antigas somando. O update marca como substituida toda contagem que e da
-- mesma revenda, do mesmo dia e da MESMA combinacao (tipo, formato,
-- status) de uma contagem que atendeu um pedido de recontagem.
--
-- A RECONTAGEM VEM EM VARIAS LINHAS: o patio e contado pilha por pilha.
-- Em 04/09 o mesmo "Kit AG · 600ml · Cheio" tinha 17 linhas de tres
-- pessoas, e a recontagem entrou como outras treze. Por isso a exclusao
-- `antiga.recontagem_id is distinct from nova.recontagem_id`: sem ela uma
-- linha da recontagem sobreporia a outra e sobraria uma so -- o total
-- despencaria, com o mesmo erro que esta migration veio tirar, so que
-- para o outro lado.
--
-- Reexecutar nao duplica nada: `substituida_em is null` no fim.

update public.ag_contagens antiga
   set substituida_em = now(),
       substituida_por = nova.id
  from public.ag_contagens nova
 where nova.recontagem_id is not null
   and antiga.revenda_id = nova.revenda_id
   and antiga.data = nova.data
   and antiga.tipo = nova.tipo
   and antiga.formato = nova.formato
   and antiga.status = nova.status
   and antiga.recontagem_id is distinct from nova.recontagem_id
   and antiga.id < nova.id
   and antiga.substituida_em is null;

-- Confira: quantas contagens ficaram fora do total, e de quais dias.
select data, count(*) as contagens_substituidas
  from public.ag_contagens
 where substituida_em is not null
 group by data
 order by data desc;
