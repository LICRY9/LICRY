/* ==========================================================
   上岸计划 · 考研任务规划
   数据全部保存在本机（localStorage），无需联网
   ========================================================== */

const KEY = 'shangan.planner.v1';
const DEFAULT_EXAM = '2027-12-18';
const WD_CN = ['日', '一', '二', '三', '四', '五', '六'];
const DEFAULT_SUBJECTS = ['政治', '英语', '数学', '专业课'];
const SUBJ_COLORS = ['#2E4A38', '#C08F35', '#6E8265', '#A8763E', '#3F5F4A'];

/* ---------- 工具函数 ---------- */
const pad = n => String(n).padStart(2, '0');
const toISO = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fromISO = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const todayISO = () => toISO(new Date());
const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const diffDays = (a, b) => Math.round((fromISO(a) - fromISO(b)) / 86400000);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);

function dayLabel(iso) {
  const d = diffDays(iso, todayISO());
  if (d === 0) return '今天';
  if (d === 1) return '明天';
  if (d === 2) return '后天';
  if (d === -1) return '昨天';
  if (d === -2) return '前天';
  const t = fromISO(iso);
  return `${t.getMonth() + 1}月${t.getDate()}日 周${WD_CN[t.getDay()]}`;
}
function fullLabel(iso) {
  const t = fromISO(iso);
  return `${t.getMonth() + 1}月${t.getDate()}日 周${WD_CN[t.getDay()]}`;
}

/* ---------- 状态 ---------- */
let state, calYear, calMonth;   // 日历游标
let draft = { kind: 'once', date: todayISO() };
let currentMenuId = null;       // 菜单当前指向的任务
let statsRange = 'week';        // 各科统计区间
let manualSid = null;           // 补录选中的科目
state = loadState();

function seedTasks() {
  const t = todayISO();
  return [
    { id: uid(), kind: 'daily', title: '英语单词 100 个', createdAt: t, archived: false, doneDates: [] },
    { id: uid(), kind: 'daily', title: '数学每日一练', createdAt: t, archived: false, doneDates: [] },
    { id: uid(), kind: 'once', title: '整理专业课第三章笔记', date: t, createdAt: t, done: false },
    { id: uid(), kind: 'once', title: '做 2023 英语一真题阅读', date: addDays(t, 1), createdAt: t, done: false }
  ];
}

function normalize(s) {
  const out = Object.assign({ examDate: DEFAULT_EXAM, tasks: [], tab: 'today', seeded: false }, s || {});
  if (!Array.isArray(out.tasks)) out.tasks = [];
  out.tasks = out.tasks.filter(t => t && typeof t.title === 'string').map(t => {
    const base = {
      id: t.id || uid(),
      kind: t.kind === 'daily' ? 'daily' : 'once',
      title: t.title,
      createdAt: t.createdAt || todayISO()
    };
    if (base.kind === 'daily') {
      return Object.assign(base, { archived: !!t.archived, doneDates: Array.isArray(t.doneDates) ? t.doneDates.slice() : [] });
    }
    return Object.assign(base, { date: t.date || todayISO(), done: !!t.done, doneAt: t.doneAt || null });
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.examDate || '')) out.examDate = DEFAULT_EXAM;

  if (Array.isArray(out.subjects)) {
    out.subjects = out.subjects.filter(x => x && x.name).map(x => ({ id: x.id || uid(), name: String(x.name).slice(0, 8) }));
  } else {
    out.subjects = DEFAULT_SUBJECTS.map(n => ({ id: uid(), name: n }));
  }

  out.sessions = Array.isArray(out.sessions)
    ? out.sessions.filter(x => x && x.sec > 0 && x.start).map(x => ({
        id: x.id || uid(),
        sid: x.sid || '',
        sname: x.sname || '',
        start: x.start,
        sec: Math.round(x.sec),
        manual: !!x.manual
      }))
    : [];

  out.running = (out.running && out.running.sid && out.running.start)
    ? { sid: out.running.sid, start: out.running.start }
    : null;

  out.viewDate = todayISO();
  if (!['today', 'plan', 'long', 'stats'].includes(out.tab)) out.tab = 'today';
  return out;
}

function loadState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  if (s === null) {
    s = normalize({ examDate: DEFAULT_EXAM, tasks: seedTasks(), tab: 'today', seeded: true });
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  const n = normalize(s);
  calYear = fromISO(n.viewDate).getFullYear();
  calMonth = fromISO(n.viewDate).getMonth();
  return n;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('保存失败，存储空间可能已满'); }
}

/* ---------- 派生数据 ---------- */
const dailyAll = () => state.tasks.filter(t => t.kind === 'daily');
const dailyActive = () => dailyAll().filter(t => !t.archived);
const dailiesFor = date => dailyActive().filter(t => t.createdAt <= date);
const oncesFor = date => state.tasks.filter(t => t.kind === 'once' && t.date === date);
const tasksFor = date => dailiesFor(date).concat(oncesFor(date));
const isDone = (t, date) => t.kind === 'once' ? !!t.done : t.doneDates.includes(date);
const findTask = id => state.tasks.find(t => t.id === id);

function toggleTask(id, date) {
  const t = findTask(id);
  if (!t) return;
  if (t.kind === 'once') {
    t.done = !t.done;
    t.doneAt = t.done ? date : null;
    if (t.done && diffDays(date, t.date) !== 0) t.date = date; // 提前/延后完成时归到当天
  } else {
    const i = t.doneDates.indexOf(date);
    if (i >= 0) t.doneDates.splice(i, 1); else t.doneDates.push(date);
  }
  save();
  render();
}

function streakOf(t) {
  const set = new Set(t.doneDates);
  let cur = set.has(todayISO()) ? todayISO() : addDays(todayISO(), -1);
  let n = 0;
  while (set.has(cur)) { n++; cur = addDays(cur, -1); }
  return n;
}

/* ---------- 渲染入口 ---------- */
function render() {
  const view = $('view');
  if (state.tab === 'today') view.innerHTML = todayView();
  else if (state.tab === 'plan') view.innerHTML = planView();
  else if (state.tab === 'stats') view.innerHTML = statsView();
  else view.innerHTML = longView();

  document.querySelectorAll('.tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === state.tab);
  });
  $('fab').classList.toggle('hide', state.tab === 'long' || state.tab === 'stats');

  const d = fromISO(todayISO());
  $('topbarDate').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${WD_CN[d.getDay()]}`;
}

/* ---------- 今天 ---------- */
function todayView() {
  const d = state.viewDate;
  const isToday = d === todayISO();
  const daily = dailiesFor(d);
  const once = oncesFor(d);
  const all = daily.concat(once);
  const doneN = all.filter(t => isDone(t, d)).length;
  const pct = all.length ? Math.round(doneN / all.length * 100) : 0;
  const left = diffDays(state.examDate, todayISO());
  const overdue = state.tasks.filter(t => t.kind === 'once' && !t.done && t.date < todayISO());

  const cd = left >= 0
    ? `<span class="cd-num">${left}</span><span class="cd-unit">天</span>`
    : `<span class="cd-num" style="font-size:26px">已结束</span>`;

  const week = (() => {
    const dow = (fromISO(d).getDay() + 6) % 7;
    const start = addDays(d, -dow);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i)).map(iso => {
      const n = oncesFor(iso).length;
      const cls = ['wd'];
      if (iso === d) cls.push('sel');
      if (iso === todayISO()) cls.push('today');
      if (n) cls.push('has-task');
      return `<button class="${cls.join(' ')}" data-act="pick" data-date="${iso}">
        <span class="wd-w">${WD_CN[fromISO(iso).getDay()]}</span>
        <span class="wd-num">${fromISO(iso).getDate()}</span>
        <span class="wd-dot"></span>
      </button>`;
    }).join('');
  })();

  const banner = (isToday && overdue.length) ? `
    <div class="banner">
      <span>有 ${overdue.length} 项任务已经过期</span>
      <button data-act="carry">顺延到今天</button>
    </div>` : '';

  return `
  <div class="fade-in">
    <div class="card countdown" data-act="exam">
      <div class="cd-left">${cd}</div>
      <div class="cd-right">
        <div class="cd-title">距离考研初试</div>
        <div class="cd-date">${state.examDate.replace(/-/g, '.')} · 点击修改</div>
      </div>
    </div>

    <div class="card progress-card">
      <div class="p-row">
        <span class="p-title">${isToday ? '今天已完成' : fullLabel(d)}</span>
        <span class="p-right">
          ${isToday ? '' : '<button class="link" data-act="backToday">回到今天</button>'}
          <span class="p-num"><b>${doneN}</b> / ${all.length}</span>
        </span>
      </div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>

    ${timerCard()}

    <div class="weekstrip">${week}</div>
    ${banner}

    <div class="sec">
      <div class="sec-head"><h3>长期任务</h3><span class="count">${daily.length}</span><span class="line"></span></div>
      <div class="list">
        ${daily.length ? daily.map(t => taskRow(t, d)).join('')
          : `<div class="empty">还没有长期任务<br>点右下角 + 新建，它每天都会自动出现</div>`}
      </div>
    </div>

    <div class="sec">
      <div class="sec-head"><h3>单次任务</h3><span class="count">${once.length}</span><span class="line"></span>
        <button class="link" data-act="addHere">+ 添加</button></div>
      <div class="list">
        ${once.length ? once.map(t => taskRow(t, d)).join('')
          : `<div class="empty">${dayLabel(d)}还没有安排<br>想到什么随时记在这里</div>`}
      </div>
    </div>
  </div>`;
}

function taskRow(t, date) {
  const done = isDone(t, date);
  let meta = '';
  let warn = false;
  if (t.kind === 'daily') {
    const s = streakOf(t);
    meta = s > 1 ? `连续 ${s} 天 · 累计 ${t.doneDates.length} 天` : `累计 ${t.doneDates.length} 天`;
  } else {
    if (t.done) meta = '已完成';
    else if (diffDays(t.date, todayISO()) < 0) { meta = `${dayLabel(t.date)} · 已过期`; warn = true; }
    else meta = `${fullLabel(t.date)}`;
  }
  return `<div class="task ${done ? 'done' : ''}" data-act="toggle" data-id="${t.id}">
    <span class="check"></span>
    <div class="t-body">
      <p class="t-title">${esc(t.title)}</p>
      <span class="t-meta ${warn ? 'warn' : ''}">${meta}</span>
    </div>
    <button class="more" data-act="menu" data-id="${t.id}" aria-label="更多">···</button>
  </div>`;
}

/* ---------- 规划 ---------- */
function planView() {
  const sel = state.viewDate;
  const first = new Date(calYear, calMonth, 1);
  const offset = (first.getDay() + 6) % 7;
  const startISO = toISO(new Date(calYear, calMonth, 1 - offset));
  const today = todayISO();

  let cells = '';
  for (let i = 0; i < 42; i++) {
    const iso = addDays(startISO, i);
    const dt = fromISO(iso);
    const inMonth = dt.getMonth() === calMonth;
    const list = oncesFor(iso);
    const dots = list.slice(0, 3).map(t => `<i class="${isDone(t, iso) ? 'all' : ''}"></i>`).join('');
    const cls = ['cal-day'];
    if (!inMonth) cls.push('out');
    if (iso === today) cls.push('today');
    if (iso === sel) cls.push('sel');
    cells += `<button class="${cls.join(' ')}" data-act="pick" data-date="${iso}">
      ${dt.getDate()}<span class="dots">${dots}</span></button>`;
  }

  const list = tasksFor(sel);
  const doneN = list.filter(t => isDone(t, sel)).length;

  return `
  <div class="fade-in">
    <div class="card cal">
      <div class="cal-head">
        <div class="cal-title">${calYear} 年 ${calMonth + 1} 月</div>
        <div class="cal-nav">
          <button data-act="cal-prev" aria-label="上个月">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
          </button>
          <button data-act="cal-next" aria-label="下个月">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
      <div class="cal-week">${['一', '二', '三', '四', '五', '六', '日'].map(w => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
    </div>

    <div class="day-panel">
      <div class="day-head">
        <h3>${fullLabel(sel)}<small>${doneN}/${list.length} 已完成</small></h3>
        <button class="link" data-act="addHere">+ 添加任务</button>
      </div>
      <div class="list">
        ${list.length ? list.map(t => taskRow(t, sel)).join('')
          : `<div class="empty">这天还没有安排<br>把想到的事先放到这天，到时候它会自动出现</div>`}
      </div>
    </div>
    <p class="hint">提示：单次任务可以分配到未来任意一天；长期任务每天都会出现，不需要重复添加。</p>
  </div>`;
}

/* ---------- 长期 ---------- */
function longView() {
  const all = dailyAll();
  const active = all.filter(t => !t.archived);
  const paused = all.filter(t => t.archived);
  const today = todayISO();
  const doneToday = active.filter(t => t.doneDates.includes(today)).length;
  const totalCheck = all.reduce((a, t) => a + t.doneDates.length, 0);

  const card = t => {
    let dots = '';
    for (let i = 6; i >= 0; i--) {
      const iso = addDays(today, -i);
      const on = t.doneDates.includes(iso);
      dots += `<i class="${on ? 'on' : ''} ${iso === today ? 'today' : ''}"></i>`;
    }
    const s = streakOf(t);
    return `<div class="card lt ${t.archived ? 'paused' : ''}" data-act="menu" data-id="${t.id}">
      <div class="lt-top">
        <p class="lt-title">${esc(t.title)}</p>
        <span class="tag ${t.archived ? 'off' : ''}">${t.archived ? '已暂停' : '每天'}</span>
      </div>
      <div class="lt-meta"><span>连续 ${s} 天</span><span>累计 ${t.doneDates.length} 天</span></div>
      <div class="week-dots">${dots}</div>
    </div>`;
  };

  return `
  <div class="fade-in">
    <div class="stat-row">
      <div class="stat"><b>${active.length}</b><span>长期任务</span></div>
      <div class="stat"><b>${doneToday}/${active.length}</b><span>今天已完成</span></div>
      <div class="stat"><b>${totalCheck}</b><span>累计打卡</span></div>
    </div>

    <div class="sec">
      <div class="sec-head"><h3>长期任务</h3><span class="count">${active.length}</span><span class="line"></span>
        <button class="link" data-act="addLong">+ 新建</button></div>
      <div class="list">
        ${active.length ? active.map(card).join('')
          : `<div class="empty">还没有长期任务<br>英语单词、每日一练这类每天都做的事放这里</div>`}
      </div>
    </div>

    ${paused.length ? `
    <div class="sec">
      <div class="sec-head"><h3>已暂停</h3><span class="count">${paused.length}</span><span class="line"></span></div>
      <div class="list">${paused.map(card).join('')}</div>
    </div>` : ''}

    <div class="sec">
      <div class="sec-head"><h3>数据</h3><span class="line"></span></div>
      <div class="list">
        <div class="task" data-act="export"><div class="t-body">
          <p class="t-title" style="color:var(--ink-2)">导出备份</p>
          <span class="t-meta">换手机或重装应用前，先复制这段数据保存</span>
        </div></div>
        <div class="task" data-act="import"><div class="t-body">
          <p class="t-title" style="color:var(--ink-2)">导入备份</p>
          <span class="t-meta">粘贴之前导出的数据，恢复任务记录</span>
        </div></div>
      </div>
    </div>
    <p class="hint">所有数据只保存在这台手机上，不会上传到任何服务器。</p>
  </div>`;
}

/* ---------- 学习计时 ---------- */
function sessionDay(s) { return toISO(new Date(s.start)); }

function fmtMin(sec) {
  if (!sec || sec < 30) return '0 分钟';
  const m = Math.round(sec / 60);
  if (m < 60) return m + ' 分钟';
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} 小时 ${r} 分` : `${h} 小时`;
}

function fmtClock(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' : '') + pad(m) + ':' + pad(s);
}

function timerCard() {
  const subjects = state.subjects;
  const todaySec = state.sessions.filter(s => sessionDay(s) === todayISO()).reduce((a, s) => a + s.sec, 0);

  if (!subjects.length) {
    return `<div class="card timer">
      <div class="timer-head"><span class="timer-label">学习计时</span></div>
      <p class="timer-hint">还没有科目，去「数据」页底部添加</p>
    </div>`;
  }

  const run = state.running;
  const cur = run ? subjects.find(s => s.id === run.sid) : null;
  const elapsed = run ? Math.floor((Date.now() - run.start) / 1000) : 0;

  const chips = subjects.map(s =>
    `<button class="chip-sub ${run && run.sid === s.id ? 'on' : ''}" data-act="startTimer" data-id="${s.id}">${esc(s.name)}</button>`
  ).join('');

  return `<div class="card timer ${run ? 'running' : ''}">
    <div class="timer-head">
      <span class="timer-label">${run ? '<span class="live-dot"></span>正在学习' : '学习计时'}</span>
      <span class="timer-today">今天 ${fmtMin(todaySec)}</span>
    </div>
    ${run ? `<div class="run-row">
      <div>
        <span class="run-sub">${esc(cur ? cur.name : '其他')}</span>
        <span class="run-clock" id="timerClock">${fmtClock(elapsed)}</span>
      </div>
      <button class="btn-stop" data-act="stopTimer">结束</button>
    </div>` : ''}
    <div class="sub-chips">${chips}</div>
    ${run || todaySec ? '' : '<p class="timer-hint">选一科开始计时，结束后自动记入数据</p>'}
  </div>`;
}
function startTimer(sid) {
  if (state.running) flushRunning();
  state.running = { sid, start: Date.now() };
  save(); render();
}

function flushRunning() {
  if (!state.running) return 0;
  const sec = Math.round((Date.now() - state.running.start) / 1000);
  const s = state.subjects.find(x => x.id === state.running.sid);
  if (sec >= 30) {
    state.sessions.push({
      id: uid(),
      sid: state.running.sid,
      sname: s ? s.name : '其他',
      start: state.running.start,
      sec
    });
  }
  state.running = null;
  return sec;
}

function stopTimer() {
  if (!state.running) return;
  const s = state.subjects.find(x => x.id === state.running.sid);
  const sec = flushRunning();
  save(); render();
  if (sec >= 30) toast(`${s ? s.name : '学习'} · ${fmtMin(sec)} 已记录`);
  else toast('不足 30 秒，没有记录');
}

/* ---------- 数据一览 ---------- */
function secByDay() {
  const m = {};
  state.sessions.forEach(s => { const d = sessionDay(s); m[d] = (m[d] || 0) + s.sec; });
  return m;
}
function weekStartISO() {
  const dow = (new Date().getDay() + 6) % 7;
  return addDays(todayISO(), -dow);
}
function sumRange(map, from, to) {
  let t = 0, cur = from, guard = 0;
  while (cur <= to && guard++ < 800) { t += map[cur] || 0; cur = addDays(cur, 1); }
  return t;
}
function subjSec(sid, from, to) {
  return state.sessions
    .filter(s => s.sid === sid && sessionDay(s) >= from && sessionDay(s) <= to)
    .reduce((a, s) => a + s.sec, 0);
}
function weekTaskStats() {
  const today = todayISO();
  const dow = (new Date().getDay() + 6) % 7;
  const ws = addDays(today, -dow);
  let checks = 0, expected = 0;
  dailyActive().forEach(t => {
    for (let i = 0; i <= dow; i++) {
      const d = addDays(ws, i);
      if (d < t.createdAt) continue;
      expected++;
      if (t.doneDates.includes(d)) checks++;
    }
  });
  const onceDone = state.tasks.filter(t => t.kind === 'once' && t.done && t.doneAt && t.doneAt >= ws && t.doneAt <= today).length;
  return { checks, expected, onceDone };
}

function statsView() {
  const today = todayISO();
  const ws = weekStartISO();
  const byDay = secByDay();
  const todaySec = byDay[today] || 0;
  const weekSec = sumRange(byDay, ws, today);
  const lastWeekSec = sumRange(byDay, addDays(ws, -7), addDays(ws, -1));
  const totalSec = state.sessions.reduce((a, s) => a + s.sec, 0);
  const avgSec = state.sessions.length ? Math.round(totalSec / state.sessions.length) : 0;

  let streak = 0, cur = byDay[today] ? today : addDays(today, -1);
  while (byDay[cur] && streak < 900) { streak++; cur = addDays(cur, -1); }

  const diff = weekSec - lastWeekSec;
  let hh = Math.floor(weekSec / 3600);
  let mm = Math.round((weekSec % 3600) / 60);
  if (mm === 60) { hh++; mm = 0; }

  /* 各科 */
  const from = statsRange === 'day' ? today : (statsRange === 'week' ? ws : '0000-00-00');
  const vals = state.subjects.map(s => subjSec(s.id, from, today));
  const maxSub = Math.max(1, ...vals);
  const rangeLabel = statsRange === 'day' ? '今日' : (statsRange === 'week' ? '本周' : '累计');

  const subjRows = state.subjects.map((s, i) => {
    const v = vals[i];
    const color = SUBJ_COLORS[i % SUBJ_COLORS.length];
    return `<div class="subj-row">
      <span class="subj-dot" style="background:${color}"></span>
      <span class="subj-name">${esc(s.name)}</span>
      <div class="subj-bar"><i style="width:${Math.round(v / maxSub * 100)}%;background:${color}"></i></div>
      <span class="subj-time">${fmtMin(v)}</span>
    </div>`;
  }).join('');

  /* 最近 14 天 */
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(addDays(today, -i));
  const dvals = days.map(d => byDay[d] || 0);
  const dmax = Math.max(1, ...dvals);
  const bars = days.map((d, i) => {
    const v = dvals[i];
    const hpx = v ? Math.max(3, Math.round(v / dmax * 84)) : 2;
    const cls = v ? (d === today ? 'today' : '') : 'zero';
    return `<i class="${cls}" style="height:${hpx}px"></i>`;
  }).join('');
  const labels = days.map(d => `<span>${fromISO(d).getDate()}</span>`).join('');

  /* 学习时段 */
  const buckets = [
    { n: '清晨', test: h => h >= 5 && h < 9 },
    { n: '上午', test: h => h >= 9 && h < 12 },
    { n: '下午', test: h => h >= 12 && h < 18 },
    { n: '晚上', test: h => h >= 18 && h < 23 },
    { n: '深夜', test: h => h >= 23 || h < 5 }
  ];
  const bsec = buckets.map(b => state.sessions
    .filter(s => b.test(new Date(s.start).getHours()))
    .reduce((a, s) => a + s.sec, 0));
  const bmax = Math.max(1, ...bsec);
  const habitRows = buckets.map((b, i) => `<div class="habit-row">
    <span class="habit-name">${b.n}</span>
    <div class="habit-bar"><i style="width:${Math.round(bsec[i] / bmax * 100)}%"></i></div>
    <span class="habit-time">${fmtMin(bsec[i])}</span>
  </div>`).join('');

  /* 科目间隔 */
  const gaps = state.subjects.map(s => {
    const last = state.sessions.filter(x => x.sid === s.id).reduce((a, x) => x.start > a ? x.start : a, 0);
    if (!last) return `<span class="gap-chip">${esc(s.name)} 未开始</span>`;
    const d = diffDays(today, toISO(new Date(last)));
    const txt = d === 0 ? '今天' : (d === 1 ? '昨天' : d + ' 天前');
    return `<span class="gap-chip ${d >= 3 ? 'warn' : ''}">${esc(s.name)} ${txt}</span>`;
  }).join('');

  const ts = weekTaskStats();
  const rate = ts.expected ? Math.round(ts.checks / ts.expected * 100) : 0;

  return `
  <div class="fade-in">
    <div class="hero">
      <div class="hero-label">本周学习时长</div>
      <div class="hero-num">${hh}<small>小时</small>${mm}<small>分</small></div>
      <div class="hero-sub">今天 ${fmtMin(todaySec)} · 累计 ${fmtMin(totalSec)}</div>
      <div class="hero-foot">
        <span>连续学习 ${streak} 天</span>
        <span>${diff >= 0 ? '比上周多' : '比上周少'} ${fmtMin(Math.abs(diff))}</span>
        ${avgSec ? `<span>平均每次 ${fmtMin(avgSec)}</span>` : ''}
      </div>
    </div>

    <div class="sec">
      <div class="sec-head">
        <h3>各科时间</h3><span class="line"></span>
        <div class="seg-sm">
          <button class="${statsRange === 'day' ? 'on' : ''}" data-act="range" data-range="day">今日</button>
          <button class="${statsRange === 'week' ? 'on' : ''}" data-act="range" data-range="week">本周</button>
          <button class="${statsRange === 'all' ? 'on' : ''}" data-act="range" data-range="all">累计</button>
        </div>
      </div>
      <div class="card subj-card">
        ${state.subjects.length ? subjRows : '<p class="timer-hint" style="margin:12px 0">还没有科目</p>'}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:6px">
        <button class="link" data-act="manual">忘了计时？补录一条</button>
      </div>
    </div>

    <div class="sec">
      <div class="card chart-card">
        <div class="chart-head">
          <span class="chart-title">最近 14 天</span>
          <span class="chart-max">最长的一天 ${fmtMin(dmax)}</span>
        </div>
        <div class="chart-bars">${bars}</div>
        <div class="chart-labels">${labels}</div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-head"><h3>学习时段</h3><span class="line"></span></div>
      <div class="card habit-card">${habitRows}</div>
    </div>

    <div class="sec">
      <div class="sec-head"><h3>科目间隔</h3><span class="line"></span></div>
      <div class="gaps">${gaps}</div>
    </div>

    <div class="sec">
      <div class="sec-head"><h3>本周任务</h3><span class="line"></span></div>
      <div class="card num-grid">
        <div class="num-item"><b>${ts.checks}</b><span>长期任务打卡</span></div>
        <div class="num-item"><b>${rate}%</b><span>打卡完成率</span></div>
        <div class="num-item"><b>${ts.onceDone}</b><span>完成单次任务</span></div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-head"><h3>设置</h3><span class="line"></span></div>
      <div class="list">
        <div class="task" data-act="subjects">
          <div class="t-body">
            <p class="t-title" style="color:var(--ink-2)">管理科目</p>
            <span class="t-meta">目前的科目：${state.subjects.map(s => esc(s.name)).join('、') || '无'}</span>
          </div>
        </div>
      </div>
    </div>
    <p class="hint">只在点「结束」时记录时长，中途退出应用不会丢，回来会接着计时。</p>
  </div>`;
}

/* ---------- 弹层 ---------- */
function openSheet(html) {
  const s = $('sheet');
  s.innerHTML = `<div class="sheet-grip"></div>${html}`;
  requestAnimationFrame(() => {
    s.classList.add('show');
    $('mask').classList.add('show');
  });
}
function closeSheet() {
  const s = $('sheet');
  s.classList.remove('show');
  $('mask').classList.remove('show');
  setTimeout(() => { if (!s.classList.contains('show')) s.innerHTML = ''; }, 300);
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1800);
}

function openAdd(date, kind) {
  draft = { kind: kind || 'once', date: date || todayISO() };
  const kindHint = () => draft.kind === 'daily'
    ? '建一次就够，每天都会自动出现在列表里，第二天不用再设置。'
    : '只出现在这一天，做完就归档，不会影响其他日子。';

  const dateZone = () => {
    if (draft.kind === 'daily') return '';
    const t = todayISO();
    return `<div class="chips">
      <button class="chip ${draft.date === t ? 'on' : ''}" data-chip="${t}">今天</button>
      <button class="chip ${draft.date === addDays(t, 1) ? 'on' : ''}" data-chip="${addDays(t, 1)}">明天</button>
      <button class="chip ${draft.date === addDays(t, 2) ? 'on' : ''}" data-chip="${addDays(t, 2)}">后天</button>
      <button class="chip ${draft.date === addDays(t, 7) ? 'on' : ''}" data-chip="${addDays(t, 7)}">下周今天</button>
    </div>
    <input type="date" class="field" id="taskDate" value="${draft.date}" style="margin-top:10px" />`;
  };

  openSheet(`
    <div class="sheet-head">新建任务</div>
    <div class="seg">
      <button data-kind="once" class="${draft.kind === 'once' ? 'on' : ''}">单次任务</button>
      <button data-kind="daily" class="${draft.kind === 'daily' ? 'on' : ''}">长期任务</button>
    </div>
    <input class="field" id="taskTitle" placeholder="要做什么？例如：英语真题阅读 2 篇" autocomplete="off" enterkeyhint="done" />
    <div id="dateZone" style="margin-top:10px">${dateZone()}</div>
    <p class="hint" id="kindHint">${kindHint()}</p>
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-close>取消</button>
      <button class="btn btn-primary" id="saveTask" disabled>添加</button>
    </div>
  `);
  setTimeout(() => { const i = $('taskTitle'); if (i) i.focus(); }, 340);
}

function saveNewTask() {
  const input = $('taskTitle');
  const title = (input && input.value || '').trim();
  if (!title) { toast('先写点什么吧'); if (input) input.focus(); return; }
  if (draft.kind === 'daily') {
    state.tasks.push({ id: uid(), kind: 'daily', title, createdAt: todayISO(), archived: false, doneDates: [] });
  } else {
    const di = $('taskDate');
    const date = di && di.value ? di.value : draft.date;
    state.tasks.push({ id: uid(), kind: 'once', title, date, createdAt: todayISO(), done: false });
    if (state.tab === 'today') state.viewDate = state.viewDate;
  }
  save();
  closeSheet();
  render();
  toast(draft.kind === 'daily' ? '长期任务已创建，明天会自动出现' : '任务已安排');
}

function openTaskMenu(id) {
  const t = findTask(id);
  if (!t) return;
  currentMenuId = id;
  openSheet(`
    <div class="sheet-head">${esc(t.title)}</div>
    <div class="menu">
      <button data-menu="rename">重命名</button>
      ${t.kind === 'once'
        ? '<button data-menu="move">调整日期</button>'
        : `<button data-menu="pause">${t.archived ? '恢复，每天出现' : '暂停，不再每天出现'}</button>`}
      <button data-menu="delete" class="danger">删除任务</button>
    </div>
    <button class="btn btn-ghost full" data-close>取消</button>
  `);
}

function openSubjects() {
  openSheet(`
    <div class="sheet-head">科目</div>
    ${state.subjects.length
      ? state.subjects.map(s => `<div class="menu-row"><span>${esc(s.name)}</span><button data-delsub="${s.id}">删除</button></div>`).join('')
      : '<p class="sheet-sub">还没有科目，先在下面添加一个</p>'}
    <input class="field" id="newSubject" placeholder="新科目，例如 专业课二" maxlength="8" style="margin-top:16px" autocomplete="off" />
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-close>关闭</button>
      <button class="btn btn-primary" id="addSubject">添加</button>
    </div>
    <p class="hint">删除科目不会删除历史学习记录。</p>
  `);
}

function openManual() {
  if (!state.subjects.length) { toast('先添加一个科目'); openSubjects(); return; }
  manualSid = state.subjects[0].id;
  openSheet(`
    <div class="sheet-head">补录学习时长</div>
    <p class="sheet-sub">忘了按「开始」时，手动补一条记录。</p>
    <div class="sub-chips" id="msChips">
      ${state.subjects.map((s, i) => `<button class="chip-sub ${i === 0 ? 'on' : ''}" data-ms="${s.id}">${esc(s.name)}</button>`).join('')}
    </div>
    <input class="field" id="msMin" type="number" inputmode="numeric" min="1" max="600" placeholder="时长（分钟），例如 45" style="margin-top:14px" />
    <input class="field" id="msDate" type="date" value="${todayISO()}" style="margin-top:10px" />
    <div class="sheet-actions">
      <button class="btn btn-ghost" data-close>取消</button>
      <button class="btn btn-primary" id="saveManual">保存</button>
    </div>
  `);
  setTimeout(() => { const i = $('msMin'); if (i) i.focus(); }, 340);
}

/* ---------- 事件 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  if (state.running) {
    const el = Math.round((Date.now() - state.running.start) / 1000);
    if (el > 36000) { state.running = null; save(); }
  }
  render();

  $('tabbar').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    if (state.tab === 'today') state.viewDate = todayISO();
    if (state.tab === 'plan') {
      const d = fromISO(state.viewDate);
      calYear = d.getFullYear(); calMonth = d.getMonth();
    }
    save();
    window.scrollTo({ top: 0 });
    render();
  });

  $('fab').addEventListener('click', () => openAdd(state.viewDate, 'once'));

  setInterval(() => {
    const el = $('timerClock');
    if (!el || !state.running) return;
    el.textContent = fmtClock(Math.floor((Date.now() - state.running.start) / 1000));
  }, 1000);

  $('view').addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;

    if (act === 'toggle') { toggleTask(el.dataset.id, state.viewDate || todayISO()); return; }
    if (act === 'menu') { openTaskMenu(el.dataset.id); return; }
    if (act === 'pick') {
      state.viewDate = el.dataset.date;
      const d = fromISO(state.viewDate);
      if (state.tab === 'plan' && (d.getMonth() !== calMonth || d.getFullYear() !== calYear)) {
        calYear = d.getFullYear(); calMonth = d.getMonth();
      }
      save(); render(); return;
    }
    if (act === 'cal-prev' || act === 'cal-next') {
      calMonth += act === 'cal-next' ? 1 : -1;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      if (calMonth > 11) { calMonth = 0; calYear++; }
      render(); return;
    }
    if (act === 'carry') {
      const overdue = state.tasks.filter(t => t.kind === 'once' && !t.done && t.date < todayISO());
      overdue.forEach(t => { t.date = todayISO(); });
      save(); render(); toast(`已顺延 ${overdue.length} 项到今天`); return;
    }
    if (act === 'addHere') { openAdd(state.viewDate, 'once'); return; }
    if (act === 'backToday') { state.viewDate = todayISO(); save(); render(); return; }
    if (act === 'startTimer') { startTimer(el.dataset.id); return; }
    if (act === 'stopTimer') { stopTimer(); return; }
    if (act === 'range') { statsRange = el.dataset.range; render(); return; }
    if (act === 'manual') { openManual(); return; }
    if (act === 'subjects') { openSubjects(); return; }
    if (act === 'addLong') { openAdd(todayISO(), 'daily'); return; }
    if (act === 'exam') {
      openSheet(`
        <div class="sheet-head">考试日期</div>
        <p class="sheet-sub">用来计算倒计时，之后可以随时改。</p>
        <input type="date" class="field" id="examDate" value="${state.examDate}" />
        <div class="sheet-actions">
          <button class="btn btn-ghost" data-close>取消</button>
          <button class="btn btn-primary" id="saveExam">保存</button>
        </div>
      `);
      return;
    }
    if (act === 'export') {
      openSheet(`
        <div class="sheet-head">导出备份</div>
        <p class="sheet-sub">复制下面这段文字，粘贴到备忘录或发给自己保存。</p>
        <textarea class="field" id="backupText" rows="8" style="font-size:11px;line-height:1.5">${esc(JSON.stringify({ examDate: state.examDate, tasks: state.tasks }))}</textarea>
        <div class="sheet-actions">
          <button class="btn btn-ghost" data-close>关闭</button>
          <button class="btn btn-primary" id="copyBackup">复制</button>
        </div>
      `);
      return;
    }
    if (act === 'import') {
      openSheet(`
        <div class="sheet-head">导入备份</div>
        <p class="sheet-sub">粘贴之前导出的数据，会覆盖当前所有任务。</p>
        <textarea class="field" id="importText" rows="6" placeholder="在这里粘贴备份内容" style="font-size:11px"></textarea>
        <div class="sheet-actions">
          <button class="btn btn-ghost" data-close>取消</button>
          <button class="btn btn-primary" id="doImport">导入</button>
        </div>
      `);
      return;
    }
  });

  $('mask').addEventListener('click', closeSheet);

  $('sheet').addEventListener('click', e => {
    if (e.target.closest('[data-close]')) { closeSheet(); return; }

    const kindBtn = e.target.closest('[data-kind]');
    if (kindBtn) {
      draft.kind = kindBtn.dataset.kind;
      document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.kind === draft.kind));
      $('dateZone').innerHTML = draft.kind === 'daily' ? '' : $('dateZone').innerHTML;
      const t = todayISO();
      if (draft.kind === 'once' && !$('taskDate')) {
        $('dateZone').innerHTML = `<div class="chips">
          <button class="chip on" data-chip="${t}">今天</button>
          <button class="chip" data-chip="${addDays(t, 1)}">明天</button>
          <button class="chip" data-chip="${addDays(t, 2)}">后天</button>
          <button class="chip" data-chip="${addDays(t, 7)}">下周今天</button>
        </div>
        <input type="date" class="field" id="taskDate" value="${draft.date}" style="margin-top:10px" />`;
      }
      $('kindHint').textContent = draft.kind === 'daily'
        ? '建一次就够，每天都会自动出现在列表里，第二天不用再设置。'
        : '只出现在这一天，做完就归档，不会影响其他日子。';
      return;
    }

    const chip = e.target.closest('[data-chip]');
    if (chip) {
      draft.date = chip.dataset.chip;
      const di = $('taskDate'); if (di) di.value = draft.date;
      document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.chip === draft.date));
      return;
    }

    if (e.target.closest('#saveTask')) { saveNewTask(); return; }
    if (e.target.closest('#saveExam')) {
      const v = $('examDate').value;
      if (v) { state.examDate = v; save(); closeSheet(); render(); toast('已更新'); }
      return;
    }
    if (e.target.closest('#copyBackup')) {
      const txt = $('backupText').value;
      navigator.clipboard && navigator.clipboard.writeText(txt)
        .then(() => toast('已复制，保存好这段文字'))
        .catch(() => { $('backupText').select(); toast('请长按选择并复制'); });
      return;
    }
    if (e.target.closest('#doImport')) {
      const raw = ($('importText').value || '').trim();
      try {
        const obj = JSON.parse(raw);
        if (!obj || !Array.isArray(obj.tasks)) throw new Error('bad');
        state = normalize(Object.assign({ tab: state.tab }, obj));
        save(); closeSheet(); render(); toast('已恢复');
      } catch (err) { toast('数据格式不对，请检查是否完整复制'); }
      return;
    }

    const ms = e.target.closest('[data-ms]');
    if (ms) {
      manualSid = ms.dataset.ms;
      document.querySelectorAll('[data-ms]').forEach(b => b.classList.toggle('on', b.dataset.ms === manualSid));
      return;
    }

    if (e.target.closest('#saveManual')) {
      const min = parseInt($('msMin').value, 10);
      const dt = $('msDate').value || todayISO();
      if (!min || min < 1 || min > 600) { toast('填 1 到 600 之间的分钟数'); return; }
      const s = state.subjects.find(x => x.id === manualSid);
      const base = fromISO(dt);
      base.setHours(12, 0, 0, 0);
      state.sessions.push({
        id: uid(), sid: manualSid, sname: s ? s.name : '其他',
        start: base.getTime(), sec: min * 60, manual: true
      });
      save(); closeSheet(); render(); toast(`已补录 ${fmtMin(min * 60)}`);
      return;
    }

    if (e.target.closest('#addSubject')) {
      const v = ($('newSubject').value || '').trim().slice(0, 8);
      if (!v) { toast('写个科目名'); return; }
      if (state.subjects.some(s => s.name === v)) { toast('已经有这个科目了'); return; }
      state.subjects.push({ id: uid(), name: v });
      save(); render(); openSubjects(); toast('已添加');
      return;
    }

    const ds = e.target.closest('[data-delsub]');
    if (ds) {
      const id = ds.dataset.delsub;
      if (state.subjects.length <= 1) { toast('至少保留一个科目'); return; }
      if (state.running && state.running.sid === id) flushRunning();
      state.subjects = state.subjects.filter(s => s.id !== id);
      save(); render(); openSubjects(); toast('已删除，历史记录保留');
      return;
    }

    const menu = e.target.closest('[data-menu]');
    if (menu) {
      const id = currentMenuId;
      const t = findTask(id);
      if (!t) return;
      const what = menu.dataset.menu;
      if (what === 'rename') {
        openSheet(`
          <div class="sheet-head">重命名</div>
          <input class="field" id="renameInput" value="${esc(t.title)}" />
          <div class="sheet-actions">
            <button class="btn btn-ghost" data-close>取消</button>
            <button class="btn btn-primary" data-rename="${t.id}">保存</button>
          </div>
        `);
        setTimeout(() => { const i = $('renameInput'); if (i) { i.focus(); i.select(); } }, 320);
      } else if (what === 'pause') {
        t.archived = !t.archived; save(); closeSheet(); render();
        toast(t.archived ? '已暂停，明天不再出现' : '已恢复');
      } else if (what === 'move') {
        openSheet(`
          <div class="sheet-head">调整日期</div>
          <p class="sheet-sub">把任务挪到另一天。</p>
          <input type="date" class="field" id="moveDate" value="${t.date}" />
          <div class="sheet-actions">
            <button class="btn btn-ghost" data-close>取消</button>
            <button class="btn btn-primary" data-move="${t.id}">保存</button>
          </div>
        `);
      } else if (what === 'delete') {
        openSheet(`
          <div class="sheet-head">删除这个任务？</div>
          <p class="sheet-sub">删除后不可恢复${t.kind === 'daily' ? '，打卡记录也会一起清空。' : '。'}</p>
          <div class="sheet-actions">
            <button class="btn btn-ghost" data-close>取消</button>
            <button class="btn btn-danger" data-del="${t.id}">删除</button>
          </div>
        `);
      }
      return;
    }

    const rn = e.target.closest('[data-rename]');
    if (rn) {
      const t = findTask(rn.dataset.rename);
      const v = ($('renameInput').value || '').trim();
      if (t && v) { t.title = v; save(); closeSheet(); render(); }
      return;
    }
    const mv = e.target.closest('[data-move]');
    if (mv) {
      const t = findTask(mv.dataset.move);
      const v = $('moveDate').value;
      if (t && v) { t.date = v; save(); closeSheet(); render(); toast('已调整到 ' + dayLabel(v)); }
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      state.tasks = state.tasks.filter(t => t.id !== del.dataset.del);
      save(); closeSheet(); render(); toast('已删除');
      return;
    }
  });

  $('sheet').addEventListener('input', e => {
    if (e.target.id === 'taskTitle' || e.target.id === 'renameInput') {
      const btn = $('saveTask');
      if (btn) btn.disabled = !e.target.value.trim();
    }
  });

  $('sheet').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'taskTitle') { e.preventDefault(); saveNewTask(); }
    if (e.target.id === 'renameInput') {
      e.preventDefault();
      const id = currentMenuId; const t = findTask(id);
      const v = e.target.value.trim();
      if (t && v) { t.title = v; save(); closeSheet(); render(); }
    }
  });
});
