// BoardingSystem — integration points for placing real characters (later) on the deck and in the aircraft.
// No characters are created here. This module only exposes named transforms and a slot registry.
//
//   const b = experience.boarding;
//   b.getSpawnPoint(i)                    -> { position, quaternion } on the flight-deck staging grid (100 slots)
//   b.assignSlot(playerId)                -> aircraft slot index (seats first, then standing places) or -1
//   b.getBoardingRoute(spawnIdx, slotIdx) -> world-space waypoints: deck pad -> lane -> ramp -> bay -> slot
//   b.attachCharacter(root, slotIdx)      -> parents a character Object3D to the slot (keeps world transform)
//   b.isBoardingOpen() / getBoardingWindow()

import * as THREE from 'three';

export class BoardingSystem {
  constructor({ carrier, aircraft, sequence }) {
    this.carrier = carrier;
    this.aircraft = aircraft;
    this.sequence = sequence;
    this.slotOwner = new Map(); // slotIndex -> playerId
    this.playerSlot = new Map();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  get capacity() { return this.aircraft.boardingSlots.length; }
  get spawnCount() { return this.carrier.anchors.spawnGrid.children.length; }

  // ---------------------------------------------------------------- flight deck
  getSpawnPoint(index, outPos = new THREE.Vector3(), outQuat = new THREE.Quaternion()) {
    const o = this.carrier.anchors.spawnGrid.children[index];
    this.carrier.group.updateWorldMatrix(true, false);
    o.getWorldPosition(outPos);
    // face the boarding ramp (towards -Z / the runway) by default
    outQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    return { position: outPos, quaternion: outQuat, index };
  }

  // ---------------------------------------------------------------- aircraft slots
  getSlot(index) { return this.aircraft.boardingSlots[index]; }
  getSlotTransform(index, outPos = new THREE.Vector3(), outQuat = new THREE.Quaternion()) {
    const s = this.getSlot(index);
    s.updateWorldMatrix(true, false);
    s.getWorldPosition(outPos);
    s.getWorldQuaternion(outQuat);
    return { position: outPos, quaternion: outQuat, type: s.userData.type };
  }
  assignSlot(playerId) {
    if (this.playerSlot.has(playerId)) return this.playerSlot.get(playerId);
    for (let i = 0; i < this.capacity; i++) {
      if (!this.slotOwner.has(i)) { this.slotOwner.set(i, playerId); this.playerSlot.set(playerId, i); return i; }
    }
    return -1;
  }
  releaseSlot(playerId) {
    const i = this.playerSlot.get(playerId);
    if (i === undefined) return;
    this.slotOwner.delete(i);
    this.playerSlot.delete(playerId);
  }

  // Waypoints in world space: pad -> boarding lane -> bottom of ramp -> top of ramp -> slot.
  getBoardingRoute(spawnIndex, slotIndex) {
    const ac = this.aircraft;
    ac.group.updateMatrixWorld(true);
    const pts = [];
    pts.push(this.getSpawnPoint(spawnIndex).position.clone());
    const rampEnd = ac.rampEnd.getWorldPosition(new THREE.Vector3());
    const lane = rampEnd.clone();
    lane.z += 38;
    lane.x += 3;
    pts.push(lane);
    pts.push(rampEnd.clone().add(new THREE.Vector3(0, 0, 8)));
    pts.push(rampEnd);
    pts.push(ac.anchors.Anchor_RampTop.getWorldPosition(new THREE.Vector3()));
    pts.push(this.getSlotTransform(slotIndex).position);
    return pts;
  }

  // Parent a character to a slot (keeps its world transform; the character system stays in charge of animation).
  attachCharacter(root, slotIndex) {
    const slot = this.getSlot(slotIndex);
    slot.attach(root);
    slot.userData.occupant = root;
    return slot;
  }
  detachCharacter(root, newParent) {
    newParent.attach(root);
  }

  isBoardingOpen() { const t = this.sequence.time; return t >= this.sequence.T.boardingOpen && t < this.sequence.T.rampClose0; }
  getBoardingWindow() { const T = this.sequence.T; return { open: T.boardingOpen, finalCall: T.finalCall, close: T.rampClose0 }; }
  on(evt, fn) { this.sequence.on(evt, fn); return this; }
}
