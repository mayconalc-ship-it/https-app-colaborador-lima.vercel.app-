# Do zero ao `.pbix` — o caminho curto

O projeto em `bi/pbip/` já traz o modelo inteiro e as 8 páginas montadas.
Você não vai arrastar visual nenhum. São quatro passos, e só o primeiro
exige atenção.

---

## Passo 1 — Rodar o SQL no Supabase (~3 min)

Sem isto o projeto abre e não acha tabela nenhuma. É a única parte que eu
não consigo fazer daqui: o `.env.local` só tem chave de API REST, e a API
REST não executa DDL.

No painel do Supabase → **SQL Editor** → **New query**:

1. Cole o conteúdo inteiro de [`01-camada-semantica.sql`](01-camada-semantica.sql) → **Run**.
   Cria o esquema `bi` com 25 views. Não altera nenhuma tabela do app.
2. Abra [`02-acesso-powerbi.sql`](02-acesso-powerbi.sql), **troque
   `TROQUE-ESTA-SENHA`** por uma senha real, cole → **Run**.

Guarde essa senha no gerenciador de senhas. Ela vai ser digitada no Power
BI e depois no Power BI Service — não no bloco de notas.

> **Os dois andam sempre juntos, inclusive nas próximas vezes.** O `01`
> começa com `drop schema bi cascade`, porque `create or replace view` do
> Postgres não aceita coluna nova no meio da lista — ele falha com
> `42P16: cannot change name of view column`, e como o SQL Editor roda o
> arquivo numa transação só, **nada** é aplicado. Derrubar e recriar
> deixa o arquivo tolerante a qualquer mudança de coluna. O preço é que
> os GRANTs caem junto: se você rodar o `01` sem o `02`, a próxima
> atualização do Power BI responde "permissão negada".

> **Desligue a tradução automática do navegador nesta página.** Clique
> direito → *Nunca traduzir este site*. O Chrome traduz o conteúdo do
> editor (`select count(*) from` vira `selecione contagem(*) de`) e você
> passa a ler um SQL que não é o que está escrito.

Confira que funcionou, ainda no SQL Editor:

```sql
select (select count(*) from pg_views where schemaname = 'bi')            as views_criadas,
       (select count(*) from pg_roles where rolname = 'powerbi_readonly') as role_existe,
       (select count(*) from information_schema.role_table_grants
         where grantee = 'powerbi_readonly' and table_schema = 'bi')      as permissoes,
       (select count(*) from bi.fato_ag_contagem)                         as linhas_ag,
       (select count(*) from bi.fato_quiz_participacao)                   as linhas_quiz;
```

Esperado: `views_criadas` = 26, `role_existe` = 1, `permissoes` > 0. As
duas últimas colunas são o volume real do app — zero ali significa que
ainda não há lançamento, não falta de permissão.

Não tente conferir com `set role powerbi_readonly`: o usuário `postgres`
do Supabase não é superusuário e responde
`ERROR 42501: permission denied to set role`. Parece falha do script e
não é.

---

## Passo 2 — Abrir o projeto

Duplo clique em:

```
bi\pbip\BI App do Colaborador.pbip
```

O Power BI Desktop abre o projeto já com modelo, medidas, relacionamentos,
tema e as 8 páginas.

> Se o Desktop reclamar que projetos PBIP estão desabilitados:
> **Arquivo > Opções > Recursos de visualização > Salvar como projeto do
> Power BI**, marcar, e reabrir.

---

## Passo 3 — Credenciais

Na primeira atualização ele pede o banco. Método de autenticação:
**Banco de dados** (não Windows).

| Campo | Valor |
|---|---|
| Servidor | `aws-0-sa-east-1.pooler.supabase.com:5432` |
| Banco de dados | `postgres` |
| Usuário | `powerbi_readonly.lezoymdvhhndhoxuumcc` |
| Senha | a que você definiu no passo 1 |
| Criptografia | marcada |

Repare em duas coisas que fogem do óbvio:

**O servidor é o Session Pooler, não a conexão direta.** O host
`db.lezoymdvhhndhoxuumcc.supabase.co` resolve **só em IPv6** — não tem
registro IPv4 nenhum. Numa rede sem IPv6 o conector responde *"Este host
não é conhecido"*, que parece nome digitado errado e é falta de rota. O
pooler tem IPv4.

**O usuário leva o sufixo `.lezoymdvhhndhoxuumcc`.** É o project-ref, e é
obrigatório no pooler — é como ele sabe para qual projeto rotear. Sem o
sufixo o erro é `Tenant or user not found`, que parece senha errada e não
é.

**Confirme a região** antes: painel do Supabase → botão **Connect** (topo)
→ aba **Session pooler**. O host completo aparece na connection string.
`sa-east-1` é o esperado para operação no Brasil, mas se o projeto foi
criado em outra região, o valor é esse. Para trocar sem regerar nada:
**Página Inicial > Transformar dados > Gerenciar parâmetros > `Servidor`**.

Servidor e Banco são parâmetros justamente para isso: trocar de conexão é
editar um campo, não 27 consultas.

---

### Antes de atualizar: desligue o carregamento paralelo

**Arquivo > Opções e configurações > Opções > ARQUIVO ATUAL > Carregamento
de dados > Carregamento paralelo de tabelas → Desabilitar.**

O modelo tem 27 tabelas e o Power BI abre uma conexão por tabela, todas de
uma vez. O Session Pooler do Supabase aceita 15 simultâneas, então a carga
morre com:

```
XX000: (EMAXCONNSESSION) max clients reached in session mode
       - max clients are limited to pool_size: 15
```

As tabelas restantes aparecem como `Erro do OLE DB ou do ODBC: Exceção de
HRESULT: 0x80040E4E`, que é a mesma recusa vista pelo driver em vez do
servidor — e que não parece, de jeito nenhum, um problema de conexões
simultâneas.

O volume aqui é pequeno; carregar em série custa segundos. A opção é
**por arquivo** e fica salva no `.pbix`.

> Se preferir manter o paralelismo, a alternativa é subir o `Pool Size` no
> painel do Supabase (**Project Settings > Database > Connection
> pooling**). Só lembre que esse limite é compartilhado com o app —
> aumentar para o BI tira folga de quem está usando o sistema.

---

## Passo 4 — Salvar como `.pbix`

**Arquivo > Salvar como > Arquivo do Power BI (.pbix)**.

Pronto. Daí em diante é o arquivo normal que você já sabe publicar.

---

## Acabamentos já embutidos

O gerador aplica cinco coisas que antes eram manuais:

| # | Acabamento | Onde |
|---|---|---|
| 1 | Filtro `parque_confiavel = True` no nível **Página** | Ativo de Giro |
| 2 | Segmentações sincronizadas (`syncGroup` por campo) | as 7 páginas visíveis |
| 3 | Corte de ≥ 5 respostas | Quiz, "Perguntas com maior índice de erro" |
| 4 | Drill-through por colaborador | página Detalhe (oculta) |
| 5 | Gradiente sequencial por valor | Ativo de Giro, barras de divergência |

O item 1 é o único que não é cosmético: sem ele, a divergência de um dia
passado é comparada com o saldo de parque de **hoje** e o gráfico desenha
uma série que nunca existiu.

### Se o Desktop recusar o projeto

Dois desses acabamentos têm forma derivada do schema, e não copiada de um
arquivo real — `syncGroup` e o filtro `Advanced` com comparação. Se o
projeto parar de abrir depois de uma regeração:

```bash
node bi/pbip/gerar-pbip.js --simples
```

Isso regera sem as construções não verificadas (sync, corte mínimo e
gradiente), mantendo filtro de página e drill-through. Custa segundos.

## O que continua manual

**Formatação condicional por categoria** — falta em `#b91c1c`, sobra em
`#b45309`, bateu em `#166534` na conciliação; e as cores de status na
distribuição de notas. O gradiente por valor está embutido, mas cor
atrelada a um **valor de categoria** exige um seletor (`scopeId`) cuja
forma não existe em nenhum arquivo de referência daqui — implementar no
escuro arriscaria travar o projeto inteiro por um ganho estético.

Também ficam manuais a linha constante em 2,0 no gráfico de nota média e
as linhas de média na dispersão (Analytics). Tudo descrito em
[`layout-relatorio.md`](layout-relatorio.md).

---

## Quando uma view mudar

Não edite os arquivos gerados — eles são saída, e a próxima geração
sobrescreve tudo.

1. Ajuste a view em `01-camada-semantica.sql` e rode no Supabase.
2. Reflita a mudança em `bi/pbip/modelo.js` (colunas e tipos).
3. Regenere e confira:

```bash
node bi/pbip/gerar-pbip.js && node bi/pbip/validar.js
```

O `validar.js` existe para pegar o erro que não dá erro: campo escrito
errado em `paginas.js` gera um JSON perfeitamente válido, que o Desktop
abre como um visual **vazio**, sem explicar por quê. Ele confere os 191
campos das 8 páginas contra o modelo, mais sobreposição de visuais e
estouro de canvas.

Medidas **não** se editam aqui: elas são lidas de
[`07-medidas.dax`](07-medidas.dax) na hora de gerar. Esse arquivo continua
sendo o único lugar onde a regra de cálculo mora.

---

## O que este projeto não resolve

As quatro lacunas da seção "Lacunas" do [`LEIA-ME.md`](LEIA-ME.md)
continuam de pé — elas são falta de dado, não falta de relatório:

- Super Matinal não tem pontuação (a página mostra cobertura de publicação).
- Sonho da Revenda não tem meta nem realizado (a página mostra contexto).
- Comunicados não registram leitura (curtida é o sinal confiável).
- O parque de AG não tem histórico (daí o filtro do passo 1 acima).

A mais barata de resolver e a que mais rende é a tabela
`sonho_indicadores` — vira medidor, farol e série de evolução de imediato.
