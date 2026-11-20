// BRPreparation — the scripted preparation → boarding → takeoff → transit → deployment timeline.
// Everything the aircraft does is derived from one flight path and a scripted speed profile; nothing teleports.

import { CARRIER_ORIGIN as O, DECK, AIRCRAFT, PHASES } from './constants.js';
import { lerp, clamp01, smooth, easeInOut } from './effects.js';

const DEG = Math.PI / 180;
const CRUISE_SPEED = 92;

// ------------------------------------------------------------------ flight path (world coordinates)
export function buildFlightPath() {
  const X = [];
  const Y = [];
  const Z = [];
  const push = (x, y, z) => { X.push(x); Y.push(y); Z.push(z); };
  const R = DECK.runwayZ;
  const D = DECK.y;
  const xTD = DECK.touchdownX;
  const a = Math.tan(3.5 * DEG);
  const flareD = 130;
  const hAt = (d) => {
    if (d >= flareD) return a * d;
    const t = d / flareD;
    const h10 = t * t * t - 2 * t * t + t;
    const h01 = -2 * t * t * t + 3 * t * t;
    const h11 = t * t * t - t * t;
    return h10 * 0.03 * flareD + h01 * a * flareD + h11 * a * flareD;
  };
  const idx = {};
  // 1. approach (carrier-local x from far astern to the touchdown point), lateral S-curve onto the runway line
  for (let x = -2300; x < xTD; x += 2) {
    const lat = 140 * (1 - smooth(-2300, -900, x));
    push(O.x + x, O.y + D + hAt(xTD - x), O.z + R + lat);
  }
  idx.td = X.length;
  // 2. runway roll to the boarding berth, then the catapult run to the bow
  for (let x = xTD; x < DECK.catapultEndX; x += 2) {
    if (x >= DECK.berthX && !idx.berth) idx.berth = X.length;
    push(O.x + x, O.y + D, O.z + R);
  }
  idx.bow = X.length;
  // 3. climb out over the sea, turning towards the island, then straight across the island
  const bx = O.x + DECK.catapultEndX;
  const bz = O.z + R;
  const psiT = Math.atan2(-bz, -bx); // towards the island centre
  let x = bx;
  let z = bz;
  const cruise = AIRCRAFT.cruiseAltitude;
  for (let u = 0; x < 2000; u += 2) {
    const psi = lerp(0, psiT, smooth(150, 1400, u));
    x += Math.cos(psi) * 2;
    z += Math.sin(psi) * 2;
    const y = O.y + D + (cruise - D) * smooth(0, 1500, u);
    push(x, y, z);
    if (!idx.deployStart && x > -1400 && y > cruise * 0.97) idx.deployStart = X.length - 1;
    if (!idx.deployEnd && x > 1450) idx.deployEnd = X.length - 1;
  }
  const n = X.length;
  const S = new Float32Array(n);
  for (let i = 1; i < n; i++) S[i] = S[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1], Z[i] - Z[i - 1]);
  const at = (i) => S[Math.min(n - 1, i)];
  const path = {
    n, X, Y, Z, S,
    sTD: at(idx.td), sBerth: at(idx.berth), sBow: at(idx.bow), sDeployStart: at(idx.deployStart), sDeployEnd: at(idx.deployEnd), sEnd: S[n - 1],
    sample(s, out = {}) {
      s = Math.max(0, Math.min(S[n - 1], s));
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
      const f = (s - S[lo]) / Math.max(1e-6, S[hi] - S[lo]);
      out.x = lerp(X[lo], X[hi], f); out.y = lerp(Y[lo], Y[hi], f); out.z = lerp(Z[lo], Z[hi], f);
      return out;
    }
  };
  path.heading = (s) => { const a1 = path.sample(s - 6, {}); const b1 = path.sample(s + 6, {}); return Math.atan2(b1.z - a1.z, b1.x - a1.x); };
  path.slope = (s) => { const a1 = path.sample(s - 6, {}); const b1 = path.sample(s + 6, {}); return Math.atan2(b1.y - a1.y, Math.hypot(b1.x - a1.x, b1.z - a1.z)); };
  return path;
}

// ------------------------------------------------------------------ scripted timeline
export function buildTimeline(path) {
  const DT = 1 / 120;
  const T = { introEnd: 7.5, approachStart: 11 };
  const tab = []; // t, s, v
  let t = T.approachStart;
  let s = 0;
  let v = 78;
  let step = 0;
  const store = (force) => { if (force || step++ % 4 === 0) tab.push(t, s, v); };
  store(true);
  // approach
  while (s < path.sTD) { v = lerp(78, 64, s / path.sTD); s += v * DT; t += DT; store(); }
  T.touchdown = t;
  // roll-out and taxi to the berth
  const v0 = 64;
  const vm = 14;
  const D1 = 300;
  const ab = 1.15;
  const a1 = (v0 * v0 - vm * vm) / (2 * D1);
  const Dtot = path.sBerth - path.sTD;
  let d = 0;
  while (d < Dtot - 0.02) {
    if (d < D1) v = Math.sqrt(Math.max(vm * vm, v0 * v0 - 2 * a1 * d));
    else if (d < Dtot - (vm * vm) / (2 * ab)) v = vm;
    else v = Math.sqrt(Math.max(0.0, 2 * ab * (Dtot - d)));
    v = Math.max(v, 0.2);
    d += v * DT; s = path.sTD + d; t += DT; store();
  }
  s = path.sBerth; v = 0;
  T.stop = t;
  store(true);
  // scripted hold: ramp, boarding, close, engine start
  T.rampOpen0 = T.stop + 1.8;
  T.rampOpen1 = T.rampOpen0 + 8;
  T.boardingOpen = T.rampOpen1;
  T.finalCall = T.boardingOpen + 22;
  T.rampClose0 = T.finalCall + 8;
  T.rampClose1 = T.rampClose0 + 8;
  T.engine0 = T.rampClose1 + 0.6;
  T.engine1 = T.engine0 + 6.5;
  T.takeoffStart = T.engine1 + 1.4;
  t = T.takeoffStart;
  store(true);
  // catapult run
  const A = 9.4;
  let tau = 0;
  v = 0;
  while (s < path.sBow) {
    const a = A * (tau < 1 ? (tau * tau * (3 - 2 * tau)) : 1);
    v += a * DT; s += v * DT; t += DT; tau += DT; store();
  }
  T.liftoff = t;
  T.vLiftoff = v;
  while (s < path.sDeployStart) {
    v = Math.min(CRUISE_SPEED, v + 1.6 * DT);
    s += v * DT; t += DT; store();
  }
  T.deployOpen = t;
  while (s < path.sDeployEnd) { s += v * DT; t += DT; store(); }
  T.deployClose = t;
  T.complete = T.deployClose + 4;
  T.end = T.complete + 4;
  T.deployRamp0 = T.deployOpen - 8;
  T.deployRamp1 = T.deployOpen - 1;
  const arr = new Float32Array(tab);
  const stateAt = (tt, out = {}) => {
    if (tt <= T.approachStart) { out.s = 0; out.v = 78; out.flying = false; return out; }
    const n = arr.length / 3;
    if (tt >= arr[(n - 1) * 3]) { out.s = arr[(n - 1) * 3 + 1] + (tt - arr[(n - 1) * 3]) * arr[(n - 1) * 3 + 2]; out.v = arr[(n - 1) * 3 + 2]; out.flying = true; return out; }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m * 3] <= tt) lo = m; else hi = m; }
    const f = (tt - arr[lo * 3]) / Math.max(1e-6, arr[hi * 3] - arr[lo * 3]);
    out.s = lerp(arr[lo * 3 + 1], arr[hi * 3 + 1], f);
    out.v = lerp(arr[lo * 3 + 2], arr[hi * 3 + 2], f);
    out.flying = true;
    return out;
  };
  return { T, stateAt };
}

const fmt = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
};

// ------------------------------------------------------------------ BRPreparation
export class BRPreparation {
  constructor({ timeScale = 1 } = {}) {
    this.path = buildFlightPath();
    const tl = buildTimeline(this.path);
    this.T = tl.T;
    this.stateAt = tl.stateAt;
    this.time = 0;
    this.timeScale = timeScale;
    this.paused = false;
    this.listeners = {};
    this.fired = new Set();
    this.phaseIndex = -1;
    this._st = {};
    this._roll = 0;
    this._prevS = 0;
    this._tmp = {};
    this._tmp2 = {};
  }

  on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); return this; }
  emit(evt, data) { (this.listeners[evt] || []).forEach((f) => f(data)); }
  once(key, evt, data) { if (!this.fired.has(key)) { this.fired.add(key); this.emit(evt, data); } }

  get duration() { return this.T.end; }
  seek(t) {
    this.time = Math.max(0, t);
    this._prevS = this.stateAt(this.time, {}).s;
    this.fired = new Set(); // allow events to re-fire after a seek
    this.phaseIndex = -1;
  }
  skipTo(phaseId) {
    const T = this.T;
    const map = { intro: 0, prep: T.introEnd, approach: T.approachStart, landing: T.touchdown - 3, landed: T.touchdown + 4, boarding: T.boardingOpen, finalCall: T.finalCall, closing: T.rampClose0, takeoff: T.takeoffStart - 1, transit: T.liftoff + 2, deploy: T.deployOpen - 8, complete: T.complete };
    if (map[phaseId] !== undefined) this.seek(map[phaseId]);
  }

  phaseIdAt(t) {
    const T = this.T;
    if (t < T.introEnd) return 'intro';
    if (t < T.approachStart) return 'prep';
    if (t < T.touchdown - 3) return 'approach';
    if (t < T.touchdown + 4) return 'landing';
    if (t < T.boardingOpen) return 'landed';
    if (t < T.finalCall) return 'boarding';
    if (t < T.rampClose0) return 'finalCall';
    if (t < T.takeoffStart) return 'closing';
    if (t < T.liftoff + 2) return 'takeoff';
    if (t < T.deployOpen) return 'transit';
    if (t < T.deployClose) return 'deploy';
    return 'complete';
  }

  update(dtReal) {
    if (this.paused) return;
    const prev = this.time;
    this.time += dtReal * this.timeScale;
    const t = this.time;
    const T = this.T;
    const id = this.phaseIdAt(t);
    const pi = PHASES.findIndex((p) => p.id === id);
    if (pi !== this.phaseIndex) { this.phaseIndex = pi; this.emit('phase', { ...PHASES[pi], index: pi, time: t }); }
    const cross = (key, tt, evt) => { if (prev < tt && t >= tt) this.once(key, evt, { time: t }); };
    cross('td', T.touchdown, 'touchdown');
    cross('stop', T.stop, 'stopped');
    cross('bo', T.boardingOpen, 'boardingOpen');
    cross('fc', T.finalCall, 'finalCall');
    cross('rc', T.rampClose1, 'boardingClosed');
    cross('ts', T.takeoffStart, 'takeoff');
    cross('lo', T.liftoff, 'liftoff');
    cross('do', T.deployOpen, 'deployAvailable');
    cross('dc', T.deployClose, 'deployClosed');
    cross('cp', T.complete, 'complete');
  }

  // ---------------------------------------------------------------- aircraft + carrier driver
  apply(carrier, aircraft, dt) {
    const t = this.time;
    const T = this.T;
    const st = this.stateAt(t, this._st);
    const p = this.path;
    const g = aircraft.group;
    g.visible = t >= T.approachStart - 0.01 && t < T.deployClose + 30;
    const pos = p.sample(st.s, this._tmp);
    const psi = p.heading(st.s);
    const gamma = p.slope(st.s);
    const airborne = t > T.liftoff - 0.05 || (t < T.touchdown);
    // pitch
    let pitch;
    if (t < T.touchdown) {
      const dTD = Math.max(0, p.sTD - st.s);
      pitch = 2 * DEG + 4.5 * DEG * (1 - smooth(0, 160, dTD));
      pitch = lerp(pitch, 1.5 * DEG, 0.0);
    } else if (t < T.takeoffStart) {
      pitch = lerp(6.5 * DEG, 0, smooth(0, 1.4, t - T.touchdown));
    } else if (t < T.liftoff) {
      pitch = 10 * DEG * smooth(p.sBow - 120, p.sBow - 8, st.s);
    } else {
      pitch = lerp(10 * DEG, gamma + 3 * DEG, smooth(0, 3, t - T.liftoff));
    }
    // roll from yaw rate
    const psi2 = p.heading(st.s + 20);
    const psi1 = p.heading(st.s - 20);
    const yawRate = ((psi2 - psi1) / 40) * st.v;
    const rollTarget = Math.max(-0.5, Math.min(0.5, Math.atan(yawRate / 9.81)));
    this._roll += (rollTarget - this._roll) * Math.min(1, dt * 2.2);
    // ground contact: gear compression
    let compMain = 0;
    let compNose = 0;
    const onGround = t >= T.touchdown && t < T.liftoff;
    if (onGround) {
      const tau = t - T.touchdown;
      compMain = 0.9 * Math.exp(-2.2 * tau) * (0.55 + 0.45 * Math.cos(8 * tau)) + 0.1;
      compNose = (tau > 1.2 ? 0.6 * Math.exp(-3 * (tau - 1.2)) : 0) + 0.15;
      if (st.v > 30) compNose *= 0.5;
    } else if (t >= T.liftoff && t < T.liftoff + 1.2) {
      compMain = 0.1 * (1 - (t - T.liftoff) / 1.2);
    }
    g.position.set(pos.x, pos.y - compMain * 0.45 * (onGround ? 1 : 0), pos.z);
    g.rotation.order = 'YZX';
    g.rotation.set(this._roll, -psi, pitch);
    // gear
    let gear = 0;
    if (t < T.approachStart + 5) gear = 0;
    else if (t < T.approachStart + 9.5) gear = easeInOut((t - T.approachStart - 5) / 4.5);
    else if (t < T.liftoff + 1.8) gear = 1;
    else gear = 1 - easeInOut(clamp01((t - T.liftoff - 1.8) / 4.5));
    aircraft.setGear(gear);
    aircraft.setGearCompression(compMain, compNose);
    if (onGround) aircraft.addWheelDistance(Math.max(0, st.s - this._prevS));
    else if (t < T.touchdown) aircraft.addWheelDistance(0);
    this._prevS = st.s;
    // flaps
    let flaps = 0;
    if (t < T.stop - 6) flaps = smooth(T.approachStart + 2, T.approachStart + 7, t);
    else if (t < T.stop) flaps = 1 - smooth(T.stop - 6, T.stop, t);
    if (t > T.engine1 - 3) flaps = Math.max(flaps, 0.5 * smooth(T.engine1 - 3, T.engine1, t) * (1 - smooth(T.liftoff + 8, T.liftoff + 16, t)));
    aircraft.setFlaps(flaps);
    // throttle
    let thr = 0.32;
    if (t >= T.touchdown && t < T.touchdown + 3) thr = 0.55;
    else if (t >= T.touchdown + 3 && t < T.engine0) thr = 0.1;
    else if (t >= T.engine0 && t < T.engine1) thr = lerp(0.1, 1, easeInOut((t - T.engine0) / (T.engine1 - T.engine0)));
    else if (t >= T.engine1 && t < T.liftoff + 10) thr = 1;
    else if (t >= T.liftoff + 10) thr = lerp(1, 0.62, smooth(T.liftoff + 10, T.liftoff + 20, t));
    aircraft.setThrottle(thr);
    // ramp + rear door (boarding, closing, and again over the island)
    let ramp = 0;
    let door = 0;
    const ease = (a, b) => easeInOut(clamp01((t - a) / (b - a)));
    if (t < T.rampClose0) {
      door = ease(T.rampOpen0, T.rampOpen0 + 3.5);
      ramp = ease(T.rampOpen0 + 2, T.rampOpen1);
      if (t > T.rampOpen1) ramp = 1 - 0.012 * Math.exp(-5 * (t - T.rampOpen1)) * Math.cos(14 * (t - T.rampOpen1));
    } else if (t < T.deployRamp0) {
      ramp = 1 - ease(T.rampClose0, T.rampClose1 - 3);
      door = 1 - ease(T.rampClose1 - 3.5, T.rampClose1);
    } else {
      door = ease(T.deployRamp0, T.deployRamp0 + 3.5);
      ramp = ease(T.deployRamp0 + 2, T.deployRamp1);
    }
    aircraft.setRamp(ramp);
    aircraft.setRearDoor(door);
    // interior lights + jump lamp
    aircraft.setInteriorLights(smooth(T.rampOpen0, T.rampOpen0 + 2.5, t));
    let lamp = 'off';
    if (t >= T.deployRamp0 && t < T.deployOpen) lamp = Math.floor(t * 2) % 2 ? 'red' : 'off';
    else if (t >= T.deployOpen && t < T.deployClose) lamp = 'green';
    else if (t >= T.rampClose0 && t < T.deployRamp0) lamp = 'red';
    aircraft.setJumpLight(lamp);
    aircraft.setLandingLights((t < T.touchdown + 12) || (t > T.takeoffStart - 4 && t < T.liftoff + 12));
    // carrier reactions
    carrier.setBlastDeflector(smooth(T.engine0, T.engine0 + 2.5, t) * (1 - smooth(T.liftoff + 1, T.liftoff + 4.5, t)));
    carrier.catapultSteam(t > T.takeoffStart - 2 && t < T.liftoff + 1 ? 1 : 0.12);
    this.rampAmount = ramp;
    this.gearAmount = gear;
    this.speed = st.v;
    // one-shot effects
    if (this._lastT !== undefined && this._lastT < T.touchdown && t >= T.touchdown) aircraft.emitTireSmoke(48);
    this._lastT = t;
    this.pose = { position: g.position, psi, gamma, pitch, roll: this._roll, speed: st.v, s: st.s };
    return this.pose;
  }

  // ---------------------------------------------------------------- UI / screen state
  snapshot() {
    const t = this.time;
    const T = this.T;
    const id = this.phaseIdAt(t);
    const ph = PHASES.find((p) => p.id === id);
    const cd = T.deployOpen - t;
    const st = this.stateAt(t, {});
    const air = t >= T.approachStart && t < T.deployClose;
    const ramp = this.rampAmount ?? 0;
    const ex = { approach: ['INBOUND', '#20d8e9'], landing: ['ON FINAL', '#ffb42e'], landed: ['TAXIING', '#ffb42e'], boarding: ['RAMP OPEN', '#9cff4f'], finalCall: ['RAMP OPEN', '#ff7652'], closing: ['SECURING', '#ff7652'], takeoff: ['LAUNCHING', '#ff7652'], transit: ['AIRBORNE', '#20d8e9'], deploy: ['OVER TARGET', '#9cff4f'], complete: ['RETURNING', '#20d8e9'] };
    const tr = ex[id] || ['STANDBY', '#20d8e9'];
    let boarding = 'WAITING';
    let boardingColor = '#20d8e9';
    if (id === 'boarding') { boarding = 'OPEN'; boardingColor = '#9cff4f'; }
    else if (id === 'finalCall') { boarding = 'FINAL CALL'; boardingColor = '#ff7652'; }
    else if (t >= T.rampClose0) { boarding = 'CLOSED'; boardingColor = '#ffb42e'; }
    let deployment = 'T-' + fmt(cd);
    let deploymentColor = '#20d8e9';
    if (id === 'deploy') { deployment = 'AVAILABLE'; deploymentColor = '#9cff4f'; }
    else if (id === 'complete') { deployment = 'COMPLETE'; deploymentColor = '#ffb42e'; }
    const eta = t < T.touchdown ? fmt(T.touchdown - Math.max(t, T.approachStart - 12)) : '00:00';
    const toCarrier = Math.hypot(this._tmp.x - (O.x), this._tmp.z - (O.z));
    const ramps = ramp < 0.02 ? 'CLOSED' : ramp > 0.98 ? 'OPEN' : (t < T.rampClose0 || t > T.deployRamp0 ? 'OPENING' : 'CLOSING');
    const gearTxt = (this.gearAmount ?? 0) > 0.98 ? 'DOWN' : (this.gearAmount ?? 0) < 0.02 ? 'UP' : 'MOVING';
    const sec = Math.floor(t);
    return {
      phase: ph,
      phaseId: id,
      title: ph.title,
      sub: ph.sub,
      clock: 'T+' + fmt(t),
      countLabel: id === 'deploy' ? 'DEPLOYMENT WINDOW' : 'DEPLOYMENT IN',
      count: id === 'deploy' ? fmt(T.deployClose - t) : fmt(cd),
      countUrgent: cd < 10 && cd > 0,
      countdown: Math.max(0, cd),
      transport: tr[0], transportColor: tr[1],
      boarding, boardingColor, deployment, deploymentColor,
      progress: clamp01(t / T.complete),
      eta,
      alt: air ? Math.round(this._tmp.y - O.y - (t < T.liftoff ? DECK.y : 0)) + ' M' : '--',
      speed: air ? Math.round(st.v * 3.6) + ' KM/H' : '--',
      dist: air ? (toCarrier / 1000).toFixed(1) + ' KM' : '--',
      gear: gearTxt,
      ramp: ramps,
      tick: sec
    };
  }
}
