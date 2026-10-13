#!/usr/bin/env node
// Comprueba que el build de producción no lleva código de solo desarrollo (plan visual F0-4): la galería
// `/dev/ui` y el auditor axe del arranque viven tras `typeof ngDevMode === 'undefined' || ngDevMode`, que el
// minificador pliega a `false`; si un cambio rompe ese plegado, el chunk vuelve al dist y este script falla.
// Uso: node scripts/ui/check-dist-dev-only.mjs [carpeta del dist]   (corre al final de `npm run build`)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_ONLY_MARKERS = [
  'Galería de componentes', 'Banco de la barra', '[axe-core]',
  // Credenciales de «Usar demo» (RNF-01, VD-22; plan visual F4-2): viven en un módulo de solo desarrollo.
  'Estudiante123!', 'Profesor123!', 'Admin123!',
  'estudiante@psychosim.edu.co', 'profesora@psychosim.edu.co', 'admin@psychosim.edu.co',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

export function findDevOnlyLeaks(distDir) {
  const leaks = [];
  for (const file of walk(distDir)) {
    const text = readFileSync(file, 'utf8');
    for (const marker of DEV_ONLY_MARKERS) {
      if (text.includes(marker)) leaks.push({ file: relative(distDir, file).split(sep).join('/'), marker });
    }
  }
  return leaks;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const here = dirname(fileURLToPath(import.meta.url));
  const distDir = process.argv[2] ?? join(here, '..', '..', 'dist', 'psychosim-admin-panel');
  if (!existsSync(distDir)) {
    console.error(`No existe ${distDir}: ejecuta antes ng build.`);
    process.exit(2);
  }
  const leaks = findDevOnlyLeaks(distDir);
  for (const leak of leaks) console.error(`✖ ${leak.file} contiene «${leak.marker}» (código de solo desarrollo en producción)`);
  if (leaks.length) process.exit(1);
  console.log('dist sin código de solo desarrollo');
}
