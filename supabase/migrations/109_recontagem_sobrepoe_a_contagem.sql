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
-- As recontagens ja atendidas antes desta migration deixaram a linha
-- antiga somando. O update abaixo marca como substituida toda contagem
-- que: e do mesmo dia e da mesma combinacao que uma recontagem atendida,
-- e ANTERIOR a linha que atendeu o pedido, e ainda nao foi marcada.
--
-- `tipo`/`status` nulos no pedido significam "qualquer" (ver 024), e o
-- `is not distinct from` respeita isso sem escrever dois casos.

update public.ag_contagens antiga
   set substituida_em = now(),
       substituida_por = nova.id
  from public.ag_recontagens r
  join public.ag_contagens nova on nova.id = r.atendida_contagem_id
 where r.atendida_em is not null
   and antiga.revenda_id = r.revenda_id
   and antiga.data = nova.data
   and antiga.formato = r.formato
   and (r.tipo is null or antiga.tipo = r.tipo)
   and (r.status is null or antiga.status = r.status)
   and antiga.id < nova.id
   and antiga.substituida_em is null;

-- Confira: quantas contagens ficaram fora do total, e de quais dias.
select data, count(*) as contagens_substituidas
  from public.ag_contagens
 where substituida_em is not null
 group by data
 order by data desc;
