// Cinematic match introduction (regular paint-battle matches).
//   1 arena reveal -> 2 your team -> 3 opposing team -> 4 paint showdown -> 5 get ready + 3-2-1-GO
// It is a presentation layer: it drives the camera, nameplates and overlay, animates the real
// characters already standing at their spawn points, and hands control back at GO.
//
// Timing is an authoritative clock: the intro always ends at the same intro time. With real
// netcode, pass `authoritativeClock: true` and call setClock(serverStartMs) so every client
// derives the same GO moment; skipping then only changes the local camera. Without netcode
// (today's local matches) skipping fast-forwards to the countdown.
import * as THREE from 'three';
import { PaintShowdown } from './paintShowdown.js';
import { createCinemaAudio } from './cinemaAudio.js';

const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => t * t * (3 - 2 * t);
const UP = new THREE.Vector3(0, 1, 0);

export const TIMELINE = {
  revealEnd: 1.8, teamAEnd: 3.6, teamBEnd: 5.4, showdownEnd: 6.5, readyEnd: 7.1,
  ticks: [7.1, 7.65, 8.2], go: 8.75, end: 9.2, shortStart: 5.1
};

export class MatchIntro {
  constructor(api) {
    this.api = api;
    this.cine = document.getElementById('cine');
    this.dom = {
      fade: document.getElementById('cine-fade'), tags: document.getElementById('cine-tags'),
      banner: document.getElementById('cine-banner'), kicker: document.getElementById('cine-banner-kicker'),
      title: document.getElementById('cine-banner-title'), sub: document.getElementById('cine-banner-sub'),
      canvas: document.getElementById('cine-paint'), vs: document.getElementById('cine-title'),
      left: document.getElementById('cine-vs-left'), right: document.getElementById('cine-vs-right'),
      center: document.getElementById('cine-center'), skip: document.getElementById('cine-skip')
    };
    this.paint = new PaintShowdown(this.dom.canvas);
    this.audio = createCinemaAudio({ getContext: api.getAudioContext, isOn: api.isSoundOn });
    this.dom.skip.addEventListener('click', () => this.skip());
    this.keyHandler = (event) => { if (this.active && (event.code === 'Escape' || event.code === 'Enter')) this.skip(); };
    addEventListener('keydown', this.keyHandler);
    this.active = false;
    this.curve = null;
    this.lookCurve = null;
    this.pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 60 };
    this.tmpPos = new THREE.Vector3();
    this.tmpLook = new THREE.Vector3();
  }

  get seen() { try { return localStorage.getItem('tint3d.introSeen') === '1'; } catch { return false; } }

  /** Optional: derive the timeline from a shared (server) start timestamp. */
  setClock(startAtMs, nowFn = () => Date.now()) { this.clock = { startAtMs, nowFn }; }

  begin() {
    const api = this.api;
    this.short = this.seen && !/intro=full/.test(location.search);
    this.t = this.short ? TIMELINE.shortStart : 0;
    this.cues = new Set();
    this.went = false;
    this.skipped = false;
    this.goHold = 0;
    this.baseExposure = api.renderer.toneMappingExposure;
    this.active = true;
    const playerTeam = api.player.team;
    const living = api.actors.filter((a) => a.group.visible);
    this.teamA = living.filter((a) => a.team === playerTeam);
    this.teamB = living.filter((a) => a.team !== playerTeam);
    for (const actor of living) {
      actor.group.rotation.y = actor.team === api.BLUE ? 0 : Math.PI;
      actor.introYaw = actor.group.rotation.y;
      api.holster(actor);
    }
    this.infoA = api.teamInfo[playerTeam];
    this.infoB = api.teamInfo[playerTeam === api.BLUE ? api.ORANGE : api.BLUE];
    // Nameplates (DOM, projected each frame; created once per real actor).
    this.dom.tags.replaceChildren();
    this.tags = living.map((actor) => {
      const el = document.createElement('div');
      el.className = 'cine-tag';
      el.style.setProperty('--c', api.teamInfo[actor.team].color);
      el.innerHTML = '<b></b><i></i>';
      el.firstChild.textContent = actor.displayName || 'PLAYER';
      el.lastChild.textContent = actor.player ? 'YOU' : api.teamInfo[actor.team].name;
      this.dom.tags.appendChild(el);
      return { el, actor };
    });
    this.paint.resize(clamp(api.fxScale(), 0.7, 1.3));
    this.paint.start(this.infoA.color, this.infoB.color);
    this.dom.left.textContent = this.infoA.name;
    this.dom.right.textContent = this.infoB.name;
    this.dom.left.style.setProperty('--c', this.infoA.color);
    this.dom.right.style.setProperty('--c', this.infoB.color);
    this.dom.canvas.style.opacity = '0';
    this.dom.vs.classList.remove('show');
    this.dom.center.textContent = '';
    this.dom.banner.classList.remove('show');
    this.cine.classList.remove('hidden');
    document.body.classList.add('cine-on');

    // Reveal path: ends exactly where the first team shot begins, so the cut is invisible.
    const start = this.teamShot(this.teamA, 0, new THREE.Vector3(), new THREE.Vector3());
    const hs = api.HALF;
    this.curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 36, hs + 44), new THREE.Vector3(-hs - 14, 20, 40), new THREE.Vector3(-hs, 10, -5),
      new THREE.Vector3(-6, 13, -hs + 4), new THREE.Vector3(hs, 11, -8), new THREE.Vector3(hs - 8, 8, 22), start.pos.clone()
    ], false, 'centripetal');
    this.lookCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 2, 10), new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 3, -6),
      new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 3, 10), new THREE.Vector3(0, 2, 24), start.look.clone()
    ], false, 'centripetal');
    this.pose.fov = 62;
    this.update(0);
  }

  /** Camera pose for a team shot: low orbit in front of the real players. */
  teamShot(list, k, outPos, outLook) {
    const api = this.api;
    const center = new THREE.Vector3();
    for (const a of list) center.add(a.position);
    center.divideScalar(Math.max(1, list.length));
    let spread = 0;
    for (const a of list) spread = Math.max(spread, a.position.distanceTo(center));
    const forward = new THREE.Vector3(0, 0, list[0] && list[0].team === api.BLUE ? -1 : 1);
    const right = new THREE.Vector3().crossVectors(forward, UP);
    const e = easeInOut(k);
    const angle = THREE.MathUtils.lerp(-0.8, 0.8, e);
    const dist = clamp(spread * 0.9 + 5.8, 6.4, 11.5);
    outPos.copy(center)
      .addScaledVector(forward, Math.cos(angle) * dist)
      .addScaledVector(right, Math.sin(angle) * dist);
    outPos.y = center.y + THREE.MathUtils.lerp(0.85, 1.9, e);
    outLook.copy(center).addScaledVector(right, THREE.MathUtils.lerp(-spread * 0.35, spread * 0.35, e));
    outLook.y = center.y + 1.2;
    return { pos: outPos, look: outLook };
  }

  setCamera(pos, look, fov) {
    const api = this.api;
    const safe = api.resolveCamera(look, pos);
    api.camera.position.copy(safe);
    api.camera.lookAt(look);
    if (Math.abs(api.camera.fov - fov) > 0.01) { api.camera.fov = fov; api.camera.updateProjectionMatrix(); }
    this.pose.pos.copy(safe);
    this.pose.look.copy(look);
    this.pose.fov = fov;
  }

  once(name, fn) { if (!this.cues.has(name)) { this.cues.add(name); fn(); } }

  showBanner(info, kicker, sub) {
    this.dom.banner.style.setProperty('--c', info.color);
    this.dom.kicker.textContent = kicker;
    this.dom.title.textContent = info.name + ' TEAM';
    this.dom.sub.textContent = sub;
    this.dom.banner.classList.add('show');
  }

  projectTags(visibleTeam, k) {
    const api = this.api;
    const members = visibleTeam ? visibleTeam.length : 0;
    const v = new THREE.Vector3();
    this.tags.forEach(({ el, actor }) => {
      const index = visibleTeam ? visibleTeam.indexOf(actor) : -1;
      const reveal = index >= 0 && k > 0.14 + index * (0.5 / Math.max(1, members));
      v.set(actor.position.x, actor.position.y + 2.25, actor.position.z).project(api.camera);
      const on = reveal && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.classList.toggle('show', on);
      if (on) el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
    });
  }

  poseActors(list, k) {
    const api = this.api;
    list.forEach((actor, i) => {
      const cue = 0.1 + i * (0.55 / Math.max(1, list.length));
      this.once(`pose-${actor.team}-${actor.displayName}-${i}`, () => {});
      if (k >= cue && !this.cues.has(`fx-${actor.team}-${i}`)) {
        this.cues.add(`fx-${actor.team}-${i}`);
        actor.recoil = 0.24;
        api.spawnMotionSpray(actor, 7, 1.3);
        api.splash(actor);
      }
      const presence = smooth(cue - 0.05, cue + 0.2, k) * (1 - smooth(0.88, 1, k));
      const toCamera = Math.atan2(-(api.camera.position.x - actor.position.x), -(api.camera.position.z - actor.position.z));
      const delta = Math.atan2(Math.sin(toCamera - actor.introYaw), Math.cos(toCamera - actor.introYaw));
      actor.group.rotation.y = actor.introYaw + delta * 0.38 * presence;
      actor.aimElevation = 0.06 + 0.07 * Math.sin(this.t * 2.2 + i) * presence;
    });
  }

  update(delta) {
    if (!this.active) return false;
    const api = this.api;
    if (this.clock) this.t = (this.clock.nowFn() - this.clock.startAtMs) / 1000;
    else this.t += delta;
    const t = this.t;
    for (const actor of api.actors) api.animateActor(actor, 0, delta);

    // Dramatic power-on: flicker, then the arena lights hold.
    const exposure = t < 0.22 ? 0.12 : t < 0.36 ? 0.6 : t < 0.48 ? 0.18 : t < 0.6 ? 0.95 : THREE.MathUtils.lerp(0.95, 1, smooth(0.6, 1.2, t));
    api.renderer.toneMappingExposure = this.short ? this.baseExposure : this.baseExposure * exposure;
    this.dom.fade.style.opacity = this.short ? String(1 - smooth(0, 0.35, t - TIMELINE.shortStart)) : String(1 - smooth(0, 0.8, t));

    const T = TIMELINE;
    if (t < T.revealEnd) {
      const k = t / T.revealEnd;
      this.once('lights', () => this.audio.lightsOn());
      if (k > 0.45) this.once('whoosh1', () => this.audio.whoosh());
      const e = easeInOut(k);
      this.setCamera(this.curve.getPoint(e), this.lookCurve.getPoint(e), THREE.MathUtils.lerp(62, 54, e));
      this.dom.banner.classList.remove('show');
      this.projectTags(null, 0);
    } else if (t < T.teamAEnd) {
      this.teamScene(this.teamA, this.infoA, (t - T.revealEnd) / (T.teamAEnd - T.revealEnd), 'YOUR SQUAD', 'a');
    } else if (t < T.teamBEnd) {
      this.teamScene(this.teamB, this.infoB, (t - T.teamAEnd) / (T.teamBEnd - T.teamAEnd), 'RIVAL SQUAD', 'b');
    } else if (t < T.showdownEnd) {
      this.showdown((t - T.teamBEnd) / (T.showdownEnd - T.teamBEnd), delta);
    } else {
      this.ready(t);
    }
    return this.active;
  }

  teamScene(list, info, k, kicker, key) {
    if (!list.length) return;
    this.once(`sting-${key}`, () => { this.audio.whoosh(); this.audio.teamSting(key === 'a' ? 196 : 233); });
    this.showBanner(info, kicker, `${list.length} OPERATOR${list.length === 1 ? '' : 'S'}`);
    const shot = this.teamShot(list, k, this.tmpPos, this.tmpLook);
    this.setCamera(shot.pos, shot.look, THREE.MathUtils.lerp(46, 40, k));
    this.poseActors(list, k);
    this.projectTags(list, k);
    this.lastShot = { k, list };
  }

  showdown(k, delta) {
    const api = this.api;
    this.dom.banner.classList.remove('show');
    this.projectTags(null, 0);
    // Slow push toward the arena centre with an impact shake after the collision.
    const e = easeInOut(k);
    const impact = this.paint.impacted ? smooth(0.42, 0.6, k) * (1 - smooth(0.6, 1, k)) : 0;
    this.tmpPos.copy(this.pose.pos).lerp(new THREE.Vector3(0, 9, 14), 0.012);
    this.tmpPos.x += (Math.random() - 0.5) * impact * 0.5;
    this.tmpPos.y += (Math.random() - 0.5) * impact * 0.5;
    this.setCamera(this.tmpPos, this.tmpLook.copy(this.pose.look).lerp(new THREE.Vector3(0, 2, 0), 0.02), 40 + e * 6);
    this.dom.canvas.style.opacity = String(1 - smooth(0.84, 1, k));
    if (this.paint.update(delta || 0.016, k)) {
      this.audio.collision();
      this.dom.vs.classList.add('show');
      api.shake(0.25);
    }
    this.once('whoosh2', () => this.audio.whoosh());
    this.paint.render();
  }

  ready(t) {
    const api = this.api;
    const T = TIMELINE;
    this.once('ready-start', () => {
      this.readyFrom = { pos: api.camera.position.clone(), quat: api.camera.quaternion.clone(), fov: api.camera.fov };
      this.gameplay = api.getGameplayPose();
      this.dom.canvas.style.opacity = '0';
      this.dom.vs.classList.remove('show');
      this.projectTags(null, 0);
      this.audio.ready();
      this.setCenter('GET READY!', 'ready');
    });
    if (!this.went) {
      const blend = easeInOut(smooth(T.showdownEnd, T.showdownEnd + 0.8, t));
      api.camera.position.lerpVectors(this.readyFrom.pos, this.gameplay.pos, blend);
      api.camera.quaternion.slerpQuaternions(this.readyFrom.quat, this.gameplay.quat, blend);
      const fov = THREE.MathUtils.lerp(this.readyFrom.fov, this.gameplay.fov, blend);
      if (Math.abs(api.camera.fov - fov) > 0.01) { api.camera.fov = fov; api.camera.updateProjectionMatrix(); }
      this.pose.pos.copy(api.camera.position);
    }
    T.ticks.forEach((tickTime, i) => {
      if (t >= tickTime) this.once(`tick${i}`, () => { this.audio.tick(i); this.setCenter(String(3 - i), 'tick'); });
    });
    if (t >= T.go && !this.went) {
      this.went = true;
      this.audio.go();
      this.setCenter('GO!', 'go');
      api.renderer.toneMappingExposure = this.baseExposure;
      api.onGo();
    }
    if (this.went) {
      this.goHold += 0.016;
      if (t >= T.end) this.finish();
    }
  }

  setCenter(text, kind) {
    const el = this.dom.center;
    el.textContent = text;
    el.className = 'cine-center ' + kind;
    void el.offsetWidth;
    el.classList.add('pop');
  }

  skip() {
    if (!this.active || this.skipped) return;
    this.skipped = true;
    const T = TIMELINE;
    if (this.t < T.showdownEnd) {
      // Local matches: fast-forward to the countdown. With an authoritative clock the
      // countdown stays shared and only this client's camera jumps.
      if (!this.api.authoritativeClock) this.t = T.showdownEnd;
      this.dom.banner.classList.remove('show');
      this.dom.canvas.style.opacity = '0';
      this.dom.vs.classList.remove('show');
      this.tags.forEach(({ el }) => el.classList.remove('show'));
      this.readyFrom = null;
      this.cues.delete('ready-start');
    }
    this.dom.skip.classList.add('hidden');
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    this.api.renderer.toneMappingExposure = this.baseExposure;
    try { localStorage.setItem('tint3d.introSeen', '1'); } catch { /* optional */ }
    for (const actor of this.api.actors) { actor.group.rotation.y = actor.introYaw ?? actor.group.rotation.y; actor.aimElevation = 0; }
    this.cine.classList.add('hidden');
    this.dom.skip.classList.remove('hidden');
    this.dom.tags.replaceChildren();
    this.tags = [];
    document.body.classList.remove('cine-on');
  }
}
