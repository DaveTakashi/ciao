/* =====================================================================
   DocMap 2026 — v12.11 «Ricerca a voce» (both pages: index.html after 02l-years.js, scan.html after 11d-search.js).
   Roadmap K7. Turns a spoken sentence into the search language of 04c-search.js, so «trovami le fatture di Rossi
   del 2023 fuori archivio» becomes «fatture rossi anno:2023 stato:fuori».

   vsParse(text) → {q, said}: pure, Italian and English, no network. It understands
     - commands and filler words (cerca, trova, dov'è, il faldone, find, where is…), dropped;
     - years in digits or words (2023 · duemilaventitré · millenovecentonovantotto), ranges (dal 2020 al 2023),
       «prima del» / «dopo il» → anno:2023 · anno:2020..2023 · anno:<2020 · anno:>2020;
     - «fuori archivio», «in prestito», «prelevati» → stato:fuori; «storico» → stato:storico;
     - «tag X», «categoria X», «posizione X» → tag:X cat:X luogo:X;
     - spelled codes: «codice B L tre» or «b l 3» → bl3 (single letters and digits in a row are joined).
   vsListen({lang, onText, onEnd}) starts the browser's speech recognition (Web Speech; Chrome / Edge / Safari,
   which may send the audio to the browser maker's service — the page says so) and returns a stop function, or
   null when the browser has none. vsOk() tells whether it exists.
   ===================================================================== */
'use strict';

const VS_UNITS = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const VS_TENS = {venti:20, trenta:30, quaranta:40, cinquanta:50, sessanta:60, settanta:70, ottanta:80, novanta:90};
const VS_EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const VS_EN_TENS = {twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90};
const vsFold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** 0..99 written as one Italian word (ventitre, ventuno, trentotto, dodici), or -1. */
function vsNum99(w){
  if (!w) return 0;
  const u = VS_UNITS.indexOf(w); if (u >= 0) return u;
  for (const k of Object.keys(VS_TENS)){
    if (w === k) return VS_TENS[k];
    const stem = k.slice(0, -1);   // elision: ventuno, ventotto
    if (w.startsWith(k)){ const r = VS_UNITS.indexOf(w.slice(k.length)); if (r > 0 && r < 10) return VS_TENS[k] + r; }
    if (w.startsWith(stem) && /^(uno|otto)$/.test(w.slice(stem.length))) return VS_TENS[k] + VS_UNITS.indexOf(w.slice(stem.length));
  }
  return -1;
}
/** A year written in words (duemilaventitre, duemila ventitre, millenovecentonovantotto), or 0. */
function vsWordYear(s){
  const w = vsFold(s).replace(/[\s-]+/g, '');
  let m = w.match(/^duemila(.*)$/); if (m){ const n = vsNum99(m[1]); return n >= 0 ? 2000 + n : 0; }
  m = w.match(/^millenovecento(.*)$/); if (m){ const n = vsNum99(m[1]); return n >= 0 ? 1900 + n : 0; }
  m = w.match(/^twothousand(?:and)?(.*)$/); if (m){ const n = vsEnNum99(m[1]); return n >= 0 ? 2000 + n : 0; }
  return 0;
}
function vsEnNum99(w){
  if (!w) return 0;
  const u = VS_EN_UNITS.indexOf(w); if (u >= 0) return u;
  for (const k of Object.keys(VS_EN_TENS)){ if (w === k) return VS_EN_TENS[k]; if (w.startsWith(k)){ const r = VS_EN_UNITS.indexOf(w.slice(k.length)); if (r > 0 && r < 10) return VS_EN_TENS[k] + r; } }
  return -1;
}
const VS_DIGIT = {zero:0, uno:1, una:1, due:2, tre:3, quattro:4, cinque:5, sei:6, sette:7, otto:8, nove:9, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9};
const VS_STOP = new Set(('di del della dello dei degli delle d il lo la l i gli le un uno una per che con a al alla ai agli alle da dal dalla dai in nel nella nei e ed o mi me ci su sul sulla ' +
  'faldone faldoni cartella cartelle raccoglitore raccoglitori pratica pratiche documento documenti anno anni tutti tutte quelli quelle quello quella ' +
  'the a an of for from in on at and or my me all binder binders folder folders file files year years please').split(' '));
const VS_LEAD = /^(?:(?:ok|ehi|ciao|hey)\s+)?(?:(?:per\s+favore|please)\s+)?(?:cercami|cerca|trovami|trova|mostrami|mostra|fammi\s+vedere|apri|voglio|vorrei|dammi|dove\s+(?:e|sta|stanno|sono|si\s+trova(?:no)?|ho\s+messo)|dov\s+e|dove|find\s+me|find|show\s+me|show|search\s+for|search|look\s+for|where\s+(?:is|are)|where\s+s|open)\b\s*/;

function vsParse(text){
  const said = String(text == null ? '' : text).trim();
  let s = ' ' + vsFold(said).replace(/[’'`]/g, ' ').replace(/[.,;:!?¿¡"«»()\[\]]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const ops = [];
  // year words → digits («duemila ventitre» may come as two words)
  s = s.replace(/\b(duemila|millenovecento|two\s+thousand(?:\s+and)?)\s*([a-z]+)?\b/g, (all, a, b) => { const y = vsWordYear(a + (b || '')); if (y) return ' ' + y + ' '; const y0 = vsWordYear(a); return y0 ? ' ' + y0 + ' ' + (b || '') + ' ' : all; });
  s = ' ' + s.trim().replace(VS_LEAD, '') + ' ';
  const Y = '((?:19|20|21)\\d{2})';
  s = s.replace(new RegExp('\\b(?:dal|da|dall anno|from|between)\\s+' + Y + '\\s+(?:al|a|fino\\s+al|to|and|until)\\s+' + Y + '\\b', 'g'), (a, y1, y2) => { ops.push('anno:' + Math.min(y1, y2) + '..' + Math.max(y1, y2)); return ' '; });
  s = s.replace(new RegExp('\\b' + Y + '\\s*-\\s*' + Y + '\\b', 'g'), (a, y1, y2) => { ops.push('anno:' + Math.min(y1, y2) + '..' + Math.max(y1, y2)); return ' '; });
  s = s.replace(new RegExp('\\b(?:prima\\s+del|prima\\s+dell|before)\\s+(?:anno\\s+|l\\s+)?' + Y + '\\b', 'g'), (a, y) => { ops.push('anno:<' + y); return ' '; });
  s = s.replace(new RegExp('\\b(?:dopo\\s+il|dopo\\s+del|dopo\\s+l|dopo|after)\\s+(?:anno\\s+)?' + Y + '\\b', 'g'), (a, y) => { ops.push('anno:>' + y); return ' '; });
  s = s.replace(/\b(?:che\s+sono\s+|che\s+e\s+)?(?:fuori\s+archivio|fuori|in\s+prestito|prestat[oiae]|prelevat[oiae]|presi?|in\s+uso|checked\s+out|out)\b/g, () => { ops.push('stato:fuori'); return ' '; });
  s = s.replace(/\b(?:in\s+|nello\s+|nell\s+)?(?:archivio\s+)?storic[oiae]\b|\bhistorical\b/g, () => { ops.push('stato:storico'); return ' '; });
  s = s.replace(/\b(?:con\s+(?:il\s+)?)?(?:tag|etichetta)\s+([a-z0-9-]+)\b/g, (a, v) => { ops.push('tag:' + v); return ' '; });
  s = s.replace(/\b(?:categoria|category)\s+([a-z0-9-]+)\b/g, (a, v) => { ops.push('cat:' + v); return ' '; });
  s = s.replace(/\b(?:posizione|luogo|location|stanza|room)\s+([a-z0-9-]+)\b/g, (a, v) => { ops.push('luogo:' + v); return ' '; });
  s = s.replace(new RegExp('\\b' + Y + '\\b', 'g'), (a, y) => { ops.push('anno:' + y); return ' '; });
  // spelled codes: «codice b l tre» / «b l 3»: single letters, digits and digit words in a row are joined
  const toks = s.trim().split(/\s+/).filter(Boolean), words = [];
  for (let i = 0; i < toks.length; i++){
    const tk = toks[i];
    if (tk === 'codice' || tk === 'code' || tk === 'sigla'){
      let j = i + 1, code = '';
      while (j < toks.length && (/^[a-z0-9]{1,4}$/.test(toks[j]) && !VS_STOP.has(toks[j]) || VS_DIGIT[toks[j]] != null || /^[a-z]$/.test(toks[j]))){ code += VS_DIGIT[toks[j]] != null ? VS_DIGIT[toks[j]] : toks[j]; j++; }
      if (code){ words.push(code); i = j - 1; }
      continue;
    }
    if (/^([a-z]|\d+)$/.test(tk) && i + 1 < toks.length && /^([a-z]|\d+)$/.test(toks[i + 1]) && !(tk.length === 1 && VS_STOP.has(tk) && !/^\d/.test(toks[i + 1]))){
      let j = i, code = '';
      while (j < toks.length && /^([a-z]|\d+)$/.test(toks[j])){ code += toks[j]; j++; }
      if (code.length >= 2){ words.push(code); i = j - 1; continue; }
    }
    if (VS_STOP.has(tk)) continue;
    words.push(tk);
  }
  const q = Array.from(new Set(words.concat(ops))).join(' ').trim();
  return {q, said};
}

const vsOk = () => typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
/** Start listening once. o: {lang, onText(text), onEnd()}. Returns stop() or null. */
function vsListen(o){
  o = o || {};
  const R = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition); if (!R) return null;
  let r; try { r = new R(); } catch(e){ return null; }
  r.lang = o.lang || 'it-IT'; r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
  let done = false; const end = () => { if (done) return; done = true; try { o.onEnd && o.onEnd(); } catch(e){} };
  r.onresult = (e) => { const txt = String((((e.results || [])[0] || [])[0] || {}).transcript || '').trim(); if (txt && o.onText) o.onText(txt); };
  r.onerror = end; r.onend = end;
  try { r.start(); } catch(e){ end(); return null; }
  return () => { try { r.stop(); } catch(e){} };
}
