// ボット（全魚雷の針路が見えている）に各艦で12戦させ、勝率が想定の帯に収まるかを見る。
// 意図してバランスを変えたときは pnpm balance で数字を確かめ、EXPECTED を書き換える。
import { describe, expect, test } from 'vitest';
import { DESIGN_IDS, type DesignId } from '../src/sim/data';
import { runBattle } from './harness';

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

/** 12戦中の勝ち数の許容範囲 */
const EXPECTED: Record<DesignId, { min: number; max: number }> = {
  bb: { min: 8, max: 12 },
  bc: { min: 3, max: 9 },
  ct: { min: 0, max: 3 },
};

describe('バランス', () => {
  for (const design of DESIGN_IDS) {
    test(`${design}: ボットの勝ち数が想定の帯に収まる`, () => {
      const results = SEEDS.map((s) => runBattle(design, s));
      const wins = results.filter((r) => r.won);
      const hp = wins.map((r) => Math.round(r.hpRatio * 100));
      console.log(`${design} 勝ち ${wins.length}/${results.length} 残耐久% [${hp.join(', ')}] 敗北した波 [${results.filter((r) => !r.won).map((r) => r.wave + 1).join(', ')}]`);
      expect(wins.length).toBeGreaterThanOrEqual(EXPECTED[design].min);
      expect(wins.length).toBeLessThanOrEqual(EXPECTED[design].max);
      // ギリギリで倒しきる手応えを守る: 勝っても平均で7割以上残るなら易しすぎる
      if (wins.length) expect(hp.reduce((a, b) => a + b, 0) / hp.length).toBeLessThan(70);
    });
  }
});
