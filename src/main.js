import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { Sim, formatClock, PHASES, TACTICS } from './sim.js';
import { World } from './world.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { SyncBus } from './sync.js';

const params = new URLSearchParams(location.search);
const lowQuality = params.get('quality') === 'low';

/* ------------------------------------------------------------ renderer */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowQuality ? 1.25 : 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x03070f, 0.0042);

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 1600);
camera.position.set(60, 45, 70);
camera.lookAt(0, 8, 0);

/* ---------------------------------------------------------- post processing */
const ScreenFX = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uWarn: { value: 0 },
    uCine: { value: 0 },
    uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uWarn;
    uniform float uCine;
    uniform vec2 uRes;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float ca = 0.0007 + uWarn * 0.0016;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;

      float vig = smoothstep(0.98, 0.24, length(c) * 1.12);
      col *= mix(0.42, 1.0, vig);

      float edge = smoothstep(0.4, 0.78, length(c));
      col += vec3(1.0, 0.05, 0.12) * edge * uWarn * 0.12;

      float scan = sin(uv.y * uRes.y * 1.35 + uTime * 2.6) * 0.5 + 0.5;
      col *= 1.0 - 0.026 * scan;
      float grain = fract(sin(dot(uv * uRes + uTime * 31.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (grain - 0.5) * 0.016;

      if (uCine > 0.01) {
        vec3 streak = vec3(0.0);
        for (int i = 1; i <= 5; i++) {
          float o = float(i) * 0.006;
          streak += texture2D(tDiffuse, uv + vec2(o, 0.0)).rgb;
          streak += texture2D(tDiffuse, uv - vec2(o, 0.0)).rgb;
        }
        float sl = dot(streak, vec3(0.299, 0.587, 0.114));
        col += vec3(0.32, 0.52, 0.82) * streak * smoothstep(0.9, 1.8, sl) * 0.04 * uCine;
        float hl = dot(col, vec3(0.299, 0.587, 0.114));
        col += vec3(0.35, 0.10, 0.05) * pow(max(0.0, hl - 0.5), 2.0) * uCine * 0.22;

        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), col, 1.10);
        col *= vec3(1.035, 1.0, 1.045);
        col += vec3(0.0, 0.012, 0.024) * (1.0 - smoothstep(0.0, 0.55, l));
        float cv = smoothstep(0.22, 0.82, length(c));
        col *= mix(1.0, 0.78, cv * uCine);
        col += (grain - 0.5) * 0.014 * uCine;
      }

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

const composer = new EffectComposer(renderer);
// Keep the composer targets non-multisampled: MSAA targets black out the
// textured sky dome on some WebGL drivers. FXAA below handles edge smoothing.
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, {
  focus: 46,
  aperture: 0.00032,
  maxblur: 0.0055,
});
bokeh.enabled = false;
composer.addPass(bokeh);
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.72, 0.5, 0.72,
);
composer.addPass(bloom);
const screenFX = new ShaderPass(ScreenFX);
composer.addPass(screenFX);
composer.addPass(new OutputPass());
const fxaa = new ShaderPass(FXAAShader);
fxaa.material.uniforms.resolution.value.set(1 / window.innerWidth, 1 / window.innerHeight);
composer.addPass(fxaa);

/* -------------------------------------------------------------- css2d labels */
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.getElementById('labels').appendChild(labelRenderer.domElement);

/* ------------------------------------------------------------------- systems */
const sim = new Sim();
const world = new World(scene);
const hud = new HUD(sim);
const audio = new AudioEngine();
const game = new Game({ scene, camera, renderer, world, sim, audio, hud });

hud.resetView();
window.__demo = { sim, game, world, hud, audio, renderer, scene, camera, composer, bloom, bokeh, screenFX, fxaa };

const recentLogs = [];
sim.on('log', (d) => {
  recentLogs.push(d);
  if (recentLogs.length > 30) recentLogs.shift();
});

sim.log('ATLAS 防御网格自检完成 · 6/6 节点在线', 'ok');
sim.log('演练剧本 DRILL-2077 已装载，等待指挥员授权', 'info');
sim.log('提示：拖拽旋转视角 / 空格启动演练', 'info');
hud.showSubtitle({ text: '深空防线已就绪 · 按空格启动演练', dur: 7000 });

/* --------------------------------------------------------------------- ui */
let muted = false;
let theme = 'space';
let cinematic = false;
let blackout = false;
let dofEnabled = !lowQuality;

function setDof(v) {
  dofEnabled = !!v;
  applyLook();
  sim.log(`景深 ${dofEnabled ? '开启' : '关闭'}`, 'info');
}

function setBlackout(v) {
  blackout = !!v;
  document.getElementById('blackout')?.classList.toggle('on', blackout);
  sim.log(`大厅${blackout ? '进入待机黑屏' : '恢复画面'}`, 'info');
}

function applyLook() {
  renderer.toneMappingExposure = cinematic ? 1.08 : (theme === 'city' ? 1.24 : 1.18);
  bloom.strength = cinematic ? 0.92 : (theme === 'city' ? 0.88 : 0.72);
  bloom.threshold = cinematic ? 0.58 : (theme === 'city' ? 0.62 : 0.72);
  screenFX.uniforms.uCine.value = cinematic ? 1 : 0;
  bokeh.enabled = cinematic && dofEnabled;
}

function setCinematic(v) {
  cinematic = !!v;
  document.body.classList.toggle('cinematic', cinematic);
  document.getElementById('btnCine')?.classList.toggle('active', cinematic);
  game.setCinematic(cinematic);
  applyLook();
  const title = document.getElementById('cineTitle');
  if (title) title.textContent = theme === 'city' ? 'ATLAS // NEO-SHANGHAI' : 'ATLAS // DEEP SPACE';
  sim.log(`电影模式 ${cinematic ? '开启' : '关闭'}`, 'info');
}

async function ensureAudio() {
  await audio.resume();
  audio.setMuted(muted);
}

function applyTheme(mode, { instant = false } = {}) {
  if (mode !== 'city' && mode !== 'space') return;
  if (theme === mode && !instant) return;
  const commit = () => {
    theme = mode;
    world.setTheme(mode);
    game.setTheme(mode);
    hud.setTheme(mode);
    applyLook();
    const cineTitle = document.getElementById('cineTitle');
    if (cineTitle) cineTitle.textContent = mode === 'city' ? 'ATLAS // NEO-SHANGHAI' : 'ATLAS // DEEP SPACE';
    try { localStorage.setItem('atlas-theme', mode); } catch { /* ignore */ }
    if (!instant) {
      sim.log(`场景切换：${mode === 'city' ? '赛博都市 · NEO-SHANGHAI' : '深空防线 · DEEP SPACE'}`, 'info');
    }
  };
  if (instant) {
    commit();
    return;
  }
  const wipe = document.getElementById('themeWipe');
  wipe?.classList.add('on');
  setTimeout(() => {
    commit();
    setTimeout(() => wipe?.classList.remove('on'), 320);
  }, 300);
}

async function act(action, value) {
  if (action === 'console') {
    window.open('./console.html?sync=1', 'atlas-console', 'width=1600,height=900');
    return;
  }
  if (action === 'showcase') {
    window.open('./showcase.html', 'atlas-showcase', 'width=1440,height=960');
    return;
  }
  ensureAudio();
  audio.ui();
  if (action === 'start' || action === 'next') {
    if (sim.state.complete) sim.restart();
    else if (!sim.state.running) sim.start();
    else sim.next();
  } else if (action === 'restart') {
    sim.restart();
  } else if (action === 'pause') {
    sim.togglePause();
  } else if (action === 'theme') {
    applyTheme(theme === 'space' ? 'city' : 'space');
  } else if (action === 'cinematic') {
    setCinematic(!cinematic);
  } else if (action === 'tactic') {
    const res = sim.playTactic(value);
    if (!res.ok) {
      hud.tacticDenied(res.reason, value);
      return;
    }
    game.tacticFx(value);
    hud.tacticFeedback(res.tactic);
    if (value === 'block') audio.explosion(false);
    else if (value === 'failover' || value === 'scale') audio.repair();
    else if (value === 'waf') audio.shield();
  } else if (action === 'sound') {
    muted = !muted;
    audio.setMuted(muted);
    hud.setSound(!muted);
  } else if (action === 'fullscreen') {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  } else if (action === 'hud') {
    hud.toggle();
  }
}

hud.onAction = act;

window.addEventListener('pointerdown', () => { ensureAudio(); }, { once: true });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    act('start');
  } else if (e.key === 'm' || e.key === 'M') {
    act('sound');
  } else if (e.key === 'f' || e.key === 'F') {
    act('fullscreen');
  } else if (e.key === 'h' || e.key === 'H') {
    act('hud');
  } else if (e.key === 't' || e.key === 'T') {
    act('theme');
  } else if (e.key === 'c' || e.key === 'C') {
    act('cinematic');
  } else if (e.key === 'b' || e.key === 'B') {
    setBlackout(!blackout);
  } else if (e.key === 'q' || e.key === 'Q') {
    setDof(!dofEnabled);
  } else if (e.key === 'g' || e.key === 'G') {
    act('showcase');
  } else if (e.key === 'r' || e.key === 'R') {
    act('restart');
  } else if (e.key === 'p' || e.key === 'P') {
    sim.togglePause();
  } else {
    const m = /^Digit([1-5])$/.exec(e.code);
    if (!m) return;
    const idx = Number(m[1]) - 1;
    if (e.shiftKey) {
      if (idx < 3) window.__demo.skipTo(idx + 1, idx === 1 ? 6 : 8);
    } else {
      act('tactic', TACTICS[idx].id);
    }
  }
});

sim.on('alarm', (on) => audio.setAlarm(on));
sim.on('phase', (p) => {
  audio.setAlarm(p > 0);
  audio.setThreat(p === 3 ? 1 : p === 2 ? 0.7 : p === 1 ? 0.5 : 0);
});
sim.on('reset', () => {
  lastNodeStatus.fill('');
  hud.setPhase(0);
});

/* ------------------------------------------------------------------ sync */
const sync = new SyncBus('hall');

function snapshot() {
  const s = sim.state;
  const m = s.metrics;
  return {
    phase: s.phase,
    running: s.running,
    paused: s.paused,
    complete: s.complete,
    totalT: s.totalT,
    phaseT: s.phaseT,
    duration: PHASES[s.phase] ? PHASES[s.phase].dur : 0,
    theme,
    cinematic,
    muted,
    blackout,
    energy: s.energy,
    metrics: {
      qps: m.qps, intercept: m.intercept, latency: m.latency, rto: m.rto, rpo: m.rpo,
      shield: m.shield, score: m.score, combo: m.combo, blocked: m.blocked, bossHP: m.bossHP,
    },
    nodes: s.nodes.map((n) => ({
      id: n.id, role: n.role, load: n.load, latency: n.latency, status: n.status,
    })),
    logs: recentLogs.slice(-8).map((l) => ({ time: l.time, text: l.text, kind: l.kind })),
  };
}

async function handleCommand(msg) {
  const action = msg.action;
  if (!action) return;
  if (action === 'jump') {
    window.__demo.skipTo(Number(msg.value) || 1, Number(msg.value) === 2 ? 6 : 8);
    return;
  }
  if (action === 'blackout') {
    setBlackout(!blackout);
    return;
  }
  if (action === 'mute') {
    await act('sound');
    return;
  }
  await act(action, msg.value);
}

sync.on('cmd', (msg) => { handleCommand(msg).catch(() => {}); });
sync.on('hello', () => sync.send({ type: 'state', state: snapshot() }));
sync.init().then((mode) => {
  sim.log(`双屏同步通道：${mode === 'sse' ? '局域网 SSE 中继' : mode === 'broadcast' ? '本机 BroadcastChannel' : 'localStorage 回退'}`, 'info');
});
window.__demo.sync = sync;
window.__demo.snapshot = snapshot;
window.__demo.setBlackout = setBlackout;

/* --------------------------------------------------------------- node sync */
const lastNodeStatus = new Array(6).fill('');
function syncNodes() {
  sim.state.nodes.forEach((n, i) => {
    if (lastNodeStatus[i] !== n.status) {
      world.setTowerState(i, n.health, n.status);
      lastNodeStatus[i] = n.status;
    }
  });
}
syncNodes();

/* -------------------------------------------------------------------- loop */
const clock = new THREE.Clock();
let elapsed = 0;
let fpsEMA = 60;
let fpsAcc = 0;
let syncAcc = 0;
let booted = false;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  labelRenderer.setSize(w, h);
  screenFX.uniforms.uRes.value.set(w, h);
  fxaa.material.uniforms.resolution.value.set(1 / w, 1 / h);
  bokeh.uniforms.aspect.value = camera.aspect;
}
window.addEventListener('resize', resize);

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;

  sim.update(dt);
  game.update(dt, elapsed);
  hud.update(dt);
  syncNodes();

  syncAcc += dt;
  if (syncAcc >= 0.25) {
    syncAcc = 0;
    sync.send({ type: 'state', state: snapshot() });
  }

  screenFX.uniforms.uTime.value = elapsed;
  screenFX.uniforms.uWarn.value += (sim.state.threat * 0.85 - screenFX.uniforms.uWarn.value) * Math.min(1, dt * 2.2);
  if (cinematic) {
    const focusTarget = (sim.state.phase === 3 && game.bossVisible) ? game.boss.position : game.cam.target;
    bokeh.uniforms.focus.value = camera.position.distanceTo(focusTarget);
    bokeh.uniforms.aspect.value = camera.aspect;
  }

  composer.render(dt);
  labelRenderer.render(scene, camera);

  fpsEMA += (1 / Math.max(dt, 0.0001) - fpsEMA) * 0.04;
  fpsAcc += dt;
  if (fpsAcc > 0.4) {
    hud.setFps(fpsEMA);
    if (cinematic) {
      const el = document.getElementById('cineTime');
      if (el) el.textContent = formatClock(sim.state.totalT);
      const ph = document.getElementById('cinePhase');
      const phase = PHASES[sim.state.phase];
      if (ph && phase) ph.textContent = `${phase.no} · ${phase.name}`;
    }
    fpsAcc = 0;
  }

  if (!booted) {
    booted = true;
    setTimeout(() => document.getElementById('boot')?.classList.add('done'), 380);
  }
}

frame();

/* ------------------------------------------------------------------- debug */
if (params.get('hud') === '0' || params.get('nohud') === '1') {
  document.getElementById('hud').classList.add('hidden');
}
if (params.get('auto') === '1') {
  setTimeout(() => { if (!sim.state.running) act('start').catch(() => {}); }, 2500);
}

let savedTheme = 'space';
try { savedTheme = localStorage.getItem('atlas-theme') || 'space'; } catch { /* ignore */ }
applyTheme(
  params.get('theme') === 'city' || (!params.get('theme') && savedTheme === 'city') ? 'city' : 'space',
  { instant: true },
);
window.__demo.applyTheme = applyTheme;
window.__demo.getTheme = () => theme;
window.__demo.setCinematic = setCinematic;
window.__demo.getCinematic = () => cinematic;
window.__demo.setDof = setDof;
window.__demo.getDof = () => dofEnabled;
if (params.get('cine') === '1') setCinematic(true);

window.__demo.skipTo = (phase, t = 4) => {
  sim.reset();
  sim.state.running = true;
  sim.state.paused = false;
  sim.state.totalT = phase === 1 ? 14 : phase === 2 ? 40 : 70;
  sim.setPhase(phase);
  sim.state.phaseT = t;
  sim.state.totalT += t;
  hud.setPhase(phase);
  if (phase === 3) {
    sim.state.metrics.bossHP = 62;
    game.showBoss();
    sim.state.threat = 1;
  }
  if (phase === 2) sim.state.metrics.shield = 68;
  lastNodeStatus.fill('');
  syncNodes();
};

window.__demo.pause = () => { sim.state.paused = true; };
window.__demo.play = () => { sim.state.paused = false; };
window.__demo.advance = (seconds) => {
  const step = 1 / 60;
  let left = seconds;
  while (left > 0) {
    const dt = Math.min(step, left);
    elapsed += dt;
    sim.update(dt);
    game.update(dt, elapsed);
    hud.update(dt);
    syncNodes();
    screenFX.uniforms.uTime.value = elapsed;
    screenFX.uniforms.uWarn.value += (sim.state.threat * 0.85 - screenFX.uniforms.uWarn.value) * Math.min(1, dt * 2.2);
    if (cinematic) {
      const focusTarget = (sim.state.phase === 3 && game.bossVisible) ? game.boss.position : game.cam.target;
      bokeh.uniforms.focus.value = camera.position.distanceTo(focusTarget);
      bokeh.uniforms.aspect.value = camera.aspect;
    }
    left -= dt;
  }
  composer.render(0);
  labelRenderer.render(scene, camera);
};
