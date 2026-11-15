import { state, addAnalysis, addReminder, removeAnalysis } from './store.js';
import { buildMessages } from './prompt.js';
import { icons } from './icons.js';
import { $, escapeHtml, fmtDateTime, fmtDate, toast } from './utils.js';

let navigateTo = () => {};
let renderedResult = null;
const confirmTimers = new Map();

const IMPORTANCE = {
  high: { label: '高优先级', chip: 'danger' },
  medium: { label: '中优先级', chip: 'warn' },
  low: { label: '低优先级', chip: 'ok' },
};

export function init(options = {}) {
  navigateTo = options.navigate || navigateTo;
  const input = $('#notice-text');
  const syncCount = () => {
    const length = input.value.trim().length;
    $('#text-count').textContent = `${length} 字`;
    $('#clear-text').hidden = !length;
  };
  input.addEventListener('input', syncCount);
  syncCount();
  $('#clear-text').addEventListener('click', () => {
    input.value = '';
    syncCount();
  });
  $('#analyze-btn').addEventListener('click', analyze);
  $('#analyze-result').addEventListener('click', onResultClick);
  $('#history-list').addEventListener('click', onHistoryClick);
  renderHistory();
}

function onResultClick(event) {
  if (!renderedResult) return;
  const addOne = event.target.closest('[data-add-action]');
  if (addOne) {
    const action = renderedResult.actions[Number(addOne.dataset.addAction)];
    if (action) {
      addActionReminder(renderedResult, action);
      addOne.innerHTML = icons.check;
      addOne.classList.add('done');
      addOne.disabled = true;
    }
    return;
  }
  if (event.target.closest('#add-all-actions')) {
    renderedResult.actions.forEach((action) => addActionReminder(renderedResult, action));
    toast(`已加入 ${renderedResult.actions.length} 条提醒`);
    event.target.textContent = '已全部加入';
    event.target.disabled = true;
  }
}

function normalizeResult(raw) {
  const keywords = Array.isArray(raw?.keywords)
    ? raw.keywords
        .map((item) => (typeof item === 'string' ? item : item?.text))
        .filter((item) => typeof item === 'string' && item.trim())
        .slice(0, 8)
        .map((item) => item.trim().slice(0, 20))
    : [];
  const associations = Array.isArray(raw?.associations)
    ? raw.associations
        .filter((item) => item && typeof (item.note ?? item.text) === 'string')
        .slice(0, 8)
        .map((item) => ({
          keyword: String(item.keyword || '').trim().slice(0, 20),
          note: String(item.note ?? item.text).trim().slice(0, 240),
        }))
        .filter((item) => item.note)
    : [];
  const actions = Array.isArray(raw?.actions)
    ? raw.actions
        .filter((item) => item && typeof item.text === 'string' && item.text.trim())
        .slice(0, 12)
        .map((item) => ({ text: item.text.trim(), due: validDate(item.due) }))
    : [];
  const materials = Array.isArray(raw?.materials)
    ? raw.materials.filter((item) => typeof item === 'string' && item.trim()).slice(0, 12)
    : [];
  const risks = Array.isArray(raw?.risks)
    ? raw.risks.filter((item) => typeof item === 'string' && item.trim()).slice(0, 6)
    : [];
  const importance = ['high', 'medium', 'low'].includes(raw?.importance) ? raw.importance : 'medium';
  return {
    title: String(raw?.title || '学校通知').slice(0, 80),
    keywords,
    associations,
    importance,
    importance_reason: String(raw?.importance_reason || '').slice(0, 300),
    summary: String(raw?.summary || '').slice(0, 600),
    deadline: validDate(raw?.deadline),
    deadline_text: String(raw?.deadline_text || '').slice(0, 120),
    audience: String(raw?.audience || '').slice(0, 120),
    location: String(raw?.location || '').slice(0, 120),
    actions,
    materials,
    risks,
  };
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const USE_MOCK = ['127.0.0.1', 'localhost'].includes(location.hostname)
  && new URLSearchParams(location.search).has('mock');

const ANALYZE_ICON = icons.scan;

async function analyze() {
  const text = $('#notice-text').value.trim();
  if (text.length < 10) {
    toast('先把通知原文粘贴进来');
    return;
  }
  if (!state.settings.apiKey && !USE_MOCK) {
    toast('先到设置里填写 DeepSeek API Key');
    navigateTo('settings');
    return;
  }

  const button = $('#analyze-btn');
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span>分析中…';
  $('#analyze-result').innerHTML = `
    <article class="card"><div class="loading"><span class="spinner"></span>正在分析这条通知…</div></article>`;

  try {
    const raw = USE_MOCK ? await mockAnalysis() : await requestAnalysis(text);
    const result = normalizeResult(raw);
    addAnalysis(text, result);
    renderResult(result);
    renderHistory();
    toast('分析完成');
  } catch (error) {
    const message = error instanceof TypeError ? '网络不可用，检查连接后重试' : error.message;
    $('#analyze-result').innerHTML = `
      <article class="card"><p class="result-summary">${escapeHtml(message)}</p></article>`;
    toast(message);
  } finally {
    button.disabled = false;
    button.innerHTML = `${ANALYZE_ICON}开始分析`;
  }
}

async function requestAnalysis(text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${state.settings.apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: buildMessages(text),
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1500,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(errorMessage(response.status));
    const payload = await response.json().catch(() => null);
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('AI 返回内容为空，稍后再试');
    }
    return parseModelJson(content);
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('AI 响应超时，稍后再试');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(status) {
  if (status === 401 || status === 403) return 'API Key 无效，去设置里检查';
  if (status === 402) return 'DeepSeek 账户余额不足';
  if (status === 429) return '请求太频繁，稍后再试';
  if (status >= 500) return 'AI 服务暂时不可用，稍后再试';
  return `分析失败（${status}）`;
}

function parseModelJson(content) {
  const cleaned = content.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI 返回格式不对，再试一次');
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function mockAnalysis() {
  return new Promise((resolve) => {
    const due = new Date();
    due.setDate(due.getDate() + 2);
    due.setHours(17, 0, 0, 0);
    setTimeout(() => resolve({
      title: '关于提交物理实验报告的通知',
      keywords: ['大学物理实验', '实验报告', 'A302', '逾期不计', '本周五'],
      associations: [
        { keyword: '大学物理实验', note: '理工科必修实验课，报告通常计入平时成绩，电子类专业也要修。' },
        { keyword: '实验报告', note: '需要原始数据、误差分析和签字，缺一项常被退回，直接拉低课程分。' },
        { keyword: '逾期不计', note: '属于硬性扣分规则，没有补救空间，优先级高。' },
      ],
      importance: 'high',
      importance_reason: '这条对你是高优先级：两天内截止，直接影响实验课平时成绩；大学物理实验是电子类专业的必修实验环节。',
      summary: '本周五 17:00 前把实验报告交到实验楼 A302，需要附上原始数据并签字，逾期不计成绩。',
      deadline: due.toISOString(),
      deadline_text: '本周五 17:00 前',
      audience: '选修大学物理实验的学生',
      location: '实验楼 A302',
      actions: [
        { text: '整理原始实验数据并完成报告', due: null },
        { text: '打印报告并本人签字', due: null },
        { text: '交到实验楼 A302 助教处', due: due.toISOString() },
      ],
      materials: ['实验原始数据', '纸质报告', '学生证'],
      risks: ['逾期不计成绩', '缺少原始数据会被退回'],
    }), 900);
  });
}

function renderResult(result) {
  renderedResult = result;
  const level = IMPORTANCE[result.importance] || IMPORTANCE.medium;
  const actions = result.actions.map((action, index) => `
    <div class="action">
      <div class="action-text">
        ${escapeHtml(action.text)}
        ${action.due ? `<span class="tag">${escapeHtml(fmtDateTime(action.due))}</span>` : ''}
      </div>
      <button class="add-btn" type="button" data-add-action="${index}" aria-label="加入提醒">${icons.plus}</button>
    </div>`).join('');

  const meta = [
    result.deadline ? `<div class="meta-row"><b>截止</b><span>${escapeHtml(fmtDateTime(result.deadline))}${result.deadline_text ? `（原文：${escapeHtml(result.deadline_text)}）` : ''}</span></div>` : '',
    result.audience ? `<div class="meta-row"><b>对象</b><span>${escapeHtml(result.audience)}</span></div>` : '',
    result.location ? `<div class="meta-row"><b>地点</b><span>${escapeHtml(result.location)}</span></div>` : '',
  ].filter(Boolean).join('');

  const impact = result.importance_reason
    ? `<div class="impact ${level.chip}">
        <p class="impact-label">对你的影响</p>
        <p class="impact-text">${escapeHtml(result.importance_reason)}</p>
      </div>`
    : '';

  const keywords = result.keywords?.length
    ? `<div>
        <p class="field-label">关键词</p>
        <div class="tags">${result.keywords.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join('')}</div>
      </div>`
    : '';

  const associations = result.associations?.length
    ? `<div>
        <p class="field-label">关键词联想</p>
        <div class="assoc">${result.associations.map((item) => `
          <div class="assoc-row">
            ${item.keyword ? `<p class="assoc-key">${escapeHtml(item.keyword)}</p>` : ''}
            <p class="assoc-note">${escapeHtml(item.note)}</p>
          </div>`).join('')}
        </div>
      </div>`
    : '';

  $('#analyze-result').innerHTML = `
    <article class="card result">
      <div class="result-head">
        <div>
          <p class="result-kicker">按信息管理学院 · 中俄信息 262 评估</p>
          <h2 class="result-title">${escapeHtml(result.title)}</h2>
        </div>
        <span class="chip ${level.chip}">${level.label}</span>
      </div>
      ${impact}
      ${result.summary ? `<p class="result-summary">${escapeHtml(result.summary)}</p>` : ''}
      ${keywords}
      ${associations}
      ${meta ? `<div class="meta">${meta}</div>` : ''}
      ${actions ? `<div><p class="field-label">需要做的事</p>${actions}</div>` : ''}
      ${result.materials.length ? `<div><p class="field-label">准备材料</p><div class="tags">${result.materials.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join('')}</div></div>` : ''}
      ${result.risks.length ? `<div><p class="field-label">错过的影响</p>${result.risks.map((item) => `<p class="risk">${escapeHtml(item)}</p>`).join('')}</div>` : ''}
      ${result.actions.length ? `<button class="primary block-btn" id="add-all-actions" type="button">全部加入提醒（${result.actions.length}）</button>` : ''}
    </article>`;
}

function addActionReminder(result, action) {
  addReminder({
    title: action.text,
    due: action.due || result.deadline,
    priority: result.importance === 'high' ? 'high' : 'normal',
    note: `来自通知：${result.title}`,
    source: 'notice',
  });
}

export function render() {
  renderHistory();
  renderEmptyResult();
}

// 展开内屏时右栏是空的，给个占位说明，避免大片留白
function renderEmptyResult() {
  const box = $('#analyze-result');
  if (box.children.length) return;
  box.innerHTML = `
    <article class="card result-empty">
      <span class="result-empty-ico">${icons.scan}</span>
      <p class="setting-title">分析结果</p>
      <p class="muted small">粘贴一条通知，这里会给出影响、截止和待办</p>
    </article>`;
}

function renderHistory() {
  const list = $('#history-list');
  if (!state.analyses.length) {
    list.innerHTML = `
      <div class="empty">
        ${icons.inbox}
        还没有分析记录。粘贴一条通知试试。
      </div>`;
    return;
  }
  list.innerHTML = state.analyses.map((entry) => {
    const level = IMPORTANCE[entry.result?.importance] || IMPORTANCE.medium;
    const due = entry.result?.deadline ? ` · 截止 ${fmtDate(entry.result.deadline)}` : '';
    return `
      <div class="item history-item pri-${entry.result?.importance || 'medium'}" data-history="${escapeHtml(entry.id)}">
        <span class="dot ${entry.result?.importance === 'high' ? 'high' : entry.result?.importance === 'low' ? 'low' : 'normal'}"></span>
        <div class="item-main">
          <p class="item-title">${escapeHtml(entry.result?.title || '分析记录')}</p>
          <p class="item-sub"><span>${escapeHtml(level.label)}${escapeHtml(due)}</span></p>
        </div>
        <button class="del" type="button" data-redo="${escapeHtml(entry.id)}" aria-label="重新分析">${icons.scan}</button>
        <button class="del" type="button" data-del="${escapeHtml(entry.id)}" aria-label="删除记录">${icons.trash}</button>
      </div>`;
  }).join('');
}

function onHistoryClick(event) {
  const del = event.target.closest('[data-del]');
  if (del) {
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
    removeAnalysis(id);
    renderHistory();
    toast('已删除这条记录');
    return;
  }

  const redo = event.target.closest('[data-redo]');
  if (redo) {
    const entry = state.analyses.find((item) => item.id === redo.dataset.redo);
    if (!entry) return;
    const input = $('#notice-text');
    input.value = entry.text || '';
    input.dispatchEvent(new Event('input'));
    analyze();
    return;
  }

  const row = event.target.closest('[data-history]');
  if (!row) return;
  const entry = state.analyses.find((item) => item.id === row.dataset.history);
  if (!entry) return;
  renderResult(entry.result);
  $('#analyze-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
