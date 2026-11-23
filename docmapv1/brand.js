/* Product brand: the ONLY place where the product name, logo, colours, contacts, web site and legal texts live.
   Read by the app (assets/js/00-brand.js), the PHP server (server-php/brand.php), the Python server, the installer
   and the hub (Python: tools/brand.py and the readers built on it). Guide: docs/MARCHIO.md.

   Format (do not change it): one line «window.DOCMAP_BRAND =», then a pure JSON object, then «;». No comments
   inside the JSON, so PHP and Python can read it without a JavaScript engine. Change it with
       python3 tools/brand.py imposta --nome "Nuovo nome"      (or edit by hand, then: python3 tools/brand.py controlla)
   The QR address is NOT here on purpose: it is a setting of each installation (docmap.config.js qrBase /
   Impostazioni › Indirizzo dei QR, qr7.it by default), never tied to the brand. */
window.DOCMAP_BRAND =
{
  "product_name": "Doc Location",
  "short_name": "Doc Location",
  "mark": "DL",
  "edition": "2026",
  "tagline": {
    "it": "Archivio fisico-digitale: faldoni, scaffali ed etichette con QR",
    "en": "Physical-digital archive: binders, shelves and QR labels"
  },
  "logo_url": "",
  "primary_color": "",
  "vendor_name": "Doc Location",
  "vendor_legal": "",
  "vendor_vat": "",
  "vendor_address": "",
  "website": "https://doclocation.it",
  "support_email": "",
  "support_phone": "",
  "privacy_url": "",
  "terms_url": "",
  "copyright": "© {year} {vendor}",
  "hub_name": "Hub",
  "file_prefix": "DocLocation",
  "languages": [
    "it",
    "en"
  ],
  "default_language": "it"
}
;
