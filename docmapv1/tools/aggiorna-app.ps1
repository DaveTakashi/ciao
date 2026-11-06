# DocMap - aggiorna il programma sul PC (la cartella con index.html) da uno zip nuovo, senza toccare i dati.
# Uso: doppio clic su AGGIORNA-DOCMAP.bat (cerca da solo l'ultimo docmap_v*.zip nella cartella sopra e in Download),
#      oppure trascina lo zip sopra AGGIORNA-DOCMAP.bat.  Tornare indietro: AGGIORNA-DOCMAP.bat ripristina
# I dati (faldoni, clienti, foto) stanno nel browser e restano legati al PERCORSO della cartella: per questo i file nuovi
# vanno nella STESSA cartella. Prima di sostituire, la cartella attuale viene copiata in ..\DocMap-copie\.
[CmdletBinding()]
param([string]$Pacchetto = '', [switch]$Ripristina)

$ErrorActionPreference = 'Stop'
$app = Split-Path -Parent $PSScriptRoot
$parent = Split-Path -Parent $app
$copie = Join-Path $parent 'DocMap-copie'
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'

function Write-Passo([string]$t) { Write-Host ''; Write-Host $t -ForegroundColor Cyan }
function Write-Bene([string]$t) { Write-Host ('  OK  ' + $t) -ForegroundColor Green }
function Write-Male([string]$t) { Write-Host ('  !!  ' + $t) -ForegroundColor Yellow }
function Read-Conferma([string]$domanda) {
    $r = Read-Host ($domanda + ' [S/N]')
    return ($r -match '^\s*[sSyY]')
}
function Get-AppVersion([string]$dir) {
    $f = Join-Path $dir 'assets\js\02-core.js'
    if (-not (Test-Path -LiteralPath $f)) { return $null }
    $m = Select-String -LiteralPath $f -Pattern "const APP_VERSION = '([0-9]+(\.[0-9]+)+)'" | Select-Object -First 1
    if ($m) { return $m.Matches[0].Groups[1].Value }
    return $null
}
function Find-AppFolder([string]$root) {
    foreach ($c in @($root, (Join-Path $root 'docmapv1'))) {
        if ((Test-Path -LiteralPath (Join-Path $c 'index.html')) -and (Get-AppVersion $c)) { return $c }
    }
    $sub = @(Get-ChildItem -LiteralPath $root -Directory)
    if ($sub.Count -eq 1) { return (Find-AppFolder $sub[0].FullName) }
    return $null
}
function Wait-Fine { Write-Host ''; Read-Host 'Premi Invio per chiudere' | Out-Null }

try {
    Write-Host 'DocMap - aggiornamento del programma sul PC' -ForegroundColor White
    $cur = Get-AppVersion $app
    if (-not $cur) { throw "Questa cartella non contiene DocMap: $app" }
    Write-Bene "Cartella del programma: $app (versione $cur)"

    if ($Ripristina) {
        $bk = @(Get-ChildItem -LiteralPath $copie -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
        if ($bk.Count -eq 0) { throw "Nessuna copia in $copie" }
        $last = $bk[0].FullName
        Write-Passo ("Rimetto la copia " + $bk[0].Name + ' (versione ' + (Get-AppVersion $last) + ')')
        if (-not (Read-Conferma 'Procedo?')) { Write-Host 'Annullato.'; Wait-Fine; exit 0 }
        Copy-Item -Path (Join-Path $last '*') -Destination $app -Recurse -Force
        Write-Bene ('Fatto: ora la versione è ' + (Get-AppVersion $app) + '. Riapri index.html.')
        Start-Process -FilePath (Join-Path $app 'index.html')
        Wait-Fine; exit 0
    }

    Write-Passo '1. Il pacchetto nuovo'
    if (-not $Pacchetto) {
        $dl = Join-Path $env:USERPROFILE 'Downloads'
        $cand = @(foreach ($d in @($parent, $dl)) { if (Test-Path -LiteralPath $d) { Get-ChildItem -LiteralPath $d -Filter 'docmap_v*.zip' -File } })
        $cand = @($cand | Sort-Object LastWriteTime -Descending)
        if ($cand.Count -eq 0) { throw "Nessun docmap_v*.zip trovato in $parent o in $dl. Trascina lo zip sopra AGGIORNA-DOCMAP.bat." }
        $Pacchetto = $cand[0].FullName
    }
    if (-not (Test-Path -LiteralPath $Pacchetto)) { throw "Pacchetto non trovato: $Pacchetto" }
    Write-Bene "Pacchetto: $Pacchetto"
    $tmp = Join-Path $env:TEMP ('docmap-aggiorna-' + $ts)
    if ((Get-Item -LiteralPath $Pacchetto).PSIsContainer) { $root = $Pacchetto } else { Expand-Archive -LiteralPath $Pacchetto -DestinationPath $tmp -Force; $root = $tmp }
    $new = Find-AppFolder $root
    if (-not $new) { throw 'Lo zip non contiene DocMap (manca index.html o assets\js\02-core.js).' }
    $nv = Get-AppVersion $new
    Write-Bene "Versione nuova: $nv  (attuale: $cur)"
    if ([version]$nv -lt [version]$cur) {
        Write-Male "Il pacchetto è PIÙ VECCHIO di quello installato ($nv < $cur)."
        if (-not (Read-Conferma 'Vuoi davvero tornare alla versione vecchia?')) { Write-Host 'Annullato.'; Wait-Fine; exit 0 }
    } elseif ($nv -eq $cur) {
        Write-Male 'È la stessa versione già installata.'
        if (-not (Read-Conferma 'Reinstallo comunque gli stessi file?')) { Write-Host 'Annullato.'; Wait-Fine; exit 0 }
    }

    Write-Passo '2. Prima di continuare'
    Write-Host '  - Apri DocMap e premi "Salva backup" (in alto a destra, o Impostazioni > Dati). Tieni il file da parte.'
    Write-Host '  - Se usi il server online: premi anche "Sincronizza con il server".'
    Write-Host '  - Chiudi tutte le schede di DocMap nel browser.'
    Write-Host '  I dati NON vengono toccati (sono nel browser), ma il backup serve se qualcosa va storto.'
    if (-not (Read-Conferma 'Fatto? Procedo con l''aggiornamento')) { Write-Host 'Annullato.'; Wait-Fine; exit 0 }

    Write-Passo '3. Copia della versione attuale'
    if (-not (Test-Path -LiteralPath $copie)) { New-Item -ItemType Directory -Path $copie | Out-Null }
    $bkDir = Join-Path $copie ('docmapv1-' + $cur + '-' + $ts)
    Copy-Item -LiteralPath $app -Destination $bkDir -Recurse -Force
    if ((Get-AppVersion $bkDir) -ne $cur) { throw "Copia di sicurezza non riuscita in ${bkDir}: aggiornamento annullato, nulla è cambiato." }
    Write-Bene "Copia in $bkDir"

    Write-Passo '4. File nuovi nella stessa cartella'
    try {
        Copy-Item -Path (Join-Path $new '*') -Destination $app -Recurse -Force
    } catch {
        Write-Male ('Copia non riuscita: ' + $_.Exception.Message + ' - rimetto la versione di prima.')
        Copy-Item -Path (Join-Path $bkDir '*') -Destination $app -Recurse -Force
        throw 'Aggiornamento non riuscito: è stata rimessa la versione di prima. Chiudi il browser e riprova.'
    }
    $cfgOld = Join-Path $bkDir 'docmap.config.js'
    if (Test-Path -LiteralPath $cfgOld) { Copy-Item -LiteralPath $cfgOld -Destination (Join-Path $app 'docmap.config.js') -Force; Write-Bene 'Tenuta la tua configurazione docmap.config.js' }
    $now = Get-AppVersion $app
    if ($now -ne $nv) {
        Copy-Item -Path (Join-Path $bkDir '*') -Destination $app -Recurse -Force
        throw "Dopo la copia la versione è $now invece di ${nv}: rimessa la versione di prima."
    }
    Write-Bene "Installata la versione $nv"

    Write-Passo '5. Controlla'
    Write-Host "  - Si apre DocMap: in Impostazioni > Informazioni su DocMap deve esserci $nv."
    Write-Host '  - Stesso numero di faldoni e clienti di prima.'
    Write-Host '  - Se usi il server: Sincronizzazione > "Verifica dopo l''aggiornamento" (tutte le righe verdi).'
    Write-Host '  Se qualcosa non va: AGGIORNA-DOCMAP.bat ripristina  (rimette la copia appena fatta).'
    Start-Process -FilePath (Join-Path $app 'index.html')
    if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
    Wait-Fine
    exit 0
} catch {
    Write-Host ''
    Write-Host ('ERRORE: ' + $_.Exception.Message) -ForegroundColor Red
    Wait-Fine
    exit 1
}
