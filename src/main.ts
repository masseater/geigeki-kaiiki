import './style.css';
import { Sfx } from './audio';
import { Input } from './input';
import { BattleView, ZOOMS } from './render/view';
import { WAVES, type DesignId } from './sim/data';
import { createWorld, playerAimPoint, step, type Checkpoint, type SimEvent, type World } from './sim/world';
import { Overlay2D } from './ui/fx2d';
import { Hud } from './ui/hud';
import { hideOverlay, showBrief, showResult } from './ui/screens';

/** シミュレーションの固定刻み（秒） */
const SIM_DT = 1 / 60;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const view = new BattleView(canvas);
const overlay = new Overlay2D(document.getElementById('fx') as HTMLCanvasElement);
const hud = new Hud();
const sfx = new Sfx();

let design: DesignId = 'bc';
let screen: 'brief' | 'play' | 'result' = 'brief';
const newSeed = (): number => (Math.random() * 2 ** 32) >>> 0;
let world: World = createWorld({ design, seed: newSeed(), mode: 'idle' });

const input = new Input(view, {
  isPlaying: () => screen === 'play',
  world: () => world,
  onEnter: () => begin(null),
  onZoom: (d) => setZoom(view.zoom + d),
  onToggleMute: () => setMuted(!sfx.muted),
  onFirstGesture: () => sfx.unlock(),
});

function setZoom(i: number): void {
  view.zoom = Math.max(0, Math.min(ZOOMS.length - 1, i));
  hud.setZoomLabel(ZOOMS[view.zoom]!.name);
}
function setMuted(m: boolean): void {
  sfx.setMuted(m);
  hud.setMuteLabel(m);
}
document.getElementById('zoomBtn')!.addEventListener('click', () => setZoom((view.zoom + 1) % ZOOMS.length));
document.getElementById('muteBtn')!.addEventListener('click', () => {
  sfx.unlock();
  setMuted(!sfx.muted);
});

function loadWorld(w: World): void {
  world = w;
  view.reset(w);
  hud.setShip(w);
}

function begin(checkpoint: Checkpoint | null): void {
  sfx.unlock();
  loadWorld(createWorld({ design, seed: newSeed(), checkpoint }));
  hud.clearLog();
  input.reset();
  screen = 'play';
  hideOverlay();
}

function toBrief(): void {
  screen = 'brief';
  loadWorld(createWorld({ design, seed: newSeed(), mode: 'idle' }));
  showBrief({
    selected: design,
    touch: input.touch,
    onSelect: (d) => {
      design = d;
      loadWorld(createWorld({ design, seed: newSeed(), mode: 'idle' }));
    },
    onStart: () => begin(null),
  });
}

function handle(e: SimEvent): void {
  view.handleEvent(e);
  const me = world.player;
  switch (e.type) {
    case 'start':
      hud.log('出撃。来襲する敵艦隊を全艦撃沈せよ');
      break;
    case 'retry':
      hud.log(`${WAVES[e.wave]?.label ?? ''}から再挑戦`);
      break;
    case 'wave': {
      const wv = WAVES[e.index];
      if (wv) {
        hud.setWaveLabel(wv.label);
        hud.log(`${wv.label}　${wv.note}`, e.index === WAVES.length - 1 ? 'big' : 'bad');
      }
      break;
    }
    case 'gunFire':
      sfx.gun(me, e.x, e.z, e.big);
      break;
    case 'splash':
      sfx.splash(me, e.x, e.z);
      break;
    case 'hit':
      sfx.boom(me, e.x, e.z, e.dmg > 100);
      if (e.onPlayer && e.torpedo) hud.log('被雷', 'bad');
      break;
    case 'sunk':
      if (e.team === 'enemy') hud.log(`${e.name} 撃沈`, e.boss ? 'big' : '');
      else hud.log('本艦、沈没', 'big');
      break;
    case 'lock':
      sfx.lock();
      if (e.manual) hud.log(e.name ? `目標捕捉　${e.name}` : '捕捉解除');
      break;
    case 'torpFired':
      if (e.team === 'ally') hud.log('魚雷発射');
      break;
    case 'torpReloading':
      hud.log('魚雷 装填中');
      break;
    case 'repairStart':
      hud.log('応急修理開始');
      break;
    case 'noRepair':
      hud.log('応急修理資材なし', 'bad');
      break;
    case 'aground':
      hud.log('座礁注意', 'bad');
      break;
    case 'alarm':
      sfx.alarm();
      break;
    case 'dust':
      break;
  }
}

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  const control = input.control();
  let commands = screen === 'play' ? input.drain() : [];
  let steps = 0;
  while (acc >= SIM_DT && steps < 6) {
    step(world, control, commands, SIM_DT);
    commands = [];
    for (const e of world.events) handle(e);
    world.events.length = 0;
    acc -= SIM_DT;
    steps++;
  }
  if (steps === 6) acc = 0;

  if (screen === 'play' && world.phase !== 'play') {
    screen = 'result';
    showResult(world, {
      onRetryWave: () => begin(world.checkpoint),
      onRestart: () => begin(null),
      onBrief: toBrief,
    });
  }

  view.update(world, dt, screen === 'play' ? playerAimPoint(world, control) : null, world.lockId);
  view.render();
  overlay.draw(world, view);
  hud.update(world, dt);
  requestAnimationFrame(frame);
}

addEventListener('resize', () => view.resize());
view.resize();
setZoom(1);
toBrief();
requestAnimationFrame(frame);

// 自動プレイ録画やデバッグ用に状態を覗けるようにしておく
Object.assign(window, { __geigeki: { get world() { return world; }, view } });
