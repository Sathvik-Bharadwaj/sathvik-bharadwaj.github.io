// Bundles src/ into site/js/. Run: npm run build  (or npm run watch)
import * as esbuild from 'esbuild';

import { rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
// old hashed chunks are removed so the deploy folder only holds what the pages load
rmSync(new URL('./site/js/chunks', import.meta.url), { recursive: true, force: true });
const common = { bundle: true, minify: true, sourcemap: false, target: ['es2020'], legalComments: 'none', logLevel: 'info' };

const builds = [
  // page scripts: ES modules with code-splitting, so three.js only loads on pages that show a 3D scene
  { ...common, entryPoints: { main: 'src/main.js', demo: 'src/demo/app.js' }, outdir: 'site/js', format: 'esm', splitting: true, chunkNames: 'chunks/[name]-[hash]' },
  // the optimizer runs in a Web Worker so the interface never stutters
  { ...common, entryPoints: { 'optim-worker': 'src/demo/worker.js' }, outdir: 'site/js', format: 'iife' },
];

if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
} else {
  await Promise.all(builds.map(b => esbuild.build(b)));
}
