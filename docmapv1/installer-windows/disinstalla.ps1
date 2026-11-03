# DocMap - disinstallazione: toglie le attività pianificate, le regole del firewall e (se vuoi) la fiducia nel
# certificato dello studio su questo PC. NON cancella mai dati, configurazione, backup né programma: dice dove sono.
[CmdletBinding()]
param([switch]$NonChiedere)

. "$PSScriptRoot\comune.ps1"
if (-not (Test-Admin)) { Invoke-ComeAmministratore $PSCommandPath $PSBoundParameters; exit }

$p = Get-DocMapPaths
try {
    Write-Titolo 'Disinstallazione di DocMap'
    Write-Info 'Il server smettera di funzionare per tutti i dispositivi dello studio.'
    if (-not $NonChiedere -and -not (Read-SiNo 'Continuare?' $false)) { Write-Info 'Annullato.'; Wait-Invio; exit 0 }

    if (Get-ScheduledTask -TaskName $script:TaskServer -ErrorAction SilentlyContinue) {
        Write-Info 'Faccio un ultimo backup...'
        if (Test-Path -LiteralPath $p.VenvPython) { [void](Invoke-Tools @('backup') -Cattura) }
        Stop-DocMapServer
    }
    foreach ($t in @($script:TaskServer, $script:TaskBackup, $script:TaskSync)) {
        if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $t -Confirm:$false
            Write-Ok "Attivita '$t' tolta."
        }
    }
    Get-NetFirewallRule -Group $script:FirewallGroup -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Ok 'Regole del firewall DocMap tolte.'

    if (Test-Path -LiteralPath $p.CaCert) {
        $thumb = (New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($p.CaCert)).Thumbprint
        $inStore = Get-ChildItem -Path 'Cert:\LocalMachine\Root' | Where-Object { $_.Thumbprint -eq $thumb }
        if ($inStore -and ($NonChiedere -or (Read-SiNo 'Togliere anche il certificato dello studio dai certificati attendibili di questo PC?' $true))) {
            $inStore | Remove-Item
            Write-Ok 'Certificato dello studio tolto da questo PC (telefoni e altri PC: toglierlo a mano, vedi la guida).'
        }
    }

    Write-Host ''
    Write-Ok 'Fatto. NESSUN dato e stato cancellato:'
    Write-Info "  Database:        $($p.Dati)\docmap.sqlite"
    Write-Info "  Configurazione:  $($p.Config)   (contiene la chiave: senza, il database non si legge)"
    Write-Info "  Backup:          $($p.Backup)"
    Write-Info "  Programma:       $($p.Base)"
    Write-Info 'Per reinstallare: installa.bat (ritrova dati e configurazione). Per eliminare tutto: cancella a mano'
    Write-Info "la cartella $($p.Base) DOPO aver conservato una copia di config e backup."
    Wait-Invio
    exit 0
} catch {
    Write-Errore $_.Exception.Message
    Wait-Invio
    exit 1
}
