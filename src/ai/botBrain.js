// Bot decision making: roles, goals (paint / fight / refill), A* navigation,
// line-of-sight combat. The game injects its world queries through `api`.
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;
const _eye = new THREE.Vector3();
const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _aim = new THREE.Vector3();

// variation -> behaviour profile
const ROLES = [
  { name: 'flanker', paint: 0.9, aggression: 0.55, lane: 1.0, accuracy: 0.8, fireGap: 0.42 },
  { name: 'painter', paint: 1.4, aggression: 0.35, lane: 0.0, accuracy: 0.7, fireGap: 0.48 },
  { name: 'slayer', paint: 0.6, aggression: 1.0, lane: 0.3, accuracy: 0.9, fireGap: 0.36 },
  { name: 'painter', paint: 1.3, aggression: 0.4, lane: 0.5, accuracy: 0.75, fireGap: 0.46 },
  { name: 'flanker', paint: 0.8, aggression: 0.7, lane: 1.0, accuracy: 0.85, fireGap: 0.40 }
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
        goalTimer: 0, repathTimer: 0, seeTimer: 0, enemy: null, strafe: Math.random() < 0.5 ? -1 : 1,
        strafeTimer: 0.6 + Math.random(), stuckTimer: 0, lastX: actor.position.x, lastZ: actor.position.z,
        stuckCount: 0, paintShotTimer: 0.4 + Math.random() * 0.6, trailTimer: 0.2,
        lastSeenX: 0, lastSeenZ: 0, lastSeenAge: 99
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
    ai.repathTimer = 1.2 + Math.random() * 0.8;
    return true;
  }

  function cellValue(team, x, z) {
    // 0.04 = already ours, 1 = enemy ink (worth the most), 0.85 = neutral.
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
    // Nearest cell of our own colour (search a growing ring of the paint grid).
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

  function senseEnemy(actor, ai, delta) {
    ai.seeTimer -= delta;
    ai.lastSeenAge += delta;
    if (ai.seeTimer > 0) return;
    ai.seeTimer = 0.28 + Math.random() * 0.12;
    _eye.set(actor.position.x, actor.position.y + 1.15, actor.position.z);
    let best = null;
    let bestD = Infinity;
    for (const enemy of api.enemiesOf(actor)) {
      const d = actor.position.distanceTo(enemy.position);
      if (d > (enemy.diving ? 12 : 36) || d >= bestD) continue;
      _target.set(enemy.position.x, enemy.position.y + 1.0, enemy.position.z);
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

  function update(actor, delta) {
    if (actor.frozen > 0) {
      actor.velocity.set(0, 0, 0);
      return;
    }
    ensureNav();
    const ai = state(actor);
    const spec = api.weaponSpec ? api.weaponSpec(actor) : { botCooldown: 0.4, bestRange: 11 };
    const team = actor.team;
    ai.goalTimer -= delta;
    ai.repathTimer -= delta;
    ai.paintShotTimer -= delta;
    ai.trailTimer -= delta;
    ai.strafeTimer -= delta;
    ai.stuckTimer -= delta;

    senseEnemy(actor, ai, delta);
    const enemy = ai.enemy && ai.enemy.group.visible && !ai.enemy.ragdollState ? ai.enemy : null;
    const onFriendly = api.hasFriendlyInk(actor.position.x, actor.position.z, team);
    const lowInk = actor.ink < 24;
    const hurt = actor.health < 38;

    // ---- mode selection -----------------------------------------------------
    let mode = 'paint';
    if (enemy && !lowInk && actor.position.distanceTo(enemy.position) < spec.bestRange + 6 + ai.role.aggression * 10) mode = 'fight';
    if (lowInk || (hurt && !enemy)) mode = 'refill';
    if (hurt && enemy && actor.position.distanceTo(enemy.position) > 8) mode = 'refill';
    if (mode !== ai.mode) { ai.mode = mode; ai.goalTimer = 0; ai.path = []; }

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
    } else if (ai.goalTimer <= 0 || ai.path.length === 0 || ai.index >= ai.path.length) {
      let goal = pickPaintGoal(actor, ai);
      if (ai.lastSeenAge < 5 && ai.role.aggression > 0.8 && Math.random() < 0.6) {
        goal = { x: ai.lastSeenX, z: ai.lastSeenZ };
      }
      if (goal) planTo(actor, ai, goal.x, goal.z);
      ai.goalTimer = 3.2 + Math.random() * 2.4;
    }
    if (ai.repathTimer <= 0 && ai.path.length && mode !== 'fight') planTo(actor, ai, ai.goalX, ai.goalZ);

    // ---- movement ----------------------------------------------------------------
    let desired = null;
    let speed = 0;
    if (mode === 'refill' && onFriendly && actor.ink < 90) {
      speed = 0; // stand in our own ink and recharge
    } else if (mode === 'fight' && enemy) {
      const dx = enemy.position.x - actor.position.x;
      const dz = enemy.position.z - actor.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const toward = new THREE.Vector3(dx / d, 0, dz / d);
      if (ai.strafeTimer <= 0) { ai.strafe *= -1; ai.strafeTimer = 0.7 + Math.random() * 1.1; }
      const side = new THREE.Vector3(-toward.z * ai.strafe, 0, toward.x * ai.strafe);
      const ideal = spec.bestRange - ai.role.aggression * 1.5;
      const push = clamp((d - ideal) / 6, -1, 1);
      desired = side.multiplyScalar(0.85).addScaledVector(toward, push * 0.9);
      if (d > ideal + 5) {
        const along = followPath(actor, ai);
        if (along) desired = along;
      }
      speed = 7.2;
    } else {
      desired = followPath(actor, ai);
      if (desired) {
        const remaining = ai.path.length - ai.index;
        speed = remaining > 3 && !enemy ? 10.8 : 8.2;
        if (mode === 'refill') speed = 10.8;
      }
    }

    speed *= actor.speedFactor ?? 1;
    const velocity = actor.velocity;
    if (desired && speed > 0 && desired.lengthSq() > 0.0001) {
      desired.normalize();
      velocity.lerp(new THREE.Vector3(desired.x * speed, 0, desired.z * speed), 1 - Math.exp(-9 * delta));
    } else {
      velocity.multiplyScalar(Math.exp(-12 * delta));
    }
    const planar = Math.hypot(velocity.x, velocity.z);
    if (planar > 0.05) {
      api.moveOnGround(actor, velocity.x * delta, velocity.z * delta, 0.43);
      actor.group.position.copy(actor.position);
    }

    // ---- facing --------------------------------------------------------------------
    if (enemy) {
      turnToward(actor, Math.atan2(-(enemy.position.x - actor.position.x), -(enemy.position.z - actor.position.z)), 16, delta);
    } else if (planar > 0.8) {
      turnToward(actor, Math.atan2(-velocity.x, -velocity.z), 12, delta);
    }

    // ---- stuck handling ----------------------------------------------------------------
    if (ai.stuckTimer <= 0) {
      ai.stuckTimer = 1.1;
      const moved = Math.hypot(actor.position.x - ai.lastX, actor.position.z - ai.lastZ);
      if (speed > 0 && moved < 0.45) {
        ai.stuckCount++;
        ai.path = [];
        ai.goalTimer = 0;
        if (ai.stuckCount > 1) api.moveOnGround(actor, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4, 0.43);
      } else {
        ai.stuckCount = 0;
      }
      ai.lastX = actor.position.x;
      ai.lastZ = actor.position.z;
    }

    // ---- combat & painting ---------------------------------------------------------------
    if (enemy && actor.fireCooldown <= 0 && actor.ink >= 4) {
      const distance = actor.position.distanceTo(enemy.position);
      const lead = distance / 38;
      const spread = (0.35 + distance * 0.07) * (1.45 - ai.role.accuracy);
      _aim.set(
        enemy.position.x + enemy.velocity.x * lead + (Math.random() - 0.5) * spread,
        enemy.position.y + 0.95,
        enemy.position.z + enemy.velocity.z * lead + (Math.random() - 0.5) * spread
      );
      api.fireActor(actor, _aim);
      actor.fireCooldown = Math.max(spec.botCooldown * (0.85 + Math.random() * 0.4), ai.role.fireGap * 0.6);
    } else if (!enemy && actor.ink > 38 && ai.paintShotTimer <= 0 && planar > 3 && actor.fireCooldown <= 0 && mode !== 'refill') {
      const reach = 6 + Math.random() * 5;
      const sx = actor.position.x - Math.sin(actor.group.rotation.y) * reach;
      const sz = actor.position.z - Math.cos(actor.group.rotation.y) * reach;
      _aim.set(sx + (Math.random() - 0.5) * 3, api.groundHeight(sx, sz), sz + (Math.random() - 0.5) * 3);
      api.fireActor(actor, _aim);
      actor.fireCooldown = 0.55;
      ai.paintShotTimer = 0.8 + Math.random() * 0.8;
    }
    if (planar > 1.5 && ai.trailTimer <= 0) {
      ai.trailTimer = 0.42;
      api.paintAt(new THREE.Vector3(actor.position.x, 0, actor.position.z), team, planar > 9 ? 1.45 : 1.2, true);
    }
    actor.effectTimer -= delta;
    if (planar > 3 && actor.effectTimer <= 0) {
      api.spawnMotionSpray(actor, planar > 9 ? 3 : 1, planar > 9 ? 0.9 : 0.5);
      actor.effectTimer = planar > 9 ? 0.12 : 0.24;
    }

    // ---- ink economy --------------------------------------------------------------------
    actor.ink = Math.min(100, actor.ink + delta * (onFriendly ? 24 : 9));
    api.animateActor(actor, planar > 0.8 ? 1 : 0, delta);
  }

  return { update, lineOfSight };
}
