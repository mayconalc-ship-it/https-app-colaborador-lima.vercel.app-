# Atualização automática — Gateway + agendamento

Como o BI passa a se atualizar sozinho, direto do Supabase, sem exportação
manual em lugar nenhum.

## Antes de começar: corrija o que o guia antigo diz

O `Guia_PowerBI_Supabase_AppColaborador.docx` afirma que não é preciso
Gateway porque o Supabase é nuvem. **Isso está errado para o conector
PostgreSQL.** O Power BI Service dispensa gateway só para um conjunto de
conectores que ele trata como nativos de nuvem (Azure SQL, Snowflake,
Databricks) — PostgreSQL não é um deles.

Há ainda um segundo motivo, específico do Supabase: o Service conecta a
partir da infraestrutura da Microsoft, que não confia na cadeia de
certificado SSL do Supabase. O `prod-ca-2021.crt` resolve isso na **sua**
máquina; o Service não tem onde instalá-lo. É por isso que o sintoma clássico
é "funciona no Desktop, publica, e a atualização agendada falha".

O gateway resolve as duas coisas de uma vez: quem conecta no banco passa a
ser o PC do escritório, que tem o certificado instalado e sai pela rede de
vocês.

---

## Passo 1 — Instalar o gateway no PC do escritório

Faça **no PC que fica ligado**, não no seu.

1. Baixe o **On-premises data gateway** em
   `powerbi.microsoft.com/gateway` — a versão **standard**, não a "personal
   mode".
2. Instale e entre com a **mesma conta** do Power BI Service que vai publicar
   o relatório.
3. Escolha **Registrar um novo gateway**, dê um nome (ex.: `LIMA-BI`) e
   defina uma **chave de recuperação**.

> Guarde a chave de recuperação no gerenciador de senhas, junto da senha do
> `powerbi_readonly`. Ela é a única forma de migrar ou restaurar o gateway se
> o PC morrer — sem ela, é reinstalar tudo e reconfigurar as fontes.

**Modo standard e não personal** porque o standard atende o workspace inteiro
e continua funcionando quando outra pessoa assume o relatório. O personal
serve só aos datasets da conta que o instalou.

**Npgsql:** o gateway de junho/2025 em diante já traz o provedor incluído.
Se aparecer o erro *"Please install Npgsql version 4.0.10.0 or earlier"*, o
gateway está velho — atualize o gateway em vez de sair instalando Npgsql à
mão.

## Passo 2 — Certificado SSL naquele PC

Repita no PC do escritório o passo 4 do guia antigo (o do `.crt`), porque é
essa máquina que vai abrir a conexão:

1. Baixe o certificado em **Supabase > Project Settings > Database > SSL
   Configuration**.
2. `Win + R` → `mmc` → Arquivo > Adicionar/Remover Snap-in > Certificados >
   **conta do computador**.
3. Autoridades de Certificação Raiz Confiáveis > Certificados > botão direito
   > Todas as Tarefas > Importar > selecione o `.crt`.

Conta do computador, não conta de usuário: o serviço do gateway roda como
serviço do Windows e não enxerga o repositório do seu usuário.

## Passo 3 — Registrar a fonte de dados no Service

No Power BI Service (navegador), engrenagem > **Gerenciar conexões e
gateways** > **Nova**:

| Campo | Valor |
|---|---|
| Gateway | `LIMA-BI` |
| Tipo de conexão | PostgreSQL |
| Servidor | `aws-0-<regiao>.pooler.supabase.com:5432` |
| Banco de dados | `postgres` |
| Método de autenticação | Basic |
| Nome de usuário | `powerbi_readonly.<project-ref>` |
| Senha | a definida no `02-acesso-powerbi.sql` |
| Nível de privacidade | Organizacional |

> **O servidor tem de bater caractere por caractere com o que está no
> `.pbix`.** Se no Desktop você digitou `aws-0-sa-east-1.pooler.supabase.com:5432`
> e aqui digitar sem a porta, o Service não reconhece que é a mesma fonte e
> responde *"não há gateway disponível"* — que parece problema de instalação,
> mas é só o texto diferente. Copie e cole do Power Query (Página Inicial >
> Transformar dados > Configurações da fonte de dados).

Lembre do sufixo `.<project-ref>` no usuário: pelo Session Pooler ele é
obrigatório, e sem ele o erro é *"Tenant or user not found"* — que parece
senha errada.

## Passo 4 — Publicar e amarrar o dataset ao gateway

1. No Desktop: **Publicar** > escolha o workspace.
2. No Service: workspace > o **modelo semântico** (não o relatório) >
   reticências > **Configurações**.
3. Abra **Conexão de gateway** > ligue **Usar um gateway de dados** >
   selecione `LIMA-BI` > mapeie a fonte que você criou > **Aplicar**.

Se a seção "Conexão de gateway" aparecer vazia, é o descasamento de servidor
do Passo 3.

## Passo 5 — Agendar

Ainda em Configurações > **Atualização agendada**:

- Ative, fuso **(UTC-03:00) Brasília**
- Horário: **05h30** — antes da reunião de RNS, e cedo o bastante para sobrar
  janela de retentativa
- Marque **Enviar e-mail de falha de atualização para mim**

Um segundo horário às 13h00 é opcional e útil se a gestão consulta o painel à
tarde. O Power BI Pro permite até 8 atualizações por dia; duas são de sobra
aqui.

**Ative a notificação de falha.** Sem ela, o modo de falha é silencioso: o
relatório continua abrindo, com o dado de anteontem, e ninguém percebe até
alguém questionar um número na reunião.

---

## O que fazer com o PC

A atualização só acontece se o PC estiver ligado e com o serviço rodando às
05h30. Três ajustes, uma vez só:

1. **Configurações > Sistema > Energia** → "Suspender" e "Hibernar" em
   **Nunca**. Suspensão é a causa nº 1 de falha de gateway.
2. **Windows Update > Opções avançadas > Horário ativo** → cubra a janela da
   atualização, para o PC não reiniciar às 05h20.
3. Confira que o serviço **On-premises data gateway service** está como
   *Automático* em `services.msc`.

Se o PC ficar sem energia à noite, mude o horário para logo depois de alguém
chegar (ex.: 07h15) em vez de contar com o PC ligado de madrugada.

## Conferência mensal

No Service, workspace > modelo semântico > **Histórico de atualizações**.
Duas linhas verdes seguidas por semana significam que está no ar. Falha
repetida no mesmo horário quase sempre é o PC dormindo, não o banco.
