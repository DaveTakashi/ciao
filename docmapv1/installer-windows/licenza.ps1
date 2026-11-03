# DocMap - licenza: installa un file .docmap-licence (prima licenza o RINNOVO) o mostra lo stato.
# Uso: powershell -ExecutionPolicy Bypass -File C:\DocMap\strumenti\licenza.ps1 -File "C:\Users\...\studio-rossi.docmap-licence"
#      powershell -ExecutionPolicy Bypass -File C:\DocMap\strumenti\licenza.ps1            (solo stato)
#      ... -File <file> -Attiva   (dopo l'installazione attiva anche il controllo: "licence_required": true)
# Rinnovo: Dave emette il nuovo file dal hub (licence renew), lo porta o lo manda per email; qui si installa con -File.
# La licenza precedente resta in C:\DocMap\dati\licence\licence.prev.docmap-licence. Il server la vede subito.
# Una licenza firmata con una chiave che il server non conosce viene rifiutata e quella attuale resta (le chiavi
# fidate sono in C:\DocMap\server\docmap_server\trusted_keys.json, messe dal pacchetto personale del hub).
# Equivale a:  cd C:\DocMap\server
#              C:\DocMap\venv\Scripts\python.exe -m docmap_server licence install <file> --config C:\DocMap\config\config.json
[CmdletBinding()]
param([string]$File = '', [switch]$Attiva)

. "$PSScriptRoot\comune.ps1"
if (-not (Test-Admin)) { Invoke-ComeAmministratore $PSCommandPath $PSBoundParameters; exit }

$p = Get-DocMapPaths
$old = Get-Location
try {
    Write-Titolo 'Licenza di DocMap'
    if (-not (Test-Path -LiteralPath $p.VenvPython)) { throw 'DocMap non è installato in questo PC.' }
    Set-Location -LiteralPath $p.Server
    if ($File) {
        if (-not (Test-Path -LiteralPath $File)) { throw "File non trovato: $File" }
        $code = Invoke-Native $p.VenvPython @('-m', 'docmap_server', 'licence', 'install', (Resolve-Path -LiteralPath $File).Path, '--config', $p.Config)
    } else {
        $code = Invoke-Native $p.VenvPython @('-m', 'docmap_server', 'licence', 'status', '--config', $p.Config)
    }
    if ($code -ne 0) { throw "Comando non riuscito (codice $code)." }
    if ($File -and $Attiva) {
        if ((Invoke-Tools @('abilita-licenza') -Cattura) -ne 0) { throw ('licence_required non attivato: ' + ($script:UltimoOutput -join ' ')) }
        Write-Ok 'Controllo della licenza attivo (licence_required).'
    }
    Write-Info 'Il server vede la licenza nuova da solo, senza riavvio.'
    Wait-Invio
    exit 0
} catch {
    Write-Errore $_.Exception.Message
    Wait-Invio
    exit 1
} finally {
    Set-Location $old
}
