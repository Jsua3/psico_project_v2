#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function leer(raiz, archivo) {
  try {
    return readFileSync(join(raiz, archivo), 'utf8');
  } catch (error) {
    throw new Error(`No se puede leer ${archivo}: ${error.code ?? error.message}`);
  }
}

function versionPaquete(raiz, archivo) {
  let paquete;
  try {
    paquete = JSON.parse(leer(raiz, archivo));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`JSON inválido en ${archivo}.`);
    throw error;
  }
  if (typeof paquete?.version !== 'string' || !paquete.version.trim()) {
    throw new Error(`No se encontró version en ${archivo}.`);
  }
  return paquete.version;
}

/** Compara las declaraciones sin modificar archivos ni producir salida. */
export function revisarVersiones(raiz) {
  const fuente = versionPaquete(raiz, 'package.json');
  const archivo = 'backend_django/psychosim/settings/base.py';
  const ajustes = leer(raiz, archivo).match(/^SPECTACULAR_SETTINGS\s*=\s*\{([\s\S]*?)^\}/m);
  const version = ajustes?.[1].match(/^\s*["']VERSION["']\s*:\s*["']([^"']+)["']/m)?.[1];
  if (!version) throw new Error(`No se encontró VERSION en SPECTACULAR_SETTINGS de ${archivo}.`);

  const declaraciones = [
    ['frontend/package.json', versionPaquete(raiz, 'frontend/package.json')],
    ['biblioteca/package.json', versionPaquete(raiz, 'biblioteca/package.json')],
    [archivo, version],
  ];
  return {
    fuente,
    diferencias: declaraciones.filter(([, encontrada]) => encontrada !== fuente)
      .map(([archivo, encontrado]) => ({ archivo, esperado: fuente, encontrado })),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { fuente, diferencias } = revisarVersiones(resolve(process.argv[2] ?? RAIZ));
    if (diferencias.length) {
      for (const { archivo, esperado, encontrado } of diferencias) {
        console.error(`${archivo}: se esperaba ${esperado}; se encontró ${encontrado}.`);
      }
      process.exitCode = 1;
    } else {
      console.log(`Las versiones coinciden con package.json: ${fuente}.`);
    }
  } catch (error) {
    console.error(`No se pudieron comprobar las versiones: ${error.message}`);
    process.exitCode = 1;
  }
}
