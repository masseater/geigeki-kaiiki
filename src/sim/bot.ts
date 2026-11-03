// 自艦を操縦するボット。バランス確認のテストと、将来のデモ再生に使う。
// 人間より情報が多い（全魚雷の針路が見えている）ので、これに楽勝されたら人間にも易しすぎる。

import { ISLANDS, THROTTLE_MAX } from './data';
import { bearingTo, clamp, dist, wrap } from './math';
import { lockedTarget, liveEnemies, type Command, type Control, type World } from './world';

export interface Bot {
  think(w: World): { control: Control; commands: Command[] };
}

export function createBot(): Bot {
  let reverseUntil = -1;
  return {
    think(w) {
      const p = w.player;
      const commands: Command[] = [];
      const control: Control = { steer: 0, fire: false, aim: { x: p.x + Math.sin(p.h) * 100, z: p.z + Math.cos(p.h) * 100 } };
      if (!p.alive || w.phase !== 'play') return { control, commands };

      let want: number | null = null;
      const enemies = liveEnemies(w).sort((a, b) => dist(p.x, p.z, a.x, a.z) - dist(p.x, p.z, b.x, b.z));
      // 超兵器は護衛を片付けてから
      const tgt = enemies.find((e) => !e.def.boss) ?? enemies[0];
      if (tgt) {
        if (lockedTarget(w)?.id !== tgt.id) commands.push({ type: 'lock', shipId: tgt.id });
        const d = dist(p.x, p.z, tgt.x, tgt.z);
        const br = bearingTo(p.x, p.z, tgt.x, tgt.z);
        const keep = p.def.guns.range * (tgt.def.boss ? 0.85 : 0.75);
        const side = wrap(br - p.h) < 0 ? 1 : -1;
        if (d > keep + 40) want = br + side * 0.35;
        else if (d < keep - 50) want = br + side * 2.0;
        else want = br + side * 1.45;
        control.aim = { x: tgt.x, z: tgt.z };
        control.fire = d < p.def.guns.range;
        if (p.def.torp && p.torpTimer <= 0 && d < 260) commands.push({ type: 'torp' });
      }

      // 魚雷は平行に向けて躱す
      const threat = w.threats.reduce<(typeof w.threats)[number] | null>((a, b) => (!a || b.tc < a.tc ? b : a), null);
      if (threat && threat.tc < 16) {
        const a1 = threat.torp.h;
        const a2 = a1 + Math.PI;
        want = Math.abs(wrap(a1 - p.h)) < Math.abs(wrap(a2 - p.h)) ? a1 : a2;
      }

      if (Math.hypot(p.x, p.z) > 1150) want = bearingTo(p.x, p.z, 0, 0);
      for (const is of ISLANDS) {
        const ax = p.x + Math.sin(p.h) * 70;
        const az = p.z + Math.cos(p.h) * 70;
        if (dist(ax, az, is.x, is.z) < is.r + 25) {
          want = bearingTo(is.x, is.z, p.x, p.z) + 1.1;
          break;
        }
      }

      // 座礁したら少し後進して離れる
      const grounded = ISLANDS.some((is) => dist(p.x, p.z, is.x, is.z) < is.r + p.def.len * 0.35 + 3);
      if (grounded && Math.abs(p.speed) < 2.5 && reverseUntil < 0) reverseUntil = w.time + 3;
      if (reverseUntil >= 0) {
        if (w.time < reverseUntil) {
          if (p.throttle > 0) commands.push({ type: 'throttle', delta: -p.throttle });
          return { control, commands };
        }
        reverseUntil = -1;
      }

      if (want !== null) control.steer = clamp(-wrap(want - p.h) * 3, -1, 1);
      if (p.throttle < THROTTLE_MAX) commands.push({ type: 'throttle', delta: THROTTLE_MAX - p.throttle });
      if (p.hp < p.maxHp * 0.45 && w.repairT <= 0 && w.repairs > 0) commands.push({ type: 'repair' });
      return { control, commands };
    },
  };
}
