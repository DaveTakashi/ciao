/* =====================================================================
   DocMap 2026 — v12.9 theme (wave 1, «qualità percepita»): Automatico (follows the system) · Chiaro · Scuro.
   Stored per device in localStorage 'docmap_theme' ('' = automatic); applied before the first paint by the small
   inline script in index.html / scan.html (<html data-theme>). Colours come from assets/css-tokens.css; printing
   always uses the light values. Shared by both pages.
   ===================================================================== */
'use strict';
const DM_THEME_LS = 'docmap_theme';
const DM_THEMES = ['', 'light', 'dark'];
Object.assign(I18N.it, { th_h:'Aspetto', th_auto:'Automatico', th_light:'Chiaro', th_dark:'Scuro', th_hint:'Automatico segue il tema del telefono o del computer. Vale solo per questo dispositivo; la stampa resta sempre chiara.' });
Object.assign(I18N.en, { th_h:'Appearance', th_auto:'Automatic', th_light:'Light', th_dark:'Dark', th_hint:'Automatic follows the phone or computer theme. Applies to this device only; printing always stays light.' });
function dmThemeGet(){ try { const v = localStorage.getItem(DM_THEME_LS) || ''; return DM_THEMES.includes(v) ? v : ''; } catch(e){ return ''; } }
function dmThemeApply(v){ const r = document.documentElement; if (v) r.setAttribute('data-theme', v); else r.removeAttribute('data-theme'); }
function dmThemeSet(v){
  v = DM_THEMES.includes(v) ? v : '';
  try { if (v) localStorage.setItem(DM_THEME_LS, v); else localStorage.removeItem(DM_THEME_LS); } catch(e){}
  dmThemeApply(v);
  document.querySelectorAll('[data-dm-theme]').forEach(b => { const on = b.dataset.dmTheme === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  return v;
}
/** The 3-way switch (PC: .seg inside Impostazioni; phone: .sc-seg under the code box). */
function dmThemeHTML(cls){
  const cur = dmThemeGet();
  return '<div class="' + (cls || 'seg') + ' dm-theme" role="group" aria-label="' + esc(t('th_h')) + '">' +
    DM_THEMES.map(v => '<button type="button" data-dm-theme="' + v + '" aria-pressed="' + (v === cur) + '"' + (v === cur ? ' class="on"' : '') + '>' + esc(t(v ? 'th_' + v : 'th_auto')) + '</button>').join('') + '</div>';
}
document.addEventListener('click', (e) => { const b = e.target && e.target.closest ? e.target.closest('[data-dm-theme]') : null; if (b) dmThemeSet(b.dataset.dmTheme); });
/* another tab of the same browser changed it */
window.addEventListener('storage', (e) => { if (e.key === DM_THEME_LS) dmThemeSet(e.newValue || ''); });
