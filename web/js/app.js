import { loadState, onChange } from './store.js';
import * as home from './home.js';
import * as analyze from './analyze.js';
import * as reminders from './reminders.js';
import * as settings from './settings.js';
import { $, $$ } from './utils.js';

const views = { home, analyze, reminders, settings };

function navigate(name) {
  if (!views[name]) return;
  $$('.view').forEach((view) => {
    view.hidden = view.id !== `view-${name}`;
  });
  $$('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === name);
  });
  const section = $(`#view-${name}`);
  $('#page-title').textContent = section?.dataset.title || '校园助手';
  $('#today-line').hidden = name !== 'home';
  window.scrollTo({ top: 0, behavior: 'instant' });
  renderAll();
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
}

function watchKeyboard() {
  const field = (node) => node?.closest?.('input, textarea, select');
  document.addEventListener('focusin', (event) => {
    if (field(event.target)) document.body.classList.add('keyboard-open');
  });
  document.addEventListener('focusout', () => {
    // 键盘收起前焦点会先跳到别处，等一拍再判断
    setTimeout(() => {
      if (!field(document.activeElement)) document.body.classList.remove('keyboard-open');
    }, 30);
  });
}

// iPhone Duo：外屏和横屏时系统把状态栏、标签栏放到右侧竖条里，页面跟着把导航竖排
function watchDuo() {
  const apply = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = w / h;
    const duoOuter = h >= w
      ? w >= 380 && w <= 560 && ratio >= 0.64
      : w >= 560 && w <= 980 && h <= 640 && ratio <= 1.6;
    document.body.classList.toggle('duo-rail', duoOuter);
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 200));
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
  watchKeyboard();
  watchDuo();
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
