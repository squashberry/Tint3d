# Splat Island — battle-royale map

A procedurally generated, deterministic island for Tint3d. **~6.57 km² of playable land** (3.2 × 3.2 km world, 1 unit = 1 m), five biomes, 17 named landmarks, 44 minor sites, roads, a lake, a river, a volcano and a harbour. Characters, weapons and game rules are not part of this module.

Preview it: `npm run dev` then open `/Tint3d/map.html` (free-fly camera, minimap, POI teleport list).

## Use in the game

```js
import { createSplatIsland } from './maps/splatIsland/index.js';

const island = createSplatIsland();     // { seed } optional, { headless: true } skips THREE objects
scene.add(island.group);
// every frame:
island.update(elapsedSeconds);          // windmill / turbine spin, lava pulse, sea shimmer
```

Add your own lights and fog (the preview uses a hemisphere + sun light and `Fog`).

### Data API

| Member | What it gives you |
| --- | --- |
| `heightAt(x, z)` | Ground height. Matches the render mesh triangles exactly. |
| `normalAt`, `slopeAt`, `biomeAt`, `isLand`, `inWater`, `isInsideWorld` | Terrain queries |
| `queryColliders(x, z, r)` | Oriented boxes (`kind:'box'`: x, z, hx, hz, rot, y0, y1) and circles (`kind:'circle'`: trees, rocks) near a point |
| `pois`, `landmarks` | Named POIs `{id, name, kind, x, y, z, tier}`; minor sites have `minor: true` |
| `loot` | 311 loot points `{poi, tier, type: 'floor' \| 'chest', x, y, z}` (tier 1–3) |
| `roads`, `localRoads`, `bridges`, `river`, `lake`, `waterBodies`, `volcano` | Layout data |
| `busRoute(rand)` | Random edge-to-edge battle-bus line at 420 m |
| `stormPlan(seed)` | 7 nested circles (1800 m → 35 m) whose final circle sits on open land |
| `randomLandPoint(rand, opts)` | Flat, unblocked land position (spawns, drops) |
| `stats` | Land area, biome shares, road km, counts |

`renderMinimap(island.terrain, { localRoads, landmarks }, size)` returns a canvas of the full map; `worldToMap(x, z, size)` converts positions.

Coordinates: +X east, +Z south (top of the minimap is north). Sea level is `y = 0`.

## Layout

Biomes: Sunmeadow (centre), Greenwood (NW), Snowcap (SW), Dune Flats (SE), Cinderlands (NE).

| POI | Biome / location | Loot tier |
| --- | --- | --- |
| Paintbrush Plaza | Central town, skyscrapers | 3 |
| Inkwell Manor | Island mansion in the lake | 3 |
| Cinder Crown | Volcano crater, lava, catwalk bridge | 3 |
| Magma Works | Factory, chimneys, container yard | 3 |
| Snowcap Lodge | Mountain lodge and ski lift | 3 |
| Slush Hollow | Snow village around an ice pond | 2 |
| Dune Bazaar | Desert market town and minarets | 3 |
| Dustbowl Raceway | Race track, grandstand, pits | 2 |
| Oasis Springs | Desert oasis and tents | 1 |
| Mossy Hollow | Forest cabins and watchtower | 2 |
| Timber Mill | Sawmill and log stacks | 2 |
| Gloomwood Manor | Gothic mansion and graveyard | 3 |
| Farmer's Fields | Barns, silos, crop fields | 1 |
| Windmill Ridge | Windmill and wind turbines | 2 |
| Breakwater Docks | Piers, cranes, cargo ship | 3 |
| Lighthouse Point | Coastal lighthouse | 1 |
| Radio Tower Hill | Lattice radio tower | 2 |

## Files (`src/maps/splatIsland/`)

- `config.js` — world size, biome centres, lake, volcano, river waypoints, POI list. **Edit this to move things.**
- `terrain.js` — heightmap, biomes, lake, river, POI pads, A* road network, bridges (pure data).
- `poi.js` — every landmark, bridges, minor sites, colliders, loot points (pure data).
- `props.js` — trees, cacti, rocks, bushes (instanced, chunked 4×4).
- `mesh.js` — THREE objects: 64 terrain chunks, water, roads, merged buildings, props, animated parts.
- `minimap.js`, `index.js`, `preview.js`, `meshBuilder.js`, `noise.js`.

Generation is seeded (`createSplatIsland({ seed })`); the default seed gives the layout above. Terrain generation takes roughly 0.9 s and mesh building 0.4 s in Node.

## Tuning

- Land area: `ISLAND_BIAS` in `config.js` (0.85 ≈ 6.57 km²; higher = more land).
- Performance: the scene is ~1.7 M triangles when everything is in view (terrain 0.5 M, vegetation ~1 M). Props are chunked for frustum culling; reduce densities in `props.js` or lower `N` in `config.js` for weaker devices.
