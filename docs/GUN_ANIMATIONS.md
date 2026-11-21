# Gun animations for Smash Town (review)

The clips live in the model_check repository (branch `claude/add-gun-animations`, file `data/anims_guns.js`). To bring the chosen ones into this game, add their names to `KEEP` in `scripts/extract-anims.mjs` and read them from `data/anims_guns.js` as well as `data/anims.js`. Nothing has been wired into the game yet; this is the review only.


84 Mixamo clips from three packs, retargeted to the 13-bone rig and stored in `data/anims_guns.js` (about 700 KB). The viewer lists them with the Nexus clips, in three new groups: **Pistol**, **Rifle** and **Pro rifle**.

| Pack | Prefix | Clips | What is in it |
| --- | --- | --- | --- |
| Pistol / Handgun Locomotion Pack | `pistol` | 20 | Two-hand pistol grip: idle, walk, run, backward, strafe left and right, walk and run arcs (turning while moving), two jumps, kneel down, kneeling idle, stand up |
| Shooter Pack | `rifle` | 15 | Rifle aimed on the shoulder: aim idle, a firing clip, walk, run, backward, strafe left and right, start and stop walking, two jumps, a walking death |
| Pro Rifle Pack | `pro` | 49 | Rifle at the ready: idle, aiming idle, crouching idle and aim, walk, run, sprint and crouch walk in all eight directions, 90 degree turns (standing and crouching), jump up / loop / down, six deaths |

Names follow the Nexus style (`proRunFL` = pro pack, run, forward-left). Direction letters: `F` forward, `B` backward, `L` left, `R` right (left is `+x`, like the rig). Arcs and strafes in the first two packs were told apart by their travel, not by the file name (`pistol strafe` is a left strafe, `strafe` in the Shooter Pack is a right strafe).

## How they were made

```sh
npm i three                      # tools/ need the three package (not part of this repo)
node tools/fbx_pack_to_anims.mjs <folder with pistol/, shooter/, prorifle/> tools/gun_clips.json data/anims_guns.js
```

`tools/gun_clips.json` maps each `.fbx` to a clip name, and says whether it loops. The converter uses the same retargeting as `tools/fbx_to_clip.mjs` (arms and legs matched by direction, hips, spine and head by orientation), with three differences:

- The last frame is the real last frame. `fbx_to_clip.mjs` samples at exactly the clip length, where the mixer wraps to frame 0, so the last frame of a one-shot clip (a death, a jump) is the standing pose again.
- Walks, runs, jumps, arcs and strafes are **in place**, like every clip in `anims.js` (the forward travel is taken out of `hipsZ`). The deaths keep their travel, because that is the body falling.
- Each clip has an extra `root: [sideways, forward, turn]`: how far the hips really travelled over the clip, in metres (`+` = left / forward) and degrees (`+` = turning left). A game uses it to match playback speed to its own walking speed, and to tell a left strafe from a right one.

The `.fbx` files carry no mesh (animation only), so nothing else was needed from them. `tests/anims_guns.test.js` checks the shape of every clip.

## Review: which clips fit Smash Town's guns

Smash Town has five guns (pistol, SMG, shotgun, rocket launcher, paintball gun) and a player that turns to face the camera while firing, so it needs a gun pose for idle, walking in every direction relative to where the body faces, sprinting, jumping and being knocked out. The packs have no **reload**, **equip** or **recoil** clip, so those must be done in code (a small kick on the spine and shoulders when a shot is fired, a short arm dip for reloading).

**Best fit: the Pro Rifle pack, for the long guns.** It is the only pack with all eight directions in walk, run and sprint, and the poses are consistent between them (rifle at the ready). Its run clip travels at 4.2 m/s, close to the game's walk (4.5 m/s), and its sprint at 6.3 m/s (the game's sprint is 8.2 m/s, so play it 1.3 times faster). Use `proIdle` when the gun is down, `proIdleAim` or `rifleFire` when it is up.

**Best fit for the pistol and the paintball gun: the Pistol pack.** The grip (both hands together at chest height) is right for a handgun. It has forward, backward and left / right strafe only (no diagonals), which is enough because a pistol-holder can blend the diagonals from the strafes.

**Rocket launcher:** `rifleAimIdle` has the hands wide apart on the shoulder, which suits a launcher best.

**Knock-outs:** `proDieFront`, `proDieBack` and `proDieRight` pick the fall by the direction of the hit. In Kids Play nobody dies, so play them and hold the last frame, then get up with the game's existing get-up clip.

**Not needed now:** turn-in-place (the game rotates the body itself), arcs, start / stop walking transitions, the long 2 s pistol jump, the walking death. The crouch and kneel clips are good, but the game has no crouch or cover state yet.

Things to know before using them:

1. **Gun orientation.** The hand bones are retargeted by direction (no roll), so each gun needs its own grip matrix in the hand socket. The bat's grip tilt (blade up and forward) will not do for a gun that points forward.
2. **Aiming while moving.** Only `pistol*`, `rifleAimIdle`, `rifleFire` and `proIdleAim` have the weapon raised. The `proRun*` clips carry the rifle at the ready and `proSprint*` carries it low, so while firing on the move the arms and spine of the idle-aim pose should be layered over the legs of the run clip. `tools/make_slash_moves.mjs` already does this for slashes (legs from one clip, upper body from another), and the same approach works here.
3. **Speeds.** Play locomotion at `game speed / natural speed` (the `Speed` column), as Smash Town already does for its other clips.
4. **`rifleFire` is a held pose.** Its arms barely move during the clip, so it is a firing pose, not a recoil animation.
5. **Headshot deaths** (`proDieFrontHead`, `proDieBackHead`) are longer and more violent; keep them for a rocket or shotgun kill.

The tables below list every clip. *Speed* is the natural travel speed of looping clips; *Pose* is how the hands sit (aim = hands high in front, ready = mid, low = carried low, crouched, falling).

## Recommended (33 clips)

| Clip | Length | Loops | Speed m/s | Pose | Why |
| --- | --- | --- | --- | --- | --- |
| `pistolIdle` | 1.333 s | loop | - | aim | Pistol and paintball gun: raised two-hand grip in every locomotion state |
| `pistolWalk` | 0.8 s | loop | 2.3 | aim | Pistol and paintball gun: raised two-hand grip in every locomotion state |
| `pistolRun` | 0.5 s | loop | 4.3 | aim | Pistol and paintball gun: raised two-hand grip in every locomotion state |
| `pistolWalkB` | 1.033 s | loop | 1.3 | aim | Pistol and paintball gun: raised two-hand grip in every locomotion state |
| `pistolRunB` | 0.533 s | loop | 3.0 | aim | Pistol and paintball gun: raised two-hand grip in every locomotion state |
| `pistolStrafeL` | 0.567 s | loop | 1.9 | aim | Pistol and paintball gun: raised two-hand grip in every locomotion state |
| `pistolStrafeR` | 0.6 s | loop | 2.2 | aim | Pistol and paintball gun: raised two-hand grip in every locomotion state |
| `rifleAimIdle` | 3.1 s | loop | - | aim | Rocket launcher on the shoulder (hands wide apart) |
| `rifleFire` | 1.167 s | loop | - | aim | Firing pose for long guns; recoil must be added in code (the clip barely moves) |
| `proRunF` | 0.5 s | loop | 4.2 | ready | Eight-way gun walk: natural speed 4.2 m/s matches the game walk (4.5 m/s) |
| `proSprintF` | 0.5 s | loop | 6.3 | low | Eight-way gun sprint: natural speed 6.3 m/s, game sprint is 8.2 m/s (play 1.3x) |
| `proRunFL` | 0.5 s | loop | 4.2 | ready | Eight-way gun walk: natural speed 4.2 m/s matches the game walk (4.5 m/s) |
| `proSprintFL` | 0.5 s | loop | 6.3 | low | Eight-way gun sprint: natural speed 6.3 m/s, game sprint is 8.2 m/s (play 1.3x) |
| `proRunFR` | 0.5 s | loop | 4.2 | ready | Eight-way gun walk: natural speed 4.2 m/s matches the game walk (4.5 m/s) |
| `proSprintFR` | 0.5 s | loop | 6.3 | low | Eight-way gun sprint: natural speed 6.3 m/s, game sprint is 8.2 m/s (play 1.3x) |
| `proRunL` | 0.5 s | loop | 4.2 | ready | Eight-way gun walk: natural speed 4.2 m/s matches the game walk (4.5 m/s) |
| `proSprintL` | 0.5 s | loop | 6.3 | low | Eight-way gun sprint: natural speed 6.3 m/s, game sprint is 8.2 m/s (play 1.3x) |
| `proRunR` | 0.5 s | loop | 4.2 | ready | Eight-way gun walk: natural speed 4.2 m/s matches the game walk (4.5 m/s) |
| `proSprintR` | 0.5 s | loop | 6.3 | low | Eight-way gun sprint: natural speed 6.3 m/s, game sprint is 8.2 m/s (play 1.3x) |
| `proRunB` | 0.5 s | loop | 4.2 | ready | Eight-way gun walk: natural speed 4.2 m/s matches the game walk (4.5 m/s) |
| `proSprintB` | 0.5 s | loop | 6.3 | low | Eight-way gun sprint: natural speed 6.3 m/s, game sprint is 8.2 m/s (play 1.3x) |
| `proRunBL` | 0.5 s | loop | 4.2 | ready | Eight-way gun walk: natural speed 4.2 m/s matches the game walk (4.5 m/s) |
| `proSprintBL` | 0.5 s | loop | 6.3 | low | Eight-way gun sprint: natural speed 6.3 m/s, game sprint is 8.2 m/s (play 1.3x) |
| `proRunBR` | 0.5 s | loop | 4.2 | ready | Eight-way gun walk: natural speed 4.2 m/s matches the game walk (4.5 m/s) |
| `proSprintBR` | 0.5 s | loop | 6.3 | low | Eight-way gun sprint: natural speed 6.3 m/s, game sprint is 8.2 m/s (play 1.3x) |
| `proIdle` | 2.1 s | loop | - | low | SMG / shotgun / rocket at the ready (not firing) |
| `proIdleAim` | 2.1 s | loop | - | aim | Long gun shouldered: stand still and fire |
| `proJumpUp` | 0.533 s | once | - | low | Three-part jump with a gun (take-off, air, landing) |
| `proJumpLoop` | 1 s | loop | - | ready | Three-part jump with a gun (take-off, air, landing) |
| `proJumpDown` | 0.667 s | once | - | ready | Three-part jump with a gun (take-off, air, landing) |
| `proDieRight` | 3.3 s | once | - | crouched | Knock-out fall by hit direction (Kids Play: people are stunned, not killed); play then hold |
| `proDieBack` | 2.967 s | once | - | falling | Knock-out fall by hit direction (Kids Play: people are stunned, not killed); play then hold |
| `proDieFront` | 3.433 s | once | - | falling | Knock-out fall by hit direction (Kids Play: people are stunned, not killed); play then hold |

## Maybe later (34 clips)

| Clip | Length | Loops | Speed m/s | Pose | Why |
| --- | --- | --- | --- | --- | --- |
| `pistolJumpRun` | 0.8 s | once | - | ready | Running jump with a pistol (0.8 s) |
| `pistolStandToKneel` | 1 s | once | - | aim | Kneel to aim a pistol (cover) |
| `pistolKneelIdle` | 3.8 s | loop | - | crouched | Kneel to aim a pistol (cover) |
| `pistolKneelToStand` | 1.367 s | once | - | aim | Kneel to aim a pistol (cover) |
| `rifleRun` | 0.733 s | loop | 2.7 | aim | Single-direction rifle locomotion; the pro pack covers all eight directions with one consistent pose |
| `rifleWalk` | 1.367 s | loop | 0.9 | aim | Single-direction rifle locomotion; the pro pack covers all eight directions with one consistent pose |
| `rifleWalkB` | 1.4 s | loop | 1.0 | aim | Single-direction rifle locomotion; the pro pack covers all eight directions with one consistent pose |
| `rifleRunB` | 0.533 s | loop | 2.4 | aim | Single-direction rifle locomotion; the pro pack covers all eight directions with one consistent pose |
| `rifleStrafeR` | 0.667 s | loop | 2.9 | aim | Single-direction rifle locomotion; the pro pack covers all eight directions with one consistent pose |
| `rifleStrafeL` | 0.533 s | loop | 2.4 | aim | Single-direction rifle locomotion; the pro pack covers all eight directions with one consistent pose |
| `rifleJumpF` | 0.9 s | once | - | aim | Short 0.9 s jump with a rifle; pro jump set is split into phases |
| `rifleJumpB` | 0.9 s | once | - | aim | Short 0.9 s jump with a rifle; pro jump set is split into phases |
| `proWalkF` | 1 s | loop | 1.7 | ready | Slow aimed walk (1.7 m/s) for an aim-down-sights mode; the game has no slow walk yet |
| `proCrouchWalkF` | 1 s | loop | 1.8 | ready | Crouch and cover: the game has no crouch state yet |
| `proWalkFL` | 1 s | loop | 1.7 | ready | Slow aimed walk (1.7 m/s) for an aim-down-sights mode; the game has no slow walk yet |
| `proCrouchWalkFL` | 1 s | loop | 1.8 | ready | Crouch and cover: the game has no crouch state yet |
| `proWalkFR` | 1 s | loop | 1.7 | ready | Slow aimed walk (1.7 m/s) for an aim-down-sights mode; the game has no slow walk yet |
| `proCrouchWalkFR` | 1 s | loop | 1.8 | ready | Crouch and cover: the game has no crouch state yet |
| `proWalkL` | 1 s | loop | 1.7 | ready | Slow aimed walk (1.7 m/s) for an aim-down-sights mode; the game has no slow walk yet |
| `proCrouchWalkL` | 1 s | loop | 1.8 | ready | Crouch and cover: the game has no crouch state yet |
| `proWalkR` | 1 s | loop | 1.7 | ready | Slow aimed walk (1.7 m/s) for an aim-down-sights mode; the game has no slow walk yet |
| `proCrouchWalkR` | 1 s | loop | 1.8 | ready | Crouch and cover: the game has no crouch state yet |
| `proWalkB` | 1 s | loop | 1.7 | ready | Slow aimed walk (1.7 m/s) for an aim-down-sights mode; the game has no slow walk yet |
| `proCrouchWalkB` | 1 s | loop | 1.8 | ready | Crouch and cover: the game has no crouch state yet |
| `proWalkBL` | 1 s | loop | 1.7 | ready | Slow aimed walk (1.7 m/s) for an aim-down-sights mode; the game has no slow walk yet |
| `proCrouchWalkBL` | 1 s | loop | 1.8 | ready | Crouch and cover: the game has no crouch state yet |
| `proWalkBR` | 1 s | loop | 1.7 | aim | Slow aimed walk (1.7 m/s) for an aim-down-sights mode; the game has no slow walk yet |
| `proCrouchWalkBR` | 1 s | loop | 1.8 | ready | Crouch and cover: the game has no crouch state yet |
| `proIdleCrouch` | 2.1 s | loop | - | crouched | Crouch and cover: the game has no crouch state yet |
| `proIdleCrouchAim` | 2.1 s | loop | - | crouched | Crouch and cover: the game has no crouch state yet |
| `proCrouchTurnL90` | 1.267 s | once | - | crouched | Crouch and cover: the game has no crouch state yet |
| `proCrouchTurnR90` | 1.267 s | once | - | crouched | Crouch and cover: the game has no crouch state yet |
| `proDieFrontHead` | 2.833 s | once | - | crouched | Longer fall for a hit from a rocket or shotgun |
| `proDieBackHead` | 3.7 s | once | - | crouched | Longer fall for a hit from a rocket or shotgun |

## Not needed (17 clips)

| Clip | Length | Loops | Speed m/s | Pose | Why |
| --- | --- | --- | --- | --- | --- |
| `pistolWalkArcR` | 0.733 s | once | - | aim | Turn while moving: the game rotates the body itself |
| `pistolWalkArcL` | 0.767 s | once | - | aim | Turn while moving: the game rotates the body itself |
| `pistolRunArcR` | 0.6 s | once | - | aim | Turn while moving: the game rotates the body itself |
| `pistolRunArcL` | 0.633 s | once | - | aim | Turn while moving: the game rotates the body itself |
| `pistolWalkBArcR` | 0.6 s | once | - | aim | Turn while moving: the game rotates the body itself |
| `pistolWalkBArcL` | 0.6 s | once | - | aim | Turn while moving: the game rotates the body itself |
| `pistolRunBArcR` | 0.5 s | once | - | aim | Turn while moving: the game rotates the body itself |
| `pistolRunBArcL` | 0.5 s | once | - | aim | Turn while moving: the game rotates the body itself |
| `pistolJump` | 2 s | once | - | aim | 2 s in place: far too long for the 0.7 s hop in the game |
| `rifleStartWalk` | 1.467 s | once | - | aim | Start / stop transitions: the game blends clips instead |
| `rifleStopWalk` | 2.667 s | once | - | aim | Start / stop transitions: the game blends clips instead |
| `rifleStartWalkB` | 2.033 s | once | - | aim | Start / stop transitions: the game blends clips instead |
| `rifleStopWalkB` | 1.367 s | once | - | aim | Start / stop transitions: the game blends clips instead |
| `rifleWalkDie` | 3.067 s | once | - | falling | Dying while walking, turns 126 degrees: too specific |
| `proTurnL90` | 1 s | once | - | low | Turn on the spot: the game rotates the body itself |
| `proTurnR90` | 1 s | once | - | ready | Turn on the spot: the game rotates the body itself |
| `proDieCrouchFrontHead` | 1.9 s | once | - | crouched | Crouching death, not needed |
