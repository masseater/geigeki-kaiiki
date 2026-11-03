import { createBot } from '../src/sim/bot';
import type { DesignId } from '../src/sim/data';
import { createWorld, step, type World } from '../src/sim/world';

export const DT = 1 / 30;

export interface BattleResult {
  design: DesignId;
  seed: number;
  won: boolean;
  /** 残存耐久の割合 */
  hpRatio: number;
  time: number;
  wave: number;
  sunk: number;
}

/** ボットに1戦させる。limit 秒を超えたら打ち切り */
export function runBattle(design: DesignId, seed: number, limit = 900): BattleResult & { world: World } {
  const w = createWorld({ design, seed });
  const bot = createBot();
  while (w.phase === 'play' && w.time < limit) {
    const { control, commands } = bot.think(w);
    step(w, control, commands, DT);
    w.events.length = 0;
  }
  return {
    world: w, design, seed, won: w.phase === 'won', hpRatio: w.player.hp / w.player.maxHp,
    time: w.time, wave: w.wave, sunk: w.sunk,
  };
}
