<?php
/* DocMap 2026 — one-time set-up of the shared online database (v10.1).
   Open https://<site>/<base>/server-php/setup.php ONCE (with the SiteGround password protection already active):
   it creates the data folder, a random AES-256 key and the access tokens, writes config.php and then disables
   itself (it refuses to run while config.php exists, and renames itself to setup.php.disabled when it can).
   Tokens are shown ONLY on this page: config.php keeps their SHA-256. */
declare(strict_types=1);
ini_set('display_errors', '0');
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

$CFG = __DIR__ . '/config.php';
function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function page(string $title, string $body, int $code = 200): void {
  http_response_code($code);
  echo '<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>DocMap — ' . h($title) . '</title>',
    '<style>body{font-family:system-ui,sans-serif;background:#F1F5F9;color:#0F172A;margin:0;padding:16px}main{max-width:760px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:20px}',
    'h1{font-size:22px;margin:0 0 12px}label{display:block;font-weight:600;margin:12px 0 4px}input,textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid #CBD5E1;border-radius:8px;font:inherit}',
    'textarea{font-family:ui-monospace,monospace}button{margin-top:16px;padding:10px 18px;border:0;border-radius:10px;background:#2563EB;color:#fff;font-weight:700;font-size:15px}',
    '.warn{background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:10px;margin:12px 0}.err{background:#FEE2E2;border:1px solid #FECACA;border-radius:10px;padding:10px;margin:12px 0}',
    'table{border-collapse:collapse;width:100%;margin-top:10px}td,th{border:1px solid #E2E8F0;padding:6px;text-align:left;font-size:14px}code,.tok{font-family:ui-monospace,monospace;word-break:break-all}small{color:#64748B}</style></head><body><main>',
    '<h1>' . h($title) . '</h1>' . $body . '</main></body></html>';
}

if (is_file($CFG)) { page('Configurazione già fatta', '<p>Il file <code>config.php</code> esiste già: questa pagina è disattivata. Per ricominciare da capo eliminare <code>config.php</code> dal server (solo se il database è vuoto o si conserva la chiave).</p>', 403); exit; }

$checks = [];
if (PHP_VERSION_ID < 80000) $checks[] = 'Serve PHP 8.0 o più recente (attuale ' . PHP_VERSION . ').';
if (!extension_loaded('pdo_sqlite')) $checks[] = 'Manca l\'estensione PHP pdo_sqlite.';
if (!function_exists('openssl_encrypt') || !in_array('aes-256-gcm', openssl_get_cipher_methods(), true)) $checks[] = 'Manca OpenSSL con aes-256-gcm.';
if (!is_writable(__DIR__)) $checks[] = 'La cartella server-php non è scrivibile (serve per creare config.php).';
if ($checks) { page('Requisiti mancanti', '<div class="err">' . implode('<br>', array_map('h', $checks)) . '</div>', 500); exit; }

$docroot = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/');
$defDir = $docroot !== '' ? dirname($docroot) . '/docmap-data' : __DIR__ . '/data';
$https = (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

/* v12.4: an existing database is NEVER paired with a new key. This happens when the app folder was deleted and uploaded
   again (config.php, which is not in the zip, went with it): a new aes_key could not read the old data. */
function existing_db(string $dir): string { foreach (['docmap.sqlite', 'docmap.sqlite-wal'] as $f) if (is_file(rtrim($dir, '/\\') . '/' . $f)) return rtrim($dir, '/\\') . '/' . $f; return ''; }
function existing_db_page(string $file): void {
  page('C\'è già un database: non creo una chiave nuova',
    '<div class="err">Nella cartella scelta c\'è già il database di DocMap (<code>' . h($file) . '</code>). Una chiave nuova non potrebbe leggerlo.</div>' .
    '<p><b>Di solito è successo questo:</b> la cartella dell\'app è stata cancellata e caricata di nuovo, e con lei è sparito <code>server-php/config.php</code> (non è nello zip).</p>' .
    '<ol><li>Recupera <code>config.php</code> dal backup di SiteGround (Site Tools › Sicurezza › Backup › ripristino di file) o dalla copia che hai scaricato alla prima installazione.</li>' .
    '<li>Rimettilo in <code>' . h(__DIR__) . '/</code>: i dati tornano subito, con gli stessi codici di accesso.</li>' .
    '<li>Solo se vuoi davvero ricominciare da zero (i dati vecchi diventano illeggibili): rinomina o sposta i file <code>docmap.sqlite*</code> di quella cartella e ricarica questa pagina.</li></ol>' .
    '<p>Per i prossimi aggiornamenti: carica i file <b>sopra</b> quelli vecchi, senza cancellare la cartella (guida <code>docs/AGGIORNARE-IL-SERVER.md</code>).</p>', 409);
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
  if (($ex = existing_db($defDir)) !== '' || ($ex = existing_db(__DIR__ . '/data')) !== '') { existing_db_page($ex); exit; }
  page('Configura il database online di DocMap',
    ($https ? '' : '<div class="warn">La pagina non è in HTTPS: attiva il certificato SSL prima di continuare (i token viaggerebbero in chiaro).</div>') .
    '<div class="warn">Questa pagina genera la chiave del database e i codici di accesso <b>una sola volta</b>, poi si disattiva. Alla fine scarica la copia di <code>config.php</code> e conservala: senza quella chiave i dati non si leggono.</div>' .
    '<form method="post" autocomplete="off">' .
    '<label for="data_dir">Cartella del database (meglio <b>fuori</b> da public_html)</label><input id="data_dir" name="data_dir" value="' . h($defDir) . '">' .
    '<small>Proposta: la cartella accanto a public_html. Se scegli una cartella dentro il sito, usa <code>' . h(__DIR__ . '/data') . '</code>, già protetta dal suo .htaccess.</small>' .
    '<label for="studio">Nome dello studio (facoltativo)</label><input id="studio" name="studio_name" value="">' .
    '<label for="users">Persone che useranno DocMap: una per riga, <code>nome,ruolo</code> (ruolo: admin, editor, viewer)</label>' .
    '<textarea id="users" name="users" rows="6">davide,admin' . "\n" . 'dipendente1,editor' . "\n" . 'dipendente2,editor</textarea>' .
    '<small>Ogni persona riceve il suo codice di accesso (token). Altri token si creano poi dall\'app (amministratore).</small>' .
    '<label><input type="checkbox" name="allow_file" value="1" checked style="width:auto"> Consenti la sincronizzazione dal programma sul PC (aperto da file://)</label>' .
    '<button type="submit">Genera chiave e token</button></form>');
  exit;
}

$dir = rtrim(trim((string)($_POST['data_dir'] ?? '')), '/\\');
$err = [];
if ($dir === '' || !preg_match('#^(/|[A-Za-z]:[\\\\/])#', $dir) || strpos($dir, '..') !== false) $err[] = 'La cartella del database deve essere un percorso assoluto (senza "..").';
$users = [];
foreach (preg_split('/\r\n|\r|\n/', (string)($_POST['users'] ?? '')) as $line) {
  $line = trim($line); if ($line === '') continue;
  $p = array_map('trim', explode(',', $line));
  $name = $p[0]; $role = strtolower($p[1] ?? 'editor');
  if (!preg_match('/^[\p{L}\p{N} ._@-]{1,60}$/u', $name) || !in_array($role, ['viewer', 'editor', 'admin'], true)) { $err[] = 'Riga non valida: ' . $line; continue; }
  $users[] = [$name, $role];
}
if (!array_filter($users, fn($u) => $u[1] === 'admin')) $err[] = 'Serve almeno una persona con ruolo admin.';
if (!$err && ($ex = existing_db($dir)) !== '') { existing_db_page($ex); exit; }
if (!$err && !is_dir($dir) && !@mkdir($dir, 0700, true)) $err[] = 'Impossibile creare la cartella ' . $dir . '.';
if (!$err && !is_writable($dir)) $err[] = 'La cartella ' . $dir . ' non è scrivibile.';
if ($err) { page('Correggi e riprova', '<div class="err">' . implode('<br>', array_map('h', $err)) . '</div><p><a href="setup.php">Indietro</a></p>', 422); exit; }

// defence in depth: even outside public_html the folder refuses web access
if (!is_file($dir . '/.htaccess')) @file_put_contents($dir . '/.htaccess', "Require all denied\nOptions -Indexes\n");
if (!is_file($dir . '/index.html')) @file_put_contents($dir . '/index.html', "<!DOCTYPE html><title>403</title>\n");

$tokens = []; $shown = [];
foreach ($users as [$name, $role]) {
  $tok = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
  $tokens[] = ['user' => $name, 'role' => $role, 'token_sha256' => hash('sha256', $tok)];
  $shown[] = [$name, $role, $tok];
}
$cfg = ['data_dir' => $dir, 'aes_key' => base64_encode(random_bytes(32)), 'tokens' => $tokens,
  'allowed_origins' => !empty($_POST['allow_file']) ? ['null'] : [], 'max_fails' => 5, 'lock_seconds' => 60, 'max_body_mb' => 20,
  'studio_name' => substr(trim((string)($_POST['studio_name'] ?? '')), 0, 120)];
// v12.6: a site built by DocMap Hub carries the hub's public key (trusted_keys.json): then the licence is checked
// (expired beyond grace / suspended / revoked → read-only, data never locked). Hand-made sites stay as before.
if (is_file(__DIR__ . '/trusted_keys.json')) $cfg['licence_required'] = true;
$php = "<?php\n/* DocMap 2026 — generated by setup.php on " . gmdate('Y-m-d H:i:s') . " UTC. KEEP A COPY IN A SAFE PLACE:\n" .
  "   without aes_key the database (and its backups) cannot be read. Never publish or e-mail this file. */\n" .
  "if (!defined('DOCMAP_API')) { http_response_code(404); exit; }\nreturn " . var_export($cfg, true) . ";\n";
$tmp = $CFG . '.tmp-' . bin2hex(random_bytes(4));
$okw = @file_put_contents($tmp, $php, LOCK_EX) !== false;
if ($okw) @chmod($tmp, 0600);
if (!$okw || !@rename($tmp, $CFG)) { page('Errore', '<div class="err">Impossibile scrivere config.php nella cartella server-php.</div>', 500); exit; }
@chmod($CFG, 0600);
$disabled = @rename(__FILE__, __FILE__ . '.disabled');

$base = preg_replace('#/server-php/setup\.php.*$#', '/', (string)($_SERVER['REQUEST_URI'] ?? '/'));
page('Fatto: database online configurato',
  '<div class="warn"><b>Copia adesso i codici di accesso</b>: non verranno più mostrati (sul server resta solo la loro impronta SHA-256). Consegna a ogni persona solo il suo.</div>' .
  '<table id="tokens"><tr><th>Persona</th><th>Ruolo</th><th>Codice di accesso (token)</th></tr>' .
  implode('', array_map(fn($r) => '<tr data-user="' . h($r[0]) . '" data-role="' . h($r[1]) . '"><td>' . h($r[0]) . '</td><td>' . h($r[1]) . '</td><td class="tok">' . h($r[2]) . '</td></tr>', $shown)) . '</table>' .
  '<p>Database: <code>' . h($dir) . '/docmap.sqlite</code> (creato al primo uso). Chiave AES-256 e token salvati in <code>server-php/config.php</code>: <b>scaricane una copia</b> e conservala al sicuro (non nella cartella del sito).</p>' .
  '<p><a id="cfg-dl" download="config.php" href="data:application/octet-stream;base64,' . base64_encode($php) . '" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#0F172A;color:#fff;font-weight:700;text-decoration:none">Scarica la copia di config.php</a></p>' .
  '<p>Questa pagina ' . ($disabled ? 'è stata rinominata in <code>setup.php.disabled</code> e ' : '') . 'non funziona più finché esiste config.php.</p>' .
  '<p>Prossimo passo: apri <a href="' . h($base) . '">l\'app</a>, crea l\'utente di questo dispositivo e incolla il tuo codice di accesso.</p>');
