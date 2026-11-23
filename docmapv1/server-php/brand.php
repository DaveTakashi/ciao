<?php
/* Product brand (white label) for the PHP pages: reads ../brand.js, the single source (docs/MARCHIO.md, tools/brand.py).
   brand.js = «window.DOCMAP_BRAND =» + a pure JSON object + «;». Missing or broken file → neutral name, never an error. */
function dm_brand(): array {
  static $b = null;
  if ($b !== null) return $b;
  $b = ['product_name' => 'Archivio documenti', 'short_name' => '', 'support_email' => '', 'website' => '', 'vendor_name' => ''];
  $raw = @file_get_contents(dirname(__DIR__) . '/brand.js');
  if (is_string($raw) && preg_match('/window\.DOCMAP_BRAND\s*=\s*(\{.*\})\s*;?\s*$/s', $raw, $m)) {
    $j = json_decode($m[1], true);
    if (is_array($j)) foreach ($j as $k => $v) if (is_string($v) && $v !== '') $b[$k] = $v;
  }
  if ($b['short_name'] === '') $b['short_name'] = $b['product_name'];
  if ($b['vendor_name'] === '') $b['vendor_name'] = $b['product_name'];
  return $b;
}
function dm_brand_name(): string { return dm_brand()['product_name']; }
