// Busca en el árbol actual menciones por nombre (con o sin fecha/extensión) a documentos retirados.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = '9931599';
const git = (a) => execFileSync('git', ['-c', 'core.quotepath=false', ...a], { encoding: 'utf8', maxBuffer: 1 << 29 });
const nfc = (s) => s.normalize('NFC');
const baseFiles = git(['ls-tree', '-r', '-z', '--name-only', BASE]).split('\0').filter(Boolean).map(nfc);
const nowFiles = new Set(git(['ls-files', '-z']).split('\0').filter(Boolean).map(nfc));
const retired = baseFiles.filter((f) => !nowFiles.has(f))
  // los que se movieron no están "retirados": ya no existen con ese nombre pero existen en otro lado
  ;
// ¿se movió? (git detecta renames en el índice)
const moved = new Set();
for (const line of git(['diff', '--cached', '--name-status', '-M', BASE]).split('\n')) {
  const m = /^R\d*\t(.+)\t(.+)$/.exec(line);
  if (m) moved.add(nfc(m[1].replace(/^"|"$/g, '')));
}
const gone = retired.filter((f) => !moved.has(f) && /\.(md|yml|draft|py|json|csv|png)$/.test(f));

const stems = new Map(); // stem -> archivos
function addStem(stem, file) {
  if (stem.length < 9) return;
  if (!stems.has(stem)) stems.set(stem, new Set());
  stems.get(stem).add(file);
}
for (const f of gone) {
  const b = path.posix.basename(f).replace(/\.[^.]+$/, '');
  addStem(b, f);
  const noDate = b.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  addStem(noDate, f);
}
// carpetas retiradas completas
const dirs = new Set(gone.map((f) => path.posix.dirname(f)));
for (const d of dirs) addStem(path.posix.basename(d), d);

const textExt = /\.(md|mjs|js|ts|json|yml|yaml|toml|txt|py|draft|html|scss|css)$/;
const keep = [...nowFiles].filter((f) => textExt.test(f) && !f.startsWith('frontend/node_modules'));
const hits = new Map(); // archivo -> Set(stem)
for (const f of keep) {
  let t; try { t = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (t.includes('Nota de la limpieza del repositorio')) t = t.replace(/> \*\*Nota de la limpieza[^\n]*\n/, '');
  for (const [stem] of stems) {
    if (t.includes(stem)) {
      if (!hits.has(f)) hits.set(f, new Set());
      hits.get(f).add(stem);
    }
  }
}
console.log(`retirados (sin movidos): ${gone.length}; stems: ${stems.size}`);
for (const [f, set] of [...hits].sort()) {
  // stems más largos primero; quitar los que son subcadena de otro ya listado
  const arr = [...set].sort((a, b) => b.length - a.length);
  const uniq = arr.filter((s, i) => !arr.slice(0, i).some((l) => l.includes(s)));
  console.log(`${f}\n    ${uniq.slice(0, 14).join(' | ')}${uniq.length > 14 ? ' …(+' + (uniq.length - 14) + ')' : ''}`);
}
