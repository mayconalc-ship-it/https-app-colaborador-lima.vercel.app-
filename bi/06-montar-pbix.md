# Montando o .pbix — roteiro

Ordem que evita refazer trabalho. Conte com ~1h30 até a primeira página
pronta, sendo que boa parte é clique repetido.

**Antes de abrir o Power BI:** `01-camada-semantica.sql` e
`02-acesso-powerbi.sql` já rodados no Supabase, e o certificado `.crt`
instalado na sua máquina (passo 4 do guia antigo). O gateway fica para o
fim — ele só importa na hora de publicar.

---

## 1. Desligue a detecção automática de relações (2 min)

**Faça isto antes de carregar qualquer coisa.**

Arquivo > Opções e configurações > Opções > **Arquivo atual** >
Carregamento de dados > desmarque **"Detectar automaticamente novas relações
depois que os dados forem carregados"**.

As 25 views compartilham `revenda_id`, `colaborador_id` e `data`. Com a
detecção ligada, o Power BI cria dezenas de relações erradas e ambíguas no
momento da carga, e desfazer isso depois dá mais trabalho do que criar as 14
certas à mão.

## 2. Conectar e carregar (10 min)

Página Inicial > Obter Dados > Banco de dados > **Banco de dados PostgreSQL**.

| Campo | Valor |
|---|---|
| Servidor | `aws-0-<regiao>.pooler.supabase.com:5432` |
| Banco de dados | `postgres` |
| Modo | **Importar** |
| Usuário | `powerbi_readonly.<project-ref>` |
| Senha | a do `02-acesso-powerbi.sql` |

> Guarde o texto exato que você digitou em **Servidor**. Ele vai ter que ser
> repetido caractere por caractere no cadastro da fonte no gateway, ou o
> Service diz que não há gateway disponível.

No Navegador, expanda **bi** e marque **todas** as views. Não marque nada de
`public` — aquele usuário não lê nada de lá mesmo. **Carregar**.

Se alguma view vier vazia, o problema é permissão e se resolve no SQL, não
aqui: rode a conferência do passo 4 do `02-acesso-powerbi.sql`.

## 3. Conferir tipos (5 min)

As views já entregam tipo definido, então costuma vir tudo certo. Confira só
duas coisas em Transformar dados:

- Colunas `data`, `mes_ref`, `inicio_semana`, `inicio_mes` como **Data** (não
  Data/Hora)
- Colunas `taxa_*`, `nota_percentual`, `aproveitamento`, `diferenca_pct` como
  **Número decimal**

Fechar e Aplicar.

## 4. Marcar o calendário (1 min)

Selecione `dim_calendario` na lista de campos > faixa **Ferramentas de
tabela** > **Marcar como tabela de data** > coluna `data`.

Pule isto e `DATEADD`, `SAMEPERIODLASTYEAR` e afins devolvem resultado errado
sem dar erro — que é o pior tipo de defeito num BI.

## 5. Relacionamentos (20 min)

Exibição de Modelo. Arraste cada par, todos **um-para-muitos**, direção de
filtro **única**:

`dim_calendario[data]` → coluna `data` de: `fato_ag_contagem`,
`fato_ag_conciliacao`, `fato_feedback_rota`, `fato_feedback_ocorrencia`,
`fato_cinco_porques`, `fato_quiz_participacao`, `fato_quiz_resposta`,
`fato_comunicado`, `fato_atividade`.

`dim_revenda[revenda_id]` → `revenda_id` de todos os fatos.

Mais quatro:

| De | Para |
|---|---|
| `dim_quiz_rodada[rodada_id]` | `fato_quiz_participacao[rodada_id]` |
| `dim_quiz_questao[questao_id]` | `fato_quiz_resposta[questao_id]` |
| `fato_comunicado[comunicado_id]` | `fato_comunicado_curtida[comunicado_id]` |
| `fato_cinco_porques[analise_id]` | `fato_cinco_porques_resposta[analise_id]` |

**`dim_colaborador` fica de fora.** A chave dela é `colaborador_id` **+**
`revenda_id` — a mesma pessoa aparece duas vezes se atende as duas revendas,
e o Power BI recusa a relação por não ser única.

Não force. Todo fato já traz `colaborador_nome` gravado na própria linha (é
uma foto do nome no dia do lançamento, de propósito, para o histórico não
mudar quando alguém é renomeado). Ranking e comparativo funcionam com isso.
`dim_colaborador` serve para duas coisas só: **cargo** e **quem não
participou** — e para essas, o filtro de revenda no relatório já resolve a
ambiguidade.

## 6. Medidas (15 min)

1. Página Inicial > **Inserir dados** > nomeie a tabela `_Medidas` > OK.
2. Barra lateral esquerda > **Exibição de consulta DAX**.
3. Cole o `07-medidas.dax` inteiro.
4. Clique em **"Atualizar modelo: adicionar nova medida"** acima de cada
   `MEASURE`.
5. Oculte a `Coluna1` da `_Medidas`.

Algumas medidas dependem de outras. Se acusar erro, é porque a dependência
ainda não foi aplicada — termine a lista e reaplique as que ficaram
vermelhas.

Sem a exibição de consulta DAX na sua versão: **Tabular Editor 2** (gratuito,
aba Ferramentas Externas) ou colar uma a uma em Modelagem > Nova medida.

## 7. Formatar as medidas (10 min)

Selecione cada medida > faixa **Ferramentas de medida**:

| Grupo | Formato |
|---|---|
| Tudo que começa com `%` e os `Δ` | Porcentagem, 1 casa |
| `Contagens`, `Feedbacks`, `Interações`, `Pontos`… | Número inteiro, separador de milhar |
| `Nota média` | Decimal, 2 casas |
| `Horas…`, `Atraso…`, `Tempo…` | Decimal, 1 casa |
| `Total em caixas`, `Divergência absoluta` | Número inteiro, separador de milhar |

Chato, mas é uma vez só — e é o que separa relatório executivo de planilha
colorida.

## 8. Tema e páginas (o resto)

Exibir > Temas > **Procurar temas** > `tema-powerbi.json`.

Exibir > Tamanho da página > Personalizado > **1280 × 720**.

Daqui em diante siga o `layout-relatorio.md`, que tem as 8 páginas visual a
visual. Sugestão de ordem: monte a **página 2 (Ativo de Giro)** primeiro, não
a executiva. Ela tem o dado mais volumoso e mais confiável, então erro de
modelo aparece nela na hora; a executiva depende de todas as outras estarem
certas e é a pior para depurar.

## 9. Publicar

Só depois que pelo menos duas páginas estiverem prontas — publicar
esqueleto vazio confunde quem recebe o link.

Página Inicial > **Publicar** > escolha o workspace. Depois siga o
`04-gateway-e-atualizacao.md` a partir do Passo 3 para amarrar o gateway e
agendar.

---

## Checagem antes de mostrar para alguém

- [ ] `dim_calendario` marcada como tabela de data
- [ ] Nenhuma relação criada automaticamente sobrou (Exibição de Modelo, procure linhas tracejadas ou duplicadas)
- [ ] Filtro `parque_confiavel = True` no nível de **Página** na aba do AG
- [ ] Cartão de comunicados rotulado "Cliques no aviso (piso)"
- [ ] Segmentações sincronizadas entre as páginas
- [ ] Nenhum visual com eixo duplo
- [ ] Nenhum campo de CPF no modelo (não deve nem existir — as views não expõem)
