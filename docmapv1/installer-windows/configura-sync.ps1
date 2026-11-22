# DocMap - sincronizzazione automatica tra il sito web e il server dello studio (ponte sync-remote).
# Uso (come amministratore):
#   powershell -ExecutionPolicy Bypass -File C:\DocMap\strumenti\configura-sync.ps1
#   powershell -ExecutionPolicy Bypass -File C:\DocMap\strumenti\configura-sync.ps1 -TokenFile E:\token-ponte.txt
#   ... -Ogni 15            (minuti tra una sincronizzazione e l'altra, predefinito 10)
#   ... -Disattiva          (toglie l'attivita automatica; profilo e stato restano)
# Cosa fa:
#   1. legge il modello C:\DocMap\sync\sync-profile.template.json (lo mette installa.ps1 dal pacchetto personale del cliente:
#      contiene solo l'indirizzo del sito, nessun codice);
#   2. chiede il token del sito web (utente ponte-sync, ruolo Puo modificare) oppure lo legge da -TokenFile, senza mai
#      passarlo sulla riga di comando;
#   3. crea sul server dello studio un codice di accesso "ponte-sync" e scrive C:\DocMap\sync\sync-profile.json
#      (cartella accessibile solo ad amministratori e SYSTEM) e sincronizza.bat;
#   4. fa una PROVA senza modifiche (--dry-run) e mostra il riepilogo;
#   5. crea l'attivita pianificata "DocMap Sync Web-Locale" (ogni 10 minuti, come SYSTEM).
# Rieseguirlo = cambiare token o indirizzo (lo stato della sincronizzazione resta se il sito e lo stesso).
# Guida completa: GUIDA-SYNC-WEB-LOCALE.md.
[CmdletBinding()]
param(
    [string]$TokenFile = '',
    [string]$Modello = '',
    [int]$Ogni = 10,
    [switch]$Disattiva,
    [switch]$NonChiedere
)

. "$PSScriptRoot\comune.ps1"
if (-not (Test-Admin)) { Invoke-ComeAmministratore $PSCommandPath $PSBoundParameters; exit }

$p = Get-DocMapPaths
try {
    Write-Titolo 'Sincronizzazione sito web <-> server dello studio'
    if (-not (Test-Path -LiteralPath $p.VenvPython) -or -not (Test-Path -LiteralPath $p.Config)) {
        throw 'DocMap non e installato in questo PC: prima installa.bat.'
    }
    if ($Disattiva) {
        if (Get-ScheduledTask -TaskName $script:TaskSync -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $script:TaskSync -Confirm:$false
            Write-Ok "Attivita '$($script:TaskSync)' tolta. Profilo e stato restano in $($p.Sync)."
        } else { Write-Info 'Nessuna attivita di sincronizzazione da togliere.' }
        Wait-Invio
        exit 0
    }
    if ($Ogni -lt 5) { $Ogni = 5 }
    if (-not (Invoke-ConfiguraSync -tokenFile $TokenFile -modello $Modello -minuti $Ogni -NonChiedere:$NonChiedere)) {
        throw 'Sincronizzazione non configurata.'
    }
    Wait-Invio
    exit 0
} catch {
    Write-Errore $_.Exception.Message
    Wait-Invio
    exit 1
}
