# 🚗 Smash Town — Game Design Document (GDD) — v3 (living document)

> **v3 changes:** sections 1–8 are the v2 design, unchanged. Sections 9–12 are new: an audit of what is actually implemented, known gaps, proposed next features (Phases 5–8) and an updated roadmap. Items marked **(proposed)** are not built.

## 1. Game Overview

* **Title:** Smash Town
* **Genre:** 3D Arcade Open-World Driving, On-Foot Brawling & Destruction Sandbox
* **Platform:** Web Browser (Desktop & Mobile WebGL2)
* **Tech Stack:** Three.js, TypeScript (or ES Modules), Vite, Custom Raycast Arcade Physics (or Rapier3D)
* **Asset Strategy:** **100% Procedural Code-First Modeling** (No external `.glb`/`.gltf` dependencies for core gameplay; all meshes are generated via Three.js geometries, referencing the built-in humanoid model architecture from the `model_check` repository for characters)
* **Language Policy:** All source code, comments, identifiers, and default UI/settings are strictly in **English (`en`)**, with built-in **Korean (`ko`)** localization rendered dynamically in-game.
* **High Concept:**
  > *"Instant, zero-install arcade GTA in your browser."*
  > Roam a sunlit, stylized low-poly coastal city on foot or behind the wheel. Brawl with police using punches, kicks, and melee weapons, hijack vehicles on the fly, smash through destructible street props to chain combo multipliers, and outrun escalating police chases.

---

## 2. 🌐 Engineering & Localization (i18n) Architecture

To keep the codebase clean, scalable, and globally accessible while fully supporting Korean players:

### 2.1 Code & Default Settings Convention
* **English-First Codebase:** Every variable, class, file name, state enum, debug log, and configuration key is written in English.
* **Default Game Settings:** The game initializes with English (`en`) as the default language, standard WASD/Mouse keybindings, Medium/High auto-detected graphics preset, and Master Volume at $80\%$.

### 2.2 Lightweight i18n System (`i18n`)
* **Dictionary Structure:** A flat key-value JSON/object map containing `en` (default) and `ko` (Korean) strings for all HUD elements, menus, mission prompts, wanted notifications, combat callouts, and settings.
* **Core Localization Keys (Example Subset):**

| Key | English (`en` - Default) | Korean (`ko`) |
| :--- | :--- | :--- |
| `ui.play` | `PLAY` | `플레이` |
| `ui.wanted` | `WANTED` | `지명수배` |
| `ui.smash_combo` | `SMASH COMBO` | `스매시 콤보` |
| `ui.busted` | `BUSTED` | `체포됨` |
| `ui.wasted` | `WASTED` | `기절함` |
| `ui.mission.defeat_police` | `DEFEAT THE POLICE!` | `경찰을 무찌르세요!` |
| `ui.hint.enter_car` | `[F] Enter Vehicle` | `[F] 차량 탑승` |
| `ui.hint.exit_car` | `[F] Exit Vehicle` | `[F] 차량 하차` |
| `ui.hint.attack` | `[L-Click] Punch / Swing` | `[좌클릭] 주먹 / 무기 공격` |
| `ui.hint.kick` | `[R-Click / Q] Kick` | `[우클릭 / Q] 발차기` |
| `ui.hint.dodge` | `[Space] Dodge Roll` | `[스페이스바] 회피` |
| `ui.hint.weapon_swap` | `[1-3 / Scroll] Switch Weapon` | `[1-3 / 휠] 무기 교체` |
| `ui.settings.language` | `Language` | `언어` |

* **Runtime Switching:** Players can toggle between `English` and `한국어` at any time in the Pause/Settings menu without reloading the WebGL scene. The preference is saved in `localStorage`.
* **Typography:** Use a bold, geometric arcade font stack that renders both Latin and Hangul cleanly (e.g., `'Montserrat', 'Pretendard', 'Noto Sans KR', sans-serif`).

---

## 3. 🎨 Graphics, Procedural Modeling & Visual Direction

Smash Town targets a **vibrant, stylized low-poly aesthetic running at a locked** $60\text{ fps}$ in web browsers. Because all 3D models are built procedurally in code, the visual pipeline is engineered around clean silhouettes, flat shading, vertex/material color palettes, and aggressive draw-call batching.

### 3.1 Code-First Procedural Modeling Pipeline
Instead of loading heavy 3D files, every entity is constructed using Three.js primitives (`BoxGeometry`, `CylinderGeometry`, `ConeGeometry`, `IcosahedronGeometry`, `ExtrudeGeometry`) combined with `BufferGeometryUtils.mergeGeometries()` and **Vertex Colors** (or a shared Palette Material dictionary).

#### A. Procedural Vehicles (`VehicleFactory`)
Each vehicle is assembled into a `THREE.Group` with a merged static chassis mesh and 4 independently animated wheel sub-meshes:
* **Sports Car (Player Hero):** Low, wide `BoxGeometry` base, tapered wedge hood (vertex-shifted box), angled dark-tinted cabin trapezoid, rear louver vents, dual exhaust cylinders, rear spoiler wing, and emissive headlight/taillight strips.
* **Police Cruiser:** Classic boxy sedan silhouette with black-and-white two-tone panels, front push bumper (`BoxGeometry`), and a roof-mounted red/blue dual-beacon lightbar with independent emissive materials.
* **Civilian Sedan / Taxi / Pickup Truck:** Modular variations sharing wheel geometry and cabin proportions, differentiated by cargo beds, taxi roof signs, and randomized pastel/vivid body colors.
* **Target Budget:** $150 \sim 400$ triangles per procedural vehicle.

#### B. Procedural City & Architecture (`BuildingFactory`)
* **Low-Rise Shops (Old Town & Beach):** Base box + parapet roof trim + recessed door/window frames + striped slanted awnings (`ExtrudeGeometry` or angled boxes) + rooftop AC units + bold procedural canvas signboards (`24h MOTEL`, `DONUTS`).
* **Downtown High-Rises:** Stacked tiered boxes with procedural window grids (baked via a lightweight procedural `<canvas>` texture or instanced window quads so windows can glow at night).
* **Roads & Sidewalks:** Procedural canvas-generated asphalt texture (subtle noise + crisp white dashed lane dividers + yellow double center lines + crosswalk stripes) applied to modular flat planes, bordered by raised curb boxes.

#### C. Procedural Props & Nature (`PropFactory`)
* **Palm Trees:** 4–5 stacked, slightly curved/tapered `CylinderGeometry` trunk segments + 6–7 arched, flattened `ConeGeometry` or custom triangular prism fronds radiating from the crown.
* **Fire Hydrants:** Red main cylinder + domed top cap + side nozzle cylinders + flange rings.
* **Street Props:** Street lamps (tapered gray pole + angled arm + emissive lamp box), metal trash cans, wooden newspaper stands, park benches.

#### D. Procedural Humanoid Characters (`CharacterFactory` — `model_check` Reference)
* **Built-In Model Integration:** The player, police officers, and civilian pedestrians share the articulated procedural humanoid rig architecture from the **`model_check` repository's built-in model**.
* **Visual Variants via Palette Swaps & Accessories:**
  * **Player:** Bright red hoodie, blue jeans, white sneakers, stylized blocky hair + optional overhead yellow triangle `PLAYER` indicator when on foot.
  * **Police Officer:** Navy blue uniform, peaked police cap (`CylinderGeometry` + visor box), utility belt, police baton in right hand.
  * **Civilians:** Randomized shirt/pants pastel & vivid color combinations.

### 3.2 Art Style & Color Hierarchy
Strict separation of saturation and value ensures instant gameplay readability during both high-speed driving and chaotic street brawls:

| Visual Layer | Color Strategy & Role | Reference Hex Codes |
| :--- | :--- | :--- |
| **Hero (Player & Car)** | High-saturation primary colors to anchor the player's eye | `#FFD500` (Sports Car Yellow), `#E62E2D` (Player Hoodie Red) |
| **Threat (Police & Sirens)** | High-contrast navy/black/white + intense red/blue bloom | `#1E3A8A` / `#1A1A24` / `#FFFFFF` + `#FF0033` / `#0066FF` |
| **Destructible Props** | Vivid accent colors standing out from sidewalks | `#E62E2D` (Hydrant Red), `#FF8C00` (Barricade Orange) |
| **City Buildings** | Warm, sunlit mid-to-low saturation coastal pastels | `#F4A7B9` (Pastel Pink), `#A8D8B9` (Mint), `#F7E3AF` (Cream) |
| **Roads & Sidewalks** | Neutral dark charcoal asphalt + warm sand-gray concrete | `#4A4E59` (Asphalt), `#D9D4C7` (Sidewalk) |
| **Sky & Horizon Fog** | Bright cobalt sky blending into pale cyan horizon | `#1E90FF` $\rightarrow$ `#AEE2FF` |

* **Flat Shading (`flatShading: true`):** Enforced across all procedural meshes so angled faces catch directional sunlight with crisp, toy-like facets.

### 3.3 Lighting & Dynamic Day/Night Cycle
To avoid WebGL fragment shader bottlenecks, the scene uses a strict **2-Light Core Setup**:
1. **`THREE.HemisphereLight`:** Sky tint (`#87CEEB`) + warm ground bounce (`#E8C39E`) to keep shadowed faces vibrant rather than pitch black.
2. **`THREE.DirectionalLight` (Sun/Moon):** Provides crisp directional highlights and casts real-time shadows.

* **Dynamic Time-of-Day Presets (Smooth Interpolation):**
  * **Morning / Noon:** High sun angle, crisp white-warm light, vivid blue sky + `FogExp2`.
  * **Golden Hour (Sunset):** Low sun angle, warm orange directional light (`#FF7E47`), purple-amber horizon fog.
  * **Night Mode (Zero-Cost Fake Lighting Tricks):** Building windows, street lamps, and taillights enable `emissiveIntensity`. Car headlights use additive-blended light cone meshes + projected road glow quads instead of expensive real-time `SpotLight`s.

### 3.4 Hybrid Shadow Pipeline
* **Player-Following Shadow Frustum:** The `DirectionalLight` shadow camera (`OrthographicCamera`) tracks the active player (whether on foot or driving) and covers a tight $40\text{ m} \times 40\text{ m}$ box.
  * Resolution: $1024 \times 1024$ (Desktop) / $512 \times 512$ (Mobile) with `PCFSoftShadowMap` and texel snapping.
* **Blob Shadows:** Distant traffic cars, pedestrians, and props disable `castShadow` and use a dark-gradient circular plane hovering $0.05\text{ m}$ above the road.

### 3.5 Post-Processing & WebGL Performance Budget
* **Tone Mapping:** `THREE.ACESFilmicToneMapping`.
* **Selective Bloom (`UnrealBloomPass`):** High luminance threshold ($> 1.0$) so only sirens, brake lights, explosions, and combat impact flashes glow. Toggleable in Graphics Settings.
* **`THREE.InstancedMesh` Batching & Strict Object Pooling:** Zero allocations inside `requestAnimationFrame`. Draw calls kept $< 100$ per frame; pixel ratio capped at `Math.min(window.devicePixelRatio, 2)`.

---

## 4. 🏃 On-Foot Character Control, Animation & Combat System

Players can seamlessly switch between `DRIVING` and `ON_FOOT` modes at any time by pressing `F` (or `E`) near a vehicle. On-foot gameplay delivers snappy, arcade-style 3D brawling inspired by classic sandbox beat-'em-ups.

### 4.1 Built-In Humanoid Rig & Weapon Socket Standard (`model_check` Integration)
The character controller and procedural animator must interface cleanly with the hierarchical `THREE.Group` pivot rig from the **`model_check` built-in model**:

```text
root (Character world position & Y-axis facing rotation)
 └── hips / pelvis (Vertical bobbing, jump offset, dodge-roll pitch)
      ├── torso (Forward lean when sprinting, Y-axis twist during punches & bat swings)
      │    ├── head (Subtle look-at / recoil tilt)
      │    ├── leftArmPivot (Shoulder joint)
      │    │    └── leftForearmPivot (Elbow joint, optional if 2-segment)
      │    └── rightArmPivot (Shoulder joint)
      │         └── rightForearmPivot (Elbow joint)
      │              └── rightHandSocket (Attachment Group for Melee Weapons)
      ├── leftLegPivot (Hip joint)
      │    └── leftShinPivot (Knee joint, optional if 2-segment)
      └── rightLegPivot (Hip joint)
           └── rightShinPivot (Knee joint)
```

* **Weapon Socket (`rightHandSocket`):** Positioned at the end of the right arm/hand. Equipping a weapon simply toggles visibility or attaches a procedural weapon mesh (e.g., Baseball Bat, Steel Pipe, Police Baton) inside this group so it automatically inherits all arm and torso swing rotations.
* **Graceful Rig Fallback:** If a specific built-in model variant uses single-segment limbs (no separate elbow/knee pivots), the animator automatically falls back to driving only `Shoulder` and `Hip` pivots without throwing errors.

### 4.2 On-Foot Locomotion & Input Controls
Movement is **camera-relative** (pressing `W` moves away from the current 3rd-person camera angle, and the character smoothly rotates toward the movement vector via shortest-angle interpolation).

| Action | Default Input (Desktop) | Physics / Movement Parameters |
| :--- | :--- | :--- |
| **Walk** | `W / A / S / D` or Arrow Keys | Speed: $4.5\text{ m/s}$, crisp acceleration ($35\text{ m/s}^2$) |
| **Sprint (Run)** | `Left Shift` + Move | Speed: $8.2\text{ m/s}$, slight forward torso lean ($14^\circ$), dust puffs at feet |
| **Jump** | `Space` (when idle/moving) or `C` | Vertical impulse $7.5\text{ m/s}$, gravity $-22\text{ m/s}^2$ |
| **Dodge / Roll** | `Space` (or `Ctrl` / `Alt` during combat) | Burst velocity $11.5\text{ m/s}$ for $0.32\text{ s}$, $0.24\text{ s}$ invulnerability frames (i-frames), $0.5\text{ s}$ cooldown |
| **Punch / Melee Attack** | `Left Mouse Click` (or `J`) | Context-sensitive: **Unarmed** $\rightarrow$ 3-hit Punch Combo; **Weapon Equipped** $\rightarrow$ Weapon Swing |
| **Kick** | `Right Mouse Click` or `Q` (or `K`) | Dedicated high-knockback front/roundhouse kick (usable even while holding a weapon) |
| **Switch Weapon** | `1` (Fists), `2` (Bat), `3` (Pipe/Baton) or `Mouse Wheel` | Instant swap with a quick $0.15\text{ s}$ equip pop animation |
| **Enter / Hijack Car** | `F` (or `E`) | Scans within $3.2\text{ m}$ radius; snaps player into driver seat and switches state to `DRIVING` |

### 4.3 Combat Moveset & Frame Data
Every melee attack follows a crisp 3-phase arcade timing structure: **Wind-up $\rightarrow$ Active Hit Window $\rightarrow$ Recovery** (with input buffering during the last $0.12\text{ s}$ of recovery for fluid combos).

| Move | Trigger | Wind-Up / Active / Recovery | Reach & Arc | Damage | Knockback & Special Effect |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Punch 1 (Left Jab)** | `LMB` (Unarmed) | $0.07\text{ s}$ / $0.08\text{ s}$ / $0.14\text{ s}$ | $1.4\text{ m}$, $70^\circ$ cone | $15$ | Light stagger ($2.5\text{ m/s}$ push) |
| **Punch 2 (Right Cross)** | `LMB` $\rightarrow$ `LMB` | $0.08\text{ s}$ / $0.09\text{ s}$ / $0.16\text{ s}$ | $1.5\text{ m}$, $75^\circ$ cone | $20$ | Medium stagger ($4.0\text{ m/s}$ push) |
| **Punch 3 (Uppercut / Haymaker)** | `LMB` $\times 3$ | $0.12\text{ s}$ / $0.10\text{ s}$ / $0.24\text{ s}$ | $1.6\text{ m}$, $85^\circ$ cone | $35$ | Heavy launch ($7.5\text{ m/s}$ back + $4.0\text{ m/s}$ up) |
| **Power Kick** | `RMB` or `Q` | $0.13\text{ s}$ / $0.10\text{ s}$ / $0.25\text{ s}$ | $1.75\text{ m}$, $65^\circ$ cone | $30$ | **Huge Knockback** ($10.0\text{ m/s}$ impulse); instantly sends hydrants, trash cans, and cops flying |
| **Weapon Swing 1 (Horizontal Slash)** | `LMB` (Bat / Pipe) | $0.11\text{ s}$ / $0.11\text{ s}$ / $0.22\text{ s}$ | $2.2\text{ m}$, $130^\circ$ wide arc | $45$ | Multi-target cleave, $8.5\text{ m/s}$ knockback, smashes street props in one hit |
| **Weapon Swing 2 (Backhand Cleave)** | `LMB` $\rightarrow$ `LMB` (Bat) | $0.10\text{ s}$ / $0.11\text{ s}$ / $0.26\text{ s}$ | $2.3\text{ m}$, $140^\circ$ wide arc | $55$ | Heavy multi-target launch ($10.5\text{ m/s}$) + guaranteed `SMASH!` popup |

* **Procedural Melee Weapons (`WeaponFactory`):**
  * **Slot 1 — Fists:** Unarmed brawling (fastest attack speed, lowest movement penalty).
  * **Slot 2 — Baseball Bat:** Tapered `CylinderGeometry` (wooden tan or metallic silver with black grip tape). High arc cleave and satisfying crack SFX.
  * **Slot 3 — Street Pipe / Police Baton:** Dropped by defeated police officers or found in Old Town alleys. Fast swing with metallic spark VFX.

### 4.4 Procedural Character Animation State Machine (`CharacterAnimator`)
Zero external animation clips are required. All locomotion and combat poses are computed mathematically every frame using damped spring / `THREE.MathUtils.lerp` blending across the `model_check` rig joints:

* **`IDLE`:** Subtle chest breathing ($\sin(t \cdot 2.5) \cdot 0.03$ on `hips.position.y`) and slight relaxed arm sway.
* **`WALK`:** Sinusoidal counter-phase leg and arm swing ($\pm 35^\circ$ legs, $\mp 25^\circ$ arms, frequency $8\text{ rad/s}$) + gentle vertical bounce ($|\sin|$).
* **`RUN` (Sprint):** Exaggerated high-frequency stride ($\pm 65^\circ$ legs, bent knees if present, $\mp 55^\circ$ pumping arms, frequency $13\text{ rad/s}$), `torso.rotation.x = 0.24` forward lean.
* **`PUNCH_1 / PUNCH_2 / PUNCH_3`:**
  * *Wind-up:* Pull active shoulder back, counter-rotate `torso.rotation.y` by $\pm 35^\circ$.
  * *Active:* Snap `torso.rotation.y` forward $+45^\circ$, thrust active arm straight forward (`rotation.x = -1.55`), slight forward lunge velocity ($3.5\text{ m/s}$).
* **`KICK`:**
  * *Wind-up:* Lean `torso.rotation.x` backward ($-20^\circ$), raise `rightLegPivot.rotation.x` back/up to chamber.
  * *Active:* Snap `rightLegPivot.rotation.x` forward to $-1.45\text{ rad}$ (horizontal extension) while swinging opposite arm back for balance.
* **`WEAPON_SWING_1 / 2`:**
  * *Wind-up:* Cock `rightArmPivot` wide to the side/back and twist `torso.rotation.y` by $-65^\circ$ (or $+65^\circ$ for backhand).
  * *Active:* Whip `torso.rotation.y` rapidly through a $130^\circ$ arc while sweeping `rightArmPivot` horizontally across chest height, spawning a 3D ribbon slash trail.
* **`DODGE_ROLL`:** Tuck limbs tight and rotate `hips.rotation.x` through a full $360^\circ$ ($2\pi\text{ rad}$) forward somersault over $0.32\text{ s}$.
* **`HIT_REACT` & `KNOCKDOWN`:** Sharp backward torso snap + brief white emissive flash on hit; on lethal/heavy knockback, tumble character onto the ground with splayed limbs before despawning or getting back up.

### 4.5 Hit Detection, Impact Juice & Combat VFX
To achieve the punchy, comic-book arcade feel shown in the visual direction:
* **Arc/Sphere Hitbox Check:** During the Active Hit Window, test all NPCs, Police, Vehicles, and Destructible Props within the move's `reach` radius and angular cone (`dot(forward, toTarget) >= cos(arc / 2)`). Each target is recorded in a `hitIds` Set per swing so it is only hit once per attack.
* **Hit-Stop (Freeze Frame):** Pause animation/physics update for $25\text{ ms}$ (punch), $35\text{ ms}$ (kick), or $45\text{ ms}$ (weapon cleave) upon landing a hit.
* **Screen Shake:** Directional micro-shake proportional to attack damage.
* **Weapon Slash Trail:** A procedural curved flat mesh (semi-transparent white/yellow gradient strip) attached to the player's horizontal swing plane that fades out over $0.14\text{ s}$.
* **Comic Impact Popups:** World-space billboard sprites (`THREE.Sprite` rendered from a cached procedural `<canvas>`) popping up at the impact point with bouncy scale-in animation: `POW!`, `WHAM!`, `SMASH!` (or localized `퍽!`, `쾅!`, `박살!` when Korean is active), accompanied by starburst spark polyhedra and flying debris cubes.

### 4.6 On-Foot Third-Person Camera
* **Closer Framing:** Transitions smoothly from the Driving Chase Cam ($7.5\text{ m}$ behind, $3.2\text{ m}$ high) to the On-Foot Over-the-Shoulder/Back Cam ($4.8\text{ m}$ behind, $2.4\text{ m}$ high, FOV $58^\circ$).
* **Mouse Orbit (Pointer Lock Optional):** Dragging or moving mouse rotates camera yaw/pitch smoothly around the player; gently auto-aligns behind the player when sprinting if no mouse input is active.

---

## 5. Core Gameplay & Systems

### 5.1 Core Gameplay Loop
1. **Roam, Brawl & Hijack:** Explore the city on foot, kick/smash street props, brawl with patrolling cops, or press `F` to steal any nearby vehicle.
2. **Smash & Chain Combos:** Plow through props by car or shatter newsstands, trash cans, and hydrants on foot with your bat/kick to build the **Smash Combo** multiplier ($\times 1 \sim \times 10$, $4\text{ s}$ decay timer) for bonus cash.
3. **Wanted Chases:** Assaulting cops, stealing cars, and property destruction raise the **Wanted Level (1–5 Stars)**, triggering escalating on-foot and vehicle police responses.
4. **Escape & Upgrade:** Break line-of-sight until the wanted cooldown clears, or drive into a **Pay & Spray (Repair Garage)** to clear heat, repair your car, and bank cash.

### 5.2 Wanted Level Escalation (1–5 Stars)
* **★ (1 Star):** Minor offense. 1 local patrol cruiser pursues; nearby cops exit their vehicles to chase the player on foot with batons if the player is on foot.
* **★★ (2 Stars):** 2–3 patrol cruisers attempt PIT maneuvers; 3–4 foot cops surround the player in melee combat.
* **★★★ (3 Stars):** Roadblocks spawn at major intersections + high-speed Interceptor cruisers join.
* **★★★★ (4 Stars):** Heavy SWAT vans use predictive steering to intercept ahead of the player's path.
* **★★★★★ (5 Stars):** Full city lockdown. Heavy armored units and relentless pursuit; huge survival cash bonus per second.

### 5.3 Quick Gigs (Instant Missions)
* **Defeat the Police (Brawl):** Take down a target number of pursuing police officers on foot using melee combos and kicks.
* **Smash Rampage:** Cause target property damage (e.g., $\$50,000$) within $60\text{ seconds}$.
* **Hot Delivery:** Transport contraband across town through checkpoints while evading police.
* **Grand Hijack:** Steal a parked supercar and deliver it to the garage with minimal damage.

### 5.4 Procedural Destruction & Vehicle VFX
* **Drifting:** Instanced dark skid-mark quads + expanding/shrinking `IcosahedronGeometry` dust puffs.
* **Fire Hydrant Smash (Car or Kick/Bat):** Hydrant launches into the air with angular velocity while blue low-poly droplet cubes spray upward in an arc for $5\text{ seconds}$.
* **Newspaper Stands, Trash Cans, Lamp Posts:** Swap from static `InstancedMesh` instances to pooled dynamic physics bodies tumbling away with scattered paper sheets / debris cubes.
* **Vehicle Damage Stages:** Sparks ($100\% \sim 60\%$) $\rightarrow$ white smoke ($60\% \sim 30\%$) $\rightarrow$ dark smoke + flames ($30\% \sim 1\%$) $\rightarrow$ polyhedral explosion ($0\%$).

---

## 6. World & Level Design

* **Grid Architecture:** $8 \times 8$ **Modular City Blocks** (each block $40\text{ m} \times 40\text{ m}$, total playable area $320\text{ m} \times 320\text{ m}$), procedurally generated from a clean JSON district layout.
* **4 Distinct Districts:**
  1. **Sunset Beach (South):** Coastal highway, palm-lined boardwalk, pastel cafes, beach jump ramps.
  2. **Old Town Strip (West):** Dense 2–3 story shops (`24h MOTEL`, `DONUTS`), colorful awnings, packed with hydrants, newsstands, and trash cans (ideal for on-foot brawls and Smash Combos).
  3. **Downtown Core (Center/North):** Tall skyscrapers, wide 4-lane avenues built for top-speed runs.
  4. **Harbor & Industrial (East):** Shipping containers, warehouses, tight alleyways for breaking police line-of-sight.

---

## 7. UI / HUD & Procedural Audio

### 7.1 Context-Aware HUD Layout (HTML/CSS Overlay + 2D Canvas)
All HUD text pulls dynamically from the active `i18n` language (`en` default / `ko` toggleable):
* **Bottom-Left (Minimap):** Lightweight 2D `<canvas>` radar showing road grid, player arrow (yellow), police blips (red/blue), and mission markers, with a `WANTED` status banner underneath when active.
* **Top-Center (Objective Banner):** Compact dark pill showing active gig prompt (e.g., `DEFEAT THE POLICE!` / `경찰을 무찌르세요!`).
* **Top-Right (Status):** 5 Wanted Stars, Cash counter (`$14,205`), Player Health bar, and active Smash Combo gauge.
* **Bottom-Right (Context Switchable):**
  * *When `DRIVING`:* Analog speedometer, Nitro bar, Vehicle HP indicator.
  * *When `ON_FOOT`:* Weapon Slot icons (`[1] Fist`, `[2] Bat`, `[3] Pipe`) with active highlight + localized quick control hints (`L-CLICK: ATTACK`, `R-CLICK: KICK`, `SPACE: DODGE`).
* **Top-Left (Quick Controls):** Pause/Settings button (Language `EN/KO`, Graphics Quality, Audio toggle, Day/Night toggle).

### 7.2 Procedural Web Audio Synthesizer
Zero audio asset loading delays—all SFX synthesized via the **Web Audio API**:
* **Driving SFX:** Dual-oscillator Engine Hum (pitch/LPF mapped to RPM), bandpass white-noise Tire Screech, and oscillating Police Siren.
* **On-Foot & Combat SFX:**
  * *Footsteps:* Soft low-pass filtered noise taps synced to walk/run sine-wave zero-crossings.
  * *Whoosh (Punch/Kick/Bat):* Fast-sweeping bandpass noise burst.
  * *Impact Thud & Crack:* Pitch-dropping sine bass punch + crisp short noise snap (higher resonance for baseball bat hits).
  * *Prop Smash:* Layered glass/wood/metal noise bursts with $\pm 10\%$ random pitch variation.

---

## 8. Development Roadmap

* **Phase 1: Core Engine, i18n, `model_check` Character & Procedural City (MVP)**
  * Initialize Three.js scene (2-light setup, `FogExp2`, player-following shadows, ACES Tone Mapping).
  * Build `i18n` manager (`en` default + `ko` translation) and context-aware HUD overlay.
  * Integrate the `model_check` built-in humanoid rig with `CharacterController` (Walk, Sprint, Jump, Dodge) and `CharacterAnimator` (Punch 3-hit combo, Kick, Weapon Swing).
  * Create procedural `VehicleFactory` (Sports Car) + snappy arcade driving & `F` key `ON_FOOT` $\leftrightarrow$ `DRIVING` switching.
  * Generate $8 \times 8$ procedural grid city with buildings, roads, and palm trees.
* **Phase 2: Combat Polish, Smash Destruction & Living Traffic**
  * Implement hitboxes, Hit-Stop, knockback physics, slash trails, and localized comic `POW!`/`SMASH!` popups.
  * Add `InstancedMesh` destructible props (hydrants, newsstands, trash cans, lamp posts) + Smash Combo system.
  * Add waypoint-based civilian traffic and procedural walking/fleeing pedestrians using object pooling.
* **Phase 3: Police AI (Driving + On-Foot Brawl), Minimap & Day/Night Cycle**
  * Build 1–5 Star Wanted system, procedural Police Cruisers, and foot-cop melee AI.
  * Implement 2D Canvas Minimap and Repair Garage.
  * Add dynamic Day/Night cycle with emissive night lights and fake headlight cones.
* **Phase 4: Gigs, Vehicle/Weapon Roster & Polish**
  * Add 4 Quick Gigs, 5+ unlockable procedural vehicles, procedural Web Audio SFX, and mobile touch controls.

---

## 9. Implementation Status (audit of v2 against the code)

Legend: ✅ done · ◐ partial · ⬜ not done. "Tested" means exercised by a scripted headless-browser run; nothing has been profiled on real GPUs or phones.

| Area | Status | Notes |
| :--- | :---: | :--- |
| i18n (EN default, KO in Settings, live switch, saved) | ✅ | Title screen has no language buttons; Korean is a Settings option. Popup text is fixed at spawn time. |
| Procedural city (8×8, 4 districts, roads, crosswalks, ramps) | ✅ | Seeded RNG; merged flat-shaded geometry. |
| Old Town signboards (`24h MOTEL`, `DONUTS`, …) | ✅ | One canvas atlas, one draw call, emissive at night. English text only. |
| Props: palms, lamps, hydrants, benches, **newsstands, trash cans** | ✅ | Instanced; smash → pooled tumbling bodies + debris + 5 s hydrant spray. Newspaper "sheets" are white debris cubes. |
| Vehicles (sports, sedan, taxi, pickup, muscle, supercar, police, interceptor, SWAT, armored) | ✅ | Player car has animated wheels; AI cars use a single merged mesh. Damage stages and explosion implemented. |
| Humanoid rig (15 joints, right-hand weapon socket) | ✅ | Same joint names, parents-first order, left = +x and blocky proportions as `model_check` (`src/rig.js`, `src/figure.js`). The rig code is a re-implementation in this repo (model_check is a global-THREE r128 JS library; this game uses Three r187 + TypeScript). Right-hand items use model_check's holder tilt ("blade up and a little forward"). |
| Character animation | ✅ | **v3 change:** instead of hand-made poses, characters play the **motion-capture clips from `model_check`** (`data/anims.js`, Mixamo clips retargeted to the shared rig), extracted by `scripts/extract-anims.mjs` into `src/data/anims.json` (41 clips, ~112 KB gzipped) and played by `src/mocap.ts` (quaternion slerp, 0.03–0.15 s cross-fades). This supersedes §4.4's "zero external animation clips"; the angles in §4.4 are now targets the clips approximate, while frame timings still come from the §4.3 table: each attack clip is time-warped so its strike frame lands in the middle of the active window. |
| Clip map | ✅ | idle / idleCalm (civilians) / idleAlert (cops); walk, run, walkB/runB (backpedal), strafeWalk/RunN/P (strafe); jab = `attack1`, cross = `attack2`, uppercut = `attack3`; kick = `kick` (strike anchored at 0.6 s); bat/baton swings = `slash1` / `slash3`; dodge roll = `dive`; hit react = `impact`/`impact2`; knockdown and get-up = `die` (forward / reversed); jump = `gsJump` mapped to the physics apex. |
| Player look (red hoodie, jeans, white sneakers, hair, overhead `PLAYER` marker) | ✅ | Marker added in v3 work. |
| Police look (navy uniform, peaked cap, belt, baton) | ✅ | Utility belt added in v3 work. |
| On-foot controls (camera-relative walk/sprint, jump, dodge, combo, kick, weapon swap) | ✅ | Frame data matches the §4.3 table. Space = dodge in combat, otherwise jump. With a cop within ~12 m the character faces the enemy and strafes/backpedals with the stick; otherwise it turns toward the direction of travel. |
| Combat resolution (cone hit test, once-per-swing hit ids, knockback, launch, hit-stop, shake, slash trail, comic popups) | ✅ | Shake is not directional. |
| Weapons: fists, bat, baton | ◐ | Baton is dropped by defeated cops; "found in Old Town alleys" is not implemented. |
| Foot cops (exit cruisers, surround, baton melee) | ✅ | Count scales with stars; telegraphed wind-up. |
| Wanted 1–5★, PIT, roadblocks, interceptors, SWAT prediction, armored | ✅ | |
| Pay & Spray garages + vehicle shop + persistence | ✅ | `localStorage` only. |
| Gigs: Defeat the Police, Smash Rampage, Hot Delivery, Grand Hijack | ✅ | |
| Lighting: 2-light rig, day/sunset/night, glowing windows/lamps/signs | ✅ | |
| Headlights: additive cone meshes | ◐ | Road glow quad only; no cone meshes. |
| Shadows: player-following frustum, texel snapping | ✅ | Three r187 removed `PCFSoftShadowMap`; `PCFShadowMap` is used. |
| Blob shadows for distant cars/pedestrians/props | ◐ | Only the player's car uses a blob (Low preset). Distant objects simply cast no shadow. |
| Post-processing: ACES + selective bloom | ✅ | Toggle via Graphics preset. |
| HUD (context-switching bottom-right, health bar, WANTED banner, objective pill, minimap blips) | ✅ | |
| Procedural audio (engine, screech, siren, footsteps, whoosh, impacts, prop smash) | ✅ | No music. |
| Mobile touch controls | ◐ | Driving: steer arrows + gas/brake/nitro/drift. On foot: **analog left stick** (forward/back + strafe, with deadzone), KICK / DODGE / JUMP / WPN / F / HIT buttons, drag-to-orbit. Layout verified overlap-free at 667×375, 740×360, 844×390 and 915×412; not tested on a real device. |
| Performance targets (60 fps, <100 draw calls) | ◐ | ≈100 draw calls measured with shadow pass included, ~290k triangles. Frame rate unverified. |

### 9.1 Balance tuning (v3.1, from playtest feedback)

Playtesting showed that once wanted, too many police arrived and escaping was nearly impossible. Changes:

| Area | Before | Now |
| :--- | :--- | :--- |
| Heat per star | 25 / 70 / 130 / 210 / 320 | 30 / 90 / 170 / 270 / 400 |
| Heat from a smashed prop / hit pedestrian / hit civilian car / hijack | +6 / +25 / +15 / +25 | +3 / +15 / +10 / +20 |
| Police cars by stars (1→5) | 1 · 3 · 4 · 6 · 8 | 1 · 2 · 3 · 4 · 6 |
| Reinforcements | a new car every 1.4 s, 80–170 m away, always replenished | one every 4 s (first after 3 s), 110–220 m away, **none while you are evading** |
| Police speed | 100 % of top speed | 88 % of top speed (a fast car can outrun them; ramming capped at 92 %) |
| Giving up | cars far away teleported back near the player | cars left more than 190 m behind are removed |
| Roadblocks (3★+) | up to 2, every 12 s | 1, every 25 s |
| Losing the heat | out of sight (>60 m) for 6 s, −14 heat/s | out of sight (>85 m) for 4 s, −22 heat/s |
| Busted (stopped with a cop within 7.5 m) | 2.2 s | 3.0 s |
| Foot cops by stars (1→5) | 2 · 4 · 5 · 6 · 7 | 1 · 2 · 3 · 4 · 5 |
| Player attack speed | GDD frame data | ~30 % slower (all wind-up / active / recovery times ×1.33); cops were already slower to telegraph |
| Unarmed locomotion | `walk` / `run` / `idle` | `walkCalm` / `runCalm` / `idleEase`; armed characters keep the combat stance clips |

## 10. Known Gaps & Technical Debt

1. **No automated tests.** Verification so far is ad-hoc Playwright scripts. → proposal 8.5.
2. **Single input scheme per device.** No gamepad, no key rebinding, no sensitivity/FOV options. → proposal 5.4.
3. **Draw calls sit at the budget edge** (≈100). Every new instanced mesh or AI vehicle model needs a budget check.
4. **AI vehicles ignore ramps** (they clip through), and civilians never react to cop fights.
5. **Save data is per-browser** and unversioned beyond a `v1` key; there is no migration or export.
6. **Hosting:** the site is a static build. Render must build with `npm run build` and publish `dist` (a safety net in `scripts/render-build.mjs` handles the misconfigured case).

---

## 11. Proposed Features — Phases 5–8 (proposed)

Effort: **S** ≈ a day, **M** ≈ a few days, **L** ≈ a week or more. Each feature lists acceptance criteria so it can be verified.

### Phase 5 — Progression, Pickups & Accessibility (highest value / lowest risk)

| # | Feature | Effort | Design | Acceptance criteria |
| :-: | :--- | :-: | :--- | :--- |
| 5.1 | **Street pickups** | S | Donuts/health packs (+25 HP, found in shops and Old Town alleys), cash stacks, a Street Pipe weapon found in Old Town/Harbor alleys, armor vests. Pooled, glowing, auto-collected within 1.5 m. | Collecting each type changes the right stat; the pipe appears as slot 3 without needing to defeat a cop; pickups respawn after 3 minutes. |
| 5.2 | **Gamepad, rebinding & options** | M | Gamepad API mapping for driving and on-foot actions; key-rebinding screen persisted in `localStorage`; sliders for mouse sensitivity, FOV and camera shake. | Full game playable on a gamepad; rebinding survives reload; shake slider at 0 disables shake. |
| 5.3 | **Car upgrades & paint** | M | Garage tabs for engine / tires / armor / nitro (3 tiers each, priced) and a paint picker. Stats modify `VehicleStats` at spawn. | Each tier visibly changes top speed/grip/HP/nitro; upgrades and paint persist per vehicle. |
| 5.4 | **Heat Rank & perks** | M | XP from combos, gigs and escapes → Rank 1–20; each rank grants one perk (e.g. +10 % nitro, shorter wanted decay, +1 combo second). | Rank shows in the HUD/pause screen; perks apply and persist. |
| 5.5 | **Procedural radio** | M | Web Audio step-sequencer with 3 "stations" (beach chill, downtown synth, harbor industrial); `R`-style station switch while driving; ducks under sirens. | Music starts after Play, can be muted separately from SFX, and changes with district or chosen station. |

### Phase 6 — Combat & Enemy Depth

| # | Feature | Effort | Design | Acceptance criteria |
| :-: | :--- | :-: | :--- | :--- |
| 6.1 | **Riot cops & Police Chief** | M | Riot cop: front shield that blocks punches (bat swings and kicks break guard). SWAT on foot (stun baton, longer reach). Chief boss at 5★ on foot with a health bar and a charge attack. | Shield blocks frontal punch damage, is broken by a kick/bat, and the boss drops a unique reward. |
| 6.2 | **Throwables & grab** | M | Pick up bricks / trash-can lids / newspapers and throw with a key; grab-and-throw a stunned civilian or cop. | Thrown objects hit one target once with arc physics; grab/throw works only on stunned targets. |
| 6.3 | **More weapons & durability** | S | Hammer, steel pipe, golf club; bat and pipe wear out after N hits and break with a debris burst. | Each weapon has distinct frame data/reach; broken weapons fall back to fists. |
| 6.4 | **Rampage meter** | S | Combo chain fills a meter; at full, a brief slow-motion "Rampage" boosts damage and cash. | Meter fills from hits/smashes, activates once full, and drains on time or damage taken. |

### Phase 7 — World & Events

| # | Feature | Effort | Design | Acceptance criteria |
| :-: | :--- | :-: | :--- | :--- |
| 7.1 | **Weather** | M | Rain and fog presets blended into the time-of-day system; wet roads reduce grip; rain particles instanced. | Weather can change at runtime; grip measurably drops in rain; no new draw-call overruns. |
| 7.2 | **Police helicopter** | M | At 4–5★ an air unit circles the player with a spotlight ground-glow and siren audio; losing it requires breaking line of sight. | Helicopter spawns/despawns with stars; spotlight follows the player; unseen decay slows while it sees you. |
| 7.3 | **Dynamic events** | L | Armored-truck heist, street race with checkpoints, getaway driver. Random world events marked on the minimap. | Each event can start, complete and fail, pays out, and does not break the gig system. |
| 7.4 | **Motorcycles & boats** | L | Two-wheel handling with lean; Harbor water area with boats; ramp-jump trick scoring. | New vehicle classes drive correctly, are purchasable, and respect the draw-call budget. |
| 7.5 | **Enterable interiors** | L | Donut shop (heal), motel (skip time / save). Fade-through door transition. | Doors work on foot, interiors render within budget, exit restores the street state. |
| 7.6 | **Larger map / streaming** | L | Beyond 8×8: chunked city with distance-based instancing and AI spawn budgets. | Larger world holds frame rate; AI and props stream in/out without hitches. |

### Phase 8 — Meta, Quality & Tech

| # | Feature | Effort | Design | Acceptance criteria |
| :-: | :--- | :-: | :--- | :--- |
| 8.1 | **Daily challenge & leaderboard** | M | Seeded daily gig set; local best times now, optional online board later. | Same seed yields the same challenge for everyone; scores persist locally. |
| 8.2 | **Photo mode & instant replay** | S–M | Pause-time free camera and a 10-second ring-buffer replay of the last smash/chase. | Photo mode hides HUD and exports a PNG; replay plays without desyncing the game. |
| 8.3 | **PWA install / offline** | S | Manifest + service worker caching the static build. | Installable on mobile; loads offline after first visit. |
| 8.4 | **Performance pass** | M | Frustum-chunk instanced props, LOD for far buildings and vehicles, texture atlas merge; evaluate Rapier3D only if arcade physics limits are hit. | ≥ 60 fps target on a mid-range laptop and ≥ 30 fps on a mid-range phone, measured and recorded. |
| 8.5 | **Automated test suite** | S | Convert the existing headless scripts (smash scoring, wanted → police, busted/wasted, garage, combos, gigs, Play button) into CI Playwright tests plus unit tests for combat math and AI steering. | `npm test` runs headless in CI and fails on regressions such as the Play-button and MIME issues. |

### Suggested next slice

Build **5.1 pickups, 5.2 gamepad/options, 6.1 riot cops, 8.5 tests** first: they close the biggest gaps (no health recovery on foot, no controller support, no automated regression safety) with modest risk, and each is verifiable in isolation.

---

## 12. Updated Development Roadmap

* **Phases 1–4:** ✅ implemented (see §9).
* **Phase 5 — Progression, Pickups & Accessibility:** 5.1 pickups → 5.2 gamepad/options → 5.3 car upgrades → 5.4 heat rank → 5.5 radio.
* **Phase 6 — Combat & Enemy Depth:** 6.1 riot cops/Chief → 6.3 weapons → 6.4 rampage → 6.2 throwables.
* **Phase 7 — World & Events:** 7.1 weather → 7.2 helicopter → 7.3 events → 7.4 motorcycles/boats → 7.5 interiors → 7.6 streaming.
* **Phase 8 — Meta, Quality & Tech:** 8.5 tests (start early, in parallel) → 8.3 PWA → 8.4 performance → 8.1 daily challenge → 8.2 photo/replay.
