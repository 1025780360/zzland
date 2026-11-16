import { loadState, onChange } from './store.js';
import * as home from './home.js';
import * as analyze from './analyze.js';
import * as reminders from './reminders.js';
import * as settings from './settings.js';
import * as clipboard from './clipboard.js';
import { $, $$ } from './utils.js';
import { watchLayout, applyNativeScreen } from './layout.js';
import { getScreenInfo } from './bridge.js';

const views = { home, analyze, reminders, settings };

function navigate(name) {
  if (!views[name]) return;
  $$('.view').forEach((view) => {
    view.hidden = view.id !== `view-${name}`;
  });
  $$('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === name);
  });
  movePill();
  const section = $(`#view-${name}`);
  $('#page-title').textContent = section?.dataset.title || '校园助手';
  $('#today-line').hidden = name !== 'home';
  window.scrollTo({ top: 0, behavior: 'instant' });
  renderAll();
}

// 选中的白色胶囊在玻璃条里滑到当前 tab
function movePill() {
  const pill = $('.tab-pill');
  const tab = $('.tab.active');
  if (!pill || !tab) return;
  pill.style.width = `${tab.offsetWidth}px`;
  pill.style.height = `${tab.offsetHeight}px`;
  pill.style.transform = `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`;
}

function renderAll() {
  Object.values(views).forEach((view) => view.render?.());
}

function bindNav() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => navigate(tab.dataset.view));
  });
  window.addEventListener('resize', movePill);
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
  watchLayout();
  getScreenInfo().then(applyNativeScreen);
  watchWatermark();
  bindNav();
  home.init({ navigate });
  analyze.init({ navigate });
  reminders.init();
  settings.init();
  clipboard.init({ navigate });
  onChange(renderAll);
  navigate('home');
}

main();
