import * as THREE from 'three';

const _v = new THREE.Vector3();

/**
 * Cyber-city theme: a rain-soaked neon skyline around the ATLAS rooftop citadel.
 * Everything is procedural — no external textures.
 */
export class CityTheme {
  constructor(scene, { nodes, ringRadius, glowTex, beamTex }) {
    this.nodes = nodes;
    this.ringRadius = ringRadius;
    this.glowTex = glowTex;
    this.beamTex = beamTex;
    this.time = 0;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.beacons = [];
    this.cars = null;
    this.rain = null;

    this.buildSky();
    this.buildSkyline();
    this.buildBase();
    this.buildStreets();
    this.buildWetDeck();
    this.buildLowFog();
    this.buildBillboards();
    this.buildRain();
    this.buildSearchlights();
    this.buildSkyTraffic();
    this.buildAerialRings();
  }

  setVisible(v) {
    this.group.visible = v;
  }

  /* ------------------------------------------------------------------ sky */
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        float hash(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }
        void main() {
          float h = vDir.y;
          vec3 top = vec3(0.006, 0.005, 0.016);
          vec3 mid = vec3(0.028, 0.012, 0.055);
          vec3 horizon = vec3(0.10, 0.02, 0.12);
          vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.3, h));
          col = mix(col, top, smoothstep(0.22, 0.85, h));
          float glow = pow(max(0.0, 1.0 - abs(h) * 2.4), 5.0);
          col += vec3(0.45, 0.08, 0.35) * glow * 0.30;
          // sparse stars, mostly swallowed by light pollution
          vec2 sp = floor(vDir.xz / max(0.004, 0.01));
          float st = step(0.9965, hash(sp)) * smoothstep(0.05, 0.4, h);
          col += vec3(0.65, 0.75, 1.0) * st * 0.55;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 32), mat);
    sky.renderOrder = -30;
    sky.frustumCulled = false;
    this.group.add(sky);
    this.skyMat = mat;

    // low clouds / light pollution
    const cloudMat = new THREE.SpriteMaterial({
      map: this.glowTex, color: 0x3a0b44, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.18,
      fog: false,
    });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(cloudMat.clone());
      s.material.opacity = 0.06 + Math.random() * 0.09;
      s.position.set(
        THREE.MathUtils.randFloatSpread(420),
        70 + Math.random() * 90,
        -140 - Math.random() * 220,
      );
      s.scale.setScalar(180 + Math.random() * 260);
      this.group.add(s);
    }

    // moon
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xcfc2ff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5, fog: false,
    }));
    moon.position.set(-260, 150, -360);
    moon.scale.setScalar(90);
    this.group.add(moon);
    const moonCore = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xf2ecff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7, fog: false,
    }));
    moonCore.position.copy(moon.position);
    moonCore.scale.setScalar(34);
    this.group.add(moonCore);
  }

  /* -------------------------------------------------------------- skyline */
  buildSkyline() {
    const count = 230;
    const seeds = new Float32Array(count);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < count; i++) seeds[i] = Math.random() * 100;
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBase: { value: new THREE.Color(0x03040a) },
        uWinA: { value: new THREE.Color(0xffb066) },
        uWinB: { value: new THREE.Color(0x6fe8ff) },
        uFog: { value: new THREE.Color(0x0a0614) },
      },
      vertexShader: /* glsl */`
        attribute float aSeed;
        varying vec3 vWorld;
        varying vec3 vN;
        varying float vSeed;
        void main() {
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vN = normalize(mat3(instanceMatrix) * normal);
          vSeed = aSeed;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform vec3 uBase;
        uniform vec3 uWinA;
        uniform vec3 uWinB;
        uniform vec3 uFog;
        varying vec3 vWorld;
        varying vec3 vN;
        varying float vSeed;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }

        void main() {
          vec3 n = normalize(vN);
          float side = 1.0 - step(0.6, abs(n.y));
          vec2 wall = abs(n.x) > abs(n.z)
            ? vec2(vWorld.z, vWorld.y)
            : vec2(vWorld.x, vWorld.y);
          vec2 g = wall / vec2(1.7, 2.35);
          vec2 cell = floor(g);
          vec2 f = fract(g);
          float mask = step(0.22, f.x) * step(f.x, 0.78) * step(0.26, f.y) * step(f.y, 0.74) * side;
          float lit = step(0.63, hash21(cell + vSeed * 17.0));
          float flick = 0.72 + 0.28 * sin(uTime * (0.8 + hash21(cell) * 2.4) + vSeed * 13.0);
          vec3 wc = mix(uWinA, uWinB, hash21(cell * 1.7 + vSeed));

          vec3 col = uBase * (0.6 + 0.6 * hash21(vec2(vSeed, 3.0)));
          col += wc * mask * lit * flick * 1.05;

          // rooftop rim + vertical neon seam
          col += vec3(0.10, 0.45, 0.62) * step(0.85, n.y) * 0.18;
          float seam = smoothstep(0.02, 0.0, abs(f.x - 0.5) - 0.46) * side;
          col += vec3(0.85, 0.10, 0.55) * seam * step(0.88, hash21(vec2(vSeed, 9.0))) * 0.35;

          float distanceFog = smoothstep(80.0, 330.0, distance(vWorld, cameraPosition));
          col = mix(col, uFog, distanceFog);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const tops = [];
    let idx = 0;

    const place = (rMin, rMax, hMin, hMax, n) => {
      for (let k = 0; k < n && idx < count; k++, idx++) {
        let a = Math.random() * Math.PI * 2;
        const r = rMin + Math.pow(Math.random(), 0.85) * (rMax - rMin);
        // keep a viewing corridor around the default camera azimuth
        if (r < 115 && Math.abs(Math.atan2(Math.sin(a - 0.55), Math.cos(a - 0.55))) < 0.42) {
          a += 0.85;
        }
        const w = 4.5 + Math.random() * 9;
        const d = 4.5 + Math.random() * 9;
        const h = hMin + Math.pow(Math.random(), 1.4) * (hMax - hMin);
        dummy.position.set(Math.cos(a) * r, -45 + h / 2, Math.sin(a) * r);
        dummy.rotation.y = Math.random() * 0.5;
        dummy.scale.set(w, h, d);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        tops.push({ x: dummy.position.x, y: -45 + h + 2.2, z: dummy.position.z, h, r });
      }
    };

    place(78, 250, 10, 82, 212);
    place(130, 300, 110, 210, 18);
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
    this.skylineMat = mat;

    // warning beacons on the tallest towers
    const beaconMat = new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xff2040, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
    });
    tops.sort((a, b) => b.h - a.h);
    for (let i = 0; i < 22; i++) {
      const t = tops[i];
      if (!t) break;
      const s = new THREE.Sprite(beaconMat.clone());
      s.position.set(t.x, t.y, t.z);
      s.scale.setScalar(2.4);
      this.group.add(s);
      this.beacons.push({ sprite: s, phase: Math.random() * 6.28 });
    }
  }

  /* ----------------------------------------------------------------- base */
  buildBase() {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(26.4, 31.5, 48, 64, 1, false),
      new THREE.MeshBasicMaterial({ color: 0x04060c, fog: true }),
    );
    base.position.y = -24;
    this.group.add(base);

    // neon bands around the mega-tower
    for (let i = 0; i < 5; i++) {
      const y = -3 - i * 9.5;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(26.5 + i * 0.9, 0.08, 6, 160),
        new THREE.MeshBasicMaterial({
          color: i % 2 ? 0xff2e88 : 0x5ef2ff,
          transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.group.add(ring);
    }

    // vertical light seams
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = 27.7;
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 42, 0.12),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0xff2e88 : 0x4fe6ff,
          transparent: true, opacity: 0.24,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      strip.position.set(Math.cos(a) * r, -24, Math.sin(a) * r);
      this.group.add(strip);
    }

    // huge facade sign facing the default camera
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 5),
      new THREE.MeshBasicMaterial({
        map: this.makeSignTexture('ATLAS', 'DEFENSE GRID · SECTOR 07', '#5ef2ff', '#ff2e88'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        opacity: 0.9,
      }),
    );
    sign.position.set(0, -7, 31.8);
    this.group.add(sign);
  }

  /* -------------------------------------------------------------- streets */
  buildStreets() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec3 vWorld;
        void main() {
          vec2 p = vWorld.xz / 26.0;
          vec2 f = abs(fract(p) - 0.5);
          float road = smoothstep(0.465, 0.5, max(f.x, f.y));
          float lane = smoothstep(0.494, 0.5, max(f.x, f.y));
          float d = length(vWorld.xz);
          vec3 col = vec3(0.004, 0.005, 0.010);
          col += vec3(0.10, 0.44, 0.58) * lane * 0.55;
          col += vec3(0.40, 0.05, 0.34) * road * 0.08;
          // moving light streaks along the grid
          float streak = smoothstep(0.04, 0.0, abs(fract(vWorld.x / 26.0 + uTime * 0.03) - 0.5) - 0.44);
          col += vec3(0.9, 0.45, 0.15) * streak * 0.10;
          col = mix(col, vec3(0.03, 0.012, 0.05), smoothstep(100.0, 380.0, d));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -44.7;
    this.group.add(ground);
    this.streetMat = mat;

    // traffic lights
    const n = 260;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.carData = [];
    const colors = [
      new THREE.Color(0xfff2cc), new THREE.Color(0xff3b4e),
      new THREE.Color(0x6fe8ff), new THREE.Color(0xffb347),
    ];
    for (let i = 0; i < n; i++) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const lane = -190 + Math.random() * 380;
      const t = -190 + Math.random() * 380;
      const c = colors[(Math.random() * colors.length) | 0];
      pos[i * 3] = axis === 'x' ? t : lane;
      pos[i * 3 + 1] = -44.2 + Math.random() * 0.4;
      pos[i * 3 + 2] = axis === 'x' ? lane : t;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      this.carData.push({ axis, lane, t, speed: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 8), color: c });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.carPoints = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 2.4, vertexColors: true, transparent: true, opacity: 0.9,
      map: this.glowTex, blending: THREE.AdditiveBlending, depthWrite: false,
      sizeAttenuation: true,
    }));
    this.carPoints.frustumCulled = false;
    this.group.add(this.carPoints);
  }

  /* ------------------------------------------------------------ wet deck */
  buildWetDeck() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        varying vec2 vP;
        void main() {
          vP = position.xy;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec2 vP;
        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }
        void main() {
          float d = length(vP);
          vec2 cell = floor(vP / 5.2);
          vec2 f = fract(vP / 5.2) - 0.5;
          float seed = hash21(cell);
          float life = fract(uTime * 0.32 + seed);
          float ring = smoothstep(0.035, 0.0, abs(length(f) - life * 0.52));
          ring *= (1.0 - life) * step(0.42, seed);

          vec2 cell2 = floor(vP / 8.5 + 3.1);
          vec2 f2 = fract(vP / 8.5 + 3.1) - 0.5;
          float seed2 = hash21(cell2);
          float life2 = fract(uTime * 0.22 + seed2);
          float ring2 = smoothstep(0.03, 0.0, abs(length(f2) - life2 * 0.55));
          ring2 *= (1.0 - life2) * step(0.6, seed2);

          float sheen = smoothstep(25.5, 3.0, d) * 0.035;
          vec3 tint = mix(vec3(0.10, 0.48, 0.62), vec3(0.72, 0.14, 0.48), hash21(cell + 5.0));
          float a = (ring * 0.18 + ring2 * 0.12) * smoothstep(26.3, 22.0, d) + sheen;
          gl_FragColor = vec4(tint, a);
        }
      `,
    });
    const deck = new THREE.Mesh(new THREE.CircleGeometry(26.3, 96), mat);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = 0.11;
    this.group.add(deck);
    this.wetMat = mat;
  }

  /* ------------------------------------------------------------ low fog */
  buildLowFog() {
    this.fogLayers = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.glowTex,
        color: i % 2 ? 0x2a0a3a : 0x0a2a3a,
        transparent: true,
        opacity: 0.09 + i * 0.015,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -6 - i * 9;
      mesh.scale.setScalar(0.75 + i * 0.16);
      this.group.add(mesh);
      this.fogLayers.push({ mesh, phase: i * 1.7, speed: 0.008 + i * 0.004 });
    }
  }

  /* ------------------------------------------------------------ billboards */
  buildBillboards() {    this.billboards = [];
    const items = [
      { a: 2.35, r: 58, y: 22, w: 14, h: 5.2, title: 'NEO-SHANGHAI', sub: '霓虹不夜城 · 24H 运维', c1: '#5ef2ff', c2: '#ff2e88' },
      { a: 3.35, r: 62, y: 18, w: 12, h: 4.6, title: 'DRILL 2077', sub: 'CYBER RESILIENCE', c1: '#ff2e88', c2: '#9a6bff' },
      { a: 4.35, r: 56, y: 26, w: 13, h: 4.8, title: 'ZERO DOWNTIME', sub: '核心业务 · 零中断', c1: '#57ffb0', c2: '#5ef2ff' },
      { a: 5.30, r: 60, y: 14, w: 10, h: 3.8, title: 'OPS // 07', sub: '全域可观测', c1: '#ffb347', c2: '#ff5e3a' },
    ];
    for (const it of items) {
      const mat = new THREE.SpriteMaterial({
        map: this.makeSignTexture(it.title, it.sub, it.c1, it.c2),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
        opacity: 0.92,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(Math.cos(it.a) * it.r, it.y, Math.sin(it.a) * it.r);
      sprite.scale.set(it.w, it.h, 1);
      this.group.add(sprite);
      this.billboards.push({ mesh: sprite, base: 0.72 + Math.random() * 0.18, phase: Math.random() * 6.28 });
    }
  }

  makeSignTexture(title, sub, c1, c2) {
    const w = 1024, h = 384;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(2,4,10,0.28)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = c1;
    ctx.lineWidth = 6;
    ctx.shadowColor = c1;
    ctx.shadowBlur = 22;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 40;
    ctx.shadowColor = c2;
    ctx.fillStyle = '#f2feff';
    ctx.font = 'bold 120px "Bahnschrift","Microsoft YaHei",sans-serif';
    ctx.fillText(title, w / 2, h * 0.42);
    ctx.shadowBlur = 18;
    ctx.shadowColor = c1;
    ctx.fillStyle = c1;
    ctx.font = '500 42px "Microsoft YaHei",sans-serif';
    ctx.fillText(sub, w / 2, h * 0.72);
    // scanlines
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  /* ----------------------------------------------------------------- rain */
  buildRain() {
    const n = 850;
    this.rainData = [];
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 62;
      const y = -6 + Math.random() * 62;
      const len = 1.4 + Math.random() * 2.6;
      const speed = 32 + Math.random() * 26;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x - 0.18; pos[i * 6 + 4] = y - len; pos[i * 6 + 5] = z;
      this.rainData.push({ x, z, y, len, speed });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.LineBasicMaterial({
      color: 0x9fdcff, transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
    this.rainPos = pos;
  }

  /* --------------------------------------------------------- searchlights */
  buildSearchlights() {
    this.searchlights = [];
    for (let i = 0; i < 3; i++) {
      const a = 1.2 + i * 2.1;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * 105, -44, Math.sin(a) * 105);
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 19, 120, 18, 1, true),
        new THREE.MeshBasicMaterial({
          map: this.beamTex, color: i === 1 ? 0xff2e88 : 0x5ef2ff,
          transparent: true, opacity: 0.055,
          blending: THREE.AdditiveBlending, depthWrite: false,
          side: THREE.DoubleSide, fog: false,
        }),
      );
      cone.position.y = 60;
      cone.rotation.z = 0.32;
      g.add(cone);
      this.group.add(g);
      this.searchlights.push({ group: g, phase: i * 2.1, speed: 0.06 + i * 0.02 });
    }
  }

  /* ---------------------------------------------------------- flying cars */
  buildSkyTraffic() {
    const n = 90;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.airData = [];
    const palette = [0xfff2cc, 0xff3b4e, 0x6fe8ff, 0xffb347];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 80;
      const y = 6 + Math.random() * 34;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(a) * r;
      const c = new THREE.Color(palette[(Math.random() * palette.length) | 0]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      this.airData.push({ a, r, y, speed: (0.04 + Math.random() * 0.12) * (Math.random() < 0.5 ? -1 : 1) });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.airPoints = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 3.2, vertexColors: true, transparent: true, opacity: 0.9,
      map: this.glowTex, blending: THREE.AdditiveBlending, depthWrite: false,
      sizeAttenuation: true,
    }));
    this.airPoints.frustumCulled = false;
    this.group.add(this.airPoints);
    this.airPos = pos;
  }

  buildAerialRings() {
    this.aerialRings = [];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(64 + i * 18, 0.05, 5, 160),
        new THREE.MeshBasicMaterial({
          color: i ? 0xff2e88 : 0x5ef2ff, transparent: true, opacity: 0.12,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 46 + i * 14;
      this.group.add(ring);
      this.aerialRings.push(ring);
    }
  }

  /* ---------------------------------------------------------------- update */
  update(t, dt) {
    this.time = t;
    if (this.skylineMat) this.skylineMat.uniforms.uTime.value = t;
    if (this.streetMat) this.streetMat.uniforms.uTime.value = t;
    if (this.wetMat) this.wetMat.uniforms.uTime.value = t;
    if (this.fogLayers) {
      for (const f of this.fogLayers) {
        f.mesh.rotation.z = t * f.speed + f.phase;
        f.mesh.material.opacity = 0.08 + Math.sin(t * 0.25 + f.phase) * 0.025;
      }
    }

    // beacons blink
    for (const b of this.beacons) {
      b.sprite.material.opacity = 0.45 + Math.abs(Math.sin(t * 2.2 + b.phase)) * 0.5;
    }

    // billboards flicker
    for (const b of this.billboards) {
      const glitch = Math.sin(t * 13 + b.phase) > 0.985 ? 0.35 : 1;
      b.mesh.material.opacity = b.base * glitch * (0.9 + 0.1 * Math.sin(t * 2 + b.phase));
    }

    // rain
    if (this.rain) {
      const p = this.rainPos;
      for (let i = 0; i < this.rainData.length; i++) {
        const d = this.rainData[i];
        d.y -= d.speed * dt;
        if (d.y < -8) d.y = 56 + Math.random() * 6;
        const i6 = i * 6;
        p[i6 + 1] = d.y;
        p[i6 + 4] = d.y - d.len;
        p[i6] = d.x + Math.sin(t * 0.4 + i) * 0.05;
        p[i6 + 3] = p[i6] - 0.18;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }

    // ground traffic
    if (this.carPoints) {
      const p = this.carPoints.geometry.attributes.position.array;
      for (let i = 0; i < this.carData.length; i++) {
        const c = this.carData[i];
        c.t += c.speed * dt;
        if (c.t > 200) c.t = -200;
        if (c.t < -200) c.t = 200;
        const i3 = i * 3;
        if (c.axis === 'x') {
          p[i3] = c.t; p[i3 + 2] = c.lane;
        } else {
          p[i3] = c.lane; p[i3 + 2] = c.t;
        }
      }
      this.carPoints.geometry.attributes.position.needsUpdate = true;
    }

    // flying traffic
    if (this.airPoints) {
      const p = this.airPos;
      for (let i = 0; i < this.airData.length; i++) {
        const a = this.airData[i];
        a.a += a.speed * dt;
        p[i * 3] = Math.cos(a.a) * a.r;
        p[i * 3 + 2] = Math.sin(a.a) * a.r;
        p[i * 3 + 1] = a.y + Math.sin(t * 0.8 + i) * 0.8;
      }
      this.airPoints.geometry.attributes.position.needsUpdate = true;
    }

    // sweeping searchlights
    for (const s of this.searchlights) {
      s.group.rotation.y = t * s.speed + s.phase;
    }

    for (let i = 0; i < this.aerialRings.length; i++) {
      this.aerialRings[i].rotation.z += dt * (0.03 + i * 0.02);
    }
  }
}
