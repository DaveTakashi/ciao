# DocMap - Kit di emergenza: per non perdere MAI la chiave del database.
# Uso: tasto destro > "Esegui con PowerShell" (crea un kit nuovo), oppure
#      powershell -ExecutionPolicy Bypass -File kit-emergenza.ps1                     crea il kit
#      powershell -ExecutionPolicy Bypass -File kit-emergenza.ps1 -Recupera [-Kit E:\DocMap-kit-....docmap-key] [-Sostituisci]
# Il kit sono due cose:
#   - un file .docmap-key: configurazione (chiave del database, codici di accesso) + passphrase dei backup, cifrati con un
#     codice di recupero. È cifrato: se ne tengono copie su chiavetta, NAS, email a se stessi;
#   - una pagina da STAMPARE con il codice di recupero e la passphrase dei backup: va in cassaforte.
# Con -Recupera ricostruisce C:\DocMap\config\config.json dal file + codice (PC nuovo, configurazione persa o cambiata).
[CmdletBinding()]
param([switch]$Recupera, [string]$Kit = '', [switch]$Sostituisci)

. "$PSScriptRoot\comune.ps1"
if (-not (Test-Admin)) { Invoke-ComeAmministratore $PSCommandPath $PSBoundParameters; exit }

$p = Get-DocMapPaths
try {
    if (-not (Test-Path -LiteralPath $p.VenvPython)) { throw 'DocMap non è installato in questo PC: prima installa.bat.' }
    if ($Recupera) {
        Write-Titolo 'Recupero della chiave dal Kit di emergenza'
        Write-Info 'Serve: il file .docmap-key (chiavetta, NAS, email) e il codice di recupero scritto sul foglio stampato.'
        $giaAttivo = [bool](Get-ScheduledTask -TaskName $script:TaskServer -ErrorAction SilentlyContinue)
        if ($giaAttivo) { Write-Info 'Fermo il server...'; Stop-DocMapServer }
        try {
            if ($Sostituisci) { $ok = Invoke-RecuperoKit $Kit -Sostituisci } else { $ok = Invoke-RecuperoKit $Kit }
        } finally {
            if ($giaAttivo) { Write-Info 'Riavvio il server...'; Start-DocMapServer }
        }
        if (-not $ok) { throw 'Recupero non riuscito.' }
        if ($giaAttivo) {
            if (Test-DocMapPing 60) { Write-Ok 'Il server risponde con la chiave recuperata.' }
            else { Write-Errore ('Il server non risponde: ' + ($script:UltimoOutput -join ' ')); Write-Info "Registro: $($p.Log)\server.log" }
        }
        Write-Info 'Consiglio: fai subito un backup (backup.ps1) e controlla che DocMap mostri i dati.'
    } else {
        Write-Titolo 'Kit di emergenza di DocMap'
        Write-Info 'Senza la chiave (config.json) il database e i backup NON si possono leggere da nessuno, nemmeno da noi.'
        Write-Info 'Il kit serve a non perderla mai: un file cifrato da copiare e un foglio da stampare.'
        Write-Info 'Rifallo se cambi la passphrase dei backup o se un backup/recupero cambia la chiave (il backup giornaliero lo ricorda nel registro).'
        $k = New-KitEmergenza
        if (-not $k) { throw 'Kit non creato.' }
        Write-Host ''
        if (Read-SiNo 'Hai stampato la pagina? La tolgo dal PC (il file .docmap-key resta)' $false) {
            Remove-Item -LiteralPath $k.pagina -Force -ErrorAction SilentlyContinue
            Write-Ok 'Pagina tolta dal PC.'
        } else {
            Write-Avviso "Ricordati di stamparla e poi di eliminarla: $($k.pagina)"
        }
    }
    Wait-Invio
    exit 0
} catch {
    Write-Errore $_.Exception.Message
    Wait-Invio
    exit 1
}
