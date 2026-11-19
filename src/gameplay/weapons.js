// Weapon archetypes. Each one changes how a shot is fired, how far it travels and
// how it paints, not just how hard it hits.
export const WEAPONS = {
  pulse: {
    id: 'pulse', name: 'PULSE SPRAYER', tag: 'RAPID', color: 0x20d8e9,
    cooldown: 0.105, botCooldown: 0.17, ink: 3.7, damage: 36, pellets: 1, spread: 0,
    speed: 38, scale: 1, life: 1.2, paintRadius: null, splash: 0, bestRange: 11, look: [1, 1, 1]
  },
  cannon: {
    id: 'cannon', name: 'HEAVY PAINT CANNON', tag: 'HEAVY', color: 0xff9d3c,
    cooldown: 0.72, botCooldown: 1.0, ink: 16, damage: 72, pellets: 1, spread: 0,
    speed: 27, scale: 2.3, life: 1.7, paintRadius: 3.3, splash: 2.4, bestRange: 15, look: [1.35, 1.35, 0.9]
  },
  rifle: {
    id: 'rifle', name: 'TINT RIFLE', tag: 'PRECISION', color: 0xb58cff,
    cooldown: 0.48, botCooldown: 0.7, ink: 9, damage: 62, pellets: 1, spread: 0,
    speed: 72, scale: 0.7, life: 1.5, paintRadius: 1.15, splash: 0, bestRange: 20, look: [0.85, 0.85, 1.28]
  },
  blaster: {
    id: 'blaster', name: 'SCATTER BLASTER', tag: 'SHORT RANGE', color: 0xff5f8f,
    cooldown: 0.52, botCooldown: 0.8, ink: 12, damage: 19, pellets: 6, spread: 0.11,
    speed: 30, scale: 0.8, life: 0.42, paintRadius: 1.25, splash: 0, bestRange: 6, look: [1.2, 1.2, 0.62]
  }
};
// Bot loadout by variation 0..4 so special guns show up (and drop) in every match.
export const BOT_WEAPONS = ['pulse', 'cannon', 'blaster', 'rifle', 'pulse'];
