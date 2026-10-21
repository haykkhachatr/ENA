/* UI: header, hero animation, filter bar, KPI tiles, findings, branch footprints, data table, notes. */
(function () {
  'use strict';
  const HEC = window.HEC;
  const D = HEC.D;
  const t = (k, p) => HEC.t(k, p);
  const fmt = HEC.fmt, mk = HEC.mk;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const UI = (HEC.ui = {});

  const svg = (d, cls) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d); s.appendChild(p);
    return s;
  };
  const ICON = {
    chev: 'm6 9 6 6 6-6',
    x: 'M6 6l12 12M18 6 6 18',
    pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z',
    bolt: 'M13 3 5 14h6l-1 7 8-11h-6z',
    layers: 'm12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
    users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 5.2a3.5 3.5 0 0 1 0 6.6',
    ruler: 'm4 16 12-12 4 4L8 20zM8 12l2 2M11 9l2 2M14 6l2 2'
  };

  /* =========================================================
     Header: nav, theme, language, print, scroll state
     ========================================================= */
  function initHeader() {
    const top = $('#topbar');
    const nav = $('#nav');
    const targets = ['overview', 'explore', 'analysis', 'branches', 'data', 'notes'];

    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-target]');
      if (!a) return;
      const el = document.getElementById(a.dataset.target);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: HEC.reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      nav.classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded', 'false');
    });

    $('#menuBtn').addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      $('#menuBtn').setAttribute('aria-expanded', String(open));
    });

    $('#themeBtn').addEventListener('click', () => HEC.setTheme(HEC.theme() === 'dark' ? 'light' : 'dark'));
    $('#printBtn').addEventListener('click', () => window.print());
    $$('#langSeg button').forEach((b) => b.addEventListener('click', () => {
      HEC.setLang(b.dataset.lang);
      $$('#langSeg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));

    let ticking = false;
    const onScroll = () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        top.classList.toggle('scrolled', window.scrollY > 8);
        let cur = targets[0];
        const line = window.innerHeight * 0.32;
        targets.forEach((id) => {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= line) cur = id;
        });
        $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.target === cur));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* =========================================================
     Hero: real network geometry with travelling pulses
     ========================================================= */
  function initHero() {
    const cv = $('#heroCanvas');
    const ctx = cv.getContext('2d');
    const hero = $('#overview');
    const [[s, w], [n, e]] = D.meta.bounds;
    const kx = Math.cos((((s + n) / 2) * Math.PI) / 180);
    let W = 0, H = 0, dpr = 1, off = null, proj = null, running = false, raf = 0, t0 = 0;
    let pulses = [];
    const COL = { 6: 'rgba(57,135,229,.55)', 10: 'rgba(134,182,239,.78)', 35: 'rgba(205,226,251,.95)' };
    const LW = { 6: 0.8, 10: 1.0, 35: 1.7 };

    function layout() {
      const r = hero.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(320, Math.floor(r.width)); H = Math.max(320, Math.floor(r.height));
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
      const wide = W > 900;
      const box = wide ? { x: W * 0.46, y: 84, w: W * 0.52, h: H - 120 } : { x: 16, y: 70, w: W - 32, h: H - 90 };
      const dw = (e - w) * kx, dh = n - s;
      const sc = Math.min(box.w / dw, box.h / dh);
      const ox = box.x + (box.w - dw * sc) / 2, oy = box.y + (box.h - dh * sc) / 2;
      proj = (lon, lat) => [ox + (lon - w) * kx * sc, oy + (n - lat) * sc];
      // base network on an off-screen canvas
      off = document.createElement('canvas'); off.width = W * dpr; off.height = H * dpr;
      const o = off.getContext('2d'); o.scale(dpr, dpr); o.lineCap = 'round'; o.lineJoin = 'round';
      [6, 10, 35].forEach((kv) => {
        o.beginPath();
        D.features.forEach((f) => {
          if (f.kv !== kv) return;
          f.parts.forEach((part) => part.forEach((q, i) => { const p = proj(q[0], q[1]); if (i) o.lineTo(p[0], p[1]); else o.moveTo(p[0], p[1]); }));
        });
        o.strokeStyle = COL[kv]; o.lineWidth = LW[kv]; o.stroke();
      });
      pulses = [];
      for (let i = 0; i < (wide ? 34 : 18); i++) pulses.push(newPulse(true));
    }

    const cache = new Map();
    function pathOf(f) {
      let c = cache.get(f.i);
      if (c) return c;
      const pts = f.parts[0].map((q) => proj(q[0], q[1]));
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      c = { pts, cum, total: cum[cum.length - 1] };
      cache.set(f.i, c);
      return c;
    }
    function newPulse(scatter) {
      let f, c, tries = 0;
      do { f = D.features[Math.floor(Math.random() * D.features.length)]; c = pathOf(f); tries++; } while (c.total < 28 && tries < 20);
      return { f, c, d: scatter ? Math.random() * c.total : 0, v: 38 + Math.random() * 60 + (f.kv === 35 ? 30 : 0), dir: Math.random() < 0.5 ? 1 : -1 };
    }
    function at(c, d) {
      const cum = c.cum; let lo = 0, hi = cum.length - 1;
      while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
      const seg = cum[hi] - cum[lo] || 1, k = (d - cum[lo]) / seg;
      return [c.pts[lo][0] + (c.pts[hi][0] - c.pts[lo][0]) * k, c.pts[lo][1] + (c.pts[hi][1] - c.pts[lo][1]) * k];
    }

    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - (frame.last || now)) / 1000); frame.last = now;
      const reveal = Math.min(1, (now - t0) / 1900);
      const ease = 1 - Math.pow(1 - reveal, 3);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (reveal < 1) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cv.width * (0.4 + 0.6 * ease) , cv.height); ctx.clip();
        ctx.globalAlpha = ease; ctx.drawImage(off, 0, 0); ctx.restore();
      } else ctx.drawImage(off, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reveal > 0.55) {
        ctx.globalCompositeOperation = 'lighter';
        pulses.forEach((p, i) => {
          p.d += p.v * dt * p.dir;
          if (p.d > p.c.total || p.d < 0) { pulses[i] = newPulse(false); pulses[i].d = pulses[i].dir > 0 ? 0 : pulses[i].c.total; return; }
          const pos = at(p.c, p.d);
          const tail = at(p.c, Math.max(0, Math.min(p.c.total, p.d - p.dir * 14)));
          const g = ctx.createLinearGradient(tail[0], tail[1], pos[0], pos[1]);
          g.addColorStop(0, 'rgba(245,179,1,0)'); g.addColorStop(1, 'rgba(245,179,1,.9)');
          ctx.strokeStyle = g; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(pos[0], pos[1]); ctx.stroke();
          ctx.fillStyle = 'rgba(255,214,102,.95)'; ctx.beginPath(); ctx.arc(pos[0], pos[1], 1.9, 0, 6.283); ctx.fill();
          ctx.fillStyle = 'rgba(245,179,1,.16)'; ctx.beginPath(); ctx.arc(pos[0], pos[1], 6, 0, 6.283); ctx.fill();
        });
        ctx.globalCompositeOperation = 'source-over';
      }
      raf = requestAnimationFrame(frame);
    }
    function start() { if (running || HEC.reduceMotion()) return; running = true; frame.last = 0; raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }
    function staticDraw() { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(off, 0, 0); }

    layout();
    t0 = performance.now();
    if (HEC.reduceMotion()) staticDraw(); else start();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((en) => { en[0].isIntersecting ? start() : stop(); }, { threshold: 0.02 }).observe(hero);
    }
    document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { cache.clear(); layout(); t0 = performance.now() - 2000; if (HEC.reduceMotion()) staticDraw(); }, 200);
    });
  }

  function renderHeroText() {
    const b = HEC.base;
    HEC.countTo($('#heroKm'), b.km, (v) => fmt.km(v, 1), 1600);
    $('#heroLabel').textContent = t('hero.figLabel', { n: fmt.int(b.n) });
    $('#heroKv').textContent = HEC.KV.length;
    $('#heroBr').textContent = HEC.nB;
    $('#heroCm').textContent = HEC.nC;
  }

  /* =========================================================
     Filter bar
     ========================================================= */
  const closers = [];
  const closeAll = (except) => closers.forEach((c) => c(except));
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.dd')) closeAll(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

  function makeDropdown(host, cfg) {
    host.textContent = '';
    const btn = mk('button', 'dd-btn'); btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    const val = mk('span', 'dd-val');
    const cnt = mk('span', 'badge'); cnt.hidden = true;
    btn.append(val, cnt, svg(ICON.chev, 'chev'));
    const pop = mk('div', 'dd-pop'); pop.hidden = true;
    let search = null;
    if (cfg.searchable) {
      const w = mk('div', 'dd-search');
      search = mk('input'); search.type = 'search'; search.placeholder = t('f.dd.find'); search.autocomplete = 'off';
      search.setAttribute('aria-label', t('f.dd.find'));
      w.appendChild(search); pop.appendChild(w);
    }
    const list = mk('ul', 'dd-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-multiselectable', 'true');
    const foot = mk('div', 'dd-foot');
    const clear = mk('button', 'btn btn-sm btn-quiet', t('f.dd.clear')); clear.type = 'button';
    foot.appendChild(clear);
    pop.append(list, foot);
    host.append(btn, pop);

    const refs = [];
    cfg.items().forEach((it) => {
      const li = mk('li');
      const lab = mk('label', 'dd-opt');
      const cb = mk('input'); cb.type = 'checkbox';
      const dot = mk('span', 'dd-dot'); if (it.color) dot.style.background = it.color; else dot.classList.add('none');
      const name = mk('span', 'dd-name', it.label);
      const meta = mk('span', 'dd-meta num');
      lab.append(cb, dot, name, meta); li.appendChild(lab); list.appendChild(li);
      cb.addEventListener('change', () => HEC.toggle(cfg.kind, it.v));
      refs.push({ it, li, cb, meta, name });
    });

    let isOpen = false;
    const setOpen = (o) => {
      isOpen = o; pop.hidden = !o; btn.setAttribute('aria-expanded', String(o));
      host.classList.toggle('open', o);
      if (o) {
        pop.classList.remove('right');
        const r = pop.getBoundingClientRect();
        if (r.right > window.innerWidth - 8) pop.classList.add('right');
        if (search) setTimeout(() => search.focus({ preventScroll: true }), 30);
      }
    };
    btn.addEventListener('click', () => { closeAll(host); setOpen(!isOpen); });
    closers.push((except) => { if (except !== host && isOpen) setOpen(false); });
    clear.addEventListener('click', () => HEC.clearKind(cfg.kind));
    if (search) search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      refs.forEach((r) => { r.li.hidden = q && r.it.label.toLowerCase().indexOf(q) === -1 && String(r.it.alt || '').toLowerCase().indexOf(q) === -1; });
    });

    return {
      update(fa) {
        const set = HEC.state[cfg.kind];
        refs.forEach((r) => {
          const m = cfg.meta(r.it, fa);
          r.cb.checked = set.has(r.it.v);
          r.meta.textContent = m.text;
          r.li.classList.toggle('is-zero', m.zero && !set.has(r.it.v));
          r.name.textContent = r.it.label;
        });
        cnt.hidden = set.size < 2; cnt.textContent = set.size;
        val.textContent = set.size === 0 ? t('f.all') : set.size === 1 ? refs.find((r) => set.has(r.it.v)).it.label : t('f.selected', { n: set.size });
        btn.classList.toggle('active', set.size > 0);
      },
      relabel() { clear.textContent = t('f.dd.clear'); if (search) { search.placeholder = t('f.dd.find'); search.setAttribute('aria-label', t('f.dd.find')); } }
    };
  }

  const FB = {};
  function buildFilterBar() {
    // voltage chips
    const host = $('#fVoltage');
    host.textContent = '';
    FB.kv = HEC.KV.map((kv) => {
      const b = mk('button', 'kvchip'); b.type = 'button';
      const dot = mk('span', 'kvdot'); dot.style.background = 'var(--v' + kv + ')';
      b.append(dot, mk('span', '', HEC.kvLabel(kv)));
      b.addEventListener('click', () => HEC.toggle('kv', kv));
      host.appendChild(b);
      return { b, kv };
    });

    const kmMeta = (arr) => (it, fa) => ({ text: fmt.km(fa[arr][it.v]) + ' ' + t('u.km'), zero: fa[arr][it.v] === 0 });
    FB.dd = {
      br: makeDropdown($('#fBranch'), {
        kind: 'br', meta: kmMeta('brKm'),
        items: () => D.branches.map((_, i) => ({ v: i, label: HEC.name.branch(i), alt: D.branches[i], color: 'var(--br' + i + ')' }))
      }),
      cm: makeDropdown($('#fComm'), {
        kind: 'cm', searchable: true, meta: kmMeta('cmKm'),
        items: () => D.communities.map((_, i) => ({ v: i, label: HEC.name.comm(i), alt: D.communities[i] }))
      }),
      lc: makeDropdown($('#fLen'), {
        kind: 'lc', meta: (it, fa) => ({ text: fmt.int(fa.lcN[it.v]), zero: fa.lcN[it.v] === 0 }),
        items: () => [0, 1, 2, 3, 4, 5].map((i) => ({ v: i, label: HEC.lenClassLabel(i) }))
      })
    };

    $('#fSearch').value = HEC.state.q;
  }

  /** One-time wiring of the controls that live in static HTML. */
  function bindFilterStatic() {
    const input = $('#fSearch');
    input.addEventListener('input', () => { HEC.state.q = input.value; HEC.commitSoon('toggle:q'); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = ''; HEC.state.q = ''; HEC.commit('clear:q'); } });

    $('#fReset').addEventListener('click', () => { input.value = ''; HEC.reset(); });
    $('#fShare').addEventListener('click', () => {
      HEC.writeHash();
      const url = location.href;
      const done = () => HEC.toast(t('f.shared'));
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => HEC.toast(t('f.shareFail')));
      else {
        const ta = mk('textarea'); ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy') ? done() : HEC.toast(t('f.shareFail')); } catch (e) { HEC.toast(t('f.shareFail')); }
        ta.remove();
      }
    });

    $('#fbToggle').addEventListener('click', () => {
      const bar = $('#filterbar');
      const open = bar.classList.toggle('open');
      $('#fbToggle').setAttribute('aria-expanded', String(open));
    });
  }

  function updateFilterBar() {
    const s = HEC.state;
    const fKv = HEC.aggregate(HEC.filteredExcept('kv'));
    FB.kv.forEach((x) => {
      x.b.classList.toggle('is-sel', s.kv.has(x.kv));
      x.b.classList.toggle('is-off', s.kv.size > 0 && !s.kv.has(x.kv));
      x.b.setAttribute('aria-pressed', String(s.kv.has(x.kv)));
      x.b.title = fmt.km(fKv.kvKm[x.kv]) + ' ' + t('u.km');
    });
    FB.dd.br.update(HEC.aggregate(HEC.filteredExcept('br')));
    FB.dd.cm.update(HEC.aggregate(HEC.filteredExcept('cm')));
    FB.dd.lc.update(HEC.aggregate(HEC.filteredExcept('lc')));

    const a = HEC.agg;
    const txt = t('f.showing', { n: fmt.int(a.n), N: fmt.int(HEC.base.n) }) + ' · ' + fmt.km(a.km) + ' ' + t('u.km');
    $('#fCount').textContent = a.n ? txt : t('f.none');
    $('#fCount').classList.toggle('none', a.n === 0);
    $('#fCountInline').textContent = fmt.int(a.n) + ' · ' + fmt.km(a.km) + ' ' + t('u.km');
    const act = HEC.activeCount();
    const badge = $('#fbBadge'); badge.hidden = act === 0; badge.textContent = act;
    $('#fReset').disabled = act === 0;
    $('#filterbar').classList.toggle('has-active', act > 0);

    // active chips
    const host = $('#fChips');
    host.textContent = '';
    const chip = (label, onRemove, color) => {
      const c = mk('button', 'afchip'); c.type = 'button'; c.title = t('f.remove');
      if (color) { const d = mk('span', 'kvdot'); d.style.background = color; c.appendChild(d); }
      c.append(mk('span', '', label), svg(ICON.x));
      c.addEventListener('click', onRemove);
      host.appendChild(c);
    };
    s.kv.forEach((v) => chip(HEC.kvLabel(v), () => HEC.toggle('kv', v), 'var(--v' + v + ')'));
    s.br.forEach((v) => chip(HEC.name.branch(v), () => HEC.toggle('br', v), 'var(--br' + v + ')'));
    s.cm.forEach((v) => chip(HEC.name.comm(v), () => HEC.toggle('cm', v)));
    s.lc.forEach((v) => chip(HEC.lenClassLabel(v), () => HEC.toggle('lc', v)));
    if (s.q.trim()) chip('“' + s.q.trim() + '”', () => { $('#fSearch').value = ''; HEC.clearKind('q'); });
  }

  /* =========================================================
     KPI tiles
     ========================================================= */
  const K = {};
  function buildKpis() {
    const host = $('#kpis');
    host.textContent = '';
    const defs = [
      { id: 'len', icon: ICON.ruler }, { id: 'seg', icon: ICON.layers }, { id: 'avg', icon: ICON.bolt },
      { id: 'cm', icon: ICON.users }, { id: 'br', icon: ICON.pin }
    ];
    defs.forEach((d) => {
      const el = mk('div', 'kpi');
      const head = mk('div', 'kpi-head'); head.append(svg(d.icon, 'kpi-ico'), mk('span', 'kpi-label'));
      const val = mk('div', 'kpi-val'); const num = mk('span', 'kpi-num'); val.append(num, mk('span', 'kpi-unit'));
      const sub = mk('div', 'kpi-sub');
      const meter = mk('div', 'meter'); const fill = mk('span'); meter.appendChild(fill);
      el.append(head, val, sub);
      if (d.id !== 'avg') el.appendChild(meter);
      host.appendChild(el);
      K[d.id] = { el, label: head.lastChild, num, unit: val.lastChild, sub, fill };
    });
  }
  function updateKpis() {
    const a = HEC.agg, b = HEC.base;
    K.len.label.textContent = t('k.length'); K.len.unit.textContent = ' ' + t('u.km');
    HEC.countTo(K.len.num, a.km, (v) => fmt.km(v, 1));
    K.len.sub.textContent = t('k.ofTotal', { p: fmt.pct(b.km ? (a.km / b.km) * 100 : 0, 1) });
    K.len.fill.style.width = (b.km ? (a.km / b.km) * 100 : 0) + '%';

    K.seg.label.textContent = t('k.segments'); K.seg.unit.textContent = '';
    HEC.countTo(K.seg.num, a.n, (v) => fmt.int(v));
    K.seg.sub.textContent = t('k.ofN', { N: fmt.int(b.n) });
    K.seg.fill.style.width = (b.n ? (a.n / b.n) * 100 : 0) + '%';

    K.avg.label.textContent = t('k.avg'); K.avg.unit.textContent = ' ' + t('u.km');
    HEC.countTo(K.avg.num, a.avg, (v) => fmt.km(v, 2));
    K.avg.sub.textContent = t('k.median', { m: fmt.km(a.median, 2) });

    K.cm.label.textContent = t('k.comm'); K.cm.unit.textContent = '';
    HEC.countTo(K.cm.num, a.commCount, (v) => fmt.int(v));
    K.cm.sub.textContent = t('k.ofN', { N: HEC.nC });
    K.cm.fill.style.width = (a.commCount / HEC.nC) * 100 + '%';

    K.br.label.textContent = t('k.branches'); K.br.unit.textContent = '';
    HEC.countTo(K.br.num, a.branchCount, (v) => fmt.int(v));
    K.br.sub.textContent = t('k.ofN', { N: HEC.nB });
    K.br.fill.style.width = (a.branchCount / HEC.nB) * 100 + '%';
  }

  /* =========================================================
     Key findings
     ========================================================= */
  function listJoin(arr) {
    if (arr.length < 2) return arr[0] || '';
    const and = HEC.lang() === 'hy' ? ' և ' : ' and ';
    return arr.slice(0, -1).join(', ') + and + arr[arr.length - 1];
  }
  const argmax = (arr) => arr.reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0);

  function updateFindings() {
    const host = $('#findingsGrid');
    host.textContent = '';
    const a = HEC.agg;
    if (!a.n) { host.appendChild(mk('p', 'empty-note', t('fd.empty'))); return; }
    const card = (tag, head, detail, color, delay) => {
      const c = mk('article', 'finding');
      c.style.setProperty('--accent-c', color); c.style.animationDelay = delay + 'ms';
      c.append(mk('span', 'f-tag', tag), mk('strong', 'f-head', head), mk('p', 'f-detail', detail));
      host.appendChild(c);
    };
    // 1. dominant voltage
    const kv = HEC.KV.reduce((m, k) => (a.kvKm[k] > a.kvKm[m] ? k : m), HEC.KV[0]);
    card(t('fd.tag.v'), t('fd.v.h', { kv, p: fmt.pct((a.kvKm[kv] / a.km) * 100, 1) }), t('fd.v.d', { kv, km: fmt.km(a.kvKm[kv]) }), 'var(--v' + kv + ')', 0);
    // 2. largest branch
    const bi = argmax(a.brKm);
    const bn = HEC.name.branch(bi);
    card(t('fd.tag.b'), t('fd.b.h', { b: bn, p: fmt.pct((a.brKm[bi] / a.km) * 100, 1) }), t('fd.b.d', { b: bn, km: fmt.km(a.brKm[bi]), n: fmt.int(a.brN[bi]) }), 'var(--br' + bi + ')', 70);
    // 3. concentration
    const order = a.cmKm.map((v, i) => i).filter((i) => a.cmKm[i] > 0).sort((x, y) => a.cmKm[y] - a.cmKm[x]);
    const k = Math.min(3, order.length);
    const top = order.slice(0, k);
    const share = top.reduce((s, i) => s + a.cmKm[i], 0) / a.km * 100;
    const names = top.map((i) => HEC.name.comm(i));
    if (k === 1) card(t('fd.tag.c'), t('fd.b.h', { b: names[0], p: fmt.pct(share, 1) }), t('fd.c.d1', { list: names[0], p: fmt.pct(share, 1) }), 'var(--series)', 140);
    else card(t('fd.tag.c'), t('fd.c.h', { k, p: fmt.pct(share, 1) }), t('fd.c.d', { list: listJoin(names), p: fmt.pct(share, 1) }), 'var(--series)', 140);
    // 4. longest segment
    const L = a.longest;
    card(t('fd.tag.l'), t('fd.l.h', { km: fmt.km(L.len, 2) }), t('fd.l.d', { name: HEC.name.seg(L), kv: L.kv, b: HEC.name.branch(L.br) }), 'var(--v' + L.kv + ')', 210);
  }

  /* =========================================================
     Branch footprints
     ========================================================= */
  const BF = { cards: [], bg: null, bgKey: '' };
  const [[bs, bw], [bn_, be]] = D.meta.bounds;
  const bkx = Math.cos((((bs + bn_) / 2) * Math.PI) / 180);

  function buildBranches() {
    const host = $('#bgrid');
    host.textContent = ''; BF.cards = []; BF.bgKey = '';
    D.branches.forEach((_, i) => {
      const card = mk('button', 'bcard'); card.type = 'button';
      card.style.setProperty('--bc', 'var(--br' + i + ')');
      const thumb = mk('canvas', 'bthumb'); thumb.setAttribute('aria-hidden', 'true');
      const meta = mk('div', 'bmeta');
      const title = mk('div', 'btitle');
      const dot = mk('span', 'bdot'); dot.style.background = 'var(--br' + i + ')';
      const h = mk('h3', '', HEC.name.branch(i));
      title.append(dot, h);
      const km = mk('p', 'bkm'); const kmn = mk('strong', 'num'); km.append(kmn, mk('span', '', ' ' + t('u.km')));
      const mix = mk('div', 'bmix'); const segs = HEC.KV.map((kv) => { const s = mk('span'); s.style.background = 'var(--v' + kv + ')'; mix.appendChild(s); return s; });
      const sub = mk('p', 'bsub');
      meta.append(title, km, mix, sub);
      card.append(thumb, meta);
      host.appendChild(card);
      card.addEventListener('click', () => {
        const wasSel = HEC.state.br.size === 1 && HEC.state.br.has(i);
        HEC.setOnly('br', i);
        if (!wasSel) document.getElementById('explore').scrollIntoView({ behavior: HEC.reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      });
      BF.cards.push({ card, thumb, h, km, kmn, segs, sub, i });
    });
  }

  function drawThumbs(list) {
    const sample = BF.cards[0].thumb;
    const cw = Math.max(120, sample.clientWidth), ch = Math.max(90, sample.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const dw = (be - bw) * bkx, dh = bn_ - bs;
    const sc = Math.min((cw - 20) / dw, (ch - 16) / dh);
    const ox = (cw - dw * sc) / 2, oy = (ch - dh * sc) / 2;
    const P = (lon, lat) => [ox + (lon - bw) * bkx * sc, oy + (bn_ - lat) * sc];
    const key = [cw, ch, dpr, HEC.theme()].join('|');
    if (BF.bgKey !== key) {
      BF.bg = document.createElement('canvas'); BF.bg.width = cw * dpr; BF.bg.height = ch * dpr;
      const g = BF.bg.getContext('2d'); g.scale(dpr, dpr); g.lineWidth = 0.6; g.lineCap = 'round';
      g.strokeStyle = HEC.theme() === 'dark' ? 'rgba(143,164,184,.32)' : 'rgba(95,115,135,.30)';
      g.beginPath();
      D.features.forEach((f) => f.parts.forEach((p) => p.forEach((q, i) => { const xy = P(q[0], q[1]); if (i) g.lineTo(xy[0], xy[1]); else g.moveTo(xy[0], xy[1]); })));
      g.stroke();
      BF.bgKey = key;
    }
    BF.cards.forEach((c) => {
      const cv = c.thumb;
      if (cv.width !== cw * dpr || cv.height !== ch * dpr) { cv.width = cw * dpr; cv.height = ch * dpr; }
      const g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(BF.bg, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.strokeStyle = HEC.PAL[HEC.theme()].br[c.i]; g.lineWidth = 1.5; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      list.forEach((f) => {
        if (f.br !== c.i) return;
        f.parts.forEach((p) => p.forEach((q, i) => { const xy = P(q[0], q[1]); if (i) g.lineTo(xy[0], xy[1]); else g.moveTo(xy[0], xy[1]); }));
      });
      g.stroke();
    });
  }

  function updateBranches() {
    const list = HEC.filteredExcept('br');
    const a = HEC.aggregate(list);
    BF.cards.forEach((c) => {
      const i = c.i;
      c.h.textContent = HEC.name.branch(i);
      HEC.countTo(c.kmn, a.brKm[i], (v) => fmt.km(v, 1), 600);
      c.km.lastChild.textContent = ' ' + t('u.km');
      HEC.KV.forEach((kv, j) => { c.segs[j].style.flexGrow = String(a.brKv[i][kv]); });
      HEC.markSegs(c.segs, HEC.KV.map((kv) => a.brKv[i][kv]));
      const nc = a.brCm[i].size;
      c.sub.textContent = a.brN[i] ? t('b.seg', { n: fmt.int(a.brN[i]) }) + ' · ' + t(nc === 1 ? 'b.comm1' : 'b.comm', { n: nc }) : t('b.empty');
      const sel = HEC.state.br.has(i), off = HEC.state.br.size > 0 && !sel;
      c.card.classList.toggle('is-sel', sel);
      c.card.classList.toggle('is-off', off);
      c.card.classList.toggle('is-zero', a.brN[i] === 0);
      c.card.setAttribute('aria-pressed', String(sel));
      c.card.title = sel && HEC.state.br.size === 1 ? t('b.unfocus') : t('b.focus');
      c.card.setAttribute('aria-label', HEC.name.branch(i) + ': ' + fmt.km(a.brKm[i]) + ' ' + t('u.km'));
    });
    drawThumbs(list);
  }

  /* =========================================================
     Segment register (table)
     ========================================================= */
  const T = { key: 'id', dir: 1, page: 0, size: 10 };
  const COLS = [
    { key: 'id', label: 'd.col.id', cls: 'c-id' },
    { key: 'name', label: 'd.col.name', cls: 'c-name' },
    { key: 'kv', label: 'd.col.kv', cls: 'c-kv' },
    { key: 'br', label: 'd.col.branch', cls: 'c-br' },
    { key: 'cm', label: 'd.col.comm', cls: 'c-cm' },
    { key: 'len', label: 'd.col.len', cls: 'c-len num', num: true },
    { key: 'uid', label: 'd.col.uid', cls: 'c-uid' }
  ];
  const sortVal = (f, key) => {
    switch (key) {
      case 'id': return f.id; case 'name': return HEC.name.seg(f); case 'kv': return f.kv;
      case 'br': return HEC.name.branch(f.br); case 'cm': return HEC.name.comm(f.cm);
      case 'len': return f.len; case 'uid': return f.uid || '';
    }
  };
  function buildTableHead() {
    const tr = $('#dtHead');
    tr.textContent = '';
    COLS.forEach((c) => {
      const th = mk('th', c.cls); th.scope = 'col';
      const b = mk('button', 'sort'); b.type = 'button';
      b.append(mk('span', '', t(c.label)), svg('m8 10 4-4 4 4M8 14l4 4 4-4', 'sorticon'));
      b.addEventListener('click', () => {
        if (T.key === c.key) T.dir *= -1; else { T.key = c.key; T.dir = 1; }
        T.page = 0; updateTable();
      });
      th.appendChild(b); tr.appendChild(th);
      c.th = th;
    });
    tr.appendChild(mk('th', 'c-act')).appendChild(mk('span', 'sr-only', t('d.locate') || ''));
  }
  function updateTable() {
    const loc = HEC.lang() === 'hy' ? 'hy' : 'en';
    const col = new Intl.Collator(loc, { numeric: true, sensitivity: 'base' });
    const rows = HEC.sel.slice().sort((x, y) => {
      const a = sortVal(x, T.key), b = sortVal(y, T.key);
      const r = typeof a === 'number' ? a - b : col.compare(String(a), String(b));
      return (r || x.i - y.i) * T.dir;
    });
    const N = rows.length;
    const pages = Math.max(1, Math.ceil(N / T.size));
    if (T.page >= pages) T.page = pages - 1;
    const start = T.page * T.size, slice = rows.slice(start, start + T.size);

    COLS.forEach((c) => {
      const act = c.key === T.key;
      c.th.setAttribute('aria-sort', act ? (T.dir > 0 ? 'ascending' : 'descending') : 'none');
      c.th.classList.toggle('sorted', act);
      c.th.classList.toggle('desc', act && T.dir < 0);
      c.th.firstChild.firstChild.textContent = t(c.label);
    });

    const body = $('#dtBody');
    body.textContent = '';
    if (!N) {
      const tr = mk('tr'); const td = mk('td', 'empty-cell', t('d.empty')); td.colSpan = COLS.length + 1; tr.appendChild(td); body.appendChild(tr);
    }
    slice.forEach((f) => {
      const tr = mk('tr', 'dt-row'); tr.tabIndex = 0;
      if (HEC.state.selected === f) tr.classList.add('is-sel');
      tr.appendChild(mk('td', 'c-id', f.id));
      const nameTd = mk('td', 'c-name'); nameTd.appendChild(mk('span', 'nm', HEC.name.seg(f)));
      if (HEC.lang() === 'en') nameTd.title = f.nm;
      tr.appendChild(nameTd);
      const kvTd = mk('td', 'c-kv'); const kvk = mk('span', 'kvdot'); kvk.style.background = 'var(--v' + f.kv + ')'; kvTd.append(kvk, mk('span', '', String(f.kv)));
      tr.appendChild(kvTd);
      tr.appendChild(mk('td', 'c-br', HEC.name.branch(f.br)));
      tr.appendChild(mk('td', 'c-cm', HEC.name.comm(f.cm)));
      tr.appendChild(mk('td', 'c-len num', fmt.km(f.len, 3)));
      tr.appendChild(mk('td', 'c-uid' + (f.uid ? '' : ' none'), f.uid || '—'));
      const act = mk('td', 'c-act'); const lb = mk('button', 'icon-btn sm'); lb.type = 'button'; lb.title = t('d.locate'); lb.setAttribute('aria-label', t('d.locate'));
      lb.appendChild(svg(ICON.pin)); act.appendChild(lb); tr.appendChild(act);
      const go = () => HEC.map.focusFeature(f);
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      body.appendChild(tr);
    });

    // pager
    const pg = $('#pager');
    pg.textContent = '';
    const sizeWrap = mk('label', 'pg-size');
    sizeWrap.appendChild(mk('span', '', t('d.rows')));
    const sel = mk('select');
    HEC.PAGE_SIZES.forEach((n) => { const o = mk('option', '', String(n)); o.value = n; if (n === T.size) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', () => { T.size = +sel.value; T.page = 0; updateTable(); });
    sizeWrap.appendChild(sel);
    const range = mk('span', 'pg-range num', N ? t('d.range', { a: fmt.int(start + 1), b: fmt.int(Math.min(N, start + T.size)), N: fmt.int(N) }) : '');
    const nav = mk('div', 'pg-nav');
    const prev = mk('button', 'icon-btn', ''); prev.type = 'button'; prev.disabled = T.page === 0;
    prev.setAttribute('aria-label', t('d.prev')); prev.title = t('d.prev'); prev.appendChild(svg('m14 6-6 6 6 6'));
    const next = mk('button', 'icon-btn', ''); next.type = 'button'; next.disabled = T.page >= pages - 1;
    next.setAttribute('aria-label', t('d.next')); next.title = t('d.next'); next.appendChild(svg('m10 6 6 6-6 6'));
    prev.addEventListener('click', () => { T.page--; updateTable(); });
    next.addEventListener('click', () => { T.page++; updateTable(); });
    nav.append(prev, mk('span', 'pg-page num', t('d.page', { p: T.page + 1, n: pages })), next);
    pg.append(sizeWrap, range, nav);
  }

  /* =========================================================
     Downloads: there is always something to download
     - filtered view  -> "Current selection" or "Full network" (user's choice)
     - nothing matches -> falls back to the full network, with a note
     ========================================================= */
  const EX = { all: false };
  function exportTarget() {
    const useAll = EX.all || HEC.sel.length === 0 || HEC.activeCount() === 0;
    return { list: useAll ? D.features : HEC.sel, tag: useAll ? 'all' : 'selection' };
  }
  function bindExport() {
    $('#dCsv').addEventListener('click', () => { const x = exportTarget(); HEC.exportCSV(x.list, x.tag); });
    $('#dGeo').addEventListener('click', () => { const x = exportTarget(); HEC.exportGeoJSON(x.list, x.tag); });
    $$('#exScope button').forEach((b) => b.addEventListener('click', () => { EX.all = b.dataset.scope === 'all'; updateExport(); }));
  }
  function updateExport() {
    const n = HEC.sel.length;
    $('#exScope').hidden = HEC.activeCount() === 0;
    const btns = $$('#exScope button');
    btns[0].textContent = t('d.scope.sel') + ' · ' + fmt.int(n);
    btns[1].textContent = t('d.scope.all') + ' · ' + fmt.int(HEC.base.n);
    btns[0].disabled = n === 0;
    const useAll = EX.all || n === 0;
    btns[0].setAttribute('aria-pressed', String(!useAll));
    btns[1].setAttribute('aria-pressed', String(useAll));
    const note = $('#exNote');
    note.hidden = n > 0;
    note.textContent = t('d.fallback');
  }

  /* =========================================================
     Notes
     ========================================================= */
  function renderNotes() {
    const q = D.meta.quality, host = $('#notesGrid');
    host.textContent = '';
    const hy = HEC.lang() === 'hy';
    const brIdx = (arm) => D.branches.indexOf(arm);
    const topMiss = q.missingUidByBranch[0];
    const v35br = D.features.find((f) => f.kv === 35).br;
    const out = D.features.find((f) => D.provinces[f.pv] !== 'Երևան');
    const sp = (arm) => {
      const en = HEC.translit(arm);
      return hy ? arm : en + ' (' + arm + ')';
    };
    const outName = out ? HEC.name.prov(out.pv) + ', ' + HEC.name.comm(out.cm) : '';
    const items = [
      { t: 'n.source.t', b: t('n.source.b', { features: fmt.int(q.features), vertices: fmt.int(q.verticesSource), web: fmt.int(q.verticesWeb) }) },
      { t: 'n.length.t', b: t('n.length.b', { geo: fmt.km(q.geodesicKm, 1), attr: fmt.km(q.attrKm, 1), dev: fmt.pct(q.geodesicDevPct, 2), max: fmt.pct(q.maxSegDevPct, 2) }) },
      { t: 'n.kv.t', b: t('n.kv.b', { n: fmt.int(HEC.base.kvN[35]), km: fmt.km(HEC.base.kvKm[35], 1), branch: HEC.name.branch(v35br) }) },
      { t: 'n.uid.t', check: true, b: t('n.uid.b', { miss: fmt.int(q.missingUid), pct: fmt.pct((q.missingUid / q.features) * 100, 1), top: fmt.int(topMiss[1]), branch: HEC.name.branch(brIdx(topMiss[0])), dup: fmt.int(q.duplicateUidGroups) }) },
      { t: 'n.names.t', check: true, b: t('n.names.b', { a: sp(q.spellingVariants[0][0]), an: q.spellingVariants[0][1], b: sp(q.spellingVariants[1][0]), bn: q.spellingVariants[1][1], out: q.outsideYerevan, prov: outName }) },
      { t: 'n.read.t', b: t('n.read.b') },
      { t: 'n.method.t', b: t('n.method.b') }
    ];
    items.forEach((it, i) => {
      const c = mk('article', 'note' + (it.check ? ' check' : ''));
      const head = mk('div', 'note-head');
      head.append(mk('span', 'note-n num', String(i + 1).padStart(2, '0')), mk('h3', '', t(it.t)));
      if (it.check) head.appendChild(mk('span', 'chip-check', t('n.check')));
      c.append(head, mk('p', '', it.b));
      host.appendChild(c);
    });
  }

  /* =========================================================
     Scroll-reveal
     ========================================================= */
  function initReveal() {
    const els = $$('.block, .hero-copy');
    if (!('IntersectionObserver' in window) || HEC.reduceMotion()) return;
    els.forEach((el) => el.classList.add('reveal'));
    const io = new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    els.forEach((el) => io.observe(el));
  }

  /* =========================================================
     Orchestration
     ========================================================= */
  UI.update = () => {
    updateFilterBar(); updateKpis(); updateFindings(); updateBranches(); updateTable(); updateExport();
  };
  UI.init = () => {
    initHeader();
    bindFilterStatic(); bindExport(); buildFilterBar(); buildKpis(); buildBranches(); buildTableHead();
    renderHeroText(); renderNotes();
    initHero();
    initReveal();
    UI.update();

    HEC.on('filter', () => { if ($('#fSearch') !== document.activeElement) $('#fSearch').value = HEC.state.q; T.page = 0; EX.all = false; UI.update(); });
    HEC.on('select', () => updateTable());
    HEC.on('theme', () => { BF.bgKey = ''; updateBranches(); });
    HEC.on('lang', () => {
      buildFilterBar(); buildBranches(); buildTableHead(); renderHeroText(); renderNotes(); UI.update();
    });
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { BF.bgKey = ''; updateBranches(); }, 200); });
  };
})();
