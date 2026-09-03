-- ==================================================================
-- 091 - QUEM TEM O PERFIL PASSA A SER REGISTRADO, NAO DEDUZIDO
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- A tela de Perfis de Acesso respondia "quem tem este perfil?" por
-- CONTINENCIA: era considerado do perfil quem tivesse todas as permissoes
-- dele. Parecia esperto e estava errado.
--
-- O defeito aparece com quem tem MUITO acesso. Um administrador contem
-- qualquer perfil pequeno por definicao, entao ele aparecia em todos --
-- sem nunca ter recebido nenhum. Relatado pelo dono em 03/09/2026: ao
-- criar o perfil "Conferente" a partir de um colaborador, a lista ja
-- nasceu com quatro pessoas que ele nao tinha informado, e nao havia como
-- tirar nenhuma delas: nao havia o que tirar, era uma conta refeita a
-- cada abertura da tela.
--
-- Perfil aplicado e um FATO, com data e autor -- nao uma coincidencia de
-- permissoes. Esta tabela guarda esse fato.
--
-- O que ela NAO e: uma segunda fonte de permissao. Quem manda continua
-- sendo lideranca_permissoes, exatamente como antes. Esta tabela so
-- responde "a quem isto foi aplicado", e apagar uma linha daqui nao tira
-- acesso de ninguem (ver "Tirar do perfil" na tela, que diz isso).

create table if not exists public.perfil_pessoas (
  perfil_id uuid not null references public.perfis_acesso(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  aplicado_em timestamptz not null default now(),
  aplicado_por uuid references auth.users(id) on delete set null,
  primary key (perfil_id, colaborador_id)
);

-- A tela pergunta sempre "quem esta neste perfil".
create index if not exists perfil_pessoas_perfil_idx
  on public.perfil_pessoas (perfil_id);

-- E, ao abrir uma pessoa, "de quais perfis ela e".
create index if not exists perfil_pessoas_pessoa_idx
  on public.perfil_pessoas (colaborador_id);

-- RLS ligada e nenhuma politica, igual as outras tabelas de acesso: quem
-- le e escreve e o servidor, por acao que confere quem pediu.
alter table public.perfil_pessoas enable row level security;

comment on table public.perfil_pessoas is
  'A quem cada perfil foi aplicado. Nao concede nada: quem concede e lideranca_permissoes.';

notify pgrst, 'reload schema';
