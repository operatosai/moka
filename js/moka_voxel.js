
import * as THREE from 'three';
import { texLueur, ajouterContour, alea } from './moka3d.js';

const PAL = {
  brunClair: 0x9a7350, brun: 0x7e5b3d, brunFonce: 0x5e4129, ombre: 0x3f2b1c, interieur: 0x22160e,
  noir: 0x1c1815, noirClair: 0x2e2824, beige: 0xe2d1ad, beigeOmbre: 0xbfa985, cordon: 0xa88560,
};

const boites = new Map();
function boite(v) { if (!boites.has(v)) boites.set(v, new THREE.BoxGeometry(v, v, v)); return boites.get(v); }

/** fn(x, y, z) -> couleur (hex) ou null. Ne garde que les cubes de surface. */
function voxeliser(fn, min, max, v, mat, graine = 1, nuance = 0.04) {
  const n = [0, 1, 2].map(i => Math.max(1, Math.ceil((max[i] - min[i]) / v)));
  const grille = new Array(n[0] * n[1] * n[2]);
  const id = (i, j, k) => (i * n[1] + j) * n[2] + k;
  for (let i = 0; i < n[0]; i++) for (let j = 0; j < n[1]; j++) for (let k = 0; k < n[2]; k++) {
    grille[id(i, j, k)] = fn(min[0] + (i + 0.5) * v, min[1] + (j + 0.5) * v, min[2] + (k + 0.5) * v);
  }
  const plein = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < n[0] && j < n[1] && k < n[2] && grille[id(i, j, k)] != null;
  const cubes = [];
  for (let i = 0; i < n[0]; i++) for (let j = 0; j < n[1]; j++) for (let k = 0; k < n[2]; k++) {
    if (!plein(i, j, k)) continue;
    if (plein(i + 1, j, k) && plein(i - 1, j, k) && plein(i, j + 1, k) && plein(i, j - 1, k) && plein(i, j, k + 1) && plein(i, j, k - 1)) continue;
    cubes.push([i, j, k]);
  }
  const im = new THREE.InstancedMesh(boite(v), mat, Math.max(1, cubes.length));
  const M = new THREE.Matrix4(), c = new THREE.Color(), r = alea(graine);
  cubes.forEach(([i, j, k], q) => {
    M.makeTranslation(min[0] + (i + 0.5) * v, min[1] + (j + 0.5) * v, min[2] + (k + 0.5) * v);
    im.setMatrixAt(q, M);
    c.set(grille[id(i, j, k)]).offsetHSL(0, 0, (r() - 0.5) * nuance);
    im.setColorAt(q, c);
  });
  if (!cubes.length) im.count = 0;
  im.castShadow = true; im.receiveShadow = true;
  return im;
}

function profil(points, y) {
  for (let i = 0; i < points.length - 1; i++) {
    const [r0, y0] = points[i], [r1, y1] = points[i + 1];
    if ((y - y0) * (y - y1) <= 0 && y0 !== y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return -1;
}
const frac = (x) => x - Math.floor(x);

export function habillerVoxel(sq) {
  const { hips, torse, cape, tete, graine } = sq;
  const mat = ajouterContour(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), 0xffc489, 2.6, 0.06, 0.9);
  const V = 0.022;

  const jambes = [];
  for (const cote of [1, -1]) {
    const pivot = new THREE.Group(); pivot.position.set(0.075 * cote, 0, 0); hips.add(pivot);
    pivot.add(voxeliser((x, y, z) => {
      if (y > -0.2 && y < 0.01 && x * x + z * z < 0.057 ** 2) return y > -0.04 ? PAL.brunFonce : PAL.brun;
      const dx = x / 0.064, dy = (y + 0.215) / 0.048, dz = (z - 0.03) / 0.085;
      if (dx * dx + dy * dy + dz * dz < 1) return dy > 0.3 ? PAL.noirClair : PAL.noir;
      return null;
    }, [-0.08, -0.27, -0.08], [0.08, 0.02, 0.13], V * 0.9, mat, 10 + cote));
    jambes.push(pivot);
  }

  const robeP = [[0.15, -0.13], [0.16, -0.1], [0.156, -0.02], [0.146, 0.08], [0.14, 0.18], [0.126, 0.27], [0.095, 0.34], [0.05, 0.38], [0, 0.39]];
  torse.add(voxeliser((x, y, z) => {
    const r = profil(robeP, y); if (r < 0) return null;
    if (x * x + z * z > r * r) return null;
    if (z > 0 && Math.abs(x) < V * 0.6) return PAL.brunFonce;
    if (y < -0.1) return PAL.brunFonce;
    return frac(Math.atan2(x, z) * 3) < 0.5 ? PAL.brun : PAL.brunClair * 0 + PAL.brun;
  }, [-0.17, -0.14, -0.17], [0.17, 0.4, 0.17], V, mat, 3));

  const capeP = [[0.07, 0.02], [0.14, -0.02], [0.21, -0.08], [0.245, -0.15], [0.262, -0.24]];
  cape.add(voxeliser((x, y, z) => {
    const az = Math.atan2(x, z);
    if (Math.abs(az) < 0.42) return null;
    const pointe = Math.pow(Math.max(0, Math.cos(az * 9)), 0.7);
    const yb = -0.17 - 0.06 * pointe - (z < 0 ? 0.03 * (-z / 0.26) : 0);
    if (y < yb || y > 0.025) return null;
    const ro = profil(capeP, Math.max(-0.24, y)); if (ro < 0) return null;
    const r = Math.hypot(x, z);
    if (r > ro || r < ro - V * 2.1) return null;

    const rang = Math.floor((0.02 - y) / 0.065);
    const u = frac(az / (2 * Math.PI) * 18 + (rang % 2) * 0.5) - 0.5;
    const vv = frac((0.02 - y) / 0.065);
    if (vv > 0.82 - 1.2 * u * u) return PAL.ombre;
    if (r < ro - V) return PAL.brunFonce;
    return vv < 0.35 ? PAL.brunClair : PAL.brun;
  }, [-0.28, -0.28, -0.28], [0.28, 0.04, 0.28], V, mat, 4));

  torse.add(voxeliser((x, y, z) => {
    const dk = ((x / 0.03) ** 2 + ((y - 0.31) / 0.02) ** 2 + ((z - 0.14) / 0.02) ** 2);
    if (dk < 1) return PAL.cordon;
    for (const s of [1, -1]) if (Math.abs(x - s * (0.008 + (0.31 - y) * 0.15)) < 0.007 && y < 0.3 && y > 0.18 && Math.abs(z - 0.152) < 0.008) return PAL.cordon;
    return null;
  }, [-0.05, 0.17, 0.11], [0.05, 0.34, 0.17], 0.012, mat, 5));

  const bras = [];
  for (const cote of [1, -1]) {
    const epaule = new THREE.Vector3(0.135 * cote, 0.28, 0);
    const haut = new THREE.Group(); torse.add(haut);
    haut.add(voxeliser((x, y, z) => (y < 0.03 && y > -0.165 && x * x + z * z < (0.05 + (-y) * 0.03) ** 2) || (x * x + y * y + z * z < 0.052 ** 2)
      ? PAL.brun : null, [-0.07, -0.18, -0.07], [0.07, 0.06, 0.07], V * 0.85, mat, 20 + cote));
    const bas = new THREE.Group(); torse.add(bas);
    bas.add(voxeliser((x, y, z) => {
      const d = x * x + z * z;
      if (y <= 0.02 && y > -0.135) { const r = 0.052 + (-y) * 0.11; if (d < r * r) return y < -0.11 ? PAL.brunFonce : PAL.brun; }
      if (x * x + y * y + z * z < 0.054 ** 2) return PAL.brun;
      const mx = x / 0.056, my = (y + 0.17) / 0.062, mz = z / 0.05;
      if (mx * mx + my * my + mz * mz < 1) return my > 0.4 ? PAL.noirClair : PAL.noir;
      const px = (x + 0.035 * cote) / 0.022, py = (y + 0.155) / 0.022, pz = (z - 0.03) / 0.022;
      if (px * px + py * py + pz * pz < 1) return PAL.noir;
      return null;
    }, [-0.08, -0.24, -0.08], [0.08, 0.06, 0.08], V * 0.8, mat, 30 + cote));
    const main = new THREE.Group(); main.position.y = -0.17; bas.add(main);
    bras.push({ cote, epaule, haut, bas, main, a: 0.17, b: 0.165 });
  }

  const C = new THREE.Vector3(0, 0.23, 0), R = 0.315;
  const rs = (d) => R * (1 + 0.9 * Math.pow(Math.max(0, d.y - 0.6), 1.5) + (d.y < -0.3 ? 0.28 * (-0.3 - d.y) : 0));
  const ouv = (d) => d.z > 0 && (d.x / 0.64) ** 2 + ((d.y + 0.03) / 0.72) ** 2;
  const d_ = new THREE.Vector3();
  tete.add(voxeliser((x, y, z) => {
    d_.set(x, y - C.y, z); const L = d_.length(); if (L < 1e-6) return null;
    d_.divideScalar(L);
    const rb = rs(d_);
    const e = ouv(d_);
    if (d_.z > 0 && e < 1) return null;
    if (d_.y < -0.86) return null;
    if (L < rb - V * 1.9) return null;

    const el = Math.acos(Math.max(-1, Math.min(1, d_.y))), az = Math.atan2(d_.x, d_.z);
    const H = 0.27, rang = Math.floor(el / H);
    const nb = Math.max(5, Math.round(2 * Math.PI * Math.sin((rang + 0.5) * H) * R / 0.12));
    const u = frac(az / (2 * Math.PI) * nb + (rang % 2) * 0.5) - 0.5;
    const vv = frac(el / H);
    const bordF = 0.95 - 1.4 * u * u;
    const dansF = vv < bordF;
    const bord = d_.z > 0 && e < 1.25;
    const rr = bord ? rb + V * 0.6 : rb + (dansF ? V * (1.4 - 0.9 * vv / bordF) : 0);
    if (L > rr) return null;
    if (L < rb - V * 0.9) return PAL.interieur;
    if (bord) return PAL.brunClair;
    if (!dansF) return PAL.ombre;
    if (vv > bordF - 0.2) return PAL.brunFonce;
    if (Math.abs(u) < 0.045) return PAL.brunFonce;
    return vv < 0.4 ? PAL.brunClair : PAL.brun;
  }, [-0.4, -0.14, -0.4], [0.4, 0.72, 0.4], V, mat, 7, 0.015));

  tete.add(voxeliser((x, y, z) => (x * x + (y - 0.21) ** 2 + (z + 0.04) ** 2 < 0.245 ** 2) ? 0x050505 : null,
    [-0.26, -0.05, -0.3], [0.26, 0.47, 0.22], V, new THREE.MeshBasicMaterial({ color: 0xffffff }), 8, 0));

  const VE = 0.0135;
  const oeilMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const lueurMat = new THREE.SpriteMaterial({ map: texLueur(), color: 0xffa040, transparent: true, opacity: 0.45, toneMapped: false,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const oeils = [];
  for (const cote of [1, -1]) {
    const dir = new THREE.Vector3(0.34 * cote, 0, 1).normalize();
    const g = new THREE.Group();
    g.position.set(0, 0.215, -0.04).addScaledVector(dir, 0.252); g.position.y = 0.225;
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); tete.add(g);
    const forme = new THREE.Group(); g.add(forme);
    forme.add(voxeliser((x, y, z) => {
      if (Math.abs(z) > VE * 0.5) return null;
      const ex = x / 0.06, ey = y / 0.068; const d = ex * ex + ey * ey;
      if (d > 1) return null;
      const px = x + 0.006 * cote;
      if (Math.abs(px + 0.019 * cote) < VE * 0.9 && y > 0.012 && y < 0.035) return 0xfff3d0;
      if (Math.abs(px) < 0.014 && Math.abs(y) < 0.026) return 0x2a1307;
      return d < 0.3 ? 0xffd970 : d < 0.65 ? 0xffb43e : 0xe47c24;
    }, [-0.07, -0.075, -VE / 2], [0.07, 0.075, VE / 2], VE, oeilMat, 40 + cote, 0.02));
    const halo = new THREE.Sprite(lueurMat); halo.scale.setScalar(0.3); halo.position.z = -0.02; g.add(halo);
    oeils.push({ forme, halo, cote });
  }

  const antennes = [];
  for (const cote of [1, -1]) {
    const piv = new THREE.Group(); piv.position.set(0.065 * cote, 0.56, -0.06); tete.add(piv);
    const inner = new THREE.Group(); inner.rotation.set(-0.12, 0, -0.3 * cote); piv.add(inner);
    inner.add(voxeliser((x, y, z) => {
      if (y > -0.02 && y < 0.26 && Math.abs(x) < 0.009 && Math.abs(z) < 0.009) return PAL.beigeOmbre;
      const dy = y - 0.29;
      if (x * x + dy * dy + z * z < 0.042 ** 2) return dy > 0.01 ? PAL.beige : PAL.beigeOmbre;
      return null;
    }, [-0.05, -0.02, -0.05], [0.05, 0.34, 0.05], 0.016, mat, 50 + cote));
    antennes.push({ piv, cote, ax: 0, az: 0, vx: 0, vz: 0 });
  }

  const graineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffa53c, emissiveIntensity: 2.2, roughness: 0.4 });
  graine.add(voxeliser((x, y, z) => {
    const t = (y + 0.03) / 0.12; if (t < 0 || t > 1) return null;
    const r = 0.05 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.98 + 0.02)), 0.75) * (1 - 0.55 * t);
    return x * x + z * z < r * r ? (t < 0.5 ? 0xfff0c0 : 0xffd890) : null;
  }, [-0.05, -0.03, -0.05], [0.05, 0.09, 0.05], 0.014, graineMat, 60, 0.02));
  const lueurGraine = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLueur(), color: 0xffaa50, transparent: true, opacity: 0.8,
    toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
  lueurGraine.position.y = 0.025; graine.add(lueurGraine);
  const lumiere = new THREE.PointLight(0xffa04a, 0.6, 4.5, 2); lumiere.position.set(0, 0.06, 0.1); graine.add(lumiere);

  let joieL = 0;
  function majYeux(ouvert, P, regardX, t, dt) {
    joieL += (P.joie - joieL) * (1 - Math.exp(-6 * (dt || 0.016)));
    for (const o of oeils) {
      const s = P.eyeS;
      o.forme.scale.set(s, Math.max(0.12, ouvert) * (1 - 0.45 * joieL) * s, 1);
      o.forme.position.set(0.012 * regardX, 0.018 * joieL, 0);
      o.halo.material.opacity = 0.25 + 0.3 * ouvert;
    }
  }
  const leve = { mains: [0.19, 0.76, 0.17], graineY: 0.6, graineZ: 0.1, tete: -0.3 };
  return { jambes, bras, antennes, graineMat, lueurGraine, lumiere, majYeux, leve };
}
