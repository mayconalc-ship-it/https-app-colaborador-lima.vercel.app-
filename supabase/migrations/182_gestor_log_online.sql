-- ==================================================================
-- 182 - GESTOR LOG ONLINE (etapa 1: a base compartilhada)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- Pode rodar mais de uma vez (nao duplica).
-- ==================================================================
-- Pedido do dono (19/11/2026): usar o Gestor LOG online, com a base no
-- Supabase, em vez do arquivo aberto em cada computador.
--
-- O programa continua o mesmo (o HTML do Gestor LOG, servido em
-- /gestor-log para quem tem o modulo). O que muda e onde a base mora:
-- cada "chave" que antes ficava so no navegador (fontes:BAR, pedidos:SF,
-- reposicao:BAR...) vira um arquivo .json.gz no bucket privado
-- gestor-log, e esta tabela diz qual e a versao atual de cada uma.
--
-- Arquivo, e nao linha por linha: os relatorios do Promax tem ~100 mil
-- linhas, e o programa sempre le a chave inteira. Um arquivo compactado
-- por chave e o mais barato em trafego (o navegador so baixa de novo o
-- que mudou) e o envio vai direto para o Storage (link assinado), sem
-- passar pelo limite de 4,5 MB das rotas da Vercel.
--
-- Sem politica de RLS de proposito: so as rotas do app (chave de servico)
-- leem e gravam, depois de conferir o modulo e a revenda da pessoa.

create table if not exists public.gestor_log_dados (
  chave              text primary key,
  versao             bigint not null,
  caminho            text not null,
  tamanho            integer,
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid references public.profiles(id) on delete set null,
  atualizado_por_nome text
);

alter table public.gestor_log_dados enable row level security;

-- Bucket privado. 200 MB por arquivo: a maior chave (base do planner de
-- uma revenda) passa pouco de 1 MB compactada; a folga e para crescer.
insert into storage.buckets (id, name, public, file_size_limit)
values ('gestor-log', 'gestor-log', false, 209715200)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- O modulo ligado nas duas revendas: revenda_modulos e conferido ANTES da
-- concessao da pessoa (sem esta linha ninguem abre, nem o dono).
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'gestor-log', true
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe',
  'fc365d16-ccbd-4322-ae02-e992a36861e8'
)
on conflict (revenda_id, modulo) do update set ativo = true;

notify pgrst, 'reload schema';

-- Conferencia: a tabela (0 linhas no comeco), o bucket privado e o modulo nas 2 revendas.
select 'tabela' as item, count(*)::text as valor from public.gestor_log_dados
union all
select 'bucket publico?', public::text from storage.buckets where id = 'gestor-log'
union all
select 'revendas com o modulo', count(*)::text from public.revenda_modulos where modulo = 'gestor-log' and ativo;
