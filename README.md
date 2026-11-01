# ATLAS // 深空防线

> 把 IT 运维演练大屏做成“能看懂的游戏”：DDoS 洪峰是敌舰群，故障注入是基地起火，主备切换是能量重连，APT 总攻是 Boss 决战。

![ATLAS 深空防线](docs/preview.jpg)

一个**可直接双击运行、无需后端、无需联网**的游戏化演练大屏原型。基于 Three.js / WebGL 实时渲染；星云、行星、城市灯光、防御塔、能量护盾、粒子与音效全部程序化生成，构建产物是单个约 640 KB 的 `dist/index.html`。

---

## 1. 它解决了什么

传统演练大屏通常是「拓扑图 + 指标卡」：信息准确，但领导看不懂态势，参观者记不住亮点。本项目把演练的**状态机**与**游戏演出层**解耦：

| 层 | 文件 | 职责 |
|---|---|---|
| 演练剧本 / 数据 | `src/sim.js` | 阶段推进、指标、RTO/RPO、节点状态、事件总线 |
| 3D 世界 | `src/world.js` | 星云、行星、城市灯光、六边形基地、节点塔、核心、护盾 |
| 战斗演出 | `src/game.js` | 敌舰波次、激光拦截、护盾涟漪、Boss、粒子、运镜、震屏 |
| HUD | `src/hud.js` | 节点矩阵、KPI、积分/连击、击杀播报、公告、终端、战报 |
| 音效 | `src/audio.js` | WebAudio 全合成环境音 / 警报 / 激光 / 爆炸 / 胜利 |
| 入口 | `src/main.js` | 渲染管线、Bloom、后处理、键鼠交互、调试钩子 |

真实监控数据只需要替换 `sim.js` 的数据来源；演出层通过事件（`fault`、`repair`、`boss`、`complete`…）驱动，不需要改 3D 代码。

---

## 2. 三十秒上手

1. **直接双击** `dist/index.html`（Chrome / Edge），点击「启动演练」或按 <kbd>Space</kbd>。
2. 重新构建：`npm install && npm run build`
3. 本地预览：`npm run dev` → <http://127.0.0.1:5178/>
4. 自动演示（适合无人值守大屏）：`dist/index.html?auto=1`
5. 纯净 3D 画面（截图 / 录屏）：`dist/index.html?hud=0`

> 首次点击/按键后才会启动声音，这是浏览器的自动播放策略限制。

### 操作

| 操作 | 功能 |
|---|---|
| `Space` | 启动 / 推进下一阶段 / 完成后重开 |
| `P` | 暂停 / 继续 |
| 鼠标拖拽 | 自由环视（7 秒后自动回到电影机位） |
| 滚轮 | 推拉镜头 |
| `M` | 静音 / 恢复 |
| `F` | 全屏 |
| `H` | 隐藏 / 显示 HUD |
| `R` | 重新开始 |
| `1` / `2` / `3` | 直接跳到 P1 / P2 / P3（演示彩排用） |

---

## 3. 演练剧本（约 95 秒）

| 阶段 | 时间 | 游戏化演出 | 运维含义 |
|---|---|---|---|
| **P1 红蓝对抗** | 0–34s | 预警「DDoS 洪峰来袭」，敌舰群从防区外突入，六座炮塔激光齐射，护盾涟漪，连击与击杀播报刷屏 | 1.2 Tbps / 240K QPS 混合流量，WAF 限流、自动扩容，拦截率 99.97% |
| **P2 故障注入** | 34–64s | 镜头推近 DB-04，核心库塔爆炸起火、熄灭、变为 OFFLINE；备用塔点亮，绿色修复环扩散，镜头切至 DB-05 | 主库心跳丢失、写入中断，执行 `runbook/failover-db.sh`，RTO 42s / RPO 0s |
| **P3 BOSS 决战** | 64–94s | APT 母舰「黑潮」跃迁入场，Boss 血条、母舰光束轰击护盾，全节点过载，最后一击后母舰爆炸 | 红队总攻 + 全链路压测 + 供应链投毒载荷隔离，最终 S 级评价 |
| **战报** | 94s+ | S 级结算卡：总积分、最高连击、拦截次数、RTO / RPO、护盾剩余 | 演练复盘数据 |

![P1](docs/phase1.jpg)
![P2](docs/phase2.jpg)
![P3](docs/phase3.jpg)

---

## 4. 游戏化映射（本项目的落地版本）

| 真实指标 | 本项目的游戏化呈现 |
|---|---|
| 服务器 / 集群节点 | 六座带能量光柱的六边形防御塔，塔顶晶体颜色区分服务 |
| 网络流量 / 并发 | 塔与核心之间的流光管道 + 突破防线的敌舰群 |
| CPU / 内存负载 | 左侧节点矩阵的负载条与 `DEGRADED` 状态；塔体亮度随威胁变化 |
| DDoS / 安全攻击 | 红色敌舰波次；撞上护盾时产生扩散涟漪并扣护盾 |
| 防火墙 / 拦截策略 | 半球形六边形能量护盾 + 炮塔激光拦截网 |
| 故障注入 | DB-04 塔爆炸、起火、熄灭、红灯闪烁、显示 `OFFLINE` |
| 应急响应 / 恢复 | 备库接管的绿色修复环、护盾能量回路重置、镜头聚焦 |
| 演练整体进度 | 顶部 P1/P2/P3 阶段条 + Boss 血条 + 目标进度条 |
| 演练结果 | S 级战报卡 + 积分 / 连击 / 拦截数 / RTO / RPO |
| 击杀播报 | 右上角 KILL FEED，含干员名、武器、拦截量与加分 |
| 全局事件广播 | 屏幕中央全息公告（入侵警报 / 故障注入 / 切换完成 / Boss 跃迁） |
| 操作日志 | 左下角战术终端，带时间戳滚动输出 |

设计上遵循三条原则：

1. **数据驱动特效**：没有事件时画面是静谧的扫描与呼吸；只有故障/攻击发生才爆发粒子与警报。
2. **游戏是氛围，HUD 是事实**：RTO、RPO、拦截率、节点状态始终以平视 HUD 固定显示，保证“中看也中用”。
3. **性能预算**：实例化敌舰、粒子池上限 2200、DPR 上限 1.75、Bloom 单 pass，1080p 普通 PC 可跑 45–70 FPS。

---

## 5. 技术实现

- **渲染**：Three.js r160 + `EffectComposer`（RenderPass → UnrealBloomPass → 自定义 ScreenFX → OutputPass）
- **后处理**：Bloom、暗角、色差、扫描线、胶片颗粒、警报红边（`src/main.js`）
- **程序化素材**：星云、行星条带、护盾六边形、地面网格、光柱渐变、辉光贴图全部由 Canvas / GLSL 生成，无外部图片与音频
- **护盾**：半球网格 + 自定义 GLSL（菲涅尔 + 六边形格 + 4 个命中涟漪槽位）
- **战斗**：`InstancedMesh` 敌舰 + 轨迹线段 + 点光晕；激光对象池；GPU 粒子池；Boss 光束与死亡爆裂
- **运镜**：自定义 Cinematic Rig（yaw/pitch/dist/fov/target 阻尼插值），阶段事件切换机位，命中触发震屏
- **打包**：esbuild 将 JS/CSS 内联进单个 HTML，`file://` 直接可运行

### 目录

```
├─ dist/index.html          # 最终交付：单文件，双击即用
├─ src/
│  ├─ main.js               # 渲染器 / 后处理 / 交互 / 调试钩子
│  ├─ sim.js                # 演练状态机与数据（替换这里接真实监控）
│  ├─ world.js              # 场景美术与节点/护盾
│  ├─ game.js               # 战斗、Boss、粒子、镜头
│  ├─ hud.js                # HUD 与战报
│  ├─ audio.js              # WebAudio 合成音效
│  ├─ utils.js              # 程序化贴图与 Shader
│  ├─ style.css             # HUD / 大屏视觉规范
│  └─ index.template.html   # HTML 壳
├─ tools/capture.cjs        # 生成 docs 截图（需本机 Playwright + Chrome）
├─ tools/shot.cjs           # 分阶段快速截图（开发用，需 Playwright）
├─ open.cmd                 # Windows 一键打开大屏
├─ build.mjs                # 单文件构建
├─ server.mjs               # 本地静态预览
└─ docs/                    # 截图与接入手册
```

---

## 6. 接入真实数据（Prometheus / Zabbix / 自研平台）

当前 `src/sim.js` 用计时器模拟剧本。生产接入推荐：

```
Prometheus / Zabbix / CMDB / 演练编排引擎
        ↓ (HTTP / Kafka / MQTT)
Telemetry Adapter（新增，1–2 Hz 聚合）
        ↓ 更新 sim.state.metrics / sim.state.nodes
        ↓ 事件映射：sim.emit('fault', 3) / sim.emit('repair', 4) / sim.emit('boss', true)
Three.js 演出层 + HUD（无需改动）
```

最小示例：

```js
// src/telemetry.js（示例，不在当前构建中）
const ws = new WebSocket('wss://ops.example.com/drill/stream');
ws.onmessage = (ev) => {
  const d = JSON.parse(ev.data);
  const m = sim.state.metrics;
  m.qps = d.qps;
  m.intercept = d.blockRate;
  m.latency = d.p95;
  m.shield = d.shield;
  d.nodes.forEach((n, i) => {
    sim.state.nodes[i].load = n.cpu;
    sim.state.nodes[i].latency = n.latency;
    sim.state.nodes[i].status = n.status; // online | degraded | offline
  });
  if (d.event === 'DB_FAILOVER_START') sim.emit('fault', 3);
  if (d.event === 'DB_FAILOVER_DONE') sim.emit('repair', 4);
  if (d.event === 'APT_BOSS_ENTER') sim.emit('boss', true);
  if (d.event === 'DRILL_COMPLETE') sim.finish();
};
```

详细事件契约、阈值建议、去抖与多屏同步方案见 **[docs/telemetry.md](docs/telemetry.md)**。

---

## 7. 自定义

| 想改什么 | 改哪里 |
|---|---|
| 六个节点的名称 / 角色 / 颜色 / 方位 | `src/world.js` 顶部 `NODES` |
| 演练阶段时长、台词、触发点 | `src/sim.js` 的 `PHASES` 与 `runTimeline()` |
| 品牌名 / 大屏标题 | `src/index.template.html` 的 `.brand`，或 `src/style.css` 变量 |
| 主色调 / 字体 | `src/style.css` 的 `:root` 变量（`--cyan`、`--magenta`…） |
| 相机机位 | `src/game.js` 的 `setCamGoal()` |
| Boss 外观 | `src/game.js` 的 `buildBoss()` |
| 音效音量 / 音色 | `src/audio.js` |

### 扩展另外两套主题

当前实现的是指南中的「方案 2：星际舰队 / 塔防」。同一套 `sim` 事件层可复用：

- **赛博都市**：把 `world.js` 的基地/塔替换成程序化楼群（InstancedMesh + 霓虹窗格），故障 = 摩天楼爆炸，流量 = 车流/光轨，护盾 = 城市能量罩。
- **机甲指挥舱**：保留 `sim`，把相机固定为第一人称 HUD，故障工单变成「被解剖的 3D 引擎核心」，代码雨用 Shader 全屏叠加。

建议先做“主题切换”再扩场景：`theme` 字段进入 `sim.state`，`world.build()` 按主题重建，事件层不变。

---

## 8. 性能与验收

- 1920×1080 / DPR 1.75 / Bloom pass：实测 45–70 FPS（headless Chrome + SwiftShader 参考值；真机 GPU 更高）
- 视觉预算：敌舰上限 340、粒子 2200、激光对象池 56、场景 draw call 约 120
- 大屏播放机建议：Chrome 独占全屏、关闭其他标签页、DPR 锁 1.0–1.5；4K 屏把 `renderer.setPixelRatio` 调到 1.0，Bloom 强度降到 0.6
- 无外部网络请求，断网可运行；无第三方统计/字体

**验收路径**：空格启动 → 看完 P1 洪峰 → P2 故障注入与主备切换 → P3 Boss → S 级战报 → 再次演练。全程无控制台报错。

---

## 9. 已知限制 / 下一步

- 当前数据为**模拟剧本**，尚未连接真实监控；接入方式见第 6 节。
- 声音需一次用户手势后启动（浏览器策略）。
- 单机单屏；多屏（指挥席 + 大屏）可用 `BroadcastChannel` 同步 `sim` 事件，或由服务端 WS 扇出。
- 未做移动端适配（目标场景是 16:9 大屏 / 控制台）。
- 若追求 UE5 级画质，可将 `sim` 作为数据源，用 Pixel Streaming 输出 UE5 场景；本项目的 HUD 与事件契约可直接复用。

---

*ATLAS // 深空防线 · DRILL-2077 · 游戏化运维演练大屏原型*
