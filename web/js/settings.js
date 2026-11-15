import {
  state,
  saveApiKey,
  clearAllData,
} from './store.js';
import { requestNotifyPermission, isNative } from './bridge.js';
import { $, fmtDateTime, toast } from './utils.js';

const WEB_VERSION = '2026-11-15.4';
let clearArmed = false;

export function init() {
  $('#access-key').value = state.settings.apiKey || '';

  $('#save-key').addEventListener('click', async () => {
    await saveApiKey($('#access-key').value);
    toast('Key 已保存');
  });

  $('#request-notify').addEventListener('click', async () => {
    const status = await requestNotifyPermission();
    state.notifyStatus = status;
    render();
    if (status === 'granted') toast('通知已开启');
    else if (status === 'denied') toast('通知被拒绝，请到系统设置里允许');
    else toast('当前环境不支持通知');
  });

  $('#reload-web').addEventListener('click', () => {
    location.replace(`${location.pathname}?v=${Date.now()}`);
  });

  $('#clear-data').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!clearArmed) {
      clearArmed = true;
      button.textContent = '再点一次确认清空';
      setTimeout(() => {
        clearArmed = false;
        button.textContent = '清空本机数据';
      }, 3000);
      return;
    }
    await clearAllData();
    $('#access-key').value = '';
    clearArmed = false;
    button.textContent = '清空本机数据';
    toast('已清空');
    render();
  });

  render();
}

export function render() {
  const status = state.notifyStatus;
  $('#notify-status').textContent = ({
    granted: '已开启',
    denied: '已拒绝',
    provisional: '静默通知',
    unknown: '未知',
    unsupported: '不支持',
    error: '读取失败',
  })[status] || status;

  $('#web-version').textContent = `${WEB_VERSION}${isNative ? '' : ' · 浏览器'}`;

  const info = state.signing;
  if (info?.expiresAt) {
    $('#settings-expiry').textContent = fmtDateTime(info.expiresAt);
    $('#settings-signing-source').textContent = info.source === 'profile'
      ? '读取自 App 内的证书文件，是真实到期时间。'
      : '没有读取到证书文件，按首次打开时间加 7 天估算。';
  } else {
    $('#settings-expiry').textContent = '未知';
    $('#settings-signing-source').textContent = isNative
      ? 'App 内没有读到证书文件，重启一次再看；仍然是「未知」就用 Sideloadly 重新签一次。'
      : '浏览器预览读不到签名信息，安装到 iPhone 后才会显示。';
  }
}
