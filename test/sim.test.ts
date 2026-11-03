import { describe, expect, test } from 'vitest';
import { WAVES } from '../src/sim/data';
import { createWorld, leadPoint, liveEnemies, step, IDLE_CONTROL, type Control } from '../src/sim/world';
import { DT, runBattle } from './harness';

describe('再現性', () => {
  test('同じシードなら同じ戦闘になる', () => {
    const a = runBattle('bc', 42);
    const b = runBattle('bc', 42);
    expect(b.time).toBe(a.time);
    expect(b.world.player.hp).toBe(a.world.player.hp);
    expect(b.sunk).toBe(a.sunk);
  });

  test('シードが違えば展開が変わる', () => {
    const a = runBattle('bc', 1);
    const b = runBattle('bc', 2);
    expect([a.time, a.world.player.hp]).not.toEqual([b.time, b.world.player.hp]);
  });
});

describe('波の進行', () => {
  test('開始直後に第一波が現れ、最寄りの敵を自動で捕捉する', () => {
    const w = createWorld({ design: 'bc', seed: 1 });
    for (let i = 0; i < 60; i++) step(w, IDLE_CONTROL, [], DT);
    expect(w.wave).toBe(0);
    expect(liveEnemies(w)).toHaveLength(WAVES[0]!.ships.length);
    expect(w.lockId).not.toBeNull();
    expect(w.checkpoint?.wave).toBe(0);
  });

  test('チェックポイントから再開するとその波から始まり、耐久と修理資材を引き継ぐ', () => {
    const cp = { wave: 2, hp: 300, repairs: 0, time: 200, dmgTaken: 780, sunk: 8 };
    const w = createWorld({ design: 'bc', seed: 1, checkpoint: cp });
    for (let i = 0; i < 60; i++) step(w, IDLE_CONTROL, [], DT);
    expect(w.wave).toBe(2);
    expect(liveEnemies(w).some((s) => s.def.boss)).toBe(true);
    expect(w.player.hp).toBe(300);
    expect(w.repairs).toBe(0);
  });
});

describe('射撃', () => {
  test('見越し点は等速直進する目標の将来位置に一致する', () => {
    const w = createWorld({ design: 'bc', seed: 1 });
    for (let i = 0; i < 60; i++) step(w, IDLE_CONTROL, [], DT);
    const t = liveEnemies(w)[0]!;
    const lp = leadPoint(w.player, t, 72);
    const flight = Math.hypot(lp.x - w.player.x, lp.z - w.player.z) / 72;
    expect(lp.x).toBeCloseTo(t.x + Math.sin(t.h) * t.speed * flight, 0);
    expect(lp.z).toBeCloseTo(t.z + Math.cos(t.h) * t.speed * flight, 0);
  });

  test('射撃を続けると第一波の駆逐艦に命中弾が出る', () => {
    const w = createWorld({ design: 'bb', seed: 3 });
    let hits = 0;
    for (let i = 0; i < 30 * 60; i++) {
      const t = liveEnemies(w)[0];
      const control: Control = { steer: 0, fire: true, aim: t ? { x: t.x, z: t.z } : { x: 0, z: 0 } };
      step(w, control, [], DT);
      hits += w.events.filter((e) => e.type === 'hit' && !e.onPlayer).length;
      w.events.length = 0;
    }
    expect(hits).toBeGreaterThan(0);
  });
});

describe('魚雷警報', () => {
  test('自艦へ向かう魚雷は脅威として拾い、外れる魚雷は拾わない', () => {
    const w = createWorld({ design: 'bc', seed: 1, mode: 'idle' });
    w.mode = 'battle';
    const p = w.player;
    p.speed = 0;
    p.throttle = 1;
    const base = { team: 'enemy' as const, v: 15, run: 0, range: 400, dmg: 100 };
    w.torps.push({ ...base, id: 900, x: p.x, z: p.z + 150, h: Math.PI });
    w.torps.push({ ...base, id: 901, x: p.x + 150, z: p.z + 150, h: Math.PI });
    step(w, IDLE_CONTROL, [], DT);
    expect(w.threats.map((t) => t.torp.id)).toEqual([900]);
    expect(w.threats[0]!.tc).toBeGreaterThan(8);
    expect(w.events.some((e) => e.type === 'alarm')).toBe(true);
  });
});
