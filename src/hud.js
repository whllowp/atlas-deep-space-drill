import { formatClock, PHASES } from './sim.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(sim) {
    this.sim = sim;
    this.onAction = () => {};
    this.qpsHistory = new Array(64).fill(8200);
    this.acc = 0;
    this.lastPhase = -1;
    this.feedCount = 0;

    this.el = {
      clock: $('clock'), runState: $('runState'),
      phases: $('phases'), phaseProgress: $('phaseProgress'),
      nodeList: $('nodeList'), aliveCount: $('aliveCount'),
      qps: $('qps'), qpsUnit: document.querySelector('.hero-num span'),
      intercept: $('intercept'), latency: $('latency'), rto: $('rto'), rpo: $('rpo'),
      threatTag: $('threatTag'),
      shieldRing: $('shieldRing'), shieldPct: $('shieldPct'), shieldBar: $('shieldBar'),
      blocked: $('blocked'), score: $('score'), combo: $('combo'),
      feedList: $('feedList'), terminal: $('terminal'), subtitle: $('subtitle'),
      announce: $('announce'), aKicker: $('aKicker'), aTitle: $('aTitle'), aSub: $('aSub'),
      bossbar: $('bossbar'), bossHp: $('bossHp'), bossPct: $('bossPct'),
      objectives: $('objectives'), objProgress: $('objProgress'),
      result: $('result'), flash: $('flash'), damage: $('damage'), tint: $('tint'),
      btnStart: $('btnStart'), btnNext: $('btnNext'), hint: $('hint'),
      fps: $('fps'), camMode: $('camMode'), sound: $('btnSound'),
      rScore: $('rScore'), rCombo: $('rCombo'), rBlocked: $('rBlocked'),
      rRto: $('rRto'), rRpo: $('rRpo'), rShield: $('rShield'),
    };

    this.spark = $('spark').getContext('2d');
    this.buildNodes();
    this.bind();
    this.subTimer = 0;
    this.resultTimer = 0;

    sim.on('log', (d) => this.logLine(d));
    sim.on('feed', (d) => this.addFeed(d));
    sim.on('announce', (d) => this.announce(d));
    sim.on('subtitle', (d) => this.showSubtitle(d));
    sim.on('complete', (s) => this.showResult(s));
    sim.on('phase', (p) => this.setPhase(p));
    sim.on('pause', (p) => this.setPaused(p));
    sim.on('shieldHit', () => this.pulseDamage());
    sim.on('reset', () => this.resetView());
  }

  bind() {
    this.el.btnStart.addEventListener('click', () => this.onAction('start'));
    this.el.btnNext.addEventListener('click', () => this.onAction('pause'));
    $('btnSound').addEventListener('click', () => this.onAction('sound'));
    $('btnFull').addEventListener('click', () => this.onAction('fullscreen'));
    $('btnHud').addEventListener('click', () => this.onAction('hud'));
    $('btnReplay').addEventListener('click', () => this.onAction('restart'));
    $('btnCloseResult').addEventListener('click', () => this.hideResult());
  }

  buildNodes() {
    this.nodeRows = this.sim.state.nodes.map((n) => {
      const row = document.createElement('div');
      row.className = 'node-row';
      row.innerHTML = `
        <i class="dot"></i>
        <div class="nm"><b>${n.id}</b><em>${n.role}</em></div>
        <div class="load">
          <div class="bar"><i style="width:20%"></i></div>
          <div class="sub"><span class="loadv">20%</span><span class="latv">8ms</span></div>
        </div>
        <div class="st">ONLINE</div>`;
      this.el.nodeList.appendChild(row);
      return {
        row,
        role: row.querySelector('.nm em'),
        bar: row.querySelector('.bar i'),
        load: row.querySelector('.loadv'),
        lat: row.querySelector('.latv'),
        st: row.querySelector('.st'),
      };
    });
  }

  resetView() {
    clearTimeout(this.resultTimer);
    this.el.result.classList.remove('show');
    this.el.feedList.innerHTML = '<div class="feed-empty">暂无交战记录 · 防线待命</div>';
    this.el.terminal.innerHTML = '';
    this.el.subtitle.classList.remove('show');
    this.el.bossbar.classList.remove('show');
    this.el.announce.classList.remove('show');
    this.el.btnStart.classList.add('pulse');
    this.el.btnStart.innerHTML = '<span class="b-ico">▶</span> 启动演练 <kbd>SPACE</kbd>';
    this.el.btnNext.disabled = false;
    this.el.btnNext.innerHTML = '<span class="b-ico">Ⅱ</span> 暂停演练 <kbd>P</kbd>';
    this.lastPhase = -1;
    this.el.objectives.querySelectorAll('li').forEach((li) => li.classList.remove('active', 'done'));
    this.el.objProgress.style.width = '0%';
  }

  setPaused(p) {
    this.el.btnNext.innerHTML = p
      ? '<span class="b-ico">▶</span> 继续演练 <kbd>P</kbd>'
      : '<span class="b-ico">Ⅱ</span> 暂停演练 <kbd>P</kbd>';
  }

  setPhase(p) {
    this.lastPhase = p;
    const phaseEls = [...this.el.phases.querySelectorAll('.phase')];
    phaseEls.forEach((el) => {
      const n = Number(el.dataset.p);
      el.classList.toggle('active', n === p);
      el.classList.toggle('done', n < p);
    });
    this.el.objectives.querySelectorAll('li').forEach((li) => {
      const k = Number(li.dataset.k);
      li.classList.toggle('done', k < p || (this.sim.state.complete && k === p));
      li.classList.toggle('active', k === p);
    });
    this.el.btnStart.classList.remove('pulse');
    if (p > 0) {
      this.el.btnStart.innerHTML = p >= 3
        ? '<span class="b-ico">◎</span> 最后一击 <kbd>SPACE</kbd>'
        : '<span class="b-ico">⇥</span> 推进阶段 <kbd>SPACE</kbd>';
    }
    if (p === 3) this.el.bossbar.classList.add('show');
    else this.el.bossbar.classList.remove('show');
    this.el.tint.style.background = p === 3
      ? 'radial-gradient(120% 90% at 50% 110%, rgba(90,10,60,.28), transparent 60%), radial-gradient(80% 60% at 50% 0%, rgba(80,20,60,.16), transparent 70%)'
      : '';
  }

  update(dt) {
    const st = this.sim.state;
    const m = st.metrics;
    this.acc += dt;
    if (this.acc < 0.08) return;
    this.acc = 0;

    const p = st.phase;
    const total = st.totalT;
    this.el.clock.textContent = formatClock(total);
    this.el.runState.textContent = st.complete ? '演练完成' : st.paused ? '已暂停' : st.running ? '演练中' : '待命';
    this.el.runState.className = st.complete ? 'ok' : st.paused ? 'warn' : st.running ? 'ok' : '';

    const phase = PHASES[p];
    this.el.phaseProgress.style.width = `${phase && phase.dur ? Math.min(100, st.phaseT / phase.dur * 100) : 0}%`;

    // metrics
    this.setQps(m.qps);
    this.el.intercept.textContent = m.intercept.toFixed(2);
    this.el.latency.textContent = Math.round(m.latency);
    this.el.rto.textContent = p === 2 || p === 3 ? Math.round(m.rto) : '—';
    this.el.rpo.textContent = p === 2 || p === 3 ? (m.rpo || 0).toFixed(1) : '0';

    const threat = p === 0 ? 0 : p === 3 ? 1 : p === 2 ? 0.72 : 0.55;
    this.el.threatTag.textContent = threat === 0 ? 'LOW' : threat < 0.8 ? 'HIGH' : 'CRITICAL';
    this.el.threatTag.className = `tag ${threat === 0 ? '' : threat < 0.8 ? 'high' : 'crit'}`;

    const shield = Math.round(m.shield);
    this.el.shieldRing.style.setProperty('--p', shield);
    this.el.shieldPct.textContent = shield;
    this.el.shieldBar.style.width = `${shield}%`;
    const low = shield < 50;
    this.el.shieldRing.style.background = low
      ? `conic-gradient(var(--red) ${shield}%, rgba(255,59,78,.1) 0)`
      : `conic-gradient(var(--cyan) ${shield}%, rgba(94,242,255,.1) 0)`;
    this.el.shieldBar.style.background = low
      ? 'linear-gradient(90deg,#8a1020,var(--red))'
      : 'linear-gradient(90deg,#1f9cb5,var(--cyan))';
    this.el.blocked.textContent = m.blocked.toLocaleString('en-US');

    this.el.score.textContent = Math.round(m.score).toLocaleString('en-US');
    const combo = Math.max(1, Math.round(m.combo));
    this.el.combo.querySelector('b').textContent = `×${combo}`;
    this.el.combo.classList.toggle('hot', combo >= 5);

    // nodes
    let alive = 0;
    st.nodes.forEach((n, i) => {
      const r = this.nodeRows[i];
      const bad = n.status === 'offline';
      const warn = n.status === 'degraded' || n.load > 80;
      if (!bad) alive++;
      r.row.className = `node-row ${bad ? 'bad' : warn ? 'warn' : ''}${n.status === 'repair' ? ' repair' : ''}`;
      r.role.textContent = n.role;
      r.bar.style.width = `${bad ? 0 : Math.round(n.load)}%`;
      r.load.textContent = bad ? '--' : `${Math.round(n.load)}%`;
      r.lat.textContent = bad ? 'LOST' : `${Math.round(n.latency)}ms`;
      r.st.textContent = bad ? 'OFFLINE' : warn ? 'DEGRADED' : 'ONLINE';
    });
    this.el.aliveCount.textContent = `${alive} / 6`;

    // objectives
    this.el.objProgress.style.width = `${st.complete ? 100 : p === 3 ? Math.min(96, 66 + m.progress * 30) : p === 2 ? 66 : p === 1 ? 33 : 0}%`;

    // boss
    if (p === 3) {
      const hp = Math.max(0, m.bossHP);
      this.el.bossHp.style.width = `${hp}%`;
      this.el.bossPct.textContent = `${hp.toFixed(1)}%`;
    }

    // sparkline
    this.qpsHistory.push(m.qps);
    if (this.qpsHistory.length > 64) this.qpsHistory.shift();
    this.drawSpark(threat);

    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) this.el.subtitle.classList.remove('show');
    }
  }

  setQps(v) {
    if (v >= 1e6) {
      this.el.qps.textContent = (v / 1e6).toFixed(2);
      this.el.qpsUnit.textContent = 'M QPS';
    } else if (v >= 1000) {
      this.el.qps.textContent = (v / 1000).toFixed(1);
      this.el.qpsUnit.textContent = 'K QPS';
    } else {
      this.el.qps.textContent = Math.round(v);
      this.el.qpsUnit.textContent = 'QPS';
    }
  }

  drawSpark(threat) {
    const ctx = this.spark;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const hist = this.qpsHistory;
    ctx.clearRect(0, 0, w, h);

    const max = Math.max(12000, ...hist) * 1.12;
    const pad = 4;
    const x = (i) => (i / (hist.length - 1)) * w;
    const y = (v) => h - pad - (v / max) * (h - pad * 2 - 6);

    ctx.strokeStyle = 'rgba(94,242,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const yy = pad + (i / 3) * (h - pad * 2);
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
      ctx.stroke();
    }

    const color = threat > 0.85 ? '255,59,78' : threat > 0.6 ? '255,200,87' : '94,242,255';
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `rgba(${color},0.38)`);
    grad.addColorStop(1, `rgba(${color},0)`);
    ctx.beginPath();
    ctx.moveTo(0, h);
    hist.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    hist.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = `rgba(${color},0.95)`;
    ctx.lineWidth = 2.4;
    ctx.shadowBlur = 14;
    ctx.shadowColor = `rgba(${color},0.9)`;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const lx = x(hist.length - 1);
    const ly = y(hist[hist.length - 1]);
    ctx.beginPath();
    ctx.arc(lx - 1, ly, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${color})`;
    ctx.fill();
  }

  logLine({ time, text, kind }) {
    const ln = document.createElement('div');
    ln.className = `ln ${kind}`;
    ln.innerHTML = `<time>${time}</time><span>${text}</span>`;
    this.el.terminal.appendChild(ln);
    while (this.el.terminal.children.length > 7) this.el.terminal.removeChild(this.el.terminal.firstChild);
    this.el.terminal.scrollTop = this.el.terminal.scrollHeight;
  }

  addFeed({ html, kind, icon }) {
    this.el.feedList.querySelector('.feed-empty')?.remove();
    const item = document.createElement('div');
    item.className = `feed-item ${kind || 'kill'}`;
    item.innerHTML = `<div class="fi">${icon || '✦'}</div><p>${html}</p>`;
    this.el.feedList.prepend(item);
    while (this.el.feedList.children.length > 5) this.el.feedList.removeChild(this.el.feedList.lastChild);
    setTimeout(() => item.remove(), 11000);
  }

  announce({ kicker, title, sub, tone, dur = 4200 }) {
    const a = this.el.announce;
    this.el.aKicker.textContent = kicker;
    this.el.aTitle.textContent = title;
    this.el.aSub.textContent = sub || '';
    a.className = `announce ${tone || ''}`;
    void a.offsetWidth;
    a.classList.add('show');
    a.style.animationDuration = `${dur}ms`;
    this.flash(tone === 'good' ? 'good' : 'red');
  }

  showSubtitle({ text, dur = 3600 }) {
    this.el.subtitle.textContent = text;
    this.el.subtitle.classList.add('show');
    this.subTimer = dur / 1000;
  }

  flash(kind = 'red') {
    const f = this.el.flash;
    f.className = 'flash';
    void f.offsetWidth;
    f.classList.add(kind === 'good' ? 'fire' : 'red');
  }

  pulseDamage() {
    const d = this.el.damage;
    d.classList.add('on');
    clearTimeout(this.dmgTimer);
    this.dmgTimer = setTimeout(() => d.classList.remove('on'), 130);
  }

  setFps(v) {
    this.el.fps.textContent = Math.round(v);
  }

  setCamMode(v) {
    this.el.camMode.textContent = v;
  }

  setSound(on) {
    this.el.sound.classList.toggle('off', !on);
    this.el.sound.querySelector('span').textContent = on ? '♪' : '✕';
  }

  showResult(stats) {
    this.el.bossbar.classList.remove('show');
    this.el.subtitle.classList.remove('show');
    this.el.announce.classList.remove('show');
    this.el.rScore.textContent = Math.round(this.sim.state.metrics.score).toLocaleString('en-US');
    this.el.rCombo.textContent = `×${stats.maxCombo || 1}`;
    this.el.rBlocked.textContent = (stats.kills || 0).toLocaleString('en-US');
    this.el.rRto.textContent = `${stats.rto || 42}s`;
    this.el.rRpo.textContent = `${stats.rpo || 0}s`;
    this.el.rShield.textContent = `${stats.shield ?? 100}%`;
    this.el.objectives.querySelectorAll('li').forEach((li) => {
      li.classList.remove('active');
      li.classList.add('done');
    });
    this.el.objProgress.style.width = '100%';
    this.el.btnNext.disabled = true;
    this.el.btnNext.innerHTML = '<span class="b-ico">✓</span> 演练完成';
    this.resultTimer = setTimeout(() => this.el.result.classList.add('show'), 2200);
    this.el.feedList.innerHTML = '';
    this.el.btnStart.innerHTML = '<span class="b-ico">↻</span> 再次演练 <kbd>SPACE</kbd>';
  }

  hideResult() {
    this.el.result.classList.remove('show');
  }

  toggle() {
    document.getElementById('hud').classList.toggle('hidden');
  }
}
