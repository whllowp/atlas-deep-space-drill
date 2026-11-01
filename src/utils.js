import * as THREE from 'three';

/** Soft radial glow sprite texture. */
export function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.18, inner.replace(/[\d.]+\)$/, '0.85)'));
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Procedural 2:1 nebula for the sky sphere. */
export function makeNebulaTexture() {
  const w = 2048, h = 1024;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#010208');
  base.addColorStop(0.45, '#020610');
  base.addColorStop(0.6, '#030916');
  base.addColorStop(1, '#010308');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'lighter';

  const clouds = [
    ['#0d3b63', 0.28], ['#08324d', 0.3], ['#2a1550', 0.22],
    ['#0a4450', 0.22], ['#101f5c', 0.25], ['#421a52', 0.14],
  ];
  for (let i = 0; i < 55; i++) {
    const x = Math.random() * w;
    const y = h * 0.22 + Math.random() * h * 0.56;
    const rx = 80 + Math.random() * 420;
    const ry = rx * (0.28 + Math.random() * 0.5);
    const [col, a] = clouds[(Math.random() * clouds.length) | 0];
    for (const ox of [-w, 0, w]) {
      const g = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, rx);
      g.addColorStop(0, hexA(col, a * 0.55));
      g.addColorStop(0.45, hexA(col, a * 0.18));
      g.addColorStop(1, hexA(col, 0));
      ctx.save();
      ctx.translate(x + ox, y);
      ctx.scale(1, ry / rx);
      ctx.translate(-(x + ox), -y);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  // faint galactic band
  const band = ctx.createLinearGradient(0, h * 0.28, 0, h * 0.72);
  band.addColorStop(0, 'rgba(60,120,200,0)');
  band.addColorStop(0.5, 'rgba(80,140,220,0.06)');
  band.addColorStop(1, 'rgba(60,120,200,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, w, h);

  // stars
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 1.15;
    const a = 0.18 + Math.random() * 0.75;
    ctx.fillStyle = `rgba(${200 + Math.random() * 55 | 0},${225 + Math.random() * 30 | 0},255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 18);
    g.addColorStop(0, 'rgba(210,245,255,0.9)');
    g.addColorStop(0.2, 'rgba(140,220,255,0.35)');
    g.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 18, y - 18, 36, 36);
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function hexA(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Vertical light pillar with soft falloff. */
export function makePillarTexture() {
  const w = 32, h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const lg = ctx.createLinearGradient(0, 0, w, 0);
  lg.addColorStop(0, 'rgba(0,0,0,1)');
  lg.addColorStop(0.5, 'rgba(0,0,0,0)');
  lg.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const SHIELD_VERT = /* glsl */`  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const SHIELD_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uAlert;
  uniform float uFlash;
  uniform vec3 uColor;
  uniform vec4 uHits[4];
  uniform float uHitPow[4];

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  varying vec3 vPos;

  float hexEdge(vec2 p) {
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 q = abs(gv);
    float c = max(dot(q, vec2(0.8660254, 0.5)), q.y);
    return smoothstep(0.455, 0.5, c);
  }

  void main() {
    vec3 n = normalize(vPos);
    float fres = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), 3.0);
    vec2 p = vUv * vec2(26.0, 15.0);
    p.x += uTime * 0.02;
    float edge = hexEdge(p);
    float dotc = 1.0 - smoothstep(0.0, 0.08, length(fract(p) - 0.5));
    float scan = smoothstep(0.004, 0.0, abs(fract(vUv.y * 2.0 - uTime * 0.07) - 0.5));

    float ripple = 0.0;
    for (int i = 0; i < 4; i++) {
      float age = uTime - uHits[i].w;
      if (age > 0.0 && age < 3.0) {
        float ang = acos(clamp(dot(n, normalize(uHits[i].xyz)), -1.0, 1.0));
        float rad = age * 2.4;
        float ring = smoothstep(0.14, 0.0, abs(ang - rad));
        ripple += ring * exp(-age * 1.35) * uHitPow[i];
      }
    }

    vec3 col = uColor;
    col = mix(col, vec3(1.0, 0.10, 0.22), uAlert * 0.32);
    float alpha = fres * (0.26 + uAlert * 0.10) + edge * 0.105 + dotc * 0.012 + scan * 0.045;
    alpha += ripple * 0.7 + uFlash * 0.35;
    alpha *= smoothstep(0.0, 0.10, vUv.y);
    vec3 outCol = col * (0.75 + ripple * 2.0 + uFlash * 1.2) + vec3(0.55, 0.95, 1.0) * ripple * 0.7;
    gl_FragColor = vec4(outCol, clamp(alpha, 0.0, 0.85));
  }
`;

export const GROUND_VERT = /* glsl */`
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const GROUND_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vPos;

  float hex(vec2 p) {
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 q = abs(gv);
    float c = max(dot(q, vec2(0.8660254, 0.5)), q.y);
    return smoothstep(0.465, 0.5, c);
  }

  void main() {
    float d = length(vPos.xz);
    float fade = smoothstep(250.0, 26.0, d);
    float grid = hex(vPos.xz * 0.62);
    float fine = hex(vPos.xz * 2.1);
    float rings = smoothstep(0.06, 0.0, abs(fract(d / 8.0) - 0.5) * 8.0 - 3.9);
    float pulse = smoothstep(0.5, 0.0, abs(d - mod(uTime * 7.0, 110.0))) * 0.5;

    vec3 col = vec3(0.004, 0.014, 0.025);
    col += uColor * grid * 0.16 * fade;
    col += uColor * fine * 0.045 * fade;
    col += uColor * rings * 0.05 * fade;
    col += uColor * pulse * 0.06;
    col += vec3(0.02, 0.09, 0.13) * smoothstep(90.0, 6.0, d) * 0.7;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const CORE_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uAlert;
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vec3 v = normalize(cameraPosition - vP);
    float f = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
    float w = sin(vP.y * 4.0 + uTime * 2.2) * 0.5 + 0.5;
    vec3 base = mix(vec3(0.03, 0.3, 0.42), vec3(0.5, 0.95, 1.0), f * 0.8 + w * 0.2);
    base = mix(base, vec3(1.0, 0.18, 0.3), uAlert * 0.45);
    gl_FragColor = vec4(base * (0.12 + f * 1.0), 1.0);
  }
`;
export const CORE_VERT = /* glsl */`
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vN = normal;
    vP = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Banded gas-giant texture. */
export function makePlanetTexture() {
  const w = 1024, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const clamp255 = (v) => Math.max(0, Math.min(255, v));
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const b1 = Math.sin(t * Math.PI * 16 + Math.sin(t * Math.PI * 5) * 2.2) * 0.5 + 0.5;
    const b2 = Math.sin(t * Math.PI * 41 + 1.4) * 0.5 + 0.5;
    const b3 = Math.sin(t * Math.PI * 7 - 0.6) * 0.5 + 0.5;
    const base = [
      6 + b3 * 10,
      20 + b1 * 22 + b2 * 6,
      34 + b1 * 30 + b2 * 10,
    ];
    for (let x = 0; x < w; x++) {
      const n = (Math.random() - 0.5) * 9;
      const swirl = Math.sin((x / w) * Math.PI * 4 + t * 22) * 4;
      const i = (y * w + x) * 4;
      d[i] = clamp255(base[0] + n + swirl);
      d[i + 1] = clamp255(base[1] + n * 0.8);
      d[i + 2] = clamp255(base[2] + n * 0.6);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // storm
  const sx = w * 0.62, sy = h * 0.58;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 120);
  g.addColorStop(0, 'rgba(160,235,255,0.55)');
  g.addColorStop(0.4, 'rgba(90,190,235,0.22)');
  g.addColorStop(1, 'rgba(80,180,230,0)');
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(1, 0.38);
  ctx.translate(-sx, -sy);
  ctx.fillStyle = g;
  ctx.fillRect(sx - 130, sy - 130, 260, 260);
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export const PLANET_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const PLANET_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform vec3 uLight;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec3 n = normalize(vN);
    float d = dot(n, normalize(uLight));
    float lit = smoothstep(-0.3, 0.6, d);
    vec3 base = texture2D(map, vUv).rgb;
    vec3 col = base * (0.55 + lit * 0.8);
    float rim = pow(1.0 - abs(dot(n, normalize(cameraPosition - vW))), 3.2);
    col += vec3(0.18, 0.55, 1.0) * rim * (0.2 + lit * 0.9);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export const RING_FRAG = /* glsl */`
  uniform vec3 uColor;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float band = sin(r * 1.35) * 0.5 + 0.5;
    float band2 = sin(r * 4.1 + 1.2) * 0.5 + 0.5;
    float a = smoothstep(0.0, 6.0, r) * smoothstep(0.0, 8.0, 120.0 - r);
    a *= 0.12 + band * 0.16 + band2 * 0.07;
    gl_FragColor = vec4(uColor, a);
  }
`;
export const RING_VERT = /* glsl */`
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
