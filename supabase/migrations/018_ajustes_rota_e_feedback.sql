-- Execute no Supabase: SQL Editor > New query > colar > Run

-- ==================================================================
-- FEEDBACK DA ROTA: comentario obrigatorio em nota ruim
-- ==================================================================
-- A tela ja bloqueia o envio sem comentario quando a nota e 0 ou 1
-- ("Ruim"/"Regular"). Mas a politica de RLS desta tabela so confere
-- "auth.uid() = colaborador_id" -- nao impede alguem de inserir direto
-- pela API, pulando a tela. Esta trava fecha essa porta.
--
-- "not valid" e de proposito: ha 2 respostas antigas (nota 0, sem
-- comentario) de antes desta regra existir. Com "not valid" o Postgres
-- NAO revalida essas linhas -- so passa a exigir a partir de agora.
-- Historico preservado, porta fechada para o futuro.
alter table public.feedback_rota
  drop constraint if exists feedback_rota_comentario_obrigatorio;

alter table public.feedback_rota
  add constraint feedback_rota_comentario_obrigatorio
  check (nota > 1 or (comentario is not null and length(trim(comentario)) > 0))
  not valid;
