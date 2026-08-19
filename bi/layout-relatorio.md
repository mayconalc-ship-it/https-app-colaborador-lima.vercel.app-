# Formatação do BI — App do Colaborador

Especificação visual do relatório. Canvas **1280 × 720** (16:9, Exibir >
Tamanho da página > Personalizado), grade de 8 px, margem externa 16 px,
espaço entre cartões 12 px.

Importe `tema-powerbi.json` primeiro: **Exibir > Temas > Procurar temas**.
Ele já define fontes, bordas, grade recessiva, fundo da página e a paleta.
Com o tema aplicado, quase nenhum visual precisa de formatação manual — e é
essa a intenção. Ajuste de cor visual a visual é o que faz um relatório
envelhecer feio.

---

## 1. A paleta, e por que é esta

Base na identidade do app (`src/app/globals.css`): azul `#0b4da2` e dourado
`#ffc72c`.

| Papel | Cores |
|---|---|
| **Categórica** (identidade: área, categoria, equipe) | `#0b4da2` `#d97706` `#b02a6e` `#1f8f3a` `#6b46c1` `#8a6a00` |
| **Sequencial** (magnitude: matriz, mapa de calor) | `#e7eefa` → `#0b4da2` → `#063573` |
| **Status** (estado, só em KPI e formatação condicional) | bom `#166534` · atenção `#b45309` · crítico `#b91c1c` |
| **Neutros** (texto, grade, "sem dado") | `#0f172a` `#475569` `#64748b` `#e2e8f0` `#f1f5f9` |

A ordem categórica **é fixa**. Não a embaralhe por visual: se "DU" é azul no
gráfico de contagens, tem de ser azul no de feedback também — cor que muda de
dono entre páginas obriga o leitor a reler a legenda toda vez.

Esta sequência foi validada para daltonismo (deutan/protan/tritan), faixa de
luminosidade, saturação mínima e contraste contra fundo branco — todos os
seis pares adjacentes passam. Trocar uma cor "porque ficou melhor" desfaz
isso; se precisar trocar, revalide.

O dourado `#ffc72c` fica **fora** da paleta de dados de propósito: contra
fundo branco ele não alcança 3:1 e sumiria numa linha fina. Use-o só como
acento de cabeçalho e em medalha de 1º lugar, sobre fundo escuro.

Status é reservado. Verde de status nunca é "a quarta série" — se um gráfico
de barras precisar de verde para categoria, ele usa `#1f8f3a` (categórica), e
o `#166534` continua significando só "bom".

---

## 2. Estrutura da página (vale para todas)

```
┌────────────────────────────────────────────────────────────┐  y=16
│  ● App do Colaborador · <Nome da página>        <período>  │  h=48
├────────────────────────────────────────────────────────────┤  y=76
│ [Revenda ▾] [Período ▾] [Área ▾] [Colaborador ▾]           │  h=40
├────────────────────────────────────────────────────────────┤  y=128
│  KPI    │  KPI    │  KPI    │  KPI    │  KPI               │  h=96
├─────────┴─────────┴─────────┼──────────────────────────────┤  y=236
│                             │                              │
│  Evolução (o gráfico maior) │  Ranking / distribuição      │  h=250
│                             │                              │
├─────────────────────────────┴──────────────────────────────┤  y=498
│  Tabela de detalhe / análise                               │  h=206
└────────────────────────────────────────────────────────────┘  y=704
```

**Cabeçalho:** retângulo `#0b4da2` de 1280 × 48 sangrando até as bordas
laterais, texto branco Segoe UI Semibold 14, ponto dourado `#ffc72c` de 8 px
à esquerda. Repita idêntico em todas as páginas — é o que faz o conjunto
parecer um produto e não sete arquivos.

**Filtros:** os quatro na mesma linha, sempre na mesma ordem, sempre no topo.
Marque **Sincronizar segmentações** (Exibir > Sincronizar segmentações) para
os quatro em todas as páginas — filtro que se perde ao navegar é o defeito
que mais destrói confiança em BI.

- `Revenda` → `dim_revenda[revenda]`, lista suspensa, seleção única
- `Período` → `dim_calendario[data]`, **Entre** (slider de datas)
- `Área` → `dim_colaborador[area_rotulo]`, lista suspensa
- `Colaborador` → `dim_colaborador[colaborador]`, lista suspensa com busca

**Cartões de KPI:** visual `Cartão`, 240 × 96, título em `label` 10 px cinza
`#64748b` acima, número em `callout` 30 px. Sob o número, uma **medida de
variação** (`Δ …`) em 11 px com formatação condicional verde/vermelho — o
cartão sem comparação é um número sem opinião.

**Nada de eixo duplo.** Em nenhum visual, em nenhuma página. Duas medidas de
escalas diferentes viram dois gráficos empilhados ou uma indexada à outra. É
o erro que mais aparece em relatório executivo e o que mais leva a conclusão
errada.

---

## 3. Página 1 — Visão Executiva

**KPIs (5):** `Colaboradores` · `% Adesão` (+ `Δ Adesão`) · `Interações` ·
`Módulos usados` · `Aguardando tratativa`.

| Posição | Visual | Campos |
|---|---|---|
| Esquerda, 760 × 250 | **Linha** | Eixo `dim_calendario[inicio_semana]`, valor `Interações`, legenda `fato_atividade[modulo]` |
| Direita, 460 × 250 | **Barras horizontais** | Eixo `fato_atividade[modulo]`, valor `% Adesão` do módulo, ordenado decrescente |
| Base, 1248 × 206 | **Matriz** | Linhas `dim_colaborador[colaborador]`, colunas `fato_atividade[modulo]`, valor `Interações` |

Na linha de evolução: 2 px de espessura, marcadores desligados, **rótulos
diretos** no fim de cada série (Formato > Rótulos de dados > Personalizar
série > só o último ponto) — com cinco módulos a legenda no topo continua,
mas o rótulo direto é quem realmente identifica a linha.

Na matriz, formatação condicional **escala de cores** na rampa sequencial
(`#e7eefa` → `#063573`), nunca nas cores categóricas. Célula vazia com fundo
`#f8fafc`: o buraco é o achado, e ele precisa aparecer.

> Cuidado de leitura, e vale escrever numa caixa de texto na própria página:
> `fato_atividade` conta **interações**, não qualidade. Um colaborador com 40
> lançamentos de AG e nenhum feedback aparece como "muito ativo". Adesão e
> desempenho são perguntas diferentes e moram em páginas diferentes.

---

## 4. Página 2 — Ativo de Giro

**KPIs (5):** `Contagens` · `Contadores` · `% Participação AG` ·
`% Lançado no dia` · `Recontagens pendentes`.

| Visual | Tipo | Detalhe |
|---|---|---|
| Evolução das contagens | **Coluna** | Eixo `dim_calendario[data]`, valor `Contagens`, cor única `#0b4da2` |
| Comparativo entre colaboradores | **Barras horizontais** | `fato_ag_contagem[colaborador_nome]` × `Contagens`, decrescente, top 15 |
| Conciliação | **Matriz** | Linhas `item`, colunas `dim_calendario[data]`, valor `Divergência absoluta` |
| Itens com divergência | **Barras** | `fato_ag_conciliacao[item]` × `Divergência absoluta`, decrescente |
| Ranking | **Tabela** | Colaborador, Contagens, Dias com contagem, `% Lançado no dia`, Total em caixas |

**Filtro obrigatório de página:** `fato_ag_conciliacao[parque_confiavel] =
True` no painel Filtros, nível **Página**. Sem ele, todo visual de
divergência compara contagens antigas com o saldo de parque de hoje — e
desenha uma série que nunca existiu. Se você rodou
`03-opcional-historico-parque-ag.sql`, troque a tabela pela
`fato_ag_conciliacao_historica` e o filtro deixa de ser necessário.

Nas barras de divergência use **formatação condicional por valor**: falta em
`#b91c1c`, sobra em `#b45309`, "bateu" em `#166534`. Aqui a cor é status, não
identidade — e por isso não sai da paleta categórica.

Coloque `Linhas sem fator` como cartão pequeno no rodapé. Se for > 0, o total
em caixas está subestimado e alguém precisa cadastrar o fator do formato.

---

## 5. Página 3 — Feedback de Rota

**KPIs (5):** `Feedbacks` · `Nota média` · `% Satisfação` · `% Notas ruins` ·
`Rota mais crítica`.

| Visual | Tipo | Detalhe |
|---|---|---|
| Evolução da nota | **Linha** | `dim_calendario[data]` × `Nota média`, com linha constante em 2,0 (Analytics > Linha constante, tracejada `#94a3b8`) |
| Distribuição das notas | **Coluna** | `nota_rotulo` na ordem Ruim → Ótima, cor por status: Ruim `#b91c1c`, Regular `#b45309`, Boa `#0b4da2`, Ótima `#166534` |
| Principais problemas | **Barras horizontais** | `fato_feedback_ocorrencia[ocorrencia]` × `Feedbacks com ocorrência` |
| Por rota | **Barras** | `rota` × `Nota média`, crescente, mostrando as 10 piores |
| Por motorista | **Dispersão** | X = `Feedbacks`, Y = `Nota média`, detalhe `colaborador` |
| Comentários | **Tabela** | Data, Colaborador, Rota, `nota_rotulo`, Comentário — largura total, quebra de texto ligada |

Ordene a distribuição de notas **pelo valor da nota**, não pela contagem
(Ordenar por > `nota`). Escala ordinal reordenada por frequência deixa de ser
legível como escala.

Na dispersão, adicione linhas de média em X e Y (Analytics > Linha média) —
os quatro quadrantes contam a história sozinhos: muito feedback e nota baixa
é o canto que exige ação; pouco feedback e nota alta é quem ainda não
engajou.

A tabela de comentários é o visual mais valioso da página e o mais fácil de
espremer. Dê a ela a largura inteira e altura para 6 linhas visíveis.

---

## 6. Página 4 — Cinco Porquês

**KPIs (5):** `Análises` · `% Conclusão` · `% Chegou ao 5º porquê` ·
`Aguardando tratativa` · `Horas médias até resposta`.

| Visual | Tipo | Detalhe |
|---|---|---|
| Funil do módulo | **Funil** | Iniciadas → Concluídas → Respondidas → Aceitas |
| Causas-raiz | **Barras horizontais** | `categoria` × `Análises`, decrescente |
| Problema → causa | **Matriz** | Linhas `problema`, colunas `categoria`, valor `Análises`, escala sequencial |
| Evolução | **Coluna empilhada** | `dim_calendario[inicio_semana]` × `Análises` por `categoria`, 2 px de espaço entre segmentos |
| Problema · Causa · Ação | **Tabela** | De `fato_cinco_porques_matriz`: Problema, Categoria, Causa raiz, Ação sugerida, Ocorrências, Tratadas |
| Cadeia causal | **Matriz** | Linhas `analise_id` + `problema`, colunas `nivel_rotulo`, valor primeiro `resposta` |

A tabela `Problema · Causa · Ação` é o entregável desta página — é ela que
vira pauta de reunião. Ordene por `Ocorrências` decrescente e destaque com
formatação condicional as linhas com `Tratadas` = 0.

`Horas médias até resposta` é o indicador de saúde do módulo, não de volume.
Se passar de ~48 h, o time para de preencher — coloque uma linha constante
nesse valor no gráfico de evolução do SLA.

---

## 7. Página 5 — Plano de Comunicação

**KPIs (5):** `Comunicados publicados` · `Curtidas` ·
`Curtidas por comunicado` · `% Participação na comunicação` ·
`Cliques no aviso (piso)`.

| Visual | Tipo | Detalhe |
|---|---|---|
| Publicações por período | **Coluna empilhada** | `dim_calendario[inicio_mes]` × `Comunicados publicados` por `categoria` |
| Engajamento por categoria | **Barras** | `categoria` × `Taxa média de curtida` |
| Mais acessados | **Tabela** | Título, Categoria, Data, Curtidas, `taxa_curtida`, Cliques — barras de dados na coluna Curtidas |
| Quem participa | **Barras horizontais** | `fato_comunicado_curtida[colaborador]` × Curtidas, top 15 |
| Evolução do alcance | **Linha** | `inicio_mes` × `Taxa média de curtida` |

**Renomeie o KPI de cliques para "Cliques no aviso (piso)" e coloque uma
caixa de texto explicando.** O app não registra abertura de comunicado: não
existe rota por comunicado nem tabela de leitura. O número vem de
`notificacao_estado`, que por desenho só ganha linha de quem interagiu com o
sino. Chamar isso de "visualizações" é o tipo de rótulo que produz a reunião
em que se conclui que 12% do time lê o jornal — quando na verdade 12% clicou
no sino. Curtida é o sinal confiável desta página.

---

## 8. Página 6 — Quiz / Desafio do Mês

**KPIs (5):** `Participações concluídas` · `Taxa de participação` ·
`Aproveitamento médio` · `Participantes únicos` · `Questões críticas`.

| Visual | Tipo | Detalhe |
|---|---|---|
| Participação por rodada | **Colunas agrupadas** | `mes_rotulo` × (`elegiveis`, `concluidas`), 2 px entre barras |
| Evolução do desempenho | **Linha** | `mes_ref` × `Aproveitamento médio`, uma série por `area_rotulo` |
| Ranking | **Tabela** | Colaborador, Área, Rodadas, Pontos, Acertos, `Aproveitamento médio`, `Tempo total (s)`, `Posição na temporada` — **ordenado por `Posição na temporada` (crescente)**, nunca por Pontos: a posição carrega o desempate oficial (pontos → acertos → menos tempo → quem concluiu primeiro) |
| Perguntas mais erradas | **Barras horizontais** | `dim_quiz_questao[pergunta]` × `Taxa de erro (período)`, decrescente, top 10 |
| Comparativo entre áreas | **Colunas agrupadas** | `area_rotulo` × `Aproveitamento médio` por `mes_rotulo` |

Em "participação por rodada", elegíveis e concluídas **agrupadas**, não
empilhadas — empilhar sugere que somam, e elegíveis contém concluídas.

Nas perguntas mais erradas, filtre para pelo menos 5 respostas (painel
Filtros, `Contagem de fato_quiz_resposta` >= 5). Sem esse corte, uma pergunta
respondida uma vez por uma pessoa que errou aparece como 100% de erro no topo
da lista.

No ranking, medalhas nas três primeiras posições: `#ffc72c`, `#94a3b8`,
`#b45309` como cor de fundo da célula de posição — é o único lugar onde o
dourado da marca entra, e ele funciona porque está sobre fundo preenchido.

---

## 9. Página 7 — Super Matinal e Sonho da Revenda

As duas juntas numa página, e a página é curta. **Não é economia de espaço, é
o que os dados permitem** — leia a seção "Lacunas" do `LEIA-ME.md` antes de
prometer esta página para a diretoria.

**Super Matinal** (metade superior):

| Visual | Tipo | Detalhe |
|---|---|---|
| Cobertura da publicação | **Matriz** | Linhas `categoria`, colunas `mes_rotulo`, valor `% Cobertura da publicação`, formatação por ícone: ✓ publicado, ✕ faltando |
| Quadros publicados por mês | **Coluna** | `mes_rotulo` × `Quadros publicados`, legenda `equipe_rotulo` |
| Galeria | **Tabela** | Mês, Equipe, Categoria, `imagem_url` como **URL da imagem** (Colunas > Categoria de dados > URL da Imagem) |

A matriz de cobertura é o indicador real disponível: ela mostra o mês em que
o quadro de uma categoria não foi publicado. Ranking, pontuação e evolução de
pontos **não existem no banco** — estão dentro do arquivo de imagem.

**Sonho da Revenda** (metade inferior): cartões com `titulo`, `frase`, `ano`
e `ano_decorrido` como medidor, mais o link do quadro de indicadores. É um
bloco de contexto, não de análise — meta e realizado não existem em tabela.

---

## 10. Página 8 — Detalhe (oculta)

Página com uma tabela por fato, sem KPI e sem gráfico. Clique direito na aba
> **Ocultar página**: ela não aparece na navegação, mas continua sendo o
destino de **drill-through** (Exibir > painel Detalhamento) a partir de
qualquer visual das outras páginas.

É o que responde "de onde saiu esse número" sem poluir as páginas
executivas — e é a diferença entre um BI que a gestão confia e um que ela
audita no Excel por fora.

---

## 11. Checagem final antes de publicar

- [ ] Todo visual tem título em português, sem nome de coluna cru (`Soma de contagens` → `Contagens no período`)
- [ ] Nenhum eixo duplo em nenhuma página
- [ ] Ordem categórica igual em todas as páginas
- [ ] Segmentações sincronizadas nas 7 páginas visíveis
- [ ] `parque_confiavel = True` filtrando a página do AG
- [ ] Medidas de % formatadas como porcentagem com 1 casa
- [ ] `dim_calendario` marcada como tabela de data
- [ ] Cartão de cliques em comunicados renomeado para "(piso)"
- [ ] Corte mínimo aplicado em "rota mais crítica" (≥ 3) e "perguntas mais erradas" (≥ 5)
- [ ] Página de detalhe oculta e configurada como destino de drill-through
- [ ] Nenhum campo de CPF no modelo
- [ ] Atualização agendada configurada no Power BI Service **com gateway** — ver `04-gateway-e-atualizacao.md`. O conector PostgreSQL exige gateway mesmo com o banco na nuvem.
