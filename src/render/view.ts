// sim の World を three.js の場面に写す。World は読むだけで書き換えない

import * as THREE from 'three';
import { ARENA, ISLANDS } from '../sim/data';
import { wrap } from '../sim/math';
import type { Ship, SimEvent, Vec2, World } from '../sim/world';
import { Particles, Wakes } from './effects';
import { buildShipMesh, type ShipMesh } from './shipMesh';

const SEA = 0x1a3d4d;
const FOG = 0x10283a;

export const ZOOMS = [
  { name: '近', dist: 105, height: 135, ahead: 50 },
  { name: '中', dist: 170, height: 235, ahead: 70 },
  { name: '遠', dist: 250, height: 360, ahead: 90 },
] as const;

export interface DamagePopup {
  x: number;
  y: number;
  z: number;
  t: number;
  text: string;
  mine: boolean;
  big: boolean;
}

interface ShipView {
  mesh: ShipMesh;
  wakeT: number;
  smokeT: number;
}

const flatRing = (inner: number, outer: number, color: number, opacity: number, segments = 48): THREE.Mesh => {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, segments),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
};

export class BattleView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48, 1, 1, 4000);
  zoom = 1;
  /** カメラが向いている方位（sim の h と同じ向き） */
  camYaw = 0;
  popups: DamagePopup[] = [];

  private sea: THREE.Mesh;
  private grid: THREE.GridHelper;
  private aimRing = flatRing(5, 7, 0xd6a84a, 0.9, 32);
  private rangeRing = flatRing(0.995, 1, 0x8fc6d9, 0.25, 128);
  private lockRing = flatRing(0.92, 1, 0xe0614a, 0.9);
  private particles: Particles;
  private wakes: Wakes;
  private ships = new Map<number, ShipView>();
  private shellMeshes = new Map<number, THREE.Mesh>();
  private torpMeshes = new Map<number, THREE.Mesh>();
  private shellGeo = new THREE.SphereGeometry(0.6, 6, 6);
  private shellMat = { ally: new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), enemy: new THREE.MeshBasicMaterial({ color: 0xff8a6a }) };
  private torpGeo = new THREE.BoxGeometry(0.5, 0.3, 3);
  private torpMat = { ally: new THREE.MeshBasicMaterial({ color: 0xcfe8f0 }), enemy: new THREE.MeshBasicMaterial({ color: 0xff5a3a }) };
  private camPos = new THREE.Vector3(0, 235, -290);
  private shake = 0;
  private clock = 0;
  private raycaster = new THREE.Raycaster();
  private waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new THREE.Color(FOG);
    this.scene.fog = new THREE.Fog(FOG, 600, 1900);
    this.scene.add(new THREE.HemisphereLight(0xcfe3ea, 0x1a2a30, 0.75 * Math.PI));
    const sun = new THREE.DirectionalLight(0xfff1d6, 0.85 * Math.PI);
    sun.position.set(300, 500, 200);
    this.scene.add(sun);

    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshBasicMaterial({ color: SEA }));
    this.sea.rotation.x = -Math.PI / 2;
    this.scene.add(this.sea);
    this.grid = new THREE.GridHelper(8000, 160, 0x4f8091, 0x4f8091);
    this.grid.position.y = 0.05;
    const gm = this.grid.material as THREE.Material;
    gm.transparent = true;
    gm.opacity = 0.5;
    this.scene.add(this.grid);

    const edge = flatRing(ARENA - 2, ARENA + 2, 0xd6a84a, 0.35, 128);
    edge.position.y = 0.2;
    this.scene.add(edge);
    for (const is of ISLANDS) this.scene.add(this.buildIsland(is.x, is.z, is.r));

    this.aimRing.position.y = 0.3;
    this.rangeRing.position.y = 0.25;
    this.lockRing.position.y = 0.35;
    this.scene.add(this.aimRing, this.rangeRing, this.lockRing);

    this.particles = new Particles(this.scene);
    this.wakes = new Wakes(this.scene, new THREE.Color(SEA));
  }

  private buildIsland(x: number, z: number, r: number): THREE.Group {
    const g = new THREE.Group();
    const beach = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 2, 40), new THREE.MeshLambertMaterial({ color: 0xb9a77a }));
    beach.position.y = 0.6;
    const land = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, r * 0.45, 40), new THREE.MeshLambertMaterial({ color: 0x3f5a3a }));
    land.position.y = r * 0.22 + 1;
    g.add(beach, land);
    g.position.set(x, 0, z);
    return g;
  }

  resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 新しい World に切り替えるとき、前の戦闘の物体を片付ける */
  reset(w: World): void {
    for (const v of this.ships.values()) this.removeShipView(v);
    this.ships.clear();
    for (const m of this.shellMeshes.values()) this.scene.remove(m);
    this.shellMeshes.clear();
    for (const m of this.torpMeshes.values()) this.scene.remove(m);
    this.torpMeshes.clear();
    this.particles.clear();
    this.wakes.clear();
    this.popups = [];
    const p = w.player;
    this.camYaw = p.h;
    const Z = ZOOMS[this.zoom]!;
    this.camPos.set(p.x - Math.sin(p.h) * Z.dist, Z.height, p.z - Math.cos(p.h) * Z.dist);
    this.rangeRing.scale.set(p.def.guns.range, p.def.guns.range, 1);
  }

  private removeShipView(v: ShipView): void {
    this.scene.remove(v.mesh.group);
    if (v.mesh.bar) this.scene.remove(v.mesh.bar.group);
  }

  /** sim のイベントを演出に変える */
  handleEvent(e: SimEvent): void {
    switch (e.type) {
      case 'gunFire':
        this.particles.muzzle(e.x, e.y, e.z);
        break;
      case 'splash':
        this.particles.splash(e.x, e.z, e.big);
        break;
      case 'dust':
        this.particles.dust(e.x, e.z);
        break;
      case 'hit':
        this.particles.explosion(e.x, e.y, e.z, e.dmg > 100 ? 1.6 : 0.8);
        if (e.torpedo) this.particles.torpedoColumn(e.x, e.z);
        if (e.onPlayer) this.shake = Math.min(1.2, this.shake + e.dmg / 60);
        this.popups.push({ x: e.x, y: e.y + 6, z: e.z, t: 0, text: String(Math.round(e.dmg)), mine: e.onPlayer, big: e.dmg > 100 });
        break;
      case 'sunk':
        this.particles.explosion(e.x, 6, e.z, e.boss ? 3 : 2);
        break;
      default:
        break;
    }
  }

  screenToWater(clientX: number, clientY: number): Vec2 | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.waterPlane, hit) ? { x: hit.x, z: hit.z } : null;
  }

  /** 画面上の点に一番近い敵艦（maxPx 以内） */
  enemyNearScreen(w: World, clientX: number, clientY: number, maxPx: number): Ship | null {
    const r = this.canvas.getBoundingClientRect();
    let best: Ship | null = null;
    let bd = maxPx;
    const v = new THREE.Vector3();
    for (const s of w.ships) {
      if (s.team !== 'enemy' || !s.alive) continue;
      v.set(s.x, 3, s.z).project(this.camera);
      const sx = ((v.x + 1) / 2) * r.width + r.left;
      const sy = ((1 - v.y) / 2) * r.height + r.top;
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** 世界座標を canvas 上の CSS ピクセルへ */
  project(x: number, y: number, z: number): { x: number; y: number; front: boolean; onScreen: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * this.canvas.clientWidth,
      y: ((1 - v.y) / 2) * this.canvas.clientHeight,
      front: v.z < 1,
      onScreen: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z < 1,
    };
  }

  update(w: World, dt: number, aim: Vec2 | null, lockId: number | null): void {
    this.clock += dt;
    const live = new Set<number>();
    for (const s of w.ships) {
      live.add(s.id);
      let v = this.ships.get(s.id);
      if (!v) {
        v = { mesh: buildShipMesh(s.def, s.team), wakeT: 0, smokeT: 0 };
        this.scene.add(v.mesh.group);
        if (v.mesh.bar) this.scene.add(v.mesh.bar.group);
        this.ships.set(s.id, v);
      }
      this.updateShip(s, v, dt);
    }
    for (const [id, v] of this.ships) {
      if (!live.has(id)) {
        this.removeShipView(v);
        this.ships.delete(id);
      }
    }
    this.syncProjectiles(w, dt);
    this.updateMarkers(w, aim, lockId);
    for (const pp of this.popups) pp.t += dt;
    this.popups = this.popups.filter((pp) => pp.t < 1.1);
    this.particles.update(dt);
    this.wakes.update(dt);
    this.updateCamera(w, dt);
  }

  private updateShip(s: Ship, v: ShipView, dt: number): void {
    const g = v.mesh.group;
    const H = v.mesh.deckH;
    if (s.alive) {
      g.position.set(s.x, -H * 0.45 + Math.sin(this.clock * 1.3 + s.x) * 0.15, s.z);
      g.rotation.set(Math.sin(this.clock * 0.9 + s.z) * 0.012, s.h, s.rudder * Math.min(1, Math.abs(s.speed) / s.def.speed) * -0.05);
      s.turrets.forEach((t, i) => {
        const tg = v.mesh.turrets[i];
        if (tg) tg.rotation.y = t.rel;
      });
      v.wakeT -= dt;
      if (v.wakeT <= 0 && Math.abs(s.speed) > 1) {
        v.wakeT = 0.07;
        const half = s.def.len * 0.5;
        this.wakes.add(s.x - Math.sin(s.h) * half + (Math.random() - 0.5) * 1.2, s.z - Math.cos(s.h) * half + (Math.random() - 0.5) * 1.2, s.def.beam * 0.4, 3.2);
        if (Math.abs(s.speed) > s.def.speed * 0.5) this.wakes.add(s.x + Math.sin(s.h) * half * 0.9, s.z + Math.cos(s.h) * half * 0.9, s.def.beam * 0.3, 1.2);
      }
      const r = s.hp / s.maxHp;
      if (r < 0.5) {
        v.smokeT -= dt;
        if (v.smokeT <= 0) {
          v.smokeT = r < 0.25 ? 0.12 : 0.3;
          this.particles.smoke(s.x, H + 4, s.z, r < 0.25);
        }
      }
    } else {
      g.position.set(s.x, -H * 0.45 - s.sinkT * 2.2, s.z);
      g.rotation.z += dt * 0.12 * s.orbit;
      g.rotation.x += dt * 0.05;
      if (Math.random() < 0.3) this.particles.sinkingSmoke(s.x, s.z);
      g.visible = s.sinkT < 6;
    }
    const bar = v.mesh.bar;
    if (bar) {
      bar.group.visible = s.alive;
      bar.group.position.set(s.x, H + 16 + (s.def.boss ? 6 : 0), s.z);
      bar.group.quaternion.copy(this.camera.quaternion);
      const k = s.hp / s.maxHp;
      bar.fill.scale.x = Math.max(0.001, bar.width * k);
      bar.fill.position.x = (-bar.width * (1 - k)) / 2;
    }
  }

  private syncProjectiles(w: World, dt: number): void {
    const liveShells = new Set<number>();
    for (const sh of w.shells) {
      liveShells.add(sh.id);
      let m = this.shellMeshes.get(sh.id);
      if (!m) {
        m = new THREE.Mesh(this.shellGeo, this.shellMat[sh.team]);
        this.scene.add(m);
        this.shellMeshes.set(sh.id, m);
      }
      m.position.set(sh.x, sh.y, sh.z);
    }
    for (const [id, m] of this.shellMeshes) {
      if (!liveShells.has(id)) {
        this.scene.remove(m);
        this.shellMeshes.delete(id);
      }
    }
    const liveTorps = new Set<number>();
    for (const t of w.torps) {
      liveTorps.add(t.id);
      let m = this.torpMeshes.get(t.id);
      if (!m) {
        m = new THREE.Mesh(this.torpGeo, this.torpMat[t.team]);
        if (t.team === 'enemy') m.scale.set(2.4, 2, 1.6);
        m.rotation.y = t.h;
        this.scene.add(m);
        this.torpMeshes.set(t.id, m);
        m.userData.wakeT = 0;
      }
      m.position.set(t.x, 0.2, t.z);
      m.userData.wakeT -= dt;
      if (m.userData.wakeT <= 0) {
        m.userData.wakeT = 0.12;
        this.wakes.add(t.x, t.z, 0.9, 2.2);
      }
    }
    for (const [id, m] of this.torpMeshes) {
      if (!liveTorps.has(id)) {
        this.scene.remove(m);
        this.torpMeshes.delete(id);
      }
    }
  }

  private updateMarkers(w: World, aim: Vec2 | null, lockId: number | null): void {
    const p = w.player;
    const show = w.mode === 'battle' && w.phase === 'play' && p.alive && aim !== null;
    this.aimRing.visible = show;
    this.rangeRing.visible = show;
    if (show && aim) {
      const d = Math.hypot(aim.x - p.x, aim.z - p.z);
      this.aimRing.position.set(aim.x, 0.3, aim.z);
      (this.aimRing.material as THREE.MeshBasicMaterial).color.set(d <= p.def.guns.range ? 0xd6a84a : 0x93a3a8);
      this.aimRing.scale.setScalar(1 + d / 500);
      this.rangeRing.position.set(p.x, 0.25, p.z);
    }
    const lock = lockId === null ? undefined : w.ships.find((s) => s.id === lockId && s.alive);
    this.lockRing.visible = !!lock && show;
    if (lock) {
      const r = lock.def.len * 0.75;
      this.lockRing.position.set(lock.x, 0.35, lock.z);
      this.lockRing.scale.set(r, r, 1);
    }
  }

  private updateCamera(w: World, dt: number): void {
    const p = w.player;
    const Z = ZOOMS[this.zoom]!;
    this.camYaw += wrap(p.h - this.camYaw) * Math.min(1, dt * 1.6);
    const desired = new THREE.Vector3(p.x - Math.sin(this.camYaw) * Z.dist, Z.height, p.z - Math.cos(this.camYaw) * Z.dist);
    this.camPos.lerp(desired, Math.min(1, dt * 3));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() * 2 - 1) * this.shake * 2;
      this.camera.position.y += (Math.random() * 2 - 1) * this.shake * 2;
      this.shake = Math.max(0, this.shake - dt * 1.8);
    }
    const ahead = this.camera.aspect < 1 ? Z.ahead * 0.25 : Z.ahead;
    this.camera.lookAt(p.x + Math.sin(this.camYaw) * ahead, 0, p.z + Math.cos(this.camYaw) * ahead);
    this.grid.position.set(Math.round(p.x / 50) * 50, 0.05, Math.round(p.z / 50) * 50);
    this.sea.position.set(p.x, 0, p.z);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
