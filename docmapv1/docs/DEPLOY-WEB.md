# DocMap — pubblicazione web (con database online condiviso)

> Valido per la 26.11.1 (v11.1). Il database online c'è dalla v10.1; la v11 ha aggiunto le ubicazioni (`/q/dm26L…`)
> e il registro sincronizzazioni. Prove manuali dopo il caricamento: `CHECKLIST-COLLAUDO.md` §3.

Dominio pilota: **`https://docmap.pr-it.it/studio-de/`** su hosting condiviso **SiteGround** (PHP 8 + PDO SQLite, niente
Node né Python). Dalla v10.1 il deploy contiene anche `server-php/`: un'API PHP in un solo file che salva i dati in un
database SQLite **condiviso e cifrato** (`API-CONTRACT.md`), così i telefoni dei dipendenti modificano direttamente
online. Con `--no-server` si ottiene il sito statico della v10 (dati solo nel browser di ogni dispositivo).

## 0. Database online su SiteGround (riassunto)

1. **Non** proteggere `public_html/studio-de/` con Site Tools › Sicurezza › **Directory protette** (scelta di Dave, 2026-11-02):
   i telefoni la dimenticano e chiederebbero utente e password a ogni QR. La cartella contiene solo il programma; i dati
   sono protetti da token personali, PIN o "Ricordami", cifratura e blocco dopo 5 token errati (`SICUREZZA.md` §5b).
   Se una cartella protetta esiste già, toglila dopo aver installato la v12.
2. Carica il contenuto di `deploy/studio-de/` in `public_html/studio-de/` (anche i `.htaccess`).
3. Apri `https://docmap.pr-it.it/studio-de/server-php/setup.php` **una volta**: cartella dati (proposta: fuori da
   `public_html`; dalla 26.12.7 una per sito, es. `/home/customer/www/docmap.pr-it.it/docmap-data/studio-de`), persone e ruoli → genera chiave AES-256 e
   token, scrive `config.php`, si disattiva. Copia i token (mostrati una volta) e scarica una copia di `config.php`.
4. Prova: `…/server-php/api.php?r=ping` → `{"ok":true}`; `…/server-php/config.php` e `…/server-php/data/` → 403/404.
5. Primo caricamento dal PC: ⚙ Sincronizzazione › **Server online** → indirizzo + token admin → **Sincronizza con il
   server** → conferma "Carica il mio archivio sul server (prima volta)".
6. Telefoni/browser: aprire l'app → utente + PIN del dispositivo + codice di accesso → lavorano online.
7. Backup: file `docmap.sqlite*` della cartella dati + `config.php` (senza la chiave il backup non si legge).
   Istruzioni complete e passo passo: `README-DEPLOY.md` generato nel deploy. Aggiornamenti: `AGGIORNAMENTI.md`.

## 1. Costruire la cartella da caricare

```bash
python3 docmapv1/tools/build_deploy.py                 # → deploy/studio-de/ accanto a docmapv1/
python3 docmapv1/tools/build_deploy.py OUT --base-path /altro-studio/ --slug altro-studio --studio-name "Studio …"
python3 docmapv1/tools/build_deploy.py OUT --no-server     # sito statico v10, senza server-php (apiBase null)
```

Contenuto: `index.html`, `scan.html`, `assets/`, `vendor/` (senza `tests/`, `tools/`, `docs/`) più i file generati:

| File | A cosa serve |
|---|---|
| `docmap.config.js` | `{mode:'web', basePath, apiBase:'server-php/api.php' (null con --no-server), studioSlug, studioName}`, congelato (`Object.freeze`) |
| `server-php/` | `api.php`, `setup.php`, `config.sample.php`, `.htaccess`, `data/.htaccess` + `data/index.html`. **Mai** `config.php` né un database: si creano sul server |
| `.htaccess` | Apache: `/<base>/q/<short_code>` → `scan.html` (riscrittura interna), header di sicurezza (CSP, HSTS, nosniff, no-referrer, noindex), `ErrorDocument 404` |
| `404.html` | per host senza riscritture: `/q/<code>` → `scan.html?q=<code>` |
| `robots.txt` | `Disallow: /` |
| `nginx-docmap.conf.example` | stesso comportamento per nginx |
| `README-DEPLOY.md` | istruzioni di caricamento in italiano (con server: passo passo per SiteGround, backup) |
| `DEPLOY-MANIFEST.txt` | sha256 di ogni file, per verificare il caricamento |

Il programma è deterministico e non cancella mai nulla (sovrascrive). Il percorso base si cambia con `--base-path`.

## 2. Instradamento dei QR

`https://qr7.it/dm26XXXXXXXX` → `https://docmap.pr-it.it/studio-de/q/dm26XXXXXXXX` (`DEFAULT_DEST`, modificabile in
Impostazioni; il vecchio predefinito `studiodallasta.it/docmap/?code=…&qr=…` viene sostituito solo se non era stato
cambiato). `scan.html` trova il codice, in quest'ordine: `?q=` · `?qr=` · percorso `…/q/<code>` · `#/q/<code>`;
`?code=` è il codice parlante. Quando la pagina è servita da `…/q/<code>`, uno script in testa imposta `<base>` sulla
cartella dell'app, così CSS e JS si caricano dal posto giusto (le richieste anticipate del browser verso `q/assets/…`
sono servite anche loro dalle regole del `.htaccess`).

### nginx

```nginx
location /studio-de/ {
    alias /var/www/docmap/studio-de/;
    index index.html;
    try_files $uri $uri/ =404;
    error_page 404 /studio-de/404.html;
}
location ~ ^/studio\-de/q/[A-Za-z0-9_-]{1,40}/?$ {
    default_type text/html;
    alias /var/www/docmap/studio-de/scan.html;
}
location ~ ^/studio\-de/q/((assets|vendor)/.+|docmap\.config\.js)$ {
    alias /var/www/docmap/studio-de/$1;
}
# + gli add_header di sicurezza: vedi nginx-docmap.conf.example generato
```

## 3. Primo uso su ogni dispositivo

**Con il database online (predefinito)**: aprire l'app (o scansionare un QR) → password della cartella → "Primo
accesso su questo dispositivo": nome utente e PIN *di questo dispositivo* + **codice di accesso** ricevuto
dall'amministratore. I dati arrivano dal server; ogni modifica viene inviata da sola (stato in alto: "Online ·
sincronizzato", "In attesa (N)", "Offline"). Nuovi codici: ⚙ Sincronizzazione › Server online › Codici di accesso (admin).

**Sito statico (`--no-server`)**:

1. Aprire `https://docmap.pr-it.it/studio-de/` → "Primo accesso su questo dispositivo": creare l'amministratore.
2. Importare i dati dal pacchetto esportato da DocMap sul PC (modulo sync).
3. Creare gli altri utenti in Impostazioni › Utenti e accesso (serve essere amministratore).
4. Sul telefono: scansionare un QR → login → scheda del faldone.

Ogni browser ha la **sua** cassaforte: utenti e dati non passano da un dispositivo all'altro se non con i pacchetti
(sito statico) o con il server (v10.1). Login unico con account sul server arriva con il back-end Python (`API-CONTRACT.md` §9).

## 4. Test locale del server

`php -S 127.0.0.1:8080 -t deploy docmapv1/tests/php-router.php` serve `deploy/studio-de/` come farebbe Apache (il router
applica le regole "Require all denied" dei `.htaccess`, che `php -S` ignorerebbe). La suite lo fa da sola (blocco `@@STREAM-W@@`).
