# DocMap - ripristino di un backup.
# Uso: tasto destro > "Esegui con PowerShell" (sceglie tra gli ultimi backup), oppure
#      powershell -ExecutionPolicy Bypass -File ripristina.ps1 -Zip "E:\BackupDocMap\docmap_20261102_1230.zip"
# Ferma il server, sposta i dati attuali in C:\DocMap\dati\_prima-del-ripristino_<data>\ (non si cancella niente),
# rimette il database dello zip, riavvia il server e controlla che risponda.
[CmdletBinding()]
param([string]$Zip = '', [switch]$Si)

. "$PSScriptRoot\comune.ps1"
if (-not (Test-Admin)) { Invoke-ComeAmministratore $PSCommandPath $PSBoundParameters; exit }

$p = Get-DocMapPaths
try {
    Write-Titolo 'Ripristino di un backup di DocMap'
    if (-not (Test-Path -LiteralPath $p.VenvPython)) { throw 'DocMap non è installato in questo PC.' }
    if (-not $Zip) {
        [void](Invoke-Tools @('elenco-backup') -Cattura)
        $lista = @($script:UltimoOutput | Where-Object { $_ -match '\.zip$' } | Select-Object -First 15)
        if ($lista.Count -eq 0) { throw "Nessun backup in $($p.Backup). Indica il file con -Zip <percorso>." }
        for ($i = 0; $i -lt $lista.Count; $i++) { Write-Info ("{0,2}. {1}" -f ($i + 1), (Split-Path -Leaf $lista[$i])) }
        $n = Read-Host '  Numero del backup da ripristinare (Invio = annulla)'
        if (-not ($n -match '^\d+$') -or [int]$n -lt 1 -or [int]$n -gt $lista.Count) { Write-Info 'Annullato.'; Wait-Invio; exit 0 }
        $Zip = $lista[[int]$n - 1]
    }
    if (-not (Test-Path -LiteralPath $Zip)) { throw "File non trovato: $Zip" }
    # copia di lavoro: il backup fatto prima del ripristino potrebbe togliere proprio lo zip scelto (regola degli ultimi 30)
    $work = Join-Path $env:TEMP ('docmap-ripristino-' + (Get-Timestamp) + '.zip')
    Copy-Item -LiteralPath $Zip -Destination $work
    $Zip = $work

    Write-Info "Controllo il file $Zip ..."
    if ((Invoke-Tools @('verifica-zip', $Zip) -Cattura) -ne 0) { throw ('Backup non valido: ' + ($script:UltimoOutput -join ' ')) }
    try { $man = ($script:UltimoOutput -join "`n") | ConvertFrom-Json; Write-Ok ("Backup del " + $man.creato + " dal PC " + $man.host + ": integro.") } catch { Write-Ok 'Backup integro.' }

    Write-Host ''
    Write-Avviso 'Il database attuale verra sostituito con quello del backup. Le modifiche fatte dopo quella data spariscono'
    Write-Avviso 'dal server (restano nella copia di sicurezza e nei telefoni/PC che non hanno ancora sincronizzato).'
    if (-not $Si) {
        $ok = Read-Host '  Per confermare scrivi RIPRISTINA'
        if ($ok -cne 'RIPRISTINA') { Write-Info 'Annullato: nulla e stato cambiato.'; Wait-Invio; exit 0 }
    }

    Write-Info 'Faccio prima un backup dello stato attuale...'
    if ((Invoke-Tools @('backup') -Cattura) -ne 0) { Write-Avviso ('Backup dello stato attuale non riuscito: ' + ($script:UltimoOutput -join ' ')) }

    Write-Info 'Fermo il server...'
    Stop-DocMapServer
    $code = Invoke-Tools @('ripristina', $Zip) -Cattura
    $out = ($script:UltimoOutput -join "`n")
    $res = $null
    try { $res = $out | ConvertFrom-Json } catch { }
    Write-Info 'Riavvio il server...'
    Start-DocMapServer
    if ($code -ne 0) { throw "Ripristino non riuscito: $out (il server e ripartito con i dati di prima)" }
    if ($res) {
        Write-Ok ('Dati di prima conservati in ' + $res.copia_di_sicurezza)
        if ($res.config_ripristinata) { Write-Avviso 'La chiave del backup era diversa: e stata rimessa anche la configurazione del backup (codici di accesso di allora).' }
    }
    if (Test-DocMapPing 60) { Write-Ok 'Ripristino completato: il server risponde.' }
    else { Write-Errore ('Il server non risponde dopo il ripristino: ' + ($script:UltimoOutput -join ' ')); Write-Info "Registro: $($p.Log)\server.log" }
    Write-Info 'Su ogni PC/telefono: apri DocMap e attendi "Online - sincronizzato".'
    Wait-Invio
    exit 0
} catch {
    Write-Errore $_.Exception.Message
    Wait-Invio
    exit 1
}
