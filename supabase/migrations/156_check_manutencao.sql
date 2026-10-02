-- ==================================================================
-- 156 - Check Global de Manutencao (DPO 2.2 - Manutencao das Instalacoes)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- ==================================================================
-- Pedido do dono (02/10/2026): o item 2.2 do DPO cobra o Checklist
-- Global de Manutencao da Ambev preenchido NO MINIMO TRIMESTRALMENTE,
-- com imagens da condicao dos itens (V.1) e mostrando a evolucao entre
-- os trimestres (V.2). A auditora quer ver essa evolucao COM AS FOTOS
-- de cada avaliacao. Quem preenche e o time da manutencao.
--
-- A base e a planilha "09_Set Checklist Global de Manutencao" (aba
-- Revenda): 36 itens em 9 secoes e 3 blocos, cada um com a verificacao,
-- os criterios de nota (3 / 1 / 0), o peso e -- para o calculo -- a
-- mesma formula da planilha (ver lib/manutencao.ts, calcularNotas).
--
-- Tabelas:
--   manut_itens       o checklist (por revenda: N/A e critico mudam)
--   manut_avaliacoes  uma por revenda e trimestre
--   manut_respostas   nota (3/1/0) ou N/A, observacao e plano de acao
--   manut_fotos       as fotos de cada resposta (bucket PRIVADO)
--
-- FOTOS EM BUCKET PRIVADO ("manutencao"): mostram portao, porta do
-- banco, CFTV, cabine eletrica. Link publico seria mapa da unidade para
-- quem achasse a URL. A tela gera link assinado, que expira.
--
-- Permissao: modulo "manutencao" (texto livre nas tabelas de permissao).
-- NAO e para todos: o time da manutencao recebe por liberacao individual
-- (Acessos por Pessoa); lideranca com "manutencao:editar" reabre uma
-- avaliacao finalizada.
-- ==================================================================

insert into storage.buckets (id, name, public)
values ('manutencao', 'manutencao', false)
on conflict (id) do update set public = false;

-- ------------------------------------------------------------------
-- 1) O checklist
-- ------------------------------------------------------------------
create table if not exists public.manut_itens (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  numero text not null check (numero ~ '^[0-9]+\.[0-9]+$'),
  secao smallint not null check (secao between 1 and 99),
  secao_nome text not null,
  bloco text not null check (bloco in ('fundamentos', 'manter', 'melhorar')),
  ordem smallint not null,
  pergunta text not null,
  verificacao text not null default '',
  criterios text not null default '',
  peso smallint not null check (peso between 1 and 10),
  -- Item critico: abaixo de 3, reparo em curto prazo ou CAPEX emergencial.
  critico boolean not null default false,
  ativo boolean not null default true,
  constraint manut_item_unico unique (revenda_id, numero)
);

-- ------------------------------------------------------------------
-- 2) Avaliacoes (uma por trimestre)
-- ------------------------------------------------------------------
create table if not exists public.manut_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  ano smallint not null check (ano between 2020 and 2100),
  trimestre smallint not null check (trimestre between 1 and 4),
  status text not null default 'em_andamento' check (status in ('em_andamento', 'finalizada')),
  iniciada_por uuid references auth.users(id) on delete set null,
  iniciada_por_nome text not null,
  iniciada_em timestamptz not null default now(),
  finalizada_por uuid references auth.users(id) on delete set null,
  finalizada_por_nome text,
  finalizada_em timestamptz,
  -- A nota final congelada no fechamento: o historico nao muda se o
  -- peso de um item for ajustado depois.
  nota_total numeric(6,5),
  constraint manut_avaliacao_unica unique (revenda_id, ano, trimestre)
);

create table if not exists public.manut_respostas (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references public.manut_avaliacoes(id) on delete cascade,
  item_id uuid not null references public.manut_itens(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  nota smallint check (nota in (0, 1, 3)),
  na boolean not null default false,
  observacao text check (observacao is null or char_length(observacao) <= 1000),
  plano_acao text check (plano_acao is null or char_length(plano_acao) <= 1000),
  responsavel text check (responsavel is null or char_length(responsavel) <= 120),
  prazo date,
  respondido_por uuid references auth.users(id) on delete set null,
  respondido_por_nome text not null,
  atualizado_em timestamptz not null default now(),
  constraint manut_resposta_unica unique (avaliacao_id, item_id),
  constraint manut_nota_ou_na check (na or nota is not null)
);

create table if not exists public.manut_fotos (
  id uuid primary key default gen_random_uuid(),
  resposta_id uuid not null references public.manut_respostas(id) on delete cascade,
  revenda_id uuid not null references public.revendas(id) on delete cascade,
  caminho text not null,
  bytes integer,
  largura smallint,
  altura smallint,
  enviada_por uuid references auth.users(id) on delete set null,
  enviada_por_nome text not null,
  criado_em timestamptz not null default now()
);

create index if not exists manut_itens_revenda_idx on public.manut_itens (revenda_id, ordem);
create index if not exists manut_avaliacoes_revenda_idx on public.manut_avaliacoes (revenda_id, ano desc, trimestre desc);
create index if not exists manut_respostas_avaliacao_idx on public.manut_respostas (avaliacao_id);
create index if not exists manut_respostas_item_idx on public.manut_respostas (item_id);
create index if not exists manut_fotos_resposta_idx on public.manut_fotos (resposta_id);

-- Leitura e escrita so pelo servidor (service role), que confere o
-- modulo e a revenda. RLS ligada sem politica = nenhum acesso direto.
alter table public.manut_itens enable row level security;
alter table public.manut_avaliacoes enable row level security;
alter table public.manut_respostas enable row level security;
alter table public.manut_fotos enable row level security;

-- ------------------------------------------------------------------
-- 3) Os 36 itens da planilha, nas duas revendas
--    Critico de partida: a secao 1 (Gestao de Areas e Equipamentos
--    Criticos). Ajuste item a item se precisar.
-- ------------------------------------------------------------------
insert into public.manut_itens
  (revenda_id, numero, secao, secao_nome, bloco, ordem, pergunta, verificacao, criterios, peso, critico)
select r.id, i.numero, i.secao, i.secao_nome, i.bloco, i.ordem, i.pergunta, i.verificacao, i.criterios, i.peso, i.critico
from public.revendas r
cross join (
  values
    ('1.1', 1, 'GESTÃO DE ÁREAS E EQUIPAMENTOS CRÍTICOS', 'fundamentos', 1, 'A Estrutura das Coberturas existentes apresentam bom estado de conservação?', 'Estrutura com ausência de anomalias (ferrugem, colisão, danos em geral) que coloquem em risco a segurança e operacionalidade do Armazém. Laudo Técnico Estrutural/Mapeamento e Tratativa das Anomalias. Check do cronograma de manutenção de 6 em 6 meses.', '3 - Estruturas sem risco de queda e cronograma de manutenção em dia. 1- Algumas anomalias encontradas, porém todas mapeadas com plano de ação gerando visibilidade com follow. 0 - Plano de ação inconsistente e/ou anomalias não mapeadas.', 4, true),
    ('1.2', 1, 'GESTÃO DE ÁREAS E EQUIPAMENTOS CRÍTICOS', 'fundamentos', 2, 'As telhas e calhas das coberturas existentes estão em bom estado de conservação?', 'Checar se as telhas e calhas estão livres de danos, vazamento e goteiras. Verificar se existe vazão apropriada para as águas oriundas do telhado. Check do cronograma de manutenção de 6 em 6 meses.', '3 - As telhas e calhas das coberturas existentes estão em bom estado de conservação. 1- Algumas anomalias encontradas, porém todas mapeadas com plano de ação gerando visibilidade com follow. 0 - Plano de ação inconsistente e/ou anomalias não mapeadas.', 1, true),
    ('1.3', 1, 'GESTÃO DE ÁREAS E EQUIPAMENTOS CRÍTICOS', 'fundamentos', 3, 'Itens críticos de segurança patrimonial como: portão de acesso, porta do banco, torniquete e CFTV estão em perfeita funcionalidade?', 'Checar (in loco) a funcionalidade dos itens e entrevistar usuários (controle, portaria e financeiro). CFTV com 60 dias de imagens e contrato de manutenção de segurança (controle de acesso e CFTV). Para todos os itens funcionarem perfeitamente é necessário um plano de manutenção.', '3 - Todos os itens críticos de segurança patrimonial estão funcionando perfeitamente. 1 - Pelo menos 2 itens estão funcionando perfeitamente e os outros estão mapeados para solução. 0 – Menos de 2 itens funcionando e/ou problemas não mapeados.', 1, true),
    ('1.4', 1, 'GESTÃO DE ÁREAS E EQUIPAMENTOS CRÍTICOS', 'fundamentos', 4, 'Áreas e equipamentos críticos relacionados à qualidade (câmara fria, gerador, flowracks, racks, equipamentos de limpeza, áreas e equipamentos de controle de PNC) são inspecionados regularmente e estão em perfeita funcionalidade?', 'Checar (in loco) a funcionalidade e conservação dos itens e áreas e entrevistar usuários. Checar se todos os itens estão inventariados em perfeita condição e se tem plano de correção para os que não estejam. Verificar a existência de laudo que ateste a segurança dos racks e flowracks. Verificar o cronograma de manutenção preventiva da câmara fria e gerador.', '3 - Todos os itens críticos de qualidade estão funcionando perfeitamente. 1 - Pelo menos 3 itens estão funcionando perfeitamente e os outros estão mapeados para solução. 0 - Dois itens apenas funcionando e/ou problemas não mapeados.', 1, true),
    ('1.5', 1, 'GESTÃO DE ÁREAS E EQUIPAMENTOS CRÍTICOS', 'fundamentos', 5, 'Itens e equipamentos críticos de segurança (hidrantes e extintores, trava rodas, linha de vida, paleteira manual e carrinhos) estão em perfeita funcionalidade?', 'Checar (in loco) a funcionalidade e conservação dos itens e entrevistar usuários. Checar se todos os itens estão inventariados em perfeitas condições e se tem plano de correção para os que não estejam. Verificar a existência de laudo que ateste a segurança da linha de vida. Verificar cronograma/plano de inspeção dos hidrantes, extintores, paleteiras e carrinhos.', '3 - Todos os itens críticos de segurança estão funcionando perfeitamente. 1 - Pelo menos 3 itens estão funcionando perfeitamente e os outros estão mapeados para solução. 0 - Dois itens apenas funcionando e/ou problemas não mapeados.', 1, true),
    ('1.6', 1, 'GESTÃO DE ÁREAS E EQUIPAMENTOS CRÍTICOS', 'fundamentos', 6, 'A unidade possui um plano de contingência único, integrado e atualizado para casos críticos?', 'Apresentar contratos/tratativa para abastecimento de água, abastecimento dos geradores, falta de energia e intertravamento das portas (caixa). Verificar se o plano está atualizado com o contato dos responsáveis atuais. Verificar plano para compra, transporte e abastecimento de diesel do gerador.', '3 - Possui plano de contingência único, integrado e atualizado de 100% dos itens críticos. 1 - Há um plano, mas este não está completo ou não está atualizado. 0 - Não há um plano.', 3, true),
    ('1.7', 1, 'GESTÃO DE ÁREAS E EQUIPAMENTOS CRÍTICOS', 'fundamentos', 7, 'A unidade executa a rotina estabelecida (rondas e reuniões), criando plano de ação correto e consistente?', 'Verificar se o Quadro de Gestão à Vista da Matinal do GOD está atualizado com indicador da área. Verificar se a Reunião de Estrutura acontece na frequência correta e conforme TOR. Verificar se a Ronda de Blindagem é feita na periodicidade e qualidade correta. Verificar se a Reunião do Pilar acontece conforme TOR da Reunião DPO. Verificar se a Super Matinal/Vespertina/Noturna aborda o assunto conforme TOR. Verificar se o assunto é tratado em MPR do GOD e da GEO. Analisar os planos de ação para as anomalias e serviços já realizados e a serem executados e/ou planejados.', '3 - Reuniões e rondas são realizadas regularmente conforme padrão e há plano de ação para a evolução da estrutura. 1 - Reuniões e rondas são realizadas parcialmente (pelo menos 75%, com a frequência especificada) – analisar os últimos 3 meses. 0 - Reuniões e rondas não são realizadas regularmente, de acordo com as orientações, ou estão com frequência abaixo de 75% – analisar os últimos 3 meses. NOTA: Se a Reunião de Estrutura não estiver sendo realizada na frequência correta, a questão 1.7 deverá ser Zero.', 3, true),
    ('2.1', 2, 'GESTÃO DO PLANO DE TRÁFEGO', 'fundamentos', 8, 'As cancelas e guarda-corpos de proteção estão em bom estado de conservação e de acordo com a especificação padrão?', 'Verificar se as segregações, guarda-corpos e cancelas estão conforme padrão e sem apresentar anomalias. Verificar se existe registro de quando aconteceu à anomalia e qual foi à tratativa e/ou fluxo de cobrança da avaria. Verificar se os guarda-corpos e proteções de pilares estão devidamente fixados ao piso com todos os parafusos bem apertados.', '3 - Segregações, guarda-corpos e cancelas em boas condições de utilização. 1 - Conservação com algumas falhas na pintura, pequenas manutenções ou mal afixados no piso, mas com plano de ação para adequação. 0 - Conservação em estado ruim sem plano de ação.', 3, false),
    ('2.2', 2, 'GESTÃO DO PLANO DE TRÁFEGO', 'fundamentos', 9, 'As áreas de segregação do picking, espera dos motoristas, refugo, sala dos conferentes, retorno de rota, pit stop e armazenamento de gás (P20) estão em bom estado de conservação?', 'Verificar em ronda as condições das áreas que devem estar em perfeita condições de uso. Caso haja anomalia deve haver registro das ocorrências com plano de ação para tratamento. O prazo entre registro de anomalia e tratamento deve respeitar padrão.', '3 - As áreas estão em bom estado de conservação. Problemas sendo tratado em plano de ação. 1 - Conservação com algumas falhas na pintura ou pequenas manutenções, mas sendo tratado via plano de ação. 0 - Conservação em estado ruim.', 3, false),
    ('2.3', 2, 'GESTÃO DO PLANO DE TRÁFEGO', 'fundamentos', 10, 'Pinturas de faixa de pedestre, fluxo de circulação, separação de lotes, vagas de veículos (leves e pesados), guia de conferente, redzone e sinalizações dos equipamentos de combate a incêndio estão em bom estado de conservação?', 'Unidade deve ter cronograma para pinturas novas e manutenção das antigas. Controle eletrônico com plano de ação para tratamento dos problemas quando necessário. Em ronda na unidade verifique o estado de conservação das pinturas. As mesmas devem seguir padrão. Placas de sinalização em bom estado de conservação.', '3 - Pinturas e sinalizações presentes em todos os locais definidos e estão em bom estado de conservação. 1 - Pinturas e sinalizações presentes em todos os locais definidos, contudo existem falhas na conservação sendo tratados com plano de ação. 0 - Falta pintura e/ou sinalizações em locais definidos e/ou má conservação nas existentes.', 1, false),
    ('3.1', 3, 'CONSERVAÇÃO CIVIL', 'fundamentos', 11, 'As áreas de estocagem, circulação de veículos, Pit Stop, pedestres e áreas ADM estão livres de buracos ou outras interferências?', 'Verificar (in loco) pisos, rampas e áreas de circulação da unidade, analisar VBZ de quebra e checar chamados com motivos buracos. Check de apontamento de condições inseguras no Credit sem tratamento.', '3 - Pisos em bom estado de conservação, não apresentando risco de quedas ou tropeços. 1 - Algumas anomalias encontradas, porém todas mapeadas com plano de ação gerando visibilidade com follow. 0 - Plano de ação inconsistente e/ou anomalias não mapeadas.', 1, false),
    ('3.2', 3, 'CONSERVAÇÃO CIVIL', 'fundamentos', 12, 'Tetos e forros estão livres de rachaduras, buracos, deslocamentos (PVC ou Placas), umidade, manchas e goteiras?', 'Verificar in loco. Check de chamados abertos com plano de ação para solucionar. Check de GSAs com plano de ação para solucionar.', '3 - Tetos e forros em bom estado de conservação, não apresentando risco de queda. 1 - Alguma anomalia encontrada, porém todas mapeadas com plano de ação gerando visibilidade com follow. 0 – Anomalias identificadas em ronda e não mapeadas e/ou plano de ação inconsistente.', 1, false),
    ('3.3', 3, 'CONSERVAÇÃO CIVIL', 'fundamentos', 13, 'O Muro de Fechamento do perímetro está livre de buracos, rachaduras e com pintura em bom estado (quando houver pintura)?', 'Verificar se existem anomalias (buracos, concertinas amassadas, respeitar especificações do check list patrimonial dos muros). Check de chamados abertos com plano de ação para solucionar.', '3 - Muro em bom estado de conservação, não apresentando trincas ou risco de queda. 1 - Alguma anomalia encontrada, porém todas mapeadas com plano de ação gerando visibilidade com follow. 0 - Anomalias identificadas em ronda e não mapeadas e/ou plano de ação inconsistente.', 3, false),
    ('3.4', 3, 'CONSERVAÇÃO CIVIL', 'fundamentos', 14, 'O revestimento das paredes das salas e acessos estão livres de buracos e rachaduras?', 'Verificar se existem anomalias (pintura envelhecida ou danificada, mofos, buracos, trincas, rachaduras) nas paredes. Check de chamados abertos com plano de ação para solucionar.', '3 - Paredes em bom estado de conservação, não apresentando trincas ou risco de quedas. 1 - Alguma anomalia encontrada, porém todas mapeadas com plano de ação gerando visibilidade com follow. 0 - Anomalias identificadas em ronda e não mapeadas e/ou plano de ação inconsistente.', 3, false),
    ('3.5', 3, 'CONSERVAÇÃO CIVIL', 'fundamentos', 15, 'As portas e janelas das salas estão em perfeitas condições de uso?', 'Verificar se existem anomalias (maçaneta quebrada, trinco quebrado, sem porta, vidro quebrado das janelas, persiana rasgada entrando sol, insulfim rasgado, porta emperrando ou fazendo barulho ao movimentar). Check de chamados abertos com plano de ação para solucionar.', '3 - Portas e janelas em bom estado de conservação. 1 - Alguma anomalia encontrada, porém todas mapeadas com plano de ação gerando visibilidade com follow. 0 - Anomalias identificadas em ronda e não mapeadas e/ou plano de ação inconsistente.', 3, false),
    ('4.1', 4, 'ELÉTRICA', 'fundamentos', 16, 'A Cabine Primária, Quadros de Energia e Infraestrutura Elétrica para distribuição de Força da Unidade estão em bom estado de conservação?', 'Unidade possui laudo técnico válido com as condições infraestruturais elétrica da unidade? Incluem verificação das condições das cabines e quadros? Verificar documentação. A infraestrutura elétrica esta em boas condições de uso? No caso de anomalia existe plano de ação para tratamento com prazos coerentes? A infraestrutura elétrica tem revisão periódica conforme orientação de engenheiro eletricista? Os locais onde estão instalados as cabines e quadros são adequados (a frente de qualquer quadro / painel elétrico deve ter 1m² de acesso livre de interferências para a execução da manutenção do mesmo)? Existe risco de batida por máquinas e veículos? Verifique as condições físicas em ronda. Toda a rede elétrica está protegida por eletrocalha, eletrodutos, canaletas, conduítes e suportes.', '3 - Unidade com toda documentação válida. Instalações em perfeitas condições de uso e revisões periódicas acontecendo conforme orientação técnica garantindo a segurança da unidade. 1 - Unidade com toda documentação válida. Instalação com algumas anomalias sendo tratadas via plano de ação e revisões acontecendo conforme orientação técnica. 0 - Unidade sem documentação válida. Instalações com problemas ou sem revisões.', 1, false),
    ('4.2', 4, 'ELÉTRICA', 'fundamentos', 17, 'Iluminação interna e externa está em perfeitas condições de uso? Existe cronograma de verificação dos mesmos?', 'Realize ronda pelas áreas e verifique a existência de lâmpadas, refletores, etc. queimadas e/ou danificados. A unidade possui agenda definida para verificação das condições da iluminação? O mesmo atende a necessidade da unidade? Verifique RACIs e ANSs definidas para realização de rondas e tratamento de problemas. A unidade deve ter análise e plano de ação para tratamento de problemas.', '3 - Poucas lâmpadas queimadas ou danificadas, unidade com agenda definida para verificação e ANSs e RACIs definidas. 1 – Algumas lâmpadas queimadas, falha no cronograma de verificação e sem plano de ação consistente. 0 - Lâmpadas queimadas, falha no cronograma verificação e/ou plano de ação inconsistente.', 1, false),
    ('4.3', 4, 'ELÉTRICA', 'fundamentos', 18, 'As instalações elétricas como: ar condicionado, ventiladores, chuveiros elétricos, tomadas e VDs estão em bom estado de conservação? Existe cronograma de verificação?', 'Realize ronda pelas áreas e verifique a existência de equipamentos queimados e/ou danificados. Verifique o cronograma de revisão das instalações elétricas. A unidade deve ter controle formal das revisões. Verificar se o ar condicionado está inventariado, possui plano de manutenção preventiva e se as anomalias estão mapeadas.', '3 – Pelo menos 3 dos itens de instalações elétricas estão em boas condições de uso e cronograma de revisões ocorrendo e sendo registradas. 1 – Menos de 3 itens de instalações elétricas estão em boas condições, contudo não existem falhas no cronograma de revisões. 0 - Instalações elétricas com problemas e/ou falha no cronograma de revisões.', 3, false),
    ('5.1', 5, 'HIDRÁULICA, ÁREAS MOLHADAS E MOLHÁVEIS', 'fundamentos', 19, 'Os Banheiros, Vestiários e Refeitórios estão garantindo as condições básicas de funcionamento e utilização?', 'Banheiros, vestiários e refeitórios livres de odores. Vasos, Pias e Torneiras em funcionamento e livre de vazamentos. Chuveiros em funcionamento. Armários em bom estado de conservação. Suportes para sabão, papéis e espelhos bem fixados e sem anomalias.', '3 - Atendimento de 5 itens de verificação. 1- Atendimento de 3 a 4 itens de verificação. 0 - Atendimento menor que 3 itens de verificação.', 1, false),
    ('5.2', 5, 'HIDRÁULICA, ÁREAS MOLHADAS E MOLHÁVEIS', 'fundamentos', 20, 'A unidade está realizando a limpeza e possui registro de manutenção preventiva nos ralos, sifões, grelhas e galerias (condutor de água pluvial)?', 'Verificar se a unidade executa um cronograma padrão de limpeza e manutenção e se existem ações para tratamento de anomalias. Entreviste algumas pessoas e verifique se existe registro de anomalias relacionadas a entupimentos, inundações e vazamentos.', '3 - Cronograma de limpeza e manutenção acontecendo conforme padrão. O mesmo é gerenciado via plano de ação. Não existem sinas de entupimentos, inundações e vazamentos. 1 - Não existem sinais de entupimentos ou vazamentos, porém cronograma de limpeza com falhas e sem plano de ação para tratamento. 0 - Existência de sinais de vazamentos e entupimentos e sem cronograma de limpeza e manutenção.', 3, false),
    ('5.3', 5, 'HIDRÁULICA, ÁREAS MOLHADAS E MOLHÁVEIS', 'fundamentos', 21, 'Reservatório de água potável da unidade está em perfeita condição de uso e possui registro de manutenção e limpezas periódicas? (Se aplicável)', 'Existe plano para abastecimento de água no caso de falta? Existe laudo para controle de PH? Existe gestão das manutenções dos reservatórios? A mesma está em boas condições físicas? Unidade realiza manutenção e limpeza conforme padrões de conservação sanitários? Existe controle eletrônico (planilha)? Atenção para unidades com poço artesiano. Small OP: Regional ajudar na elaboração / execução do plano.', '3 - Plano de abastecimento consistente, laudo emitido e controlado, livre de vazamentos e limpeza ocorrendo conforme cronograma e padrões sanitários. 1 – Laudo emitido, livre de vazamentos, mas com falhas no cronograma de limpeza e manutenção. 0 – Não atende os requisitos acima.', 3, false),
    ('6.1', 6, 'MANUTENÇÃO PREVENTIVA', 'manter', 22, 'A unidade possui um Plano de manutenção preventiva (com periodicidade e atividades) para cada tipo de equipamentos e áreas criticas?', 'Plano de manutenção com periodicidade das seguintes atividades preventivas: Equipamentos críticos: geradores, portões de acesso, ar condicionado, quadros elétricos, flowracks, porta pallet, linha de vida, câmara fria, SPDA, bomba d''água e recalque (alimentação dos hidrantes). Áreas criticas: Caixa Financeiro, Pit Stop, tanque de abastecimento, oficinas, telhados. Verificar o controle de produtividade do técnico, anomalias, controle de fotos e OS parada por falta de material. Serviços a serem realizados em cada tipo de manutenção (com pelo menos as recomendações contidas no manual do equipamento - quando aplicável).', '3 - O plano de manutenção é seguido e engloba todas as áreas e equipamentos críticos, com gestão da produtividade dos técnicos, anomalias e materiais. 1 - O plano de manutenção existe, mas não é detalhado ou está faltando componentes-chaves, gestão insuficiente da produtividade, anomalias e materiais. 0 - Não existem evidências de plano de manutenção.', 3, false),
    ('6.2', 6, 'MANUTENÇÃO PREVENTIVA', 'manter', 23, 'A unidade utiliza os aprendizados das manutenções corretivas para atualizar os planos de manutenção preventiva?', 'Verificar a Lista de Manutenção Corretivas com as principais ocorrências. Verificar a realização de Relatos de Anomalia para itens críticos que passaram por manutenção corretiva com uma preventiva feita. Verificar se a unidade controla os indicadores MTBF e MTTR e se existem ações para melhorar a performance. Verificar evolução dos indicadores atrelados a atualização dos planos. Small OP: Regional apurar o KPI de forma centralizada.', '3 - Os planos de Manuteção Preventiva são atualizados com os aprendizados das manutenção corretivas, relatos de anomalia são gerados quando necessário e a unidade controla o MTBF e MTTR. 1 - Os planos de Manuteção Preventiva são atualizados com os aprendizados da Manutenção corretiva, mas não apresentam evolução, existem falhas na geração dos relatos e/ou no acompanhamento de MTBF e MTTR. 0 - Os planos não foram atualizados, não são feitos relatos de anomalia e/ou o MTBF e MTTR não é controlado.', 3, false),
    ('7.1', 7, 'GESTÃO DOS CUSTOS DE MANUTENÇÃO', 'manter', 24, 'As manutenções recorrentes executadas na unidade possuem contrato de prestação de serviço validado via CSU?', 'Verificar os contratos (Ex.: Manserv, Talentos, etc.). Verificar exceções aprovados pelo corporativo AC. Verificar Matriz de Serviços disponibilizada pelo Coorporativo. Verificar execução de manutenção sem pedido ou contrato. Verificar existência de regularização de notas fiscais.', '3 - Possui todos os contratos de serviços recorrentes devidamente aprovados. 1 - Não possui todos os contratos, no entanto estão em processo de aprovação. 0 - Não possui contrato, não estão em fluxo de aprovação e/ou possui notas fiscais não regularizadas.', 3, false),
    ('7.2', 7, 'GESTÃO DOS CUSTOS DE MANUTENÇÃO', 'manter', 25, 'Existe um controle e estratificação dos maiores gastos por área/equipamento/serviço?', 'Apresentar controle com histórico mínimo de 6 meses. Verificar a realização da Reunião de OBZ com análises e estratificações. Plano de Ação com follow dos maiores gastos.', '3 - Possui estratificação aberto por área, Reunião de OBZ acontece com Plano de Ação e follow para os itens de maior impacto. 1 - Possui estratificação, mas com plano de ação e follow inconsistentes. 0 - Não possui estratificação.', 3, false),
    ('7.3', 7, 'GESTÃO DOS CUSTOS DE MANUTENÇÃO', 'manter', 26, 'A unidade possui uma gestão do pacote de manutenção?', 'Verificar se o dono tem o acompanhamento do resultado (PLAN x TEND x REAL). Verificar se a unidade tem estouros no Pacote Manutenção. Verificar se o dono pode explicar os principais impactos. Verificar se a unidade tem um controle da tendência do LE. Verificar se existem alocações indevidas no pacote sem tratativa.', '3 – A unidade possui gestão e acompanhamento do pacote, garante a correta alocação das despesas, sem estouro, possui evidências e estratificações com Plano de Ação e follow. 1 – A unidade possui gestão e acompanhamento do pacote, no entanto, existem falhas de alocação das despesas e nas tratativas. 0 – A unidade não possui gestão do pacote e/ou possui lançamentos indevidos.', 3, false),
    ('7.4', 7, 'GESTÃO DOS CUSTOS DE MANUTENÇÃO', 'manter', 27, 'A unidade possui áreas internas comodatadas para parceiros? A mesma possui evidências de cobranças?', 'Verificar existência do contrato das áreas comodatadas, cobrar existência física do comodato assinado e reconhecimento de firma. Verificar se as áreas estão em bom estado de conservação e/ou foram realizados os reparos necessários. Verificar se os reparos de responsabilidade do comodatado foram devidamente cobrados.', '3 - Possui comodato e as obras com responsabilidade do parceiro é devidamente cobrado. 1 - Possui comodato, mas não é cobrado. 0 - Não possui comodato.', 3, false),
    ('7.5', 7, 'GESTÃO DOS CUSTOS DE MANUTENÇÃO', 'manter', 28, 'A unidade possui um processo de aquisição de equipamentos e peças para a execução das atividades de manutenção?', 'Verificar se os funcionários conhecem e utilizam o Portal do Fornecedor Local. Apresentar controle que evidencie a contratação de serviços e/ou aquisição de peças x lista de ordens de serviço. Verificar se existem OS abertas por falta de material. Avaliar o prazo de cumprimento das ordens de serviço x disponibilidade dos materiais. Verificar se a unidade faz gestão de estoque de peças e materiais com inventários regulares.', '3 - 90% das aquisições concretizadas <= de 30 dias da abertura da ordem de serviço. 1 - 90% das aquisições concretizadas <=60 dias da abertura da ordem de serviço. 0 - Não atende os requisitos.', 3, false),
    ('7.6', 7, 'GESTÃO DOS CUSTOS DE MANUTENÇÃO', 'manter', 29, 'A unidade possui um processo definido para o planejamento orçamentário de obras, serviços e aquisição de peças?', 'Verificar a existência de orçamentos padronizados que contemplem todos os itens. Entrevistar se o dono entende os benefícios de se realizar um orçamento padronizado. Validar se o serviço descriminado corresponde ao orçado. Verificar se o Aceite Final da Obra reflete o orçamento aprovado. Verificar se foi prospectado mais de um fornecedor.', '3 – Obras e serviços realizados atenderam os requisitos de cotação e prospecção orçamentária. 1 – A unidade possui processo definido, no entanto existem falhas e oportunidades. 0 – Não atende os requisitos.', 3, false),
    ('8.1', 8, 'GESTÃO DE ORDENS DE SERVIÇOS', 'manter', 30, 'Existe um fluxo definido e amplamente divulgado da ferramenta de abertura de chamados?', 'Verificar se existe o fluxo de abertura, disponibilidade da ferramenta e plano de comunicação (visão 6 meses). Entrevistar in loco 3 usuários para checar o conhecimento da ferramenta. Verificar a gestão e conservação dos QRCodes. LUP com passo a passo para abertura de chamado. Nota: Small OP poderá realizar o processo através do Clic.', '3 - Evidências da disponibilidade, comunicação e utilização da ferramenta. 1 - A ferramenta existe, mas não é utilizada ou bem comunicada. 0 - Sem evidências da utilização e comunicação.', 3, false),
    ('8.2', 8, 'GESTÃO DE ORDENS DE SERVIÇOS', 'manter', 31, 'A unidade garante gestão das ordens de serviços (corretivas e preventivas) com prazo de execução, priorização das demandas e follow nas reuniões de rotina?', 'Verificar se existe algum sistema de gestão implatando (Exppe - Optimus) e este é utilizado frequentemente. Verificar follow na reunião de estrutura semanal. Verificar se existem chamados fechados indevidamente, sem a solução definitiva do problema. Verificar Plano de Ação para as anomalias e serviços não atendidos.', '3 - Há sistema de gestão e acompanhamento, sem chamados fechados indevidamente, anomalias são tratadas em reunião com Plano de Ação e follow. 1 – Há sistema de gestão e acompanhamento, com chamados fechados indevidamente, falhas na tratativa das anomalias. 0 - Não possui sistema de gestão e anomalias não são tratadas.', 3, false),
    ('8.3', 8, 'GESTÃO DE ORDENS DE SERVIÇOS', 'manter', 32, 'A unidade realiza check com os prestadores de serviço com foco em planejamento, execução e nível de serviço?', 'Ata de reunião com o desdobramento de atividades, acompanhamento da execução, qualidade dos serviços. Verificar se a unidade exige e faz a gestão da garantia de peças, materiais e serviços.', '3 – Tem gestão da garantia de peças e serviços e evidências de reunião com Plano de Ação e follow. 1 – Algumas peças e serviços possuem garantias, mas existem falhas no Plano de Ação e reuniões. 0 - Não possui evidências de gestão de garantia e não ocorre reunião.', 1, false),
    ('9.1', 9, 'NÍVEL DE SERVIÇO', 'melhorar', 33, 'A unidade aplica e tem acompanhamento da Pesquisa de Nível de Serviço de manutenção e Serviços Gerais?', 'Verificar se a unidade aplica periodicamente uma Pesquisa de Nível de Serviço. Verificar se existe evolução entre uma pesquisa e outra. Checar a existência de plano de ação e evidências que respaldem e enderecem os itens da pesquisa com follow mensal.', '3 – A Pesquisa é aplicada, existe plano consistente com follow mensal e apresenta evolução no resultado. 1 – A Pesquisa é aplicada, existe um plano sem follow e sem evolução no resultado. 0 – A pesquisa não é aplicada e/ou não existe acompanhamento.', 1, false),
    ('9.2', 9, 'NÍVEL DE SERVIÇO', 'melhorar', 34, 'A unidade garante os chamados de manutenção predial fechados no prazo?', 'Apresentar gestão e estratificação dos chamados. Checar se o resultado da unidade é maior ou igual à meta desdobrada. Verificar % de chamados reabertos. Entrevista com no mínimo 3 usuários e verificação in loco.', '3 – A unidade atinge a meta de chamados, possui acompanhamentos gerenciais e controla o % de chamados reabertos. 1 – A unidade atinge a meta de chamados, mas os controles não são eficientes e não há informações sobre os chamados reabertos. 0 - Não atende os requisitos.', 3, false),
    ('9.3', 9, 'NÍVEL DE SERVIÇO', 'melhorar', 35, 'A unidade possui um plano efetivo, amplo e frequente de comunicação dos processos de manutenção, obras e serviços concluídos e feedback de chamados?', 'Verificar se a unidade possui uma rotina de comunicar as frentes da área. Checar se existe plano de comunicação para iniciar atividades de manutenção e obras constando: macro atividades, cronograma, plano de tráfego e áreas a serem isoladas, sendo obrigatória a presença dos responsáveis abaixo: Ambev - Gerente da área, Prefeito 5S, TST e Tec. de Manutenção; Terceiros - Responsável pela área e TST; Construtora - Encarregado e TST. Consultar materiais de RCOG, R. Estrutura, Super Matinal. Checar a ativação e comunicação via WorkPlace e Comunicação Interna. Entrevista in loco.', '3 – Comunicação eficiente, frequente e ampla, utilizando as reuniões corretas e promovendo mudança na percepção da área. 1 - Comunicação inconsistente e Plano de Ação com falhas. 0 - Não existe comunicação.', 3, false),
    ('9.4', 9, 'NÍVEL DE SERVIÇO', 'melhorar', 36, 'Foi feito algum benckmark de processo, indicadores, melhores práticas ou iniciativas com outras operações?', 'Verificar o processo de busca e compartilhamento de Melhores Práticas de Manutenção entre as unidades. Verificar evolução direta ou indireta no processo que foi aplicado a Melhor Prática. Verificar planos de ação.', '3 – A unidade adotou/compartilhou alguma melhor prática e consegue evidenciar melhoria nos processos. 1 – A unidade adotou/compartilhou alguma melhor prática, mas ainda não houve melhoria nos processos. 0 - Não existem evidências.', 1, false)
) as i(numero, secao, secao_nome, bloco, ordem, pergunta, verificacao, criterios, peso, critico)
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id, numero) do nothing;

-- ------------------------------------------------------------------
-- 4) Liga o modulo (o acesso continua pessoa a pessoa)
-- ------------------------------------------------------------------
insert into public.revenda_modulos (revenda_id, modulo, ativo)
select r.id, 'manutencao', true
from public.revendas r
where r.id in (
  '7afe4da5-e846-4b02-947f-96843a2791fe', -- Sao Felix
  'fc365d16-ccbd-4322-ae02-e992a36861e8'  -- Barreiras
)
on conflict (revenda_id, modulo) do update set ativo = true;

notify pgrst, 'reload schema';

-- Confira: bucket privado, 72 itens (36 por revenda), modulo nas 2 revendas.
select 'bucket manutencao publico?' as item, public::text as valor from storage.buckets where id = 'manutencao'
union all
select 'itens em ' || r.nome, count(*)::text
from public.manut_itens i join public.revendas r on r.id = i.revenda_id
group by r.nome
union all
select 'modulo ligado em ' || r.nome, rm.ativo::text
from public.revenda_modulos rm join public.revendas r on r.id = rm.revenda_id
where rm.modulo = 'manutencao';
