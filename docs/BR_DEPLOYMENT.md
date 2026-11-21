# INKFORGE — Battle Royale preparation & deployment experience

A self-contained, lazy-loadable cinematic sequence for Tint3d: players wait on the flight deck of the carrier **INKFORGE**, a transport lands, boards, takes off, flies to the existing Splat Island map, opens its ramp and the deployment window begins.

It lives in `src/br/deploy/` and **does not touch** `src/main.js`, the arena game, characters, weapons, paint or multiplayer. It reuses the Splat Island map (`src/maps/splatIsland`) as-is.

Preview: `npm run dev`, open `/Tint3d/deploy.html` (options: `?q=low|medium|high`, `?t=<seconds>`, `?speed=2`, `?hud=0`, `?noisland=1`).
Keys: Space pause · `[` `]` speed · N / P next/previous phase · F free camera (WASD/QE, click to look) · H hide HUD · R restart.

## What happens (default timing ≈ 3 min, all derived from one flight path — nothing teleports)

| t (s) | Phase | What you see |
| --- | --- | --- |
| 0 | `intro` WELCOME TO INKFORGE | wide establishing shot of the carrier at sea |
| 7.5 | `prep` BATTLE ROYALE PREPARATION | low-angle deck camera, ops wall, kiosks, ambient activity |
| 11 | `approach` TRANSPORT APPROACHING | aircraft appears far astern, gear deploys, flaps extend, telephoto tracking |
| 35 | `landing` | touchdown camera, gear compresses and bounces, tyre smoke, reverse thrust |
| 42 | `landed` TRANSPORT LANDED | roll-out and taxi to the boarding berth, stops |
| 74 | `boarding` BOARDING OPEN | rear door lifts, ramp lowers, interior lights come on, interior camera |
| 96 | `finalCall` FINAL BOARDING CALL | ramp camera, warning banner |
| 104–112 | `closing` PREPARING FOR TAKEOFF | ramp closes, engines spool up, exhaust + heat shimmer, blast deflector rises |
| 120 | `takeoff` | catapult run (steam jets), rotation, lift-off at the bow, gear retracts |
| 132 | `transit` | aerial follow camera, island approach camera, cockpit view of the island |
| 152 | `deploy` DEPLOYMENT AVAILABLE | ramp opens, green jump lamp, demo umbrella gliders drop |
| 187 | `complete` | `handover` event fires |

Fifteen camera shots cross-blend between each other (`establishing, deckLow, approach, landing, taxi, rampOpen, bayInterior, rampFinal, powerup, takeoff, aerialFollow, islandApproach, cockpit, deployBay, gliderFollow`).

## Modules (`src/br/deploy/`)

| File | Role |
| --- | --- |
| `index.js` | `DeploymentExperience` — builds the scene, runs the loop, exposes everything below |
| `carrier.js` | `InkforgeCarrier` — hull, 960 m flight deck, runway markings, arrestor wires, catapult, blast deflector, staging apron with 100 spawn pads, hangar, command island, paint tanks, radar, lights, screens, ambient animation |
| `aircraft.js` | `TransportAircraft` — hollow fuselage (outer + inner skin, windows), cargo bay, seats, racks, ramp, rear door, wings + flaps, 4 ducted engines, T-tail, 3 landing-gear groups, lights |
| `sequence.js` | `BRPreparation` — flight path, scripted kinematics, timeline, events, UI/screen state |
| `boarding.js` | `BoardingSystem` — integration points for deck spawns, boarding routes and aircraft slots |
| `deployment.js` | `DeploymentSystem` — jump window / jump transform, demo glider drop, character glider hook |
| `glider.js` | `UmbrellaGlider` — separate reusable asset |
| `camera.js` | `DeploymentCamera` — shot list, blending, shake, override hooks |
| `ui.js`, `screens.js` | `DeploymentUI` (HTML HUD) and in-world canvas screens |
| `ocean.js`, `sky.js`, `effects.js` | ocean shader (waves, hull foam, bow wave, stern wake), sky dome + clouds, light points / particles / exhaust |

## Integration hooks (for the real characters, later)

```js
const { DeploymentExperience } = await import('./br/deploy/index.js'); // lazy: nothing stays resident in normal play
const exp = new DeploymentExperience({ renderer, island: splatIsland, onHandover: startMatch });
await exp.init();
// per frame:  exp.update(dt); exp.render();     // exp.dispose() afterwards
```

1. **Spawning characters on the flight deck** — `exp.boarding.getSpawnPoint(i)` → `{ position, quaternion }` for 100 staging pads. Named transforms: `carrier.anchors.Anchor_SpawnGrid` (children `Spawn_000 … Spawn_099`), `Anchor_StagingCenter`.
2. **Placing characters inside the aircraft** — `aircraft.boardingSlots` (100 `Object3D`s named `Seat_L_00…Seat_L_29`, `Seat_R_00…Seat_R_29`, `Stand_00…Stand_39`, each with `userData.type`), `exp.boarding.assignSlot(playerId)`, `getSlotTransform(i)`, `attachCharacter(root, i)` (parents your character to the slot).
3. **Moving through the boarding ramp** — `exp.boarding.getBoardingRoute(spawnIdx, slotIdx)` returns world waypoints (pad → lane → ramp foot → ramp top → slot). Gate on `isBoardingOpen()` / `getBoardingWindow()`; events `boardingOpen`, `finalCall`, `boardingClosed`.
4. **Deployment positions / jump** — `exp.deployment.isJumpAvailable()`, `getJumpTransform()` (`position`, `quaternion`, `velocity` at the ramp end), `getJumpWindow()`; aircraft anchors `Anchor_JumpPoint`, `Anchor_RampTop`, `Anchor_RampEnd`, cockpit/bay/window camera anchors; event `deployAvailable`, `deployClosed`.
5. **Glider ↔ character** — `exp.deployment.deployCharacter(characterRoot, { preset })` returns `{ glider, attach, open(), close(), follow(), update() }`. The glider exposes `AttachPoint_Hand`, `AttachPoint_Harness`, `AttachPoint_Hub`, `AttachPoint_Root`; tune with `glider.setAttachmentConfig({ hand: [x,y,z], harness: [x,y,z] })`. Parent/constrain the character's hand bone to `attach.hand` and chest to `attach.harness` each frame.
6. **Triggering jump / skydive animations** — listen for `deployAvailable`; the jump point and velocity come from `getJumpTransform()`.
7. **Camera** — `exp.cameraRig.followObject(obj)` or `setOverride(fn)` hands the camera to the player/follow camera.
8. **Handover to the match** — the `handover` event / `onHandover` callback fires at the end of the sequence.

No humanoids, capsules or fake players are created anywhere. The only things dropped on deployment are empty umbrella gliders carrying a plain supply canister (`demoGliders: false` disables them).

## UmbrellaGlider

`new UmbrellaGlider({ colors, scale })` — grip handle, shaft, hub, 8 hinged ribs, sliding runner with stretchers, glowing rib tips, suspension lines to a harness ring, and a paint-splat canopy rebuilt every frame. `open()` springs open with overshoot, `close()` folds, `setOpen(0..1)`; `setWind(vec3)` tilts the canopy and drives edge flutter; `setTrail(true)` emits ink drops from the rim (`glider.trail.points` must be added to the scene); `setColors('tint3d' | 'coral' | 'magenta' | 'lime' | { primary, secondary, trim, splat, glow })`. A showcase glider sits on a pedestal on the deck and cycles open/closed.

## Performance

Three tiers (`?q=` or auto-detected from touch, cores and memory):

| | low | medium | high |
| --- | --- | --- | --- |
| shadows | off | 1024 | 2048 |
| image-based lighting | off | on | on |
| ocean mesh / vertex waves | 56² / off | 110² / on | 170² / on |
| clouds | 14 | 30 | 48 |
| bay point lights | off | on | on |
| island trees until takeoff | hidden | hidden | shown |

Everything is procedural (merged vertex-coloured meshes, one draw call per material; lights, particles and exhaust are shader points/cones). The only textures are small canvases (deck plate, screens, lettering), so there is nothing to compress. Runway/edge lights are one `Points` draw. The island is the existing map; it is created lazily inside `init()` (or passed in) and its flat sea plane is hidden in favour of the INKFORGE ocean. Heat distortion is simulated with additive shimmer cones rather than a screen-space refraction pass, to keep mid-range Android viable.

## Verified

- `npm run build` passes on this branch (`deploy.html` is a third build entry; the island chunk stays lazy).
- A Node simulation of the full timeline (carrier, aircraft, sequence, camera rig, boarding, deployment, demo gliders) runs 0–192 s with no exceptions or NaNs, fires every event and visits all 15 shots.
- A headless-Chrome (SwiftShader WebGL) run at `low` quality rendered the intro, approach and ramp-open moments with no console or shader errors.

## Not verified / known limits

- I could not look at the rendered frames. Composition, scale feel, the gear/ramp/rear-door geometry and the glider canopy shape need an eye on a real GPU; expect tuning (camera positions are plain numbers in `camera.js`).
- `medium`/`high` (shadows, IBL, bay lights), the island at deployment time, and the takeoff → deployment frames were exercised only by the Node simulation, not rendered.
- Not yet integrated into `main.js` (by design): the game still needs to call the lazy loader, pass its renderer/island, and handle `handover`.
- The real sound design, character boarding, seat poses and the skydive/glide controller are intentionally out of scope.
