import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------- Constants ----------
const COLORS = [0xd0262b, 0x23963f, 0xf2b90c, 0x1c64c8];
const CSS = ['#d0262b', '#23963f', '#f2b90c', '#1c64c8'];
const NAMES = ['Kırmızı', 'Yeşil', 'Sarı', 'Mavi'];
const OFFSETS = [0, 13, 26, 39];
const BASE_CORNER = [[0, 9], [0, 0], [9, 0], [9, 9]]; // col,row of base region
const QS = new URLSearchParams(location.search);
const AUTO = QS.has('auto'); // debug: all players are bots
const SPEED = Math.max(1, +QS.get('speed') || 1);
const HUMAN = AUTO ? -1 : 0;

// 52-cell track (col,row), starting at red's start cell
const TRACK = [];
(() => {
  const push = (c, r) => TRACK.push([c, r]);
  for (let r = 13; r >= 9; r--) push(6, r);
  for (let c = 5; c >= 0; c--) push(c, 8);
  push(0, 7);
  for (let c = 0; c <= 5; c++) push(c, 6);
  for (let r = 5; r >= 0; r--) push(6, r);
  push(7, 0);
  for (let r = 0; r <= 5; r++) push(8, r);
  for (let c = 9; c <= 14; c++) push(c, 6);
  push(14, 7);
  for (let c = 14; c >= 9; c--) push(c, 8);
  for (let r = 9; r <= 14; r++) push(8, r);
  push(7, 14); push(6, 14);
})();
const HOME_COL = [
  [13, 12, 11, 10, 9].map(r => [7, r]),
  [1, 2, 3, 4, 5].map(c => [c, 7]),
  [1, 2, 3, 4, 5].map(r => [7, r]),
  [13, 12, 11, 10, 9].map(c => [c, 7]),
];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const FINISH = 56;

const cellPos = (c, r) => new THREE.Vector3(c - 7, 0, r - 7);
const absIndex = (p, pos) => (OFFSETS[p] + pos) % 52;

// ---------- Renderer / Scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
scene.background = new THREE.Color(0x1c120b);
scene.fog = new THREE.Fog(0x1c120b, 55, 110);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
const target = new THREE.Vector3(0, 0, 0.4);

scene.add(new THREE.HemisphereLight(0xfff3e0, 0x3a2414, 0.3));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.0);
sun.position.set(-6, 18, 9);
sun.castShadow = true;
const SM = renderer.capabilities.maxTextureSize >= 4096 ? 4096 : 2048;
sun.shadow.mapSize.set(SM, SM);
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 50 });
sun.shadow.bias = -0.0005;
sun.shadow.radius = 4;
scene.add(sun);

const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }); // MSAA inside post chain
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());
function fitCamera() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  camera.aspect = w / h;
  const tilt = THREE.MathUtils.degToRad(w < h ? 56 : 52);
  const dir = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
  const pts = [];
  for (const x of [-8.3, 8.3]) for (const z of [-8.3, 8.3]) pts.push(new THREE.Vector3(x, 0, z));
  pts.push(new THREE.Vector3(-6, 0, 10.4), new THREE.Vector3(6, 0, -10.4));
  const yTop = w < h ? 0.62 : 0.78, yBot = w < h ? -0.66 : -0.72;
  let d = 10;
  for (; d < 120; d += 0.25) {
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    if (pts.every(p => { const v = p.clone().project(camera); return Math.abs(v.x) < 0.96 && v.y < yTop && v.y > yBot; })) break;
  }
}
addEventListener('resize', fitCamera);

// ---------- Materials ----------
const glossy = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.15, ...extra });
// Realistic lacquer / gold / wood materials
const matWhite = glossy(0xf3ead6, { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06 }); // cream lacquer cells
const matColor = COLORS.map(c => glossy(c, { roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 }));
const matDark = COLORS.map(c => glossy(new THREE.Color(c).multiplyScalar(0.78), { roughness: 0.3, clearcoat: 1 }));
const matGold = new THREE.MeshPhysicalMaterial({ color: 0xf2c75a, metalness: 0.8, roughness: 0.28, clearcoat: 0.5 });
const matNeon = COLORS.map(c => glossy(new THREE.Color(c).multiplyScalar(0.6), { roughness: 0.3 })); // darker trim of each colour
const matNeonWhite = new THREE.MeshStandardMaterial({ color: 0xcbbd9c, roughness: 0.5 }); // subtle cell grooves
const matNeonWhiteStrong = glossy(0xfffaf0, { roughness: 0.2 });
function woodTexture(base, dark, w = 1024, h = 1024, rings = 70) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x = cv.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < rings * 4; i++) {
    const y0 = Math.random() * h, amp = 4 + Math.random() * 14, f = 0.002 + Math.random() * 0.006, ph = Math.random() * 6;
    x.strokeStyle = dark; x.globalAlpha = 0.04 + Math.random() * 0.12; x.lineWidth = 0.6 + Math.random() * 2.6;
    x.beginPath();
    for (let X = 0; X <= w; X += 8) { const Y = y0 + Math.sin(X * f + ph) * amp + Math.sin(X * f * 3.1 + ph) * amp * 0.3; X ? x.lineTo(X, Y) : x.moveTo(X, Y); }
    x.stroke();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// ---------- Board ----------
const board = new THREE.Group();
scene.add(board);

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function slab(w, h, depth, r, mat, y) {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), { depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 6, curveSegments: 24 });
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y; m.receiveShadow = true; m.castShadow = true;
  return m;
}
// frame + board
const frameTex = woodTexture('#5a2f17', '#1e0d05'); frameTex.repeat.set(0.07, 0.07);
const frameMat = new THREE.MeshPhysicalMaterial({ map: frameTex, color: 0xffffff, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05 });
board.add(slab(16.6, 16.6, 0.7, 0.8, frameMat, -0.85));
board.add(slab(15.6, 15.6, 0.12, 0.35, matGold, -0.2));
board.add(slab(15.2, 15.2, 0.1, 0.25, glossy(0xe9dfc9, { roughness: 0.25, clearcoat: 1 }), -0.12));

const cellGeo = new RoundedBoxGeometry(0.92, 0.12, 0.92, 4, 0.05);
const outlineGeo = (() => {
  const o = roundedRectShape(0.9, 0.9, 0.12); o.holes.push(roundedRectShape(0.82, 0.82, 0.09));
  const g = new THREE.ShapeGeometry(o, 6); g.rotateX(-Math.PI / 2); return g;
})();
function addCell(c, r, mat, outline) {
  const m = new THREE.Mesh(cellGeo, mat);
  m.position.copy(cellPos(c, r)).setY(0.0);
  m.receiveShadow = true;
  board.add(m);
  const o = new THREE.Mesh(outlineGeo, outline || matNeonWhite);
  o.position.copy(m.position).setY(0.064);
  board.add(o);
}
// star shape
function starGeo(R, r2, depth) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r2 : R;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  return g;
}
const starG = starGeo(0.34, 0.15, 0.03);

TRACK.forEach(([c, r], i) => {
  const startOf = OFFSETS.indexOf(i);
  addCell(c, r, startOf >= 0 ? matColor[startOf] : matWhite, startOf >= 0 ? matNeon[startOf] : null);
  if (SAFE.has(i)) {
    const s = new THREE.Mesh(starG, startOf >= 0 ? matNeonWhiteStrong : matGold);
    s.position.copy(cellPos(c, r)).setY(0.07);
    s.castShadow = true;
    board.add(s);
  }
});
HOME_COL.forEach((col, p) => col.forEach(([c, r]) => addCell(c, r, matColor[p], matNeon[p])));

// arrows at home entry
const arrowShape = new THREE.Shape();
arrowShape.moveTo(0, 0.3); arrowShape.lineTo(0.25, 0); arrowShape.lineTo(0.1, 0); arrowShape.lineTo(0.1, -0.3);
arrowShape.lineTo(-0.1, -0.3); arrowShape.lineTo(-0.1, 0); arrowShape.lineTo(-0.25, 0); arrowShape.closePath();
const arrowG = new THREE.ExtrudeGeometry(arrowShape, { depth: 0.03, bevelEnabled: false }); arrowG.rotateX(-Math.PI / 2);
[[7, 14, 0], [0, 7, -Math.PI / 2], [7, 0, Math.PI], [14, 7, Math.PI / 2]].forEach(([c, r, rot], p) => {
  addCell(c, r, matWhite);
  const a = new THREE.Mesh(arrowG, matNeon[p]);
  a.position.copy(cellPos(c, r)).setY(0.065); a.rotation.y = rot;
  board.add(a);
});

// bases
const spotGeo = new THREE.CylinderGeometry(0.48, 0.5, 0.08, 64);
const ringGeo = new THREE.TorusGeometry(0.5, 0.035, 16, 72); ringGeo.rotateX(Math.PI / 2);
const basePositions = [];
BASE_CORNER.forEach(([c0, r0], p) => {
  const cx = c0 + 2.5 - 7, cz = r0 + 2.5 - 7;
  const outer = slab(5.7, 5.7, 0.1, 0.5, matDark[p], -0.06); outer.position.x = cx; outer.position.z = cz; board.add(outer);
  const inner = slab(4.0, 4.0, 0.1, 0.45, matWhite, 0.0); inner.position.x = cx; inner.position.z = cz; board.add(inner);
  for (const [W, R, Wi, y] of [[5.9, 0.55, 5.72, 0.1], [4.2, 0.5, 4.06, 0.17]]) {
    const sh = roundedRectShape(W, W, R); sh.holes.push(roundedRectShape(Wi, Wi, R - 0.06));
    const g = new THREE.ShapeGeometry(sh, 10); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, matNeon[p]); m.position.set(cx, y, cz); board.add(m);
  }
  const spots = [];
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const v = new THREE.Vector3(cx + dx * 0.95, 0.17, cz + dz * 0.95);
    const s = new THREE.Mesh(spotGeo, matDark[p]); s.position.copy(v).setY(0.13); s.receiveShadow = true; board.add(s);
    const ring = new THREE.Mesh(ringGeo, matNeon[p]); ring.position.copy(v).setY(0.16); board.add(ring);
    spots.push(v);
  }
  basePositions.push(spots);
});

// center home triangles
const triPts = [
  [[-1.5, 1.5], [1.5, 1.5]],   // red (bottom)
  [[-1.5, -1.5], [-1.5, 1.5]], // green (left)
  [[1.5, -1.5], [-1.5, -1.5]], // yellow (top)
  [[1.5, 1.5], [1.5, -1.5]],   // blue (right)
];
triPts.forEach(([[ax, az], [bx, bz]], p) => {
  const s = new THREE.Shape();
  s.moveTo(ax, -az); s.lineTo(bx, -bz); s.lineTo(0, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, matColor[p]); m.position.y = -0.06; m.receiveShadow = true; board.add(m);
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0xc9973a })); e.position.y = -0.05; board.add(e);
});
const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.12, 32), matGold);
crown.position.y = 0.14; crown.castShadow = true; board.add(crown);
const FINISH_CENTER = [[0, 0.85], [-0.85, 0], [0, -0.85], [0.85, 0]];

// ---------- Pawns ----------
// Ludo King style pawn: rounded base disc, flared conical body, neck, collar; separate round head
const profile = new THREE.SplineCurve([[0.40, 0.0], [0.41, 0.035], [0.39, 0.075], [0.31, 0.11], [0.24, 0.17], [0.185, 0.27], [0.145, 0.39], [0.118, 0.5], [0.13, 0.535], [0.2, 0.555], [0.205, 0.585], [0.16, 0.61], [0.09, 0.625]].map(([x, y]) => new THREE.Vector2(x, y))).getPoints(90);
const lathePts = [new THREE.Vector2(0, 0), ...profile, new THREE.Vector2(0, 0.63)];
const pawnBodyG = new THREE.LatheGeometry(lathePts, 64);
const pawnHeadG = new THREE.SphereGeometry(0.19, 64, 40);
const hitG = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12);
const hitM = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const glowG = new THREE.RingGeometry(0.38, 0.5, 40); glowG.rotateX(-Math.PI / 2);
const pawnMats = COLORS.map(c => glossy(c, { roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.02 }));

const pawnObjs = []; // [player][i]
for (let p = 0; p < 4; p++) {
  pawnObjs.push([]);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    const body = new THREE.Mesh(pawnBodyG, pawnMats[p]); body.castShadow = true;
    const head = new THREE.Mesh(pawnHeadG, pawnMats[p]); head.position.y = 0.79; head.castShadow = true;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.203, 0.018, 16, 64), matGold); band.rotation.x = Math.PI / 2; band.position.y = 0.57;
    const foot = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.02, 16, 72), matGold); foot.rotation.x = Math.PI / 2; foot.position.y = 0.035;
    inner.add(body, head, band, foot);
    const hit = new THREE.Mesh(hitG, hitM); hit.position.y = 0.5;
    const glow = new THREE.Mesh(glowG, new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.9, depthWrite: false }));
    glow.position.y = 0.02; glow.visible = false;
    g.add(inner, hit, glow);
    g.userData = { p, i, inner, glow };
    hit.userData.pawn = g;
    g.position.copy(basePositions[p][i]);
    scene.add(g);
    pawnObjs[p].push(g);
  }
}

// ---------- Dice ----------
function faceTexture(n) {
  const s = 256, cv = document.createElement('canvas'); cv.width = cv.height = s;
  const x = cv.getContext('2d');
  x.fillStyle = '#fbf6ea'; x.fillRect(0, 0, s, s);
  const grd = x.createRadialGradient(s / 2, s / 2, s * 0.2, s / 2, s / 2, s * 0.75);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.08)');
  x.fillStyle = grd; x.fillRect(0, 0, s, s);
  const P = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.27, .22], [.73, .22], [.27, .5], [.73, .5], [.27, .78], [.73, .78]] };
  for (const [u, v] of []) {
    const g = x.createRadialGradient(u * s - 6, v * s - 6, 2, u * s, v * s, 24);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, n === 1 ? '#ff2d55' : '#7fe8ff');
    x.fillStyle = g; x.beginPath(); x.arc(u * s, v * s, n === 1 ? 30 : 22, 0, Math.PI * 2); x.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// BoxGeometry face order: +x,-x,+y,-y,+z,-z
const FACE_VALUES = [2, 5, 1, 6, 3, 4];
const FACE_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new THREE.Vector3(...a));
const diceBodyMat = new THREE.MeshPhysicalMaterial({ color: 0xfaf4e6, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.2 });
const diceMats = FACE_VALUES.map(() => diceBodyMat);
const DS = 1.3;
const dice = new THREE.Mesh(new RoundedBoxGeometry(DS, DS, DS, 8, 0.2), diceMats);
dice.castShadow = true;
{ // inset pips: dark recessed dimple + glowing gem inside
  const PIPS = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.27, .22], [.73, .22], [.27, .5], [.73, .5], [.27, .78], [.73, .78]] };
  const dimpleG = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const dimpleM = new THREE.MeshPhysicalMaterial({ color: 0x2a2622, roughness: 0.35, side: THREE.BackSide });
  const gemG = new THREE.SphereGeometry(1, 32, 16);
  const gemW = glossy(0x141414, { roughness: 0.15 });
  const gemR = glossy(0xb3141b, { roughness: 0.15 });
  FACE_VALUES.forEach((val, f) => {
    const n = FACE_NORMALS[f];
    const uAx = Math.abs(n.x) ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const vAx = Math.abs(n.y) ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const r = val === 1 ? 0.15 : 0.11;
    for (const [u, v] of PIPS[val]) {
      const c = n.clone().multiplyScalar(DS / 2 + 0.001).addScaledVector(uAx, (u - 0.5) * DS * 0.92).addScaledVector(vAx, (v - 0.5) * DS * 0.92);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().negate());
      const dm = new THREE.Mesh(dimpleG, dimpleM); dm.scale.set(r, r * 0.45, r); dm.quaternion.copy(q); dm.position.copy(c); dice.add(dm);
      const gm = new THREE.Mesh(gemG, val === 1 ? gemR : gemW); gm.scale.set(r * 0.72, r * 0.18, r * 0.72);
      gm.quaternion.copy(q); gm.position.copy(c).addScaledVector(n, -r * 0.3); dice.add(gm);
    }
  });
}
const diceEdgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, toneMapped: false });

const diceGlowFrames = [];

const diceGroup = new THREE.Group(); diceGroup.add(dice); scene.add(diceGroup);
dice.position.y = DS / 2;
const diceRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
diceRing.position.y = 0.02; diceGroup.add(diceRing);
const diceHit = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), hitM); diceHit.position.y = 0.8; diceGroup.add(diceHit);
const DICE_SPOTS = [[-5.4, 9.7], [-5.4, -9.7], [5.4, -9.7], [5.4, 9.7]];
// shadow catcher for dice outside board
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.35 }));
ground.visible = false;
sun.shadow.camera.top = 13; sun.shadow.camera.bottom = -13;
// polished wooden table + soft contact shadow under the board
const tableTex = woodTexture('#4e2a15', '#1a0b04', 2048, 1024, 90); tableTex.repeat.set(1.5, 3);
const table = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ map: tableTex, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
table.position.y = -0.875; table.receiveShadow = true; scene.add(table);
const contactTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
  const g = x.createRadialGradient(128, 128, 60, 128, 128, 128); g.addColorStop(0, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(cv); })();
const contact = new THREE.Mesh(new THREE.PlaneGeometry(22, 22).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false }));
contact.position.y = -0.87; scene.add(contact);

function faceQuat(value, yaw) {
  const idx = FACE_VALUES.indexOf(value);
  const q = new THREE.Quaternion().setFromUnitVectors(FACE_NORMALS[idx], new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}
dice.quaternion.copy(faceQuat(6, 0.4));

// ---------- Tween helpers ----------
const tweens = new Set();
function tween(dur, fn) {
  return new Promise(res => tweens.add({ t0: performance.now(), dur: dur / SPEED, fn, res }));
}
const wait = ms => new Promise(r => setTimeout(r, ms / SPEED));
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);

// ---------- Sound ----------
let actx = null, soundOn = true;
function ac() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
function tone(freq, dur = 0.12, type = 'sine', vol = 0.15, slide = 0) {
  if (!soundOn) return; const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function rattle() {
  if (!soundOn) return; const a = ac(); if (!a) return;
  for (let k = 0; k < 7; k++) {
    const t = a.currentTime + k * 0.07 + Math.random() * 0.03;
    const b = a.createBuffer(1, a.sampleRate * 0.03, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 1500;
    s.buffer = b; g.gain.value = 0.35; s.connect(f).connect(g).connect(a.destination); s.start(t);
  }
}
const sfx = {
  hop: () => tone(620 + Math.random() * 60, 0.07, 'triangle', 0.08),
  capture: () => { tone(300, 0.25, 'sawtooth', 0.1, 0.4); setTimeout(() => tone(180, 0.3, 'square', 0.06, 0.5), 120); },
  home: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.12), i * 90)),
  out: () => tone(440, 0.15, 'sine', 0.12, 1.8),
  six: () => tone(880, 0.12, 'sine', 0.1, 1.3),
  win: () => [523, 659, 784, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.14), i * 140)),
};

// ---------- Game state ----------
let state;
const $ = id => document.getElementById(id);
const rollBtn = $('roll'), msgEl = $('msg');

function newGame() {
  state = { pawns: [0, 1, 2, 3].map(() => [-1, -1, -1, -1]), turn: 0, sixes: 0, phase: 'idle', dice: 6, moves: [], over: false };
  for (let p = 0; p < 4; p++) for (let i = 0; i < 4; i++) { pawnObjs[p][i].position.copy(basePositions[p][i]); pawnObjs[p][i].userData.inner.position.y = 0; pawnObjs[p][i].userData.inner.scale.setScalar(1); }
  $('overlay').classList.add('hidden');
  updatePlayers();
  startTurn();
}

function restPosition(p, i) {
  const pos = state.pawns[p][i];
  if (pos < 0) return { v: basePositions[p][i].clone(), s: 1 };
  if (pos === FINISH) {
    const done = [0, 1, 2, 3].filter(k => state.pawns[p][k] === FINISH);
    const k = done.indexOf(i), [fx, fz] = FINISH_CENTER[p];
    const perp = p % 2 === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    return { v: new THREE.Vector3(fx, 0.08, fz).addScaledVector(perp, (k - (done.length - 1) / 2) * 0.42), s: 0.62 };
  }
  // group with everyone on same cell
  const key = cellKey(p, pos);
  const group = [];
  for (let q = 0; q < 4; q++) for (let j = 0; j < 4; j++) if (state.pawns[q][j] >= 0 && state.pawns[q][j] < FINISH && cellKey(q, state.pawns[q][j]) === key) group.push(q * 4 + j);
  const base = cellCoords(p, pos);
  const n = group.length, k = group.indexOf(p * 4 + i);
  if (n <= 1) return { v: base.setY(0.06), s: 1 };
  const offs = n === 2 ? [[-0.2, 0], [0.2, 0]] : n === 3 ? [[-0.2, -0.15], [0.2, -0.15], [0, 0.2]] : [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2], [0, 0]];
  const o = offs[k % offs.length];
  return { v: base.add(new THREE.Vector3(o[0], 0.06, o[1])), s: n === 2 ? 0.8 : 0.66 };
}
function cellKey(p, pos) { return pos <= 50 ? 't' + absIndex(p, pos) : 'h' + p + '_' + pos; }
function cellCoords(p, pos) {
  if (pos <= 50) { const [c, r] = TRACK[absIndex(p, pos)]; return cellPos(c, r); }
  if (pos < FINISH) { const [c, r] = HOME_COL[p][pos - 51]; return cellPos(c, r); }
  const [fx, fz] = FINISH_CENTER[p]; return new THREE.Vector3(fx, 0, fz);
}
function relayout(except = null) {
  const jobs = [];
  for (let p = 0; p < 4; p++) for (let i = 0; i < 4; i++) {
    const o = pawnObjs[p][i]; if (o === except) continue;
    const { v, s } = restPosition(p, i);
    const from = o.position.clone(), s0 = o.scale.x;
    if (from.distanceTo(v) < 1e-3 && Math.abs(s0 - s) < 1e-3) continue;
    jobs.push(tween(220, t => { const e = ease(t); o.position.lerpVectors(from, v, e); o.scale.setScalar(s0 + (s - s0) * e); }));
  }
  return Promise.all(jobs);
}

function legalMoves(p, d) {
  const res = [];
  state.pawns[p].forEach((pos, i) => {
    if (pos < 0) { if (d === 6) res.push(i); }
    else if (pos < FINISH && pos + d <= FINISH) res.push(i);
  });
  return res;
}

function setMsg(t) { msgEl.textContent = t; }
function updatePlayers() {
  document.querySelectorAll('.pl').forEach((el, p) => {
    el.classList.toggle('active', p === state.turn && !state.over);
    el.querySelector('em').textContent = state.pawns[p].filter(x => x === FINISH).length + '/4';
  });
  const pill = $('turn');
  pill.querySelector('i').style.background = CSS[state.turn];
  pill.querySelector('i').style.color = CSS[state.turn];
  pill.querySelector('b').textContent = 'Sıra: ' + NAMES[state.turn] + (state.turn === HUMAN ? ' (Sen)' : '');
}

async function startTurn() {
  if (state.over) return;
  state.phase = 'moving-dice';
  updatePlayers();
  diceRing.material.color.set(COLORS[state.turn]);
  // slide dice to current player's corner
  const [tx, tz] = DICE_SPOTS[state.turn];
  const from = diceGroup.position.clone(), to = new THREE.Vector3(tx, -0.86, tz);
  if (from.distanceTo(to) > 0.01) await tween(350, t => { diceGroup.position.lerpVectors(from, to, ease(t)); });
  state.phase = 'roll';
  const human = state.turn === HUMAN;
  rollBtn.disabled = !human;
  rollBtn.classList.toggle('pulse', human);
  setMsg(human ? 'Zar atmak için zara veya "Zar At" butonuna dokun' : NAMES[state.turn] + ' düşünüyor…');
  if (!human) { await wait(550); roll(); }
}

async function roll() {
  if (state.phase !== 'roll' || state.over) return;
  state.phase = 'rolling';
  rollBtn.disabled = true; rollBtn.classList.remove('pulse');
  const d = 1 + Math.floor(Math.random() * 6);
  state.dice = d;
  rattle();
  const qT = faceQuat(d, (Math.random() - 0.5) * 0.8);
  const axis = new THREE.Vector3(Math.random() - 0.5, 0.3, Math.random() - 0.5).normalize();
  const spins = Math.PI * 2 * (3 + Math.random() * 2);
  const dur = 900;
  await tween(dur, t => {
    const k = 1 - easeOut(t);
    dice.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(axis, spins * k * k)).multiply(qT);
    // bounces
    const h = t < 0.55 ? Math.sin(t / 0.55 * Math.PI) * 2.6 : t < 0.85 ? Math.sin((t - 0.55) / 0.3 * Math.PI) * 0.6 : 0;
    dice.position.y = DS / 2 + h;
    dice.position.x = Math.sin(t * 9) * 0.25 * (1 - t);
  });
  dice.position.set(0, DS / 2, 0);
  tone(d === 6 ? 300 : 220, 0.08, 'square', 0.06);
  if (d === 6) sfx.six();

  const p = state.turn;
  if (d === 6) {
    state.sixes++;
    if (state.sixes === 3) {
      setMsg('Üst üste üç kez 6! ' + NAMES[p] + ' sırasını kaybetti.');
      await wait(1200);
      return nextPlayer();
    }
  }
  const moves = legalMoves(p, d);
  if (!moves.length) {
    setMsg(NAMES[p] + ': ' + d + ' attı – oynanacak hamle yok.');
    await wait(900);
    return d === 6 ? startTurn() : nextPlayer();
  }
  if (p !== HUMAN) {
    setMsg(NAMES[p] + ' ' + d + ' attı.');
    await wait(400);
    return movePawn(p, botChoose(p, d, moves), d);
  }
  // human
  const uniq = new Set(moves.map(i => state.pawns[p][i] < 0 ? 'b' : 'p' + state.pawns[p][i]));
  if (uniq.size === 1) { setMsg(d + ' attın.'); await wait(350); return movePawn(p, moves[0], d); }
  state.moves = moves; state.phase = 'pick';
  setMsg(d + ' attın! Oynatmak için parlayan piyona dokun.');
  moves.forEach(i => pawnObjs[p][i].userData.glow.visible = true);
}

function wouldCapture(p, pos) {
  if (pos > 50) return [];
  const a = absIndex(p, pos);
  if (SAFE.has(a)) return [];
  const victims = [];
  for (let q = 0; q < 4; q++) if (q !== p) state.pawns[q].forEach((qp, j) => { if (qp >= 0 && qp <= 50 && absIndex(q, qp) === a) victims.push([q, j]); });
  return victims;
}
function dangerAt(p, pos) {
  if (pos > 50) return 0;
  const a = absIndex(p, pos);
  if (SAFE.has(a)) return 0;
  let n = 0;
  for (let q = 0; q < 4; q++) if (q !== p) state.pawns[q].forEach(qp => {
    if (qp < 0 || qp > 50) return;
    const dist = (a - absIndex(q, qp) + 52) % 52;
    if (dist >= 1 && dist <= 6 && qp + dist <= 50) n++;
  });
  return n;
}
function botChoose(p, d, moves) {
  let best = moves[0], bestS = -1e9;
  for (const i of moves) {
    const cur = state.pawns[p][i], np = cur < 0 ? 0 : cur + d;
    let s = 0;
    if (wouldCapture(p, np).length) s += 1000;
    if (cur < 0) s += 500;
    if (np === FINISH) s += 400;
    if (np > 50 && cur <= 50) s += 150;
    if (np <= 50 && SAFE.has(absIndex(p, np))) s += 120;
    s -= dangerAt(p, np) * 90;
    if (cur >= 0 && cur <= 50 && dangerAt(p, cur) > 0) s += 60; // escape threat
    s += np; // advance furthest
    s += Math.random() * 5;
    if (s > bestS) { bestS = s; best = i; }
  }
  return best;
}

async function movePawn(p, i, d) {
  state.phase = 'anim';
  pawnObjs[p].forEach(o => o.userData.glow.visible = false);
  const o = pawnObjs[p][i];
  const cur = state.pawns[p][i];
  const path = [];
  if (cur < 0) path.push(0); else for (let k = 1; k <= d; k++) path.push(cur + k);
  if (cur < 0) sfx.out();
  for (const step of path) {
    const from = o.position.clone(), s0 = o.scale.x;
    const to = cellCoords(p, step).setY(step === FINISH ? 0.08 : 0.06);
    await tween(cur < 0 ? 380 : 190, t => {
      o.position.lerpVectors(from, to, t);
      o.position.y += Math.sin(t * Math.PI) * (cur < 0 ? 1.4 : 0.7);
      o.scale.setScalar(s0 + (1 - s0) * t);
      o.userData.inner.scale.set(1, 1 + Math.sin(t * Math.PI) * 0.12, 1);
    });
    o.userData.inner.scale.set(1, 1, 1);
    sfx.hop();
  }
  const np = path[path.length - 1];
  const victims = wouldCapture(p, np);
  state.pawns[p][i] = np;
  // capture
  if (victims.length) {
    sfx.capture();
    await Promise.all(victims.map(async ([q, j]) => {
      state.pawns[q][j] = -1;
      const vo = pawnObjs[q][j], from = vo.position.clone(), to = basePositions[q][j].clone(), s0 = vo.scale.x;
      await tween(650, t => {
        vo.position.lerpVectors(from, to, ease(t)); vo.position.y += Math.sin(t * Math.PI) * 3.2;
        vo.userData.inner.rotation.z = t * Math.PI * 4; vo.scale.setScalar(s0 + (1 - s0) * t);
      });
      vo.userData.inner.rotation.z = 0;
    }));
    setMsg(NAMES[p] + ', ' + victims.map(([q]) => NAMES[q]).join(' ve ') + ' piyonunu yedi! Ekstra tur.');
  }
  if (np === FINISH) { sfx.home(); setMsg(NAMES[p] + ' bir piyonu eve soktu! Ekstra tur.'); }
  await relayout();
  updatePlayers();
  if (state.pawns[p].every(x => x === FINISH)) return gameOver(p);
  const extra = d === 6 || victims.length > 0 || np === FINISH;
  if (extra) { if (d !== 6) state.sixes = 0; await wait(300); return startTurn(); }
  await wait(250);
  nextPlayer();
}

function nextPlayer() { state.sixes = 0; state.turn = (state.turn + 1) % 4; startTurn(); }

function gameOver(p) {
  window.__ludo.winner = p;
  state.over = true; state.phase = 'over';
  updatePlayers();
  rollBtn.disabled = true; rollBtn.classList.remove('pulse');
  sfx.win();
  const human = p === HUMAN;
  $('trophy').textContent = human ? '🏆' : '😢';
  $('winTitle').textContent = human ? 'Kazandın!' : 'Kaybettin!';
  $('winSub').textContent = human ? 'Tebrikler! Dört piyonun da evde.' : NAMES[p] + ' oyunu kazandı. Bir daha dene!';
  setMsg(human ? 'Kazandın! 🎉' : NAMES[p] + ' kazandı.');
  setTimeout(() => $('overlay').classList.remove('hidden'), 500);
}

// ---------- Input ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('pointerdown', e => {
  ac();
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (state.phase === 'roll' && state.turn === HUMAN && ray.intersectObject(diceHit).length) return roll();
  if (state.phase === 'pick') {
    const hits = ray.intersectObjects((pawnObjs[HUMAN] || []).map(o => o.children[1]));
    // also allow tapping the board cell where a movable pawn stands
    let pick = hits.length ? hits[0].object.userData.pawn.userData.i : null;
    if (pick === null) {
      const pt = new THREE.Vector3(); ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt);
      let bd = 0.75;
      state.moves.forEach(i => { const dd = pawnObjs[HUMAN][i].position.clone().setY(0).distanceTo(pt); if (dd < bd) { bd = dd; pick = i; } });
    }
    if (pick !== null && state.moves.includes(pick)) movePawn(HUMAN, pick, state.dice);
  }
});
rollBtn.addEventListener('click', () => { ac(); roll(); });
$('restart').addEventListener('click', () => newGame());
$('sound').addEventListener('click', () => { soundOn = !soundOn; $('sound').textContent = soundOn ? '🔊' : '🔇'; });

// ---------- Loop ----------
const clock = new THREE.Clock();
function loop() {
  const now = performance.now(), el = clock.getElapsedTime();
  for (const tw of [...tweens]) {
    const t = Math.min(1, (now - tw.t0) / tw.dur);
    tw.fn(t);
    if (t >= 1) { tweens.delete(tw); tw.res(); }
  }
  // highlight pulse
  if (state && state.phase === 'pick') for (const i of state.moves) {
    const u = pawnObjs[HUMAN][i].userData;
    u.inner.position.y = Math.abs(Math.sin(el * 5)) * 0.25;
    u.glow.scale.setScalar(1 + Math.sin(el * 6) * 0.15);
    u.glow.material.opacity = 0.6 + Math.sin(el * 6) * 0.3;
  } else if (state && HUMAN >= 0) for (const o of pawnObjs[HUMAN]) o.userData.inner.position.y *= 0.8;
  diceRing.material.opacity = state && state.phase === 'roll' ? 0.6 + Math.sin(el * 5) * 0.35 : 0.35;
  if (state && state.phase === 'roll' && state.turn === HUMAN) dice.position.y = DS / 2 + Math.abs(Math.sin(el * 4)) * 0.18;
  crown.rotation.y = el * 0.6;
  composer.render();
  requestAnimationFrame(loop);
}
fitCamera();
newGame();
loop();
window.__ludo = { get state() { return state; }, winner: null, pick(i) { if (state.phase === "pick" && state.moves.includes(i)) movePawn(HUMAN, i, state.dice); } };
