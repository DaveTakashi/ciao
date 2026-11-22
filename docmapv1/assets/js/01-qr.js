/* =====================================================================
   DM26 QR — embedded pure-JS QR Code Model 2 encoder → SVG (offline)
   Byte mode (UTF-8), versions 1–40, ECC L/M/Q/H, automatic mask choice.
   Algorithm follows ISO/IEC 18004.
   ===================================================================== */
const DMQR = (() => {
  const ECC_PER_BLOCK = {
    L:[-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    M:[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
    Q:[-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    H:[-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]
  };
  const NUM_BLOCKS = {
    L:[-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
    M:[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
    Q:[-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
    H:[-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]
  };
  const FORMAT_BITS = {L:1, M:0, Q:3, H:2};

  function gfMul(x, y){ let z = 0; for (let i = 7; i >= 0; i--){ z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
  function rsDivisor(degree){
    const r = new Array(degree).fill(0); r[degree-1] = 1; let root = 1;
    for (let i = 0; i < degree; i++){
      for (let j = 0; j < r.length; j++){ r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j+1]; }
      root = gfMul(root, 0x02);
    }
    return r;
  }
  function rsRemainder(data, div){
    const r = div.map(() => 0);
    for (const b of data){ const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
    return r;
  }
  function rawModules(v){
    let r = (16 * v + 128) * v + 64;
    if (v >= 2){ const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  }
  function dataCodewords(v, ecl){ return Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[ecl][v] * NUM_BLOCKS[ecl][v]; }
  function alignPositions(v){
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2, size = v * 4 + 17;
    const step = (v === 32) ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    const res = [6];
    for (let pos = size - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
    return res;
  }
  function utf8(str){
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str));
    return Array.from(unescape(encodeURIComponent(str))).map(c => c.charCodeAt(0));
  }

  function encode(text, ecl){
    ecl = FORMAT_BITS.hasOwnProperty(ecl) ? ecl : 'M';
    const data = utf8(String(text));
    let ver = 1, ccBits = 8;
    for (; ver <= 40; ver++){
      ccBits = ver <= 9 ? 8 : 16;
      if (4 + ccBits + data.length * 8 <= dataCodewords(ver, ecl) * 8) break;
    }
    if (ver > 40) throw new Error('QR: data too long');
    const capBits = dataCodewords(ver, ecl) * 8;
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0x4, 4); put(data.length, ccBits); data.forEach(b => put(b, 8));
    put(0, Math.min(4, capBits - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const cw = [];
    for (let i = 0; i < bits.length; i += 8){ let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; cw.push(b); }

    // Error correction + interleaving
    const nBlocks = NUM_BLOCKS[ecl][ver], eccLen = ECC_PER_BLOCK[ecl][ver];
    const rawCw = Math.floor(rawModules(ver) / 8);
    const nShort = nBlocks - rawCw % nBlocks, shortLen = Math.floor(rawCw / nBlocks);
    const div = rsDivisor(eccLen), blocks = [];
    for (let i = 0, k = 0; i < nBlocks; i++){
      const dat = cw.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1)); k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++)
      blocks.forEach((blk, j) => { if (i !== shortLen - eccLen || j >= nShort) all.push(blk[i]); });

    // Matrix
    const size = ver * 4 + 17;
    const M = Array.from({length:size}, () => new Array(size).fill(false));
    const F = Array.from({length:size}, () => new Array(size).fill(false));
    const setF = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
    for (let i = 0; i < size; i++){ setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++){
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const ap = alignPositions(ver), na = ap.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++){
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        setF(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const drawFormat = (mask) => {
      const d = (FORMAT_BITS[ecl] << 3) | mask; let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412, bit = i => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(i));
      setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i));
      setF(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7){
      let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++){
        const bit = ((b >>> i) & 1) !== 0, a = size - 11 + i % 3, c = Math.floor(i / 3);
        setF(a, c, bit); setF(c, a, bit);
      }
    }
    // Codewords (zig-zag)
    let bi = 0;
    for (let right = size - 1; right >= 1; right -= 2){
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++){
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!F[y][x] && bi < all.length * 8){ M[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
      }
    }
    const maskFn = [
      (x,y) => (x + y) % 2 === 0, (x,y) => y % 2 === 0, (x,y) => x % 3 === 0, (x,y) => (x + y) % 3 === 0,
      (x,y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x,y) => x * y % 2 + x * y % 3 === 0,
      (x,y) => (x * y % 2 + x * y % 3) % 2 === 0, (x,y) => ((x + y) % 2 + x * y % 3) % 2 === 0
    ];
    const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && maskFn[m](x, y)) M[y][x] = !M[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      const line = (get) => {
        for (let a = 0; a < size; a++){
          let run = 1, s = '';
          for (let b = 0; b < size; b++){
            const v = get(a, b); s += v ? '1' : '0';
            if (b > 0){ if (v === get(a, b - 1)){ run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; }
          }
          s = '0000' + s + '0000';
          let idx = s.indexOf('1011101');
          while (idx !== -1){
            if (s.substr(idx - 4, 4) === '0000' || s.substr(idx + 7, 4) === '0000') p += 40;
            idx = s.indexOf('1011101', idx + 1);
          }
        }
      };
      line((a, b) => M[a][b]); line((a, b) => M[b][a]);
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++){
        const c = M[y][x]; if (c === M[y][x+1] && c === M[y+1][x] && c === M[y+1][x+1]) p += 3;
      }
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (M[y][x]) dark++;
      const total = size * size, k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
      return p + Math.max(0, k) * 10;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++){
      applyMask(m); drawFormat(m);
      const pn = penalty(); if (pn < bestP){ bestP = pn; best = m; }
      applyMask(m);
    }
    applyMask(best); drawFormat(best);
    return { size, modules: M, version: ver, mask: best, ecl };
  }

  const cache = new Map();
  function svg(text, opts){
    opts = opts || {};
    const ecl = opts.ecl || 'M', quiet = opts.quiet == null ? 4 : opts.quiet, fg = opts.fg || '#0F172A';
    const key = text + '|' + ecl + '|' + quiet + '|' + fg;
    if (cache.has(key)) return cache.get(key);
    const q = encode(text, ecl), n = q.size + quiet * 2;
    let d = '';
    for (let y = 0; y < q.size; y++){
      let x = 0;
      while (x < q.size){
        if (q.modules[y][x]){ let s = x; while (x < q.size && q.modules[y][x]) x++; d += 'M' + (s + quiet) + ' ' + (y + quiet) + 'h' + (x - s) + 'v1h-' + (x - s) + 'z'; }
        else x++;
      }
    }
    const out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges" role="img" aria-label="QR ' + String(text).replace(/[<>&"]/g, '') + '"><rect width="' + n + '" height="' + n + '" fill="#fff"/><path fill="' + fg + '" d="' + d + '"/></svg>';
    if (cache.size > 600) cache.clear();
    cache.set(key, out);
    return out;
  }
  return { encode, svg };
})();
