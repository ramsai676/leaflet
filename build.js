import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Source stays in ES modules. Output is one file so it opens by double-click,
// with no server and no install, which is how someone checking a medication
// list should be able to reach it.

const root = dirname(fileURLToPath(import.meta.url));
const src = p => readFileSync(join(root, 'src', p), 'utf8');

// Order matters: this is a concatenation, not a module graph.
const MODULES = ['fda.js', 'rxclass.js', 'analyse.js', 'ui.js', 'app.js'];

function strip(code) {
  return code
    .replace(/^\s*import\s+[^;]+?;\s*$/gm, '')
    // `export async function` exists too. Missing it emitted a bundle the
    // browser refused to parse while this build reported success.
    .replace(/^\s*export\s+(?=(?:async\s+)?(?:const|function|class|let|var)\b)/gm, '')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '')
    .trim();
}

// Concatenating modules into one scope means two files declaring the same const
// become a SyntaxError that kills the whole bundle silently. That happened once;
// the build refuses to write a broken file rather than let it happen again.
const TOP_LEVEL = /^(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm;

function checkCollisions(pieces) {
  const owners = new Map();
  const clashes = [];
  for (const { name, code } of pieces) {
    for (const m of code.matchAll(TOP_LEVEL)) {
      const ident = m[1];
      if (owners.has(ident)) clashes.push(`${ident} (${owners.get(ident)} and ${name})`);
      else owners.set(ident, name);
    }
  }
  if (clashes.length) {
    console.error('build failed, duplicate top-level declarations:');
    for (const c of clashes) console.error('  ' + c);
    process.exit(1);
  }
}

const pieces = MODULES.map(m => ({ name: m, code: strip(src(m)) }));
checkCollisions(pieces);

const js = pieces.map(p => `/* ---- ${p.name} ---- */\n${p.code}`).join('\n\n');

const html = src('shell.html')
  .replace('/*__CSS__*/', () => src('app.css'))
  .replace('/*__JS__*/', () => `(function(){\n'use strict';\n${js}\n})();`);

// A bundle that does not parse is worse than a failed build: the build reports
// success and the page silently does nothing at all.
try {
  new Function(js);
} catch (err) {
  console.error('build failed, bundle does not parse:', err.message);
  process.exit(1);
}

writeFileSync(join(root, 'index.html'), html, 'utf8');

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`index.html written — ${kb} KB, ${MODULES.length} modules inlined, 0 dependencies`);
