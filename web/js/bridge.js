// 与 iOS 原生壳通信；在普通浏览器里自动退化为 localStorage。
const nativeHandler = window.webkit?.messageHandlers?.zzland ?? null;
const pending = new Map();
let seq = 0;

if (nativeHandler) {
  window.__zzlandReply = (message) => {
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.ok) task.resolve(message.data);
    else task.reject(new Error(message.error || '原生调用失败'));
  };
}

export const isNative = Boolean(nativeHandler);

export function nativeCall(action, payload = {}) {
  if (!nativeHandler) return Promise.reject(new Error('not-native'));
  return new Promise((resolve, reject) => {
    const id = String(++seq); // 原生按字符串解析 id，数字会被直接丢弃
    pending.set(id, { resolve, reject });
    nativeHandler.postMessage({ id, action, payload });
    setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error('原生调用超时'));
    }, 8000);
  });
}

export async function readStore(key, fallback) {
  try {
    if (isNative) {
      const raw = await nativeCall('store.get', { key });
      return raw ? JSON.parse(raw) : fallback;
    }
    const raw = localStorage.getItem(`zzland:${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeStore(key, value) {
  const raw = JSON.stringify(value);
  if (isNative) {
    await nativeCall('store.set', { key, value: raw });
    return;
  }
  localStorage.setItem(`zzland:${key}`, raw);
}

export async function removeStore(key) {
  if (isNative) {
    await nativeCall('store.remove', { key });
    return;
  }
  localStorage.removeItem(`zzland:${key}`);
}

// API Key 走系统钥匙串；浏览器预览退回 localStorage。
export async function readSecret(name, fallback) {
  try {
    if (isNative) {
      const value = await nativeCall('secure.get', { key: name });
      return value || fallback;
    }
    return localStorage.getItem(`zzland-secret:${name}`) || fallback;
  } catch {
    return fallback;
  }
}

export async function writeSecret(name, value) {
  if (isNative) {
    await nativeCall('secure.set', { key: name, value });
    return;
  }
  if (value) localStorage.setItem(`zzland-secret:${name}`, value);
  else localStorage.removeItem(`zzland-secret:${name}`);
}

export let signingError = '';

export async function getSigningInfo() {
  if (!isNative) {
    signingError = '没有原生桥';
    return null;
  }
  try {
    const info = await nativeCall('signing.info');
    signingError = info?.expiresAt ? '' : '原生返回为空';
    return info;
  } catch (error) {
    signingError = error.message || '原生调用失败';
    return null;
  }
}

export async function getNotifyStatus() {
  if (isNative) {
    try {
      return await nativeCall('notify.status');
    } catch {
      return 'unknown';
    }
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotifyPermission() {
  if (isNative) {
    try {
      return await nativeCall('notify.request');
    } catch {
      return 'error';
    }
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'error';
  }
}

export async function scheduleNotification({ id, title, body, at }) {
  if (!isNative) return { scheduled: false, reason: 'web' };
  try {
    return await nativeCall('notify.schedule', { id, title, body, at });
  } catch (error) {
    return { scheduled: false, reason: error.message };
  }
}

export async function cancelNotification(id) {
  if (!isNative) return;
  try {
    await nativeCall('notify.cancel', { id });
  } catch {
    // 忽略取消失败
  }
}

export async function getAppInfo() {
  if (!isNative) return { version: 'web' };
  try {
    return await nativeCall('app.info');
  } catch {
    return { version: 'unknown' };
  }
}

export async function getScreenInfo() {
  if (!isNative) return null;
  try {
    return await nativeCall('app.screen');
  } catch {
    return null;
  }
}
