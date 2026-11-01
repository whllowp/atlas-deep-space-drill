import { SyncBus } from './sync.js';

const $ = (id) => document.getElementById(id);
const PHASES = ['静默值守', '红蓝对抗', '故障注入', 'BOSS 决战'];

const bus = new SyncBus('console');
let lastState = null;
let lastAt = 0;
const nodeRows = [];

function formatClock(sec = 0) {
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function formatQps(v) {
  if (v >= 1e6) return [(v / 1e6).toFixed(2), 'M QPS'];
  if (v >= 1000) return [(v / 1000).toFixed(1), 'K QPS'];
  return [String(Math.round(v)), 'QPS'];
}

function buildNodes(nodes) {
  if (nodeRows.length) return;
  for (const n of nodes) {
    const row = document.createElement('div');
    row.className = 'c-node';
    row.innerHTML = `
      <i class="dot"></i>
      <div class="nm"><b>${n.id}</b><em></em></div>
      <div>
        <div class="bar"><i></i></div>
        <div class="lat"><span class="load">--</span><span class="ms">--</span></div>
      </div>
      <div class="st">ONLINE</div>`;
    $('cNodes').appendChild(row);
    nodeRows.push({
      row,
      role: row.querySelector('.nm em'),
      bar: row.querySelector('.bar i'),
      load: row.querySelector('.load'),
      ms: row.querySelector('.ms'),
      st: row.querySelector('.st'),
    });
  }
}

function render(st) {
  lastState = st;
  lastAt = performance.now();
  try {
  const p = st.phase | 0;
  const m = st.metrics || {};
  const complete = !!st.complete;

  $('cPhase').textContent = `P${p} · ${PHASES[p] || '未知阶段'}`;
  const stateEl = $('cState');
  if (complete) {
    stateEl.textContent = 'DRILL COMPLETE';
    stateEl.className = 'c-state';
  } else if (st.paused) {
    stateEl.textContent = 'PAUSED';
    stateEl.className = 'c-state warn';
  } else if (st.running) {
    stateEl.textContent = 'LIVE';
    stateEl.className = 'c-state';
  } else {
    stateEl.textContent = 'STANDBY';
    stateEl.className = 'c-state warn';
  }

  $('cClock').textContent = formatClock(st.totalT);
  const dur = st.duration || 30;
  $('cProgress').style.width = `${p && !complete ? Math.min(100, (st.phaseT / dur) * 100) : complete ? 100 : 0}%`;
  document.querySelectorAll('#cPhases > div').forEach((el) => {
    const n = Number(el.dataset.p);
    el.classList.toggle('active', n === p && !complete);
    el.classList.toggle('done', p > n || (complete && n <= p));
  });
  $('cTheme').textContent = st.theme === 'city' ? 'NEO-SHANGHAI · 赛博都市' : 'DEEP SPACE · 深空防线';
  $('cMode').textContent = st.cinematic ? 'CINEMATIC 2.39:1' : 'NORMAL VIEW';
  $('cSyncState').textContent = st.blackout ? 'HALL BLACKOUT' : (bus.peerAlive() ? 'SYNC LIVE' : 'SYNC WAITING');

  const [q, qu] = formatQps(m.qps || 0);
  $('cQps').textContent = q;
  $('cQps').nextElementSibling.textContent = qu;
  $('cIntercept').textContent = (m.intercept ?? 0).toFixed(2);
  $('cLatency').textContent = Math.round(m.latency || 0);
  $('cShield').textContent = Math.round(m.shield || 0);
  $('cRto').textContent = p === 2 || p === 3 ? Math.round(m.rto || 0) : '—';
  $('cRpo').textContent = (m.rpo || 0).toFixed(1);
  $('cScore').textContent = Math.round(m.score || 0).toLocaleString('en-US');
  $('cCombo').textContent = `×${Math.max(1, Math.round(m.combo || 1))}`;
  $('cBoss').textContent = p === 3 ? `${Math.max(0, m.bossHP || 0).toFixed(0)}%` : '—';
  $('cBlocked').textContent = (m.blocked || 0).toLocaleString('en-US');

  const nodes = st.nodes || [];
  buildNodes(nodes);
  let alive = 0;
  nodes.forEach((n, i) => {
    const r = nodeRows[i];
    if (!r) return;
    const bad = n.status === 'offline';
    const warn = n.status === 'degraded' || n.load > 80;
    if (!bad) alive++;
    r.row.className = `c-node ${bad ? 'bad' : warn ? 'warn' : ''}`;
    r.role.textContent = n.role;
    r.bar.style.width = `${bad ? 0 : Math.round(n.load || 0)}%`;
    r.load.textContent = bad ? '--' : `${Math.round(n.load || 0)}%`;
    r.ms.textContent = bad ? 'LOST' : `${Math.round(n.latency || 0)}ms`;
    r.st.textContent = bad ? 'OFFLINE' : warn ? 'DEGRADED' : 'ONLINE';
  });
  $('cAlive').textContent = `${alive} / ${nodes.length || 6}`;

  const logEl = $('cLog');
  const logs = st.logs || [];
  if (!logs.length) {
    logEl.innerHTML = '<div class="c-logempty">等待演练事件…</div>';
  } else {
    logEl.innerHTML = logs.map((l) => `
      <div class="c-logitem ${l.kind || 'info'}">
        <time>${l.time || '--:--:--'}</time><span></span>
      </div>`).join('');
    logEl.querySelectorAll('.c-logitem span').forEach((el, i) => {
      el.textContent = logs[i].text || '';
    });
  }

  document.querySelector('[data-cmd="cinematic"]')?.classList.toggle('active', !!st.cinematic);
  document.querySelector('[data-cmd="mute"]')?.classList.toggle('active', !!st.muted);
  document.querySelector('[data-cmd="blackout"]')?.classList.toggle('active', !!st.blackout);
  } catch (e) {
    console.error('console render failed', e);
  }
}

function tickLink() {
  const alive = bus.peerAlive();
  $('cLink').classList.toggle('off', !alive);
  $('linkText').textContent = alive ? '大厅在线 · 状态同步中' : '等待大厅连接…';
  $('cSync').textContent = alive ? `SYNC: LIVE · ${bus.mode.toUpperCase()}` : `SYNC: WAITING · ${bus.mode.toUpperCase()}`;
  $('cSyncState').textContent = lastState?.blackout ? 'HALL BLACKOUT' : alive ? 'SYNC LIVE' : 'SYNC WAITING';
}

document.querySelectorAll('[data-cmd]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd;
    if (cmd.startsWith('jump')) {
      bus.send({ type: 'cmd', action: 'jump', value: Number(cmd.slice(4)) });
    } else {
      bus.send({ type: 'cmd', action: cmd });
    }
  });
});

bus.on('state', (msg) => render(msg.state));
bus.init().then((mode) => {
  $('linkMode').textContent = mode.toUpperCase();
  bus.send({ type: 'hello' });
  tickLink();
});
setInterval(tickLink, 900);

render({
  phase: 0, running: false, paused: false, complete: false, totalT: 0, phaseT: 0,
  duration: 0, theme: 'space', cinematic: false, muted: false, blackout: false,
  metrics: { qps: 8200, intercept: 99.99, latency: 12, shield: 100, rto: 0, rpo: 0, score: 0, combo: 1, bossHP: 100, blocked: 0 },
  nodes: [
    { id: 'GW-01', role: '接入网关', load: 20, latency: 8, status: 'online' },
    { id: 'APP-02', role: '应用集群', load: 24, latency: 9, status: 'online' },
    { id: 'CACHE-03', role: '分布式缓存', load: 22, latency: 7, status: 'online' },
    { id: 'DB-04', role: '核心主库', load: 21, latency: 9, status: 'online' },
    { id: 'DB-05', role: '灾备备库', load: 18, latency: 8, status: 'online' },
    { id: 'OSS-06', role: '对象存储', load: 19, latency: 10, status: 'online' },
  ],
  logs: [],
});

window.__console = { bus, getState: () => lastState, render };
