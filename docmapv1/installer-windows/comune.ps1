# DocMap - funzioni comuni degli script di installazione in sede (Windows 10/11, Windows PowerShell 5.1).
# Si carica con:  . "$PSScriptRoot\comune.ps1"
# Le parti che non dipendono da Windows (backup, certificati, impostazioni, ping) sono in docmap_tools.py.

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$script:DocMapBase = 'C:\DocMap'
if ($env:DOCMAP_BASE) { $script:DocMapBase = $env:DOCMAP_BASE }   # solo per prove: la convenzione resta C:\DocMap

$script:TaskServer = 'DocMap Server'
$script:TaskBackup = 'DocMap Backup'
$script:FirewallGroup = 'DocMap'
$script:MinPython = [Version]'3.11'
$script:Silenzioso = $false
$script:UltimoOutput = @()

# testo e output dei programmi Python in UTF-8 (lettere accentate corrette nella finestra)
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'

function Get-DocMapPaths {
    $b = $script:DocMapBase
    return [ordered]@{
        Base         = $b
        App          = Join-Path $b 'app'
        Server       = Join-Path $b 'server'
        Venv         = Join-Path $b 'venv'
        VenvPython   = Join-Path $b 'venv\Scripts\python.exe'
        Strumenti    = Join-Path $b 'strumenti'
        Tools        = Join-Path $b 'strumenti\docmap_tools.py'
        ConfigDir    = Join-Path $b 'config'
        Config       = Join-Path $b 'config\config.json'
        Dati         = Join-Path $b 'dati'
        Certificati  = Join-Path $b 'certificati'
        CaCert       = Join-Path $b 'certificati\DocMap-CA-studio.crt'
        Backup       = Join-Path $b 'backup'
        Log          = Join-Path $b 'log'
        Versioni     = Join-Path $b '_versioni'
        Impostazioni = Join-Path $b 'impostazioni.json'
        Leggimi      = Join-Path $b 'LEGGIMI-INDIRIZZO.txt'
        PaginaQr     = Join-Path $b 'INDIRIZZO-QR.html'
    }
}

# ------------------------------------------------------------------ messaggi

function Write-Titolo([string]$t) { Write-Host ''; Write-Host "== $t ==" -ForegroundColor Cyan }
function Write-Ok([string]$t) { Write-Host "  [OK] $t" -ForegroundColor Green }
function Write-Info([string]$t) { Write-Host "  $t" }
function Write-Avviso([string]$t) { Write-Host "  [ATTENZIONE] $t" -ForegroundColor Yellow }
function Write-Errore([string]$t) { Write-Host "  [ERRORE] $t" -ForegroundColor Red }

function Read-SiNo([string]$domanda, [bool]$predefinito = $true) {
    $suff = if ($predefinito) { '[S/n]' } else { '[s/N]' }
    while ($true) {
        $r = Read-Host "  $domanda $suff"
        if ([string]::IsNullOrWhiteSpace($r)) { return $predefinito }
        switch -Regex ($r.Trim()) {
            '^(s|si|sì|y|yes)$' { return $true }
            '^(n|no)$' { return $false }
        }
        Write-Info 'Rispondi s (si) oppure n (no).'
    }
}

function Wait-Invio([string]$t = 'Premi Invio per chiudere.') {
    if ([Environment]::UserInteractive -and -not $script:Silenzioso) { [void](Read-Host "  $t") }
}

function Get-Timestamp { return (Get-Date).ToString('yyyyMMdd_HHmmss') }

# ------------------------------------------------------------------ amministratore

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Riapre lo script come amministratore (compare la richiesta di Windows "Consentire a questa app...?").
function Invoke-ComeAmministratore([string]$scriptPath, [hashtable]$boundParams) {
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$scriptPath`"")
    foreach ($k in $boundParams.Keys) {
        $v = $boundParams[$k]
        if ($v -is [System.Management.Automation.SwitchParameter]) {
            if ($v.IsPresent) { $argList += "-$k" }
        } else {
            $argList += "-$k"; $argList += "`"$v`""
        }
    }
    if ($env:DOCMAP_BASE) { Write-Avviso 'DOCMAP_BASE non passa alla finestra da amministratore: aprila tu come amministratore.' }
    Write-Info 'Servono i permessi di amministratore: Windows ora chiede la conferma.'
    try {
        Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs | Out-Null
    } catch {
        Write-Errore 'Permessi di amministratore non concessi: non posso continuare.'
        Wait-Invio
    }
}

# ------------------------------------------------------------------ Python

# Esegue un programma senza che le scritte su stderr diventino errori PowerShell; restituisce il codice di uscita.
# Con -Cattura l'output (stdout e stderr, riga per riga) resta in $script:UltimoOutput.
function Invoke-Native([string]$exe, [string[]]$arguments, [switch]$Cattura) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Cattura) {
            $out = & $exe @arguments 2>&1 | ForEach-Object { "$_" }
            $script:UltimoOutput = @($out)
        } else {
            & $exe @arguments | ForEach-Object { Write-Host "    $_" }
        }
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $old
    }
}

# Cerca un Python >= 3.11 "vero" (non l'alias di Microsoft Store). Restituisce il percorso di python.exe o $null.
function Find-SystemPython {
    $candidati = New-Object System.Collections.Generic.List[string]
    $probe = 'import sys; print(sys.executable); print("%d.%d" % sys.version_info[:2])'
    $py = Get-Command 'py.exe' -ErrorAction SilentlyContinue
    if ($py) {
        foreach ($v in @('-3.13', '-3.12', '-3.11', '-3')) {
            $code = Invoke-Native $py.Source @($v, '-c', $probe) -Cattura
            if ($code -eq 0 -and $script:UltimoOutput.Count -ge 1) { $candidati.Add([string]$script:UltimoOutput[0]) }
        }
    }
    foreach ($c in @(Get-Command 'python.exe' -All -ErrorAction SilentlyContinue)) { $candidati.Add($c.Source) }
    foreach ($pat in @("$env:ProgramFiles\Python3*\python.exe", "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe")) {
        foreach ($f in @(Get-ChildItem -Path $pat -ErrorAction SilentlyContinue)) { $candidati.Add($f.FullName) }
    }
    foreach ($exe in $candidati) {
        if ([string]::IsNullOrWhiteSpace($exe) -or -not (Test-Path -LiteralPath $exe)) { continue }
        if ($exe -like '*\WindowsApps\*') { continue }          # alias di Microsoft Store: non funziona per l'attività di sistema
        $code = Invoke-Native $exe @('-c', $probe) -Cattura
        if ($code -ne 0 -or $script:UltimoOutput.Count -lt 2) { continue }
        try { $ver = [Version](([string]$script:UltimoOutput[1]).Trim()) } catch { continue }
        if ($ver -ge $script:MinPython) { return ([string]$script:UltimoOutput[0]).Trim() }
    }
    return $null
}

function Show-ComeInstallarePython {
    Write-Errore 'Python 3.11 o piu recente non trovato su questo PC.'
    Write-Info 'Come installarlo (5 minuti):'
    Write-Info '  1. Apri https://www.python.org/downloads/windows/ e scarica "Windows installer (64-bit)" della 3.12 o 3.13.'
    Write-Info '  2. Avvia il file: in basso spunta "Add python.exe to PATH" e scegli "Customize installation".'
    Write-Info '  3. Nella seconda pagina spunta "Install Python for all users" (importante: DocMap gira come servizio).'
    Write-Info '  4. Install, poi chiudi e fai di nuovo doppio clic su installa.bat.'
    Write-Info 'Non usare il Python di Microsoft Store.'
}

# Esegue docmap_tools.py con il Python indicato (predefinito: quello del venv) e la cartella di DocMap.
function Invoke-Tools([string[]]$arguments, [string]$python = '', [string]$tools = '', [switch]$Cattura) {
    $p = Get-DocMapPaths
    if (-not $python) { $python = $p.VenvPython }
    if (-not $tools) { $tools = $p.Tools }
    $all = @($tools, '--base', $p.Base) + $arguments
    if ($Cattura) { return (Invoke-Native $python $all -Cattura) }
    return (Invoke-Native $python $all)
}

# ------------------------------------------------------------------ server (attività pianificata)

function Get-ServerProcesses {
    $p = Get-DocMapPaths
    return @(Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like "*docmap_tools.py*" -and $_.CommandLine -like "* serve*" -and
                       $_.CommandLine -like "*$($p.Base)*" })
}

# Ferma il server e impedisce al "controllo ogni 5 minuti" di riavviarlo finché non si chiama Start-DocMapServer.
function Stop-DocMapServer {
    $t = Get-ScheduledTask -TaskName $script:TaskServer -ErrorAction SilentlyContinue
    if ($t) {
        Disable-ScheduledTask -TaskName $script:TaskServer | Out-Null
        Stop-ScheduledTask -TaskName $script:TaskServer -ErrorAction SilentlyContinue
    }
    # il python.exe del venv avvia un secondo processo: si fermano entrambi
    for ($i = 0; $i -lt 10; $i++) {
        $procs = Get-ServerProcesses
        if ($procs.Count -eq 0) { return }
        foreach ($pr in $procs) { Stop-Process -Id $pr.ProcessId -Force -ErrorAction SilentlyContinue }
        Start-Sleep -Seconds 1
    }
    if ((Get-ServerProcesses).Count -gt 0) { throw 'Il server DocMap non si ferma: riavvia il PC e riprova.' }
}

function Start-DocMapServer {
    Enable-ScheduledTask -TaskName $script:TaskServer | Out-Null
    Start-ScheduledTask -TaskName $script:TaskServer
}

function Test-DocMapPing([int]$secondi = 60) {
    $code = Invoke-Tools @('ping', '--attendi', "$secondi") -Cattura
    return ($code -eq 0)
}

function Register-DocMapTasks {
    $p = Get-DocMapPaths
    $s = Get-Impostazioni
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

    # Server: all'avvio del PC + controllo ogni 5 minuti (se si è fermato riparte; se è acceso non succede niente)
    $action = New-ScheduledTaskAction -Execute $p.VenvPython -Argument "`"$($p.Tools)`" --base `"$($p.Base)`" serve" -WorkingDirectory $p.Base
    $t1 = New-ScheduledTaskTrigger -AtStartup
    $t2 = New-ScheduledTaskTrigger -Once -At ((Get-Date).Date.AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5) `
        -RepetitionDuration (New-TimeSpan -Days 3650)
    $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $script:TaskServer -Action $action -Trigger @($t1, $t2) -Principal $principal -Settings $set `
        -Description 'DocMap: server della rete locale (C:\DocMap). Creata da installa.ps1.' -Force | Out-Null

    # Backup giornaliero (se il PC è spento a quell'ora, parte appena si accende)
    $ora = [DateTime]::ParseExact([string]$s.ora_backup, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)
    $baction = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$($p.Strumenti)\backup.ps1`" -Silenzioso" -WorkingDirectory $p.Base
    $bt = New-ScheduledTaskTrigger -Daily -At $ora
    $bset = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $script:TaskBackup -Action $baction -Trigger $bt -Principal $principal -Settings $bset `
        -Description 'DocMap: backup giornaliero in C:\DocMap\backup (ultimi 30). Creata da installa.ps1.' -Force | Out-Null
}

function Get-Impostazioni {
    $p = Get-DocMapPaths
    if (-not (Test-Path -LiteralPath $p.Impostazioni)) { return [pscustomobject]@{ porta = 8443; porta_http = 8080; ora_backup = '12:30' } }
    return (Get-Content -LiteralPath $p.Impostazioni -Raw -Encoding UTF8 | ConvertFrom-Json)
}

# ------------------------------------------------------------------ rete e permessi

function Set-DocMapFirewall {
    $s = Get-Impostazioni
    Get-NetFirewallRule -Group $script:FirewallGroup -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName 'DocMap Server (HTTPS)' -Group $script:FirewallGroup -Direction Inbound -Action Allow `
        -Protocol TCP -LocalPort ([int]$s.porta) -Profile Private | Out-Null
    if ([int]$s.porta_http -gt 0) {
        New-NetFirewallRule -DisplayName 'DocMap Certificato (HTTP)' -Group $script:FirewallGroup -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort ([int]$s.porta_http) -Profile Private | Out-Null
    }
}

function Test-ReteProfilo {
    $pub = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' })
    if ($pub.Count -eq 0) { return }
    foreach ($n in $pub) {
        Write-Avviso "La rete '$($n.Name)' e impostata come PUBBLICA: telefoni e PC dello studio non vedranno DocMap."
        if (Read-SiNo "E la rete dell'ufficio? Impostarla come rete PRIVATA" $true) {
            Set-NetConnectionProfile -InterfaceIndex $n.InterfaceIndex -NetworkCategory Private
            Write-Ok "Rete '$($n.Name)' impostata come privata."
        } else {
            Write-Info 'Va bene: puoi cambiarlo dopo da Impostazioni > Rete e Internet > (la tua rete) > Rete privata.'
        }
    }
}

# Solo Amministratori e SYSTEM (cartelle con chiave, token, backup).
function Set-AclPrivata([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return }
    $code = Invoke-Native 'icacls.exe' @($path, '/inheritance:r', '/grant:r', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F', '/T', '/C', '/Q') -Cattura
    if ($code -ne 0) { Write-Avviso "Permessi di $path non impostati (icacls $code)." }
}

function Import-CaCertificato {
    $p = Get-DocMapPaths
    if (-not (Test-Path -LiteralPath $p.CaCert)) { return }
    Import-Certificate -FilePath $p.CaCert -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
}

# ------------------------------------------------------------------ versioni (aggiornamento e ritorno indietro)

# Sposta app, server e strumenti attuali in _versioni\<ts>\ e mette quelli nuovi. Mai dati, config, certificati, backup.
function Install-Versione([string]$sorgente, [string]$ts) {
    $p = Get-DocMapPaths
    $old = Join-Path $p.Versioni $ts
    New-Item -ItemType Directory -Path $old -Force | Out-Null
    foreach ($n in @('app', 'server', 'strumenti')) {
        $cur = Join-Path $p.Base $n
        if (Test-Path -LiteralPath $cur) { Move-Item -LiteralPath $cur -Destination (Join-Path $old $n) }
    }
    Copy-Item -LiteralPath (Join-Path $sorgente 'app') -Destination $p.App -Recurse
    Copy-Item -LiteralPath (Join-Path $sorgente 'server') -Destination $p.Server -Recurse
    New-Item -ItemType Directory -Path $p.Strumenti -Force | Out-Null
    foreach ($f in @('installa.bat', 'installa.ps1', 'comune.ps1', 'backup.ps1', 'ripristina.ps1', 'aggiorna.ps1', 'disinstalla.ps1',
                     'licenza.ps1', 'docmap_tools.py', 'GUIDA-INSTALLAZIONE.md', 'VERSIONE.txt')) {
        $src = Join-Path $sorgente $f
        if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination $p.Strumenti }
    }
    return $old
}

# Rimette la versione salvata in _versioni\<ts>\ (quella nuova va in _versioni\<ts>-non-riuscita\).
function Restore-Versione([string]$ts) {
    $p = Get-DocMapPaths
    $old = Join-Path $p.Versioni $ts
    $bad = Join-Path $p.Versioni "$ts-non-riuscita"
    New-Item -ItemType Directory -Path $bad -Force | Out-Null
    foreach ($n in @('app', 'server', 'strumenti')) {
        $cur = Join-Path $p.Base $n
        $prev = Join-Path $old $n
        if (-not (Test-Path -LiteralPath $prev)) { continue }
        if (Test-Path -LiteralPath $cur) { Move-Item -LiteralPath $cur -Destination (Join-Path $bad $n) }
        Move-Item -LiteralPath $prev -Destination $cur
    }
}

function Install-Pacchetti {
    $p = Get-DocMapPaths
    $req = Join-Path $p.Server 'requirements.txt'
    $wheels = Join-Path $p.Server 'wheels'
    [void](Invoke-Native $p.VenvPython @('-m', 'pip', 'install', '--disable-pip-version-check', '-q', '--upgrade', 'pip') -Cattura)
    if (Test-Path -LiteralPath $wheels) {
        $code = Invoke-Native $p.VenvPython @('-m', 'pip', 'install', '--disable-pip-version-check', '-q', '--no-index', '--find-links', $wheels, '-r', $req)
        if ($code -eq 0) { return $true }
        Write-Avviso 'Pacchetti inclusi non adatti a questo Python: li scarico da Internet.'
    }
    $code = Invoke-Native $p.VenvPython @('-m', 'pip', 'install', '--disable-pip-version-check', '-q', '-r', $req)
    return ($code -eq 0)
}

# Tiene le ultime $tieni copie in _versioni (le più vecchie vanno in _versioni\_da-eliminare, da svuotare a mano).
function Limit-Versioni([int]$tieni = 3) {
    $p = Get-DocMapPaths
    if (-not (Test-Path -LiteralPath $p.Versioni)) { return }
    $dirs = @(Get-ChildItem -LiteralPath $p.Versioni -Directory | Where-Object { $_.Name -match '^\d{8}_\d{6}' } | Sort-Object Name -Descending)
    if ($dirs.Count -le $tieni) { return }
    $trash = Join-Path $p.Versioni '_da-eliminare'
    New-Item -ItemType Directory -Path $trash -Force | Out-Null
    foreach ($d in $dirs[$tieni..($dirs.Count - 1)]) { Move-Item -LiteralPath $d.FullName -Destination (Join-Path $trash $d.Name) -Force }
}
