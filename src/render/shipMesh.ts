import * as THREE from 'three';
import type { ShipDef } from '../sim/data';
import type { Team } from '../sim/world';

export interface ShipMesh {
  group: THREE.Group;
  turrets: THREE.Group[];
  /** 敵艦の頭上に出す耐久バー */
  bar: { group: THREE.Group; fill: THREE.Mesh; width: number } | null;
  /** 喫水線から甲板までの高さ */
  deckH: number;
}

function hullShape(L: number, B: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-B * 0.7, -L);
  s.lineTo(B * 0.7, -L);
  s.lineTo(B, -L * 0.55);
  s.lineTo(B, L * 0.35);
  s.quadraticCurveTo(B * 0.55, L * 0.82, 0, L);
  s.quadraticCurveTo(-B * 0.55, L * 0.82, -B, L * 0.35);
  s.lineTo(-B, -L * 0.55);
  s.closePath();
  return s;
}

export function buildShipMesh(def: ShipDef, team: Team): ShipMesh {
  const g = new THREE.Group();
  const L = def.len / 2;
  const B = def.beam / 2;
  const H = def.boss ? 4 : 3;
  const ally = team === 'ally';
  const hullCol = ally ? 0x56656f : def.boss ? 0x5a3c3a : 0x6e4a42;
  const deckCol = ally ? 0x9a9a8c : 0x8b7f72;

  const hg = new THREE.ExtrudeGeometry(hullShape(L, B), { depth: H, bevelEnabled: false });
  hg.rotateX(Math.PI / 2);
  hg.translate(0, H, 0);
  g.add(new THREE.Mesh(hg, new THREE.MeshLambertMaterial({ color: hullCol })));

  const dg = new THREE.ShapeGeometry(hullShape(L * 0.97, B * 0.9));
  dg.rotateX(Math.PI / 2);
  const deck = new THREE.Mesh(dg, new THREE.MeshLambertMaterial({ color: deckCol, side: THREE.DoubleSide }));
  deck.position.y = H + 0.02;
  g.add(deck);

  const sup = new THREE.MeshLambertMaterial({ color: ally ? 0x6f7d86 : 0x7a5d55 });
  const bridgeH = def.boss ? 9 : def.len > 20 ? 6 : 4;
  const br = new THREE.Mesh(new THREE.BoxGeometry(def.beam * 0.45, bridgeH, def.len * 0.12), sup);
  br.position.set(0, H + bridgeH / 2, def.len * 0.08);
  g.add(br);
  const top = new THREE.Mesh(new THREE.BoxGeometry(def.beam * 0.3, bridgeH * 0.4, def.len * 0.06), sup);
  top.position.set(0, H + bridgeH * 1.2, def.len * 0.09);
  g.add(top);
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(def.beam * 0.14, def.beam * 0.17, bridgeH * 0.8, 12),
    new THREE.MeshLambertMaterial({ color: 0x3b3f42 }),
  );
  funnel.position.set(0, H + bridgeH * 0.4, -def.len * 0.06);
  funnel.rotation.x = -0.12;
  g.add(funnel);

  if (def.boss) {
    // 艦尾のロケット推進器
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 6, 12), new THREE.MeshLambertMaterial({ color: 0x2c2c30 }));
      r.rotation.x = Math.PI / 2;
      r.position.set(sx * B * 0.5, H - 0.5, -L - 1.5);
      g.add(r);
    }
  }

  const turretMat = new THREE.MeshLambertMaterial({ color: ally ? 0x707f88 : 0x80655c });
  const barrelMat = new THREE.MeshLambertMaterial({ color: 0x2f3437 });
  const tr = def.boss ? 1.9 : def.len > 25 ? 1.8 : def.len > 18 ? 1.4 : 1.0;
  const turrets: THREE.Group[] = [];
  for (const t of def.turrets) {
    const tg = new THREE.Group();
    tg.add(new THREE.Mesh(new THREE.CylinderGeometry(tr, tr * 1.1, 1.2, 14), turretMat));
    const nb = def.guns.barrels;
    for (let i = 0; i < nb; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, tr * 2.4), barrelMat);
      b.position.set((i - (nb - 1) / 2) * 0.55, 0.25, tr * 1.3);
      tg.add(b);
    }
    const broadside = Math.abs(t.center) > 0.1 && Math.abs(Math.abs(t.center) - Math.PI) > 0.1;
    tg.position.set(broadside ? Math.sign(t.center) * B * 0.6 : 0, H + 0.7 + (t.raised ? 1.4 : 0), t.z);
    tg.rotation.y = t.center;
    g.add(tg);
    turrets.push(tg);
  }

  let bar: ShipMesh['bar'] = null;
  if (!ally) {
    const group = new THREE.Group();
    const width = def.boss ? 26 : 12;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7, depthTest: false }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: def.boss ? 0xe0614a : 0xe3b545, depthTest: false }));
    bg.scale.set(width + 0.8, 1.6, 1);
    fill.scale.set(width, 1, 1);
    fill.position.z = 0.01;
    bg.renderOrder = 10;
    fill.renderOrder = 11;
    group.add(bg, fill);
    bar = { group, fill, width };
  }
  return { group: g, turrets, bar, deckH: H };
}
