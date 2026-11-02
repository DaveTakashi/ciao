# DocMap - aggiornamento da un nuovo pacchetto (zip o cartella estratta).
# Uso: powershell -ExecutionPolicy Bypass -File C:\DocMap\strumenti\aggiorna.ps1 -Pacchetto "C:\Users\...\Downloads\DocMap-26.12.zip"
# Passi: backup -> stop -> sostituisce app, server e strumenti (MAI dati, config, licenza, certificati, impostazioni)
#        -> pacchetti Python -> riavvio -> prova ?r=ping -> se non risponde rimette da solo la versione di prima.
[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$Pacchetto, [switch]$NonChiedere)

. "$PSScriptRoot\comune.ps1"
if (-not (Test-Admin)) { Invoke-ComeAmministratore $PSCommandPath $PSBoundParameters; exit }

$p = Get-DocMapPaths
$ts = Get-Timestamp
$sostituito = $false
try {
    Write-Titolo 'Aggiornamento di DocMap'
    if (-not (Test-Path -LiteralPath $p.Config)) { throw 'DocMap non è installato in questo PC: usa installa.bat.' }
    if (-not (Test-Path -LiteralPath $Pacchetto)) { throw "Pacchetto non trovato: $Pacchetto" }

    # 1. pacchetto (zip → estratto in _versioni\nuovo_<ts>)
    $src = (Resolve-Path -LiteralPath $Pacchetto).Path
    if ((Get-Item -LiteralPath $src).PSIsContainer -eq $false) {
        $dest = Join-Path $p.Versioni "nuovo_$ts"
        Write-Info "Estraggo $src ..."
        Expand-Archive -LiteralPath $src -DestinationPath $dest -Force
        # zip con una cartella principale dentro: si scende di un livello
        $inner = @(Get-ChildItem -LiteralPath $dest)
        if ($inner.Count -eq 1 -and $inner[0].PSIsContainer) { $dest = $inner[0].FullName }
        $src = $dest
    }
    $code = Invoke-Tools @('controlla-pacchetto', $src) -tools (Join-Path $src 'docmap_tools.py') -Cattura
    if ($code -ne 0) { throw ('Pacchetto incompleto: ' + ($script:UltimoOutput -join ' ')) }
    $verFile = Join-Path $src 'VERSIONE.txt'
    if (Test-Path -LiteralPath $verFile) { Write-Ok ('Nuova versione: ' + (Get-Content -LiteralPath $verFile -Raw).Trim()) }
    $verOld = Join-Path $p.Strumenti 'VERSIONE.txt'
    if (Test-Path -LiteralPath $verOld) { Write-Info ('Versione attuale: ' + (Get-Content -LiteralPath $verOld -Raw).Trim()) }
    if (-not $NonChiedere -and -not (Read-SiNo 'Procedo con l''aggiornamento?' $true)) { Write-Info 'Annullato.'; Wait-Invio; exit 0 }

    # 2. backup (a server acceso: copia coerente con l'API di backup di SQLite)
    Write-Info 'Backup...'
    if ((Invoke-Tools @('backup') -Cattura) -ne 0) { throw ('Backup non riuscito, aggiornamento annullato: ' + ($script:UltimoOutput -join ' ')) }
    Write-Ok 'Backup fatto.'

    # 3. stop e sostituzione
    Write-Info 'Fermo il server...'
    Stop-DocMapServer
    $sostituito = $true
    $salvata = Install-Versione $src $ts
    Write-Ok "Versione precedente conservata in $salvata"
    $okPip = Install-Pacchetti
    $okCfg = ((Invoke-Tools @('config-js') -Cattura) -eq 0)

    # 4. riavvio e prova
    if ($okPip -and $okCfg) {
        Register-DocMapTasks          # i percorsi non cambiano, ma un pacchetto nuovo può cambiare le opzioni delle attività
        Start-DocMapServer
        Write-Info 'Attendo che il server risponda...'
    }
    if ($okPip -and $okCfg -and (Test-DocMapPing 90)) {
        Write-Ok 'Aggiornamento completato: il server risponde.'
        [void](Invoke-Tools @('pagina-indirizzo') -Cattura)
        Limit-Versioni 3
        Wait-Invio
        exit 0
    }

    # 5. ritorno automatico alla versione precedente
    Write-Errore ('La nuova versione non risponde: ' + ($script:UltimoOutput -join ' '))
    Write-Info 'Rimetto la versione precedente...'
    Stop-DocMapServer
    Restore-Versione $ts
    [void](Install-Pacchetti)
    [void](Invoke-Tools @('config-js') -Cattura)
    Start-DocMapServer
    if (Test-DocMapPing 90) {
        Write-Ok ("La versione precedente funziona di nuovo. La nuova e in $($p.Versioni)\$ts-non-riuscita per l'analisi.")
    } else {
        Write-Errore "Anche la versione precedente non risponde. Registro: $($p.Log)\server.log. Ultimo backup: $($p.Backup)."
        Write-Info 'Se serve: ripristina.ps1 con l''ultimo backup (vedi GUIDA-INSTALLAZIONE.md).'
    }
    Wait-Invio
    exit 3
} catch {
    Write-Errore $_.Exception.Message
    if ($sostituito) {
        Write-Info 'Rimetto la versione precedente...'
        try { Stop-DocMapServer; Restore-Versione $ts; [void](Invoke-Tools @('config-js') -Cattura) } catch { Write-Errore $_.Exception.Message }
    }
    if ((Get-ScheduledTask -TaskName $script:TaskServer -ErrorAction SilentlyContinue) -and (Get-ServerProcesses).Count -eq 0) {
        try { Start-DocMapServer } catch { }
    }
    Wait-Invio
    exit 1
}
