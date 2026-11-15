import { loadState, onChange } from './store.js';
import * as home from './home.js';
import * as analyze from './analyze.js';
import * as reminders from './reminders.js';
import * as settings from './settings.js';
import { $, $$ } from './utils.js';

const views = { home, analyze, reminders, settings };
let current = 'home';

function navigate(name) {
  if (!views[name]) return;
  current = name;
  $$('.view').forEach((view) => {
    view.hidden = view.id !== `view-${name}`;
  });
  $$('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === name);
  });
  const section = $(`#view-${name}`);
  $('#page-title').textContent = section?.dataset.title || '校园助手';
  $('#today-line').hidden = name !== 'home';
  section.classList.remove('enter');
  void section.offsetWidth;
  section.classList.add('enter');
  moveTabInk(name);
  window.scrollTo({ top: 0, behavior: 'instant' });
  renderAll();
}

function moveTabInk(name) {
  const ink = $('#tab-ink');
  const tab = $(`.tab[data-view="${name}"]`);
  if (!ink || !tab) return;
  ink.style.width = `${tab.offsetWidth}px`;
  ink.style.transform = `translateX(${tab.offsetLeft}px)`;
}

function renderAll() {
  Object.values(views).forEach((view) => view.render?.());
}

function bindNav() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => navigate(tab.dataset.view));
  });
  $('#refresh-btn').addEventListener('click', (event) => {
    const button = event.currentTarget;
    if (button.classList.contains('spin')) return;
    button.classList.add('spin');
    setTimeout(() => {
      location.replace(`${location.pathname}?v=${Date.now()}`);
    }, 420);
  });
  window.addEventListener('resize', () => moveTabInk(current));
}

function watchWatermark() {
  const apply = () => {
    const host = document.getElementById('qoder-sites-watermark');
    const shown = Boolean(host?.shadowRoot?.querySelector('.badge'));
    document.body.classList.toggle('has-watermark', shown);
  };
  const watchHost = () => {
    const host = document.getElementById('qoder-sites-watermark');
    if (!host || host.dataset.zzWatched) return;
    host.dataset.zzWatched = '1';
    if (host.shadowRoot) new MutationObserver(apply).observe(host.shadowRoot, { childList: true });
  };
  new MutationObserver(() => { watchHost(); apply(); }).observe(document.documentElement, { childList: true });
  watchHost();
  apply();
}

async function main() {
  await loadState();
  watchWatermark();
  bindNav();
  home.init({ navigate });
  analyze.init({ navigate });
  reminders.init();
  settings.init();
  onChange(renderAll);
  navigate('home');
}

main();
