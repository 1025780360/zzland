import {
  isNative,
  readStore,
  writeStore,
  getSigningInfo,
  getNotifyStatus,
  requestNotifyPermission,
  scheduleNotification,
  cancelNotification,
  setBadge,
  readSecret,
  writeSecret,
} from './bridge.js';
import { uid } from './utils.js';

export const state = {
  reminders: [],
  analyses: [],
  settings: { apiKey: '' },
  signing: null,
  notifyStatus: 'unknown',
};

const listeners = new Set();
export function onChange(listener) {
  listeners.add(listener);
}
function notifyChange() {
  listeners.forEach((listener) => listener());
}

export async function loadState() {
  const [reminders, analyses, settings, signing, notifyStatus, apiKey] = await Promise.all([
    readStore('reminders', []),
    readStore('analyses', []),
    readStore('settings', {}),
    getSigningInfo(),
    getNotifyStatus(),
    readSecret('deepseekKey', ''),
  ]);
  state.reminders = Array.isArray(reminders) ? reminders : [];
  state.analyses = Array.isArray(analyses) ? analyses : [];
  state.settings = { ...(settings || {}), apiKey: apiKey || '' };
  state.signing = signing || null;
  state.notifyStatus = notifyStatus;
  if (isNative && state.notifyStatus === 'unknown') {
    // 系统只会弹一次窗；不阻塞首屏，结果回来后再刷新设置页
    requestNotifyPermission().then((status) => {
      state.notifyStatus = status;
      notifyChange();
    });
  }
  await adoptLocalData();
  await syncNotifications();
  await syncBadge();
  notifyChange();
}

// 旧安装包的桥没生效，数据落在 localStorage；新壳第一次启动时搬进原生存储
async function adoptLocalData() {
  if (!isNative) return;
  const localList = (key) => {
    try {
      const raw = localStorage.getItem(`zzland:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const localReminders = localList('reminders');
  const localAnalyses = localList('analyses');
  const localKey = localStorage.getItem('zzland-secret:deepseekKey');

  try {
    if (!state.reminders.length && Array.isArray(localReminders) && localReminders.length) {
      state.reminders = localReminders;
      await writeStore('reminders', state.reminders);
    }
    if (!state.analyses.length && Array.isArray(localAnalyses) && localAnalyses.length) {
      state.analyses = localAnalyses;
      await writeStore('analyses', state.analyses);
    }
    if (!state.settings.apiKey && localKey) {
      state.settings.apiKey = localKey;
      await writeSecret('deepseekKey', localKey);
    }
  } catch {
    return; // 原生写入失败就保留本地副本，下次启动再搬
  }

  localStorage.removeItem('zzland:reminders');
  localStorage.removeItem('zzland:analyses');
  localStorage.removeItem('zzland:settings');
  localStorage.removeItem('zzland-secret:deepseekKey');
}

export async function refreshSigning() {
  state.signing = await getSigningInfo();
  await syncNotifications();
  notifyChange();
  return state.signing;
}

async function persistReminders() {
  await writeStore('reminders', state.reminders);
  await syncBadge();
  notifyChange();
}

async function persistAnalyses() {
  await writeStore('analyses', state.analyses);
  notifyChange();
}

export function addReminder({ title, due, priority = 'normal', note = '', source = 'manual' }) {
  const reminder = {
    id: uid(),
    title: title.trim(),
    due: due ? new Date(due).toISOString() : null,
    priority,
    note: note.trim(),
    source,
    done: false,
    createdAt: new Date().toISOString(),
  };
  state.reminders.unshift(reminder);
  persistReminders();
  scheduleReminderNotifications(reminder);
  return reminder;
}

export function toggleReminder(id) {
  const reminder = state.reminders.find((item) => item.id === id);
  if (!reminder) return;
  reminder.done = !reminder.done;
  persistReminders();
  if (reminder.done) cancelReminderNotifications(reminder);
  else scheduleReminderNotifications(reminder);
}

export function deleteReminder(id) {
  const reminder = state.reminders.find((item) => item.id === id);
  if (!reminder) return;
  state.reminders = state.reminders.filter((item) => item.id !== id);
  persistReminders();
  cancelReminderNotifications(reminder);
}

export function addAnalysis(text, result) {
  const entry = {
    id: uid(),
    at: new Date().toISOString(),
    text,
    result,
    chat: [],
  };
  state.analyses.unshift(entry);
  state.analyses = state.analyses.slice(0, 12);
  persistAnalyses();
  return entry;
}

export async function appendChat(id, message) {
  const entry = state.analyses.find((item) => item.id === id);
  if (!entry) return;
  entry.chat = [...(entry.chat || []), message].slice(-40);
  await persistAnalyses();
}

export function removeAnalysis(id) {
  state.analyses = state.analyses.filter((item) => item.id !== id);
  persistAnalyses();
}
export async function saveApiKey(key) {
  state.settings.apiKey = key.trim();
  await writeSecret('deepseekKey', state.settings.apiKey);
  notifyChange();
}

export async function clearAllData() {
  const ids = [
    'renew-3d',
    'renew-24h',
    'renew-12h',
    ...state.reminders.flatMap((item) => [`r-${item.id}-early`, `r-${item.id}-due`]),
  ];
  state.reminders = [];
  state.analyses = [];
  state.settings = { apiKey: '' };
  await Promise.all([
    writeStore('reminders', []),
    writeStore('analyses', []),
    writeSecret('deepseekKey', ''),
    setBadge(0),
    ...ids.map((id) => cancelNotification(id)),
  ]);
  notifyChange();
}

export function openReminders() {
  return state.reminders
    .filter((item) => !item.done)
    .sort((a, b) => {
      if (!a.due && !b.due) return 0;
      if (!a.due) return 1;
      if (!b.due) return -1;
      return new Date(a.due) - new Date(b.due);
    });
}

export function sortedReminders() {
  const rank = { high: 0, normal: 1, low: 2 };
  return [...state.reminders].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due && b.due) return new Date(a.due) - new Date(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return rank[a.priority] - rank[b.priority];
  });
}

function cancelReminderNotifications(reminder) {
  cancelNotification(`r-${reminder.id}-early`);
  cancelNotification(`r-${reminder.id}-due`);
}

async function scheduleReminderNotifications(reminder) {
  if (reminder.done || !reminder.due) return;
  const due = new Date(reminder.due);
  const now = Date.now();
  if (Number.isNaN(due.getTime())) return;

  await cancelReminderNotifications(reminder);

  if (due.getTime() > now) {
    await scheduleNotification({
      id: `r-${reminder.id}-due`,
      title: '提醒到期',
      body: reminder.title,
      at: due.toISOString(),
    });
  }

  const early = new Date(due);
  early.setDate(early.getDate() - 1);
  early.setHours(9, 0, 0, 0);
  if (early.getTime() > now && early.getTime() < due.getTime()) {
    await scheduleNotification({
      id: `r-${reminder.id}-early`,
      title: '明天截止',
      body: reminder.title,
      at: early.toISOString(),
    });
  }
}

export async function syncNotifications() {
  const now = Date.now();
  for (const reminder of state.reminders) {
    if (!reminder.done && reminder.due && new Date(reminder.due).getTime() > now) {
      await scheduleReminderNotifications(reminder);
    }
  }
  if (!state.signing?.expiresAt) return;
  const expires = new Date(state.signing.expiresAt).getTime();
  if (Number.isNaN(expires) || expires <= now) return;
  // 旧版本排的 12 小时提醒已由 24 小时替代
  cancelNotification('renew-12h');
  const marks = [
    { id: 'renew-3d', offset: 3 * 86400000, body: '还有 3 天，记得连接电脑用 Sideloadly 续签。' },
    { id: 'renew-24h', offset: 24 * 3600000, body: '不到 24 小时到期，过期后 App 将无法打开。' },
  ];
  for (const mark of marks) {
    const at = expires - mark.offset;
    if (at > now) {
      await scheduleNotification({
        id: mark.id,
        title: '自签即将到期',
        body: mark.body,
        at: new Date(at).toISOString(),
      });
    }
  }
}

// 图标角标跟着未完成数量走，关掉通知权限时系统会忽略
async function syncBadge() {
  await setBadge(state.reminders.filter((item) => !item.done).length);
}
