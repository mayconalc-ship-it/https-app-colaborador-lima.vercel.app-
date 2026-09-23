-- ==================================================================
-- 134 - BOAS PRATICAS: VOTO PELO LINK DO GRUPO (23/09/2026)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono: mandar um link no grupo de WhatsApp para as pessoas
-- votarem nas boas praticas, um voto por pessoa. Quem abre o link
-- escreve o NOME e os 3 PRIMEIROS DIGITOS DO CPF -- e esses digitos sao
-- conferidos contra o cadastro quando a pessoa existe no app.
--
--   token_publico: o endereco secreto da votacao (/votar/<token>).
--                  Sem token, nao ha link -- a votacao segue so no app.
--   eleitor_doc:   os 3 digitos informados (nunca o CPF inteiro).
--   origem:        'app' (celular), 'lancado' (liderança lançou) ou
--                  'link' (grupo de WhatsApp).
--
-- Um voto por pessoa continua garantido pelo indice unico da 132
-- (votacao_id + eleitor_chave, o nome normalizado), valendo para os tres
-- caminhos.

alter table public.boas_praticas_votacoes
  add column if not exists token_publico text;

create unique index if not exists boas_praticas_votacoes_token_idx
  on public.boas_praticas_votacoes (token_publico)
  where token_publico is not null;

alter table public.boas_praticas_votos
  add column if not exists eleitor_doc text,
  add column if not exists origem text;

alter table public.boas_praticas_votos
  drop constraint if exists boas_praticas_voto_doc_tres_digitos;
alter table public.boas_praticas_votos
  add constraint boas_praticas_voto_doc_tres_digitos
  check (eleitor_doc is null or eleitor_doc ~ '^[0-9]{3}$');

alter table public.boas_praticas_votos
  drop constraint if exists boas_praticas_voto_origem;
alter table public.boas_praticas_votos
  add constraint boas_praticas_voto_origem
  check (origem is null or origem in ('app', 'lancado', 'link'));

notify pgrst, 'reload schema';

-- Confira: as colunas novas.
select column_name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'boas_praticas_votacoes' and column_name = 'token_publico')
    or (table_name = 'boas_praticas_votos' and column_name in ('eleitor_doc', 'origem')));
