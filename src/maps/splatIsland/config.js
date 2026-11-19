// Splat Island — constants and hand-authored layout.
// Units are metres. +X = east, +Z = south, so the top of the minimap is north (-Z).

export const WORLD = 3200; // square world edge length
export const HALF = WORLD / 2;
export const N = 512; // terrain cells per side
export const NV = N + 1; // vertices per side
export const CELL = WORLD / N; // 6.25 m
export const SEA_LEVEL = 0;

// Tuned so the playable land (terrain above sea level) is ~6.5 km².
export const ISLAND_BIAS = 0.85;

export const BIOME = { MEADOW: 0, FOREST: 1, SNOW: 2, DESERT: 3, VOLCANO: 4 };
export const BIOME_NAMES = ['Sunmeadow', 'Greenwood', 'Snowcap', 'Dune Flats', 'Cinderlands'];
export const BIOME_CENTERS = [
  [-40, 130],
  [-860, -740],
  [-940, 850],
  [960, 800],
  [800, -840]
];

export const LAKE = { x: -70, z: -440, r: 175, level: 7 };
export const VOLCANO = { x: 800, z: -850, craterR: 88 };

export const RIVER_WAYPOINTS = [
  [-70, -300],
  [-110, -150],
  [-200, 10],
  [-235, 190],
  [-205, 360],
  [-250, 570],
  [-335, 770],
  [-370, 960],
  [-345, 1160],
  [-300, 1420]
];

// Small offshore islets (centre x, z, radius).
export const ISLETS = [
  { x: -1500, z: -250, r: 70 },
  { x: 1480, z: 260, r: 60 },
  { x: 250, z: 1500, r: 80 }
];

// Points of interest. `kind` selects a builder in poi.js.
// tier = loot quality (1 low … 3 high). r = flattened pad radius.
export const POI_DEFS = [
  { id: 'plaza', name: 'Paintbrush Plaza', kind: 'town', x: 70, z: 130, r: 135, tier: 3 },
  { id: 'manor', name: 'Inkwell Manor', kind: 'lakeManor', x: LAKE.x, z: LAKE.z, r: 34, tier: 3, fixed: true, noRoad: true },
  { id: 'crown', name: 'Cinder Crown', kind: 'crater', x: VOLCANO.x, z: VOLCANO.z, r: 100, tier: 3, fixed: true, noRoad: true },
  { id: 'works', name: 'Magma Works', kind: 'factory', x: 560, z: -560, r: 120, tier: 3 },
  { id: 'lodge', name: 'Snowcap Lodge', kind: 'lodge', x: -930, z: 760, r: 85, tier: 3, prefer: 'high' },
  { id: 'hollow', name: 'Slush Hollow', kind: 'snowVillage', x: -640, z: 1010, r: 100, tier: 2 },
  { id: 'bazaar', name: 'Dune Bazaar', kind: 'bazaar', x: 960, z: 720, r: 105, tier: 3 },
  { id: 'raceway', name: 'Dustbowl Raceway', kind: 'raceway', x: 1020, z: 260, r: 175, tier: 2 },
  { id: 'oasis', name: 'Oasis Springs', kind: 'oasis', x: 700, z: 1090, r: 75, tier: 1 },
  { id: 'mossy', name: 'Mossy Hollow', kind: 'cabins', x: -930, z: -330, r: 85, tier: 2 },
  { id: 'mill', name: 'Timber Mill', kind: 'sawmill', x: -560, z: -930, r: 90, tier: 2 },
  { id: 'gloom', name: 'Gloomwood Manor', kind: 'mansion', x: -1000, z: -980, r: 85, tier: 3 },
  { id: 'farm', name: "Farmer's Fields", kind: 'farm', x: 360, z: 760, r: 150, tier: 1 },
  { id: 'windmill', name: 'Windmill Ridge', kind: 'windmill', x: 420, z: -250, r: 80, tier: 2, prefer: 'high' },
  { id: 'docks', name: 'Breakwater Docks', kind: 'docks', x: 150, z: 1330, r: 100, tier: 3, coast: [0.12, 1] },
  { id: 'lighthouse', name: 'Lighthouse Point', kind: 'lighthouse', x: -1200, z: -1180, r: 42, tier: 1, coast: [-0.7, -0.7] },
  { id: 'radio', name: 'Radio Tower Hill', kind: 'radio', x: 380, z: 220, r: 60, tier: 2, prefer: 'high' }
];
