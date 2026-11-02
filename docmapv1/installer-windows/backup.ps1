# DocMap - backup del database (copia coerente anche a server acceso) + configurazione.
# Crea C:\DocMap\backup\docmap_AAAAMMGG_HHMM.zip, tiene gli ultimi 30 (backup_da_tenere in impostazioni.json) e,
# se "seconda_destinazione" è impostata (chiavetta USB, NAS), ne mette una copia anche lì.
# Lo lancia ogni giorno l'attività pianificata "DocMap Backup"; si può anche avviare a mano (tasto destro > Esegui con PowerShell).
[CmdletBinding()]
param([switch]$Silenzioso)

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

if (-not (Test-Path -LiteralPath $p.VenvPython)) { Write-Log 'ERRORE: DocMap non è installato (manca il Python del server).'; Wait-Invio; exit 2 }

if (-not $Silenzioso) { Write-Titolo 'Backup di DocMap' }
$code = Invoke-Tools @('backup') -Cattura
$out = ($script:UltimoOutput -join "`n")
$r = $null
if ($code -eq 0) {
    try { $r = $out | ConvertFrom-Json; Write-Log ("OK " + $r.zip + " (" + [math]::Round($r.byte / 1KB) + " KB)") } catch { Write-Log "OK $out" }
    if ($r -and $r.seconda) { Write-Log ("Copia anche in " + $r.seconda) }
    if ($r -and $r.tolti -and @($r.tolti).Count -gt 0) { Write-Log ("Tolti i backup piu vecchi: " + (@($r.tolti) -join ', ')) }
} elseif ($code -eq 4) {
    Write-Log "Backup fatto, ma la copia nella seconda destinazione NON è riuscita (chiavetta/NAS non collegati?). $out"
} else {
    Write-Log "ERRORE backup (codice $code): $out"
}
Wait-Invio
exit $code
