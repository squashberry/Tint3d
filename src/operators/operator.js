// Builds rigged operators from the shared asset set and wires them to the
// animation controller. New bodies, hairstyles and equipment are data entries
// below; none of them touch the animation system.
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { loadOperatorAssets } from './assets.js';
import { loadTracker } from '../boot/loadTracker.js';
import { OperatorAnimator, buildClipSet } from './animator.js';

// 10 distinct operators: variation 0-4 per team (blue uses 0-4, orange 5-9).
export const APPEARANCES = [
  { body: 'male',   skin: 'dark',  hair: 'Hair_Buzzed',        hairColor: 0x1b1411 },
  { body: 'female', skin: 'light', hair: 'Hair_Long',          hairColor: 0x7a4a24 },
  { body: 'male',   skin: 'light', hair: 'Hair_SimpleParted',  hairColor: 0x2b211a },
  { body: 'female', skin: 'dark',  hair: 'Hair_Buns',          hairColor: 0x120d0a },
  { body: 'male',   skin: 'dark',  hair: 'Hair_SimpleParted',  hairColor: 0x3a2314, beard: true },
  { body: 'female', skin: 'light', hair: 'Hair_BuzzedFemale',  hairColor: 0xc28a45 },
  { body: 'male',   skin: 'light', hair: 'Hair_Long',          hairColor: 0x5a2d1c },
  { body: 'female', skin: 'dark',  hair: 'Hair_Long',          hairColor: 0x1d1410 },
  { body: 'male',   skin: 'dark',  hair: 'Hair_Buns',          hairColor: 0x2a1a12, beard: true },
  { body: 'female', skin: 'light', hair: 'Hair_Buns',          hairColor: 0x8f3c2a }
];

const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
const tankCache = new Map();

function tankParts(palette) {
  const key = palette.ink;
  if (tankCache.has(key)) return tankCache.get(key);
  const parts = {
    shell: new THREE.CapsuleGeometry(0.115, 0.30, 4, 12),
    liquid: new THREE.CapsuleGeometry(0.092, 0.27, 4, 10),
    cap: new THREE.CylinderGeometry(0.055, 0.07, 0.05, 10),
    shellMat: new THREE.MeshStandardMaterial({ color: 0x27323a, roughness: 0.5, metalness: 0.35 }),
    liquidMat: new THREE.MeshStandardMaterial({
      color: palette.ink, emissive: palette.ink, emissiveIntensity: 0.55, roughness: 0.25,
      transparent: true, opacity: 0.92
    })
  };
  tankCache.set(key, parts);
  return parts;
}

/** Ink tank backpack: shared geometry/material per team. */
function makeInkTank(palette) {
  const p = tankParts(palette);
  const group = new THREE.Group();
  const shell = new THREE.Mesh(p.shell, p.shellMat);
  const liquid = new THREE.Mesh(p.liquid, p.liquidMat);
  liquid.position.z = 0.012;
  const cap = new THREE.Mesh(p.cap, p.shellMat);
  cap.position.y = 0.23;
  group.add(shell, liquid, cap);
  return group;
}

/** Rigidly attach `object` to `bone`, positioned by a transform given in character (group) space. */
export function attachRigid(group, bone, object, position, quaternion) {
  group.updateMatrixWorld(true);
  const desired = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  const world = new THREE.Matrix4().multiplyMatrices(group.matrixWorld, desired);
  const local = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().copy(bone.matrixWorld).invert(), world);
  local.decompose(object.position, object.quaternion, object.scale);
  bone.add(object);
}

function bindToBodySkeleton(skinned, bodyBones) {
  const source = skinned.skeleton;
  const bones = source.bones.map((bone) => bodyBones.get(bone.name));
  if (bones.some((bone) => !bone)) return false;
  const skeleton = new THREE.Skeleton(bones, source.boneInverses.map((m) => m.clone()));
  skinned.bind(skeleton, skinned.bindMatrix.clone());
  return true;
}

function applyRenderFlags(root, isPlayer) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.frustumCulled = false;
    node.castShadow = isPlayer;
    node.receiveShadow = false;
    if (isPlayer) node.layers.set(0);
    else node.layers.enable(1);
  });
}

export class Operator {
  constructor(group, assets, options) {
    this.group = group;
    this.assets = assets;
    this.options = options;
    this.hairMesh = null;
    this.beardMesh = null;
    this.accessories = [];
    this._build();
  }

  _build() {
    const { assets, options, group } = this;
    const appearance = options.appearance;
    const body = assets.bodies[appearance.body];
    const scene = cloneSkeleton(body.gltf.scene);
    const modelRoot = new THREE.Group();
    modelRoot.name = 'operator-model';
    modelRoot.rotation.y = Math.PI; // glTF faces +Z, the game's forward is -Z
    modelRoot.add(scene);
    group.add(modelRoot);
    this.modelRoot = modelRoot;

    this.bones = new Map();
    this.skinned = [];
    scene.traverse((node) => {
      if (node.isBone) this.bones.set(node.name, node);
      if (node.isSkinnedMesh) this.skinned.push(node);
    });
    this.sceneRoot = scene;

    const teamTint = new THREE.Color(options.palette.light);
    for (const mesh of this.skinned) {
      mesh.material = mesh.material.clone();
      const material = mesh.material;
      if (material.name.startsWith('MI_Superhero')) {
        if (appearance.skin === 'light') material.map = body.lightSkin;
        material.color.set(0xffffff).lerp(teamTint, 0.16);
        material.metalness = 0;
      } else if (material.name === 'MI_Hair_1') {
        material.map = assets.hairTextures.hair1;
        material.color.setHex(appearance.hairColor);
        material.needsUpdate = true;
      }
    }

    const tank = makeInkTank(options.palette);
    attachRigid(group, this.bones.get('spine_03'), tank, new THREE.Vector3(0, 1.30, 0.22), new THREE.Quaternion());
    this.tank = tank;

    const backHolder = new THREE.Object3D();
    attachRigid(
      group, this.bones.get('spine_03'), backHolder, new THREE.Vector3(-0.10, 1.08, 0.38),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.55, 0, 0.45, 'ZXY'))
    );
    const handHolder = new THREE.Object3D();
    this.bones.get('hand_r').add(handHolder);

    const clips = buildClipSet(assets.animations);
    this.animator = new OperatorAnimator({ group, modelRoot, bones: this.bones, clips });
    this.animator.handHolder = handHolder;
    this.animator.backHolder = backHolder;
    this.animator.computeAimReference();
    this.animator.setWeaponFit(new THREE.Box3(new THREE.Vector3(-0.05, -0.15, -0.5), new THREE.Vector3(0.05, 0.1, 0.4)));

    this.setHair(appearance.hair, appearance.hairColor);
    if (appearance.beard) this.setBeard('Hair_Beard', appearance.hairColor);
    applyRenderFlags(modelRoot, options.isPlayer);
    tank.traverse((node) => {
      if (!node.isMesh) return;
      node.frustumCulled = false;
      if (options.isPlayer) node.layers.set(0); else node.layers.enable(1);
    });
  }

  _makeHair(name, color) {
    const source = this.assets.hair[name];
    if (!source) return null;
    const scene = cloneSkeleton(source.scene);
    let skinned = null;
    scene.traverse((node) => { if (node.isSkinnedMesh && !skinned) skinned = node; });
    if (!skinned) return null;
    skinned.material = skinned.material.clone();
    const textureKey = this.assets.hairManifest[name] || 'hair1';
    skinned.material.map = this.assets.hairTextures[textureKey];
    skinned.material.color.setHex(color);
    skinned.material.needsUpdate = true;
    if (!bindToBodySkeleton(skinned, this.bones)) return null;
    skinned.parent?.remove(skinned);
    this.sceneRoot.add(skinned);
    applyRenderFlags(skinned, this.options.isPlayer);
    return skinned;
  }

  setHair(name, color) {
    if (this.hairMesh) { this.hairMesh.parent?.remove(this.hairMesh); this.hairMesh.material.dispose(); }
    this.hairMesh = this._makeHair(name, color);
  }

  setBeard(name, color) {
    if (this.beardMesh) { this.beardMesh.parent?.remove(this.beardMesh); this.beardMesh.material.dispose(); }
    this.beardMesh = name ? this._makeHair(name, color) : null;
  }

  /** Rigid equipment on any bone, offset given in character space (bind pose). */
  addEquipment(boneName, object, position, quaternion = new THREE.Quaternion()) {
    const bone = this.bones.get(boneName);
    if (!bone) return null;
    attachRigid(this.group, bone, object, position, quaternion);
    this.accessories.push(object);
    return object;
  }
}

/**
 * Creates the character group the game already expects (weapon, flash, userData)
 * and fills it with a skinned operator as soon as the assets are available.
 */
export function createOperatorGroup({ team, variation, isPlayer, palette }) {
  const group = new THREE.Group();
  const weapon = new THREE.Group();
  const proceduralWeapon = new THREE.Group();
  proceduralWeapon.visible = false;
  const weaponVisual = new THREE.Group();
  weapon.add(proceduralWeapon, weaponVisual);
  const flash = new THREE.Mesh(sphereGeometry, new THREE.MeshBasicMaterial({
    color: palette.ink, transparent: true, opacity: 0.95, depthWrite: false
  }));
  flash.position.set(0, 0, -0.94);
  flash.scale.setScalar(0.13);
  flash.visible = false;
  flash.layers.enable(1);
  weapon.add(flash);
  weapon.visible = false; // shown once the operator is posed
  group.add(weapon);

  const character = {
    weapon, flash, proceduralWeapon, weaponVisual, gripHands: [],
    weaponHolstered: false, weaponBlend: 1, weaponTransition: null,
    animator: null, operator: null, weaponFitBox: null
  };
  group.userData.character = character;
  group.userData.weapon = weapon;
  group.userData.flash = flash;
  group.userData.flashTimer = 0;
  group.userData.shotTimer = 0;

  const index = (variation + (team === 1 ? 0 : 5)) % APPEARANCES.length;
  const loadId = loadTracker.begin('operator');
  loadOperatorAssets().then((assets) => {
    const operator = new Operator(group, assets, { appearance: APPEARANCES[index], isPlayer, palette });
    character.operator = operator;
    character.animator = operator.animator;
    if (character.weaponFitBox) operator.animator.setWeaponFit(character.weaponFitBox);
    weapon.visible = true;
  }).catch((error) => console.error('Tint3d operator build failed:', error)).finally(() => loadTracker.end(loadId));
  return group;
}
