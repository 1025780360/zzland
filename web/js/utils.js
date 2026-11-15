export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let toastTimer = 0;
export function toast(message) {
  const box = $('#toast');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 2200);
}

export function fmtDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const md = `${date.getMonth() + 1}月${date.getDate()}日`;
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return sameYear ? `${md} ${hm}` : `${date.getFullYear()}年${md} ${hm}`;
}

export function fmtDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function fmtClock(value) {
  const date = value instanceof Date ? value : new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function dueLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffDays = Math.round((startOfDay(date) - startOfDay()) / 86400000);
  if (diffDays < 0) return `已逾期 ${Math.abs(diffDays)} 天`;
  if (diffDays === 0) return `今天 ${fmtClock(date)}`;
  if (diffDays === 1) return `明天 ${fmtClock(date)}`;
  return fmtDateTime(date);
}

export function toLocalInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseLocalInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function pluralDays(ms) {
  const hoursTotal = Math.max(0, Math.floor(ms / 3600000));
  const days = Math.floor(hoursTotal / 24);
  const hours = hoursTotal % 24;
  return { days, hours, hoursTotal };
}
