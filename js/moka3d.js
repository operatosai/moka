
import * as THREE from 'three';
import { habillerVoxel } from './moka_voxel.js';
import { habillerDoux } from './moka_doux.js';
import { habillerModele } from './moka_modele.js';

export function alea(graine) {
  let s = graine >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function canvasFeutre(taille, graine, base, fibres) {
  const c = document.createElement('canvas'); c.width = c.height = taille;
  const g = c.getContext('2d');
  g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, taille, taille);
  const r = alea(graine);
  for (let i = 0; i < fibres; i++) {
    const x = r() * taille, y = r() * taille, a = r() * Math.PI * 2, l = 2 + r() * 7;
    const v = base + (r() - 0.5) * 90;
    g.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},${0.12 + r() * 0.25})`;
    g.lineWidth = 0.6 + r() * 0.9;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return c;
}

let _texCache = null;
export function textures() {
  if (_texCache) return _texCache;
  const cf = canvasFeutre(256, 11, 205, 5000);
  const map = new THREE.CanvasTexture(cf); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(5, 5);
  const bump = new THREE.CanvasTexture(cf); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(5, 5);

  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.drawImage(canvasFeutre(128, 5, 215, 900), 0, 0, 64, 128);
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(40,25,10,0.35)'); grad.addColorStop(0.25, 'rgba(0,0,0,0)');
  grad.addColorStop(0.75, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(40,25,10,0.35)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 128);
  g.strokeStyle = 'rgba(70,45,25,0.55)'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(32, 128); g.lineTo(32, 8); g.stroke();
  g.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    const y = 110 - i * 20;
    g.beginPath(); g.moveTo(32, y); g.lineTo(12, y - 16); g.stroke();
    g.beginPath(); g.moveTo(32, y); g.lineTo(52, y - 16); g.stroke();
  }
  const feuille = new THREE.CanvasTexture(c); feuille.colorSpace = THREE.SRGBColorSpace;
  const lueur = texLueur();
  _texCache = { map, bump, feuille, lueur };
  return _texCache;
}

export function texLueur(interne = 'rgba(255,255,255,1)', milieu = 'rgba(255,255,255,0.35)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, interne); gr.addColorStop(0.25, milieu); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const CONTOUR = { force: { value: 1.0 } };
export function ajouterContour(mat, couleur = 0xffc890, puissance = 2.5, base = 0.0, force = 1.0) {
  const c = new THREE.Color(couleur).multiplyScalar(force);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uContourForce = CONTOUR.force;
    sh.uniforms.uContourCouleur = { value: c };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uContourForce;\nuniform vec3 uContourCouleur;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float fr = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          totalEmissiveRadiance += uContourCouleur * pow(fr, ${puissance.toFixed(2)}) * uContourForce
            + diffuseColor.rgb * ${base.toFixed(3)};
        }`);
  };
  mat.customProgramCacheKey = () => 'contour-' + puissance + '-' + base + '-' + couleur + '-' + force;
  return mat;
}

export function geoFeuille(l = 0.09, w = 0.038) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(w * 1.1, l * 0.15, w * 1.0, l * 0.65, 0, l);
  s.bezierCurveTo(-w * 1.0, l * 0.65, -w * 1.1, l * 0.15, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    uv.setXY(i, x / (2 * w) + 0.5, y / l);

    p.setZ(i, 0.1 * l * (y / l) * (y / l) - 3 * x * x);
  }
  g.computeVertexNormals();
  return g;
}

export function feutre(couleur, opts = {}) {
  const t = textures();
  return new THREE.MeshPhysicalMaterial({
    color: couleur, roughness: 1, metalness: 0, map: t.map, bumpMap: t.bump, bumpScale: 0.35,
    sheen: 0.55, sheenRoughness: 0.8, sheenColor: new THREE.Color(opts.sheen ?? 0x8f765e), ...opts.extra,
  });
}

export function geoCapuchon(R) {
  const base = new THREE.SphereGeometry(R, 56, 40);
  const pos = base.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const yn = v.y / R;
    if (yn > 0.35) {
      const k = (yn - 0.35) / 0.65;
      v.y += k * k * R * 0.32;
      v.x *= 1 - k * 0.18; v.z *= 1 - k * 0.12;
      v.z -= k * k * R * 0.12;
    }
    if (yn < -0.2) { v.x *= 1 + (-0.2 - yn) * 0.35; v.z *= 1 + (-0.2 - yn) * 0.2; }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const ng = base.toNonIndexed();
  const p = ng.attributes.position, uvA = ng.attributes.uv;
  const garder = [], uvs = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3).normalize();
    const e = (m.x / 0.66) ** 2 + ((m.y + 0.02) / 0.74) ** 2;
    const ouvert = m.z > 0 && e < 1;
    const dessous = m.y < -0.86;
    if (!ouvert && !dessous) {
      for (const q of [a, b, c]) garder.push(q.x, q.y, q.z);
      for (let k = 0; k < 3; k++) uvs.push(uvA.getX(i + k), uvA.getY(i + k));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(garder, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

function geoBord(R) {
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const ex = 0.66 * Math.cos(t), ey = 0.74 * Math.sin(t) - 0.02;
    const ez = Math.sqrt(Math.max(0.0001, 1 - ex * ex - ey * ey));
    const v = new THREE.Vector3(ex, ey, ez).multiplyScalar(R);
    if (ey > 0.35 * 1) { const k = (ey - 0.35) / 0.65; v.y += k * k * R * 0.32; v.x *= 1 - k * 0.18; v.z *= 1 - k * 0.12; v.z -= k * k * R * 0.12; }
    if (ey < -0.2) { v.x *= 1 + (-0.2 - ey) * 0.35; v.z *= 1 + (-0.2 - ey) * 0.2; }
    pts.push(v);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, R * 0.085, 10, true);
}

function feuillesSur(geo, n, graine, filtre, mat, echelle = 1, couleurs) {
  const r = alea(graine);
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const choisis = [];
  const p = new THREE.Vector3(), nn = new THREE.Vector3();
  let essais = 0;
  while (choisis.length < n && essais < n * 60) {
    essais++;
    const i = Math.floor(r() * pos.count);
    p.fromBufferAttribute(pos, i); nn.fromBufferAttribute(nor, i);
    if (filtre && !filtre(p, nn)) continue;
    const ecart = 0.045 * echelle;
    if (choisis.some(q => q.p.distanceToSquared(p) < ecart * ecart)) continue;
    choisis.push({ p: p.clone(), n: nn.clone().normalize() });
  }
  const im = new THREE.InstancedMesh(geoFeuille(0.085 * echelle, 0.036 * echelle), mat, choisis.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
  const col = new THREE.Color();
  choisis.forEach((c, i) => {
    Z.copy(c.n);

    Y.set((r() - 0.5) * 0.7, -1, (r() - 0.5) * 0.3);
    Y.addScaledVector(Z, -Z.dot(Y));
    if (Y.lengthSq() < 1e-4) Y.set(1, 0, 0);
    Y.normalize(); X.crossVectors(Y, Z).normalize(); Y.crossVectors(Z, X);
    m.makeBasis(X, Y, Z);
    q.setFromRotationMatrix(m);
    const k = 0.8 + r() * 0.45;
    s.set(k, k, k);
    m.compose(c.p.clone().addScaledVector(Z, 0.006), q, s);

    m.multiply(new THREE.Matrix4().makeTranslation(0, -0.03 * echelle, 0));
    im.setMatrixAt(i, m);
    const base = couleurs[Math.floor(r() * couleurs.length)];
    col.set(base).offsetHSL((r() - 0.5) * 0.02, (r() - 0.5) * 0.08, (r() - 0.5) * 0.06);
    im.setColorAt(i, col);
  });
  im.castShadow = false; im.receiveShadow = true;
  return im;
}

const POSE_CLES = ['hipsY', 'hipsZ', 'torsoX', 'torsoY', 'torsoZ', 'headX', 'headY', 'headZ', 'legLX', 'legRX',
  'legLZ', 'legRZ', 'seedB', 'seedL', 'seedR', 'eye', 'eyeS', 'capeX', 'squash', 'joie'];
const POSE_VEC = ['handL', 'handR'];

function pose(p) {
  return Object.assign({
    hipsY: 0.27, hipsZ: 0, torsoX: 0.04, torsoY: 0, torsoZ: 0, headX: 0, headY: 0, headZ: 0,
    legLX: 0, legRX: 0, legLZ: 0.04, legRZ: -0.04, seedB: 1, seedL: 0, seedR: 0, eye: 1, eyeS: 1, capeX: 0, squash: 1, joie: 0,
    handL: [0.06, 0.4, 0.2], handR: [-0.06, 0.4, 0.2],
  }, p);
}

const lisse = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const bruit = (t) => Math.sin(t) * 0.6 + Math.sin(t * 2.31 + 1.3) * 0.3 + Math.sin(t * 4.7 + 0.4) * 0.1;

const ANIMS = {
  debout(t, tl, c) {
    return pose({
      torsoZ: 0.03 * Math.sin(t * 0.55), torsoX: 0.04 + 0.015 * Math.sin(t * 0.31),
      headY: 0.28 * bruit(t * 0.23), headX: 0.06 * bruit(t * 0.17 + 3), headZ: 0.06 * Math.sin(t * 0.4),
    });
  },
  regarde(t, tl, c) {
    return pose({
      headY: 0.75 * Math.sin(tl * 0.55), headX: -0.12 + 0.1 * Math.sin(tl * 0.37), headZ: 0.08 * Math.sin(tl * 0.8),
      torsoY: 0.22 * Math.sin(tl * 0.55 - 0.4), torsoX: 0.0,
    });
  },
  marche(t, tl, c) {
    const ph = c.phaseMarche;
    const s = Math.sin(ph), cs = Math.cos(ph);
    return pose({
      hipsY: 0.258 + 0.022 * Math.abs(cs), torsoX: 0.1, torsoZ: 0.06 * s, torsoY: 0.08 * s,
      headZ: -0.05 * s, headX: -0.02, headY: 0.1 * bruit(t * 0.3),
      legLX: 0.55 * s, legRX: -0.55 * s,
      handL: [0.06, 0.4 + 0.012 * Math.sin(ph * 2), 0.21], handR: [-0.06, 0.4 + 0.012 * Math.sin(ph * 2), 0.21],
      capeX: -0.12,
    });
  },
  assis(t, tl, c) {
    return pose({
      hipsY: 0.115, hipsZ: -0.04, torsoX: -0.06, legLX: -1.42, legRX: -1.42, legLZ: 0.2, legRZ: -0.2,
      handL: [0.055, 0.25, 0.2], handR: [-0.055, 0.25, 0.2],
      headY: 0.45 * bruit(tl * 0.12), headX: -0.1 + 0.08 * bruit(tl * 0.1 + 2), headZ: 0.07 * Math.sin(tl * 0.3), joie: 0.3,
    });
  },
  dort(t, tl, c) {
    return pose({
      hipsY: 0.115, hipsZ: -0.04, torsoX: 0.32, legLX: -1.42, legRX: -1.42, legLZ: 0.2, legRZ: -0.2,
      handL: [0.05, 0.2, 0.2], handR: [-0.05, 0.2, 0.2],
      headX: 0.42, headZ: 0.12, eye: 0.08, capeX: 0.1,
    });
  },
  creuse(t, tl, c) {
    const k = Math.sin(tl * 7);
    return pose({
      hipsY: 0.115, hipsZ: -0.05, torsoX: 0.36, legLX: -1.3, legRX: -1.3, legLZ: 0.42, legRZ: -0.42,
      headX: -0.16, headY: 0.12 * Math.sin(tl * 0.5),
      handL: [0.1, 0.2, 0.22], handR: [-0.07, 0.05 + 0.05 * Math.max(0, k), 0.26 + 0.04 * k],
      seedB: 0, seedL: 1,
    });
  },
  empile(t, tl, c) {

    const bas = lisse(tl / 1.2) * (1 - lisse((tl - 2.4) / 1.4));
    const pose_ = lisse((tl - 4.2) / 1.2) * (1 - lisse((tl - 6.8) / 1.0));
    const h = c.hauteurTas ?? 0.3;
    const p = pose({
      hipsY: 0.27 - 0.11 * bas - 0.04 * pose_, torsoX: 0.06 + 0.7 * bas + 0.35 * pose_, legLX: -0.4 * bas, legRX: -0.3 * bas,
      legLZ: 0.04 + 0.2 * bas, legRZ: -0.04 - 0.2 * bas, headX: 0.15 * bas + 0.2 * pose_ - 0.12 * lisse((tl - 7) / 1),
      seedB: 0, seedL: 1, handL: [0.09, 0.36, 0.18],
    });
    const repos = [-0.08, 0.36, 0.2];
    const sol = [-0.2, 0.04, 0.22];
    const tas = [-0.02, Math.min(0.62, 0.12 + h), 0.42];
    p.handR = repos.map((v, i) => v + (sol[i] - v) * bas + (tas[i] - v) * pose_);
    return p;
  },
  plante(t, tl, c) {
    const bas = lisse(tl / 2.5) * (1 - lisse((tl - 8.2) / 2));
    const presse = Math.max(0, Math.sin(tl * 5)) * lisse((tl - 4) / 1) * (1 - lisse((tl - 7.5) / 0.5));
    return pose({
      hipsY: 0.27 - 0.13 * bas, hipsZ: -0.03 * bas, torsoX: 0.05 + 0.78 * bas, legLX: -0.75 * bas, legRX: -0.75 * bas,
      legLZ: 0.05 + 0.2 * bas, legRZ: -0.05 - 0.2 * bas, headX: 0.25 * bas,
      handL: [0.06, 0.4 - 0.36 * bas - 0.02 * presse, 0.2 + 0.16 * bas], handR: [-0.06, 0.4 - 0.36 * bas - 0.02 * presse, 0.2 + 0.16 * bas],
    });
  },
  ramasse(t, tl, c) {
    const d = c.dureeAction || 4;
    const bas = lisse(tl / (d * 0.4)) * (1 - lisse((tl - d * 0.55) / (d * 0.4)));
    const deux = c.deuxMains;
    return pose({
      hipsY: 0.27 - 0.12 * bas, torsoX: 0.05 + 0.75 * bas, legLX: -0.6 * bas, legRX: -0.6 * bas,
      legLZ: 0.04 + 0.2 * bas, legRZ: -0.04 - 0.2 * bas, headX: 0.2 * bas,
      handL: deux ? [0.06, 0.4 - 0.37 * bas, 0.2 + 0.14 * bas] : [0.09, 0.36, 0.18],
      handR: [-0.06, 0.4 - 0.37 * bas, 0.2 + 0.14 * bas],
      seedB: deux ? 1 : 0, seedL: deux ? 0 : 1,
    });
  },
  pose(t, tl, c) { return ANIMS.ramasse(t, tl, c); },
  leve(t, tl, c) {
    const h = lisse(tl / 1.6) * (1 - lisse((tl - 8.4) / 1.5));
    return pose({
      hipsY: 0.27 + 0.03 * h, torsoX: 0.04 - 0.2 * h, headX: -0.55 * h, headY: 0.08 * Math.sin(tl * 0.7) * h,
      handL: [0.045, 0.4 + 0.62 * h, 0.2 + 0.04 * h], handR: [-0.045, 0.4 + 0.62 * h, 0.2 + 0.04 * h],
      capeX: -0.05 * h, joie: 0.85 * h,
    });
  },
  salue(t, tl, c) {
    const h = lisse(tl / 0.5) * (1 - lisse((tl - 4.2) / 0.7));
    return pose({
      torsoZ: -0.05 * h, headZ: 0.14 * Math.sin(tl * 2) * h, headX: -0.05,
      handL: [0.07, 0.4, 0.19], handR: [-0.06 - 0.3 * h + 0.06 * Math.sin(tl * 10) * h, 0.4 + 0.46 * h, 0.2 + 0.02 * h],
      seedB: 0, seedL: 1, joie: 0.9 * h,
    });
  },
  surpris(t, tl, c) {
    const saut = Math.max(0, Math.sin(Math.min(tl, 0.42) / 0.42 * Math.PI));
    const ouvert = 1 - lisse((tl - 1.2) / 0.8);
    return pose({
      hipsY: 0.27 + 0.1 * saut, torsoX: -0.12 * ouvert, headX: -0.12 * ouvert,
      handL: [0.06 + 0.12 * ouvert, 0.4 + 0.12 * ouvert, 0.2], handR: [-0.06 - 0.2 * ouvert, 0.4 + 0.18 * ouvert, 0.16],
      seedB: 1 - ouvert, seedL: ouvert, eyeS: 1 + 0.32 * ouvert, legLX: -0.25 * saut, legRX: 0.15 * saut,
      squash: 1 + 0.06 * saut,
    });
  },
  etire(t, tl, c) {
    const h = Math.sin(Math.min(1, tl / 3.4) * Math.PI);
    return pose({
      hipsY: 0.27 + 0.03 * h, torsoX: 0.04 - 0.14 * h, headX: -0.25 * h, eye: 1 - 0.6 * h,
      handL: [0.06 + 0.16 * h, 0.4 + 0.42 * h, 0.2 - 0.12 * h], handR: [-0.06 - 0.16 * h, 0.4 + 0.42 * h, 0.2 - 0.12 * h],
      seedB: 1 - h, seedR: h, squash: 1 + 0.04 * h, joie: 0.4 * h,
    });
  },
};

function habillerV1(sq) {
  const { racine, corps, hips, torse, cape, tete, graine } = sq;
  const T = textures();
  const brun = feutre(0x6a4a31);
  const brunSombre = feutre(0x4a3424);
  const interieur = feutre(0x3a281b, { extra: { side: THREE.BackSide } });
  const noir = feutre(0x161311, { sheen: 0x555048 });
  const beige = feutre(0xd9c8a7, { sheen: 0xffffff });
  const cordon = feutre(0x9a7a56, { sheen: 0xe0c49e });
  const feuilleMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: T.feuille, roughness: 1, sheen: 0.4, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x7d6650),
    bumpMap: T.bump, bumpScale: 0.2,
    side: THREE.DoubleSide,
  });
  const couleursFeuilles = [0x7d5d40, 0x735438, 0x876546, 0x6a4c33];

  const ombre = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  const jambes = [];
  for (const cote of [1, -1]) {
    const pivot = new THREE.Group(); pivot.position.set(0.075 * cote, 0, 0); hips.add(pivot);
    const jambe = ombre(new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.13, 6, 14), brun));
    jambe.position.y = -0.1; pivot.add(jambe);
    const pied = ombre(new THREE.Mesh(new THREE.SphereGeometry(0.062, 18, 12), noir));
    pied.scale.set(1.0, 0.72, 1.35); pied.position.set(0, -0.215, 0.025); pivot.add(pied);
    jambes.push(pivot);
  }

  const robeProfil = [[0.0, -0.13], [0.15, -0.13], [0.162, -0.1], [0.158, -0.02], [0.148, 0.08], [0.142, 0.18],
    [0.13, 0.27], [0.1, 0.34], [0.06, 0.38], [0.0, 0.39]].map(([x, y]) => new THREE.Vector2(x, y));
  const robe = ombre(new THREE.Mesh(new THREE.LatheGeometry(robeProfil, 40), brun));
  torse.add(robe);

  const couture = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.36, 6), brunSombre);
  couture.position.set(0, 0.08, 0.152); couture.rotation.x = -0.05; torse.add(couture);

  const capeProfil = [[0.07, 0.02], [0.14, -0.02], [0.21, -0.08], [0.245, -0.15], [0.262, -0.22]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const capeGeo = new THREE.LatheGeometry(capeProfil, 40, 0.42, Math.PI * 2 - 0.84);
  {
    const p = capeGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i), y = p.getY(i);
      if (y < -0.03 && z < 0) p.setY(i, y + (y + 0.03) * (-z / 0.22) * 0.55);
    }
    capeGeo.computeVertexNormals();
  }
  const capeMesh = ombre(new THREE.Mesh(capeGeo, new THREE.MeshPhysicalMaterial({
    color: 0x5e432d, roughness: 1, sheen: 0.5, sheenColor: new THREE.Color(0x8f765e), map: T.map, side: THREE.DoubleSide,
  })));
  cape.add(capeMesh);
  cape.add(feuillesSur(capeGeo, 70, 3, (p) => p.y < 0.0, feuilleMat, 1.5, couleursFeuilles));

  const nœud = ombre(new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), cordon));
  nœud.position.set(0, 0.315, 0.135); nœud.scale.set(1.3, 0.9, 0.8); torse.add(nœud);
  const tour = ombre(new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.008, 6, 40), cordon));
  tour.position.set(0, 0.335, 0.02); tour.rotation.x = Math.PI / 2 + 0.35; torse.add(tour);
  const brins = [];
  for (const cote of [1, -1]) {
    const courbe = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.005 * cote, 0.31, 0.14), new THREE.Vector3(0.02 * cote, 0.25, 0.155),
      new THREE.Vector3(0.028 * cote, 0.19, 0.158)]);
    const b = ombre(new THREE.Mesh(new THREE.TubeGeometry(courbe, 12, 0.0065, 6), cordon));
    torse.add(b);
    const bout = ombre(new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), cordon));
    bout.position.set(0.028 * cote, 0.185, 0.158); torse.add(bout);
    brins.push(b);
  }

  const bras = [];
  for (const cote of [1, -1]) {
    const epaule = new THREE.Vector3(0.135 * cote, 0.285, 0.0);
    const haut = new THREE.Group(); torse.add(haut);
    const mh = ombre(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.056, 0.15, 14), brun));
    mh.position.y = -0.075; haut.add(mh);
    const epauleBoule = ombre(new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 10), brun)); haut.add(epauleBoule);
    const bas = new THREE.Group(); torse.add(bas);
    const mb = ombre(new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.07, 0.12, 14, 1, true), brun));
    mb.material = brun; mb.position.y = -0.06; bas.add(mb);
    const coude = ombre(new THREE.Mesh(new THREE.SphereGeometry(0.056, 14, 10), brun)); bas.add(coude);
    const fond = new THREE.Mesh(new THREE.CircleGeometry(0.066, 14), interieur.clone());
    fond.material.side = THREE.DoubleSide; fond.position.y = -0.115; fond.rotation.x = Math.PI / 2; bas.add(fond);
    const main = ombre(new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), noir));
    main.scale.set(1.0, 1.15, 0.85); main.position.y = -0.15; bas.add(main);
    const pouce = ombre(new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), noir));
    pouce.position.set(-0.03 * cote, -0.13, 0.03); bas.add(pouce);

    const fm = feuillesSur(mh.geometry, 7, 20 + cote, (p) => p.y > -0.05, feuilleMat, 0.9, couleursFeuilles);
    fm.position.copy(mh.position); haut.add(fm);
    bras.push({ cote, epaule, haut, bas, main, a: 0.158, b: 0.15 });
  }

  const R = 0.3;
  const centre = new THREE.Vector3(0, 0.22, 0);
  const capGeo = geoCapuchon(R);
  const capuchon = ombre(new THREE.Mesh(capGeo, brun)); capuchon.position.copy(centre); tete.add(capuchon);
  const capIn = new THREE.Mesh(capGeo, interieur); capIn.position.copy(centre); capIn.scale.setScalar(0.985); tete.add(capIn);
  const bord = ombre(new THREE.Mesh(geoBord(R), brun)); bord.position.copy(centre); tete.add(bord);
  const feuillesCap = feuillesSur(capGeo, 85, 9, (p) => {
    const n = p.clone().normalize();
    const e = (n.x / 0.66) ** 2 + ((n.y + 0.02) / 0.74) ** 2;
    return !(n.z > -0.15 && e < 1.45) && p.y > -0.24;
  }, feuilleMat, 1.45, couleursFeuilles);
  feuillesCap.position.copy(centre); tete.add(feuillesCap);

  const visage = new THREE.Mesh(new THREE.SphereGeometry(0.245, 32, 24), new THREE.MeshBasicMaterial({ color: 0x020203 }));
  visage.position.set(0, 0.205, -0.045); tete.add(visage);

  const yeux = new THREE.Group(); yeux.position.set(0, 0.215, 0.18); tete.add(yeux);
  const oeilMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf0a040), toneMapped: false });
  const pupMat = new THREE.MeshBasicMaterial({ color: 0x140903, toneMapped: false });
  const lueurOeil = new THREE.SpriteMaterial({ map: T.lueur, color: 0xff9a30, transparent: true, opacity: 0.4, toneMapped: false,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const oeils = [];
  for (const cote of [1, -1]) {
    const o = new THREE.Group(); o.position.set(0.088 * cote, 0, 0); o.rotation.y = 0.3 * cote; yeux.add(o);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.058, 24, 16), oeilMat); globe.scale.set(1, 1.08, 0.3); o.add(globe);

    const coeur = new THREE.Mesh(new THREE.CircleGeometry(0.034, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd27a), toneMapped: false, transparent: true, opacity: 0.85 }));
    coeur.position.z = 0.0176; o.add(coeur);
    const pup = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16), pupMat);
    pup.scale.set(0.8, 1.2, 1); pup.position.set(-0.004 * cote, 0.002, 0.0182); o.add(pup);
    const halo = new THREE.Sprite(lueurOeil); halo.scale.setScalar(0.24); halo.position.z = -0.01; halo.renderOrder = 2; o.add(halo);
    oeils.push({ o, pup, halo, cote });
  }

  const antennes = [];
  for (const cote of [1, -1]) {
    const piv = new THREE.Group(); piv.position.set(0.06 * cote, 0.5, -0.045); tete.add(piv);
    const inner = new THREE.Group(); piv.add(inner);
    inner.rotation.set(-0.12, 0, -0.32 * cote);
    const courbe = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.04, 0), new THREE.Vector3(0.006 * cote, 0.14, 0.01),
      new THREE.Vector3(0.01 * cote, 0.3, 0.0)]);
    inner.add(ombre(new THREE.Mesh(new THREE.TubeGeometry(courbe, 16, 0.0085, 6), beige)));
    const pom = ombre(new THREE.Mesh(new THREE.SphereGeometry(0.036, 18, 14), beige));
    pom.position.set(0.01 * cote, 0.31, 0); pom.scale.set(1, 0.95, 1); inner.add(pom);
    antennes.push({ piv, cote, ax: 0, az: 0, vx: 0, vz: 0 });
  }

  const gProfil = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const r = 0.046 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.98 + 0.02)), 0.75) * (1 - 0.55 * t);
    gProfil.push(new THREE.Vector2(Math.max(0.0005, r), -0.03 + t * 0.12));
  }
  const graineMat = new THREE.MeshStandardMaterial({ color: 0xffe2a6, emissive: 0xffa23a, emissiveIntensity: 2.2, roughness: 0.35 });
  const goutte = new THREE.Mesh(new THREE.LatheGeometry(gProfil, 24), graineMat); graine.add(goutte);
  const lueurGraine = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.lueur, color: 0xffa94d, transparent: true, opacity: 0.8, toneMapped: false,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  lueurGraine.scale.setScalar(0.5); lueurGraine.position.y = 0.02; graine.add(lueurGraine);
  const lumiere = new THREE.PointLight(0xffa04a, 0.6, 4.5, 2); lumiere.position.set(0, 0.06, 0.09); graine.add(lumiere);

  function majYeux(ouvert, P, regardX) {
    for (const o of oeils) {
      o.o.scale.set(P.eyeS, Math.max(0.06, ouvert) * P.eyeS, 1);
      o.pup.visible = ouvert > 0.3;
      o.halo.material.opacity = 0.25 + 0.35 * ouvert;
      o.pup.position.x = -0.004 * o.cote + 0.006 * regardX;
    }
  }
  return { jambes, bras, antennes, graineMat, lueurGraine, lumiere, majYeux };
}

export function creerMoka(style = 'v1') {
  const racine = new THREE.Group(); racine.name = 'moka';
  const corps = new THREE.Group(); racine.add(corps);
  const hips = new THREE.Group(); corps.add(hips);
  const torse = new THREE.Group(); hips.add(torse);
  const cape = new THREE.Group(); cape.position.set(0, 0.36, 0); torse.add(cape);
  const tete = new THREE.Group(); tete.position.set(0, 0.36, 0); torse.add(tete);
  const graine = new THREE.Group(); racine.add(graine);
  const ombre = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const habiller = style === 'voxel' ? habillerVoxel : style === 'doux' ? habillerDoux : style === 'modele' ? habillerModele : habillerV1;
  const H = habiller({ racine, corps, hips, torse, cape, tete, graine });
  const { jambes, bras, antennes, graineMat, lueurGraine, lumiere } = H;

  const porte = new THREE.Group(); racine.add(porte); porte.visible = false;

  const caillou = ombre(new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 1),
    new THREE.MeshStandardMaterial({ color: 0x8a92a0, roughness: 0.9 })));
  caillou.scale.set(1.2, 0.7, 1); caillou.visible = false; racine.add(caillou);

  const poids = {};
  const debuts = {};
  let animCourante = 'debout';
  let tGlobal = 0;
  let prochainCligne = 2, cligne = 0;
  const prevTete = new THREE.Vector3(), velTete = new THREE.Vector3();
  let premier = true;
  let capeAng = 0, capeVel = 0, capeAngZ = 0, capeVelZ = 0;
  const prevTorse = new THREE.Vector3(), velTorse = new THREE.Vector3();
  let graineVisible = 1, porteVisible = 0;

  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), q = new THREE.Quaternion(), mtx = new THREE.Matrix4();

  function poserBras(br, cibleRacine) {

    v.set(...cibleRacine); racine.localToWorld(v); torse.worldToLocal(v);
    const S = br.epaule;
    const d0 = v.clone().sub(S); let d = d0.length();
    const a = br.a, b = br.b;
    d = Math.min(Math.max(d, Math.abs(a - b) + 0.01), a + b - 0.002);
    const u = d0.normalize();
    const pole = new THREE.Vector3(1.0 * br.cote, -0.8, -0.6).normalize();
    const w = pole.clone().addScaledVector(u, -pole.dot(u)).normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const E = S.clone().addScaledVector(u, a * cosA).addScaledVector(w, a * sinA);
    const T_ = S.clone().addScaledVector(u, d);
    orienter(br.haut, S, E);
    orienter(br.bas, E, T_);
  }
  function orienter(g, A, B) {
    const dir = B.clone().sub(A).normalize();
    const Y = dir.clone().negate();
    let Z = new THREE.Vector3(0, 0, 1);
    if (Math.abs(Z.dot(Y)) > 0.95) Z.set(0, 1, 0);
    const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
    Z.crossVectors(X, Y);
    mtx.makeBasis(X, Y, Z);
    g.quaternion.setFromRotationMatrix(mtx);
    g.position.copy(A);
  }

  function choisirAnim(nom, ecoule) {
    if (!ANIMS[nom]) nom = 'debout';
    if (nom !== animCourante || debuts[nom] === undefined) {
      animCourante = nom;
      debuts[nom] = tGlobal - Math.max(0, Math.min(ecoule ?? 0, 600));
    }
  }

  /**
   * maj(dt, ctx) – ctx : { anim, phaseMarche, lumiere (0-1), graine (bool), porte (bool), dureeAction,
   *   tempsAction (s depuis le début côté serveur), hauteurTas, deuxMains, regardYaw, regardPoids }
   */
  function maj(dt, ctx) {
    tGlobal += dt;
    choisirAnim(ctx.anim, ctx.tempsAction);
    for (const k of Object.keys(ANIMS)) {
      const cible = k === animCourante ? 1 : 0;
      const vitesse = k === 'surpris' || animCourante === 'surpris' ? 9 : 3.2;
      poids[k] = (poids[k] ?? (k === animCourante ? 1 : 0));
      poids[k] += (cible - poids[k]) * (1 - Math.exp(-vitesse * dt));
      if (poids[k] < 0.002 && cible === 0) poids[k] = 0;
    }

    const P = {}; POSE_CLES.forEach(k => P[k] = 0); POSE_VEC.forEach(k => P[k] = [0, 0, 0]);
    let total = 0;
    for (const [k, w] of Object.entries(poids)) {
      if (w <= 0) continue;
      const p = ANIMS[k](tGlobal, tGlobal - (debuts[k] ?? tGlobal), ctx);
      total += w;
      POSE_CLES.forEach(c => P[c] += p[c] * w);
      POSE_VEC.forEach(c => { for (let i = 0; i < 3; i++) P[c][i] += p[c][i] * w; });
    }
    POSE_CLES.forEach(c => P[c] /= total);
    POSE_VEC.forEach(c => { for (let i = 0; i < 3; i++) P[c][i] /= total; });

    const dort = poids.dort || 0;
    const resp = Math.sin(tGlobal * (1.7 - 0.85 * dort)) * (0.012 + 0.012 * dort);

    if (ctx.regardPoids) {
      P.headY += (Math.max(-1.1, Math.min(1.1, ctx.regardYaw)) - P.headY) * ctx.regardPoids * 0.85;
    }

    if (ctx.porte && ['debout', 'regarde', 'marche', 'assis', 'dort'].includes(animCourante)) {
      P.handR = [-0.17, P.hipsY + 0.1, 0.12];
      P.seedL += P.seedB; P.seedB = 0;
      P.handL = [0.05, P.handL[1], P.handL[2]];
    }

    if (H.leve && (poids.leve || 0) > 0.001) {
      const k = Math.max(0, Math.min(1, (Math.max(P.handL[1], P.handR[1]) - 0.4) / 0.62));
      const [mx, my, mz] = H.leve.mains;
      P.handL = P.handL.map((x, i) => x + ([mx, my, mz][i] - x) * k);
      P.handR = P.handR.map((x, i) => x + ([-mx, my, mz][i] - x) * k);
      P.headX += (H.leve.tete - P.headX) * k;
    }
    if (H.ajusterPose) H.ajusterPose(P, poids, tGlobal - (debuts.leve ?? tGlobal));
    if (H.dort && dort > 0.001) P.headX += (Math.min(P.headX, H.dort.teteMax) - P.headX) * dort;
    hips.position.set(0, P.hipsY, P.hipsZ);
    corps.scale.set(1 / Math.sqrt(P.squash), P.squash, 1 / Math.sqrt(P.squash));
    torse.rotation.set(P.torsoX, P.torsoY, P.torsoZ, 'YXZ');
    torse.scale.set(1 + resp * 0.4, 1 + resp, 1 + resp * 0.4);
    tete.rotation.set(P.headX - resp * 0.6, P.headY, P.headZ, 'YXZ');
    jambes[0].rotation.set(P.legLX, 0, P.legLZ); jambes[1].rotation.set(P.legRX, 0, P.legRZ);
    racine.updateMatrixWorld(true);
    poserBras(bras[0], P.handL);
    poserBras(bras[1], P.handR);
    racine.updateMatrixWorld(true);

    const mL = bras[0].main.getWorldPosition(new THREE.Vector3()); racine.worldToLocal(mL);
    const mR = bras[1].main.getWorldPosition(new THREE.Vector3()); racine.worldToLocal(mR);
    const sB = P.seedB, sL = P.seedL, sR = P.seedR, sT = Math.max(0.001, sB + sL + sR);
    v2.set(0, 0, 0)
      .addScaledVector(mL.clone().add(mR).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.035, 0.03)), sB / sT)
      .addScaledVector(mL.clone().add(new THREE.Vector3(0, 0.055, 0.015)), sL / sT)
      .addScaledVector(mR.clone().add(new THREE.Vector3(0, 0.055, 0.015)), sR / sT);
    graine.position.copy(v2);
    const gl = H.leve || { graineY: 0.3, graineZ: 0.05 };
    graine.position.y += (poids.leve || 0) * (gl.graineY + 0.04 * Math.sin(tGlobal * 1.4));
    graine.position.z += (poids.leve || 0) * gl.graineZ;
    graineVisible += ((ctx.graine ? 1 : 0) - graineVisible) * (1 - Math.exp(-6 * dt));
    graine.scale.setScalar(Math.max(0.001, graineVisible));
    graine.visible = graineVisible > 0.01;
    const lum = Math.max(0.08, ctx.lumiere ?? 0.7);
    const pulse = dort > 0.5 ? 0.75 + 0.25 * Math.sin(tGlobal * 1.1) : 1 + 0.04 * Math.sin(tGlobal * 3.1);
    const leve = poids.leve || 0;
    lumiere.intensity = (0.07 + 0.26 * lum) * pulse * (1 + 0.6 * leve) * graineVisible * (H.gainLumiere || 1);
    lumiere.distance = 3 + 3 * lum;
    graineMat.emissiveIntensity = (0.8 + 2.4 * lum) * pulse;
    lueurGraine.scale.setScalar((0.28 + 0.45 * lum) * pulse * (1 + 0.5 * leve));
    lueurGraine.material.opacity = 0.55 + 0.35 * lum;

    porteVisible += ((ctx.porte ? 1 : 0) - porteVisible) * (1 - Math.exp(-8 * dt));
    porte.visible = porteVisible > 0.02;
    porte.position.copy(mR).add(new THREE.Vector3(0, -0.04, 0.02));
    porte.scale.setScalar(Math.max(0.001, porteVisible));
    const tlEmp = tGlobal - (debuts.empile ?? -99);
    caillou.visible = animCourante === 'empile' && tlEmp > 1.3 && tlEmp < 5.9;
    if (caillou.visible) caillou.position.copy(mR).add(new THREE.Vector3(0, -0.03, 0.03));

    prochainCligne -= dt;
    if (prochainCligne <= 0) { cligne = 0.16; prochainCligne = 2.2 + Math.random() * 4.5; }
    let fermeture = 1;
    if (cligne > 0) { cligne -= dt; fermeture = 0.08 + 0.92 * Math.abs(cligne / 0.16 * 2 - 1); }
    const ouvert = Math.min(P.eye, fermeture);
    const regardX = Math.max(-1, Math.min(1, (ctx.regardYaw || 0))) * (ctx.regardPoids || 0);
    P.joie = Math.min(1, P.joie + 0.25 * (ctx.regardPoids || 0));
    H.majYeux(ouvert, P, regardX, tGlobal, dt);
    if (H.maj) H.maj(dt, P, tGlobal, ctx, poids);

    const pt = tete.getWorldPosition(new THREE.Vector3());
    const ptor = torse.getWorldPosition(new THREE.Vector3());
    if (premier) { prevTete.copy(pt); prevTorse.copy(ptor); premier = false; }
    const sdt = Math.max(dt, 1e-3);
    const nv = pt.clone().sub(prevTete).divideScalar(sdt);
    const acc = nv.clone().sub(velTete).divideScalar(sdt);
    velTete.copy(nv); prevTete.copy(pt);
    if (acc.length() > 60) acc.setLength(60);
    tete.getWorldQuaternion(q); acc.applyQuaternion(q.invert());
    const nvT = ptor.clone().sub(prevTorse).divideScalar(sdt);
    const accT = nvT.clone().sub(velTorse).divideScalar(sdt);
    velTorse.copy(nvT); prevTorse.copy(ptor);
    if (accT.length() > 60) accT.setLength(60);
    torse.getWorldQuaternion(q); accT.applyQuaternion(q.invert());
    const pas = Math.min(dt, 1 / 30), n = Math.max(1, Math.round(dt / pas));
    for (let i = 0; i < n; i++) {
      const h = dt / n;
      for (const an of antennes) {
        const fx = -140 * an.ax - 5 * an.vx + acc.z * 0.9 + Math.sin(tGlobal * 1.3 + an.cote) * 0.4;
        const fz = -140 * an.az - 5 * an.vz - acc.x * 0.9 * 1 + Math.sin(tGlobal * 0.9 + an.cote * 2) * 0.3;
        an.vx += fx * h; an.vz += fz * h; an.ax += an.vx * h; an.az += an.vz * h;
        an.ax = Math.max(-0.7, Math.min(0.7, an.ax)); an.az = Math.max(-0.7, Math.min(0.7, an.az));
      }
      const fc = -70 * capeAng - 6 * capeVel + accT.z * 0.35;
      capeVel += fc * h; capeAng += capeVel * h;
      const fcz = -70 * capeAngZ - 6 * capeVelZ - accT.x * 0.3;
      capeVelZ += fcz * h; capeAngZ += capeVelZ * h;
    }
    for (const an of antennes) an.piv.rotation.set(an.ax, 0, an.az);
    cape.rotation.set(P.capeX + Math.max(-0.4, Math.min(0.4, capeAng)) + resp * 1.5, 0, Math.max(-0.3, Math.min(0.3, capeAngZ)));
  }

  return { groupe: racine, maj, porte, tete, graine, lumiere, style, pret: H.pret || Promise.resolve(), H, get anim() { return animCourante; } };
}
