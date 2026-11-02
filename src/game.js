import * as THREE from 'three';
import { makeGlowTexture } from './utils.js';
import { NODES } from './world.js';

const MAX_ENEMIES = 340;
const MAX_PARTICLES = 2200;

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

/* --------------------------------------------------------------- particles */
class Particles {
  constructor(scene) {
    this.max = MAX_PARTICLES;
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.size = new Float32Array(this.max);
    this.alpha = new Float32Array(this.max);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);
    this.baseSize = new Float32Array(this.max);
    this.baseCol = new Float32Array(this.max * 3);
    this.drag = new Float32Array(this.max);
    this.grav = new Float32Array(this.max);
    this.count = 0;
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.geo = geo;

    this.mat = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uPR;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPR * (260.0 / max(-mv.z, 1.0));
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a *= a;
          gl_FragColor = vec4(vColor, a * vAlpha);
        }
      `,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  spawn(p, count, opts = {}) {
    const {
      color = new THREE.Color(0xffaa44), speed = 8, spread = 1, size = 1.2,
      life = 0.9, gravity = 0, drag = 1.6, dir = null, cone = 1,
    } = opts;
    for (let k = 0; k < count; k++) {
      if (this.count >= this.max) return;
      const i = this.count++;
      const i3 = i * 3;
      this.pos[i3] = p.x + (Math.random() - 0.5) * spread;
      this.pos[i3 + 1] = p.y + (Math.random() - 0.5) * spread;
      this.pos[i3 + 2] = p.z + (Math.random() - 0.5) * spread;

      if (dir) {
        _v1.set(
          (Math.random() - 0.5) * cone,
          (Math.random() - 0.5) * cone,
          (Math.random() - 0.5) * cone,
        ).normalize().add(dir).normalize();
      } else {
        _v1.set(
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
        ).normalize();
      }
      const sp = speed * (0.35 + Math.random() * 0.9);
      this.vel[i3] = _v1.x * sp;
      this.vel[i3 + 1] = _v1.y * sp;
      this.vel[i3 + 2] = _v1.z * sp;

      const c = color.clone().offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.18);
      this.baseCol[i3] = c.r;
      this.baseCol[i3 + 1] = c.g;
      this.baseCol[i3 + 2] = c.b;
      this.col[i3] = c.r;
      this.col[i3 + 1] = c.g;
      this.col[i3 + 2] = c.b;

      this.baseSize[i] = size * (0.45 + Math.random() * 0.9);
      this.size[i] = this.baseSize[i];
      this.life[i] = life * (0.6 + Math.random() * 0.8);
      this.maxLife[i] = this.life[i];
      this.alpha[i] = 1;
      this.drag[i] = drag;
      this.grav[i] = gravity;
    }
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const i3 = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] *= d;
      this.vel[i3 + 2] *= d;
      this.vel[i3 + 1] += this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const lt = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, lt * 2.2);
      this.size[i] = this.baseSize[i] * (0.25 + lt * 0.9);
      this.col[i3] = this.baseCol[i3];
      this.col[i3 + 1] = this.baseCol[i3 + 1];
      this.col[i3 + 2] = this.baseCol[i3 + 2];

      // compact
      if (i !== alive) {
        const a3 = alive * 3;
        const b3 = i3;
        this.pos[a3] = this.pos[b3]; this.pos[a3 + 1] = this.pos[b3 + 1]; this.pos[a3 + 2] = this.pos[b3 + 2];
        this.vel[a3] = this.vel[b3]; this.vel[a3 + 1] = this.vel[b3 + 1]; this.vel[a3 + 2] = this.vel[b3 + 2];
        this.baseCol[a3] = this.baseCol[b3]; this.baseCol[a3 + 1] = this.baseCol[b3 + 1]; this.baseCol[a3 + 2] = this.baseCol[b3 + 2];
        this.col[a3] = this.col[b3]; this.col[a3 + 1] = this.col[b3 + 1]; this.col[a3 + 2] = this.col[b3 + 2];
        this.size[alive] = this.size[i]; this.baseSize[alive] = this.baseSize[i];
        this.alpha[alive] = this.alpha[i];
        this.life[alive] = this.life[i]; this.maxLife[alive] = this.maxLife[i];
        this.drag[alive] = this.drag[i]; this.grav[alive] = this.grav[i];
      }
      alive++;
    }
    this.count = alive;
    this.geo.setDrawRange(0, alive);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  clear() {
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }
}

/* -------------------------------------------------------------------- game */
export class Game {
  constructor({ scene, camera, renderer, world, sim, audio, hud }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.world = world;
    this.sim = sim;
    this.audio = audio;
    this.hud = hud;
    this.time = 0;
    this.paused = false;
    this.cinematic = false;
    this.cineT = 0;
    this.cineShot = 0;

    this.glowTex = makeGlowTexture();
    this.particles = new Particles(scene);
    this.shake = 0;
    this.bossVisible = false;
    this.bossDying = false;
    this.fireTowers = new Set();
    this.emissionAcc = 0;

    this.buildEnemies();
    this.buildLasers();
    this.buildBoss();
    this.buildRepairRing();

    this.cam = {
      yaw: 1.05, pitch: 0.44, dist: 68, fov: 46,
      target: new THREE.Vector3(0, 8, 0),
      goal: { yaw: 0.55, pitch: 0.2, dist: 46, fov: 48, target: new THREE.Vector3(0, 9, 0) },
      manual: 0,
      mode: 'wide',
    };
    this.camera.fov = this.cam.fov;
    this.camera.updateProjectionMatrix();
    this.applyCamera(1);

    this.bindEvents();
    this.bindPointer();
  }

  /* --------------------------------------------------------------- enemies */
  buildEnemies() {
    const geo = new THREE.ConeGeometry(0.42, 2.3, 4, 1);
    geo.rotateX(Math.PI / 2); // point along +Z, easier to orient
    const mat = new THREE.MeshBasicMaterial({ color: 0x8f1226, transparent: true, opacity: 0.95 });
    this.enemyMesh = new THREE.InstancedMesh(geo, mat, MAX_ENEMIES);
    this.enemyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemyMesh.frustumCulled = false;
    this.enemyMesh.count = 0;
    this.scene.add(this.enemyMesh);

    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(MAX_ENEMIES * 6);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    trailGeo.setDrawRange(0, 0);
    this.trailGeo = trailGeo;
    this.trailPos = trailPos;
    this.trails = new THREE.LineSegments(trailGeo, new THREE.LineBasicMaterial({
      color: 0xff2038, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.trails.frustumCulled = false;
    this.scene.add(this.trails);

    const glowGeo = new THREE.BufferGeometry();
    const glowPos = new Float32Array(MAX_ENEMIES * 3);
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3).setUsage(THREE.DynamicDrawUsage));
    glowGeo.setDrawRange(0, 0);
    this.glowGeo = glowGeo;
    this.glowPos = glowPos;
    this.enemyGlow = new THREE.Points(glowGeo, new THREE.PointsMaterial({
      map: this.glowTex, color: 0xff3a2a, size: 4.0, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.enemyGlow.frustumCulled = false;
    this.scene.add(this.enemyGlow);

    this.enemies = [];
    this.enemyPool = [];
    this.spawnAcc = 0;
    this.clusterT = 0;
    this.spawnAngle = Math.random() * Math.PI * 2;
    this.dummy = new THREE.Object3D();
    this.spawnColor = new THREE.Color();
  }

  spawnEnemy(origin = null, opts = {}) {
    if (this.enemies.length >= MAX_ENEMIES) return;
    const e = this.enemyPool.pop() || {
      pos: new THREE.Vector3(), dir: new THREE.Vector3(), target: new THREE.Vector3(),
      trail: new THREE.Vector3(), phase: 0, speed: 0, spin: 0,
    };
    if (origin) {
      e.pos.copy(origin);
    } else {
      const a = opts.angle ?? (this.spawnAngle + THREE.MathUtils.randFloatSpread(0.9));
      const r = 54 + Math.random() * 14;
      e.pos.set(Math.cos(a) * r, 5 + Math.random() * 13, Math.sin(a) * r);
      // never spawn on top of the camera lens
      if (e.pos.distanceTo(this.camera.position) < 46) {
        e.pos.multiplyScalar(1.65);
        e.pos.y += 5;
      }
    }
    const t = Math.random();
    if (t < 0.22) {
      const i = (Math.random() * 6) | 0;
      const tw = this.world.towers[i];
      e.target.copy(tw.top).add(_v1.set(0, 1.6, 0));
    } else {
      e.target.set(0, 6.2 + Math.random() * 3, 0);
    }
    e.speed = (opts.speed ?? 7 + Math.random() * 4.5) * (opts.speedMul ?? 1);
    e.phase = Math.random() * Math.PI * 2;
    e.spin = Math.random() * 2 - 1;
    e.scale = 1.5 + Math.random() * 0.7;
    this.enemies.push(e);
    return e;
  }

  removeEnemy(index) {
    const e = this.enemies[index];
    const last = this.enemies.pop();
    if (index < this.enemies.length) this.enemies[index] = last;
    this.enemyPool.push(e);
  }

  clearEnemies() {
    const n = this.enemies.length;
    for (const e of this.enemies) {
      this.particles.spawn(e.pos.clone(), 8, {
        color: new THREE.Color(0xff2e88), speed: 10, life: 0.45, size: 1.1, gravity: -2,
      });
    }
    for (const e of this.enemies) this.enemyPool.push(e);
    this.enemies.length = 0;
    this.enemyMesh.count = 0;
    this.trailGeo.setDrawRange(0, 0);
    this.glowGeo.setDrawRange(0, 0);
    return n;
  }

  tacticFx(id) {
    const colors = {
      waf: 0x5ef2ff, scale: 0x57ffb0, failover: 0xffc857, block: 0xff2e88, rollback: 0x9a6bff,
    };
    const color = new THREE.Color(colors[id] || 0x5ef2ff);
    const p = _v1.set(0, 10, 0);
    this.particles.spawn(p.clone(), id === 'block' ? 64 : 38, {
      color, speed: id === 'block' ? 22 : 14, life: 1.1, size: 1.7, gravity: -2,
    });
    this.world.shieldMat.uniforms.uFlash.value = 0.55;
    this.addShake(id === 'block' ? 0.7 : 0.3);
    if (id === 'block') this.clearEnemies();
  }

  updateEnemies(dt, t) {
    const st = this.sim.state;
    const phase = st.phase;
    let rate = 0;
    if (st.running && !st.paused) {
      if (phase === 1) rate = 14 + Math.sin(t * 0.5) * 3;
      else if (phase === 2) rate = st.phaseT < 15 ? 2.5 : 7;
      else if (phase === 3) rate = 18 + Math.sin(t * 0.7) * 4;
    }
    if (this.bossVisible) rate += 3;

    this.spawnAcc += rate * dt;
    let spawnCount = Math.min(14, Math.floor(this.spawnAcc));
    this.spawnAcc -= spawnCount;
    while (spawnCount-- > 0) {
      if (this.bossVisible && Math.random() < 0.18) {
        this.spawnEnemy(_v1.copy(this.boss.position).add(_v2.set(
          THREE.MathUtils.randFloatSpread(8), THREE.MathUtils.randFloatSpread(6), 6,
        )), { speedMul: 1.15 });
      } else {
        this.spawnEnemy();
      }
    }

    this.clusterT -= dt;
    if (this.clusterT <= 0 && phase > 0) {
      this.clusterT = 1.6 + Math.random() * 2.2;
      this.spawnAngle = this.cam.yaw + Math.PI + THREE.MathUtils.randFloatSpread(2.2);
    }

    const dummy = this.dummy;
    const shieldR = this.world.shieldRadius + 0.6;
    let w = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.pos.distanceTo(this.camera.position) < 34) {
        this.removeEnemy(i--);
        continue;
      }
      _v1.copy(e.target).sub(e.pos);
      const dist = _v1.length();
      if (dist < 0.001) {
        this.removeEnemy(i--);
        continue;
      }
      _v1.multiplyScalar(1 / dist);

      const wob = Math.sin(t * 2.1 + e.phase) * 3.4;
      _v2.set(-_v1.z, 0, _v1.x).multiplyScalar(wob * 0.12);
      _v3.copy(_v1).add(_v2).normalize();

      e.pos.addScaledVector(_v3, e.speed * dt);
      e.pos.y += Math.sin(t * 1.7 + e.phase) * dt * 2.2;
      e.dir.copy(_v3);

      // shield impact for core-bound
      if (e.pos.distanceTo(this.world.shieldCenter) < shieldR) {
        this.onShieldImpact(e.pos, e.speed / 12);
        this.removeEnemy(i--);
        continue;
      }

      // tower impact
      if (e.target.y > 2 && e.pos.distanceTo(e.target) < 1.6) {
        this.onTowerImpact(e);
        this.removeEnemy(i--);
        continue;
      }

      dummy.position.copy(e.pos);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), e.dir);
      dummy.rotateZ(Math.sin(t * 4 + e.phase) * 0.5);
      dummy.scale.setScalar(e.scale);
      dummy.updateMatrix();
      this.enemyMesh.setMatrixAt(w, dummy.matrix);

      const p3 = w * 3;
      this.glowPos[p3] = e.pos.x + e.dir.x * 1.2;
      this.glowPos[p3 + 1] = e.pos.y + e.dir.y * 1.2;
      this.glowPos[p3 + 2] = e.pos.z + e.dir.z * 1.2;

      const t6 = w * 6;
      this.trailPos[t6] = e.pos.x;
      this.trailPos[t6 + 1] = e.pos.y;
      this.trailPos[t6 + 2] = e.pos.z;
      this.trailPos[t6 + 3] = e.pos.x - e.dir.x * 4.2;
      this.trailPos[t6 + 4] = e.pos.y - e.dir.y * 4.2;
      this.trailPos[t6 + 5] = e.pos.z - e.dir.z * 4.2;
      w++;
    }

    this.enemyMesh.count = w;
    this.enemyMesh.instanceMatrix.needsUpdate = true;
    this.trailGeo.setDrawRange(0, w * 2);
    this.trailGeo.attributes.position.needsUpdate = true;
    this.glowGeo.setDrawRange(0, w);
    this.glowGeo.attributes.position.needsUpdate = true;
  }

  onShieldImpact(pos, power = 1) {
    this.world.hitShield(pos, Math.min(1.4, power + 0.4));
    this.sim.shieldHit(power);
    this.audio.shield();
    this.audio.impact();
    this.particles.spawn(pos, 10, {
      color: new THREE.Color(0x9ff6ff), speed: 9, life: 0.55, size: 0.9, gravity: -2,
    });
    this.addShake(0.55 * power);
  }

  onTowerImpact(e) {
    this.particles.spawn(e.pos, 22, {
      color: new THREE.Color(0xff7a3c), speed: 11, life: 0.8, size: 1.3, gravity: -4,
    });
    this.audio.explosion(false);
    this.addShake(0.4);
    this.sim.shieldHit(0.35);
  }

  /* -------------------------------------------------------------- firepower */
  buildLasers() {
    this.lasers = [];
    const geo = new THREE.CylinderGeometry(0.05, 0.05, 1, 5, 1, true);
    geo.translate(0, 0.5, 0);
    for (let i = 0; i < 56; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x7ff4ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.lasers.push({ mesh, mat, life: 0, max: 0.15 });
    }
    this.laserIdx = 0;

    this.flashes = [];
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xcafcff, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
      }));
      s.visible = false;
      s.scale.setScalar(3);
      this.scene.add(s);
      this.flashes.push({ sprite: s, life: 0, max: 0.25, size: 3 });
    }
    this.flashIdx = 0;
  }

  fireLaser(from, to, { color = 0x7ff4ff, width = 1, life = 0.14, flashSize = 3.2 } = {}) {
    const slot = this.lasers[this.laserIdx++ % this.lasers.length];
    const dir = _v1.copy(to).sub(from);
    const len = dir.length();
    if (len < 0.01) return;
    dir.multiplyScalar(1 / len);
    slot.mesh.position.copy(from);
    slot.mesh.quaternion.setFromUnitVectors(UP, dir);
    slot.mesh.scale.set(width, len, width);
    slot.mesh.visible = true;
    slot.mat.color.set(color);
    slot.mat.opacity = 1;
    slot.life = life;
    slot.max = life;

    const f = this.flashes[this.flashIdx++ % this.flashes.length];
    f.sprite.position.copy(to);
    f.sprite.material.color.set(color);
    f.sprite.material.opacity = 1;
    f.sprite.scale.setScalar(flashSize);
    f.sprite.visible = true;
    f.life = 0.22;
    f.max = 0.22;
    f.size = flashSize;
  }

  updateLasers(dt) {
    for (const l of this.lasers) {
      if (l.life <= 0) continue;
      l.life -= dt;
      if (l.life <= 0) {
        l.mesh.visible = false;
        continue;
      }
      const k = l.life / l.max;
      l.mat.opacity = k;
      const s = 1 + (1 - k) * 0.4;
      l.mesh.scale.x = s;
      l.mesh.scale.z = s;
    }
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.sprite.visible = false;
        continue;
      }
      const k = f.life / f.max;
      f.sprite.material.opacity = k;
      f.sprite.scale.setScalar(f.size * (1.6 - k * 0.6));
    }
  }

  updateTowerFire(dt) {
    const st = this.sim.state;
    if (!st.running || st.paused || st.phase === 0) return;
    if (this.enemies.length === 0) return;

    for (let ti = 0; ti < this.world.towers.length; ti++) {
      const tw = this.world.towers[ti];
      if (tw.state === 'offline') continue;
      tw.cooldown = (tw.cooldown || 0) - dt;
      if (tw.cooldown > 0) continue;
      const node = st.nodes[ti];
      const base = tw.state === 'degraded' ? 0.5 : 0.4;
      tw.cooldown = base + Math.random() * 0.1;
      if (node && node.status === 'offline') continue;

      let best = -1;
      let bestD = 28;
      for (let i = 0; i < this.enemies.length; i++) {
        const d = _v1.copy(this.enemies[i].pos).distanceToSquared(tw.top);
        if (d < bestD * bestD) { bestD = Math.sqrt(d); best = i; }
      }
      if (best < 0) continue;

      const target = this.enemies[best];
      const hitPos = _v2.copy(target.pos);
      this.fireLaser(tw.top, hitPos, {
        color: tw.accent,
        width: 1 + Math.random() * 0.6,
        life: 0.11 + Math.random() * 0.06,
      });
      this.particles.spawn(hitPos, 7, {
        color: tw.accent.clone().lerp(new THREE.Color(0xffffff), 0.45),
        speed: 8, life: 0.45, size: 0.8, gravity: -1,
      });
      this.removeEnemy(best);
      this.sim.addKill(85);
      if (Math.random() < 0.22) this.audio.laser();
      if (Math.random() < 0.05) this.audio.explosion(false);
    }
  }

  /* ------------------------------------------------------------------ boss */
  buildBoss() {
    const g = new THREE.Group();
    g.position.set(0, 24, -40);
    g.visible = false;
    this.scene.add(g);
    this.boss = g;

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(5.4, 1),
      new THREE.MeshBasicMaterial({ color: 0x160610 }),
    );
    g.add(shell);
    this.bossShell = shell;

    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(5.6, 1)),
      new THREE.LineBasicMaterial({
        color: 0xff2e88, transparent: true, opacity: 0.65,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    g.add(wire);
    this.bossWire = wire;

    const inner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.4, 1),
      new THREE.MeshBasicMaterial({ color: 0xffc2dd }),
    );
    g.add(inner);
    this.bossCore = inner;

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xff2e88, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8,
    }));
    halo.scale.setScalar(26);
    g.add(halo);
    this.bossHalo = halo;

    const eye = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xffd6e4, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
    }));
    eye.scale.setScalar(5);
    eye.position.set(0, 0.4, 5.2);
    g.add(eye);
    this.bossEye = eye;

    this.bossRings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(7.6 + i * 1.5, 0.05, 6, 128),
        new THREE.MeshBasicMaterial({
          color: i === 1 ? 0x9a6bff : 0xff2e88,
          transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      r.rotation.x = Math.PI / 2 + (i - 1) * 0.4;
      r.rotation.y = i * 0.5;
      g.add(r);
      this.bossRings.push(r);
    }

    // spikes
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.5 }),
      );
      spike.position.set(Math.cos(a) * 5.4, Math.sin(a) * 2.2, Math.sin(a) * 4.4);
      spike.quaternion.setFromUnitVectors(UP, new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.4, Math.sin(a)).normalize());
      g.add(spike);
    }

    g.scale.setScalar(0.001);
    this.bossBeamT = 3;
  }

  showBoss() {
    if (this.bossVisible) return;
    this.bossVisible = true;
    this.bossDying = false;
    this.boss.visible = true;
    this.boss.scale.setScalar(0.001);
    this.bossBeamT = 2.5;
    this.cam.mode = 'boss';
    this.setCamGoal('boss');
    this.audio.boss();
    this.addShake(1.2);
    this.hud.flash('red');
    for (let i = 0; i < 3; i++) {
      this.particles.spawn(_v1.set(
        THREE.MathUtils.randFloatSpread(16), 18 + Math.random() * 8, -34 - Math.random() * 12,
      ), 50, {
        color: new THREE.Color(0xff2e88), speed: 22, life: 1.3, size: 2.2, gravity: -3,
      });
    }
  }

  hideBoss() {
    this.bossVisible = false;
    this.boss.visible = false;
  }

  updateBoss(dt, t) {
    const st = this.sim.state;
    if (!this.bossVisible) return;

    if (this.bossDying) {
      this.boss.rotation.y += dt * 3;
      this.boss.rotation.z += dt * 1.4;
      this.boss.scale.multiplyScalar(1 - dt * 0.9);
      if (this.boss.scale.x < 0.02) this.hideBoss();
      return;
    }

    const s = THREE.MathUtils.lerp(this.boss.scale.x, 1.35, Math.min(1, dt * 2.2));
    this.boss.scale.setScalar(s);
    this.boss.position.y = 24 + Math.sin(t * 0.55) * 1.4;
    this.boss.position.x = Math.sin(t * 0.23) * 2.2;
    this.boss.rotation.y += dt * 0.16;
    this.boss.rotation.z = Math.sin(t * 0.4) * 0.08;
    this.bossWire.rotation.y -= dt * 0.4;
    this.bossWire.rotation.x += dt * 0.2;
    this.bossCore.rotation.y += dt * 0.7;
    this.bossHalo.material.opacity = 0.55 + Math.sin(t * 3) * 0.15;
    this.bossEye.material.opacity = 0.65 + Math.sin(t * 5.2) * 0.25;
    this.bossEye.scale.setScalar(4.4 + Math.sin(t * 5.2) * 0.8);
    for (let i = 0; i < this.bossRings.length; i++) {
      this.bossRings[i].rotation.z += dt * (0.2 + i * 0.18);
    }

    // boss beam attack
    this.bossBeamT -= dt;
    if (this.bossBeamT <= 0 && st.running && !st.paused) {
      this.bossBeamT = 3.4 + Math.random() * 1.6;
      const from = _v1.copy(this.boss.position).add(_v2.set(0, -2.4, 0));
      const hit = _v3.set(
        THREE.MathUtils.randFloatSpread(10), 6 + Math.random() * 5, THREE.MathUtils.randFloatSpread(10),
      );
      this.fireLaser(from, hit, { color: 0xff2e88, width: 3.6, life: 0.5, flashSize: 9 });
      this.world.hitShield(hit, 1.4);
      this.sim.shieldHit(1.6);
      this.addShake(1.1);
      this.audio.explosion(true);
      this.particles.spawn(hit, 40, {
        color: new THREE.Color(0xff4f9a), speed: 16, life: 0.9, size: 1.6, gravity: -3,
      });
      setTimeout(() => this.hud.pulseDamage(), 120);
    }
  }

  /* ---------------------------------------------------------------- damage */
  onFault(index) {
    const tw = this.world.towers[index];
    this.world.setTowerState(index, 0, 'offline');
    tw.state = 'offline';
    this.fireTowers.add(index);
    this.particles.spawn(tw.top, 70, {
      color: new THREE.Color(0xff5a2a), speed: 20, life: 1.4, size: 2.1, gravity: -6,
    });
    this.particles.spawn(tw.top, 30, {
      color: new THREE.Color(0xffd27a), speed: 26, life: 0.7, size: 1.2, gravity: -2,
    });
    this.fireLaser(tw.top, _v1.copy(tw.top).add(_v2.set(0, 6, 0)), {
      color: 0xff6a3c, width: 4, life: 0.35, flashSize: 12,
    });
    this.audio.explosion(true);
    this.addShake(2.4);
    this.cam.mode = 'db';
    this.setCamGoal('db');
    setTimeout(() => this.hud.flash('red'), 60);
  }

  onRepair(index) {
    const tw = this.world.towers[index];
    this.fireTowers.delete(index);
    this.world.setTowerState(index, 1, 'online');
    tw.state = 'online';
    this.repairRing.position.copy(tw.top);
    this.repairRing.visible = true;
    this.repairRing.scale.setScalar(0.4);
    this.repairRing.material.opacity = 1;
    this.repairLife = 1.4;
    this.particles.spawn(tw.top, 45, {
      color: new THREE.Color(0x57ffb0), speed: 9, life: 1.2, size: 1.3, gravity: 1.6,
    });
    this.audio.repair();
    this.addShake(0.3);
  }

  buildRepairRing() {
    this.repairRing = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.08, 8, 64),
      new THREE.MeshBasicMaterial({
        color: 0x57ffb0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    this.repairRing.rotation.x = Math.PI / 2;
    this.repairRing.visible = false;
    this.scene.add(this.repairRing);
    this.repairLife = 0;
  }

  finalBlow() {
    if (!this.bossVisible) return;
    for (let i = 0; i < 8; i++) {
      setTimeout(() => {
        if (!this.bossVisible) return;
        const p = _v1.copy(this.boss.position).add(_v2.set(
          THREE.MathUtils.randFloatSpread(10), THREE.MathUtils.randFloatSpread(8), THREE.MathUtils.randFloatSpread(10),
        ));
        this.particles.spawn(p, 60, {
          color: new THREE.Color(i % 2 ? 0xff2e88 : 0xffd27a),
          speed: 26, life: 1.2, size: 2.4, gravity: -4,
        });
        this.addShake(1.4);
        this.audio.explosion(true);
        this.hud.flash('red');
      }, i * 130);
    }
    setTimeout(() => this.victoryBoss(), 1250);
  }

  victoryBoss() {
    if (!this.bossVisible || this.bossDying) return;
    this.bossDying = true;
    const p = this.boss.position.clone();
    for (let i = 0; i < 5; i++) {
      this.particles.spawn(p, 90, {
        color: new THREE.Color(i % 2 ? 0xff2e88 : 0xbdfcff),
        speed: 34, life: 2.2, size: 3.2, gravity: -2,
      });
    }
    this.addShake(3);
    this.audio.explosion(true);
    this.hud.flash('red');
    this.hideBossSoon = setTimeout(() => this.hideBoss(), 1600);
  }

  /* --------------------------------------------------------------- effects */
  addShake(v) {
    this.shake = Math.min(4.5, this.shake + v);
  }

  updateFire(dt, t) {
    for (const idx of this.fireTowers) {
      const tw = this.world.towers[idx];
      if (!tw || tw.state !== 'offline') continue;
      if (Math.random() < dt * 26) {
        this.particles.spawn(_v1.copy(tw.top).add(_v2.set(
          THREE.MathUtils.randFloatSpread(0.8), 0.2, THREE.MathUtils.randFloatSpread(0.8),
        )), 1, {
          color: Math.random() < 0.5 ? new THREE.Color(0xff7a2a) : new THREE.Color(0xffc857),
          speed: 5, life: 0.7, size: 1.1, gravity: 5, drag: 0.4,
        });
      }
      tw.firePulse = (tw.firePulse || 0) + dt;
    }
  }

  updateRepair(dt) {
    if (this.repairLife > 0) {
      this.repairLife -= dt;
      const k = 1 - this.repairLife / 1.4;
      this.repairRing.scale.setScalar(0.4 + k * 3.6);
      this.repairRing.material.opacity = Math.max(0, 1 - k);
      if (this.repairLife <= 0) this.repairRing.visible = false;
    }
  }

  /* ---------------------------------------------------------------- camera */
  setTheme(mode) {
    const city = mode === 'city';
    if (this.enemyMesh) this.enemyMesh.material.color.set(city ? 0xff6a2a : 0x8f1226);
    if (this.trails) this.trails.material.color.set(city ? 0xff8a3c : 0xff2038);
    if (this.enemyGlow) this.enemyGlow.material.color.set(city ? 0xff8a3c : 0xff3a2a);
    if (this.cam.mode === 'wide') this.setCamGoal('wide');
  }

  setCinematic(v) {
    this.cinematic = !!v;
    this.cineT = 0;
    this.cineShot = 0;
    if (this.cam.mode === 'wide') this.setCamGoal('wide');
  }

  setCamGoal(mode) {
    const target = new THREE.Vector3();
    let yaw = this.cam.goal.yaw;
    let pitch = 0.34;
    let dist = 60;
    let fov = 46;
    if (mode === 'wide') {
      const city = this.world.theme === 'city';
      yaw = this.cam.goal.yaw;
      pitch = city ? 0.12 : 0.2; dist = city ? 52 : 46; fov = city ? 50 : 48;
      target.set(0, city ? 10.6 : 9, 0);
      if (this.cinematic) {
        const shots = [
          { off: 0.0, pitch: 0.09, dist: 54, fov: 42, ty: city ? 11 : 9.5 },
          { off: 0.62, pitch: 0.05, dist: 34, fov: 37, ty: city ? 13.5 : 12 },
          { off: -0.48, pitch: 0.4, dist: 44, fov: 40, ty: city ? 9 : 8 },
          { off: 1.05, pitch: 0.1, dist: 40, fov: 39, ty: city ? 12 : 10.5 },
        ];
        const shot = shots[this.cineShot % shots.length];
        yaw += shot.off;
        pitch = shot.pitch;
        dist = shot.dist;
        fov = shot.fov;
        target.set(0, shot.ty, 0);
      }
    } else if (mode === 'db') {
      const tw = this.world.towers[3];
      yaw = Math.PI / 2 - THREE.MathUtils.degToRad(NODES[3].angle) + 0.52;
      pitch = 0.14; dist = 34; fov = 44;
      target.copy(tw.top).add(new THREE.Vector3(0, 0.6, 0));
    } else if (mode === 'standby') {
      const tw = this.world.towers[4];
      yaw = Math.PI / 2 - THREE.MathUtils.degToRad(NODES[4].angle) + 0.4;
      pitch = 0.16; dist = 32; fov = 44;
      target.copy(tw.top).add(new THREE.Vector3(0, 0.6, 0));
    } else if (mode === 'boss') {
      yaw = 0.08; pitch = 0.14; dist = 64; fov = 52;
      target.set(0, 15, -15);
    }
    this.cam.goal = { yaw, pitch, dist, fov, target };
    this.cam.manual = 0;
    this.hud.setCamMode(mode === 'db' ? 'FOCUS · DB-04' : mode === 'standby' ? 'FOCUS · DB-05' : mode === 'boss' ? 'BOSS ENCOUNTER' : 'CINEMATIC');
  }

  bindPointer() {
    const el = this.renderer.domElement;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const down = (e) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      this.cam.manual = 7;
      this.hud.setCamMode('FREE CAMERA');
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      this.cam.yaw -= dx * 0.005;
      this.cam.pitch = THREE.MathUtils.clamp(this.cam.pitch + dy * 0.004, -0.05, 1.32);
      this.cam.manual = 7;
    };
    const up = (e) => {
      dragging = false;
      el.releasePointerCapture?.(e.pointerId);
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cam.dist = THREE.MathUtils.clamp(this.cam.dist + e.deltaY * 0.035, 18, 100);
      this.cam.manual = 7;
    }, { passive: false });
  }

  updateCamera(dt) {
    const c = this.cam;
    if (c.manual > 0) c.manual -= dt;
    else {
      const g = c.goal;
      if (c.mode === 'wide') g.yaw += dt * (this.cinematic ? 0.007 : 0.02);
      const k = 1 - Math.exp(-dt * 1.6);
      c.yaw += (g.yaw - c.yaw) * k;
      c.pitch += (g.pitch - c.pitch) * k;
      c.dist += (g.dist - c.dist) * k;
      c.fov += (g.fov - c.fov) * k;
      c.target.lerp(g.target, k);
    }
    // keep camera above ground
    c.pitch = THREE.MathUtils.clamp(c.pitch, -0.08, 1.35);
    const cp = _v1.set(
      c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist,
      Math.max(1.6, c.target.y + Math.sin(c.pitch) * c.dist),
      c.target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist,
    );

    this.shake *= Math.exp(-dt * 4.2);
    if (this.cinematic && this.shake < 0.12) {
      const t = this.time;
      cp.x += Math.sin(t * 0.63) * 0.12 + Math.sin(t * 1.71) * 0.05;
      cp.y += Math.cos(t * 0.71) * 0.09;
      cp.z += Math.sin(t * 0.47) * 0.08;
    }
    if (this.shake > 0.01) {
      const s = this.shake;
      cp.x += (Math.random() - 0.5) * s * 0.45;
      cp.y += (Math.random() - 0.5) * s * 0.35;
      cp.z += (Math.random() - 0.5) * s * 0.45;
    }

    this.camera.position.lerp(cp, 1 - Math.exp(-dt * 12));
    this.camera.lookAt(c.target);
    if (this.cinematic) this.camera.rotateZ(Math.sin(this.time * 0.37) * 0.004);
    if (Math.abs(this.camera.fov - c.fov) > 0.01) {
      this.camera.fov = c.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  applyCamera(k) {
    const c = this.cam;
    this.camera.position.set(
      c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist,
      c.target.y + Math.sin(c.pitch) * c.dist,
      c.target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist,
    );
    this.camera.lookAt(c.target);
  }

  /* ----------------------------------------------------------------- events */
  bindEvents() {
    this.sim.on('phase', (p) => {
      if (p === 1) { this.cam.mode = 'wide'; this.setCamGoal('wide'); }
      if (p === 2) { this.cam.mode = 'db'; this.setCamGoal('db'); }
      if (p === 3) { this.cam.mode = 'boss'; this.showBoss(); }
    });
    this.sim.on('fault', (i) => this.onFault(i));
    this.sim.on('repair', (i) => this.onRepair(i));
    this.sim.on('boss', (v) => { if (v) this.showBoss(); });
    this.sim.on('finalBlow', () => this.finalBlow());
    this.sim.on('complete', () => {
      this.victoryBoss();
      this.audio.victory();
      this.audio.setAlarm(false);
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          this.particles.spawn(_v1.set(0, 10 + i * 4, 0), 40, {
            color: new THREE.Color(0x7ff4ff), speed: 16, life: 2, size: 1.8, gravity: 2, drag: 0.6,
          });
        }, i * 260);
      }
    });
    this.sim.on('reset', () => {
      this.enemies.forEach((e) => this.enemyPool.push(e));
      this.enemies.length = 0;
      this.enemyMesh.count = 0;
      this.particles.clear();
      this.fireTowers.clear();
      this.hideBoss();
      this.bossDying = false;
      this.cam.mode = 'wide';
      this.setCamGoal('wide');
      this.world.towers.forEach((tw, i) => {
        tw.state = 'online';
        this.world.setTowerState(i, 1, 'online');
      });
      clearTimeout(this.hideBossSoon);
    });
    this.sim.on('heal', (v) => {
      this.world.shieldMat.uniforms.uFlash.value = 0.35;
      this.audio.repair();
      this.hud.showSubtitle({ text: `护盾能量回路重置 · 完整度回升至 ${v}%`, dur: 3000 });
    });
    this.sim.on('started', () => this.audio.ui());
    this.sim.on('shieldHit', () => this.hud.pulseDamage());
  }

  /* ----------------------------------------------------------------- update */
  update(dt, t) {
    this.time = t;
    const st = this.sim.state;
    if (!st.paused) {
      this.updateEnemies(dt, t);
      this.updateTowerFire(dt);
      this.updateBoss(dt, t);
      this.updateFire(dt, t);
      this.particles.update(dt);
      this.updateLasers(dt);
      this.updateRepair(dt);
      this.world.update(t, dt);
    }
    if (this.cinematic && this.cam.mode === 'wide' && this.cam.manual <= 0) {
      this.cineT += dt;
      if (this.cineT > 8.5) {
        this.cineT = 0;
        this.cineShot = (this.cineShot + 1) % 4;
        this.setCamGoal('wide');
      }
    }
    this.updateCamera(dt);
    this.audio.setThreat(st.threat || 0);
  }
}
