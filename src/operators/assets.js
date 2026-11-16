// Loads the operator asset set once and shares it between every character.
// All files are CC0 (Quaternius) and live in public/assets/operators.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = ((import.meta.env && import.meta.env.BASE_URL) || '/') + 'assets/operators/';
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

export const HAIRSTYLES = [
  'Hair_Buns', 'Hair_Long', 'Hair_Buzzed', 'Hair_BuzzedFemale', 'Hair_SimpleParted', 'Hair_Beard'
];

const loadGLTF = (file) => new Promise((resolve, reject) => {
  gltfLoader.load(ROOT + file, resolve, undefined, reject);
});

const loadTexture = (file) => new Promise((resolve, reject) => {
  textureLoader.load(ROOT + file, (texture) => {
    texture.flipY = false; // glTF UV convention
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    resolve(texture);
  }, undefined, reject);
});

let cached = null;

export function loadOperatorAssets() {
  if (cached) return cached;
  cached = (async () => {
    const hairManifest = fetch(ROOT + 'hair/manifest.json').then((response) => response.json());
    const [male, female, anims, skinMaleLight, skinFemaleLight, hair1, hair2, manifest] = await Promise.all([
      loadGLTF('male.glb'),
      loadGLTF('female.glb'),
      loadGLTF('anims.glb'),
      loadTexture('skin_male_light.webp'),
      loadTexture('skin_female_light.webp'),
      loadTexture('hair1.webp'),
      loadTexture('hair2.webp'),
      hairManifest
    ]);
    const hair = {};
    await Promise.all(HAIRSTYLES.map(async (name) => {
      hair[name] = await loadGLTF('hair/' + name + '.glb');
    }));
    return {
      bodies: {
        male: { gltf: male, lightSkin: skinMaleLight },
        female: { gltf: female, lightSkin: skinFemaleLight }
      },
      animations: anims.animations,
      hair,
      hairTextures: { hair1, hair2 },
      hairManifest: manifest
    };
  })().catch((error) => {
    cached = null;
    console.error('Tint3d operator assets failed to load:', error);
    throw error;
  });
  return cached;
}
