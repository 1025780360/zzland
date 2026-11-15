import {
  state,
  saveApiKey,
  clearAllData,
  refreshSigning,
} from './store.js';
import { requestNotifyPermission, isNative, signingError, getAppInfo, getScreenInfo } from './bridge.js';
import { $, fmtDateTime, toast } from './utils.js';
import { layoutInfo } from './layout.js';

const WEB_VERSION = '2026-11-15.18';
let clearArmed = false;
let nativeInfo = null;
let loadingNative = false;

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

  $('#reload-signing').addEventListener('click', async () => {
    const info = await refreshSigning();
    render();
    toast(info?.expiresAt ? '已读取签名信息' : '还是读不到，看下面的诊断');
  });

  $('#clear-data').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!clearArmed) {
      clearArmed = true;
      button.textContent = '确认清空';
      setTimeout(() => {
        clearArmed = false;
        button.textContent = '清空';
      }, 3000);
      return;
    }
    await clearAllData();
    $('#access-key').value = '';
    clearArmed = false;
    button.textContent = '清空';
    toast('已清空');
    render();
  });

  render();

  window.addEventListener('resize', renderScreenDiag);
  window.addEventListener('orientationchange', () => setTimeout(renderScreenDiag, 250));
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
      ? 'App 内没有读到签名信息，点下面的「重新读取签名」再试。'
      : '当前不是 App 内的最新安装包：原生桥没连上，重新安装最新 IPA 后生效。';
  }

  $('#bridge-diag').textContent = isNative
    ? (signingError ? `原生桥已连接 · 签名读取失败：${signingError}` : '原生桥已连接 · 签名接口正常')
    : '原生桥未连接（旧安装包或页面来自缓存）';

  renderScreenDiag();
  if (!nativeInfo && !loadingNative) {
    loadingNative = true;
    Promise.all([getAppInfo(), getScreenInfo()]).then(([info, screen]) => {
      nativeInfo = { info, screen };
      loadingNative = false;
      renderScreenDiag();
    });
  }
}

function renderScreenDiag() {
  const box = $('#screen-diag');
  if (!box) return;
  const { w, h, dpr, insets, rail } = layoutInfo();
  const side = rail === 'left' ? '左侧竖排' : rail === 'right' ? '右侧竖排' : '底部';
  const lines = [
    `视口 ${w}×${h} · ${dpr}x · 导航${side}`,
    `安全区 上${Math.round(insets.top)} 右${Math.round(insets.right)} 下${Math.round(insets.bottom)} 左${Math.round(insets.left)}`,
  ];
  const screen = nativeInfo?.screen;
  if (screen?.window && screen?.screen) {
    lines.push(`窗口 ${screen.window.join('×')} · 屏幕 ${screen.screen.join('×')}`);
  }
  const info = nativeInfo?.info;
  if (info) {
    lines.push(`安装包 ${info.version || '-'} (${info.build || '-'}) · SDK ${info.sdk || '未标记（旧包）'}`);
  }
  box.textContent = lines.join('\n');
}
