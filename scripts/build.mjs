// Build statica (esbuild + Tailwind v4) → cartella docs/ pubblicabile su GitHub Pages.
import * as esbuild from 'esbuild';
import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'docs');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = `${pkg.version}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'src/main.tsx')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2022', 'safari16'],
  outfile: path.join(out, 'assets/app.js'),
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { __APP_VERSION__: JSON.stringify(version), 'process.env.NODE_ENV': '"production"' },
  legalComments: 'none',
  logLevel: 'warning',
});

// Tailwind: classi raccolte dai sorgenti
const twBase = path.dirname(require.resolve('tailwindcss/package.json'));
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.(tsx?|html)$/.test(f) && files.push(p); } })(path.join(root, 'src'));
const candidates = new Set();
for (const f of [...files, path.join(root, 'src/index.html')]) for (const m of fs.readFileSync(f, 'utf8').matchAll(/[^\s"'`{}<>=;,()]+/g)) candidates.add(m[0]);
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const compiler = await compile(css, {
  base: path.join(root, 'src'),
  loadStylesheet: async (id, base) => {
    const p = id === 'tailwindcss' ? path.join(twBase, 'index.css') : id.startsWith('tailwindcss/') ? path.join(twBase, id.slice(12)) : path.resolve(base, id);
    return { path: p, base: path.dirname(p), content: fs.readFileSync(p, 'utf8') };
  },
});
const built = compiler.build([...candidates]);
const min = (await esbuild.transform(built, { loader: 'css', minify: true })).code;
fs.writeFileSync(path.join(out, 'assets/app.css'), min);

// pdf.js worker + risorse
const pdfjs = path.dirname(require.resolve('pdfjs-dist/package.json'));
fs.copyFileSync(path.join(pdfjs, 'legacy/build/pdf.worker.min.mjs'), path.join(out, 'assets/pdf.worker.min.mjs'));
fs.cpSync(path.join(pdfjs, 'cmaps'), path.join(out, 'assets/cmaps'), { recursive: true });
fs.cpSync(path.join(pdfjs, 'standard_fonts'), path.join(out, 'assets/standard_fonts'), { recursive: true });

fs.writeFileSync(path.join(out, 'index.html'), fs.readFileSync(path.join(root, 'src/index.html'), 'utf8').replaceAll('__V__', version));
for (const f of fs.readdirSync(path.join(root, 'public'))) fs.copyFileSync(path.join(root, 'public', f), path.join(out, f));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
const size = (p) => (fs.statSync(path.join(out, p)).size / 1024).toFixed(0) + ' KB';
console.log(`build ${version} → ${path.relative(root, out)}  app.js ${size('assets/app.js')}  app.css ${size('assets/app.css')}`);
