// 四隅の計器・ログ・レーダー・魚雷警報（DOM）

import { ARENA, ISLANDS, KT, REPAIR_TIME, THROTTLE } from '../sim/data';
import { TAU, bearingTo, wrap } from '../sim/math';
import { lockedTarget, liveEnemies, type World } from '../sim/world';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} がありません`);
  return el as T;
};

export type LogKind = '' | 'bad' | 'big';

const fmtClock = (t: number): string =>
  `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export { fmtClock };

export class Hud {
  private tele = $('telegraph');
  private radar = $<HTMLCanvasElement>('radar');
  private rctx = this.radar.getContext('2d')!;
  private alarm = $('alarm');
  private acc = 0;

  constructor() {
    THROTTLE.forEach((t) => {
      const s = document.createElement('span');
      s.textContent = t.name;
      if (t.reverse) s.className = 'rev';
      this.tele.appendChild(s);
    });
  }

  log(msg: string, kind: LogKind = ''): void {
    const box = $('log');
    const d = document.createElement('div');
    d.textContent = msg;
    if (kind) d.className = kind;
    box.prepend(d);
    while (box.children.length > 4) box.lastChild?.remove();
    setTimeout(() => d.remove(), kind === 'big' ? 5000 : 3200);
  }

  clearLog(): void {
    $('log').innerHTML = '';
  }

  setShip(w: World): void {
    $('shipName').textContent = w.player.def.name;
    $('torpRow').style.opacity = w.player.def.torp ? '1' : '0.35';
    $('waveLabel').textContent = w.mode === 'battle' ? '出撃' : '出撃準備';
  }

  setWaveLabel(text: string): void {
    $('waveLabel').textContent = text;
  }

  setZoomLabel(name: string): void {
    $('zoomBtn').textContent = `視点 ${name}`;
  }

  setMuteLabel(muted: boolean): void {
    $('muteBtn').textContent = muted ? '音 なし' : '音 あり';
  }

  update(w: World, dt: number): void {
    this.updateAlarm(w);
    this.acc -= dt;
    if (this.acc > 0) return;
    this.acc = 0.1;
    const p = w.player;
    $('hpText').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    const r = p.hp / p.maxHp;
    const hb = $('hpBar');
    hb.style.width = `${r * 100}%`;
    hb.style.background = r > 0.5 ? 'var(--good)' : r > 0.25 ? 'var(--warn)' : 'var(--enemy)';
    $('kt').textContent = `${(p.speed * KT).toFixed(1)} kt`;
    [...this.tele.children].forEach((s, i) => s.classList.toggle('on', i === p.throttle));

    const gd = p.def.guns;
    const minT = Math.min(...p.turrets.map((t) => Math.max(0, t.timer)));
    $('gunBar').style.width = `${(1 - minT / gd.reload) * 100}%`;
    $('gunBarW').classList.toggle('ready', minT <= 0);
    const td = p.def.torp;
    $('torpBar').style.width = td ? `${(1 - Math.max(0, p.torpTimer) / td.reload) * 100}%` : '0%';
    $('torpBarW').classList.toggle('ready', !!td && p.torpTimer <= 0);
    $('repBar').style.width = w.repairT > 0 ? `${(1 - w.repairT / REPAIR_TIME) * 100}%` : w.repairs > 0 ? '100%' : '0%';
    $('repBarW').classList.toggle('ready', w.repairs > 0 && w.repairT <= 0);
    $('repLeft').textContent = `R ×${w.repairs}`;

    $('enemyCount').textContent = String(liveEnemies(w).length);
    $('clock').textContent = fmtClock(w.time);
    const lock = lockedTarget(w);
    const ll = $('lockLabel');
    if (lock) {
      const d = Math.hypot(lock.x - p.x, lock.z - p.z);
      const inRange = d <= gd.range;
      ll.textContent = `${Math.round(d)} ${inRange ? '射程内' : '射程外'}`;
      ll.style.color = inRange ? 'var(--good)' : 'var(--ink-dim)';
    } else {
      ll.textContent = '—';
      ll.style.color = '';
    }
    this.drawRadar(w);
  }

  private updateAlarm(w: World): void {
    const p = w.player;
    const first = w.threats.reduce<(typeof w.threats)[number] | null>((a, b) => (!a || b.tc < a.tc ? b : a), null);
    if (!first) {
      this.alarm.hidden = true;
      return;
    }
    const rel = wrap(bearingTo(p.x, p.z, first.torp.x, first.torp.z) - p.h);
    const side = Math.abs(rel) < 0.5 ? '艦首' : Math.abs(rel) > 2.6 ? '艦尾' : rel > 0 ? '左舷' : '右舷';
    this.alarm.textContent = `魚雷接近　${side}　${Math.max(0, first.tc).toFixed(0)}秒`;
    this.alarm.hidden = false;
    this.alarm.classList.toggle('blink', first.tc < 6);
  }

  private drawRadar(w: World): void {
    const ctx = this.rctx;
    const W = this.radar.width;
    const c = W / 2;
    const sc = (W / 2 - 6) / ARENA;
    // 北を上、東を右に描く（sim では東が -x）
    const px = (x: number): number => c - x * sc;
    const py = (z: number): number => c - z * sc;
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = 'rgba(13,30,38,0.9)';
    ctx.beginPath();
    ctx.arc(c, c, c - 2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,168,74,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, ARENA * sc, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(143,198,217,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(c, 6);
    ctx.lineTo(c, W - 6);
    ctx.moveTo(6, c);
    ctx.lineTo(W - 6, c);
    ctx.stroke();
    ctx.fillStyle = '#3f5a3a';
    for (const is of ISLANDS) {
      ctx.beginPath();
      ctx.arc(px(is.x), py(is.z), Math.max(2, is.r * sc), 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ff5a3a';
    for (const t of w.torps) if (t.team === 'enemy') ctx.fillRect(px(t.x) - 1.5, py(t.z) - 1.5, 3, 3);
    for (const s of w.ships) {
      if (!s.alive) continue;
      const x = px(s.x);
      const y = py(s.z);
      if (s.team === 'enemy') {
        ctx.fillStyle = s.def.boss ? '#ff4a2a' : '#e0614a';
        ctx.beginPath();
        ctx.arc(x, y, s.def.boss ? 6 : 4, 0, TAU);
        ctx.fill();
        if (s.id === w.lockId) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, TAU);
          ctx.stroke();
        }
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-s.h);
        ctx.fillStyle = '#8fc6d9';
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(5, 6);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.fillStyle = '#93a3a8';
    ctx.font = '600 18px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('N', c, 22);
  }
}
