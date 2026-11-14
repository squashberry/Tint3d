# Tint3d

**Tint3d** (pronounced "tinted") is an original browser-based 3D team paint shooter. The idea is simple: move fast, cover the arena in your crew's colour, and outpaint the rival team.

> Early playable prototype — not the finished 5v5 game.

## Current build

- Third-person 3D arena rendered with Three.js
- Camera-relative keyboard and mobile joystick movement
- Continuous team-colour foot trails and paintable floor, deck and ramps
- Underfoot team-ink detection for Flowline special movement
- Pulse Sprayer with a back-mounted holster while sprinting
- Sprinting, low-profile sliding, buffered variable-height jumping and fall/landing response
- Local 5v5 crew with AI teammates and rivals
- Cinematic 3D team lineup and pre-match 3–2–1 countdown
- Keyboard/mouse and mobile touch controls
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
| Sprint / holster weapon | Hold Shift | Hold RUN |
| Slide | Press C while sprinting | Tap SLIDE while sprinting |
| Jump | Space (hold for a higher jump) | Hold jump button |
| Flowline special | Q while standing on your crew's ink | Flowline button while on your crew's ink |

Start the match from the title screen. A 3D squad introduction and 3–2–1 countdown play before control is handed over. On desktop, press **Esc** to pause and release the mouse.

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
