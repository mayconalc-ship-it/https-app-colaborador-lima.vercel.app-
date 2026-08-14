-- Execute no Supabase: SQL Editor > New query > colar > Run

-- ==================================================================
-- 031 - 5 PORQUES (ANALISE DE CAUSA RAIZ)
-- ==================================================================
-- Uma tabela so: cada linha e UMA analise, do problema escolhido pelo
-- motorista ate a causa raiz (ou ate a analise ficar "em_andamento" e
-- ser abandonada -- o motorista pode fechar o app no meio do fluxo).
--
-- Ciclo de vida do lado do motorista:
--   em_andamento -> concluida
-- Ciclo de vida do lado da lideranca, independente do de cima:
--   tratativa_status: pendente -> concluida
--
-- RLS no estilo de ag_contagens: o motorista le e escreve SO a propria
-- linha, porque a analise e gravada aos poucos (iniciar -> cada
-- resposta -> finalizar), nao tudo de uma vez como o quiz. A lideranca
-- so mexe em tratativa_status/resposta_lideranca pela acao de servidor,
-- com a chave de administrador (bypassa RLS).

create table if not exists public.cinco_porques_analises (
  id bigint generated always as identity primary key,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  colaborador_id uuid not null references auth.users(id) on delete cascade,
  colaborador_nome text not null,

  -- FK opcional: o botao de entrada e avulso, nao preso ao envio do
  -- feedback rapido da rota.
  feedback_rota_id bigint references public.feedback_rota(id) on delete set null,
  rota text,

  problema_id text not null,
  problema_label text not null,

  -- Arvore de decisao devolvida pela 1a chamada de IA (ver ArvoreDecisao
  -- em src/lib/cinco-porques-ia.ts). Guardada para auditoria/depuracao;
  -- quem manda no fluxo, de fato, e o estado do cliente.
  arvore jsonb not null default '{}'::jsonb,

  -- Um item por "porque" respondido:
  -- { nivel, pergunta, opcaoId, opcaoLabel, textoLivre? }[]
  respostas jsonb not null default '[]'::jsonb,
  profundidade int not null default 0 check (profundidade between 0 and 5),

  causa_raiz text,
  categoria text check (
    categoria in (
      'pessoas', 'processo', 'rota', 'cliente', 'veiculo', 'pedido',
      'sistema', 'estoque', 'comunicacao', 'externo', 'outro'
    )
  ),
  acao_sugerida text,

  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'concluida')),
  tempo_ms bigint not null default 0,
  iniciada_em timestamptz not null default now(),
  concluida_em timestamptz,

  -- Lado da lideranca: independente do status acima. O motorista nunca
  -- ve nem define estas tres colunas -- so a tela /admin/feedbacks grava
  -- aqui, e sempre pela chave de administrador.
  tratativa_status text not null default 'pendente'
    check (tratativa_status in ('pendente', 'concluida')),
  resposta_lideranca text,
  resposta_lideranca_em timestamptz,
  resposta_lideranca_por uuid references auth.users(id) on delete set null
);

create index if not exists cinco_porques_revenda_idx
  on public.cinco_porques_analises (revenda_id, iniciada_em desc);
create index if not exists cinco_porques_pessoa_idx
  on public.cinco_porques_analises (colaborador_id, revenda_id);
create index if not exists cinco_porques_tratativa_idx
  on public.cinco_porques_analises (revenda_id, tratativa_status);

grant select, insert, update on public.cinco_porques_analises to authenticated;
grant all on public.cinco_porques_analises to service_role;

alter table public.cinco_porques_analises enable row level security;

drop policy if exists cinco_porques_ler on public.cinco_porques_analises;
create policy cinco_porques_ler on public.cinco_porques_analises
  for select to authenticated
  using (
    colaborador_id = auth.uid()
    and revenda_id in (select public.revendas_do_usuario())
  );

drop policy if exists cinco_porques_criar on public.cinco_porques_analises;
create policy cinco_porques_criar on public.cinco_porques_analises
  for insert to authenticated
  with check (
    colaborador_id = auth.uid()
    and revenda_id in (select public.revendas_do_usuario())
  );

drop policy if exists cinco_porques_atualizar on public.cinco_porques_analises;
create policy cinco_porques_atualizar on public.cinco_porques_analises
  for update to authenticated
  using (
    colaborador_id = auth.uid()
    and revenda_id in (select public.revendas_do_usuario())
  )
  with check (
    colaborador_id = auth.uid()
    and revenda_id in (select public.revendas_do_usuario())
  );

-- Sem policy de delete: nem motorista nem lideranca apagam analise.
--
-- Nota consciente: RLS por LINHA nao restringe por COLUNA -- nada nesta
-- policy impede o proprio client do motorista de tambem reescrever
-- tratativa_status/resposta_lideranca na propria linha. feedback_rota
-- ja aceita a mesma folga (nada impede reescrever nota/comentario depois
-- que a lideranca ja viu) e o app convive com esse nivel de risco hoje;
-- nao compensa criar trigger so para esta tabela.

notify pgrst, 'reload schema';
