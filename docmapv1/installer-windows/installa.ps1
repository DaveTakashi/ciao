# DocMap - installazione in sede su Windows 10/11 (cartella fissa C:\DocMap).
# Avvio: doppio clic su installa.bat (chiede i permessi di amministratore).
# Rieseguirlo = aggiornamento: prima un backup, poi si sostituiscono solo programma e server;
# dati (C:\DocMap\dati), configurazione (C:\DocMap\config), certificati e impostazioni non vengono mai sovrascritti.
#
# Opzioni (per chi installa da riga di comando):
#   -NomeStudio "Studio Rossi"   -Admin "davide"   -Porta 8443   -Sorgente <cartella del pacchetto>   -NonChiedere
[CmdletBinding()]
param(
    [string]$NomeStudio = '',
    [string]$Admin = '',
    [int]$Porta = 0,
    [string]$Sorgente = '',
    [switch]$NonChiedere
)

. "$PSScriptRoot\comune.ps1"

if (-not (Test-Admin)) { Invoke-ComeAmministratore $PSCommandPath $PSBoundParameters; exit }

$p = Get-DocMapPaths
$ts = Get-Timestamp
$sostituito = $false
$haPrecedente = $false
Write-Host ''
Write-Host '  DocMap - installazione nel PC dello studio' -ForegroundColor Cyan
Write-Host "  Cartella: $($p.Base)"

try {
    # ------------------------------------------------------------ 1. Python
    Write-Titolo '1/9  Python'
    $sysPy = Find-SystemPython
    if (-not $sysPy) {
        Show-ComeInstallarePython
        $winget = Get-Command 'winget.exe' -ErrorAction SilentlyContinue
        if ($winget -and -not $NonChiedere -and (Read-SiNo 'Vuoi che lo installi io adesso con winget (Python 3.12, per tutti gli utenti)?' $true)) {
            [void](Invoke-Native $winget.Source @('install', '-e', '--id', 'Python.Python.3.12', '--scope', 'machine',
                                                   '--accept-package-agreements', '--accept-source-agreements'))
            $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
            $sysPy = Find-SystemPython
        }
        if (-not $sysPy) { throw 'Python non disponibile: installalo come spiegato sopra e riavvia installa.bat.' }
    }
    Write-Ok "Python trovato: $sysPy"

    # ------------------------------------------------------------ 2. pacchetto da installare
    Write-Titolo '2/9  File da installare'
    if (-not $Sorgente) { $Sorgente = $PSScriptRoot }
    $Sorgente = (Resolve-Path -LiteralPath $Sorgente).Path
    $tools = Join-Path $Sorgente 'docmap_tools.py'
    $code = Invoke-Native $sysPy @($tools, 'controlla-pacchetto', $Sorgente) -Cattura
    if ($code -ne 0) {
        # dal repository (docmapv1\installer-windows): si prepara il pacchetto al volo
        if (Test-Path -LiteralPath (Join-Path $Sorgente '..\tools\build_deploy.py')) {
            $tmpPkg = Join-Path $env:TEMP "DocMap-pacchetto-$ts"
            Write-Info "Preparo il pacchetto dal repository in $tmpPkg ..."
            $code = Invoke-Native $sysPy @($tools, 'pacchetto', '--out', $tmpPkg) -Cattura
            if ($code -ne 0) { throw ('Preparazione del pacchetto non riuscita: ' + ($script:UltimoOutput -join ' ')) }
            $Sorgente = $tmpPkg
            $tools = Join-Path $Sorgente 'docmap_tools.py'
        } else {
            throw "La cartella $Sorgente non contiene un pacchetto DocMap completo (app, server, script). Estrai di nuovo lo zip."
        }
    }
    $verFile = Join-Path $Sorgente 'VERSIONE.txt'
    if (Test-Path -LiteralPath $verFile) { Write-Ok ('Pacchetto: ' + (Get-Content -LiteralPath $verFile -Raw).Trim()) } else { Write-Ok "Pacchetto: $Sorgente" }

    # ------------------------------------------------------------ 3. installazione esistente → backup
    $aggiornamento = Test-Path -LiteralPath $p.Config
    Write-Titolo '3/9  Backup'
    if ($aggiornamento) {
        Write-Info 'DocMap e gia installato: questo e un AGGIORNAMENTO. Dati e configurazione restano come sono.'
        # sqlite3 è nella libreria standard: il backup funziona anche con il Python di sistema, a server acceso
        $code = Invoke-Tools @('backup') -python $sysPy -tools $tools
        if ($code -ne 0) { throw 'Backup non riuscito: aggiornamento annullato, nulla e stato cambiato.' }
        Write-Ok "Backup fatto in $($p.Backup)"
    } else {
        Write-Info 'Prima installazione: niente da salvare.'
    }

    # ------------------------------------------------------------ 4. cartelle e file del programma
    Write-Titolo '4/9  Programma e server'
    foreach ($d in @($p.Base, $p.ConfigDir, $p.Dati, $p.Certificati, $p.Backup, $p.Log, $p.Versioni)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
    $taskEsiste = [bool](Get-ScheduledTask -TaskName $script:TaskServer -ErrorAction SilentlyContinue)
    if ($taskEsiste -or (Get-ServerProcesses).Count -gt 0) { Write-Info 'Fermo il server...'; Stop-DocMapServer }
    $haPrecedente = (Test-Path -LiteralPath $p.App) -or (Test-Path -LiteralPath $p.Server)
    $sostituito = $true
    $salvata = Install-Versione $Sorgente $ts
    if ($haPrecedente) { Write-Ok "Versione precedente conservata in $salvata" }
    Write-Ok "Programma in $($p.App), server in $($p.Server)"

    # ------------------------------------------------------------ 5. ambiente Python del server
    Write-Titolo '5/9  Ambiente Python del server (qualche minuto la prima volta)'
    $venvOk = $false
    if (Test-Path -LiteralPath $p.VenvPython) { $venvOk = ((Invoke-Native $p.VenvPython @('-c', 'import sys') -Cattura) -eq 0) }
    if (-not $venvOk) {
        if (Test-Path -LiteralPath $p.Venv) { Move-Item -LiteralPath $p.Venv -Destination (Join-Path $p.Versioni "$ts-venv-vecchio") }
        $code = Invoke-Native $sysPy @('-m', 'venv', $p.Venv)
        if ($code -ne 0) { throw 'Creazione dell''ambiente Python non riuscita.' }
    }
    if (-not (Install-Pacchetti)) { throw 'Installazione dei pacchetti Python non riuscita (serve Internet la prima volta, oppure la cartella server\wheels).' }
    Write-Ok 'Pacchetti fastapi, uvicorn, cryptography installati.'

    # ------------------------------------------------------------ 6. impostazioni e configurazione
    Write-Titolo '6/9  Studio e amministratore'
    $s0 = $null
    if (Test-Path -LiteralPath $p.Impostazioni) { $s0 = Get-Impostazioni }
    if (-not $NomeStudio -and ($null -eq $s0 -or [string]::IsNullOrWhiteSpace([string]$s0.nome_studio)) -and -not $NonChiedere) {
        $NomeStudio = (Read-Host '  Nome dello studio (es. Studio Rossi)').Trim()
    }
    $impArgs = @('impostazioni')
    if ($NomeStudio) { $impArgs += @('--nome-studio', $NomeStudio) }
    if ($Porta -gt 0) { $impArgs += @('--porta', "$Porta") }
    if ((Invoke-Tools $impArgs -Cattura) -ne 0) { throw ('impostazioni.json: ' + ($script:UltimoOutput -join ' ')) }
    $s = Get-Impostazioni
    Write-Ok "Studio: $($s.nome_studio)  -  porta $($s.porta)"

    if (-not (Test-Path -LiteralPath $p.Config)) {
        while ($true) {
            if (-not $Admin) {
                if ($NonChiedere) { $Admin = 'admin' } else {
                    $Admin = (Read-Host '  Nome utente dell''amministratore (es. davide) [admin]').Trim()
                    if (-not $Admin) { $Admin = 'admin' }
                }
            }
            $old = Get-Location
            Set-Location -LiteralPath $p.Server
            try {
                $code = Invoke-Native $p.VenvPython @('-m', 'docmap_server', 'setup', '--config', $p.Config, '--data-dir', $p.Dati,
                                                       '--user', "$Admin,admin", '--studio-name', [string]$s.nome_studio) -Cattura
            } finally { Set-Location $old }
            if ($code -eq 0) { break }
            Write-Errore ($script:UltimoOutput -join ' ')
            if ($NonChiedere) { throw 'Configurazione non riuscita.' }
            $Admin = ''
        }
        $primo = Join-Path $p.ConfigDir 'PRIMO-CODICE-ADMIN.txt'
        $testo = @('DocMap - codice di accesso dell''amministratore (mostrato una sola volta)', '') + $script:UltimoOutput +
                 @('', 'Copialo in un posto sicuro (es. gestore di password) e poi ELIMINA questo file.')
        Set-Content -LiteralPath $primo -Value $testo -Encoding UTF8
        Write-Host ''
        foreach ($l in $script:UltimoOutput) { Write-Host "    $l" -ForegroundColor White }
        Write-Host ''
        Write-Avviso "Copia ADESSO il codice di accesso qui sopra. Una copia e in $primo (solo amministratori): eliminala dopo."
        Wait-Invio 'Premi Invio dopo aver copiato il codice di accesso.'
    } else {
        Write-Ok "Configurazione esistente mantenuta: $($p.Config)"
    }

    # ------------------------------------------------------------ 7. programma web e certificato
    Write-Titolo '7/9  Indirizzo e certificato della rete locale'
    if ((Invoke-Tools @('config-js') -Cattura) -ne 0) { throw ('docmap.config.js: ' + ($script:UltimoOutput -join ' ')) }
    if ((Invoke-Tools @('cert') -Cattura) -ne 0) { throw ('Certificato: ' + ($script:UltimoOutput -join ' ')) }
    Import-CaCertificato
    Write-Ok "Certificato dello studio in $($p.CaCert) (gia considerato attendibile su questo PC)."
    Set-AclPrivata $p.ConfigDir
    Set-AclPrivata $p.Dati
    Set-AclPrivata $p.Backup
    Set-AclPrivata $p.Certificati
    Write-Ok 'Cartelle config, dati, backup e certificati accessibili solo agli amministratori.'

    # ------------------------------------------------------------ 8. firewall e attività pianificate
    Write-Titolo '8/9  Firewall e avvio automatico'
    if (-not $NonChiedere) { Test-ReteProfilo }
    Set-DocMapFirewall
    Write-Ok "Firewall: porte $($s.porta) e $($s.porta_http) aperte solo per le reti PRIVATE."
    Register-DocMapTasks
    Write-Ok "Attivita pianificate '$($script:TaskServer)' (all'avvio del PC) e '$($script:TaskBackup)' (ogni giorno alle $($s.ora_backup))."

    # ------------------------------------------------------------ 9. avvio e prova
    Write-Titolo '9/9  Avvio e prova'
    Start-DocMapServer
    if (-not (Test-DocMapPing 60)) {
        Write-Errore ('Il server non risponde: ' + ($script:UltimoOutput -join ' '))
        if ($haPrecedente) {
            Write-Info 'Rimetto la versione precedente...'
            Stop-DocMapServer
            Restore-Versione $ts
            [void](Install-Pacchetti)
            [void](Invoke-Tools @('config-js') -Cattura)
            Start-DocMapServer
            if (Test-DocMapPing 60) { Write-Ok 'Versione precedente di nuovo in funzione: niente e cambiato per lo studio.' }
            else { Write-Errore 'Anche la versione precedente non risponde: vedi GUIDA-INSTALLAZIONE.md, "Problemi".' }
        }
        Write-Info "Registro del server: $($p.Log)\server.log"
        $sostituito = $false          # già gestito qui sopra
        throw 'Installazione non completata.'
    }
    Write-Ok 'Il server risponde (ping).'
    Limit-Versioni 3
    [void](Invoke-Tools @('pagina-indirizzo') -Cattura)

    Write-Host ''
    Write-Host '  ===========================================================' -ForegroundColor Green
    Write-Host '   DocMap e installato.' -ForegroundColor Green
    Write-Host '  ===========================================================' -ForegroundColor Green
    if (Test-Path -LiteralPath $p.Leggimi) { Get-Content -LiteralPath $p.Leggimi -Encoding UTF8 | ForEach-Object { Write-Host "   $_" } }
    Write-Host ''
    Write-Info "Questo testo e salvato in $($p.Leggimi); i QR da stampare in $($p.PaginaQr)."
    if (-not $NonChiedere) { Start-Process -FilePath $p.PaginaQr -ErrorAction SilentlyContinue }
    Wait-Invio
    exit 0
} catch {
    Write-Host ''
    Write-Errore $_.Exception.Message
    if ($sostituito -and $haPrecedente) {
        Write-Info 'Rimetto la versione precedente...'
        try {
            if (Get-ScheduledTask -TaskName $script:TaskServer -ErrorAction SilentlyContinue) { Stop-DocMapServer }
            Restore-Versione $ts
            if (Test-Path -LiteralPath $p.VenvPython) { [void](Invoke-Tools @('config-js') -Cattura) }
            if (Get-ScheduledTask -TaskName $script:TaskServer -ErrorAction SilentlyContinue) { Start-DocMapServer }
        } catch { Write-Errore $_.Exception.Message }
    }
    Write-Info 'I dati non sono stati toccati. Guida: GUIDA-INSTALLAZIONE.md, sezione "Problemi".'
    Wait-Invio
    exit 1
}
