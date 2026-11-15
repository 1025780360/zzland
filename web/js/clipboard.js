import { isNative, nativeCall, readStore, writeStore } from './bridge.js';
import { $, toast } from './utils.js';

let navigateTo = () => {};
let changeCount = 0;
let busy = false;

export function init(options = {}) {
  navigateTo = options.navigate || navigateTo;
  $('#clip-fill').addEventListener('click', pasteAndGo);
  $('#clip-dismiss').addEventListener('click', dismiss);
  $('#paste-text').addEventListener('click', pasteAndGo);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  check();
}

// 只读 hasStrings 和 changeCount，不读内容，不会触发 iOS 的粘贴弹窗
async function check() {
  if (!isNative || busy) return;
  try {
    const info = await nativeCall('clipboard.state');
    changeCount = Number(info?.changeCount) || 0;
    if (!info?.hasStrings) {
      hide();
      return;
    }
    const seen = Number(await readStore('clipChangeCount', -1));
    if (changeCount === seen) {
      hide();
      return;
    }
    $('#clip-bar').hidden = false;
  } catch {
    hide();
  }
}

async function pasteAndGo() {
  if (busy) return;
  busy = true;
  try {
    const text = String((await readClipboard()) || '').trim();
    if (!text) {
      toast('没有读到剪贴板内容');
      return;
    }
    hide();
    remember();
    const box = $('#notice-text');
    box.value = text;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    navigateTo('analyze');
    toast('已从剪贴板填入');
  } finally {
    busy = false;
  }
}

async function readClipboard() {
  if (isNative) {
    try {
      return await nativeCall('clipboard.read');
    } catch {
      return '';
    }
  }
  try {
    return await navigator.clipboard?.readText();
  } catch {
    return '';
  }
}

function remember() {
  if (changeCount) writeStore('clipChangeCount', changeCount);
}

function dismiss() {
  hide();
  remember();
}

function hide() {
  $('#clip-bar').hidden = true;
}
