-- ==================================================================
-- 180 - CHECK FERRAMENTAL de Barreiras (dentro da Preventiva)
-- Execute no Supabase do App Colaborador: SQL Editor > New query > Run
-- Depende da 174 e da 178. Pode rodar mais de uma vez (nao duplica).
-- ==================================================================
-- Pedido do dono (17/11/2026): incluir o check ferramental no app da
-- manutencao. Entra como mais um tipo da Preventiva (como o Gerador:
-- sem cadastro de aparelhos -- o "aparelho" e o ferramental inteiro),
-- so em Barreiras, a cada 15 dias (ajustavel na Lideranca).
--
-- Cada ferramenta e uma pergunta: OK / Com defeito / Nao encontrada.
-- As duas ultimas contam como alerta no painel e no lembrete. Foto
-- opcional em todas (para registrar o defeito).
--
-- Blocos da lista: Ferramentas eletricas (abaixo), Caixa de
-- ferramentas e Almoxarifado -- esses dois vieram sem itens e entram
-- numa proxima migration quando a lista chegar (ordem 100+ e 200+
-- ficam reservadas para eles).
--
-- Nomes de marca acertados: marquita -> Makita, blakdecker ->
-- Black+Decker, hikare -> Hikari, sthill -> Stihl, Wap -> WAP.

insert into public.manut_prev_modelos
  (revenda_id, nome, equipamento, emoji, periodicidade_dias, ordem, usa_equipamentos, descricao)
select r.id, 'Check Ferramental', 'Ferramental', E'\U0001F9F0', 15, 4, false,
       'Confere se cada ferramenta está no lugar e funcionando.'
from public.revendas r
where r.nome = 'Revenda Lima Barreiras'
on conflict (revenda_id, nome) do nothing;

insert into public.manut_prev_itens
  (modelo_id, revenda_id, ordem, bloco, pergunta, ajuda, tipo, opcoes, unidade, casas_decimais,
   obrigatorio, aceita_foto, alerta_valores, minimo, maximo)
select m.id, m.revenda_id, i.ordem, 'Ferramentas elétricas', i.pergunta, i.ajuda, 'opcao',
       '{"OK","Com defeito","Não encontrada"}'::text[], null, 0,
       true, true, '{"Com defeito","Não encontrada"}'::text[], null, null
from public.manut_prev_modelos m
join public.revendas r on r.id = m.revenda_id
cross join (values
  (1,  'Furadeira Bosch 820 W', null::text),
  (2,  'Lixadeira industrial Makita', null),
  (3,  'Serra mármore Makita', null),
  (4,  'Máquina de solda 160 A', null),
  (5,  'Soprador a combustão', null),
  (6,  'Compressor de pintura', null),
  (7,  'Tico-tico Black+Decker', null),
  (8,  'Bomba de limpeza de ar-condicionado 80 W', null),
  (9,  'WAP de limpeza', null),
  (10, 'Testador de cabo (2 unidades)', 'São 2. Se uma faltar ou tiver defeito, marque e escreva qual na observação do final.'),
  (11, 'Multímetro Minipa', null),
  (12, 'Multímetro Hikari', null),
  (13, 'Bomba manual pulverizadora 20 L', null),
  (14, 'Ferro de solda Hikari 80 W', null),
  (15, 'Motopoda Stihl', null)
) as i(ordem, pergunta, ajuda)
where r.nome = 'Revenda Lima Barreiras'
  and m.nome = 'Check Ferramental'
on conflict (modelo_id, ordem) do nothing;

notify pgrst, 'reload schema';

-- Conferencia: 1 linha, Barreiras, 15 dias, 15 itens.
select m.nome, r.nome as revenda, m.periodicidade_dias,
       (select count(*) from public.manut_prev_itens i where i.modelo_id = m.id) as itens
from public.manut_prev_modelos m join public.revendas r on r.id = m.revenda_id
where m.nome = 'Check Ferramental';
