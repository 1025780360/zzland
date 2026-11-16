import { state, addReminder, toggleReminder, deleteReminder, sortedReminders, openReminders } from './store.js';
import { icons } from './icons.js';
import { $, $$, escapeHtml, dueLabel, toast } from './utils.js';

const confirmTimers = new Map();
let query = '';
let filter = 'all';

export function init() {
  $('#add-reminder-btn').addEventListener('click', () => {
    const form = $('#reminder-form');
    form.hidden = !form.hidden;
    if (!form.hidden) $('#r-title').focus();
  });
  $('#r-cancel').addEventListener('click', closeForm);
  $('#reminder-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const title = $('#r-title').value.trim();
    if (!title) return;
    let due = null;
    try {
      due = parseDue($('#r-due').value);
    } catch (error) {
      toast(error.message);
      return;
    }
    addReminder({
      title,
      due,
      priority: $('#r-priority').value,
      note: $('#r-note').value,
    });
    closeForm();
    resetFilters();
    render();
    toast(due ? '已加入提醒，并安排好通知' : '已加入提醒');
  });
  $('#r-search').addEventListener('input', (event) => {
    query = event.target.value.trim();
    syncFilterUI();
    render();
  });
  $('#r-search-clear').addEventListener('click', () => {
    query = '';
    $('#r-search').value = '';
    syncFilterUI();
    render();
    $('#r-search').focus();
  });
  $('#r-filters').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-filter]');
    if (!btn) return;
    filter = btn.dataset.filter;
    syncFilterUI();
    render();
  });
  $('#reminder-list').addEventListener('click', onListClick);
  syncFilterUI();
  render();
}

// 截止时间用文字输入：WKWebView 兼容窗口里的原生日期控件会撑破布局
// 支持 11月20日 14:00、11-20 14:00、2026-11-20 14:00、今天/明天/后天 14:00
function parseDue(text) {
  const raw = text.trim().replace(/\s+/g, ' ');
  if (!raw) return null;
  const now = new Date();

  const relative = raw.match(/^(今天|明天|后天)(?: ?(\d{1,2})[:：点时](\d{1,2})?分?)?$/);
  if (relative) {
    const date = new Date(now);
    date.setDate(date.getDate() + { 今天: 0, 明天: 1, 后天: 2 }[relative[1]]);
    const hour = relative[2] === undefined ? 23 : Number(relative[2]);
    const minute = relative[2] === undefined ? 59 : Number(relative[3] || 0);
    if (hour > 23 || minute > 59) throw new Error('时间要写成 14:30 这样');
    date.setHours(hour, minute, 0, 0);
    return date;
  }

  const absolute = raw.match(/^(?:(\d{4})[-/.年])?(\d{1,2})[-/.月](\d{1,2})日?(?: ?(\d{1,2})[:：点时](\d{1,2})?分?)?$/);
  if (!absolute) throw new Error('时间没看懂，写成 11月20日 14:00 这样');
  const year = absolute[1] ? Number(absolute[1]) : now.getFullYear();
  const month = Number(absolute[2]);
  const day = Number(absolute[3]);
  const hour = absolute[4] === undefined ? 23 : Number(absolute[4]);
  const minute = absolute[4] === undefined ? 59 : Number(absolute[5] || 0);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new Error('时间没看懂，写成 11月20日 14:00 这样');
  }
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('这个日期不存在，检查一下');
  if (!absolute[1] && date.getTime() < now.getTime() - 86400000) date.setFullYear(year + 1);
  return date;
}

function resetFilters() {
  query = '';
  filter = 'all';
  $('#r-search').value = '';
  syncFilterUI();
}

function syncFilterUI() {
  $('#r-search-clear').hidden = !query;
  $$('#r-filters .fchip').forEach((btn) => {
    const on = btn.dataset.filter === filter;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

// 一周从周一开始，到周日 24 点结束
function weekRange(now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return [start.getTime(), end.getTime()];
}

function matches(item, now) {
  if (query) {
    const hay = `${item.title} ${item.note || ''}`.toLowerCase();
    if (!hay.includes(query.toLowerCase())) return false;
  }
  if (filter === 'done') return item.done;
  if (filter === 'overdue') return !item.done && item.due && new Date(item.due).getTime() < now;
  if (filter === 'week') {
    if (!item.due) return false;
    const [start, end] = weekRange(now);
    const due = new Date(item.due).getTime();
    return due >= start && due < end;
  }
  return true;
}

function closeForm() {
  const form = $('#reminder-form');
  form.reset();
  form.hidden = true;
}

function onListClick(event) {
  const toggle = event.target.closest('[data-toggle]');
  if (toggle) {
    toggleReminder(toggle.dataset.toggle);
    render();
    return;
  }

  const del = event.target.closest('[data-del]');
  if (!del) return;
  const id = del.dataset.del;
  if (del.dataset.confirm !== '1') {
    del.dataset.confirm = '1';
    del.innerHTML = '<span class="del-confirm">确认</span>';
    clearTimeout(confirmTimers.get(id));
    confirmTimers.set(id, setTimeout(() => {
      del.dataset.confirm = '0';
      del.innerHTML = icons.trash;
    }, 3000));
    return;
  }
  clearTimeout(confirmTimers.get(id));
  deleteReminder(id);
  render();
  toast('已删除');
}

export function render() {
  const now = Date.now();
  const filtering = filter !== 'all' || Boolean(query);
  const items = sortedReminders().filter((item) => matches(item, now));

  $('#reminder-summary').textContent = filtering
    ? `匹配 ${items.length} 项`
    : `${openReminders().length} 项待办`;

  if (!items.length) {
    $('#reminder-list').innerHTML = filtering
      ? `<div class="empty">${icons.search}没有匹配的待办，换个关键词或筛选</div>`
      : `<div class="empty">${icons.inbox}还没有提醒，点右上角「新增」</div>`;
    return;
  }

  const openItems = items.filter((item) => !item.done);
  const doneItems = items.filter((item) => item.done);

  const renderOne = (item) => {
    const overdue = !item.done && item.due && new Date(item.due).getTime() < now;
    const dueText = item.due ? dueLabel(item.due) : '无截止时间';
    let sub = `<span>${escapeHtml(dueText)}</span>`;
    if (item.note && item.source !== 'notice') sub += `<span>${escapeHtml(item.note.slice(0, 28))}</span>`;
    if (item.source === 'notice') sub += '<span class="tag">来自通知</span>';

    return `
      <div class="item pri-${item.priority} ${overdue ? 'is-overdue' : ''}">
        <button class="check ${item.done ? 'on' : ''}" type="button" data-toggle="${item.id}" aria-label="${item.done ? '标记未完成' : '标记完成'}" aria-pressed="${item.done}">${icons.check}</button>
        <span class="dot ${overdue ? 'overdue' : item.priority}"></span>
        <div class="item-main">
          <p class="item-title ${item.done ? 'done' : ''}">${escapeHtml(item.title)}</p>
          <p class="item-sub">${sub}</p>
        </div>
        <button class="del" type="button" data-del="${item.id}" aria-label="删除">${icons.trash}</button>
      </div>`;
  };

  const blocks = [];
  if (openItems.length) blocks.push(openItems.map(renderOne).join(''));
  if (doneItems.length) {
    blocks.push(`<p class="list-label">已完成 · ${doneItems.length}</p>`);
    blocks.push(doneItems.map(renderOne).join(''));
  }
  $('#reminder-list').innerHTML = blocks.join('');
}
