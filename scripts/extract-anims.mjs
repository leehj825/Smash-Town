// Extracts the motion-capture clips the game uses from the `model_check` repository (data/anims.js, the Nexus/Mixamo clips
// retargeted to the shared 15-joint rig) into src/data/anims.json. Usage: node scripts/extract-anims.mjs <path-to-model_check>
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = process.argv[2] ?? '../model_check';
const KEEP = [
  'idle', 'idleCalm', 'idleAlert', 'idleUnarmed',
  'walk', 'walkB', 'walkCalm', 'run', 'runB', 'runCalm',
  'strafeWalkN', 'strafeWalkP', 'strafeRunN', 'strafeRunP',
  'attack1', 'attack2', 'attack3', 'attackJump', 'brawlPunch', 'brawlSwipe', 'kick',
  'slash1', 'slash3', 'slash5', 'gsSlash', 'gsSlash5', 'slashWalk1', 'slashRun1', 'slashWalk3', 'slashRun3',
  'impact', 'impact2', 'die', 'die2', 'dive', 'dodgeB', 'dodgeP', 'dodgeN', 'gsJump', 'block', 'blockIdle',
];
const mod = await import(pathToFileURL(join(root, 'data/anims.js')).href);
const all = mod.default;
const r3 = (v) => Math.round(v * 1000) / 1000;
const out = {};
for (const name of KEEP) {
  const c = all[name];
  if (!c) { console.warn('missing clip', name); continue; }
  const t = {};
  for (const [bone, frames] of Object.entries(c.t)) t[bone] = Array.isArray(frames[0]) ? frames.map((f) => f.map(r3)) : frames.map(r3);
  out[name] = { d: c.d, n: c.n, loop: !!c.loop, hit: c.hit || 0, t };
}
writeFileSync('src/data/anims.json', JSON.stringify(out));
console.log('wrote', Object.keys(out).length, 'clips');
