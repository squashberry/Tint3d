// Bot decision making. Bots play with the same toolset as the player: run, sprint,
// jump, slide, dash, ink dive, items (jug / grenade / sticky / ice / smoke), picking
// up dropped guns and loot, burst-fire with reaction time. The game injects its world
// queries through `api`.
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const rand = (a, b) => a + Math.random() * (b - a);
const _eye = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _v = new THREE.Vector3();

// variation -> behaviour profile
const ROLES = [
  { name: 'flanker', paint: 0.9, aggression: 0.55, lane: 1.0, accuracy: 0.8, nerve: 0.6 },
  { name: 'painter', paint: 1.4, aggression: 0.35, lane: 0.0, accuracy: 0.7, nerve: 0.4 },
  { name: 'slayer', paint: 0.6, aggression: 1.0, lane: 0.3, accuracy: 0.9, nerve: 0.9 },
  { name: 'painter', paint: 1.3, aggression: 0.4, lane: 0.5, accuracy: 0.75, nerve: 0.5 },
  { name: 'flanker', paint: 0.8, aggression: 0.7, lane: 1.0, accuracy: 0.85, nerve: 0.7 }
];

export function createBotBrain(api) {
  const { nav } = api;
  let navCount = -1;

  function ensureNav() {
    if (navCount !== api.solidBounds.length) {
      navCount = api.solidBounds.length;
      nav.rebuild();
    }
  }

  function state(actor) {
    if (!actor.ai) {
      actor.ai = {
        role: ROLES[actor.variation % ROLES.length],
        mode: 'paint', path: [], index: 0, goalX: actor.position.x, goalZ: actor.position.z,
        goalTimer: 0, repathTimer: 0, seeTimer: 0, enemy: null, hadEnemy: false,
        strafe: Math.random() < 0.5 ? -1 : 1, strafeTimer: rand(0.6, 1.6),
        stuckTimer: 0, lastX: actor.position.x, lastZ: actor.position.z, stuckCount: 0,
        paintShotTimer: rand(0.4, 1), trailTimer: 0.2, lastSeenX: 0, lastSeenZ: 0, lastSeenAge: 99,
        reactTimer: 0, restTimer: 0, burst: 3, focus: 0,
        jumpTimer: rand(1, 3), slideCd: rand(2, 5), dashCd: rand(2, 5), itemTimer: rand(1, 3), lootTimer: rand(0.5, 2)
      };
    }
    return actor.ai;
  }

  function lineOfSight(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dy = to.y - from.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.8));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      const z = from.z + dz * t;
      for (const box of api.solidBounds) {
        if (y <= box.minY || y >= box.maxY) continue;
        if (box.shape === 'circle') {
          const ddx = x - box.x;
          const ddz = z - box.z;
          if (ddx * ddx + ddz * ddz < box.radius * box.radius) return false;
        } else if (x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ) {
          return false;
        }
      }
    }
    return true;
  }

  function inkCost(team) {
    // Walking through enemy ink is slow and hurts, so the planner avoids it.
    return (cell) => {
      const [x, z] = nav.cellCenter(cell % nav.size, (cell / nav.size) | 0);
      const owner = api.ownerAt(x, z);
      return owner !== 0 && owner !== team ? 2.2 : 0;
    };
  }

  function planTo(actor, ai, x, z) {
    const path = nav.findPath(actor.position.x, actor.position.z, x, z, inkCost(actor.team));
    if (!path || !path.length) return false;
    ai.path = path;
    ai.index = 0;
    ai.goalX = x;
    ai.goalZ = z;
    ai.repathTimer = rand(1.2, 2.0);
    return true;
  }

  function cellValue(team, x, z) {
    let score = 0;
    let n = 0;
    for (const [dx, dz] of [[0, 0], [2.4, 0], [-2.4, 0], [0, 2.4], [0, -2.4]]) {
      const owner = api.ownerAt(x + dx, z + dz);
      score += owner === team ? 0.04 : (owner === 0 ? 0.85 : 1.0);
      n++;
    }
    return score / n;
  }

  function pickPaintGoal(actor, ai) {
    const team = actor.team;
    const enemySide = team === api.BLUE ? -1 : 1;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 16; i++) {
      const x = (Math.random() * 2 - 1) * (api.HALF - 4);
      const z = (Math.random() * 2 - 1) * (api.HALF - 4);
      if (!nav.isCellWalkable(nav.toCell(x, z))) continue;
      const distance = Math.hypot(x - actor.position.x, z - actor.position.z);
      let score = cellValue(team, x, z) * 2.2 * ai.role.paint;
      score -= distance * 0.016;
      score += (z * enemySide / api.HALF) * 0.55 * (0.4 + ai.role.aggression * 0.6);
      score += (Math.abs(x) / api.HALF) * ai.role.lane * 0.7;
      score += Math.random() * 0.35;
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
    return best;
  }

  function pickRefillGoal(actor) {
    const cx = Math.floor((actor.position.x + api.HALF) / api.gridStep);
    const cz = Math.floor((actor.position.z + api.HALF) / api.gridStep);
    let best = null;
    let bestD = Infinity;
    for (let r = 1; r < 30 && !best; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const gx = cx + dx;
          const gz = cz + dz;
          if (gx < 0 || gz < 0 || gx >= api.GRID || gz >= api.GRID) continue;
          if (api.owners[gz * api.GRID + gx] !== actor.team) continue;
          const x = -api.HALF + (gx + 0.5) * api.gridStep;
          const z = -api.HALF + (gz + 0.5) * api.gridStep;
          if (!nav.isCellWalkable(nav.toCell(x, z))) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) { bestD = d; best = { x, z }; }
        }
      }
    }
    return best;
  }

  function findLoot(actor) {
    const inv = api.items.inventoryOf(actor);
    let best = null;
    let bestD = 26 * 26;
    for (const p of api.items.pickups) {
      if (p.flying || p.ignore > 0) continue;
      const wants = p.kind === 'weapon'
        ? actor.weaponType === 'pulse' && p.type !== 'pulse'
        : inv[p.type] < 3 && (p.type !== 'jug' || actor.health < 92 || inv.jug < 1);
      if (!wants) continue;
      const d = (p.x - actor.position.x) ** 2 + (p.z - actor.position.z) ** 2;
      if (d < bestD && nav.isCellWalkable(nav.toCell(p.x, p.z))) { bestD = d; best = p; }
    }
    return best;
  }

  function senseEnemy(actor, ai, delta) {
    ai.seeTimer -= delta;
    ai.lastSeenAge += delta;
    if (ai.seeTimer > 0) return;
    ai.seeTimer = rand(0.28, 0.4);
    _eye.set(actor.position.x, actor.position.y + 1.15, actor.position.z);
    let best = null;
    let bestD = Infinity;
    for (const enemy of api.enemiesOf(actor)) {
      const d = actor.position.distanceTo(enemy.position);
      if (d > (enemy.diving ? 12 : 36) || d >= bestD) continue;
      _target.set(enemy.position.x, enemy.position.y + (enemy.diving ? 0.3 : 1.0), enemy.position.z);
      if (!lineOfSight(_eye, _target) || (api.smokeBlocks && api.smokeBlocks(_eye, _target))) continue;
      best = enemy;
      bestD = d;
    }
    ai.enemy = best;
    if (best) {
      ai.lastSeenX = best.position.x;
      ai.lastSeenZ = best.position.z;
      ai.lastSeenAge = 0;
    }
  }

  function followPath(actor, ai) {
    while (ai.index < ai.path.length) {
      const p = ai.path[ai.index];
      if (Math.hypot(p.x - actor.position.x, p.z - actor.position.z) < 0.9) ai.index++;
      else break;
    }
    if (ai.index >= ai.path.length) return null;
    const p = ai.path[ai.index];
    _dir.set(p.x - actor.position.x, 0, p.z - actor.position.z);
    const length = _dir.length();
    if (length < 0.001) return null;
    return _dir.multiplyScalar(1 / length);
  }

  function turnToward(actor, yawTarget, rate, delta) {
    const turn = Math.atan2(Math.sin(yawTarget - actor.group.rotation.y), Math.cos(yawTarget - actor.group.rotation.y));
    actor.group.rotation.y += turn * (1 - Math.exp(-rate * delta));
  }

  function startSlide(actor, dir) {
    actor.sliding = true;
    actor.slideTimer = 0.95 + (api.hasFriendlyInk(actor.position.x, actor.position.z, actor.team) ? 0.5 : 0);
    actor.slideSpeed = 15;
    actor.slideDirection.set(dir.x, 0, dir.z).normalize();
    const floor = api.actorSurfaceHeight(actor, actor.position.x, actor.position.z);
    api.spawnSplash(new THREE.Vector3(actor.position.x, floor, actor.position.z), actor.team, floor);
  }

  function jump(actor, power) {
    actor.grounded = false;
    actor.verticalVelocity = power;
    actor.velocity.multiplyScalar(1.04);
  }

  function useItems(actor, ai, enemy, distance, delta) {
    ai.itemTimer -= delta;
    if (ai.itemTimer > 0 || actor.drinking > 0 || actor.frozen > 0 || actor.diving) return;
    const inv = api.items.inventoryOf(actor);
    ai.itemTimer = rand(0.4, 0.8);
    const use = (type, aim) => {
      if (!api.items.useFor(actor, type, aim)) return false;
      ai.itemTimer = rand(2.2, 4.2);
      return true;
    };
    // Heal when it is safe (or the jug is the only way out).
    if (inv.jug > 0 && actor.health < 56 && actor.grounded !== false && (!enemy || distance > 15 || actor.health < 28)) {
      if (use('jug')) return;
    }
    if (!enemy) return;
    const lead = distance / 20;
    const aim = new THREE.Vector3(
      enemy.position.x + enemy.velocity.x * lead + rand(-1.1, 1.1),
      enemy.position.y,
      enemy.position.z + enemy.velocity.z * lead + rand(-1.1, 1.1)
    );
    if (inv.smoke > 0 && actor.health < 50 && distance < 26 && Math.random() < 0.7) {
      const t = Math.min(distance * 0.45, 9);
      const mid = new THREE.Vector3(
        actor.position.x + (enemy.position.x - actor.position.x) / (distance || 1) * t, 0,
        actor.position.z + (enemy.position.z - actor.position.z) / (distance || 1) * t
      );
      if (use('smoke', mid)) return;
    }
    if (inv.ice > 0 && distance > 5 && distance < 17 && Math.random() < 0.55 && use('ice', aim)) return;
    if (inv.sticky > 0 && distance > 6 && distance < 20 && Math.random() < 0.45 && use('sticky', aim)) return;
    if (inv.grenade > 0 && distance > 7 && distance < 22 && Math.random() < 0.55) use('grenade', aim);
  }

  function update(actor, delta) {
    if (actor.frozen > 0) {
      actor.velocity.set(0, 0, 0);
      api.updateDive(actor, delta, false);
      return;
    }
    ensureNav();
    const ai = state(actor);
    const spec = api.weaponSpec(actor);
    const team = actor.team;
    ai.goalTimer -= delta;
    ai.repathTimer -= delta;
    ai.paintShotTimer -= delta;
    ai.trailTimer -= delta;
    ai.strafeTimer -= delta;
    ai.stuckTimer -= delta;
    ai.jumpTimer -= delta;
    ai.slideCd -= delta;
    ai.dashCd -= delta;
    ai.lootTimer -= delta;
    ai.reactTimer -= delta;
    ai.restTimer -= delta;
    actor.flow = Math.max(0, (actor.flow || 0) - delta);

    senseEnemy(actor, ai, delta);
    const enemy = ai.enemy && ai.enemy.group.visible && !ai.enemy.ragdollState ? ai.enemy : null;
    if (enemy && !ai.hadEnemy) { ai.reactTimer = rand(0.18, 0.5); ai.focus = 0; }
    ai.hadEnemy = !!enemy;
    if (enemy) ai.focus = Math.min(1, ai.focus + delta * 0.6);
    const distance = enemy ? actor.position.distanceTo(enemy.position) : 99;
    const onFriendly = api.hasFriendlyInk(actor.position.x, actor.position.z, team);
    const lowInk = actor.ink < Math.max(24, spec.ink * 2);
    const hurt = actor.health < 38;
    const grounded = actor.grounded !== false;

    // ---- mode selection -----------------------------------------------------
    let mode = 'paint';
    if (enemy && !lowInk && distance < spec.bestRange + 6 + ai.role.aggression * 10) mode = 'fight';
    if (lowInk || (hurt && !enemy)) mode = 'refill';
    if (hurt && enemy && distance > 8 && ai.role.nerve < 0.85) mode = 'refill';
    if (mode !== ai.mode) { ai.mode = mode; ai.goalTimer = 0; ai.path = []; }

    useItems(actor, ai, enemy, distance, delta);

    // ---- goals ------------------------------------------------------------------
    if (mode === 'refill') {
      if (ai.goalTimer <= 0 || ai.path.length === 0) {
        const goal = pickRefillGoal(actor);
        if (goal) planTo(actor, ai, goal.x, goal.z);
        ai.goalTimer = 1.8;
      }
    } else if (mode === 'fight') {
      if (ai.goalTimer <= 0 || ai.path.length === 0) {
        const dx = enemy.position.x - actor.position.x;
        const dz = enemy.position.z - actor.position.z;
        const d = Math.hypot(dx, dz) || 1;
        const hold = spec.bestRange - ai.role.aggression * 2;
        planTo(actor, ai, enemy.position.x - (dx / d) * hold, enemy.position.z - (dz / d) * hold);
        ai.goalTimer = 0.9;
      }
    } else {
      if (!enemy && ai.lootTimer <= 0) {
        ai.lootTimer = 1.4;
        const loot = findLoot(actor);
        if (loot && planTo(actor, ai, loot.x, loot.z)) ai.goalTimer = 2.2;
      }
      if (ai.goalTimer <= 0 || ai.path.length === 0 || ai.index >= ai.path.length) {
        let goal = pickPaintGoal(actor, ai);
        if (ai.lastSeenAge < 5 && ai.role.aggression > 0.8 && Math.random() < 0.6) goal = { x: ai.lastSeenX, z: ai.lastSeenZ };
        if (goal) planTo(actor, ai, goal.x, goal.z);
        ai.goalTimer = rand(3.2, 5.6);
      }
    }
    if (ai.repathTimer <= 0 && ai.path.length && mode !== 'fight') planTo(actor, ai, ai.goalX, ai.goalZ);

    // ---- desired movement ------------------------------------------------------------------
    let desired = null;
    let speed = 0;
    const staying = mode === 'refill' && onFriendly && (actor.ink < 92 || actor.health < 85);
    if (staying) {
      speed = 0;
    } else if (mode === 'fight' && enemy) {
      const dx = enemy.position.x - actor.position.x;
      const dz = enemy.position.z - actor.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const toward = new THREE.Vector3(dx / d, 0, dz / d);
      if (ai.strafeTimer <= 0) { ai.strafe *= -1; ai.strafeTimer = rand(0.7, 1.8); }
      const side = new THREE.Vector3(-toward.z * ai.strafe, 0, toward.x * ai.strafe);
      const ideal = spec.bestRange - ai.role.aggression * 1.5;
      const push = clamp((d - ideal) / 6, -1, 1);
      desired = side.multiplyScalar(0.85).addScaledVector(toward, push * 0.9);
      if (d > ideal + 5) {
        const along = followPath(actor, ai);
        if (along) desired = along;
      }
      speed = 8.4;
    } else {
      desired = followPath(actor, ai);
      if (desired) {
        const long = ai.path.length - ai.index > 3 && !enemy;
        speed = long || mode === 'refill' ? 13.2 : 8.4;
        actor.sprinting = long || mode === 'refill';
      }
    }
    if (!desired || speed <= 0) actor.sprinting = false;

    // ---- ink dive: slip through our own paint when nobody is close ---------------------------
    let aheadFriendly = false;
    if (desired) aheadFriendly = api.hasFriendlyInk(actor.position.x + desired.x * 2.2, actor.position.z + desired.z * 2.2, team);
    const calm = !enemy || distance > 20;
    let wantDive = false;
    if (!(actor.drinking > 0) && !actor.sliding && actor.flow <= 0) {
      if (staying) wantDive = true;
      else if (onFriendly && calm && desired && aheadFriendly && ai.path.length - ai.index > 1) wantDive = true;
      else if (actor.diving && onFriendly && calm && mode !== 'fight' && (!desired || aheadFriendly)) wantDive = true;
    }
    const diving = api.updateDive(actor, delta, wantDive);
    if (diving) { speed = staying ? 0 : 12.4; actor.sprinting = false; }
    if (actor.drinking > 0) { speed = Math.min(speed, 3.4); actor.sprinting = false; }

    // ---- dodge: jump, slide, dash ------------------------------------------------------------
    const canMoveFancy = grounded && !diving && !(actor.drinking > 0) && !actor.sliding;
    if (canMoveFancy) {
      if (actor.hitTimer > 0.18 && Math.random() < 0.5) jump(actor, 8.0);
      else if (ai.jumpTimer <= 0) {
        if (mode === 'fight' && enemy && distance < 22 && Math.random() < 0.6) jump(actor, rand(7.6, 8.4));
        else if (actor.sprinting && Math.random() < 0.12) jump(actor, 8.2);
        ai.jumpTimer = mode === 'fight' ? rand(0.8, 2.4) : rand(2.5, 6);
      }
    }
    if (canMoveFancy && ai.slideCd <= 0 && desired) {
      const planarNow = Math.hypot(actor.velocity.x, actor.velocity.z);
      if (mode === 'fight' && enemy && distance > 6 && distance < 17 && planarNow > 4 && Math.random() < 0.5) {
        startSlide(actor, desired);
        ai.slideCd = rand(3.2, 6);
      } else if (actor.sprinting && planarNow > 10 && Math.random() < 0.35) {
        startSlide(actor, actor.velocity);
        ai.slideCd = rand(3.5, 7);
      } else {
        ai.slideCd = 0.6;
      }
    }
    actor.flowCooldown = Math.max(0, (actor.flowCooldown || 0) - delta);
    if (canMoveFancy && !actor.sliding && ai.dashCd <= 0 && desired && actor.flowCooldown <= 0) {
      if ((mode === 'fight' && enemy && (actor.health < 45 || distance > 15) && Math.random() < 0.5) || (mode === 'refill' && enemy)) {
        const dashDir = mode === 'refill' && enemy
          ? _v.set(actor.position.x - enemy.position.x, 0, actor.position.z - enemy.position.z).normalize()
          : desired;
        actor.flow = 0.38;
        actor.flowCooldown = 3;
        actor.velocity.x = dashDir.x * 19.5;
        actor.velocity.z = dashDir.z * 19.5;
        api.spawnMotionSpray(actor, 8, 1.8);
        ai.dashCd = rand(3, 6);
      } else {
        ai.dashCd = 0.8;
      }
    }

    // ---- velocity ---------------------------------------------------------------------------------
    speed *= actor.speedFactor ?? 1;
    const velocity = actor.velocity;
    if (actor.sliding) {
      actor.slideTimer -= delta;
      const onInk = api.hasFriendlyInk(actor.position.x, actor.position.z, team);
      actor.slideSpeed = Math.max(5, actor.slideSpeed * Math.exp(-(onInk ? 0.34 : 0.58) * delta));
      velocity.x = actor.slideDirection.x * actor.slideSpeed;
      velocity.z = actor.slideDirection.z * actor.slideSpeed;
      if (actor.slideTimer <= 0 || !grounded) actor.sliding = false;
    } else if (actor.flow > 0 && desired) {
      desired.normalize();
      velocity.lerp(new THREE.Vector3(desired.x * 16, 0, desired.z * 16), 1 - Math.exp(-9 * delta));
    } else if (desired && speed > 0 && desired.lengthSq() > 0.0001) {
      desired.normalize();
      const response = !grounded ? 3 : (diving ? 12 : 9);
      velocity.lerp(new THREE.Vector3(desired.x * speed, 0, desired.z * speed), 1 - Math.exp(-response * delta));
    } else if (grounded) {
      velocity.multiplyScalar(Math.exp(-12 * delta));
    }
    const planar = Math.hypot(velocity.x, velocity.z);

    const beforeX = actor.position.x;
    const beforeZ = actor.position.z;
    if (planar > 0.05) {
      api.moveOnGround(actor, velocity.x * delta, velocity.z * delta, actor.sliding ? 0.40 : 0.43);
    } else if (!grounded) {
      api.moveOnGround(actor, 0, 0, 0.43);
    }
    if (planar > 2 && !diving && !actor.sliding) {
      const moved = Math.hypot(actor.position.x - beforeX, actor.position.z - beforeZ);
      api.ledgeAssist(actor, planar * delta, moved, velocity.x / planar, velocity.z / planar, delta);
    }
    // ---- vertical motion ----------------------------------------------------------------------------
    if (actor.grounded === false) {
      actor.verticalVelocity -= (actor.verticalVelocity > 0 ? 20.5 : 27) * delta;
      actor.position.y += actor.verticalVelocity * delta;
      const surface = api.actorSurfaceHeight(actor, actor.position.x, actor.position.z);
      if (actor.position.y <= surface) {
        if (actor.verticalVelocity < -2.8) {
          actor.landImpact = clamp(Math.abs(actor.verticalVelocity) * 0.075, 0.18, 1);
          api.spawnSplash(new THREE.Vector3(actor.position.x, surface, actor.position.z), team, surface);
        }
        actor.position.y = surface;
        actor.verticalVelocity = 0;
        actor.grounded = true;
      }
    }
    actor.group.position.copy(actor.position);
    if (diving) api.diveTick(actor, delta);

    // ---- facing --------------------------------------------------------------------------------------
    if (enemy && !diving) {
      turnToward(actor, Math.atan2(-(enemy.position.x - actor.position.x), -(enemy.position.z - actor.position.z)), 16, delta);
    } else if (planar > 0.8) {
      turnToward(actor, Math.atan2(-velocity.x, -velocity.z), 12, delta);
    }

    // ---- stuck handling --------------------------------------------------------------------------------
    if (ai.stuckTimer <= 0) {
      ai.stuckTimer = 1.1;
      const moved = Math.hypot(actor.position.x - ai.lastX, actor.position.z - ai.lastZ);
      if (speed > 0 && moved < 0.45 && !actor.sliding) {
        ai.stuckCount++;
        ai.path = [];
        ai.goalTimer = 0;
        if (grounded && ai.stuckCount > 1) jump(actor, 8.2);
        if (ai.stuckCount > 2) api.moveOnGround(actor, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4, 0.43);
      } else {
        ai.stuckCount = 0;
      }
      ai.lastX = actor.position.x;
      ai.lastZ = actor.position.z;
    }

    // ---- combat & painting (no shooting while diving, drinking or frozen) ---------------------------------
    const canShoot = !diving && !(actor.drinking > 0);
    const single = spec.pellets > 1 || spec.cooldown > 0.3;
    if (canShoot && enemy && ai.reactTimer <= 0 && ai.restTimer <= 0 && actor.fireCooldown <= 0 && actor.ink >= spec.ink) {
      const lead = distance / spec.speed;
      const spread = (0.28 + distance * 0.06) * (1.5 - ai.role.accuracy) * (1.5 - ai.focus * 0.7);
      _aim.set(
        enemy.position.x + enemy.velocity.x * lead + rand(-0.5, 0.5) * spread,
        enemy.position.y + (enemy.diving ? 0.2 : 0.95),
        enemy.position.z + enemy.velocity.z * lead + rand(-0.5, 0.5) * spread
      );
      api.fireActor(actor, _aim);
      actor.fireCooldown = spec.botCooldown * rand(0.9, 1.3);
      ai.burst--;
      if (ai.burst <= 0) {
        ai.burst = single ? 1 : 3 + Math.floor(Math.random() * 4);
        ai.restTimer = single ? rand(0.05, 0.25) : rand(0.25, 0.7);
      }
    } else if (canShoot && !enemy && actor.ink > 38 && ai.paintShotTimer <= 0 && planar > 3 && actor.fireCooldown <= 0 && mode !== 'refill' && actor.ink >= spec.ink) {
      const reach = rand(6, 11);
      const sx = actor.position.x - Math.sin(actor.group.rotation.y) * reach;
      const sz = actor.position.z - Math.cos(actor.group.rotation.y) * reach;
      _aim.set(sx + rand(-1.5, 1.5), api.groundHeight(sx, sz), sz + rand(-1.5, 1.5));
      api.fireActor(actor, _aim);
      actor.fireCooldown = Math.max(0.55, spec.botCooldown);
      ai.paintShotTimer = rand(0.8, 1.6);
    }
    if (planar > 1.5 && ai.trailTimer <= 0 && !diving) {
      ai.trailTimer = 0.42;
      api.paintAt(new THREE.Vector3(actor.position.x, 0, actor.position.z), team, planar > 9 ? 1.45 : 1.2, true);
    }
    actor.effectTimer -= delta;
    if (planar > 3 && actor.effectTimer <= 0 && !diving) {
      api.spawnMotionSpray(actor, planar > 9 ? 3 : 1, planar > 9 ? 0.9 : 0.5);
      actor.effectTimer = planar > 9 ? 0.12 : 0.24;
    }

    // ---- ink economy -----------------------------------------------------------------------------------
    if (!diving) actor.ink = Math.min(100, actor.ink + delta * (onFriendly ? 24 : 9));
    api.animateActor(actor, planar > 0.8 ? 1 : 0, delta);
  }

  return { update, lineOfSight };
}
