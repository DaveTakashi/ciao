// DocMap unit checks (~20 s): the pure functions behind the v12.10 features, called directly in the page, with edge
// cases and randomised properties the feature tests (v1210*.js) do not reach. Run in two time zones (Rome and
// Auckland: daylight-saving changes in opposite seasons) because dates are where regressions hide.
//   - Prelievi: segment order, route (every binder exactly once, serpentine, no location), phone payload round trip
//     and hostile payloads, walk estimate, receipt fingerprint.
//   - Faldone smarrito: contact cleaning, label code from the address bar, links, HTML escaping.
//   - Promemoria: day arithmetic across month ends, leap years and daylight saving.
//   - Andamento: weekly / monthly buckets across daylight saving, forecasts on flat, zero, trend, seasonal, noisy
//     and huge series (never negative, never NaN, band around the value).
// Run: cd docmapv1/tests && NODE_PATH=$(npm root -g) node unit.js
'use strict';
const H = require('./lib/harness');

H.run('unit (funzioni pure v12.10)', async (t) => {
  for (const tz of ['Europe/Rome', 'Pacific/Auckland']) {
    const p = await t.page('index.html', {timezoneId: tz});
    const at = ' [' + tz + ']';

    /* ---------------- Prelievi: order of segments ---------------- */
    const seg = await p.evaluate(() => ({
      greek: ['γ', 'α', 'β'].sort(pkSegCmp).join(''),
      sides: ['DX', 'sx', 'CX'].sort(pkSegCmp).join(','),
      words: ['destra', 'Sinistra', 'centro'].sort(pkSegCmp).join(','),
      natural: ['10', '2', '1'].sort(pkSegCmp).join(','),
      mixed: ['B', 'α', '2'].sort(pkSegCmp).join(','),
      nulls: [null, 'A', undefined].sort(pkSegCmp).map(String).join(','),
    }));
    t.eq(seg.greek, 'αβγ', 'route: Greek shelves in alphabet order' + at);
    t.eq(seg.sides, 'sx,CX,DX', 'route: SX < CX < DX whatever the case' + at);
    t.eq(seg.words, 'Sinistra,centro,destra', 'route: sinistra < centro < destra' + at);
    t.eq(seg.natural, '1,2,10', 'route: numbers in natural order' + at);
    t.eq(seg.mixed.split(',')[0], 'α', 'route: a known position comes before free text' + at);
    t.ok(seg.nulls.split(',').length === 3, 'route: empty segments do not throw' + at, seg.nulls);

    /* ---------------- Prelievi: the walk ---------------- */
    const R = await p.evaluate(() => {
      const mk = (id, room, cab, shelf, code, sector) => ({id, room_code:room, cabinet_code:cab, shelf_code:shelf, speaking_code:code, sector_code:sector || ''});
      const empty = pkRoute([]);
      const junk = pkRoute([null, undefined, {}, {id:''}]);
      const bs = [mk('a', 'A', '1', 'β', 'A-02'), mk('b', 'A', '1', 'α', 'A-01'), mk('c', 'A', '2', 'α', 'A-05'), mk('d', 'A', '2', 'β', 'A-06'),
        mk('e', '', '', '', 'X-1'), mk('a', 'A', '1', 'β', 'dup'), mk('f', 'A', '1', 'α', 'A-00', 'DX'), mk('g', 'A', '1', 'α', 'A-09', 'SX')];
      const serp = pkRoute(bs), flat = pkRoute(bs, {serpentine:false});
      return {empty:[empty.stops.length, empty.order.length, empty.noLoc.length, empty.rooms],
        junk:[junk.stops.length, junk.order.length],
        serp:serp.order, flat:flat.order, noLoc:serp.noLoc, stops:serp.stops.map(s => s.text), rooms:serp.rooms,
        est:[pkEstimate(serp), pkEstimate(serp, 10, 5), pkEstimate(empty)], fmt:[pkFmtMin(0), pkFmtMin(59), pkFmtMin(3600), pkFmtMin(3599 + 60 * 61)]};
    });
    t.eq(R.empty, [0, 0, 0, 0], 'route: no binders → empty walk' + at);
    t.eq(R.junk, [0, 0], 'route: null / id-less entries are skipped' + at);
    t.eq(R.serp.slice().sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'route: every binder exactly once (duplicate id dropped)' + at);
    t.eq(R.noLoc, ['e'], 'route: binder without a place goes to «senza posizione»' + at);
    t.eq(R.serp[R.serp.length - 1], 'e', 'route: binders without a place come last' + at);
    // inside a stop: sector SX, then DX, then binders without a sector; then the speaking code
    t.eq(R.flat, ['g', 'f', 'b', 'a', 'c', 'd', 'e'], 'route without serpentine: cabinet 1 α (SX, DX, no sector), β, then cabinet 2 α, β' + at);
    t.eq(R.serp, ['g', 'f', 'b', 'a', 'd', 'c', 'e'], 'route with serpentine: cabinet 2 walked back (β then α)' + at);
    t.eq(R.rooms, 1, 'route: one room' + at);
    t.ok(R.est[0] > R.est[1] && R.est[2] === 0, 'estimate: defaults, custom times, empty = 0 s' + at, R.est);
    t.eq(R.fmt, ['1 min', '1 min', '1 h 00 min', '2 h 01 min'], 'estimate: minutes and hours text' + at);

    // property: random archives, the order is always a permutation of the unique ids
    const prop = await p.evaluate(() => {
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const pick = (a) => a[Math.floor(rnd() * a.length)];
      const bad = [];
      for (let k = 0; k < 150; k++){
        const n = Math.floor(rnd() * 40), bs = [];
        for (let i = 0; i < n; i++) bs.push({id:'b' + Math.floor(rnd() * 30), room_code:pick(['', 'A', 'B', 'Sala 2']), cabinet_code:pick(['', '1', '2', '10', 'α']),
          shelf_code:pick(['', 'α', 'β', 'γ', '3']), sector_code:pick(['', 'SX', 'DX', 'CX']), speaking_code:pick(['', 'Z-1', 'Z-10', 'Z-2']), location_code:pick(['', 'A-1-β', 'B · 2'])});
        const want = Array.from(new Set(bs.map(b => b.id))).sort();
        [true, false].forEach(sp => { const r = pkRoute(bs, {serpentine:sp}); const got = r.order.slice().sort(); if (got.join() !== want.join()) bad.push({k, sp, got, want}); });
      }
      return bad.slice(0, 2);
    });
    t.eq(prop, [], 'route property: 300 random archives, order = each binder once' + at);

    /* ---------------- Prelievi: phone link payload ---------------- */
    const P = await p.evaluate(() => {
      const bs = [{id:'x1', short_code:'dm26AAAAAAAA', speaking_code:'A-1', company_name:'Società Àèìòù ★ ' + 'x'.repeat(60), room_code:'A'},
                  {id:'x2', short_code:'dm26BBBBBBBB', speaking_code:'A-2', company_name:'Beta', room_code:'B'}];
      const route = pkRoute(bs), pick = {id:'pk-1700000000-abc', title:'Verifica «fiscale» 2026 — è', purpose:'audit', status_id:'taken', holder:'Dott.ssa Rossi', due_date:'2026-12-01'};
      const enc = pkEncode(pkPayload(pick, bs, route)), dec = pkDecode(enc);
      const big = []; for (let i = 0; i < 400; i++) big.push({id:'y' + i, short_code:'dm26C' + String(i).padStart(7, '0'), room_code:'A', shelf_code:String(i % 9)});
      const bigP = pkPayload(pick, big, pkRoute(big));
      const forge = (o) => pkDecode(pkB64e(JSON.stringify(o)));
      const base = {v:1, id:'pk-1', i:[['dm26AAAAAAAA', 'c', 'n', 0]], w:['A']};
      return {
        urlSafe:/^[A-Za-z0-9_-]+$/.test(enc), title:dec.title, holder:dec.holder, due:dec.due_date, purpose:dec.purpose, items:dec.items.map(x => x.s + '|' + x.w), stops:dec.stops.length,
        nameMax:dec.items[0].n.length <= 40,
        bigItems:bigP.i.length, bigTotal:bigP.n, bigLink:PK_LINK_MAX_ITEMS,
        garbage:[pkDecode(''), pkDecode('!!!'), pkDecode('e30'), pkDecode(null)].map(x => x === null),
        wrongV:forge(Object.assign({}, base, {v:2})) === null,
        badId:[forge(Object.assign({}, base, {id:'x-1'})), forge(Object.assign({}, base, {id:'pk-<script>'})), forge(Object.assign({}, base, {id:'pk-' + 'a'.repeat(97)}))].map(x => x === null),
        badCode:forge(Object.assign({}, base, {i:[['<img>', 'c'], ['ok_1', 'c'], 'str', ['dm26' + 'A'.repeat(40)]]})).items.map(x => x.s),
        badStop:forge(Object.assign({}, base, {i:[['a', '', '', 5], ['b', '', '', -1], ['c', '', '', 0.5], ['d', '', '', 0]]})).items.map(x => x.w),
        badMeta:(() => { const d = forge(Object.assign({}, base, {p:'hack', d:'2026-13-01x', s:{}, t:{a:1}})); return [d.purpose, d.due_date, typeof d.status_id, typeof d.title]; })(),
        manyItems:forge(Object.assign({}, base, {i:Array.from({length:600}, (_, k) => ['c' + k])})).items.length,
      };
    });
    t.ok(P.urlSafe, 'phone link: base64url only (safe in a URL / QR)' + at);
    t.eq([P.title, P.holder, P.due, P.purpose], ['Verifica «fiscale» 2026 — è', 'Dott.ssa Rossi', '2026-12-01', 'audit'], 'phone link: accents and symbols survive the round trip' + at);
    t.eq(P.items, ['dm26AAAAAAAA|0', 'dm26BBBBBBBB|1'], 'phone link: items in walk order with their stop' + at);
    t.ok(P.nameMax, 'phone link: company name capped' + at);
    t.eq([P.bigItems, P.bigTotal], [P.bigLink, 400], 'phone link: at most PK_LINK_MAX_ITEMS binders, total kept' + at);
    t.eq(P.garbage, [true, true, true, true], 'phone link: garbage → null, no exception' + at);
    t.ok(P.wrongV, 'phone link: other format version refused' + at);
    t.eq(P.badId, [true, true, true], 'phone link: list id must be pk-… and short' + at);
    t.eq(P.badCode, ['ok_1'], 'phone link: malformed short codes dropped' + at);
    t.eq(P.badStop, [-1, -1, -1, 0], 'phone link: stop index out of range / not integer → -1' + at);
    t.eq(P.badMeta, ['other', '', 'string', 'string'], 'phone link: unknown purpose, bad date, non-string fields neutralised' + at);
    t.eq(P.manyItems, 400, 'phone link: at most PK_MAX_ITEMS items' + at);

    /* ---------------- signed hand-over: fingerprint ---------------- */
    const F = await p.evaluate(async () => {
      const r = {id:'h1', at:'2026-11-22T10:00:00Z', kind:'out', recipient:'Mario', doc:'CI 123', operator:'dave', sigHash:'ab', items:[{id:'b2', code:'X'}, {id:'b1', code:'Y'}]};
      const r2 = Object.assign({}, r, {items:r.items.slice().reverse()}), r3 = Object.assign({}, r, {recipient:'Maria'});
      return {abc:await pkSha256Hex('abc'), empty:await pkSha256Hex(''), order:pkReceiptCanon(r) === pkReceiptCanon(r2), change:pkReceiptCanon(r) !== pkReceiptCanon(r3),
        h1:await pkSha256Hex(pkReceiptCanon(r)), h3:await pkSha256Hex(pkReceiptCanon(r3)),
        bytes:[pkDataUrlBytes('x'), pkDataUrlBytes(''), Array.from(pkDataUrlBytes('data:image/png;base64,AAEC') || [])]};
    });
    t.eq(F.abc, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'fingerprint: SHA-256 test vector «abc»' + at);
    t.eq(F.empty, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'fingerprint: SHA-256 of empty text' + at);
    t.ok(F.order && F.change && F.h1 !== F.h3, 'fingerprint: item order does not matter, recipient does' + at, F);
    t.eq(F.bytes, [null, null, [0, 1, 2]], 'signature bytes: only a base64 data URL is read' + at);

    /* ---------------- Faldone smarrito ---------------- */
    const D = await p.evaluate(() => {
      const n = (f, imp, st) => fdNorm(f, imp, st);
      const evil = n({on:true, name:'<img src=x onerror=alert(1)>', phone:'+39 (02) 123-456', note:'"><script>x</script>', email:'a@b.it'});
      const html = fdCardHTML(evil, '"><svg onload=alert(1)>', 'btn"x');
      const links = fdLinks(n({on:true, phone:'+39 333 12 34 567', whatsapp:'+39 333-1234567', email:'studio@example.it'}), 'dm26AAAAAAAA');
      return {
        off:[n(null), n('x'), n({on:false, phone:'1'}), n({phone:'1'}), n({on:true}), n({on:true, name:'X'})],
        implicit:!!n({phone:'1'}, true), implicitOff:n({on:false, phone:'1'}, true),
        studio:n({on:true, phone:'1'}, false, 'Studio Uno').name,
        caps:(() => { const o = n({on:true, name:'N'.repeat(500), phone:'1'.repeat(100), note:'x'.repeat(1000)}); return [o.name.length, o.phone.length, o.note.length]; })(),
        nonString:n({on:true, name:{a:1}, phone:12345, email:['a@b.it']}),
        emails:['a@b.it', 'a b@c.it', 'a@b', '<a@b.it>', 'a@b.it?cc=x', 'a@b.it&body=x', 'a@b.it#x', 'a@b.it,c@d.it'].map(e => (n({on:true, email:e}) || {email:''}).email),
        codes:['dm26AAAAAAAA', ' dm26AAAAAAAA ', '<script>', 'a b', 'x'.repeat(41), 'A-1_2.3', null].map(fdCode),
        htmlSafe:!/<img|<script|<svg/i.test(html) && /&lt;img/.test(html), btnSafe:!/class="btn"x/.test(html),
        noCodeBadge:!/fd-code/.test(html),
        links:links.map(l => l.k + ' ' + l.href.split('?')[0]),
        waText:decodeURIComponent((links.find(l => l.k === 'wa') || {href:''}).href.split('text=')[1] || ''),
      };
    });
    t.eq(D.off, [null, null, null, null, null, null], 'finder: off, missing or without any contact → no card' + at);
    t.ok(D.implicit && D.implicitOff === null, 'finder: docmap.config.js block on by default, unless on:false' + at);
    t.eq(D.studio, 'Studio Uno', 'finder: name falls back to the studio name' + at);
    t.eq(D.caps, [120, 40, 400], 'finder: fields capped to FD_MAX' + at);
    t.eq(D.nonString, null, 'finder: non-text fields ignored (no contact left → no card)' + at);
    t.eq(D.emails, ['a@b.it', '', '', '', '', '', '', ''], 'finder: only a plain e-mail address is kept (no cc / body / anchor injection)' + at);
    t.eq(D.codes, ['dm26AAAAAAAA', 'dm26AAAAAAAA', '', '', '', 'A-1_2.3', ''], 'finder: only a plain label code from the address bar' + at);
    t.ok(D.htmlSafe && D.btnSafe && D.noCodeBadge, 'finder card: name, note, code and class escaped / refused' + at, D);
    t.eq(D.links, ['call tel:+393331234567', 'wa https://wa.me/393331234567', 'sms sms:+393331234567', 'mail mailto:studio@example.it'], 'finder links: digits only, WhatsApp without +' + at);
    t.ok(/dm26AAAAAAAA/.test(D.waText), 'finder: the label code is written in the message' + at, D.waText);

    /* ---------------- Promemoria: day arithmetic ---------------- */
    const Dd = await p.evaluate(() => ({
      add:[['2026-01-31', 1], ['2026-02-28', 1], ['2028-02-28', 1], ['2026-03-28', 1], ['2026-03-28', 2], ['2026-10-24', 1], ['2026-10-24', 2],
        ['2026-04-05', 1], ['2026-09-26', 2], ['2026-12-31', 1], ['2026-03-01', -1], ['2026-11-23', 0], ['2026-11-23', 365]].map(([d, n]) => rmAddDays(d, n)),
      diff:[rmDiff('2026-03-30', '2026-03-28'), rmDiff('2026-10-26', '2026-10-24'), rmDiff('2026-04-06', '2026-04-04'), rmDiff('2026-01-01', '2026-12-31'), rmDiff('2027-01-01', '2026-01-01')],
      walk:(() => { let d = '2026-01-01', bad = 0; for (let i = 0; i < 800; i++){ const n = rmAddDays(d, 1); if (rmDiff(n, d) !== 1) bad++; d = n; } return {bad, end:d}; })(),
      key:[rmHolderKey('  Studio ROSSI '), rmHolderKey(null), rmHolderKey(42)],
      day:[rmDay('2026-11-23T23:59:59Z'), rmDay(''), rmDay(null)],
    }));
    t.eq(Dd.add, ['2026-02-01', '2026-03-01', '2028-02-29', '2026-03-29', '2026-03-30', '2026-10-25', '2026-10-26', '2026-04-06', '2026-09-28', '2027-01-01', '2026-02-28', '2026-11-23', '2027-11-23'],
      'reminders: add days across month end, leap year, daylight saving (EU and NZ), year end, negative' + at);
    t.eq(Dd.diff, [2, 2, 2, -364, 365], 'reminders: difference in days is an integer across daylight saving' + at);
    t.eq(Dd.walk, {bad:0, end:'2028-03-11'}, 'reminders: 800 consecutive days, each exactly one apart' + at);
    t.eq(Dd.key, ['studio rossi', '', '42'], 'reminders: holder key ignores case and spaces' + at);
    t.eq(Dd.day, ['2026-11-23', '', ''], 'reminders: day of an ISO time' + at);

    /* ---------------- Andamento: buckets ---------------- */
    const W = await p.evaluate(() => {
      const now = new Date(2026, 10, 25, 9, 0, 0);                    // Wednesday 25 Nov 2026, local time
      const iso = (y, m, d, h) => new Date(y, m, d, h || 12).toISOString();
      const ws = inWeekStart(new Date(2026, 2, 29, 23, 30));          // Sunday of the EU change → Monday 23 Mar
      const r = inWeekly([iso(2026, 10, 16, 0), iso(2026, 10, 22, 23), iso(2026, 10, 23), iso(2026, 10, 25), 'nope', '', iso(2026, 2, 29, 3), iso(2026, 2, 30, 1), iso(2026, 9, 25, 2), iso(2026, 9, 26, 1)], 52, now);
      const sum = r.ys.reduce((a, b) => a + b, 0);
      const idx = (y, m, d) => r.labels.indexOf(inDayKey(new Date(y, m, d)));
      const mo = inMonthly([iso(2026, 0, 1), iso(2025, 11, 31), iso(2025, 0, 5), iso(2026, 10, 30), 'x'], 12, new Date(2026, 0, 15));
      return {ws:inDayKey(ws), cur:r.current, len:r.ys.length, last:r.labels[51], sum, w16:r.ys[idx(2026, 10, 16)], w23:idx(2026, 10, 23),
        dstEu:[r.ys[idx(2026, 2, 23)], r.ys[idx(2026, 2, 30)]], dstOct:[r.ys[idx(2026, 9, 19)], r.ys[idx(2026, 9, 26)]],
        mo:[mo.ys.length, mo.labels[0], mo.labels[11], mo.ys[11], mo.before, mo.ys.reduce((a, b) => a + b, 0)]};
    });
    t.eq(W.ws, '2026-03-23', 'insights: a week starts on Monday (also on a daylight-saving Sunday night)' + at);
    t.eq([W.cur, W.len, W.last], ['2026-11-23', 52, '2026-11-16'], 'insights: 52 complete weeks before the current one' + at);
    t.eq([W.w16, W.w23], [2, -1], 'insights: Monday 00:00 and Sunday 23:00 in the same week; the current week is not counted' + at);
    t.eq(W.dstEu, [1, 1], 'insights: dates around the March change in the right week' + at);
    t.eq(W.dstOct, [1, 1], 'insights: dates around the October change in the right week' + at);
    t.eq(W.sum, 6, 'insights: invalid dates and the current week ignored' + at);
    t.eq(W.mo, [12, '2025-01', '2025-12', 1, 0, 2], 'insights: 12 months before the current month; January now → previous year' + at);

    /* ---------------- Andamento: forecasts ---------------- */
    const FC = await p.evaluate(() => {
      const fine = (fc) => !!fc && fc.pts.every(x => isFinite(x.v) && isFinite(x.lo) && isFinite(x.hi) && x.v >= 0 && x.lo >= 0 && x.lo <= x.v + 1e-9 && x.v <= x.hi + 1e-9);
      let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const S_ = {
        short:inForecast([1, 2, 3], 12), empty:inForecast([], 12),
        zeros:inForecast(new Array(30).fill(0), 12),
        flat:inForecast(new Array(30).fill(5), 12),
        trend:inForecast(Array.from({length:30}, (_, i) => 2 + i), 12),
        down:inForecast(Array.from({length:30}, (_, i) => Math.max(0, 30 - 2 * i)), 12),
        season:inForecast(Array.from({length:40}, (_, i) => [10, 0, 0, 0][i % 4]), 8),
        noisy:inForecast(Array.from({length:52}, () => Math.round(rnd() * 20)), 12),
        huge:inForecast(Array.from({length:30}, (_, i) => 1e12 + i * 1e9), 12),
        spike:inForecast(Array.from({length:20}, (_, i) => i === 19 ? 500 : 1), 12),
      };
      const o = {};
      Object.keys(S_).forEach(k => { const f = S_[k]; o[k] = f ? {ok:fine(f), model:f.model, m:f.m, v1:f.pts[0].v, v12:f.pts[f.pts.length - 1].v, n:f.pts.length, w1:f.pts[0].hi - f.pts[0].lo, wN:f.pts[f.pts.length - 1].hi - f.pts[f.pts.length - 1].lo} : null; });
      o.seasonPts = S_.season ? S_.season.pts.map(x => Math.round(x.v)) : null;
      return o;
    });
    t.ok(FC.short === null && FC.empty === null, 'forecast: too short a history → none' + at);
    t.ok(FC.zeros && FC.zeros.ok && FC.zeros.v1 === 0 && FC.zeros.v12 === 0, 'forecast: all zeros → 0, no NaN' + at, FC.zeros);
    t.ok(FC.flat && FC.flat.ok && Math.abs(FC.flat.v1 - 5) < 1e-6 && Math.abs(FC.flat.v12 - 5) < 1e-6 && FC.flat.w1 < 1e-6, 'forecast: flat series → same value, no band' + at, FC.flat);
    t.ok(FC.trend && FC.trend.ok && FC.trend.v12 > FC.trend.v1 && Math.abs(FC.trend.v1 - 32) < 1.5, 'forecast: steady growth is continued' + at, FC.trend);
    t.ok(FC.down && FC.down.ok && FC.down.v12 === 0, 'forecast: a falling series stops at 0 (never negative)' + at, FC.down);
    t.ok(FC.season && FC.season.ok && /snaive|hw/.test(FC.season.model) && FC.season.m === 4, 'forecast: 4-week cycle recognised' + at, FC.season);
    t.eq(FC.seasonPts, [10, 0, 0, 0, 10, 0, 0, 0], 'forecast: the cycle is repeated at the right phase' + at);
    t.ok(FC.noisy && FC.noisy.ok && FC.noisy.wN >= FC.noisy.w1 && FC.noisy.n === 12, 'forecast: noisy series → finite, band widens with the horizon' + at, FC.noisy);
    t.ok(FC.huge && FC.huge.ok && FC.huge.v12 > 1e12, 'forecast: very large counts stay finite' + at, FC.huge);
    t.ok(FC.spike && FC.spike.ok, 'forecast: one spike at the end → finite, not negative' + at, FC.spike);
  }
});
