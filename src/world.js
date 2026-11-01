import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  makeGlowTexture, makeNebulaTexture, makePillarTexture, makePlanetTexture,
  SHIELD_VERT, SHIELD_FRAG, GROUND_VERT, GROUND_FRAG, CORE_VERT, CORE_FRAG,
  PLANET_VERT, PLANET_FRAG, RING_VERT, RING_FRAG,
} from './utils.js';

export const NODES = [
  { id: 'GW-01', role: '接入网关', en: 'GATEWAY', angle: 90, accent: 0x5ef2ff },
  { id: 'APP-02', role: '应用集群', en: 'APPLICATION', angle: 150, accent: 0x49b8ff },
  { id: 'CACHE-03', role: '分布式缓存', en: 'CACHE', angle: 330, accent: 0x9a6bff },
  { id: 'DB-04', role: '核心主库', en: 'PRIMARY DB', angle: 210, accent: 0xffb84d },
  { id: 'DB-05', role: '灾备备库', en: 'STANDBY DB', angle: 270, accent: 0x57ffb0 },
  { id: 'OSS-06', role: '对象存储', en: 'STORAGE', angle: 30, accent: 0x2d7bff },
];

const RING_RADIUS = 19.5;
const SHIELD_RADIUS = 14.2;

const tmpV = new THREE.Vector3();

function hexRing(radius, tube, color, opacity = 0.8) {
  const geo = new THREE.TorusGeometry(radius, tube, 6, 6);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = Math.PI / 2;
  return m;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.towers = [];
    this.hitTime = new Float32Array([-99, -99, -99, -99]);
    this.hitPow = new Float32Array([0, 0, 0, 0]);
    this.hitSlot = 0;
    this.threat = 0;
    this.shakeSeed = Math.random() * 100;

    this.glowTex = makeGlowTexture();
    this.beamTex = makePillarTexture();
    this.buildSky();
    this.buildPlanet();
    this.buildGround();
    this.buildCity();
    this.buildHorizon();
    this.buildPlatform();
    this.buildCore();
    this.buildTowers();
    this.buildShield();
    this.buildOrbitals();
    this.buildConduits();
  }

  /* ------------------------------------------------------------------ sky */
  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(430, 64, 32),
      new THREE.MeshBasicMaterial({
        map: makeNebulaTexture(), side: THREE.BackSide, fog: false, depthWrite: false,
      }),
    );
    sky.renderOrder = -20;
    this.scene.add(sky);

    const count = 2400;
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 90 + Math.random() * 280;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(THREE.MathUtils.randFloatSpread(2));
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      pos[i * 3 + 1] = Math.abs(Math.cos(ph)) * r * 0.85 - 30;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
      size[i] = 0.7 + Math.pow(Math.random(), 3) * 3.2;
      phase[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));

    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPR: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSize;
        attribute float aPhase;
        uniform float uTime;
        uniform float uPR;
        varying float vTw;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPR * (260.0 / max(-mv.z, 1.0));
          vTw = 0.62 + 0.38 * sin(uTime * 0.8 + aPhase);
        }
      `,
      fragmentShader: /* glsl */`
        varying float vTw;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(0.62, 0.86, 1.0) * vTw, a * 0.85);
        }
      `,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.scene.add(this.stars);
  }

  /* ---------------------------------------------------------------- planet */
  buildPlanet() {
    const g = new THREE.Group();
    g.position.set(-440, 62, -334);
    g.rotation.set(0.28, 0.55, -0.16);
    this.scene.add(g);
    this.planetGroup = g;
    g.scale.setScalar(0.52);

    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(58, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: {
          map: { value: makePlanetTexture() },
          uLight: { value: new THREE.Vector3(0.35, 0.22, 1.0) },
        },
        vertexShader: PLANET_VERT,
        fragmentShader: PLANET_FRAG.replace('vec3 base = texture2D(map, vUv).rgb;', 'vec3 base = pow(texture2D(map, vUv).rgb, vec3(2.2));'),
      }),
    );
    g.add(planet);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(66, 128, 180, 1),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0x6cb9ff) } },
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = 0.12;
    g.add(ring);

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(9, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0x24405c }),
    );
    moon.position.set(96, 28, 42);
    g.add(moon);
    const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0x77baff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.2,
    }));
    moonGlow.scale.setScalar(34);
    moonGlow.position.copy(moon.position);
    g.add(moonGlow);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0x2f7fd0, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.12,
    }));
    halo.scale.setScalar(130);
    halo.position.z = -20;
    g.add(halo);
  }

  /* ---------------------------------------------------------------- ground */
  buildGround() {
    const groundMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x2fd9ff) } },
      vertexShader: GROUND_VERT,
      fragmentShader: GROUND_FRAG,
      depthWrite: true,
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(280, 160), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.8;
    this.scene.add(ground);
    this.groundMat = groundMat;
  }

  /* ---------------------------------------------------------------- city */
  buildCity() {
    // Distant megacity: a band of lights and a few silhouettes — readable as scale,
    // without competing with the defence ring in the foreground.
    const pos = [];
    const col = [];
    const cyan = new THREE.Color(0x64e8ff);
    const amber = new THREE.Color(0xffb45c);
    const white = new THREE.Color(0xd9f6ff);
    for (let i = 0; i < 1100; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 66 + Math.pow(Math.random(), 0.55) * 190;
      const y = 0.3 + Math.pow(Math.random(), 2.1) * 9;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      const c = Math.random() < 0.62 ? cyan : Math.random() < 0.7 ? amber : white;
      col.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const lights = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 1.9, vertexColors: true, transparent: true, opacity: 0.8,
      map: this.glowTex, blending: THREE.AdditiveBlending, depthWrite: false,
      sizeAttenuation: true,
    }));
    lights.frustumCulled = false;
    this.scene.add(lights);

    // antenna masts with aircraft-warning lights
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const r = 52 + Math.random() * 26;
      const h = 10 + Math.random() * 12;
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.22, h, 4),
        new THREE.MeshBasicMaterial({ color: 0x0a2130 }),
      );
      mast.position.set(Math.cos(a) * r, h / 2 - 0.7, Math.sin(a) * r);
      this.scene.add(mast);
      const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xff3048, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75,
      }));
      beacon.position.set(Math.cos(a) * r, h - 0.4, Math.sin(a) * r);
      beacon.scale.setScalar(1.8);
      this.scene.add(beacon);
    }
  }

  /* -------------------------------------------------------------- horizon */
  buildHorizon() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x1f8fae) } },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float a = pow(1.0 - vUv.y, 2.6) * 0.5;
          a *= smoothstep(0.0, 0.05, vUv.y);
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(238, 238, 70, 72, 1, true), mat);
    cyl.position.y = 34;
    this.scene.add(cyl);
  }

  /* ------------------------------------------------------------- platform */
  buildPlatform() {
    const g = new THREE.Group();
    this.platform = g;
    this.scene.add(g);

    const discMat = new THREE.MeshBasicMaterial({ color: 0x06131d, transparent: true, opacity: 0.96 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(26.6, 25.4, 0.9, 96), discMat);
    disc.position.y = -0.45;
    g.add(disc);

    // glowing concentric rings
    const r1 = hexRing(26.6, 0.055, 0x4fe6ff, 0.75); r1.position.y = 0.02; g.add(r1);
    const r2 = hexRing(20.2, 0.03, 0x4fe6ff, 0.28); r2.position.y = 0.03; g.add(r2);
    const r3 = hexRing(11.5, 0.045, 0x7fe9ff, 0.45); r3.position.y = 0.03; g.add(r3);
    const r4 = hexRing(26.0, 0.16, 0x1a6f80, 0.18); r4.position.y = -0.5; g.add(r4);

    const grid = new THREE.GridHelper(52, 26, 0x1b6273, 0x0a2630);
    grid.position.y = 0.02;
    grid.material.transparent = true;
    grid.material.opacity = 0.28;
    g.add(grid);

    // hex-panel overlay on the deck
    const deckMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x3fe0ff) } },
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
        uniform vec3 uColor;
        varying vec2 vP;
        float hexLine(vec2 p) {
          vec2 r = vec2(1.0, 1.7320508);
          vec2 h = r * 0.5;
          vec2 a = mod(p, r) - h;
          vec2 b = mod(p - h, r) - h;
          vec2 gv = dot(a, a) < dot(b, b) ? a : b;
          vec2 q = abs(gv);
          float c = max(dot(q, vec2(0.8660254, 0.5)), q.y);
          return smoothstep(0.462, 0.5, c);
        }
        void main() {
          float d = length(vP);
          float fade = smoothstep(26.4, 2.0, d);
          float hex1 = hexLine(vP * 0.9);
          float hex2 = hexLine(vP * 0.32);
          float ring = smoothstep(0.03, 0.0, abs(fract(d / 6.5) - 0.5) * 6.5 - 2.9);
          float scan = smoothstep(1.4, 0.0, abs(d - mod(uTime * 9.0, 60.0))) * 0.5;
          float a = hex1 * 0.14 * fade + hex2 * 0.05 * fade + ring * 0.07 + scan * 0.05;
          a *= smoothstep(26.6, 20.0, d);
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    const deck = new THREE.Mesh(new THREE.CircleGeometry(26.4, 96), deckMat);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = 0.028;
    g.add(deck);
    this.deckMat = deckMat;

    // pool of light under the core
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46),
      new THREE.MeshBasicMaterial({
        map: this.glowTex, color: 0x1f9fc4, transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.05;
    g.add(pool);

    // rim beacons
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const dot = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.05, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x53e9ff, transparent: true, opacity: 0.75 }),
      );
      dot.position.set(Math.cos(a) * 25.9, 0.12, Math.sin(a) * 25.9);
      dot.rotation.y = -a;
      g.add(dot);
    }

    // radial spokes toward towers
    for (let i = 0; i < 6; i++) {
      const a = THREE.MathUtils.degToRad(NODES[i].angle);
      const len = 19.5;
      const spoke = new THREE.Mesh(
        new THREE.PlaneGeometry(0.055, len),
        new THREE.MeshBasicMaterial({
          color: 0x3ad7f2, transparent: true, opacity: 0.16,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      spoke.rotation.x = -Math.PI / 2;
      spoke.rotation.z = -a + Math.PI / 2;
      spoke.position.set(Math.cos(a) * len * 0.55, 0.035, Math.sin(a) * len * 0.55);
      g.add(spoke);
    }

    // three-tier hexagonal altar under the core
    const tiers = [
      { rTop: 9.0, rBot: 9.8, h: 0.55, y: 0.28 },
      { rTop: 7.2, rBot: 8.5, h: 0.62, y: 0.85 },
      { rTop: 5.2, rBot: 6.6, h: 0.7, y: 1.5 },
    ];
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const tier = new THREE.Mesh(
        new THREE.CylinderGeometry(t.rTop, t.rBot, t.h, 6),
        new THREE.MeshBasicMaterial({ color: i === 2 ? 0x0a2431 : 0x06141d }),
      );
      tier.position.y = t.y;
      tier.rotation.y = Math.PI / 6;
      g.add(tier);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.CylinderGeometry(t.rTop, t.rBot, t.h, 6)),
        new THREE.LineBasicMaterial({
          color: 0x43d8f0, transparent: true, opacity: 0.3,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      edge.position.y = t.y;
      edge.rotation.y = Math.PI / 6;
      g.add(edge);
      const rim = hexRing(t.rTop - 0.02, 0.045 + i * 0.01, 0x62eaff, 0.55 + i * 0.12);
      rim.position.y = t.y + t.h / 2;
      g.add(rim);
    }

    // glowing conduits on the altar
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.03, 4.4),
        new THREE.MeshBasicMaterial({
          color: 0x4fe6ff, transparent: true, opacity: 0.22,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      strip.position.set(Math.cos(a) * 3.4, 1.9, Math.sin(a) * 3.4);
      strip.rotation.y = -a;
      g.add(strip);
    }
  }

  /* ----------------------------------------------------------------- core */
  buildCore() {
    const g = new THREE.Group();
    g.position.y = 8.2;
    this.core = g;
    this.scene.add(g);

    this.coreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAlert: { value: 0 },
      },
      vertexShader: CORE_VERT,
      fragmentShader: CORE_FRAG,
      transparent: true,
    });
    const aura = new THREE.Mesh(new THREE.SphereGeometry(3.6, 32, 24), this.coreMat);
    aura.scale.set(1, 1.5, 1);
    aura.visible = false;
    g.add(aura);
    this.coreAura = aura;

    const orbGeo = new THREE.OctahedronGeometry(2.35, 0);
    const orb = new THREE.Mesh(
      orbGeo,
      new THREE.MeshBasicMaterial({ color: 0x1b6d86, transparent: true, opacity: 1 }),
    );
    orb.scale.set(1, 1.5, 1);
    g.add(orb);
    this.coreOrb = orb;

    const shell = new THREE.Mesh(
      orbGeo,
      new THREE.MeshBasicMaterial({
        color: 0x5ef2ff, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    shell.scale.copy(orb.scale).multiplyScalar(1.08);
    g.add(shell);
    this.coreShell = shell;

    const inner = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.8, 0),
      new THREE.MeshBasicMaterial({ color: 0xf2ffff }),
    );
    inner.scale.set(1, 1.7, 1);
    g.add(inner);
    this.innerCore = inner;

    const spark = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xaefaff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55,
    }));
    spark.scale.setScalar(7);
    g.add(spark);
    this.coreSpark = spark;

    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(orbGeo),
      new THREE.LineBasicMaterial({
        color: 0xcafcff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    wire.scale.copy(orb.scale);
    g.add(wire);
    this.coreWire = wire;

    const wire2 = wire.clone();
    wire2.scale.multiplyScalar(1.015);
    wire2.material = new THREE.LineBasicMaterial({
      color: 0x5ef2ff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    g.add(wire2);

    this.coreRings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(5.3 + i * 0.8, 0.035 + i * 0.01, 6, 120),
        new THREE.MeshBasicMaterial({
          color: i === 1 ? 0xff2e88 : 0x5ef2ff,
          transparent: true, opacity: i === 1 ? 0.55 : 0.7,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      r.rotation.set(Math.PI / 2 + i * 0.5, i * 0.4, i * 0.7);
      g.add(r);
      this.coreRings.push(r);
    }

    this.shards = [];
    const shardGeo = new THREE.OctahedronGeometry(0.22, 0);
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(shardGeo, new THREE.MeshBasicMaterial({ color: 0x8ff7ff }));
      s.userData = {
        a: (i / 12) * Math.PI * 2,
        r: 7.2 + Math.random() * 1.4,
        y: THREE.MathUtils.randFloatSpread(3),
        sp: 0.25 + Math.random() * 0.4,
        ph: Math.random() * Math.PI * 2,
      };
      g.add(s);
      this.shards.push(s);
    }

    // energy column linking the altar to the core
    const columnMat = new THREE.MeshBasicMaterial({
      map: this.beamTex, color: 0x59e8ff, transparent: true, opacity: 0.34,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const column = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.0, 6.1, 18, 1, true), columnMat);
    column.position.y = -3.1;
    g.add(column);

    this.columnRings = [];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.85 + i * 0.25, 0.025, 5, 64),
        new THREE.MeshBasicMaterial({
          color: i ? 0xff2e88 : 0x5ef2ff, transparent: true, opacity: 0.45,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -2.2 - i * 1.5;
      g.add(ring);
      this.columnRings.push(ring);
    }

    // double helix
    for (let k = 0; k < 2; k++) {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const u = i / 60;
        const ang = u * Math.PI * 5 + k * Math.PI;
        pts.push(new THREE.Vector3(Math.cos(ang) * 1.55, -6.0 + u * 5.9, Math.sin(ang) * 1.55));
      }
      const helix = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.018, 4, false),
        new THREE.MeshBasicMaterial({
          color: 0x8ff7ff, transparent: true, opacity: 0.4,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      g.add(helix);
    }

    // sky beam from the core
    const coreBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 0.5, 26, 16, 1, true),
      new THREE.MeshBasicMaterial({
        map: this.beamTex, color: 0x6beeff, transparent: true, opacity: 0.1,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    coreBeam.position.y = 12;
    g.add(coreBeam);
    this.coreBeam = coreBeam;

    // expanding energy pulses
    this.shockRings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.025, 5, 96),
        new THREE.MeshBasicMaterial({
          color: 0x7ff4ff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.userData.t = i * 1.6;
      g.add(ring);
      this.shockRings.push(ring);
    }

    // halo + light pillar
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0x4fe6ff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6,
    }));
    halo.scale.setScalar(13);
    g.add(halo);
    this.coreHalo = halo;

    const pillarMat = new THREE.MeshBasicMaterial({
      map: this.beamTex, color: 0x5ef2ff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      opacity: 0.32,
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.2, 20, 24, 1, true), pillarMat);
    pillar.position.y = -2;
    g.add(pillar);
    this.pillar = pillar;

    const groundBeam = new THREE.Mesh(
      new THREE.CircleGeometry(9, 64),
      new THREE.MeshBasicMaterial({
        color: 0x2bd9ff, transparent: true, opacity: 0.12,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    groundBeam.rotation.x = -Math.PI / 2;
    groundBeam.position.y = -8.1;
    g.add(groundBeam);
  }

  /* ---------------------------------------------------------------- towers */
  buildTowers() {
    for (let i = 0; i < NODES.length; i++) {
      const node = NODES[i];
      const a = THREE.MathUtils.degToRad(node.angle);
      const x = Math.cos(a) * RING_RADIUS;
      const z = Math.sin(a) * RING_RADIUS;
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      grp.rotation.y = -a + Math.PI / 2;
      grp.scale.setScalar(1.2);
      this.scene.add(grp);

      const baseMat = new THREE.MeshBasicMaterial({ color: 0x06141e });
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0x0a2230 });
      const dark = new THREE.LineBasicMaterial({
        color: node.accent, transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const glowMat = new THREE.MeshBasicMaterial({
        color: node.accent, transparent: true, opacity: 0.75,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });

      // stepped hex plinth
      const base1 = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.95, 0.5, 6), baseMat);
      base1.position.y = 0.25;
      grp.add(base1);
      const base2 = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.55, 0.62, 6), baseMat);
      base2.position.y = 0.8;
      grp.add(base2);
      const edge1 = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.CylinderGeometry(2.7, 2.95, 0.5, 6)), dark,
      );
      edge1.position.y = 0.25;
      grp.add(edge1);
      const edge2 = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.CylinderGeometry(2.25, 2.55, 0.62, 6)), dark,
      );
      edge2.position.y = 0.8;
      grp.add(edge2);
      const rim1 = new THREE.Mesh(new THREE.TorusGeometry(2.72, 0.045, 6, 6), glowMat);
      rim1.rotation.x = Math.PI / 2;
      rim1.position.y = 0.52;
      grp.add(rim1);
      const rim2 = new THREE.Mesh(new THREE.TorusGeometry(2.22, 0.035, 6, 6), glowMat);
      rim2.rotation.x = Math.PI / 2;
      rim2.position.y = 1.12;
      grp.add(rim2);

      const pad = new THREE.Mesh(
        new THREE.CircleGeometry(3.15, 32),
        new THREE.MeshBasicMaterial({
          color: node.accent, transparent: true, opacity: 0.13,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.02;
      grp.add(pad);

      // three buttresses
      for (let b = 0; b < 3; b++) {
        const ba = (b / 3) * Math.PI * 2 + Math.PI / 6;
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.42), bodyMat);
        strut.position.set(Math.cos(ba) * 1.55, 1.85, Math.sin(ba) * 1.55);
        strut.rotation.y = -ba;
        strut.rotation.z = Math.cos(ba) * 0.16;
        strut.rotation.x = -Math.sin(ba) * 0.16;
        grp.add(strut);
      }

      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.42, 3.6, 6), bodyMat);
      body.position.y = 3.05;
      grp.add(body);
      const bodyEdge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.95, 1.42, 3.6, 6)), dark,
      );
      bodyEdge.position.y = 3.05;
      grp.add(bodyEdge);
      const bodyGlow = new THREE.Mesh(
        new THREE.CylinderGeometry(1.0, 1.48, 3.5, 6),
        new THREE.MeshBasicMaterial({
          color: node.accent, transparent: true, opacity: 0.055,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      bodyGlow.position.y = 3.05;
      grp.add(bodyGlow);

      // vertical energy ribs
      for (let r = 0; r < 6; r++) {
        const ra = (r / 6) * Math.PI * 2;
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.9, 0.05), glowMat);
        rib.position.set(Math.cos(ra) * 1.16, 3.0, Math.sin(ra) * 1.16);
        grp.add(rib);
      }

      const collar = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.055, 6, 6), glowMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 4.92;
      grp.add(collar);

      // crystal cradle
      const cradle = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.03, 5, 40), glowMat);
      cradle.rotation.x = Math.PI / 2.2;
      cradle.position.y = 6.15;
      grp.add(cradle);
      const cradle2 = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.025, 5, 40), glowMat);
      cradle2.rotation.set(Math.PI / 2, 0.7, 0.3);
      cradle2.position.y = 6.15;
      grp.add(cradle2);

      const crystalMat = new THREE.MeshBasicMaterial({ color: node.accent, transparent: true, opacity: 0.96 });
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.92, 0), crystalMat);
      crystal.position.y = 6.25;
      grp.add(crystal);
      const crystalCore = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.38, 0),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      crystalCore.position.y = 6.25;
      grp.add(crystalCore);

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: node.accent, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45,
      }));
      halo.scale.setScalar(2.6);
      halo.position.y = 6.25;
      grp.add(halo);

      const ringOrbit = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.022, 5, 48), glowMat);
      ringOrbit.position.y = 6.15;
      ringOrbit.rotation.x = Math.PI / 2.5;
      grp.add(ringOrbit);

      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 1.9, 4),
        new THREE.MeshBasicMaterial({ color: 0x3f9db0, transparent: true, opacity: 0.5 }),
      );
      mast.position.y = 8;
      grp.add(mast);
      const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xff5566, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      beacon.scale.setScalar(0.55);
      beacon.position.y = 8.95;
      grp.add(beacon);
      beacon.visible = false;

      const fire = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xff6a22, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55,
      }));
      fire.scale.setScalar(3.4);
      fire.position.y = 8.15;
      grp.add(fire);
      fire.visible = false;

      // sky beam — turns each node into a visible landmark
      const beamMat = new THREE.MeshBasicMaterial({
        map: this.beamTex, color: node.accent, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        opacity: 0.055,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.12, 19, 10, 1, true), beamMat);
      beam.position.y = 15.2;
      grp.add(beam);

      // label
      const el = document.createElement('div');
      el.className = 'node-tag';
      el.innerHTML = `<b>${node.id}</b><em>${node.role}</em><div class="bar"><i></i></div>`;
      const label = new CSS2DObject(el);
      label.position.set(0, 10.4, 0);
      grp.add(label);

      this.towers.push({
        index: i, node, group: grp, crystal, crystalMat, crystalCore,
        halo, haloMat: halo.material, collar, cradle, cradle2, ringOrbit,
        spine: beam, beamMat, label, el, beacon, fire, barEl: el.querySelector('.bar i'),
        state: 'online', health: 1, damageT: 0, labelTimer: 0, cooldown: Math.random() * 0.2,
        top: new THREE.Vector3(x, 6.25 * 1.2, z),
        basePos: new THREE.Vector3(x, 0, z),
        accent: new THREE.Color(node.accent),
      });
    }
  }

  /* ---------------------------------------------------------------- shield */
  buildShield() {
    const uniforms = {
      uTime: { value: 0 },
      uAlert: { value: 0 },
      uFlash: { value: 0 },
      uColor: { value: new THREE.Color(0x59e8ff) },
      uHits: { value: [new THREE.Vector4(0, 1, 0, -99), new THREE.Vector4(0, 1, 0, -99), new THREE.Vector4(0, 1, 0, -99), new THREE.Vector4(0, 1, 0, -99)] },
      uHitPow: { value: this.hitPow },
    };
    this.shieldMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: SHIELD_VERT,
      fragmentShader: SHIELD_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });
    // A dome sitting on the platform — reads as a defence bubble instead of a solid orb.
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(SHIELD_RADIUS, 120, 64, 0, Math.PI * 2, 0, Math.PI * 0.52),
      this.shieldMat,
    );
    shield.position.y = 0.35;
    this.shield = shield;
    this.shieldCenter = new THREE.Vector3(0, 0.35, 0);
    this.scene.add(shield);

    // emitter ring at the base
    const base = new THREE.Mesh(
      new THREE.TorusGeometry(SHIELD_RADIUS, 0.07, 8, 180),
      new THREE.MeshBasicMaterial({
        color: 0x6beeff, transparent: true, opacity: 0.65,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    base.rotation.x = Math.PI / 2;
    base.position.y = 0.4;
    this.shieldBase = base;
    this.scene.add(base);

    const baseGlow = new THREE.Mesh(
      new THREE.RingGeometry(SHIELD_RADIUS - 0.8, SHIELD_RADIUS + 2.2, 128),
      new THREE.MeshBasicMaterial({
        color: 0x2bd9ff, transparent: true, opacity: 0.10,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    baseGlow.rotation.x = -Math.PI / 2;
    baseGlow.position.y = 0.06;
    this.scene.add(baseGlow);

    // six emitters around the dome
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const emitter = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.42, 2.4, 4),
        new THREE.MeshBasicMaterial({ color: 0x0a2634 }),
      );
      emitter.position.set(Math.cos(a) * SHIELD_RADIUS, 1.2, Math.sin(a) * SHIELD_RADIUS);
      this.scene.add(emitter);
      const cap = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.22, 0),
        new THREE.MeshBasicMaterial({ color: 0x7ff4ff }),
      );
      cap.position.set(Math.cos(a) * SHIELD_RADIUS, 2.55, Math.sin(a) * SHIELD_RADIUS);
      this.scene.add(cap);
    }
  }

  buildOrbitals() {
    this.orbitals = [];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(31 + i * 4.5, 0.018, 4, 180),
        new THREE.MeshBasicMaterial({
          color: i ? 0xff2e88 : 0x5ef2ff, transparent: true, opacity: 0.12,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2 + (i ? 0.08 : -0.04);
      ring.position.y = 2 + i * 1.2;
      this.scene.add(ring);
      this.orbitals.push(ring);
    }
  }

  /* -------------------------------------------------------------- conduits */
  buildConduits() {
    this.conduits = [];
    const corePos = new THREE.Vector3(0, 8.2, 0);
    for (const tw of this.towers) {
      const start = tw.top.clone();
      const mid = start.clone().lerp(corePos, 0.5).add(new THREE.Vector3(0, 3.4, 0));
      const curve = new THREE.QuadraticBezierCurve3(start, mid, corePos.clone());
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 36, 0.018, 4, false),
        new THREE.MeshBasicMaterial({
          color: tw.node.accent, transparent: true, opacity: 0.16,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      this.scene.add(tube);

      const n = 8;
      const pos = new Float32Array(n * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        map: this.glowTex, color: tw.node.accent, size: 1.05, transparent: true,
        opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
        sizeAttenuation: true,
      }));
      pts.frustumCulled = false;
      this.scene.add(pts);
      this.conduits.push({ curve, pts, pos, n, offset: Math.random(), speed: 0.1 + Math.random() * 0.06 });
    }
  }

  updateConduits(t) {
    for (const c of this.conduits) {
      for (let i = 0; i < c.n; i++) {
        let u = (t * c.speed + c.offset + i / c.n) % 1;
        if (u < 0) u += 1;
        const p = c.curve.getPoint(u);
        c.pos[i * 3] = p.x;
        c.pos[i * 3 + 1] = p.y;
        c.pos[i * 3 + 2] = p.z;
      }
      c.pts.geometry.attributes.position.needsUpdate = true;
    }
  }

  /* ------------------------------------------------------------------ api */
  get shieldRadius() { return SHIELD_RADIUS; }

  hitShield(worldPoint, power = 1) {
    const dir = tmpV.copy(worldPoint).sub(this.shieldCenter);
    dir.y = Math.max(dir.y, 0.2);
    dir.normalize();
    const i = this.hitSlot++ % 4;
    this.hitTime[i] = this.shieldMat.uniforms.uTime.value;
    this.hitPow[i] = Math.min(1.6, power);
    this.shieldMat.uniforms.uHits.value[i].set(dir.x, dir.y, dir.z, this.hitTime[i]);
    this.shieldMat.uniforms.uFlash.value = Math.min(0.55, this.shieldMat.uniforms.uFlash.value + power * 0.18);
  }

  setTowerState(i, health, state) {
    const t = this.towers[i];
    if (!t) return;
    t.health = health;
    if (t.state === state && state !== 'online') {
      // still refresh visual intensity
    }
    t.state = state;
    const bad = state === 'offline';
    const warn = state === 'degraded';
    if (bad) {
      t.crystalMat.color.set(0x40101a);
      t.haloMat.opacity = 0.12;
      t.haloMat.color.set(0xff2e3e);
      t.spine.material.opacity = 0.1;
      t.beacon.visible = true;
      t.fire.visible = true;
    } else if (warn) {
      t.crystalMat.color.copy(t.accent).lerp(new THREE.Color(0xffb84d), 0.5);
      t.haloMat.opacity = 0.4;
      t.haloMat.color.set(0xffb84d);
      t.spine.material.opacity = 0.5;
      t.beacon.visible = true;
      t.fire.visible = false;
    } else {
      t.crystalMat.color.copy(t.accent);
      t.haloMat.opacity = 0.55;
      t.haloMat.color.copy(t.accent);
      t.spine.material.opacity = 0.8;
      t.beacon.visible = false;
      t.fire.visible = false;
    }
    const pct = Math.round(health * 100);
    t.el.className = `node-tag ${bad ? 'bad' : warn ? 'warn' : ''}`;
    t.barEl.style.width = `${pct}%`;
  }

  setThreat(v) {
    this.threat = v;
  }

  setAlert(v) {
    this.shieldMat.uniforms.uAlert.value = v;
    this.coreMat.uniforms.uAlert.value = v * 0.8;
  }

  update(t, dt) {
    this.starMat.uniforms.uTime.value = t;
    this.groundMat.uniforms.uTime.value = t;
    this.deckMat.uniforms.uTime.value = t;
    this.shieldMat.uniforms.uTime.value = t;
    this.shieldMat.uniforms.uFlash.value = Math.max(0, this.shieldMat.uniforms.uFlash.value - dt * 1.6);
    this.coreMat.uniforms.uTime.value = t;

    const alert = this.shieldMat.uniforms.uAlert.value;
    this.shieldMat.uniforms.uAlert.value += (this.threat * 0.9 - alert) * Math.min(1, dt * 2);

    this.core.rotation.y += dt * 0.18;
    this.innerCore.rotation.y -= dt * 0.35;
    this.coreSpark.material.opacity = 0.4 + Math.sin(t * 3.1) * 0.12;
    this.coreBeam.material.opacity = 0.07 + Math.sin(t * 1.4) * 0.02;
    for (const ring of this.shockRings) {
      ring.userData.t += dt;
      if (ring.userData.t > 4.8) ring.userData.t = 0;
      const k = ring.userData.t / 4.8;
      ring.scale.setScalar(2.2 + k * 8);
      ring.material.opacity = Math.max(0, 0.5 * (1 - k) * (k < 0.05 ? k / 0.05 : 1));
    }
    this.coreWire.rotation.y += dt * 0.1;
    this.coreWire.rotation.x = Math.sin(t * 0.3) * 0.1;
    this.coreHalo.material.opacity = 0.28 + Math.sin(t * 2.4) * 0.05 + this.threat * 0.08;
    this.coreHalo.scale.setScalar(12.5 + Math.sin(t * 1.7) * 0.8);
    this.pillar.material.opacity = 0.18 + Math.sin(t * 2) * 0.04;

    for (let i = 0; i < this.coreRings.length; i++) {
      const r = this.coreRings[i];
      r.rotation.z += dt * (0.25 + i * 0.14);
      r.rotation.y += dt * (0.12 + i * 0.05);
    }
    for (const s of this.shards) {
      const u = s.userData;
      u.a += dt * u.sp;
      s.position.set(Math.cos(u.a) * u.r, u.y + Math.sin(t * 1.4 + u.ph) * 0.35, Math.sin(u.a) * u.r);
      s.rotation.x += dt * 1.2;
      s.rotation.y += dt * 0.9;
    }
    for (let i = 0; i < this.columnRings.length; i++) {
      this.columnRings[i].rotation.z += dt * (0.45 + i * 0.3);
    }

    for (const o of this.orbitals) o.rotation.z += dt * 0.03;

    for (const tw of this.towers) {
      const bad = tw.state === 'offline';
      tw.crystal.rotation.y += dt * (bad ? 0.1 : 0.9);
      tw.crystal.position.y = 6.55 + Math.sin(t * 2 + tw.index) * 0.08;
      tw.ringOrbit.rotation.z += dt * (bad ? 0.05 : 0.8);
      const pulse = bad ? 0.2 : 0.5 + Math.sin(t * 3 + tw.index) * 0.08;
      tw.beamMat.opacity = bad ? 0.008 : 0.035 + this.threat * 0.06;
      tw.beamMat.color.copy(tw.accent).lerp(new THREE.Color(0xff3344), bad ? 0.6 : 0);
      if (!bad) tw.haloMat.opacity = pulse;
      if (bad) {
        tw.haloMat.opacity = 0.1 + Math.abs(Math.sin(t * 6)) * 0.12;
        tw.crystal.position.y += Math.sin(t * 30) * 0.01;
        tw.fire.material.opacity = 0.55 + Math.random() * 0.3;
        tw.fire.scale.setScalar(3.1 + Math.random() * 1.4);
        tw.fire.position.x = (Math.random() - 0.5) * 0.5;
        tw.fire.position.y = 8.0 + Math.random() * 1.0;
      }
      tw.label.element.style.opacity = bad ? '0.55' : '0.9';
    }

    this.shield.rotation.y = t * 0.012;
    this.stars.rotation.y = t * 0.004;
    if (this.shieldBase) {
      this.shieldBase.material.opacity = 0.42 + Math.sin(t * 2.1) * 0.1 + this.shieldMat.uniforms.uFlash.value * 1.2;
      this.shieldBase.scale.setScalar(1 + Math.sin(t * 1.3) * 0.004);
    }
    this.updateConduits(t);
  }

  getTowerTop(i, out = new THREE.Vector3()) {
    return out.copy(this.towers[i].top);
  }
}

