-- Execute no Supabase: SQL Editor > New query > colar > Run

-- ==================================================================
-- MINHA ROTA (pré-rota)
-- ==================================================================
-- A planilha do roteirizador fica no Drive e continua sendo a FONTE.
-- Aqui guardamos uma COPIA para consulta, porque o perfil de uso e o
-- oposto do da RV: todos os motoristas consultam na mesma meia hora,
-- antes de sair. Ler o arquivo do Google a cada consulta significaria
-- baixar e processar a planilha inteira dezenas de vezes seguidas --
-- lento para quem esta com pressa e caro para a hospedagem.
--
-- Uma linha por mapa por dia. As cidades ficam na propria linha (jsonb)
-- porque nunca sao consultadas sozinhas: quem abre a rota quer tudo junto.

create table if not exists public.rotas (
  id bigint generated always as identity primary key,
  data date not null,
  -- Sem zeros a esquerda. A planilha traz "014768" e o motorista digita
  -- "14768" -- guardamos normalizado para os dois casarem.
  mapa text not null,
  mapa_original text,

  veiculo text,
  placa text,
  motorista_codigo text,

  km_prev numeric,
  tempo_prev text,
  entregas int,
  caixas numeric,
  ocupacao_caixas numeric,
  peso numeric,
  ocupacao_peso numeric,

  armazem text,
  classificacao text,

  -- [{ "cidade": "SERRA DOURADA", "entregas": 20 }, ...]
  cidades jsonb not null default '[]',

  importado_em timestamptz not null default now(),
  importado_por uuid references auth.users(id) on delete set null,

  constraint rotas_unica unique (data, mapa)
);

create index if not exists rotas_busca_idx on public.rotas (data, mapa);
create index if not exists rotas_data_idx on public.rotas (data desc);

-- ------------------------------------------------------------------
-- Codigo do motorista no roteirizador
-- ------------------------------------------------------------------
-- A planilha identifica o motorista por um codigo proprio (000000001026),
-- que NAO e a matricula usada no app. Sem uma ponte, a tela mostraria um
-- numero sem significado. Este campo e opcional: enquanto estiver vazio,
-- o app mostra o codigo cru.
alter table public.profiles
  add column if not exists codigo_rota text;

create index if not exists profiles_codigo_rota_idx
  on public.profiles (codigo_rota) where codigo_rota is not null;

-- ------------------------------------------------------------------
-- Pasta do Drive: cadastrada UMA vez
-- ------------------------------------------------------------------
-- A liderança joga o arquivo do mes dentro da pasta e clica em atualizar.
-- Nao precisa colar link novo a cada virada de mes.
create table if not exists public.rotas_config (
  id smallint primary key default 1,
  pasta_id text,
  pasta_link text,
  ultima_sincronizacao timestamptz,
  ultimo_resultado text,
  atualizado_em timestamptz not null default now(),
  constraint rotas_config_linha_unica check (id = 1)
);

insert into public.rotas_config (id) values (1)
on conflict (id) do nothing;

alter table public.rotas_config enable row level security;

-- ------------------------------------------------------------------
-- Entra no menu do colaborador e na central de notificacoes
-- ------------------------------------------------------------------
insert into public.menu_itens (chave, titulo, emoji, href, ordem, visivel)
values ('rota', 'Minha Rota', '🚚', '/minha-rota', 7, true)
on conflict (chave) do nothing;

insert into public.notificacao_config (modulo, ativa)
values ('rotas', true)
on conflict (modulo) do nothing;

-- ------------------------------------------------------------------
-- Permissoes
-- ------------------------------------------------------------------
-- RLS ligada e NENHUMA politica: a consulta passa por uma acao de
-- servidor que confere quem esta pedindo. Assim o colaborador nunca
-- consegue baixar a tabela inteira de rotas pela chave publica do app,
-- nem alterar qualquer dado da rota.
alter table public.rotas enable row level security;

do $$
declare politica record;
begin
  for politica in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'rotas'
  loop
    execute format('drop policy %I on public.rotas', politica.policyname);
  end loop;
end $$;

notify pgrst, 'reload schema';
