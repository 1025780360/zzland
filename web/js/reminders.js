import { state, addReminder, toggleReminder, deleteReminder, sortedReminders, openReminders } from './store.js';
import { $, escapeHtml, dueLabel, toast } from './utils.js';

const confirmTimers = new Map();

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
    const dueValue = $('#r-due').value;
    addReminder({
      title,
      due: dueValue ? new Date(dueValue) : null,
      priority: $('#r-priority').value,
      note: $('#r-note').value,
    });
    closeForm();
    render();
    toast(dueValue ? '已加入提醒，并安排好通知' : '已加入提醒');
  });
  $('#reminder-list').addEventListener('click', onListClick);
  render();
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
    del.textContent = '确认删除';
    clearTimeout(confirmTimers.get(id));
    confirmTimers.set(id, setTimeout(() => {
      del.dataset.confirm = '0';
      del.textContent = '删除';
    }, 3000));
    return;
  }
  clearTimeout(confirmTimers.get(id));
  deleteReminder(id);
  render();
  toast('已删除');
}

export function render() {
  const open = openReminders();
  $('#reminder-summary').textContent = `${open.length} 项待办`;

  const items = sortedReminders();
  if (!items.length) {
    $('#reminder-list').innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16H6zM9 9h6M9 13h4"/></svg>
        还没有提醒。<br>点右上角「新增」，或从通知分析结果里加入。
      </div>`;
    return;
  }

  const now = Date.now();
  const openItems = items.filter((item) => !item.done);
  const doneItems = items.filter((item) => item.done);

  const renderOne = (item) => {
    const overdue = !item.done && item.due && new Date(item.due).getTime() < now;
    const dueText = item.due ? `${overdue ? '已逾期 · ' : ''}${dueLabel(item.due)}` : '无截止时间';
    let sub = `<span>${escapeHtml(dueText)}</span>`;
    if (item.note && item.source !== 'notice') sub += `<span>${escapeHtml(item.note.slice(0, 28))}</span>`;
    if (item.source === 'notice') sub += '<span class="tag">来自通知</span>';

    return `
      <div class="item">
        <button class="check ${item.done ? 'on' : ''}" type="button" data-toggle="${item.id}" aria-label="${item.done ? '标记未完成' : '标记完成'}" aria-pressed="${item.done}">✓</button>
        <span class="dot ${overdue ? 'overdue' : item.priority}"></span>
        <div class="item-main">
          <p class="item-title ${item.done ? 'done' : ''}">${escapeHtml(item.title)}</p>
          <p class="item-sub">${sub}</p>
        </div>
        <button class="link-btn del" type="button" data-del="${item.id}">删除</button>
      </div>`;
  };

  const blocks = [];
  if (openItems.length) blocks.push(openItems.map(renderOne).join(''));
  if (doneItems.length) {
    blocks.push(`<p class="label" style="margin:6px 2px 0">已完成（${doneItems.length}）</p>`);
    blocks.push(doneItems.map(renderOne).join(''));
  }
  $('#reminder-list').innerHTML = blocks.join('');
}
