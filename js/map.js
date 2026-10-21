/* Map: Leaflet over Yerevan with four layers
     ghost   - every segment, faint grey (context for what the filters excluded)
     density - sum of line length per 500 m / 1 km cell (one-hue sequential)
     lines   - the filtered selection, coloured by voltage or branch
     sel     - halo + core for the inspected segment
   plus community labels. All geometry is drawn on canvas so 1,700 segments stay fluid. */
(function () {
  'use strict';
  const HEC = window.HEC;
  const D = HEC.D;
  const t = (k, p) => HEC.t(k, p);
  const fmt = HEC.fmt, mk = HEC.mk;
  const $ = (s) => document.querySelector(s);
  const M = (HEC.map = {});

  HEC.segLen = (len) => (len < 1 ? Math.round(len * 1000) + ' m' : fmt.km(len, 2) + ' ' + t('u.km'));

  /* Keyless Esri tile services (CARTO now requires an API key; OSM blocks file:// clients). */
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const tileUrl = (svc) => ESRI + svc + '/MapServer/tile/{z}/{y}/{x}';
  const ATTR_ESRI = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors, and the GIS User Community';
  const BASES = {
    light: { url: tileUrl('Canvas/World_Light_Gray_Base'), labels: tileUrl('Canvas/World_Light_Gray_Reference'), native: 16, tone: 'light', attr: ATTR_ESRI },
    dark: { url: tileUrl('Canvas/World_Dark_Gray_Base'), labels: tileUrl('Canvas/World_Dark_Gray_Reference'), native: 16, tone: 'dark', attr: ATTR_ESRI },
    streets: { url: tileUrl('World_Street_Map'), native: 19, tone: 'light', attr: ATTR_ESRI },
    satellite: { url: tileUrl('World_Imagery'), labels: tileUrl('Reference/World_Boundaries_and_Places'), native: 19, tone: 'dark',
      attr: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community' }
  };

  const opts = { lines: true, density: false, labels: true, context: true, auto: true, base: 'light', cell: 500 };
  let userPickedBase = false;
  let map, tile, tileLabels, tone = 'light';
  let ghostGroup, activeGroup, densityGroup, labelGroup, selGroup;
  let rGhost, rLines, rDensity, rSel;
  const polys = new Map();          // feature index -> L.Polyline (active layer)
  const tipLayer = L.tooltip({ direction: 'top', offset: [0, -4], opacity: 1, className: 'map-tip', sticky: false });
  let hoverId = -1;
  let fitTimer = 0;
  let firstFit = true;

  /* ---------- styling ---------- */
  const zoomScale = (z) => Math.max(0.55, Math.min(2.4, 0.55 + (z - 10.5) * 0.3));
  const W = { 6: 1.7, 10: 2.3, 35: 3.8 };
  const neutralInk = () => (tone === 'dark' ? '#d8e3ee' : '#31465b');

  function colorOf(f) {
    if (opts.density) return neutralInk();
    const p = HEC.PAL[tone];
    return HEC.state.colorBy === 'branch' ? p.br[f.br] : p.kv[f.kv];
  }
  const weightOf = (f) => W[f.kv] * zoomScale(map.getZoom()) * (opts.density ? 0.75 : 1);
  function lineStyle(f, hot) {
    const w = weightOf(f);
    return { color: colorOf(f), weight: hot ? w + 2.5 : w, opacity: opts.density ? (hot ? 1 : 0.6) : (hot ? 1 : 0.92), lineCap: 'round', lineJoin: 'round' };
  }

  /* ---------- tooltip / selection card ---------- */
  function tipNode(f) {
    const d = mk('div', 'mtip');
    d.append(mk('strong', '', HEC.name.seg(f)),
      mk('span', '', HEC.kvLabel(f.kv) + ' · ' + HEC.name.branch(f.br) + ' · ' + HEC.segLen(f.len)));
    return d;
  }

  function row(dl, label, valueNode) {
    const dt = mk('dt', '', label), dd = mk('dd');
    if (typeof valueNode === 'string') dd.textContent = valueNode; else dd.appendChild(valueNode);
    dl.append(dt, dd);
  }

  function renderSel() {
    const host = $('#selCard');
    host.textContent = '';
    const f = HEC.state.selected;
    if (!f) { host.appendChild(mk('p', 'empty', t('m.sel.empty'))); return; }
    const head = mk('div', 'sel-head');
    head.appendChild(mk('strong', 'sel-name', HEC.name.seg(f)));
    if (HEC.lang() === 'en') head.appendChild(mk('span', 'sel-orig', t('m.sel.original') + ': ' + f.nm));
    if (!HEC.selSet.has(f)) head.appendChild(mk('span', 'sel-flag', t('m.excluded')));
    host.appendChild(head);

    const dl = mk('dl', 'sel-dl');
    row(dl, t('m.sel.voltage'), (() => {
      const s = mk('span', 'sel-kv'); const k = mk('span', 'lg-key'); k.style.background = 'var(--v' + f.kv + ')';
      s.append(k, mk('span', '', HEC.kvLabel(f.kv))); return s;
    })());
    row(dl, t('m.sel.len'), HEC.segLen(f.len) + (f.len >= 1 ? '' : ' (' + fmt.km(f.len, 3) + ' ' + t('u.km') + ')'));
    row(dl, t('m.sel.branch'), HEC.name.branch(f.br));
    row(dl, t('m.sel.comm'), HEC.name.comm(f.cm));
    row(dl, t('m.sel.prov'), HEC.name.prov(f.pv));
    row(dl, t('m.sel.id'), f.id);
    row(dl, t('m.sel.uid'), f.uid || t('m.sel.noUid'));
    host.appendChild(dl);

    const acts = mk('div', 'sel-actions');
    const z = mk('button', 'btn btn-sm', t('m.sel.zoom')); z.type = 'button';
    z.addEventListener('click', () => map.flyToBounds(f.bbox, { padding: [60, 60], maxZoom: 17, duration: 0.8 }));
    const c = mk('button', 'btn btn-sm btn-quiet', t('m.sel.clear')); c.type = 'button';
    c.addEventListener('click', () => M.select(null));
    acts.append(z, c);
    host.appendChild(acts);
  }

  function drawSelection() {
    selGroup.clearLayers();
    const f = HEC.state.selected;
    if (!f) return;
    const w = weightOf(f);
    const halo = L.polyline(f.latlngs, { renderer: rSel, interactive: false, color: tone === 'dark' ? '#ffffff' : '#0b1f33', weight: w + 7, opacity: 0.95, lineCap: 'round', lineJoin: 'round' });
    const core = L.polyline(f.latlngs, { renderer: rSel, interactive: false, color: colorOf(f), weight: w + 2.5, opacity: 1, lineCap: 'round', lineJoin: 'round' });
    selGroup.addLayer(halo); selGroup.addLayer(core);
  }

  M.select = (f, opt) => {
    HEC.state.selected = f || null;
    renderSel(); drawSelection();
    HEC.emit('select', f);
    if (f && opt && opt.fly) {
      document.getElementById('explore').scrollIntoView({ behavior: HEC.reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      setTimeout(() => map.flyToBounds(f.bbox, { padding: [80, 80], maxZoom: 17, duration: 0.9 }), HEC.reduceMotion() ? 0 : 350);
    }
  };
  M.focusFeature = (f) => M.select(f, { fly: true });

  /* ---------- polylines ---------- */
  function polyFor(f) {
    let p = polys.get(f.i);
    if (p) return p;
    p = L.polyline(f.latlngs, Object.assign({ renderer: rLines, interactive: true, bubblingMouseEvents: false }, lineStyle(f)));
    p.on('mouseover', (e) => {
      hoverId = f.i; p.setStyle(lineStyle(f, true));
      tipLayer.setContent(tipNode(f)); tipLayer.setLatLng(e.latlng); map.openTooltip(tipLayer);
      map.getContainer().style.cursor = 'pointer';
    });
    p.on('mousemove', (e) => tipLayer.setLatLng(e.latlng));
    p.on('mouseout', () => {
      hoverId = -1; p.setStyle(lineStyle(f)); map.closeTooltip(tipLayer);
      map.getContainer().style.cursor = '';
    });
    p.on('click', (e) => { L.DomEvent.stopPropagation(e); M.select(f); });
    polys.set(f.i, p);
    return p;
  }

  function buildGhost() {
    ghostGroup.clearLayers();
    const style = { renderer: rGhost, interactive: false, color: HEC.GREY[tone], weight: 1.2, opacity: tone === 'dark' ? 0.55 : 0.7, lineCap: 'round' };
    D.features.forEach((f) => ghostGroup.addLayer(L.polyline(f.latlngs, style)));
    M.updateGhostVisibility();
  }
  M.updateGhostVisibility = () => {
    const show = opts.context && opts.lines;
    if (show && !map.hasLayer(ghostGroup)) map.addLayer(ghostGroup);
    if (!show && map.hasLayer(ghostGroup)) map.removeLayer(ghostGroup);
  };

  function buildActive() {
    activeGroup.clearLayers();
    if (!opts.lines) return;
    const list = HEC.sel.slice().sort((a, b) => a.kv - b.kv);   // higher voltage drawn last (on top)
    list.forEach((f) => {
      const p = polyFor(f);
      p.setStyle(lineStyle(f));
      activeGroup.addLayer(p);
    });
  }

  M.restyle = () => {
    polys.forEach((p, i) => { if (activeGroup.hasLayer(p)) p.setStyle(lineStyle(D.features[i])); });
  };

  /* ---------- density grid ---------- */
  const KM_LAT = 111.19;
  const LAT0 = 40.17;
  const KM_LON = KM_LAT * Math.cos((LAT0 * Math.PI) / 180);
  const cellCache = {};
  function cellsFor(size) {
    if (cellCache[size]) return cellCache[size];
    const dLat = size / 1000 / KM_LAT, dLon = size / 1000 / KM_LON;
    const lat0 = D.meta.bounds[0][0], lon0 = D.meta.bounds[0][1];
    const per = new Array(D.features.length);
    D.features.forEach((f) => {
      const segs = [];
      let tot = 0;
      f.parts.forEach((part) => {
        for (let i = 1; i < part.length; i++) {
          const dx = (part[i][0] - part[i - 1][0]) * KM_LON, dy = (part[i][1] - part[i - 1][1]) * KM_LAT;
          const len = Math.sqrt(dx * dx + dy * dy);
          const mx = (part[i][0] + part[i - 1][0]) / 2, my = (part[i][1] + part[i - 1][1]) / 2;
          segs.push([Math.floor((mx - lon0) / dLon) * 4096 + Math.floor((my - lat0) / dLat), len]);
          tot += len;
        }
      });
      const k = tot > 0 ? f.len / tot : 0;                    // keep attribute length authoritative
      const acc = new Map();
      segs.forEach(([key, len]) => acc.set(key, (acc.get(key) || 0) + len * k));
      per[f.i] = [...acc.entries()];
    });
    cellCache[size] = { per, dLat, dLon, lat0, lon0 };
    return cellCache[size];
  }

  function buildDensity() {
    densityGroup.clearLayers();
    const lg = $('#densityLegend');
    lg.textContent = '';
    $('#densityBlock').hidden = !opts.density;
    if (!opts.density) return;
    const c = cellsFor(opts.cell);
    const sums = new Map();
    HEC.sel.forEach((f) => c.per[f.i].forEach(([key, km]) => sums.set(key, (sums.get(key) || 0) + km)));
    const vals = [...sums.values()].sort((a, b) => a - b);
    if (!vals.length) return;
    const NB = 7;
    const th = [];
    for (let i = 1; i < NB; i++) th.push(vals[Math.min(vals.length - 1, Math.floor((i / NB) * vals.length))]);
    const bin = (v) => { let b = 0; while (b < th.length && v >= th[b]) b++; return b; };
    const surface = tone === 'dark' ? '#0f2236' : '#ffffff';
    sums.forEach((km, key) => {
      const ix = Math.floor(key / 4096), iy = key % 4096;
      const b = bin(km);
      const south = c.lat0 + iy * c.dLat, west = c.lon0 + ix * c.dLon;
      const r = L.rectangle([[south, west], [south + c.dLat, west + c.dLon]], {
        renderer: rDensity, stroke: true, color: surface, weight: 1, opacity: 0.35,
        fillColor: HEC.seqColor(b / (NB - 1), tone), fillOpacity: tone === 'dark' ? 0.82 : 0.78
      });
      r.on('mouseover', (e) => {
        r.setStyle({ weight: 2, opacity: 0.9, color: tone === 'dark' ? '#ffffff' : '#0b1f33' });
        const d = mk('div', 'mtip');
        d.append(mk('strong', '', fmt.km(km, 2) + ' ' + t('u.km')), mk('span', '', t('m.cell') + ': ' + t(opts.cell === 500 ? 'm.cell500' : 'm.cell1000')));
        tipLayer.setContent(d); tipLayer.setLatLng(e.latlng); map.openTooltip(tipLayer);
      });
      r.on('mousemove', (e) => tipLayer.setLatLng(e.latlng));
      r.on('mouseout', () => { r.setStyle({ weight: 1, opacity: 0.35, color: surface }); map.closeTooltip(tipLayer); });
      densityGroup.addLayer(r);
    });
    // legend: 7 classes from quantile thresholds
    lg.appendChild(mk('p', 'lg-title', t('m.legend.density')));
    const lo = [vals[0]].concat(th), hi = th.concat([vals[vals.length - 1]]);
    for (let b = 0; b < NB; b++) {
      const rowEl = mk('div', 'lg-row static');
      const k = mk('span', 'lg-box'); k.style.background = HEC.seqColor(b / (NB - 1), tone);
      rowEl.append(k, mk('span', 'lg-name num', fmt.km(lo[b], 2) + ' – ' + fmt.km(hi[b], 2)));
      lg.appendChild(rowEl);
    }
  }

  /* ---------- community labels (greedy collision avoidance, largest first) ---------- */
  function buildLabels() {
    labelGroup.clearLayers();
    if (!opts.labels) return;
    const a = HEC.agg;
    const acc = D.communities.map(() => ({ lat: 0, lon: 0, w: 0 }));
    HEC.sel.forEach((f) => {
      const c = acc[f.cm];
      c.lat += ((f.bbox[0][0] + f.bbox[1][0]) / 2) * f.len;
      c.lon += ((f.bbox[0][1] + f.bbox[1][1]) / 2) * f.len;
      c.w += f.len;
    });
    const order = D.communities.map((_, i) => i).filter((i) => acc[i].w > 0.3).sort((x, y) => acc[y].w - acc[x].w);
    const placed = [];
    order.forEach((i) => {
      const c = acc[i];
      const ll = L.latLng(c.lat / c.w, c.lon / c.w);
      const pt = map.latLngToContainerPoint(ll);
      const name = HEC.name.comm(i);
      const wpx = name.length * 6.6 + 18, hpx = 24;
      const box = [pt.x - wpx / 2, pt.y - hpx / 2, pt.x + wpx / 2, pt.y + hpx / 2];
      if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) return;
      placed.push(box);
      const el = mk('button', 'cm-label'); el.type = 'button';
      el.append(mk('span', 'cm-name', name), mk('span', 'cm-km num', fmt.km(a.cmKm[i], 0)));
      const icon = L.divIcon({ className: 'cm-pin', html: '<span></span>', iconSize: [0, 0] });
      const m = L.marker(ll, { icon, keyboard: false, riseOnHover: true });
      m.on('add', () => {
        const host = m.getElement().firstChild;
        host.appendChild(el);
        L.DomEvent.disableClickPropagation(el);
        el.addEventListener('click', () => HEC.toggle('cm', i));
        el.setAttribute('title', t('m.labelTip', { name, km: fmt.km(a.cmKm[i], 1) }));
        el.classList.toggle('is-sel', HEC.state.cm.has(i));
      });
      labelGroup.addLayer(m);
    });
  }

  /* ---------- legend (side panel) ---------- */
  function renderLegend() {
    const host = $('#mapLegend');
    host.textContent = '';
    const a = HEC.agg;
    const byBranch = HEC.state.colorBy === 'branch';
    const items = byBranch
      ? D.branches.map((_, i) => ({ kind: 'br', v: i, name: HEC.name.branch(i), km: a.brKm[i], color: HEC.PAL[tone].br[i], w: 3 }))
      : HEC.KV.slice().reverse().map((kv) => ({ kind: 'kv', v: kv, name: HEC.kvLabel(kv), km: a.kvKm[kv], color: HEC.PAL[tone].kv[kv], w: W[kv] + 1 }));
    items.forEach((it) => {
      const r = mk('button', 'lg-row'); r.type = 'button';
      const k = mk('span', 'lg-line'); k.style.background = opts.density ? neutralInk() : it.color; k.style.height = it.w + 'px';
      r.append(k, mk('span', 'lg-name', it.name), mk('span', 'lg-km num', fmt.km(it.km) + ' ' + t('u.km')));
      const set = HEC.state[it.kind];
      r.classList.toggle('is-sel', set.has(it.v));
      r.classList.toggle('is-off', set.size > 0 && !set.has(it.v));
      r.classList.toggle('is-zero', it.km === 0);
      r.setAttribute('aria-pressed', String(set.has(it.v)));
      r.addEventListener('click', () => HEC.toggle(it.kind, it.v));
      host.appendChild(r);
    });
    if (opts.context && HEC.activeCount() > 0) {
      const r = mk('div', 'lg-row static ghost');
      const k = mk('span', 'lg-line'); k.style.background = HEC.GREY[tone]; k.style.height = '1px';
      r.append(k, mk('span', 'lg-name', t('m.excluded')), mk('span', 'lg-km num', fmt.km(HEC.base.km - a.km) + ' ' + t('u.km')));
      host.appendChild(r);
    }
  }

  function renderBadge() {
    const a = HEC.agg;
    $('#mapBadge').textContent = fmt.int(a.n) + ' ' + HEC.plural('u.seg', a.n) + ' · ' + fmt.km(a.km) + ' ' + t('u.km');
  }

  /* ---------- fit ---------- */
  function selBounds() {
    if (!HEC.sel.length) return null;
    let s = 90, w = 180, n = -90, e = -180;
    HEC.sel.forEach((f) => {
      if (f.bbox[0][0] < s) s = f.bbox[0][0]; if (f.bbox[1][0] > n) n = f.bbox[1][0];
      if (f.bbox[0][1] < w) w = f.bbox[0][1]; if (f.bbox[1][1] > e) e = f.bbox[1][1];
    });
    return [[s, w], [n, e]];
  }
  M.fit = (animate) => {
    const b = HEC.sel.length === D.features.length ? D.meta.bounds : (selBounds() || D.meta.bounds);
    if (animate === false || HEC.reduceMotion()) map.fitBounds(b, { padding: [24, 24], maxZoom: 16, animate: false });
    else map.flyToBounds(b, { padding: [32, 32], maxZoom: 16, duration: 0.85 });
  };
  M.whole = () => map.flyToBounds(D.meta.bounds, { padding: [24, 24], duration: 0.8 });
  M.invalidate = () => { if (map) map.invalidateSize(); };

  /* ---------- basemap ---------- */
  function setBase(name, silent) {
    const b = BASES[name] || BASES.light;
    opts.base = name;
    if (tile) map.removeLayer(tile);
    if (tileLabels) { map.removeLayer(tileLabels); tileLabels = null; }
    tile = L.tileLayer(b.url, { attribution: b.attr, maxZoom: 19, maxNativeZoom: b.native, detectRetina: false });
    tile.addTo(map);
    tile.bringToBack();
    if (b.labels) {
      if (!map.getPane('labels')) { map.createPane('labels').style.zIndex = 405; map.getPane('labels').style.pointerEvents = 'none'; }
      tileLabels = L.tileLayer(b.labels, { pane: 'labels', maxZoom: 19, maxNativeZoom: b.native, opacity: 0.9 }).addTo(map);
    }
    const prevTone = tone;
    tone = b.tone;
    map.getContainer().classList.toggle('tone-dark', tone === 'dark');
    document.querySelectorAll('#segBase button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.val === name)));
    if (!silent && prevTone !== tone) { buildGhost(); M.refresh('tone'); }
  }

  /* ---------- refresh ---------- */
  let refreshRaf = 0;
  M.refresh = (reason) => {
    cancelAnimationFrame(refreshRaf);
    const stage = map.getContainer();
    stage.classList.add('is-updating');
    refreshRaf = requestAnimationFrame(() => {
      buildActive();
      buildDensity();
      buildLabels();
      drawSelection();
      renderLegend();
      renderBadge();
      renderSel();
      setTimeout(() => stage.classList.remove('is-updating'), 90);
    });
    if (reason === 'filter' || (typeof reason === 'string' && (reason.indexOf('toggle') === 0 || reason.indexOf('clear') === 0 || reason === 'reset'))) {
      if (opts.auto && !firstFit) {
        clearTimeout(fitTimer);
        fitTimer = setTimeout(() => M.fit(true), 220);
      }
    }
  };

  /* ---------- init ---------- */
  M.init = () => {
    map = L.map('map', {
      zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 80,
      minZoom: 9, maxZoom: 19, attributionControl: true, preferCanvas: false
    });
    M.map = map;
    L.control.zoom({ position: 'topleft' }).addTo(map);
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);

    [['ghost', 410], ['density', 420], ['lines', 430], ['sel', 440]].forEach(([n, z]) => { map.createPane(n).style.zIndex = z; });
    rGhost = L.canvas({ pane: 'ghost', padding: 0.2 });
    rDensity = L.canvas({ pane: 'density', padding: 0.2, tolerance: 0 });
    rLines = L.canvas({ pane: 'lines', padding: 0.2, tolerance: 6 });
    rSel = L.canvas({ pane: 'sel', padding: 0.2 });
    ghostGroup = L.layerGroup(); activeGroup = L.layerGroup().addTo(map);
    densityGroup = L.layerGroup().addTo(map); labelGroup = L.layerGroup().addTo(map); selGroup = L.layerGroup().addTo(map);

    map.fitBounds(D.meta.bounds, { padding: [24, 24], animate: false });
    opts.base = HEC.theme() === 'dark' ? 'dark' : 'light';
    setBase(opts.base, true);
    buildGhost();
    M.refresh('init');
    setTimeout(() => { firstFit = false; }, 600);

    map.on('zoomend', () => { M.restyle(); drawSelection(); buildLabels(); });
    map.on('click', () => { if (HEC.state.selected) M.select(null); });

    /* panel + toolbar wiring */
    const bind = (id, key, after) => $(id).addEventListener('change', (e) => {
      opts[key] = e.target.checked; if (after) after(); else M.refresh('layer');
    });
    bind('#lyLines', 'lines', () => { M.updateGhostVisibility(); M.refresh('layer'); });
    bind('#lyDensity', 'density', () => { M.refresh('layer'); });
    bind('#lyLabels', 'labels');
    bind('#lyContext', 'context', () => { M.updateGhostVisibility(); renderLegend(); });
    bind('#lyAuto', 'auto', () => { /* flag only */ });

    $('#segColor').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      HEC.state.colorBy = b.dataset.val;
      document.querySelectorAll('#segColor button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      HEC.writeHash(); M.restyle(); drawSelection(); renderLegend();
    });
    $('#segCell').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      opts.cell = +b.dataset.val;
      document.querySelectorAll('#segCell button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      buildDensity();
    });
    $('#segBase').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      userPickedBase = true; setBase(b.dataset.val);
    });

    L.DomEvent.disableClickPropagation($('#mapTools'));
    $('#mFit').addEventListener('click', () => M.fit(true));
    $('#mWhole').addEventListener('click', M.whole);
    const wrap = $('#mapwrap');
    const full = $('#mFull');
    full.addEventListener('click', () => {
      if (document.fullscreenEnabled && wrap.requestFullscreen) {
        if (document.fullscreenElement) document.exitFullscreen(); else wrap.requestFullscreen();
      } else { wrap.classList.toggle('is-full'); document.body.classList.toggle('lock-scroll'); setTimeout(M.invalidate, 60); }
    });
    document.addEventListener('fullscreenchange', () => { wrap.classList.toggle('is-full', !!document.fullscreenElement); setTimeout(M.invalidate, 80); });
    if (window.ResizeObserver) new ResizeObserver(() => M.invalidate()).observe($('#map'));

    HEC.on('filter', (reason) => M.refresh(reason));
    HEC.on('theme', (th) => { if (!userPickedBase) setBase(th === 'dark' ? 'dark' : 'light'); renderLegend(); });
    HEC.on('lang', () => { renderLegend(); renderBadge(); renderSel(); buildLabels(); buildDensity(); });
  };

  /** Apply UI state restored from the URL (colour mode). */
  M.syncControls = () => {
    document.querySelectorAll('#segColor button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.val === HEC.state.colorBy)));
  };
})();
