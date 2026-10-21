/* Charts: hand-built HTML/CSS marks so every bar animates smoothly and is a real, focusable button.
   Each chart reads a *faceted* aggregate (all filters except its own dimension), so the other options
   stay visible, dimmed, and can be re-selected - the usual cross-filter behaviour. */
(function () {
  'use strict';
  const HEC = window.HEC;
  const { mk, fmt, t } = { mk: HEC.mk, fmt: HEC.fmt, t: (k, p) => HEC.t(k, p) };
  const D = HEC.D;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
  const pctTxt = (a, b) => fmt.pct(pct(a, b), 1) + '%';

  const C = (HEC.charts = {});

  /* ----- shared helpers ----- */
  function viewToggle(id) {
    const card = $('#' + id);
    const btns = card.querySelectorAll('.viewseg button');
    const chart = $('.view-chart', card), table = $('.view-table', card);
    btns.forEach((b) => b.addEventListener('click', () => {
      const tbl = b.dataset.view === 'table';
      btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      chart.hidden = tbl; table.hidden = !tbl;
    }));
  }

  function renderTable(host, cols, rows, foot) {
    host.textContent = '';
    const tbl = mk('table', 'dt mini');
    const thead = mk('thead'), hr = mk('tr');
    cols.forEach((c) => { const th = mk('th', c.num ? 'num' : '', c.label); th.scope = 'col'; hr.appendChild(th); });
    thead.appendChild(hr); tbl.appendChild(thead);
    const tb = mk('tbody');
    rows.forEach((r) => {
      const tr = mk('tr');
      r.forEach((v, i) => tr.appendChild(mk(i === 0 ? 'th' : 'td', cols[i].num ? 'num' : '', v)));
      if (tr.firstChild.tagName === 'TH') tr.firstChild.scope = 'row';
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    if (foot) {
      const tf = mk('tfoot'), tr = mk('tr');
      foot.forEach((v, i) => tr.appendChild(mk(i === 0 ? 'th' : 'td', cols[i].num ? 'num' : '', v)));
      tf.appendChild(tr); tbl.appendChild(tf);
    }
    host.appendChild(tbl);
  }

  function hover(el, spec) {
    const show = (e) => HEC.tip.show(e.type === 'focus' ? el : e, spec());
    el.addEventListener('pointerenter', show);
    el.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') HEC.tip.move(e); });
    el.addEventListener('pointerleave', () => HEC.tip.hide());
    el.addEventListener('focus', show);
    el.addEventListener('blur', () => HEC.tip.hide());
  }

  const stateOf = (kind, v) => {
    const s = HEC.state[kind];
    return s.size === 0 ? '' : (s.has(v) ? 'is-sel' : 'is-off');
  };
  const setState = (el, kind, v) => {
    const st = stateOf(kind, v);
    el.classList.toggle('is-sel', st === 'is-sel');
    el.classList.toggle('is-off', st === 'is-off');
    el.setAttribute('aria-pressed', String(st === 'is-sel'));
  };

  /** Surface-gap hygiene: a gap is only drawn *between* non-empty segments (no stray gap before the first). */
  const markSegs = (segs, vals) => {
    let seen = false;
    segs.forEach((el, i) => {
      const zero = !(vals[i] > 0);
      el.classList.toggle('sg-zero', zero);
      el.classList.toggle('sg-first', !zero && !seen);
      if (!zero) seen = true;
    });
  };
  HEC.markSegs = markSegs;

  const legendInline = () => {
    const lg = mk('div', 'legend-inline');
    HEC.KV.forEach((kv) => {
      const it = mk('span', 'lg-item');
      const k = mk('span', 'lg-key'); k.style.background = 'var(--v' + kv + ')';
      it.append(k, mk('span', '', HEC.kvLabel(kv)));
      lg.appendChild(it);
    });
    return lg;
  };

  let FACET = {};
  const facet = (kind, skip) => (FACET[kind] = HEC.aggregate(HEC.filteredExcept(skip)));

  /* =========================================================
     1. Voltage composition  (ordinal tiers -> one-hue ramp)
     ========================================================= */
  const V = { segs: {}, rows: {} };
  function buildVoltage() {
    const host = $('#chVoltage .view-chart');
    host.textContent = '';
    const stack = mk('div', 'vstack'); stack.setAttribute('role', 'group');
    const rows = mk('div', 'vrows');
    const head = mk('div', 'vrow vhead');
    head.append(mk('span'), mk('span'), mk('span', 'num', t('c.col.km')), mk('span', 'num', t('c.col.share')), mk('span', 'num', t('c.col.n')));
    rows.appendChild(head);
    HEC.KV.forEach((kv) => {
      const seg = mk('button', 'vseg'); seg.type = 'button'; seg.style.setProperty('--c', 'var(--v' + kv + ')');
      stack.appendChild(seg);
      const row = mk('button', 'vrow'); row.type = 'button';
      const key = mk('span', 'vkey'); key.style.background = 'var(--v' + kv + ')';
      const km = mk('span', 'num strong'), sh = mk('span', 'num'), n = mk('span', 'num muted');
      row.append(key, mk('span', 'vlabel', HEC.kvLabel(kv)), km, sh, n);
      rows.appendChild(row);
      V.segs[kv] = seg; V.rows[kv] = { row, km, sh, n };
      [seg, row].forEach((el) => {
        el.addEventListener('click', () => HEC.toggle('kv', kv));
        hover(el, () => tipVoltage(kv));
      });
    });
    host.append(stack, rows);
  }
  function tipVoltage(kv) {
    const a = FACET.v;
    return {
      title: HEC.kvLabel(kv),
      rows: [
        { color: 'var(--v' + kv + ')', label: t('c.col.km'), value: fmt.km(a.kvKm[kv]) },
        { label: t('c.col.n'), value: fmt.int(a.kvN[kv]) },
        { label: t('c.col.share'), value: pctTxt(a.kvKm[kv], a.km) },
        { label: t('c.tip.base'), value: pctTxt(a.kvKm[kv], HEC.base.km) }
      ],
      note: HEC.state.kv.has(kv) ? t('c.tip.clicked') : t('c.tip.click')
    };
  }
  function updateVoltage() {
    const a = facet('v', 'kv');
    markSegs(HEC.KV.map((kv) => V.segs[kv]), HEC.KV.map((kv) => a.kvKm[kv]));
    HEC.KV.forEach((kv) => {
      V.segs[kv].style.flexGrow = String(a.kvKm[kv]);
      setState(V.segs[kv], 'kv', kv);
      const r = V.rows[kv];
      setState(r.row, 'kv', kv);
      r.km.textContent = fmt.km(a.kvKm[kv]);
      r.sh.textContent = pctTxt(a.kvKm[kv], a.km);
      r.n.textContent = fmt.int(a.kvN[kv]);
      const lbl = HEC.kvLabel(kv) + ': ' + fmt.km(a.kvKm[kv]) + ' ' + t('u.km');
      V.segs[kv].setAttribute('aria-label', lbl); r.row.setAttribute('aria-label', lbl);
      V.segs[kv].classList.toggle('is-empty', a.kvKm[kv] === 0);
    });
    renderTable($('#chVoltage .view-table'),
      [{ label: t('f.voltage') }, { label: t('c.col.km'), num: 1 }, { label: t('c.col.share'), num: 1 }, { label: t('c.col.n'), num: 1 }, { label: t('c.col.avg'), num: 1 }],
      HEC.KV.map((kv) => [HEC.kvLabel(kv), fmt.km(a.kvKm[kv]), pctTxt(a.kvKm[kv], a.km), fmt.int(a.kvN[kv]), a.kvN[kv] ? fmt.km(a.kvKm[kv] / a.kvN[kv], 2) : '–']),
      [t('c.total'), fmt.km(a.km), a.km ? '100.0%' : '–', fmt.int(a.n), a.n ? fmt.km(a.km / a.n, 2) : '–']);
  }

  /* =========================================================
     2. Length by branch  (stacked by voltage)
     ========================================================= */
  const B = { rows: [] };
  function buildBranch() {
    const host = $('#chBranch .view-chart');
    host.textContent = ''; B.rows = [];
    host.appendChild(legendInline());
    const list = mk('div', 'hbars');
    D.branches.forEach((_, i) => {
      const row = mk('button', 'hrow'); row.type = 'button';
      const bar = mk('span', 'hbar');
      const segs = HEC.KV.map((kv) => { const s = mk('span', 'hseg'); s.style.setProperty('--c', 'var(--v' + kv + ')'); bar.appendChild(s); return s; });
      const val = mk('span', 'hval num');
      const track = mk('span', 'htrack'); track.append(bar, val);
      row.append(mk('span', 'hlabel', HEC.name.branch(i)), track);
      list.appendChild(row);
      B.rows.push({ row, bar, segs, val });
      row.addEventListener('click', () => HEC.toggle('br', i));
      hover(row, () => tipBranch(i));
    });
    host.appendChild(list);
  }
  function tipBranch(i) {
    const a = FACET.b;
    return {
      title: HEC.name.branch(i),
      rows: HEC.KV.map((kv) => ({ color: 'var(--v' + kv + ')', label: HEC.kvLabel(kv), value: fmt.km(a.brKv[i][kv]) + ' ' + t('u.km') }))
        .concat([{ label: t('c.total'), value: fmt.km(a.brKm[i]) + ' ' + t('u.km') }, { label: t('c.col.n'), value: fmt.int(a.brN[i]) }]),
      note: HEC.state.br.has(i) ? t('c.tip.clicked') : t('c.tip.click')
    };
  }
  function updateBranch() {
    const a = facet('b', 'br');
    const max = HEC.base.brKm.reduce((m, x) => Math.max(m, x), 0) || 1;
    B.rows.forEach((r, i) => {
      r.bar.style.width = 'calc((100% - 64px) * ' + (a.brKm[i] / max).toFixed(4) + ')';
      HEC.KV.forEach((kv, j) => { r.segs[j].style.flexGrow = String(a.brKv[i][kv]); });
      markSegs(r.segs, HEC.KV.map((kv) => a.brKv[i][kv]));
      r.val.textContent = a.brKm[i] > 0 ? fmt.km(a.brKm[i]) : '–';
      setState(r.row, 'br', i);
      r.row.setAttribute('aria-label', HEC.name.branch(i) + ': ' + fmt.km(a.brKm[i]) + ' ' + t('u.km'));
    });
    renderTable($('#chBranch .view-table'),
      [{ label: t('f.branch') }].concat(HEC.KV.map((kv) => ({ label: HEC.kvLabel(kv) + ', ' + t('u.km'), num: 1 }))).concat([{ label: t('c.col.km'), num: 1 }, { label: t('c.col.n'), num: 1 }]),
      D.branches.map((_, i) => [HEC.name.branch(i)].concat(HEC.KV.map((kv) => fmt.km(a.brKv[i][kv]))).concat([fmt.km(a.brKm[i]), fmt.int(a.brN[i])])),
      [t('c.total')].concat(HEC.KV.map((kv) => fmt.km(a.kvKm[kv]))).concat([fmt.km(a.km), fmt.int(a.n)]));
  }

  /* =========================================================
     3. Length by community  (nominal -> single series colour)
     ========================================================= */
  const M = { rows: [] };
  function buildComm() {
    const host = $('#chComm .view-chart');
    host.textContent = ''; M.rows = [];
    const list = mk('div', 'hbars dense');
    D.communities.forEach((_, i) => {
      const row = mk('button', 'hrow'); row.type = 'button';
      const bar = mk('span', 'hbar single');
      const val = mk('span', 'hval num');
      const track = mk('span', 'htrack'); track.append(bar, val);
      row.append(mk('span', 'hlabel', HEC.name.comm(i)), track);
      list.appendChild(row);
      M.rows.push({ row, bar, val });
      row.addEventListener('click', () => HEC.toggle('cm', i));
      hover(row, () => tipComm(i));
    });
    host.appendChild(list);
  }
  function tipComm(i) {
    const a = FACET.m;
    const brs = [...a.cmBr[i]].map((b) => HEC.name.branch(b)).join(', ');
    return {
      title: HEC.name.comm(i),
      rows: [
        { color: 'var(--series)', label: t('c.col.km'), value: fmt.km(a.cmKm[i]) },
        { label: t('c.col.n'), value: fmt.int(a.cmN[i]) },
        { label: t('c.col.share'), value: pctTxt(a.cmKm[i], a.km) }
      ].concat(brs ? [{ label: t('c.col.branch'), value: brs }] : []),
      note: HEC.state.cm.has(i) ? t('c.tip.clicked') : t('c.tip.click')
    };
  }
  function updateComm() {
    const a = facet('m', 'cm');
    const max = HEC.base.cmKm.reduce((m, x) => Math.max(m, x), 0) || 1;
    M.rows.forEach((r, i) => {
      r.bar.style.width = 'calc((100% - 64px) * ' + (a.cmKm[i] / max).toFixed(4) + ')';
      r.val.textContent = a.cmKm[i] > 0 ? fmt.km(a.cmKm[i]) : '–';
      setState(r.row, 'cm', i);
      r.row.setAttribute('aria-label', HEC.name.comm(i) + ': ' + fmt.km(a.cmKm[i]) + ' ' + t('u.km'));
    });
    renderTable($('#chComm .view-table'),
      [{ label: t('f.community') }, { label: t('c.col.km'), num: 1 }, { label: t('c.col.share'), num: 1 }, { label: t('c.col.n'), num: 1 }, { label: t('c.col.branch') }],
      D.communities.map((_, i) => [HEC.name.comm(i), fmt.km(a.cmKm[i]), pctTxt(a.cmKm[i], a.km), fmt.int(a.cmN[i]), [...a.cmBr[i]].map((b) => HEC.name.branch(b)).join(', ') || '–']),
      [t('c.total'), fmt.km(a.km), a.km ? '100.0%' : '–', fmt.int(a.n), '']);
  }

  /* =========================================================
     4. Segment length distribution (histogram of ordered classes)
     ========================================================= */
  const H = { cols: [] };
  function buildHist() {
    const host = $('#chHist .view-chart');
    host.textContent = ''; H.cols = [];
    const wrap = mk('div', 'hist'); wrap.setAttribute('role', 'group');
    for (let i = 0; i < 6; i++) {
      const col = mk('button', 'hcol'); col.type = 'button';
      const v = mk('span', 'hv num');
      const b = mk('span', 'hb');
      const area = mk('span', 'harea'); area.append(v, b);
      col.append(area, mk('span', 'hx', HEC.lenClassLabel(i)));
      wrap.appendChild(col);
      H.cols.push({ col, v, b });
      col.addEventListener('click', () => HEC.toggle('lc', i));
      hover(col, () => tipHist(i));
    }
    host.appendChild(wrap);
  }
  function tipHist(i) {
    const a = FACET.h;
    return {
      title: HEC.lenClassLabel(i),
      rows: [
        { color: 'var(--series)', label: t('c.col.n'), value: fmt.int(a.lcN[i]) },
        { label: t('c.col.km'), value: fmt.km(a.lcKm[i]) },
        { label: t('c.col.share'), value: pctTxt(a.lcN[i], a.n) }
      ],
      note: HEC.state.lc.has(i) ? t('c.tip.clicked') : t('c.tip.click')
    };
  }
  function updateHist() {
    const a = facet('h', 'lc');
    const max = HEC.base.lcN.reduce((m, x) => Math.max(m, x), 0) || 1;
    H.cols.forEach((c, i) => {
      c.b.style.height = 'calc((100% - 24px) * ' + (a.lcN[i] / max).toFixed(4) + ')';
      c.v.textContent = fmt.int(a.lcN[i]);
      setState(c.col, 'lc', i);
      c.col.setAttribute('aria-label', HEC.lenClassLabel(i) + ': ' + fmt.int(a.lcN[i]) + ' ' + HEC.plural('u.seg', a.lcN[i]));
    });
    renderTable($('#chHist .view-table'),
      [{ label: t('c.col.class') }, { label: t('c.col.n'), num: 1 }, { label: t('c.col.share'), num: 1 }, { label: t('c.col.km'), num: 1 }],
      [0, 1, 2, 3, 4, 5].map((i) => [HEC.lenClassLabel(i), fmt.int(a.lcN[i]), pctTxt(a.lcN[i], a.n), fmt.km(a.lcKm[i])]),
      [t('c.total'), fmt.int(a.n), a.n ? '100.0%' : '–', fmt.km(a.km)]);
  }

  /* =========================================================
     5. Branch x voltage matrix (sequential, one hue)
     ========================================================= */
  const X = { cells: [] };
  function buildMatrix() {
    const host = $('#chMatrix .view-chart');
    host.textContent = ''; X.cells = [];
    const grid = mk('div', 'matrix');
    grid.appendChild(mk('span', 'mx-corner'));
    HEC.KV.forEach((kv) => {
      const h = mk('span', 'mx-head');
      const k = mk('span', 'lg-key'); k.style.background = 'var(--v' + kv + ')';
      h.append(k, mk('span', '', HEC.kvLabel(kv)));
      grid.appendChild(h);
    });
    D.branches.forEach((_, i) => {
      grid.appendChild(mk('span', 'mx-row', HEC.name.branch(i)));
      HEC.KV.forEach((kv) => {
        const c = mk('button', 'mx-cell'); c.type = 'button';
        grid.appendChild(c);
        X.cells.push({ c, i, kv });
        c.addEventListener('click', () => {
          const s = HEC.state;
          const on = s.br.size === 1 && s.br.has(i) && s.kv.size === 1 && s.kv.has(kv);
          s.br.clear(); s.kv.clear();
          if (!on) { s.br.add(i); s.kv.add(kv); }
          HEC.commit('toggle:matrix');
        });
        hover(c, () => ({
          title: HEC.name.branch(i) + ' · ' + HEC.kvLabel(kv),
          rows: [
            { color: 'var(--v' + kv + ')', label: t('c.col.km'), value: fmt.km(FACET.x.brKv[i][kv]) },
            { label: t('c.col.share'), value: pctTxt(FACET.x.brKv[i][kv], FACET.x.km) }
          ],
          note: t('c.tip.click')
        }));
      });
    });
    host.appendChild(grid);
  }
  function updateMatrix() {
    const a = facet('x', ['br', 'kv']);
    let max = 0;
    X.cells.forEach((x) => { max = Math.max(max, a.brKv[x.i][x.kv]); });
    const s = HEC.state;
    X.cells.forEach((x) => {
      const v = a.brKv[x.i][x.kv];
      x.c.textContent = v > 0 ? fmt.km(v) : '–';
      if (v > 0 && max > 0) {
        const col = HEC.seqColor(Math.sqrt(v / max), HEC.theme());
        x.c.style.background = col; x.c.style.color = HEC.inkOn(col);
      } else { x.c.style.background = ''; x.c.style.color = ''; }
      const sel = (s.br.size || s.kv.size) ? ((!s.br.size || s.br.has(x.i)) && (!s.kv.size || s.kv.has(x.kv))) : null;
      x.c.classList.toggle('is-sel', sel === true && (s.br.size > 0 && s.kv.size > 0));
      x.c.classList.toggle('is-off', sel === false);
      x.c.setAttribute('aria-pressed', String(sel === true && s.br.size > 0 && s.kv.size > 0));
      x.c.setAttribute('aria-label', HEC.name.branch(x.i) + ', ' + HEC.kvLabel(x.kv) + ': ' + fmt.km(v) + ' ' + t('u.km'));
    });
    renderTable($('#chMatrix .view-table'),
      [{ label: t('f.branch') }].concat(HEC.KV.map((kv) => ({ label: HEC.kvLabel(kv) + ', ' + t('u.km'), num: 1 }))),
      D.branches.map((_, i) => [HEC.name.branch(i)].concat(HEC.KV.map((kv) => fmt.km(a.brKv[i][kv])))),
      [t('c.total')].concat(HEC.KV.map((kv) => fmt.km(a.kvKm[kv]))));
  }

  /* ----- orchestration ----- */
  C.build = () => { buildVoltage(); buildBranch(); buildComm(); buildHist(); buildMatrix(); };
  C.update = () => { FACET = {}; updateVoltage(); updateBranch(); updateComm(); updateHist(); updateMatrix(); };
  C.init = () => {
    ['chVoltage', 'chBranch', 'chComm', 'chHist', 'chMatrix'].forEach(viewToggle);
    C.build(); C.update();
    HEC.on('filter', C.update);
    HEC.on('theme', C.update);
    HEC.on('lang', () => { C.build(); C.update(); });
  };
})();
