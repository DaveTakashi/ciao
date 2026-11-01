<?php
/* =====================================================================
   DocMap 2026 — shared online database, REST API (v11, reference implementation; v10.1 databases upgrade in place)

   One file, PHP 8.0+, no Composer: PDO SQLite + OpenSSL. Built for shared hosting (SiteGround: PHP yes,
   Node / Python no). The contract is docs/API-CONTRACT.md: a Python back-end can replace this file 1:1
   (same routes, same JSON, same status codes) without touching the front-end.

   Routes (query routed: api.php?r=<route>; reads accept GET or POST, writes POST only):
     ping                     no token   {ok, api, version, server_time}
     me                       viewer     {user, role, token_id}
     pull   &since=<seq>&log_since=<seq>  viewer   {seq, more, records[], tombstones[], settings, activity_log[], log_seq, server_time}
     push   {records, tombstones, settings?, activity_log?, deviceId, operator}   editor
                                         per-record LAST-WRITE-WINS by updated_at → {applied, same, rejected[], seq, server_time}
     binder &qr=<short_code> | &code=<speaking_code>   viewer   {binder, etag, siblings[]}
     location &qr=<dm26L…> | &id= | &code=<path code>   viewer   {location, etag, path[], children[], binders[], count}   (v11)
     resolve &qr=<short code>                         viewer   {type:'binder'|'location', …}: one QR, either kind (v11)
     patch  {id, patch, base_updated_at, force?, log?}  editor  → {binder, etag} · 409 {error, current, current_etag}
                                         v11: patch may carry location_id (+ location_code, recomputed here from the location)
     tokens / token_create {user, role} / token_revoke {id}   admin   (tokens kept as SHA-256 in the database)
     journal  &from&to&user&device&record&code&before&limit | &entry=<jid>   editor (own entries) / admin (all)
              v11: the push/sync journal — one entry per push / patch / pull (with changes) / restore, one item per record
     journal_restore {jid, n, version:'prev'|'new'}   admin   writes that version again as a NEW write (journaled)

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
const DM_TYPES = ['binder', 'client', 'location'];   // v11: + location (tree of boxes, docs/API-CONTRACT.md §location)
const DM_ROLES = ['viewer' => 1, 'editor' => 2, 'admin' => 3];
const DM_MOBILE_FIELDS = ['archive_state', 'contents_items', 'room_code', 'cabinet_code', 'shelf_code', 'sector_code', 'notes', 'tags', 'location_id', 'location_code'];   // v11: + location (association mode)
const DM_LOC_SC = '/^dm26L[A-Za-z0-9]{8}$/';   // location short codes; binders are dm26 + 8 chars
const DM_CANON_SKIP = ['updated_at', 'short_url', 'location_code', 'selected_for_print'];   // same as SYNC_B_SKIP (06f-sync.js)
const DM_PULL_PAGE = 2000;
const DM_LOG_PAGE = 1000;
const DM_MAX_RECORD = 262144;   // bytes of JSON per record
const DM_SCHEMA = 2;            // server database schema: 1 = v10.1, 2 = v11 (sync_journal + sync_journal_items)
const DM_JOURNAL_PAGE = 50, DM_JOURNAL_PAGE_MAX = 200, DM_JOURNAL_ITEMS_LIST = 500;

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
    'journal_keep_days' => 0, 'journal_pulls' => 'changes'];   // v11 (optional in config.php): 0 = keep the whole journal; pulls: changes | all | none
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
function r_ping(array $c): array { return ['ok' => true, 'api' => DM_API, 'version' => DM_API_VERSION, 'schema' => DM_SCHEMA, 'features' => ['journal', 'device_info', 'locations'], 'server_time' => now_iso(), 'php' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION]; }

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
        if ($rt === $lt && !(int)$cur['deleted'] && jenc(canon($curData)) === jenc(canon($data))) { $same++; $jr['n']['same']++; continue; }
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

function binder_pack(PDO $db, array $c, array $row): array {
  $p = rec_public($c, $row); $b = $p['data']; $sib = [];
  if ($row['k_cab']) {
    $q = $db->prepare("SELECT * FROM records WHERE type = 'binder' AND deleted = 0 AND k_cab = ? AND id <> ? LIMIT 400"); $q->execute([$row['k_cab'], $row['id']]);
    foreach ($q->fetchAll() as $r) { $d = rec_data($c, $r); $sib[] = ['speaking_code' => (string)($d['speaking_code'] ?? ''), 'shelf_code' => (string)($d['shelf_code'] ?? ''), 'sector_code' => (string)($d['sector_code'] ?? ''), 'location_code' => (string)($d['location_code'] ?? '')]; }
  }
  return ['binder' => $b, 'etag' => $row['updated_at'], 'siblings' => $sib];
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
  $kids = []; $binders = []; $n = 0;
  // payloads are encrypted: children and binders are found by decrypting the records of the two types (fine for a studio archive)
  foreach ($db->query("SELECT * FROM records WHERE type = 'location' AND deleted = 0") as $r) { $d = rec_data($c, $r); if ((string)($d['parent_id'] ?? '') === $row['id']) $kids[] = ['id' => $r['id'], 'code' => (string)($d['code'] ?? ''), 'name' => (string)($d['name'] ?? ''), 'kind' => (string)($d['kind'] ?? ''), 'seg' => (string)($d['seg'] ?? ''), 'level' => (int)($d['level'] ?? 0)]; }
  foreach ($db->query("SELECT * FROM records WHERE type = 'binder' AND deleted = 0") as $r) {
    $d = rec_data($c, $r); if ((string)($d['location_id'] ?? '') !== $row['id']) continue;
    $n++; if (count($binders) < 500) $binders[] = ['id' => $r['id'], 'speaking_code' => (string)($d['speaking_code'] ?? ''), 'company_name' => (string)($d['company_name'] ?? ''), 'binder_title' => (string)($d['binder_title'] ?? ''), 'color_hex' => (string)($d['color_hex'] ?? ''), 'short_code' => (string)($d['short_code'] ?? '')];
  }
  usort($kids, fn($a, $b) => strnatcasecmp($a['seg'], $b['seg']));
  usort($binders, fn($a, $b) => strnatcasecmp($a['speaking_code'], $b['speaking_code']));
  return ['location' => $l, 'etag' => $row['updated_at'], 'path' => $path, 'children' => $kids, 'binders' => $binders, 'count' => $n];
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

/* ---------------- dispatch ---------------- */
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
  try {
    $route = (string)($_GET['r'] ?? '');
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($route === 'ping'){   // works without config (set-up check) and lets the app measure the clock skew
      try { cors(load_config()); } catch (Throwable $e) {}   // CORS headers only for allowed origins
      if ($method === 'OPTIONS') { http_response_code(204); exit; }
      out(200, r_ping([])); exit;
    }
    $c = load_config();
    cors($c);
    if ($method === 'OPTIONS') { http_response_code(204); exit; }
    $reads = ['me' => 'viewer', 'pull' => 'viewer', 'binder' => 'viewer', 'location' => 'viewer', 'resolve' => 'viewer', 'tokens' => 'admin', 'journal' => 'editor'];
    $writes = ['push' => 'editor', 'patch' => 'editor', 'token_create' => 'admin', 'token_revoke' => 'admin', 'journal_restore' => 'admin'];
    if (!isset($reads[$route]) && !isset($writes[$route])) fail(404, 'no_route', 'unknown route');
    if (isset($writes[$route]) && $method !== 'POST') fail(405, 'method', 'use POST');
    if (!in_array($method, ['GET', 'POST'], true)) fail(405, 'method', 'use GET or POST');
    $db = db($c);
    $who = auth($db, $c, $reads[$route] ?? $writes[$route]);
    switch ($route) {
      case 'me': $res = ['user' => $who['user'], 'role' => $who['role'], 'token_id' => $who['token_id'], 'studio_name' => (string)$c['studio_name'], 'server_time' => now_iso()]; break;
      case 'pull': $res = r_pull($db, $c, $who); break;
      case 'push': $res = r_push($db, $c, $who); break;
      case 'binder': $res = r_binder($db, $c); header('ETag: "' . $res['etag'] . '"'); break;
      case 'location': $res = r_location($db, $c); header('ETag: "' . $res['etag'] . '"'); break;
      case 'resolve': $res = r_resolve($db, $c); break;
      case 'patch': $res = r_patch($db, $c, $who); header('ETag: "' . $res['etag'] . '"'); break;
      case 'tokens': $res = r_tokens($db, $c); break;
      case 'token_create': $res = r_token_create($db, $c, $who); break;
      case 'journal': $res = r_journal($db, $c, $who); break;
      case 'journal_restore': $res = r_journal_restore($db, $c, $who); break;
      default: $res = r_token_revoke($db, $c);
    }
    out(200, $res);
  } catch (ApiError $e) {
    out($e->status, array_merge(['error' => array_merge(['code' => $e->codeName, 'message' => $e->getMessage()], $e->extra)], array_intersect_key($e->extra, ['current' => 1, 'current_etag' => 1])), $e->headers);
  } catch (Throwable $e) {
    error_log('docmap api: ' . get_class($e) . ': ' . $e->getMessage() . ' @' . basename($e->getFile()) . ':' . $e->getLine());
    out(500, ['error' => ['code' => 'server_error', 'message' => 'internal error (details in the PHP error log)']]);
  }
}
