# DocMap - ripristino di un backup (.docmap-backup cifrato oppure vecchio .zip).
# Uso: tasto destro > "Esegui con PowerShell" (sceglie tra gli ultimi backup), oppure
#      powershell -ExecutionPolicy Bypass -File ripristina.ps1 -Zip "E:\BackupDocMap\docmap_20261102_1230.docmap-backup"
# Se il backup è cifrato con una passphrase diversa da quella di questo PC (PC nuovo, backup di un altro PC) la chiede
# (è sul foglio del Kit di emergenza). Passphrase sbagliata = nulla viene cambiato.
# Ferma il server, sposta i dati attuali in C:\DocMap\dati\_prima-del-ripristino_<data>\ (non si cancella niente),
# rimette il database del backup, riavvia il server e controlla che risponda.
[CmdletBinding()]
param([string]$Zip = '', [switch]$Si)

. "$PSScriptRoot\comune.ps1"
if (-not (Test-Admin)) { Invoke-ComeAmministratore $PSCommandPath $PSBoundParameters; exit }

$p = Get-DocMapPaths
$work = ''
try {
    Write-Titolo 'Ripristino di un backup di DocMap'
    if (-not (Test-Path -LiteralPath $p.VenvPython)) { throw 'DocMap non è installato in questo PC.' }
    if (-not $Zip) {
        [void](Invoke-Tools @('elenco-backup') -Cattura)
        $lista = @($script:UltimoOutput | Where-Object { $_ -match '\.(zip|docmap-backup)$' } | Select-Object -First 15)
        if ($lista.Count -eq 0) { throw "Nessun backup in $($p.Backup). Indica il file con -Zip <percorso>." }
        for ($i = 0; $i -lt $lista.Count; $i++) { Write-Info ("{0,2}. {1}" -f ($i + 1), (Split-Path -Leaf $lista[$i])) }
        $n = Read-Host '  Numero del backup da ripristinare (Invio = annulla)'
        if (-not ($n -match '^\d+$') -or [int]$n -lt 1 -or [int]$n -gt $lista.Count) { Write-Info 'Annullato.'; Wait-Invio; exit 0 }
        $Zip = $lista[[int]$n - 1]
    }
    $Zip = $Zip.Trim('" ')
    if (-not (Test-Path -LiteralPath $Zip)) { throw "File non trovato: $Zip" }
    $cifrato = $Zip -like '*.docmap-backup'
    # copia di lavoro nella cartella backup (solo amministratori): il backup fatto prima del ripristino potrebbe togliere
    # proprio il file scelto (regola degli ultimi 30). Il nome "_ripristino-..." non viene mai preso per un backup.
    New-Item -ItemType Directory -Path $p.Backup -Force | Out-Null
    $work = Join-Path $p.Backup ('_ripristino-' + (Get-Timestamp) + [IO.Path]::GetExtension($Zip))
    Copy-Item -LiteralPath $Zip -Destination $work
    $Zip = $work

    Write-Info "Controllo il backup (se e cifrato lo decifro in una cartella temporanea)..."
    $tentativi = 0
    while ($true) {
        $code = Invoke-Tools @('verifica-zip', $Zip) -Cattura
        if ($code -eq 0) { break }
        if ($code -eq 3 -and $cifrato -and $tentativi -lt 3) {
            if ($tentativi -eq 0) {
                Write-Info 'Questo backup e cifrato con una passphrase diversa da quella salvata su questo PC.'
                Write-Info 'La trovi sul foglio del Kit di emergenza (riquadro 2, "Passphrase dei backup").'
            } else { Write-Errore 'Passphrase sbagliata.' }
            $pp = Read-Segreto 'Passphrase dei backup (Invio = annulla)'
            if ([string]::IsNullOrWhiteSpace($pp)) { Write-Info 'Annullato: nulla e stato cambiato.'; Wait-Invio; exit 0 }
            $env:DOCMAP_PASSPHRASE = $pp
            $tentativi++
            continue
        }
        if ($code -eq 3) { throw 'Passphrase dei backup sbagliata: nulla e stato cambiato.' }
        throw ('Backup non valido: ' + ($script:UltimoOutput -join ' '))
    }
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
        if ($res.passphrase_aggiunta) { Write-Info 'La passphrase di questo backup e stata salvata su questo PC (per aprire gli altri backup dello stesso periodo).' }
    }
    if (Test-DocMapPing 60) { Write-Ok 'Ripristino completato: il server risponde.' }
    else { Write-Errore ('Il server non risponde dopo il ripristino: ' + ($script:UltimoOutput -join ' ')); Write-Info "Registro: $($p.Log)\server.log" }
    if ($res -and $res.config_ripristinata) {
        Write-Avviso 'La chiave del database e cambiata: crea e stampa un nuovo Kit di emergenza (kit-emergenza.ps1).'
    }
    Write-Info 'Su ogni PC/telefono: apri DocMap e attendi "Online - sincronizzato".'
    Wait-Invio
    exit 0
} catch {
    Write-Errore $_.Exception.Message
    Wait-Invio
    exit 1
} finally {
    Remove-Item Env:DOCMAP_PASSPHRASE -ErrorAction SilentlyContinue
    if ($work -and (Test-Path -LiteralPath $work)) { Remove-Item -LiteralPath $work -Force -ErrorAction SilentlyContinue }
}
