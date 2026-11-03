// 艦・波・島の定義。数値を変えるときは pnpm balance で手応えを確認する

/** 速度（ユニット/秒）を表示用ノットに直す係数 */
export const KT = 3;
/** 作戦海域の半径 */
export const ARENA = 1300;

export interface Throttle {
  name: string;
  factor: number;
  reverse?: boolean;
}

export const THROTTLE: readonly Throttle[] = [
  { name: '後進', factor: -0.3, reverse: true },
  { name: '停止', factor: 0 },
  { name: '微速', factor: 0.2 },
  { name: '半速', factor: 0.4 },
  { name: '原速', factor: 0.6 },
  { name: '強速', factor: 0.75 },
  { name: '一戦', factor: 0.9 },
  { name: '最大', factor: 1 },
];
export const THROTTLE_MAX = THROTTLE.length - 1;

export interface GunDef {
  /** 一斉射ぶんの威力（砲身数で割って各弾へ配る） */
  dmg: number;
  reload: number;
  range: number;
  /** 砲弾の水平速度 */
  shell: number;
  /** 距離あたりの散布（標準偏差 / 距離） */
  disp: number;
  barrels: number;
}

export interface TorpDef {
  n: number;
  reload: number;
  dmg: number;
  spread: number;
  range?: number;
}

export interface TurretDef {
  /** 艦中心から艦首方向への位置 */
  z: number;
  /** 正面の向き（艦首基準の相対角） */
  center: number;
  raised?: boolean;
  /** 旋回できる片側の角度。省略時は 2.55rad */
  half?: number;
}

export interface ShipDef {
  id: string;
  name: string;
  type: string;
  hp: number;
  speed: number;
  turn: number;
  len: number;
  beam: number;
  guns: GunDef;
  turrets: readonly TurretDef[];
  torp: TorpDef | null;
  boss?: boolean;
  /** 敵AIが保とうとする距離 */
  keepRange?: number;
  /** 応急修理の回数（自艦のみ） */
  repair?: number;
}

export const PLAYER_DESIGNS = {
  bb: {
    id: 'bb', name: '試製戦艦 天城改', type: '戦艦', hp: 1500, speed: 8.5, turn: 0.3, len: 30, beam: 6,
    guns: { dmg: 78, reload: 6.0, range: 430, shell: 70, disp: 0.022, barrels: 3 },
    turrets: [{ z: 8, center: 0 }, { z: 3, center: 0, raised: true }, { z: -9, center: Math.PI }],
    torp: null, repair: 2,
  },
  bc: {
    id: 'bc', name: '試製巡洋戦艦 疾風', type: '巡洋戦艦', hp: 1080, speed: 11.5, turn: 0.4, len: 27, beam: 5,
    guns: { dmg: 58, reload: 4.6, range: 390, shell: 72, disp: 0.026, barrels: 2 },
    turrets: [{ z: 7, center: 0 }, { z: 2.5, center: 0, raised: true }, { z: -8, center: Math.PI }],
    torp: { n: 3, reload: 16, dmg: 200, spread: 0.1 }, repair: 2,
  },
  ct: {
    id: 'ct', name: '試製重雷装艦 叢雲', type: '重雷装巡洋艦', hp: 760, speed: 13, turn: 0.55, len: 22, beam: 4.2,
    guns: { dmg: 34, reload: 3.0, range: 330, shell: 75, disp: 0.03, barrels: 2 },
    turrets: [{ z: 6, center: 0 }, { z: -6.5, center: Math.PI }],
    torp: { n: 5, reload: 10, dmg: 230, spread: 0.09 }, repair: 2,
  },
} as const satisfies Record<string, ShipDef>;

export type DesignId = keyof typeof PLAYER_DESIGNS;
export const DESIGN_IDS = Object.keys(PLAYER_DESIGNS) as DesignId[];

export const ENEMY_DEFS = {
  dd: {
    id: 'dd', name: '敵駆逐艦', type: '駆逐艦', hp: 170, speed: 12.5, turn: 0.6, len: 15, beam: 3, keepRange: 190,
    guns: { dmg: 13, reload: 3.0, range: 260, shell: 70, disp: 0.055, barrels: 1 },
    turrets: [{ z: 4, center: 0 }, { z: -4, center: Math.PI }],
    torp: { n: 3, reload: 17, dmg: 130, spread: 0.12, range: 300 },
  },
  ca: {
    id: 'ca', name: '敵重巡洋艦', type: '重巡洋艦', hp: 420, speed: 10.5, turn: 0.42, len: 21, beam: 4, keepRange: 270,
    guns: { dmg: 24, reload: 4.4, range: 340, shell: 70, disp: 0.05, barrels: 2 },
    turrets: [{ z: 6, center: 0 }, { z: 2, center: 0, raised: true }, { z: -6, center: Math.PI }],
    torp: null,
  },
  boss: {
    id: 'boss', name: '超兵器〈ヴィルベルシュトルム〉', type: '超兵器', hp: 2400, speed: 15, turn: 0.32, len: 40, beam: 7, keepRange: 300, boss: true,
    guns: { dmg: 30, reload: 5.0, range: 420, shell: 80, disp: 0.05, barrels: 3 },
    turrets: [
      { z: 13, center: 0 }, { z: 8, center: 0, raised: true },
      { z: 2, center: Math.PI / 2, half: 1.6 }, { z: 2, center: -Math.PI / 2, half: 1.6 },
      { z: -8, center: Math.PI, raised: true }, { z: -13, center: Math.PI },
    ],
    torp: { n: 4, reload: 14, dmg: 150, spread: 0.1, range: 320 },
  },
} as const satisfies Record<string, ShipDef>;

export type EnemyId = keyof typeof ENEMY_DEFS;

export interface WaveDef {
  label: string;
  /** 自艦から見た出現方位（ラジアン。sim の h と同じ向き） */
  from: number;
  dist: number;
  ships: readonly EnemyId[];
  note: string;
}

const deg = (d: number): number => (-d * Math.PI) / 180;

export const WAVES: readonly WaveDef[] = [
  { label: '第一波', from: deg(0), dist: 720, ships: ['dd', 'dd', 'dd', 'dd'], note: '敵水雷戦隊、方位〇〇〇より接近' },
  { label: '第二波', from: deg(90), dist: 720, ships: ['ca', 'ca', 'dd', 'dd'], note: '敵巡洋艦隊、方位〇九〇より接近' },
  { label: '第三波', from: deg(216), dist: 760, ships: ['boss', 'dd', 'dd'], note: '超兵器を確認、方位二一六' },
];

export interface Island {
  x: number;
  z: number;
  r: number;
}

export const ISLANDS: readonly Island[] = [
  { x: 260, z: 380, r: 70 },
  { x: -420, z: 120, r: 95 },
  { x: 180, z: -460, r: 60 },
  { x: -230, z: -330, r: 45 },
  { x: 600, z: -80, r: 55 },
];

export const TORP_SPEED = 15;
export const PLAYER_TORP_RANGE = 480;
export const REPAIR_TIME = 5;
export const REPAIR_RATIO = 0.25;
