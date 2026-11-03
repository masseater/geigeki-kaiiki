// 出撃前と結果の画面

import { DESIGN_IDS, KT, PLAYER_DESIGNS, WAVES, type DesignId } from '../sim/data';
import { rankOf, type World } from '../sim/world';
import { fmtClock } from './hud';

const overlay = (): HTMLElement => document.getElementById('overlay')!;
const sheet = (): HTMLElement => document.getElementById('sheet')!;

export function hideOverlay(): void {
  overlay().hidden = true;
}

export interface BriefHandlers {
  selected: DesignId;
  touch: boolean;
  onSelect(d: DesignId): void;
  onStart(): void;
}

export function showBrief(h: BriefHandlers): void {
  const cards = DESIGN_IDS.map((k) => {
    const d = PLAYER_DESIGNS[k];
    return `
    <button class="design" id="design-${k}" data-k="${k}" aria-pressed="${k === h.selected}">
      <span class="t">${d.type}</span><span class="n">${d.name}</span>
      <dl><dt>耐久</dt><dd>${d.hp}</dd><dt>最大速力</dt><dd>${(d.speed * KT).toFixed(1)} kt</dd>
      <dt>主砲</dt><dd>${d.turrets.length}基${d.guns.barrels * d.turrets.length}門</dd><dt>射程</dt><dd>${d.guns.range}</dd>
      <dt>魚雷</dt><dd>${d.torp ? `${d.torp.n}連装` : 'なし'}</dd></dl>
    </button>`;
  }).join('');
  const keys = h.touch
    ? `
      <span>左下の<kbd>増速</kbd><kbd>減速</kbd>で機関、<kbd>取舵</kbd><kbd>面舵</kbd>で舵</span>
      <span>海面をタップで照準、敵艦をタップで捕捉</span>
      <span><kbd>主砲</kbd>を押し続けると装填済みの砲塔から斉射</span>
      <span><kbd>目標</kbd>で近い順に切り替え、<kbd>視点</kbd>で遠近</span>`
    : `
      <span><kbd>W</kbd><kbd>S</kbd>機関の段階を上げ下げ</span>
      <span><kbd>A</kbd><kbd>D</kbd>舵（押している間）</span>
      <span><kbd>左クリック</kbd>主砲斉射（押し続けで連射）</span>
      <span><kbd>右クリック</kbd>指した敵艦を捕捉</span>
      <span><kbd>Tab</kbd>近い順に目標を切り替え</span>
      <span><kbd>F</kbd>魚雷発射</span>
      <span><kbd>R</kbd>応急修理</span>
      <span><kbd>ホイール</kbd><kbd>Z</kbd>視点の遠近　<kbd>M</kbd>音</span>`;
  sheet().innerHTML = `
    <h1>迎撃海域</h1>
    <p class="order">敵艦隊が三波に分かれて来襲します。数では敵が勝りますが、一隻ずつなら本艦が上です。<b>各個撃破して全艦を沈め</b>、最後に現れる<b>超兵器</b>を撃沈してください。被弾は次の波へ持ち越されます。</p>
    <div class="designs">${cards}</div>
    <div class="keys">${keys}</div>
    <ul class="tips">
      <li><b>捕捉した敵には自動で見越し射撃</b>します。沈めると次に近い敵へ自動で移ります。</li>
      <li><b>魚雷警報</b>が出たら赤い予測線を見て、線と平行になるよう舵を切ると避けられます。</li>
      <li>画面の外にいる敵は縁の矢印と距離で示します。囲まれる前に一隊ずつ沈めてください。</li>
      <li>沈んでも、その波の開始時点からやり直せます。</li>
    </ul>
    <button class="go" id="goBtn">出撃</button>`;
  sheet().querySelectorAll<HTMLButtonElement>('.design').forEach((b) => {
    b.addEventListener('click', () => {
      const k = b.dataset.k as DesignId;
      h.onSelect(k);
      sheet().querySelectorAll('.design').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
  });
  document.getElementById('goBtn')!.addEventListener('click', () => h.onStart());
  overlay().hidden = false;
}

export interface ResultHandlers {
  onRetryWave(): void;
  onRestart(): void;
  onBrief(): void;
}

export function showResult(w: World, h: ResultHandlers): void {
  const win = w.phase === 'won';
  const p = w.player;
  const r = p.hp / p.maxHp;
  const rank = rankOf(w) ?? '—';
  const cp = !win ? w.checkpoint : null;
  const ghost = 'style="background:transparent;color:var(--brass);border:1px solid var(--brass-dim)"';
  sheet().innerHTML = `
    <h1>${win ? '作戦成功' : '作戦失敗'}</h1>
    <p class="order">${win ? '超兵器を含む敵艦隊を全艦撃沈しました。' : '本艦は沈没しました。波の開始時点の耐久と修理資材で、その波からやり直せます。'}</p>
    <div class="result-grid">
      <div><span class="label">評価</span><span class="rank">${rank}</span></div>
      <div><span class="label">作戦時間</span><strong>${fmtClock(w.time)}</strong><span class="label">撃沈 ${w.sunk} 隻</span></div>
      <div><span class="label">残存耐久</span><strong>${Math.round(r * 100)}%</strong><span class="label">被害 ${Math.round(w.dmgTaken)}</span></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${cp ? `<button class="go" id="cpBtn">${WAVES[cp.wave]?.label ?? ''}から再挑戦</button>` : ''}
      <button class="go" id="againBtn" ${cp ? ghost : ''}>最初から</button>
      <button class="go" id="briefBtn" ${ghost}>艦を選び直す</button>
    </div>`;
  document.getElementById('cpBtn')?.addEventListener('click', () => h.onRetryWave());
  document.getElementById('againBtn')!.addEventListener('click', () => h.onRestart());
  document.getElementById('briefBtn')!.addEventListener('click', () => h.onBrief());
  overlay().hidden = false;
}
