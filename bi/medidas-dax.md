# Medidas DAX — BI do App do Colaborador

Cole cada bloco em **Modelagem > Nova medida**. Antes disso, monte o modelo
como descrito abaixo — quase todo erro de DAX em relatório novo é, na
verdade, relacionamento faltando.

---

## 1. Modelo

### Tabela de medidas

Crie uma tabela vazia só para guardar medidas — assim elas não ficam
espalhadas dentro dos fatos:

> Inserir dados > nomeie `_Medidas` > uma coluna qualquer > OK.
> Depois de criar a primeira medida, oculte a coluna.

### Marcar o calendário

Selecione `dim_calendario` > **Marcar como tabela de data** > coluna `data`.
Sem isso, `SAMEPERIODLASTYEAR`, `DATESINPERIOD` e afins devolvem resultado
errado sem avisar.

### Relacionamentos

Todos **um-para-muitos**, filtro **único**, partindo da dimensão:

| De | Para | Colunas |
|---|---|---|
| `dim_calendario` | `fato_ag_contagem` | `data` → `data` |
| `dim_calendario` | `fato_ag_conciliacao` | `data` → `data` |
| `dim_calendario` | `fato_feedback_rota` | `data` → `data` |
| `dim_calendario` | `fato_feedback_ocorrencia` | `data` → `data` |
| `dim_calendario` | `fato_cinco_porques` | `data` → `data` |
| `dim_calendario` | `fato_quiz_participacao` | `data` → `data` |
| `dim_calendario` | `fato_quiz_resposta` | `data` → `data` |
| `dim_calendario` | `fato_comunicado` | `data` → `data` |
| `dim_calendario` | `fato_atividade` | `data` → `data` |
| `dim_revenda` | todos os fatos | `revenda_id` → `revenda_id` |
| `dim_quiz_rodada` | `fato_quiz_participacao` | `rodada_id` → `rodada_id` |
| `dim_quiz_questao` | `fato_quiz_resposta` | `questao_id` → `questao_id` |
| `fato_comunicado` | `fato_comunicado_curtida` | `comunicado_id` → `comunicado_id` |
| `fato_cinco_porques` | `fato_cinco_porques_resposta` | `analise_id` → `analise_id` |

**`dim_colaborador` é o caso que exige cuidado.** A chave dela é
`colaborador_id` **+** `revenda_id` — a mesma pessoa aparece duas vezes se
atende as duas revendas. Relacionamento por `colaborador_id` sozinho o Power
BI recusa (não é único). Duas saídas:

- **Recomendado:** filtre o relatório por uma revenda por vez e crie a
  relação usando uma coluna calculada de chave composta nos dois lados:
  ```dax
  Chave = dim_colaborador[colaborador_id] & "|" & dim_colaborador[revenda_id]
  ```
  e a equivalente em cada fato.
- **Mais simples:** não relacione. Todo fato já traz `colaborador_nome` /
  `colaborador` gravado na própria linha (é uma foto do nome no dia do
  lançamento — de propósito, para o histórico não mudar quando alguém é
  renomeado). Para ranking e comparativo isso basta. Use `dim_colaborador`
  apenas onde precisar de **cargo** ou de **quem NÃO participou**.

### Ocultar do relatório

Oculte todas as colunas `*_id` (exceto onde usar em contagem distinta),
`arquivo_url`, `imagem_url` e `explicacao`. Campo que não vira visual só
polui a lista.

---

## 2. Executivo — participação e adesão

```dax
Colaboradores = DISTINCTCOUNT ( dim_colaborador[colaborador_id] )
```

```dax
Colaboradores ativos = DISTINCTCOUNT ( fato_atividade[colaborador_id] )
```

```dax
% Adesão =
DIVIDE ( [Colaboradores ativos], [Colaboradores] )
```

```dax
Interações = SUM ( fato_atividade[interacoes] )
```

```dax
Módulos usados = DISTINCTCOUNT ( fato_atividade[modulo] )
```

Comparação com o mês anterior — o par que faz o cartão de KPI virar
diagnóstico em vez de número solto:

```dax
% Adesão mês anterior =
CALCULATE ( [% Adesão], DATEADD ( dim_calendario[data], -1, MONTH ) )
```

```dax
Δ Adesão =
VAR Atual = [% Adesão]
VAR Anterior = [% Adesão mês anterior]
RETURN IF ( NOT ISBLANK ( Anterior ), Atual - Anterior )
```

**Média vs. última semana válida** — o modelo de análise que você já usa,
traduzido para cá. "Válida" = semana com pelo menos um registro; a semana
corrente, ainda pela metade, ficaria artificialmente baixa e por isso é
descartada:

```dax
Interações — média semanal =
VAR Semanas =
    SUMMARIZE (
        FILTER ( ALLSELECTED ( dim_calendario ), dim_calendario[ja_aconteceu] ),
        dim_calendario[ano_semana],
        "@Qtd", [Interações]
    )
RETURN AVERAGEX ( FILTER ( Semanas, [@Qtd] > 0 ), [@Qtd] )
```

```dax
Interações — última semana válida =
VAR Semanas =
    FILTER (
        SUMMARIZE (
            FILTER (
                ALLSELECTED ( dim_calendario ),
                dim_calendario[inicio_semana] < STARTOFWEEK_PLACEHOLDER
            ),
            dim_calendario[inicio_semana],
            "@Qtd", [Interações]
        ),
        [@Qtd] > 0
    )
VAR Ultima = MAXX ( Semanas, dim_calendario[inicio_semana] )
RETURN MAXX ( FILTER ( Semanas, dim_calendario[inicio_semana] = Ultima ), [@Qtd] )
```

> Substitua `STARTOFWEEK_PLACEHOLDER` por
> `TODAY() - WEEKDAY ( TODAY(), 3 )` (semana começando na segunda).

```dax
Δ Última semana vs. média =
DIVIDE (
    [Interações — última semana válida] - [Interações — média semanal],
    [Interações — média semanal]
)
```

---

## 3. Ativo de Giro

```dax
Contagens = COUNTROWS ( fato_ag_contagem )
```

```dax
Contadores = DISTINCTCOUNT ( fato_ag_contagem[colaborador_id] )
```

```dax
Dias com contagem = DISTINCTCOUNT ( fato_ag_contagem[data] )
```

```dax
Total em caixas = SUM ( fato_ag_contagem[total_caixas] )
```

```dax
% Participação AG = DIVIDE ( [Contadores], [Colaboradores] )
```

Disciplina do processo — quanto do que foi contado entrou no app no mesmo
dia. Contagem digitada três dias depois vale menos que contagem do dia:

```dax
% Lançado no dia =
DIVIDE (
    CALCULATE ( [Contagens], fato_ag_contagem[lancado_no_dia] = TRUE() ),
    [Contagens]
)
```

```dax
Atraso médio (dias) = AVERAGE ( fato_ag_contagem[atraso_dias] )
```

Divergência. **Sempre com o filtro de confiabilidade** — sem ele o visual
compara o passado com o saldo de hoje (ver o cabeçalho de
`01-camada-semantica.sql`):

```dax
Divergência absoluta =
CALCULATE (
    SUM ( fato_ag_conciliacao[diferenca_abs] ),
    fato_ag_conciliacao[parque_confiavel] = TRUE()
)
```

```dax
Itens conciliados =
CALCULATE (
    COUNTROWS ( fato_ag_conciliacao ),
    fato_ag_conciliacao[parque_confiavel] = TRUE()
)
```

```dax
% Itens que bateram =
DIVIDE (
    CALCULATE (
        COUNTROWS ( fato_ag_conciliacao ),
        fato_ag_conciliacao[parque_confiavel] = TRUE(),
        fato_ag_conciliacao[resultado] = "Bateu"
    ),
    [Itens conciliados]
)
```

```dax
Maior divergência =
CALCULATE (
    MAX ( fato_ag_conciliacao[diferenca_abs] ),
    fato_ag_conciliacao[parque_confiavel] = TRUE()
)
```

Recontagens:

```dax
Recontagens pendentes =
CALCULATE (
    COUNTROWS ( fato_ag_recontagem ),
    fato_ag_recontagem[situacao] = "Pendente"
)
```

```dax
Horas médias p/ atender = AVERAGE ( fato_ag_recontagem[horas_para_atender] )
```

Sinalizador de dado quebrado — se acender, falta cadastrar fator de
conversão para algum formato e o total em caixas daquelas linhas está
subestimado:

```dax
Linhas sem fator =
CALCULATE ( [Contagens], fato_ag_contagem[fator_ausente] = TRUE() )
```

---

## 4. Feedback de Rota

```dax
Feedbacks = COUNTROWS ( fato_feedback_rota )
```

```dax
Nota média = AVERAGE ( fato_feedback_rota[nota] )
```

```dax
% Satisfação = AVERAGE ( fato_feedback_rota[nota_percentual] )
```

```dax
% Notas ruins =
DIVIDE (
    CALCULATE ( [Feedbacks], fato_feedback_rota[nota_ruim] = TRUE() ),
    [Feedbacks]
)
```

```dax
Motoristas que responderam = DISTINCTCOUNT ( fato_feedback_rota[colaborador_id] )
```

```dax
Rotas avaliadas = DISTINCTCOUNT ( fato_feedback_rota[rota] )
```

```dax
% Com comentário =
DIVIDE (
    CALCULATE ( [Feedbacks], fato_feedback_rota[tem_comentario] = TRUE() ),
    [Feedbacks]
)
```

Ocorrências — **conte feedbacks distintos, nunca linhas.** A view é
explodida: um feedback com três ocorrências vira três linhas, e
`COUNTROWS` triplicaria o volume:

```dax
Feedbacks com ocorrência =
DISTINCTCOUNT ( fato_feedback_ocorrencia[feedback_id] )
```

```dax
Ocorrências relatadas = COUNTROWS ( fato_feedback_ocorrencia )
```

```dax
% Rotas com ocorrência =
DIVIDE ( [Feedbacks com ocorrência], [Feedbacks] )
```

Rota crítica — a pior rota do período, para o cartão de destaque:

```dax
Rota mais crítica =
VAR Rotas =
    SUMMARIZE (
        fato_feedback_rota, fato_feedback_rota[rota],
        "@Nota", AVERAGE ( fato_feedback_rota[nota] ),
        "@Qtd", COUNTROWS ( fato_feedback_rota )
    )
VAR Elegiveis = FILTER ( Rotas, [@Qtd] >= 3 )
RETURN
    MAXX ( TOPN ( 1, Elegiveis, [@Nota], ASC ), fato_feedback_rota[rota] )
```

> O corte `@Qtd >= 3` é proposital: rota com um único feedback ruim viraria
> "a pior rota da revenda" e queimaria a credibilidade do painel na
> primeira reunião.

---

## 5. Cinco Porquês

```dax
Análises = COUNTROWS ( fato_cinco_porques )
```

```dax
Análises concluídas =
CALCULATE ( [Análises], fato_cinco_porques[concluida] = TRUE() )
```

```dax
% Conclusão = DIVIDE ( [Análises concluídas], [Análises] )
```

```dax
% Chegou ao 5º porquê =
DIVIDE (
    CALCULATE ( [Análises], fato_cinco_porques[chegou_ao_quinto] = TRUE() ),
    [Análises concluídas]
)
```

```dax
Profundidade média = AVERAGE ( fato_cinco_porques[profundidade] )
```

O par de indicadores que decide se o módulo sobrevive — análise concluída
que ninguém responde ensina o time a não preencher a próxima:

```dax
Aguardando tratativa =
CALCULATE (
    [Análises],
    fato_cinco_porques[concluida] = TRUE(),
    fato_cinco_porques[tratada] = FALSE()
)
```

```dax
Horas médias até resposta = AVERAGE ( fato_cinco_porques[horas_ate_resposta] )
```

```dax
% Aceite do motorista =
DIVIDE (
    CALCULATE ( [Análises], fato_cinco_porques[motorista_aceitou] = TRUE() ),
    CALCULATE ( [Análises], fato_cinco_porques[respondida_lideranca] = TRUE() )
)
```

```dax
Causa raiz mais frequente =
VAR Causas =
    SUMMARIZE (
        fato_cinco_porques, fato_cinco_porques[categoria],
        "@Qtd", COUNTROWS ( fato_cinco_porques )
    )
RETURN MAXX ( TOPN ( 1, Causas, [@Qtd], DESC ), fato_cinco_porques[categoria] )
```

---

## 6. Plano de Comunicação

```dax
Comunicados publicados = COUNTROWS ( fato_comunicado )
```

```dax
Curtidas = SUM ( fato_comunicado[curtidas] )
```

```dax
Curtidas por comunicado = DIVIDE ( [Curtidas], [Comunicados publicados] )
```

```dax
Taxa média de curtida = AVERAGE ( fato_comunicado[taxa_curtida] )
```

```dax
Colaboradores que interagiram =
DISTINCTCOUNT ( fato_comunicado_curtida[colaborador_id] )
```

```dax
% Participação na comunicação =
DIVIDE ( [Colaboradores que interagiram], [Colaboradores] )
```

```dax
Cliques em avisos = SUM ( fato_comunicado[avisos_clicados] )
```

> **Rotule este último no relatório como "Cliques no aviso (piso)".** O app
> não registra abertura de comunicado — não existe rota por comunicado nem
> tabela de leitura. Esse número vem de `notificacao_estado`, que só ganha
> linha de quem interagiu com o sino. É piso, nunca total. Curtida é o
> sinal confiável; trate o resto como indício.

```dax
Dias até curtir (mediana) =
MEDIANX ( fato_comunicado_curtida, fato_comunicado_curtida[dias_ate_curtir] )
```

---

## 7. Quiz

```dax
Participações = COUNTROWS ( fato_quiz_participacao )
```

```dax
Participações concluídas =
CALCULATE ( [Participações], fato_quiz_participacao[concluida] = TRUE() )
```

```dax
Participantes únicos = DISTINCTCOUNT ( fato_quiz_participacao[colaborador_id] )
```

```dax
Rodadas = DISTINCTCOUNT ( fato_quiz_participacao[rodada_id] )
```

Taxa de participação — vem da view, que já sabe quem era elegível (só a
área da rodada, só quem tem `role = 'colaborador'`). Recalcular isso em DAX
duplicaria a regra:

```dax
Taxa de participação =
DIVIDE (
    SUM ( fato_quiz_rodada_participacao[concluidas] ),
    SUM ( fato_quiz_rodada_participacao[elegiveis] )
)
```

```dax
Aproveitamento médio = AVERAGE ( fato_quiz_participacao[aproveitamento] )
```

```dax
Pontos = SUM ( fato_quiz_participacao[pontos] )
```

```dax
Acertos = SUM ( fato_quiz_participacao[acertos] )
```

```dax
Erros = SUM ( fato_quiz_participacao[erros] )
```

```dax
Tempo médio por pergunta (s) =
AVERAGE ( fato_quiz_participacao[segundos_por_pergunta] )
```

```dax
Tempo total (s) = SUM ( fato_quiz_participacao[tempo_segundos] )
```

Ranking acumulado da temporada. Pontos **não bastam** para ordenar: o
campeonato tem desempate, e é o mesmo de `ordenarClassificacao()` em
`src/lib/quiz.ts` — 1) mais pontos, 2) mais acertos, 3) menos tempo,
4) quem concluiu primeiro. O tempo nunca vira ponto; ele existe só aqui,
para impedir que o desafio vire corrida de clique.

`RANKX` resolve um critério só e devolveria empate onde o app já tem um
vencedor — e o visual desempataria por ordem alfabética, podendo divulgar
como líder alguém que a tela do app coloca em segundo. Por isso a posição
é contada à mão: quantos estão à frente pela regra completa, mais um.
Uma chave numérica composta (pontos, acertos, tempo e data empilhados num
número só) seria mais curta, mas estoura a precisão do double:

```dax
Posição na temporada =
VAR SemTempo = 1000000000
VAR SemFim = DATE ( 9999, 12, 31 )
VAR Base =
    ADDCOLUMNS (
        ALLSELECTED ( fato_quiz_participacao[colaborador] ),
        "@Pontos", [Pontos],
        "@Acertos", [Acertos],
        "@Tempo", COALESCE ( [Tempo total (s)], SemTempo ),
        "@Fim", COALESCE ( CALCULATE ( MAX ( fato_quiz_participacao[concluida_em] ) ), SemFim )
    )
VAR MeusPontos = [Pontos]
VAR MeusAcertos = [Acertos]
VAR MeuTempo = COALESCE ( [Tempo total (s)], SemTempo )
VAR MeuFim = COALESCE ( MAX ( fato_quiz_participacao[concluida_em] ), SemFim )
VAR NaMinhaFrente =
    COUNTROWS (
        FILTER (
            Base,
            NOT ISBLANK ( [@Pontos] )
                && (
                    [@Pontos] > MeusPontos
                        || ( [@Pontos] = MeusPontos && [@Acertos] > MeusAcertos )
                        || ( [@Pontos] = MeusPontos && [@Acertos] = MeusAcertos
                            && [@Tempo] < MeuTempo )
                        || ( [@Pontos] = MeusPontos && [@Acertos] = MeusAcertos
                            && [@Tempo] = MeuTempo && [@Fim] < MeuFim )
                )
        )
    )
RETURN
    IF ( NOT ISBLANK ( MeusPontos ), NaMinhaFrente + 1 )
```

Como a posição já é única, `Medalha` continua valendo: não existem dois
primeiros lugares.

Questões críticas — a que justifica o módulo, porque aponta qual padrão
reforçar. Use `fato_quiz_resposta`, e **não** os contadores de
`dim_quiz_questao`: aqueles são vitalícios e ignoram filtro de data:

```dax
Taxa de erro (período) =
DIVIDE (
    CALCULATE ( COUNTROWS ( fato_quiz_resposta ), fato_quiz_resposta[errou] = TRUE() ),
    COUNTROWS ( fato_quiz_resposta )
)
```

```dax
Questões críticas =
VAR Questoes =
    SUMMARIZE (
        fato_quiz_resposta, fato_quiz_resposta[questao_id],
        "@Erro", [Taxa de erro (período)],
        "@Respostas", COUNTROWS ( fato_quiz_resposta )
    )
RETURN COUNTROWS ( FILTER ( Questoes, [@Erro] > 0.4 && [@Respostas] >= 5 ) )
```

---

## 8. Super Matinal

O que existe no banco é a **publicação**, não a pontuação — ver
`LEIA-ME.md`. Enquanto for assim, meça a disciplina de publicar:

```dax
Quadros publicados = COUNTROWS ( fato_ranking_matinal )
```

```dax
Meses com publicação = DISTINCTCOUNT ( fato_ranking_matinal[mes_ano] )
```

```dax
% Cobertura da publicação =
DIVIDE (
    CALCULATE (
        COUNTROWS ( fato_ranking_matinal_cobertura ),
        fato_ranking_matinal_cobertura[publicado] = TRUE()
    ),
    COUNTROWS ( fato_ranking_matinal_cobertura )
)
```

---

## 9. Formatação das medidas

Faça isso uma vez por medida, na faixa **Ferramentas de medida** — é o que
separa um relatório executivo de uma planilha colorida:

| Tipo | Formato | Casas |
|---|---|---|
| `%` (todas) | Porcentagem | 1 |
| Contagens | Número inteiro, separador de milhar | 0 |
| Notas | Decimal | 2 |
| Horas / dias | Decimal | 1 |
| Caixas | Número inteiro, separador de milhar | 0 |

Nas medidas de variação (`Δ`), configure **Formatação condicional > Cor da
fonte > Regras** com verde acima de 0 e vermelho abaixo. Cuidado com o
sentido: em `Δ Adesão` subir é bom; em `Δ Divergência` e `Δ % Notas ruins`
subir é ruim, e a regra tem de ser invertida.
