import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const INPUT = resolve(ROOT, 'src/styles/app.css');
const OUTPUT = resolve(ROOT, 'src/style.css');

/** Resolve the Tailwind CLI entry so packaging works no matter how pnpm links the package. */
function cliEntry() {
  const manifestPath = require.resolve('@tailwindcss/cli/package.json');
  const { bin } = require(manifestPath);
  return resolve(dirname(manifestPath), typeof bin === 'string' ? bin : bin.tailwindcss);
}

/** Compile src/styles/app.css into the served, minified src/style.css. */
export function buildCss({ watch = false, quiet = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const args = [cliEntry(), '-i', INPUT, '-o', OUTPUT, '--minify'];
    if (watch) args.push('--watch');
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: watch || !quiet ? 'inherit' : 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (watch) resolvePromise(child);
      else if (code === 0) resolvePromise(null);
      else reject(new Error('Tailwind CSS build failed with exit code ' + code));
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const watch = process.argv.includes('--watch');
  const started = Date.now();
  await buildCss({ watch });
  if (!watch) console.log('Built src/style.css in ' + (Date.now() - started) + 'ms');
}
