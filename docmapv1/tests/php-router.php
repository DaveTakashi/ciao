<?php
/* Test stand-in for Apache when the suite runs `php -S 127.0.0.1:<port> -t <deploy root> tests/php-router.php`.
   PHP's built-in server ignores .htaccess, so this router applies the deny rules that the deployed .htaccess files
   declare: a folder whose .htaccess says "Require all denied" is closed; <FilesMatch "regex"> blocks that contain
   "Require all denied" close the matching file names in their folder. Everything else is served as usual. */
$root = rtrim($_SERVER['DOCUMENT_ROOT'], '/');
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
if (strpos($path, '..') !== false) { http_response_code(400); exit; }
$file = $root . $path; $name = basename($path);
if (strncmp($name, '.ht', 3) === 0) { http_response_code(403); echo 'Forbidden'; exit; }   // Apache default
$dir = is_dir($file) ? rtrim($file, '/') : dirname($file);
for ($d = $dir; strlen($d) >= strlen($root); $d = dirname($d)) {
  $ht = $d . '/.htaccess';
  if (is_file($ht)) {
    $txt = file_get_contents($ht);
    $outside = preg_replace('#<(FilesMatch|IfModule|If)\b.*?</\1>#s', '', $txt);
    $outside = preg_replace('/^\s*#.*$/m', '', $outside);
    if (preg_match('/^\s*Require all denied/m', $outside)) { http_response_code(403); echo 'Forbidden'; exit; }
    if ($d === $dir && preg_match_all('#<FilesMatch "([^"]+)">(.*?)</FilesMatch>#s', $txt, $m, PREG_SET_ORDER))
      foreach ($m as $fm) if (strpos($fm[2], 'Require all denied') !== false && preg_match('#' . str_replace('#', '\#', $fm[1]) . '#', $name)) { http_response_code(403); echo 'Forbidden'; exit; }
  }
  if ($d === $root) break;
}
if (is_file($file) && substr($name, -4) !== '.php') return false;   // static file
if (is_file($file)) { $_SERVER['SCRIPT_FILENAME'] = $file; chdir(dirname($file)); require $file; return true; }
if (is_dir($file) && is_file(rtrim($file, '/') . '/index.html')) return false;
http_response_code(404); echo 'Not found';
