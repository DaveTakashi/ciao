/* DocMap 2026 — deployment configuration (classic script, loaded FIRST by index.html and scan.html).
   mode:       'local' = offline app opened from file:// (default, data in this browser, no login on the PC)
               'web'   = static upload on a web server (e.g. https://docmap.pr-it.it/studio-de/): login required
                         on every page, data encrypted at rest in each browser (docs/SICUREZZA.md)
   basePath:   URL path of the app on the server, with trailing slash ('/studio-de/'); './' for file://
   apiBase:    null today; the https URL of the Python API when it exists → Remote providers (docs/API-CONTRACT.md)
   studioSlug: short name of the studio in URLs ('studio-de')
   studioName: name shown on the login screen in web mode (the real name is inside the encrypted data)
   tools/build_deploy.py writes a web-mode copy of this file into the deploy folder. */
window.DOCMAP_CONFIG = Object.assign({
  mode: 'local',
  basePath: './',
  apiBase: null,
  studioSlug: '',
  studioName: ''
}, window.DOCMAP_CONFIG || {});
