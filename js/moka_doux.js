
import * as THREE from 'three';
import { textures, texLueur, feutre, ajouterContour, alea } from './moka3d.js';

const COUL = {
  brun: 0x6b4a31, brunSombre: 0x4e3523, interieur: 0x2e1f15, noir: 0x1b1714, beige: 0xcdb895, cordon: 0x9a8162,
  feuilles: [0x7a5638, 0x6e4d32, 0x83603f, 0x664630],
};

const R = 0.34;
const CENTRE = new THREE.Vector3(0, 0.25, 0);
const OUV = { ax: 0.8, ay: 0.7, dy: -0.12 };

function deformer(v) {
  const yn = v.y / R;
  v.x *= 1.08; v.y *= 0.94;
  if (yn > 0.45) {
    const k = (yn - 0.45) / 0.55;
    v.y += k * k * k * R * 0.2;
    v.x *= 1 - k * k * 0.3; v.z *= 1 - k * k * 0.2;
    v.z -= k * k * R * 0.12;
  }
  if (yn < -0.2) { const k = -0.2 - yn; v.x *= 1 + k * 0.75; v.z *= 1 + k * 0.45; v.y -= k * k * R * 0.25; }
  return v;
}
const surfaceCap = (n) => deformer(n.clone().normalize().multiplyScalar(R));
function normaleCap(n) {
  const e = 0.01, a = n.clone().normalize();
  const t1 = new THREE.Vector3().crossVectors(a, Math.abs(a.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const t2 = new THREE.Vector3().crossVectors(a, t1).normalize();
  const p = surfaceCap(a);
  const p1 = surfaceCap(a.clone().addScaledVector(t1, e)).sub(p);
  const p2 = surfaceCap(a.clone().addScaledVector(t2, e)).sub(p);
  const nn = new THREE.Vector3().crossVectors(p1, p2).normalize();
  if (nn.dot(p) < 0) nn.negate();
  return nn;
}
const largeurArche = (yy) => 1 - 0.55 * Math.max(0, yy) ** 1.3;
const dansOuverture = (n, marge = 1) => {
  if (n.z <= 0) return false;
  const yy = (n.y - OUV.dy) / OUV.ay;
  return (n.x / (OUV.ax * largeurArche(yy))) ** 2 + yy * yy < marge;
};

function lisserCouture(g) {
  const p = g.attributes.position, nrm = g.attributes.normal;
  const carte = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    if (!carte.has(k)) carte.set(k, []);
    carte.get(k).push(i);
  }
  const v = new THREE.Vector3(), s = new THREE.Vector3();
  for (const ids of carte.values()) {
    if (ids.length < 2) continue;
    s.set(0, 0, 0);
    for (const i of ids) s.add(v.fromBufferAttribute(nrm, i));
    s.normalize();
    for (const i of ids) nrm.setXYZ(i, s.x, s.y, s.z);
  }
  nrm.needsUpdate = true;
}

function geoCapuchon() {
  const g = new THREE.SphereGeometry(R, 72, 52);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { deformer(v.fromBufferAttribute(p, i)); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  lisserCouture(g);

  const idx = g.index.array, garde = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const sph = new THREE.SphereGeometry(R, 72, 52).attributes.position;
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(sph, idx[i]); b.fromBufferAttribute(sph, idx[i + 1]); c.fromBufferAttribute(sph, idx[i + 2]);
    const m = a.add(b).add(c).normalize();
    if (!dansOuverture(m) && m.y > -0.93) garde.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  g.setIndex(garde);
  return g;
}

function geoBord() {
  const pts = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    const ex = OUV.ax * Math.cos(t) * largeurArche(Math.sin(t)), ey = OUV.ay * Math.sin(t) + OUV.dy;
    const ez = Math.sqrt(Math.max(0.0001, 1 - ex * ex - ey * ey));
    const p = surfaceCap(new THREE.Vector3(ex, ey, ez)).multiplyScalar(0.985);
    const s = Math.max(0, Math.sin(t)); const pointe = Math.pow(s, 6);
    p.z += 0.03 * s * s + 0.035 * pointe; p.y -= 0.035 * pointe;
    pts.push(p);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, R * 0.075, 16, true);
}

function geoFeuilleRelief(L, W) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(W * 1.15, L * 0.18, W * 0.95, L * 0.7, 0, L);
  s.bezierCurveTo(-W * 0.95, L * 0.7, -W * 1.15, L * 0.18, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.0045,
    bevelSegments: 3, curveSegments: 10 });

  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z > 0.004) p.setZ(i, z - 0.004 * Math.exp(-((x / (W * 0.18)) ** 2)) * Math.sin(Math.PI * Math.min(1, y / L)));

    p.setZ(i, p.getZ(i) - 0.5 * ((y / L) ** 2) * 0.012);
  }
  g.computeVertexNormals();
  return g;
}

function instancierFeuilles(liste, geo, mat, graine) {
  const r = alea(graine);
  const im = new THREE.InstancedMesh(geo, mat, liste.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), X = new THREE.Vector3();
  const col = new THREE.Color();
  liste.forEach((f, i) => {
    const Z = f.n.clone().normalize();
    const Y = f.bas.clone().addScaledVector(Z, -f.bas.dot(Z)).normalize().negate();
    Y.negate();
    X.crossVectors(Y, Z).normalize(); Y.crossVectors(Z, X);
    M.makeBasis(X, Y, Z);
    Q.setFromRotationMatrix(M).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (r() - 0.5) * 0.25));
    const k = f.taille * (0.92 + r() * 0.16);
    S.set(k, k, k);
    M.compose(f.p.clone().addScaledVector(Z, -0.004), Q, S);
    im.setMatrixAt(i, M);
    col.set(COUL.feuilles[Math.floor(r() * COUL.feuilles.length)]).offsetHSL(0, (r() - 0.5) * 0.05, (r() - 0.5) * 0.04);
    im.setColorAt(i, col);
  });
  im.castShadow = true; im.receiveShadow = true;
  return im;
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

function texOeil() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(58, 54, 4, 64, 64, 64);
  gr.addColorStop(0, '#ffe2a0'); gr.addColorStop(0.4, '#ffc25a'); gr.addColorStop(0.8, '#ef9a3a'); gr.addColorStop(1, '#c96a22');
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 64, 0, 6.3); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function geoPompon(r, graine) {
  const g = new THREE.IcosahedronGeometry(r, 4);
  const p = g.attributes.position, v = new THREE.Vector3(), rnd = alea(graine);
  const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const k = 1 + 0.07 * Math.sin(v.x * 23 + ph[0]) * Math.sin(v.y * 21 + ph[1]) * Math.sin(v.z * 25 + ph[2]);
    v.multiplyScalar(r * k); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function habillerDoux(sq) {
  const { hips, torse, cape, tete, graine } = sq;
  const T = textures();
  const ombre = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const rim = (m, f = 1, base = 0.012) => ajouterContour(m, 0xd9a26a, 3.2, base, f * 0.4);
  const brun = rim(feutre(COUL.brun, { sheen: 0x6e5440 }));
  const brunSombre = rim(feutre(COUL.brunSombre), 0.6);
  const noir = rim(feutre(COUL.noir, { sheen: 0x8a7a68 }), 0.55, 0.05);
  const beige = rim(feutre(COUL.beige, { sheen: 0x9a8a70 }), 0.8);
  const cordon = rim(feutre(COUL.cordon, { sheen: 0x8a7558 }), 0.7);
  const interieur = new THREE.MeshBasicMaterial({ color: 0x060404, side: THREE.BackSide });
  const texF = T.feuille.clone(); texF.needsUpdate = true;
  const feuilleMat = rim(new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: T.map, roughness: 1, sheen: 0.25,
    sheenRoughness: 0.9, sheenColor: new THREE.Color(0x6e5440), bumpMap: T.bump, bumpScale: 0.5 }), 1.0, 0.012);

  for (const m of [brun, brunSombre, noir, beige, cordon]) { m.map = T.map; m.bumpScale = 0.55; m.sheen = 0.22; m.sheenRoughness = 0.95; }

  const jambes = [];
  for (const cote of [1, -1]) {
    const pivot = new THREE.Group(); pivot.position.set(0.072 * cote, 0, 0); hips.add(pivot);
    const jambe = ombre(new THREE.Mesh(new THREE.CapsuleGeometry(0.057, 0.12, 8, 18), brun)); jambe.position.y = -0.1; pivot.add(jambe);
    const pied = ombre(new THREE.Mesh(new THREE.SphereGeometry(0.066, 24, 16), noir));
    pied.scale.set(1.0, 0.7, 1.3); pied.position.set(0, -0.212, 0.03); pivot.add(pied);
    jambes.push(pivot);
  }

  const profil = [[0, -0.14], [0.205, -0.14], [0.212, -0.125], [0.196, -0.06], [0.176, 0.02], [0.156, 0.1], [0.138, 0.18], [0.12, 0.26],
    [0.09, 0.33], [0.05, 0.365], [0, 0.37]].map(([x, y]) => new THREE.Vector2(x, y));
  torse.add(ombre(new THREE.Mesh(new THREE.LatheGeometry(profil, 56), brun)));
  const couture = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.3, 4, 8), brunSombre);
  couture.position.set(0, 0.07, 0.168); couture.rotation.x = -0.24; torse.add(couture);
  const ourlet = ombre(new THREE.Mesh(new THREE.TorusGeometry(0.207, 0.013, 8, 64), brunSombre));
  ourlet.rotation.x = Math.PI / 2; ourlet.position.y = -0.132; torse.add(ourlet);

  const capeProfil = [[0.075, 0.02], [0.14, -0.015], [0.2, -0.07], [0.235, -0.13], [0.25, -0.18]].map(([x, y]) => new THREE.Vector2(x, y));
  const capeGeo = new THREE.LatheGeometry(capeProfil, 56, 0.45, Math.PI * 2 - 0.9);
  const capeMat = rim(new THREE.MeshPhysicalMaterial({ color: 0x5f4a38, roughness: 1, sheen: 0.6, sheenColor: new THREE.Color(0xc9a27e),
    map: T.map, side: THREE.DoubleSide }), 0.8);
  cape.add(ombre(new THREE.Mesh(capeGeo, capeMat)));
  {
    const liste = [];
    const rangs = [{ y: -0.03, r: 0.16, n: 11, t: 1.1 }, { y: -0.1, r: 0.22, n: 13, t: 1.25 }];
    rangs.forEach((rg, k) => {
      for (let i = 0; i < rg.n; i++) {
        const a = 0.5 + (i + (k % 2) * 0.5) / rg.n * (Math.PI * 2 - 1.0);
        const p = new THREE.Vector3(Math.sin(a) * rg.r, rg.y + 0.04, Math.cos(a) * rg.r);
        const n = new THREE.Vector3(Math.sin(a), 0.25, Math.cos(a)).normalize();
        liste.push({ p, n, bas: new THREE.Vector3(Math.sin(a) * 0.4, -1, Math.cos(a) * 0.4), taille: rg.t });
      }
    });
    cape.add(instancierFeuilles(liste, geoFeuilleRelief(0.15, 0.058), feuilleMat, 3));
  }

  const noeud = ombre(new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 12), cordon));
  noeud.position.set(0, 0.3, 0.135); noeud.scale.set(1.35, 0.9, 0.8); torse.add(noeud);
  const tour = ombre(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.009, 8, 48), cordon));
  tour.position.set(0, 0.325, 0.02); tour.rotation.x = Math.PI / 2 + 0.38; torse.add(tour);
  for (const cote of [1, -1]) {
    const courbe = new THREE.CatmullRomCurve3([new THREE.Vector3(0.006 * cote, 0.295, 0.14), new THREE.Vector3(0.02 * cote, 0.235, 0.152),
      new THREE.Vector3(0.026 * cote, 0.18, 0.152)]);
    torse.add(ombre(new THREE.Mesh(new THREE.TubeGeometry(courbe, 12, 0.007, 8), cordon)));
    const bout = ombre(new THREE.Mesh(geoPompon(0.02, 11 + cote), cordon)); bout.position.set(0.026 * cote, 0.17, 0.155); torse.add(bout);
  }

  const brunManche = brun.clone(); brunManche.side = THREE.DoubleSide; brunManche.onBeforeCompile = brun.onBeforeCompile; brunManche.customProgramCacheKey = brun.customProgramCacheKey;
  const bras = [];
  for (const cote of [1, -1]) {
    const epaule = new THREE.Vector3(0.13 * cote, 0.275, 0.0);
    const haut = new THREE.Group(); torse.add(haut);
    const mh = ombre(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.054, 0.17, 18), brun)); mh.position.y = -0.085; haut.add(mh);
    haut.add(ombre(new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 12), brun)));
    const bas = new THREE.Group(); torse.add(bas);
    const mb = ombre(new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.088, 0.14, 20, 1, true), brunManche)); mb.position.y = -0.07; bas.add(mb);
    bas.add(ombre(new THREE.Mesh(new THREE.SphereGeometry(0.053, 18, 12), brun)));
    const revers = ombre(new THREE.Mesh(new THREE.TorusGeometry(0.086, 0.012, 8, 28), brunSombre));
    revers.rotation.x = Math.PI / 2; revers.position.y = -0.138; 
    const fond = new THREE.Mesh(new THREE.CircleGeometry(0.084, 20), new THREE.MeshBasicMaterial({ color: 0x120c08, side: THREE.DoubleSide }));
    fond.rotation.x = Math.PI / 2; fond.position.y = -0.136;
    const main = ombre(new THREE.Mesh(new THREE.SphereGeometry(0.056, 20, 14), noir));
    main.scale.set(1.0, 1.1, 0.88); main.position.y = -0.175; bas.add(main);
    const pouce = ombre(new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), noir));
    pouce.position.set(-0.035 * cote, -0.155, 0.032); bas.add(pouce);
    bras.push({ cote, epaule, haut, bas, main, a: 0.175, b: 0.17 });
  }

  const capGeo = geoCapuchon();
  const capuchon = ombre(new THREE.Mesh(capGeo, brun)); capuchon.position.copy(CENTRE); tete.add(capuchon);
  const capIn = new THREE.Mesh(capGeo, interieur); capIn.position.copy(CENTRE); capIn.scale.setScalar(0.988); tete.add(capIn);
  const bord = ombre(new THREE.Mesh(geoBord(), brun)); bord.position.copy(CENTRE); tete.add(bord);
  {
    const liste = [];
    const r = alea(17);

    const places = [[0.05, 0.6], [0.22, 2.2], [0.24, -1.4], [0.3, 0.3], [0.38, 0.9], [0.4, -0.5], [0.45, 2.9], [0.44, -2.3],
      [0.6, 1.4], [0.62, -1.1], [0.55, 0.05], [0.8, 2.3], [0.85, -2.6], [1.1, 1.8], [1.2, -1.9], [0.7, 0.55], [0.72, -0.5]];
    for (const [el, az] of places) {
      const d = new THREE.Vector3(Math.sin(el) * Math.sin(az), Math.cos(el), Math.sin(el) * Math.cos(az));
      if (dansOuverture(d, 1.7)) continue;
      const bas = new THREE.Vector3(Math.cos(el) * Math.sin(az) + (r() - 0.5) * 0.9, -Math.sin(el) - 0.3, Math.cos(el) * Math.cos(az) + (r() - 0.5) * 0.9);
      liste.push({ p: surfaceCap(d), n: normaleCap(d), bas, taille: 1.0 + r() * 0.35 });
    }
    const im = instancierFeuilles(liste, geoFeuilleRelief(0.14, 0.055), feuilleMat, 9);
    im.position.copy(CENTRE); tete.add(im);
  }

  const visage = new THREE.Mesh(new THREE.SphereGeometry(0.3, 40, 30), new THREE.MeshBasicMaterial({ color: 0x030304 }));
  visage.position.set(0, 0.215, -0.04); visage.scale.set(1.04, 1.14, 1); tete.add(visage);

  const noirVisage = new THREE.MeshBasicMaterial({ color: 0x030304 });
  const oeilMat = new THREE.MeshBasicMaterial({ map: texOeil(), toneMapped: false, transparent: true });
  const pupMat = new THREE.MeshBasicMaterial({ color: 0x24110a, toneMapped: false });
  const refletMat = new THREE.MeshBasicMaterial({ color: 0xfff6dc, toneMapped: false });
  const lueurMat = new THREE.SpriteMaterial({ map: T.lueur, color: 0xffa040, transparent: true, opacity: 0.45, toneMapped: false,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const RE = 0.058;
  const oeils = [];
  for (const cote of [1, -1]) {
    const g = new THREE.Group();
    const dir = new THREE.Vector3(0.3 * cote, -0.02, 1).normalize();
    g.position.copy(new THREE.Vector3(0, 0.24, -0.04)).addScaledVector(dir, 0.303);
    g.position.y = 0.215;
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); tete.add(g);
    const forme = new THREE.Group(); g.add(forme);
    const disque = new THREE.Mesh(geoAmande(RE), oeilMat); disque.rotation.z = 0.1 * cote; forme.add(disque);
    const pup = new THREE.Group(); pup.position.z = 0.001; forme.add(pup);
    const pm = new THREE.Mesh(new THREE.CircleGeometry(0.015, 24), pupMat); pm.scale.set(0.75, 1.2, 1); pup.add(pm);
    const r1 = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 12), refletMat); r1.position.set(-0.007, 0.007, 0.001); r1.material = r1.material.clone(); r1.material.transparent = true; r1.material.opacity = 0.55; pup.add(r1);
    
    const haut = new THREE.Mesh(new THREE.CircleGeometry(0.06, 32), noirVisage); haut.position.z = 0.003; forme.add(haut);
    const bas = new THREE.Mesh(new THREE.CircleGeometry(0.06, 32), noirVisage); bas.position.z = 0.003; forme.add(bas);
    const halo = new THREE.Sprite(lueurMat); halo.scale.setScalar(0.26); halo.position.z = -0.02; g.add(halo);
    oeils.push({ forme, pup, haut, bas, halo, cote });
  }

  const antennes = [];
  for (const cote of [1, -1]) {
    const d = new THREE.Vector3(0.3 * cote, 0.93, -0.2).normalize();
    const base = surfaceCap(d).add(CENTRE).addScaledVector(normaleCap(d), -0.01);
    const piv = new THREE.Group(); piv.position.copy(base); tete.add(piv);
    const inner = new THREE.Group(); inner.rotation.set(-0.1, 0, -0.3 * cote); piv.add(inner);
    const courbe = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(0.012 * cote, 0.13, 0.012),
      new THREE.Vector3(0.006 * cote, 0.27, 0.0)]);
    inner.add(ombre(new THREE.Mesh(new THREE.TubeGeometry(courbe, 20, 0.0068, 8), cordon)));
    const pom = ombre(new THREE.Mesh(geoPompon(0.04, 5), beige)); pom.position.set(0.006 * cote, 0.285, 0); inner.add(pom);
    antennes.push({ piv, cote, ax: 0, az: 0, vx: 0, vz: 0 });
  }

  const gProfil = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const r = 0.05 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.98 + 0.02)), 0.72) * (1 - 0.55 * t);
    gProfil.push(new THREE.Vector2(Math.max(0.0005, r), -0.032 + t * 0.13));
  }
  const graineMat = new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffa53c, emissiveIntensity: 2.2, roughness: 0.3 });
  graine.add(new THREE.Mesh(new THREE.LatheGeometry(gProfil, 28), graineMat));
  const lueurGraine = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLueur(), color: 0xffaa50, transparent: true, opacity: 0.8,
    toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
  lueurGraine.position.y = 0.025; graine.add(lueurGraine);
  const lumiere = new THREE.PointLight(0xffa04a, 0.6, 4.5, 2); lumiere.position.set(0, 0.05, 0.13); graine.add(lumiere);
  const gainLumiere = 1.1;

  let joieL = 0;
  function majYeux(ouvert, P, regardX, t, dt) {
    joieL += (P.joie - joieL) * (1 - Math.exp(-6 * (dt || 0.016)));
    const H = RE * 0.62;
    for (const o of oeils) {
      const s = P.eyeS;
      o.forme.scale.set(s, s, 1);
      const fermer = 1 - Math.max(0, Math.min(1, ouvert));
      o.haut.position.y = H + 0.06 - fermer * (2 * H) * 0.97;
      o.haut.visible = fermer > 0.01;
      const j = joieL * Math.min(1, ouvert * 2);
      o.bas.position.y = -(H + 0.06) + j * H * 0.95;
      o.bas.visible = j > 0.01;
      o.pup.visible = ouvert > 0.35;
      o.pup.scale.setScalar(1 - 0.25 * Math.max(0, s - 1) / 0.32);
      o.pup.position.x = -0.003 * o.cote + 0.01 * regardX;
      o.pup.position.y = 0.001 - 0.008 * joieL;
      o.halo.material.opacity = 0.25 + 0.3 * ouvert;
    }
  }
  const dort = { teteMax: 0.12 };
  const leve = { mains: [0.19, 0.76, 0.17], graineY: 0.6, graineZ: 0.1, tete: -0.3 };
  return { jambes, bras, antennes, graineMat, lueurGraine, lumiere, majYeux, leve, dort, gainLumiere };
}
