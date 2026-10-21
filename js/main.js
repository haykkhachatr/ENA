/* Bootstrap: restore preferences and shared view, then start each module. */
(function () {
  'use strict';
  const HEC = window.HEC;

  let theme = document.documentElement.getAttribute('data-theme') || 'light';
  let lang = null;
  try { lang = localStorage.getItem('hec.lang'); } catch (e) { /* storage unavailable */ }
  if (!lang) lang = (navigator.language || '').toLowerCase().indexOf('hy') === 0 ? 'hy' : 'en';

  HEC.setTheme(theme, true);
  HEC.setLang(lang, true);
  document.querySelectorAll('#langSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === HEC.lang())));

  HEC.readHash();
  HEC.commit('init');

  HEC.charts.init();
  HEC.map.init();
  HEC.map.syncControls();
  HEC.ui.init();

  if (HEC.activeCount() > 0) HEC.map.fit(false);   // arriving on a shared, filtered view

  /* header goes transparent over the hero, solid once the page scrolls */
  const top = document.getElementById('topbar');
  const onScroll = () => top.classList.toggle('on-dark', window.scrollY < 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  window.addEventListener('hashchange', () => {
    if (HEC.readHash(true)) { HEC.commit('hash'); HEC.map.syncControls(); }
  });
})();
