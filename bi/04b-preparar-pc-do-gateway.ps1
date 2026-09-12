#Requires -RunAsAdministrator
<#
    PREPARA O PC DO ESCRITORIO PARA O GATEWAY DO POWER BI
    (Passo 2 e "O que fazer com o PC" do 04-gateway-e-atualizacao.md)

    Rode NO PC QUE FICA LIGADO, como administrador:
      botao direito no Iniciar > Terminal (Admin), e entao
      powershell -ExecutionPolicy Bypass -File ".\04b-preparar-pc-do-gateway.ps1"

    O que ele faz, e so isto:
      1. instala o certificado do Supabase na conta do COMPUTADOR (o servico
         do gateway nao enxerga o certificado da sua conta de usuario);
      2. tira a suspensao e a hibernacao na tomada -- PC dormindo e a causa
         numero 1 de atualizacao que falha;
      3. deixa o servico do gateway como Automatico e rodando (se ja
         estiver instalado);
      4. testa se este PC alcanca o banco na porta 5432;
      5. mostra os campos para colar em "Gerenciar conexoes e gateways".

    Nao tem senha nenhuma aqui dentro, e nao pede nenhuma. A senha do
    powerbi_readonly voce digita so no Power BI Service.

    Texto sem acento de proposito: o PowerShell 5.1 le .ps1 sem BOM como
    ANSI e estragaria qualquer acento das mensagens.
#>
param(
    # O certificado vai junto deste script na Area de Trabalho do OneDrive.
    [string]$Certificado = (Join-Path $PSScriptRoot 'supabase-prod-ca-2021.crt')
)

$ImpressaoEsperada = 'A4518A0933AF6949482CCA3014C007C369DF9F6F'   # Supabase Root 2021 CA, vale ate 26/04/2031
$Servidor = 'aws-0-sa-east-1.pooler.supabase.com'
$Porta = 5432
$pendencias = @()

function Ok($t)    { Write-Host "  [OK] $t" -ForegroundColor Green }
function Falta($t) { Write-Host "  [!!] $t" -ForegroundColor Yellow }

Write-Host "`n1) Certificado do Supabase (conta do computador)"
$jaTem = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Thumbprint -eq $ImpressaoEsperada }
if ($jaTem) {
    Ok "ja estava instalado"
} elseif (-not (Test-Path $Certificado)) {
    Falta "nao achei $Certificado -- coloque o .crt na mesma pasta deste script"
    $pendencias += 'certificado'
} else {
    $novo = Import-Certificate -FilePath $Certificado -CertStoreLocation Cert:\LocalMachine\Root
    if ($novo.Thumbprint -eq $ImpressaoEsperada) {
        Ok "instalado em Autoridades de Certificacao Raiz Confiaveis (computador)"
    } else {
        # Arquivo trocado: tira o que entrou e para, em vez de confiar num
        # certificado que nao e o do Supabase.
        Remove-Item "Cert:\LocalMachine\Root\$($novo.Thumbprint)"
        Falta "o arquivo nao e o certificado do Supabase (impressao $($novo.Thumbprint)) -- removido"
        $pendencias += 'certificado'
    }
}

Write-Host "`n2) Energia: sem suspender nem hibernar na tomada"
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
Ok "suspender e hibernar = Nunca (na tomada)"
# Notebook: fechar a tampa costuma SUSPENDER, e o ajuste acima nao cobre
# isso. Na tomada, a tampa passa a nao fazer nada; na bateria fica como
# estava.
if ((Get-CimInstance Win32_ComputerSystem).PCSystemType -eq 2) {
    powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 | Out-Null
    powercfg /setactive SCHEME_CURRENT | Out-Null
    Ok "notebook: fechar a tampa na tomada = Nao fazer nada (deixe-o sempre na tomada)"
}

Write-Host "`n3) Servico do gateway"
$servico = Get-Service -Name PBIEgwService -ErrorAction SilentlyContinue
if (-not $servico) {
    Falta "gateway ainda nao instalado. Baixe em powerbi.microsoft.com/gateway (modo STANDARD), entre com a conta do Power BI e rode este script de novo."
    $pendencias += 'gateway'
} else {
    Set-Service -Name PBIEgwService -StartupType Automatic
    if ($servico.Status -ne 'Running') { Start-Service -Name PBIEgwService }
    Ok "On-premises data gateway service: Automatico e rodando"
}

Write-Host "`n4) Este PC alcanca o banco?"
if (Test-NetConnection -ComputerName $Servidor -Port $Porta -InformationLevel Quiet -WarningAction SilentlyContinue) {
    Ok "$Servidor porta $Porta respondeu"
} else {
    Falta "$Servidor porta $Porta NAO respondeu -- rede ou firewall do escritorio bloqueando a saida"
    $pendencias += 'rede'
}

Write-Host "`n5) Para colar no Power BI Service (engrenagem > Gerenciar conexoes e gateways > Nova)"
Write-Host "     Tipo de conexao ... PostgreSQL"
Write-Host "     Servidor .......... ${Servidor}:$Porta   <- exatamente assim, com a porta"
Write-Host "     Banco de dados .... postgres"
Write-Host "     Autenticacao ...... Basic"
Write-Host "     Usuario ........... powerbi_readonly.lezoymdvhhndhoxuumcc   <- o sufixo e obrigatorio"
Write-Host "     Senha ............. a do powerbi_readonly (a sua, do gerenciador de senhas)"
Write-Host "     Privacidade ....... Organizacional"

Write-Host "`nLembrete: em Windows Update > Opcoes avancadas > Horario ativo, cubra o horario da atualizacao."
if ($pendencias.Count -eq 0) {
    Write-Host "`nPC PRONTO. Siga o Passo 3 do 04-gateway-e-atualizacao.md no Power BI Service.`n" -ForegroundColor Green
} else {
    Write-Host "`nFALTA: $($pendencias -join ', '). Resolva e rode de novo -- o script pode rodar quantas vezes precisar.`n" -ForegroundColor Yellow
}
