import { NODES } from './world.js';

export const PHASES = [
  { no: 'P0', name: '静默值守', sub: 'STANDBY', dur: 0 },
  { no: 'P1', name: '红蓝对抗', sub: 'DDoS 洪峰', dur: 34 },
  { no: 'P2', name: '故障注入', sub: '核心库宕机', dur: 30 },
  { no: 'P3', name: 'BOSS 决战', sub: 'APT 总攻', dur: 42 },
];

export const TACTICS = [
  {
    id: 'waf', name: 'WAF 限流', en: 'RATE LIMIT', icon: '⛨', cost: 20, cd: 7, accent: '#5ef2ff',
    desc: '拦截洪峰 · 威胁 -12%',
  },
  {
    id: 'scale', name: '弹性扩容', en: 'AUTO SCALE', icon: '⚡', cost: 25, cd: 11, accent: '#57ffb0',
    desc: '节点负载 -18% · 延迟 -2ms',
  },
  {
    id: 'failover', name: '主备切换', en: 'FAILOVER', icon: '⇄', cost: 35, cd: 16, accent: '#ffc857',
    desc: '护盾 +8% · RTO -6s',
  },
  {
    id: 'block', name: '封禁 IP', en: 'BLACKHOLE', icon: '⊘', cost: 15, cd: 6, accent: '#ff2e88',
    desc: '清场 · 护盾 +3% · 积分 +900',
  },
  {
    id: 'rollback', name: '回滚版本', en: 'ROLLBACK', icon: '↺', cost: 30, cd: 15, accent: '#9a6bff',
    desc: '威胁 -35% · 延迟 -8ms',
  },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (cur, target, rate, dt) => cur + (target - cur) * Math.min(1, rate * dt);

export class Sim {
  constructor() {
    this.listeners = {};
    this.reset();
  }

  on(evt, cb) {
    (this.listeners[evt] ||= []).push(cb);
    return this;
  }

  emit(evt, data) {
    for (const cb of this.listeners[evt] || []) cb(data);
  }

  reset() {
    this.state = {
      phase: 0,
      running: false,
      paused: false,
      auto: true,
      complete: false,
      phaseT: 0,
      totalT: 0,
      failT: -1,
      victoryT: -1,
      threat: 0,
      energy: 100,
      energyMax: 100,
      nodes: NODES.map((n) => ({
        id: n.id, role: n.role, load: 18 + Math.random() * 14,
        latency: 6 + Math.random() * 6, status: 'online', health: 1,
      })),
      metrics: {
        qps: 8200, intercept: 99.99, latency: 12, rto: 0, rpo: 0,
        shield: 100, blocked: 0, leaked: 0, score: 0, combo: 1, maxCombo: 1,
        bossHP: 100, bossMax: 100, progress: 0, failover: 0,
      },
      stats: { kills: 0, maxCombo: 1, rto: 0, rpo: 0, shield: 100 },
    };
    this.beats = new Set();
    this.cooldowns = {};
    this.lastKillAt = 0;
    this.comboTimer = 0;
    this.feedTimer = 0;
    this.passiveT = 0;
    this.qpsNoise = 0;
    this.delayNoise = 0;
    this.alertState = false;
    this.logSeq = 0;
  }

  /* ------------------------------------------------------------ lifecycle */
  start() {
    if (this.state.running && !this.state.complete) return;
    if (this.state.complete) this.restart();
    this.state.running = true;
    this.state.paused = false;
    if (this.state.phase === 0) {
      this.setPhase(1);
    } else {
      this.emit('started');
    }
  }

  restart() {
    this.reset();
    this.emit('reset');
    this.state.running = true;
    this.state.paused = false;
    this.setPhase(1);
  }

  togglePause() {
    if (this.state.complete) return;
    this.state.paused = !this.state.paused;
    this.emit('pause', this.state.paused);
  }

  setAuto(v) {
    this.state.auto = v;
  }

  setPhase(p) {
    const st = this.state;
    st.phase = p;
    st.phaseT = 0;
    st.running = true;
    st.paused = false;
    this.beats.clear();
    this.passiveT = 0;
    this.logSeq = 0;
    this.emit('phase', p);
    if (p === 1) {
      this.emit('announce', {
        kicker: 'P1 · RED TEAM STRIKE', title: 'DDoS 洪峰来袭',
        sub: '1.2 Tbps / 240K QPS · 全节点进入防御姿态', tone: 'danger', dur: 4200,
      });
      this.log('防御协议 DEFCON-2 已启动，WAF 集群进入自动扩缩容', 'warn');
      this.subtitle('红队释放混合流量，护盾开始承压');
      this.emit('alarm', true);
      this.emit('camera', 'wide');
    } else if (p === 2) {
      this.emit('announce', {
        kicker: 'P2 · CHAOS ENGINEERING', title: '故障注入：核心库宕机',
        sub: 'DB-04 心跳丢失 · 业务写入中断', tone: 'danger', dur: 4200,
      });
      this.emit('alarm', true);
      this.emit('camera', 'db');
    } else if (p === 3) {
      this.emit('announce', {
        kicker: 'FINAL PHASE · ALL HANDS', title: 'APT 母舰「黑潮」跃迁',
        sub: '红队总攻 · 全节点火力全开', tone: 'danger', dur: 4600,
      });
      this.emit('alarm', true);
      this.emit('camera', 'boss');
      this.emit('boss', true);
    }
  }

  next() {
    if (this.state.complete) {
      this.restart();
      return;
    }
    if (this.state.phase < 3) {
      this.setPhase(this.state.phase + 1);
    } else {
      this.finish();
    }
  }

  finish() {
    if (this.state.complete) return;
    const st = this.state;
    st.complete = true;
    st.running = false;
    st.victoryT = 0;
    st.stats.kills = st.metrics.blocked;
    st.stats.maxCombo = st.metrics.maxCombo;
    st.stats.rto = st.metrics.rto;
    st.stats.rpo = st.metrics.rpo;
    st.stats.shield = Math.round(st.metrics.shield);
    this.emit('alarm', false);
    this.emit('complete', st.stats);
  }

  /* ------------------------------------------------------------- utilities */
  log(text, kind = 'info') {
    const st = this.state;
    const t = st.totalT;
    this.emit('log', {
      time: formatClock(t), text, kind,
    });
  }

  subtitle(text, dur = 3600) {
    this.emit('subtitle', { text, dur });
  }

  feed(html, kind = 'kill', icon = '✦') {
    this.emit('feed', { html, kind, icon });
  }

  /* -------------------------------------------------------------- gameplay */
  addKill(points = 100) {
    const st = this.state;
    const m = st.metrics;
    m.combo = this.comboTimer > 0 ? Math.min(50, m.combo + 1) : 1;
    this.comboTimer = 1.75;
    m.maxCombo = Math.max(m.maxCombo, m.combo);
    m.score += Math.round(points * (1 + Math.min(m.combo, 30) * 0.08));
    m.blocked += 1;
    this.lastKillAt = st.totalT;

    if (st.phase === 3 && m.bossHP > 0) {
      m.bossHP = clamp(m.bossHP - 0.2, 0, m.bossMax);
      this.emit('bossDamage', 0.2);
    }

    if (st.totalT - this.feedTimer > 0.75) {
      this.feedTimer = st.totalT;
      const templates = [
        `<b>SHIELD-01</b> 拦截 <em>DDoS 数据包</em> +<i>${(60 + Math.random() * 180) | 0}</i>`,
        `<b>DEF-${String(2 + (Math.random() * 5 | 0)).padStart(2, '0')}</b> 激光炮塔击落 <em>恶意节点</em>`,
        `<b>WAF</b> 阻断 <em>SQL 注入</em> ×<i>${(80 + Math.random() * 900) | 0}</i>`,
        `<b>AGENT-07</b> 清除 <em>木马载荷</em> +<i>${(120 + Math.random() * 240) | 0}</i>`,
        `<b>EDR</b> 隔离 <em>失陷容器</em> <i>pod-${(Math.random() * 900 + 100) | 0}</i>`,
        `<b>GW-01</b> 限流命中 <em>SYN Flood</em> ×<i>${(20 + Math.random() * 80) | 0}k</i>`,
      ];
      this.feed(templates[(Math.random() * templates.length) | 0]);
    }

    if (m.combo > 0 && m.combo % 25 === 0) {
      this.feed(`<b>COMBO ×${m.combo}</b> 防线火力全开 <i>+${m.combo * 40}</i>`, 'warn', '⚡');
      this.emit('combo', m.combo);
    }
  }

  shieldHit(power = 1) {
    const m = this.state.metrics;
    m.shield = clamp(m.shield - power * 0.16, 0, 100);
    m.leaked += 1;
    this.emit('shieldHit', power);
    if (m.shield < 45 && !this.beats.has('shieldLow')) {
      this.beats.add('shieldLow');
      this.log(`护盾完整度降至 ${Math.round(m.shield)}% · 建议启用备用能量回路`, 'bad');
    }
  }

  healShield(v) {
    const m = this.state.metrics;
    m.shield = clamp(m.shield + v, 0, 100);
  }

  /* --------------------------------------------------------------- tactics */
  tickTactics(dt) {
    const st = this.state;
    const regen = st.running && !st.paused ? 7 : 2.5;
    st.energy = clamp((st.energy ?? 100) + regen * dt, 0, st.energyMax || 100);
    for (const id in this.cooldowns) {
      this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    }
  }

  playTactic(id) {
    const st = this.state;
    const tactic = TACTICS.find((t) => t.id === id);
    if (!tactic) return { ok: false, reason: 'unknown' };
    if (!st.running || st.paused || st.complete) return { ok: false, reason: 'idle', tactic };
    if ((this.cooldowns[id] || 0) > 0) return { ok: false, reason: 'cooldown', tactic };
    if ((st.energy ?? 0) < tactic.cost) return { ok: false, reason: 'energy', tactic };

    const m = st.metrics;
    st.energy -= tactic.cost;
    this.cooldowns[id] = tactic.cd;
    m.combo = Math.min(50, m.combo + 2);
    m.maxCombo = Math.max(m.maxCombo, m.combo);
    this.comboTimer = 2.4;

    if (id === 'waf') {
      m.intercept = Math.min(99.995, m.intercept + 0.02);
      m.blocked += 120;
      m.score += 1200;
      this.healShield(2);
      st.threat = Math.max(0.2, st.threat - 0.12);
    } else if (id === 'scale') {
      st.nodes.forEach((n) => {
        if (n.status === 'offline') return;
        n.load = Math.max(12, n.load - 18);
        n.latency = Math.max(4, n.latency - 2);
      });
      m.score += 1500;
    } else if (id === 'failover') {
      this.healShield(8);
      m.rto = Math.max(0, m.rto - 6);
      m.score += 1800;
      m.failover += 1;
      st.nodes[4].status = 'online';
    } else if (id === 'block') {
      m.blocked += 90;
      m.score += 900;
      this.healShield(3);
    } else if (id === 'rollback') {
      st.threat = Math.max(0.2, st.threat - 0.35);
      m.latency = Math.max(6, m.latency - 8);
      this.healShield(5);
      m.score += 2000;
    }

    this.log(`执行处置卡「${tactic.name}」· ${tactic.desc}`, 'ok');
    this.emit('tactic', { id, tactic });
    return { ok: true, tactic };
  }

  /* ---------------------------------------------------------------- update */
  update(dt) {
    const st = this.state;
    this.tickTactics(dt);
    if (!st.running || st.paused || st.complete) {
      this.updateIdle(dt);
      return;
    }
    st.phaseT += dt;
    st.totalT += dt;
    this.comboTimer = Math.max(0, this.comboTimer - dt);

    this.updateMetrics(dt);
    this.runTimeline();

    if (st.phase === 3 && st.metrics.bossHP <= 0) {
      this.finish();
      return;
    }
    if (st.phase > 0 && st.phaseT > PHASES[st.phase].dur) {
      this.emit('phaseEnd', st.phase);
      if (st.auto) {
        if (st.phase < 3) this.setPhase(st.phase + 1);
        else this.finish();
      }
    }
  }

  updateIdle(dt) {
    const st = this.state;
    if (st.complete) return;
    st.totalT += dt;
    const m = st.metrics;
    m.qps = approach(m.qps, 8200, 0.5, dt);
    this.qpsNoise = Math.sin(st.totalT * 0.7) * 260;
    m.latency = approach(m.latency, 12, 0.6, dt);
    m.intercept = approach(m.intercept, 99.99, 0.2, dt);
    m.shield = approach(m.shield, 100, 0.1, dt);
    st.nodes.forEach((n, i) => {
      n.load = approach(n.load, 18 + ((i * 7) % 17), 0.4, dt);
      n.latency = approach(n.latency, 7 + ((i * 3) % 6), 0.4, dt);
    });
  }

  updateMetrics(dt) {
    const st = this.state;
    const m = st.metrics;
    const p = st.phase;
    this.qpsNoise += (Math.random() - 0.5) * 900 * dt;
    this.qpsNoise = clamp(this.qpsNoise, -2600, 2600);
    this.delayNoise += (Math.random() - 0.5) * 30 * dt;
    this.delayNoise = clamp(this.delayNoise, -14, 18);

    let qpsTarget = 8200;
    let latTarget = 12;
    let shieldDrain = 0;
    let nodeLoad = 24;
    let nodeLat = 8;

    if (p === 1) {
      qpsTarget = 86000 + Math.min(st.phaseT, 20) * 5200;
      latTarget = 22 + Math.sin(st.phaseT * 0.4) * 5;
      nodeLoad = 62 + Math.sin(st.phaseT * 0.8) * 9;
      nodeLat = 18;
      shieldDrain = 0.55;
      st.threat = 0.55;
    } else if (p === 2) {
      const recovering = st.phaseT > 14;
      qpsTarget = recovering ? 54000 : 26000;
      latTarget = st.phaseT < 14 ? 380 - st.phaseT * 12 : 34;
      nodeLoad = st.phaseT < 14 ? 76 : 48;
      nodeLat = st.phaseT < 14 ? 120 : 26;
      shieldDrain = 0.06;
      st.threat = 0.72;
    } else if (p === 3) {
      qpsTarget = 220000 + Math.sin(st.phaseT * 0.5) * 18000;
      latTarget = 38 + Math.sin(st.phaseT * 0.7) * 8;
      nodeLoad = 84 + Math.sin(st.phaseT * 0.9) * 8;
      nodeLat = 28;
      shieldDrain = 0.35;
      st.threat = 1;
    }

    m.qps = approach(m.qps, qpsTarget + this.qpsNoise, 1.2, dt);
    m.latency = approach(m.latency, Math.max(4, latTarget + this.delayNoise), 1.4, dt);
    m.shield = clamp(m.shield - shieldDrain * dt, 0, 100);
    const regen = p === 1 ? 1.25 : p === 2 ? 0.55 : p === 3 ? 0.5 : 0.1;
    m.shield = clamp(m.shield + regen * dt, 0, 100);
    if (p === 1) m.intercept = approach(m.intercept, 99.97, 0.8, dt);
    else if (p === 2) m.intercept = approach(m.intercept, 99.91, 0.5, dt);
    else if (p === 3) m.intercept = approach(m.intercept, 99.86, 0.5, dt);

    if (m.comboTimer <= 0) {
      m.combo = approach(m.combo, 1, 3, dt);
      if (m.combo < 1.05) m.combo = 1;
    }

    // node loads
    const off = p === 2 ? 3 : -1;
    st.nodes.forEach((n, i) => {
      if (n.status === 'offline') {
        n.load = approach(n.load, 0, 4, dt);
        n.latency = 0;
        return;
      }
      let target = nodeLoad + ((i * 11) % 17) - 8;
      if (p === 2 && i === 4) target = 88; // standby takes over
      if (p === 1 && i === 0) target = 79;
      n.load = approach(n.load, clamp(target, 6, 99), 1.2, dt);
      n.latency = approach(n.latency, nodeLat + ((i * 5) % 12), 1.2, dt);
    });

    if (p === 2) {
      m.failover = clamp((st.phaseT - 4) / 11, 0, 1);
      if (st.phaseT < 4) m.rto = st.phaseT;
      else if (st.phaseT < 15) m.rto = st.phaseT;
      else m.rto = 42;
      m.progress = m.failover;
    } else if (p === 3) {
      m.progress = 1 - m.bossHP / m.bossMax;
      m.rto = 42;
    } else {
      m.progress = p === 1 ? clamp(st.phaseT / PHASES[1].dur, 0, 1) : 0;
      m.rto = 0;
    }

    if (p === 3) {
      m.bossHP = clamp(m.bossHP - 0.5 * dt, 0, m.bossMax);
    }
  }

  runTimeline() {
    const st = this.state;
    const t = st.phaseT;
    const beat = (key) => {
      if (this.beats.has(key)) return false;
      this.beats.add(key);
      return true;
    };

    if (st.phase === 1) {
      if (t > 5 && beat('p1-login')) this.log('WAF 集群自动扩容 40 → 120 节点', 'ok');
      if (t > 9 && beat('p1-beat1')) {
        this.subtitle('红队改用加密 CC 攻击，单 IP 峰值 4.2K QPS');
        this.feed(`<b>RADAR</b> 发现 <em>僵尸网络</em> 3 个 C 段 · 自动封禁`, 'warn', '☣');
      }
      if (t > 15 && beat('p1-limit')) this.log('GW-01 触发令牌桶限流 rate=8000/s，丢弃 12.4% 恶意流量', 'warn');
      if (t > 20 && beat('p1-beat2')) this.subtitle('护盾承压 78%，防守方保持零业务中断');
      if (t > 24 && beat('p1-score')) {
        this.emit('announce', {
          kicker: 'DEFENSE HOLDING', title: '洪峰已被压制',
          sub: '拦截率 99.97% · 核心业务零中断', tone: 'good', dur: 3600,
        });
      }
      if (t > 31 && beat('p1-end')) this.log('红队第一波次撤退，进入故障注入阶段', 'ok');
    }

    if (st.phase === 2) {
      if (t > 1.1 && beat('p2-fault')) {
        st.nodes[3].status = 'offline';
        st.nodes[3].health = 0;
        st.nodes[3].latency = 0;
        st.metrics.shield = Math.max(58, st.metrics.shield - 6);
        this.emit('fault', 3);
        this.log('DB-04 心跳丢失 · 主库离线，业务写入中断', 'bad');
        this.feed(`<b>DB-04</b> <em>CRITICAL</em> 主库失联 · 写入阻塞`, 'alert', '✖');
        this.emit('flash', 'red');
        this.subtitle('故障注入：核心库宕机，触发应急预案');
      }
      if (t > 3.4 && beat('p2-runbook')) {
        this.log('AGENT-07 执行预案 runbook/failover-db.sh', 'warn');
        this.feed(`<b>AGENT-07</b> 启动 <em>主备切换</em> 预案`, 'warn', '⚙');
      }
      if (t > 7 && beat('p2-check')) this.log('校验备库数据一致性 · LSN 0 / 差异 0 字节', 'ok');
      if (t > 14.5 && beat('p2-failover')) {
        st.nodes[4].role = '核心主库 · 已接管';
        st.nodes[4].status = 'online';
        st.nodes[4].health = 1;
        st.nodes[4].load = 86;
        st.metrics.rto = 42;
        st.metrics.rpo = 0;
        st.metrics.shield = Math.max(st.metrics.shield, 72);
        this.emit('repair', 4);
        this.log('DB-05 接管主库完成 · RTO 42s / RPO 0s', 'ok');
        this.emit('announce', {
          kicker: 'FAILOVER COMPLETE', title: '主备切换完成',
          sub: '业务恢复 · RTO 42s · RPO 0s', tone: 'good', dur: 4000,
        });
        this.subtitle('流量已切至 DB-05，业务恢复写入');
        this.emit('camera', 'standby');
      }
      if (t > 20 && beat('p2-root')) this.log('根因定位：存储引擎死锁，DB-04 进入隔离重建', 'warn');
      if (t > 24 && beat('p2-heal')) {
        this.log('护盾能量回路重置，完整度回升至 74%', 'ok');
        this.emit('heal', 74);
        this.subtitle('核心库完成隔离，演练进入最终阶段');
      }
    }

    if (st.phase === 3) {
      if (t > 6 && beat('p3-warn')) {
        this.log('APT 母舰释放 5 波混合攻击 · 全节点超载', 'bad');
        this.subtitle('敌方主力进入防区，所有炮塔自由开火');
      }
      if (t > 13 && beat('p3-iso')) {
        this.feed(`<b>OSS-06</b> 阻断 <em>供应链投毒</em> 载荷`, 'warn', '☣');
        this.log('OSS-06 检测到签名异常的容器镜像，已隔离', 'warn');
      }
      if (t > 20 && beat('p3-hp')) this.subtitle('母舰护盾破裂，集火核心引擎');
      if (t > 26 && beat('p3-low') && st.metrics.bossHP > 30) {
        st.metrics.bossHP = Math.min(st.metrics.bossHP, 42);
      }
      if (t > 30 && beat('p3-final')) {
        this.subtitle('最后一击 —— 全防区火力覆盖');
        this.emit('finalBlow');
        st.metrics.bossHP = 0;
      }
      if (t > 38 && beat('p3-end')) this.finish();
    }
  }
}

export function formatClock(seconds) {
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}
