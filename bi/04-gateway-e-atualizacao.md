# Atualização automática — Gateway + agendamento

Como o BI passa a se atualizar sozinho, direto do Supabase, sem exportação
manual em lugar nenhum.

> **Instalado em 17/09/2026** na `CONFERENTE-SFC` (notebook do escritório),
> gateway `LIMA-BI`. A manhã inteira foi gasta em três pontos que este guia
> não cobria: **precisa de administrador local** (Passo 0, novo), o
> certificado **diz "êxito" e vai para a gaveta errada** (Passo 2), e
> **fechar a tampa do notebook suspende** mesmo com suspensão em Nunca ("O
> que fazer com o PC"). Os três estão documentados abaixo. A primeira
> atualização pelo gateway novo levou 51 s, contra 14 min pelo gateway que
> rodava num notebook fora da rede do escritório.

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

## Passo 0 — Você vai precisar de administrador local

Os passos 1 e 2 exigem privilégio de administrador **na máquina do gateway**:
instalar um serviço do Windows e escrever no repositório de certificados da
máquina. Sua conta de rede provavelmente não tem isso, e o Windows vai abrir
uma caixa pedindo usuário e senha de quem tem — o que parece erro de senha
do Supabase ou do Power BI, e não é nenhum dos dois.

Descubra quem é administrador com o `04c-quem-e-admin.ps1` (só lê, não pede
admin), ou na mão:

```powershell
net localgroup Administradores
Get-LocalUser | Select-Object Name, Enabled
```

**Olhe a coluna `Enabled`.** A conta interna `Administrador` costuma vir
desativada por política, e a que a TI mantém viva tem outro nome — na
`CONFERENTE-SFC` é a `Administrador Ti`, com espaço no meio. Com a senha
certa da conta desativada, o Windows responde exatamente como se a senha
estivesse errada.

Na caixa de credencial, o campo **Domínio** não é editável: quem manda nele é
o prefixo que você digita no usuário.

| Conta | Digite |
|---|---|
| Local da máquina | `.\Administrador Ti` |
| Local, forma longa | `CONFERENTE-SFC\Administrador Ti` |
| De domínio | `nome@ad.limalogistica.com.br` |

Sem o `.\`, o Windows tenta a conta de mesmo nome **no domínio** — que é uma
conta diferente — e recusa. Depois de digitar o prefixo, confira que o campo
Domínio mudou para o nome do PC antes de dar OK.

Se ninguém puder te passar a credencial, o pedido para a TI cobre os três de
uma vez: importar certificado raiz na Máquina Local, instalar o On-premises
Data Gateway, e ajustar o plano de energia. Pedir só o primeiro garante uma
segunda rodada de chamado.

## Passo 1 — Instalar o gateway no PC do escritório

Faça **no PC que fica ligado**, não no seu.

1. Baixe o **On-premises data gateway** em
   `powerbi.microsoft.com/gateway` — a versão **standard**, não a "personal
   mode".
2. Instale e entre com a **mesma conta** do Power BI Service que vai publicar
   o relatório. Não é a conta de administrador do Windows do Passo 0 — são
   dois logins diferentes na mesma instalação.
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

> **Atalho (12/09/2026):** o `04b-preparar-pc-do-gateway.ps1`, rodado como
> administrador no PC do escritório, faz o Passo 2 e os quatro ajustes de "O
> que fazer com o PC" de uma vez, testa a porta 5432 e imprime os campos do
> Passo 3. Precisa do `supabase-prod-ca-2021.crt` na mesma pasta. Não tem
> senha nenhuma dentro.

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

> **"Importação concluída com êxito" não quer dizer que foi para o lugar
> certo.** Pelo duplo clique no `.crt`, o assistente vem com **"Selecionar
> automaticamente o repositório"** ligado — e o Windows põe um certificado
> raiz nas **Autoridades Intermediárias** (`LocalMachine\CA`). A mensagem de
> sucesso é a mesma, e o gateway falha depois sem nada que ligue uma coisa à
> outra. Marque **"Colocar todos os certificados no repositório a seguir"** e
> escolha **Autoridades de Certificação Raiz Confiáveis** à mão. Aconteceu
> em 17/09/2026: o certificado tinha ido para `LocalMachine\CA` e
> `CurrentUser\CA`, nenhuma das duas serve.

Confira onde ele foi parar de verdade:

```powershell
$t = 'A4518A0933AF6949482CCA3014C007C369DF9F6F'
'Cert:\LocalMachine\Root','Cert:\CurrentUser\Root','Cert:\LocalMachine\CA','Cert:\CurrentUser\CA' |
  ForEach-Object { Get-ChildItem $_ -EA SilentlyContinue |
    Where-Object Thumbprint -eq $t | ForEach-Object { $_.PSParentPath } }
```

Só **`Cert:\LocalMachine\Root`** serve. `CurrentUser\Root` é a sua conta de
usuário, que o serviço não enxerga; qualquer `\CA` é gaveta de intermediário.
Nenhuma resposta quer dizer que o arquivo não é o deste projeto: a impressão
`A4518A...` é a do Supabase Root 2021 CA, válida até 26/04/2031.

Se caiu no lugar errado, não precisa desfazer nada — rode o `04b` como
administrador, que ele importa no lugar certo e confere a impressão digital
antes de confiar. Para limpar a cópia perdida:

```powershell
Remove-Item "Cert:\LocalMachine\CA\A4518A0933AF6949482CCA3014C007C369DF9F6F" -Force
```

> **Cole comando por comando, não o bloco inteiro.** O console do PowerShell
> 5.1 executa linha a linha ao colar, e um bloco com `if`/`else` pode rodar
> com as variáveis ainda vazias. Em 17/09/2026 foi assim que um
> `Remove-Item "Cert:\LocalMachine\Root\$($novo.Thumbprint)"` com a variável
> vazia virou "apagar o repositório inteiro de raízes confiáveis" — e o
> padrão daquele prompt de confirmação é **Sim**. O `04b` foi corrigido para
> sair antes de montar caminho nenhum, mas a regra vale para qualquer bloco
> colado à mão.

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
| **Conexão criptografada** | **Criptografado** |
| Nível de privacidade | Organizacional |

**Criptografado** é o item que justifica o Passo 2 inteiro: é a conexão
criptografada que valida a cadeia contra o certificado raiz que você acabou
de instalar. Marcar "não criptografado" faz o erro de certificado sumir e a
credencial do banco passar a trafegar em claro — nunca é a correção certa. A
opção também tem de bater com o "Habilitar Criptografia" do Power BI Desktop,
senão o Service não reconhece que é a mesma fonte.

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

> **Vai aparecer mais de um gateway e mais de uma conexão.** Cada tentativa
> anterior deixa a sua para trás, com nomes parecidos apontando para o mesmo
> banco. Escolher a errada aqui dá o mesmo *"não há gateway disponível"*.
> Anote qual você mapeou e **não apague nada ainda** — ver "Aposentando um
> gateway antigo" no fim.

**Teste antes de agendar.** Modelo semântico > **Atualizar agora**, e confira
em **Histórico de atualizações** que apareceu uma linha `Concluído` com a
hora de hoje. Agendar sem provar é descobrir na primeira manhã, com o
relatório vazio.

> O diálogo de Histórico vem em cache: se a execução que você acabou de
> disparar não aparece, dê **F5 na página** e reabra. Perde-se um tempo bom
> achando que a atualização não rodou quando foi só a tela que não recarregou.

## Passo 5 — Agendar

Ainda em Configurações > **Atualização agendada**:

- Ative, fuso **(UTC-03:00) Brasília**
- Horário: **05h30** — antes da reunião de RNS, e cedo o bastante para sobrar
  janela de retentativa
- Marque **Enviar e-mail de falha de atualização para mim**
- Apague os horários herdados de configurações anteriores; sobrando três
  agendamentos noturnos, cada um roda o modelo inteiro sem motivo

Um segundo horário às 13h00 é opcional e útil se a gestão consulta o painel à
tarde. O Power BI Pro permite até 8 atualizações por dia; duas são de sobra
aqui.

**Ative a notificação de falha.** Sem ela, o modo de falha é silencioso: o
relatório continua abrindo, com o dado de anteontem, e ninguém percebe até
alguém questionar um número na reunião.

> **Atualização agendada exige Power BI Pro.** Em avaliação funciona igual —
> e para no dia em que a avaliação vence, do mesmo jeito silencioso. Se o
> canto da tela mostra "Avaliação, N dias restantes", encaminhe a licença
> junto com o resto: aprovar leva mais tempo que configurar.

---

## O que fazer com o PC

A atualização só acontece se o PC estiver ligado e com o serviço rodando às
05h30. Quatro ajustes, uma vez só:

1. **Configurações > Sistema > Energia** → "Suspender" e "Hibernar" em
   **Nunca**. Suspensão é a causa nº 1 de falha de gateway.
2. **Windows Update > Opções avançadas > Horário ativo** → cubra a janela da
   atualização, para o PC não reiniciar às 05h20.
3. Confira que o serviço **On-premises data gateway service** está como
   *Automático* em `services.msc`.
4. **Sendo notebook**, fechar a tampa suspende mesmo com tudo acima em Nunca —
   e é o gesto que todo mundo faz ao sair:
   ```powershell
   powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
   powercfg /setactive SCHEME_CURRENT
   ```
   `(Get-CimInstance Win32_ComputerSystem).PCSystemType` devolvendo `2` quer
   dizer notebook.

Conferindo depois:

```powershell
powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE
powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE
powercfg /query SCHEME_CURRENT SUB_VIDEO VIDEOIDLE
```

A linha que importa é **"Índice de Configurações de Correntes Alternadas
Atuais"** — a tomada — e tem de estar em `0x00000000`. A de Correntes
Contínuas é a bateria, e pode continuar suspendendo, desde que o notebook
viva plugado. Não filtre essa saída por `CA`: dependendo da compilação o
`powercfg` escreve o alias em inglês (`AC`), o `Select-String` volta vazio e
parece que a configuração não existe.

A de `LIDACTION` não sai no `query` por alias, porque o Windows a mantém
oculta. Pelos GUIDs:

```powershell
powercfg /query SCHEME_CURRENT 4f971e89-eebd-4455-a8de-9e59040e7347 5ca83367-6e45-459f-a27b-476b1d01c936
```

> **Domínio manda mais que `powercfg`.** Numa máquina de domínio, política de
> energia empurrada por GPO desfaz esses ajustes na próxima atualização de
> diretiva — e o gateway passa a falhar semanas depois, sem ninguém ligar as
> duas coisas. Se
> `Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Power\PowerSettings'`
> devolver alguma coisa, existe GPO mandando, e o ajuste tem de vir da TI.

Se o PC ficar sem energia à noite, mude o horário para logo depois de alguém
chegar (ex.: 07h15) em vez de contar com o PC ligado de madrugada.

**Notebook como host de gateway é arranjo frágil** por um motivo que não é
técnico: notebook é o equipamento que alguém leva para uma reunião ou que é
remanejado. No dia em que sair da tomada, o BI para de atualizar. Combine que
a máquina fica fixa, ou migre para um desktop quando der — com a chave de
recuperação guardada, migrar é rápido.

## Aposentando um gateway antigo

Depois que o gateway novo tiver **duas atualizações verdes seguidas**, dá
para limpar as sobras. Nessa ordem:

1. Confira que nenhum **outro** modelo semântico depende do gateway antigo.
   Conexões de **Pasta** e **Arquivo** são o caso perigoso: apontam para
   caminhos locais (`C:\Users\...\OneDrive - ...`) que existem só naquela
   máquina, e o gateway novo não tem como substituir. Ou move os arquivos
   para um lugar que a máquina nova alcance, ou os dois gateways continuam.
2. Engrenagem > Gerenciar conexões e gateways > **Gateways de dados locais** >
   o antigo > **Remover**.
3. Desinstale o **On-premises data gateway** na máquina antiga.
4. Só então apague as **Conexões** órfãs.

Invertendo a ordem sobra conexão apontando para gateway que não existe mais,
e o erro que isso produz meses depois não se parece com a causa.

## Conferência mensal

No Service, workspace > modelo semântico > **Histórico de atualizações**.
Duas linhas verdes seguidas por semana significam que está no ar. Falha
repetida no mesmo horário quase sempre é o PC dormindo, não o banco.

Repare no **tipo** da falha antes de culpar o gateway. *"Erro ao processar o
modelo semântico"* e *"Atualização concluída com avisos"* são problema de
DAX ou de Power Query, não de conexão — o gateway novo não conserta nenhum
dos dois. Falha de conexão fala de gateway indisponível, credencial ou
certificado, com essas palavras.
