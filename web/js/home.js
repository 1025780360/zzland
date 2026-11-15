import { state, openReminders } from './store.js';
import { isNative } from './bridge.js';
import { icons } from './icons.js';
import { $, $$, escapeHtml, fmtDateTime, dueLabel, startOfDay, pluralDays } from './utils.js';

let navigateTo = () => {};
let timer = 0;

const QUOTES = [
  { text: '千里之行，始于足下。', from: '老子' },
  { text: '学而不思则罔，思而不学则殆。', from: '孔子' },
  { text: '不积跬步，无以至千里。', from: '荀子' },
  { text: '纸上得来终觉浅，绝知此事要躬行。', from: '陆游' },
  { text: '知之者不如好之者，好之者不如乐之者。', from: '孔子' },
  { text: '业精于勤，荒于嬉。', from: '韩愈' },
  { text: '非淡泊无以明志，非宁静无以致远。', from: '诸葛亮' },
  { text: '博学之，审问之，慎思之，明辨之，笃行之。', from: '礼记·中庸' },
  { text: '路漫漫其修远兮，吾将上下而求索。', from: '屈原' },
  { text: '天行健，君子以自强不息。', from: '周易' },
];

export function init(options = {}) {
  navigateTo = options.navigate || navigateTo;
  $('#go-reminders').addEventListener('click', () => navigateTo('reminders'));
  $$('[data-goto]').forEach((node) => {
    node.addEventListener('click', () => navigateTo(node.dataset.goto));
  });
  renderGreeting();
  loadQuote();
  render();
  clearInterval(timer);
  timer = setInterval(() => {
    renderGreeting();
    renderSigning();
  }, 30000);

  // 从后台回来超过 5 分钟，顺手换一句
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt > 5 * 60000) loadQuote();
    hiddenAt = 0;
  });
}

function renderQuote(text, cite) {
  const el = $('#quote');
  el.innerHTML = `「${escapeHtml(text)}」${cite ? `<cite>— ${escapeHtml(cite)}</cite>` : ''}`;
  el.classList.remove('quote-in');
  void el.offsetWidth; // 重新触发淡入
  el.classList.add('quote-in');
}

// 一言接口无 Key、允许跨域；断网时退回本地名言
async function loadQuote() {
  const local = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  renderQuote(local.text, local.from);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`https://v1.hitokoto.cn/?c=i&c=k&c=d&encode=json&_=${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.hitokoto) return;
    const work = data.from && data.from !== '原创' && data.from !== '网络' ? `《${data.from}》` : '';
    renderQuote(data.hitokoto, data.from_who ? `${data.from_who}${work}` : '');
  } catch {
    // 保留本地名言
  } finally {
    clearTimeout(timeout);
  }
}

function greetingFor(hour) {
  if (hour < 5 || hour >= 23) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function renderGreeting() {
  const now = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  $('#greeting').textContent = greetingFor(now.getHours());
  $('#today-line').textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · 周${week}`;
}

export function render() {
  renderSigning();
  renderStats();
  renderUpcoming();
}

function renderSigning() {
  const chip = $('#signing-chip');
  const line = $('#expiry-line');
  const info = state.signing;

  if (!info?.expiresAt) {
    chip.className = 'chip';
    chip.textContent = '未读取';
    line.textContent = isNative
      ? '没读到签名信息，重启一次 App 再试'
      : '浏览器预览读不到签名，在 App 内显示';
    return;
  }

  const expires = new Date(info.expiresAt).getTime();
  const remain = expires - Date.now();

  if (remain <= 0) {
    chip.className = 'chip danger';
    chip.textContent = '已过期';
    line.textContent = `${fmtDateTime(info.expiresAt)} 已到期，需连接电脑重新签名`;
    return;
  }

  const { days, hours, hoursTotal } = pluralDays(remain);
  const timeText = days > 0
    ? `${days} 天 ${hours} 小时`
    : `${hoursTotal} 小时 ${Math.floor((remain % 3600000) / 60000)} 分`;
  line.textContent = `自签还剩 ${timeText} · ${fmtDateTime(info.expiresAt)} 到期`;

  if (hoursTotal <= 24) {
    chip.className = 'chip danger';
    chip.textContent = '紧急';
  } else if (hoursTotal <= 72) {
    chip.className = 'chip warn';
    chip.textContent = '注意';
  } else {
    chip.className = 'chip ok';
    chip.textContent = '正常';
  }
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
