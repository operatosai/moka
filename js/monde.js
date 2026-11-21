
import * as THREE from 'three';
import { texLueur } from './moka3d.js';

function alea(graine) {
  let s = graine >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export function creerRelief(monde, R) {
  const r = alea(1234);
  const ondes = [];
  for (let i = 0; i < 26; i++) {
    const d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
    const f = 1 + r() * (i < 8 ? 2.5 : 9);
    ondes.push({ d, f, ph: r() * 6.28, a: (i < 8 ? 0.045 : 0.007) * (0.6 + r() * 0.6) });
  }
  const crateres = monde.crateres.map(c => ({ d: V(c.dir), r: c.r, p: c.p }));
  const ch = monde.choses;
  const butte = V(ch.little_hill.dir);
  const terre = ch.soft_soil ? V(ch.soft_soil.dir) : null;
  function h(dir) {
    let y = 0;
    for (const o of ondes) y += Math.sin(o.f * dir.dot(o.d) * 3 + o.ph) * o.a;
    for (const c of crateres) {
      const a = Math.acos(Math.min(1, Math.max(-1, dir.dot(c.d))));
      const t = a / c.r;
      if (t < 1.6) {
        y -= c.p * Math.max(0, 1 - t * t) * 1.0;
        y += c.p * 0.38 * Math.exp(-(((t - 1.0) / 0.22) ** 2));
      }
    }
    const ab = Math.acos(Math.min(1, dir.dot(butte)));
    y += 0.75 * Math.exp(-((ab / 0.15) ** 2));
    const at = terre ? Math.acos(Math.min(1, dir.dot(terre))) : 9;
    if (at < 0.08) y = y * (at / 0.08) + 0.02 * (1 - at / 0.08) + y * 0;
    return y;
  }
  return { h, crateres, terre, butte, rayon: R };
}

function fusionner(geo) {
  const p = geo.attributes.position;
  const carte = new Map(), idx = [], pos = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    let j = carte.get(k);
    if (j === undefined) { j = pos.length / 3; carte.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function texPoussiere() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  const r = alea(77);
  for (let i = 0; i < 9000; i++) {
    const v = 128 + (r() - 0.5) * 110;
    g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},${0.25 + r() * 0.4})`;
    const s = r() < 0.92 ? 1 + r() * 1.5 : 2 + r() * 3;
    const x = r() * 256, y = r() * 256;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      if (x + ox < -8 || x + ox > 264 || y + oy < -8 || y + oy > 264) continue;
      g.beginPath(); g.arc(x + ox, y + oy, s, 0, 6.3); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function geoRocher(graine, aplati = 0.65) {
  const r = alea(graine);
  const g = fusionner(new THREE.IcosahedronGeometry(1, 3));
  const p = g.attributes.position, v = new THREE.Vector3();
  const bosses = [];
  for (let i = 0; i < 6; i++) bosses.push({ d: new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize(), a: (r() - 0.4) * 0.35 });
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let k = 1;
    for (const b of bosses) k += b.a * Math.max(0, v.dot(b.d)) ** 2;
    v.multiplyScalar(k); v.y *= aplati;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function creerMonde(scene, etat, qualite) {
  const R = etat.rayon;

  const ABSENTS = ['pebble_stack', 'blue_crystal', 'soft_soil', 'metal_piece'].filter(id => !etat.monde.choses[id]);
  const relief = creerRelief(etat.monde, R);
  const monde = { ...etat.monde, choses: { ...etat.monde.choses } };
  for (const id of ABSENTS) monde.choses[id] = { id, dir: [0, -1, 0], rayon: 0.1, hauteur: 0, porte: false };
  const groupe = new THREE.Group(); groupe.name = 'asteroide'; scene.add(groupe);

  const surface = (dir, decal = 0) => dir.clone().normalize().multiplyScalar(R + relief.h(dir.clone().normalize()) + decal);
  const orienterSur = (obj, dir, decal = 0, tourne = 0) => {
    const d = dir.clone().normalize();
    obj.position.copy(surface(d, decal));
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    if (tourne) obj.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tourne));
  };

  const geo = fusionner(new THREE.IcosahedronGeometry(1, qualite.detailSol));
  const p = geo.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const d = new THREE.Vector3(), c = new THREE.Color();
  const rr = alea(99);
  const base = new THREE.Color(0x4f5767), sombre = new THREE.Color(0x2c323e), clair = new THREE.Color(0x737b8a);
  const terreC = new THREE.Color(0x4a3a2c);
  const TACHE1 = new THREE.Vector3(0.3, 0.8, -0.5).normalize(), TACHE2 = new THREE.Vector3(-0.7, 0.1, 0.7).normalize();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    const h = relief.h(d);
    p.setXYZ(i, d.x * (R + h), d.y * (R + h), d.z * (R + h));
    c.copy(base);
    if (h < -0.08) c.lerp(sombre, Math.min(1, (-h - 0.08) * 2.2));
    if (h > 0.08) c.lerp(clair, Math.min(0.6, (h - 0.08) * 1.5));
    const n = 0.6 * Math.sin(d.dot(TACHE1) * 5.3 + 1.1) * Math.sin(d.dot(TACHE2) * 3.7) + (rr() - 0.5) * 0.3;
    c.offsetHSL(0, 0, n * 0.05);
    const at = relief.terre ? Math.acos(Math.min(1, d.dot(relief.terre))) : 9;
    if (at < 0.075) c.lerp(terreC, Math.min(1, (0.075 - at) / 0.025));
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();

  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    uv[i * 2] = Math.atan2(d.x, d.z) / (2 * Math.PI) + 0.5; uv[i * 2 + 1] = Math.acos(d.y) / Math.PI;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const pous = texPoussiere(); pous.repeat.set(90, 45);
  const sol = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0,
    bumpMap: pous, bumpScale: 0.35 }));
  sol.receiveShadow = true;
  groupe.add(sol);

  const pierre = new THREE.MeshStandardMaterial({ color: 0x5f6776, roughness: 0.88, bumpMap: pous, bumpScale: 0.6 });
  for (const ro of monde.rochers) {
    const m = new THREE.Mesh(geoRocher(ro.graine), pierre);
    m.scale.setScalar(ro.taille);
    orienterSur(m, V(ro.dir), -ro.taille * 0.18, ro.graine % 6);
    m.castShadow = ro.taille > 0.2; m.receiveShadow = true;
    groupe.add(m);
  }
  {
    const n = qualite.galets;
    const im = new THREE.InstancedMesh(geoRocher(5, 0.55), pierre, n);
    const r = alea(4242), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3();
    const proches = Object.values(monde.choses).map(c => V(c.dir));
    let k = 0;
    while (k < n) {
      const dd = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      if (proches.some(x => x.angleTo(dd) * R < 0.6)) continue;
      const s = 0.03 + r() * r() * 0.09;
      const o = new THREE.Object3D(); orienterSur(o, dd, -s * 0.2, r() * 6);
      S.set(s, s, s); Q.copy(o.quaternion);
      M.compose(o.position, Q, S); im.setMatrixAt(k, M); k++;
    }
    im.receiveShadow = true;
    groupe.add(im);
  }

  const choses = {};
  const lueur = texLueur();

  const tas = new THREE.Group(); orienterSur(tas, V(monde.choses.pebble_stack.dir), -0.02); groupe.add(tas);
  const caillouxTas = [];
  const pierreTas = new THREE.MeshStandardMaterial({ color: 0x8e95a2, roughness: 0.8 });
  for (let i = 0; i < 9; i++) {
    const s = 0.15 - i * 0.011;
    const m = new THREE.Mesh(geoRocher(300 + i, 0.48), pierreTas);
    m.scale.setScalar(s); m.castShadow = m.receiveShadow = true; m.visible = false;
    tas.add(m); caillouxTas.push({ m, s, apparu: 0 });
  }

  const r2 = alea(31);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(geoRocher(400 + i, 0.5), pierreTas);
    const a = r2() * 6.28, dd = 0.35 + r2() * 0.35;
    m.position.set(Math.cos(a) * dd, 0.01, Math.sin(a) * dd); m.scale.setScalar(0.05 + r2() * 0.04);
    m.rotation.y = r2() * 6; m.castShadow = true; m.receiveShadow = true; tas.add(m);
  }
  let hauteurAffichee = -1;
  choses.pebble_stack = {
    groupe: tas,
    maj(et, dt, t) {
      const n = et.monde.choses.pebble_stack.hauteur || 0;
      let y = 0;
      caillouxTas.forEach((c, i) => {
        const vis = i < n;
        c.apparu += ((vis ? 1 : 0) - c.apparu) * (1 - Math.exp(-7 * dt));
        c.m.visible = c.apparu > 0.02;
        const pop = c.apparu < 0.999 ? 1 + 0.25 * Math.sin(c.apparu * Math.PI) : 1;
        c.m.scale.set(c.s * pop, c.s * c.apparu, c.s * pop);
        c.m.position.set(Math.sin(i * 2.1) * 0.012, y + c.s * 0.24, Math.cos(i * 1.7) * 0.012);
        c.m.rotation.y = i * 1.3;
        if (vis) y += c.s * 0.46;
      });
      if (hauteurAffichee > n + 1) {
        tas.userData.secousse = 0.6;
      }
      hauteurAffichee = n;
      if (tas.userData.secousse > 0) { tas.userData.secousse -= dt; tas.rotation.z = Math.sin(t * 40) * 0.04 * tas.userData.secousse; }
      return y;
    },
  };

  const cristal = new THREE.Group(); orienterSur(cristal, V(monde.choses.blue_crystal.dir), -0.05); groupe.add(cristal);
  const cMat = new THREE.MeshStandardMaterial({ color: 0x7fdcff, emissive: 0x1f7bff, emissiveIntensity: 0.9, roughness: 0.15,
    metalness: 0.1, transparent: true, opacity: 0.9 });
  [[0, 0.9, 0.11, 0, 0], [0.13, 0.55, 0.08, 0.35, 0.6], [-0.12, 0.6, 0.085, -0.3, 2.2], [0.04, 0.42, 0.07, 0.15, 4], [-0.05, 0.35, 0.06, -0.5, 5]]
    .forEach(([x, h, rr_, tilt, rot]) => {
      const g = new THREE.Group();
      const corpsC = new THREE.Mesh(new THREE.CylinderGeometry(rr_, rr_ * 1.05, h * 0.75, 6), cMat);
      corpsC.position.y = h * 0.375;
      const pointe = new THREE.Mesh(new THREE.ConeGeometry(rr_, h * 0.25, 6), cMat); pointe.position.y = h * 0.75 + h * 0.125;
      g.add(corpsC, pointe); g.position.set(x, 0, Math.sin(rot) * 0.06); g.rotation.set(0, rot, tilt);
      corpsC.castShadow = pointe.castShadow = true;
      cristal.add(g);
    });
  const cLum = new THREE.PointLight(0x55b8ff, 1.6, 5, 1.8); cLum.position.y = 0.6; cristal.add(cLum);
  const cLueur = new THREE.Sprite(new THREE.SpriteMaterial({ map: lueur, color: 0x4aa8ff, transparent: true, opacity: 0.45,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  cLueur.scale.setScalar(1.9); cLueur.position.y = 0.5; cristal.add(cLueur);
  choses.blue_crystal = {
    groupe: cristal,
    maj(et, dt, t, nuit) {
      const k = 0.8 + 0.2 * Math.sin(t * 0.9);
      cMat.emissiveIntensity = (0.6 + 0.8 * nuit) * k;
      cLum.intensity = (0.6 + 1.6 * nuit) * k;
      cLueur.material.opacity = (0.15 + 0.4 * nuit) * k;
    },
  };

  const terre = new THREE.Group(); orienterSur(terre, V(monde.choses.soft_soil.dir), 0); groupe.add(terre);
  const motteMat = new THREE.MeshStandardMaterial({ color: 0x3e2f24, roughness: 1 });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * 6.28 + Math.sin(i) * 0.2, dd = 0.62 + Math.sin(i * 3.1) * 0.06;
    const m = new THREE.Mesh(geoRocher(500 + i, 0.5), motteMat);
    m.position.set(Math.cos(a) * dd, 0.0, Math.sin(a) * dd); m.scale.setScalar(0.04 + (i % 3) * 0.012);
    m.receiveShadow = true; terre.add(m);
  }
  const pousse = new THREE.Group(); terre.add(pousse);
  const tigeMat = new THREE.MeshStandardMaterial({ color: 0x9ccf6a, emissive: 0x6fbf3a, emissiveIntensity: 0.6, roughness: 0.6 });
  const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.4, 8), tigeMat); tige.position.y = 0.2; pousse.add(tige);
  for (const s of [1, -1]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), tigeMat);
    f.scale.set(1, 0.18, 0.5); f.position.set(0.07 * s, 0.3 - (s > 0 ? 0.06 : 0), 0); f.rotation.z = 0.5 * s; pousse.add(f);
  }
  const bourgeon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xfff0b8, emissive: 0xffb347, emissiveIntensity: 2.4 }));
  bourgeon.position.y = 0.42; pousse.add(bourgeon);
  const pLum = new THREE.PointLight(0xffb060, 0, 3.5, 1.8); pLum.position.y = 0.4; pousse.add(pLum);
  const pLueur = new THREE.Sprite(new THREE.SpriteMaterial({ map: lueur, color: 0xffb060, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  pLueur.position.y = 0.42; pousse.add(pLueur);
  const graineSol = new THREE.Sprite(pLueur.material.clone()); graineSol.position.y = 0.03; graineSol.scale.setScalar(0.35); terre.add(graineSol);
  choses.soft_soil = {
    groupe: terre,
    maj(et, dt, t) {
      const s = et.monde.choses.soft_soil;
      const k = s.graine_plantee ? Math.max(0.02, s.pousse || 0) : 0;
      pousse.visible = k > 0.08;
      pousse.scale.setScalar(Math.max(0.001, k));
      graineSol.visible = !!s.graine_plantee;
      graineSol.material.opacity = 0.5 + 0.2 * Math.sin(t * 1.5);
      pLum.intensity = s.graine_plantee ? 0.4 + 1.6 * k : 0;
      pLueur.scale.setScalar(0.5 + 0.3 * Math.sin(t * 2));
    },
  };

  choses.big_crater = { groupe: new THREE.Group(), maj() {} };

  const grand = new THREE.Mesh(geoRocher(888, 1.0), pierre);
  grand.scale.set(0.75, 1.5, 0.6); orienterSur(grand, V(monde.choses.tall_rock.dir), 0.6, 0.4);
  grand.castShadow = grand.receiveShadow = true; groupe.add(grand);
  choses.tall_rock = { groupe: grand, maj() {} };

  const piece = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xa9a196, metalness: 0.85, roughness: 0.38 });
  const plaque = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 18, 1, true, 0, 1.8), metal);
  plaque.material.side = THREE.DoubleSide; plaque.rotation.z = Math.PI / 2; plaque.position.y = -0.12;
  const boulons = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6b645b, metalness: 0.9, roughness: 0.4 }));
    b.position.set(-0.06 + (i % 2) * 0.12, 0.075, -0.05 + Math.floor(i / 2) * 0.1); boulons.add(b);
  }
  const tigeM = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 6), metal); tigeM.position.set(0.05, 0.12, 0); tigeM.rotation.z = -0.5;
  const voyant = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
  voyant.position.set(0.085, 0.18, 0);
  piece.add(plaque, boulons, tigeM, voyant);
  piece.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const pieceSol = new THREE.Group(); groupe.add(pieceSol); pieceSol.add(piece);
  choses.metal_piece = {
    groupe: pieceSol, piece,
    maj(et, dt, t) {
      const mp = et.monde.choses.metal_piece;
      voyant.material.color.setHSL(0.02, 1, 0.35 + 0.25 * (Math.sin(t * 2.5) > 0.6 ? 1 : 0));
      if (!mp.porte) orienterSur(pieceSol, V(mp.dir), 0.02, 0.8);
    },
  };

  choses.little_hill = { groupe: new THREE.Group(), maj() {} };

  const trouMat = new THREE.MeshBasicMaterial({ color: 0x15181d, transparent: true, opacity: 0.85, depthWrite: false });
  const trous = [];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    const disque = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), trouMat); disque.rotation.x = -Math.PI / 2; disque.position.y = 0.012;
    g.add(disque);
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(geoRocher(700 + k, 0.4), new THREE.MeshStandardMaterial({ color: 0x7a8190, roughness: 1 }));
      const a = k * 1.25; m.position.set(Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13); m.scale.setScalar(0.035); g.add(m);
    }
    g.visible = false; groupe.add(g); trous.push(g);
  }
  function majTrous(liste) {
    trous.forEach((g, i) => {
      const t = liste[i];
      g.visible = !!t;
      if (t) orienterSur(g, V(t), 0);
    });
  }

  for (const id of ABSENTS) {
    choses[id].groupe.visible = false;
    choses[id].maj = () => 0;
    choses[id].absent = true;
  }

  const matCr = {
    pebble: new THREE.MeshStandardMaterial({ color: 0x8e95a2, roughness: 0.82 }),
    flat_stone: new THREE.MeshStandardMaterial({ color: 0xa39a88, roughness: 0.9 }),
    crystal_shard: new THREE.MeshStandardMaterial({ color: 0x8fe2ff, emissive: 0x1f7bff, emissiveIntensity: 0.8, roughness: 0.15, metalness: 0.1 }),
    old_metal_piece: new THREE.MeshStandardMaterial({ color: 0xa9a196, metalness: 0.85, roughness: 0.38 }),
    trace: new THREE.MeshStandardMaterial({ color: 0x2a2a33, roughness: 1 }),
    terre: new THREE.MeshStandardMaterial({ color: 0x3e2f24, roughness: 1 }),
    tige: new THREE.MeshStandardMaterial({ color: 0x9ccf6a, emissive: 0x4f9f2a, emissiveIntensity: 0.45, roughness: 0.6 }),
  };
  function pierreCr(type, graine, taille) {
    let m;
    if (type === 'crystal_shard') { m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), matCr.crystal_shard); m.scale.set(taille * 0.45, taille * 0.9, taille * 0.45); }
    else if (type === 'old_metal_piece') { m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 0.6), matCr.old_metal_piece); m.scale.setScalar(taille * 1.1); }
    else if (type === 'flat_stone') { m = new THREE.Mesh(geoRocher(900 + graine, 0.32), matCr.flat_stone); m.scale.set(taille * 1.25, taille, taille * 1.05); }
    else { m = new THREE.Mesh(geoRocher(800 + graine, 0.6), matCr.pebble); m.scale.setScalar(taille); }
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  function chemin(motif) {
    const P = [];
    if (motif === 'spiral') for (let i = 0; i <= 120; i++) { const a = i / 120 * Math.PI * 6, r = 0.03 + 0.25 * i / 120; P.push([Math.cos(a) * r, Math.sin(a) * r]); }
    else if (motif === 'star') for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.12 : 0.3; P.push([Math.cos(a) * r, Math.sin(a) * r]); }
    else if (motif === 'circle') for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; P.push([Math.cos(a) * 0.26, Math.sin(a) * 0.26]); }
    else if (motif === 'wave') for (let i = 0; i <= 80; i++) { const x = -0.32 + 0.64 * i / 80; P.push([x, Math.sin(x * 22) * 0.07]); }
    else if (motif === 'arrow') { P.push([-0.3, 0], [0.3, 0], null, [0.14, -0.13], [0.3, 0], [0.14, 0.13]); }
    else if (motif === 'eye') {
      for (let i = 0; i <= 40; i++) { const x = -0.32 + 0.64 * i / 40; P.push([x, 0.15 * Math.sin(Math.PI * i / 40)]); }
      P.push(null);
      for (let i = 0; i <= 40; i++) { const x = -0.32 + 0.64 * i / 40; P.push([x, -0.15 * Math.sin(Math.PI * i / 40)]); }
      P.push(null);
      for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI * 2; P.push([Math.cos(a) * 0.065, Math.sin(a) * 0.065]); }
    }
    return P;
  }
  function trace(motif) {
    const g = new THREE.Group();
    let seg = [];
    const fin = () => {
      if (seg.length > 1) {
        const courbe = new THREE.CatmullRomCurve3(seg.map(([x, z]) => new THREE.Vector3(x, 0.004, z)), false, 'catmullrom', motif === 'star' || motif === 'arrow' ? 0 : 0.5);
        const m = new THREE.Mesh(new THREE.TubeGeometry(courbe, Math.max(8, seg.length * 3), 0.011, 5, false), matCr.trace);
        m.scale.y = 0.35; m.receiveShadow = true; g.add(m);
      }
      seg = [];
    };
    for (const p of chemin(motif)) { if (p) seg.push(p); else fin(); }
    fin();
    return g;
  }
  function construireCreation(c) {
    const g = new THREE.Group(); g.name = c.id;
    const objs = c.objets || [], gr = c.graine_deco || 1;
    const r = alea(gr);
    if (c.forme === 'pile') {
      let y = 0;
      objs.forEach((o, i) => { const s = Math.max(0.045, 0.1 - i * 0.006); const m = pierreCr(o, gr + i, s); m.position.set((r() - 0.5) * 0.02, y + s * 0.4, (r() - 0.5) * 0.02); m.rotation.y = r() * 6; g.add(m); y += s * (o === 'flat_stone' ? 0.55 : 0.75); });
    } else if (c.forme === 'circle') {
      const R = 0.16 + 0.03 * objs.length;
      objs.forEach((o, i) => { const a = i / objs.length * Math.PI * 2; const m = pierreCr(o, gr + i, 0.06); m.position.set(Math.cos(a) * R, 0.02, Math.sin(a) * R); m.rotation.y = r() * 6; g.add(m); });
    } else if (c.forme === 'line') {
      objs.forEach((o, i) => { const m = pierreCr(o, gr + i, 0.06); m.position.set((i - (objs.length - 1) / 2) * 0.14, 0.02, (r() - 0.5) * 0.03); m.rotation.y = r() * 6; g.add(m); });
    } else if (c.forme === 'shelter') {
      const plats = objs.filter((o) => o === 'flat_stone'), autres = objs.filter((o) => o !== 'flat_stone');
      plats.forEach((o, i) => {
        const m = pierreCr(o, gr + i, 0.11);
        if (i < 2) { m.position.set(i ? 0.075 : -0.075, 0.075, 0); m.rotation.set(0, 0, i ? 0.55 : -0.55); m.scale.set(0.11, 0.035, 0.12); }
        else if (i === 2) { m.position.set(0, 0.16, 0); m.scale.set(0.15, 0.03, 0.14); }
        else { const a = r() * 6; m.position.set(Math.cos(a) * 0.22, 0.02, Math.sin(a) * 0.22); }
        g.add(m);
      });
      autres.forEach((o, i) => { const m = pierreCr(o, gr + 50 + i, 0.045); const a = i * 1.7 + 0.8; m.position.set(Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2); g.add(m); });
    } else if (c.forme === 'marker') {
      const o = objs[0] || 'flat_stone';
      const m = pierreCr(o, gr, 0.1);
      if (o === 'old_metal_piece') { m.rotation.set(Math.PI / 2, 0, 0.1); m.position.y = 0.06; g.add(m); }
      else { const dr = new THREE.Mesh(geoRocher(950 + gr, 1.0), matCr.flat_stone); dr.castShadow = dr.receiveShadow = true;
             dr.scale.set(0.075, 0.25, 0.04); dr.position.y = 0.19; dr.rotation.z = 0.06; g.add(dr); }
      objs.slice(1).forEach((x, i) => { const p = pierreCr(x, gr + 10 + i, 0.045); const a = i * 2.2; p.position.set(Math.cos(a) * 0.12, 0.02, Math.sin(a) * 0.12); g.add(p); });
    } else if (c.forme === 'drawing') {
      g.add(trace(c.motif));
    } else if (c.forme === 'garden') {
      const motte = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10), matCr.terre); motte.scale.y = 0.28; motte.receiveShadow = true; g.add(motte);
      const pousse = new THREE.Group(); g.add(pousse); g.userData.pousse = pousse;
      const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.3, 6), matCr.tige); tige.position.y = 0.15; pousse.add(tige);
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 6), matCr.tige); f.scale.set(1, 0.18, 0.5);
        const a = i * 2.4; f.position.set(Math.cos(a) * 0.04, 0.12 + i * 0.05, Math.sin(a) * 0.04); f.rotation.y = -a; f.rotation.z = 0.5; pousse.add(f);
      }
    }

    const d = new THREE.Vector3(...c.dir).normalize();
    const Z = new THREE.Vector3(...(c.cap || [0, 0, 1])); Z.addScaledVector(d, -Z.dot(d));
    if (Z.lengthSq() < 1e-8) Z.set(1, 0, 0).addScaledVector(d, -d.x);
    Z.normalize(); const X = new THREE.Vector3().crossVectors(d, Z).normalize();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, d, Z));
    g.position.copy(surface(d, -0.005));

    const h0 = relief.h(d), q = g.quaternion, centre = g.position.clone();
    const hauteurIci = (loc) => relief.h(centre.clone().add(loc.clone().applyQuaternion(q)).normalize()) - h0;
    g.traverse((o) => {
      if (!o.isMesh || o === g) return;
      if (c.forme === 'drawing') {
        const pa = o.geometry.attributes.position, v = new THREE.Vector3();
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const y0 = v.y; v.y = 0; pa.setY(i, y0 + hauteurIci(v) / o.scale.y); }
        pa.needsUpdate = true; o.geometry.computeVertexNormals();
      } else if (o.parent === g) {
        o.position.y += hauteurIci(new THREE.Vector3(o.position.x, 0, o.position.z));
      }
    });
    g.userData.cle = c.forme + '|' + (c.objets || []).join(',') + '|' + (c.motif || '');
    g.userData.apparu = 0;
    return g;
  }
  const crGroupe = new THREE.Group(); groupe.add(crGroupe);
  const crMeshes = new Map();
  function majCreations(liste, dt) {
    const vus = new Set();
    for (const c of liste || []) {
      vus.add(c.id);
      let g = crMeshes.get(c.id);
      const cle = c.forme + '|' + (c.objets || []).join(',') + '|' + (c.motif || '');
      if (g && g.userData.cle !== cle) { const a = g.userData.apparu; crGroupe.remove(g); g = construireCreation(c); g.userData.apparu = a; crGroupe.add(g); crMeshes.set(c.id, g); }
      if (!g) { g = construireCreation(c); crGroupe.add(g); crMeshes.set(c.id, g); }
      g.userData.apparu += (1 - g.userData.apparu) * (1 - Math.exp(-2.5 * dt));
      const a = g.userData.apparu; g.scale.setScalar(a < 0.999 ? a * (1 + 0.15 * Math.sin(a * Math.PI)) : 1);
      if (g.userData.pousse) { const k = Math.max(0.001, c.croissance || 0); g.userData.pousse.scale.setScalar(0.15 + 0.85 * k); g.userData.pousse.visible = k > 0.08; }
      g.userData.nom = c.nom;
    }
    for (const [id, g] of crMeshes) if (!vus.has(id)) { crGroupe.remove(g); crMeshes.delete(id); }
    return crMeshes;
  }

  return { groupe, relief, surface, orienterSur, choses, majTrous, majCreations };
}

export function creerCiel(scene, qualite) {
  const ciel = new THREE.Group(); scene.add(ciel);
  const n = qualite.etoiles;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), tai = new Float32Array(n), ph = new Float32Array(n);
  const r = alea(2026);
  const bande = new THREE.Vector3(0.3, 1, 0.5).normalize();
  for (let i = 0; i < n; i++) {
    let d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
    if (i < n * 0.45) {
      d.addScaledVector(bande, -d.dot(bande) * (0.85 + r() * 0.15)).normalize();
    }
    d.multiplyScalar(420);
    pos.set([d.x, d.y, d.z], i * 3);
    const t = r();
    const c = new THREE.Color().setHSL(t < 0.2 ? 0.08 : t < 0.5 ? 0.6 : 0.62, t < 0.2 ? 0.6 : 0.3, 0.75 + r() * 0.25);
    col.set([c.r, c.g, c.b], i * 3);
    tai[i] = r() < 0.03 ? 3.2 + r() * 2.5 : 0.9 + r() * r() * 2.4;
    ph[i] = r() * 6.28;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('taille', new THREE.BufferAttribute(tai, 1));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTemps: { value: 0 }, uPix: { value: 1 } },
    vertexShader: `attribute float taille; attribute float phase; varying vec3 vCol; varying float vA; uniform float uTemps; uniform float uPix;
      void main(){ vCol = color; vA = 0.75 + 0.25*sin(uTemps*1.3 + phase*7.0);
        vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = taille * uPix * 1.6; }`,
    fragmentShader: `varying vec3 vCol; varying float vA;
      void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); float a = smoothstep(0.5, 0.0, d); a = a*a;
        gl_FragColor = vec4(vCol * vA, a); }`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const etoiles = new THREE.Points(g, mat); etoiles.frustumCulled = false; ciel.add(etoiles);

  const neb = (couleur, x, y, z, s, o) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLueur('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.25)'),
      color: couleur, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    sp.position.set(x, y, z); sp.scale.setScalar(s); ciel.add(sp);
  };
  neb(0x3a2a6e, -220, 140, -250, 380, 0.22); neb(0x163a6a, 200, -60, -300, 320, 0.18); neb(0x5a2050, -120, -200, 260, 300, 0.12);
  neb(0x1c4a6e, 90, 240, 200, 260, 0.12);
  return { ciel, mat };
}

export function creerSoleil(scene, dir, etoile) {
  const g = new THREE.Group(); scene.add(g);
  const d = new THREE.Vector3(...dir).normalize();
  const teinte = new THREE.Color(0xffffff); const tc = new THREE.Color(0xfff4dc), th = new THREE.Color(0xffd9a0);
  let k = 1;
  if (etoile && etoile.c) { teinte.setRGB(...etoile.c); k = etoile.t || 1; tc.lerp(teinte, 0.6); th.lerp(teinte, 0.7); }
  const coeur = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLueur('rgba(255,255,255,1)', 'rgba(255,240,210,0.9)'),
    color: tc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  coeur.scale.setScalar(16 * k); coeur.position.copy(d).multiplyScalar(380); g.add(coeur);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLueur('rgba(255,220,170,0.6)', 'rgba(255,190,120,0.12)'),
    color: th, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(110 * (0.8 + 0.2 * k)); halo.position.copy(coeur.position); g.add(halo);
  return g;
}

export function creerLumieres(scene) {
  const g = new THREE.Group(); scene.add(g);
  const pool = [];
  const lueur = texLueur('rgba(255,255,255,1)', 'rgba(255,255,255,0.3)');
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 32;
  const cx = cv.getContext('2d'); const gr = cx.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 128, 32);
  const texQueue = new THREE.CanvasTexture(cv);
  const masque = document.createElement('canvas'); masque.width = 128; masque.height = 32;
  const mx = masque.getContext('2d'); mx.drawImage(cv, 0, 0);
  mx.globalCompositeOperation = 'destination-in';
  const gy = mx.createLinearGradient(0, 0, 0, 32); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.5, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  mx.fillStyle = gy; mx.fillRect(0, 0, 128, 32);
  texQueue.image = masque; texQueue.needsUpdate = true;
  const mat = (map, c) => new THREE.SpriteMaterial({ map, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  function nouveau() {
    const o = { g: new THREE.Group() };
    o.halo = new THREE.Sprite(mat(lueur, 0xffffff)); o.coeur = new THREE.Sprite(mat(lueur, 0xffffff));
    o.queue = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texQueue, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false }));
    o.queue.visible = false;
    o.g.add(o.halo, o.coeur, o.queue); g.add(o.g);
    return o;
  }
  const p = new THREE.Vector3(), v = new THREE.Vector3(), c1 = new THREE.Color(), blanc = new THREE.Color(1, 1, 1);
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), B = new THREE.Matrix4();
  return {
    maj(ciel, age) {
      const liste = (ciel && ciel.corps) || [];
      while (pool.length < liste.length) pool.push(nouveau());
      pool.forEach((o, i) => {
        const c = liste[i];
        o.g.visible = !!c;
        if (!c) return;
        p.set(...c.d).addScaledVector(v.set(...c.v), age).normalize();
        const op = Math.max(0, Math.min(1, c.o));
        const taille = Math.max(1.8, Math.min(8, 2.0 + (6.0 - c.m) * 0.55)) * (c.f ? 1.25 : 1);
        o.coeur.position.copy(p).multiplyScalar(376); o.halo.position.copy(o.coeur.position);
        c1.setRGB(...c.c); o.halo.material.color.copy(c1);
        o.coeur.material.color.copy(c1).lerp(blanc, 0.4);
        o.coeur.scale.setScalar(taille); o.halo.scale.setScalar(taille * (c.f ? 5 : 3.2));
        o.coeur.material.opacity = op * Math.max(0.55, Math.min(1, 0.5 + (6 - c.m) * 0.1));
        o.halo.material.opacity = op * (c.f ? 0.55 : 0.38);
        if (c.f && c.q > 0.3) {
          const L = c.q * 6.5;
          Z.copy(p); X.set(...c.qd); Y.crossVectors(Z, X).normalize();
          o.queue.quaternion.setFromRotationMatrix(B.makeBasis(X, Y, Z));
          o.queue.scale.set(L, taille * 0.9, 1);
          o.queue.position.copy(o.coeur.position).addScaledVector(X, L / 2);
          o.queue.material.color.copy(c1).lerp(blanc, 0.3);
          o.queue.material.opacity = op * 0.55; o.queue.visible = true;
        } else o.queue.visible = false;
      });
    },
  };
}

export function creerEcho() {
  const g = new THREE.Group(); g.visible = false;
  const tex = new THREE.TextureLoader().load('./echo.png');
  tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const h = 0.95, w = h * 740 / 840;
  const plan = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  plan.position.y = h / 2;
  const pivot = new THREE.Group(); pivot.add(plan); g.add(pivot);

  const om = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  om.rotation.x = -Math.PI / 2; om.position.y = 0.02; g.add(om);

  const l = new THREE.PointLight(0xff8a5c, 0.6, 3, 2); l.position.y = 1.2; pivot.add(l);
  const bleu = new THREE.PointLight(0x7fd3ff, 0.5, 2.5, 2); bleu.position.set(0, 0.7, 0.3); pivot.add(bleu);
  let apparition = 0;
  return {
    groupe: g, pivot, om,
    maj(dt, t, camPos, visible) {
      apparition += ((visible ? 1 : 0) - apparition) * (1 - Math.exp(-(visible ? 5 : 7) * dt));
      g.visible = apparition > 0.01;
      const pop = visible ? 1 + 0.18 * Math.sin(Math.min(1, apparition) * Math.PI) : 1;
      pivot.scale.setScalar(Math.max(0.001, apparition * pop));
      pivot.position.y = 0.02 + 0.05 * Math.sin(t * 1.8);
      om.scale.setScalar(0.8 + 0.1 * Math.sin(t * 1.8));

      const loc = g.worldToLocal(camPos.clone());
      pivot.rotation.y = Math.atan2(loc.x, loc.z);
    },
  };
}
