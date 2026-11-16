// Axis-agnostic skeleton helpers. The Quaternius rig has unusual bone-local axes
// (the root bone carries a -90 degree X rotation), so everything here works in
// world space and converts back to each bone's local space.
import * as THREE from 'three';

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _qId = new THREE.Quaternion();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _vT = new THREE.Vector3();
const _vP = new THREE.Vector3();
const _vN = new THREE.Vector3();
const _vD0 = new THREE.Vector3();
const _vD1 = new THREE.Vector3();

export function setBoneWorldQuaternion(bone, worldQuaternion) {
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_qb).invert();
  bone.quaternion.copy(_qb.multiply(worldQuaternion));
  bone.updateWorldMatrix(false, true);
}

export function rotateBoneWorld(bone, axis, angle) {
  if (!angle) return;
  bone.getWorldQuaternion(_qa);
  _qc.setFromAxisAngle(axis, angle).multiply(_qa);
  setBoneWorldQuaternion(bone, _qc);
}

export function setBoneWorldPosition(bone, position) {
  bone.parent.updateWorldMatrix(true, false);
  _vA.copy(position);
  bone.position.copy(bone.parent.worldToLocal(_vA));
  bone.updateWorldMatrix(false, true);
}

function rotateBoneTowards(bone, from, to, weight) {
  _qc.setFromUnitVectors(from, to);
  if (weight < 1) _qc.copy(_qId.identity()).slerp(_qc, weight);
  bone.getWorldQuaternion(_qa);
  _qc.multiply(_qa);
  setBoneWorldQuaternion(bone, _qc);
}

/**
 * Two-bone IK (arm or leg). Moves the tip joint toward `target`, bending the
 * middle joint toward `pole`. All inputs are world-space.
 */
export function solveTwoBone(root, mid, tip, target, pole, weight = 1) {
  if (weight <= 0.001) return false;
  root.updateWorldMatrix(true, false);
  root.getWorldPosition(_vA);
  mid.getWorldPosition(_vB);
  tip.getWorldPosition(_vC);
  const l1 = _vA.distanceTo(_vB);
  const l2 = _vB.distanceTo(_vC);
  _vT.copy(target).sub(_vA);
  let d = _vT.length();
  if (d < 1e-5 || l1 < 1e-5 || l2 < 1e-5) return false;
  _vT.divideScalar(d);
  d = THREE.MathUtils.clamp(d, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const x = (d * d + l1 * l1 - l2 * l2) / (2 * d);
  const h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
  _vP.copy(pole).sub(_vA);
  _vP.addScaledVector(_vT, -_vP.dot(_vT));
  if (_vP.lengthSq() < 1e-8) {
    _vP.copy(_vB).sub(_vA);
    _vP.addScaledVector(_vT, -_vP.dot(_vT));
    if (_vP.lengthSq() < 1e-8) return false;
  }
  _vP.normalize();
  _vN.copy(_vA).addScaledVector(_vT, x).addScaledVector(_vP, h);

  // 1) Swing the upper bone so the middle joint lands on the solved elbow/knee.
  _vD0.copy(_vB).sub(_vA).normalize();
  _vD1.copy(_vN).sub(_vA).normalize();
  rotateBoneTowards(root, _vD0, _vD1, weight);

  // 2) Swing the lower bone so the tip reaches the (clamped) target.
  mid.getWorldPosition(_vB);
  tip.getWorldPosition(_vC);
  _vT.multiplyScalar(d).add(_vA);
  _vD0.copy(_vC).sub(_vB).normalize();
  _vD1.copy(_vT).sub(_vB).normalize();
  rotateBoneTowards(mid, _vD0, _vD1, weight);
  return true;
}
