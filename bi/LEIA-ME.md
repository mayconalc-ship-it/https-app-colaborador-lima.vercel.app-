# BI do App do Colaborador

> **Rodada de 23/08/2026.** O projeto passou de 8 para 10 páginas de gestão
> (entraram a **Capa**, com um cartão-link para cada página, e o
> **Cronograma da Comunicação**, a visão de calendário que já existia em
> `/admin/comunicados/calendario`). No Ativo de Giro entrou a **meta da cia
> — 3 contagens por semana**; no Feedback da Rota, "Rota mais crítica" deu
> lugar a **"Cidade mais crítica"**, cruzando o nº do mapa com o relatório
> de rotas; no 5 Porquês, o cartão de horas virou **TMR** (horas até 24 h,
> dias acima) e a **tratativa do analista** entrou na pauta da reunião.
> Três views novas — `fato_feedback_cidade`, `fato_comunicado_agenda` e o
> par `dia`/`dia_rotulo` em `dim_calendario` —, então
> **o banco precisa ser atualizado**: rode `09-atualizacao-23-08-2026.sql`
> (o recorte do 01 com só o que mudou — uma colagem em vez de dez) e em
> seguida `02-acesso-powerbi.sql`, que dá o GRANT às views novas. Ao
> copiar qualquer SQL daqui, leia o arquivo como **UTF-8 explícito** —
> ver o cabeçalho de `10-conferir-acentos.sql`: é o mesmo cuidado que
> evita o `'Ótima'` sair torto no gráfico de distribuição das notas.

Camada de tratamento de dados e especificação visual do relatório. O que
está aqui cobre as duas partes que você pediu — o **tratamento** (views SQL
que transformam as tabelas do app em fatos e dimensões prontos) e a
**formatação** (tema, paleta validada e layout página a página). Montar o
`.pbix` é o que fica com você.

## Ordem de execução

**Comece por [`08-abrir-o-pbip.md`](08-abrir-o-pbip.md).** O projeto em
`bi/pbip/` já traz o modelo, as 124 medidas, os 54 relacionamentos, o tema
e as 12 páginas montadas — abre no Power BI Desktop e salva como `.pbix`,
sem arrastar visual nenhum. O roteiro manual de montagem
(`06-montar-pbix.md`) ficou como referência de quem quer entender as
escolhas, não como caminho obrigatório.

| # | Arquivo | O que faz |
|---|---|---|
| 1 | `01-camada-semantica.sql` | Cria o esquema `bi` com 35 views. **Não altera nada do app.** |
| 2 | `02-acesso-powerbi.sql` | Cria o usuário `powerbi_readonly` e libera só o esquema `bi`. |
| 3 | `08-abrir-o-pbip.md` | **Abrir o projeto pronto e salvar como `.pbix`.** É por aqui. |
| 4 | `04-gateway-e-atualizacao.md` | Gateway no PC do escritório e agendamento da atualização. |
| 5 | `09-atualizacao-23-08-2026.sql` | **Recorte do 01 com o que mudou em 23/08/2026.** Uma colagem em vez de dez. |
| 6 | `10-conferir-acentos.sql` | **Confere se algum rótulo entrou quebrado no banco.** Três selects, não altera nada. |
| — | `pbip/gerar-pbip.js` | Regera o projeto a partir de `modelo.js` + `paginas.js` + `07-medidas.dax`. |
| — | `pbip/validar.js` | Confere os campos das 12 páginas contra o modelo antes de abrir. |
| — | `07-medidas.dax` | As 124 medidas. **Fonte da verdade** — o gerador lê daqui. |
| — | `medidas-dax.md` | As mesmas medidas explicadas uma a uma, com o porquê de cada corte. |
| — | `layout-relatorio.md` | Layout das 8 páginas de gestão originais, visual a visual. |
| — | `06-montar-pbix.md` | Montagem manual, caso queira refazer à mão. |
| — | `tema-powerbi.json` | Já vem embutido no projeto. Só importe à mão se montar do zero. |
| — | `05-atualizar-agora.ps1` | Força a atualização fora do horário agendado. Precisa do gateway já configurado. |
| — | `03-opcional-historico-parque-ag.sql` | **Opcional e altera o banco.** Leia antes de rodar. |

> Os arquivos dentro de `bi/pbip/BI App do Colaborador.*` são **saída do
> gerador**. Não edite à mão: a próxima geração sobrescreve tudo. Para
> mudar algo, mexa em `modelo.js`, `paginas.js` ou `07-medidas.dax`.

> O `Guia_PowerBI_Supabase_AppColaborador.docx` que circulou antes afirma que
> o Supabase, por ser nuvem, dispensa Gateway. Isso não vale para o conector
> PostgreSQL — ver `04-gateway-e-atualizacao.md`.

## O ponto que destrava tudo: RLS

Quase toda tabela deste banco tem Row Level Security, e várias (`quiz_*`,
`cinco_porques_analises`, `notificacoes`, `profiles`) só devolvem linha para
o próprio dono do dado — ou não devolvem para ninguém que não seja o
`service_role`. Um usuário de leitura com `GRANT SELECT` nas tabelas leria
**zero linha**, e o relatório nasceria vazio sem nenhum erro de conexão para
explicar por quê.

As views do esquema `bi` resolvem isso porque uma view em Postgres roda com
os privilégios do **dono** dela. Criadas pelo role `postgres`, que é dono das
tabelas de `public` — e dono de tabela não é submetido a RLS —, elas leem
tudo. O `powerbi_readonly` recebe `SELECT` só nas views, e nunca nas tabelas.

Em troca, o isolamento entre revendas deixa de ser feito pelo banco e passa a
ser responsabilidade do relatório. Toda view carrega `revenda_id` para isso.
Se o BI for distribuído para liderança de uma revenda só, configure RLS do
próprio Power BI (Modelagem > Gerenciar funções) filtrando `dim_revenda`.

O Advisor do Supabase vai sinalizar essas views como "SECURITY DEFINER view".
É esperado: elas não são expostas pela API do app e só o usuário de BI as lê.

## Decisões que tomei sem perguntar

**CPF fora do modelo.** `profiles.cpf` não entra em nenhuma view. Não serve a
indicador nenhum e, uma vez importado, viaja dentro do `.pbix` em anexo de
e-mail. Para casar com base externa, use `matricula`.

**Fuso America/São_Paulo em toda coluna de data.** O servidor grava em UTC;
sem a conversão, tudo que acontece das 21 h à meia-noite cai no dia seguinte
no relatório. É o tipo de erro que ninguém nota até alguém conferir uma
contagem específica.

**Conversão de caixas no SQL, não em DAX.** `total_caixas` usa os fatores de
`ag_fatores`, que são **por revenda**. Reescrever isso em medida seria
duplicar regra de negócio num lugar onde ninguém vai lembrar de atualizar
quando o palete de 600 ml deixar de ser 42.

**Normalização de área espelhando o app.** `bi.area_padrao()` traduz o texto
livre de `profiles.area` para DU/AL com a mesma regra de
`src/lib/quiz.ts`. Se essa regra mudar lá, mude aqui — senão o BI e a tela
passam a discordar sobre quem é DU.

---

## Lacunas — leia antes de prometer as páginas

Quatro itens do seu prompt **não são calculáveis com o banco de hoje**. Não é
questão de consulta mais esperta: o dado não existe. Preferi entregar o que
dá para medir e dizer isto com todas as letras a entregar um visual que
parece certo.

### 1. Super Matinal não tem pontuação

`ranking_matinal` guarda **uma imagem** por mês × time × categoria. Não há
colaborador, não há ponto, não há colocação — está tudo dentro do arquivo
publicado. "Ranking geral", "pontuação por colaborador" e "evolução da
pontuação" não existem.

O que entreguei no lugar: `fato_ranking_matinal_cobertura`, que mostra qual
mês/categoria deixou de ser publicado. É disciplina de processo, não
desempenho.

**Para virar o que você pediu:** uma tabela
`ranking_matinal_pontos (revenda_id, mes_ano, time, categoria,
colaborador_id, posicao, pontos)` e uma tela de lançamento no admin. Sem
isso, a alternativa é o gestor digitar os pontos numa planilha e o Power BI
importá-la em paralelo — funciona, mas cria uma segunda fonte da verdade.

### 2. Sonho da Revenda não tem meta nem realizado

`sonho_revenda` guarda título, frase, o arquivo (imagem/pptx/pdf) e a URL do
quadro de indicadores. Não há meta, não há realizado, não há percentual.
"Realizado × objetivo" e "% de atingimento" não existem em tabela.

**Para virar o que você pediu:** uma tabela
`sonho_indicadores (revenda_id, ano, indicador, unidade, meta, mes,
realizado)`. É a menor mudança da lista e a que mais rende — vira medidor,
farol e série de evolução de imediato.

### 3. Comunicados não registram leitura

Não existe rota `/comunicados/[id]` nem tabela de visualização. Os dois
sinais disponíveis são **curtidas** (confiável, mas mede quem gostou, não
quem leu) e **`notificacao_estado`** (só ganha linha de quem interagiu com o
sino — é piso, nunca total). Por isso as colunas se chamam
`avisos_vistos`/`avisos_clicados` e não "visualizações".

**Para virar o que você pediu:** uma tabela
`comunicado_leituras (comunicado_id, colaborador_id, lido_em)` gravada quando
o card é aberto. É a mudança mais barata das quatro e transforma o bloco
inteiro de comunicação.

### 4. O parque de AG não tem histórico

`ag_parque` guarda um saldo por revenda/tipo/formato, sobrescrito a cada
ajuste. A divergência de um dia passado acaba sendo calculada contra o saldo
de hoje, e o gráfico de "evolução das divergências" se reescreve inteiro toda
vez que alguém corrige o parque.

`fato_ag_conciliacao` marca isso em `parque_confiavel`, e o layout manda
filtrar por ela. **`03-opcional-historico-parque-ag.sql` resolve de vez** —
com a ressalva de que ele só grava dali para frente: o passado já sobrescrito
não volta.

---

## Ideias que não estavam no prompt e que valem a pena

**Um KPI de SLA no 5 Porquês.** `Horas médias até resposta` mede a liderança,
não o motorista, e é o que decide se o módulo sobrevive: análise concluída
que ninguém responde ensina o time a não preencher a próxima. Sugiro subir
esse cartão para a página executiva.

**`% Lançado no dia` no AG.** Contagem digitada três dias depois vale menos
que contagem do dia. A coluna `atraso_dias` já existe na view e mede
disciplina de processo — algo que "quantidade de contagens" esconde.

**Cortes mínimos nos rankings.** "Cidade mais crítica" com ≥ 3 feedbacks e
"pergunta mais errada" com ≥ 5 respostas. Sem isso, uma rota com um único
feedback ruim vira "a pior rota da revenda" na primeira reunião — e o painel
perde credibilidade de uma vez só.

**A página de detalhe oculta como destino de drill-through.** É a diferença
entre um BI que a gestão confia e um que ela audita no Excel por fora.

**Uma medida de "quem nunca participou".** `dim_colaborador` menos
`fato_atividade` responde quem não abriu o app no mês. Costuma ser o número
mais acionável do relatório inteiro, e ele não estava no prompt.
