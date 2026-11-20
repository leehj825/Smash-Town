// `npm run dev` starts the Vite dev server locally. On Render a dev server would hang the deploy forever, and the
// production files were already produced by `postinstall`, so just exit successfully there.
import { spawn } from 'node:child_process';

if (process.env.RENDER === 'true') {
  console.log('[dev] Render detected: skipping the dev server (the site was built during npm install).');
  process.exit(0);
}
const p = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...process.argv.slice(2)], { stdio: 'inherit' });
p.on('exit', (code) => process.exit(code ?? 0));
