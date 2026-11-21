
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { texLueur } from './moka3d.js';

const choixGlb = new URLSearchParams(location.search).get('glb');
const TELEPHONE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || Math.min(innerWidth, innerHeight) < 700;

const LEGER = choixGlb === 'leger' || (choixGlb !== 'complet' && TELEPHONE);
export const FICHIER_MODELE = './modeles/moka_v2_leger.glb';
const HAUTEUR = 1.12;

const net = (n) => n.toLowerCase().replace(/mixamorig[:_]?/, '');
const gauche = (n) => /left|(^|[_.\s:-])l([_.\s:-]|$)|_l$|\.l$/i.test(n);
const droite = (n) => /right|(^|[_.\s:-])r([_.\s:-]|$)|_r$|\.r$/i.test(n);
function trouverOs(racine) {
  const os = [];
  racine.traverse((o) => { if (o.isBone) os.push(o); });
  const prof = (o) => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };
  const cherche = (test, cote) => os.filter((o) => test(net(o.name)) && (!cote || (cote > 0 ? gauche(o.name) && !droite(o.name) : droite(o.name))))
    .sort((a, b) => prof(a) - prof(b));
  const premier = (l) => l[0] || null;
  const R = {
    tous: os,
    hanches: premier(cherche((n) => /hips|pelvis/.test(n))),
    colonne: cherche((n) => /spine|chest/.test(n) && !/upper.?arm/.test(n)),
    cou: premier(cherche((n) => /neck/.test(n))),
    tete: premier(cherche((n) => /head/.test(n) && !/end|top|nub/.test(n))),
  };
  for (const [cote, k] of [[1, 'G'], [-1, 'D']]) {
    R['epaule' + k] = premier(cherche((n) => /shoulder|clavicle/.test(n), cote));
    R['bras' + k] = premier(cherche((n) => (/upper.?arm/.test(n) || (/arm/.test(n) && !/fore|lower/.test(n))) && !/shoulder/.test(n), cote));
    R['avantbras' + k] = premier(cherche((n) => /fore.?arm|lower.?arm/.test(n), cote));
    R['main' + k] = premier(cherche((n) => /hand/.test(n) && !/thumb|index|middle|ring|pinky|finger/.test(n), cote));
    R['cuisse' + k] = premier(cherche((n) => /up.?leg|thigh|upper.?leg/.test(n), cote));
    R['genou' + k] = premier(cherche((n) => (/leg|calf|shin|knee/.test(n)) && !/up.?leg|upper/.test(n), cote));
    R['pied' + k] = premier(cherche((n) => /foot|ankle/.test(n), cote));
    R['orteil' + k] = premier(cherche((n) => /toe/.test(n), cote));
  }
  return R;
}

const qRel = (() => { const a = new THREE.Quaternion(), b = new THREE.Quaternion();
  return (obj, racine, out) => { racine.getWorldQuaternion(a); obj.getWorldQuaternion(b); return out.copy(a.invert()).multiply(b); }; })();
const posRel = (obj, racine, out) => racine.worldToLocal(obj.getWorldPosition(out));
function orienter(g, A, B) {
  const dir = B.clone().sub(A).normalize();
  const Y = dir.clone().negate();
  let Z = new THREE.Vector3(0, 0, 1);
  if (Math.abs(Z.dot(Y)) > 0.95) Z.set(0, 1, 0);
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  Z.crossVectors(X, Y);
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  g.position.copy(A);
}

function texOeil() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, '#fff1c4'); gr.addColorStop(0.35, '#ffd27a'); gr.addColorStop(0.75, '#f2a640'); gr.addColorStop(1, '#d67a22');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function geoAmande(r) {
  const s = new THREE.Shape();
  s.moveTo(-r * 1.15, 0);
  s.bezierCurveTo(-r * 0.75, r * 1.15, r * 0.75, r * 1.15, r * 1.15, 0);
  s.bezierCurveTo(r * 0.75, -r * 1.05, -r * 0.75, -r * 1.05, -r * 1.15, 0);
  const g = new THREE.ShapeGeometry(s, 24);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2.4 * r), 0.5 + p.getY(i) / (2.4 * r));
  return g;
}

export function habillerModele(sq) {
  const { racine, corps, hips, torse, tete, graine } = sq;

  const jambes = [];
  for (const cote of [1, -1]) { const p = new THREE.Group(); p.position.set(0.075 * cote, 0, 0); hips.add(p); jambes.push(p); }
  const bras = [];
  for (const cote of [1, -1]) {
    const haut = new THREE.Group(); torse.add(haut);
    const bas = new THREE.Group(); torse.add(bas);
    const main = new THREE.Group(); main.position.y = -0.15; bas.add(main);
    bras.push({ cote, epaule: new THREE.Vector3(0.135 * cote, 0.285, 0), haut, bas, main, a: 0.158, b: 0.15 });
  }
  const antennes = [];

  const graineMat = new THREE.MeshStandardMaterial({ color: 0xffe7b8, emissive: 0xffa94a, emissiveIntensity: 2.2, roughness: 0.4 });
  const boule = new THREE.Mesh(new THREE.SphereGeometry(0.05, 32, 20), graineMat); graine.add(boule);
  const coeur = new THREE.Mesh(new THREE.SphereGeometry(0.027, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff3d6, toneMapped: false,
    transparent: true, opacity: 0.7 })); graine.add(coeur);
  const lueurGraine = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLueur(), color: 0xffaa50, transparent: true, opacity: 0.8,
    toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
  graine.add(lueurGraine);
  const lumiere = new THREE.PointLight(0xffa04a, 0.6, 4.5, 1.8); lumiere.position.set(0, 0.0, 0.08); graine.add(lumiere);
  lumiere.castShadow = false;

  const cordon = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 1 }));
  cordon.castShadow = false; racine.add(cordon); cordon.visible = false;

  const yeux = new THREE.Group(); yeux.visible = false;
  const regard = new THREE.Group(); yeux.add(regard);
  const oeilMat = new THREE.MeshBasicMaterial({ map: texOeil(), toneMapped: false });
  const lueurMat = new THREE.SpriteMaterial({ map: texLueur(), color: 0xffa040, transparent: true, opacity: 0.25, toneMapped: false,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const oeils = [];
  let RE = 0.03;
  for (const cote of [1, -1]) {
    const g = new THREE.Group(); g.rotation.y = 0.12 * cote; regard.add(g);
    const forme = new THREE.Group(); g.add(forme);
    const disque = new THREE.Mesh(geoAmande(1), oeilMat); disque.rotation.z = 0.12 * cote; forme.add(disque);
    const halo = new THREE.Sprite(lueurMat); halo.position.z = -0.004; g.add(halo);
    oeils.push({ g, forme, disque, halo, cote });
  }
  function tailleYeux(r, ecart) {
    RE = r;
    for (const o of oeils) { o.disque.scale.setScalar(r); o.g.position.x = ecart * o.cote; o.halo.scale.setScalar(r * 2.3); }
  }
  tailleYeux(0.03, 0.06);
  let joieL = 0, saccade = 0, cibleSac = new THREE.Vector2(), sac = new THREE.Vector2();
  function majYeux(ouvert, P, regardX, t, dt) {
    dt = dt || 0.016;
    joieL += (P.joie - joieL) * (1 - Math.exp(-6 * dt));

    saccade -= dt;
    if (saccade <= 0) { saccade = 0.8 + Math.random() * 2.2; cibleSac.set((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.4); }
    sac.lerp(cibleSac, 1 - Math.exp(-14 * dt));
    regard.position.x = RE * (0.45 * sac.x + 0.6 * regardX);
    regard.position.y = RE * 0.35 * sac.y;
    for (const o of oeils) {
      const ouv = Math.max(0.09, Math.min(1, ouvert));

      o.forme.scale.set(P.eyeS * (1 + 0.1 * (1 - ouv)), P.eyeS * ouv * (1 - 0.3 * joieL), 1);
      o.forme.position.y = RE * 0.3 * joieL;
      o.halo.material.opacity = 0.1 + 0.18 * ouv;
    }
  }

  const ancre = new THREE.Object3D();
  const noeud = new THREE.Object3D();
  let L = 0.07;
  let prise = 0, dureeLeve = 10;
  const pend = { ax: 0.12, az: 0, vx: 0, vz: 0 }, prevAncre = new THREE.Vector3(), velAncre = new THREE.Vector3();
  let premierPend = true;
  let repere = null;
  const lisse = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

  function ajusterPose(P, poids, tl) {

    const neutre = (poids.debout || 0) + (poids.regarde || 0) + (poids.marche || 0) + (poids.assis || 0) + (poids.dort || 0) + (poids.leve || 0);
    const tot = Object.values(poids).reduce((a, b) => a + b, 0) || 1;
    const wN = Math.min(1, neutre / tot);
    const cotes = MAINS;
    for (const [h, c] of [[P.handL, 1], [P.handR, -1]]) {
      h[0] += (cotes.x * c - h[0]) * wN;
      h[1] += ((h[1] - 0.4) * 0.8 + cotes.y - h[1]) * wN;
      h[2] += (cotes.z - h[2]) * wN;
    }
    P.handL[2] *= 1 - 0.38 * (1 - wN); P.handR[2] *= 1 - 0.38 * (1 - wN);

    const wl = poids.leve || 0;
    prise = 0;
    if (wl > 0.001 && repere) {
      const D = dureeLeve, t1 = Math.min(1.0, D * 0.12), t2 = t1 + Math.min(1.1, D * 0.15);
      const t3 = D - Math.min(2.0, D * 0.25), t4 = D - Math.min(1.0, D * 0.13), t5 = D - 0.25;
      const c = repere.collier, y = repere.yeux;
      const repos = [-MAINS.x, MAINS.y, MAINS.z];

      const E = repere.epaule, R = repere.portee * 0.96;
      const aPortee = (q) => { const d = new THREE.Vector3(...q).sub(E); if (d.length() > R) d.setLength(R); return d.add(E).toArray(); };
      const col = aPortee([c.x - 0.01, c.y + 0.01, c.z + 0.03]);
      const vue = aPortee([-0.09, E.y - 0.06, 0.3]);
      let cible;
      const a = lisse(tl / t1), b = lisse((tl - t1) / (t2 - t1)), r = lisse((tl - t3) / (t4 - t3)), d = lisse((tl - t4) / (t5 - t4));
      if (tl < t1) cible = repos.map((v, i) => v + (col[i] - v) * a);
      else if (tl < t3) cible = col.map((v, i) => v + (vue[i] - v) * b + 0.006 * Math.sin(tl * 1.7 + i) * b);
      else if (tl < t4) cible = vue.map((v, i) => v + (col[i] - v) * r);
      else cible = col.map((v, i) => v + (repos[i] - v) * d);
      P.handR = P.handR.map((v, i) => v + (cible[i] - v) * wl);
      P.handL = P.handL.map((v, i) => v + ([MAINS.x, MAINS.y, MAINS.z][i] - v) * wl);

      prise = lisse((tl - t1 * 0.7) / (t1 * 0.5)) * (1 - lisse((tl - (t4 - 0.15)) / 0.4)) * Math.min(1, wl * 1.5);

      const regarde = b * (1 - r) * wl;
      P.headY += (-0.18 - P.headY) * regarde;
      P.headX += (0.22 - P.headX) * regarde;
      P.headZ += (-0.1 - P.headZ) * regarde;
      P.joie = Math.max(P.joie * (1 - wl), 0.7 * regarde);
      P.torsoX += (0.02 - P.torsoX) * wl;

      P.hipsY += (0.27 - P.hipsY) * wl;
    }
  }
  const MAINS = { x: 0.2, y: 0.36, z: 0.1 };

  const liens = [];
  let osHanches = null, hanchesRepos = new THREE.Vector3(), kHanches = 1;
  let modele = null;
  const H = { jambes, bras, antennes, graineMat, lueurGraine, lumiere, majYeux, gainLumiere: 1.0,
    dort: { teteMax: 0.2 }, os: null, modele: null, ajusterPose, yeux, povAvant: 0.05 };

  H.pret = new Promise((ok, ko) => {
    new GLTFLoader().load(FICHIER_MODELE, (gltf) => {
      try { calibrer(gltf.scene); ok(); } catch (e) { console.error(e); ko(e); }
    }, undefined, (e) => { console.error('modèle introuvable', e); ko(e); });
  });

  function pixels(tex) {
    if (!tex || !tex.image) return null;
    const im = tex.image, cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
    const px = cx.getImageData(0, 0, cv.width, cv.height).data, W = cv.width, Hh = cv.height;
    return (u, v) => {
      const x = Math.min(W - 1, Math.max(0, Math.floor((u - Math.floor(u)) * W)));
      const y = Math.min(Hh - 1, Math.max(0, Math.floor((v - Math.floor(v)) * Hh)));
      const k = (y * W + x) * 4; return [px[k] / 255, px[k + 1] / 255, px[k + 2] / 255];
    };
  }

  function feutreBrun(tex) {
    const im = tex.image; if (!im) return tex;
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height), px = d.data;
    for (let k = 0; k < px.length; k += 4) {
      const r = px[k], g = px[k + 1], b = px[k + 2], l = 0.3 * r + 0.59 * g + 0.11 * b;
      px[k] = (r + (l - r) * DESATURE) * 0.97; px[k + 1] = (g + (l - g) * DESATURE) * 0.95; px[k + 2] = (b + (l - b) * DESATURE) * 0.92;
    }
    cx.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.channel = tex.channel;
    t.anisotropy = 4; return t;
  }

  function calibrer(scene) {
    modele = scene; H.modele = scene;
    scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        const m = o.material;
        if (m && m.isMeshStandardMaterial) { m.envMapIntensity = 0.5; }
      }
    });

    const boite = boiteGardee(scene);
    const taille = boite.getSize(new THREE.Vector3());
    const k = HAUTEUR / taille.y;
    scene.scale.setScalar(k);
    const centre = boite.getCenter(new THREE.Vector3());
    scene.position.set(-centre.x * k, -boite.min.y * k, -centre.z * k);
    corps.add(scene);

    hips.position.set(0, 0.27, 0); hips.rotation.set(0, 0, 0); torse.rotation.set(0, 0, 0); torse.scale.set(1, 1, 1);
    tete.rotation.set(0, 0, 0); corps.scale.set(1, 1, 1);
    racine.updateMatrixWorld(true);

    const B = trouverOs(scene); H.os = B;
    console.log('[modele] os :', B.tous.map((o) => o.name).join(', '));
    const tmp = new THREE.Vector3(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();

    if (B.hanches) {
      osHanches = B.hanches;
      posRel(osHanches, racine, hanchesRepos);
      kHanches = hanchesRepos.y / 0.27;
    }
    for (const [i, k2] of [[0, 'G'], [1, 'D']]) {
      const c = B['cuisse' + k2];
      if (c) { posRel(c, racine, tmp); hips.worldToLocal(racine.localToWorld(tmp.clone())); jambes[i].position.x = tmp.x; }
    }
    let mainRepos = null, epauleD = new THREE.Vector3(-0.2, 0.62, 0), porteeD = 0.3;
    for (const [i, k2] of [[0, 'G'], [1, 'D']]) {
      const b1 = B['bras' + k2], b2 = B['avantbras' + k2], b3 = B['main' + k2];
      if (!(b1 && b2 && b3)) continue;
      const S = torse.worldToLocal(b1.getWorldPosition(new THREE.Vector3()));
      const E = torse.worldToLocal(b2.getWorldPosition(new THREE.Vector3()));
      const W = torse.worldToLocal(b3.getWorldPosition(new THREE.Vector3()));
      const br = bras[i];
      br.epaule.copy(S); br.a = S.distanceTo(E); br.b = E.distanceTo(W) * 1.12;
      br.main.position.y = -br.b;
      orienter(br.haut, S, E); orienter(br.bas, E, W);
      if (i === 0) mainRepos = posRel(b3, racine, new THREE.Vector3());
      if (i === 1) { epauleD = posRel(b1, racine, new THREE.Vector3()); porteeD = br.a + br.b; }
    }

    if (mainRepos) { MAINS.x = Math.abs(mainRepos.x) * 0.92; MAINS.y = mainRepos.y - 0.03; MAINS.z = mainRepos.z + 0.07; }
    racine.updateMatrixWorld(true);

    const lier = (os, proxy) => {
      if (!os || !proxy) return;
      qRel(proxy, racine, q0); qRel(os, racine, q1);
      liens.push({ os, proxy, decalage: q0.clone().invert().multiply(q1) });
    };
    lier(B.hanches, hips);
    for (const c of B.colonne) lier(c, torse);
    lier(B.epauleG, torse); lier(B.epauleD, torse);
    lier(B.cou, tete); lier(B.tete, tete);
    for (const [i, k2] of [[0, 'G'], [1, 'D']]) {
      lier(B['bras' + k2], bras[i].haut);
      lier(B['avantbras' + k2], bras[i].bas);
      lier(B['main' + k2], bras[i].bas);
      lier(B['cuisse' + k2], jambes[i]);
      lier(B['genou' + k2], jambes[i]);
      lier(B['pied' + k2], jambes[i]);
    }
    const prof = (o) => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; };
    liens.sort((a, b) => prof(a.os) - prof(b.os));

    const osTete = B.tete || B.cou;
    const yCou = B.cou ? posRel(B.cou, racine, new THREE.Vector3()).y : HAUTEUR * 0.55;
    const noirMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const sombre = [], clair = [], peints = []; let orbeZ = null, zPeints = null;
    scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const g = o.geometry, uv = g.attributes.uv, m = o.material;
      const lire = pixels(m.map);
      if (!lire || !uv) return;
      const n = g.attributes.position.count;
      const P3 = new Float32Array(n * 3), v3 = new THREE.Vector3();
      for (let i = 0; i < n; i++) { o.getVertexPosition(i, v3); v3.applyMatrix4(o.matrixWorld); racine.worldToLocal(v3); P3.set([v3.x, v3.y, v3.z], i * 3); }
      const idx = g.index ? Array.from(g.index.array) : [...Array(n).keys()];
      const normal = [], noir = [], orbe = [];

      const ouv = [];
      const lumT = new Float32Array(idx.length / 3), cen = new Float32Array(idx.length);
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        const u = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3, w = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3;
        const [r, gg, bb] = lire(u, w); lumT[t / 3] = 0.3 * r + 0.59 * gg + 0.11 * bb;
        for (let k = 0; k < 3; k++) cen[t + k] = (P3[a * 3 + k] + P3[b * 3 + k] + P3[c * 3 + k]) / 3;
        if (cen[t + 1] > yCou - 0.02 && lumT[t / 3] < SEUIL_NOIR && cen[t + 2] > -0.02) ouv.push(new THREE.Vector3(cen[t], cen[t + 1], cen[t + 2]));
      }
      const bO = new THREE.Box3().setFromPoints(ouv), cO = bO.getCenter(new THREE.Vector3()), tO = bO.getSize(new THREE.Vector3());
      const zF = ouv.length ? ouv.reduce((a2, p2) => a2 + p2.z, 0) / ouv.length : 0;
      const dansOuverture = (x, y, z) => ouv.length && ((x - cO.x) / (tO.x * 0.5 * 0.86)) ** 2 + ((y - cO.y) / (tO.y * 0.5 * 0.86)) ** 2 < 1 && z > zF - 0.08 && z < bO.max.z + 0.01;

      const bT = new THREE.Box3(); for (let t = 0; t < idx.length; t += 3) if (cen[t + 1] > yCou + 0.02) bT.expandByPoint(new THREE.Vector3(cen[t], cen[t + 1], cen[t + 2]));
      const cT = bT.getCenter(new THREE.Vector3());
      const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nt = new THREE.Vector3(), vc = new THREE.Vector3();
      let doublure = 0;
      for (let t = 0; t < idx.length; t += 3) {
        if (cen[t + 1] > yCou + 0.02) {
          const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
          e1.set(P3[b] - P3[a], P3[b + 1] - P3[a + 1], P3[b + 2] - P3[a + 2]);
          e2.set(P3[c] - P3[a], P3[c + 1] - P3[a + 1], P3[c + 2] - P3[a + 2]);
          nt.crossVectors(e1, e2);
          vc.set(cen[t] - cT.x, cen[t + 1] - cT.y, cen[t + 2] - cT.z);
          if (nt.dot(vc) < 0 && cen[t + 2] > cT.z - 0.12) { noir.push(idx[t], idx[t + 1], idx[t + 2]); doublure++; continue; }
        }

        if (lumT[t / 3] >= SEUIL_NOIR && cen[t + 1] > yCou && dansOuverture(cen[t], cen[t + 1], cen[t + 2])) {
          noir.push(idx[t], idx[t + 1], idx[t + 2]);
          if (lumT[t / 3] > 0.35) peints.push(new THREE.Vector3(cen[t], cen[t + 1], cen[t + 2]));
          continue;
        }
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        const u = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3, w = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3;
        const [r, gg, bb] = lire(u, w); const l = 0.3 * r + 0.59 * gg + 0.11 * bb;
        const cy = (P3[a * 3 + 1] + P3[b * 3 + 1] + P3[c * 3 + 1]) / 3, cz = (P3[a * 3 + 2] + P3[b * 3 + 2] + P3[c * 3 + 2]) / 3;
        const cx = (P3[a * 3] + P3[b * 3] + P3[c * 3]) / 3;
        if (cy > yCou - 0.02 && l < SEUIL_NOIR && cz > -0.02) { noir.push(a, b, c); sombre.push(new THREE.Vector3(cx, cy, cz)); continue; }
        if (cy < yCou && cy > yCou - 0.35 && cz > 0 && l > 0.62 && r > bb * 1.1) { orbe.push(a, b, c); clair.push(new THREE.Vector3(cx, cy, cz)); continue; }
        normal.push(a, b, c);
      }

      const autre = new Uint8Array(n);
      for (const i of normal) autre[i] = 1; for (const i of noir) autre[i] = 1;
      const bordOrbe = orbe.filter((i) => autre[i]);
      const zSurf = bordOrbe.length ? bordOrbe.reduce((a2, i) => a2 + P3[i * 3 + 2], 0) / bordOrbe.length : null;

      const pos = g.attributes.position;
      const J = (() => {
        const i0 = orbe.length ? orbe[0] : 0, b0 = new THREE.Vector3(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
        const w0 = new THREE.Vector3(), w1 = new THREE.Vector3(), cols = [];
        o.getVertexPosition(i0, w0); w0.applyMatrix4(o.matrixWorld); racine.worldToLocal(w0);
        for (const ax of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
          pos.setXYZ(i0, b0.x + ax[0] * 0.01, b0.y + ax[1] * 0.01, b0.z + ax[2] * 0.01);
          o.getVertexPosition(i0, w1); w1.applyMatrix4(o.matrixWorld); racine.worldToLocal(w1);
          cols.push(w1.sub(w0).divideScalar(0.01).clone());
        }
        pos.setXYZ(i0, b0.x, b0.y, b0.z);
        return new THREE.Matrix3().set(cols[0].x, cols[1].x, cols[2].x, cols[0].y, cols[1].y, cols[2].y, cols[0].z, cols[1].z, cols[2].z).invert();
      })();
      const dl = new THREE.Vector3();
      if (zSurf !== null) {
        const fait = new Set();
        for (const i of orbe) {
          if (autre[i] || fait.has(i)) continue; fait.add(i);
          const z = P3[i * 3 + 2]; if (z <= zSurf) continue;
          const dz = (z - zSurf) * 0.85;

          dl.set(0, 0, -dz).applyMatrix3(J);
          pos.setXYZ(i, pos.getX(i) + dl.x, pos.getY(i) + dl.y, pos.getZ(i) + dl.z);
        }
        pos.needsUpdate = true; g.computeVertexNormals();
      }
      orbeZ = zSurf;
      zPeints = peints.length ? Math.max(...peints.map((p) => p.z)) : null;
      const tous = normal.concat(noir, orbe);
      g.setIndex(tous); g.clearGroups();
      g.addGroup(0, normal.length, 0); g.addGroup(normal.length, noir.length, 1); g.addGroup(normal.length + noir.length, orbe.length, 2);
      const feutre = m.clone(); feutre.map = null; feutre.emissiveMap = null; feutre.emissive = new THREE.Color(0, 0, 0);
      feutre.color = new THREE.Color(COULEUR_FEUTRE);
      m.emissive = new THREE.Color(0, 0, 0); m.emissiveMap = null;
      m.color.multiply(new THREE.Color(TEINTE));
      if (m.map) m.map = feutreBrun(m.map);
      o.material = [m, noirMat, feutre];
      console.log('[modele] triangles noirs du capuchon :', noir.length / 3, ' dont doublure', doublure, ' boule moulée :', orbe.length / 3);
    });

    const bS = new THREE.Box3().setFromPoints(sombre.length ? sombre : [new THREE.Vector3(0, HAUTEUR * 0.75, 0.15)]);
    const cS = bS.getCenter(new THREE.Vector3()), tS = bS.getSize(new THREE.Vector3());

    const centraux = sombre.filter((p) => Math.abs(p.x - cS.x) < tS.x * 0.25 && Math.abs(p.y - cS.y) < tS.y * 0.25);
    const zFond = centraux.length ? centraux.reduce((a, p) => a + p.z, 0) / centraux.length : cS.z;
    const zBord = bS.max.z;
    let yYeux = cS.y + tS.y * 0.06, ecartY = tS.x * 0.21;
    const pg = peints.filter((p) => p.x > cS.x), pd = peints.filter((p) => p.x <= cS.x);
    if (pg.length > 3 && pd.length > 3) {
      const mg = pg.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pg.length);
      const md = pd.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pd.length);
      yYeux = (mg.y + md.y) / 2; ecartY = Math.abs(mg.x - md.x) / 2;
      console.log('[modele] yeux peints', mg.toArray().map((x) => x.toFixed(3)), md.toArray().map((x) => x.toFixed(3)));
    }

    const zY = zPeints !== null ? zPeints + 0.006 : zFond + 0.012;
    const pY = new THREE.Vector3(cS.x, yYeux, zY);
    tailleYeux(Math.max(0.018, tS.x * 0.075), ecartY);
    yeux.position.copy(pY);
    console.log('[modele] ouverture', cS.toArray().map((x) => x.toFixed(3)), tS.toArray().map((x) => x.toFixed(3)), 'fond', zFond.toFixed(3), 'bord', zBord.toFixed(3));
    racine.add(yeux); racine.updateMatrixWorld(true);
    if (osTete) osTete.attach(yeux);
    yeux.visible = new URLSearchParams(location.search).get('yeux') !== '0';

    const pC = clair.length ? clair.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(clair.length)
      : new THREE.Vector3(0, yCou - 0.14, 0.16);
    if (orbeZ !== null) pC.z = orbeZ + 0.052;
    const pN = new THREE.Vector3(pC.x, Math.min(yCou + 0.01, pC.y + 0.11), pC.z - 0.02);
    L = pN.distanceTo(pC);
    console.log('[modele] collier', pC.toArray().map((x) => x.toFixed(3)), 'nœud', pN.toArray().map((x) => x.toFixed(3)));
    const osTorse = B.colonne.length ? B.colonne[B.colonne.length - 1] : B.hanches;
    ancre.position.copy(pC); noeud.position.copy(pN);
    racine.add(ancre); racine.add(noeud); racine.updateMatrixWorld(true);
    if (osTorse) { osTorse.attach(ancre); osTorse.attach(noeud); }
    H.povAvant = Math.max(0.03, zBord - zY) + 0.035;
    repere = { yeux: new THREE.Vector3(cS.x, yYeux, zBord), collier: pC.clone(), epaule: epauleD, portee: porteeD };
    cordon.visible = true;
  }

  function boiteGardee(scene) {
    scene.updateMatrixWorld(true);
    const b = new THREE.Box3(), v = new THREE.Vector3();
    scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const idx = o.geometry.index ? o.geometry.index.array : null, n = idx ? idx.length : o.geometry.attributes.position.count;
      for (let t = 0; t < n; t++) { o.getVertexPosition(idx ? idx[t] : t, v); v.applyMatrix4(o.matrixWorld); b.expandByPoint(v); }
    });
    return b;
  }

  const qR = new THREE.Quaternion(), qP = new THREE.Quaternion(), qC = new THREE.Quaternion(), v = new THREE.Vector3();
  const pA = new THREE.Vector3(), pNo = new THREE.Vector3(), pB = new THREE.Vector3(), pM = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function maj(dt, P, t, ctx, poids) {
    if (!liens.length) return;
    if (ctx && ctx.dureeAction) dureeLeve = ctx.dureeAction;
    racine.updateMatrixWorld(true);
    racine.getWorldQuaternion(qR);
    for (const l of liens) {
      qRel(l.proxy, racine, qC).multiply(l.decalage);
      l.os.parent.getWorldQuaternion(qP);
      l.os.quaternion.copy(qP.invert().multiply(qR).multiply(qC));
      if (l.os === osHanches) {
        v.set(hanchesRepos.x, hanchesRepos.y + (P.hipsY - 0.27) * kHanches, hanchesRepos.z + P.hipsZ * kHanches);
        racine.localToWorld(v); l.os.parent.worldToLocal(v);
        l.os.position.copy(v);
      }
      l.os.updateMatrixWorld(true);
    }

    noeud.getWorldPosition(pNo); racine.worldToLocal(pNo);
    ancre.getWorldPosition(pA); racine.worldToLocal(pA);
    const h = Math.min(dt, 1 / 30) || 0.016;
    if (premierPend) { prevAncre.copy(pNo); premierPend = false; }
    const vel = pNo.clone().sub(prevAncre).divideScalar(Math.max(dt, 1e-3)); prevAncre.copy(pNo);
    const acc = vel.clone().sub(velAncre).divideScalar(Math.max(dt, 1e-3)); velAncre.copy(vel);
    if (acc.length() > 30) acc.setLength(30);

    const repos = Math.atan2(pA.z - pNo.z, pNo.y - pA.y);
    pend.vx += (-60 * (pend.ax - repos) - 5 * pend.vx - acc.z * 6) * h;
    pend.vz += (-60 * pend.az - 5 * pend.vz + acc.x * 6) * h;
    pend.ax += pend.vx * h; pend.az += pend.vz * h;
    pend.ax = Math.max(repos - 0.05, Math.min(repos + 0.6, pend.ax)); pend.az = Math.max(-0.5, Math.min(0.5, pend.az));
    pB.set(Math.sin(pend.az) * L, -Math.cos(pend.ax) * Math.cos(pend.az) * L, Math.sin(pend.ax) * L).add(pNo);

    bras[1].main.getWorldPosition(pM); racine.worldToLocal(pM);
    pM.y += 0.078; pM.z += 0.012;
    const k = prise;
    graine.position.lerpVectors(pB, pM, lisse(k));

    const vis = 1 - lisse(Math.min(1, k * 3));
    cordon.visible = vis > 0.05;
    if (cordon.visible) {
      const d = graine.position.clone().sub(pNo); const len = d.length();
      cordon.position.copy(pNo).addScaledVector(d, 0.5);
      cordon.quaternion.setFromUnitVectors(up, d.normalize());
      cordon.scale.set(1, Math.max(0.001, len - 0.045), 1);
    }
  }
  H.maj = maj; H.cordon = cordon;
  return H;
}

const SEUIL_NOIR = 0.1;
const TEINTE = 0xe2d4c8;
const DESATURE = 0.3;
const COULEUR_FEUTRE = 0x6b4a2e;
