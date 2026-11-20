// DeploymentSystem — jump window, jump transform, and a demo umbrella-glider drop (no human characters).
//
//   const d = experience.deployment;
//   d.isJumpAvailable()                 -> true while the green lamp is on
//   d.getJumpTransform()                -> { position, quaternion, velocity } at the end of the open ramp
//   d.getJumpWindow()                   -> { start, end, route: [{x,y,z}...] }  (sequence seconds)
//   d.deployCharacter(characterRoot)    -> creates a glider for a real character (hook; see docs)
//   d.launchDemoGlider()                -> drops an empty payload pod under an umbrella glider (visual demo)

import * as THREE from 'three';
import { UmbrellaGlider, GLIDER_PRESETS } from './glider.js';
import { clamp01 } from './effects.js';

const GRAVITY = 9.8;

export class DeploymentSystem {
  constructor({ scene, aircraft, sequence, island, demo = true }) {
    this.scene = scene;
    this.aircraft = aircraft;
    this.sequence = sequence;
    this.island = island;
    this.demo = demo;
    this.flyers = [];
    this.wind = new THREE.Vector3(5.5, 0, 2);
    this._launches = [];
    this._v = new THREE.Vector3();
    this._p = new THREE.Vector3();
    sequence.on('deployAvailable', () => { if (this.demo) this._scheduleDemo(); });
  }

  isJumpAvailable() { const t = this.sequence.time; return t >= this.sequence.T.deployOpen && t < this.sequence.T.deployClose; }
  getJumpWindow() {
    const p = this.sequence.path;
    const route = [];
    for (let s = p.sDeployStart; s <= p.sDeployEnd; s += 100) route.push(p.sample(s, {}));
    return { start: this.sequence.T.deployOpen, end: this.sequence.T.deployClose, route };
  }
  getJumpTransform() {
    const ac = this.aircraft;
    ac.group.updateMatrixWorld(true);
    const position = ac.rampEnd.getWorldPosition(new THREE.Vector3());
    const quaternion = ac.group.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const velocity = fwd.multiplyScalar(this.sequence.speed || 0);
    return { position, quaternion, velocity };
  }
  get firstGlider() { return this.flyers.length ? this.flyers[0].glider.group : null; }

  _scheduleDemo() {
    const presets = ['tint3d', 'coral', 'magenta', 'lime', 'tint3d'];
    [0.8, 2.3, 4.0, 5.9, 8.0].forEach((delay, i) => this._launches.push({ at: this.sequence.time + delay, preset: presets[i] }));
  }

  launchDemoGlider(presetName = 'tint3d', withPayload = true) {
    const glider = new UmbrellaGlider({ colors: GLIDER_PRESETS[presetName], scale: 1.35 });
    const group = new THREE.Group();
    group.add(glider.group);
    let pod = null;
    if (withPayload) {
      // a plain supply canister on the harness point — deliberately not a character
      pod = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.0, 12), new THREE.MeshStandardMaterial({ color: 0x2a323c, roughness: 0.5, metalness: 0.6 }));
      pod.position.copy(glider.attach.harness.position).add(new THREE.Vector3(0, -0.5, 0));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.14, 12), new THREE.MeshBasicMaterial({ color: GLIDER_PRESETS[presetName].glow }));
      band.position.y = 0.2;
      pod.add(band);
      glider.group.add(pod);
    }
    const jt = this.getJumpTransform();
    group.position.copy(jt.position).add(new THREE.Vector3(-1, 0.5, (Math.random() - 0.5) * 2));
    this.scene.add(group, glider.trail.points);
    glider.setWind(this.wind);
    glider.setTrail(true);
    const f = { glider, group, pod, vel: jt.velocity.clone().multiplyScalar(0.75).add(new THREE.Vector3(0, -2, 0)), state: 'freefall', t: 0, age: 0, heading: Math.atan2(jt.velocity.z, jt.velocity.x) };
    this.flyers.push(f);
    return f;
  }

  // Hook for the future: build a glider for a real character. The character system keeps ownership of the
  // character; we expose the attach points so its hand / chest can be constrained to them each frame.
  deployCharacter(characterRoot, { preset = 'tint3d', scale = 1, handOffset, harnessOffset } = {}) {
    const glider = new UmbrellaGlider({ colors: GLIDER_PRESETS[preset], scale });
    if (handOffset || harnessOffset) glider.setAttachmentConfig({ hand: handOffset, harness: harnessOffset });
    this.scene.add(glider.group, glider.trail.points);
    glider.setWind(this.wind);
    const ctl = {
      glider,
      attach: glider.attach, // AttachPoint_Hand / AttachPoint_Harness / AttachPoint_Root
      open: () => glider.open(),
      close: () => glider.close(),
      follow() { glider.group.position.copy(characterRoot.position); glider.group.quaternion.copy(characterRoot.quaternion); },
      update: (dt, t) => glider.update(dt, t),
      dispose: () => { this.scene.remove(glider.group, glider.trail.points); glider.dispose(); }
    };
    return ctl;
  }

  update(dt, t) {
    const seqT = this.sequence.time;
    for (let i = this._launches.length - 1; i >= 0; i--) {
      if (seqT >= this._launches[i].at) { this.launchDemoGlider(this._launches[i].preset); this._launches.splice(i, 1); }
    }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.age += dt;
      const v = f.vel;
      const g = f.group.position;
      if (f.state === 'freefall') {
        v.y -= GRAVITY * dt;
        v.multiplyScalar(1 - 0.12 * dt);
        if (f.age > 1.5) { f.state = 'open'; f.glider.open(1.1); }
      } else {
        const open = clamp01(f.glider.openAmount);
        const targetV = this._v.set(this.wind.x + Math.cos(f.heading) * 11 * open, -5.4 - (1 - open) * 20, this.wind.z + Math.sin(f.heading) * 11 * open);
        v.lerp(targetV, 1 - Math.exp(-dt * (1.2 + 1.5 * open)));
        f.heading += Math.sin(f.age * 0.5 + i) * 0.02 * dt;
      }
      g.addScaledVector(v, dt);
      // pendulum sway towards the flight direction and bank into the turn
      f.group.rotation.set(0, -Math.atan2(v.z, v.x) + Math.PI / 2, 0);
      f.glider.update(dt, t);
      const ground = this.island?.heightAt ? Math.max(0, this.island.heightAt(g.x, g.z)) : 0;
      if (g.y < ground + 1.0 || f.age > 40) {
        this.scene.remove(f.group, f.glider.trail.points);
        f.glider.dispose();
        this.flyers.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const f of this.flyers) { this.scene.remove(f.group, f.glider.trail.points); f.glider.dispose(); }
    this.flyers.length = 0;
  }
}
