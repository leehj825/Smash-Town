# Smash Town roadmap: all suggested additions

Order is chosen so each phase builds on the one before and the game stays playable after every phase. Sizes: S = about a day of work, M = several days, L = a week or more. Each phase ends with a build, typecheck, headless test run, doc update and a commit to `claude/keen-pascal-ogszlm`.

Ground rules that apply to every phase
- No ramps anywhere (removed by request); verticality is on foot only (ladders, roofs).
- Kids Play stays the default: nobody dies; guns stun, not kill. With it off, damage is normal.
- Everything stays procedural (no external assets), bilingual (English default, Korean option), and playable on keyboard, touch and gamepad. New touch buttons must not overlap (checked at 844x390 and 667x375).
- Save data stays backward compatible (`smashtown.save.v1` gains optional fields only).
- Measure frame rate and draw calls after Phases 3, 6 and 8.

## Phase 0: Foundation (S)
- Commit an automated test suite (Playwright smoke test: boot, drive, story step, map, save/load, gamepad, touch overlap check) and a `npm test` script.
- Measure frame time and draw calls on the headless GPU and on a real phone and low-end laptop; record numbers in `docs/GAME_STATE.md`.
- Settings screen additions: mouse sensitivity, FOV, camera-shake slider, key rebinding (persisted per action and context, so `R` can be reset-car while driving and reload on foot).
- "New Game / Reset Save" button with a confirm step (clears the same save key on web and Android).
- First-minute tutorial (driving, fighting, map) shown once.
Done when: tests pass in CI; settings persist across reload; tutorial shows only on first play.

## Phase 1: Economy and growth (M)
- Income feedback: "+$120" popups at the source, session earnings tally on the pause screen (props, stars, gigs, story, properties).
- Lower the starting cash to about $2,000 (existing saves keep theirs).
- Car upgrades per car (engine, nitro, armor, grip, 3 levels each, $1,000 to $8,000), paint and cosmetics, saved per car.
- Costs for failure: bail when busted (10% of cash, $0 under $500), repair fee when a car is wrecked; a wrecked or lost car always respawns free at the nearest garage (sports and sedan are always owned), so cash can never soft-lock the player.
- Quick Respray at a garage: clears all wanted stars when no police are within ~30 m; price rises with level ($500 at 1 star to ~$2,500 at 5). Replaces the bribe idea.
- On-foot growth: buy health, stamina and punch-damage levels.
- Trophy cars ($30k to $100k): limo, monster truck, armored car.
Done when: money sources are visible, every upgrade changes measurable stats, and cash always has a use.

## Phase 2: Pickups, healing and a first radio (S)
- Minimal one-station procedural radio (on/off, separate from effects) so playtesting the long phases feels alive; the full three stations stay in Phase 7.
- Health packs, burger stands, armor, cash and ammo-crate pickup types placed on landmarks and dropped by police.
- Pickup pulses on the minimap and map.
Done when: the player can recover health on foot; pickups respawn on a timer and persist nothing in the save.

## Phase 3: Weapons and ammo (L)
- Weapons: pistol, SMG, shotgun, rocket launcher, plus joke guns (paintball, water). Magazine, reserve ammo, reload (`R`), recoil, spread.
- Ammo: crates on the map, police drops, ammo shop (uses Phase 1 money).
- Aiming: mouse aim and right trigger; auto-aim assist on touch and gamepad; gun-hold pose for the rig; muzzle flash, tracers, casings, hit sparks, sounds.
- Effects on the world: bullets pop tires, dent cars, break props; rockets have blast radius. Kids Play makes every hit a stun/knock-out.
- Wanted rules: firing in public adds heat; shooting a cop adds a lot. Guns are disabled during story dialogue; busting costs ammo, not the gun.
- Weapon slots extended (keys 1-5, scroll, D-pad).
- Touch stays context-sensitive so button count is flat: Attack becomes Shoot with a gun, Reload appears only when the magazine is not full, and no button moves when another appears.
Done when: each weapon is usable on all three input types, ammo economy works, and the game stays at target frame rate with 5 stars active.

## Phase 4: Tougher police (M)
- Riot cops with shields (level 4+), helicopters (level 5), spike strips; counters for guns so chases stay fair.
- Wanted level drops slowly while hidden indoors; rises under a helicopter on a roof.
Done when: level 4 and 5 are survivable with upgrades but not trivial, and the police counts from the GDD (1/3/5/8/10 cars) still hold.

## Phase 5: Verticality and interiors (L)
- Climbable buildings: ladders or fire escapes on 8 to 10 tall buildings; roof colliders, props and gaps; climb state and camera handling; fall rules (small damage, none in Kids Play, reset off the map edge).
- Rooftop content: stars, a "rooftop dash" gig, a view-point.
- Enterable interiors use the hidden-pocket method: 5 to 6 rooms (Donna's shop, motel, City Hall, an arcade, a clothes/ammo shop) are built far below the map and the player is teleported there during a fade. While inside: traffic, pedestrian and police spawning are paused, the wanted timer is held, each room has its own lighting and camera box, the save stores the real street position, and exit restores position and camera.
- Door press `F`; shops move into interiors. Jump becomes Climb next to a ladder on touch.
Done when: every roof is reachable and escapable, no soft-locks inside, and the camera never ends inside walls.

## Phase 6: Story, quests and the living world (L)
- Second story arc after the finale and 4 to 5 repeatable side characters (taxi fares, car delivery, chase-the-thief).
- World reacts to progress: a park replaces the mall site, flags and fireworks, NPC lines change.
- Properties: buy Donna's shop, the motel and a harbor warehouse for passive income, collected on a visit.
- Achievements, a stats screen and daily challenges.
Done when: a full save shows persistent world changes after chapter completion and properties pay out correctly.

## Phase 7: Atmosphere (M)
- Procedural radio: three stations (beach chill, downtown synth, harbor industrial), station switch while driving, ducks under sirens, separate mute from effects.
- Weather: rain, fog and a storm that change grip and visibility, tied to the time-of-day system.
Done when: music and weather can be turned off independently and costs no more than a set frame-time budget.

## Phase 8: Map polish and release prep (S to M)
- District names and legend on the big map; marker icons for shops, properties and quests.
- Performance pass based on Phase 0 numbers (merge geometry, cull effects, lower quality tiers if needed).
- Update README, GDD (v4), Android pre-release build, and the Render deploy; final regression run.

## Dependencies
Phase 1 before 3 (ammo shop needs money). Phase 2 before 3 (ammo crates). Phase 3 before 4 (police counters). Phase 5 needs Phase 0 camera tests. Phase 6 needs Phases 1 and 5 for properties and interiors.

## Risks
Frame rate on phones is unmeasured; camera clipping in rooms and on roofs; balance of guns versus police; save-format growth; touch layout crowding. Each is checked at the end of the related phase.
