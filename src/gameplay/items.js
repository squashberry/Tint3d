// Pick-ups, throwables and status effects: ink jug, grenade, sticky paint
// grenade, ice cube, green smoke, and weapons dropped by eliminated enemies.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const clamp = THREE.MathUtils.clamp;
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

export const ITEM_ORDER = ['jug', 'grenade', 'sticky', 'ice', 'smoke'];
export const ITEM_DEFS = {
  jug:     { label: 'JUG',    color: 0x4df29b, hint: 'INK JUG  /  DRINK TO HEAL' },
  grenade: { label: 'NADE',   color: 0xffb347, hint: 'GRENADE' },
  sticky:  { label: 'STICKY', color: 0xff6dd6, hint: 'STICKY PAINT GRENADE' },
  ice:     { label: 'ICE',    color: 0x9fe8ff, hint: 'ICE CUBE' },
  smoke:   { label: 'SMOKE',  color: 0x5cff8a, hint: 'GREEN SMOKE' }
};
const DROP_WEIGHTS = { jug: 24, grenade: 24, sticky: 16, ice: 16, smoke: 20 };
const MAX_STACK = 3;
const GRAVITY = 20;

export function createItems(api) {
  const { scene, player } = api;
  const inventory = { jug: 1, grenade: 1, sticky: 0, ice: 0, smoke: 1 };
  const pickups = [];
  const thrown = [];
  const smokes = [];
  const effects = [];
  const iced = new Set();
  let time = 0;

  const geo = {
    ring: new THREE.RingGeometry(0.46, 0.62, 28),
    beam: new THREE.CylinderGeometry(0.09, 0.09, 1.7, 8, 1, true),
    sphere: new THREE.SphereGeometry(1, 14, 10),
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 14)
  };
  const glow = (color, opacity) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  const solid = (color, rough = 0.5, metal = 0.1) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

  // ---------------------------------------------------------------- models
  function makeItemMesh(type) {
    const g = new THREE.Group();
    const def = ITEM_DEFS[type];
    if (type === 'jug') {
      const body = new THREE.Mesh(geo.cyl, new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.25, transparent: true, opacity: 0.88, emissive: def.color, emissiveIntensity: 0.25 }));
      body.scale.set(0.2, 0.46, 0.2);
      const neck = new THREE.Mesh(geo.cyl, solid(0xe8f7ee));
      neck.scale.set(0.085, 0.14, 0.085);
      neck.position.y = 0.3;
      const cap = new THREE.Mesh(geo.cyl, solid(0x1d3c33));
      cap.scale.set(0.1, 0.06, 0.1);
      cap.position.y = 0.4;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12), solid(0xe8f7ee));
      handle.position.set(0.19, 0.05, 0);
      g.add(body, neck, cap, handle);
    } else if (type === 'grenade') {
      const body = new THREE.Mesh(geo.sphere, solid(0x4a5b3a, 0.55, 0.25));
      body.scale.setScalar(0.17);
      const top = new THREE.Mesh(geo.cyl, solid(0xcfd6c9, 0.4, 0.6));
      top.scale.set(0.06, 0.07, 0.06);
      top.position.y = 0.18;
      const band = new THREE.Mesh(geo.cyl, new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.7 }));
      band.scale.set(0.175, 0.03, 0.175);
      g.add(body, top, band);
    } else if (type === 'sticky') {
      const body = new THREE.Mesh(geo.sphere, new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.2, emissive: def.color, emissiveIntensity: 0.4 }));
      body.scale.set(0.19, 0.17, 0.19);
      g.add(body);
      for (let i = 0; i < 6; i++) {
        const blob = new THREE.Mesh(geo.sphere, body.material);
        const a = i / 6 * Math.PI * 2;
        blob.scale.setScalar(0.06);
        blob.position.set(Math.cos(a) * 0.17, (i % 2 ? 0.07 : -0.05), Math.sin(a) * 0.17);
        g.add(blob);
      }
    } else if (type === 'ice') {
      const cube = new THREE.Mesh(geo.box, new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.1, transparent: true, opacity: 0.78, emissive: 0x4ab8d8, emissiveIntensity: 0.45 }));
      cube.scale.setScalar(0.3);
      cube.rotation.set(0.4, 0.5, 0.2);
      g.add(cube);
    } else {
      const can = new THREE.Mesh(geo.cyl, solid(0x6c7a78, 0.4, 0.55));
      can.scale.set(0.11, 0.3, 0.11);
      const band = new THREE.Mesh(geo.cyl, new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.8 }));
      band.scale.set(0.115, 0.07, 0.115);
      const top = new THREE.Mesh(geo.cyl, solid(0x2a3331));
      top.scale.set(0.07, 0.05, 0.07);
      top.position.y = 0.17;
      g.add(can, band, top);
    }
    return g;
  }

  function makeWeaponMesh(weaponId) {
    const spec = WEAPONS[weaponId];
    const g = new THREE.Group();
    const [sx, sy, sz] = spec.look;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.4, metalness: 0.5 });
    const accent = new THREE.MeshStandardMaterial({ color: spec.color, emissive: spec.color, emissiveIntensity: 0.6 });
    const body = new THREE.Mesh(geo.box, bodyMat);
    body.scale.set(0.12 * sx, 0.16 * sy, 0.7 * sz);
    const barrel = new THREE.Mesh(geo.cyl, bodyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.scale.set(0.045 * sx, 0.4 * sz, 0.045 * sx);
    barrel.position.z = -0.5 * sz;
    const grip = new THREE.Mesh(geo.box, bodyMat);
    grip.scale.set(0.09, 0.2, 0.1);
    grip.position.set(0, -0.16, 0.2 * sz);
    const stripe = new THREE.Mesh(geo.box, accent);
    stripe.scale.set(0.125 * sx, 0.04, 0.4 * sz);
    stripe.position.y = 0.09 * sy;
    g.add(body, barrel, grip, stripe);
    g.rotation.z = 0.35;
    return g;
  }

  // -------------------------------------------------------------- inventory
  const inventories = new Map([[player, inventory]]);
  const heldJugs = new Map();
  const emptyInventory = () => ({ jug: 0, grenade: 0, sticky: 0, ice: 0, smoke: 0 });
  function inventoryOf(actor) {
    if (!inventories.has(actor)) inventories.set(actor, emptyInventory());
    return inventories.get(actor);
  }
  function notifyInventory() { api.onInventory?.(inventory); }
  function give(type, count = 1, actor = player) {
    const inv = inventoryOf(actor);
    if (inv[type] >= MAX_STACK) return false;
    inv[type] = Math.min(MAX_STACK, inv[type] + count);
    if (actor === player) notifyInventory();
    return true;
  }
  function weightedItem() {
    let roll = Math.random() * Object.values(DROP_WEIGHTS).reduce((a, b) => a + b, 0);
    for (const [type, weight] of Object.entries(DROP_WEIGHTS)) { roll -= weight; if (roll <= 0) return type; }
    return 'grenade';
  }
  /** Bots start every life with a random pocketful so fights have variety. */
  function loadout(actor) {
    if (actor.player) return;
    const inv = emptyInventory();
    inv[weightedItem()] = 1;
    if (Math.random() < 0.5) inv[weightedItem()] += 1;
    inventories.set(actor, inv);
  }

  // ---------------------------------------------------------------- pick-ups
  function spawnPickup(kind, type, x, z, ignore = 0, launch = null) {
    const limit = api.HALF - 2;
    x = clamp(x, -limit, limit);
    z = clamp(z, -limit, limit);
    const color = kind === 'weapon' ? WEAPONS[type].color : ITEM_DEFS[type].color;
    const group = new THREE.Group();
    const model = kind === 'weapon' ? makeWeaponMesh(type) : makeItemMesh(type);
    model.position.y = 0.75;
    const ring = new THREE.Mesh(geo.ring, glow(color, 0.7));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    const beam = new THREE.Mesh(geo.beam, glow(color, 0.2));
    beam.position.y = 0.9;
    group.add(model, ring, beam);
    const ground = api.groundHeight(x, z);
    group.position.set(x, launch ? launch.y : ground, z);
    scene.add(group);
    const pickup = {
      kind, type, group, model, ring, age: 0, life: 40, ignore, x, z, baseY: ground, y: group.position.y,
      flying: !!launch, vel: launch ? new THREE.Vector3(launch.vx, launch.vy, launch.vz) : null
    };
    if (launch) ring.visible = false;
    pickups.push(pickup);
    while (pickups.length > 30) removePickup(0);
  }
  function removePickup(index) {
    const p = pickups[index];
    scene.remove(p.group);
    p.group.traverse((n) => { if (n.isMesh && n.material?.dispose) n.material.dispose(); });
    pickups.splice(index, 1);
  }

  /** Everything the actor was carrying bursts out of them. */
  function onElimination(actor) {
    if (actor.player) return;
    const inv = inventoryOf(actor);
    const drops = [];
    for (const type of ITEM_ORDER) for (let i = 0; i < inv[type]; i++) drops.push(['item', type]);
    if (Math.random() < 0.4) drops.push(['item', weightedItem()]);
    if (actor.weaponType && actor.weaponType !== 'pulse') drops.push(['weapon', actor.weaponType]);
    inventories.set(actor, emptyInventory());
    drops.slice(0, 6).forEach(([kind, type], i) => {
      const angle = (i / Math.max(1, drops.length)) * Math.PI * 2 + Math.random() * 0.8;
      const speed = 3.5 + Math.random() * 3.5;
      spawnPickup(kind, type, actor.position.x, actor.position.z, 0.5, {
        y: actor.position.y + 1.1, vx: Math.cos(angle) * speed, vy: 6 + Math.random() * 4, vz: Math.sin(angle) * speed
      });
    });
  }

  function movePickup(p, delta) {
    p.vel.y -= 22 * delta;
    let nx = p.x + p.vel.x * delta;
    let nz = p.z + p.vel.z * delta;
    const limit = api.HALF - 1.5;
    nx = clamp(nx, -limit, limit);
    nz = clamp(nz, -limit, limit);
    const hit = api.solidBounds.some((box) => {
      if (p.y <= box.minY || p.y >= box.maxY) return false;
      if (box.shape === 'circle') return (nx - box.x) ** 2 + (nz - box.z) ** 2 < (box.radius + 0.2) ** 2;
      return nx > box.minX - 0.2 && nx < box.maxX + 0.2 && nz > box.minZ - 0.2 && nz < box.maxZ + 0.2;
    });
    if (hit) { p.vel.x *= -0.3; p.vel.z *= -0.3; nx = p.x; nz = p.z; }
    p.x = nx;
    p.z = nz;
    p.y += p.vel.y * delta;
    const ground = api.groundHeight(p.x, p.z);
    if (p.y <= ground) {
      p.y = ground;
      if (Math.abs(p.vel.y) > 2.2) { p.vel.y = Math.abs(p.vel.y) * 0.42; p.vel.x *= 0.7; p.vel.z *= 0.7; }
      else { p.flying = false; p.vel = null; p.baseY = ground; p.ring.visible = true; }
    }
    p.group.position.set(p.x, p.y, p.z);
  }

  function collect(actor, p) {
    if (p.kind === 'item') {
      if (!give(p.type, 1, actor)) return false;
      if (actor === player) {
        api.showToast('GOT ' + ITEM_DEFS[p.type].label + '  /  ' + (ITEM_ORDER.indexOf(p.type) + 1));
        api.playPop(1.3);
      }
      return true;
    }
    if (actor.weaponType === p.type) return false;
    if (actor !== player && actor.weaponType !== 'pulse') return false;
    const old = actor.weaponType;
    api.setWeapon(actor, p.type);
    if (actor === player) {
      api.showToast('TOOK ' + WEAPONS[p.type].name);
      api.playPop(1.5);
    }
    if (old && old !== 'pulse') spawnPickup('weapon', old, actor.position.x, actor.position.z, 1.6);
    return true;
  }

  function updatePickups(delta) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.age += delta;
      p.ignore = Math.max(0, p.ignore - delta);
      if (p.flying) movePickup(p, delta);
      p.model.rotation.y += delta * 1.8;
      p.model.position.y = p.flying ? 0.5 : 0.75 + Math.sin(time * 2.4 + i) * 0.08;
      p.ring.scale.setScalar(1 + Math.sin(time * 3 + i) * 0.06);
      p.group.visible = p.life - p.age < 4 ? Math.sin(time * 14) > -0.4 : true;
      if (p.age > p.life) { removePickup(i); continue; }
      if (p.flying || p.ignore > 0) continue;
      for (const actor of api.actors) {
        if (actor.respawn > 0 || !actor.group.visible || actor.frozen > 0 || actor.ragdollState || actor.diving) continue;
        const dx = actor.position.x - p.x;
        const dz = actor.position.z - p.z;
        if (dx * dx + dz * dz > 1.7 * 1.7 || Math.abs(actor.position.y - p.baseY) > 2.2) continue;
        if (collect(actor, p)) { removePickup(i); break; }
      }
    }
  }

  // ------------------------------------------------------------------ use
  function canAct(actor) {
    return actor.respawn <= 0 && actor.group.visible && !(actor.frozen > 0) && !actor.ragdollState && !actor.diving && !(actor.drinking > 0);
  }

  /** Use an item as `actor` (player or bot); `aim` is the world point to throw at. */
  function useFor(actor, type, aim) {
    const inv = inventoryOf(actor);
    if (!inv[type] || !canAct(actor)) {
      if (actor === player && !inv[type] && actor.respawn <= 0) api.showToast('NO ' + ITEM_DEFS[type].label);
      return false;
    }
    if (type === 'jug') {
      if (actor.health >= 99) { if (actor === player) api.showToast('VITALS FULL'); return false; }
      inv.jug--;
      startDrinking(actor);
    } else {
      inv[type]--;
      throwItem(actor, type, aim);
    }
    if (actor === player) notifyInventory();
    return true;
  }
  function useItem(type) { useFor(player, type, api.getAimPoint()); }

  function throwItem(actor, type, aim) {
    const origin = new THREE.Vector3(actor.position.x, actor.position.y + 1.55, actor.position.z);
    const flat = new THREE.Vector3(aim.x - origin.x, 0, aim.z - origin.z);
    const reach = Math.min(flat.length(), 22);
    if (flat.lengthSq() < 0.01) flat.set(Math.sin(actor.group.rotation.y) * -1, 0, -Math.cos(actor.group.rotation.y));
    flat.normalize();
    origin.addScaledVector(flat, 0.5);
    const t = clamp(reach / 15, 0.4, 1.4);
    const velocity = new THREE.Vector3(flat.x * reach / t, (aim.y - origin.y) / t + 0.5 * GRAVITY * t, flat.z * reach / t);
    const mesh = makeItemMesh(type);
    mesh.position.copy(origin);
    scene.add(mesh);
    thrown.push({ type, mesh, velocity, age: 0, fuse: type === 'grenade' ? 1.9 : (type === 'sticky' ? 2.6 : 3.0), stuck: null, rest: false, bounces: 0, team: actor.team, owner: actor });
    actor.group.userData.shotTimer = 0.3;
    if (actor === player) {
      api.playPop(0.9);
      api.showToast(ITEM_DEFS[type].hint);
    }
  }

  function startDrinking(actor) {
    actor.drinking = 2.3;
    actor.sliding = false;
    const c = actor.group.userData.character;
    const hand = c?.operator?.bones?.get('hand_r');
    if (hand) {
      const jug = makeItemMesh('jug');
      jug.scale.setScalar(1.35);
      actor.group.updateMatrixWorld(true);
      const world = hand.getWorldPosition(new THREE.Vector3());
      const local = actor.group.worldToLocal(world.clone());
      local.y += 0.02;
      api.attachRigid(actor.group, hand, jug, local, new THREE.Quaternion());
      heldJugs.set(actor, jug);
    }
    if (actor === player) api.showToast('DRINKING  /  WALKING PACE');
  }

  function finishDrinking(actor, cancel = false) {
    actor.drinking = 0;
    const jug = heldJugs.get(actor);
    if (!jug) return;
    heldJugs.delete(actor);
    const world = jug.getWorldPosition(new THREE.Vector3());
    jug.parent?.remove(jug);
    if (cancel) return;
    const prop = makeItemMesh('jug');
    prop.scale.setScalar(1.35);
    prop.position.copy(world);
    scene.add(prop);
    const forward = new THREE.Vector3(-Math.sin(actor.group.rotation.y), 0, -Math.cos(actor.group.rotation.y));
    effects.push({
      kind: 'debris', mesh: prop, life: 2.4, max: 2.4,
      velocity: forward.multiplyScalar(5.5).add(new THREE.Vector3(0, 5.2, 0)),
      spin: new THREE.Vector3(6, 3, 8)
    });
    if (actor === player) api.showToast('JUG TOSSED  /  VITALS UP');
  }

  function updateDrinking(delta) {
    for (const actor of api.actors) {
      actor.drinkBlend = approach(actor.drinkBlend || 0, actor.drinking > 0 ? 1 : 0, 9, delta);
      if (!(actor.drinking > 0)) continue;
      if (actor.respawn > 0 || actor.frozen > 0 || actor.ragdollState || !actor.group.visible) { finishDrinking(actor, true); continue; }
      actor.drinking -= delta;
      actor.health = Math.min(100, actor.health + (65 / 2.3) * delta);
      actor.ink = Math.min(100, actor.ink + 9 * delta);
      if (actor === player) api.updateHud();
      if (actor.drinking <= 0) finishDrinking(actor, false);
    }
  }

  // ------------------------------------------------------------- explosions
  function ringEffect(pos, color, radius, life = 0.5) {
    const mesh = new THREE.Mesh(geo.ring, glow(color, 0.8));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, api.paintSurfaceHeight(pos.x, pos.z) + 0.12, pos.z);
    scene.add(mesh);
    effects.push({ kind: 'ring', mesh, life, max: life, radius });
  }

  function blast(pos, radius, damage, owner, team) {
    for (const actor of api.actors) {
      if (!actor.group.visible || actor.ragdollState) continue;
      const center = new THREE.Vector3(actor.position.x, actor.position.y + 1.0, actor.position.z);
      const d = center.distanceTo(pos);
      if (d > radius) continue;
      const sameTeam = actor.team === team;
      if (sameTeam && actor !== owner) continue;
      const fall = 1 - d / radius;
      const amount = damage * fall * (actor.player ? 0.61 : 1) * (sameTeam ? 0.4 : 1);
      api.damageActor(actor, amount, owner);
      const away = center.sub(pos); away.y = 0;
      if (away.lengthSq() > 0.001) { away.normalize(); actor.velocity.x += away.x * fall * 10; actor.velocity.z += away.z * fall * 10; }
    }
    const camDist = api.camera.position.distanceTo(pos);
    if (camDist < 22) api.addShake(0.34 * (1 - camDist / 22));
  }

  function detonate(t) {
    const pos = t.mesh.position.clone();
    const floorY = api.paintSurfaceHeight(pos.x, pos.z);
    if (t.type === 'grenade') {
      blast(pos, 5.2, 96, t.owner, t.team);
      api.paintAt(new THREE.Vector3(pos.x, 0, pos.z), t.team, 4.4, false);
      api.spawnHitBurst(pos, t.team, 2.6);
      for (let i = 0; i < 3; i++) api.spawnSplash(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 2, floorY, pos.z + (Math.random() - 0.5) * 2), t.team, floorY);
      ringEffect(pos, 0xffb347, 5.2, 0.45);
    } else if (t.type === 'sticky') {
      blast(pos, 5.5, 22, t.owner, t.team);
      api.paintAt(new THREE.Vector3(pos.x, 0, pos.z), t.team, 7.0, false);
      api.spawnHitBurst(pos, t.team, 3.0);
      for (let i = 0; i < 5; i++) api.spawnSplash(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 4, floorY, pos.z + (Math.random() - 0.5) * 4), t.team, floorY);
      for (const actor of api.actors) {
        if (actor.team === t.team || !actor.group.visible || actor.ragdollState) continue;
        if (Math.hypot(actor.position.x - pos.x, actor.position.z - pos.z) < 5.5) {
          actor.sticky = 3.8;
          if (actor.player) api.showToast('STUCK IN PAINT  /  SLOWED');
        }
      }
      ringEffect(pos, ITEM_DEFS.sticky.color, 6.0, 0.55);
    }
    scene.remove(t.mesh);
  }

  function freezeActor(actor, duration) {
    actor.frozen = duration;
    actor.frozenTotal = duration;
    actor.sliding = false;
    actor.diving = false;
    actor.velocity.set(0, 0, 0);
    if (!actor.iceMesh) {
      const cube = new THREE.Mesh(geo.box, new THREE.MeshStandardMaterial({
        color: 0xbdf3ff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.6, emissive: 0x3aa7d4, emissiveIntensity: 0.5
      }));
      cube.scale.set(1.35, 2.2, 1.35);
      scene.add(cube);
      actor.iceMesh = cube;
    }
    iced.add(actor);
    if (actor.player) { api.showToast('FROZEN  /  WAIT FOR THE MELT'); api.setStatus('frozen', true); }
  }

  function shatter(pos, color = 0xbdf3ff) {
    for (let i = 0; i < 9; i++) {
      const shard = new THREE.Mesh(geo.box, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.8, emissive: 0x3aa7d4, emissiveIntensity: 0.4 }));
      shard.scale.set(0.18 + Math.random() * 0.2, 0.18 + Math.random() * 0.25, 0.12);
      shard.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.9, Math.random() * 1.6, (Math.random() - 0.5) * 0.9));
      scene.add(shard);
      effects.push({
        kind: 'debris', mesh: shard, life: 1.0, max: 1.0,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8)
      });
    }
  }

  function updateIce(delta) {
    for (const actor of [...iced]) {
      if (actor.frozen > 0 && actor.group.visible && !actor.ragdollState) {
        const t = actor.frozen / (actor.frozenTotal || 1);
        actor.iceMesh.position.set(actor.position.x, actor.position.y + 1.08, actor.position.z);
        actor.iceMesh.scale.set(1.35 * (0.8 + 0.2 * t), 2.2 * (0.55 + 0.45 * t), 1.35 * (0.8 + 0.2 * t));
        actor.iceMesh.material.opacity = 0.22 + 0.42 * t;
        actor.velocity.set(0, 0, 0);
      } else {
        shatter(actor.iceMesh.position.clone().setY(actor.position.y + 0.2));
        scene.remove(actor.iceMesh);
        actor.iceMesh.material.dispose();
        actor.iceMesh = null;
        actor.frozen = 0;
        iced.delete(actor);
        if (actor.player) api.setStatus('frozen', false);
      }
    }
  }

  function iceBurst(pos, t) {
    ringEffect(pos, ITEM_DEFS.ice.color, 3.4, 0.45);
    api.spawnHitBurst(pos, t.team, 1.6);
    shatter(pos.clone(), 0xdff9ff);
    let hit = 0;
    for (const actor of api.actors) {
      if (actor.team === t.team || !actor.group.visible || actor.ragdollState) continue;
      if (Math.hypot(actor.position.x - pos.x, actor.position.z - pos.z) < 3.4 && Math.abs(actor.position.y - pos.y) < 3) {
        freezeActor(actor, 3.8);
        hit++;
      }
    }
    if (t.owner === player) api.showToast(hit ? 'ICE CUBE  /  ' + hit + ' FROZEN' : 'ICE CUBE  /  MISSED');
  }

  // ------------------------------------------------------------------ smoke
  function spawnSmoke(pos, announce = true) {
    const puffs = [];
    for (let i = 0; i < 16; i++) {
      const puff = new THREE.Mesh(geo.sphere, new THREE.MeshBasicMaterial({ color: i % 3 ? 0x4be07a : 0x8bffb0, transparent: true, opacity: 0.0, depthWrite: false }));
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.6;
      puff.userData = { ox: Math.cos(a) * r, oz: Math.sin(a) * r, oy: 0.4 + Math.random() * 2.4, size: 1.5 + Math.random() * 1.2, phase: Math.random() * 6 };
      puff.position.set(pos.x + puff.userData.ox, pos.y + puff.userData.oy, pos.z + puff.userData.oz);
      scene.add(puff);
      puffs.push(puff);
    }
    smokes.push({ pos: pos.clone(), life: 9, max: 9, radius: 4.8, puffs });
    while (smokes.length > 3) { const old = smokes.shift(); old.puffs.forEach((m) => { scene.remove(m); m.material.dispose(); }); }
    if (announce) api.showToast('GREEN SMOKE  /  COVER DEPLOYED');
  }

  function updateSmokes(delta) {
    let inside = false;
    for (let i = smokes.length - 1; i >= 0; i--) {
      const s = smokes[i];
      s.life -= delta;
      const age = s.max - s.life;
      const grow = clamp(age / 0.9, 0, 1);
      const fade = clamp(s.life / 2.0, 0, 1);
      for (const puff of s.puffs) {
        const u = puff.userData;
        puff.scale.setScalar(u.size * (0.4 + 0.6 * grow));
        puff.position.set(s.pos.x + u.ox * grow + Math.sin(time * 0.5 + u.phase) * 0.25, s.pos.y + u.oy * (0.5 + 0.5 * grow) + Math.sin(time * 0.7 + u.phase) * 0.12, s.pos.z + u.oz * grow);
        puff.material.opacity = 0.34 * grow * fade;
      }
      if (Math.hypot(player.position.x - s.pos.x, player.position.z - s.pos.z) < s.radius * 0.8) inside = true;
      if (s.life <= 0) { s.puffs.forEach((m) => { scene.remove(m); m.material.dispose(); }); smokes.splice(i, 1); }
    }
    api.setStatus('smoke', inside);
  }

  /** True when the segment from -> to passes through a smoke cloud (blocks bot sight). */
  function smokeBlocks(from, to) {
    for (const s of smokes) {
      if (s.life < 1 || s.max - s.life < 0.5) continue;
      const r = s.radius * 0.78;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const len2 = dx * dx + dz * dz || 1e-6;
      const t = clamp(((s.pos.x - from.x) * dx + (s.pos.z - from.z) * dz) / len2, 0, 1);
      const cx = from.x + dx * t - s.pos.x;
      const cz = from.z + dz * t - s.pos.z;
      if (cx * cx + cz * cz < r * r) return true;
    }
    return false;
  }

  // -------------------------------------------------------------- throwables
  function updateThrown(delta) {
    for (let i = thrown.length - 1; i >= 0; i--) {
      const t = thrown[i];
      t.age += delta;
      let contact = null;
      if (t.stuck) {
        if (t.stuck.group?.visible && !t.stuck.ragdollState) {
          t.mesh.position.set(t.stuck.position.x, t.stuck.position.y + 1.1, t.stuck.position.z);
        }
      } else if (!t.rest) {
        const prev = t.mesh.position.clone();
        t.velocity.y -= GRAVITY * delta;
        t.mesh.position.addScaledVector(t.velocity, delta);
        t.mesh.rotation.x += delta * 7;
        t.mesh.rotation.z += delta * 5;
        const p = t.mesh.position;
        const floor = api.paintSurfaceHeight(p.x, p.z) + 0.16;
        if (p.y < floor) {
          p.y = floor;
          t.velocity.y = Math.abs(t.velocity.y) * 0.32;
          t.velocity.x *= 0.72;
          t.velocity.z *= 0.72;
          t.bounces++;
          contact = 'floor';
          if (t.velocity.length() < 1.6) t.rest = true;
        }
        const wall = api.solidBounds.find((box) => {
          if (p.y <= box.minY || p.y >= box.maxY) return false;
          if (box.shape === 'circle') return (p.x - box.x) ** 2 + (p.z - box.z) ** 2 < (box.radius + 0.12) ** 2;
          return p.x > box.minX - 0.12 && p.x < box.maxX + 0.12 && p.z > box.minZ - 0.12 && p.z < box.maxZ + 0.12;
        });
        if (wall) {
          p.copy(prev);
          t.velocity.x *= -0.3;
          t.velocity.z *= -0.3;
          contact = contact || 'wall';
        }
        if (Math.abs(p.x) > api.HALF - 0.5) { p.x = Math.sign(p.x) * (api.HALF - 0.5); t.velocity.x *= -0.3; }
        if (Math.abs(p.z) > api.HALF - 0.5) { p.z = Math.sign(p.z) * (api.HALF - 0.5); t.velocity.z *= -0.3; }
        if (t.type === 'ice' || t.type === 'sticky') {
          for (const actor of api.actors) {
            if (actor.team === t.team || !actor.group.visible || actor.ragdollState) continue;
            if (Math.hypot(actor.position.x - p.x, actor.position.z - p.z) < 0.9 && p.y > actor.position.y && p.y < actor.position.y + 2.2) {
              contact = actor;
              break;
            }
          }
        }
      }
      if (contact) {
        if (t.type === 'ice') { iceBurst(t.mesh.position.clone(), t); scene.remove(t.mesh); thrown.splice(i, 1); continue; }
        if (t.type === 'smoke' && contact !== 'wall') { spawnSmoke(t.mesh.position.clone().setY(api.paintSurfaceHeight(t.mesh.position.x, t.mesh.position.z)), t.owner === player); scene.remove(t.mesh); thrown.splice(i, 1); continue; }
        if (t.type === 'sticky' && !t.rest && !t.stuck) {
          t.rest = true;
          t.fuse = Math.min(t.fuse - t.age + 1.15, 1.15);
          t.age = 0;
          if (typeof contact === 'object') t.stuck = contact;
        }
      }
      if (t.age >= t.fuse && (t.type === 'grenade' || t.type === 'sticky')) { detonate(t); thrown.splice(i, 1); continue; }
      if (t.type === 'smoke' && t.age > t.fuse) { spawnSmoke(t.mesh.position.clone(), t.owner === player); scene.remove(t.mesh); thrown.splice(i, 1); continue; }
      if (t.type === 'ice' && t.age > t.fuse) { iceBurst(t.mesh.position.clone(), t); scene.remove(t.mesh); thrown.splice(i, 1); continue; }
      if (t.type === 'sticky' || t.type === 'grenade') {
        const flash = t.fuse - t.age < 0.5 ? (Math.sin(t.age * 40) > 0 ? 1.6 : 0.6) : 1;
        t.mesh.scale.setScalar(flash);
      }
    }
  }

  function updateEffects(delta) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.life -= delta;
      const k = 1 - clamp(e.life / e.max, 0, 1);
      if (e.kind === 'ring') {
        e.mesh.scale.setScalar(e.radius * (0.2 + k * 0.9));
        e.mesh.material.opacity = 0.8 * (1 - k);
      } else {
        e.velocity.y -= GRAVITY * delta;
        e.mesh.position.addScaledVector(e.velocity, delta);
        const floor = api.paintSurfaceHeight(e.mesh.position.x, e.mesh.position.z) + 0.1;
        if (e.mesh.position.y < floor) { e.mesh.position.y = floor; e.velocity.y *= -0.3; e.velocity.x *= 0.6; e.velocity.z *= 0.6; }
        e.mesh.rotation.x += e.spin.x * delta;
        e.mesh.rotation.y += e.spin.y * delta;
        e.mesh.rotation.z += e.spin.z * delta;
        e.mesh.traverse((n) => { if (n.isMesh && n.material.transparent !== undefined) n.material.opacity = Math.min(n.material.opacity, clamp(e.life / (e.max * 0.5), 0, 1) * 0.9 + 0.05); });
      }
      if (e.life <= 0) {
        scene.remove(e.mesh);
        e.mesh.traverse((n) => { if (n.isMesh && n.material?.dispose) n.material.dispose(); });
        effects.splice(i, 1);
      }
    }
  }

  function update(delta) {
    time += delta;
    updatePickups(delta);
    updateThrown(delta);
    updateSmokes(delta);
    updateEffects(delta);
    updateIce(delta);
    updateDrinking(delta);
  }

  function reset() {
    while (pickups.length) removePickup(0);
    for (const t of thrown) scene.remove(t.mesh);
    thrown.length = 0;
    for (const s of smokes) s.puffs.forEach((m) => { scene.remove(m); m.material.dispose(); });
    smokes.length = 0;
    for (const e of effects) scene.remove(e.mesh);
    effects.length = 0;
    for (const actor of [...iced]) { if (actor.iceMesh) { scene.remove(actor.iceMesh); actor.iceMesh = null; } actor.frozen = 0; iced.delete(actor); }
    for (const [actor, jug] of heldJugs) { jug.parent?.remove(jug); actor.drinking = 0; actor.drinkBlend = 0; }
    heldJugs.clear();
    for (const actor of api.actors) { actor.drinking = 0; actor.drinkBlend = 0; }
    Object.assign(inventory, { jug: 1, grenade: 1, sticky: 0, ice: 0, smoke: 1 });
    for (const actor of api.actors) if (!actor.player) loadout(actor);
    api.setStatus('frozen', false);
    api.setStatus('smoke', false);
    notifyInventory();
  }

  notifyInventory();
  for (const actor of api.actors) if (!actor.player) loadout(actor);
  return { inventory, inventoryOf, update, reset, useItem, useFor, give, loadout, onElimination, smokeBlocks, freezeActor, spawnPickup, pickups, smokes };
}
