import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { Sim } from './sim.js';
import { World } from './world.js';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';

/* ------------------------------------------------------------ renderer */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
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

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.72, 0.5, 0.72,
);
composer.addPass(bloom);
const screenFX = new ShaderPass(ScreenFX);
composer.addPass(screenFX);
composer.addPass(new OutputPass());

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
window.__demo = { sim, game, world, hud, audio, renderer, scene, camera, composer };

sim.log('ATLAS 防御网格自检完成 · 6/6 节点在线', 'ok');
sim.log('演练剧本 DRILL-2077 已装载，等待指挥员授权', 'info');
sim.log('提示：拖拽旋转视角 / 空格启动演练', 'info');
hud.showSubtitle({ text: '深空防线已就绪 · 按空格启动演练', dur: 7000 });

/* --------------------------------------------------------------------- ui */
let muted = false;

async function ensureAudio() {
  await audio.resume();
  audio.setMuted(muted);
}

async function act(action) {
  await ensureAudio();
  audio.ui();
  if (action === 'start' || action === 'next') {
    if (sim.state.complete) sim.restart();
    else if (!sim.state.running) sim.start();
    else sim.next();
  } else if (action === 'restart') {
    sim.restart();
  } else if (action === 'pause') {
    sim.togglePause();
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
  } else if (e.key === 'r' || e.key === 'R') {
    act('restart');
  } else if (e.key === 'p' || e.key === 'P') {
    sim.togglePause();
  } else if (e.key === '1' || e.key === '2' || e.key === '3') {
    window.__demo.skipTo(Number(e.key), Number(e.key) === 2 ? 6 : 8);
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

  screenFX.uniforms.uTime.value = elapsed;
  screenFX.uniforms.uWarn.value += (sim.state.threat * 0.85 - screenFX.uniforms.uWarn.value) * Math.min(1, dt * 2.2);

  composer.render(dt);
  labelRenderer.render(scene, camera);

  fpsEMA += (1 / Math.max(dt, 0.0001) - fpsEMA) * 0.04;
  fpsAcc += dt;
  if (fpsAcc > 0.4) {
    hud.setFps(fpsEMA);
    fpsAcc = 0;
  }

  if (!booted) {
    booted = true;
    setTimeout(() => document.getElementById('boot')?.classList.add('done'), 380);
  }
}

frame();

/* ------------------------------------------------------------------- debug */
const params = new URLSearchParams(location.search);
if (params.get('hud') === '0' || params.get('nohud') === '1') {
  document.getElementById('hud').classList.add('hidden');
}
if (params.get('auto') === '1') {
  setTimeout(() => { if (!sim.state.running) act('start').catch(() => {}); }, 2500);
}

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
    left -= dt;
  }
  composer.render(0);
  labelRenderer.render(scene, camera);
};
