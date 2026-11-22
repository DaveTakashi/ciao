<?php
/* DocMap 2026 — configuration of the shared online database (server-php/api.php).
   Easiest: open setup.php ONCE in the browser: it creates this file (as config.php) with a random key and tokens.
   By hand: copy this file to config.php and fill in the values below. Never commit or e-mail config.php. */
if (!defined('DOCMAP_API')) { http_response_code(404); exit; }   // opened directly in the browser → nothing
return [
  // Folder of the SQLite database. BEST OUTSIDE public_html, e.g. on SiteGround:
  //   /home/customer/www/docmap.pr-it.it/docmap-data   (the folder next to public_html)
  // If it must stay inside the site, use server-php/data (protected by its own .htaccess "Require all denied").
  'data_dir' => '/home/customer/www/docmap.pr-it.it/docmap-data',

  // AES-256-GCM key for encryption at rest: 32 random bytes in base64. REQUIRED (the API refuses to start without it).
  // Generate: php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"
  // Keep a copy in a safe place: without this key the database cannot be read (also the backups).
  'aes_key' => '',

  // Access tokens, one per person or device. Only the SHA-256 of the token is stored here.
  // Generate a token: php -r "echo rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '='), PHP_EOL;"
  // Its hash:         php -r "echo hash('sha256', 'THE-TOKEN'), PHP_EOL;"
  // role: viewer (read only) · editor (edit, sync) · admin (also manage tokens). 'disabled' => true blocks a token.
  // More tokens can be created later from the app (⚙ Sincronizzazione › Server online › Token, admin only):
  // those live in the database (SHA-256 only) and can be revoked there.
  'tokens' => [
    // ['user' => 'davide', 'role' => 'admin', 'token_sha256' => '…64 hex…'],
  ],

  // Cross-origin callers. Empty = same origin only (the web app on this site).
  // 'null' = the desktop app opened from file:// ("Sincronizza con il server" on the PC).
  'allowed_origins' => [],

  'max_fails' => 5,         // wrong tokens per IP before the lock
  'lock_seconds' => 60,     // first lock; doubles at every further wrong token, max 15 min
  'max_body_mb' => 20,      // largest push accepted
  'studio_name' => '',

  // v11 sync journal ("Registro sincronizzazioni"). Both optional: a v10.1 config.php without them works as before.
  // journal_keep_days: 0 = keep the whole journal; e.g. 730 = entries older than two years are pruned (once a day).
  // journal_pulls: 'changes' = journal pulls that returned something (default) · 'all' · 'none'.
  'journal_keep_days' => 0,
  'journal_pulls' => 'changes',

  // v12 access log ("Accessi": who opened which binder / location, when, with QR / search / NFC). All optional.
  // access_keep_days: rows older than this are pruned once a day (default 365; 0 = keep everything).
  // access_dedupe_seconds: the same person + device opening the same record the same way within this time = one row.
  'access_keep_days' => 365,
  'access_dedupe_seconds' => 120,
  // v12 phone sign-in kept on the device ("Ricordami su questo dispositivo"): minutes of INACTIVITY after which the PIN
  // is asked again. null = each device uses its own setting · 0 = always ask · 480 = 8 hours · 43200 = 30 days · -1 = never
  // (until "Esci" or until the device's access code is revoked).
  'remember_minutes' => null,
];
