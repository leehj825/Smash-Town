# 🚗 Smash Town

Instant, zero-install arcade GTA in your browser: a stylized low-poly coastal city, built **100% procedurally in code** (no model files) with Three.js + TypeScript + Vite.

This repository currently implements **Phase 1 (MVP)** of the Game Design Document.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle in dist/
```

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | Drive |
| `Space` | Handbrake drift |
| `Shift` | Nitro |
| `T` | Cycle time of day (noon → sunset → night) |
| `R` | Reset car |
| `Esc` / `P` | Pause & settings (language, graphics, time of day) |

## What's in Phase 1

- **Scene:** 2-light rig (hemisphere + sun/moon), `FogExp2`, ACES tone mapping, selective bloom, player-following shadow frustum with texel snapping, blob shadow on Low.
- **Procedural city:** 8×8 grid of 40 m blocks across four districts (Sunset Beach, Old Town, Downtown, Harbor) — canvas road/window textures, merged flat-shaded geometry, instanced palms / street lamps / hydrants.
- **Vehicle:** procedural sports car (merged chassis, 4 animated wheels, emissive lights) with snappy arcade drift physics, nitro, body roll/pitch, collisions, and HP.
- **VFX:** pooled dust puffs, skid marks, speed-based FOV, drift camera lag, screen shake + hit-stop on heavy impacts.
- **Day/night cycle:** smooth blending, glowing windows, lamps, taillights, and headlight road glow.
- **HUD + i18n:** wanted stars, cash, combo bar, rotating minimap, analog speedometer, nitro/HP bars; English default with live-switchable Korean (`localStorage` persisted).
- **Quality presets:** High / Medium / Low.

## Roadmap (from the GDD)

- Phase 2: smashable props + Smash Combo, traffic, pedestrians, on-foot enter/exit
- Phase 3: police AI & wanted levels, repair garage, minimap blips
- Phase 4: Quick Gigs, vehicle roster, Web Audio SFX, mobile touch controls
