# DocMap — pubblicazione come sito statico (v10)

Dominio pilota: **`https://docmap.pr-it.it/studio-de/`**. Il server contiene **solo il programma**; i dati restano
cifrati nel browser di ogni dispositivo (`SICUREZZA.md` §3) e arrivano con il pacchetto di sincronizzazione.

## 1. Costruire la cartella da caricare

```bash
python3 docmapv1/tools/build_deploy.py                 # → deploy/studio-de/ accanto a docmapv1/
python3 docmapv1/tools/build_deploy.py OUT --base-path /altro-studio/ --slug altro-studio --studio-name "Studio …"
```

Contenuto: `index.html`, `scan.html`, `assets/`, `vendor/` (senza `tests/`, `tools/`, `docs/`) più i file generati:

| File | A cosa serve |
|---|---|
| `docmap.config.js` | `{mode:'web', basePath, apiBase:null, studioSlug, studioName}`, congelato (`Object.freeze`) |
| `.htaccess` | Apache: `/<base>/q/<short_code>` → `scan.html` (riscrittura interna), header di sicurezza (CSP, HSTS, nosniff, no-referrer, noindex), `ErrorDocument 404` |
| `404.html` | per host senza riscritture: `/q/<code>` → `scan.html?q=<code>` |
| `robots.txt` | `Disallow: /` |
| `nginx-docmap.conf.example` | stesso comportamento per nginx |
| `README-DEPLOY.md` | istruzioni di caricamento in italiano |
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

1. Aprire `https://docmap.pr-it.it/studio-de/` → "Primo accesso su questo dispositivo": creare l'amministratore.
2. Importare i dati dal pacchetto esportato da DocMap sul PC (modulo sync).
3. Creare gli altri utenti in Impostazioni › Utenti e accesso (serve essere amministratore).
4. Sul telefono: scansionare un QR → login → scheda del faldone.

Ogni browser ha la **sua** cassaforte: utenti e dati non passano da un dispositivo all'altro se non con i pacchetti.
Sincronizzazione automatica, login unico e revoca arrivano con il back-end Python (`API-CONTRACT.md`).
