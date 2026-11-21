# Smash Town: current state (for planning what to add next)

Written after the story-navigation update (branch `claude/keen-pascal-ogszlm`). Everything below is implemented unless it is under "Known gaps". Items marked *untested* were verified only with headless Chromium and simulated input.

## 1. What it is
A browser 3D arcade open-world sandbox: drive, smash street props, brawl on foot, fight police, and follow a short story ("Save Old Town"). Low-poly, flat-shaded, **all assets procedural** (no external models or textures). Stack: Three.js r187, TypeScript (strict), Vite 8. About 7,600 lines in `src/`. English by default, Korean selectable. Runs as a static site (Render) and as an Android debug APK (GitHub Actions pre-release, WebView wrapper in `android/`). Controls: keyboard and mouse, touch (analog stick and buttons) and gamepad.

## 2. World
- Procedurally generated from a seeded RNG: about 605 x 579 m. Road grid with per-line spacing and widths (alley 4.2 m, street 6.5, avenue 8-9, highway 11 half-widths), ~20% of segments removed with a connectivity guarantee, a river with bridges, harbor basin, lake, forest corners, mountains, a beach strip. **No ramps.**
- Districts: beach, oldtown, downtown, harbor, suburb, park, plaza, water, forest.
- Buildings are box colliders with merged flat-colour geometry (chunked for culling). Props: hydrants, lamps, palms, benches, newsstands, trash cans are smashable (they score and add heat); trees and pines are solid but not smashable.
- Landmarks are placed on real drivable segments: 3 garages, 4 gig markers, delivery checkpoints, hijack spots, 6 story locations (Donna's shop, motel, city hall/plaza, harbor gate, 3 crates, limo curb spot) and 12 golden stars.
- Day/night cycle (`T` cycles time of day). Quality High/Medium/Low (sets traffic and effects).

## 3. Driving
- Arcade car controller (`carController.ts`) with drift (Space), nitro (Shift), handbrake, damage/HP, wrecking, reset (`R`).
- 6 player cars: sports and sedan (owned), taxi $1,500, pickup $3,000, muscle $5,000, supercar $9,000 (also a story reward). Stats: max speed 30-45, grip 7.5-10.5.
- Garage UI (3 garages on the map): buy and select cars. Starting cash $12,450.
- Enter/exit cars with `F`. Hijacking ejects the driver (also for police cars).

## 4. On foot
- 15-joint humanoid rig with 42 mocap clips ported from the `model_check` repo, played with cross-fades. Walk/run use the calm variants; weapons use a holder tilt.
- States: idle, walk, run, attack, dodge, hit, down, get-up, dead. Walk 4.5 m/s, sprint 8.2, jump, dodge roll with i-frames (0.24 s, cooldown 0.5 s).
- Melee: jab, cross, uppercut (punch combo), kick, and a 2-hit bat/baton swing combo. Reach 1.4-2.3 m, arcs 65-140 degrees, damage 15-55, knockback, hit-stop, popups ("POW/WHAM/SMASH"), slash trail. Player attacks are slowed to 75% speed. Weapon slots (fist plus unlockable weapons, keys 1-3 or scroll).
- Kids Play (default ON): nobody dies; defeated people are knocked out instead.
- Civilians walk the streets, flee and react; cars stop for people standing in lane.

## 5. Police and wanted
- Heat thresholds [30, 90, 170, 270, 400] give 1-5 stars. Police cars per level: 1 / 3 / 5 / 8 / 10. Composition escalates: cruisers, interceptors, SWAT vans (level 4+), armored trucks (level 5). On-foot cops appear when the player is on foot (up to 5 at level 5; brawl gig forces 4).
- Police AI drives at 0.88x speed, no reinforcements while evading, roadblocks, busted when stopped near cops. Cops that stand down despawn once out of camera view.
- Ordinary traffic: 18 / 12 / 8 cars by quality; the quota ignores police.
- Traffic AI: lane pure-pursuit on the road graph, brakes for vehicles and people.

## 6. Story: "Save Old Town" (5 chapters, ~$18,000 total reward, unlocks the Supercar)
1. Welcome to Sunset Bay: go to Donna's donut shop, talk, smash 6 props, return. ($1,000)
2. Smash for Good: meet Mr. Park at the motel, smash 12, take the petition to City Hall. ($1,500)
3. Inside Job: steal the mayor's black limo and deliver it undamaged to the harbor gate (wreck means a fresh limo and restart of the step). ($2,500)
4. The Big Shipment: find 3 crates, bring the blueprints to the plaza. ($3,000)
5. Save the Day: smash 10 more props, finale dialogue, fireworks. ($10,000)
- Dialogue boxes (F/Enter/Space or tap), bilingual. Step types: goto, dialog, smash, steal, drive. You can't progress while wanted ("Lose the police first!").
- **Navigation (new):** guide arrow with road distance in the story pill; gold road route on the minimap (Dijkstra over the road net, `nav.ts`); full-screen map (`M`, touch map button, R3) with player arrow, goal, garages, gigs, stars and chapter checklist; "New goal" toasts; idle reminder after ~100 s; smash steps point at the nearest unbroken prop.
- Free roam is always available. Progress saves to `localStorage` (`smashtown.save.v1`: cash, unlocked cars, selected car, story step, collected stars).

## 7. Side content
- 4 gigs at map markers, each with a cooldown: **Rampage** (cause damage in time), **Delivery** (checkpoint run, time scales with route length), **Hijack** (steal a target car), **Brawl** (fight foot cops).
- 12 golden stars (+$300 each), shown on the map and minimap within 110 m.
- Combo system for smashing (multiplier up to x10, cash from smashed value).

## 8. UI / UX
- DOM HUD plus a 2D-canvas rotating minimap (blips: garages green, gigs, police flashing red/blue, stars, story goal gold), speedometer, nitro/HP bars, wanted stars, cash, combo bar, weapon slots, prompts, toasts, story pill, dialogue.
- Title screen, pause/settings (language, quality, time of day, audio, Kids Play), garage UI, big map.
- Touch: analog left stick plus buttons laid out without overlap (checked at 844x390 and 667x375). Gamepad: Xbox-style layout, D-pad/A/B menu navigation, rumble, hint text switches.
- Audio: procedural Web Audio (engine, crashes, sirens, smash, cash). No music.

## 9. Architecture map (`src/`)
`main.ts` loop and UI wiring; `game.ts` core orchestration (1,100 lines); `world.ts` city generator and minimap image; `ai.ts` traffic and police brains; `humans.ts` + `characters.ts` + `mocap.ts` + `combat.ts` people, rig and melee; `carController.ts`, `vehicle.ts`, `vehicles.ts` cars; `story.ts`, `nav.ts`, `bigmap.ts`, `collectibles.ts`, `gigs.ts`; `hud.ts`, `input.ts`, `touch.ts`, `i18n.ts`; `props.ts`, `effects.ts`, `vfx.ts`, `particles.ts`, `environment.ts`, `cameraRig.ts`, `audio.ts`. Data: `src/data/anims.json`. Docs: `docs/GDD.md` (living design doc), `README.md`. Debug handle: `window.__smash` (game, hud, bigmap, applyQuality, ...).

## 9b. Added since this document was written
- Phase 0: settings (look sensitivity, FOV, shake), key rebinding, tutorial, New Game, tests in `tests/`.
- Phase 1: income popups and earnings tally, bail/wreck fees ($0 under $500), Quick Respray, per-car tuning, paint, neon, on-foot training, limo and monster truck, starting cash $2,000.
- Phase 2: street pickups (health, armor, cash, burger stands, police drops) and a one-station procedural radio (`N`).

- Phase 3: guns (pistol, SMG, shotgun, rocket launcher, paintball), ammo, Arms garage tab, ammo pickups.
- Phase 4: riot cops with shields (4+ stars), a police helicopter at 5 stars (brought down by a rocket), spike strips with roadblocks at 4+ stars.
- Phase 5: climbable old-town roofs (ladders, rooftop golden stars, Rooftop Dash gig, fall damage off in Kids Play) and five enterable shops built as hidden pockets (donuts, guns, clothes, arcade, motel).
- Phase 6: arc two (3 more chapters, monster truck reward), festival decorations and a donut discount after the first arc, ownable shops with income, 12 achievements, 3 daily challenges, a stats panel, and two street quests (taxi fares, thief chase). Golden stars: 16 (4 on roofs).

## 10. Known gaps and risks
- **Performance is unmeasured on real hardware.** About 76 draw calls main pass, ~101 with shadows at normal traffic; ~147 at 5 stars with 8 police cars in view. Never run on a physical phone, low-end laptop or real controller.
- No automated test suite in the repo. Testing was ad-hoc Playwright scripts (not committed).
- Single save slot, no settings for key rebinding, mouse sensitivity or FOV. No in-game tutorial beyond hint lists.
- Story is short (about 15-25 minutes), linear, with text-only dialogue (no voices, no cutscenes beyond fireworks). No world reaction to story progress (the town looks the same after "saving" it).
- No music, no radio, no weather. No pickups (health, armor, cash) on foot, so there is no healing besides time. No car upgrades or customization. No interiors, no shops besides garages.
- Combat: one enemy type on foot, no ranged weapons, no blocking. Police have no helicopters or riot units.
- No multiplayer, no leaderboards, no achievements. No difficulty setting besides Kids Play.
- The map minimap image is a flat top-down render without labels or district names.

## 11. Candidate additions (not decided)
Pickups and healing; car upgrades and paint; a procedural radio with stations; weather; more story chapters and side characters with repeatable quests; district names and map labels; riot police and helicopters at high heat; ranged or throwable weapons; achievements and a stats screen; key rebinding and sensitivity/FOV sliders; a committed automated test suite; a performance pass with measured frame times on target devices; a tutorial or first-minute onboarding.
