# 真实监控接入手册

本文档说明如何把 Prometheus / Zabbix / 演练编排引擎的数据接到 ATLAS 大屏。核心原则：**3D 演出层不直接读监控，只消费 `sim.state` 与 `sim` 事件**；数据适配器替换 `src/sim.js` 的模拟逻辑即可。

---

## 1. 架构

```
┌──────────────────────┐      HTTP/Kafka/MQTT      ┌───────────────────┐
│ Prometheus / Zabbix  │ ────────────────────────▶ │ Telemetry Adapter │
│ 演练编排引擎 / CMDB   │                           │ 聚合、映射、去抖   │
└──────────────────────┘                           └─────────┬─────────┘
                                                             │ 1–2 Hz
                                                   ┌─────────▼─────────┐
                                                   │ sim.state / emit  │
                                                   └─────────┬─────────┘
                                     ┌───────────────────────┼───────────────────────┐
                                     ▼                       ▼                       ▼
                              world / game 演出         HUD / 战报              audio / 播报
```

**不要让 3D 层每帧读 HTTP。** 适配器负责把高频原始数据压成 1–2 Hz 的展示值，前端只做插值。

---

## 2. 状态结构

`sim.state` 是唯一数据源：

```js
{
  phase: 0 | 1 | 2 | 3,        // 0 待机，1 DDoS，2 故障注入，3 Boss
  running: boolean,
  paused: boolean,
  complete: boolean,
  phaseT: number,               // 当前阶段已运行秒数
  totalT: number,               // 演练总秒数
  threat: 0..1,                 // 威胁度：控制护盾红移、光束亮度、屏幕警告
  metrics: {
    qps: 8200,                  // 原始 QPS，HUD 自动换算 K/M
    intercept: 99.97,           // 拦截率 %
    latency: 18,                // P95 延迟 ms
    rto: 0,                     // 恢复时间秒
    rpo: 0,                     // 数据丢失秒
    shield: 100,                // 护盾完整度 %
    blocked: 0,                 // 累计拦截次数
    leaked: 0,                  // 漏过次数
    score: 0,                   // 防守积分
    combo: 1, maxCombo: 1,      // 连击
    bossHP: 100, bossMax: 100,  // Boss 血量
    progress: 0,                // 阶段进度 0..1
    failover: 0                 // 主备切换进度 0..1
  },
  nodes: [
    { id: 'GW-01', role: '接入网关', load: 62, latency: 18, status: 'online', health: 1 },
    // status: online | degraded | offline | repair
  ],
  stats: { kills, maxCombo, rto, rpo, shield }
}
```

> 颜色、3D 塔位、名称来自 `src/world.js` 的 `NODES`；`state.nodes` 只需按相同顺序提供状态。

---

## 3. 事件契约

用 `sim.emit(event, payload)` 驱动演出。当前已实现的监听：

| 事件 | payload | 演出效果 | 建议触发条件 |
|---|---|---|---|
| `fault` | `towerIndex: 0..5` | 塔爆炸、起火、熄灭、变 OFFLINE，镜头推近 | 主库心跳丢失 / 容器 CrashLoop / 编排引擎注入故障 |
| `repair` | `towerIndex` | 绿色修复环、粒子、塔恢复 | 主备切换完成 / 节点重建成功 |
| `heal` | `shieldPercent` | 护盾能量回路重置 | 护盾/带宽恢复 |
| `boss` | `true` | Boss 入场、Boss 血条、终局音效 | 演练进入最终阶段 / APT 总攻 |
| `finalBlow` | — | 连续爆裂 + 击沉 Boss | 指挥员宣布总攻 / 血量归零 |
| `complete` | stats | S 级战报、胜利音效 | 演练结束 |
| `announce` | `{ kicker, title, sub, tone, dur }` | 全息公告 | 自定义事件广播 |
| `subtitle` | `{ text, dur }` | 底部字幕 | 解说词 |
| `feed` | `{ html, kind, icon }` | 击杀播报 | 拦截 / 处置成功 |
| `log` | `{ time, text, kind }` | 战术终端 | 操作审计 / 处置步骤 |
| `shieldHit` | `power` | 护盾涟漪 + 红色伤害脉冲 | 真实攻击命中 |
| `camera` | `'wide' \| 'db' \| 'standby' \| 'boss'` | 机位切换 | 导演脚本 |

新增事件时，在 `src/game.js` 的 `bindEvents()` 里订阅，在 `src/hud.js` 里更新对应 UI；不要在渲染循环里轮询业务条件。

---

## 4. 适配器示例

```js
// src/telemetry.js
export class TelemetryAdapter {
  constructor(sim, url) {
    this.sim = sim;
    this.ws = new WebSocket(url);
    this.ws.onmessage = (ev) => this.ingest(JSON.parse(ev.data));
    this.ws.onclose = () => setTimeout(() => this.reconnect(), 3000);
  }

  ingest(d) {
    const s = this.sim.state;
    const m = s.metrics;

    // 数值：直接覆盖，HUD 内部有 80ms 节流
    m.qps = d.qps ?? m.qps;
    m.intercept = d.block_rate ?? m.intercept;
    m.latency = d.p95_ms ?? m.latency;
    m.shield = d.shield_pct ?? m.shield;
    m.rto = d.rto_s ?? m.rto;
    m.rpo = d.rpo_s ?? m.rpo;

    // 节点
    (d.nodes || []).forEach((n, i) => {
      const node = s.nodes[i];
      if (!node) return;
      node.load = n.cpu;
      node.latency = n.latency;
      node.status = n.status;
      node.health = n.status === 'offline' ? 0 : 1;
    });

    // 威胁度：由攻击流量/告警级别映射，0..1
    s.threat = Math.min(1, Math.max(0, (d.attack_gbps || 0) / 1.2));

    // 事件去重（编排引擎可能重复推送）
    for (const e of d.events || []) {
      const key = `${e.type}:${e.target ?? ''}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      if (e.type === 'FAULT') this.sim.emit('fault', e.towerIndex);
      if (e.type === 'FAILOVER_DONE') this.sim.emit('repair', 4);
      if (e.type === 'BOSS') this.sim.emit('boss', true);
      if (e.type === 'DONE') this.sim.finish();
    }
  }
}
```

启动时把 `new Sim()` 换成你的数据源；若保留现有剧本作为“彩排模式”，可用 `?mode=live` 区分。

---

## 5. 阈值与观感建议

| 指标 | 正常 | 警告 | 严重 | 演出建议 |
|---|---|---|---|---|
| 攻击流量 | < 10K QPS | 10K–100K | > 100K | 威胁度、敌舰密度、护盾红移 |
| 拦截率 | ≥ 99.9% | 99–99.9% | < 99% | 漏过时护盾涟漪 + 屏幕红脉冲 |
| P95 延迟 | < 50ms | 50–200ms | > 200ms | KPI 变红 + 字幕提示 |
| 节点负载 | < 70% | 70–85% | > 85% | 节点行变黄/红，塔体变亮 |
| 护盾 | > 70% | 40–70% | < 40% | 红色警报、警报音、HUD 环变红 |
| RTO | — | 接近 SLA | 超 SLA | 底部字幕 + 战报降级 |

**去抖**：同一事件 5 秒内只触发一次；告警恢复要有 10–15 秒稳定期，避免护盾/塔状态抖动。

**数据缺失**：保持上一帧值并打日志，不要把 panel 清空或归零，避免大屏“跳变”。

---

## 6. 多屏同步（指挥席 + 大厅）

本项目已内置双屏：`dist/index.html`（大厅）与 `dist/console.html`（指挥席）。同步实现位于 `src/sync.js`，按环境自动选择通道：

| 环境 | 通道 | 说明 |
|---|---|---|
| `npm run dev` / 局域网 IP | **SSE 中继** | `server.mjs` 提供 `/api/sync/events` + `/api/sync/publish`，跨设备可用 |
| GitHub Pages / 同源静态站 | **BroadcastChannel** | 同浏览器多标签，无需服务端 |
| `file://` / 无 BroadcastChannel | **localStorage** | 最后兜底，同机同源有效 |

### 6.1 消息契约

大厅以 4 Hz 广播状态：

```json
{
  "type": "state",
  "from": "hall-xxxx",
  "state": {
    "phase": 1, "running": true, "paused": false, "complete": false,
    "totalT": 18.2, "phaseT": 18.2, "duration": 34,
    "theme": "city", "cinematic": false, "muted": false, "blackout": false,
    "metrics": { "qps": 145000, "intercept": 99.97, "latency": 21, "rto": 0, "rpo": 0,
                 "shield": 96, "score": 20800, "combo": 12, "blocked": 320, "bossHP": 100 },
    "nodes": [{ "id": "GW-01", "role": "接入网关", "load": 78, "latency": 18, "status": "online" }],
    "logs": [{ "time": "00:00:18", "text": "WAF 集群自动扩容 40 → 120 节点", "kind": "ok" }]
  }
}
```

指挥席发送命令：

```json
{ "type": "cmd", "action": "theme" }
{ "type": "cmd", "action": "jump", "value": 2 }
```

| action | 作用 |
|---|---|
| `start` / `next` | 启动 / 推进 |
| `pause` | 暂停 / 继续 |
| `restart` | 重新演练 |
| `theme` | 切换星港 / 赛博都市 |
| `cinematic` | 电影模式 |
| `mute` | 大厅静音 |
| `blackout` | 大厅黑屏 / 恢复 |
| `hud` | HUD 开关 |
| `jump` | 跳转 `value: 1/2/3` |

### 6.2 跨设备部署

```bash
npm run dev
# ATLAS preview:    http://127.0.0.1:5178/
# ATLAS console:    http://127.0.0.1:5178/console
# LAN (multi-screen): http://192.168.x.x:5178/
```

- 默认 `HOST=0.0.0.0` 监听局域网，可用 `HOST=127.0.0.1 PORT=5178` 限制。
- 中继无鉴权，仅适合内网/彩排；生产环境应在反向代理层加身份认证与 TLS。
- 跨机房建议用 WebSocket + 服务端权威时钟；所有动画使用**本地插值**，不要依赖每帧网络包。
- 同一浏览器做页面演示时，直接打开两个标签页即可（BroadcastChannel）。

### 6.3 接入真实编排引擎时

- 指挥席只发送命令，不直接改 `sim`；所有变更由大厅执行后广播状态，保证单一事实源。
- 如果接入真实编排引擎，命令应转发给编排引擎 API，再以引擎回执更新 `sim`，避免“大屏状态”与“真实演练”分叉。
- 状态快照建议保持在 1–4 Hz；日志只带最近 8 条，避免消息过大。

---

## 7. 安全与运维

- 大屏通常部署在内网；本页面无外部请求，可直接静态托管（Nginx / OSS / 内网文件服务器）。
- 若数据含敏感信息，适配层做**脱敏**：节点 ID 可映射为 `GW-01`，真实 IP / 业务名不要进入前端。
- 建议保留“彩排模式”与“真实模式”开关：演示前用 `?auto=1` 跑剧本，演练时切真实数据。
- 日志：保留 `log` 事件的服务端副本，便于复盘；前端终端只展示最近 7 条。

---

*接入过程中优先保证「事件语义正确」而非「指标精度」：大屏的目标是让决策者在 3 秒内看懂态势，而不是替代监控系统。*
