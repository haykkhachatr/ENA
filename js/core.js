/* Core: data model, filter state, aggregation, i18n helpers, palette, formatting, tooltip. */
(function () {
  'use strict';

  const D = window.HEC_DATA;
  const HEC = (window.HEC = { D });

  /* ---------- tiny event bus ---------- */
  const listeners = {};
  HEC.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  HEC.emit = (ev, arg) => { (listeners[ev] || []).forEach((fn) => fn(arg)); };

  /* ---------- constants ---------- */
  HEC.KV = [6, 10, 35];
  HEC.LEN_BINS = [0, 0.1, 0.25, 0.5, 1, 2, Infinity];
  HEC.PAGE_SIZES = [10, 25, 50];

  /* ---------- Armenian -> Latin transliteration (BGN/PCGN-style, simplified) ---------- */
  const AM = {
    'ա': 'a', 'բ': 'b', 'գ': 'g', 'դ': 'd', 'ե': 'e', 'զ': 'z', 'է': 'e', 'ը': 'y', 'թ': 't', 'ժ': 'zh',
    'ի': 'i', 'լ': 'l', 'խ': 'kh', 'ծ': 'ts', 'կ': 'k', 'հ': 'h', 'ձ': 'dz', 'ղ': 'gh', 'ճ': 'ch', 'մ': 'm',
    'յ': 'y', 'ն': 'n', 'շ': 'sh', 'ո': 'o', 'չ': 'ch', 'պ': 'p', 'ջ': 'j', 'ռ': 'r', 'ս': 's', 'վ': 'v',
    'տ': 't', 'ր': 'r', 'ց': 'ts', 'ւ': 'u', 'փ': 'p', 'ք': 'k', 'օ': 'o', 'ֆ': 'f', 'և': 'ev'
  };
  const isArm = (c) => c >= 0x531 && c <= 0x587;
  const isUp = (c) => c >= 0x531 && c <= 0x556;

  function translit(s) {
    let out = '';
    const n = s.length;
    for (let i = 0; i < n; i++) {
      const code = s.charCodeAt(i);
      if (!isArm(code)) { out += s[i]; continue; }
      const up = isUp(code);
      const lc = up ? String.fromCharCode(code + 0x30) : s[i];
      const prevArm = i > 0 && isArm(s.charCodeAt(i - 1));
      const prevUp = i > 0 && isUp(s.charCodeAt(i - 1));
      const nextUp = i + 1 < n && isUp(s.charCodeAt(i + 1));
      let lat;
      if (lc === 'ո' && s[i + 1] && (s[i + 1] === 'ւ' || s[i + 1] === 'Ւ')) { lat = 'u'; i++; }
      else if (lc === 'ե' && !prevArm) lat = 'ye';
      else lat = AM[lc] || '';
      if (up) lat = (prevUp || nextUp) ? lat.toUpperCase() : lat.charAt(0).toUpperCase() + lat.slice(1);
      out += lat;
    }
    return out;
  }
  HEC.translit = translit;

  const PLACE_EN = {
    'Երևան': 'Yerevan', 'Երևան 110/35': 'Yerevan 110/35', 'Նորք': 'Nork', 'Մաշտոց': 'Mashtots',
    'Էրեբունի': 'Erebuni', 'Շենգավիթ': 'Shengavit', 'Կենտրոն': 'Kentron', 'Նոր Նորք': 'Nor Nork',
    'Մալաթիա-Սեբաստիա': 'Malatia-Sebastia', 'Ավան': 'Avan', 'Դավթաշեն': 'Davtashen',
    'Աջափնյակ': 'Ajapnyak', 'Նորք Մարաշ': 'Nork Marash', 'Արաբկիր': 'Arabkir',
    'Քանաքեռ-Զեյթուն': 'Kanaker-Zeytun', 'Նուբարաշեն': 'Nubarashen', 'Ջրվեժ': 'Jrvezh', 'Կոտայք': 'Kotayk'
  };
  const placeEn = (s) => PLACE_EN[s] || translit(s);

  /* ---------- data preparation ---------- */
  D.branchesEn = D.branches.map(placeEn);
  D.communitiesEn = D.communities.map(placeEn);
  D.provincesEn = D.provinces.map(placeEn);

  const binOf = (len) => {
    for (let i = 0; i < HEC.LEN_BINS.length - 1; i++) if (len >= HEC.LEN_BINS[i] && len < HEC.LEN_BINS[i + 1]) return i;
    return HEC.LEN_BINS.length - 2;
  };

  D.features.forEach((f, i) => {
    f.i = i;
    f.parts = f.c ? [f.c] : f.m;                       // arrays of [lon, lat]
    f.latlngs = f.parts.map((p) => p.map((q) => [q[1], q[0]]));
    let s = 90, w = 180, n = -90, e = -180;
    f.parts.forEach((p) => p.forEach((q) => {
      if (q[1] < s) s = q[1]; if (q[1] > n) n = q[1];
      if (q[0] < w) w = q[0]; if (q[0] > e) e = q[0];
    }));
    f.bbox = [[s, w], [n, e]];
    f.lc = binOf(f.len);
    f.nmEn = translit(f.nm);
    f.hay = (f.nm + ' ' + f.nmEn + ' ' + f.id + ' ' + (f.uid || '') + ' ' + D.communities[f.cm] + ' ' + D.communitiesEn[f.cm]).toLowerCase();
  });
  HEC.features = D.features;
  HEC.nB = D.branches.length;
  HEC.nC = D.communities.length;

  /* ---------- language ---------- */
  let lang = 'en';
  HEC.lang = () => lang;
  HEC.t = (key, params) => {
    const dict = window.HEC_STR[lang] || window.HEC_STR.en;
    let v = dict[key];
    if (v === undefined) v = window.HEC_STR.en[key];
    if (v === undefined) return key;
    if (Array.isArray(v)) return v[0];
    return params ? v.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m)) : v;
  };
  HEC.plural = (key, n) => {
    const v = (window.HEC_STR[lang] || window.HEC_STR.en)[key];
    return Array.isArray(v) ? (n === 1 ? v[0] : v[1]) : key;
  };
  HEC.name = {
    branch: (i) => (lang === 'hy' ? D.branches[i] : D.branchesEn[i]),
    comm: (i) => (lang === 'hy' ? D.communities[i] : D.communitiesEn[i]),
    prov: (i) => (lang === 'hy' ? D.provinces[i] : D.provincesEn[i]),
    seg: (f) => (lang === 'hy' ? f.nm : f.nmEn)
  };

  /* ---------- formatting ---------- */
  HEC.fmt = {
    int: (n) => Math.round(n).toLocaleString('en-US'),
    km: (x, d) => {
      d = d === undefined ? 1 : d;
      return x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    },
    pct: (x, d) => {
      d = d === undefined ? 1 : d;
      return x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    }
  };
  HEC.kmAuto = (x) => HEC.fmt.km(x, x < 10 ? 2 : 1);
  HEC.lenClassLabel = (i) => HEC.t('lc.' + i);
  HEC.kvLabel = (kv) => kv + ' ' + HEC.t('u.kv');

  /* ---------- palette (single source of truth; pushed to CSS variables) ---------- */
  const SEQ_LIGHT = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
  HEC.PAL = {
    light: {
      kv: { 6: '#6da7ec', 10: '#256abf', 35: '#0d366b' },
      br: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'],
      seq: SEQ_LIGHT,
      series: '#2a78d6'
    },
    dark: {
      kv: { 6: '#3987e5', 10: '#86b6ef', 35: '#cde2fb' },
      br: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'],
      seq: SEQ_LIGHT.slice().reverse(),
      series: '#3987e5'
    }
  };
  HEC.GREY = { light: '#7f93a8', dark: '#6f8499' };

  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  HEC.inkOn = (hex) => (lum(hex) > 0.32 ? '#0b1f33' : '#ffffff');   // white or ink by fill luminance

  /** Sequential colour for t in [0,1] (7 steps, interpolated nearest). */
  HEC.seqColor = (t, tone) => {
    const seq = HEC.PAL[tone || HEC.theme()].seq;
    const k = Math.max(0, Math.min(seq.length - 1, Math.round(t * (seq.length - 1))));
    return seq[k];
  };

  /* ---------- theme ---------- */
  let theme = 'light';
  HEC.theme = () => theme;
  HEC.setTheme = (t, silent) => {
    theme = t === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    const p = HEC.PAL[theme];
    const root = document.documentElement.style;
    HEC.KV.forEach((k) => root.setProperty('--v' + k, p.kv[k]));
    p.br.forEach((c, i) => root.setProperty('--br' + i, c));
    p.seq.forEach((c, i) => root.setProperty('--seq' + i, c));
    root.setProperty('--series', p.series);
    try { localStorage.setItem('hec.theme', theme); } catch (e) { /* storage unavailable */ }
    if (!silent) HEC.emit('theme', theme);
  };

  HEC.setLang = (l, silent) => {
    lang = l === 'hy' ? 'hy' : 'en';
    document.documentElement.setAttribute('lang', lang);
    document.title = HEC.t('doc.title');
    HEC.applyI18n(document);
    try { localStorage.setItem('hec.lang', lang); } catch (e) { /* storage unavailable */ }
    if (!silent) HEC.emit('lang', lang);
  };

  HEC.applyI18n = (root) => {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = HEC.t(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.getAttribute('data-i18n-attr').split(';').forEach((pair) => {
        const [attr, key] = pair.split(':');
        if (attr && key) el.setAttribute(attr.trim(), HEC.t(key.trim()));
      });
    });
  };

  /* ---------- filter state ---------- */
  HEC.state = { kv: new Set(), br: new Set(), cm: new Set(), lc: new Set(), q: '', colorBy: 'voltage', selected: null };

  const newAgg = () => ({
    n: 0, km: 0,
    kvKm: { 6: 0, 10: 0, 35: 0 }, kvN: { 6: 0, 10: 0, 35: 0 },
    brKm: Array(HEC.nB).fill(0), brN: Array(HEC.nB).fill(0),
    brKv: Array.from({ length: HEC.nB }, () => ({ 6: 0, 10: 0, 35: 0 })),
    cmKm: Array(HEC.nC).fill(0), cmN: Array(HEC.nC).fill(0),
    cmBr: Array.from({ length: HEC.nC }, () => new Set()),
    brCm: Array.from({ length: HEC.nB }, () => new Set()),
    lcN: Array(6).fill(0), lcKm: Array(6).fill(0),
    median: 0, avg: 0, longest: null
  });

  HEC.aggregate = (list) => {
    const a = newAgg();
    const lens = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      a.n++; a.km += f.len; lens.push(f.len);
      a.kvKm[f.kv] += f.len; a.kvN[f.kv]++;
      a.brKm[f.br] += f.len; a.brN[f.br]++; a.brKv[f.br][f.kv] += f.len;
      a.cmKm[f.cm] += f.len; a.cmN[f.cm]++; a.cmBr[f.cm].add(f.br); a.brCm[f.br].add(f.cm);
      a.lcN[f.lc]++; a.lcKm[f.lc] += f.len;
      if (!a.longest || f.len > a.longest.len) a.longest = f;
    }
    lens.sort((x, y) => x - y);
    a.median = lens.length ? (lens.length % 2 ? lens[(lens.length - 1) / 2] : (lens[lens.length / 2 - 1] + lens[lens.length / 2]) / 2) : 0;
    a.avg = a.n ? a.km / a.n : 0;
    a.commCount = a.cmN.filter((x) => x > 0).length;
    a.branchCount = a.brN.filter((x) => x > 0).length;
    return a;
  };

  HEC.base = HEC.aggregate(D.features);

  const matches = (f, s, q) =>
    (!s.kv.size || s.kv.has(f.kv)) && (!s.br.size || s.br.has(f.br)) &&
    (!s.cm.size || s.cm.has(f.cm)) && (!s.lc.size || s.lc.has(f.lc)) && (!q || f.hay.indexOf(q) !== -1);

  /** Features matching all filters except the `skip` dimension(s) (used for faceted counts). */
  HEC.filteredExcept = (skip) => {
    const s = Object.assign({}, HEC.state);
    [].concat(skip || []).forEach((k) => { s[k] = new Set(); });
    const q = s.q.trim().toLowerCase();
    return D.features.filter((f) => matches(f, s, q));
  };

  HEC.sel = D.features.slice();
  HEC.selSet = new Set(HEC.sel);
  HEC.agg = HEC.base;

  HEC.activeCount = () => {
    const s = HEC.state;
    return (s.kv.size ? 1 : 0) + (s.br.size ? 1 : 0) + (s.cm.size ? 1 : 0) + (s.lc.size ? 1 : 0) + (s.q.trim() ? 1 : 0);
  };

  let commitTimer = 0;
  HEC.commit = (reason) => {
    const s = HEC.state;
    const q = s.q.trim().toLowerCase();
    HEC.sel = D.features.filter((f) => matches(f, s, q));
    HEC.selSet = new Set(HEC.sel);
    HEC.agg = HEC.aggregate(HEC.sel);
    HEC.writeHash();
    HEC.emit('filter', reason || 'filter');
  };
  HEC.commitSoon = (reason) => { clearTimeout(commitTimer); commitTimer = setTimeout(() => HEC.commit(reason), 180); };

  HEC.toggle = (kind, value) => {
    const set = HEC.state[kind];
    if (set.has(value)) set.delete(value); else set.add(value);
    HEC.commit('toggle:' + kind);
  };
  HEC.setOnly = (kind, value) => {
    const set = HEC.state[kind];
    if (set.size === 1 && set.has(value)) set.clear(); else { set.clear(); set.add(value); }
    HEC.commit('toggle:' + kind);
  };
  HEC.clearKind = (kind) => {
    if (kind === 'q') HEC.state.q = ''; else HEC.state[kind].clear();
    HEC.commit('clear:' + kind);
  };
  HEC.reset = () => {
    const s = HEC.state;
    s.kv.clear(); s.br.clear(); s.cm.clear(); s.lc.clear(); s.q = '';
    HEC.commit('reset');
  };

  /* ---------- shareable view (state in the URL hash; works from file:// too) ---------- */
  HEC.stateToHash = () => {
    const s = HEC.state;
    const p = [];
    if (s.kv.size) p.push('v=' + [...s.kv].join('.'));
    if (s.br.size) p.push('b=' + [...s.br].join('.'));
    if (s.cm.size) p.push('c=' + [...s.cm].join('.'));
    if (s.lc.size) p.push('l=' + [...s.lc].join('.'));
    if (s.q.trim()) p.push('q=' + encodeURIComponent(s.q.trim()));
    if (s.colorBy !== 'voltage') p.push('cb=' + s.colorBy);
    return p.length ? '#!' + p.join('&') : '';
  };
  HEC.writeHash = () => {
    try {
      const h = HEC.stateToHash();
      if (h !== location.hash) history.replaceState(null, '', h || location.pathname + location.search);
    } catch (e) {
      try { if (HEC.stateToHash() !== location.hash) location.replace(HEC.stateToHash() || '#'); } catch (e2) { /* ignore */ }
    }
  };
  HEC.readHash = (clear) => {
    const h = location.hash;
    if (!h || h.indexOf('#!') !== 0) return false;
    const s = HEC.state;
    if (clear) { s.kv.clear(); s.br.clear(); s.cm.clear(); s.lc.clear(); s.q = ''; }
    h.slice(2).split('&').forEach((pair) => {
      const i = pair.indexOf('=');
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      const nums = () => v.split('.').map(Number).filter((x) => !isNaN(x));
      if (k === 'v') nums().filter((x) => HEC.KV.indexOf(x) !== -1).forEach((x) => s.kv.add(x));
      if (k === 'b') nums().filter((x) => x >= 0 && x < HEC.nB).forEach((x) => s.br.add(x));
      if (k === 'c') nums().filter((x) => x >= 0 && x < HEC.nC).forEach((x) => s.cm.add(x));
      if (k === 'l') nums().filter((x) => x >= 0 && x < 6).forEach((x) => s.lc.add(x));
      if (k === 'q') s.q = decodeURIComponent(v);
      if (k === 'cb' && (v === 'voltage' || v === 'branch')) s.colorBy = v;
    });
    return true;
  };

  /* ---------- number animation ---------- */
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  HEC.reduceMotion = reduceMotion;
  HEC.countTo = (el, to, fmt, ms) => {
    const from = parseFloat(el.dataset.v || '0') || 0;
    el.dataset.v = String(to);
    if (reduceMotion() || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const dur = ms || 700;
    cancelAnimationFrame(+el.dataset.raf || 0);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) el.dataset.raf = String(requestAnimationFrame(step)); else el.textContent = fmt(to);
    };
    el.dataset.raf = String(requestAnimationFrame(step));
  };

  /* ---------- toast ---------- */
  HEC.toast = (msg) => {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(HEC.toast._t);
    HEC.toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  };

  /* ---------- tooltip for charts (labels are data: built with textContent only) ---------- */
  const tipEl = document.createElement('div');
  tipEl.className = 'tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(tipEl));
  if (document.body) document.body.appendChild(tipEl);

  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  HEC.mk = mk;

  HEC.tip = {
    show(anchor, spec) {
      tipEl.textContent = '';
      if (spec.title) tipEl.appendChild(mk('div', 'tip-title', spec.title));
      (spec.rows || []).forEach((r) => {
        const row = mk('div', 'tip-row');
        if (r.color) { const k = mk('span', 'tip-key'); k.style.background = r.color; row.appendChild(k); }
        row.appendChild(mk('span', 'tip-label', r.label));
        row.appendChild(mk('strong', 'tip-val', r.value));
        tipEl.appendChild(row);
      });
      if (spec.note) tipEl.appendChild(mk('div', 'tip-note', spec.note));
      tipEl.hidden = false;
      HEC.tip.move(anchor);
    },
    move(anchor) {
      let x, y;
      if (anchor && anchor.clientX !== undefined) { x = anchor.clientX; y = anchor.clientY; }
      else if (anchor && anchor.getBoundingClientRect) {
        const r = anchor.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top;
      } else { x = 0; y = 0; }
      const w = tipEl.offsetWidth, h = tipEl.offsetHeight, pad = 12;
      let left = x + 14, top = y - h - 14;
      if (left + w + pad > window.innerWidth) left = x - w - 14;
      if (left < pad) left = pad;
      if (top < pad) top = y + 18;
      tipEl.style.transform = 'translate(' + Math.round(left) + 'px,' + Math.round(top) + 'px)';
    },
    hide() { tipEl.hidden = true; }
  };
})();
