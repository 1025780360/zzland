// 测当前页面的安全区和屏幕比例，判断是不是 iPhone Duo 外屏 / 侧边状态栏姿态
let insets = { top: 0, right: 0, bottom: 0, left: 0 };
let rail = '';

function readInsets() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none';
  probe.style.paddingTop = 'env(safe-area-inset-top)';
  probe.style.paddingRight = 'env(safe-area-inset-right)';
  probe.style.paddingBottom = 'env(safe-area-inset-bottom)';
  probe.style.paddingLeft = 'env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const value = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return value;
}

function apply() {
  insets = readInsets();
  const w = window.innerWidth;
  const h = window.innerHeight;

  // 真适配时系统会在侧边留出很宽的安全区；普通刘海机横屏只有 44~59
  let side = '';
  if (insets.right >= 64) side = 'right';
  else if (insets.left >= 64) side = 'left';

  // 兼容窗口里安全区是 0，只能按屏幕比例认出外屏（内屏明显更宽，普通手机更窄）
  if (!side && h > w) {
    const sw = Math.min(screen.width, screen.height);
    const sh = Math.max(screen.width, screen.height);
    if (sw >= 340 && sw <= 560 && sw / sh >= 0.62) side = 'right';
  }

  rail = side;
  document.body.classList.toggle('duo-rail', Boolean(side));
  document.body.classList.toggle('duo-rail-left', side === 'left');
}

export function layoutInfo() {
  return {
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: window.devicePixelRatio,
    insets,
    rail,
  };
}

export function watchLayout() {
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 200));
}

// 原生返回真实屏幕尺寸：系统把旧 SDK 的 App 放进兼容窗口时，网页看到的视口会比屏幕窄
export function applyNativeScreen(info) {
  if (rail || !info?.screen || !info?.window) return;
  const [sw, sh] = info.screen;
  const [ww] = info.window;
  if (!sw || !sh || sw >= sh || sw < 340 || sw > 560) return;
  if (sw / sh < 0.62) return;
  if (!ww || ww >= sw - 20) return;
  rail = 'right';
  document.body.classList.add('duo-rail');
}
