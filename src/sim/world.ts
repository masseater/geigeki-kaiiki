// 戦闘シミュレーション本体。three.js と DOM には依存しない。
// 描画・音・HUD は world.events を読んで演出し、毎フレーム events を空にする。

import {
  ARENA, ENEMY_DEFS, ISLANDS, PLAYER_DESIGNS, PLAYER_TORP_RANGE, REPAIR_RATIO, REPAIR_TIME,
  THROTTLE, THROTTLE_MAX, TORP_SPEED, WAVES,
  type DesignId, type ShipDef, type TurretDef,
} from './data';
import { bearingTo, clamp, createRng, dist, wrap, type Rng } from './math';

export type Team = 'ally' | 'enemy';

export interface Turret {
  def: TurretDef;
  /** 艦首基準の現在の向き */
  rel: number;
  half: number;
  timer: number;
  /** 艦中心からの横方向オフセット（正は左舷） */
  x: number;
  z: number;
  onTarget: boolean;
}

export interface Ship {
  id: number;
  def: ShipDef;
  team: Team;
  x: number;
  z: number;
  h: number;
  speed: number;
  throttle: number;
  /** 正で h が増える（取舵） */
  rudder: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  sinkT: number;
  turrets: Turret[];
  torpTimer: number;
  orbit: 1 | -1;
  aiT: number;
  aimErr: number;
}

export interface Shell {
  id: number;
  team: Team;
  sx: number;
  sz: number;
  sy: number;
  tx: number;
  tz: number;
  T: number;
  t: number;
  apex: number;
  dmg: number;
  big: boolean;
  x: number;
  y: number;
  z: number;
}

export interface Torp {
  id: number;
  team: Team;
  x: number;
  z: number;
  h: number;
  v: number;
  run: number;
  range: number;
  dmg: number;
}

export interface Threat {
  torp: Torp;
  /** 最接近までの秒数 */
  tc: number;
}

export interface Checkpoint {
  wave: number;
  hp: number;
  repairs: number;
  time: number;
  dmgTaken: number;
  sunk: number;
}

export type SimEvent =
  | { type: 'gunFire'; x: number; y: number; z: number; bearing: number; team: Team; big: boolean }
  | { type: 'splash'; x: number; z: number; big: boolean }
  | { type: 'dust'; x: number; z: number }
  | { type: 'hit'; x: number; y: number; z: number; dmg: number; shipId: number; onPlayer: boolean; torpedo: boolean }
  | { type: 'sunk'; shipId: number; name: string; team: Team; boss: boolean; x: number; z: number }
  | { type: 'wave'; index: number }
  | { type: 'retry'; wave: number }
  | { type: 'start' }
  | { type: 'lock'; shipId: number | null; name: string | null; manual: boolean }
  | { type: 'torpFired'; team: Team }
  | { type: 'torpReloading' }
  | { type: 'repairStart' }
  | { type: 'noRepair' }
  | { type: 'aground' }
  | { type: 'alarm' };

export type Phase = 'play' | 'won' | 'lost';

export interface World {
  mode: 'battle' | 'idle';
  design: DesignId;
  rng: Rng;
  time: number;
  phase: Phase;
  wave: number;
  waveTimer: number;
  ships: Ship[];
  shells: Shell[];
  torps: Torp[];
  player: Ship;
  lockId: number | null;
  repairs: number;
  repairT: number;
  dmgTaken: number;
  sunk: number;
  checkpoint: Checkpoint | null;
  threats: Threat[];
  events: SimEvent[];
  nextId: number;
  alarmed: Set<number>;
  alarmCool: number;
  agroundCool: number;
}

export interface Vec2 {
  x: number;
  z: number;
}

/** 毎ティックの連続入力 */
export interface Control {
  /** -1 = 取舵いっぱい、+1 = 面舵いっぱい */
  steer: number;
  fire: boolean;
  /** マウスが指す海面の位置。捕捉中はこちらより捕捉目標が優先される */
  aim: Vec2;
}

/** 押した瞬間だけの入力 */
export type Command =
  | { type: 'throttle'; delta: number }
  | { type: 'torp' }
  | { type: 'repair' }
  | { type: 'lock'; shipId: number | null }
  | { type: 'cycleLock' };

export const IDLE_CONTROL: Control = { steer: 0, fire: false, aim: { x: 0, z: 0 } };

export interface CreateOptions {
  design: DesignId;
  seed: number;
  checkpoint?: Checkpoint | null;
  mode?: 'battle' | 'idle';
}

// ---------- 生成 ----------

function makeShip(w: World, def: ShipDef, team: Team, x: number, z: number, h: number): Ship {
  const turrets: Turret[] = def.turrets.map((t) => {
    const broadside = Math.abs(t.center) > 0.1 && Math.abs(Math.abs(t.center) - Math.PI) > 0.1;
    return {
      def: t,
      rel: t.center,
      half: t.half ?? 2.55,
      timer: w.rng.range(0, def.guns.reload),
      x: broadside ? Math.sign(t.center) * def.beam * 0.3 : 0,
      z: t.z,
      onTarget: false,
    };
  });
  const ship: Ship = {
    id: w.nextId++, def, team, x, z, h, speed: 0, throttle: team === 'ally' ? 4 : THROTTLE_MAX, rudder: 0,
    hp: def.hp, maxHp: def.hp, alive: true, sinkT: 0, turrets,
    torpTimer: def.torp ? def.torp.reload * 0.4 : 0,
    orbit: w.rng() < 0.5 ? 1 : -1, aiT: w.rng.range(0, 1), aimErr: w.rng.range(0.6, 1.1),
  };
  w.ships.push(ship);
  return ship;
}

export function createWorld(opts: CreateOptions): World {
  const def = PLAYER_DESIGNS[opts.design];
  const cp = opts.checkpoint ?? null;
  const w = {
    mode: opts.mode ?? 'battle', design: opts.design, rng: createRng(opts.seed), time: cp ? cp.time : 0,
    phase: 'play', wave: cp ? cp.wave - 1 : -1, waveTimer: 1.2, ships: [], shells: [], torps: [],
    lockId: null, repairs: cp ? cp.repairs : def.repair, repairT: 0, dmgTaken: cp ? cp.dmgTaken : 0,
    sunk: cp ? cp.sunk : 0, checkpoint: cp, threats: [], events: [], nextId: 1, alarmed: new Set(),
    alarmCool: 0, agroundCool: 0,
  } as Omit<World, 'player'> as World;
  w.player = makeShip(w, def, 'ally', 0, -120, 0);
  if (cp) w.player.hp = cp.hp;
  if (w.mode === 'idle') {
    w.player.throttle = 3;
    w.player.speed = 4;
    for (const [x, z, h] of [[-60, 60, Math.PI * 0.9], [40, 90, Math.PI * 1.1]] as const) {
      const e = makeShip(w, ENEMY_DEFS.dd, 'enemy', x, z, h);
      e.speed = 6;
      e.throttle = 4;
    }
  } else {
    w.events.push(cp ? { type: 'retry', wave: cp.wave } : { type: 'start' });
  }
  return w;
}

function spawnWave(w: World, index: number): void {
  const wave = WAVES[index];
  if (!wave) return;
  const p = w.player;
  w.checkpoint = { wave: index, hp: p.hp, repairs: w.repairs, time: w.time, dmgTaken: w.dmgTaken, sunk: w.sunk };
  const cx = p.x + Math.sin(wave.from) * wave.dist;
  const cz = p.z + Math.cos(wave.from) * wave.dist;
  const back = wave.from + Math.PI;
  wave.ships.forEach((kind, j) => {
    const off = (j - (wave.ships.length - 1) / 2) * 45;
    const x = clamp(cx + Math.cos(wave.from) * off, -ARENA + 80, ARENA - 80);
    const z = clamp(cz - Math.sin(wave.from) * off, -ARENA + 80, ARENA - 80);
    const s = makeShip(w, ENEMY_DEFS[kind], 'enemy', x, z, back + w.rng.range(-0.2, 0.2));
    s.speed = s.def.speed * 0.8;
  });
  w.events.push({ type: 'wave', index });
  const locked = shipById(w, w.lockId);
  if (!locked || !locked.alive) autoLock(w);
}

// ---------- 照会 ----------

export function shipById(w: World, id: number | null): Ship | undefined {
  if (id === null) return undefined;
  return w.ships.find((s) => s.id === id);
}

export function liveEnemies(w: World): Ship[] {
  return w.ships.filter((s) => s.team === 'enemy' && s.alive);
}

export function enemiesByDistance(w: World): Ship[] {
  const p = w.player;
  return liveEnemies(w).sort((a, b) => dist(p.x, p.z, a.x, a.z) - dist(p.x, p.z, b.x, b.z));
}

export function lockedTarget(w: World): Ship | undefined {
  const s = shipById(w, w.lockId);
  return s && s.alive ? s : undefined;
}

/** 着弾までの移動を見越した照準点 */
export function leadPoint(from: Vec2, tgt: Ship, projectileSpeed: number): Vec2 {
  let px = tgt.x;
  let pz = tgt.z;
  const vx = Math.sin(tgt.h) * tgt.speed;
  const vz = Math.cos(tgt.h) * tgt.speed;
  for (let i = 0; i < 4; i++) {
    const t = Math.max(0.4, dist(from.x, from.z, px, pz) / projectileSpeed);
    px = tgt.x + vx * t;
    pz = tgt.z + vz * t;
  }
  return { x: px, z: pz };
}

/** 自艦の主砲が狙っている海面の点 */
export function playerAimPoint(w: World, control: Control): Vec2 {
  const t = lockedTarget(w);
  return t ? leadPoint(w.player, t, w.player.def.guns.shell) : control.aim;
}

export function turretWorldPos(ship: Ship, t: Turret): Vec2 {
  return {
    x: ship.x + Math.sin(ship.h) * t.z + Math.cos(ship.h) * t.x,
    z: ship.z + Math.cos(ship.h) * t.z - Math.sin(ship.h) * t.x,
  };
}

export function inHull(ship: Ship, x: number, z: number, margin: number): boolean {
  const dx = x - ship.x;
  const dz = z - ship.z;
  const c = Math.cos(ship.h);
  const s = Math.sin(ship.h);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) < ship.def.beam / 2 + margin && Math.abs(lz) < ship.def.len / 2 + margin;
}

// ---------- 捕捉 ----------

function autoLock(w: World): void {
  const e = enemiesByDistance(w)[0];
  w.lockId = e ? e.id : null;
  if (e) w.events.push({ type: 'lock', shipId: e.id, name: e.def.name, manual: false });
}

function setLock(w: World, id: number | null): void {
  const s = shipById(w, id);
  if (s && s.alive && s.team === 'enemy') {
    if (w.lockId !== s.id) w.events.push({ type: 'lock', shipId: s.id, name: s.def.name, manual: true });
    w.lockId = s.id;
  } else if (id === null && w.lockId !== null) {
    w.lockId = null;
    w.events.push({ type: 'lock', shipId: null, name: null, manual: true });
  }
}

function cycleLock(w: World): void {
  const list = enemiesByDistance(w);
  if (!list.length) return;
  const i = list.findIndex((s) => s.id === w.lockId);
  const next = list[(i + 1) % list.length];
  if (next) {
    w.lockId = next.id;
    w.events.push({ type: 'lock', shipId: next.id, name: next.def.name, manual: true });
  }
}

// ---------- 兵装 ----------

function fireShell(w: World, ship: Ship, tx: number, tz: number, tur: Turret): void {
  const gd = ship.def.guns;
  const origin = turretWorldPos(ship, tur);
  const d = dist(origin.x, origin.z, tx, tz);
  const sig = gd.disp * d;
  const b = bearingTo(origin.x, origin.z, tx, tz);
  const along = w.rng.gauss() * sig * 1.6;
  const lat = w.rng.gauss() * sig;
  const cx = tx + Math.sin(b) * along + Math.cos(b) * lat;
  const cz = tz + Math.cos(b) * along - Math.sin(b) * lat;
  const sy = 3 + 1.5;
  for (let i = 0; i < gd.barrels; i++) {
    const jx = cx + w.rng.gauss() * sig * 0.35;
    const jz = cz + w.rng.gauss() * sig * 0.35;
    const d2 = dist(origin.x, origin.z, jx, jz);
    w.shells.push({
      id: w.nextId++, team: ship.team, sx: origin.x, sz: origin.z, sy, tx: jx, tz: jz,
      T: Math.max(0.4, d2 / gd.shell) * w.rng.range(0.97, 1.03), t: 0, apex: d2 * 0.16,
      dmg: (gd.dmg / gd.barrels) * w.rng.range(0.8, 1.2), big: gd.dmg / gd.barrels > 20,
      x: origin.x, y: sy, z: origin.z,
    });
  }
  w.events.push({
    type: 'gunFire', x: origin.x + Math.sin(b) * 3, y: sy + 0.5, z: origin.z + Math.cos(b) * 3, bearing: b,
    team: ship.team, big: ship.team === 'ally' || !!ship.def.boss,
  });
}

function fireTorps(w: World, ship: Ship, bearing: number): void {
  const td = ship.def.torp;
  if (!td) return;
  for (let i = 0; i < td.n; i++) {
    const a = bearing + (i - (td.n - 1) / 2) * td.spread;
    w.torps.push({
      id: w.nextId++, team: ship.team, x: ship.x + Math.sin(a) * 6, z: ship.z + Math.cos(a) * 6, h: a,
      v: TORP_SPEED, run: 0, range: td.range ?? PLAYER_TORP_RANGE, dmg: td.dmg,
    });
  }
  ship.torpTimer = td.reload;
  w.events.push({ type: 'torpFired', team: ship.team });
}

function aimTurrets(ship: Ship, tx: number, tz: number, dt: number): void {
  for (const t of ship.turrets) {
    const pos = turretWorldPos(ship, t);
    const want = wrap(bearingTo(pos.x, pos.z, tx, tz) - ship.h);
    const off = wrap(want - t.def.center);
    const goal = wrap(t.def.center + clamp(off, -t.half, t.half));
    const rate = 1.1 * dt;
    t.rel = wrap(t.rel + clamp(wrap(goal - t.rel), -rate, rate));
    t.onTarget = Math.abs(off) <= t.half && Math.abs(wrap(want - t.rel)) < 0.05;
    if (t.timer > 0) t.timer -= dt;
  }
}

function tryFire(w: World, ship: Ship, tx: number, tz: number): void {
  const gd = ship.def.guns;
  const d = dist(ship.x, ship.z, tx, tz);
  if (d > gd.range) {
    const k = gd.range / d;
    tx = ship.x + (tx - ship.x) * k;
    tz = ship.z + (tz - ship.z) * k;
  }
  for (const t of ship.turrets) {
    if (t.timer <= 0 && t.onTarget) {
      fireShell(w, ship, tx, tz, t);
      t.timer = gd.reload * w.rng.range(0.95, 1.05);
    }
  }
}

function damage(w: World, ship: Ship, dmg: number, x: number, y: number, z: number, torpedo: boolean): void {
  if (!ship.alive) return;
  ship.hp -= dmg;
  const onPlayer = ship === w.player;
  if (onPlayer) w.dmgTaken += dmg;
  w.events.push({ type: 'hit', x, y, z, dmg, shipId: ship.id, onPlayer, torpedo });
  if (ship.hp <= 0) {
    ship.hp = 0;
    ship.alive = false;
    ship.sinkT = 0;
    w.events.push({ type: 'sunk', shipId: ship.id, name: ship.def.name, team: ship.team, boss: !!ship.def.boss, x: ship.x, z: ship.z });
    if (ship.team === 'enemy') {
      w.sunk++;
      if (w.lockId === ship.id) autoLock(w);
    }
  }
}

// ---------- 運動 ----------

function pushOffObstacles(w: World, ship: Ship): void {
  for (const is of ISLANDS) {
    const dx = ship.x - is.x;
    const dz = ship.z - is.z;
    const d = Math.hypot(dx, dz);
    const min = is.r + ship.def.len * 0.35;
    if (d < min) {
      ship.x = is.x + (dx / d) * min;
      ship.z = is.z + (dz / d) * min;
      ship.speed *= 0.6;
      if (ship === w.player && w.time > w.agroundCool) {
        w.agroundCool = w.time + 2.5;
        w.events.push({ type: 'aground' });
      }
    }
  }
  const r = Math.hypot(ship.x, ship.z);
  if (r > ARENA) {
    ship.x *= ARENA / r;
    ship.z *= ARENA / r;
    ship.speed *= 0.9;
  }
}

function moveShip(w: World, ship: Ship, dt: number): void {
  const target = ship.def.speed * (THROTTLE[ship.throttle]?.factor ?? 0);
  const acc = ship.def.speed * 0.12;
  ship.speed += clamp(target - ship.speed, -acc * dt * 1.4, acc * dt);
  const eff = clamp(Math.abs(ship.speed) / (ship.def.speed * 0.45), 0.2, 1);
  ship.h = wrap(ship.h + ship.rudder * ship.def.turn * eff * Math.sign(ship.speed || 1) * dt);
  ship.x += Math.sin(ship.h) * ship.speed * dt;
  ship.z += Math.cos(ship.h) * ship.speed * dt;
  pushOffObstacles(w, ship);
}

// ---------- 敵AI ----------

function enemyAI(w: World, e: Ship, dt: number): void {
  const p = w.player;
  const d = dist(e.x, e.z, p.x, p.z);
  const b = bearingTo(e.x, e.z, p.x, p.z);
  const keep = e.def.keepRange ?? 250;
  let want: number;
  if (!p.alive) want = e.h;
  else if (d > keep + 60) want = b + e.orbit * 0.35;
  else if (d < keep - 60) want = b + e.orbit * 2.1;
  else want = b + (e.orbit * Math.PI) / 2;
  for (const is of ISLANDS) {
    const ax = e.x + Math.sin(e.h) * 90;
    const az = e.z + Math.cos(e.h) * 90;
    if (dist(ax, az, is.x, is.z) < is.r + 30) {
      want = bearingTo(is.x, is.z, e.x, e.z) + e.orbit * 1.2;
      break;
    }
  }
  if (Math.hypot(e.x, e.z) > ARENA - 120) want = bearingTo(e.x, e.z, 0, 0);
  e.rudder = clamp(wrap(want - e.h) * 2.2, -1, 1);
  e.throttle = e.def.boss ? THROTTLE_MAX : d < keep ? THROTTLE_MAX - 1 : THROTTLE_MAX;

  if (!p.alive) return;
  e.aiT -= dt;
  if (e.aiT <= 0) {
    e.aiT = w.rng.range(1.5, 3);
    e.aimErr = w.rng.range(0.5, 1.15);
  }
  const lp = leadPoint(e, p, e.def.guns.shell);
  const tx = p.x + (lp.x - p.x) * e.aimErr;
  const tz = p.z + (lp.z - p.z) * e.aimErr;
  aimTurrets(e, tx, tz, dt);
  if (d < e.def.guns.range) tryFire(w, e, tx, tz);
  const td = e.def.torp;
  if (td) {
    e.torpTimer -= dt;
    if (e.torpTimer <= 0 && d < (td.range ?? PLAYER_TORP_RANGE)) {
      const tl = leadPoint(e, p, TORP_SPEED);
      fireTorps(w, e, bearingTo(e.x, e.z, tl.x, tl.z) + w.rng.range(-0.05, 0.05));
    }
  }
}

// ---------- 自艦 ----------

function applyCommand(w: World, cmd: Command, control: Control): void {
  const p = w.player;
  if (!p.alive || w.phase !== 'play') return;
  switch (cmd.type) {
    case 'throttle':
      p.throttle = clamp(p.throttle + cmd.delta, 0, THROTTLE_MAX);
      break;
    case 'torp': {
      if (!p.def.torp) return;
      if (p.torpTimer > 0) {
        w.events.push({ type: 'torpReloading' });
        return;
      }
      const t = lockedTarget(w);
      const aim = t ? leadPoint(p, t, TORP_SPEED) : control.aim;
      fireTorps(w, p, bearingTo(p.x, p.z, aim.x, aim.z));
      break;
    }
    case 'repair':
      if (w.repairT > 0) return;
      if (w.repairs <= 0) {
        w.events.push({ type: 'noRepair' });
        return;
      }
      w.repairs--;
      w.repairT = REPAIR_TIME;
      w.events.push({ type: 'repairStart' });
      break;
    case 'lock':
      setLock(w, cmd.shipId);
      break;
    case 'cycleLock':
      cycleLock(w);
      break;
  }
}

function updatePlayer(w: World, control: Control, dt: number): void {
  const p = w.player;
  if (!p.alive || w.phase !== 'play') return;
  const steer = clamp(control.steer, -1, 1);
  p.rudder += clamp(-steer - p.rudder, -2.5 * dt, 2.5 * dt);
  const aim = playerAimPoint(w, control);
  aimTurrets(p, aim.x, aim.z, dt);
  if (control.fire) tryFire(w, p, aim.x, aim.z);
  if (p.torpTimer > 0) p.torpTimer -= dt;
  if (w.repairT > 0) {
    w.repairT -= dt;
    p.hp = Math.min(p.maxHp, p.hp + ((p.maxHp * REPAIR_RATIO) / REPAIR_TIME) * dt);
  }
}

// ---------- 波と勝敗 ----------

function updateWaves(w: World, dt: number): void {
  if (w.mode !== 'battle' || w.phase !== 'play') return;
  const last = WAVES.length - 1;
  if (!w.player.alive) {
    if (w.player.sinkT > 3.5) w.phase = 'lost';
    return;
  }
  if (liveEnemies(w).length > 0) {
    w.waveTimer = w.wave >= last ? 3 : 4;
    return;
  }
  w.waveTimer -= dt;
  if (w.waveTimer > 0) return;
  if (w.wave >= last) {
    w.phase = 'won';
  } else {
    w.wave++;
    spawnWave(w, w.wave);
    w.waveTimer = 3.5;
  }
}

// ---------- 魚雷警報 ----------

function updateThreats(w: World): void {
  w.threats = [];
  const p = w.player;
  if (!p.alive || w.phase !== 'play') return;
  const pvx = Math.sin(p.h) * p.speed;
  const pvz = Math.cos(p.h) * p.speed;
  for (const t of w.torps) {
    if (t.team !== 'enemy') continue;
    const rx = p.x - t.x;
    const rz = p.z - t.z;
    if (Math.hypot(rx, rz) > 340) continue;
    const vx = pvx - Math.sin(t.h) * t.v;
    const vz = pvz - Math.cos(t.h) * t.v;
    const vv = vx * vx + vz * vz;
    if (vv < 1e-6) continue;
    const tc = -(rx * vx + rz * vz) / vv;
    if (tc < 0 || tc > 25 || t.run + t.v * tc > t.range) continue;
    const miss = Math.hypot(rx + vx * tc, rz + vz * tc);
    if (miss < p.def.len * 0.6 + 6) {
      w.threats.push({ torp: t, tc });
      if (!w.alarmed.has(t.id)) {
        w.alarmed.add(t.id);
        if (w.time > w.alarmCool) {
          w.alarmCool = w.time + 1.5;
          w.events.push({ type: 'alarm' });
        }
      }
    }
  }
}

// ---------- 1ティック ----------

export function step(w: World, control: Control, commands: readonly Command[], dt: number): void {
  if (w.phase === 'play' && w.mode === 'battle') w.time += dt;
  for (const c of commands) applyCommand(w, c, control);
  if (w.mode === 'battle') updatePlayer(w, control, dt);
  updateWaves(w, dt);

  for (const s of w.ships) {
    if (s.alive) {
      if (s.team === 'enemy') {
        if (w.mode === 'battle') enemyAI(w, s, dt);
        else s.rudder = 0.2;
      }
      moveShip(w, s, dt);
    } else {
      s.sinkT += dt;
      s.speed *= 0.97;
      s.x += Math.sin(s.h) * s.speed * dt;
      s.z += Math.cos(s.h) * s.speed * dt;
    }
  }
  w.ships = w.ships.filter((s) => s.alive || s === w.player || s.sinkT < 8);

  for (let i = w.shells.length - 1; i >= 0; i--) {
    const sh = w.shells[i]!;
    sh.t += dt;
    const k = Math.min(1, sh.t / sh.T);
    sh.x = sh.sx + (sh.tx - sh.sx) * k;
    sh.z = sh.sz + (sh.tz - sh.sz) * k;
    sh.y = sh.sy * (1 - k) + 4 * sh.apex * k * (1 - k);
    let done = false;
    if (sh.y < 6) {
      for (const s of w.ships) {
        if (!s.alive || s.team === sh.team) continue;
        if (inHull(s, sh.x, sh.z, 0.6)) {
          damage(w, s, sh.dmg, sh.x, 4, sh.z, false);
          done = true;
          break;
        }
      }
    }
    if (!done && k >= 1) {
      done = true;
      const onIsland = ISLANDS.some((is) => dist(sh.x, sh.z, is.x, is.z) < is.r);
      w.events.push(onIsland ? { type: 'dust', x: sh.x, z: sh.z } : { type: 'splash', x: sh.x, z: sh.z, big: sh.big });
    }
    if (done) w.shells.splice(i, 1);
  }

  for (let i = w.torps.length - 1; i >= 0; i--) {
    const t = w.torps[i]!;
    const stepLen = t.v * dt;
    t.x += Math.sin(t.h) * stepLen;
    t.z += Math.cos(t.h) * stepLen;
    t.run += stepLen;
    let done = t.run > t.range;
    if (!done && ISLANDS.some((is) => dist(t.x, t.z, is.x, is.z) < is.r)) {
      w.events.push({ type: 'dust', x: t.x, z: t.z });
      done = true;
    }
    if (!done) {
      for (const s of w.ships) {
        if (!s.alive || s.team === t.team) continue;
        if (inHull(s, t.x, t.z, 0.4)) {
          damage(w, s, t.dmg * w.rng.range(0.85, 1.15), t.x, 1, t.z, true);
          done = true;
          break;
        }
      }
    }
    if (done) w.torps.splice(i, 1);
  }

  updateThreats(w);
}

/** 評価。勝っていないときは null */
export function rankOf(w: World): string | null {
  if (w.phase !== 'won') return null;
  const r = w.player.hp / w.player.maxHp;
  if (r > 0.5 && w.time < 420) return 'S';
  if (r > 0.3) return 'A';
  if (r > 0.12) return 'B';
  return 'C';
}
