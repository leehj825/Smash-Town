# 🚗 Smash Town

Instant, zero-install arcade GTA in your browser: a stylized low-poly coastal city built **100% procedurally in code** (no model files) with Three.js + TypeScript + Vite. English is the default language; Korean (`한국어`) is switchable in the Pause/Settings menu.

Implements all four phases of the Game Design Document, including the v2 on-foot combat update.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle in dist/
```

## Controls

| Context | Input | Action |
| --- | --- | --- |
| Driving | `W A S D` / arrows | Drive |
| Driving | `Space` / `Shift` | Handbrake drift / Nitro |
| Both | `F` (or `E`) | Enter / exit vehicle (3.2 m scan, hijacks traffic & police cars) |
| On foot | `W A S D` | Camera-relative walk (4.5 m/s); `Shift` sprints (8.2 m/s) |
| On foot | Left click / `J` | Punch 3-hit combo, or weapon swing (buffered in the last 0.12 s of recovery) |
| On foot | Right click / `Q` / `K` | Power kick (huge knockback; smashes props) |
| On foot | `Space` | Dodge roll in combat (i-frames), otherwise jump; `Ctrl`/`Alt` always dodge, `C` always jumps |
| On foot | `1` `2` `3` / wheel / `V` | Fists / Baseball bat / Police baton (dropped by defeated cops) |
| On foot | Mouse (click to capture) / drag | Orbit camera; auto-aligns behind you while sprinting |
| Always | `T` / `R` / `Esc` | Time of day / reset car / pause & settings |
| Always | `M` (or the map button on touch) | Big map: your position, the story goal with its road route, garages, jobs, golden stars and the chapter checklist |
| Touch | left stick / buttons | On foot: analog stick (forward, back, strafe) + KICK / DODGE / JUMP / WPN / F / HIT; driving: steer arrows + gas, nitro, drift; drag the canvas to orbit |

### Gamepad (Xbox / PlayStation / most standard controllers)

Plug in or pair a controller, then press any button; the on-screen hints switch to controller wording (and back when you touch the keyboard or mouse). Controllers vibrate on crashes, hits and smashes where the browser supports it.

| Context | Controller | Action |
| --- | --- | --- |
| Driving | RT / LT | Gas / brake and reverse |
| Driving | Left stick | Steer |
| Driving | A (hold) / RB (hold) | Handbrake drift / Nitro |
| On foot | Left stick / Right stick | Move (camera-relative) / Orbit camera |
| On foot | X / RB | Punch or weapon swing / Kick |
| On foot | A / B | Jump (or dodge in a fight) / Dodge roll |
| On foot | LT or L3 (hold) / LB | Sprint / Switch weapon (D-pad left / right also cycle) |
| Always | Y | Enter / exit vehicle (also advances story conversations, as do A and Start) |
| Always | Start / Back / D-pad up | Pause / Reset car / Time of day |
| Always | Right-stick click (R3) | Big map |
| Menus | D-pad + A, B or Start | Move the highlight and press, go back |

## What's in the game

- **City:** a ~600 × 580 m procedurally generated road network (alleys, streets, avenues, a coastal highway, pedestrian streets, dead ends) with Sunset Beach, Old Town (lit `24h MOTEL` / `DONUTS` signboards), Downtown with a fountain plaza, suburbs with houses and a lake, a Harbor with a boat basin, parks, a river crossed by bridges, forest corners and mountains. Instanced palms, trees, lamps, hydrants, benches, newsstands and trash cans.
- **Vehicles:** 10 procedural vehicles - six unlockable player cars (sports, sedan, taxi, pickup, muscle, supercar) plus police cruiser, interceptor, SWAT van and armored truck - with arcade drift physics, nitro, damage stages (sparks → smoke → flames → explosion) and ramp jumps.
- **On-foot combat:** blocky humanoid rig on the same 15-joint skeleton as [`model_check`](https://github.com/leehj825/model_check) (`hips, torso, head, hip/knee/ank, sh/el/wr`, left = +x, right-hand weapon socket), animated with the **motion-capture clips from `model_check`** (idle, walk, run, strafe, backpedal, punch ×3, kick, bat swings, dodge roll, hit react, knockdown/get-up, jump), time-warped so each strike lands in the GDD's active window. Hit-stop, screen shake, slash trails and comic `POW!` / `WHAM!` / `SMASH!` popups (localized `퍽!` / `쾅!` / `박살!`).
- **Smash combos:** hydrants (5 s water spray), lamps, palms, benches, newsstands and trash cans tumble away as pooled physics bodies; combo multiplier ×1–×10 with a 4 s timer.
- **Living city:** waypoint civilian traffic that stops for people in the road, pooled walking/fleeing pedestrians. Hijacking a car makes its driver (civilian or cop) climb out.
- **Kids Play (default on):** nobody dies - defeated cops and the player are only knocked out (toggle in Settings).
- **Wanted 1–5★** (1 / 3 / 5 / 8 / 10 police cars): patrol cruisers with PIT ramming, roadblocks, interceptors, SWAT vans with predictive steering, armored units, and foot cops that exit cruisers, surround you and melee with batons.
- **Pay & Spray garages:** repair + clear heat, and a vehicle shop (unlocks and cash persist in `localStorage`).
- **Story + freedom:** "Save Old Town", five chapters with short bilingual conversations, a limo mission, harbor crates and a fireworks finale - optional, with a gold marker to follow. Gigs, 12 golden stars and free roaming stay available the whole time.
- **Quick gigs:** Defeat the Police (brawl), Smash Rampage, Hot Delivery, Grand Hijack.
- **Controls:** keyboard + mouse, touch (analog stick + buttons) and **gamepad** (analog driving, on-foot combat, menu navigation, rumble).
- **Presentation:** 2-light rig, player-following texel-snapped shadows, ACES + selective bloom, day/sunset/night cycle with glowing windows/lamps/signs/headlights, procedural Web Audio (engine, tire screech, siren, footsteps, whooshes, impacts), rotating minimap with blips, EN/KO i18n, High/Medium/Low quality, mobile touch controls.

## Android debug APK

`android/` wraps the production build in a full-screen WebView (the Android back button acts as Escape / pause). The workflow `.github/workflows/android-debug.yml` runs `npm ci && npm run build`, builds a debug APK with Gradle, and publishes it as a **pre-release** on this repository (one per branch, tag `apk-<branch>`, replaced by every build). Pull requests only build it. Download `smash-town-<branch>-debug.apk` from the repo's Releases page and open it on a phone (allow installs from your browser/file manager), or use `adb install`.

To build it yourself you need Node 20+, JDK 17, the Android SDK (platform 34) and Gradle 8.9: `npm run build && cd android && gradle assembleDebug`. Debug builds allow `chrome://inspect` to inspect the game from a computer.
