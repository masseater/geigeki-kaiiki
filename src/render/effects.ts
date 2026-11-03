// 水柱・爆炎・煙・航跡。見た目だけなので Math.random を使ってよい

import * as THREE from 'three';

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

interface PuffOpts {
  color?: number;
  add?: boolean;
  life?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  size0?: number;
  size1?: number;
  alpha?: number;
  gravity?: number;
}

interface Particle {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  life: number;
  max: number;
  vx: number;
  vy: number;
  vz: number;
  size0: number;
  size1: number;
  a0: number;
  g: number;
}

function blobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Particles {
  private pool: Particle[] = [];
  private idx = 0;

  constructor(scene: THREE.Scene, count = 420) {
    const tex = blobTexture();
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      scene.add(sprite);
      this.pool.push({ sprite, mat, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size0: 1, size1: 1, a0: 1, g: 0 });
    }
  }

  puff(x: number, y: number, z: number, o: PuffOpts): void {
    const p = this.pool[this.idx]!;
    this.idx = (this.idx + 1) % this.pool.length;
    p.sprite.position.set(x, y, z);
    p.sprite.visible = true;
    p.mat.color.set(o.color ?? 0xffffff);
    p.mat.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.life = 0;
    p.max = o.life ?? 1;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.vz = o.vz ?? 0;
    p.size0 = o.size0 ?? 4;
    p.size1 = o.size1 ?? p.size0;
    p.a0 = o.alpha ?? 1;
    p.g = o.gravity ?? 0;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) {
        p.sprite.visible = false;
        continue;
      }
      p.vy -= p.g * dt;
      const pos = p.sprite.position;
      pos.x += p.vx * dt;
      pos.y = Math.max(0, pos.y + p.vy * dt);
      pos.z += p.vz * dt;
      const sz = p.size0 + (p.size1 - p.size0) * k;
      p.sprite.scale.set(sz, sz, 1);
      p.mat.opacity = p.a0 * (1 - k);
    }
  }

  clear(): void {
    for (const p of this.pool) p.sprite.visible = false;
  }

  splash(x: number, z: number, big: boolean): void {
    for (let i = 0; i < (big ? 7 : 5); i++) {
      this.puff(x + rand(-1.5, 1.5), 1, z + rand(-1.5, 1.5), {
        color: 0xe8f3f5, life: rand(0.9, 1.4), vy: rand(14, 24) * (big ? 1.2 : 1), gravity: 26, size0: 3, size1: big ? 9 : 6, alpha: 0.9,
      });
    }
  }

  torpedoColumn(x: number, z: number): void {
    for (let i = 0; i < 6; i++) {
      this.puff(x + rand(-2, 2), 1, z + rand(-2, 2), { color: 0xeaf4f6, life: rand(1.2, 1.8), vy: rand(20, 32), gravity: 26, size0: 5, size1: 12, alpha: 0.9 });
    }
  }

  explosion(x: number, y: number, z: number, scale = 1): void {
    for (let i = 0; i < 6; i++) {
      this.puff(x + rand(-2, 2), y + rand(0, 2), z + rand(-2, 2), { color: 0xffa040, add: true, life: rand(0.3, 0.6), size0: 4 * scale, size1: 12 * scale, vy: rand(2, 8) });
    }
    for (let i = 0; i < 4; i++) {
      this.puff(x + rand(-2, 2), y + 2, z + rand(-2, 2), { color: 0x2a2a2a, life: rand(1.5, 2.5), size0: 5 * scale, size1: 16 * scale, vy: rand(3, 7), alpha: 0.7 });
    }
  }

  dust(x: number, z: number): void {
    for (let i = 0; i < 5; i++) {
      this.puff(x + rand(-2, 2), 4, z + rand(-2, 2), { color: 0x8a7a55, life: rand(0.8, 1.4), size0: 4, size1: 12, vy: rand(4, 9), alpha: 0.8 });
    }
  }

  muzzle(x: number, y: number, z: number): void {
    this.puff(x, y, z, { color: 0xffc070, add: true, life: 0.18, size0: 5, size1: 9 });
    this.puff(x, y, z, { color: 0xbfc4c6, life: 1.6, size0: 3, size1: 10, vy: 2, alpha: 0.6 });
  }

  smoke(x: number, y: number, z: number, fire: boolean): void {
    this.puff(x + rand(-1, 1), y, z + rand(-1, 1), { color: 0x222222, life: 2.6, size0: 3, size1: 12, vy: 4, vx: rand(-1, 1), alpha: 0.55 });
    if (fire) this.puff(x, y - 2, z, { color: 0xff7a30, add: true, life: 0.3, size0: 2, size1: 4 });
  }

  sinkingSmoke(x: number, z: number): void {
    this.puff(x + rand(-3, 3), 2, z + rand(-3, 3), { color: 0x262626, life: 2.4, size0: 5, size1: 15, vy: 3, alpha: 0.6 });
  }
}

interface WakeDot {
  x: number;
  z: number;
  life: number;
  max: number;
  s: number;
}

/** 航跡。白い円を海の色へ溶かしていく */
export class Wakes {
  private mesh: THREE.InstancedMesh;
  private dots: WakeDot[] = [];
  private idx = 0;
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  private foam = new THREE.Color(0xcfe6ea);

  constructor(scene: THREE.Scene, private seaColor: THREE.Color, count = 900) {
    const geo = new THREE.CircleGeometry(1, 10);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      this.dots.push({ x: 0, z: 0, life: 9, max: 9, s: 1 });
      this.m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, seaColor);
    }
    this.mesh.position.y = 0.12;
    scene.add(this.mesh);
  }

  add(x: number, z: number, size: number, life: number): void {
    const d = this.dots[this.idx]!;
    this.idx = (this.idx + 1) % this.dots.length;
    d.x = x;
    d.z = z;
    d.s = size;
    d.life = 0;
    d.max = life;
  }

  clear(): void {
    for (const d of this.dots) d.life = d.max = 9;
  }

  update(dt: number): void {
    this.dots.forEach((d, i) => {
      if (d.life >= d.max) {
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        return;
      }
      d.life += dt;
      const k = Math.min(1, d.life / d.max);
      const sc = d.s * (1 + k * 1.8);
      this.m.makeScale(sc, 1, sc);
      this.m.setPosition(d.x, 0, d.z);
      this.mesh.setMatrixAt(i, this.m);
      this.c.copy(this.foam).lerp(this.seaColor, k);
      this.mesh.setColorAt(i, this.c);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
