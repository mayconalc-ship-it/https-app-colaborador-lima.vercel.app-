-- Execute no Supabase: SQL Editor > New query > colar > Run

-- ==================================================================
-- 056 - FEEDBACK REGULAR: TRATATIVA OBRIGATORIA DA LIDERANCA
-- ==================================================================
-- Mesma ideia do 5 Porques (031/032), so que direto na linha do
-- feedback_rota: quando a nota e "Regular" (1), a linha nasce com
-- tratativa_status = 'pendente' e some da fila quando a lideranca
-- responde e marca 'concluida'. Nota "Ruim" (0) ja tem tratativa
-- propria via 5 Porques; "Boa"/"Otima" nunca entram na fila (ficam
-- com tratativa_status nulo).
--
-- resposta_lideranca_nome vai preenchido pela action, no momento da
-- resposta -- guardar o nome aqui evita o colaborador precisar de uma
-- consulta com chave de administrador so pra saber quem respondeu
-- (profiles so e legivel pelo dono da linha). Mesmo motivo pelo qual
-- cinco_porques_analises guarda colaborador_nome direto.
--
-- conta_tmr existe so por causa do backfill logo abaixo: feedback
-- "Regular" enviado ANTES desta migracao nunca teve chance de ser
-- respondido no prazo -- contar essas linhas no TMR (tempo medio de
-- resposta) inflaria a metrica por um problema que e do lancamento da
-- funcionalidade, nao da lideranca. Backfill entra na fila (pendente)
-- mas com conta_tmr = false; feedback novo, a partir de agora, nasce
-- com o default (true) e conta normalmente.

alter table public.feedback_rota
  add column if not exists tratativa_status text
    check (tratativa_status in ('pendente', 'concluida')),
  add column if not exists resposta_lideranca text,
  add column if not exists resposta_lideranca_em timestamptz,
  add column if not exists resposta_lideranca_por uuid references auth.users(id) on delete set null,
  add column if not exists resposta_lideranca_nome text,
  add column if not exists colaborador_aceitou boolean,
  add column if not exists colaborador_aceitou_em timestamptz,
  add column if not exists conta_tmr boolean not null default true;

-- Backfill: todo feedback "Regular" que ja existia antes desta migracao
-- (por isso o filtro por tratativa_status ainda nulo -- roda uma vez so,
-- sem risco de reclassificar algo que a lideranca ja tratou depois do
-- deploy) entra na fila de tratativa, mas marcado para nao contar no TMR.
update public.feedback_rota
   set tratativa_status = 'pendente',
       conta_tmr = false
 where nota = 1
   and tratativa_status is null;

create index if not exists feedback_rota_tratativa_idx
  on public.feedback_rota (revenda_id, tratativa_status)
  where tratativa_status is not null;

-- O mesmo campo passa a existir tambem do lado do 5 Porques, pelo
-- mesmo motivo: hoje a tela do motorista mostra a resposta da
-- lideranca sem dizer quem respondeu.
alter table public.cinco_porques_analises
  add column if not exists resposta_lideranca_nome text;

-- Falta uma policy de UPDATE para o colaborador em feedback_rota: ate
-- aqui ele so inseria e lia a propria linha. Precisa agora para
-- marcar colaborador_aceitou/colaborador_aceitou_em sobre a resposta
-- que recebeu -- mesma ressalva de sempre (RLS por linha, nao por
-- coluna) que ja vale para cinco_porques_analises.
drop policy if exists "colaborador atualiza seu feedback" on public.feedback_rota;
create policy "colaborador atualiza seu feedback"
  on public.feedback_rota for update
  using (auth.uid() = colaborador_id)
  with check (auth.uid() = colaborador_id);

notify pgrst, 'reload schema';
