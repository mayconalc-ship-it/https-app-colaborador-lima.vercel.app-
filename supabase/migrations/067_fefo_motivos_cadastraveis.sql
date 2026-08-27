-- ==================================================================
-- 067 - FEFO: motivos viram cadastro, em vez de lista fixa no codigo
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Na 066 os quatro tipos de quebra vieram travados num CHECK, tirados
-- do Padrao de Gestao de FEFO. Pedido do dono (27/08/2026): motivo novo
-- tem que poder nascer no proprio app, sem esperar deploy -- a operacao
-- descobre caso novo antes de qualquer um lembrar de pedir codigo.
--
-- Nenhuma ocorrencia foi gravada ainda e ninguem tem o modulo liberado,
-- entao da para trocar a coluna limpo: sai o texto com CHECK, entra a
-- FK para o catalogo. Sem dado para converter, sem coluna legada.

create table if not exists public.pa_fefo_motivos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nome text not null,
  -- A frase que explica quando usar aquele motivo. Aparece embaixo da
  -- opcao na hora de informar: sem isso, duas pessoas classificam a
  -- mesma quebra de jeitos diferentes e o agrupamento nao serve.
  ajuda text,
  emoji text,
  ordem smallint not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint pa_fefo_motivo_unico unique (revenda_id, nome)
);

create index if not exists pa_fefo_motivos_revenda_idx
  on public.pa_fefo_motivos (revenda_id, ativo, ordem);

alter table public.pa_fefo_motivos enable row level security;

drop policy if exists "le motivos fefo da revenda" on public.pa_fefo_motivos;
create policy "le motivos fefo da revenda" on public.pa_fefo_motivos
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Escrita so pelo servidor (service role), como os demais catalogos do
-- armazem: quem cadastra passa pelo Admin, que ja confere permissao.

-- ------------------------------------------------------------------
-- Semente: os quatro motivos do padrao, em cada revenda que ja existe.
-- Revenda nova comeca vazia e cadastra os proprios -- de proposito, e o
-- ponto do pedido: a lista deixou de ser fixa.
-- ------------------------------------------------------------------
insert into public.pa_fefo_motivos (revenda_id, nome, ajuda, emoji, ordem)
select r.id, m.nome, m.ajuda, m.emoji, m.ordem
from public.revendas r
cross join (
  values
    ('Pegaram o palete de data mais longa',
     'Existe outro palete do mesmo produto com validade menor, e o que estava sendo usado e o de data mais longa.',
     E'\U0001F4C5', 1),
    ('Palete sem NRI (ou NRI incompleta)',
     'O padrao exige a NRI impressa e colada em pelo menos tres lados do palete, com a validade visivel.',
     E'\U0001F3F7', 2),
    ('Menos de 45 dias, sem segregacao',
     'Produto com menos de 45 dias de validade deveria estar segregado, conforme as regras do padrao.',
     E'\U000023F3', 3),
    ('Deveria estar bloqueado e nao estava',
     'Faltou a trava pallet no palete de data mais longa ou no produto proximo do vencimento.',
     E'\U0001F513', 4)
) as m(nome, ajuda, emoji, ordem)
on conflict (revenda_id, nome) do nothing;

-- ------------------------------------------------------------------
-- A ocorrencia passa a apontar para o catalogo.
-- ------------------------------------------------------------------
alter table public.pa_fefo_ocorrencias
  drop constraint if exists pa_fefo_ocorrencias_tipo_check;

alter table public.pa_fefo_ocorrencias
  drop column if exists tipo;

alter table public.pa_fefo_ocorrencias
  add column if not exists motivo_id uuid references public.pa_fefo_motivos(id) on delete restrict;

-- A tabela esta vazia, entao da para exigir o motivo de saida -- sem
-- isso a ocorrencia nasceria sem classificacao e o agrupamento por
-- motivo (a razao de existir do cadastro) ficaria furado.
do $$
begin
  if not exists (select 1 from public.pa_fefo_ocorrencias) then
    alter table public.pa_fefo_ocorrencias alter column motivo_id set not null;
  end if;
end $$;

create index if not exists pa_fefo_ocorrencias_motivo_idx
  on public.pa_fefo_ocorrencias (motivo_id);

notify pgrst, 'reload schema';
