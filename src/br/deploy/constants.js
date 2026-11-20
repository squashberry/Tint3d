// INKFORGE deployment experience — shared layout, timing and quality constants.
// Units: metres / seconds. World axes match Splat Island: +X east, +Z south, +Y up.
// The carrier's bow points towards +X (the island).

export const CARRIER_ORIGIN = { x: -3300, y: 0, z: 700 };

// Carrier-local layout (origin = waterline at the ship's centre).
export const DECK = {
  y: 28,
  halfLength: 480,
  halfWidth: 100,
  runwayZ: -52,
  runwayHalfWidth: 22,
  touchdownX: -390,
  berthX: 80, // aircraft origin (fuselage centre) while parked for boarding
  catapultEndX: 440,
  apron: { x0: -130, x1: 30, z0: 12, z1: 58 }, // player staging area
  hangar: { x0: -320, x1: 100, z0: 66, z1: 100, h: 18 },
  island: { x0: 170, x1: 262, z0: 66, z1: 100 },
  parking: { x0: 120, x1: 420, z0: 10, z1: 60 }
};

export const AIRCRAFT = {
  length: 82,
  span: 88,
  floorY: 3.1, // cargo floor height above the wheel plane
  rampHingeX: -30,
  rampLength: 11,
  rampWidth: 5.8,
  cruiseAltitude: 285,
  capacity: 100
};

export const PALETTE = {
  cyan: 0x20d8e9,
  coral: 0xff7652,
  magenta: 0xff3fa4,
  amber: 0xffb42e,
  lime: 0x9cff4f,
  violet: 0x7b61ff,
  ink: 0x0a131b,
  white: 0xf2f6fa
};

// Direction towards the sun: low golden-hour light raking across the deck.
export const SUN_DIR = [0.5, 0.36, -0.78];

export const QUALITY = {
  low: { shadows: 0, ocean: 56, clouds: 14, envMap: false, interiorLights: false, pixelRatio: 1, fineWaves: false, lightScale: 0.7, hideProps: true },
  medium: { shadows: 1024, ocean: 110, clouds: 30, envMap: true, interiorLights: true, pixelRatio: 1.25, fineWaves: true, lightScale: 1, hideProps: true },
  high: { shadows: 2048, ocean: 170, clouds: 48, envMap: true, interiorLights: true, pixelRatio: 1.6, fineWaves: true, lightScale: 1, hideProps: false }
};

export function detectQuality() {
  try {
    const q = new URLSearchParams(location.search).get('q');
    if (q && QUALITY[q]) return q;
    const touch = matchMedia('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    if (touch || cores <= 4 || mem <= 3) return 'low';
    if (cores <= 8 || mem <= 4) return 'medium';
    return 'high';
  } catch (e) {
    return 'medium';
  }
}

export const toWorld = (lx, ly, lz, out = {}) => {
  out.x = CARRIER_ORIGIN.x + lx;
  out.y = CARRIER_ORIGIN.y + ly;
  out.z = CARRIER_ORIGIN.z + lz;
  return out;
};

export const PHASES = [
  { id: 'intro', title: 'WELCOME TO INKFORGE', sub: 'FLIGHT DECK ONLINE' },
  { id: 'prep', title: 'BATTLE ROYALE PREPARATION', sub: 'MOVE TO THE STAGING AREA' },
  { id: 'approach', title: 'TRANSPORT APPROACHING', sub: 'CLEAR THE RUNWAY' },
  { id: 'landing', title: 'TRANSPORT LANDING', sub: 'STAND BY ON THE STAGING AREA' },
  { id: 'landed', title: 'TRANSPORT LANDED', sub: 'TAXIING TO BOARDING POSITION' },
  { id: 'boarding', title: 'BOARDING OPEN', sub: 'PROCEED UP THE REAR RAMP' },
  { id: 'finalCall', title: 'FINAL BOARDING CALL', sub: 'RAMP CLOSING SOON' },
  { id: 'closing', title: 'PREPARING FOR TAKEOFF', sub: 'RAMP CLOSING — SECURE FOR LAUNCH' },
  { id: 'takeoff', title: 'LAUNCH', sub: 'CATAPULT ARMED' },
  { id: 'transit', title: 'EN ROUTE TO THE ISLAND', sub: 'DEPLOYMENT WINDOW OPENS OVER THE COAST' },
  { id: 'deploy', title: 'DEPLOYMENT AVAILABLE', sub: 'JUMP NOW — UMBRELLA GLIDER ARMED' },
  { id: 'complete', title: 'DEPLOYMENT COMPLETE', sub: 'HANDOVER TO MATCH' }
];
