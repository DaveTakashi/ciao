# DocMap - backup CIFRATO del database (copia coerente anche a server acceso) + configurazione.
# Crea C:\DocMap\backup\docmap_AAAAMMGG_HHMM.docmap-backup (AES-256-GCM, passphrase in C:\DocMap\config\backup-passphrase.txt),
# tiene gli ultimi 30 (backup_da_tenere in impostazioni.json) e, se "seconda_destinazione" è impostata (chiavetta USB, NAS),
# ne mette una copia anche lì. Una volta alla settimana apre l'ultimo backup e lo controlla (verifica-backup): il risultato
# va in C:\DocMap\log\backup.log (righe "VERIFICA OK" / "VERIFICA NON RIUSCITA").
# Lo lancia ogni giorno l'attività pianificata "DocMap Backup"; si può anche avviare a mano (tasto destro > Esegui con PowerShell).
#   -Verifica   controlla l'ultimo backup subito (anche se la verifica settimanale è già stata fatta)
[CmdletBinding()]
param([switch]$Silenzioso, [switch]$Verifica)

. "$PSScriptRoot\comune.ps1"
$script:Silenzioso = [bool]$Silenzioso

if (-not $Silenzioso -and -not (Test-Admin)) { Invoke-ComeAmministratore $PSCommandPath $PSBoundParameters; exit }

$p = Get-DocMapPaths
New-Item -ItemType Directory -Path $p.Log -Force | Out-Null
$logFile = Join-Path $p.Log 'backup.log'

function Write-Log([string]$t) {
    $riga = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + ' ' + $t
    Add-Content -LiteralPath $logFile -Value $riga -Encoding UTF8
    if (-not $Silenzioso) { Write-Info $t }
}

function ConvertFrom-UltimoJson {
    # stdout (JSON) e stderr arrivano mescolati: si tengono solo le righe del JSON
    $righe = @($script:UltimoOutput | Where-Object { $_ -notmatch '^Errore' -and $_ -notmatch '^Copia nella seconda' })
    try { return (($righe -join "`n") | ConvertFrom-Json) } catch { return $null }
}

if (-not (Test-Path -LiteralPath $p.VenvPython)) { Write-Log 'ERRORE: DocMap non è installato (manca il Python del server).'; Wait-Invio; exit 2 }

if (-not $Silenzioso) { Write-Titolo 'Backup di DocMap (cifrato)' }
$code = Invoke-Tools @('backup') -Cattura
$out = ($script:UltimoOutput -join "`n")
$r = $null
if ($code -eq 0 -or $code -eq 4) {
    $r = ConvertFrom-UltimoJson
    if ($r) { Write-Log ("OK " + $r.file + " (" + [math]::Round($r.byte / 1KB) + " KB, cifrato)") } else { Write-Log "OK $out" }
    if ($r -and $r.seconda) { Write-Log ("Copia anche in " + $r.seconda) }
    if ($r -and $r.tolti -and @($r.tolti).Count -gt 0) { Write-Log ("Tolti i backup piu vecchi: " + (@($r.tolti) -join ', ')) }
    if ($r -and $r.passphrase_creata) {
        Write-Log ("Creata la passphrase dei backup (" + $p.ConfigDir + "\backup-passphrase.txt, impronta " + $r.impronta_passphrase + ").")
    }
    if ($r -and $r.kit -ne 'ok') {
        Write-Log ("ATTENZIONE: Kit di emergenza " + $r.kit + ": esegui C:\DocMap\strumenti\kit-emergenza.ps1 e stampa la pagina (senza la passphrase i backup non si aprono su un altro PC).")
    }
    if ($code -eq 4) { Write-Log "Backup fatto, ma la copia nella seconda destinazione NON è riuscita (chiavetta/NAS non collegati?). $out" }

    # verifica: una volta alla settimana (o subito con -Verifica) si apre l'ultimo backup e si controlla davvero
    if ($Verifica) { $vcode = Invoke-Tools @('verifica-backup') -Cattura }
    else { $vcode = Invoke-Tools @('verifica-backup', '--se-scaduta', '7') -Cattura }
    $vout = ($script:UltimoOutput -join "`n")
    $v = ConvertFrom-UltimoJson
    if ($vcode -eq 0 -and $v -and $v.saltata) {
        if (-not $Silenzioso) { Write-Info ("Verifica settimanale: l'ultima riuscita e del " + $v.ultima + '.') }
    } elseif ($vcode -eq 0 -and $v) {
        $tipi = @()
        foreach ($pr in $v.record_per_tipo.PSObject.Properties) { $tipi += ($pr.Name + ' ' + $pr.Value) }
        Write-Log ("VERIFICA OK " + (Split-Path -Leaf $v.file) + " (backup del " + $v.creato + "): integrita ok, chiave " + $v.chiave +
                   ", record letti e decifrati " + $v.record_letti + "; record per tipo: " + ($tipi -join ', '))
        if ($v.chiave_uguale_a_quella_attuale -eq $false) {
            Write-Log 'ATTENZIONE: la chiave nel backup e diversa da quella attuale (il backup e di prima di un cambio di chiave?).'
        }
    } else {
        Write-Log ("VERIFICA NON RIUSCITA (codice $vcode): " + $vout)
        if ($code -eq 0) { $code = 6 }
    }
} else {
    Write-Log "ERRORE backup (codice $code): $out"
}
Wait-Invio
exit $code
