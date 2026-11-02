import { formatClock, PHASES, TACTICS } from './sim.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(sim) {
    this.sim = sim;
    this.onAction = () => {};
    this.qpsHistory = new Array(64).fill(8200);
    this.acc = 0;
    this.lastPhase = -1;
    this.feedCount = 0;
    this.cards = {};
    this.deckTimer = 0;
    this.cautionT = 0;

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
      themeChip: $('themeChip'), btnTheme: $('btnTheme'),
      rScore: $('rScore'), rCombo: $('rCombo'), rBlocked: $('rBlocked'),
      rRto: $('rRto'), rRpo: $('rRpo'), rShield: $('rShield'),
      rCards: $('rCards'), rMvp: $('rMvp'), btnCopyReport: $('btnCopyReport'),
    };

    this.spark = $('spark').getContext('2d');
    this.radar = $('radar').getContext('2d');
    this.radarT = 0;
    this.buildNodes();
    this.buildCards();
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
    $('btnConsole').addEventListener('click', () => this.onAction('console'));
    this.el.btnTheme.addEventListener('click', () => this.onAction('theme'));
    $('btnCine').addEventListener('click', () => this.onAction('cinematic'));
    $('btnReplay').addEventListener('click', () => this.onAction('restart'));
    $('btnCloseResult').addEventListener('click', () => this.hideResult());
    this.el.btnCopyReport?.addEventListener('click', () => this.copyReport());
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

  buildCards() {
    const hand = $('cardHand');
    if (!hand) return;
    TACTICS.forEach((def, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'ops-card';
      card.dataset.id = def.id;
      card.style.setProperty('--accent', def.accent);
      card.innerHTML = `
        <div class="oc-top"><span class="oc-icon">${def.icon}</span><span class="oc-cost">${def.cost}</span></div>
        <div class="oc-name">${def.name}</div>
        <div class="oc-en">${def.en}</div>
        <div class="oc-desc">${def.desc}</div>
        <span class="oc-key">${i + 1}</span>
        <div class="oc-cd"><span></span></div>`;
      card.addEventListener('click', () => this.onAction('tactic', def.id));
      hand.appendChild(card);
      this.cards[def.id] = {
        el: card,
        cd: card.querySelector('.oc-cd'),
        cdText: card.querySelector('.oc-cd span'),
        def,
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
    this.el.btnStart.innerHTML = '<span class="b-ico">▶</span> 启动 <kbd>SPACE</kbd>';
    this.el.btnNext.disabled = false;
    this.el.btnNext.innerHTML = '<span class="b-ico">Ⅱ</span> 暂停 <kbd>P</kbd>';
    this.lastPhase = -1;
    this.setDeckLog('待命 · 启动演练后可使用处置卡', '', 0);
    this.setComms('C2 LINK · 指挥频道在线');
    const commsList = $('commsList');
    if (commsList) {
      commsList.innerHTML = '';
      this.addComms('C2 频道建立 · 指挥席已接入', 'ok');
      this.addComms('防御网格自检完成 · 等待演练授权', 'info');
    }
    this.el.objectives.querySelectorAll('li').forEach((li) => li.classList.remove('active', 'done'));
    this.el.objProgress.style.width = '0%';
    this.el.rCards.innerHTML = '';
    this.el.rMvp.textContent = 'MVP · —';
  }

  setTheme(mode) {
    const city = mode === 'city';
    this.el.themeChip.textContent = city ? 'NEO CITY' : 'DEEP SPACE';
    this.el.themeChip.title = city ? '赛博都市 · 点击切换深空防线' : '深空防线 · 点击切换赛博都市';
    this.el.btnTheme.classList.toggle('city', city);
    document.body.classList.toggle('theme-city', city);
  }

  setPaused(p) {
    this.el.btnNext.innerHTML = p
      ? '<span class="b-ico">▶</span> 继续 <kbd>P</kbd>'
      : '<span class="b-ico">Ⅱ</span> 暂停 <kbd>P</kbd>';
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
    const cClock = $('commsClock');
    if (cClock) cClock.textContent = formatClock(total);
    this.el.runState.textContent = st.complete ? '演练完成' : st.paused ? '已暂停' : st.running ? '演练中' : '待命';
    this.el.runState.className = st.complete ? 'ok' : st.paused ? 'warn' : st.running ? 'ok' : '';
    const statusLed = $('statusLed');
    if (statusLed) {
      statusLed.className = `status-led${st.paused ? ' warn' : st.running && st.phase === 3 ? ' bad' : ''}`;
    }

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

    this.updateDeck(st, dt);
    this.updateIntent(st);

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
    this.drawRadar(dt, st);

    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) this.el.subtitle.classList.remove('show');
    }
  }

  updateDeck(st, dt) {
    const energy = Math.round(st.energy ?? 100);
    const fill = $('energyFill');
    if (fill) fill.style.width = `${energy}%`;
    $('energyVal').textContent = energy;
    $('energy').classList.toggle('low', energy < 30);
    const canAct = st.running && !st.paused && !st.complete;

    for (const id in this.cards) {
      const c = this.cards[id];
      const remain = this.sim.cooldowns[id] || 0;
      const blocked = remain > 0 || energy < c.def.cost || !canAct;
      c.el.classList.toggle('disabled', blocked);
      const pct = remain > 0 ? Math.min(100, (remain / c.def.cd) * 100) : 0;
      c.cd.style.height = `${pct}%`;
      c.cdText.textContent = remain > 0 ? `${remain.toFixed(1)}s` : '';
    }

    this.cautionT -= dt;
    if (this.cautionT <= 0) {
      this.cautionT = 0.15;
      this.updateCaution(st);
    }

    if (this.deckTimer > 0) {
      this.deckTimer -= dt;
      if (this.deckTimer <= 0) {
        this.setDeckLog(canAct ? '选择一张处置卡 · 消耗 OPS 能量' : '待命 · 启动演练后可使用处置卡', '', 0);
      }
    }
  }

  updateIntent(st) {
    const defs = [
      { name: 'STANDBY', desc: '等待演练启动 · 威胁评估待机', icon: '◇', cycle: 0, tag: 'IDLE' },
      { name: 'SYN FLOOD', desc: '1.2 Tbps 混合流量 · 冲击 WAF', icon: '☣', cycle: 12, tag: 'INBOUND' },
      { name: 'DB LOCK', desc: '主库不可写 · 等待主备切换', icon: '▣', cycle: 9, tag: 'CRITICAL' },
      { name: 'OMNI BEAM', desc: '母舰充能 · 全屏轰击', icon: '☠', cycle: 6, tag: 'CHARGING' },
    ];
    const d = defs[st.phase] || defs[0];
    const panel = $('intent');
    panel.className = `panel intent p${st.phase}`;
    $('intentIcon').textContent = d.icon;
    $('intentName').textContent = d.name;
    $('intentDesc').textContent = d.desc;

    let remain = 0;
    let tag = d.tag;
    if (st.complete) {
      tag = 'COMPLETE';
    } else if (!st.running) {
      tag = 'IDLE';
    } else if (st.paused) {
      tag = 'HOLD';
    } else if (d.cycle) {
      remain = Math.max(0, d.cycle - (st.phaseT % d.cycle));
    }
    $('intentTag').textContent = tag;
    $('intentT').textContent = remain > 0 ? remain.toFixed(1) : '--';
    $('intentBar').style.width = d.cycle && remain > 0 ? `${(remain / d.cycle) * 100}%` : '0%';
  }

  updateCaution(st) {
    const shield = st.metrics.shield;
    const map = {
      net: st.phase === 1 ? 'crit' : st.threat > 0.85 ? 'on' : '',
      db: st.phase === 2 ? 'crit' : '',
      pwr: shield < 50 ? 'crit' : shield < 72 ? 'on' : '',
      atk: st.phase === 3 ? 'crit' : '',
    };
    let warn = false;
    document.querySelectorAll('#caution [data-lamp]').forEach((el) => {
      const state = map[el.dataset.lamp] || '';
      el.className = state;
      if (state) warn = true;
    });
    $('caution').classList.toggle('warn', warn);

    const c2 = $('c2Status');
    if (c2) {
      c2.textContent = st.complete ? 'END' : st.phase === 3 ? 'ALERT' : st.running ? 'LINK' : 'IDLE';
      c2.classList.toggle('alert', st.phase === 3 || shield < 45);
    }
  }

  setDeckLog(text, kind = '', dur = 0) {
    const el = $('deckLog');
    if (!el) return;
    el.textContent = text;
    el.className = `deck-log ${kind}`;
    this.deckTimer = dur;
  }

  setComms(text) {
    const el = $('commsText');
    if (el) el.textContent = text;
  }

  addComms(text, kind = 'info') {
    const list = $('commsList');
    if (!list) return;
    const el = document.createElement('div');
    el.className = `comms-msg ${kind} new`;
    const time = document.createElement('time');
    time.textContent = formatClock(this.sim.state.totalT);
    const body = document.createElement('span');
    el.append(time, body);
    list.appendChild(el);
    while (list.children.length > 4) list.removeChild(list.firstChild);

    let i = 0;
    const timer = setInterval(() => {
      body.textContent = text.slice(0, ++i);
      if (i >= text.length) {
        clearInterval(timer);
        el.classList.remove('new');
      }
    }, 12);
  }

  tacticFeedback(tactic) {
    this.setDeckLog(`已执行「${tactic.name}」 · ${tactic.desc}`, 'ok', 2.8);
    this.setComms(`C2 · ${tactic.name} 已执行，等待效果确认`);
    this.addComms(`你执行「${tactic.name}」 · ${tactic.desc}`, 'ok');
    const c = this.cards[tactic.id];
    if (c) {
      c.el.classList.remove('playing');
      void c.el.offsetWidth;
      c.el.classList.add('playing');
      setTimeout(() => c.el.classList.remove('playing'), 520);
    }
    this.flash('good');
  }

  tacticDenied(reason, id) {
    const messages = {
      idle: '演练未开始', cooldown: '处置冷却中', energy: 'OPS 能量不足', unknown: '未知处置',
    };
    this.setDeckLog(`无法执行 · ${messages[reason] || '条件不满足'}`, 'warn', 1.8);
    const c = this.cards[id];
    if (c) {
      c.el.classList.remove('denied');
      void c.el.offsetWidth;
      c.el.classList.add('denied');
      setTimeout(() => c.el.classList.remove('denied'), 340);
    }
  }

  setQps(v) {    if (v >= 1e6) {
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

  drawSpark(threat) {    const ctx = this.spark;
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

  drawRadar(dt, st) {
    const ctx = this.radar;
    if (!ctx) return;
    this.radarT += dt;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = w * 0.44;
    const TAU = Math.PI * 2;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(4, 18, 26, 0.82)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();

    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.strokeStyle = `rgba(94, 242, 255, ${0.3 - i * 0.04})`;
      ctx.beginPath();
      ctx.arc(cx, cy, (r * i) / 3, 0, TAU);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(94, 242, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(94, 242, 255, 0.22)';
    ctx.beginPath();
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
    ctx.stroke();

    const a = this.radarT * 1.05 - Math.PI / 2;
    const grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    grad.addColorStop(0, 'rgba(94, 242, 255, 0.5)');
    grad.addColorStop(1, 'rgba(94, 242, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a - 0.55, a);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(94, 242, 255, 0.95)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();

    st.nodes.forEach((n, i) => {
      const ang = (i / 6) * TAU + 0.35;
      const rr = r * (0.3 + 0.55 * Math.min(1, n.load / 100));
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr;
      const bad = n.status === 'offline';
      const warn = n.status === 'degraded' || n.load > 80;
      ctx.fillStyle = bad ? '#ff3b4e' : warn ? '#ffc857' : '#57ffb0';
      ctx.shadowBlur = 12;
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(x, y, bad ? 5 : 4, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    const hostiles = st.phase === 1 ? 6 : st.phase === 3 ? 9 : st.phase === 2 ? 4 : 0;
    for (let i = 0; i < hostiles; i++) {
      const ang = -this.radarT * 0.28 + (i / hostiles) * TAU + 0.7;
      const rr = r * (0.78 + 0.12 * Math.sin(this.radarT * 0.9 + i));
      ctx.fillStyle = 'rgba(255, 59, 78, 0.95)';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ff3b4e';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, 3.2, 0, TAU);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#dffbff';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.6, 0, TAU);
    ctx.fill();

    const count = $('radarCount');
    if (count) count.textContent = hostiles;
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
    this.setComms(`C2 · ${title}${sub ? ` · ${sub}` : ''}`);
    this.addComms(`${title}${sub ? ` · ${sub}` : ''}`, tone === 'good' ? 'ok' : 'warn');
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
    this.setComms('C2 · 演练结束，战报已生成');
    this.addComms('演练结束 · 战报生成，等待复盘', 'ok');
    this.el.rScore.textContent = '0';
    const targetScore = Math.round(this.sim.state.metrics.score);
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - k, 3);
      this.el.rScore.textContent = Math.round(targetScore * eased).toLocaleString('en-US');
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    this.el.rCombo.textContent = `×${stats.maxCombo || 1}`;
    this.el.rBlocked.textContent = (stats.kills || 0).toLocaleString('en-US');
    this.el.rRto.textContent = `${stats.rto || 42}s`;
    this.el.rRpo.textContent = `${stats.rpo || 0}s`;
    this.el.rShield.textContent = `${stats.shield ?? 100}%`;

    const seq = stats.tacticLog || [];
    this.el.rCards.innerHTML = seq.length
      ? seq.map((t) => `<div class="r-chip" style="--accent:${t.accent}"><i>${t.icon}</i><b>${t.name}</b><time>${formatClock(t.t)}</time></div>`).join('')
      : '<span class="r-empty">未使用处置卡 · 全自动防御</span>';
    const counts = {};
    seq.forEach((t) => { counts[t.name] = (counts[t.name] || 0) + 1; });
    const mvp = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    this.el.rMvp.textContent = mvp ? `MVP · ${mvp[0]} ×${mvp[1]}` : 'MVP · 未出牌';
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

  copyReport() {
    const st = this.sim.state;
    const seq = (st.stats.tacticLog || []).map((t) => t.name).join(' → ') || '未出牌';
    const text = [
      'ATLAS // DRILL-2077 演练战报',
      `结果：S 级 · 防区守住`,
      `总积分：${Math.round(st.metrics.score).toLocaleString('en-US')}`,
      `最高连击：×${st.stats.maxCombo || 1}`,
      `拦截攻击：${(st.stats.kills || 0).toLocaleString('en-US')}`,
      `RTO / RPO：${st.stats.rto || 42}s / ${st.stats.rpo || 0}s`,
      `护盾剩余：${st.stats.shield ?? 100}%`,
      `处置序列：${seq}`,
      `生成时间：${new Date().toLocaleString('zh-CN')}`,
    ].join('\n');

    const done = () => {
      this.setDeckLog('战报已复制到剪贴板', 'ok', 2.2);
      const btn = this.el.btnCopyReport;
      if (btn) {
        btn.textContent = '已复制 ✓';
        setTimeout(() => { btn.textContent = '复制战报'; }, 1600);
      }
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text, done));
    } else {
      this.fallbackCopy(text, done);
    }
  }

  fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    done();
  }

  toggle() {
    document.getElementById('hud').classList.toggle('hidden');
  }
}
