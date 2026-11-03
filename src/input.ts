// キーボード・マウス・タッチを sim の Control と Command に変換する

import type { BattleView } from './render/view';
import type { Command, Control, Vec2, World } from './sim/world';

export interface InputHooks {
  isPlaying(): boolean;
  world(): World;
  onEnter(): void;
  onZoom(delta: number): void;
  onToggleMute(): void;
  /** 最初の操作で音を有効にする */
  onFirstGesture(): void;
}

export class Input {
  readonly touch = matchMedia('(pointer: coarse)').matches;
  private keys = new Set<string>();
  private held = { left: false, right: false, fire: false };
  private mouseFire = false;
  private queue: Command[] = [];
  private pointer = { x: innerWidth / 2, y: innerHeight * 0.35 };
  private pointerActive = false;
  private aim: Vec2 = { x: 0, z: 100 };

  constructor(private view: BattleView, private hooks: InputHooks) {
    const canvas = view.canvas;
    const gesture = (): void => hooks.onFirstGesture();
    addEventListener('pointerdown', gesture);
    addEventListener('keydown', gesture);

    canvas.addEventListener('mousemove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      this.pointerActive = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!hooks.isPlaying()) return;
      if (e.button === 0) this.mouseFire = true;
      if (e.button === 2) this.lockAt(e.clientX, e.clientY, 90, true);
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      hooks.onZoom(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseFire = false;
    });

    if (this.touch) {
      document.getElementById('game')?.classList.add('touch-on');
      this.bindTouchButtons();
      canvas.addEventListener('touchstart', (e) => {
        if (!hooks.isPlaying()) return;
        e.preventDefault();
        const t = e.changedTouches[0];
        if (!t) return;
        this.pointer = { x: t.clientX, y: t.clientY };
        this.pointerActive = true;
        this.lockAt(t.clientX, t.clientY, 46, false);
      }, { passive: false });
      canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        if (t) this.pointer = { x: t.clientX, y: t.clientY };
      }, { passive: false });
    }
  }

  private lockAt(x: number, y: number, radius: number, toggle: boolean): void {
    const w = this.hooks.world();
    const s = this.view.enemyNearScreen(w, x, y, radius);
    if (s) this.queue.push({ type: 'lock', shipId: s.id });
    else if (toggle || w.lockId !== null) this.queue.push({ type: 'lock', shipId: null });
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
    if (!down) {
      this.keys.delete(k);
      return;
    }
    if (!this.hooks.isPlaying()) {
      if (k === 'enter') this.hooks.onEnter();
      return;
    }
    this.keys.add(k);
    if (e.repeat) return;
    if (k === 'w' || k === 'arrowup') this.queue.push({ type: 'throttle', delta: 1 });
    if (k === 's' || k === 'arrowdown') this.queue.push({ type: 'throttle', delta: -1 });
    if (k === 'f') this.queue.push({ type: 'torp' });
    if (k === 'r') this.queue.push({ type: 'repair' });
    if (k === 'tab' || k === 'e') this.queue.push({ type: 'cycleLock' });
    if (k === 'z') this.hooks.onZoom(1);
    if (k === 'm') this.hooks.onToggleMute();
  }

  private bindTouchButtons(): void {
    document.querySelectorAll<HTMLButtonElement>('.tbtn').forEach((btn) => {
      const act = btn.dataset.act;
      const down = (e: Event): void => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('held');
        if (!this.hooks.isPlaying()) return;
        if (act === 'up') this.queue.push({ type: 'throttle', delta: 1 });
        if (act === 'down') this.queue.push({ type: 'throttle', delta: -1 });
        if (act === 'left') this.held.left = true;
        if (act === 'right') this.held.right = true;
        if (act === 'fire') this.held.fire = true;
        if (act === 'torp') this.queue.push({ type: 'torp' });
        if (act === 'repair') this.queue.push({ type: 'repair' });
        if (act === 'target') this.queue.push({ type: 'cycleLock' });
        if (act === 'zoom') this.hooks.onZoom(1);
      };
      const up = (e: Event): void => {
        e.preventDefault();
        btn.classList.remove('held');
        if (act === 'left') this.held.left = false;
        if (act === 'right') this.held.right = false;
        if (act === 'fire') this.held.fire = false;
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });
  }

  /** 今フレームの連続入力 */
  control(): Control {
    if (this.pointerActive) {
      const hit = this.view.screenToWater(this.pointer.x, this.pointer.y);
      if (hit) this.aim = hit;
    }
    const right = this.keys.has('d') || this.keys.has('arrowright') || this.held.right;
    const left = this.keys.has('a') || this.keys.has('arrowleft') || this.held.left;
    return {
      steer: (right ? 1 : 0) - (left ? 1 : 0),
      fire: this.mouseFire || this.keys.has(' ') || this.held.fire,
      aim: this.aim,
    };
  }

  /** 溜まった単発入力を取り出す */
  drain(): Command[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  reset(): void {
    this.queue = [];
    this.mouseFire = false;
    this.held = { left: false, right: false, fire: false };
  }
}
