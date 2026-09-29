-- ==================================================================
-- 151 - MAO DE OBRA: HISTORICO DE ALTERACOES DOS PARAMETROS
-- Execute no Supabase do App Colaborador ANTES do deploy deste commit.
-- ==================================================================
-- Pedido do dono (28/09/2026), depois da revisao para a auditoria: a
-- configuracao guardava so a ULTIMA alteracao (quem e quando), nunca o
-- valor anterior. "Por que a media por carro passou de 45 para 35?" nao
-- tinha resposta no app.
--
-- Cada Salvar do simulador grava aqui uma linha por campo que MUDOU:
--   onde        'parametros' (aba Configurar), 'mes' (volume e estrutura
--               de um mes), 'qlp' (quadro atual) ou 'salario'
--   competencia o mes, quando a alteracao e de um mes ou do QLP
--   campo       a coluna; rotulo, o nome que a tela mostra
--   valor_anterior / valor_novo  em texto, ja no formato da tela
--               (40%, 7:20, 35) -- e o que o auditor le.
--
-- Linhas nao se editam nem se apagam pela tela: sao a trilha de auditoria.
-- Alteracoes feitas direto no banco (migrations de carga) NAO passam por
-- aqui -- ficam registradas no proprio arquivo da migration.
-- ==================================================================

create table if not exists public.mao_obra_historico (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  onde text not null check (onde in ('parametros', 'mes', 'qlp', 'salario')),
  competencia date,
  campo text not null,
  rotulo text not null,
  valor_anterior text,
  valor_novo text,
  alterado_em timestamptz not null default now(),
  alterado_por_nome text
);

create index if not exists mao_obra_historico_revenda_idx
  on public.mao_obra_historico (revenda_id, alterado_em desc);

-- So o servidor le e escreve, como o resto do simulador.
alter table public.mao_obra_historico enable row level security;

notify pgrst, 'reload schema';

-- Confira: a tabela existe (0 linhas ate o primeiro Salvar).
select count(*) as alteracoes from public.mao_obra_historico;
