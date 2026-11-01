<?php
/* =====================================================================
   DocMap 2026 — shared online database, REST API (v10.1, reference implementation)

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
  $c += ['data_dir' => '', 'aes_key' => '', 'tokens' => [], 'allowed_origins' => [], 'max_fails' => 5, 'lock_seconds' => 60, 'max_body_mb' => 20, 'studio_name' => ''];
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
  return $db;
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
  header('Access-Control-Allow-Headers: Content-Type, X-DocMap-Token, Authorization, If-Match');
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

/* ---------------- routes ---------------- */
function r_ping(array $c): array { return ['ok' => true, 'api' => DM_API, 'version' => DM_API_VERSION, 'server_time' => now_iso(), 'php' => PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION]; }

function r_pull(PDO $db, array $c): array {
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
  return ['seq' => $seq, 'more' => $more, 'records' => $records, 'tombstones' => $tombs, 'settings' => $settings, 'activity_log' => $log, 'log_seq' => $logSeq, 'counts' => $counts, 'server_time' => now_iso()];
}

function r_push(PDO $db, array $c, array $who): array {
  $b = body($c);
  $device = substr((string)($b['deviceId'] ?? ''), 0, 100); $op = substr(trim((string)($b['operator'] ?? '')), 0, 80);
  $label = $op !== '' ? $op : $who['user'];
  $applied = 0; $same = 0; $rejected = []; $logged = 0;
  $db->exec('BEGIN IMMEDIATE');
  try {
    foreach ((array)($b['records'] ?? []) as $r) {
      $type = $r['type'] ?? ''; $id = $r['id'] ?? ''; $data = $r['data'] ?? null; $u = (string)($r['updated_at'] ?? ($data['updated_at'] ?? ''));
      if (!in_array($type, DM_TYPES, true) || !valid_id($id) || !is_array($data) || ts_ms($u) <= 0) { $rejected[] = ['type' => (string)$type, 'id' => is_string($id) ? $id : '', 'reason' => 'invalid']; continue; }
      if (strlen(jenc($data)) > DM_MAX_RECORD) { $rejected[] = ['type' => $type, 'id' => $id, 'reason' => 'too_large']; continue; }
      $data['id'] = $id;
      $cur = rec_load($db, $type, $id);
      if ($cur) {
        $lt = ts_ms($cur['updated_at']); $rt = ts_ms($u);
        if ($rt === $lt && !(int)$cur['deleted'] && jenc(canon(rec_data($c, $cur))) === jenc(canon($data))) { $same++; continue; }
        if ($rt <= $lt) { $rejected[] = ['type' => $type, 'id' => $id, 'server_updated_at' => $cur['updated_at'], 'reason' => $rt === $lt ? 'tie' : 'older', 'current' => rec_public($c, $cur)]; continue; }
      }
      rec_write($db, $c, $type, $id, $u, false, $label, $data, $device); $applied++;
    }
    foreach ((array)($b['tombstones'] ?? []) as $t) {
      $type = $t['type'] ?? ''; $id = $t['id'] ?? ''; $d = (string)($t['deletedAt'] ?? '');
      if (!in_array($type, DM_TYPES, true) || !valid_id($id) || ts_ms($d) <= 0) { $rejected[] = ['type' => (string)$type, 'id' => is_string($id) ? $id : '', 'reason' => 'invalid']; continue; }
      $cur = rec_load($db, $type, $id);
      if ($cur) {
        $lt = ts_ms($cur['updated_at']); $rt = ts_ms($d);
        if ((int)$cur['deleted'] && $rt <= $lt) { $same++; continue; }
        if (!(int)$cur['deleted'] && $rt <= $lt) { $rejected[] = ['type' => $type, 'id' => $id, 'server_updated_at' => $cur['updated_at'], 'reason' => $rt === $lt ? 'tie' : 'older', 'current' => rec_public($c, $cur)]; continue; }
      }
      rec_write($db, $c, $type, $id, $d, true, substr((string)($t['who'] ?? $label), 0, 80), ['code' => substr((string)($t['code'] ?? ''), 0, 100)], $device); $applied++;
    }
    $settingsApplied = false;
    $s = $b['settings'] ?? null;
    if (is_array($s) && is_array($s['data'] ?? null) && ts_ms($s['updated_at'] ?? '') > 0) {
      $q = $db->query("SELECT updated_at FROM settings_shared WHERE key = 'subset'"); $old = $q->fetchColumn();
      if ($old === false || ts_ms($s['updated_at']) > ts_ms($old)) {
        $db->prepare('INSERT INTO changes (type, id, updated_at, at, device, who) VALUES (?, ?, ?, ?, ?, ?)')->execute(['settings', 'subset', $s['updated_at'], now_iso(), $device, $label]);
        $seq = (int)$db->lastInsertId();
        $st = $db->prepare("INSERT INTO settings_shared (key, json, updated_at, seq) VALUES ('subset', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, seq = excluded.seq");
        $st->bindValue(1, enc($c, jenc($s['data']), 'settings/subset'), PDO::PARAM_LOB); $st->bindValue(2, (string)$s['updated_at']); $st->bindValue(3, $seq, PDO::PARAM_INT); $st->execute();
        $settingsApplied = true;
      }
    }
    foreach (array_slice((array)($b['activity_log'] ?? []), 0, 5000) as $e) if (is_array($e) && log_insert($db, $c, $e)) $logged++;
    $db->exec('COMMIT');
  } catch (Throwable $e) { try { $db->exec('ROLLBACK'); } catch (Throwable $e2) {} throw $e; }
  return ['applied' => $applied, 'same' => $same, 'rejected' => $rejected, 'settings_applied' => $settingsApplied, 'logged' => $logged, 'seq' => max_seq($db), 'server_time' => now_iso()];
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
  $db->exec('BEGIN IMMEDIATE');
  try {
    $row = rec_load($db, 'binder', $id);
    if (!$row || (int)$row['deleted']) fail(404, 'not_found', 'binder not found');
    if (!$force && $base !== $row['updated_at']) { $cur = binder_pack($db, $c, $row); fail(409, 'conflict', 'binder changed meanwhile', ['current' => $cur['binder'], 'current_etag' => $row['updated_at']]); }
    $data = rec_data($c, $row);
    if (array_key_exists('location_id', $patch)) {   // v11: the location must exist; location_code always follows it
      $lid = is_string($patch['location_id']) ? trim($patch['location_id']) : '';
      if ($lid !== '') { if (!valid_id($lid)) fail(422, 'invalid_location', 'location_id'); $lr = rec_load($db, 'location', $lid); if (!$lr || (int)$lr['deleted']) fail(422, 'invalid_location', 'location not found', ['location_id' => $lid]); $patch['location_code'] = (string)(rec_data($c, $lr)['code'] ?? ''); }
      else if (!array_key_exists('location_code', $patch) || !is_string($patch['location_code'])) $patch['location_code'] = '';
      $patch['location_id'] = $lid;
    } elseif (array_key_exists('location_code', $patch)) fail(422, 'field_not_allowed', 'location_code only together with location_id', ['field' => 'location_code']);
    foreach ($patch as $k => $v) $data[$k] = $v;
    $now = ts_ms(now_iso()); $old = ts_ms($row['updated_at']); $at = iso_ms(max($now, $old + 1));   // strictly increasing
    $label = substr(trim((string)($b['operator'] ?? '')), 0, 80) ?: $who['user'];
    rec_write($db, $c, 'binder', $id, $at, false, $label, $data, substr((string)($b['deviceId'] ?? 'mobile'), 0, 100));
    $e = is_array($b['log'] ?? null) ? $b['log'] : [];
    $e += ['id' => bin2hex(random_bytes(16)), 'action' => 'binder.edit', 'source' => 'mobile', 'who' => $label, 'target' => ['type' => 'binder', 'id' => $id, 'code' => (string)($data['speaking_code'] ?? '')], 'summary' => 'Modificato da mobile il faldone ' . ($data['speaking_code'] ?? '')];
    $e['at'] = $at; $e['details'] = (is_array($e['details'] ?? null) ? $e['details'] : []) + ['patch' => $patch];
    $e['details']['base_updated_at'] = $row['updated_at']; $e['details']['new_updated_at'] = $at; $e['details']['forced'] = $force; $e['details']['token_user'] = $who['user'];
    log_insert($db, $c, $e);
    $db->exec('COMMIT');
  } catch (Throwable $ex) { try { $db->exec('ROLLBACK'); } catch (Throwable $e2) {} throw $ex; }
  $row = rec_load($db, 'binder', $id);
  $p = binder_pack($db, $c, $row);
  return ['binder' => $p['binder'], 'etag' => $row['updated_at']];
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
    $reads = ['me' => 'viewer', 'pull' => 'viewer', 'binder' => 'viewer', 'location' => 'viewer', 'resolve' => 'viewer', 'tokens' => 'admin'];
    $writes = ['push' => 'editor', 'patch' => 'editor', 'token_create' => 'admin', 'token_revoke' => 'admin'];
    if (!isset($reads[$route]) && !isset($writes[$route])) fail(404, 'no_route', 'unknown route');
    if (isset($writes[$route]) && $method !== 'POST') fail(405, 'method', 'use POST');
    if (!in_array($method, ['GET', 'POST'], true)) fail(405, 'method', 'use GET or POST');
    $db = db($c);
    $who = auth($db, $c, $reads[$route] ?? $writes[$route]);
    switch ($route) {
      case 'me': $res = ['user' => $who['user'], 'role' => $who['role'], 'token_id' => $who['token_id'], 'studio_name' => (string)$c['studio_name'], 'server_time' => now_iso()]; break;
      case 'pull': $res = r_pull($db, $c); break;
      case 'push': $res = r_push($db, $c, $who); break;
      case 'binder': $res = r_binder($db, $c); header('ETag: "' . $res['etag'] . '"'); break;
      case 'location': $res = r_location($db, $c); header('ETag: "' . $res['etag'] . '"'); break;
      case 'resolve': $res = r_resolve($db, $c); break;
      case 'patch': $res = r_patch($db, $c, $who); header('ETag: "' . $res['etag'] . '"'); break;
      case 'tokens': $res = r_tokens($db, $c); break;
      case 'token_create': $res = r_token_create($db, $c, $who); break;
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
