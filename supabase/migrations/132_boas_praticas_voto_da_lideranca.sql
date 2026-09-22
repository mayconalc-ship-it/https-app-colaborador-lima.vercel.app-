-- ==================================================================
-- 132 -- BOAS PRATICAS: A VOTACAO E DA LIDERANCA (22/09/2026)
-- ==================================================================
-- Pedido do dono: o colaborador votando da margem a conflito entre areas
-- e a voto por afinidade. Quem vota agora e so a lideranca -- a do app
-- vota pelo celular; a que nao esta no app (ou nao consegue votar nele)
-- tem o voto LANCADO por quem conduz o programa, com o nome de quem votou
-- e de quem lancou.
--
-- A regra de quem vota fica no servidor (o papel da pessoa). Aqui o banco
-- guarda o voto lancado e garante UM voto por lider, venha do celular ou
-- do lancamento: os dois caminhos gravam a mesma chave do nome
-- (eleitor_chave), e ela e unica por votacao.
--
-- Nenhum voto existia quando esta migration foi escrita (a primeira
-- votacao ainda nao tinha sido aberta).
-- ==================================================================

-- O voto lancado nao tem conta no app.
alter table public.boas_praticas_votos
  alter column colaborador_id drop not null;

alter table public.boas_praticas_votos
  add column if not exists eleitor_nome text,
  add column if not exists eleitor_chave text,
  add column if not exists registrado_por_id uuid references auth.users(id) on delete set null,
  add column if not exists registrado_por_nome text;

-- Todo voto tem dono: a conta do app ou o nome lancado.
alter table public.boas_praticas_votos
  drop constraint if exists boas_praticas_voto_tem_eleitor;
alter table public.boas_praticas_votos
  add constraint boas_praticas_voto_tem_eleitor
  check (colaborador_id is not null or (eleitor_nome is not null and eleitor_chave is not null));

alter table public.boas_praticas_votos
  drop constraint if exists boas_praticas_eleitor_nome_tamanho;
alter table public.boas_praticas_votos
  add constraint boas_praticas_eleitor_nome_tamanho
  check (eleitor_nome is null or char_length(eleitor_nome) between 3 and 80);

-- Um voto por lider por votacao, pelos dois caminhos.
create unique index if not exists boas_praticas_um_voto_por_eleitor
  on public.boas_praticas_votos (votacao_id, eleitor_chave)
  where eleitor_chave is not null;
