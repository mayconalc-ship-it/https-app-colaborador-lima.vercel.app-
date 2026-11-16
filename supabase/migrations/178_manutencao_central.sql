-- ==================================================================
-- 178 - MANUTENCAO: aparelhos cadastrados, foto por item, alerta e os
--       checklists de AR-CONDICIONADO e CAMARA FRIA
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- Depende da 174 (manut_prev_*). Pode rodar mais de uma vez.
-- ==================================================================
-- Pedido do dono (16/11/2026): juntar Preventiva, Chamado e Check numa
-- vitrine "Manutencao" (como a Produtividade do Armazem), criar as
-- preventivas de ar-condicionado e camara fria e LEMBRAR o que esta em
-- atraso, com a frequencia cadastrada no Modo Lideranca.
--
-- O que muda no desenho da 174:
--   1. EQUIPAMENTOS: o ar-condicionado nao e um so. Cada aparelho tem
--      codigo (a etiqueta colada nele), local e a SUA ultima preventiva.
--      O modelo diz se usa cadastro de aparelhos (usa_equipamentos); o
--      Gerador continua sem, como esta hoje.
--   2. FREQUENCIA: a do modelo vale para todos; o aparelho pode ter a sua.
--   3. ALERTA: cada item diz que resposta e problema (alerta_valores) ou
--      a faixa aceitavel (minimo/maximo). A execucao guarda quantos itens
--      deram alerta -- e o numero que o painel mostra.
--   4. FOTO por item, reduzida no celular e de novo no servidor (WebP).

-- ------------------------------------------------------------------
-- 1) MODELOS: cadastro de aparelhos e descricao curta
-- ------------------------------------------------------------------
alter table public.manut_prev_modelos
  add column if not exists usa_equipamentos boolean not null default false,
  add column if not exists descricao text;

-- ------------------------------------------------------------------
-- 2) EQUIPAMENTOS (cada ar-condicionado, cada camara fria)
-- ------------------------------------------------------------------
create table if not exists public.manut_prev_equipamentos (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  modelo_id uuid not null references public.manut_prev_modelos(id) on delete cascade,
  -- A etiqueta do aparelho: AC-01, CF-01. E por ela que o tecnico acha.
  codigo text not null check (char_length(codigo) between 1 and 30),
  local text not null default '' check (char_length(local) <= 80),
  -- Marca/modelo e capacidade (BTUs, m3) em texto: varia demais entre
  -- aparelhos para virar coluna, e ninguem calcula com isso.
  marca text check (marca is null or char_length(marca) <= 80),
  capacidade text check (capacidade is null or char_length(capacidade) <= 40),
  observacao text check (observacao is null or char_length(observacao) <= 300),
  -- Nula = segue a frequencia do modelo.
  periodicidade_dias smallint check (periodicidade_dias is null or periodicidade_dias between 1 and 365),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint manut_prev_equip_codigo_unico unique (modelo_id, codigo)
);

create index if not exists manut_prev_equip_revenda_idx
  on public.manut_prev_equipamentos (revenda_id, modelo_id);

-- ------------------------------------------------------------------
-- 3) ITENS: bloco, foto e regra de alerta
-- ------------------------------------------------------------------
alter table public.manut_prev_itens
  add column if not exists bloco text,
  add column if not exists aceita_foto boolean not null default false,
  -- Respostas que sao problema: 'false' no sim_nao, o texto da opcao.
  add column if not exists alerta_valores text[] not null default '{}',
  -- Faixa aceitavel do numero; fora dela, alerta.
  add column if not exists minimo numeric(10,3),
  add column if not exists maximo numeric(10,3);

-- ------------------------------------------------------------------
-- 4) EXECUCOES: o aparelho e o total de alertas
-- ------------------------------------------------------------------
alter table public.manut_prev_execucoes
  add column if not exists equipamento_id uuid references public.manut_prev_equipamentos(id) on delete restrict,
  add column if not exists alertas smallint not null default 0;

-- Uma aberta por modelo, APARELHO e pessoa (antes: por modelo e pessoa,
-- o que impediria fazer o AC-01 com o AC-02 aberto).
drop index if exists public.manut_prev_execucao_aberta_unica;
create unique index if not exists manut_prev_execucao_aberta_unica2
  on public.manut_prev_execucoes (
    modelo_id,
    coalesce(equipamento_id, '00000000-0000-0000-0000-000000000000'::uuid),
    iniciada_por
  )
  where status = 'em_andamento';

create index if not exists manut_prev_execucoes_equip_idx
  on public.manut_prev_execucoes (equipamento_id, finalizada_em desc);

alter table public.manut_prev_respostas
  add column if not exists alerta boolean not null default false;

-- ------------------------------------------------------------------
-- 5) FOTOS (bucket privado "manutencao", pasta preventiva/)
-- ------------------------------------------------------------------
create table if not exists public.manut_prev_fotos (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.manut_prev_execucoes(id) on delete cascade,
  item_id uuid references public.manut_prev_itens(id) on delete set null,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  caminho text not null,
  bytes integer,
  criado_em timestamptz not null default now()
);

create index if not exists manut_prev_fotos_exec_idx on public.manut_prev_fotos (execucao_id);

-- ------------------------------------------------------------------
-- 6) RLS (leitura da revenda; escrita so pelo servidor)
-- ------------------------------------------------------------------
alter table public.manut_prev_equipamentos enable row level security;
alter table public.manut_prev_fotos        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['manut_prev_equipamentos', 'manut_prev_fotos']
  loop
    execute format('drop policy if exists "le %I da revenda" on public.%I', t, t);
    execute format(
      'create policy "le %I da revenda" on public.%I for select to authenticated
         using (public.ehowner_atual() or revenda_id in (select public.revendas_do_usuario()))',
      t, t
    );
  end loop;
end $$;

-- ------------------------------------------------------------------
-- 7) GERADOR: o que e problema em cada item (para o painel e o lembrete)
-- ------------------------------------------------------------------
update public.manut_prev_itens i set alerta_valores = v.alerta
from public.manut_prev_modelos m,
  (values
    (1,  '{false}'::text[]),
    (2,  '{false}'::text[]),
    (5,  '{Baixo}'::text[]),
    (7,  '{"Vencido por data","Precisa trocar"}'::text[]),
    (11, '{"Falhou no início e normalizou","Falhando durante todo o teste"}'::text[]),
    (13, '{false}'::text[])
  ) as v(ordem, alerta)
where i.modelo_id = m.id and m.nome = 'Preventiva do Gerador' and i.ordem = v.ordem
  and cardinality(i.alerta_valores) = 0;

update public.manut_prev_itens i set aceita_foto = true
from public.manut_prev_modelos m
where i.modelo_id = m.id and m.nome = 'Preventiva do Gerador' and i.ordem in (7, 11, 14);

update public.manut_prev_modelos
   set descricao = coalesce(descricao, 'Partida, tensões, bateria, óleo, água e combustível.')
 where nome = 'Preventiva do Gerador';

-- ------------------------------------------------------------------
-- 8) SEMENTE: AR-CONDICIONADO (mensal) e CAMARA FRIA (quinzenal)
-- ------------------------------------------------------------------
-- Frequencia inicial: mensal para o ar (limpeza de filtro, rotina do
-- PMOC) e quinzenal para a camara fria. Ajustavel em Lideranca >
-- Manutencao Preventiva, por modelo e por aparelho.
insert into public.manut_prev_modelos
  (revenda_id, nome, equipamento, emoji, periodicidade_dias, ordem, usa_equipamentos, descricao)
select r.id, x.nome, x.equip, x.emoji, x.dias, x.ordem, true, x.descr
from public.revendas r
cross join (values
  ('Preventiva do Ar-condicionado', 'Ar-condicionado', E'❄️', 30, 2,
   'Filtros, serpentina, dreno, condensadora, temperatura de saída e elétrica.'),
  ('Preventiva da Câmara Fria', 'Câmara fria', E'🧊', 15, 3,
   'Temperatura, porta e vedação, gelo no evaporador, dreno, alarme e elétrica.')
) as x(nome, equip, emoji, dias, ordem, descr)
on conflict (revenda_id, nome) do nothing;

-- Itens: (ordem, bloco, pergunta, ajuda, tipo, opcoes, unidade, casas,
--         obrigatorio, foto, alerta, minimo, maximo)
insert into public.manut_prev_itens
  (modelo_id, revenda_id, ordem, bloco, pergunta, ajuda, tipo, opcoes, unidade, casas_decimais,
   obrigatorio, aceita_foto, alerta_valores, minimo, maximo)
select m.id, m.revenda_id, i.ordem, i.bloco, i.pergunta, i.ajuda, i.tipo, i.opcoes, i.unidade, i.casas,
       i.obrig, i.foto, i.alerta, i.minimo, i.maximo
from public.manut_prev_modelos m
cross join (values
  (1, 'Limpeza', 'Filtros de ar limpos (lavados ou trocados)?', 'Tire foto do filtro depois da limpeza.',
   'sim_nao', '{}'::text[], null::text, 0, true, true, '{false}'::text[], null::numeric, null::numeric),
  (2, 'Limpeza', 'Serpentina da evaporadora limpa, sem sujeira ou mofo?', null,
   'sim_nao', '{}', null, 0, true, true, '{false}', null, null),
  (3, 'Limpeza', 'Bandeja e dreno desobstruídos, sem pingar água?', null,
   'sim_nao', '{}', null, 0, true, true, '{false}', null, null),
  (4, 'Limpeza', 'Condensadora (parte de fora) limpa e com ventilação livre?', null,
   'sim_nao', '{}', null, 0, true, true, '{false}', null, null),
  (5, 'Funcionamento', 'Temperatura do ar na saída da evaporadora',
   'Termômetro na saída, com o aparelho ligado há 10 min. O normal é de 8 a 16 °C.',
   'numero', '{}', '°C', 1, true, false, '{}', 6, 16),
  (6, 'Funcionamento', 'Liga, desliga e responde ao controle?', null,
   'sim_nao', '{}', null, 0, true, false, '{false}', null, null),
  (7, 'Funcionamento', 'Funciona sem ruído ou vibração anormal?', null,
   'sim_nao', '{}', null, 0, true, false, '{false}', null, null),
  (8, 'Funcionamento', 'Corrente do compressor', 'Com alicate amperímetro. Deixe em branco se não tiver.',
   'numero', '{}', 'A', 1, false, false, '{}', null, null),
  (9, 'Estrutura e elétrica', 'Isolamento das tubulações inteiro, sem ressecado?', null,
   'sim_nao', '{}', null, 0, true, true, '{false}', null, null),
  (10, 'Estrutura e elétrica', 'Cabos, conexões e disjuntor sem sinal de aquecimento?', null,
   'sim_nao', '{}', null, 0, true, true, '{false}', null, null),
  (11, 'Estrutura e elétrica', 'Suportes e fixações firmes, sem ferrugem?', null,
   'sim_nao', '{}', null, 0, true, false, '{false}', null, null),
  (12, 'Fechamento', 'Como o aparelho ficou?', null,
   'opcao', '{"Funcionando normal","Funcionando com restrição","Parado"}', null, 0, true, true,
   '{"Funcionando com restrição","Parado"}', null, null)
) as i(ordem, bloco, pergunta, ajuda, tipo, opcoes, unidade, casas, obrig, foto, alerta, minimo, maximo)
where m.nome = 'Preventiva do Ar-condicionado'
on conflict (modelo_id, ordem) do nothing;

insert into public.manut_prev_itens
  (modelo_id, revenda_id, ordem, bloco, pergunta, ajuda, tipo, opcoes, unidade, casas_decimais,
   obrigatorio, aceita_foto, alerta_valores, minimo, maximo)
select m.id, m.revenda_id, i.ordem, i.bloco, i.pergunta, i.ajuda, i.tipo, i.opcoes, i.unidade, i.casas,
       i.obrig, i.foto, i.alerta, i.minimo, i.maximo
from public.manut_prev_modelos m
cross join (values
  (1, 'Temperatura', 'Temperatura interna no display', 'A faixa aceita pode ser ajustada na Liderança.',
   'numero', '{}'::text[], '°C'::text, 1, true, true, '{}'::text[], 0::numeric, 5::numeric),
  (2, 'Temperatura', 'O termômetro de conferência bate com o display (até 1 °C)?', null,
   'sim_nao', '{}', null, 0, true, false, '{false}', null, null),
  (3, 'Porta e vedação', 'Borracha de vedação da porta inteira, sem rasgo?', null,
   'sim_nao', '{}', null, 0, true, true, '{false}', null, null),
  (4, 'Porta e vedação', 'A porta fecha sozinha e trava direito?', null,
   'sim_nao', '{}', null, 0, true, false, '{false}', null, null),
  (5, 'Porta e vedação', 'Batente sem gelo (resistência da porta funcionando)?', null,
   'sim_nao', '{}', null, 0, true, true, '{false}', null, null),
  (6, 'Porta e vedação', 'Cortina de tiras completa e limpa?', null,
   'sim_nao', '{}', null, 0, true, false, '{false}', null, null),
  (7, 'Evaporador e condensador', 'Evaporador sem acúmulo de gelo (degelo funcionando)?', null,
   'sim_nao', '{}', null, 0, true, true, '{false}', null, null),
  (8, 'Evaporador e condensador', 'Dreno do evaporador livre, sem água no piso?', null,
   'sim_nao', '{}', null, 0, true, true, '{false}', null, null),
  (9, 'Evaporador e condensador', 'Condensadora limpa e com ventilação livre?', null,
   'sim_nao', '{}', null, 0, true, true, '{false}', null, null),
  (10, 'Evaporador e condensador', 'Ventiladores girando, sem ruído anormal?', null,
   'sim_nao', '{}', null, 0, true, false, '{false}', null, null),
  (11, 'Segurança', 'Alarme / abertura interna de emergência funcionando?',
   'Teste por dentro: ninguém pode ficar preso.',
   'sim_nao', '{}', null, 0, true, false, '{false}', null, null),
  (12, 'Segurança', 'Iluminação interna funcionando?', null,
   'sim_nao', '{}', null, 0, true, false, '{false}', null, null),
  (13, 'Segurança', 'Painéis, piso e teto sem dano, gelo ou umidade?', null,
   'sim_nao', '{}', null, 0, true, true, '{false}', null, null),
  (14, 'Segurança', 'Quadro elétrico sem aquecimento e com cabos em ordem?', null,
   'sim_nao', '{}', null, 0, true, true, '{false}', null, null),
  (15, 'Fechamento', 'Como a câmara ficou?', null,
   'opcao', '{"Funcionando normal","Funcionando com restrição","Parada"}', null, 0, true, true,
   '{"Funcionando com restrição","Parada"}', null, null)
) as i(ordem, bloco, pergunta, ajuda, tipo, opcoes, unidade, casas, obrig, foto, alerta, minimo, maximo)
where m.nome = 'Preventiva da Câmara Fria'
on conflict (modelo_id, ordem) do nothing;

notify pgrst, 'reload schema';

-- Conferencia:
select m.nome, r.nome as revenda, m.periodicidade_dias, m.usa_equipamentos,
       (select count(*) from public.manut_prev_itens i where i.modelo_id = m.id) as itens
from public.manut_prev_modelos m join public.revendas r on r.id = m.revenda_id
order by r.nome, m.ordem;
