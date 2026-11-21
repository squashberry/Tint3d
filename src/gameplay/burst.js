// Pixel burst: eliminated actors pop into a cloud of cubes (one InstancedMesh).
import * as THREE from 'three';

export function createPixelBurst(scene, capacity = 1100) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.frustumCulled = false;
  mesh.layers.enable(1);
  scene.add(mesh);
  const pixels = Array.from({ length: capacity }, () => ({
    active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler(),
    size: 0.1, life: 0, max: 1, floorAt: () => 0
  }));
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const rings = [];
  let cursor = 0;
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, hidden);
  mesh.instanceMatrix.needsUpdate = true;
  const ringGeometry = new THREE.RingGeometry(0.4, 0.55, 28);

  /** palette: hex colours; origin: feet position; push: world direction of the killing shot (optional). */
  function spawn(origin, palette, { count = 170, height = 1.8, power = 6.5, push = null, floorAt = () => 0 } = {}) {
    for (let n = 0; n < count; n++) {
      const index = cursor;
      const p = pixels[index];
      cursor = (cursor + 1) % capacity;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 0.42;
      p.pos.set(origin.x + Math.cos(angle) * radius, origin.y + 0.1 + Math.random() * height, origin.z + Math.sin(angle) * radius);
      p.vel.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(power * (0.35 + Math.random() * 0.9));
      p.vel.y = 2 + Math.random() * power * 0.9;
      if (push) p.vel.addScaledVector(push, 3 + Math.random() * 3);
      p.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      p.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      p.size = 0.07 + Math.random() * 0.15;
      p.max = p.life = 1.5 + Math.random() * 1.2;
      p.active = true;
      p.floorAt = floorAt;
      color.setHex(palette[Math.floor(Math.random() * palette.length)]);
      color.multiplyScalar(0.85 + Math.random() * 0.3);
      mesh.setColorAt(index, color);
    }
    mesh.instanceColor.needsUpdate = true;
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({
      color: palette[0], transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(origin.x, floorAt(origin.x, origin.z) + 0.1, origin.z);
    scene.add(ring);
    rings.push({ mesh: ring, life: 0.5, max: 0.5 });
  }

  function update(delta) {
    for (let i = 0; i < capacity; i++) {
      const p = pixels[i];
      if (!p.active) continue;
      p.life -= delta;
      if (p.life <= 0) {
        p.active = false;
        mesh.setMatrixAt(i, hidden);
        continue;
      }
      p.vel.y -= 19 * delta;
      p.pos.addScaledVector(p.vel, delta);
      const floor = p.floorAt(p.pos.x, p.pos.z) + p.size * 0.5;
      if (p.pos.y < floor) {
        p.pos.y = floor;
        p.vel.y = Math.abs(p.vel.y) * 0.38;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
        p.spin.multiplyScalar(0.6);
      }
      p.rot.x += p.spin.x * delta;
      p.rot.y += p.spin.y * delta;
      p.rot.z += p.spin.z * delta;
      dummy.position.copy(p.pos);
      dummy.rotation.copy(p.rot);
      dummy.scale.setScalar(p.size * Math.min(1, p.life / 0.6));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= delta;
      const k = 1 - Math.max(0, r.life / r.max);
      r.mesh.scale.setScalar(1 + k * 5.5);
      r.mesh.material.opacity = 0.85 * (1 - k);
      if (r.life <= 0) {
        scene.remove(r.mesh);
        r.mesh.material.dispose();
        rings.splice(i, 1);
      }
    }
  }

  return { spawn, update };
}
