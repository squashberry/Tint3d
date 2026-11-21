// DeploymentCamera — the cinematic shot list for the whole sequence.
// Each shot is a small rig function; shots cross-blend (position, target, field of view) so there are no accidental cuts.

import * as THREE from 'three';
import { CARRIER_ORIGIN as O } from './constants.js';
import { lerp, easeInOut, clamp01 } from './effects.js';

const v3 = () => new THREE.Vector3();

export class DeploymentCamera {
  // ctx: { T (timeline), aircraft (TransportAircraft), getGlider(): THREE.Object3D|null }
  constructor(camera, ctx) {
    this.camera = camera;
    this.ctx = ctx;
    this.focus = v3();
    this.override = null; // (dt, t, pose) => void  — free camera / future player-follow
    this.cur = -1;
    this.prev = -1;
    this.blendT = 1;
    this.poses = { a: this._pose(), b: this._pose(), out: this._pose() };
    this._tmp = [v3(), v3(), v3(), v3()];
    this.shots = this._shots();
    this.shotName = '';
    this._fov = 50;
  }

  _pose() { return { pos: v3(), target: v3(), fov: 50, shake: 0 }; }
  C(x, y, z, out) { return out.set(O.x + x, O.y + y, O.z + z); }
  A(x, y, z, out) { return this.ctx.aircraft.group.localToWorld(out.set(x, y, z)); }

  _shots() {
    const T = this.ctx.T;
    const ease = easeInOut;
    const ac = this.ctx.aircraft;
    const P = (shot) => Object.assign({ blend: 1.1, shake: 0, track: 0, _ts: null, _ps: null }, shot);
    const a1 = v3();
    return [
      P({ name: 'establishing', t0: 0, t1: T.introEnd, blend: 0.01, rig: (u, t, p) => {
        const e = ease(u);
        this.C(lerp(650, -300, e), lerp(95, 60, e), lerp(520, 380, e), p.pos);
        this.C(lerp(100, -150, e), lerp(40, 35, e), lerp(0, -20, e), p.target);
        p.fov = lerp(40, 48, u);
      } }),
      P({ name: 'deckLow', t0: T.introEnd, t1: T.approachStart + 8, blend: 1.8, rig: (u, t, p) => {
        this.C(-40 + 25 * u, 29.8, 34 - 10 * u, p.pos);
        this.C(-380 + 60 * u, 50 + 10 * u, -60, p.target);
        p.fov = 60;
      } }),
      P({ name: 'approach', t0: T.approachStart + 8, t1: T.touchdown - 3.5, blend: 1.4, track: 8, rig: (u, t, p) => {
        this.C(-330, 31, -92, p.pos);
        p.target.copy(ac.group.position);
        p.fov = 26;
      } }),
      P({ name: 'landing', t0: T.touchdown - 3.5, t1: T.touchdown + 6, blend: 0.6, track: 12, rig: (u, t, p) => {
        this.C(-345, 29.9, -30, p.pos);
        this.A(8, 3, 0, p.target);
        p.fov = 46;
      } }),
      P({ name: 'taxi', t0: T.touchdown + 6, t1: T.stop - 2, blend: 1.4, track: 6, rig: (u, t, p) => {
        this.C(24, 31.2, 16, p.pos);
        this.A(0, 5, 0, p.target);
        p.fov = 44;
      } }),
      P({ name: 'rampOpen', t0: T.stop - 2, t1: T.rampOpen1 + 5, blend: 1.6, rig: (u, t, p) => {
        const e = ease(u);
        this.A(lerp(-74, -55, e), lerp(6.8, 4.4, e), lerp(19, 8, e), p.pos);
        this.A(-34, 4.6, 0, p.target);
        p.fov = 52;
      } }),
      P({ name: 'bayInterior', t0: T.rampOpen1 + 5, t1: T.finalCall, blend: 1.4, rig: (u, t, p) => {
        this.A(14, 5.7, 0.6 + Math.sin(t * 0.3) * 0.5, p.pos);
        this.A(-34, 4.2, Math.sin(t * 0.23) * 0.7, p.target);
        p.fov = 66;
      } }),
      P({ name: 'rampFinal', t0: T.finalCall, t1: T.rampClose1 + 1, blend: 1.2, rig: (u, t, p) => {
        this.A(lerp(-82, -62, u), lerp(10, 7, u), lerp(27, 17, u), p.pos);
        this.A(-36, 4.8, 0, p.target);
        p.fov = 50;
      } }),
      P({ name: 'powerup', t0: T.rampClose1 + 1, t1: T.takeoffStart - 0.2, blend: 1.2, shake: 0.06, rig: (u, t, p) => {
        this.C(78, 30.8, 4, p.pos);
        this.A(-3, 5.2, 13, p.target);
        p.fov = 36;
        p.shake = 0.03 + 0.09 * u;
      } }),
      P({ name: 'takeoff', t0: T.takeoffStart - 0.2, t1: T.liftoff + 2.5, blend: 0.35, track: 7, shake: 0.03, rig: (u, t, p) => {
        this.C(335, 31, 6, p.pos);
        this.A(6, 4, 0, p.target);
        p.fov = 32;
      } }),
      P({ name: 'aerialFollow', t0: T.liftoff + 2.5, t1: T.liftoff + 9.5, blend: 1.0, track: 3, rig: (u, t, p) => {
        this.A(-95, 18, 38, p.pos);
        this.A(8, 6, 0, p.target);
        p.fov = 54;
      } }),
      P({ name: 'islandApproach', t0: T.liftoff + 9.5, t1: T.deployOpen - 6.5, blend: 1.6, track: 2, rig: (u, t, p) => {
        this.A(-64, 20, 14, p.pos);
        this.A(520, -45, 0, p.target);
        p.fov = 56;
      } }),
      P({ name: 'cockpit', t0: T.deployOpen - 6.5, t1: T.deployOpen - 3.5, blend: 1.4, shake: 0.015, rig: (u, t, p) => {
        this.A(31.2, 6.5, 0.15, p.pos);
        this.A(120, 2.2, 0, p.target);
        p.fov = 70;
      } }),
      P({ name: 'deployBay', t0: T.deployOpen - 3.5, t1: T.deployOpen + 9, blend: 1.2, shake: 0.04, rig: (u, t, p) => {
        this.A(12, 5.4, 0.4, p.pos);
        this.A(-60, -2, 0, p.target);
        p.fov = 72;
      } }),
      P({ name: 'gliderFollow', t0: T.deployOpen + 9, t1: 1e9, blend: 1.6, track: 4, rig: (u, t, p) => {
        const g = this.ctx.getGlider?.();
        if (g) {
          a1.copy(g.position);
          p.pos.set(a1.x + 9, a1.y + 3.5, a1.z + 11);
          p.target.copy(a1);
          p.fov = 48;
        } else {
          this.A(-95, 24, 44, p.pos);
          this.A(8, 6, 0, p.target);
          p.fov = 54;
        }
      } })
    ];
  }

  _eval(i, t, dt, out) {
    const s = this.shots[i];
    const u = clamp01((t - s.t0) / Math.max(0.001, Math.min(s.t1, s.t0 + 600) - s.t0));
    out.shake = s.shake;
    s.rig(u, t, out);
    if (s.track) {
      if (!s._ts) s._ts = out.target.clone();
      s._ts.lerp(out.target, 1 - Math.exp(-dt * s.track));
      out.target.copy(s._ts);
    }
    return out;
  }

  shotIndexAt(t) {
    for (let i = this.shots.length - 1; i >= 0; i--) if (t >= this.shots[i].t0) return i;
    return 0;
  }

  update(dt, t) {
    const { a, b, out } = this.poses;
    if (this.override) {
      this.override(dt, t, out);
    } else {
      const idx = this.shotIndexAt(t);
      if (idx !== this.cur) {
        this.prev = this.cur;
        this.cur = idx;
        this.blendT = 0;
        this.shotName = this.shots[idx].name;
        const s = this.shots[idx];
        s._ts = null;
      }
      this._eval(this.cur, t, dt, a);
      const blend = this.shots[this.cur].blend;
      if (this.prev >= 0 && this.blendT < 1) {
        this.blendT = Math.min(1, this.blendT + dt / Math.max(0.01, blend));
        this._eval(this.prev, t, dt, b);
        const e = easeInOut(this.blendT);
        out.pos.copy(b.pos).lerp(a.pos, e);
        out.target.copy(b.target).lerp(a.target, e);
        out.fov = lerp(b.fov, a.fov, e);
        out.shake = lerp(b.shake, a.shake, e);
      } else {
        out.pos.copy(a.pos); out.target.copy(a.target); out.fov = a.fov; out.shake = a.shake;
      }
    }
    // procedural handheld / rumble shake
    if (out.shake > 0) {
      const k = out.shake;
      out.pos.x += Math.sin(t * 31.7) * k * 0.5;
      out.pos.y += Math.sin(t * 27.3 + 1.3) * k * 0.5;
      out.pos.z += Math.sin(t * 23.1 + 2.9) * k * 0.5;
    }
    const cam = this.camera;
    cam.position.copy(out.pos);
    cam.lookAt(out.target);
    if (Math.abs(cam.fov - out.fov) > 0.01) { cam.fov = out.fov; cam.updateProjectionMatrix(); }
    this.focus.copy(out.target);
  }

  // Hand the camera to custom code (free-fly debug camera, or the player-follow camera later).
  setOverride(fn) { this.override = fn; }
  // Follow any Object3D (e.g. the real player character once integrated).
  followObject(obj, offset = new THREE.Vector3(0, 3, 9)) {
    this.override = obj ? (dt, t, p) => { p.pos.copy(obj.position).add(offset); p.target.copy(obj.position); p.fov = 60; p.shake = 0; } : null;
  }
}
