// Safety net for static hosts (Render). If the site is configured to publish the repo root, the browser would
// receive the raw TypeScript source. On Render, `npm install` therefore builds the game and copies the built
// files over the repo root so either "publish ./" or "publish dist" serves a working site. No-op everywhere else.
import { cpSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (process.env.RENDER !== 'true') process.exit(0);

console.log('[render-build] building the production bundle...');
const r = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
if (r.status !== 0 || !existsSync('dist/index.html')) {
  console.error('[render-build] build failed');
  process.exit(r.status || 1);
}
cpSync('dist', '.', { recursive: true, force: true });
console.log('[render-build] copied dist/ to the repository root');
