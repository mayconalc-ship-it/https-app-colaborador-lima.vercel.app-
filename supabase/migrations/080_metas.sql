-- ==================================================================
-- 080 - METAS: a regua de cada indicador, cadastrada pela operacao
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono, 30/08/2026: tudo que compara realizado contra meta
-- passa a ter a meta cadastrada em Admin > Metas, e os cartoes se pintam
-- sozinhos (verde batendo, vermelho nao, com a diferenca no canto).
--
-- Tabela GENERICA de proposito: chave + valor. Cada meta nova vira uma
-- linha no catalogo em lib/metas.ts, sem migration. O contrario -- uma
-- coluna por meta -- pediria deploy de banco toda vez que a operacao
-- quisesse medir mais uma coisa.
--
-- O QUE NAO ENTRA AQUI: as metas que ja existem e ja funcionam --
-- pa_produtos.meta_reepack_hora (por produto),
-- pa_embalagens_despejo.meta_litros_hora (por embalagem),
-- pa_recebimento_config.tma_alvo_minutos e devolucao_config.meta_pct.
-- Elas continuam onde estao; a tela de Metas le e grava nas tres fontes.
-- Mover qualquer uma quebraria o calculo que ja roda, sem ganhar nada.

create table if not exists public.pa_metas (
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  -- A chave vem do catalogo em lib/metas.ts. Texto livre no banco de
  -- proposito: um check com a lista fixa obrigaria migration a cada meta
  -- nova, que e exatamente o que esta tabela existe para evitar.
  chave text not null,
  -- Sem meta cadastrada NAO existe linha. Nulo aqui seria um terceiro
  -- estado ("cadastrei o vazio") que nao quer dizer nada.
  valor numeric(12,4) not null check (valor >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_por_nome text,
  primary key (revenda_id, chave)
);

comment on table public.pa_metas is
  'Metas escalares por revenda. Chave definida em src/lib/metas.ts (CATALOGO_DE_METAS).';

-- -------------------- RLS --------------------
alter table public.pa_metas enable row level security;

-- Quem enxerga a revenda le a meta: o cartao do colaborador precisa dela
-- para saber se pinta de verde. Esconder a meta faria o app mostrar cor
-- sem dizer contra o que.
drop policy if exists "le metas da revenda" on public.pa_metas;
create policy "le metas da revenda" on public.pa_metas
  for select to authenticated
  using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()));

-- Gravar so pela tela de Admin, que usa o cliente de servico. Sem
-- politica de insert/update, ninguem escreve daqui de fora.

-- -------------------- LIBERA O MODULO --------------------
-- A barra lateral do Admin so mostra o que esta em revenda_modulos.
-- Toda revenda que usa o armazem cadastra metas -- por isso o filtro e
-- por produtividade-armazem, e nao um id fixo de revenda.
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select distinct rm.revenda_id, 'metas', true
from public.revenda_modulos rm
where rm.modulo in ('produtividade-armazem', 'devolucao')
  and rm.ativo
on conflict (revenda_id, modulo) do update set ativo = true;

notify pgrst, 'reload schema';

-- Confira: uma linha por revenda que vai cadastrar metas.
select r.nome, rm.modulo, rm.ativo
from public.revenda_modulos rm
join public.revendas r on r.id = rm.revenda_id
where rm.modulo = 'metas';
