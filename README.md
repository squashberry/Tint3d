# Tint3d

**Tint3d** (pronounced "tinted") is an original browser-based 3D team paint shooter. The idea is simple: move fast, cover the arena in your crew's colour, and outpaint the rival team.

> Early playable prototype — not the finished 5v5 game.

## Current build

- Lightweight 3D arena rendered with Three.js
- Third-person movement and mouse camera
- Pulse Sprayer paint projectiles
- Paintable floor tiles and live territory scoring
- A rival training bot that paints back
- Jumping and Flow Slide speed burst
- Keyboard/mouse controls and basic mobile touch controls
- Three-minute match loop and end-of-match result screen

## Run locally

Requires Node.js 20.19+ or 22.12+.

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite.

## Controls

| Action | PC | Touch |
|---|---|---|
| Move | W A S D | Left joystick |
| Aim | Mouse | Drag on the right side |
| Spray | Left mouse button | Paint button |
| Jump | Space | Up button |
| Flow Slide | Shift | Planned touch gesture |

Click **Enter the Yard** to begin. On desktop, click the game to capture the mouse; press **Esc** to pause and release it.

## Project direction

Tint3d is being developed in milestones:

1. **Playable foundation** — movement, camera, arena, paint and territory scoring.
2. **Combat and feel** — weapon variety, hit feedback, improved bots, animation and sound.
3. **Full offline mode** — 5v5 matches with local AI teammates and opponents.
4. **Online multiplayer** — authoritative match server, matchmaking and reconnect handling.
5. **Android and PC polish** — touch UX, performance profiles, accessibility and settings.

All characters, maps, weapons, names and visual identity are original. Tint3d is not affiliated with any existing paint-shooter franchise.

## Tech

- Three.js
- JavaScript (ES modules)
- Vite
- GitHub Pages deployment workflow

## License

MIT. See [LICENSE](LICENSE).
