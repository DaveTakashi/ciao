/* =====================================================================
   DocMap 2026 — v12.6 (26.12.6): licence notice + "always visible" sync status.
   Loaded by index.html (after 06n-tape.js) and scan.html (last). Only wrappers: no other file changes behaviour.

   1. Licence. A server with 'licence_required' => true (PHP api.php v12.6 or the Python server) adds a `licence`
      object to ping / me and answers 403 licence_read_only / licence_limit with an Italian `message_it`. This module
      remembers the last status (LIC.s) and shows a banner (#lic-banner, under the top bar on the PC, at the top of the
      phone page) when the licence is in grace, read-only, invalid or expiring soon. Error messages of licence answers
      become the server's Italian sentence everywhere (DMError.message), "Accesso negato" is not shown for them: the
      server state becomes "Online · sola lettura" and automatic sync tries again every 30 minutes. Reading, search,
      pull and exports are never blocked by the licence (server rule).
   2. Sync status. The top-bar badge #srv-status (06g) existed only in web mode: on the PC opened from file:// with a
      server configured ("Sincronizza con il server") the badge now appears too, with "N da inviare" or the time of the
      last sync ("sincronizzato 5 min fa"); refreshed every 30 s. Without a server, nothing changes.
   ===================================================================== */
Object.assign(I18N.it, {
  lic_h:'Licenza', lic_more:'Cosa significa', lic_ro:'Licenza scaduta o sospesa: archivio in sola lettura. I dati restano consultabili ed esportabili.',
  lic_grace:'Licenza scaduta: periodo di tolleranza in corso ({n} giorni). Rinnova per evitare la sola lettura.',
  lic_soon:'La licenza scade tra {n} giorni: contatta il fornitore per il rinnovo.', lic_limit:'Limite della licenza raggiunto: contatta il fornitore per ampliare il piano.',
  lic_help:'Con la licenza scaduta (oltre i giorni di tolleranza), sospesa o revocata il server non accetta modifiche ma lascia sempre leggere, cercare ed esportare tutto. Quando arriva la licenza nuova si torna a scrivere da soli, senza perdere niente. Le modifiche fatte nel frattempo su questo PC restano in attesa e partono alla sincronizzazione successiva.',
  sb_ago_now:'sincronizzato ora', sb_ago_m:'sincronizzato {n} min fa', sb_ago_h:'sincronizzato {n} h fa', sb_ago_d:'sincronizzato {n} g fa', sb_local_wait:'{n} da inviare al server', sb_srv:'Server online', sb_local_never:'Server: mai sincronizzato', sb_local_ok:'Server: {t}'
});
Object.assign(I18N.en, {
  lic_h:'Licence', lic_more:'What it means', lic_ro:'Licence expired or suspended: the archive is read-only. Data stays readable and exportable.',
  lic_grace:'Licence expired: grace period running ({n} days). Renew to avoid read-only mode.',
  lic_soon:'The licence expires in {n} days: contact your supplier to renew.', lic_limit:'Licence limit reached: contact your supplier to extend the plan.',
  lic_help:'With an expired (beyond grace), suspended or revoked licence the server accepts no changes but always lets you read, search and export everything. When the new licence arrives writing works again by itself, nothing is lost. Changes made meanwhile on this PC wait and go out with the next sync.',
  sb_ago_now:'synced just now', sb_ago_m:'synced {n} min ago', sb_ago_h:'synced {n} h ago', sb_ago_d:'synced {n} d ago', sb_local_wait:'{n} to send to the server', sb_srv:'Online server', sb_local_never:'Server: never synced', sb_local_ok:'Server: {t}'
});

const LIC = { s:null, blocked:false, retryTimer:0 };
const LIC_RETRY_MS = 30 * 60 * 1000;

function licSet(s){
  if (!s || typeof s !== 'object') return;
  LIC.s = s; LIC.blocked = s.writable === false;
  licRender();
}
function licText(s){
  if (!s) return '';
  if (S && S.lang === 'it' && s.message_it) return s.message_it;
  if (s.mode === 'grace') return t('lic_grace', {n:s.grace_days_left != null ? s.grace_days_left : '?'});
  if (s.mode === 'full' && s.expiring_soon) return t('lic_soon', {n:s.days_left != null ? s.days_left : '?'});
  return t('lic_ro');
}
function licBannerHTML(){
  const s = LIC.s;
  if (!s || (s.mode === 'full' && !s.expiring_soon)) return '';
  const bad = s.writable === false;
  return '<div class="' + (bad ? 'lic-banner lic-bad' : 'lic-banner') + '" id="lic-banner" role="status" data-lic-mode="' + esc(s.mode || '') + '">' + (typeof ic === 'function' ? ic('alert') : '') +
    '<div><b>' + esc(t('lic_h')) + ':</b> ' + esc(licText(s)) + ' <details class="lic-more"><summary>' + esc(t('lic_more')) + '</summary><div class="small">' + esc(t('lic_help')) + '</div></details></div></div>';
}
function licRender(){
  const old = document.getElementById('lic-banner'); if (old) old.remove();
  const h = licBannerHTML(); if (!h) return;
  const top = document.querySelector('header.topbar');
  if (top) top.insertAdjacentHTML('afterend', h); else if (document.body) document.body.insertAdjacentHTML('afterbegin', h);
}
const licIsErr = (e) => { const c = e && e.data && e.data.server_code; return c === 'licence_read_only' || c === 'licence_limit'; };

(function licWrap(){
  if (typeof DMServer === 'function' && !DMServer.prototype.__licWrapped){
    const oc = DMServer.prototype.call;
    DMServer.prototype.call = async function(route, o){
      try {
        const j = await oc.call(this, route, o);
        if (j && j.licence && (route === 'ping' || route === 'me')) licSet(j.licence);
        return j;
      } catch(e){
        if (licIsErr(e)){
          const d = e.data;
          if (d.server_code === 'licence_read_only') licSet(Object.assign({}, LIC.s || {}, {mode:d.mode || 'read_only', writable:false, reasons:d.reasons || [], message_it:d.message_it || ''}));
          e.message = (S && S.lang === 'it' && d.message_it) ? d.message_it : (d.server_code === 'licence_limit' ? t('lic_limit') : t('lic_ro'));
        }
        throw e;
      }
    };
    DMServer.prototype.__licWrapped = true;
  }
  if (typeof srvErrText === 'function'){
    const oe = srvErrText;
    window.srvErrText = function(e){ return licIsErr(e) ? e.message : oe.apply(this, arguments); };
  }
  if (typeof srvErrFix === 'function'){
    const of = srvErrFix;
    window.srvErrFix = function(e){ return licIsErr(e) ? '' : of.apply(this, arguments); };
  }
  if (typeof srvSync === 'function'){
    const os = srvSync;
    window.srvSync = async function(){
      const r = await os.apply(this, arguments);
      if (r && r.error && LIC.blocked && typeof SRV === 'object'){
        SRV.state = 'ro'; SRV.fix = '';
        if (typeof srvRender === 'function') srvRender();
        clearTimeout(LIC.retryTimer);
        if (typeof srvAuto === 'function' && srvAuto()) LIC.retryTimer = setTimeout(() => window.srvSync(), LIC_RETRY_MS);
      }
      return r;
    };
  }
  if (typeof renderTopbar === 'function'){
    const ot = renderTopbar;
    window.renderTopbar = function(){
      const r = ot.apply(this, arguments);
      try { sbInsertLocal(); if (LIC.s) licRender(); } catch(e){ console.warn('lic', e); }
      return r;
    };
  }
})();

/* ---------------- sync status in the top bar, also on the PC from file:// ---------------- */
function sbAgo(iso){
  const ms = Date.now() - Date.parse(iso || '');
  if (!isFinite(ms)) return '';
  const m = Math.floor(ms / 60000);
  return m < 1 ? t('sb_ago_now') : m < 60 ? t('sb_ago_m', {n:m}) : m < 2880 ? t('sb_ago_h', {n:Math.floor(m / 60)}) : t('sb_ago_d', {n:Math.floor(m / 1440)});
}
function sbLastSync(){
  try { const conf = srvConf(); const p = conf && S.sync && S.sync.peers ? S.sync.peers['server:' + conf.url] : null; return p && p.lastSyncAt || ''; } catch(e){ return ''; }
}
if (typeof srvStatusHTML === 'function'){
  const osh = srvStatusHTML;
  window.srvStatusHTML = function(){
    let h = osh.apply(this, arguments);
    try {
      const last = sbLastSync();
      if (SRV.state === 'ok' && last && typeof srvPending === 'function' && !srvPending()) h = h.replace(/(<span class="sb-t">)[^<]*(<\/span>)/, '$1' + esc('Online · ' + sbAgo(last)) + '$2');
      if (last) h = h.replace(/title="([^"]*)"/, (m, a) => 'title="' + a + ' · ' + esc(syDate(last)) + '"');
    } catch(e){}
    return h;
  };
}
/** PC from file:// with "Sincronizza con il server" configured: the same badge, manual mode. */
function sbLocalHTML(){
  const n = typeof srvPending === 'function' ? srvPending() : 0, last = sbLastSync();
  const st = typeof SRV === 'object' ? SRV.state : 'idle';
  if (st === 'syncing' || st === 'denied' || st === 'offline' || st === 'ro') return srvStatusHTML();
  const cls = n ? 'warn' : last ? 'ok' : 'warn';
  const txt = n ? t('sb_local_wait', {n}) : last ? t('sb_local_ok', {t:sbAgo(last)}) : t('sb_local_never');
  return '<button type="button" class="status srv-st ' + cls + ' srv-local" id="srv-status" data-srv-state="' + esc(st) + '" data-a="nav" data-v="sync" title="' + esc((SRV.err || t('sb_srv')) + (last ? ' · ' + syDate(last) : '')) + '"><span class="dot"></span><span class="sb-t">' + esc(txt) + '</span></button>';
}
function sbInsertLocal(){
  if (typeof srvAuto !== 'function' || srvAuto() || typeof srvConf !== 'function' || !srvConf()) return;
  const tr = document.querySelector('#topbar .top-right'); if (!tr) return;
  const el = document.getElementById('srv-status'), h = sbLocalHTML();
  if (el) el.outerHTML = h; else tr.insertAdjacentHTML('afterbegin', h);
}
if (typeof srvRender === 'function'){
  const orr = srvRender;
  window.srvRender = function(){ const r = orr.apply(this, arguments); try { sbInsertLocal(); } catch(e){} return r; };
}
setInterval(() => { try { if (typeof srvAuto === 'function' && srvAuto()) { const el = document.getElementById('srv-status'); if (el) el.outerHTML = srvStatusHTML(); } else sbInsertLocal(); } catch(e){} }, 30000);

document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined') return;
  HELP_TOPICS.push({ id:'licence', guide:null, tags:['online', 'safety'], related:['server', 'troubleshoot'],
    kw:{it:'licenza scaduta sospesa revocata sola lettura tolleranza rinnovo limite piano', en:'licence license expired suspended revoked read only grace renewal limit plan'},
    title:{it:'Licenza: cosa vuol dire l\'avviso giallo o rosso', en:'Licence: what the yellow or red notice means'},
    body:{it:'<p>Se il server dello studio controlla la licenza, DocMap mostra un avviso sotto la barra in alto quando serve.</p><ul><li><b>Giallo</b>: la licenza scade a breve oppure è già scaduta ma si è nei <b>giorni di tolleranza</b> (di solito 30). Si lavora normalmente: è il momento di rinnovare.</li><li><b>Rosso</b>: licenza scaduta oltre la tolleranza, sospesa, revocata o mancante. Il server <b>non accetta modifiche</b> ma lascia sempre <b>leggere, cercare ed esportare</b>. Lo stato in alto diventa «Online · sola lettura».</li></ul><p>Le modifiche fatte su questo PC nel frattempo restano in attesa e partono da sole quando la licenza torna valida (DocMap riprova ogni 30 minuti). Un <b>limite</b> raggiunto (faldoni, utenti) blocca solo le aggiunte, non toglie né nasconde nulla.</p><p>Cosa fare: contatta il fornitore. La licenza nuova arriva da sola con l\'aggiornamento del sito o con il canale delle licenze, senza reinstallare.</p>',
          en:'<p>When the studio server checks the licence, DocMap shows a notice under the top bar if needed.</p><ul><li><b>Yellow</b>: the licence expires soon, or has expired but you are within the <b>grace days</b> (usually 30). Work normally: time to renew.</li><li><b>Red</b>: expired beyond grace, suspended, revoked or missing. The server <b>accepts no changes</b> but always lets you <b>read, search and export</b>. The status at the top becomes "Online · read only".</li></ul><p>Changes made meanwhile on this PC wait and go out by themselves when the licence is valid again (DocMap retries every 30 minutes). A <b>limit</b> reached (binders, users) only blocks additions; nothing is removed or hidden.</p><p>What to do: contact your supplier. The new licence arrives by itself with the next site update or the licence channel, no reinstall.</p>'} });
});
