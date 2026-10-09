#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertDerivedArtifact,
  buildPremiumVisualManifest,
  inspectPremiumMapSelection,
  inspectVisualPng,
  parsePremiumVisualCliArgs,
  validatePremiumVisualInventory,
} from './visual-asset-manifest-lib.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDirectory, '..');
const assetsRoot = path.join(frontendRoot, 'src', 'assets');
const sourceRoot = assetsRoot;
const visualRoot = path.join(assetsRoot, 'visual', 'v1');

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} inválido en ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function run() {
  const options = parsePremiumVisualCliArgs(process.argv.slice(2));
  const inventory = readJson(path.join(visualRoot, 'inventory.v1.json'), 'visual inventory');
  const palettes = [readJson(path.join(visualRoot, 'palette.v1.json'), 'world palette')];
  const paletteById = new Map(palettes.map((palette) => [palette.paletteId, palette]));
  validatePremiumVisualInventory(inventory);

  if (options.mode === 'asset') {
    const matches = inventory.assets.filter(({ assetId }) => assetId === options.assetId);
    if (matches.length !== 1) throw new Error(`--asset unknown or duplicate assetId: ${options.assetId}`);
    const entry = matches[0];
    const palette = paletteById.get(entry.paletteId);
    if (!palette) throw new Error(`${entry.assetId}: unknown paletteId ${entry.paletteId}`);
    const inspected = inspectVisualPng({ assetsRoot, sourceRoot, entry, palette });
    process.stdout.write(`asset ${entry.assetId} ${inspected.sha256} source ${inspected.sourceSha256}\n`);
    return;
  }

  if (options.mode === 'map') {
    const inspected = inspectPremiumMapSelection({
      assetsRoot,
      sourceRoot,
      inventory,
      palettes,
      mapKey: options.mapKey,
    });
    process.stdout.write(`map ${inspected.entry.mapKey} source ${inspected.sourceSha256} ${inspected.tiled.transitive.map(({ sha256 }) => sha256).join(' ')}\n`);
    return;
  }

  const result = buildPremiumVisualManifest({
    assetsRoot,
    sourceRoot,
    inventory,
    palettes,
    requireCandidate: true,
  });
  const manifestPath = path.join(visualRoot, 'manifest.json');
  const readmePath = path.join(visualRoot, 'README.md');
  if (options.mode === 'write') {
    writeFileSync(manifestPath, result.manifestJson);
    writeFileSync(readmePath, result.readme);
    process.stdout.write(`written ${manifestPath}\nwritten ${readmePath}\n`);
    return;
  }
  assertDerivedArtifact(manifestPath, result.manifestJson, 'premium visual manifest');
  assertDerivedArtifact(readmePath, result.readme, 'premium visual README');
  process.stdout.write(`premium visual manifest OK ${result.manifest.manifestHash}\n`);
}

try {
  run();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
