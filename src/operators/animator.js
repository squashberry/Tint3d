// Skeletal animation controller for Tint3d operators.
//
// Layers (all driven by one AnimationMixer per character):
//   lower body : pelvis/legs  -> idle / walk / jog / sprint / crouch / jump states
//   upper body : spine/arms   -> same locomotion, or aim / ready pose when armed
//   overlays   : shoot recoil, hit reaction (upper body)
//   full body  : death
// Procedural passes on top of the clips: lower-body twist (strafing), aim pitch,
// knee-slide pose, two-handed weapon grip (IK + finger curl), landing squash.
import * as THREE from 'three';
import { rotateBoneWorld, setBoneWorldPosition, solveTwoBone } from './ik.js';

const clamp = THREE.MathUtils.clamp;
const approach = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const shortestAngle = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

const UPPER_RE = /^(spine_0[123]|neck_01|Head|clavicle_|upperarm_|lowerarm_|hand_|thumb_|index_|middle_|ring_|pinky_)/;
const LOWER_RE = /^(pelvis|thigh_|calf_|foot_|ball_)/;
const FINGER_RE = /^(thumb|index|middle|ring|pinky)_0[1-4](_leaf)?_[lr]$/;

const LOCOMOTION = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop',
  crouch: 'Crouch_Idle_Loop', jumpStart: 'Jump_Start', jumpLoop: 'Jump_Loop', jumpLand: 'Jump_Land'
};
const UPPER_EXTRA = { aim: 'Pistol_Aim_Neutral', ready: 'Pistol_Idle_Loop' };

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _right = new THREE.Vector3();
const _gp = new THREE.Vector3();
const _qg = new THREE.Quaternion();
const _qf = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _pHand = new THREE.Vector3();
const _pBack = new THREE.Vector3();
const _qHand = new THREE.Quaternion();
const _qBack = new THREE.Quaternion();

/** Splits every clip into upper / lower body variants and extracts a hand grip pose. */
export function buildClipSet(animations) {
  const set = { full: {}, upper: {}, lower: {}, grip: {} };
  for (const clip of animations) {
    set.full[clip.name] = clip;
    const split = (regex, suffix) => new THREE.AnimationClip(
      clip.name + suffix, clip.duration,
      clip.tracks.filter((track) => regex.test(track.name.split('.')[0]))
    );
    set.upper[clip.name] = split(UPPER_RE, ':upper');
    set.lower[clip.name] = split(LOWER_RE, ':lower');
  }
  // The pistol idle clip already curls the right-hand fingers around a handle.
  // Mirror it for the left hand (mirrored rig: x and w stay, y and z flip).
  const pistol = set.full.Pistol_Idle_Loop;
  if (pistol) {
    for (const track of pistol.tracks) {
      const [bone, property] = track.name.split('.');
      if (property !== 'quaternion' || !FINGER_RE.test(bone) || !bone.endsWith('_r')) continue;
      const q = new THREE.Quaternion().fromArray(track.values, 0);
      set.grip[bone] = q;
      set.grip[bone.replace(/_r$/, '_l')] = new THREE.Quaternion(q.x, -q.y, -q.z, q.w);
    }
  }
  return set;
}

export class OperatorAnimator {
  constructor({ group, modelRoot, bones, clips }) {
    this.group = group;
    this.modelRoot = modelRoot;
    this.bones = bones;
    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(modelRoot);

    this.lower = {};
    this.upper = {};
    for (const [key, clipName] of Object.entries(LOCOMOTION)) {
      this.lower[key] = this._entry(clips.lower[clipName]);
      this.upper[key] = this._entry(clips.upper[clipName]);
    }
    for (const [key, clipName] of Object.entries(UPPER_EXTRA)) {
      this.upper[key] = this._entry(clips.upper[clipName]);
    }
    this.shoot = this._entry(clips.upper.Pistol_Shoot);
    this.hit = this._entry(clips.upper.Hit_Chest);
    this.lower.idle.w = 1;
    this.upper.idle.w = 1;

    this.deathAction = null;
    this.dead = false;

    this.phase = 0;
    this.idlePhase = Math.random();
    this.airPhase = 0;
    this.crouchPhase = 0;
    this.airTime = 0;
    this.landTimer = 0;
    this.wasAirborne = false;
    this.slideBlend = 0;
    this.twist = 0;
    this.hitClock = 99;
    this.armedBlend = 1;

    this.prevPosition = new THREE.Vector3();
    this.hasPrev = false;
    this.velocity = new THREE.Vector3();
    this.speed = 0;

    // Weapon sockets (weapon-local) and holders (bone-local, set by the factory).
    this.sockets = { right: new THREE.Vector3(0, -0.05, 0.10), left: new THREE.Vector3(0, -0.04, -0.28) };
    this.handHolder = null;
    this.backHolder = null;
    this.handOffsetQuaternion = new THREE.Quaternion();
    this.palmPoint = new THREE.Vector3(0, 0.07, 0);
    this.gripBones = [];
    for (const name of Object.keys(clips.grip)) {
      if (bones.has(name)) this.gripBones.push({ bone: bones.get(name), pose: clips.grip[name] });
    }
  }

  _entry(clip) {
    if (!clip) throw new Error('Operator animation clip missing');
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.timeScale = 0; // time is driven manually so cycles stay phase-locked
    action.weight = 0;
    action.play();
    return { action, clip, w: 0 };
  }

  /** Rotation that turns the hand bone's frame into a level, forward-facing weapon frame. */
  computeAimReference() {
    const entry = this._entry(this.clips.upper.Pistol_Aim_Neutral);
    entry.action.time = 0;
    entry.action.weight = 1;
    this.mixer.update(0);
    this.group.updateMatrixWorld(true);
    this.bones.get('hand_r').getWorldQuaternion(_qt);
    this.group.getWorldQuaternion(_qg);
    const handInGroup = _qg.clone().invert().multiply(_qt);
    this.handOffsetQuaternion.copy(handInGroup).invert();
    entry.action.stop();
    this.mixer.uncacheAction(entry.clip, this.modelRoot);
    this.group.updateMatrixWorld(true);
  }

  /** Re-fit the weapon holder and grips to a weapon whose local bounds are `box`. */
  setWeaponFit(box) {
    const length = Math.max(0.1, box.max.z - box.min.z);
    const height = Math.max(0.05, box.max.y - box.min.y);
    const cx = (box.min.x + box.max.x) / 2;
    this.sockets.right.set(cx, box.min.y + height * 0.24, box.max.z - length * 0.30);
    this.sockets.left.set(cx, box.min.y + height * 0.42, box.min.z + length * 0.32);
    if (this.handHolder) {
      this.handHolder.quaternion.copy(this.handOffsetQuaternion);
      _v1.copy(this.sockets.right).applyQuaternion(this.handOffsetQuaternion);
      this.handHolder.position.copy(this.palmPoint).sub(_v1);
    }
  }

  playDeath() {
    this.dead = true;
    for (const layer of [this.lower, this.upper]) {
      for (const entry of Object.values(layer)) { entry.w = 0; entry.action.weight = 0; }
    }
    this.shoot.action.weight = 0;
    this.hit.action.weight = 0;
    this.deathAction = this.mixer.clipAction(this.clips.full.Death01);
    this.deathAction.reset();
    this.deathAction.setLoop(THREE.LoopOnce, 1);
    this.deathAction.clampWhenFinished = true;
    this.deathAction.timeScale = 1.45;
    this.deathAction.weight = 1;
    this.deathAction.play();
  }

  updateDeath(dt, weaponBlend, weapon) {
    this.mixer.update(dt);
    this.group.updateMatrixWorld(true);
    if (weapon) this._placeWeapon(weapon, weaponBlend, 0);
  }

  reset() {
    if (this.deathAction) { this.deathAction.stop(); this.deathAction = null; }
    this.dead = false;
    for (const layer of [this.lower, this.upper]) {
      for (const [key, entry] of Object.entries(layer)) entry.w = key === 'idle' ? 1 : 0;
    }
    this.hitClock = 99;
    this.slideBlend = 0;
    this.twist = 0;
    this.airTime = 0;
    this.landTimer = 0;
    this.wasAirborne = false;
    this.hasPrev = false;
    this.velocity.set(0, 0, 0);
  }

  triggerHit() { this.hitClock = 0; }

  _applyWeights(layer, targets, dt, rate) {
    let sum = 0;
    for (const [key, entry] of Object.entries(layer)) {
      entry.w = approach(entry.w, targets[key] || 0, rate, dt);
      sum += entry.w;
    }
    if (sum < 1e-4) { layer.idle.w = 1; sum = 1; }
    return sum;
  }

  /**
   * actor: game actor (position, grounded, sliding, recoil, aimElevation, ...)
   * weapon: the weapon Object3D living in group space
   * state: { weaponBlend, shotTimer, shooting(0..1), isPlayer }
   */
  update(dt, actor, weapon, state, detail = 1) {
    if (this.dead) return;
    const pos = actor.position;

    // --- movement analysis -------------------------------------------------
    if (dt > 0) {
      if (this.hasPrev) {
        _v1.set((pos.x - this.prevPosition.x) / dt, 0, (pos.z - this.prevPosition.z) / dt);
        if (_v1.length() > 40) _v1.set(0, 0, 0); // teleport / respawn
        this.velocity.lerp(_v1, 1 - Math.exp(-14 * dt));
      }
      this.prevPosition.copy(pos);
      this.hasPrev = true;
    }
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.speed = speed;
    const yaw = this.group.rotation.y;
    const forward = -(this.velocity.x * Math.sin(yaw) + this.velocity.z * Math.cos(yaw));
    const side = this.velocity.x * Math.cos(yaw) - this.velocity.z * Math.sin(yaw);
    let moveAngle = Math.atan2(side, forward);
    let direction = 1;
    if (Math.abs(moveAngle) > 2.0) {
      direction = -1;
      moveAngle -= Math.sign(moveAngle) * Math.PI;
    }
    const sliding = !!actor.sliding;
    const grounded = actor.grounded !== false;

    // --- air / landing state -----------------------------------------------
    if (dt > 0) {
      if (!grounded) { this.airTime += dt; this.airPhase = (this.airPhase + dt / 2.5) % 1; }
      else {
        if (this.wasAirborne && this.airTime > 0.22) this.landTimer = 0.4;
        this.airTime = 0;
      }
      this.wasAirborne = this.airTime > 0.07;
      this.landTimer = Math.max(0, this.landTimer - dt);
      this.hitClock += dt;
      this.slideBlend = approach(this.slideBlend, sliding ? 1 : 0, 13, dt);
      const twistTarget = speed > 0.8 && grounded
        ? clamp(moveAngle, -1.75, 1.75) * clamp((speed - 0.8) / 2.2, 0, 1)
        : 0;
      this.twist += shortestAngle(this.twist, twistTarget) * (1 - Math.exp(-10 * dt));
    }
    const airborne = this.airTime > 0.07;

    // --- phase / cycle rate ------------------------------------------------
    let cycleRate;
    if (speed < 2.6) cycleRate = 0.5 + speed * 0.27;
    else if (speed < 8.4) cycleRate = 1.2 + (speed - 2.6) * 0.12;
    else cycleRate = 1.9 - Math.min(speed - 8.4, 6) * 0.02;
    if (dt > 0) {
      this.phase = (this.phase + dt * cycleRate * direction + 1) % 1;
      this.idlePhase = (this.idlePhase + dt / 2.5) % 1;
      this.crouchPhase = (this.crouchPhase + dt / 2.93) % 1;
    }

    // --- lower body targets --------------------------------------------------
    const lowerTargets = {};
    if (this.slideBlend > 0.5) lowerTargets.crouch = 1;
    else if (airborne) lowerTargets[this.airTime < 0.2 ? 'jumpStart' : 'jumpLoop'] = 1;
    else if (this.landTimer > 0.1) lowerTargets.jumpLand = 1;
    else if (speed < 0.4) lowerTargets.idle = 1;
    else if (speed < 2.6) { const t = (speed - 0.4) / 2.2; lowerTargets.idle = 1 - t; lowerTargets.walk = t; }
    else if (speed < 8.4) { const t = (speed - 2.6) / 5.8; lowerTargets.walk = 1 - t; lowerTargets.jog = t; }
    else if (speed < 13.8) { const t = (speed - 8.4) / 5.4; lowerTargets.jog = 1 - t; lowerTargets.sprint = t; }
    else lowerTargets.sprint = 1;
    this._applyWeights(this.lower, lowerTargets, dt, 11);

    // --- upper body targets --------------------------------------------------
    const armed = clamp(state.weaponBlend, 0, 1) * (this.slideBlend > 0.5 ? 0 : 1) * (airborne ? 0.75 : 1);
    this.armedBlend = approach(this.armedBlend, armed, 12, Math.max(dt, 0.0001));
    const aimBias = state.isPlayer ? 0.8 : 0.55;
    const aimAmount = clamp(Math.max(aimBias, state.shooting), 0, 1);
    const upperTargets = {};
    for (const [key, value] of Object.entries(lowerTargets)) upperTargets[key] = value * (1 - this.armedBlend);
    upperTargets.aim = this.armedBlend * aimAmount;
    upperTargets.ready = this.armedBlend * (1 - aimAmount);
    const upperSum = this._applyWeights(this.upper, upperTargets, dt, 11);

    // Overlays: recoil kick and hit flinch squeeze the base upper-body weights.
    const shootWeight = state.shooting * 0.5 * this.armedBlend;
    const hitProgress = clamp(this.hitClock / 0.42, 0, 1);
    const hitWeight = hitProgress < 1 ? Math.sin(Math.PI * hitProgress) * 0.85 : 0;
    const overlay = Math.min(0.95, shootWeight + hitWeight);
    const baseScale = (1 - overlay) / upperSum;

    // --- push weights and times to the mixer --------------------------------
    const lowerSum = Object.values(this.lower).reduce((total, e) => total + e.w, 0) || 1;
    for (const entry of Object.values(this.lower)) entry.action.weight = entry.w / lowerSum;
    for (const entry of Object.values(this.upper)) entry.action.weight = entry.w * baseScale;
    this.shoot.action.weight = shootWeight > 0.001 ? shootWeight : 0;
    this.hit.action.weight = hitWeight > 0.001 ? hitWeight : 0;
    this.shoot.action.time = clamp((0.30 - state.shotTimer) * 0.9, 0, this.shoot.clip.duration - 0.01);
    this.hit.action.time = clamp(this.hitClock, 0, this.hit.clip.duration - 0.01);

    const setTimes = (layer) => {
      const duration = (key) => layer[key].clip.duration;
      layer.idle.action.time = this.idlePhase * duration('idle');
      layer.walk.action.time = this.phase * duration('walk');
      layer.jog.action.time = this.phase * duration('jog');
      layer.sprint.action.time = this.phase * duration('sprint');
      layer.crouch.action.time = this.crouchPhase * duration('crouch');
      layer.jumpStart.action.time = Math.min(this.airTime * 1.8, duration('jumpStart') - 0.01);
      layer.jumpLoop.action.time = this.airPhase * duration('jumpLoop');
      layer.jumpLand.action.time = clamp((0.4 - this.landTimer) * 3.0, 0, duration('jumpLand') - 0.01);
    };
    setTimes(this.lower);
    setTimes(this.upper);
    this.upper.aim.action.time = 0;
    this.upper.ready.action.time = this.idlePhase * this.upper.ready.clip.duration;

    this.mixer.update(dt);
    this.group.updateMatrixWorld(true);

    // --- procedural passes ---------------------------------------------------
    this.group.getWorldQuaternion(_qg);
    this.group.getWorldPosition(_gp);
    _right.set(1, 0, 0).applyQuaternion(_qg);
    const bones = this.bones;
    const pelvis = bones.get('pelvis');
    const spines = [bones.get('spine_01'), bones.get('spine_02'), bones.get('spine_03')];

    // Lower body faces the travel direction, chest stays on the aim direction.
    if (Math.abs(this.twist) > 0.002) {
      rotateBoneWorld(pelvis, UP, -this.twist);
      rotateBoneWorld(spines[0], UP, this.twist * 0.34);
      rotateBoneWorld(spines[1], UP, this.twist * 0.33);
      rotateBoneWorld(spines[2], UP, this.twist * 0.33);
    }

    // Knee slide: drop the hips, lean back, plant one knee and extend the other leg.
    const slide = this.slideBlend;
    if (slide > 0.02) {
      _qf.setFromAxisAngle(UP, -this.twist);
      _qf.premultiply(_qg);
      const toWorld = (target, x, y, z) => target.set(x, y, z).applyQuaternion(_qf).add(_gp);
      pelvis.getWorldPosition(_v1);
      toWorld(_v2, 0, 0.60, 0.12);
      setBoneWorldPosition(pelvis, _v1.lerp(_v2, slide));
      rotateBoneWorld(pelvis, _right, 0.30 * slide);
      for (const spine of spines) rotateBoneWorld(spine, _right, 0.09 * slide);
      solveTwoBone(
        bones.get('thigh_l'), bones.get('calf_l'), bones.get('foot_l'),
        toWorld(_v1, -0.13, 0.10, -0.62), toWorld(_v2, -0.10, 0.75, -1.20), slide
      );
      solveTwoBone(
        bones.get('thigh_r'), bones.get('calf_r'), bones.get('foot_r'),
        toWorld(_v3, 0.17, 0.13, 0.28), toWorld(_v4, 0.20, 0.15, -1.00), slide
      );
    }

    // Aim pitch is spread over the spine and neck (axis-agnostic, world space).
    const elevation = clamp(actor.aimElevation || 0, -0.9, 0.9) * (0.45 + 0.55 * this.armedBlend);
    if (Math.abs(elevation) > 0.002) {
      rotateBoneWorld(spines[0], _right, elevation * 0.20);
      rotateBoneWorld(spines[1], _right, elevation * 0.30);
      rotateBoneWorld(spines[2], _right, elevation * 0.30);
      rotateBoneWorld(bones.get('neck_01'), _right, elevation * 0.15);
    }

    // Landing squash.
    if (actor.landImpact > 0.01) {
      pelvis.getWorldPosition(_v1);
      _v1.y -= actor.landImpact * 0.07;
      setBoneWorldPosition(pelvis, _v1);
    }

    // --- weapon + two-handed grip ---------------------------------------------
    if (weapon) {
      this._placeWeapon(weapon, state.weaponBlend, actor.recoil || 0);
      if (detail > 0 && this.armedBlend > 0.04) this._gripWeapon(weapon);
    }
  }

  _placeWeapon(weapon, blend, recoil) {
    if (!this.handHolder || !this.backHolder) return;
    _m1.copy(this.group.matrixWorld).invert();
    this.handHolder.updateWorldMatrix(true, false);
    _m2.multiplyMatrices(_m1, this.handHolder.matrixWorld).decompose(_pHand, _qHand, _s);
    this.backHolder.updateWorldMatrix(true, false);
    _m2.multiplyMatrices(_m1, this.backHolder.matrixWorld).decompose(_pBack, _qBack, _s);
    const b = clamp(blend, 0, 1);
    weapon.position.copy(_pBack).lerp(_pHand, b);
    weapon.quaternion.copy(_qBack).slerp(_qHand, b);
    weapon.translateZ(recoil * 0.55 * b);
    weapon.updateMatrix();
    weapon.updateMatrixWorld(true);
  }

  _gripWeapon(weapon) {
    const blend = this.armedBlend;
    const bones = this.bones;
    const upperArm = bones.get('upperarm_l');
    const lowerArm = bones.get('lowerarm_l');
    const hand = bones.get('hand_l');
    weapon.localToWorld(_v1.copy(this.sockets.left));
    lowerArm.getWorldPosition(_v2);
    hand.getWorldPosition(_v3);
    _v3.sub(_v2).normalize();
    _v1.addScaledVector(_v3, -this.palmPoint.y * 0.9);
    this.group.getWorldQuaternion(_qg);
    this.group.getWorldPosition(_gp);
    _v4.set(-0.65, 0.85, 0.30).applyQuaternion(_qg).add(_gp);
    solveTwoBone(upperArm, lowerArm, hand, _v1, _v4, 0.97 * blend);
    const weight = 0.92 * blend;
    for (const item of this.gripBones) item.bone.quaternion.slerp(item.pose, weight);
    hand.updateWorldMatrix(false, true);
    bones.get('hand_r').updateWorldMatrix(false, true);
  }
}
