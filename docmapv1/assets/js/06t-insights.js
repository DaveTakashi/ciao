/* =====================================================================
   DocMap 2026 — v12.10 «Andamento e previsioni» (index.html, after 06s-finder.js). View 'insights'.

   1. Tempo risparmiato: consultations and new binders × (time without DocMap − time measured with DocMap).
      Baselines and hourly cost are the studio's own numbers (Impostazioni of this page, S.settings.insights);
      measured times come from the stopwatch (02h-timing.js), else a prudent 1 minute.
   2. Attività per settimana: consultations (binder cards opened, PC and phones: log 'view.binder' + status events,
      one per binder per day), binders taken out (status events with presence 'out'), new binders (created_at).
   3. Previsioni: for each weekly series several models are fitted (naive, moving average, linear trend,
      exponential smoothing, Holt, seasonal naive and Holt-Winters for 4 / 13 / 52-week cycles when the history
      allows) and the one with the lowest error on the last weeks (rolling-origin backtest, MAE) is used,
      with an 80% band from its backtest error. Archive growth: monthly, with the date the archive is full when a
      capacity is set.
   4. Suggerimenti: overdue and long-out binders, no position, the most requested binders (keep them at hand),
      binders nobody touched for a year (move to a deposit), years past the 10-year keeping period (to CHECK
      before any disposal: never presented as legal advice), search time above target, backup age, workload ahead.
   Everything is computed here on this PC from data it already has; nothing is sent anywhere.
   ===================================================================== */
'use strict';

const IN_DEF = {findMin:6, catMin:3, hourly:30, capacity:0};
const IN_WEEKS = 52;
const IN_H = 12;          // weeks ahead
const IN_Z80 = 1.2816;

Object.assign(I18N.it, {
  nav_insights:'Andamento e previsioni', nd_insights:'Tempo risparmiato, attività, previsioni e suggerimenti dai vostri dati',
  in_h:'Andamento e previsioni', in_p:('Quanto tempo vi fa risparmiare ' + brandName() + ', come cambia il lavoro sull\'archivio, cosa aspettarsi nelle prossime settimane e cosa conviene fare. Tutto calcolato su questo PC dai dati che ci sono già.'),
  in_saved_h:'Tempo risparmiato', in_saved_month:'questo mese', in_saved_year:'ultimi 12 mesi', in_saved_all:'da sempre', in_saved_next:'prossimi 3 mesi (previsione)',
  in_value:'circa {v} €', in_h_unit:'{h} h', in_how:'Come è calcolato', in_how_p:('Ogni consultazione fa risparmiare {f} min (cercarlo senza ' + brandName() + ') meno il tempo misurato con ' + brandName() + ' ({m}); ogni faldone catalogato {c} min meno {k}. Consultazioni: {n} · faldoni catalogati: {b}. Cambia i valori sotto con i vostri.'),
  in_meas:'{s} s misurati', in_unmeas:'1 min (non ancora misurato)',
  in_f_find:('Minuti per trovare un faldone senza ' + brandName()), in_f_cat:'Minuti per registrare un faldone a mano', in_f_hourly:'Costo orario (€)', in_f_cap:'Capienza dell\'archivio (faldoni, 0 = non so)',
  in_act_h:'Attività per settimana', in_s_finds:'Consultazioni', in_s_outs:'Uscite', in_s_new:'Nuovi faldoni', in_s_size:'Faldoni in archivio (per mese)',
  in_fc_h:'Previsioni', in_fc_next:'Prossime {w} settimane: circa {v} ({lo}–{hi})', in_fc_model:'Modello: {m} · errore medio ±{e} a settimana · {k}', in_fc_skill:'{p}% meglio del metodo più semplice', in_fc_noskill:'non migliore del metodo più semplice',
  in_fc_few:'Servono almeno {n} settimane di dati per una previsione: per ora {k}.', in_fc_table:'Vedi i numeri', in_week:'Settimana', in_real:'Reale', in_fcst:'Previsto', in_band:'Intervallo 80%',
  in_m_naive:'come la settimana scorsa', in_m_mean:'media delle ultime 4 settimane', in_m_lin:'tendenza lineare', in_m_ses:'livellamento esponenziale', in_m_holt:'Holt (livello + tendenza)',
  in_m_snaive:'stagionale ({m} sett.)', in_m_hw:'Holt-Winters ({m} sett.)',
  in_full:'Al ritmo attuale l\'archivio è pieno verso {d} (capienza {c}).', in_full_now:'L\'archivio ha già raggiunto la capienza indicata ({c}).', in_full_no:'Al ritmo attuale l\'archivio non si riempie nei prossimi 5 anni.', in_cap_hint:'Indica la capienza sotto per sapere quando l\'archivio sarà pieno.',
  in_sg_h:'Suggerimenti', in_sg_none:'Nessun suggerimento: l\'archivio è in ordine.', in_open:'Apri',
  in_sg_overdue:'{n} faldoni sono fuori oltre la data di rientro', in_sg_overdue_d:'Il più vecchio: {c}, doveva rientrare il {d}. Sollecita chi li ha.',
  in_sg_longout:'{n} faldoni sono fuori da più di 30 giorni senza data di rientro', in_sg_longout_d:'Aggiungi una data di rientro o registra il rientro.',
  in_sg_noloc:'{n} faldoni non hanno una posizione', in_sg_noloc_d:'Senza posizione il percorso dei prelievi li mette in fondo e cercarli richiede più tempo.',
  in_sg_hot:'I {n} faldoni più richiesti degli ultimi 90 giorni', in_sg_hot_d:'Tienili a portata di mano (ripiani all\'altezza degli occhi, vicino all\'ingresso): {l}.',
  in_sg_cold:'{n} faldoni non sono stati toccati da più di un anno', in_sg_cold_d:'Sono candidati per un archivio di deposito: liberano {p}% dello spazio a portata di mano.',
  in_sg_keep:'{n} faldoni riguardano anni chiusi da più di 10 anni ({y})', in_sg_keep_d:('Da VERIFICARE prima di qualsiasi scarto: obblighi di legge, contenziosi o accertamenti aperti, accordi col cliente. ' + brandName() + ' non decide lo scarto.'),
  in_sg_slow:'Trovare un faldone richiede {s} s (obiettivo {g} s)', in_sg_slow_d:'Stampa le etichette di posizione sugli scaffali e completa le posizioni mancanti: è la causa più comune.',
  in_sg_backup:'Ultimo salvataggio di sicurezza {d}', in_sg_backup_d:'Fai un backup (Esporta) almeno una volta alla settimana.', in_sg_backup_never:'Nessun salvataggio di sicurezza fatto finora', in_nodata:('Nessun dato ancora: si riempie da solo man mano che usate ' + brandName() + '.'), in_full_wait:'Servono almeno 6 mesi di nuovi faldoni per stimare quando l\'archivio sarà pieno.',
  in_sg_peak:'Nelle prossime 4 settimane sono previste circa {v} uscite ({p}% più del solito)', in_sg_peak_d:'Organizza i turni e prepara i prelievi in anticipo.',
  in_sg_full:'L\'archivio si riempie entro {m} mesi', in_sg_full_d:'Pianifica ora un deposito o lo scarto (da verificare) dei faldoni più vecchi.',
  in_data_note:'I tempi misurati restano su questo PC; le consultazioni dei telefoni arrivano con la sincronizzazione.'
});
Object.assign(I18N.en, {
  nav_insights:'Trends and forecasts', nd_insights:'Time saved, activity, forecasts and suggestions from your data',
  in_h:'Trends and forecasts', in_p:('How much time ' + brandName() + ' saves you, how the archive work changes, what to expect in the coming weeks and what to do. All computed on this PC from data it already has.'),
  in_saved_h:'Time saved', in_saved_month:'this month', in_saved_year:'last 12 months', in_saved_all:'all time', in_saved_next:'next 3 months (forecast)',
  in_value:'about € {v}', in_h_unit:'{h} h', in_how:'How it is computed', in_how_p:('Each consultation saves {f} min (finding it without ' + brandName() + ') minus the time measured with ' + brandName() + ' ({m}); each binder catalogued {c} min minus {k}. Consultations: {n} · binders catalogued: {b}. Change the values below to yours.'),
  in_meas:'{s} s measured', in_unmeas:'1 min (not measured yet)',
  in_f_find:('Minutes to find a binder without ' + brandName()), in_f_cat:'Minutes to register a binder by hand', in_f_hourly:'Hourly cost (€)', in_f_cap:'Archive capacity (binders, 0 = unknown)',
  in_act_h:'Activity per week', in_s_finds:'Consultations', in_s_outs:'Taken out', in_s_new:'New binders', in_s_size:'Binders in the archive (per month)',
  in_fc_h:'Forecasts', in_fc_next:'Next {w} weeks: about {v} ({lo}–{hi})', in_fc_model:'Model: {m} · mean error ±{e} per week · {k}', in_fc_skill:'{p}% better than the simplest method', in_fc_noskill:'not better than the simplest method',
  in_fc_few:'At least {n} weeks of data are needed for a forecast: {k} so far.', in_fc_table:'See the numbers', in_week:'Week', in_real:'Actual', in_fcst:'Forecast', in_band:'80% range',
  in_m_naive:'same as last week', in_m_mean:'mean of the last 4 weeks', in_m_lin:'linear trend', in_m_ses:'exponential smoothing', in_m_holt:'Holt (level + trend)',
  in_m_snaive:'seasonal ({m} wk)', in_m_hw:'Holt-Winters ({m} wk)',
  in_full:'At the current pace the archive is full around {d} (capacity {c}).', in_full_now:'The archive has already reached the capacity you set ({c}).', in_full_no:'At the current pace the archive does not fill up in the next 5 years.', in_cap_hint:'Set the capacity below to know when the archive will be full.',
  in_sg_h:'Suggestions', in_sg_none:'No suggestions: the archive is in order.', in_open:'Open',
  in_sg_overdue:'{n} binders are out past their return date', in_sg_overdue_d:'Oldest: {c}, due back on {d}. Remind whoever has them.',
  in_sg_longout:'{n} binders have been out for more than 30 days with no return date', in_sg_longout_d:'Add a return date or record the return.',
  in_sg_noloc:'{n} binders have no position', in_sg_noloc_d:'Without a position the pick route puts them last and finding them takes longer.',
  in_sg_hot:'The {n} most requested binders of the last 90 days', in_sg_hot_d:'Keep them at hand (eye-level shelves, near the door): {l}.',
  in_sg_cold:'{n} binders have not been touched for more than a year', in_sg_cold_d:'Candidates for a deposit archive: they free {p}% of the space at hand.',
  in_sg_keep:'{n} binders concern years closed more than 10 years ago ({y})', in_sg_keep_d:('To CHECK before any disposal: legal duties, open disputes or audits, client agreements. ' + brandName() + ' does not decide disposal.'),
  in_sg_slow:'Finding a binder takes {s} s (goal {g} s)', in_sg_slow_d:'Print location labels for the shelves and complete the missing positions: the most common cause.',
  in_sg_backup:'Last backup {d}', in_sg_backup_d:'Make a backup (Export) at least once a week.', in_sg_backup_never:'No backup made so far', in_nodata:('No data yet: it fills in by itself as you use ' + brandName() + '.'), in_full_wait:'At least 6 months of new binders are needed to estimate when the archive will be full.',
  in_sg_peak:'About {v} binders are expected to go out in the next 4 weeks ({p}% more than usual)', in_sg_peak_d:'Plan the staff and prepare the pick lists ahead.',
  in_sg_full:'The archive fills up within {m} months', in_sg_full_d:'Plan a deposit now, or the (to be checked) disposal of the oldest binders.',
  in_data_note:'Measured times stay on this PC; phone consultations arrive with the sync.'
});
if (typeof ICONS === 'object' && !ICONS.trend) ICONS.trend = '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>';

/* =============== pure: time buckets =============== */
/** Monday 00:00 local of the week of `d`, as a Date. */
function inWeekStart(d){ const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }
const inDayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
/** Weekly counts of the dates (ISO strings), for `weeks` full weeks ending with the last COMPLETE week before `now`. */
function inWeekly(dates, weeks, now){
  const cur = inWeekStart(now || new Date()), start = new Date(cur); start.setDate(start.getDate() - 7 * weeks);
  const ys = new Array(weeks).fill(0), labels = [];
  for (let i = 0; i < weeks; i++){ const d = new Date(start); d.setDate(d.getDate() + 7 * i); labels.push(inDayKey(d)); }
  dates.forEach(s => {
    const d = new Date(s); if (isNaN(d)) return;
    const w = Math.floor((inWeekStart(d) - start) / (7 * 864e5) + 0.5);   // + 0.5: daylight-saving hours
    if (w >= 0 && w < weeks) ys[w]++;
  });
  return {ys, labels, start:inDayKey(start), current:inDayKey(cur)};
}
/** Index of the first week with activity: forecasts use the history from there on. */
function inFirstActive(ys){ const i = ys.findIndex(v => v > 0); return i < 0 ? ys.length : i; }

/* =============== pure: forecasting models =============== */
const inMean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
function inSesFit(y, a){ let l = y[0]; for (let i = 1; i < y.length; i++) l = a * y[i] + (1 - a) * l; return l; }
function inHoltFit(y, a, b){
  let l = y[0], tr = y.length > 1 ? y[1] - y[0] : 0;
  for (let i = 1; i < y.length; i++){ const pl = l; l = a * y[i] + (1 - a) * (l + tr); tr = b * (l - pl) + (1 - b) * tr; }
  return {l, tr};
}
function inHwFit(y, m, a, b, g){
  const s0 = inMean(y.slice(0, m)), s1 = inMean(y.slice(m, 2 * m));
  let l = s0, tr = (s1 - s0) / m; const sea = y.slice(0, m).map(v => v - s0);
  for (let i = m; i < y.length; i++){
    const si = sea[i % m], pl = l;
    l = a * (y[i] - si) + (1 - a) * (l + tr);
    tr = b * (l - pl) + (1 - b) * tr;
    sea[i % m] = g * (y[i] - l) + (1 - g) * si;
  }
  return {l, tr, sea, n:y.length};
}
/** In-sample one-step squared error of a fitted-on-the-fly smoother: used to pick the smoothing constants. */
function inSse(y, step){ let e = 0; for (let i = 3; i < y.length; i++){ const f = step(y.slice(0, i)); e += (y[i] - f) * (y[i] - f); } return e; }
const IN_GRID = [0.1, 0.3, 0.5, 0.7, 0.9];
/** Model catalogue: each returns a forecaster h → value, fitted on y. `min`: shortest history it accepts. */
function inModels(n){
  const L = [
    {id:'naive', min:2, fit:(y) => { const v = y[y.length - 1]; return () => v; }},
    {id:'mean', min:4, fit:(y) => { const v = inMean(y.slice(-4)); return () => v; }},
    {id:'lin', min:6, fit:(y) => {
      const k = y.length, xm = (k - 1) / 2, ym = inMean(y); let sxy = 0, sxx = 0;
      y.forEach((v, i) => { sxy += (i - xm) * (v - ym); sxx += (i - xm) * (i - xm); });
      const b = sxx ? sxy / sxx : 0, a = ym - b * xm; return (h) => a + b * (k - 1 + h);
    }},
    {id:'ses', min:6, fit:(y) => {
      let best = 0.3, be = Infinity; IN_GRID.forEach(a => { const e = inSse(y, (z) => inSesFit(z, a)); if (e < be){ be = e; best = a; } });
      const l = inSesFit(y, best); return () => l;
    }},
    {id:'holt', min:8, fit:(y) => {
      let best = [0.3, 0.1], be = Infinity;
      IN_GRID.forEach(a => [0.05, 0.1, 0.3].forEach(b => { const e = inSse(y, (z) => { const f = inHoltFit(z, a, b); return f.l + f.tr; }); if (e < be){ be = e; best = [a, b]; } }));
      const f = inHoltFit(y, best[0], best[1]); return (h) => f.l + f.tr * h;
    }}
  ];
  [4, 13, 52].forEach(m => {
    if (n < 2 * m + 2) return;
    L.push({id:'snaive', m, min:m + 1, fit:(y) => (h) => y[y.length - m + ((h - 1) % m)]});
    if (n >= 3 * m) L.push({id:'hw', m, min:2 * m + 1, fit:(y) => {
      let best = [0.3, 0.05, 0.3], be = Infinity;
      [0.2, 0.5, 0.8].forEach(a => [0.05, 0.2].forEach(b => [0.1, 0.4].forEach(g => {
        const e = inSse(y, (z) => { if (z.length < 2 * m + 1) return z[z.length - 1]; const f = inHwFit(z, m, a, b, g); return f.l + f.tr + f.sea[f.n % m]; });
        if (e < be){ be = e; best = [a, b, g]; }
      })));
      const f = inHwFit(y, m, best[0], best[1], best[2]); return (h) => f.l + f.tr * h + f.sea[(f.n + h - 1) % m];
    }});
  });
  return L;
}
/**
 * Best model by rolling-origin backtest (one step ahead over the last `bt` points, MAE), then its forecast for
 * `h` steps with an 80% band (backtest RMSE × √h). Counts never go below 0. Null when the history is too short.
 */
function inForecast(y, h, opts){
  opts = opts || {}; const minN = opts.minN || 8;
  if (y.length < minN) return null;
  const bt = Math.max(3, Math.min(12, Math.floor(y.length / 3)));
  const res = inModels(y.length).filter(md => y.length - bt >= md.min).map(md => {
    const errs = [];
    for (let o = y.length - bt; o < y.length; o++){ const f = md.fit(y.slice(0, o)); errs.push(y[o] - Math.max(0, f(1))); }
    const mae = inMean(errs.map(Math.abs)), rmse = Math.sqrt(inMean(errs.map(e => e * e)));
    return {md, mae, rmse};
  }).filter(r => isFinite(r.mae));
  if (!res.length) return null;
  const naive = res.find(r => r.md.id === 'naive');
  res.sort((a, b) => a.mae - b.mae);   // stable: on a tie the simpler model (earlier in the catalogue) wins
  const best = res[0], f = best.md.fit(y), pts = [];
  for (let k = 1; k <= h; k++){ const v = Math.max(0, f(k)), w = IN_Z80 * best.rmse * Math.sqrt(k); pts.push({v, lo:Math.max(0, v - w), hi:v + w}); }
  return {model:best.md.id, m:best.md.m || 0, mae:best.mae, rmse:best.rmse, skill:naive && naive.mae > 0 ? 1 - best.mae / naive.mae : 0, pts,
    tried:res.map(r => ({id:r.md.id, m:r.md.m || 0, mae:r.mae}))};
}
function inModelLabel(fc){ return t(fc.model === 'snaive' ? 'in_m_snaive' : fc.model === 'hw' ? 'in_m_hw' : 'in_m_' + fc.model, {m:fc.m}); }

/* =============== data from the studio =============== */
function inSet(){ const s = Object.assign({}, IN_DEF, S.settings.insights || {}); ['findMin', 'catMin', 'hourly', 'capacity'].forEach(k => { s[k] = Math.max(0, +s[k] || 0); }); return s; }
function inTypes(){ return sqTypes(S.settings); }
/** Consultations: binder cards opened (log view.binder, PC + phones) and status events, one per binder per day. */
function inFindDates(){
  const seen = new Set(), out = [];
  const add = (id, at) => { if (!id || !at) return; const d = new Date(at); if (isNaN(d)) return; const k = id + '|' + inDayKey(d); if (seen.has(k)) return; seen.add(k); out.push(at); };
  (LOG.entries || []).forEach(e => { if (e && e.action === 'view.binder' && e.target) add(e.target.id || e.target.code, e.at); });
  sqEv().forEach(e => { if (e && e.target_type === 'binder' && !e.undo_of) add(e.target_id, e.at); });
  return out;
}
function inOutDates(){ const ty = inTypes(); return sqEv().filter(e => e && e.target_type === 'binder' && !e.undo_of && sqPresence(e, ty) === 'out').map(e => e.at); }
function inNewDates(){ return (S.binders || []).map(b => b.created_at).filter(Boolean); }
function inMonthly(dates, months, now){
  now = now || new Date(); const start = new Date(now.getFullYear(), now.getMonth() - months, 1), ys = new Array(months).fill(0), labels = [];
  for (let i = 0; i < months; i++){ const d = new Date(start.getFullYear(), start.getMonth() + i, 1); labels.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
  let before = 0;
  dates.forEach(s => { const d = new Date(s); if (isNaN(d)) return; const i = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth(); if (i < 0) before++; else if (i < months) ys[i]++; });
  return {ys, labels, before};
}

/** Minutes saved by the consultations and the new binders found between `from` and `to` (Dates). */
function inSaved(set, finds, news, from, to){
  const fm = typeof dmtStats === 'function' ? dmtStats('find') : {n:0}, cm = typeof dmtStats === 'function' ? dmtStats('catalog') : {n:0};
  const fMeas = fm.n ? fm.median / 60000 : 1, cMeas = cm.n ? cm.median / 60000 : 1;
  const inR = (s) => { const d = new Date(s); return !isNaN(d) && (!from || d >= from) && (!to || d < to); };
  const nf = finds.filter(inR).length, nb = news.filter(inR).length;
  const min = nf * Math.max(0, set.findMin - fMeas) + nb * Math.max(0, set.catMin - cMeas);
  return {min, nf, nb, fMeas, cMeas, fm, cm};
}
const inHours = (min) => Math.round(min / 6) / 10;
const inNum = (v, d) => { const s = (Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toLocaleString(S.lang === 'en' ? 'en-GB' : 'it-IT'); return s; };

/** Data-based suggestions, most urgent first. Each: {id, sev:'crit'|'warn'|'info', title, detail, act?:{a, ...data}} */
function inSuggestions(ctx){
  const out = [], ty = inTypes(), today = sqToday(), byId = new Map(S.binders.map(b => [b.id, b]));
  const rows = sqOutRows(sqEv(), ty).filter(r => r.kind === 'binder' && byId.has(r.target_id));
  const od = rows.filter(r => r.overdue).sort((a, b) => String(a.ev.due_date).localeCompare(String(b.ev.due_date)));
  if (od.length){ const b = byId.get(od[0].target_id); out.push({id:'overdue', sev:'crit', title:t('in_sg_overdue', {n:od.length}), detail:t('in_sg_overdue_d', {c:b.speaking_code, d:fmtDate(od[0].ev.due_date)}), act:{a:'nav', v:'status'}}); }
  const lo = rows.filter(r => !r.ev.due_date && r.presence === 'out' && sqDaysAgo(r.ev.at) > 30);
  if (lo.length) out.push({id:'longout', sev:'warn', title:t('in_sg_longout', {n:lo.length}), detail:t('in_sg_longout_d'), act:{a:'nav', v:'status'}});
  if (ctx.fullMonths !== null && ctx.fullMonths <= 12) out.push({id:'full', sev:ctx.fullMonths <= 3 ? 'crit' : 'warn', title:t('in_sg_full', {m:Math.max(0, ctx.fullMonths)}), detail:t('in_sg_full_d')});
  const noLoc = S.binders.filter(b => !String(b.location_code || '').trim() && !b.location_id);
  if (noLoc.length) out.push({id:'noloc', sev:'warn', title:t('in_sg_noloc', {n:noLoc.length}), detail:t('in_sg_noloc_d'), act:{a:'nav', v:'archive'}});
  const fs = typeof dmtStats === 'function' ? dmtStats('find') : {n:0};
  if (fs.n >= 5 && fs.median > DMT_TARGET.find) out.push({id:'slow', sev:'warn', title:t('in_sg_slow', {s:dmtSec(fs.median), g:dmtSec(DMT_TARGET.find)}), detail:t('in_sg_slow_d')});
  if (ctx.peak) out.push({id:'peak', sev:'info', title:t('in_sg_peak', {v:Math.round(ctx.peak.v), p:Math.round(ctx.peak.p)}), detail:t('in_sg_peak_d'), act:{a:'nav', v:'pick'}});
  // most requested (90 days) and untouched (365 days)
  const cnt = new Map(), last = new Map(), lim90 = Date.now() - 90 * 864e5;
  const touch = (id, at) => { const ms = Date.parse(at); if (!id || isNaN(ms)) return; if (ms > (last.get(id) || 0)) last.set(id, ms); if (ms >= lim90) cnt.set(id, (cnt.get(id) || 0) + 1); };
  (LOG.entries || []).forEach(e => { if (e && e.target && e.target.id && /^(view|binder)\.|^status\./.test(e.action || '')) touch(e.target.id, e.at); });
  sqEv().forEach(e => { if (e && e.target_type === 'binder') touch(e.target_id, e.at); });
  const hot = Array.from(cnt.entries()).filter(([id, n]) => n >= 3 && byId.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (hot.length >= 3) out.push({id:'hot', sev:'info', title:t('in_sg_hot', {n:hot.length}), detail:t('in_sg_hot_d', {l:hot.map(([id]) => { const b = byId.get(id); return b.speaking_code + (b.location_code ? ' (' + b.location_code + ')' : ''); }).join(', ')})});
  const yearAgo = Date.now() - 365 * 864e5;
  const cold = S.binders.filter(b => { const c = Date.parse(b.updated_at || b.created_at || ''); return (last.get(b.id) || (isNaN(c) ? 0 : c)) < yearAgo; });
  if (S.binders.length >= 20 && cold.length >= 10) out.push({id:'cold', sev:'info', title:t('in_sg_cold', {n:cold.length}), detail:t('in_sg_cold_d', {p:Math.round(100 * cold.length / S.binders.length)})});
  const cy = new Date().getFullYear(), old = new Map();
  S.binders.forEach(b => { const ys = typeof pkBinderYears === 'function' ? Array.from(pkBinderYears(b)) : []; if (ys.length && Math.max.apply(null, ys) <= cy - 11) { const y = Math.max.apply(null, ys); old.set(y, (old.get(y) || 0) + 1); } });
  const nOld = Array.from(old.values()).reduce((s, v) => s + v, 0);
  if (nOld) out.push({id:'keep', sev:'info', title:t('in_sg_keep', {n:nOld, y:Array.from(old.keys()).sort().join(', ')}), detail:t('in_sg_keep_d')});
  const lastExp = S.lastExportAt ? sqDaysAgo(S.lastExportAt) : null;
  if (S.binders.length && (lastExp === null || lastExp > 7)) out.push({id:'backup', sev:lastExp === null || lastExp > 30 ? 'warn' : 'info', title:lastExp === null ? t('in_sg_backup_never') : t('in_sg_backup', {d:sqSince(S.lastExportAt)}), detail:t('in_sg_backup_d'), act:{a:'nav', v:'export'}});
  const rank = {crit:0, warn:1, info:2};
  return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
}

/** Everything the page shows, computed once per render. `now` for the tests. */
function inCompute(now){
  now = now || new Date();
  const set = inSet(), finds = inFindDates(), outs = inOutDates(), news = inNewDates();
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1), yStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const sv = {month:inSaved(set, finds, news, mStart, null), year:inSaved(set, finds, news, yStart, null), all:inSaved(set, finds, news, null, null)};
  const series = [['finds', finds], ['outs', outs], ['new', news]].map(([id, dates]) => {
    const w = inWeekly(dates, IN_WEEKS, now), from = inFirstActive(w.ys), y = w.ys.slice(from);
    return {id, w, y, from, fc:inForecast(y, IN_H, {minN:8})};
  });
  // time saved in the next 3 months: forecast consultations × saving per consultation (+ new binders)
  const ff = series[0].fc, nf = series[2].fc, per = Math.max(0, set.findMin - sv.all.fMeas), perC = Math.max(0, set.catMin - sv.all.cMeas);
  const nextMin = ff ? ff.pts.slice(0, 13).reduce((s, p) => s + p.v, 0) * per + (nf ? nf.pts.slice(0, 13).reduce((s, p) => s + p.v, 0) * perC : 0) : null;
  // workload ahead (taken out): next 4 weeks vs the mean of the history
  let peak = null; const of = series[1].fc;
  if (of){ const v = of.pts.slice(0, 4).reduce((s, p) => s + p.v, 0), base = inMean(series[1].y) * 4; if (base >= 4 && v > base * 1.25) peak = {v, p:100 * (v / base - 1)}; }
  // archive size per month + when it is full
  const mo = inMonthly(news, 36, now), mo2 = inMonthly(news, 36, new Date(now.getFullYear(), now.getMonth() + 1, 1)); let run = mo2.before; const size = mo2.ys.map(v => (run += v));
  const grow = inForecast(mo.ys.slice(inFirstActive(mo.ys)), 60, {minN:6});
  let full = null, fullMonths = null;
  if (set.capacity > 0){
    const n = S.binders.length;
    if (n >= set.capacity){ full = {now:true}; fullMonths = 0; }
    else if (!grow) full = {wait:true};
    else if (grow){ let c = n; for (let k = 0; k < grow.pts.length; k++){ c += grow.pts[k].v; if (c >= set.capacity){ fullMonths = k + 1; break; } } full = fullMonths === null ? {never:true} : {months:fullMonths, date:new Date(now.getFullYear(), now.getMonth() + fullMonths, 1)}; }
  }
  const sugg = inSuggestions({peak, fullMonths});
  return {set, sv, series, nextMin, peak, size:{ys:size, labels:mo2.labels}, grow, full, sugg, n:S.binders.length};
}

/* =============== view =============== */
const IN = {last:null};
function inTile(label, min, set){ return '<div class="in-tile"><span>' + esc(label) + '</span><b>' + esc(t('in_h_unit', {h:inNum(inHours(min), 1)})) + '</b><small>' + esc(t('in_value', {v:inNum(min / 60 * set.hourly, 0)})) + '</small></div>'; }
/** Inline SVG: weekly actuals (line), forecast (dashed) and its 80% band; hover targets per week. */
function inChartSVG(sr, title){
  if (!sr.w.ys.some(v => v > 0) && !(sr.fc && sr.fc.pts.some(p => p.v > 0))) return '<div class="in-chart in-empty"><p class="muted small">' + esc(t('in_nodata')) + '</p></div>';
  const y = sr.w.ys, fc = sr.fc, H = fc ? fc.pts : [], n = y.length, tot = n + H.length;
  const W = 640, Ht = 180, pl = 34, pr = 10, pt = 10, pb = 22;
  const vmax = Math.max(4, ...y, ...H.map(p => p.hi)), nice = (v) => { const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 2 ? 2 : m <= 4 ? 4 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p; }, top = nice(vmax);
  const X = (i) => pl + (W - pl - pr) * (i / Math.max(1, tot - 1)), Y = (v) => pt + (Ht - pt - pb) * (1 - v / top);
  let g = '';
  [0, 0.5, 1].forEach(f => { const v = top * f, yy = Y(v).toFixed(1); g += '<line class="in-grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + yy + '" y2="' + yy + '"/><text class="in-ax" x="' + (pl - 6) + '" y="' + (+yy + 4) + '" text-anchor="end">' + inNum(v, 0) + '</text>'; });
  const months = [];
  sr.w.labels.forEach((l, i) => { const d = new Date(l + 'T00:00:00'); if (d.getDate() <= 7 && i % 1 === 0) months.push([i, d]); });
  months.filter((x, k) => k % 3 === 0).forEach(([i, d]) => { g += '<text class="in-ax" x="' + X(i).toFixed(1) + '" y="' + (Ht - 6) + '" text-anchor="middle">' + esc(d.toLocaleDateString(S.lang === 'en' ? 'en-GB' : 'it-IT', {month:'short', year:'2-digit'})) + '</text>'; });
  const line = y.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join('');
  g += '<path class="in-line" d="' + line + '"/>';
  if (H.length){
    const band = 'M' + X(n - 1).toFixed(1) + ' ' + Y(y[n - 1]).toFixed(1) + H.map((p, k) => 'L' + X(n + k).toFixed(1) + ' ' + Y(p.hi).toFixed(1)).join('') +
      H.slice().reverse().map((p, k) => 'L' + X(n + H.length - 1 - k).toFixed(1) + ' ' + Y(p.lo).toFixed(1)).join('') + 'Z';
    g += '<path class="in-band" d="' + band + '"/><path class="in-fc" d="M' + X(n - 1).toFixed(1) + ' ' + Y(y[n - 1]).toFixed(1) + H.map((p, k) => 'L' + X(n + k).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join('') + '"/>';
    g += '<line class="in-now" x1="' + X(n - 1).toFixed(1) + '" x2="' + X(n - 1).toFixed(1) + '" y1="' + pt + '" y2="' + (Ht - pb) + '"/>';
  }
  const step = (W - pl - pr) / Math.max(1, tot - 1);
  for (let i = 0; i < tot; i++){
    const real = i < n, d = new Date((sr.w.labels[0] || sr.w.start) + 'T00:00:00'); d.setDate(d.getDate() + 7 * i);
    const tip = d.toLocaleDateString(S.lang === 'en' ? 'en-GB' : 'it-IT', {day:'numeric', month:'short', year:'numeric'}) + ' · ' + (real ? t('in_real') + ' ' + y[i] : t('in_fcst') + ' ' + inNum(H[i - n].v, 1) + ' (' + inNum(H[i - n].lo, 0) + '–' + inNum(H[i - n].hi, 0) + ')');
    g += '<rect class="in-hit" x="' + (X(i) - step / 2).toFixed(1) + '" y="' + pt + '" width="' + step.toFixed(1) + '" height="' + (Ht - pt - pb) + '" data-tip="' + esc(tip) + '" data-x="' + X(i).toFixed(1) + '" data-y="' + Y(real ? y[i] : H[i - n].v).toFixed(1) + '"/>';
  }
  g += '<circle class="in-dot" r="4" cx="-10" cy="-10"/>';
  return '<div class="in-chart"><svg viewBox="0 0 ' + W + ' ' + Ht + '" role="img" aria-label="' + esc(title) + '" preserveAspectRatio="none">' + g + '</svg><div class="in-tip" hidden></div></div>';
}
function inSeriesHTML(sr){
  const title = t('in_s_' + sr.id), fc = sr.fc;
  let meta = '';
  if (fc){
    const next = fc.pts.slice(0, 4), v = next.reduce((s, p) => s + p.v, 0), lo = next.reduce((s, p) => s + p.lo, 0), hi = next.reduce((s, p) => s + p.hi, 0);
    meta = '<p class="in-fc-next"><b>' + esc(t('in_fc_next', {w:4, v:inNum(v, 0), lo:inNum(lo, 0), hi:inNum(hi, 0)})) + '</b></p><p class="small muted">' +
      esc(t('in_fc_model', {m:inModelLabel(fc), e:inNum(fc.mae, 1), k:fc.skill > 0.02 ? t('in_fc_skill', {p:Math.round(fc.skill * 100)}) : t('in_fc_noskill')})) + '</p>';
  } else meta = '<p class="small muted">' + esc(t('in_fc_few', {n:8, k:sr.y.length})) + '</p>';
  const rows = sr.w.ys.slice(-8).map((v, i) => '<tr><td>' + esc(fmtDate(sr.w.labels[sr.w.labels.length - 8 + i])) + '</td><td class="num">' + v + '</td><td></td></tr>').join('') +
    (fc ? fc.pts.slice(0, 4).map((p, k) => { const d = new Date(sr.w.current + 'T00:00:00'); d.setDate(d.getDate() + 7 * k); return '<tr class="in-fr"><td>' + esc(fmtDate(inDayKey(d))) + '</td><td class="num">' + inNum(p.v, 1) + '</td><td class="num">' + inNum(p.lo, 0) + '–' + inNum(p.hi, 0) + '</td></tr>'; }).join('') : '');
  return '<div class="card card-p in-series" id="in-s-' + sr.id + '"><h3>' + esc(title) + '</h3>' + inChartSVG(sr, title) + meta +
    '<details class="in-tbl"><summary>' + esc(t('in_fc_table')) + '</summary><table class="tbl"><thead><tr><th>' + esc(t('in_week')) + '</th><th class="num">' + esc(t('in_real')) + ' / ' + esc(t('in_fcst')) + '</th><th class="num">' + esc(t('in_band')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></details></div>';
}
function inSuggHTML(list){
  if (!list.length) return '<p class="muted" id="in-sg-none">' + esc(t('in_sg_none')) + '</p>';
  const icon = {crit:'alert', warn:'alert', info:'sparkles'};
  return '<ul class="in-sg" id="in-sg">' + list.map(s => '<li class="in-sg-' + s.sev + '" data-sg="' + s.id + '"><span class="in-sg-ic">' + ic(icon[s.sev] || 'info') + '</span><div><b>' + esc(s.title) + '</b><p>' + esc(s.detail) + '</p></div>' +
    (s.act ? '<button type="button" class="btn btn-sm" data-a="' + esc(s.act.a) + '" data-v="' + esc(s.act.v || '') + '">' + esc(t('in_open')) + '</button>' : '') + '</li>').join('') + '</ul>';
}
function viewInsights(){
  const D = IN.last = inCompute(), set = D.set, a = D.sv.all;
  const how = t('in_how_p', {f:inNum(set.findMin, 1), m:a.fm.n ? t('in_meas', {s:dmtSec(a.fm.median)}) : t('in_unmeas'), c:inNum(set.catMin, 1), k:a.cm.n ? t('in_meas', {s:dmtSec(a.cm.median)}) : t('in_unmeas'), n:a.nf, b:a.nb});
  const inp = (k, lbl, step) => '<div class="field"><label for="in-' + k + '">' + esc(t(lbl)) + '</label><input class="inp" type="number" min="0" step="' + step + '" id="in-' + k + '" data-in="' + k + '" value="' + esc(String(set[k])) + '"></div>';
  let full = '';
  if (D.full){ full = D.full.wait ? t('in_full_wait') : D.full.now ? t('in_full_now', {c:set.capacity}) : D.full.never ? t('in_full_no') : t('in_full', {d:D.full.date.toLocaleDateString(S.lang === 'en' ? 'en-GB' : 'it-IT', {month:'long', year:'numeric'}), c:set.capacity}); }
  else if (!set.capacity) full = t('in_cap_hint');
  const sizeSr = {id:'size', w:{ys:D.size.ys, labels:D.size.labels.map(l => l + '-01'), start:D.size.labels[0] + '-01', current:''}, y:D.size.ys, fc:null};
  return '<div class="stack" id="in-page"><div class="page-h"><h1>' + ic('trend') + esc(t('in_h')) + helpDot('insights') + '</h1><p class="muted">' + esc(t('in_p')) + '</p></div>' +
    '<section class="card card-p stack" id="in-saved"><h2>' + esc(t('in_saved_h')) + '</h2><div class="in-tiles">' +
      inTile(t('in_saved_month'), D.sv.month.min, set) + inTile(t('in_saved_year'), D.sv.year.min, set) + inTile(t('in_saved_all'), D.sv.all.min, set) +
      (D.nextMin !== null ? inTile(t('in_saved_next'), D.nextMin, set) : '') + '</div>' +
      '<details class="in-how"><summary>' + esc(t('in_how')) + '</summary><p class="small">' + esc(how) + '</p><div class="g2">' + inp('findMin', 'in_f_find', '0.5') + inp('catMin', 'in_f_cat', '0.5') + inp('hourly', 'in_f_hourly', '1') + inp('capacity', 'in_f_cap', '10') + '</div><p class="small muted">' + esc(t('in_data_note')) + '</p></details></section>' +
    '<section class="stack" id="in-sugg-s"><h2>' + esc(t('in_sg_h')) + '</h2>' + inSuggHTML(D.sugg) + '</section>' +
    '<section class="stack" id="in-act"><h2>' + esc(t('in_act_h')) + ' · ' + esc(t('in_fc_h')) + '</h2><div class="in-grid2">' + D.series.map(inSeriesHTML).join('') +
      '<div class="card card-p in-series" id="in-s-size"><h3>' + esc(t('in_s_size')) + '</h3>' + inChartSVG(sizeSr, t('in_s_size')) + '<p class="small"><b>' + esc(full) + '</b></p></div></div></section></div>';
}

document.addEventListener('change', (e) => {
  const el = e.target; if (!el || !el.dataset || !el.dataset.in) return;
  const s = Object.assign({}, IN_DEF, S.settings.insights || {}); s[el.dataset.in] = Math.max(0, +el.value || 0); S.settings.insights = s; commit({dirty:false});
  if (S.view === 'insights'){ const open = !!(document.querySelector('.in-how') || {}).open; renderView(); const d = document.querySelector('.in-how'); if (d && open) d.open = true; }
});
document.addEventListener('mousemove', (e) => {
  const r = e.target && e.target.closest ? e.target.closest('.in-hit') : null, box = r && r.closest('.in-chart');
  document.querySelectorAll('.in-chart .in-tip').forEach(tp => { if (!box || !box.contains(tp)) tp.hidden = true; });
  if (!r || !box) return;
  const tp = box.querySelector('.in-tip'), dot = box.querySelector('.in-dot'), svg = box.querySelector('svg'), sx = svg.clientWidth / 640, sy = svg.clientHeight / 180;
  tp.textContent = r.dataset.tip; tp.hidden = false;
  const x = +r.dataset.x * sx, y = +r.dataset.y * sy;
  tp.style.left = Math.min(Math.max(0, x - tp.offsetWidth / 2), box.clientWidth - tp.offsetWidth) + 'px'; tp.style.top = Math.max(0, y - tp.offsetHeight - 10) + 'px';
  if (dot){ dot.setAttribute('cx', r.dataset.x); dot.setAttribute('cy', r.dataset.y); }
});

(function inWrap(){
  const wrap = (name, fn) => { const o = window[name]; if (typeof o === 'function') window[name] = fn(o); };
  if (typeof NAV_MORE !== 'undefined'){ const g = NAV_MORE.find(x => x[0] === 'nm_work'); if (g && !g[1].some(x => x[0] === 'insights')) g[1].push(['insights', 'trend', 'nav_insights', 'nd_insights']); }
  if (typeof ADV_VIEWS !== 'undefined' && !ADV_VIEWS.includes('insights')) ADV_VIEWS.push('insights');
  wrap('renderView', (o) => function(){
    if (S.view === 'insights'){ document.documentElement.lang = S.lang; $('#view').innerHTML = viewInsights(); return; }
    return o.apply(this, arguments);
  });
})();

document.addEventListener('DOMContentLoaded', () => {
  if (typeof HELP_TOPICS === 'undefined' || HELP_TOPICS.some(x => x.id === 'insights')) return;
  HELP_TOPICS.push({ id:'insights', guide:null, tags:['archive'], pop:45, related:['pick', 'status', 'app-install'],
    kw:{it:'tempo risparmiato risparmio ore costo valore statistiche andamento grafico previsioni previsione forecasting tendenza stagionalità carico lavoro capienza pieno suggerimenti consigli scarto deposito più richiesti', en:'time saved hours cost value statistics trend chart forecast forecasting seasonality workload capacity full suggestions advice disposal deposit most requested'},
    title:{it:('Quanto tempo ci fa risparmiare ' + brandName() + ' e cosa succederà nelle prossime settimane?'), en:('How much time does ' + brandName() + ' save us and what will happen in the coming weeks?')},
    body:{it:'<p>Menu <b>⚙ Funzioni avanzate › Lavoro › Andamento e previsioni</b>.</p><ul>' +
      ('<li><b>Tempo risparmiato</b>: ogni consultazione (scheda del faldone aperta sul PC o sul telefono, uscita o rientro) vale i minuti che servivano per cercarlo senza ' + brandName() + ' meno il tempo misurato dal cronometro; ogni faldone catalogato idem. Metti i vostri minuti e il costo orario in «Come è calcolato».</li>') +
      ('<li><b>Previsioni</b>: per consultazioni, uscite e nuovi faldoni ' + brandName() + ' prova più modelli (settimana scorsa, media, tendenza, livellamento esponenziale, Holt, stagionalità mensile, trimestrale o annuale) e usa quello che ha sbagliato meno sulle ultime settimane; la fascia chiara è l\'intervallo in cui il valore cade 8 volte su 10. Con meno di 8 settimane di dati non prevede nulla.</li>') +
      ('<li><b>Capienza</b>: scrivi quanti faldoni entrano nell\'archivio e ' + brandName() + ' stima il mese in cui sarà pieno.</li>') +
      ('<li><b>Suggerimenti</b>: faldoni in ritardo o fuori da tanto, senza posizione, i più richiesti da tenere a portata di mano, quelli fermi da un anno (deposito), gli anni oltre i 10 anni di conservazione (<b>da verificare</b> prima di qualsiasi scarto: ' + brandName() + ' non decide lo scarto), backup, picchi di lavoro previsti.</li></ul>') +
      '<p>Tutto è calcolato su questo PC; le consultazioni dei telefoni arrivano con la sincronizzazione.</p>',
      en:('<p>Menu <b>⚙ Advanced › Work › Trends and forecasts</b>: time saved (your minutes and hourly cost), weekly activity, forecasts from the best of several models (backtested), capacity date and data-based suggestions. Disposal candidates are only to be checked: ' + brandName() + ' never decides disposal.</p>')}
  });
});
