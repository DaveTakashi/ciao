<?php
/* =====================================================================
   DocMap 2026 — shared online database, REST API (v12, reference implementation; v10.1 and v11 databases upgrade in place)

   One file, PHP 8.0+, no Composer: PDO SQLite + OpenSSL. Built for shared hosting (SiteGround: PHP yes,
   Node / Python no). The contract is docs/API-CONTRACT.md: a Python back-end can replace this file 1:1
   (same routes, same JSON, same status codes) without touching the front-end.

   Routes (query routed: api.php?r=<route>; reads accept GET or POST, writes POST only):
     ping                     no token   {ok, api, version, server_time}
     me                       viewer     {user, role, token_id}
     pull   &since=<seq>&log_since=<seq>  viewer   {seq, more, records[], tombstones[], settings, activity_log[], log_seq, server_time}
     push   {records, tombstones, settings?, activity_log?, deviceId, operator}   editor
                                         per-record LAST-WRITE-WINS by updated_at → {applied, same, rejected[], seq, server_time}
     binder &qr=<short_code> | &code=<speaking_code>   viewer   {binder, etag, siblings[], status_events[], status_types}
     location &qr=<dm26L…> | &id= | &code=<path code>   viewer   {location, etag, path[], children[], binders[], count, nested_binders[], nested_count, status_events[], status_types}   (v11; v12 status_*; v12.1 nested_*)
     resolve &qr=<short code>                         viewer   {type:'binder'|'location', …}: one QR, either kind (v11)
     patch  {id, patch, base_updated_at, force?, log?}  editor  → {binder, etag} · 409 {error, current, current_etag}
                                         v11: patch may carry location_id (+ location_code, recomputed here from the location)
     tokens / token_create {user, role} / token_revoke {id}   admin   (tokens kept as SHA-256 in the database)
     journal  &from&to&user&device&record&code&before&limit | &entry=<jid>   editor (own entries) / admin (all)
              v11: the push/sync journal — one entry per push / patch / pull (with changes) / restore, one item per record
     journal_restore {jid, n, version:'prev'|'new'}   admin   writes that version again as a NEW write (journaled)
     v12 access log (table access_log, schema 3): binder / location / resolve reads are recorded (who, device, when, via
     &via=qr|search|nav|nfc), plus:
     access &user&device&type&target&code&via&route&from&to&before&limit   editor (own rows) / admin (all, with IP)
     last_seen &type=binder|location&id=<record id> | &code=<code> &limit<=20   viewer   {items:[{at, user, via, route, device_name}], total}
     seen   {items:[{type, id, code, at, via}]} (max 500)   viewer   views served from the client's own copy → {recorded, skipped}
     me also returns remember_minutes (config.php: how long a phone stays signed in; null = device setting)

   v12 statuses: record type 'status_event' (append-only movements: taken, returned, given to the council…) written by push
   like any record; HMAC k_short = 'st/b|l/<target id>', k_code = 'stbox/<box id>'; ping feature 'status_events'. No schema change.

   v11 client identity (optional, v10.1 clients send nothing → 'unknown'): headers X-DocMap-Device,
   X-DocMap-Device-Name (URI-encoded), X-DocMap-App, or "_device": {id, name, app} in the JSON body.

   Auth: header X-DocMap-Token: <token> (primary — SiteGround's password protection already uses the
   Authorization header for HTTP Basic auth), or Authorization: Bearer <token>, or "_token" in a text/plain JSON
   body (desktop app from file://, which must avoid a CORS preflight). Roles viewer < editor < admin.
   Failed tokens are rate-limited per IP (table auth_fail, exponential lock, 429 + Retry-After).

   Storage (SQLite, WAL, busy_timeout, one transaction per write): every payload is encrypted at rest with
   AES-256-GCM (openssl, random 12-byte IV per write, 16-byte tag, AAD = "<table>/<type>/<id>"); look-ups by QR /
   speaking code / cabinet go through HMAC-SHA256 index columns, never plaintext. No key → the API refuses to start.
   ===================================================================== */
declare(strict_types=1);

const DM_API = 'docmap-php';
const DM_API_VERSION = 1;
const DM_APP_VERSION = '26.12.7';   // v12.4: DocMap release these server files belong to (ping 'app_version'; the app compares it with its own)
const DM_TYPES = ['binder', 'client', 'location', 'archive', 'status_event'];   // v11: + location (tree of boxes) · v12: + archive (clusters) + status_event (append-only status log); generic records, no schema change
const DM_ROLES = ['viewer' => 1, 'editor' => 2, 'admin' => 3];
const DM_MOBILE_FIELDS = ['archive_state', 'contents_items', 'room_code', 'cabinet_code', 'shelf_code', 'sector_code', 'notes', 'tags', 'location_id', 'location_code'];   // v11: + location (association mode)
const DM_LOC_SC = '/^dm26L[A-Za-z0-9]{8}$/';   // location short codes; binders are dm26 + 8 chars
const DM_CANON_SKIP = ['updated_at', 'short_url', 'location_code', 'selected_for_print'];   // same as SYNC_B_SKIP (06f-sync.js)
const DM_PULL_PAGE = 2000;
const DM_LOG_PAGE = 1000;
const DM_MAX_RECORD = 262144;   // bytes of JSON per record
const DM_SCHEMA = 3;            // server database schema: 1 = v10.1, 2 = v11 (sync_journal + sync_journal_items), 3 = v12 (access_log)
const DM_JOURNAL_PAGE = 50, DM_JOURNAL_PAGE_MAX = 200, DM_JOURNAL_ITEMS_LIST = 500;
const DM_ACCESS_VIA = ['qr', 'search', 'nav', 'nfc'];   // v12: how a binder / location was reached (access_log.via)
const DM_ACCESS_TYPES = ['binder', 'location'];
const DM_ACCESS_PAGE = 50, DM_ACCESS_PAGE_MAX = 200, DM_SEEN_MAX = 500, DM_LAST_SEEN_MAX = 20;
const DM_STATUS_PER_TARGET = 200;   // v12: newest status events returned with a binder / location

define('DOCMAP_API', true);
ini_set('display_errors', '0');
error_reporting(E_ALL);
set_error_handler(function (int $no, string $msg, string $file = '', int $line = 0) { throw new ErrorException($msg, 0, $no, $file, $line); });

final class ApiError extends Exception {
  public int $status; public string $codeName; public array $extra; public array $headers;
  public function __construct(int $status, string $code, string $message, array $extra = [], array $headers = []) {
    parent::__construct($message); $this->status = $status; $this->codeName = $code; $this->extra = $extra; $this->headers = $headers;
  }
}

function out(int $status, array $body, array $headers = []): void {
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  header('X-Content-Type-Options: nosniff');
  header('Referrer-Policy: no-referrer');
  foreach ($headers as $k => $v) header($k . ': ' . $v);
  echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
}
function fail(int $status, string $code, string $message, array $extra = [], array $headers = []): void { throw new ApiError($status, $code, $message, $extra, $headers); }

/* ---------------- time ---------------- */
function now_iso(): string { $t = microtime(true); $s = (int)floor($t); return gmdate('Y-m-d\TH:i:s', $s) . sprintf('.%03dZ', (int)floor(($t - $s) * 1000)); }
function ts_ms($iso): int {
  if (!is_string($iso) || trim($iso) === '') return 0;
  try { $d = new DateTimeImmutable($iso); return (int)$d->format('Uv'); } catch (Throwable $e) { return 0; }
}
function iso_ms(int $ms): string { return gmdate('Y-m-d\TH:i:s', intdiv($ms, 1000)) . sprintf('.%03dZ', $ms % 1000); }

/* ---------------- config ---------------- */
function load_config(): array {
  $f = __DIR__ . '/config.php';
  if (!is_file($f)) fail(500, 'config', 'config.php missing: open setup.php once (or copy config.sample.php to config.php).');
  $c = require $f;
  if (!is_array($c)) fail(500, 'config', 'config.php must return an array.');
  $c += ['data_dir' => '', 'aes_key' => '', 'tokens' => [], 'allowed_origins' => [], 'max_fails' => 5, 'lock_seconds' => 60, 'max_body_mb' => 20, 'studio_name' => '',
    'journal_keep_days' => 0, 'journal_pulls' => 'changes',   // v11 (optional in config.php): 0 = keep the whole journal; pulls: changes | all | none
    'access_keep_days' => 365, 'access_dedupe_seconds' => 120, 'remember_minutes' => null];   // v12 (optional): access log retention (0 = keep all), repeated reads merged, phone sign-in kept (null = device setting; 0 always ask, 480, 43200, -1 never expires)
  $key = base64_decode((string)$c['aes_key'], true);
  if ($key === false || strlen($key) !== 32) fail(500, 'config', 'Encryption key missing or invalid: aes_key must be 32 random bytes in base64 (setup.php creates it). The API does not run without encryption.');
  if (!in_array('aes-256-gcm', openssl_get_cipher_methods(), true)) fail(500, 'config', 'OpenSSL without aes-256-gcm.');
  if (!extension_loaded('pdo_sqlite')) fail(500, 'config', 'PHP extension pdo_sqlite missing.');
  if ($c['data_dir'] === '' || !is_dir($c['data_dir']) || !is_writable($c['data_dir'])) fail(500, 'config', 'data_dir missing or not writable (see config.php).');
  $c['_key'] = $key;
  return $c;
}

/* ---------------- crypto (AES-256-GCM at rest, HMAC index) ---------------- */
function enc(array $c, string $plain, string $aad): string {
  $iv = random_bytes(12); $tag = '';
  $ct = openssl_encrypt($plain, 'aes-256-gcm', $c['_key'], OPENSSL_RAW_DATA, $iv, $tag, $aad, 16);
  if ($ct === false) fail(500, 'crypto', 'encryption failed');
  return "\x01" . $iv . $tag . $ct;   // v1 | iv(12) | tag(16) | ciphertext
}
function dec(array $c, $blob, string $aad): string {
  if (!is_string($blob) || strlen($blob) < 29 || $blob[0] !== "\x01") fail(500, 'crypto', 'stored payload unreadable');
  $p = openssl_decrypt(substr($blob, 29), 'aes-256-gcm', $c['_key'], OPENSSL_RAW_DATA, substr($blob, 1, 12), substr($blob, 13, 16), $aad);
  if ($p === false) fail(500, 'crypto', 'stored payload does not match the key (wrong aes_key?)');
  return $p;
}
function hidx(array $c, string $v): ?string { return $v === '' ? null : substr(hash_hmac('sha256', 'docmap-idx/' . $v, $c['_key']), 0, 40); }
function jenc($v): string { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE); }

/* ---------------- database ---------------- */
function db(array $c): PDO {
  $file = rtrim($c['data_dir'], '/\\') . DIRECTORY_SEPARATOR . 'docmap.sqlite';
  $db = new PDO('sqlite:' . $file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
  $db->exec('PRAGMA busy_timeout = 8000');
  $db->exec('PRAGMA journal_mode = WAL');
  $db->exec('PRAGMA synchronous = NORMAL');
  $db->exec("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS records (type TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
      who TEXT NOT NULL DEFAULT '', payload BLOB, seq INTEGER NOT NULL DEFAULT 0, k_short TEXT, k_code TEXT, k_cab TEXT, PRIMARY KEY (type, id));
    CREATE INDEX IF NOT EXISTS records_seq ON records (seq);
    CREATE INDEX IF NOT EXISTS records_short ON records (k_short);
    CREATE INDEX IF NOT EXISTS records_code ON records (k_code);
    CREATE INDEX IF NOT EXISTS records_cab ON records (k_cab);
    CREATE TABLE IF NOT EXISTS changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL, at TEXT NOT NULL, device TEXT, who TEXT);
    CREATE TABLE IF NOT EXISTS settings_shared (key TEXT PRIMARY KEY, json BLOB, updated_at TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS activity_log (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, at TEXT, payload BLOB);
    CREATE TABLE IF NOT EXISTS auth_fail (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tokens (id TEXT PRIMARY KEY, token_sha256 TEXT NOT NULL UNIQUE, user TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT, revoked_at TEXT);");
  // the key must be the one the database was created with (a wrong key would make every payload unreadable)
  $kc = $db->query("SELECT v FROM meta WHERE k = 'key_check'")->fetchColumn();
  if ($kc === false) { $st = $db->prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('key_check', ?), ('schema', '1'), ('created_at', ?)"); $st->execute([base64_encode(enc($c, 'docmap-key-check', 'meta/key_check')), now_iso()]); }
  else {
    $b = base64_decode((string)$kc, true);
    $ok = false; try { $ok = dec($c, $b, 'meta/key_check') === 'docmap-key-check'; } catch (Throwable $e) { $ok = false; }
    if (!$ok) fail(500, 'config', 'aes_key does not match the existing database (restore the original key from your backup of config.php).');
  }
  db_migrate($db);   // v11: a v10.1 database (schema 1) is upgraded in place on the first request
  return $db;
}
/** Additive, idempotent schema upgrades (never DROP / RENAME). meta 'schema' records the level reached.
    Each step: CREATE TABLE / INDEX IF NOT EXISTS or ALTER TABLE ADD COLUMN (guarded by PRAGMA table_info). */
function db_migrate(PDO $db): void {
  $cur = (int)($db->query("SELECT v FROM meta WHERE k = 'schema'")->fetchColumn() ?: 1);
  if ($cur >= DM_SCHEMA) return;
  $steps = [
    2 => "CREATE TABLE IF NOT EXISTS sync_journal (jid INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, route TEXT NOT NULL, token_id TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT '', k_user TEXT, k_device TEXT, n_sent INTEGER NOT NULL DEFAULT 0, n_accepted INTEGER NOT NULL DEFAULT 0,
            n_rejected INTEGER NOT NULL DEFAULT 0, n_conflicts INTEGER NOT NULL DEFAULT 0, n_same INTEGER NOT NULL DEFAULT 0, n_items INTEGER NOT NULL DEFAULT 0,
            seq_from INTEGER, seq_to INTEGER, meta BLOB);
          CREATE INDEX IF NOT EXISTS sync_journal_at ON sync_journal (at);
          CREATE INDEX IF NOT EXISTS sync_journal_user ON sync_journal (k_user);
          CREATE INDEX IF NOT EXISTS sync_journal_device ON sync_journal (k_device);
          CREATE TABLE IF NOT EXISTS sync_journal_items (jid INTEGER NOT NULL, n INTEGER NOT NULL, type TEXT NOT NULL, id TEXT NOT NULL, k_code TEXT, action TEXT NOT NULL,
            client_updated_at TEXT, prev_updated_at TEXT, new_updated_at TEXT, prev_hash TEXT, new_hash TEXT, payload BLOB, PRIMARY KEY (jid, n));
          CREATE INDEX IF NOT EXISTS sync_journal_items_rec ON sync_journal_items (type, id);
          CREATE INDEX IF NOT EXISTS sync_journal_items_code ON sync_journal_items (k_code);",
    // v12: who looked at what and when (binder / location / resolve reads + "seen" reports of views served from a cache)
    3 => "CREATE TABLE IF NOT EXISTS access_log (aid INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, received_at TEXT NOT NULL, route TEXT NOT NULL,
            via TEXT NOT NULL DEFAULT '', token_id TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT '', k_user TEXT, k_device TEXT,
            target_type TEXT NOT NULL DEFAULT '', target_id TEXT NOT NULL DEFAULT '', k_code TEXT, meta BLOB);
          CREATE INDEX IF NOT EXISTS access_log_at ON access_log (at);
          CREATE INDEX IF NOT EXISTS access_log_target ON access_log (target_type, target_id, at);
          CREATE INDEX IF NOT EXISTS access_log_user ON access_log (k_user);
          CREATE INDEX IF NOT EXISTS access_log_device ON access_log (k_device);
          CREATE INDEX IF NOT EXISTS access_log_code ON access_log (k_code);",
  ];
  $db->exec('BEGIN IMMEDIATE');
  try {
    $cur = (int)($db->query("SELECT v FROM meta WHERE k = 'schema'")->fetchColumn() ?: 1);   // re-read under the lock (two first requests at once)
    foreach ($steps as $n => $sql) if ($n > $cur) { $db->exec($sql); $cur = $n; }
    $db->prepare("INSERT INTO meta (k, v) VALUES ('schema', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")->execute([(string)$cur]);
    $db->prepare("INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)")->execute(['migrated_' . $cur . '_at', now_iso()]);
    $db->exec('COMMIT');
  } catch (Throwable $e) { try { $db->exec('ROLLBACK'); } catch (Throwable $e2) {} throw $e; }
}
function max_seq(PDO $db): int { return (int)$db->query('SELECT COALESCE(MAX(seq), 0) FROM changes')->fetchColumn(); }
function max_log_seq(PDO $db): int { return (int)$db->query('SELECT COALESCE(MAX(seq), 0) FROM activity_log')->fetchColumn(); }

/* ---------------- request ---------------- */
function body(array $c): array {
  static $b = null; if ($b !== null) return $b;
  $raw = file_get_contents('php://input', false, null, 0, (int)$c['max_body_mb'] * 1048576 + 1);
  if ($raw !== false && strlen($raw) > (int)$c['max_body_mb'] * 1048576) fail(413, 'too_large', 'request too large');
  if ($raw === false || trim($raw) === '') return $b = [];
  $j = json_decode($raw, true);
  if (!is_array($j)) fail(400, 'bad_json', 'body must be a JSON object');
  return $b = $j;
}
function param(array $c, string $k, $dflt = null) { $b = body($c); return array_key_exists($k, $b) ? $b[$k] : ($_GET[$k] ?? $dflt); }

function cors(array $c): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin === '') return;
  $host = $_SERVER['HTTP_HOST'] ?? '';
  $same = $host !== '' && preg_match('#^https?://' . preg_quote($host, '#') . '$#i', $origin);
  if ($same) return;
  $allowed = array_map('strval', (array)$c['allowed_origins']);
  if (!in_array($origin, $allowed, true)) fail(403, 'origin', 'origin not allowed (allowed_origins in config.php)');
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Vary: Origin');
  header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
  header('Access-Control-Allow-Headers: Content-Type, X-DocMap-Token, Authorization, If-Match, X-DocMap-Device, X-DocMap-Device-Name, X-DocMap-App');
  header('Access-Control-Expose-Headers: ETag, Retry-After');
  header('Access-Control-Max-Age: 600');
}

/* ---------------- auth: tokens + rate limit ---------------- */
function client_ip(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? '?'); }
function auth(PDO $db, array $c, string $need): array {
  $k = 'ip:' . client_ip(); $now = time();
  $f = $db->prepare('SELECT n, until FROM auth_fail WHERE k = ?'); $f->execute([$k]); $row = $f->fetch();
  if ($row && (int)$row['until'] > $now) fail(429, 'locked', 'too many wrong tokens: retry later', ['retry_in' => (int)$row['until'] - $now], ['Retry-After' => (string)((int)$row['until'] - $now)]);
  $tok = (string)($_SERVER['HTTP_X_DOCMAP_TOKEN'] ?? '');
  if ($tok === '') { $h = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? ''); if (preg_match('/^Bearer\s+(\S+)$/i', $h, $m)) $tok = $m[1]; }
  if ($tok === '') { $bt = body($c)['_token'] ?? ''; if (is_string($bt)) $tok = $bt; }
  if ($tok === '') fail(401, 'token_missing', 'access token missing (header X-DocMap-Token)');
  $hash = hash('sha256', $tok); $who = null;
  foreach ((array)$c['tokens'] as $i => $t) {
    if (!is_array($t)) continue;
    $th = isset($t['token_sha256']) ? strtolower((string)$t['token_sha256']) : (isset($t['token']) ? hash('sha256', (string)$t['token']) : '');
    if ($th !== '' && hash_equals($th, $hash) && empty($t['disabled'])) $who = ['user' => (string)($t['user'] ?? 'user' . $i), 'role' => isset(DM_ROLES[$t['role'] ?? '']) ? $t['role'] : 'viewer', 'token_id' => 'cfg:' . $i];
  }
  if (!$who) { $q = $db->prepare('SELECT id, user, role FROM tokens WHERE token_sha256 = ? AND revoked_at IS NULL'); $q->execute([$hash]); $r = $q->fetch(); if ($r) $who = ['user' => $r['user'], 'role' => isset(DM_ROLES[$r['role']]) ? $r['role'] : 'viewer', 'token_id' => 'db:' . $r['id']]; }
  if (!$who) {
    $n = ($row ? (int)$row['n'] : 0) + 1; $max = max(1, (int)$c['max_fails']);
    $until = $n >= $max ? $now + min(900, (int)$c['lock_seconds'] * (2 ** min(10, $n - $max))) : 0;
    $db->prepare('INSERT INTO auth_fail (k, n, until, at) VALUES (?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = excluded.n, until = excluded.until, at = excluded.at')->execute([$k, $n, $until, $now]);
    error_log('docmap: wrong token from ' . client_ip());
    fail(401, 'token_invalid', 'access token not valid', ['left' => max(0, $max - $n)]);
  }
  if ($row) $db->prepare('DELETE FROM auth_fail WHERE k = ?')->execute([$k]);
  if (DM_ROLES[$who['role']] < DM_ROLES[$need]) fail(403, 'forbidden', 'role ' . $who['role'] . ' cannot do this (needs ' . $need . ')');
  return $who;
}

/* ---------------- records ---------------- */
function canon($v, bool $top = true) {
  if (is_array($v)) {
    $list = $v === [] || array_keys($v) === range(0, count($v) - 1);
    if (!$list) { ksort($v); if ($top) foreach (DM_CANON_SKIP as $s) unset($v[$s]); foreach (array_keys($v) as $k) if (is_string($k) && $k !== '' && $k[0] === '_') unset($v[$k]); }
    foreach ($v as $k => $x) $v[$k] = canon($x, false);
    return $v;
  }
  if ($v === null) return '';
  if (is_bool($v)) return $v ? 'true' : 'false';
  if (is_int($v) || is_float($v)) return (string)$v;
  return $v;
}
function valid_id($id): bool { return is_string($id) && preg_match('/^[A-Za-z0-9._:@-]{1,100}$/', $id) === 1; }
function rec_aad(string $type, string $id): string { return 'records/' . $type . '/' . $id; }
function rec_load(PDO $db, string $type, string $id): ?array { $q = $db->prepare('SELECT * FROM records WHERE type = ? AND id = ?'); $q->execute([$type, $id]); $r = $q->fetch(); return $r ?: null; }
function rec_data(array $c, array $row): array { $d = json_decode(dec($c, $row['payload'], rec_aad($row['type'], $row['id'])), true); return is_array($d) ? $d : []; }
function rec_public(array $c, array $row): array {
  $d = rec_data($c, $row);
  if ((int)$row['deleted']) return ['type' => $row['type'], 'id' => $row['id'], 'code' => (string)($d['code'] ?? ''), 'deletedAt' => $row['updated_at'], 'who' => $row['who'], 'deleted' => true];
  $d['id'] = $row['id']; $d['updated_at'] = $row['updated_at'];
  return ['type' => $row['type'], 'id' => $row['id'], 'updated_at' => $row['updated_at'], 'who' => $row['who'], 'data' => $d];
}
/** Write one record (or tombstone) and log the change. Must run inside a transaction. */
function rec_write(PDO $db, array $c, string $type, string $id, string $updated, bool $deleted, string $who, array $data, string $device): int {
  $db->prepare('INSERT INTO changes (type, id, updated_at, at, device, who) VALUES (?, ?, ?, ?, ?, ?)')->execute([$type, $id, $updated, now_iso(), $device, $who]);
  $seq = (int)$db->lastInsertId();
  $ks = $kc = $kk = null;
  if ($type === 'binder' && !$deleted) {
    $ks = hidx($c, (string)($data['short_code'] ?? ''));
    $kc = hidx($c, strtoupper(trim((string)($data['speaking_code'] ?? ''))));
    $room = (string)($data['room_code'] ?? ''); $cab = (string)($data['cabinet_code'] ?? '');
    $kk = ($room !== '' || $cab !== '') ? hidx($c, $room . "\x1f" . $cab) : null;
  } elseif ($type === 'location' && !$deleted) {   // v11: same HMAC index columns (k_short = QR, k_code = path code); type keeps them apart
    $ks = hidx($c, (string)($data['short_code'] ?? ''));
    $kc = hidx($c, strtoupper(trim((string)($data['code'] ?? ''))));
  } elseif ($type === 'status_event' && !$deleted) {   // v12: k_short = its binder (documents too) or location, k_code = the box it went through
    $ks = st_key($c, (string)($data['target_type'] ?? ''), (string)($data['target_id'] ?? ''));
    $kc = ($data['box_id'] ?? '') !== '' ? hidx($c, 'stbox/' . (string)$data['box_id']) : null;
  }
  unset($data['updated_at']);
  $st = $db->prepare('INSERT INTO records (type, id, updated_at, deleted, who, payload, seq, k_short, k_code, k_cab) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(type, id) DO UPDATE SET updated_at = excluded.updated_at, deleted = excluded.deleted, who = excluded.who, payload = excluded.payload, seq = excluded.seq,
      k_short = excluded.k_short, k_code = excluded.k_code, k_cab = excluded.k_cab');
  $st->bindValue(1, $type); $st->bindValue(2, $id); $st->bindValue(3, $updated); $st->bindValue(4, $deleted ? 1 : 0, PDO::PARAM_INT); $st->bindValue(5, $who);
  $st->bindValue(6, enc($c, jenc($data), rec_aad($type, $id)), PDO::PARAM_LOB); $st->bindValue(7, $seq, PDO::PARAM_INT);
  $st->bindValue(8, $ks); $st->bindValue(9, $kc); $st->bindValue(10, $kk);
  $st->execute();
  return $seq;
}
function log_insert(PDO $db, array $c, array $e): bool {
  $id = $e['id'] ?? ''; if (!valid_id($id)) return false;
  $at = is_string($e['at'] ?? null) ? $e['at'] : now_iso();
  $st = $db->prepare('INSERT OR IGNORE INTO activity_log (id, at, payload) VALUES (?, ?, ?)');
  $st->bindValue(1, $id); $st->bindValue(2, $at); $st->bindValue(3, enc($c, jenc($e), 'activity/' . $id), PDO::PARAM_LOB);
  $st->execute();
  return $st->rowCount() > 0;
}

/* ---------------- v11: push / sync journal (sync_journal + sync_journal_items) ----------------
   One journal ENTRY per push, patch, pull that returned changes (config journal_pulls) and restore; one ITEM per record
   touched. Plaintext columns: ids, times, route, role, token id, counts, SHA-256 hashes, action. Everything that could
   name a person or a client (user, device name, codes, payloads) is AES-256-GCM encrypted (AAD journal/<jid>[/<n>]);
   look-ups by user / device / code go through HMAC index columns. Generic over record types (binder, client, …). */
function cut_str($v, int $n): string {
  $v = preg_replace('/[\x00-\x1F\x7F]/u', '', is_scalar($v) ? (string)$v : '');
  if (!is_string($v) || !preg_match('/^.{0,' . $n . '}/us', $v, $m)) return '';
  return trim($m[0]);
}
/** Who is calling, as declared by the client (v11). v10.1 clients send nothing: 'unknown' (push still has deviceId). */
function client_info(array $c): array {
  $b = body($c); $d = is_array($b['_device'] ?? null) ? $b['_device'] : [];
  $h = fn(string $k) => (string)($_SERVER[$k] ?? '');
  $id = cut_str($d['id'] ?? ($h('HTTP_X_DOCMAP_DEVICE') !== '' ? $h('HTTP_X_DOCMAP_DEVICE') : ($b['deviceId'] ?? '')), 100);
  $name = cut_str($d['name'] ?? rawurldecode($h('HTTP_X_DOCMAP_DEVICE_NAME')), 80);
  $app = cut_str($d['app'] ?? $h('HTTP_X_DOCMAP_APP'), 40);
  return ['device_id' => $id !== '' ? $id : 'unknown', 'device_name' => $name !== '' ? $name : 'unknown', 'app_version' => $app !== '' ? $app : 'unknown'];
}
/** Human code of a record of any type (binder speaking code, client Multi code / name, location code…). */
function rec_code(?array $d): string {
  if (!$d) return '';
  foreach (['speaking_code', 'code', 'full_code', 'location_code', 'multi_code', 'name'] as $k) if (isset($d[$k]) && is_scalar($d[$k]) && trim((string)$d[$k]) !== '') return cut_str($d[$k], 100);
  return '';
}
/** SHA-256 of the canonical JSON (same canon() as LWW: keys sorted, updated_at / short_url / location_code /
    selected_for_print / _* left out, scalars as strings). A tombstone hashes "deleted:<type>/<id>@<deletedAt>". */
/** v11.1: equal content for LWW ties. Locations also skip `code` / `level`, derived from the tree on each device
    (= SYNC_L_SKIP in 06f-sync.js), so the same location re-pushed with the same time stamp is "same", not a "tie". */
function same_content(string $type, array $a, array $b): bool {
  if ($type === 'location') foreach (['code', 'level'] as $k) { unset($a[$k], $b[$k]); }
  return jenc(canon($a)) === jenc(canon($b));
}
function jr_hash(?array $data): ?string { return $data === null ? null : hash('sha256', jenc(canon($data))); }
function jr_tomb_hash(string $type, string $id, string $at): string { return hash('sha256', 'deleted:' . $type . '/' . $id . '@' . $at); }
function jr_new(string $route, array $who, array $ci, array $extra = []): array {
  return ['route' => $route, 'who' => $who, 'ci' => $ci, 'extra' => $extra, 'items' => [], 'seq_from' => null, 'seq_to' => null,
    'n' => ['sent' => 0, 'accepted' => 0, 'rejected' => 0, 'conflicts' => 0, 'same' => 0]];
}
/** o: code, client_updated_at, prev_updated_at, new_updated_at, prev_hash, new_hash, prev (data|null), new (data|null), reason, extra */
function jr_item(array &$j, string $type, string $id, string $action, array $o = []): void { $j['items'][] = ['type' => $type, 'id' => $id, 'action' => $action] + $o; }
/** Writes the entry and its items. Call inside the caller's transaction (push, patch, restore) or on its own (pull). */
function jr_write(PDO $db, array $c, array $j): int {
  $who = $j['who']; $ci = $j['ci'];
  $meta = ['user' => (string)($who['user'] ?? ''), 'device_id' => $ci['device_id'], 'device_name' => $ci['device_name'], 'app_version' => $ci['app_version'],
    'operator' => (string)($j['extra']['operator'] ?? ''), 'ip' => client_ip(), 'extra' => $j['extra']];
  $st = $db->prepare('INSERT INTO sync_journal (at, route, token_id, role, k_user, k_device, n_sent, n_accepted, n_rejected, n_conflicts, n_same, n_items, seq_from, seq_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  $st->execute([now_iso(), $j['route'], (string)($who['token_id'] ?? ''), (string)($who['role'] ?? ''), hidx($c, 'user/' . strtolower((string)($who['user'] ?? ''))), hidx($c, 'device/' . $ci['device_id']),
    $j['n']['sent'], $j['n']['accepted'], $j['n']['rejected'], $j['n']['conflicts'], $j['n']['same'], count($j['items']), $j['seq_from'], $j['seq_to']]);
  $jid = (int)$db->lastInsertId();
  $u = $db->prepare('UPDATE sync_journal SET meta = ? WHERE jid = ?'); $u->bindValue(1, enc($c, jenc($meta), 'journal/' . $jid), PDO::PARAM_LOB); $u->bindValue(2, $jid, PDO::PARAM_INT); $u->execute();
  $ins = $db->prepare('INSERT INTO sync_journal_items (jid, n, type, id, k_code, action, client_updated_at, prev_updated_at, new_updated_at, prev_hash, new_hash, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  foreach ($j['items'] as $n => $it) {
    $code = (string)($it['code'] ?? '');
    $pl = ['code' => $code, 'reason' => (string)($it['reason'] ?? ''), 'prev' => $it['prev'] ?? null, 'new' => $it['new'] ?? null, 'extra' => $it['extra'] ?? null];
    $ins->bindValue(1, $jid, PDO::PARAM_INT); $ins->bindValue(2, $n + 1, PDO::PARAM_INT); $ins->bindValue(3, $it['type']); $ins->bindValue(4, $it['id']);
    $ins->bindValue(5, $code !== '' ? hidx($c, strtoupper(trim($code))) : null); $ins->bindValue(6, $it['action']);
    $ins->bindValue(7, $it['client_updated_at'] ?? null); $ins->bindValue(8, $it['prev_updated_at'] ?? null); $ins->bindValue(9, $it['new_updated_at'] ?? null);
    $ins->bindValue(10, $it['prev_hash'] ?? null); $ins->bindValue(11, $it['new_hash'] ?? null);
    $ins->bindValue(12, enc($c, jenc($pl), 'journal/' . $jid . '/' . ($n + 1)), PDO::PARAM_LOB);
    $ins->execute();
  }
  return $jid;
}
/** Retention (config journal_keep_days, 0 = keep everything): at most once a day, oldest entries first. */
function jr_prune(PDO $db, array $c): void {
  $days = (int)$c['journal_keep_days']; if ($days <= 0) return;
  $last = (string)($db->query("SELECT v FROM meta WHERE k = 'journal_pruned_at'")->fetchColumn() ?: '');
  if ($last !== '' && ts_ms($last) > ts_ms(now_iso()) - 86400000) return;
  $cut = iso_ms(ts_ms(now_iso()) - $days * 86400000);
  $db->exec('BEGIN IMMEDIATE');
  try {
    $db->prepare('DELETE FROM sync_journal_items WHERE jid IN (SELECT jid FROM sync_journal WHERE at < ?)')->execute([$cut]);
    $db->prepare('DELETE FROM sync_journal WHERE at < ?')->execute([$cut]);
    $db->prepare("INSERT INTO meta (k, v) VALUES ('journal_pruned_at', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")->execute([now_iso()]);
    $db->exec('COMMIT');
  } catch (Throwable $e) { try { $db->exec('ROLLBACK'); } catch (Throwable $e2) {} throw $e; }
}
function jr_meta(array $c, array $row): array { $m = $row['meta'] ? json_decode(dec($c, $row['meta'], 'journal/' . $row['jid']), true) : null; return is_array($m) ? $m : []; }
function jr_payload(array $c, array $it): array { $p = $it['payload'] ? json_decode(dec($c, $it['payload'], 'journal/' . $it['jid'] . '/' . $it['n']), true) : null; return is_array($p) ? $p : []; }

/* ---------------- routes ---------------- */
function r_ping(array $c): array { return ['ok' => true, 'api' => DM_API, 'version' => DM_API_VERSION, 'schema' => DM_SCHEMA, 'features' => ['journal', 'device_info', 'locations', 'archives', 'access_log', 'status_events'], 'server_time' => now_iso(), 'php' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION, 'app_version' => DM_APP_VERSION]; }

function r_pull(PDO $db, array $c, ?array $who = null): array {
  $since = max(0, (int)param($c, 'since', 0)); $logSince = max(0, (int)param($c, 'log_since', 0));
  $db->beginTransaction();   // one snapshot (WAL): rows and seq are consistent
  try {
    $q = $db->prepare('SELECT * FROM records WHERE seq > ? ORDER BY seq LIMIT ' . (DM_PULL_PAGE + 1)); $q->execute([$since]);
    $rows = $q->fetchAll(); $more = count($rows) > DM_PULL_PAGE; if ($more) array_pop($rows);
    $records = []; $tombs = []; $last = $since;
    foreach ($rows as $r) { $p = rec_public($c, $r); if (!empty($p['deleted'])) { unset($p['deleted']); $tombs[] = $p; } else $records[] = $p; $last = max($last, (int)$r['seq']); }
    $seq = $more ? $last : max_seq($db);
    $settings = null;
    $s = $db->prepare("SELECT * FROM settings_shared WHERE key = 'subset' AND seq > ?"); $s->execute([$since]);
    if ($sr = $s->fetch()) $settings = ['updated_at' => $sr['updated_at'], 'data' => json_decode(dec($c, $sr['json'], 'settings/subset'), true)];
    if ($logSince === 0) { $l = $db->query('SELECT * FROM (SELECT * FROM activity_log ORDER BY seq DESC LIMIT ' . DM_LOG_PAGE . ') ORDER BY seq'); }
    else { $l = $db->prepare('SELECT * FROM activity_log WHERE seq > ? ORDER BY seq LIMIT ' . DM_LOG_PAGE); $l->execute([$logSince]); }
    $log = []; $logSeq = $logSince;
    foreach ($l->fetchAll() as $r) { $e = json_decode(dec($c, $r['payload'], 'activity/' . $r['id']), true); if (is_array($e)) $log[] = $e; $logSeq = max($logSeq, (int)$r['seq']); }
    if (count($log) < DM_LOG_PAGE) $logSeq = max($logSeq, max_log_seq($db));
    $counts = $since === 0 ? ['records' => (int)$db->query('SELECT COUNT(*) FROM records WHERE deleted = 0')->fetchColumn(), 'tombstones' => (int)$db->query('SELECT COUNT(*) FROM records WHERE deleted = 1')->fetchColumn()] : null;
    $db->commit();
  } catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
  // v11 journal: what this device received (config journal_pulls: 'changes' = pulls that returned something or a full pull)
  $jid = null; $mode = (string)$c['journal_pulls'];
  if ($who !== null && ($mode === 'all' || ($mode !== 'none' && ($records || $tombs || $settings || $since === 0)))) {
    $jr = jr_new('pull', $who, client_info($c), ['since' => $since, 'more' => $more]);
    $jr['seq_from'] = $since; $jr['seq_to'] = $seq; $jr['n']['sent'] = count($records) + count($tombs);
    foreach ($records as $r) jr_item($jr, $r['type'], $r['id'], 'pull', ['code' => rec_code($r['data']), 'new_updated_at' => $r['updated_at'], 'new_hash' => jr_hash($r['data'])]);
    foreach ($tombs as $t) jr_item($jr, $t['type'], $t['id'], 'pull-delete', ['code' => (string)($t['code'] ?? ''), 'new_updated_at' => $t['deletedAt'], 'new_hash' => jr_tomb_hash($t['type'], $t['id'], $t['deletedAt'])]);
    if ($settings) jr_item($jr, 'settings', 'subset', 'pull', ['new_updated_at' => $settings['updated_at'], 'new_hash' => is_array($settings['data']) ? jr_hash($settings['data']) : null]);
    $db->exec('BEGIN IMMEDIATE');
    try { $jid = jr_write($db, $c, $jr); $db->exec('COMMIT'); } catch (Throwable $e) { try { $db->exec('ROLLBACK'); } catch (Throwable $e2) {} throw $e; }
  }
  return ['seq' => $seq, 'more' => $more, 'records' => $records, 'tombstones' => $tombs, 'settings' => $settings, 'activity_log' => $log, 'log_seq' => $logSeq, 'counts' => $counts, 'server_time' => now_iso(), 'journal_id' => $jid];
}

function r_push(PDO $db, array $c, array $who): array {
  $b = body($c);
  $device = substr((string)($b['deviceId'] ?? ''), 0, 100); $op = substr(trim((string)($b['operator'] ?? '')), 0, 80);
  $label = $op !== '' ? $op : $who['user'];
  $applied = 0; $same = 0; $rejected = []; $logged = 0;
  $ci = client_info($c); $jr = jr_new('push', $who, $ci, ['operator' => $op]);   // v11 journal
  $bad = function ($type, $id, string $reason, ?string $u) use (&$jr) { jr_item($jr, is_string($type) ? substr($type, 0, 40) : '', is_string($id) ? substr($id, 0, 100) : '', 'rejected-invalid', ['reason' => $reason, 'client_updated_at' => $u]); };
  $db->exec('BEGIN IMMEDIATE');
  try {
    if (lic_required($c)) lic_push_binder_limit($db, $c, $b);   // v12.6 licence limit 'binders'
    foreach ((array)($b['records'] ?? []) as $r) {
      $jr['n']['sent']++;
      $type = $r['type'] ?? ''; $id = $r['id'] ?? ''; $data = $r['data'] ?? null; $u = (string)($r['updated_at'] ?? ($data['updated_at'] ?? ''));
      if (!in_array($type, DM_TYPES, true) || !valid_id($id) || !is_array($data) || ts_ms($u) <= 0) { $rejected[] = ['type' => (string)$type, 'id' => is_string($id) ? $id : '', 'reason' => 'invalid']; $bad($type, $id, 'invalid', $u); continue; }
      if (strlen(jenc($data)) > DM_MAX_RECORD) { $rejected[] = ['type' => $type, 'id' => $id, 'reason' => 'too_large']; $bad($type, $id, 'too_large', $u); continue; }
      $data['id'] = $id;
      $cur = rec_load($db, $type, $id); $curData = $cur && !(int)$cur['deleted'] ? rec_data($c, $cur) : null;
      $prevHash = $cur ? ((int)$cur['deleted'] ? jr_tomb_hash($type, $id, $cur['updated_at']) : jr_hash($curData)) : null;
      if ($cur) {
        $lt = ts_ms($cur['updated_at']); $rt = ts_ms($u);
        if ($rt === $lt && !(int)$cur['deleted'] && same_content($type, $curData, $data)) { $same++; $jr['n']['same']++; continue; }
        if ($rt <= $lt) {
          $rejected[] = ['type' => $type, 'id' => $id, 'server_updated_at' => $cur['updated_at'], 'reason' => $rt === $lt ? 'tie' : 'older', 'current' => rec_public($c, $cur)];
          if ($rt === $lt) $jr['n']['conflicts']++;
          jr_item($jr, $type, $id, $rt === $lt ? 'conflict' : 'rejected-older', ['code' => rec_code($data) ?: rec_code($curData), 'reason' => $rt === $lt ? 'tie' : 'older', 'client_updated_at' => $u, 'prev_updated_at' => $cur['updated_at'],
            'new_updated_at' => $cur['updated_at'], 'prev_hash' => $prevHash, 'new_hash' => jr_hash($data), 'prev' => $curData, 'new' => $data, 'extra' => (int)$cur['deleted'] ? ['server_deleted' => true] : null]);
          continue;
        }
      }
      rec_write($db, $c, $type, $id, $u, false, $label, $data, $device); $applied++;
      jr_item($jr, $type, $id, $curData !== null ? 'update' : 'create', ['code' => rec_code($data), 'reason' => $cur && (int)$cur['deleted'] ? 'resurrect' : '', 'client_updated_at' => $u,
        'prev_updated_at' => $cur ? $cur['updated_at'] : null, 'new_updated_at' => $u, 'prev_hash' => $prevHash, 'new_hash' => jr_hash($data), 'prev' => $curData, 'new' => $data]);
    }
    foreach ((array)($b['tombstones'] ?? []) as $t) {
      $jr['n']['sent']++;
      $type = $t['type'] ?? ''; $id = $t['id'] ?? ''; $d = (string)($t['deletedAt'] ?? '');
      if (!in_array($type, DM_TYPES, true) || !valid_id($id) || ts_ms($d) <= 0) { $rejected[] = ['type' => (string)$type, 'id' => is_string($id) ? $id : '', 'reason' => 'invalid']; $bad($type, $id, 'invalid', $d); continue; }
      $cur = rec_load($db, $type, $id); $curData = $cur && !(int)$cur['deleted'] ? rec_data($c, $cur) : null;
      if ($cur) {
        $lt = ts_ms($cur['updated_at']); $rt = ts_ms($d);
        if ((int)$cur['deleted'] && $rt <= $lt) { $same++; $jr['n']['same']++; continue; }
        if (!(int)$cur['deleted'] && $rt <= $lt) {
          $rejected[] = ['type' => $type, 'id' => $id, 'server_updated_at' => $cur['updated_at'], 'reason' => $rt === $lt ? 'tie' : 'older', 'current' => rec_public($c, $cur)];
          if ($rt === $lt) $jr['n']['conflicts']++;
          jr_item($jr, $type, $id, $rt === $lt ? 'conflict' : 'rejected-older', ['code' => rec_code($curData) ?: cut_str($t['code'] ?? '', 100), 'reason' => ($rt === $lt ? 'tie' : 'older') . '_delete', 'client_updated_at' => $d,
            'prev_updated_at' => $cur['updated_at'], 'new_updated_at' => $cur['updated_at'], 'prev_hash' => jr_hash($curData), 'new_hash' => jr_tomb_hash($type, $id, $d), 'prev' => $curData, 'new' => null]);
          continue;
        }
      }
      $tcode = substr((string)($t['code'] ?? ''), 0, 100);
      rec_write($db, $c, $type, $id, $d, true, substr((string)($t['who'] ?? $label), 0, 80), ['code' => $tcode], $device); $applied++;
      jr_item($jr, $type, $id, 'delete', ['code' => rec_code($curData) ?: $tcode, 'client_updated_at' => $d, 'prev_updated_at' => $cur ? $cur['updated_at'] : null, 'new_updated_at' => $d,
        'prev_hash' => $curData !== null ? jr_hash($curData) : ($cur ? jr_tomb_hash($type, $id, $cur['updated_at']) : null), 'new_hash' => jr_tomb_hash($type, $id, $d), 'prev' => $curData, 'new' => null]);
    }
    $settingsApplied = false;
    $s = $b['settings'] ?? null;
    if (is_array($s) && is_array($s['data'] ?? null) && ts_ms($s['updated_at'] ?? '') > 0) {
      $q = $db->query("SELECT updated_at, json FROM settings_shared WHERE key = 'subset'"); $oldRow = $q->fetch(); $old = $oldRow ? $oldRow['updated_at'] : false;
      if ($old === false || ts_ms($s['updated_at']) > ts_ms($old)) {
        $oldData = $oldRow ? json_decode(dec($c, $oldRow['json'], 'settings/subset'), true) : null;
        jr_item($jr, 'settings', 'subset', $oldRow ? 'update' : 'create', ['client_updated_at' => (string)$s['updated_at'], 'prev_updated_at' => $old ?: null, 'new_updated_at' => (string)$s['updated_at'],
          'prev_hash' => is_array($oldData) ? jr_hash($oldData) : null, 'new_hash' => jr_hash($s['data']), 'prev' => is_array($oldData) ? $oldData : null, 'new' => $s['data']]);
        $db->prepare('INSERT INTO changes (type, id, updated_at, at, device, who) VALUES (?, ?, ?, ?, ?, ?)')->execute(['settings', 'subset', $s['updated_at'], now_iso(), $device, $label]);
        $seq = (int)$db->lastInsertId();
        $st = $db->prepare("INSERT INTO settings_shared (key, json, updated_at, seq) VALUES ('subset', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, seq = excluded.seq");
        $st->bindValue(1, enc($c, jenc($s['data']), 'settings/subset'), PDO::PARAM_LOB); $st->bindValue(2, (string)$s['updated_at']); $st->bindValue(3, $seq, PDO::PARAM_INT); $st->execute();
        $settingsApplied = true;
      }
    }
    foreach (array_slice((array)($b['activity_log'] ?? []), 0, 5000) as $e) if (is_array($e) && log_insert($db, $c, $e)) $logged++;
    $jr['n']['accepted'] = $applied; $jr['n']['rejected'] = count($rejected); $jr['seq_to'] = max_seq($db);
    $jr['extra'] += ['logged' => $logged, 'settings_applied' => $settingsApplied, 'device_body' => $device];
    $jid = jr_write($db, $c, $jr);   // same transaction: a push and its journal entry are written together or not at all
    $db->exec('COMMIT');
  } catch (Throwable $e) { try { $db->exec('ROLLBACK'); } catch (Throwable $e2) {} throw $e; }
  jr_prune($db, $c);
  return ['applied' => $applied, 'same' => $same, 'rejected' => $rejected, 'settings_applied' => $settingsApplied, 'logged' => $logged, 'seq' => max_seq($db), 'server_time' => now_iso(), 'journal_id' => $jid];
}

/* ---------------- v12: status events (records of type status_event, written by push like any record) ---------------- */
function st_key(array $c, string $tt, string $id): ?string { return $id === '' ? null : hidx($c, 'st/' . ($tt === 'location' ? 'l' : 'b') . '/' . $id); }
/** Status events found through the HMAC index columns (k_short IN keys, or k_code = box key), chronological, newest $cap kept. */
function st_events(PDO $db, array $c, array $keys, ?string $boxKey, int $cap): array {
  $out = []; $seen = [];
  $keys = array_values(array_filter(array_unique($keys)));
  $add = function (array $rows) use ($c, &$out, &$seen) { foreach ($rows as $r) { if (isset($seen[$r['id']]) || (int)$r['deleted']) continue; $seen[$r['id']] = 1; $d = rec_data($c, $r); $d['id'] = $r['id']; $out[] = $d; } };
  foreach (array_chunk($keys, 400) as $ch) { $q = $db->prepare("SELECT * FROM records WHERE type = 'status_event' AND k_short IN (" . implode(',', array_fill(0, count($ch), '?')) . ')'); $q->execute($ch); $add($q->fetchAll()); }
  if ($boxKey !== null) { $q = $db->prepare("SELECT * FROM records WHERE type = 'status_event' AND k_code = ?"); $q->execute([$boxKey]); $add($q->fetchAll()); }
  usort($out, fn($a, $b) => strcmp((string)($a['at'] ?? ''), (string)($b['at'] ?? '')) ?: strcmp((string)$a['id'], (string)$b['id']));
  return count($out) > $cap ? array_slice($out, -$cap) : $out;
}
/** Status types of the studio (shared settings subset, key statusTypes), or null: the phone then uses the built-in ones. */
function st_types(PDO $db, array $c): ?array {
  $r = $db->query("SELECT json FROM settings_shared WHERE key = 'subset'")->fetch(); if (!$r) return null;
  $d = json_decode(dec($c, $r['json'], 'settings/subset'), true);
  return is_array($d) && is_array($d['statusTypes'] ?? null) && $d['statusTypes'] ? $d['statusTypes'] : null;
}
function binder_pack(PDO $db, array $c, array $row): array {
  $p = rec_public($c, $row); $b = $p['data']; $sib = [];
  if ($row['k_cab']) {
    $q = $db->prepare("SELECT * FROM records WHERE type = 'binder' AND deleted = 0 AND k_cab = ? AND id <> ? LIMIT 400"); $q->execute([$row['k_cab'], $row['id']]);
    foreach ($q->fetchAll() as $r) { $d = rec_data($c, $r); $sib[] = ['speaking_code' => (string)($d['speaking_code'] ?? ''), 'shelf_code' => (string)($d['shelf_code'] ?? ''), 'sector_code' => (string)($d['sector_code'] ?? ''), 'location_code' => (string)($d['location_code'] ?? '')]; }
  }
  return ['binder' => $b, 'etag' => $row['updated_at'], 'siblings' => $sib,
    'status_events' => st_events($db, $c, [st_key($c, 'binder', $row['id'])], null, DM_STATUS_PER_TARGET), 'status_types' => st_types($db, $c)];   // v12
}
function r_binder(PDO $db, array $c): array {
  $qr = trim((string)param($c, 'qr', '')); $code = strtoupper(trim((string)param($c, 'code', '')));
  if ($qr !== '' && !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $qr)) fail(400, 'invalid', 'qr');
  if ($qr === '' && $code === '') fail(400, 'invalid', 'qr or code required');
  $q = $db->prepare("SELECT * FROM records WHERE type = 'binder' AND deleted = 0 AND " . ($qr !== '' ? 'k_short' : 'k_code') . ' = ? ORDER BY updated_at DESC LIMIT 1');
  $q->execute([hidx($c, $qr !== '' ? $qr : $code)]); $row = $q->fetch();
  if (!$row) fail(404, 'not_found', 'binder not found');
  return binder_pack($db, $c, $row);
}

/* ---------------- v11: locations ---------------- */
function loc_pack(PDO $db, array $c, array $row): array {
  $p = rec_public($c, $row); $l = $p['data'];
  $path = []; $seen = []; $pid = (string)($l['parent_id'] ?? '');
  while ($pid !== '' && !isset($seen[$pid]) && count($path) < 16) {
    $seen[$pid] = 1; $r = rec_load($db, 'location', $pid); if (!$r || (int)$r['deleted']) break;
    $d = rec_data($c, $r); array_unshift($path, ['id' => $r['id'], 'code' => (string)($d['code'] ?? ''), 'name' => (string)($d['name'] ?? ''), 'kind' => (string)($d['kind'] ?? ''), 'seg' => (string)($d['seg'] ?? ''), 'level' => (int)($d['level'] ?? 0)]);
    $pid = (string)($d['parent_id'] ?? '');
  }
  $kids = []; $binders = []; $n = 0; $nested = []; $nn = 0; $par = []; $lcode = [];
  // payloads are encrypted: children and binders are found by decrypting the records of the two types (fine for a studio archive)
  foreach ($db->query("SELECT * FROM records WHERE type = 'location' AND deleted = 0") as $r) { $d = rec_data($c, $r); $par[$r['id']] = (string)($d['parent_id'] ?? ''); $lcode[$r['id']] = (string)($d['code'] ?? ''); if ((string)($d['parent_id'] ?? '') === $row['id']) $kids[] = ['id' => $r['id'], 'code' => (string)($d['code'] ?? ''), 'name' => (string)($d['name'] ?? ''), 'kind' => (string)($d['kind'] ?? ''), 'seg' => (string)($d['seg'] ?? ''), 'level' => (int)($d['level'] ?? 0)]; }
  // v12.1: every location nested below this one (boxes on a shelf, shelves in a cabinet…)
  $ch = []; foreach ($par as $lid => $pp) $ch[$pp][] = $lid;
  $sub = []; $todo = [$row['id']];
  while ($todo) { $x = array_pop($todo); foreach ($ch[$x] ?? [] as $lid) if (!isset($sub[$lid]) && $lid !== $row['id']) { $sub[$lid] = 1; $todo[] = $lid; } }
  foreach ($db->query("SELECT * FROM records WHERE type = 'binder' AND deleted = 0") as $r) {
    $d = rec_data($c, $r); $bl = (string)($d['location_id'] ?? '');
    if ($bl !== '' && isset($sub[$bl])) { $nn++; if (count($nested) < 1000) $nested[] = ['id' => $r['id'], 'speaking_code' => (string)($d['speaking_code'] ?? ''), 'company_name' => (string)($d['company_name'] ?? ''), 'binder_title' => (string)($d['binder_title'] ?? ''), 'color_hex' => (string)($d['color_hex'] ?? ''), 'short_code' => (string)($d['short_code'] ?? ''), 'location_id' => $bl, 'location_code' => $lcode[$bl] ?? '']; continue; }
    if ($bl !== $row['id']) continue;
    $n++; if (count($binders) < 500) $binders[] = ['id' => $r['id'], 'speaking_code' => (string)($d['speaking_code'] ?? ''), 'company_name' => (string)($d['company_name'] ?? ''), 'binder_title' => (string)($d['binder_title'] ?? ''), 'color_hex' => (string)($d['color_hex'] ?? ''), 'short_code' => (string)($d['short_code'] ?? '')];
  }
  usort($kids, fn($a, $b) => strnatcasecmp($a['seg'], $b['seg']));
  usort($binders, fn($a, $b) => strnatcasecmp($a['speaking_code'], $b['speaking_code']));
  usort($nested, fn($a, $b) => strnatcasecmp($a['location_code'], $b['location_code']) ?: strnatcasecmp($a['speaking_code'], $b['speaking_code']));
  // v12: statuses of the box, of the binders in it and of the binders that left with it (return check on the phone)
  $bk = hidx($c, 'stbox/' . $row['id']);
  $sk = [st_key($c, 'location', $row['id'])]; foreach ($binders as $x) $sk[] = st_key($c, 'binder', $x['id']); foreach ($nested as $x) $sk[] = st_key($c, 'binder', $x['id']);
  foreach (st_events($db, $c, [], $bk, DM_STATUS_PER_TARGET * 10) as $e) if (($e['target_type'] ?? '') !== 'location') $sk[] = st_key($c, 'binder', (string)($e['target_id'] ?? ''));   // binders that left with the box: their later events too
  $sev = st_events($db, $c, $sk, $bk, DM_STATUS_PER_TARGET * 10);
  return ['location' => $l, 'etag' => $row['updated_at'], 'path' => $path, 'children' => $kids, 'binders' => $binders, 'count' => $n, 'nested_binders' => $nested, 'nested_count' => $nn, 'status_events' => $sev, 'status_types' => st_types($db, $c)];
}
function loc_find(PDO $db, array $c, string $qr, string $id, string $code): ?array {
  if ($id !== '') { if (!valid_id($id)) fail(400, 'invalid', 'id'); $r = rec_load($db, 'location', $id); return $r && !(int)$r['deleted'] ? $r : null; }
  $q = $db->prepare("SELECT * FROM records WHERE type = 'location' AND deleted = 0 AND " . ($qr !== '' ? 'k_short' : 'k_code') . ' = ? ORDER BY updated_at DESC LIMIT 1');
  $q->execute([hidx($c, $qr !== '' ? $qr : $code)]); $r = $q->fetch();
  return $r ?: null;
}
function r_location(PDO $db, array $c): array {
  $qr = trim((string)param($c, 'qr', '')); $id = trim((string)param($c, 'id', '')); $code = strtoupper(trim((string)param($c, 'code', '')));
  if ($qr !== '' && !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $qr)) fail(400, 'invalid', 'qr');
  if ($qr === '' && $id === '' && $code === '') fail(400, 'invalid', 'qr, id or code required');
  $row = loc_find($db, $c, $qr, $id, $code);
  if (!$row) fail(404, 'not_found', 'location not found');
  return loc_pack($db, $c, $row);
}
/** One QR, either kind: location codes have their own format (dm26L + 8), anything else is looked up as a binder. */
function r_resolve(PDO $db, array $c): array {
  $qr = trim((string)param($c, 'qr', ''));
  if (!preg_match('/^[A-Za-z0-9_-]{1,40}$/', $qr)) fail(400, 'invalid', 'qr');
  if (preg_match(DM_LOC_SC, $qr)) { $row = loc_find($db, $c, $qr, '', ''); if (!$row) fail(404, 'not_found', 'location not found'); return ['type' => 'location'] + loc_pack($db, $c, $row); }
  $q = $db->prepare("SELECT * FROM records WHERE type = 'binder' AND deleted = 0 AND k_short = ? ORDER BY updated_at DESC LIMIT 1"); $q->execute([hidx($c, $qr)]); $row = $q->fetch();
  if (!$row) fail(404, 'not_found', 'binder not found');
  return ['type' => 'binder'] + binder_pack($db, $c, $row);
}

function r_patch(PDO $db, array $c, array $who): array {
  $b = body($c); $id = $b['id'] ?? ''; $patch = $b['patch'] ?? null;
  if (!valid_id($id) || !is_array($patch)) fail(400, 'invalid', 'id and patch required');
  foreach (array_keys($patch) as $k) if (!in_array($k, DM_MOBILE_FIELDS, true)) fail(422, 'field_not_allowed', 'field not allowed from mobile', ['field' => (string)$k]);
  $base = (string)($b['base_updated_at'] ?? trim((string)($_SERVER['HTTP_IF_MATCH'] ?? ''), '"'));
  $force = !empty($b['force']);
  $ci = client_info($c); $label = substr(trim((string)($b['operator'] ?? '')), 0, 80) ?: $who['user'];
  $jr = jr_new('patch', $who, $ci, ['operator' => $label, 'base_updated_at' => $base, 'forced' => $force, 'fields' => array_keys($patch)]);
  $jr['n']['sent'] = 1; $conflict = null; $jid = null;
  $db->exec('BEGIN IMMEDIATE');
  try {
    $row = rec_load($db, 'binder', $id);
    if (!$row || (int)$row['deleted']) fail(404, 'not_found', 'binder not found');
    $prev = rec_data($c, $row);
    if (!$force && $base !== $row['updated_at']) {
      // v11: the refused save is journaled too (what the phone tried, on which version) before answering 409
      $cur = binder_pack($db, $c, $row); $tried = $prev; foreach ($patch as $k => $v) $tried[$k] = $v;
      $jr['n']['rejected'] = 1; $jr['n']['conflicts'] = 1;
      jr_item($jr, 'binder', $id, 'conflict', ['code' => rec_code($prev), 'reason' => 'stale_base', 'client_updated_at' => $base, 'prev_updated_at' => $row['updated_at'], 'new_updated_at' => $row['updated_at'],
        'prev_hash' => jr_hash($prev), 'new_hash' => jr_hash($tried), 'prev' => $prev, 'new' => $tried, 'extra' => ['patch' => $patch]]);
      jr_write($db, $c, $jr); $db->exec('COMMIT');
      $conflict = ['current' => $cur['binder'], 'current_etag' => $row['updated_at']];
    }
    if ($conflict === null) {
    $data = $prev;
    if (array_key_exists('location_id', $patch)) {   // v11: the location must exist; location_code always follows it
      $lid = is_string($patch['location_id']) ? trim($patch['location_id']) : '';
      if ($lid !== '') { if (!valid_id($lid)) fail(422, 'invalid_location', 'location_id'); $lr = rec_load($db, 'location', $lid); if (!$lr || (int)$lr['deleted']) fail(422, 'invalid_location', 'location not found', ['location_id' => $lid]); $patch['location_code'] = (string)(rec_data($c, $lr)['code'] ?? ''); }
      else if (!array_key_exists('location_code', $patch) || !is_string($patch['location_code'])) $patch['location_code'] = '';
      $patch['location_id'] = $lid;
    } elseif (array_key_exists('location_code', $patch)) fail(422, 'field_not_allowed', 'location_code only together with location_id', ['field' => 'location_code']);
    foreach ($patch as $k => $v) $data[$k] = $v;
    $now = ts_ms(now_iso()); $old = ts_ms($row['updated_at']); $at = iso_ms(max($now, $old + 1));   // strictly increasing
    rec_write($db, $c, 'binder', $id, $at, false, $label, $data, substr((string)($b['deviceId'] ?? ($ci['device_id'] !== 'unknown' ? $ci['device_id'] : 'mobile')), 0, 100));
    $jr['n']['accepted'] = 1;
    jr_item($jr, 'binder', $id, 'update', ['code' => rec_code($data), 'reason' => $force ? 'forced' : '', 'client_updated_at' => $base, 'prev_updated_at' => $row['updated_at'], 'new_updated_at' => $at,
      'prev_hash' => jr_hash($prev), 'new_hash' => jr_hash($data), 'prev' => $prev, 'new' => $data, 'extra' => ['patch' => $patch]]);
    $e = is_array($b['log'] ?? null) ? $b['log'] : [];
    $e += ['id' => bin2hex(random_bytes(16)), 'action' => 'binder.edit', 'source' => 'mobile', 'who' => $label, 'target' => ['type' => 'binder', 'id' => $id, 'code' => (string)($data['speaking_code'] ?? '')], 'summary' => 'Modificato da mobile il faldone ' . ($data['speaking_code'] ?? '')];
    $e['at'] = $at; $e['details'] = (is_array($e['details'] ?? null) ? $e['details'] : []) + ['patch' => $patch];
    $e['details']['base_updated_at'] = $row['updated_at']; $e['details']['new_updated_at'] = $at; $e['details']['forced'] = $force; $e['details']['token_user'] = $who['user'];
    log_insert($db, $c, $e);
    $jr['seq_to'] = max_seq($db); $jid = jr_write($db, $c, $jr);
    $db->exec('COMMIT');
    }
  } catch (Throwable $ex) { try { $db->exec('ROLLBACK'); } catch (Throwable $e2) {} throw $ex; }
  if ($conflict !== null) fail(409, 'conflict', 'binder changed meanwhile', $conflict);
  $row = rec_load($db, 'binder', $id);
  $p = binder_pack($db, $c, $row);
  return ['binder' => $p['binder'], 'etag' => $row['updated_at'], 'journal_id' => $jid, 'hash' => jr_hash(rec_data($c, $row))];
}

/* ---------------- v11: journal routes ---------------- */
/** List (newest first, paged with before=<jid>) or one entry (entry=<jid>, with the decrypted previous / new payloads).
    Filters: from, to (ISO or YYYY-MM-DD), user, device (device id), record (record id), code (human code), route.
    Editors only ever see their own entries (user forced to the token's user); viewers get 403 from the dispatcher. */
function r_journal(PDO $db, array $c, array $who): array {
  $admin = $who['role'] === 'admin';
  $entry = (int)param($c, 'entry', 0);
  $where = []; $args = [];
  $user = $admin ? trim((string)param($c, 'user', '')) : $who['user'];
  if ($user !== '') { $where[] = 'k_user = ?'; $args[] = hidx($c, 'user/' . strtolower($user)); }
  if ($entry > 0) { $where[] = 'jid = ?'; $args[] = $entry; }
  else {
    $from = trim((string)param($c, 'from', '')); $to = trim((string)param($c, 'to', ''));
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) $to .= 'T23:59:59.999Z';
    if ($from !== '') { $where[] = 'at >= ?'; $args[] = $from; }
    if ($to !== '') { $where[] = 'at <= ?'; $args[] = $to; }
    $dev = trim((string)param($c, 'device', '')); if ($dev !== '') { $where[] = 'k_device = ?'; $args[] = hidx($c, 'device/' . $dev); }
    $route = trim((string)param($c, 'route', '')); if ($route !== '') { $where[] = 'route = ?'; $args[] = $route; }
    $before = (int)param($c, 'before', 0); if ($before > 0) { $where[] = 'jid < ?'; $args[] = $before; }
  }
  $rec = trim((string)param($c, 'record', '')); $code = strtoupper(trim((string)param($c, 'code', '')));
  $iw = []; $ia = [];
  if ($rec !== '') { $iw[] = 'id = ?'; $ia[] = $rec; }
  if ($code !== '') { $iw[] = 'k_code = ?'; $ia[] = hidx($c, $code); }
  if ($iw) { $where[] = 'jid IN (SELECT jid FROM sync_journal_items WHERE ' . implode(' AND ', $iw) . ')'; array_push($args, ...$ia); }
  $limit = max(1, min(DM_JOURNAL_PAGE_MAX, (int)param($c, 'limit', DM_JOURNAL_PAGE)));
  $q = $db->prepare('SELECT * FROM sync_journal' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY jid DESC LIMIT ' . ($limit + 1));
  $q->execute($args); $rows = $q->fetchAll();
  $more = count($rows) > $limit; if ($more) array_pop($rows);
  if ($entry > 0 && !$rows) fail(404, 'not_found', 'journal entry not found');
  $items = [];
  foreach ($rows as $r) {
    $m = jr_meta($c, $r);
    $e = ['jid' => (int)$r['jid'], 'at' => $r['at'], 'route' => $r['route'], 'token_id' => $r['token_id'], 'role' => $r['role'], 'user' => (string)($m['user'] ?? ''),
      'device' => ['id' => (string)($m['device_id'] ?? 'unknown'), 'name' => (string)($m['device_name'] ?? 'unknown'), 'app' => (string)($m['app_version'] ?? 'unknown')],
      'operator' => (string)($m['operator'] ?? ''), 'extra' => $m['extra'] ?? null,
      'counts' => ['sent' => (int)$r['n_sent'], 'accepted' => (int)$r['n_accepted'], 'rejected' => (int)$r['n_rejected'], 'conflicts' => (int)$r['n_conflicts'], 'same' => (int)$r['n_same']],
      'items_total' => (int)$r['n_items'], 'seq_from' => $r['seq_from'] === null ? null : (int)$r['seq_from'], 'seq_to' => $r['seq_to'] === null ? null : (int)$r['seq_to']];
    if ($admin) $e['ip'] = (string)($m['ip'] ?? '');
    $sq = 'SELECT * FROM sync_journal_items WHERE jid = ?' . ($iw ? ' AND ' . implode(' AND ', $iw) : '') . ' ORDER BY n LIMIT ' . ($entry > 0 ? 20000 : DM_JOURNAL_ITEMS_LIST);
    $s = $db->prepare($sq); $s->execute(array_merge([(int)$r['jid']], $ia));
    $e['records'] = [];
    foreach ($s->fetchAll() as $it) {
      $p = jr_payload($c, $it);
      $x = ['n' => (int)$it['n'], 'type' => $it['type'], 'id' => $it['id'], 'code' => (string)($p['code'] ?? ''), 'action' => $it['action'], 'reason' => (string)($p['reason'] ?? ''),
        'client_updated_at' => $it['client_updated_at'], 'prev_updated_at' => $it['prev_updated_at'], 'new_updated_at' => $it['new_updated_at'], 'prev_hash' => $it['prev_hash'], 'new_hash' => $it['new_hash']];
      if ($entry > 0) { $x['prev'] = $p['prev'] ?? null; $x['new'] = $p['new'] ?? null; $x['extra'] = $p['extra'] ?? null; }
      $e['records'][] = $x;
    }
    $items[] = $e;
  }
  return ['items' => $items, 'more' => $more, 'next_before' => $more && $rows ? (int)end($rows)['jid'] : null, 'server_time' => now_iso()];
}
/** Writes a journaled version of a record again, as a NEW write (updated_at = max(now, current + 1 ms)), so that it wins
    the last-write-wins on every client at the next sync. version 'prev' = what the item overwrote, 'new' = what it wrote.
    A version without data (the record did not exist / was deleted) is restored as a deletion (tombstone). */
function r_journal_restore(PDO $db, array $c, array $who): array {
  $jid = (int)param($c, 'jid', 0); $n = (int)param($c, 'n', 0); $ver = (string)param($c, 'version', 'prev');
  if ($jid <= 0 || $n <= 0 || !in_array($ver, ['prev', 'new'], true)) fail(422, 'invalid', 'jid, n and version prev|new required');
  $db->exec('BEGIN IMMEDIATE');
  try {
    $q = $db->prepare('SELECT * FROM sync_journal_items WHERE jid = ? AND n = ?'); $q->execute([$jid, $n]); $it = $q->fetch();
    if (!$it) fail(404, 'not_found', 'journal item not found');
    $type = $it['type']; $id = $it['id'];
    if (!in_array($type, DM_TYPES, true) || !valid_id($id)) fail(422, 'invalid', 'this item cannot be restored (type ' . $type . ')');
    $p = jr_payload($c, $it); $data = $p[$ver] ?? null;
    if ($data !== null && !is_array($data)) fail(422, 'invalid', 'no stored version');
    if ($data === null && in_array($it['action'], ['pull', 'pull-delete', 'rejected-invalid'], true)) fail(422, 'invalid', 'this item holds no version to restore');
    $cur = rec_load($db, $type, $id); $curData = $cur && !(int)$cur['deleted'] ? rec_data($c, $cur) : null;
    $at = iso_ms(max(ts_ms(now_iso()), $cur ? ts_ms($cur['updated_at']) + 1 : 0));
    $code = rec_code($data) ?: rec_code($curData) ?: (string)($p['code'] ?? '');
    $ci = client_info($c);
    $jr = jr_new('journal_restore', $who, $ci, ['source' => ['jid' => $jid, 'n' => $n, 'version' => $ver]]);
    $jr['n']['sent'] = 1; $jr['n']['accepted'] = 1;
    if ($data !== null) { $data['id'] = $id; unset($data['updated_at']); rec_write($db, $c, $type, $id, $at, false, $who['user'], $data, $ci['device_id']); }
    else rec_write($db, $c, $type, $id, $at, true, $who['user'], ['code' => $code], $ci['device_id']);
    jr_item($jr, $type, $id, 'restore', ['code' => $code, 'reason' => 'journal ' . $jid . '/' . $n . ' ' . $ver, 'prev_updated_at' => $cur ? $cur['updated_at'] : null, 'new_updated_at' => $at,
      'prev_hash' => $curData !== null ? jr_hash($curData) : ($cur ? jr_tomb_hash($type, $id, $cur['updated_at']) : null), 'new_hash' => $data !== null ? jr_hash($data) : jr_tomb_hash($type, $id, $at), 'prev' => $curData, 'new' => $data]);
    $jr['seq_to'] = max_seq($db);
    $newJid = jr_write($db, $c, $jr);
    log_insert($db, $c, ['id' => bin2hex(random_bytes(16)), 'at' => $at, 'who' => $who['user'], 'action' => 'sync.restore', 'source' => 'sync', 'target' => ['type' => $type, 'id' => $id, 'code' => $code],
      'summary' => 'Ripristinata dal registro sincronizzazioni una versione di ' . ($code !== '' ? $code : $id) . ' (voce ' . $jid . '/' . $n . ')', 'details' => ['journal_id' => $jid, 'n' => $n, 'version' => $ver, 'new_journal_id' => $newJid, 'new_updated_at' => $at, 'deleted' => $data === null]]);
    $db->exec('COMMIT');
  } catch (Throwable $ex) { try { $db->exec('ROLLBACK'); } catch (Throwable $e2) {} throw $ex; }
  return ['ok' => true, 'type' => $type, 'id' => $id, 'updated_at' => $at, 'deleted' => $data === null, 'journal_id' => $newJid, 'seq' => max_seq($db)];
}

function r_tokens(PDO $db, array $c): array {
  $items = [];
  foreach ((array)$c['tokens'] as $i => $t) if (is_array($t)) $items[] = ['id' => 'cfg:' . $i, 'user' => (string)($t['user'] ?? ''), 'role' => (string)($t['role'] ?? ''), 'source' => 'config', 'revoked_at' => !empty($t['disabled']) ? 'config' : null];
  foreach ($db->query('SELECT id, user, role, created_at, created_by, revoked_at FROM tokens ORDER BY created_at') as $r) $items[] = ['id' => 'db:' . $r['id'], 'user' => $r['user'], 'role' => $r['role'], 'source' => 'database', 'created_at' => $r['created_at'], 'created_by' => $r['created_by'], 'revoked_at' => $r['revoked_at']];
  return ['items' => $items];
}
function r_token_create(PDO $db, array $c, array $who): array {
  $user = trim((string)param($c, 'user', '')); $role = (string)param($c, 'role', 'editor');
  if (!preg_match('/^[\p{L}\p{N} ._@-]{1,60}$/u', $user) || !isset(DM_ROLES[$role])) fail(422, 'invalid', 'user (1-60 chars) and role viewer|editor|admin required');
  if (lic_required($c)) { $u = lic_active_users($db, $c); lic_limit_block($c, 'users', count($u), isset($u[$user]) ? 0 : 1); }   // v12.6 licence limit 'users'
  $tok = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
  $id = bin2hex(random_bytes(8));
  $db->prepare('INSERT INTO tokens (id, token_sha256, user, role, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')->execute([$id, hash('sha256', $tok), $user, $role, now_iso(), $who['user']]);
  return ['id' => 'db:' . $id, 'user' => $user, 'role' => $role, 'token' => $tok];
}
function r_token_revoke(PDO $db, array $c): array {
  $id = (string)param($c, 'id', '');
  if (!preg_match('/^db:([0-9a-f]{16})$/', $id, $m)) fail(422, 'invalid', 'only database tokens (db:…) can be revoked here; config tokens: set "disabled" => true in config.php');
  $st = $db->prepare('UPDATE tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL'); $st->execute([now_iso(), $m[1]]);
  if (!$st->rowCount()) fail(404, 'not_found', 'token not found');
  return ['ok' => true];
}

/* ---------------- v12: access log (who looked at what, when, how) ----------------
   One row per read of a binder / location (routes binder, location, resolve) and per view the client reports later with
   `seen` (a page served from its own copy). Plaintext columns: times, route, via, role, token id, record type and id.
   User, device and code are HMAC index columns (k_user = hidx('user/'+lower), k_device = hidx('device/'+id),
   k_code = hidx(upper(code))); everything readable (user, device name, app, code, IP) is in `meta`, AES-256-GCM with
   AAD access/<aid>. The same token + device reading the same record the same way within access_dedupe_seconds is ONE
   row (a page that refreshes does not flood the log). Retention: access_keep_days (default 365, 0 = keep everything). */
function acc_via($v, string $dflt): string { $v = is_string($v) ? strtolower(trim($v)) : ''; return in_array($v, DM_ACCESS_VIA, true) ? $v : $dflt; }
/** Writes one access row (single INSERT + UPDATE, inside the caller's transaction if any). $at = when it was seen (client time for `seen`). */
function acc_write(PDO $db, array $c, array $who, array $ci, string $route, string $type, string $id, string $code, string $via, ?string $at = null): ?int {
  if (!in_array($type, DM_ACCESS_TYPES, true) || !valid_id($id)) return null;
  $now = now_iso(); $at = $at ?? $now;
  $kd = hidx($c, 'device/' . $ci['device_id']);
  $dd = max(0, (int)$c['access_dedupe_seconds']);
  if ($route !== 'seen' && $dd > 0) {   // same reader, same record, same way, a moment ago: keep the first row
    $q = $db->prepare('SELECT aid FROM access_log WHERE target_type = ? AND target_id = ? AND token_id = ? AND k_device = ? AND via = ? AND route <> ? AND at >= ? LIMIT 1');
    $q->execute([$type, $id, (string)$who['token_id'], $kd, $via, 'seen', iso_ms(ts_ms($now) - $dd * 1000)]);
    if ($q->fetchColumn() !== false) return null;
  }
  if ($route === 'seen') {   // a re-sent report (same reader, device and record, same moment ± access_dedupe_seconds) is recorded once
    $ta = ts_ms($at);
    $q = $db->prepare('SELECT aid FROM access_log WHERE route = ? AND target_type = ? AND target_id = ? AND token_id = ? AND k_device = ? AND at >= ? AND at <= ? LIMIT 1');
    $q->execute(['seen', $type, $id, (string)$who['token_id'], $kd, iso_ms($ta - $dd * 1000), iso_ms($ta + $dd * 1000)]);
    if ($q->fetchColumn() !== false) return null;
  }
  $st = $db->prepare('INSERT INTO access_log (at, received_at, route, via, token_id, role, k_user, k_device, target_type, target_id, k_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  $st->execute([$at, $now, $route, $via, (string)$who['token_id'], (string)$who['role'], hidx($c, 'user/' . strtolower((string)$who['user'])), $kd, $type, $id, $code !== '' ? hidx($c, strtoupper(trim($code))) : null]);
  $aid = (int)$db->lastInsertId();
  $meta = ['user' => (string)$who['user'], 'device_id' => $ci['device_id'], 'device_name' => $ci['device_name'], 'app_version' => $ci['app_version'], 'code' => $code, 'ip' => client_ip()];
  $u = $db->prepare('UPDATE access_log SET meta = ? WHERE aid = ?'); $u->bindValue(1, enc($c, jenc($meta), 'access/' . $aid), PDO::PARAM_LOB); $u->bindValue(2, $aid, PDO::PARAM_INT); $u->execute();
  return $aid;
}
/** After a successful read (binder, location, resolve): log it. Never makes the read fail. */
function acc_after_read(PDO $db, array $c, array $who, string $route, array $res): void {
  try {
    $type = $route === 'resolve' ? (string)($res['type'] ?? '') : $route;
    $rec = $type === 'binder' ? ($res['binder'] ?? []) : ($res['location'] ?? []);
    $code = (string)($type === 'binder' ? ($rec['speaking_code'] ?? '') : ($rec['code'] ?? ''));
    $dflt = $route === 'binder' && trim((string)param($c, 'qr', '')) === '' ? 'search' : 'qr';
    acc_write($db, $c, $who, client_info($c), $route, $type, (string)($rec['id'] ?? ''), cut_str($code, 100), acc_via(param($c, 'via', ''), $dflt));
    acc_prune($db, $c);
  } catch (Throwable $e) { error_log('docmap access_log: ' . $e->getMessage()); }
}
function acc_prune(PDO $db, array $c): void {
  $days = (int)$c['access_keep_days']; if ($days <= 0) return;
  $last = (string)($db->query("SELECT v FROM meta WHERE k = 'access_pruned_at'")->fetchColumn() ?: '');
  if ($last !== '' && ts_ms($last) > ts_ms(now_iso()) - 86400000) return;
  $db->prepare('DELETE FROM access_log WHERE at < ?')->execute([iso_ms(ts_ms(now_iso()) - $days * 86400000)]);
  $db->prepare("INSERT INTO meta (k, v) VALUES ('access_pruned_at', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")->execute([now_iso()]);
}
function acc_meta(array $c, array $row): array { $m = $row['meta'] ? json_decode(dec($c, $row['meta'], 'access/' . $row['aid']), true) : null; return is_array($m) ? $m : []; }
/** Shared target filter: type (binder|location), target or id (record id), code (human code, HMAC index). */
function acc_target_where(array $c, array &$where, array &$args): bool {
  $type = trim((string)param($c, 'type', '')); $id = trim((string)param($c, 'target', param($c, 'id', ''))); $code = strtoupper(trim((string)param($c, 'code', '')));
  if ($type !== '') { if (!in_array($type, DM_ACCESS_TYPES, true)) fail(422, 'invalid', 'type must be binder or location'); $where[] = 'target_type = ?'; $args[] = $type; }
  if ($id !== '') { if (!valid_id($id)) fail(400, 'invalid', 'target'); $where[] = 'target_id = ?'; $args[] = $id; }
  if ($code !== '') { $where[] = 'k_code = ?'; $args[] = hidx($c, $code); }
  return $id !== '' || $code !== '';
}
/** List (newest received first, paged with before=<aid>). Filters: user (admin only), device, type, target (record id)
    or id, code, via, route, from, to (on `at`). Editors only ever see their own rows; viewers get 403 from the dispatcher. */
function r_access(PDO $db, array $c, array $who): array {
  $admin = $who['role'] === 'admin';
  $where = []; $args = [];
  $user = $admin ? trim((string)param($c, 'user', '')) : (string)$who['user'];
  if ($user !== '') { $where[] = 'k_user = ?'; $args[] = hidx($c, 'user/' . strtolower($user)); }
  acc_target_where($c, $where, $args);
  $dev = trim((string)param($c, 'device', '')); if ($dev !== '') { $where[] = 'k_device = ?'; $args[] = hidx($c, 'device/' . $dev); }
  $via = trim((string)param($c, 'via', '')); if ($via !== '') { $where[] = 'via = ?'; $args[] = acc_via($via, ''); }
  $route = trim((string)param($c, 'route', '')); if ($route !== '') { $where[] = 'route = ?'; $args[] = $route; }
  $from = trim((string)param($c, 'from', '')); $to = trim((string)param($c, 'to', ''));
  if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) $to .= 'T23:59:59.999Z';
  if ($from !== '') { $where[] = 'at >= ?'; $args[] = $from; }
  if ($to !== '') { $where[] = 'at <= ?'; $args[] = $to; }
  $before = (int)param($c, 'before', 0); if ($before > 0) { $where[] = 'aid < ?'; $args[] = $before; }
  $limit = max(1, min(DM_ACCESS_PAGE_MAX, (int)param($c, 'limit', DM_ACCESS_PAGE)));
  $q = $db->prepare('SELECT * FROM access_log' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY aid DESC LIMIT ' . ($limit + 1));
  $q->execute($args); $rows = $q->fetchAll();
  $more = count($rows) > $limit; if ($more) array_pop($rows);
  $items = [];
  foreach ($rows as $r) {
    $m = acc_meta($c, $r);
    $e = ['aid' => (int)$r['aid'], 'at' => $r['at'], 'received_at' => $r['received_at'], 'route' => $r['route'], 'via' => $r['via'], 'role' => $r['role'], 'token_id' => $r['token_id'],
      'user' => (string)($m['user'] ?? ''), 'device' => ['id' => (string)($m['device_id'] ?? 'unknown'), 'name' => (string)($m['device_name'] ?? 'unknown'), 'app' => (string)($m['app_version'] ?? 'unknown')],
      'target' => ['type' => $r['target_type'], 'id' => $r['target_id'], 'code' => (string)($m['code'] ?? '')]];
    if ($admin) $e['ip'] = (string)($m['ip'] ?? '');
    $items[] = $e;
  }
  return ['items' => $items, 'more' => $more, 'next_before' => $more && $rows ? (int)end($rows)['aid'] : null, 'server_time' => now_iso()];
}
/** "Who looked at it last": the latest N accesses of ONE binder / location (type + id, or code), for any role. */
function r_last_seen(PDO $db, array $c): array {
  $where = []; $args = [];
  if (!acc_target_where($c, $where, $args)) fail(400, 'invalid', 'id (or code) required');
  $limit = max(1, min(DM_LAST_SEEN_MAX, (int)param($c, 'limit', 5)));
  $q = $db->prepare('SELECT * FROM access_log WHERE ' . implode(' AND ', $where) . ' ORDER BY at DESC, aid DESC LIMIT ' . $limit); $q->execute($args);
  $items = [];
  foreach ($q->fetchAll() as $r) { $m = acc_meta($c, $r); $items[] = ['at' => $r['at'], 'user' => (string)($m['user'] ?? ''), 'via' => $r['via'], 'route' => $r['route'], 'device_name' => (string)($m['device_name'] ?? 'unknown')]; }
  $n = $db->prepare('SELECT COUNT(*) FROM access_log WHERE ' . implode(' AND ', $where)); $n->execute($args);
  return ['items' => $items, 'total' => (int)$n->fetchColumn(), 'server_time' => now_iso()];
}
/** POST {items:[{type, id, code, at, via}]} (≤ 500): views the client served from its own copy (offline, cache, desktop).
    `at` must be within the retention window and not in the future (+5 min tolerance); re-sent items are recorded once. */
function r_seen(PDO $db, array $c, array $who): array {
  $list = body($c)['items'] ?? null;
  if (!is_array($list)) fail(400, 'invalid', 'items required');
  if (count($list) > DM_SEEN_MAX) fail(413, 'too_large', 'at most ' . DM_SEEN_MAX . ' items per call');
  $ci = client_info($c); $now = ts_ms(now_iso()); $keep = (int)$c['access_keep_days'];
  $rec = 0; $skip = 0;
  $db->exec('BEGIN IMMEDIATE');
  try {
    foreach ($list as $it) {
      $type = is_array($it) ? (string)($it['type'] ?? 'binder') : ''; $id = is_array($it) ? ($it['id'] ?? '') : ''; $t = is_array($it) ? ts_ms($it['at'] ?? '') : 0;
      if (!in_array($type, DM_ACCESS_TYPES, true) || !valid_id($id) || $t <= 0 || $t > $now + 300000 || ($keep > 0 && $t < $now - $keep * 86400000)) { $skip++; continue; }
      $aid = acc_write($db, $c, $who, $ci, 'seen', $type, $id, cut_str($it['code'] ?? '', 100), acc_via($it['via'] ?? '', 'nav'), iso_ms($t));
      if ($aid) $rec++; else $skip++;
    }
    $db->exec('COMMIT');
  } catch (Throwable $e) { try { $db->exec('ROLLBACK'); } catch (Throwable $e2) {} throw $e; }
  acc_prune($db, $c);
  return ['recorded' => $rec, 'skipped' => $skip, 'server_time' => now_iso()];
}

/* ---------------- licence (v12.6, optional) ----------------
   Same rules as server-python/docmap_server/licence.py + licence_verify.py (the hub's verifier): OFF unless config.php
   says 'licence_required' => true; then the licence is <data_dir>/licence/licence.docmap-licence (Ed25519 signature
   checked with libsodium against the TRUSTED keys: the constant below + server-php/trusted_keys.json written by the hub
   + 'licence_public_keys' in config.php, TESTS ONLY). full / grace → writable; read_only / invalid → write routes answer
   403 licence_read_only (reads, pull and exports keep working: the licence never locks the data); limits binders/users
   → 403 licence_limit. PHP only: a licence shipped with the site (server-php/licence.docmap-licence, put there by the
   hub's site build) is installed into the data folder when it is newer; the licence channel (update_url signed in the
   licence) is checked after the answer at most every 6 hours. */
const DM_LIC_TRUSTED = [];   // {key_id: base64 Ed25519 public key}; production keys usually come from trusted_keys.json
const DM_LIC_GRACE_DEFAULT = 30, DM_LIC_WARN_DAYS = 30, DM_LIC_SKEW = 86400, DM_LIC_UPDATE_SECONDS = 21600, DM_LIC_MAX_BYTES = 65536;
const DM_LIC_FIELDS = ['licence_id', 'format', 'customer', 'instance_id', 'plan', 'issued_at', 'valid_from', 'expires_at', 'grace_days', 'limits', 'features', 'reseller', 'branding', 'key_id'];
const DM_LIC_MSG = [
  'ok' => 'Licenza valida.',
  'expiring_soon' => 'La licenza scade tra pochi giorni: contatta il fornitore per il rinnovo.',
  'expired_in_grace' => 'Licenza scaduta: periodo di tolleranza in corso. Rinnova per evitare la sola lettura.',
  'expired_beyond_grace' => 'Licenza scaduta oltre la tolleranza: archivio in sola lettura. I dati restano consultabili ed esportabili.',
  'not_yet_valid' => 'La licenza non è ancora attiva (data di inizio futura): archivio in sola lettura.',
  'missing' => 'Nessuna licenza installata: archivio in sola lettura.',
  'bad_file' => 'File di licenza illeggibile: archivio in sola lettura.',
  'unsupported_format' => 'Formato di licenza non supportato da questa versione: archivio in sola lettura.',
  'bad_fields' => 'Licenza incompleta o con campi non validi: archivio in sola lettura.',
  'unknown_key' => 'Licenza firmata con una chiave sconosciuta: archivio in sola lettura.',
  'key_id_mismatch' => 'Licenza incoerente (identificativo chiave): archivio in sola lettura.',
  'bad_signature' => 'Firma della licenza non valida (file modificato?): archivio in sola lettura.',
  'instance_mismatch' => "La licenza è intestata a un'altra installazione: archivio in sola lettura.",
  'suspended' => 'Licenza sospesa dal fornitore: archivio in sola lettura. I dati restano consultabili ed esportabili.',
  'revoked' => 'Licenza revocata: archivio in sola lettura. I dati restano consultabili ed esportabili.',
];
function lic_required(array $c): bool { $v = $c['licence_required'] ?? null; return $v === true || $v === 1; }
function lic_b64key($v): bool { if (!is_string($v) || trim($v) === '' || strlen($v) > 100) return false; $r = base64_decode(trim($v), true); return $r !== false && strlen($r) === 32; }
function lic_trusted(array $c): array {
  $keys = [];
  $f = __DIR__ . '/trusted_keys.json';
  if (is_file($f) && filesize($f) <= DM_LIC_MAX_BYTES) {
    $o = json_decode((string)@file_get_contents($f), true);
    if (is_array($o) && is_array($o['keys'] ?? null)) foreach ($o['keys'] as $k => $v) {
      if (preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/', (string)$k) && lic_b64key($v)) $keys[(string)$k] = trim($v); else error_log('docmap: trusted_keys.json: key ignored');
    }
  }
  foreach (DM_LIC_TRUSTED as $k => $v) $keys[(string)$k] = $v;
  if (is_array($c['licence_public_keys'] ?? null)) foreach ($c['licence_public_keys'] as $k => $v) if (is_string($v)) $keys[(string)$k] = $v;   // TESTS / DEVELOPMENT ONLY
  return $keys;
}
/* canonical JSON = Python json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False); input decoded as objects */
function lic_canon($v): string {
  if (is_float($v)) throw new InvalidArgumentException('float in licence');
  if ($v instanceof stdClass) { $a = get_object_vars($v); ksort($a, SORT_STRING); $p = []; foreach ($a as $k => $x) $p[] = lic_canon((string)$k) . ':' . lic_canon($x); return '{' . implode(',', $p) . '}'; }
  if (is_array($v)) return '[' . implode(',', array_map('lic_canon', $v)) . ']';
  $s = json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
  if ($s === false) throw new InvalidArgumentException('not encodable');
  return $s;
}
function lic_time($v): ?float {
  if (!is_string($v) || trim($v) === '') return null;
  $t = trim($v); if (!preg_match('/(Z|z|[+-]\d{2}:?\d{2})$/', $t)) return null;
  if (!preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|z|[+-]\d{2}:?\d{2})$/', $t)) return null;
  try { $d = new DateTimeImmutable(strtoupper(substr($t, -1)) === 'Z' ? substr($t, 0, -1) . '+00:00' : $t); return (float)$d->format('U.u'); } catch (Throwable $e) { return null; }
}
function lic_days(float $sec): int { return $sec >= 0 ? (int)ceil($sec / 86400) : -(int)ceil(-$sec / 86400); }
function lic_truthy($v): bool { return !($v === null || $v === false || $v === 0 || $v === '' || $v === [] || ($v instanceof stdClass && !get_object_vars($v))); }
function lic_fields($lic): array {
  if (!($lic instanceof stdClass)) return ['licence is not an object'];
  $e = []; $a = get_object_vars($lic);
  foreach (DM_LIC_FIELDS as $f) if (!array_key_exists($f, $a)) $e[] = 'missing field: ' . $f;
  if ($e) return $e;
  if ($a['format'] !== 1) $e[] = 'format must be 1';
  foreach (['licence_id', 'instance_id', 'plan', 'key_id'] as $f) if (!is_string($a[$f]) || trim($a[$f]) === '') $e[] = $f . ' must be a non-empty string';
  $cu = $a['customer']; if (!($cu instanceof stdClass) || !is_string($cu->name ?? null) || trim($cu->name) === '') $e[] = 'customer.name is required';
  $bad = false; foreach (['issued_at', 'valid_from', 'expires_at'] as $f) if (lic_time($a[$f]) === null) { $e[] = $f . ' is not an ISO UTC timestamp'; $bad = true; }
  if (!$e && lic_time($a['expires_at']) <= lic_time($a['valid_from'])) $e[] = 'expires_at must be after valid_from';
  if (!is_int($a['grace_days']) || $a['grace_days'] < 0) $e[] = 'grace_days must be a non-negative integer';
  if (!($a['limits'] instanceof stdClass)) $e[] = 'limits must be an object';
  else foreach (get_object_vars($a['limits']) as $k => $v) if ($v !== null && (!is_int($v) || $v < 0)) $e[] = 'limits.' . $k . ' must be a non-negative integer or null';
  if (!is_array($a['features']) || array_filter($a['features'], fn($x) => !is_string($x))) $e[] = 'features must be a list of strings';
  $r = $a['reseller']; if ($r !== null && (!($r instanceof stdClass) || !lic_truthy($r->id ?? null) || !lic_truthy($r->name ?? null))) $e[] = 'reseller must be null or {id, name}';
  $b = $a['branding']; if ($b !== null && (!($b instanceof stdClass) || !is_string($b->product_name ?? null))) $e[] = 'branding must be null or {product_name, ...}';
  if (array_key_exists('status', $a) && !in_array($a['status'], ['active', 'suspended', 'revoked'], true)) $e[] = 'status must be one of active, suspended, revoked';
  if (array_key_exists('update_url', $a)) { $u = $a['update_url']; if (!is_string($u) || !preg_match('#^https?://#', $u) || mb_strlen($u) > 400 || preg_match('/\s/u', $u)) $e[] = 'update_url must be an http(s) URL'; }
  if (array_key_exists('resume', $a) && !($a['resume'] instanceof stdClass)) $e[] = 'resume must be an object';
  return $e;
}
function lic_st(string $mode, string $reason, $lic = null, bool $sig = false): array {
  return ['mode' => $mode, 'reasons' => [$reason], 'licence' => $lic, 'signature_ok' => $sig, 'days_left' => null, 'grace_days_left' => null, 'expiring_soon' => false];
}
function lic_verify(?string $raw, array $keys, ?string $iid, ?float $now = null): array {
  if ($raw === null || trim($raw) === '') return lic_st('invalid', 'missing');
  if (substr($raw, 0, 3) === "\xEF\xBB\xBF") $raw = substr($raw, 3);
  $o = json_decode($raw, false);
  if (!($o instanceof stdClass) || !(($o->licence ?? null) instanceof stdClass)) return lic_st('invalid', 'bad_file');
  $lic = $o->licence;
  if (($o->format ?? null) !== 1 || ($lic->format ?? null) !== 1) return lic_st('invalid', 'unsupported_format', $lic);
  $kid = $o->key_id ?? null;
  if (!is_string($kid) || $kid !== ($lic->key_id ?? null)) return lic_st('invalid', 'key_id_mismatch', $lic);
  if (!array_key_exists($kid, $keys)) return lic_st('invalid', 'unknown_key', $lic);
  try {
    $pub = base64_decode(trim((string)$keys[$kid]), true); $sig = base64_decode((string)($o->signature ?? ''), true);
    if ($pub === false || strlen($pub) !== 32 || $sig === false || strlen($sig) !== 64 || !function_exists('sodium_crypto_sign_verify_detached')
        || !sodium_crypto_sign_verify_detached($sig, lic_canon($lic), $pub)) return lic_st('invalid', 'bad_signature', $lic);
  } catch (Throwable $e) { return lic_st('invalid', 'bad_signature', $lic); }
  if (lic_fields($lic)) return lic_st('invalid', 'bad_fields', $lic);
  if ($iid !== null && $lic->instance_id !== $iid) return lic_st('invalid', 'instance_mismatch', $lic);
  $t = $now ?? microtime(true);
  $from = lic_time($lic->valid_from); $exp = lic_time($lic->expires_at); $gend = $exp + $lic->grace_days * 86400;
  $st = lic_st('full', 'ok', $lic, true); $st['days_left'] = lic_days($exp - $t);
  $status = $lic->status ?? null;
  if ($status === 'suspended' || $status === 'revoked') { $st['mode'] = 'read_only'; $st['grace_days_left'] = 0; $st['reasons'] = [$status]; }
  elseif ($t + DM_LIC_SKEW < $from) { $st['mode'] = 'read_only'; $st['reasons'] = ['not_yet_valid']; }
  elseif ($t < $exp) { $st['expiring_soon'] = $st['days_left'] <= DM_LIC_WARN_DAYS; $st['reasons'] = [$st['expiring_soon'] ? 'expiring_soon' : 'ok']; }
  elseif ($t < $gend) { $st['mode'] = 'grace'; $st['grace_days_left'] = lic_days($gend - $t); $st['reasons'] = ['expired_in_grace']; }
  else { $st['mode'] = 'read_only'; $st['grace_days_left'] = 0; $st['reasons'] = ['expired_beyond_grace']; }
  return $st;
}
function lic_writable(array $st): bool { return $st['mode'] === 'full' || $st['mode'] === 'grace'; }
function lic_message(array $st): string {
  foreach ($st['reasons'] as $r) {
    if ($r === 'ok') continue;
    if ($r === 'expiring_soon' && $st['days_left'] !== null) return 'La licenza scade tra ' . $st['days_left'] . ' giorni: contatta il fornitore per il rinnovo.';
    if ($r === 'expired_in_grace' && $st['grace_days_left'] !== null) return 'Licenza scaduta: restano ' . $st['grace_days_left'] . " giorni di tolleranza, poi l'archivio passa in sola lettura. Rinnova la licenza.";
    return DM_LIC_MSG[$r] ?? '';
  }
  return DM_LIC_MSG['ok'];
}
function lic_path(array $c): string { return rtrim((string)$c['data_dir'], '/\\') . '/licence/licence.docmap-licence'; }
function lic_iid_path(array $c): string { return rtrim((string)$c['data_dir'], '/\\') . '/instance.json'; }
function lic_read_iid(array $c): ?string {
  $f = lic_iid_path($c); if (!is_file($f)) return null;
  $raw = (string)@file_get_contents($f); if (substr($raw, 0, 3) === "\xEF\xBB\xBF") $raw = substr($raw, 3);
  $o = json_decode($raw, true); $i = is_array($o) ? ($o['instance_id'] ?? null) : null;
  return is_string($i) && trim($i) !== '' ? $i : null;
}
function lic_write_iid(array $c, string $iid): void { $f = lic_iid_path($c); @file_put_contents($f . '.tmp', json_encode(['instance_id' => $iid], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n"); @rename($f . '.tmp', $f); }
function lic_install(array $c, string $raw, array $st): void {
  $d = dirname(lic_path($c)); if (!is_dir($d)) @mkdir($d, 0700, true);
  if (is_file(lic_path($c))) @copy(lic_path($c), $d . '/licence.prev.docmap-licence');
  if (@file_put_contents(lic_path($c) . '.tmp', $raw) !== false) @rename(lic_path($c) . '.tmp', lic_path($c));
  if (lic_read_iid($c) === null) lic_write_iid($c, $st['licence']->instance_id);
  $GLOBALS['DM_LIC_CACHE'] = null;
}
/* may $raw replace the installed licence? (genuine, this installation, issued after the installed one) */
function lic_newer(array $c, string $raw, array $keys): ?array {
  $st = lic_verify($raw, $keys, lic_read_iid($c));
  if (!$st['signature_ok'] || $st['mode'] === 'invalid') return null;
  $cur = lic_verify(is_file(lic_path($c)) ? (string)@file_get_contents(lic_path($c)) : null, $keys, lic_read_iid($c));
  if ($cur['signature_ok'] && $cur['licence']) {
    if ($st['licence']->licence_id === $cur['licence']->licence_id) return null;
    if (lic_time($st['licence']->issued_at) < lic_time($cur['licence']->issued_at)) return null;
  }
  return $st;
}
function lic_status(array $c): array {
  if (isset($GLOBALS['DM_LIC_CACHE']) && $GLOBALS['DM_LIC_CACHE']) return $GLOBALS['DM_LIC_CACHE'];
  $keys = lic_trusted($c);
  $ship = __DIR__ . '/licence.docmap-licence';   // shipped with the site by the hub
  if (is_file($ship) && filesize($ship) <= DM_LIC_MAX_BYTES) { $raw = (string)@file_get_contents($ship); $st = lic_newer($c, $raw, $keys); if ($st) lic_install($c, $raw, $st); }
  $raw = is_file(lic_path($c)) ? (string)@file_get_contents(lic_path($c)) : null;
  $iid = lic_read_iid($c);
  $st = lic_verify($raw, $keys, $iid);
  if ($iid === null && $st['signature_ok'] && $st['licence'] && is_string($st['licence']->instance_id ?? null)) lic_write_iid($c, $st['licence']->instance_id);
  return $GLOBALS['DM_LIC_CACHE'] = $st;
}
function lic_summary(array $st, bool $detailed): array {
  $out = ['mode' => $st['mode'], 'writable' => lic_writable($st), 'message_it' => lic_message($st), 'reasons' => $st['reasons'],
    'days_left' => $st['days_left'], 'grace_days_left' => $st['grace_days_left'], 'expiring_soon' => $st['expiring_soon']];
  if ($detailed) {
    $ok = $st['signature_ok'] && $st['licence']; $lic = $ok ? $st['licence'] : null;
    $feats = $ok && is_array($lic->features ?? null) ? array_values(array_unique($lic->features)) : []; sort($feats, SORT_STRING);
    $cust = $ok && ($lic->customer ?? null) instanceof stdClass ? $lic->customer : new stdClass();
    $out += ['features' => $feats, 'limits' => $ok && ($lic->limits ?? null) instanceof stdClass ? get_object_vars($lic->limits) : [],   // empty = [] like the Python port's PHP-compatible encoder
      'branding' => $ok ? ($lic->branding ?? null) : null,
      'licence' => $ok ? ['licence_id' => $lic->licence_id ?? null, 'customer' => ['name' => $cust->name ?? null], 'plan' => $lic->plan ?? null, 'valid_from' => $lic->valid_from ?? null,
        'expires_at' => $lic->expires_at ?? null, 'instance_id' => $lic->instance_id ?? null] : null];
  }
  return $out;
}
function lic_write_block(array $c): void {
  if (!lic_required($c)) return;
  $st = lic_status($c);
  if (!lic_writable($st)) fail(403, 'licence_read_only', 'licence expired or missing: the server is in read-only mode', ['mode' => $st['mode'], 'reasons' => $st['reasons'], 'message_it' => lic_message($st)]);
}
function lic_limit_block(array $c, string $name, int $used, int $adding): void {
  if (!lic_required($c) || $adding <= 0) return;
  $st = lic_status($c);
  $lim = $st['signature_ok'] && $st['licence'] && ($st['licence']->limits ?? null) instanceof stdClass ? ($st['licence']->limits->$name ?? null) : null;
  $u = $used + $adding - 1;
  if (lic_writable($st) && ($lim === null || $u < $lim)) return;
  fail(403, 'licence_limit', 'licence limit reached: ' . $name, ['limit' => $name, 'max' => $lim, 'used' => $used, 'adding' => $adding,
    'message_it' => 'Limite della licenza raggiunto (' . $name . '): contatta il fornitore per ampliare il piano.']);
}
function lic_active_users(PDO $db, array $c): array {
  $n = [];
  foreach ((array)$c['tokens'] as $i => $t) if (is_array($t) && empty($t['disabled'])) $n[(string)($t['user'] ?? 'user' . $i)] = 1;
  foreach ($db->query('SELECT DISTINCT user FROM tokens WHERE revoked_at IS NULL') as $r) $n[(string)$r['user']] = 1;
  return $n;
}
function lic_push_binder_limit(PDO $db, array $c, array $b): void {
  $new = [];
  foreach ((array)($b['records'] ?? []) as $r) {
    if (!is_array($r)) continue;
    $id = $r['id'] ?? ''; $data = $r['data'] ?? null;
    if (($r['type'] ?? '') !== 'binder' || !valid_id($id) || !is_array($data)) continue;
    $u = (string)($r['updated_at'] ?? ($data['updated_at'] ?? ''));
    if (ts_ms($u) <= 0) continue;
    $cur = rec_load($db, 'binder', $id);
    if ($cur === null || ((int)$cur['deleted'] && ts_ms($u) > ts_ms($cur['updated_at']))) $new[$id] = 1;
  }
  if (!$new) return;
  $used = (int)$db->query("SELECT COUNT(*) FROM records WHERE type = 'binder' AND deleted = 0")->fetchColumn();
  lic_limit_block($c, 'binders', $used, count($new));
}
/* licence channel: after the answer, at most every 6 hours (PHP has no background thread) */
function lic_channel_update(array $c): void {
  try {
    if (!lic_required($c)) return;
    $stamp = dirname(lic_path($c)) . '/.last-update';
    if (is_file($stamp) && time() - (int)@filemtime($stamp) < DM_LIC_UPDATE_SECONDS) return;
    if (!is_dir(dirname($stamp))) @mkdir(dirname($stamp), 0700, true);
    @touch($stamp);
    $url = is_string($c['licence_update_url'] ?? null) && preg_match('#^https?://#', $c['licence_update_url']) ? $c['licence_update_url'] : null;
    $st = lic_status($c);
    if (!$url && $st['signature_ok'] && is_string($st['licence']->update_url ?? null)) $url = $st['licence']->update_url;
    if (!$url || !preg_match('#^https?://#', $url)) return;
    $ctx = stream_context_create(['http' => ['timeout' => 10, 'header' => "User-Agent: DocMap-php licence update\r\nCache-Control: no-cache\r\n", 'ignore_errors' => false]]);
    $raw = @file_get_contents($url, false, $ctx, 0, DM_LIC_MAX_BYTES + 1);
    if (!is_string($raw) || $raw === '' || strlen($raw) > DM_LIC_MAX_BYTES) return;
    $new = lic_newer($c, $raw, lic_trusted($c));
    if ($new) { lic_install($c, $raw, $new); error_log('docmap: new licence installed from the channel (' . $new['licence']->licence_id . ')'); }
  } catch (Throwable $e) { error_log('docmap: licence update failed: ' . $e->getMessage()); }
}

/* ---------------- dispatch ---------------- */
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
  try {
    $route = (string)($_GET['r'] ?? '');
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($route === 'ping'){   // works without config (set-up check) and lets the app measure the clock skew
      $pc = null; try { $pc = load_config(); cors($pc); } catch (Throwable $e) {}   // CORS headers only for allowed origins
      if ($method === 'OPTIONS') { http_response_code(204); exit; }
      $res = r_ping([]);
      if ($pc !== null && lic_required($pc)) $res['licence'] = lic_summary(lic_status($pc), false);   // v12.6: short, no customer data (ping needs no token)
      out(200, $res); exit;
    }
    $c = load_config();
    cors($c);
    if ($method === 'OPTIONS') { http_response_code(204); exit; }
    $reads = ['me' => 'viewer', 'pull' => 'viewer', 'binder' => 'viewer', 'location' => 'viewer', 'resolve' => 'viewer', 'tokens' => 'admin', 'journal' => 'editor', 'access' => 'editor', 'last_seen' => 'viewer'];
    $writes = ['push' => 'editor', 'patch' => 'editor', 'token_create' => 'admin', 'token_revoke' => 'admin', 'journal_restore' => 'admin', 'seen' => 'viewer'];
    if (!isset($reads[$route]) && !isset($writes[$route])) fail(404, 'no_route', 'unknown route');
    if (isset($writes[$route]) && $method !== 'POST') fail(405, 'method', 'use POST');
    if (!in_array($method, ['GET', 'POST'], true)) fail(405, 'method', 'use GET or POST');
    $db = db($c);
    $who = auth($db, $c, $reads[$route] ?? $writes[$route]);
    if (isset($writes[$route]) && $route !== 'seen') lic_write_block($c);   // v12.6 licence (only with licence_required): 'seen' records a read, never blocked
    switch ($route) {
      case 'me': $res = ['user' => $who['user'], 'role' => $who['role'], 'token_id' => $who['token_id'], 'studio_name' => (string)$c['studio_name'], 'server_time' => now_iso(),
        'remember_minutes' => is_numeric($c['remember_minutes']) ? (int)$c['remember_minutes'] : null];
        if (lic_required($c)) $res['licence'] = lic_summary(lic_status($c), true);   // v12.6
        break;   // v12: phone sign-in policy (null = device setting)
      case 'pull': $res = r_pull($db, $c, $who); break;
      case 'push': $res = r_push($db, $c, $who); break;
      case 'binder': $res = r_binder($db, $c); header('ETag: "' . $res['etag'] . '"'); acc_after_read($db, $c, $who, $route, $res); break;   // v12: + access_log
      case 'location': $res = r_location($db, $c); header('ETag: "' . $res['etag'] . '"'); acc_after_read($db, $c, $who, $route, $res); break;
      case 'resolve': $res = r_resolve($db, $c); acc_after_read($db, $c, $who, $route, $res); break;
      case 'patch': $res = r_patch($db, $c, $who); header('ETag: "' . $res['etag'] . '"'); break;
      case 'tokens': $res = r_tokens($db, $c); break;
      case 'token_create': $res = r_token_create($db, $c, $who); break;
      case 'journal': $res = r_journal($db, $c, $who); break;
      case 'journal_restore': $res = r_journal_restore($db, $c, $who); break;
      case 'access': $res = r_access($db, $c, $who); break;   // v12
      case 'last_seen': $res = r_last_seen($db, $c); break;
      case 'seen': $res = r_seen($db, $c, $who); break;
      default: $res = r_token_revoke($db, $c);
    }
    out(200, $res);
    if (lic_required($c)) { if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request(); lic_channel_update($c); }   // v12.6 licence channel, after the answer
  } catch (ApiError $e) {
    out($e->status, array_merge(['error' => array_merge(['code' => $e->codeName, 'message' => $e->getMessage()], $e->extra)], array_intersect_key($e->extra, ['current' => 1, 'current_etag' => 1])), $e->headers);
  } catch (Throwable $e) {
    error_log('docmap api: ' . get_class($e) . ': ' . $e->getMessage() . ' @' . basename($e->getFile()) . ':' . $e->getLine());
    out(500, ['error' => ['code' => 'server_error', 'message' => 'internal error (details in the PHP error log)']]);
  }
}
