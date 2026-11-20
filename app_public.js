// Moka, version publique en lecture seule.
// Lit etat_public.json (publié de temps en temps), aucun appel au PC, aucun bouton d'action.
// Entre deux mises à jour, Moka continue de vivre : il marche jusqu'à sa nouvelle place, finit son action,
// puis a ses petites habitudes (regarder autour, quelques pas, s'étirer, s'asseoir). Le jour tourne en temps réel.
import * as THREE from 'three';
import { creerMoka, CONTOUR } from './js/moka3d.js';
import { creerMonde, creerCiel, creerSoleil, creerEcho } from './js/monde.js';

const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const qualite = mobile
  ? { detailSol: 40, galets: 240, etoiles: 2600, ombre: 1024, pr: 1.5 }
  : { detailSol: 56, galets: 480, etoiles: 4500, ombre: 2048, pr: 1.75 };
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, qualite.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(mobile ? 50 : 42, innerWidth / innerHeight, 0.05, 1200);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const asteroide = new THREE.Group(); scene.add(asteroide);

// ------------------------------------------------------------------ état publié
let pub = null, recuA = 0;            // recuA : performance.now() à la réception
let M = null, monde = null, ciel = null, echo = null, construit = false, lumPerso = null, lumDos = null;
const ACTION_TEXTE = {
  go_to: 'walking', explore: 'exploring', look: 'looking at something', sit: 'sitting', dig: 'digging',
  raise_light: 'raising his little light', sleep: 'sleeping', wave: 'waving',
  attente_regard: 'looking around', attente_pas: 'taking a few steps', attente_assis: 'resting a moment',
  attente_etire: 'stretching', surpris: 'startled',
};
const ANIM = { go_to: 'marche', explore: 'marche', look: 'regarde', sit: 'assis', dig: 'creuse', raise_light: 'leve', sleep: 'dort',
  wave: 'salue', attente_regard: 'regarde', attente_pas: 'marche', attente_assis: 'assis', attente_etire: 'etire', surpris: 'surpris' };

async function lire() {
  try {
    const r = await fetch('etat_public.json?t=' + Math.floor(Date.now() / 30000), { cache: 'no-store' });
    const e = await r.json();
    const neuf = !pub || e.publie !== pub.publie;
    pub = e; recuA = performance.now();
    if (!construit) construire();
    if (neuf) nouvelEtat();
    majPanneau();
  } catch (err) { console.warn('etat_public.json illisible', err); }
}
lire(); setInterval(lire, 30000);

// l'heure du monde avance en temps réel depuis la publication
const ageS = () => (Date.now() / 1000 - pub.publie);
const tempsMonde = () => pub.temps_monde + ageS();
const rotation = () => 2 * Math.PI * tempsMonde() / pub.jour_s;

// ------------------------------------------------------------------ construction
function srvLocal() { // ce que les modules du monde attendent (même forme que la page du PC, sans rien de privé)
  return {
    soleil: pub.soleil, rayon: pub.rayon, jour_s: pub.jour_s, rotation: rotation(), monde: pub.monde,
    moka: { pos: sim.dir.toArray(), cap: sim.cap.toArray(), vit: [0, 0, 0], anim: sim.anim, action: sim.action, chose: null,
            objet: null, trous: pub.monde.trous || [], lumiere: pub.moka.lumiere, energie: pub.moka.energie,
            graine_en_main: pub.moka.graine_en_main, duree: sim.duree, depuis: sim.t },
    visiteurs: echoVisible() ? { echo: { dir: pub.visite.dir, type: 'echo' } } : {},
  };
}
function construire() {
  construit = true;
  sim.dir.copy(V(pub.moka.pos)).normalize(); sim.cap.copy(V(pub.moka.cap));
  const SOL = new THREE.Vector3(...pub.soleil).normalize();
  monde = creerMonde(asteroide, { ...pub, monde: pub.monde }, qualite);
  scene.remove(monde.groupe); asteroide.add(monde.groupe);
  ciel = creerCiel(scene, qualite); ciel.mat.uniforms.uPix.value = renderer.getPixelRatio();
  creerSoleil(scene, pub.soleil);
  const sol = new THREE.DirectionalLight(0xfff0da, 2.0);
  sol.position.copy(SOL).multiplyScalar(40); sol.castShadow = true; sol.shadow.mapSize.set(qualite.ombre, qualite.ombre);
  const sc = sol.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 20; sc.far = 62;
  sol.shadow.bias = -0.0015; sol.shadow.normalBias = 0.03; scene.add(sol, sol.target);
  const lune = new THREE.DirectionalLight(0x7088c8, 0.32); lune.position.copy(SOL).multiplyScalar(-40).add(new THREE.Vector3(0, 18, 0)); scene.add(lune);
  scene.add(new THREE.HemisphereLight(0x8a9ac8, 0x2a2219, 0.7));
  M = creerMoka('modele');
  lumPerso = new THREE.PointLight(0xf2e8de, 1.0, 3.2, 1.6); lumDos = new THREE.PointLight(0xe8d6c2, 1.2, 2.6, 1.6); scene.add(lumPerso, lumDos);
  asteroide.add(M.groupe);
  echo = creerEcho(); asteroide.add(echo.groupe);
  M.pret.then(() => { document.getElementById('chargement').style.opacity = 0; window.__pret = true; })
    .catch(() => { asteroide.remove(M.groupe); M = creerMoka('doux'); asteroide.add(M.groupe); document.getElementById('chargement').style.opacity = 0; window.__pret = true; });
}

// ------------------------------------------------------------------ Moka entre deux publications
const sim = { dir: new THREE.Vector3(0, 1, 0), cap: new THREE.Vector3(0, 0, 1), but: null, anim: 'debout', action: 'look', t: 0, duree: 10,
              file: [], phaseMarche: 0 };
function nouvelEtat() {
  const cible = V(pub.moka.pos).normalize();
  sim.file = [];
  const action = pub.moka.action;
  const enMarche = ANIM[action] === 'marche';
  // il rejoint d'abord sa vraie place (si elle a changé), puis reprend son action là où elle en était
  if (sim.dir.angleTo(cible) * pub.rayon > 0.12) sim.file.push({ anim: 'marche', action: 'go_to', but: cible, duree: 60 });
  if (!enMarche) sim.file.push({ anim: ANIM[action] || 'regarde', action, duree: Math.max(4, (pub.moka.duree || 10) - (pub.moka.depuis || 0)) });
  suivant();
}
function habitude() { // petites habitudes quand on ne sait rien de neuf
  if (pub.moka.action === 'sleep') return { anim: 'dort', action: 'sleep', duree: 60 };
  const r = Math.random();
  if (r < 0.38) return { anim: 'regarde', action: 'attente_regard', duree: 5 + Math.random() * 4 };
  if (r < 0.66) { // quelques pas autour de sa place
    const base = V(pub.moka.pos).normalize();
    const t = new THREE.Vector3().randomDirection(); t.addScaledVector(base, -t.dot(base)).normalize();
    return { anim: 'marche', action: 'attente_pas', but: base.clone().addScaledVector(t, (0.3 + Math.random() * 0.5) / pub.rayon).normalize(), duree: 20 };
  }
  if (r < 0.8) return { anim: 'etire', action: 'attente_etire', duree: 3.5 };
  return { anim: 'assis', action: 'attente_assis', duree: 10 + Math.random() * 10 };
}
function suivant() {
  const s = sim.file.shift() || habitude();
  Object.assign(sim, { anim: s.anim, action: s.action, duree: s.duree, but: s.but || null, t: 0 });
}
function majSim(dt) {
  sim.t += dt;
  if (sim.anim === 'marche' && sim.but) {
    const ang = sim.dir.angleTo(sim.but);
    const pas = 0.45 * 0.85 * dt / pub.rayon;
    if (ang < 1e-3) { sim.dir.copy(sim.but); suivant(); return 0; }
    const axe = new THREE.Vector3().crossVectors(sim.dir, sim.but).normalize();
    const avant = new THREE.Vector3().crossVectors(axe, sim.dir).normalize();
    sim.cap.lerp(avant, 1 - Math.exp(-4 * dt)).normalize();
    sim.dir.applyAxisAngle(axe, Math.min(ang, pas)).normalize();
    return Math.min(ang, pas) * pub.rayon;
  }
  if (sim.t > sim.duree) suivant();
  return 0;
}
const echoVisible = () => !!(pub && pub.visite && ageS() < 300);   // Écho seulement pendant une vraie visite

// ------------------------------------------------------------------ caméra : suit Moka, se tourne au doigt
const cam = { yaw: 0.55, pitch: 0.22, dist: mobile ? 4.8 : 4.2, vYaw: 0, touche: -99, pos: new THREE.Vector3(), cible: new THREE.Vector3(), init: false, ref: new THREE.Vector3(0, 0, 1) };
const doigts = new Map(); let pinch0 = 0;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); doigts.set(e.pointerId, { x: e.clientX, y: e.clientY }); cam.touche = temps; });
canvas.addEventListener('pointerup', (e) => { doigts.delete(e.pointerId); pinch0 = 0; });
canvas.addEventListener('pointercancel', (e) => { doigts.delete(e.pointerId); pinch0 = 0; });
canvas.addEventListener('pointermove', (e) => {
  const p = doigts.get(e.pointerId); if (!p) return;
  if (doigts.size === 2) {
    const [a, b] = [...doigts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    p.x = e.clientX; p.y = e.clientY;
    const d2 = Math.hypot(...(() => { const [q, r] = [...doigts.values()]; return [q.x - r.x, q.y - r.y]; })());
    if (pinch0) cam.dist = Math.max(1.6, Math.min(14, cam.dist * pinch0 / d2)); pinch0 = d2 || d; return;
  }
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  cam.yaw -= dx * 0.0065; cam.pitch = Math.max(0.02, Math.min(1.3, cam.pitch + dy * 0.0065)); cam.touche = temps;
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(1.6, Math.min(14, cam.dist * Math.exp(e.deltaY * 0.001))); }, { passive: false });

// ------------------------------------------------------------------ boucle
let temps = 0; const timer = new THREE.Timer(); timer.connect(document);
const dirAff = new THREE.Vector3(0, 1, 0), capAff = new THREE.Vector3(0, 0, 1); let initAff = false;
renderer.setAnimationLoop(() => {
  timer.update(); const dt = Math.min(Math.max(timer.getDelta(), 0), 0.1); temps += dt;
  if (!construit || !M) { renderer.render(scene, camera); return; }
  asteroide.rotation.y = rotation();
  const dep = majSim(dt);
  if (!initAff) { dirAff.copy(sim.dir); capAff.copy(sim.cap); initAff = true; }
  dirAff.lerp(sim.dir, 1 - Math.exp(-8 * dt)).normalize();
  capAff.lerp(sim.cap, 1 - Math.exp(-5 * dt)); capAff.addScaledVector(dirAff, -capAff.dot(dirAff)).normalize();
  M.groupe.position.copy(monde.surface(dirAff));
  const Y = dirAff.clone(), Z = capAff.clone(), X = new THREE.Vector3().crossVectors(Y, Z).normalize(); Z.crossVectors(X, Y);
  M.groupe.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  if (sim.anim === 'marche') sim.phaseMarche += Math.max(dep, 0.45 * 0.85 * dt) / 0.44 * Math.PI;

  const srv = srvLocal();
  const ech = srv.visiteurs.echo;
  let regardYaw = 0;
  if (ech) { monde.orienterSur(echo.groupe, V(ech.dir), 0); const loc = M.groupe.worldToLocal(echo.groupe.getWorldPosition(new THREE.Vector3())); regardYaw = Math.atan2(loc.x, loc.z); }
  echo.maj(dt, temps, camera.position, !!ech);
  const hauteurTas = monde.choses.pebble_stack.maj(srv, dt, temps);
  const lumSoleil = new THREE.Vector3(...pub.soleil);
  const nC = monde.choses.blue_crystal.groupe.getWorldPosition(new THREE.Vector3()).normalize();
  monde.choses.blue_crystal.maj(srv, dt, temps, Math.max(0, Math.min(1, 0.5 - nC.dot(lumSoleil) * 2)));
  monde.choses.soft_soil.maj(srv, dt, temps);
  monde.choses.metal_piece.maj(srv, dt, temps);
  monde.majTrous(srv.moka.trous);
  M.maj(dt, { anim: sim.anim, phaseMarche: sim.phaseMarche, tempsAction: sim.t, lumiere: pub.moka.lumiere, graine: pub.moka.graine_en_main,
              porte: false, dureeAction: sim.duree, hauteurTas, deuxMains: false, regardYaw, regardPoids: ech && sim.anim !== 'marche' ? 1 : 0 });
  ciel.mat.uniforms.uTemps.value = temps;

  // caméra
  if (temps - cam.touche > 6) cam.yaw += dt * 0.03;
  const haut = M.groupe.getWorldPosition(new THREE.Vector3()).normalize();
  const avant = new THREE.Vector3(0, 0, 1).applyQuaternion(M.groupe.getWorldQuaternion(new THREE.Quaternion()));
  cam.ref.lerp(avant, 1 - Math.exp(-0.3 * dt));
  const F = cam.ref.clone().addScaledVector(haut, -cam.ref.dot(haut)).normalize(), R = new THREE.Vector3().crossVectors(F, haut).normalize();
  const centre = M.groupe.getWorldPosition(new THREE.Vector3()).addScaledVector(haut, 0.55);
  const d = F.clone().multiplyScalar(Math.cos(cam.yaw)).addScaledVector(R, Math.sin(cam.yaw)).multiplyScalar(Math.cos(cam.pitch)).addScaledVector(haut, Math.sin(cam.pitch));
  let pos = centre.clone().addScaledVector(d, cam.dist);
  const loc = asteroide.worldToLocal(pos.clone()); const rMin = pub.rayon + monde.relief.h(loc.clone().normalize()) + 0.25;
  if (loc.length() < rMin) { loc.setLength(rMin); pos = asteroide.localToWorld(loc); }
  if (!cam.init) { cam.pos.copy(pos); cam.cible.copy(centre); cam.init = true; }
  const k = 1 - Math.exp(-6 * dt); cam.pos.lerp(pos, k); cam.cible.lerp(centre, k);
  camera.position.copy(cam.pos); camera.up.copy(haut); camera.lookAt(cam.cible);

  // éclairage de personnage (comme sur la page du PC)
  const nuit = Math.max(0, Math.min(1, 0.5 - haut.dot(lumSoleil.clone().normalize()) * 2));
  const tete = M.groupe.localToWorld(new THREE.Vector3(0, 0.75, 0));
  const vc = camera.position.clone().sub(tete); vc.addScaledVector(haut, -vc.dot(haut)).normalize();
  lumPerso.position.copy(tete).addScaledVector(vc, 1.1).addScaledVector(haut, 0.45); lumPerso.intensity = 0.22 + 0.14 * nuit;
  lumDos.position.copy(tete).addScaledVector(vc, -0.9).addScaledVector(haut, 0.35); lumDos.intensity = 0.3 + 0.2 * nuit;
  CONTOUR.force.value = 0.6 + 0.25 * nuit;
  renderer.render(scene, camera);
  if (Math.floor(temps * 2) !== Math.floor((temps - dt) * 2)) majHorloge();
});

// ------------------------------------------------------------------ panneau
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function majHorloge() {
  if (!pub) return;
  // heure locale de Moka, avancée depuis la publication (un jour du monde = jour_s secondes réelles)
  const h = (pub.heure_h + 24 * ageS() / pub.jour_s) % 24;
  const jour = pub.jour + Math.floor((pub.heure_h + 24 * ageS() / pub.jour_s) / 24);
  $('horloge').textContent = `Day ${jour} · ${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} on the asteroid`;
  $('maintenant').textContent = ACTION_TEXTE[sim.action] || sim.action;
}
function majPanneau() {
  $('intention').textContent = pub.moka.intention || '';
  $('energie').style.width = Math.round(100 * Math.max(0, Math.min(1, pub.moka.energie))) + '%';
  $('lumiere').style.width = Math.round(100 * Math.max(0, Math.min(1, pub.moka.lumiere))) + '%';
  $('journal').innerHTML = (pub.journal || []).slice().reverse().map((j) =>
    `<li><span class="quand">Day ${esc(j.jour)}, ${esc(j.heure)}</span> ${esc(j.texte)}</li>`).join('');
  const min = Math.round(ageS() / 60);
  $('fraicheur').textContent = min < 2 ? 'updated just now' : min < 120 ? `updated ${min} min ago` : `updated ${Math.round(min / 60)} h ago`;
  majHorloge();
}
window.__pub = () => pub;
