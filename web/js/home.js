import { state, openReminders } from './store.js';
import { isNative } from './bridge.js';
import { icons } from './icons.js';
import { $, $$, escapeHtml, fmtDateTime, dueLabel, startOfDay, pluralDays } from './utils.js';

let navigateTo = () => {};
let timer = 0;

export function init(options = {}) {
  navigateTo = options.navigate || navigateTo;
  $('#go-reminders').addEventListener('click', () => navigateTo('reminders'));
  $$('[data-goto]').forEach((node) => {
    node.addEventListener('click', () => navigateTo(node.dataset.goto));
  });
  const now = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  $('#today-line').textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · 周${week}`;
  render();
  clearInterval(timer);
  timer = setInterval(renderSigning, 30000);
}

export function render() {
  renderSigning();
  renderStats();
  renderUpcoming();
}

function renderSigning() {
  const chip = $('#signing-chip');
  const countdown = $('#countdown');
  const line = $('#expiry-line');
  const meter = $('#signing-meter');
  const tip = $('#signing-tip');
  const info = state.signing;

  if (!info?.expiresAt) {
    chip.className = 'chip';
    chip.textContent = '未读取';
    countdown.textContent = '—';
    line.textContent = isNative
      ? '没有读到 App 包内的证书文件，重启一次 App 再试。'
      : '没检测到原生桥：浏览器预览读不到签名；如果这是在 App 里，说明装的是旧安装包。';
    meter.style.setProperty('--v', '0');
    meter.className = '';
    tip.textContent = isNative
      ? '如果一直读不到，说明这次签名没有写入描述文件，用 Sideloadly 重新签一次即可。'
      : '重新安装最新 IPA（带原生桥的版本）后，这里会显示真实到期时间。';
    return;
  }

  const expires = new Date(info.expiresAt).getTime();
  const now = Date.now();
  const remain = expires - now;

  if (remain <= 0) {
    chip.className = 'chip danger';
    chip.textContent = '已过期';
    countdown.innerHTML = '0<small>天</small>';
    line.textContent = `${fmtDateTime(info.expiresAt)} 已到期`;
    meter.style.setProperty('--v', '0');
    meter.className = 'danger';
    tip.textContent = '证书已过期，App 需要连接电脑重新签名安装才能打开。';
    return;
  }

  const { days, hours, hoursTotal } = pluralDays(remain);
  countdown.innerHTML = days > 0
    ? `${days}<small>天</small>${hours}<small>小时</small>`
    : `${hoursTotal}<small>小时</small>${Math.floor((remain % 3600000) / 60000)}<small>分</small>`;

  const installed = info.installedAt ? new Date(info.installedAt).getTime() : NaN;
  const total = Number.isFinite(installed) && installed < expires ? expires - installed : 7 * 86400000;
  const ratio = Math.max(0, Math.min(1, remain / total));
  const percent = Math.round(ratio * 100);
  meter.style.setProperty('--v', String(percent / 100));

  if (hoursTotal <= 24) {
    chip.className = 'chip danger';
    chip.textContent = '紧急';
    meter.className = 'danger';
    tip.textContent = '不到 24 小时，今天务必连接电脑用 Sideloadly 续签。';
  } else if (hoursTotal <= 72) {
    chip.className = 'chip warn';
    chip.textContent = '注意';
    meter.className = 'warn';
    tip.textContent = '建议这两天找时间续签，过期后 App 将无法打开。';
  } else {
    chip.className = 'chip ok';
    chip.textContent = '正常';
    meter.className = '';
    tip.textContent = '状态正常。到期前 3 天和 12 小时会发本地提醒。';
  }

  const sourceText = info.source === 'profile' ? '证书信息' : '按首次打开时间估算';
  line.textContent = `${fmtDateTime(info.expiresAt)} 到期 · ${sourceText}`;
}

function renderStats() {
  const open = state.reminders.filter((item) => !item.done);
  const today = open.filter((item) => item.due && startOfDay(item.due).getTime() === startOfDay().getTime());
  $('#stat-open').textContent = String(open.length);
  $('#stat-today').textContent = String(today.length);
}

function renderUpcoming() {
  const list = $('#upcoming-list');
  const items = openReminders().filter((item) => item.due).slice(0, 4);
  if (!items.length) {
    list.innerHTML = `
      <div class="empty">
        ${icons.inbox}
        暂无待办，先去分析一条通知
      </div>`;
    return;
  }
  const now = Date.now();
  const todayStart = startOfDay().getTime();
  list.innerHTML = items.map((item) => {
    const due = new Date(item.due);
    const overdue = due.getTime() < now;
    const isToday = startOfDay(due).getTime() === todayStart;
    return `
      <div class="item pri-${item.priority} ${overdue ? 'is-overdue' : ''}">
        <div class="date-badge ${overdue ? 'overdue' : ''}">
          <b>${due.getDate()}</b>
          <span>${isToday ? '今天' : `${due.getMonth() + 1} 月`}</span>
        </div>
        <div class="item-main">
          <p class="item-title">${escapeHtml(item.title)}</p>
          <p class="item-sub"><span>${overdue ? '已逾期 · ' : ''}${escapeHtml(dueLabel(item.due))}</span></p>
        </div>
      </div>`;
  }).join('');
}
