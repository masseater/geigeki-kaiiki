// 3D 画面の上に重ねる 2D 表示: 魚雷の予測線、画面外の敵と魚雷の矢印、ダメージ数字

import { TAU, bearingTo, wrap } from '../sim/math';
import type { World } from '../sim/world';
import type { BattleView } from '../render/view';

export class Overlay2D {
  private ctx: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** rel: カメラ前方からの相対方位（正は左） */
  private edgeArrow(rel: number, color: string, label: string, size: number): void {
    const ctx = this.ctx;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    const dx = -Math.sin(rel);
    const dy = -Math.cos(rel);
    // 上端は左右の計器と重ならないよう少し内側に寄せる
    const mx = W / 2 - 34;
    const my = H / 2 - (dy < 0 ? 60 : 34);
    const k = Math.min(Math.abs(dx) > 1e-4 ? mx / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-4 ? my / Math.abs(dy) : 1e9);
    const x = W / 2 + dx * k;
    const y = H / 2 + dy * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.8, size * 0.7);
    ctx.lineTo(-size * 0.8, size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (label) {
      ctx.fillStyle = color;
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, x - dx * 20, y - dy * 20 + 4);
    }
  }

  draw(w: World, view: BattleView): void {
    const ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(H * dpr)) {
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const p = w.player;
    if (w.mode !== 'battle' || w.phase !== 'play') return;

    for (const th of w.threats) {
      const t = th.torp;
      const len = Math.min(t.range - t.run, t.v * (th.tc + 4));
      const a = view.project(t.x, 0.5, t.z);
      const b = view.project(t.x + Math.sin(t.h) * len, 0.5, t.z + Math.cos(t.h) * len);
      if (a.front && b.front) {
        ctx.strokeStyle = 'rgba(255, 90, 58, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ff5a3a';
        ctx.beginPath();
        ctx.arc(a.x, a.y, 5, 0, TAU);
        ctx.fill();
      }
      if (!a.onScreen) this.edgeArrow(wrap(bearingTo(p.x, p.z, t.x, t.z) - view.camYaw), '#ff5a3a', '雷', 13);
    }

    // 距離の数字は捕捉中の目標だけに付ける（同じ方角に固まると読めなくなるため）
    for (const s of w.ships) {
      if (s.team !== 'enemy' || !s.alive) continue;
      if (view.project(s.x, 3, s.z).onScreen) continue;
      const locked = s.id === w.lockId;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      const color = locked ? '#ffffff' : s.def.boss ? '#ff4a2a' : '#e0614a';
      this.edgeArrow(wrap(bearingTo(p.x, p.z, s.x, s.z) - view.camYaw), color, locked ? String(Math.round(d)) : '', s.def.boss ? 12 : 9);
    }

    ctx.textAlign = 'center';
    for (const pp of view.popups) {
      const q = view.project(pp.x, pp.y + pp.t * 10, pp.z);
      if (!q.front) continue;
      ctx.globalAlpha = 1 - pp.t / 1.1;
      ctx.font = `${pp.big ? '700 20px' : '600 15px'} "IBM Plex Mono", monospace`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(pp.text, q.x, q.y);
      ctx.fillStyle = pp.mine ? '#ff8a6a' : '#ffe08a';
      ctx.fillText(pp.text, q.x, q.y);
    }
    ctx.globalAlpha = 1;
  }
}
