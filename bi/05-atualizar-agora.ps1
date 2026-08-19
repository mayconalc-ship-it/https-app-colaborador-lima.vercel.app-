<#
.SYNOPSIS
    Força a atualização do modelo semântico do BI do App do Colaborador,
    sem esperar o horário agendado.

.DESCRIPTION
    Dispara a atualização no Power BI Service e acompanha até terminar,
    dizendo no fim se deu certo, quanto tempo levou e -- quando falha --
    qual foi o erro que o Service registrou.

    IMPORTANTE, e é o ponto que costuma confundir: este script troca o
    GATILHO da atualização, não o CAMINHO dela. Quem alcança o Postgres do
    Supabase continua sendo o gateway. Rodar isto sem gateway configurado
    devolve erro de fonte de dados, não uma atualização mágica pela sua
    máquina.

    Use quando: a reunião foi antecipada, alguém acabou de lançar dado que
    precisa aparecer agora, ou a atualização das 05h30 falhou e você
    resolveu a causa.

.PARAMETER Workspace
    Nome do workspace no Power BI Service.

.PARAMETER Dataset
    Nome do modelo semântico (normalmente igual ao nome do .pbix publicado).

.PARAMETER TimeoutMinutos
    Quanto esperar antes de desistir de acompanhar. A atualização continua
    rodando no Service mesmo se o script parar de observar.

.EXAMPLE
    .\05-atualizar-agora.ps1 -Workspace "BI Lima" -Dataset "App do Colaborador"

.NOTES
    Pré-requisito, uma vez só:
        Install-Module -Name MicrosoftPowerBIMgmt -Scope CurrentUser

    O Power BI Pro permite 8 atualizações por dia por modelo. As agendadas
    contam. Com duas agendadas, sobram 6 disparos manuais.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Workspace,

    [Parameter(Mandatory = $true)]
    [string]$Dataset,

    [int]$TimeoutMinutos = 30
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Module -ListAvailable -Name MicrosoftPowerBIMgmt)) {
    throw "Módulo MicrosoftPowerBIMgmt não encontrado. Rode: Install-Module -Name MicrosoftPowerBIMgmt -Scope CurrentUser"
}

Import-Module MicrosoftPowerBIMgmt

# Abre o navegador na primeira vez; depois a sessão fica em cache.
Write-Host "Conectando ao Power BI Service..." -ForegroundColor Cyan
Connect-PowerBIServiceAccount | Out-Null

# --- Resolver workspace e dataset pelos nomes ------------------------------
# Trabalhar por nome, e não por GUID, para o comando continuar legível daqui
# a seis meses -- e para não colar GUID em script versionado.

$grupo = Get-PowerBIWorkspace -Name $Workspace
if (-not $grupo) {
    throw "Workspace '$Workspace' não encontrado. Confira o nome em app.powerbi.com."
}
if ($grupo -is [array]) { $grupo = $grupo[0] }

$modelo = Get-PowerBIDataset -WorkspaceId $grupo.Id | Where-Object { $_.Name -eq $Dataset }
if (-not $modelo) {
    $disponiveis = (Get-PowerBIDataset -WorkspaceId $grupo.Id | Select-Object -ExpandProperty Name) -join ', '
    throw "Modelo '$Dataset' não encontrado em '$Workspace'. Disponíveis: $disponiveis"
}

$rota = "groups/$($grupo.Id)/datasets/$($modelo.Id)/refreshes"

# --- Disparar --------------------------------------------------------------
Write-Host "Disparando atualização de '$Dataset'..." -ForegroundColor Cyan

$corpo = @{ notifyOption = 'MailOnFailure' } | ConvertTo-Json

try {
    Invoke-PowerBIRestMethod -Url $rota -Method Post -Body $corpo | Out-Null
}
catch {
    # O erro mais comum aqui não é de rede: é limite diário estourado
    # (400 / MaxRefreshCountExceeded) ou credencial do gateway vencida.
    Write-Host "Falhou ao disparar." -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

$inicio = Get-Date
Write-Host "Disparada às $($inicio.ToString('HH:mm:ss')). Acompanhando..." -ForegroundColor Cyan

# --- Acompanhar ------------------------------------------------------------
# O Service não avisa quando termina; a única forma é perguntar. 15s é
# frequente o bastante para parecer imediato e raro o bastante para não
# gastar quota de API à toa.

$limite = $inicio.AddMinutes($TimeoutMinutos)

while ((Get-Date) -lt $limite) {
    Start-Sleep -Seconds 15

    $historico = Invoke-PowerBIRestMethod -Url "$($rota)?`$top=1" -Method Get | ConvertFrom-Json
    $ultima = $historico.value[0]

    # "Unknown" é como a API chama "ainda rodando".
    if ($ultima.status -eq 'Unknown') {
        Write-Host "  ...em andamento ($([int]((Get-Date) - $inicio).TotalSeconds)s)" -ForegroundColor DarkGray
        continue
    }

    $duracao = [int]((Get-Date) - $inicio).TotalSeconds

    if ($ultima.status -eq 'Completed') {
        Write-Host "Atualização concluída em ${duracao}s." -ForegroundColor Green
        exit 0
    }

    Write-Host "Atualização FALHOU após ${duracao}s." -ForegroundColor Red
    if ($ultima.serviceExceptionJson) {
        Write-Host $ultima.serviceExceptionJson -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Onde olhar primeiro:" -ForegroundColor Yellow
    Write-Host "  1. O PC do escritório está ligado e o serviço do gateway rodando?"
    Write-Host "  2. A senha do powerbi_readonly mudou? (Gerenciar conexões e gateways)"
    Write-Host "  3. Alguma view do schema bi foi alterada e perdeu uma coluna que o modelo usa?"
    exit 1
}

Write-Host "Tempo esgotado ($TimeoutMinutos min) sem resposta." -ForegroundColor Yellow
Write-Host "A atualização pode continuar rodando -- confira o Histórico de atualizações no Service."
exit 2
