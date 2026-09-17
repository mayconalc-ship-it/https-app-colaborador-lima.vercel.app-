<#
    QUEM E ADMINISTRADOR NESTA MAQUINA?
    (Passo 0 do 04-gateway-e-atualizacao.md)

    Rode NO PC DO GATEWAY, em PowerShell NORMAL -- este script nao precisa de
    administrador e nao pede senha nenhuma. Ele so le.

      powershell -ExecutionPolicy Bypass -File ".\04c-quem-e-admin.ps1"

    Existe porque instalar o gateway e o certificado exige administrador
    local, e o Windows pede isso numa caixa de usuario e senha que parece
    credencial do Supabase ou do Power BI -- e nao e nenhuma das duas. Pior:
    o campo Dominio dessa caixa nao e editavel, entao com a conta certa e a
    senha certa ela ainda recusa se faltar o prefixo. Este script diz qual
    conta usar e como digita-la.

    Texto sem acento de proposito: o PowerShell 5.1 le .ps1 sem BOM como
    ANSI e estragaria qualquer acento das mensagens.
#>

$cs = Get-CimInstance Win32_ComputerSystem
$id = [Security.Principal.WindowsIdentity]::GetCurrent()

# S-1-5-32-544 e o grupo Administradores em qualquer idioma de Windows --
# por isso o SID, e nao o nome, que muda de "Administradores" para
# "Administrators" conforme a instalacao.
$noGrupo = [bool]($id.Groups | Where-Object { $_.Value -eq 'S-1-5-32-544' })
$elevado = ([Security.Principal.WindowsPrincipal]$id).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host ""
Write-Host "PC .............. $env:COMPUTERNAME"
Write-Host "Voce ............ $($id.Name)"
if ($cs.PartOfDomain) {
    Write-Host "Dominio ......... $($cs.Domain)  (maquina ESTA em dominio)"
} else {
    Write-Host "Dominio ......... nenhum (maquina em grupo de trabalho)"
}
Write-Host "No grupo Admin .. $noGrupo"
Write-Host "Sessao elevada .. $elevado"

Write-Host ""
Write-Host "Contas locais e se estao habilitadas:"
# SEM -ErrorAction SilentlyContinue e SEM $ErrorActionPreference global: com
# o erro engolido, uma listagem vazia parece "nao ha administradores" quando
# na verdade o comando nem rodou.
try {
    Get-LocalUser | Sort-Object Name | ForEach-Object {
        $marca = if ($_.Enabled) { '   ' } else { '[x]' }
        # SID terminado em -500 e a conta interna de administrador, mesmo
        # que tenham renomeado. Costuma vir desativada por politica, e e a
        # confusao classica: a senha certa da conta errada e recusada como
        # se fosse senha errada.
        $interna = if ($_.SID.Value -match '-500$') { '  <- conta interna de administrador' } else { '' }
        Write-Host ("  $marca {0,-24} Enabled={1}{2}" -f $_.Name, $_.Enabled, $interna)
    }
} catch {
    Write-Host "  nao consegui listar ($($_.Exception.Message))"
}
Write-Host "  ([x] = conta DESATIVADA: a senha dela nao funciona, por mais correta que seja)"

Write-Host ""
Write-Host "Membros do grupo Administradores:"
try {
    Get-LocalGroupMember -SID S-1-5-32-544 -ErrorAction Stop |
        ForEach-Object { Write-Host "  $($_.Name)  [$($_.ObjectClass)]" }
} catch {
    # Get-LocalGroupMember quebra em maquina de dominio com membro orfao.
    # O net localgroup nao quebra, entao vale como plano B.
    Write-Host "  (Get-LocalGroupMember falhou -- usando net localgroup)"
    net localgroup Administradores 2>$null
    if ($LASTEXITCODE -ne 0) { net localgroup Administrators }
}

Write-Host ""
Write-Host "--- O QUE FAZER ---"
if ($noGrupo) {
    Write-Host "Sua conta JA e administradora. Nao digite credencial nenhuma:"
    Write-Host "feche a caixa e abra o Terminal com botao direito no Iniciar >"
    Write-Host "Executar como administrador."
} else {
    Write-Host "Sua conta NAO e administradora. Use uma conta HABILITADA da lista"
    Write-Host "acima, digitada com prefixo -- o campo Dominio da caixa nao e"
    Write-Host "editavel, quem manda nele e o prefixo:"
    Write-Host ""
    Write-Host "   conta LOCAL   ->  .\<nome>      (ou  $env:COMPUTERNAME\<nome>)"
    if ($cs.PartOfDomain) {
        Write-Host "   conta DOMINIO ->  <nome>@$($cs.Domain)"
    }
    Write-Host ""
    Write-Host "Nome com espaco vai normal, sem aspas -- e campo de formulario."
    Write-Host "Depois de digitar o prefixo, confira que o campo Dominio mudou"
    Write-Host "antes de dar OK."
    Write-Host ""
    Write-Host "Sem credencial nenhuma em maos, o pedido para a TI cobre os tres"
    Write-Host "de uma vez: (1) importar certificado raiz na Maquina Local,"
    Write-Host "(2) instalar o On-premises Data Gateway, (3) ajustar o plano de"
    Write-Host "energia. Pedir so o primeiro garante um segundo chamado."
}
Write-Host ""
