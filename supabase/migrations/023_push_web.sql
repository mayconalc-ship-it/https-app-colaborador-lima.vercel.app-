-- ---------------------------------------------------------------------
-- Notificações push (Web Push)
-- ---------------------------------------------------------------------
-- Guarda a "assinatura" que o navegador entrega quando a pessoa aceita
-- receber avisos. Cada assinatura pertence a um APARELHO, não a uma
-- pessoa: o mesmo colaborador que usa celular e computador tem duas.
--
-- O endpoint é a URL do serviço de push do fabricante (FCM da Google,
-- Web Push da Apple) e já identifica o aparelho de forma única -- por
-- isso ele é a chave natural da tabela.

create table if not exists public.push_inscricoes (
  id             bigserial primary key,
  colaborador_id uuid not null references auth.users (id) on delete cascade,
  -- A revenda de quem assinou fica gravada aqui para o disparo não
  -- precisar cruzar tabelas. Se a pessoa mudar de revenda, a inscrição é
  -- corrigida no próximo acesso (ver lib/push-server.ts).
  revenda_id     uuid not null references public.revendas (id) on delete cascade,
  endpoint       text not null unique,
  -- Chaves de criptografia do navegador: sem elas o push não é aceito.
  p256dh         text not null,
  auth           text not null,
  -- Ajuda a entender quem recebe e quem não recebe (iPhone que não
  -- instalou o app, por exemplo) sem perguntar de aparelho em aparelho.
  user_agent     text,
  criado_em      timestamptz not null default now(),
  usado_em       timestamptz
);

create index if not exists push_inscricoes_revenda_idx
  on public.push_inscricoes (revenda_id);
create index if not exists push_inscricoes_colaborador_idx
  on public.push_inscricoes (colaborador_id);

alter table public.push_inscricoes enable row level security;

-- Ninguém enxerga a inscrição de ninguém. O disparo roda com a service
-- role, que ignora RLS; pelo app cada um só mexe na própria assinatura.
drop policy if exists push_inscricoes_propria on public.push_inscricoes;
create policy push_inscricoes_propria on public.push_inscricoes
  for all
  to authenticated
  using (colaborador_id = auth.uid())
  with check (colaborador_id = auth.uid());

-- ---------------------------------------------------------------------
-- O interruptor é o que já existe
-- ---------------------------------------------------------------------
-- O push reaproveita notificacao_config: desligar "comunicados" numa
-- revenda cala o sino E o push juntos. Um interruptor só, sem combinação
-- surpresa entre os dois -- e nada de nova tela no Admin.
