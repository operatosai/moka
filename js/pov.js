
import * as THREE from 'three';

const lisse = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const angleVers = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };

/**
 * creerPOV({ camera, getM, getAction })
 *  getM() -> Moka (creerMoka) ou null ; getAction() -> nom de l'action courante (ex. 'observe_sky')
 * Retourne { basculer(on), actif, glisser(dx, dy), lacher(), maj(dt, bloque) }.
 * maj() est appelé APRÈS que la caméra orbitale a été placée : il la remplace (ou la fond avec elle pendant la transition).
 */
export function creerPOV({ camera, getM, getAction }) {
  const reduit = matchMedia('(prefers-reduced-motion: reduce)');
  const P = {
    voulu: false, mix: 0, actif: false,
    pos: new THREE.Vector3(), yaw: 0, pitch: 0, init: false,
    lookYaw: 0, lookPitch: 0, touche: -99, t: 0,
    fovBase: camera.fov, yeuxAvant: null, surChange: null,
  };
  const wq = new THREE.Quaternion(), wp = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const mtx = new THREE.Matrix4(), qOrb = new THREE.Quaternion(), pOrb = new THREE.Vector3(), qPov = new THREE.Quaternion();
  const pPov = new THREE.Vector3(), haut = new THREE.Vector3(), dir = new THREE.Vector3(), loc = new THREE.Vector3();

  P.basculer = (on) => {
    P.voulu = on === undefined ? !P.voulu : !!on;
    if (P.voulu) { P.lookYaw = 0; P.lookPitch = 0; P.init = false; }
    if (reduit.matches) P.mix = P.voulu ? 1 : 0;
    if (P.surChange) P.surChange(P.voulu);
  };
  P.glisser = (dx, dy) => {
    P.touche = P.t;
    P.lookYaw = Math.max(-1.9, Math.min(1.9, P.lookYaw - dx * 0.0055));
    P.lookPitch = Math.max(-0.95, Math.min(0.95, P.lookPitch + dy * 0.0055));
  };

  function poseYeux(dt) {
    const M = getM(); if (!M) return false;
    const G = M.groupe, H = M.H || {};
    G.updateMatrixWorld(true);

    if (H.yeux) { H.yeux.getWorldPosition(wp); H.yeux.getWorldQuaternion(wq); dir.set(0, 0, 1).applyQuaternion(wq); }
    else { M.tete.getWorldPosition(wp); wp.addScaledVector(wp.clone().normalize(), 0.15); G.getWorldQuaternion(wq); dir.set(0, 0, 1).applyQuaternion(wq); }

    G.worldToLocal(loc.copy(wp));
    tmp.copy(dir).transformDirection(mtx.copy(G.matrixWorld).invert());
    let yaw = Math.atan2(tmp.x, tmp.z), pitch = Math.asin(Math.max(-1, Math.min(1, tmp.y)));
    const act = getAction ? getAction() : '';
    if (act === 'observe_sky') pitch = Math.max(pitch, 0.75);
    else if (act === 'look') pitch = Math.max(pitch, 0.18);
    pitch = Math.max(-0.9, Math.min(1.25, pitch));
    loc.z += H.povAvant !== undefined ? H.povAvant * Math.cos(pitch) : 0.12;
    loc.y += H.povAvant !== undefined ? H.povAvant * Math.sin(pitch) : 0;
    if (!P.init) { P.pos.copy(loc); P.yaw = yaw; P.pitch = pitch; P.init = true; }
    const r = reduit.matches;
    const kH = r ? 1 : 1 - Math.exp(-5 * dt), kV = r ? 1 : 1 - Math.exp(-2.2 * dt), kA = r ? 1 : 1 - Math.exp(-3.2 * dt);
    P.pos.x += (loc.x - P.pos.x) * kH; P.pos.z += (loc.z - P.pos.z) * kH;
    P.pos.y += (loc.y - P.pos.y) * kV;
    P.yaw += angleVers(P.yaw, yaw) * kA; P.pitch += (pitch - P.pitch) * kA;

    if (P.t - P.touche > 1.2) { const k = r ? 1 : 1 - Math.exp(-1.1 * dt); P.lookYaw -= P.lookYaw * k; P.lookPitch -= P.lookPitch * k; }
    const y = P.yaw + P.lookYaw, p = Math.max(-1.3, Math.min(1.4, P.pitch + P.lookPitch));
    tmp.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
    pPov.copy(P.pos).applyMatrix4(G.matrixWorld);
    dir.copy(tmp).transformDirection(G.matrixWorld);
    haut.copy(pPov).normalize();

    tmp2.copy(pPov).add(dir);
    mtx.lookAt(pPov, tmp2, haut); qPov.setFromRotationMatrix(mtx);
    return true;
  }

  /** appelé à chaque image après la caméra orbitale ; bloque = true si un plan de cinéma contrôle la caméra */
  P.maj = (dt, bloque) => {
    P.t += dt;
    const but = P.voulu && !bloque ? 1 : 0;
    const vitesse = reduit.matches ? 1e9 : 1 / 0.9;
    if (P.mix < but) P.mix = Math.min(but, P.mix + dt * vitesse); else if (P.mix > but) P.mix = Math.max(but, P.mix - dt * vitesse);
    const M = getM();

    const Y = M && M.H && M.H.yeux;
    if (Y) {
      if (P.mix > 0.5 && P.yeuxAvant === null) { P.yeuxAvant = Y.visible; Y.visible = false; }
      else if (P.mix <= 0.5 && P.yeuxAvant !== null) { Y.visible = P.yeuxAvant; P.yeuxAvant = null; }
    }
    const avait = P.actif;
    P.actif = P.mix > 0.001;
    if (!P.actif) {
      if (avait) { camera.fov = P.fovBase; camera.updateProjectionMatrix(); }
      return false;
    }
    if (!poseYeux(dt)) return false;
    const e = lisse(P.mix);
    if (e < 0.9999) {
      pOrb.copy(camera.position); qOrb.copy(camera.quaternion);
      camera.position.copy(pOrb).lerp(pPov, e); camera.quaternion.copy(qOrb).slerp(qPov, e);
    } else { camera.position.copy(pPov); camera.quaternion.copy(qPov); }
    camera.up.copy(haut);
    const fov = P.fovBase + (Math.min(80, Math.max(62, 74 * (innerWidth < innerHeight ? 1.08 : 1))) - P.fovBase) * e;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    return true;
  };
  return P;
}
