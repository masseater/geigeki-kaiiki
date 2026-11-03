// 座標系: 海面は x-z 平面。北が +z、真上から北を上に見たとき東は -x。
// 方位 h の前方ベクトルは (sin h, cos h)。h が増えると左（取舵）へ回る。

export const TAU = Math.PI * 2;

export const wrap = (a: number): number => {
  let r = (a + Math.PI) % TAU;
  if (r < 0) r += TAU;
  return r - Math.PI;
};

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const bearingTo = (ax: number, az: number, bx: number, bz: number): number => Math.atan2(bx - ax, bz - az);

export const dist = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(bx - ax, bz - az);

/** シード付き乱数（mulberry32）。シミュレーションの再現性のため Math.random は使わない */
export interface Rng {
  (): number;
  range(lo: number, hi: number): number;
  gauss(): number;
  pick<T>(xs: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (() => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  next.pick = (xs) => {
    const x = xs[Math.floor(next() * xs.length)];
    if (x === undefined) throw new Error('pick from empty array');
    return x;
  };
  return next;
}
